from collections.abc import Generator
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, NotificationPreference, NotificationTriggerConfig
from app.services.notification_catalog import CONFIGURABLE_NOTIFICATION_TRIGGERS, RUNTIME_NOTIFICATION_TRIGGERS
from app.services.seed import seed_base_data, seed_default_data


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seeded_user(client: TestClient, headers: dict[str, str], role: str) -> dict:
    response = client.get("/api/admin/users", headers=headers, params={"role": role, "page": 1, "page_size": 1})
    assert response.status_code == 200
    return response.json()["items"][0]


def draft_payload(account_name: str, owner_id: str) -> dict:
    return {
        "account_name": account_name,
        "project_name": "Notification workflow onboarding",
        "company_url": "https://notification.example.com",
        "lifecycle_status": "Onboarding",
        "segment": "Growth",
        "region": "Global",
        "commercial_value": 125000,
        "currency": "USD",
        "primary_owner_id": owner_id,
        "source_citation": "Project Charter p1: account and engagement scope.",
        "source_documents": [
            {
                "title": "Customer Project Charter",
                "source_type": "project_charter",
                "file_name": "customer-charter.pdf",
                "confidence": 91,
                "pages": 4,
                "citations": [{"label": "Project Charter p1", "page_number": 1, "excerpt": "Scope.", "field_key": "account_name"}],
            }
        ],
        "engagement_drafts": [
            {
                "name": "Notification workflow engagement",
                "owner_id": owner_id,
                "service_lines": ["Engineering"],
                "value": 125000,
                "currency": "USD",
                "delivery_status": "active",
                "confidence": 88,
                "start_date": "2026-06-01T00:00:00Z",
                "end_date": "2026-12-01T00:00:00Z",
                "renewal_date": "2026-12-01T00:00:00Z",
                "notice_deadline": "2026-11-01T00:00:00Z",
                "notice_period_days": 30,
                "source_citation": "Project Charter p2: engagement scope and timeline.",
            }
        ],
    }


def create_owned_account(db_session: Session, owner: dict, account_id: str = "notification-task-account") -> Account:
    account = Account(
        id=account_id,
        name="Notification Task Account",
        lifecycle_status="Active",
        segment="Growth",
        region="US",
        risk_status="warning",
        commercial_value=200000,
        currency="USD",
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
            rationale="Test ownership.",
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account


def _client_with_db() -> Generator[tuple[TestClient, Session], None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with testing_session() as session:
        seed_default_data(session)

        def override_get_db() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            yield client, session
        app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_base_seed_includes_notification_triggers() -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    try:
        with testing_session() as session:
            seed_base_data(session)
            count = session.query(NotificationTriggerConfig).count()
            account_attachment = session.query(NotificationTriggerConfig).filter_by(trigger="account_attachment_added").one()
            governance_decision = session.query(NotificationTriggerConfig).filter_by(trigger="governance_decision_recorded").one()
            assert count == len(RUNTIME_NOTIFICATION_TRIGGERS)
            assert account_attachment.is_active is True
            assert governance_decision.is_active is True
            assert session.query(NotificationTriggerConfig).filter_by(trigger="renewal_due").one_or_none() is None
            assert session.query(NotificationTriggerConfig).filter_by(trigger="sla_escalation").one_or_none() is not None
    finally:
        Base.metadata.drop_all(bind=engine)


def test_seed_removes_stale_notification_trigger_configs_and_preferences() -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    try:
        with testing_session() as session:
            user = seed_base_data(session)
            session.add(NotificationTriggerConfig(trigger="renewal_due", label="Renewal due", workflow="engagements"))
            session.add(NotificationPreference(user_id=user.id, trigger="renewal_due", mode="in_app", digest_cadence="daily"))
            session.commit()

            seed_base_data(session)

            assert session.query(NotificationTriggerConfig).filter_by(trigger="renewal_due").one_or_none() is None
            assert session.query(NotificationPreference).filter_by(trigger="renewal_due").one_or_none() is None
            assert session.query(NotificationTriggerConfig).count() == len(RUNTIME_NOTIFICATION_TRIGGERS)
    finally:
        Base.metadata.drop_all(bind=engine)


def test_admin_defaults_only_show_configurable_notification_triggers() -> None:
    for client, db_session in _client_with_db():
        headers = auth_headers(client)
        response = client.get("/api/admin/notification-defaults", headers=headers)
        assert response.status_code == 200
        triggers = {item["trigger"]: item for item in response.json()["items"]}
        assert len(triggers) == len(CONFIGURABLE_NOTIFICATION_TRIGGERS)
        assert triggers["account_draft_created"]["workflow"] == "account_onboarding"
        assert triggers["task_created"]["recipient_policy"] == "task_assignee"
        assert triggers["integration_failure"]["workflow"] == "integrations"
        assert triggers["alert_created"]["workflow"] == "alerts"
        assert triggers["low_csat_detected"]["workflow"] == "csat"
        assert triggers["account_attachment_added"]["is_active"] is True
        assert "account_draft_pending_review" not in triggers
        assert "renewal_due" not in triggers
        assert "fathom_review_required" not in triggers
        assert "governance_action_overdue" not in triggers
        assert "signal_unreviewed" not in triggers
        assert "sla_escalation" not in triggers

        stale_update = client.patch(
            "/api/admin/notification-triggers/renewal_due",
            headers=headers,
            json={"default_mode": "in_app"},
        )
        assert stale_update.status_code == 404

        stale_default_payload = {
            "trigger": "renewal_due",
            "label": "Renewal due",
            "workflow": "engagements",
            "priority": "high",
            "recipient_policy": "account_owner",
            "default_mode": "in_app",
            "default_digest_cadence": "daily",
            "supported_channels": ["in_app"],
            "mandatory": False,
            "timing_mode": "immediate",
            "timing_unit": "business_days",
            "repeat_enabled": False,
            "escalation_enabled": False,
            "is_active": True,
        }
        stale_bulk_update = client.put(
            "/api/admin/notification-defaults",
            headers=headers,
            json={"items": [stale_default_payload]},
        )
        assert stale_bulk_update.status_code == 400

        metadata = client.get("/api/notifications/triggers", headers=headers)
        assert metadata.status_code == 200
        metadata_triggers = {item["trigger"] for item in metadata.json()["items"]}
        assert "account_draft_created" in metadata_triggers
        assert "account_draft_updated" in metadata_triggers
        assert "renewal_due" not in metadata_triggers
        assert "signal_unreviewed" not in metadata_triggers

        preferences = client.get("/api/users/me/notification-preferences", headers=headers)
        assert preferences.status_code == 200
        preference_triggers = {item["trigger"] for item in preferences.json()}
        assert "account_draft_created" in preference_triggers
        assert "account_draft_updated" in preference_triggers
        assert "renewal_due" not in preference_triggers
        assert "sla_escalation" not in preference_triggers

        update = client.patch(
            "/api/admin/notification-triggers/account_draft_created",
            headers=headers,
            json={"timing_unit": "business_days", "default_mode": "in_app_email"},
        )
        assert update.status_code == 200
        assert update.json()["default_mode"] == "in_app_email"

        disable_mandatory = client.patch(
            "/api/admin/notification-triggers/account_draft_created",
            headers=headers,
            json={"is_active": False},
        )
        assert disable_mandatory.status_code == 400

        test = client.post("/api/admin/notification-triggers/account_draft_created/test", headers=headers, json={})
        assert test.status_code == 200
        assert test.json()["trigger"] == "account_draft_created"

        dry_run = client.post("/api/admin/notification-scheduler/dry-run", headers=headers)
        assert dry_run.status_code == 200
        assert dry_run.json()["due_triggers"] >= 1

        runs = client.get("/api/admin/notification-scheduler/runs", headers=headers)
        assert runs.status_code == 200
        assert runs.json()["total"] >= 1

        summary = client.get("/api/notifications/summary", headers=headers)
        assert summary.status_code == 200
        assert summary.json()["unread_count"] >= 1
        assert summary.json()["latest"][0]["workflow"] == "account_onboarding"

        notification_id = test.json()["id"]
        archived = client.patch(f"/api/notifications/{notification_id}/archive", headers=headers)
        assert archived.status_code == 200
        assert archived.json()["archived_at"] is not None
        default_list = client.get("/api/notifications", headers=headers, params={"trigger": "account_draft_created"})
        assert all(item["id"] != notification_id for item in default_list.json()["items"])
        archived_list = client.get("/api/notifications", headers=headers, params={"read_state": "archived"})
        assert any(item["id"] == notification_id for item in archived_list.json()["items"])

        filtered = client.get("/api/notifications", headers=headers, params={"workflow": "account_onboarding", "priority": "high", "sort": "unread_first"})
        assert filtered.status_code == 200
        bad_trigger = client.get("/api/notifications", headers=headers, params={"trigger": "not_a_real_trigger"})
        assert bad_trigger.status_code == 400


def test_mandatory_notifications_force_email_delivery() -> None:
    for client, db_session in _client_with_db():
        headers = auth_headers(client)
        me = client.get("/api/auth/me", headers=headers).json()
        preference = client.put(
            "/api/users/me/notification-preferences",
            headers=headers,
            json={"items": [{"trigger": "account_draft_created", "mode": "in_app", "digest_cadence": "daily"}]},
        )
        assert preference.status_code == 200

        test = client.post("/api/admin/notification-triggers/account_draft_created/test", headers=headers, json={"recipient_user_id": me["id"]})
        assert test.status_code == 200
        assert test.json()["email_queued"] is True
        assert test.json()["delivery_metadata_json"]["email_delivery"]["channel"] == "email"


def test_account_draft_create_and_approval_outcome_notifications() -> None:
    for client, db_session in _client_with_db():
        admin_headers = auth_headers(client)
        owner = seeded_user(client, admin_headers, "account_manager")
        kam_head = seeded_user(client, admin_headers, "kam_head")
        owner_headers = auth_headers(client, owner["email"], "User@12345")

        draft = client.post("/api/onboarding/drafts", headers=owner_headers, json=draft_payload("Draft Notification Corp", owner["id"]))
        assert draft.status_code == 201

        approver_notifications = client.get("/api/notifications", headers=auth_headers(client, kam_head["email"], "User@12345"), params={"trigger": "account_draft_created"})
        assert approver_notifications.status_code == 200
        assert approver_notifications.json()["total"] >= 1
        assert approver_notifications.json()["items"][0]["source_record_id"] == draft.json()["id"]

        approved = client.post(f"/api/onboarding/drafts/{draft.json()['id']}/approve", headers=admin_headers)
        assert approved.status_code == 200

        owner_notifications = client.get("/api/notifications", headers=owner_headers, params={"trigger": "account_draft_approved"})
        assert owner_notifications.status_code == 200
        assert owner_notifications.json()["total"] >= 1
        assert owner_notifications.json()["items"][0]["action_label"] == "Open account"


def test_kam_head_receives_draft_ready_notification_when_creating_draft_for_am() -> None:
    for client, db_session in _client_with_db():
        admin_headers = auth_headers(client)
        owner = seeded_user(client, admin_headers, "account_manager")
        kam_head = seeded_user(client, admin_headers, "kam_head")
        kam_headers = auth_headers(client, kam_head["email"], "User@12345")
        owner_headers = auth_headers(client, owner["email"], "User@12345")

        draft = client.post("/api/onboarding/drafts", headers=kam_headers, json=draft_payload("KAM Created Draft Corp", owner["id"]))
        assert draft.status_code == 201

        kam_notifications = client.get("/api/notifications", headers=kam_headers, params={"trigger": "account_draft_created"})
        assert kam_notifications.status_code == 200
        assert any(
            item["source_record_id"] == draft.json()["id"]
            and item["title"] == "Draft account ready: KAM Created Draft Corp"
            for item in kam_notifications.json()["items"]
        )

        owner_notifications = client.get("/api/notifications", headers=owner_headers, params={"trigger": "account_draft_created"})
        assert owner_notifications.status_code == 200
        assert any(item["source_record_id"] == draft.json()["id"] for item in owner_notifications.json()["items"])


def test_task_creation_notifies_assignee() -> None:
    for client, db_session in _client_with_db():
        admin_headers = auth_headers(client)
        owner = seeded_user(client, admin_headers, "account_manager")
        account = create_owned_account(db_session, owner)

        created = client.post(
            "/api/tasks",
            headers=admin_headers,
            json={
                "account_id": account.id,
                "owner_id": owner["id"],
                "title": "Prepare notification workflow evidence",
                "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
                "priority": "medium",
                "status": "open",
            },
        )
        assert created.status_code == 201

        owner_headers = auth_headers(client, owner["email"], "User@12345")
        notifications = client.get("/api/notifications", headers=owner_headers, params={"trigger": "task_created"})
        assert notifications.status_code == 200
        assert notifications.json()["total"] >= 1
        item = notifications.json()["items"][0]
        assert item["source_record_id"] == created.json()["id"]
        assert item["workflow"] == "tasks"


def test_account_owner_assignment_notifies_new_owner() -> None:
    for client, db_session in _client_with_db():
        admin_headers = auth_headers(client)
        owner = seeded_user(client, admin_headers, "account_manager")
        kam_head = seeded_user(client, admin_headers, "kam_head")
        account = create_owned_account(db_session, owner, "notification-owner-account")

        added = client.post(
            f"/api/accounts/{account.id}/owners",
            headers=admin_headers,
            json={"user_id": kam_head["id"], "ownership_role": "supporting_am", "rationale": "Add KAM Head for notification coverage."},
        )
        assert added.status_code == 201

        notifications = client.get("/api/notifications", headers=auth_headers(client, kam_head["email"], "User@12345"), params={"trigger": "account_owner_assigned"})
        assert notifications.status_code == 200
        assert notifications.json()["total"] >= 1
        item = notifications.json()["items"][0]
        assert item["source_record_id"] == added.json()["id"]
        assert item["channel"] == "in_app"


def test_escalation_opened_enters_main_notification_center() -> None:
    for client, db_session in _client_with_db():
        admin_headers = auth_headers(client)
        owner = seeded_user(client, admin_headers, "account_manager")
        account = create_owned_account(db_session, owner, "notification-escalation-account")

        created = client.post(
            "/api/escalations",
            headers=admin_headers,
            json={
                "account_id": account.id,
                "summary": "Delivery milestone is at risk",
                "impact": "Client launch date may slip without immediate recovery action.",
                "severity": "high",
                "priority": "high",
                "owner_id": owner["id"],
                "watchlist": False,
            },
        )
        assert created.status_code == 201

        owner_headers = auth_headers(client, owner["email"], "User@12345")
        notifications = client.get("/api/notifications", headers=owner_headers, params={"trigger": "escalation_opened"})
        assert notifications.status_code == 200
        assert notifications.json()["total"] >= 1
        item = notifications.json()["items"][0]
        assert item["source_record_id"] == created.json()["id"]
        assert item["workflow"] == "escalations"
