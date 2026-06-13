from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import (
    Account,
    AccountOwner,
    Alert,
    AlertRule,
    AlertStatusHistory,
    Engagement,
    GovernanceActionItem,
    GovernanceEvent,
    NotificationPreference,
    NotificationRecord,
    Opportunity,
    OpportunityStageHistory,
    OpportunityType,
    ScheduledWorkerRun,
    ScoreSnapshot,
    Task,
)
from app.services.alerts import AlertsService
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        seed_default_data(session)
        yield session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seeded_user(client: TestClient, headers: dict[str, str], role: str) -> dict:
    response = client.get("/api/admin/users", headers=headers, params={"role": role, "page": 1, "page_size": 1})
    assert response.status_code == 200
    return response.json()["items"][0]


def create_owned_account(db_session: Session, owner: dict, account_id: str, *, health: int = 52) -> Account:
    account = Account(
        id=account_id,
        name=f"Alert Test {account_id}",
        project_name=f"Project {account_id}",
        lifecycle_status="Active",
        segment="Enterprise",
        region="North America",
        risk_status="warning",
        commercial_value=250000,
        currency="USD",
        health_overall=health,
        health_relationship=health,
        health_usage=health,
        health_delivery=health,
        health_commercial=health,
        created_by_id=owner["id"],
    )
    db_session.add(account)
    db_session.add(
        AccountOwner(
            account_id=account.id,
            user_id=owner["id"],
            user_name=owner["full_name"],
            user_email=owner["email"],
            ownership_role="primary_am",
            is_primary=True,
            is_active=True,
            rationale="Alert test owner.",
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account


def first_opportunity_type(db_session: Session, owner: dict) -> OpportunityType:
    opportunity_type = db_session.scalar(select(OpportunityType).where(OpportunityType.is_active.is_(True)).limit(1))
    if opportunity_type is not None:
        return opportunity_type
    opportunity_type = OpportunityType(slug="alert-test-type", name="Alert Test Type", description="Alert tests.", created_by_id=owner["id"])
    db_session.add(opportunity_type)
    db_session.commit()
    return opportunity_type


def evaluate_account(client: TestClient, headers: dict[str, str], account_id: str) -> dict:
    response = client.post("/api/alerts/evaluate", headers=headers, json={"scope": "account", "account_id": account_id})
    assert response.status_code == 200
    return response.json()


def active_alert_for_rule(db_session: Session, rule_key: str) -> Alert:
    alert = db_session.scalar(select(Alert).where(Alert.rule_key == rule_key, Alert.status.in_(("open", "acknowledged", "snoozed"))).order_by(Alert.created_at.desc()))
    assert alert is not None
    return alert


def test_alert_rules_seed_update_preview_and_permissions(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")

    rules = client.get("/api/admin/alert-rules", headers=admin_headers)
    assert rules.status_code == 200
    assert [item["rule_key"] for item in rules.json()] == [
        "low_overall_health",
        "overall_score_drop",
        "engagement_renewal_window",
        "opportunity_stalled",
        "task_overdue",
        "governance_event_overdue",
        "governance_action_overdue",
    ]

    low_health_rule = next(item for item in rules.json() if item["rule_key"] == "low_overall_health")
    updated = client.patch(
        f"/api/admin/alert-rules/{low_health_rule['id']}",
        headers=admin_headers,
        json={"threshold_value": 58, "severity": "medium", "recipient_policy": "account_owner_first", "escalation_enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["threshold_value"] == 58
    assert updated.json()["severity"] == "medium"

    invalid = client.patch(f"/api/admin/alert-rules/{low_health_rule['id']}", headers=admin_headers, json={"threshold_value": -1})
    assert invalid.status_code == 422

    create_owned_account(db_session, owner, "alert-preview-account", health=50)
    preview = client.post(f"/api/admin/alert-rules/{low_health_rule['id']}/preview", headers=admin_headers)
    assert preview.status_code == 200
    assert preview.json()["total_matches"] >= 1
    assert preview.json()["sample"][0]["source_record_type"] == "account"

    owner_headers = auth_headers(client, owner["email"], "User@12345")
    denied = client.get("/api/admin/alert-rules", headers=owner_headers)
    assert denied.status_code == 403

    AlertsService(db_session).seed_default_rules()
    AlertsService(db_session).seed_default_rules()
    seeded_rules = list(db_session.scalars(select(AlertRule).order_by(AlertRule.sort_order)))
    assert len(seeded_rules) == 7
    assert db_session.get(AlertRule, low_health_rule["id"]).threshold_value == 58


def test_all_seeded_evaluators_create_backend_alerts_without_duplicates(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account = create_owned_account(db_session, owner, "alert-seven-rules-account", health=45)
    now = datetime.now(timezone.utc)

    db_session.add_all(
        [
            ScoreSnapshot(account_id=account.id, scope="account", overall=82, rag_status="green", calculated_at=now - timedelta(days=2)),
            ScoreSnapshot(account_id=account.id, scope="account", overall=65, rag_status="amber", calculated_at=now - timedelta(days=1)),
            Engagement(
                account_id=account.id,
                name="Renewal SOW",
                status="active",
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                service_lines=["Engineering"],
                value=100000,
                currency="USD",
                start_date=now - timedelta(days=120),
                end_date=now + timedelta(days=45),
                renewal_date=now + timedelta(days=30),
                notice_deadline=now + timedelta(days=15),
                created_by_id=owner["id"],
            ),
            Task(
                account_id=account.id,
                title="Overdue recovery task",
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                due_at=now - timedelta(days=2),
                status="open",
                priority="high",
                created_by_id=owner["id"],
            ),
            GovernanceEvent(
                account_id=account.id,
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                governance_type="QBR",
                deduplication_key="alert-seven-rules-qbr",
                scheduled_at=now - timedelta(days=2),
                status="scheduled",
                created_by_id=owner["id"],
                created_by_name=owner["full_name"],
            ),
        ]
    )
    db_session.flush()
    governance_event = db_session.scalar(select(GovernanceEvent).where(GovernanceEvent.deduplication_key == "alert-seven-rules-qbr"))
    opportunity = Opportunity(
        account_id=account.id,
        type_id=first_opportunity_type(db_session, owner).id,
        owner_id=owner["id"],
        owner_name=owner["full_name"],
        owner_email=owner["email"],
        name="Stalled expansion",
        service_line="Engineering",
        value=75000,
        currency="USD",
        stage="Identified",
        next_step="Confirm buying path.",
        target_date=now + timedelta(days=30),
        created_by_id=owner["id"],
        created_by_name=owner["full_name"],
        created_at=now - timedelta(days=120),
        updated_at=now - timedelta(days=100),
    )
    db_session.add(opportunity)
    db_session.flush()
    db_session.add(
        OpportunityStageHistory(
            opportunity_id=opportunity.id,
            account_id=account.id,
            before_stage=None,
            after_stage="Identified",
            actor_id=owner["id"],
            actor_name=owner["full_name"],
            created_at=now - timedelta(days=100),
        )
    )
    db_session.add(
        GovernanceActionItem(
            governance_event_id=governance_event.id,
            title="Send governance minutes",
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            owner_email=owner["email"],
            due_at=now - timedelta(days=2),
            status="open",
            priority="high",
        )
    )
    db_session.commit()

    result = evaluate_account(client, admin_headers, account.id)
    assert result["created"] >= 7

    alerts = list(db_session.scalars(select(Alert).where(Alert.account_id == account.id)))
    rule_keys = {alert.rule_key for alert in alerts}
    assert {
        "low_overall_health",
        "overall_score_drop",
        "engagement_renewal_window",
        "opportunity_stalled",
        "task_overdue",
        "governance_event_overdue",
        "governance_action_overdue",
    }.issubset(rule_keys)
    assert all(alert.source_record_route == f"/accounts/{account.id}?tab=overview&alert={alert.id}" for alert in alerts)

    duplicate = evaluate_account(client, admin_headers, account.id)
    assert duplicate["created"] == 0


def test_alert_lifecycle_auto_resolve_recurrence_snooze_and_worsening(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account = create_owned_account(db_session, owner, "alert-lifecycle-account", health=50)
    evaluate_account(client, admin_headers, account.id)
    alert = active_alert_for_rule(db_session, "low_overall_health")

    owner_headers = auth_headers(client, owner["email"], "User@12345")
    acknowledged = client.patch(f"/api/alerts/{alert.id}/status", headers=owner_headers, json={"status": "acknowledged", "reason": "Reviewing recovery path."})
    assert acknowledged.status_code == 200
    assert acknowledged.json()["status"] == "acknowledged"

    account.health_overall = 35
    db_session.commit()
    worsened = evaluate_account(client, admin_headers, account.id)
    assert worsened["reactivated"] >= 1
    db_session.refresh(alert)
    assert alert.status == "open"

    snoozed_until = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    snoozed = client.patch(f"/api/alerts/{alert.id}/status", headers=owner_headers, json={"status": "snoozed", "snoozed_until": snoozed_until, "reason": "Waiting on client response."})
    assert snoozed.status_code == 200
    active = client.get("/api/alerts", headers=admin_headers, params={"account_id": account.id, "status": "active"})
    assert active.status_code == 200
    assert all(item["id"] != alert.id for item in active.json()["items"])

    alert.snoozed_until = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()
    expired = evaluate_account(client, admin_headers, account.id)
    assert expired["reactivated"] >= 1
    db_session.refresh(alert)
    assert alert.status == "open"

    account.health_overall = 88
    db_session.commit()
    cleared = evaluate_account(client, admin_headers, account.id)
    assert cleared["resolved"] >= 1
    db_session.refresh(alert)
    assert alert.status == "resolved"
    assert alert.resolved_reason == "condition_cleared"

    account.health_overall = 42
    db_session.commit()
    recurrence = evaluate_account(client, admin_headers, account.id)
    assert recurrence["created"] >= 1
    active_recurrence = active_alert_for_rule(db_session, "low_overall_health")
    assert active_recurrence.id != alert.id

    history_statuses = [item.to_status for item in db_session.scalars(select(AlertStatusHistory).where(AlertStatusHistory.alert_id == alert.id).order_by(AlertStatusHistory.created_at))]
    assert {"open", "acknowledged", "snoozed", "resolved"}.issubset(set(history_statuses))


def test_alert_created_respects_profile_preferences_and_email_metadata(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account = create_owned_account(db_session, owner, "alert-preferences-off-account", health=40)
    db_session.add(NotificationPreference(user_id=owner["id"], trigger="alert_created", mode="off", digest_cadence="immediate"))
    db_session.commit()

    off_result = evaluate_account(client, admin_headers, account.id)
    assert off_result["created"] >= 1
    assert off_result["notifications_created"] >= 0
    alert = active_alert_for_rule(db_session, "low_overall_health")
    skipped = db_session.scalar(select(NotificationRecord).where(NotificationRecord.source_record_id == alert.id, NotificationRecord.recipient_user_id == owner["id"]))
    assert skipped is not None
    assert skipped.delivery_status == "skipped"
    assert skipped.delivery_metadata_json["reason"] == "preference_off"

    email_account = create_owned_account(db_session, owner, "alert-preferences-email-account", health=39)
    preference = db_session.scalar(select(NotificationPreference).where(NotificationPreference.user_id == owner["id"], NotificationPreference.trigger == "alert_created"))
    preference.mode = "in_app_email"
    preference.digest_cadence = "immediate"
    db_session.commit()

    email_result = evaluate_account(client, admin_headers, email_account.id)
    assert email_result["created"] >= 1
    email_alert = db_session.scalar(select(Alert).where(Alert.account_id == email_account.id, Alert.rule_key == "low_overall_health"))
    assert email_alert is not None
    emailed = db_session.scalar(select(NotificationRecord).where(NotificationRecord.source_record_id == email_alert.id, NotificationRecord.recipient_user_id == owner["id"]))
    assert emailed is not None
    assert emailed.email_queued is True
    assert "email_delivery" in emailed.delivery_metadata_json


def test_scheduled_alert_worker_logs_success_and_failure(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    create_owned_account(db_session, owner, "alert-worker-account", health=41)

    result = AlertsService(db_session).run_scheduled_evaluation()
    assert result.worker_run_id
    success_run = db_session.get(ScheduledWorkerRun, result.worker_run_id)
    assert success_run is not None
    assert success_run.job_type == "alert_evaluation"
    assert success_run.mode == "scheduled"
    assert success_run.status == "complete"

    with patch.object(AlertsService, "_evaluate_rules", side_effect=RuntimeError("forced alert failure")):
        with pytest.raises(RuntimeError):
            AlertsService(db_session).run_scheduled_evaluation()
    failure_run = db_session.scalar(select(ScheduledWorkerRun).where(ScheduledWorkerRun.job_type == "alert_evaluation", ScheduledWorkerRun.status == "failed").order_by(ScheduledWorkerRun.created_at.desc()))
    assert failure_run is not None
    assert "forced alert failure" in failure_run.error_message
