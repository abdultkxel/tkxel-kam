from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, Engagement, Task, TimelineEntry
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


def create_account_with_engagement(db_session: Session, owner: dict, account_id: str = "signals-account") -> str:
    now = datetime.now(timezone.utc)
    account = Account(
        id=account_id,
        name="Signals Workspace",
        lifecycle_status="Active",
        segment="Growth",
        risk_status="warning",
        commercial_value=250000,
        currency="USD",
        health_overall=54,
        health_relationship=48,
        health_usage=64,
        health_delivery=56,
        health_commercial=61,
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
            rationale="Scoring test owner.",
            created_by_id=owner["id"],
        )
    )
    db_session.add(
        Engagement(
            account_id=account.id,
            name="Renewal SOW",
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            service_lines=["Development"],
            value=125000,
            currency="USD",
            delivery_status="at_risk",
            delivery_health=55,
            start_date=now - timedelta(days=90),
            end_date=now + timedelta(days=10),
            renewal_date=now + timedelta(days=15),
            notice_deadline=now + timedelta(days=5),
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account.id


def test_metric_configuration_validation_publish_and_pagination(client: TestClient) -> None:
    headers = auth_headers(client)

    seeded_metrics = client.get("/api/admin/metrics", headers=headers, params={"page": 1, "page_size": 2, "active_state": "all"})
    assert seeded_metrics.status_code == 200
    assert seeded_metrics.json()["total"] >= 5
    assert seeded_metrics.json()["pages"] >= 3

    invalid = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "unsafe_metric",
            "name": "Unsafe Metric",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 80, "amber_min": 60, "green_min": 75},
            "formula": {"op": "eval", "value": "__import__('os')"},
        },
    )
    assert invalid.status_code == 422

    created = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "portfolio_momentum",
            "name": "Portfolio Momentum",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "field", "field": "health_usage"},
        },
    )
    assert created.status_code == 201
    metric = created.json()

    validation = client.post(f"/api/admin/metrics/{metric['id']}/validate", headers=headers)
    assert validation.status_code == 200
    assert validation.json()["valid"] is True

    published = client.post(f"/api/admin/metrics/{metric['id']}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["version"] == 1

    versions = client.get(f"/api/admin/metrics/{metric['id']}/versions", headers=headers)
    assert versions.status_code == 200
    assert versions.json()["total"] == 1

    rules = client.get("/api/admin/signal-rules", headers=headers, params={"page": 1, "page_size": 3, "active_state": "all"})
    assert rules.status_code == 200
    assert rules.json()["total"] >= 7
    assert rules.json()["pages"] >= 3

    created_rule = client.post(
        "/api/admin/signal-rules",
        headers=headers,
        json={
            "slug": "custom_attention_rule",
            "name": "Custom Attention Rule",
            "signal_type": "weak_metric",
            "severity": "warning",
            "condition_json": {"source": "manual_config"},
            "owner_rule_json": {"default": "primary_am"},
            "sla_rule_json": {"due_in_days": 5},
        },
    )
    assert created_rule.status_code == 201
    rule = created_rule.json()

    updated_rule = client.patch(f"/api/admin/signal-rules/{rule['id']}", headers=headers, json={"severity": "critical", "is_active": False})
    assert updated_rule.status_code == 200
    assert updated_rule.json()["severity"] == "critical"
    assert updated_rule.json()["current_version"] == rule["current_version"] + 1

    owner = seeded_user(client, headers, "account_manager")
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    denied_rule_create = client.post(
        "/api/admin/signal-rules",
        headers=owner_headers,
        json={"slug": "owner_rule", "name": "Owner Rule", "signal_type": "weak_metric", "severity": "warning"},
    )
    assert denied_rule_create.status_code == 403


def test_account_scoring_signal_lifecycle_conversion_and_authorization(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner)
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    relationship_metric = client.get("/api/admin/metrics", headers=admin_headers, params={"search": "Relationship Health", "page": 1, "page_size": 1})
    assert relationship_metric.status_code == 200
    relationship_metric_id = relationship_metric.json()["items"][0]["id"]
    boosted_weight = client.patch(f"/api/admin/metrics/{relationship_metric_id}", headers=admin_headers, json={"weight": 100, "thresholds": {"red_max": 49, "amber_min": 50, "green_min": 70}})
    assert boosted_weight.status_code == 200
    assert client.post(f"/api/admin/metrics/{relationship_metric_id}/publish", headers=admin_headers).status_code == 200

    score_response = client.post(
        f"/api/accounts/{account_id}/scores/recalculate",
        headers=owner_headers,
        json={
            "trigger_source": "test",
            "include_signal_evaluation": True,
            "manual_submission": {
                "calculator_id": "account_health",
                "values": {"relationship": 50, "usage": 63, "delivery": 56, "commercial": 62},
                "evidence": [{"label": "Review note", "value": "Manual calculator submission"}],
            },
        },
    )
    assert score_response.status_code == 200
    score = score_response.json()
    assert score["overall"] < 60
    assert score["rag_status"] == "red"
    assert any(driver["key"] == "relationship_health" and driver["weight"] > 40 for driver in score["drivers"])
    assert score["latest_snapshot"]["source_context"]["manual_submission_id"]
    assert score["latest_snapshot"]["source_context"]["published_metrics"]

    snapshots = client.get(f"/api/accounts/{account_id}/score-snapshots", headers=owner_headers, params={"page": 1, "page_size": 1, "rag_status": "red"})
    assert snapshots.status_code == 200
    assert snapshots.json()["total"] == 1

    attention = client.get("/api/attention-center", headers=owner_headers, params={"account_id": account_id, "page": 1, "page_size": 10})
    assert attention.status_code == 200
    signal_types = {item["signal_type"] for item in attention.json()["items"]}
    assert {"stale_kyc", "weak_metric", "sow_expiry", "notice_window", "renewal_date"}.issubset(signal_types)
    signal = next(item for item in attention.json()["items"] if item["signal_type"] == "weak_metric")

    evidence = client.get(f"/api/signals/{signal['id']}/evidence", headers=owner_headers)
    assert evidence.status_code == 200
    assert evidence.json()["evidence"]

    explanation = client.post(f"/api/signals/{signal['id']}/ai-explanation", headers=owner_headers)
    assert explanation.status_code == 200
    assert explanation.json()["advisory_only"] is True

    reviewed = client.patch(f"/api/signals/{signal['id']}/status", headers=owner_headers, json={"status": "reviewed"})
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "reviewed"

    converted = client.post(f"/api/signals/{signal['id']}/convert", headers=owner_headers, json={"target_type": "task", "note": "Create recovery task"})
    assert converted.status_code == 200
    assert converted.json()["source_type"] == "signal"

    list_signals = client.get("/api/signals", headers=owner_headers, params={"search": "health", "status": "converted", "page": 1, "page_size": 5})
    assert list_signals.status_code == 200
    assert list_signals.json()["total"] >= 1

    other_owner = seeded_user(client, admin_headers, "ops_lead")
    unowned_headers = auth_headers(client, other_owner["email"], "User@12345")
    denied = client.post(f"/api/accounts/{account_id}/scores/recalculate", headers=unowned_headers, json={"trigger_source": "forbidden"})
    assert denied.status_code == 403


def test_playbook_execution_tasks_calendar_and_completion_validation(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="task-account")
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    templates = client.get("/api/admin/playbook-templates", headers=owner_headers, params={"status": "active", "page": 1, "page_size": 10})
    assert templates.status_code == 200
    assert templates.json()["total"] >= 1
    template_id = templates.json()["items"][0]["id"]

    execution = client.post(f"/api/playbooks/{template_id}/execute", headers=owner_headers, json={"account_id": account_id})
    assert execution.status_code == 201
    execution_body = execution.json()
    assert len(execution_body["tasks"]) >= 1
    task_id = execution_body["tasks"][0]["id"]

    task_page = client.get("/api/tasks", headers=owner_headers, params={"account_id": account_id, "source_type": "playbook", "page": 1, "page_size": 1})
    assert task_page.status_code == 200
    assert task_page.json()["total"] >= 1
    assert task_page.json()["pages"] >= 1

    completion_without_evidence = client.patch(f"/api/tasks/{task_id}", headers=owner_headers, json={"status": "done"})
    assert completion_without_evidence.status_code == 400

    evidence = client.post(f"/api/tasks/{task_id}/evidence", headers=owner_headers, json={"evidence_type": "note", "note": "Client recovery plan confirmed."})
    assert evidence.status_code == 201

    completed = client.patch(f"/api/tasks/{task_id}", headers=owner_headers, json={"status": "done", "outcome": "Recovery plan completed."})
    assert completed.status_code == 200
    assert completed.json()["status"] == "done"
    assert completed.json()["completed_at"]

    manual_task = client.post(
        "/api/tasks",
        headers=owner_headers,
        json={
            "account_id": account_id,
            "title": "Manual renewal follow-up",
            "description": "Validate renewal owner.",
            "owner_id": owner["id"],
            "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "priority": "critical",
        },
    )
    assert manual_task.status_code == 201

    invalid_skip = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "skipped"})
    assert invalid_skip.status_code == 400

    skipped = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "skipped", "skip_reason": "Duplicate renewal task."})
    assert skipped.status_code == 200
    assert skipped.json()["status"] == "skipped"

    calendar = client.get("/api/calendar/items", headers=owner_headers, params={"account_id": account_id, "page": 1, "page_size": 20})
    assert calendar.status_code == 200
    kinds = {item["kind"] for item in calendar.json()["items"]}
    assert "task" in kinds
    assert {"notice_window", "renewal_date", "sow_expiry"}.intersection(kinds)

    assert db_session.scalar(select(Task).where(Task.account_id == account_id)) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "playbook_executed")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_created")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_skipped")) is not None
