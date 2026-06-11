from collections.abc import Generator
import io
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AuditLog, GovernanceEvent, IntegrationSyncLog, MeetingArtifact, Task, TimelineEntry, User
from app.services.integrations import IntegrationService
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


def draft_payload(account_name: str, owner_id: str) -> dict:
    return {
        "account_name": account_name,
        "project_name": "Governance modernization",
        "company_url": "https://governance.example.com",
        "lifecycle_status": "Active",
        "segment": "Strategic",
        "region": "Global",
        "commercial_value": 250000,
        "currency": "USD",
        "primary_owner_id": owner_id,
        "source_citation": "Project Charter p1: account and governance scope.",
        "source_documents": [
            {
                "title": "Governance Project Charter",
                "source_type": "project_charter",
                "file_name": "governance-charter.pdf",
                "confidence": 91,
                "pages": 4,
                "citations": [
                    {
                        "label": "Project Charter p1",
                        "page_number": 1,
                        "excerpt": "Executive governance cadence and delivery focus.",
                        "field_key": "account_name",
                    }
                ],
            }
        ],
        "engagement_drafts": [
            {
                "name": "Governance modernization",
                "owner_id": owner_id,
                "service_lines": ["Engineering", "Customer Success"],
                "value": 250000,
                "currency": "USD",
                "delivery_status": "active",
                "confidence": 88,
                "start_date": "2026-05-01T00:00:00Z",
                "end_date": "2026-12-15T00:00:00Z",
                "renewal_date": "2026-12-15T00:00:00Z",
                "notice_deadline": "2026-11-15T00:00:00Z",
                "notice_period_days": 30,
                "source_citation": "SOW p2: renewal and delivery terms.",
            }
        ],
    }


def create_approved_account(client: TestClient, headers: dict[str, str], account_name: str = "Governance Workspace") -> tuple[str, str, str]:
    owner = seeded_user(client, headers, "account_manager")
    draft_response = client.post("/api/onboarding/drafts", headers=headers, json=draft_payload(account_name, owner["id"]))
    assert draft_response.status_code == 201

    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    account_id = approve_response.json()["approved_account_id"]

    engagement_response = client.get(f"/api/accounts/{account_id}/engagements", headers=headers)
    assert engagement_response.status_code == 200
    engagement_id = engagement_response.json()["items"][0]["id"]
    return account_id, engagement_id, owner["id"]


def governance_payload(account_id: str, engagement_id: str | None, owner_id: str, **overrides: object) -> dict:
    payload = {
        "account_id": account_id,
        "engagement_id": engagement_id,
        "governance_type": "QBR",
        "scheduled_at": "2026-06-15T10:00:00Z",
        "agenda": "Review roadmap alignment, delivery health, and expansion actions.",
        "owner_id": owner_id,
        "attendee_emails": ["client.lead@example.com", "Sponsor@Example.com"],
    }
    payload.update(overrides)
    return payload


def test_governance_event_create_list_calendar_and_validation(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers)

    duplicate_attendees = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(account_id, engagement_id, owner_id, attendee_emails=["owner@example.com", "OWNER@example.com"]),
    )
    assert duplicate_attendees.status_code == 422
    assert duplicate_attendees.json()["errors"][0]["field"] == "attendee_emails"

    create_response = client.post("/api/governance-events", headers=headers, json=governance_payload(account_id, engagement_id, owner_id))
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["account_id"] == account_id
    assert created["account_name"] == "Governance Workspace"
    assert created["status"] == "upcoming"
    assert created["attendee_emails"] == ["client.lead@example.com", "sponsor@example.com"]
    reminder_task = db_session.query(Task).filter_by(source_type="governance_event", source_record_id=created["id"]).one()
    assert reminder_task.owner_id == owner_id
    assert reminder_task.due_at.isoformat().startswith("2026-06-15T10:00:00")
    assert reminder_task.title == "QBR: Governance Workspace"

    duplicate_event = client.post("/api/governance-events", headers=headers, json=governance_payload(account_id, engagement_id, owner_id))
    assert duplicate_event.status_code == 409
    assert duplicate_event.json()["detail"] == "A governance event already exists for this account, governance type, and scheduled time."

    account_response = client.get(f"/api/accounts/{account_id}", headers=headers)
    assert account_response.status_code == 200
    assert account_response.json()["next_governance_at"].startswith("2026-06-15T10:00:00")

    list_response = client.get(
        "/api/governance-events",
        headers=headers,
        params={
            "account_id": account_id,
            "attendee": "sponsor@example.com",
            "search": "roadmap",
            "sort": "event_date",
            "direction": "asc",
            "page": 1,
            "page_size": 5,
        },
    )
    assert list_response.status_code == 200
    page = list_response.json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == created["id"]

    calendar_response = client.get(
        "/api/governance-events/calendar",
        headers=headers,
        params={"date_from": "2026-06-01T00:00:00Z", "date_to": "2026-06-30T23:59:59Z"},
    )
    assert calendar_response.status_code == 200
    calendar_item = calendar_response.json()["items"][0]
    assert calendar_item["kind"] == "governance"
    assert calendar_item["source_record_id"] == created["id"]
    assert calendar_item["route"] == f"/accounts/{account_id}?tab=governance"


def test_governance_create_pushes_owner_calendar_without_google_attendees(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Calendar Mirror Workspace")
    owner = db_session.get(User, owner_id)
    assert owner is not None
    captured: dict[str, object] = {}

    def fake_json_post(url: str, request_headers: dict[str, str], body: dict) -> dict:
        captured["url"] = url
        captured["headers"] = request_headers
        captured["body"] = body
        return {"id": "google-event-123"}

    monkeypatch.setattr(IntegrationService, "_json_post", staticmethod(fake_json_post))
    configured = client.patch(
        "/api/admin/integrations/google-calendar",
        headers=headers,
        json={
            "enabled": True,
            "credentials_json": {"access_token": "test-token"},
            "settings_json": {"shared_governance_calendar_id": "governance-calendar@group.calendar.google.com"},
        },
    )
    assert configured.status_code == 200

    create_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(
            account_id,
            engagement_id,
            owner_id,
            attendee_emails=["Client.Lead@Example.com", "Sponsor@Example.com"],
        ),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["external_provider"] == "google_calendar"
    assert created["external_event_id"] == "google-event-123"
    assert owner.primary_google_calendar_id
    assert str(owner.primary_google_calendar_id).replace("@", "%40") in str(captured["url"])
    assert "attendees" not in captured["body"]


def test_governance_update_patches_google_calendar_event(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Calendar Patch Workspace")
    captured: dict[str, object] = {}

    def fake_json_post(url: str, request_headers: dict[str, str], body: dict) -> dict:
        return {"id": "google-event-456"}

    def fake_json_patch(url: str, request_headers: dict[str, str], body: dict) -> dict:
        captured["url"] = url
        captured["headers"] = request_headers
        captured["body"] = body
        return {"id": "google-event-456"}

    monkeypatch.setattr(IntegrationService, "_json_post", staticmethod(fake_json_post))
    monkeypatch.setattr(IntegrationService, "_json_patch", staticmethod(fake_json_patch))
    configured = client.patch(
        "/api/admin/integrations/google-calendar",
        headers=headers,
        json={"enabled": True, "credentials_json": {"access_token": "test-token"}},
    )
    assert configured.status_code == 200

    create_response = client.post("/api/governance-events", headers=headers, json=governance_payload(account_id, engagement_id, owner_id))
    assert create_response.status_code == 201
    event_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/governance-events/{event_id}",
        headers=headers,
        json={"governance_type": "SteerCo", "scheduled_at": "2026-06-18T12:00:00Z", "attendee_emails": ["client@example.com"]},
    )

    assert update_response.status_code == 200
    assert "google-event-456" in str(captured["url"])
    assert captured["body"]["summary"] == "SteerCo: Calendar Patch Workspace"
    assert captured["body"]["start"]["dateTime"].startswith("2026-06-18T12:00:00")
    assert "attendees" not in captured["body"]


def test_governance_calendar_mirror_error_logs_target_calendar(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Calendar Error Workspace")

    def failed_json_post(url: str, request_headers: dict[str, str], body: dict) -> dict:
        raise ValueError("External API returned 404: Not Found (reason: notFound)")

    monkeypatch.setattr(IntegrationService, "_json_post", staticmethod(failed_json_post))
    configured = client.patch(
        "/api/admin/integrations/google-calendar",
        headers=headers,
        json={
            "enabled": True,
            "credentials_json": {"access_token": "test-token"},
            "settings_json": {"shared_governance_calendar_id": "missing-calendar@example.com"},
        },
    )
    assert configured.status_code == 200

    create_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(
            account_id,
            engagement_id,
            owner_id,
            scheduled_at="2026-06-16T10:00:00Z",
        ),
    )

    assert create_response.status_code == 201
    sync_log = db_session.query(IntegrationSyncLog).filter_by(provider="google_calendar", action="outbound_write", status="error").one()
    assert "while writing to Google Calendar ID" in sync_log.message
    owner = db_session.get(User, owner_id)
    assert owner is not None
    assert sync_log.payload == {"calendar_id": owner.primary_google_calendar_id}


def test_google_calendar_http_error_message_includes_provider_reason() -> None:
    body = (
        b'{"error":{"code":403,"message":"The caller does not have permission",'
        b'"status":"PERMISSION_DENIED","errors":[{"reason":"forbidden"}]}}'
    )
    error = HTTPError(
        url="https://www.googleapis.com/calendar/v3/calendars/test/events",
        code=403,
        msg="Forbidden",
        hdrs={},
        fp=io.BytesIO(body),
    )

    assert (
        IntegrationService._external_api_error_message(error)
        == "External API returned 403: PERMISSION_DENIED - The caller does not have permission (reason: forbidden)"
    )


def test_governance_update_cancel_and_sort_flow(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Sortable Governance Workspace")

    first_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(account_id, engagement_id, owner_id, scheduled_at="2026-06-10T10:00:00Z"),
    )
    assert first_response.status_code == 201
    first_id = first_response.json()["id"]

    second_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(
            account_id,
            engagement_id,
            owner_id,
            governance_type="Executive Review",
            scheduled_at="2026-06-20T10:00:00Z",
            agenda="Review sponsor reset, delivery risks, and executive decisions.",
        ),
    )
    assert second_response.status_code == 201
    second_id = second_response.json()["id"]

    update_response = client.patch(
        f"/api/governance-events/{first_id}",
        headers=headers,
        json={
            "governance_type": "SteerCo",
            "scheduled_at": "2026-06-12T11:00:00Z",
            "agenda": "Updated SteerCo agenda for delivery governance.",
            "attendee_emails": ["delivery.lead@example.com"],
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["governance_type"] == "SteerCo"
    assert updated["scheduled_at"].startswith("2026-06-12T11:00:00")
    assert updated["attendee_emails"] == ["delivery.lead@example.com"]
    db_event = db_session.get(GovernanceEvent, first_id)
    assert db_event is not None
    assert db_event.deduplication_key == f"manual:{account_id}:SteerCo:2026-06-12T11:00:00+00:00"
    reminder_task = db_session.query(Task).filter_by(source_type="governance_event", source_record_id=first_id).one()
    assert reminder_task.title == "SteerCo: Sortable Governance Workspace"
    assert reminder_task.due_at.isoformat().startswith("2026-06-12T11:00:00")
    assert reminder_task.status == "open"

    sorted_response = client.get(
        "/api/governance-events",
        headers=headers,
        params={"account_id": account_id, "sort": "event_date", "direction": "desc", "page_size": 10},
    )
    assert sorted_response.status_code == 200
    sorted_ids = [item["id"] for item in sorted_response.json()["items"]]
    assert sorted_ids[:2] == [second_id, first_id]

    cancel_response = client.patch(f"/api/governance-events/{first_id}", headers=headers, json={"status": "cancelled"})
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    db_session.refresh(reminder_task)
    assert reminder_task.status == "cancelled"
    assert reminder_task.skipped_reason == "Governance event was cancelled."


def test_governance_delete_removes_event_and_cancels_linked_tasks(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Deleted Governance Workspace")

    create_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(account_id, engagement_id, owner_id, scheduled_at="2026-06-25T10:00:00Z"),
    )
    assert create_response.status_code == 201
    event_id = create_response.json()["id"]

    complete_response = client.post(
        f"/api/governance-events/{event_id}/complete",
        headers=headers,
        json={
            "notes": "Reviewed risks before deleting the duplicate governance record.",
            "action_items": [{"title": "Close duplicate follow-up", "owner_email": "owner@example.com", "due_date": "2026-06-28T17:00:00Z"}],
        },
    )
    assert complete_response.status_code == 200
    action_item_id = complete_response.json()["action_items"][0]["id"]
    reminder_task = db_session.query(Task).filter_by(source_type="governance_event", source_record_id=event_id).one()
    action_task = db_session.query(Task).filter_by(source_type="governance_action_item", source_record_id=action_item_id).one()

    delete_response = client.delete(f"/api/governance-events/{event_id}", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Governance event deleted successfully"

    assert client.get(f"/api/governance-events/{event_id}", headers=headers).status_code == 404
    list_response = client.get("/api/governance-events", headers=headers, params={"account_id": account_id})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 0
    assert db_session.get(GovernanceEvent, event_id) is None

    db_session.refresh(reminder_task)
    db_session.refresh(action_task)
    assert reminder_task.status == "cancelled"
    assert reminder_task.skipped_reason == "Governance event was deleted."
    assert action_task.status == "cancelled"
    assert action_task.skipped_reason == "Governance event was deleted."
    assert db_session.query(AuditLog).filter_by(entity_id=event_id, module="governance_reviews", action="delete").count() == 1


def test_governance_completion_audit_timeline_overdue_and_openapi(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Overdue Governance Workspace")

    create_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(
            account_id,
            engagement_id,
            owner_id,
            governance_type="Monthly Review",
            scheduled_at="2026-05-01T10:00:00Z",
        ),
    )
    assert create_response.status_code == 201
    event_id = create_response.json()["id"]

    read_response = client.get(f"/api/governance-events/{event_id}", headers=headers)
    assert read_response.status_code == 200
    assert read_response.json()["status"] == "overdue"

    no_notes = client.post(f"/api/governance-events/{event_id}/complete", headers=headers, json={"notes": "   "})
    assert no_notes.status_code == 422
    assert no_notes.json()["errors"][0]["field"] == "notes"

    missing_action_owner = client.post(
        f"/api/governance-events/{event_id}/complete",
        headers=headers,
        json={
            "notes": "Reviewed delivery risks and agreed on next checkpoints.",
            "action_items": [{"title": "Send revised adoption dashboard", "due_date": "2026-06-01T00:00:00Z"}],
        },
    )
    assert missing_action_owner.status_code == 422
    assert missing_action_owner.json()["errors"][0]["field"].startswith("action_items")

    complete_response = client.post(
        f"/api/governance-events/{event_id}/complete",
        headers=headers,
        json={
            "notes": "Reviewed delivery risks and agreed on next checkpoints.",
            "decisions": [{"decision_text": "Keep roadmap milestone date unchanged."}],
            "action_items": [{"title": "Send revised adoption dashboard", "owner_email": "owner@example.com", "due_date": "2026-06-01T00:00:00Z"}],
        },
    )
    assert complete_response.status_code == 200
    completed = complete_response.json()
    assert completed["status"] == "completed"
    assert completed["notes"][0]["body"] == "Reviewed delivery risks and agreed on next checkpoints."
    assert completed["action_items"][0]["status"] == "open"
    assert completed["action_items"][0]["owner_name"] == "owner@example.com"
    assert completed["action_items"][0]["owner_email"] == "owner@example.com"

    timeline_count = db_session.query(TimelineEntry).filter(TimelineEntry.source_record_id == event_id, TimelineEntry.module == "governance").count()
    decision_timeline_count = db_session.query(TimelineEntry).filter(TimelineEntry.source_record_type == "governance_decision", TimelineEntry.module == "governance").count()
    audit_count = db_session.query(AuditLog).filter(AuditLog.entity_id == event_id, AuditLog.module == "governance_reviews").count()
    assert timeline_count >= 2
    assert decision_timeline_count == 1
    assert audit_count >= 2

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert paths["/api/governance-events"]["post"]["summary"] == "Create governance event"
    assert paths["/api/governance-events/{event_id}"]["delete"]["summary"] == "Delete governance event"
    assert paths["/api/governance-events/{event_id}/complete"]["post"]["summary"] == "Complete governance event"
    assert paths["/api/governance-events/{event_id}/ai-brief"]["post"]["summary"] == "Generate governance brief"


def test_governance_completion_uses_meeting_capture_and_creates_action_task(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Meeting Capture Governance")
    created = client.post("/api/governance-events", headers=headers, json=governance_payload(account_id, engagement_id, owner_id))
    assert created.status_code == 201
    event = created.json()

    meeting = client.post(
        "/api/meeting-capture/meetings",
        headers=headers,
        json={
            "title": "Executive QBR recording",
            "meeting_url": "https://fathom.video/share/capture-1",
            "summary": "Reviewed rollout health and confirmed executive follow-up.",
            "action_items": ["Share the recovery plan"],
            "account_id": account_id,
        },
    )
    assert meeting.status_code == 201

    completed = client.post(
        f"/api/governance-events/{event['id']}/complete",
        headers=headers,
        json={
            "meeting_artifact_id": meeting.json()["id"],
            "notes": "Reviewed rollout health and confirmed executive follow-up.",
            "decisions": [{"decision_text": "Keep weekly recovery cadence."}],
            "action_items": [
                {
                    "title": "Share the recovery plan",
                    "owner_id": owner_id,
                    "due_date": "2026-06-22T17:00:00Z",
                    "create_task": True,
                }
            ],
        },
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    artifact = db_session.get(MeetingArtifact, meeting.json()["id"])
    assert artifact is not None
    assert artifact.status == "attached"
    assert artifact.linked_object_type == "governance_event"
    assert artifact.linked_object_id == event["id"]

    action_task = db_session.query(Task).filter_by(source_type="governance_action_item").one()
    assert action_task.owner_id == owner_id
    assert action_task.title == "Share the recovery plan"
    assert action_task.due_at.isoformat().startswith("2026-06-22T17:00:00")


def test_governance_completion_accepts_fireflies_meeting_artifact(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Fireflies Governance")
    created = client.post("/api/governance-events", headers=headers, json=governance_payload(account_id, engagement_id, owner_id))
    assert created.status_code == 201
    event = created.json()

    meeting = client.post(
        "/api/meeting-capture/meetings",
        headers=headers,
        json={
            "provider": "fireflies",
            "title": "Fireflies SteerCo transcript",
            "meeting_url": "https://meet.example.com/fireflies-governance",
            "summary": "Fireflies summary reviewed with governance owners.",
            "action_items": ["Send Fireflies action register"],
            "account_id": account_id,
        },
    )
    assert meeting.status_code == 201
    assert meeting.json()["provider"] == "fireflies"

    completed = client.post(
        f"/api/governance-events/{event['id']}/complete",
        headers=headers,
        json={
            "meeting_artifact_id": meeting.json()["id"],
            "notes": "Fireflies summary reviewed with governance owners.",
            "action_items": [{"title": "Send Fireflies action register", "owner_id": owner_id, "due_date": "2026-06-22T17:00:00Z"}],
        },
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    artifact = db_session.get(MeetingArtifact, meeting.json()["id"])
    assert artifact is not None
    assert artifact.provider == "fireflies"
    assert artifact.status == "attached"
    assert artifact.linked_object_type == "governance_event"
    assert artifact.linked_object_id == event["id"]


def test_governance_deterministic_agenda_brief_and_read_only_permissions(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, engagement_id, owner_id = create_approved_account(client, headers, "Brief Governance Workspace")

    create_response = client.post(
        "/api/governance-events",
        headers=headers,
        json=governance_payload(account_id, engagement_id, owner_id, governance_type="Executive Review"),
    )
    assert create_response.status_code == 201
    event_id = create_response.json()["id"]

    agenda_response = client.post(f"/api/governance-events/{event_id}/agenda-draft", headers=headers, json={"source_modules": ["account", "engagements", "timeline"]})
    assert agenda_response.status_code == 200
    agenda = agenda_response.json()
    assert agenda["output_type"] == "agenda_draft"
    assert agenda["generation_method"] == "deterministic"
    assert "Account health and risk review" in agenda["content"]
    assert agenda["citations"]

    update_agenda = client.patch(
        f"/api/governance-events/{event_id}/agenda",
        headers=headers,
        json={"agenda": "Edited agenda accepted by the KAM.", "source_output_id": agenda["id"]},
    )
    assert update_agenda.status_code == 200
    assert update_agenda.json()["agenda"] == "Edited agenda accepted by the KAM."

    brief_response = client.post(f"/api/governance-events/{event_id}/ai-brief", headers=headers, json={"source_modules": ["account", "engagements", "governance"]})
    assert brief_response.status_code == 200
    brief = brief_response.json()
    assert brief["output_type"] == "governance_brief"
    assert brief["generation_method"] == "deterministic"
    assert "Health snapshot" in brief["content"]
    assert "advisory" in brief["disclaimer"].lower()

    leadership_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
    read_response = client.get(f"/api/governance-events/{event_id}", headers=leadership_headers)
    assert read_response.status_code == 200
    forbidden = client.patch(
        f"/api/governance-events/{event_id}",
        headers=leadership_headers,
        json={"agenda": "Leadership should not edit."},
    )
    assert forbidden.status_code == 403
