import base64
from collections.abc import Generator
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AiGatewayRun, AuditLog, CsatScore, CustomFieldDefinition, IntegrationImportedItem, IntegrationSyncRun, MeetingArtifact, NotificationRecord, ScoreSnapshot, TimelineEntry, User
from app.services.integrations import IntegrationService
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
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
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

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
    forbidden = client.patch(f"/api/escalations/{escalation['id']}", headers=viewer_headers, json={"summary": "No edit"})
    assert forbidden.status_code == 403


def test_governance_recurrence_ai_brief_integrations_and_permissions(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
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
    assert {item["provider"] for item in integrations.json()} == {"google_calendar", "fathom", "csat", "ai_llm_gateway"}

    config_required = client.post("/api/admin/integrations/google-calendar/sync", headers=headers)
    assert config_required.status_code == 200
    assert config_required.json()["status"] == "configuration_required"

    def calendar_records(self: IntegrationService, provider: str, connection) -> list[dict]:
        assert provider == "google_calendar"
        return [
            {
                "id": "cal-1",
                "summary": "[KAM:Cafe Zupas] QBR",
                "description": "KAM_AUTO_CREATE=true\nKAM_TYPE=QBR",
                "start": {"dateTime": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()},
            },
            {
                "id": "cal-1",
                "summary": "[KAM:Cafe Zupas] QBR",
                "description": "KAM_AUTO_CREATE=true\nKAM_TYPE=QBR",
                "start": {"dateTime": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()},
            },
        ]

    monkeypatch.setattr(IntegrationService, "_fetch_provider_records", calendar_records)

    configured = client.patch(
        "/api/admin/integrations/google-calendar",
        headers=headers,
        json={
            "enabled": True,
            "credentials_json": {"access_token": "test"},
            "settings_json": {"auto_create_tagged_events": True},
        },
    )
    assert configured.status_code == 200
    assert configured.json()["provider"] == "google_calendar"
    assert configured.json()["credential_status"]["configured"] is True
    assert "credentials_json" not in configured.json()
    synced = client.post("/api/admin/integrations/google-calendar/sync", headers=headers)
    assert synced.status_code == 200
    assert synced.json()["created"] == 0
    assert synced.json()["updated"] == 0
    assert "outbound only" in synced.json()["message"]
    assert db_session.scalar(select(IntegrationImportedItem).where(IntegrationImportedItem.external_id == "cal-1")) is None

    sync_logs = client.get("/api/admin/integrations/sync-logs", headers=headers, params={"provider": "google_calendar"})
    assert sync_logs.status_code == 200
    assert sync_logs.json()["total"] >= 1

    delete_rule = client.delete(f"/api/admin/governance-recurrence-rules/{rule_id}", headers=headers)
    assert delete_rule.status_code == 200

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
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


def test_profile_admin_calendar_id_and_manual_csat_flow(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    profile = client.patch("/api/users/me", headers=headers, json={"primary_google_calendar_id": "admin-calendar@group.calendar.google.com"})
    assert profile.status_code == 200
    assert profile.json()["primary_google_calendar_id"] == "admin-calendar@group.calendar.google.com"

    owner = seeded_user(db_session, "account_manager")
    admin_update = client.patch(
        f"/api/admin/users/{owner.id}",
        headers=headers,
        json={"primary_google_calendar_id": "owner-calendar@group.calendar.google.com"},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["primary_google_calendar_id"] == "owner-calendar@group.calendar.google.com"

    invalid_calendar = client.patch(
        f"/api/admin/users/{owner.id}",
        headers=headers,
        json={"primary_google_calendar_id": "https://calendar.google.com/bad"},
    )
    assert invalid_calendar.status_code == 422

    csat = client.post(
        "/api/csat/scores",
        headers=headers,
        json={
            "account_id": "account-cafe-zupas",
            "customer_name": "Client Sponsor",
            "customer_email": "sponsor@example.com",
            "score": 4,
            "scale_min": 1,
            "scale_max": 5,
            "feedback": "Strong delivery and timely governance.",
            "source_label": "manual",
        },
    )
    assert csat.status_code == 201
    body = csat.json()
    assert body["normalized_score"] == 75
    assert body["freshness_status"] == "fresh"
    assert db_session.get(CsatScore, body["id"]) is not None
    assert db_session.get(ScoreSnapshot, body["scoring_snapshot_id"]) is not None
    assert db_session.get(TimelineEntry, body["timeline_entry_id"]) is not None

    duplicate = client.post(
        "/api/csat/scores",
        headers=headers,
        json={
            "account_id": "account-cafe-zupas",
            "score": 4,
            "scale_min": 1,
            "scale_max": 5,
            "source_label": "manual",
            "source_id": body["source_id"],
        },
    )
    assert duplicate.status_code == 422

    listed = client.get("/api/csat/scores", headers=headers, params={"account_id": "account-cafe-zupas", "page": 1, "page_size": 10})
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    alias_listed = client.get("/api/integrations/csat/scores", headers=headers, params={"account_id": "account-cafe-zupas", "page": 1, "page_size": 10})
    assert alias_listed.status_code == 200
    assert alias_listed.json()["total"] >= 1

    mapped = client.post(
        f"/api/integrations/csat/scores/{body['id']}/map",
        headers=headers,
        json={"account_id": "account-cafe-zupas", "target_event_type": "score_change"},
    )
    assert mapped.status_code == 200
    assert mapped.json()["account_id"] == "account-cafe-zupas"
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == body["id"], AuditLog.action == "map_csat_score")) is not None


def test_google_calendar_oauth_callback_redirects_to_frontend(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def token_payload(self: IntegrationService, code: str) -> dict:
        assert code == "oauth-code"
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "token_type": "Bearer",
            "expires_in": 3600,
            "scope": "https://www.googleapis.com/auth/calendar.events",
        }

    monkeypatch.setattr(IntegrationService, "_exchange_google_code", token_payload)

    response = client.get(
        "/api/admin/integrations/google-calendar/oauth-callback",
        params={"code": "oauth-code", "state": "user-id"},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    location = response.headers["location"]
    assert location.startswith("http://127.0.0.1:5173/admin/integrations/google-calendar/callback?")
    assert "status=success" in location
    assert "Google+Calendar+connected+successfully" in location


def test_fathom_api_key_sync_meeting_links_and_signed_webhook(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)

    def fathom_get(url: str, request_headers: dict[str, str]) -> dict:
        assert url.startswith("https://api.fathom.ai/external/v1/meetings/?")
        assert request_headers["X-Api-Key"] == "test-fathom-key"
        return {
            "items": [
                {
                    "recording_id": 12345,
                    "title": "[KAM:Cafe Zupas] Executive QBR",
                    "meeting_title": "Cafe Zupas executive QBR",
                    "share_url": "https://fathom.video/share/abc123",
                    "scheduled_start_time": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                    "calendar_invitees": [{"name": "Client Sponsor", "email": "sponsor@example.com"}],
                    "default_summary": {"markdown_formatted": "## Summary\nReviewed rollout recovery and expansion risks."},
                    "transcript": [{"speaker": {"display_name": "Client"}, "text": "Sensitive text", "timestamp": "00:01:00"}],
                    "action_items": [{"description": "Share the recovery plan", "recording_playback_url": "https://fathom.video/abc123#t=60"}],
                }
            ]
        }

    monkeypatch.setattr(IntegrationService, "_json_get", staticmethod(fathom_get))
    configured = client.patch(
        "/api/admin/integrations/fathom",
        headers=headers,
        json={
            "enabled": True,
            "credentials_json": {"api_key": "test-fathom-key", "webhook_secret": "whsec_dGVzdC13ZWJob29rLXNlY3JldA=="},
            "settings_json": {"base_url": "https://api.fathom.ai", "recordings_path": "/external/v1/meetings/"},
        },
    )
    assert configured.status_code == 200
    assert configured.json()["credential_status"]["configured"] is True
    assert "credentials_json" not in configured.json()

    synced = client.post("/api/admin/integrations/fathom/sync", headers=headers)
    assert synced.status_code == 200
    assert synced.json()["created"] == 1
    imported = db_session.scalar(select(IntegrationImportedItem).where(IntegrationImportedItem.provider == "fathom", IntegrationImportedItem.external_id == "12345"))
    assert imported is not None
    assert imported.source_link == "https://fathom.video/share/abc123"
    assert imported.review_required is True
    assert imported.sanitized_payload_json["transcript_metadata"]["omitted"] is True
    assert "transcript" not in imported.sanitized_payload_json
    search = client.get("/api/admin/integrations/imported-items", headers=headers, params={"search": "Client Sponsor"})
    assert search.status_code == 200
    assert search.json()["total"] >= 1

    logs = client.get(
        "/api/admin/integrations/sync-logs",
        headers=headers,
        params={"provider": "fathom", "severity": "created", "search": "Imported item", "date_from": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()},
    )
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1

    webhook_payload = {
        "recording_id": 67890,
        "title": "[KAM:Cafe Zupas] Client recovery sync",
        "share_url": "https://fathom.video/share/webhook123",
        "scheduled_start_time": datetime.now(timezone.utc).isoformat(),
        "default_summary": {"markdown_formatted": "Webhook summary captured."},
        "action_items": [{"description": "Confirm next steering committee agenda"}],
    }
    raw_body = json.dumps(webhook_payload, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(time.time()))
    message_id = "msg_test"
    secret_bytes = base64.b64decode("dGVzdC13ZWJob29rLXNlY3JldA==")
    signature = base64.b64encode(hmac.new(secret_bytes, b".".join([message_id.encode(), timestamp.encode(), raw_body]), hashlib.sha256).digest()).decode()
    webhook = client.post(
        "/api/integrations/fathom/webhook",
        content=raw_body,
        headers={"webhook-id": message_id, "webhook-timestamp": timestamp, "webhook-signature": f"v1,{signature}", "Content-Type": "application/json"},
    )
    assert webhook.status_code == 200
    webhook_item = db_session.scalar(select(IntegrationImportedItem).where(IntegrationImportedItem.provider == "fathom", IntegrationImportedItem.external_id == "67890"))
    assert webhook_item is not None
    assert webhook_item.source_link == "https://fathom.video/share/webhook123"

    replay = client.post(
        "/api/integrations/fathom/webhook",
        content=raw_body,
        headers={"webhook-id": message_id, "webhook-timestamp": timestamp, "webhook-signature": f"v1,{signature}", "Content-Type": "application/json"},
    )
    assert replay.status_code == 409

    bad_webhook = client.post(
        "/api/integrations/fathom/webhook",
        content=raw_body,
        headers={"webhook-id": message_id, "webhook-timestamp": timestamp, "webhook-signature": "v1,bad", "Content-Type": "application/json"},
    )
    assert bad_webhook.status_code == 401


def test_personal_fathom_connection_syncs_private_meeting_artifacts(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)

    def fathom_get(url: str, request_headers: dict[str, str]) -> dict:
        assert url.startswith("https://api.fathom.ai/external/v1/meetings/?")
        assert "include_transcript=false" in url
        assert request_headers["X-Api-Key"] == "personal-fathom-key"
        return {
            "items": [
                {
                    "recording_id": "meeting-1",
                    "meeting_title": "Client governance call",
                    "share_url": "https://fathom.video/share/meeting-1",
                    "scheduled_start_time": "2026-06-03T10:00:00Z",
                    "default_summary": {"markdown_formatted": "## Summary\nGovernance decisions and follow-up."},
                    "transcript": [{"speaker": {"display_name": "Client"}, "text": "Do not store full transcript."}],
                    "action_items": [{"description": "Send the post-meeting plan"}],
                }
            ]
        }

    monkeypatch.setattr(IntegrationService, "_json_get", staticmethod(fathom_get))

    connection = client.patch(
        "/api/meeting-capture/fathom/connection",
        headers=headers,
        json={"enabled": True, "api_key": "personal-fathom-key"},
    )
    assert connection.status_code == 200
    assert connection.json()["credential_status"]["configured"] is True
    assert "personal-fathom-key" not in connection.text

    synced = client.post("/api/meeting-capture/fathom/sync", headers=headers)
    assert synced.status_code == 200
    assert synced.json()["created"] == 1

    artifact = db_session.scalar(select(MeetingArtifact).where(MeetingArtifact.external_id == "meeting-1"))
    assert artifact is not None
    assert artifact.owner_id == db_session.scalar(select(User.id).where(User.email == "admin@tkxel.com"))
    assert artifact.source_link == "https://fathom.video/share/meeting-1"
    assert artifact.action_items == ["Send the post-meeting plan"]
    assert artifact.metadata_json["transcript_metadata"]["omitted"] is True
    assert "transcript" not in artifact.metadata_json

    listed = client.get("/api/meeting-capture/meetings", headers=headers, params={"search": "governance"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    manager_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")
    manager_list = client.get("/api/meeting-capture/meetings", headers=manager_headers)
    assert manager_list.status_code == 200
    assert manager_list.json()["total"] == 0


def test_personal_fathom_connection_can_disconnect_and_clear_api_key(client: TestClient) -> None:
    headers = auth_headers(client)

    connected = client.patch("/api/meeting-capture/fathom/connection", headers=headers, json={"enabled": True, "api_key": "personal-fathom-key"})
    assert connected.status_code == 200
    assert connected.json()["enabled"] is True
    assert connected.json()["credential_status"]["configured"] is True

    disconnected = client.patch("/api/meeting-capture/fathom/connection", headers=headers, json={"enabled": False, "clear_api_key": True})
    assert disconnected.status_code == 200
    body = disconnected.json()
    assert body["enabled"] is False
    assert body["status"] == "configuration_required"
    assert body["credential_status"]["configured"] is False
    assert body["credential_status"]["masked"] is False

    resolve = client.post("/api/meeting-capture/fathom/resolve", headers=headers, json={"identifier": "123456789"})
    assert resolve.status_code == 400
    assert resolve.json()["detail"] == "Connect your personal Fathom API key before fetching meeting details."


def test_personal_fathom_resolve_fetches_single_recording_and_enriches_action_items(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    requested_urls: list[str] = []

    def fathom_get(url: str, request_headers: dict[str, str]) -> dict:
        requested_urls.append(url)
        assert request_headers["X-Api-Key"] == "personal-fathom-key"
        if url == "https://api.fathom.ai/external/v1/recordings/123456789/summary":
            return {"summary": {"template_name": "general", "markdown_formatted": "## Summary\nExecutive governance decisions."}}
        assert url.startswith("https://api.fathom.ai/external/v1/meetings/?")
        assert "include_transcript=false" in url
        assert "limit=25" in url
        return {
            "items": [
                {
                    "recording_id": 123456789,
                    "meeting_title": "Executive governance call",
                    "share_url": "https://fathom.video/share/executive-governance",
                    "scheduled_start_time": "2026-06-03T10:00:00Z",
                    "default_summary": {"markdown_formatted": "## Summary\nExecutive governance decisions."},
                    "action_items": [{"description": "Send executive follow-up"}],
                }
            ]
        }

    monkeypatch.setattr(IntegrationService, "_json_get", staticmethod(fathom_get))

    connection = client.patch("/api/meeting-capture/fathom/connection", headers=headers, json={"enabled": True, "api_key": "personal-fathom-key"})
    assert connection.status_code == 200

    resolved = client.post(
        "/api/meeting-capture/fathom/resolve",
        headers=headers,
        json={
            "identifier": "123456789",
            "account_id": "account-cafe-zupas",
            "linked_object_type": "governance_event",
            "linked_object_id": "gov-1",
        },
    )
    assert resolved.status_code == 200
    body = resolved.json()
    assert body["external_id"] == "123456789"
    assert body["title"] == "Executive governance call"
    assert body["summary"] == "## Summary\nExecutive governance decisions."
    assert body["action_items"] == ["Send executive follow-up"]
    assert body["source_link"] == "https://fathom.video/share/executive-governance"
    assert body["account_id"] == "account-cafe-zupas"
    assert body["linked_object_type"] == "governance_event"
    assert body["linked_object_id"] == "gov-1"
    assert requested_urls[0] == "https://api.fathom.ai/external/v1/recordings/123456789/summary"
    assert len(list(db_session.scalars(select(MeetingArtifact)))) == 1


def test_personal_fathom_resolve_accepts_share_url_without_global_sync(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    requested_urls: list[str] = []

    def fathom_get(url: str, request_headers: dict[str, str]) -> dict:
        requested_urls.append(url)
        assert "/external/v1/meetings/?" in url
        assert "limit=25" in url
        assert request_headers["X-Api-Key"] == "personal-fathom-key"
        return {
            "items": [
                {
                    "recording_id": 987654321,
                    "meeting_title": "URL matched governance call",
                    "share_url": "https://fathom.video/share/url-match",
                    "default_summary": {"markdown_formatted": "URL matched summary."},
                    "action_items": [{"description": "Confirm URL match"}],
                },
                {
                    "recording_id": 111,
                    "meeting_title": "Different call",
                    "share_url": "https://fathom.video/share/other",
                },
            ]
        }

    monkeypatch.setattr(IntegrationService, "_json_get", staticmethod(fathom_get))

    connection = client.patch("/api/meeting-capture/fathom/connection", headers=headers, json={"enabled": True, "api_key": "personal-fathom-key"})
    assert connection.status_code == 200

    resolved = client.post("/api/meeting-capture/fathom/resolve", headers=headers, json={"identifier": "https://fathom.video/share/url-match"})
    assert resolved.status_code == 200
    assert resolved.json()["external_id"] == "987654321"
    assert resolved.json()["action_items"] == ["Confirm URL match"]
    assert all("/recordings/" not in url for url in requested_urls)
    assert len(list(db_session.scalars(select(MeetingArtifact)))) == 1


def test_personal_fathom_resolve_reports_missing_key_and_bad_identifier(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)

    missing_key = client.post("/api/meeting-capture/fathom/resolve", headers=headers, json={"identifier": "123456789"})
    assert missing_key.status_code == 400
    assert missing_key.json()["detail"] == "Connect your personal Fathom API key before fetching meeting details."

    connection = client.patch("/api/meeting-capture/fathom/connection", headers=headers, json={"enabled": True, "api_key": "personal-fathom-key"})
    assert connection.status_code == 200

    invalid = client.post("/api/meeting-capture/fathom/resolve", headers=headers, json={"identifier": "not-a-recording-id"})
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["errors"][0]["field"] == "identifier"

    monkeypatch.setattr(IntegrationService, "_json_get", staticmethod(lambda _url, _headers: {"items": []}))
    not_found = client.post("/api/meeting-capture/fathom/resolve", headers=headers, json={"identifier": "https://fathom.video/share/not-found"})
    assert not_found.status_code == 422
    assert not_found.json()["detail"]["errors"][0]["field"] == "identifier"


def test_personal_fireflies_connection_can_disconnect_and_clear_api_key(client: TestClient) -> None:
    headers = auth_headers(client)

    initial = client.get("/api/meeting-capture/fireflies/connection", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["provider"] == "fireflies"
    assert initial.json()["credential_status"]["configured"] is False

    connected = client.patch("/api/meeting-capture/fireflies/connection", headers=headers, json={"enabled": True, "api_key": "personal-fireflies-key"})
    assert connected.status_code == 200
    assert connected.json()["provider"] == "fireflies"
    assert connected.json()["enabled"] is True
    assert connected.json()["credential_status"]["configured"] is True
    assert "personal-fireflies-key" not in connected.text

    disconnected = client.patch("/api/meeting-capture/fireflies/connection", headers=headers, json={"enabled": False, "clear_api_key": True})
    assert disconnected.status_code == 200
    body = disconnected.json()
    assert body["provider"] == "fireflies"
    assert body["enabled"] is False
    assert body["status"] == "configuration_required"
    assert body["credential_status"]["configured"] is False

    resolve = client.post("/api/meeting-capture/fireflies/resolve", headers=headers, json={"identifier": "transcript-123"})
    assert resolve.status_code == 400
    assert resolve.json()["detail"] == "Connect your personal Fireflies API key before fetching meeting details."


def test_personal_fireflies_resolve_fetches_transcript_summary_and_action_items(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    requests: list[dict[str, object]] = []
    fireflies_url = "https://app.fireflies.ai/view/Upskill-Friday-Learning-Session-Managing-the-AI-Intern-6th-Floor-Babar-Block-::01KMMBSYKPMV05EQ0ZXC5EKJKN"

    def fireflies_post(url: str, request_headers: dict[str, str], body: dict) -> dict:
        requests.append({"url": url, "headers": request_headers, "body": body})
        assert url == "https://api.fireflies.ai/graphql"
        assert request_headers["Authorization"] == "Bearer personal-fireflies-key"
        assert "sentences" not in body["query"]
        assert body["variables"]["transcriptId"] == "01KMMBSYKPMV05EQ0ZXC5EKJKN"
        return {
            "data": {
                "transcript": {
                    "id": "01KMMBSYKPMV05EQ0ZXC5EKJKN",
                    "title": "Upskill Friday Learning Session",
                    "transcript_url": fireflies_url,
                    "meeting_link": "https://meet.example.com/governance",
                    "date": "2026-06-03T10:00:00Z",
                    "summary": {
                        "notes": "## **Summary**\n[00:00 - 00:12] **Hassan** introduced the AI Intern framework.\n- (00:15) Reviewed **governance** follow-ups and risks.",
                        "overview": "Fallback overview.",
                        "short_summary": "Fallback short summary.",
                        "action_items": "- **Hassan**\n- [00:20] Develop and share best practices/framework for managing AI as an intern\n- Discussion notes\n- 00:45",
                    },
                }
            }
        }

    monkeypatch.setattr(IntegrationService, "_json_post", staticmethod(fireflies_post))

    connection = client.patch("/api/meeting-capture/fireflies/connection", headers=headers, json={"enabled": True, "api_key": "personal-fireflies-key"})
    assert connection.status_code == 200

    resolved = client.post(
        "/api/meeting-capture/fireflies/resolve",
        headers=headers,
        json={
            "identifier": fireflies_url,
            "account_id": "account-cafe-zupas",
            "linked_object_type": "governance_event",
            "linked_object_id": "gov-fireflies-1",
        },
    )
    assert resolved.status_code == 200
    body = resolved.json()
    assert body["provider"] == "fireflies"
    assert body["external_id"] == "01KMMBSYKPMV05EQ0ZXC5EKJKN"
    assert body["title"] == "Upskill Friday Learning Session"
    assert body["summary"] == "Hassan introduced the AI Intern framework.\nReviewed governance follow-ups and risks."
    assert body["action_items"] == ["Develop and share best practices/framework for managing AI as an intern"]
    assert body["source_link"] == fireflies_url
    assert body["meeting_url"] == "https://meet.example.com/governance"
    assert body["account_id"] == "account-cafe-zupas"
    assert body["linked_object_type"] == "governance_event"
    assert body["linked_object_id"] == "gov-fireflies-1"

    artifact = db_session.scalar(select(MeetingArtifact).where(MeetingArtifact.provider == "fireflies", MeetingArtifact.external_id == "01KMMBSYKPMV05EQ0ZXC5EKJKN"))
    assert artifact is not None
    assert artifact.summary == "Hassan introduced the AI Intern framework.\nReviewed governance follow-ups and risks."
    assert artifact.metadata_json["summary"]["notes"] == artifact.summary
    assert artifact.metadata_json["summary"]["action_items"] == ["Develop and share best practices/framework for managing AI as an intern"]
    assert "sentences" not in json.dumps(artifact.metadata_json).lower()
    assert len(list(db_session.scalars(select(MeetingArtifact).where(MeetingArtifact.provider == "fireflies")))) == 1

    resolved_again = client.post("/api/meeting-capture/fireflies/resolve", headers=headers, json={"identifier": fireflies_url})
    assert resolved_again.status_code == 200
    assert resolved_again.json()["id"] == body["id"]
    assert len(requests) == 1


def test_personal_fireflies_resolve_reports_missing_key_bad_identifier_and_inaccessible_transcript(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)

    missing_key = client.post("/api/meeting-capture/fireflies/resolve", headers=headers, json={"identifier": "transcript-123"})
    assert missing_key.status_code == 400
    assert missing_key.json()["detail"] == "Connect your personal Fireflies API key before fetching meeting details."

    connection = client.patch("/api/meeting-capture/fireflies/connection", headers=headers, json={"enabled": True, "api_key": "personal-fireflies-key"})
    assert connection.status_code == 200

    invalid = client.post("/api/meeting-capture/fireflies/resolve", headers=headers, json={"identifier": "https://app.fireflies.ai/view/"})
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["errors"][0]["field"] == "identifier"

    monkeypatch.setattr(IntegrationService, "_json_post", staticmethod(lambda _url, _headers, _body: {"errors": [{"message": "Transcript not found"}]}))
    not_found = client.post("/api/meeting-capture/fireflies/resolve", headers=headers, json={"identifier": "transcript-404"})
    assert not_found.status_code == 422
    assert not_found.json()["detail"]["errors"][0]["field"] == "identifier"


def test_timeline_ai_search_writes_unified_ai_gateway_run(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    note = client.post(
        "/api/accounts/account-cafe-zupas/timeline-notes",
        headers=headers,
        json={"event_type": "manual_note", "title": "QBR signal review", "description": "Reviewed expansion risk and QBR follow-up actions."},
    )
    assert note.status_code == 201

    search = client.post(
        "/api/accounts/account-cafe-zupas/timeline/ai-search",
        headers=headers,
        json={"query": "QBR follow-up", "scopes": ["timeline"], "limit": 5},
    )
    assert search.status_code == 200
    run = db_session.scalar(select(AiGatewayRun).where(AiGatewayRun.request_type == "timeline_ai_search"))
    assert run is not None
    assert run.account_id == "account-cafe-zupas"
    assert run.permission_scope_json["module"] == "ai_assistance_search"
    assert run.response_labels_json == ["AI-assisted", "Advisory"]


def test_repeated_integration_failures_create_admin_notification(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    configured = client.patch(
        "/api/admin/integrations/fathom",
        headers=headers,
        json={"enabled": True, "credentials_json": {"api_key": "test-fathom-key"}, "settings_json": {"base_url": "https://api.fathom.ai", "recordings_path": "/external/v1/meetings/"}},
    )
    assert configured.status_code == 200

    def failing_fetch(self: IntegrationService, provider: str, connection) -> list[dict]:
        raise RuntimeError("Provider timeout")

    monkeypatch.setattr(IntegrationService, "_fetch_provider_records", failing_fetch)
    for _ in range(3):
        response = client.post("/api/admin/integrations/fathom/sync", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "error"

    runs = client.get("/api/admin/integrations/sync-runs", headers=headers, params={"provider": "fathom", "failure_type": "error"})
    assert runs.status_code == 200
    assert runs.json()["total"] == 3
    assert db_session.scalar(select(IntegrationSyncRun).where(IntegrationSyncRun.provider == "fathom", IntegrationSyncRun.failure_type == "error")) is not None
    assert db_session.scalar(select(NotificationRecord).where(NotificationRecord.trigger == "integration_failure")) is not None
