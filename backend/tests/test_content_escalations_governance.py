from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AuditLog, CustomFieldDefinition, TimelineEntry, User
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        seed_default_data(session)
        seed_account(session)
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


def auth_headers(client: TestClient, email: str = "admin@tkxelkam.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seed_account(session: Session) -> None:
    owner = session.scalar(select(User).where(User.role == "account_manager"))
    assert owner is not None
    account = Account(
        id="account-cafe-zupas",
        name="Cafe Zupas",
        segment="Enterprise",
        lifecycle_status="Expansion Focus",
        risk_status="warning",
        commercial_value=1260000,
        currency="USD",
        created_by_id=owner.id,
    )
    session.add(account)
    session.flush()
    session.add(
        AccountOwner(
            account_id=account.id,
            user_id=owner.id,
            user_name=owner.full_name,
            user_email=owner.email,
            ownership_role="primary_am",
            is_primary=True,
            created_by_id=owner.id,
        )
    )
    session.commit()


def seeded_user(session: Session, role: str) -> User:
    user = session.scalar(select(User).where(User.role == role))
    assert user is not None
    return user


def seed_custom_field(session: Session, module: str, field_key: str, label: str, field_type: str = "text", options: list[str] | None = None) -> None:
    admin = seeded_user(session, "admin")
    session.add(
        CustomFieldDefinition(
            module=module,
            field_key=field_key,
            label=label,
            field_type=field_type,
            options=options or [],
            is_required=True,
            show_in_detail=True,
            created_by_id=admin.id,
            updated_by_id=admin.id,
        )
    )
    session.commit()


def test_content_catalog_recommendations_sent_history_and_openapi(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    seed_custom_field(db_session, "client_education_content", "client_segment_note", "Client Segment Note")

    invalid = client.post(
        "/api/content",
        headers=headers,
        json={"title": "Broken", "content_type": "Guide", "category": "Cloud", "source_kind": "url"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["message"] == "Validation failed"

    invalid_file_source = client.post(
        "/api/content",
        headers=headers,
        json={"title": "Broken File", "content_type": "Guide", "category": "Cloud", "source_kind": "file", "custom_field_values": {"client_segment_note": "Enterprise"}},
    )
    assert invalid_file_source.status_code == 422

    created = client.post(
        "/api/content",
        headers=headers,
        json={
            "title": "Cafe Zupas rollout governance checklist",
            "description": "Governance checklist for regional rollout recovery.",
            "content_type": "Checklist",
            "category": "Delivery",
            "tags": ["Recovery", "Governance"],
            "service_lines": ["Customer Success"],
            "account_stages": ["Expansion Focus"],
            "source_kind": "url",
            "url": "https://example.com/checklist",
            "custom_field_values": {"client_segment_note": "Enterprise rollout education"},
        },
    )
    assert created.status_code == 201
    content = created.json()
    assert content["custom_field_values"]["client_segment_note"] == "Enterprise rollout education"

    uploaded = client.post(
        "/api/content/upload",
        headers=headers,
        data={
            "title": "Cafe Zupas governance deck",
            "content_type": "Deck",
            "category": "Delivery",
            "tags": "Recovery,Executive",
            "account_stages": "Expansion Focus",
            "custom_field_values": '{"client_segment_note":"Uploaded executive deck"}',
        },
        files={"file": ("governance.txt", b"deck content", "text/plain")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["source_kind"] == "file"
    assert uploaded.json()["custom_field_values"]["client_segment_note"] == "Uploaded executive deck"

    list_response = client.get("/api/content", headers=headers, params={"search": "rollout", "tag": "Recovery", "sort": "name", "page": 1, "page_size": 1})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    recommendations = client.get("/api/accounts/account-cafe-zupas/content-recommendations", headers=headers)
    assert recommendations.status_code == 200
    assert any(item["content"]["id"] == content["id"] for item in recommendations.json())

    sent = client.post(
        "/api/accounts/account-cafe-zupas/sent-content",
        headers=headers,
        json={"content_item_id": content["id"], "recipient_name": "Mark Chen", "recipient_email": "mark.chen@example.com"},
    )
    assert sent.status_code == 201
    assert sent.json()["timeline_entry_id"]

    sent_list = client.get("/api/accounts/account-cafe-zupas/sent-content", headers=headers, params={"search": "Mark", "content_tag": "Recovery", "page": 1, "page_size": 1})
    assert sent_list.status_code == 200
    assert sent_list.json()["total"] == 1
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.source_record_id == sent.json()["id"])) is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == sent.json()["id"])) is not None

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert openapi.json()["paths"]["/api/content"]["get"]["summary"] == "List content catalog"


def test_escalation_lifecycle_validation_authorization_notifications_and_filters(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    seed_custom_field(db_session, "escalation_management", "client_commitment", "Client Commitment")

    created = client.post(
        "/api/escalations",
        headers=headers,
        json={
            "account_id": "account-cafe-zupas",
            "summary": "Regional rollout governance slip",
            "impact": "Executive delivery confidence is at risk.",
            "severity": "critical",
            "priority": "urgent",
            "owner_id": owner.id,
            "watchlist": True,
            "custom_field_values": {"client_commitment": "Daily executive updates"},
        },
    )
    assert created.status_code == 201
    escalation = created.json()
    assert escalation["status"] == "watchlist"
    assert escalation["custom_field_values"]["client_commitment"] == "Daily executive updates"

    close_without_evidence = client.post(
        f"/api/escalations/{escalation['id']}/close",
        headers=headers,
        json={"resolution_summary": "Recovered."},
    )
    assert close_without_evidence.status_code == 400

    close_without_rca = client.post(
        f"/api/escalations/{escalation['id']}/close",
        headers=headers,
        json={"resolution_summary": "Recovered.", "closure_evidence": "Client accepted recovery plan."},
    )
    assert close_without_rca.status_code == 400

    update = client.post(
        f"/api/escalations/{escalation['id']}/updates",
        headers=headers,
        json={"update_type": "mitigation", "body": "Daily recovery standup started."},
    )
    assert update.status_code == 201

    notification = client.post(f"/api/escalations/{escalation['id']}/notifications/test", headers=headers)
    duplicate = client.post(f"/api/escalations/{escalation['id']}/notifications/test", headers=headers)
    assert notification.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == notification.json()["id"]

    closed = client.post(
        f"/api/escalations/{escalation['id']}/close",
        headers=headers,
        json={"resolution_summary": "Recovered.", "closure_evidence": "Client accepted recovery plan.", "rca": "Governance ownership gap."},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"

    reopened = client.post(f"/api/escalations/{escalation['id']}/reopen", headers=headers)
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "reopened"

    listed = client.get("/api/escalations", headers=headers, params={"search": "rollout", "severity": "critical", "watchlist": True, "sort": "created_at", "direction": "desc", "page": 1, "page_size": 1})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    listed_by_update = client.get("/api/escalations", headers=headers, params={"search": "standup", "page": 1, "page_size": 10})
    assert listed_by_update.status_code == 200
    assert listed_by_update.json()["total"] == 1

    notification_log = client.get("/api/admin/notification-log", headers=headers, params={"search": "Manual escalation notification test"})
    assert notification_log.status_code == 200
    assert notification_log.json()["total"] == 1

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxelkam.com", "User@12345")
    forbidden = client.patch(f"/api/escalations/{escalation['id']}", headers=viewer_headers, json={"summary": "No edit"})
    assert forbidden.status_code == 403


def test_governance_recurrence_ai_brief_integrations_and_permissions(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    seed_custom_field(db_session, "governance_reviews", "executive_theme", "Executive Theme")

    event_response = client.post(
        "/api/governance-events",
        headers=headers,
        json={
            "account_id": "account-cafe-zupas",
            "owner_id": owner.id,
            "governance_type": "QBR",
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "agenda": "Review recovery plan and expansion timeline.",
            "attendees": ["Mark Chen", "Account Manager KAM"],
            "custom_field_values": {"executive_theme": "Recovery confidence"},
        },
    )
    assert event_response.status_code == 201
    event = event_response.json()
    assert event["custom_field_values"]["executive_theme"] == "Recovery confidence"

    decision = client.post(f"/api/governance-events/{event['id']}/decisions", headers=headers, json={"decision_text": "Proceed with weekly executive recovery cadence."})
    assert decision.status_code == 201

    action = client.post(
        f"/api/governance-events/{event['id']}/action-items",
        headers=headers,
        json={"title": "Share recovery dashboard", "owner_id": owner.id, "due_at": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()},
    )
    assert action.status_code == 201

    decisions = client.get(f"/api/governance-events/{event['id']}/decisions", headers=headers, params={"page": 1, "page_size": 1})
    assert decisions.status_code == 200
    assert decisions.json()["total"] == 1

    action_items = client.get(f"/api/governance-events/{event['id']}/action-items", headers=headers, params={"page": 1, "page_size": 1})
    assert action_items.status_code == 200
    assert action_items.json()["total"] == 1

    searched_events = client.get("/api/governance-events", headers=headers, params={"search": "executive recovery cadence"})
    assert searched_events.status_code == 200
    assert searched_events.json()["total"] == 1

    brief = client.post(f"/api/governance-events/{event['id']}/ai-brief", headers=headers)
    assert brief.status_code == 200
    assert brief.json()["citations"]
    assert "AI-generated" in brief.json()["disclaimer"]

    completed = client.post(f"/api/governance-events/{event['id']}/complete", headers=headers)
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    cancelled_response = client.post(
        "/api/governance-events",
        headers=headers,
        json={
            "account_id": "account-cafe-zupas",
            "owner_id": owner.id,
            "governance_type": "Monthly Review",
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=8)).isoformat(),
            "status": "cancelled",
            "notes": "Cancelled by client.",
            "custom_field_values": {"executive_theme": "Cancelled"},
        },
    )
    assert cancelled_response.status_code == 201
    cancelled_completion = client.post(f"/api/governance-events/{cancelled_response.json()['id']}/complete", headers=headers)
    assert cancelled_completion.status_code == 400

    recurrence = client.post(
        "/api/admin/governance-recurrence-rules",
        headers=headers,
        json={
            "name": "Cafe Zupas quarterly QBR",
            "governance_type": "QBR",
            "cadence": "quarterly",
            "interval": 1,
            "start_at": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
            "end_policy": "after_occurrences",
            "occurrences": 2,
            "account_id": "account-cafe-zupas",
            "owner_id": owner.id,
        },
    )
    assert recurrence.status_code == 201
    rule_id = recurrence.json()["id"]

    events = client.get("/api/governance-events", headers=headers, params={"account_id": "account-cafe-zupas", "page": 1, "page_size": 10})
    assert events.status_code == 200
    assert events.json()["total"] >= 3

    integrations = client.get("/api/admin/integrations", headers=headers)
    assert integrations.status_code == 200
    assert {item["provider"] for item in integrations.json()} == {"fathom", "google-calendar"}

    config_required = client.post("/api/admin/integrations/google-calendar/sync", headers=headers)
    assert config_required.status_code == 200
    assert config_required.json()["status"] == "configuration_required"

    configured = client.patch(
        "/api/admin/integrations/google-calendar",
        headers=headers,
        json={
            "enabled": True,
            "credentials_json": {"access_token": "test"},
            "settings_json": {
                "sample_records": [
                    {"id": "cal-1", "summary": "Cafe Zupas QBR", "start": {"dateTime": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()}},
                    {"id": "cal-1", "summary": "Cafe Zupas QBR", "start": {"dateTime": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()}},
                ]
            },
        },
    )
    assert configured.status_code == 200
    synced = client.post("/api/admin/integrations/google-calendar/sync", headers=headers)
    assert synced.status_code == 200
    assert synced.json()["created"] == 1
    assert synced.json()["skipped"] == 1

    sync_logs = client.get("/api/admin/integrations/sync-logs", headers=headers, params={"provider": "google-calendar"})
    assert sync_logs.status_code == 200
    assert sync_logs.json()["total"] >= 1

    delete_rule = client.delete(f"/api/admin/governance-recurrence-rules/{rule_id}", headers=headers)
    assert delete_rule.status_code == 200

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxelkam.com", "User@12345")
    forbidden = client.post(
        "/api/governance-events",
        headers=viewer_headers,
        json={
            "account_id": "account-cafe-zupas",
            "owner_id": owner.id,
            "governance_type": "QBR",
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=9)).isoformat(),
        },
    )
    assert forbidden.status_code == 403
