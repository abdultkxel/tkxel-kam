from collections.abc import Generator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, Engagement, TimelineEntry, TimelineEventTypeConfig, TimelineTombstone, User, utc_now
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


def create_account(db_session: Session, *, owner: User | None = None) -> Account:
    account = Account(name="Timeline Corp", lifecycle_status="Active", segment="Growth", risk_status="warning")
    db_session.add(account)
    db_session.flush()
    if owner:
        db_session.add(
            AccountOwner(
                account_id=account.id,
                user_id=owner.id,
                user_name=owner.full_name,
                user_email=owner.email,
                ownership_role="primary_am",
                is_primary=True,
                is_active=True,
            )
        )
    db_session.commit()
    db_session.refresh(account)
    return account


def create_engagement(db_session: Session, account: Account, owner: User) -> Engagement:
    engagement = Engagement(
        account_id=account.id,
        name="Implementation SOW",
        owner_id=owner.id,
        owner_name=owner.full_name,
        start_date=utc_now(),
        end_date=utc_now() + timedelta(days=90),
    )
    db_session.add(engagement)
    db_session.commit()
    db_session.refresh(engagement)
    return engagement


def seeded_user(db_session: Session, role: str) -> User:
    user = db_session.scalar(select(User).where(User.role == role))
    assert user is not None
    return user


def ensure_manual_note_event_type(db_session: Session) -> None:
    if db_session.scalar(select(TimelineEventTypeConfig).where(TimelineEventTypeConfig.slug == "manual_note")) is not None:
        return
    admin = seeded_user(db_session, "admin")
    db_session.add(
        TimelineEventTypeConfig(
            slug="manual_note",
            name="Manual note",
            category="manual",
            module="manual",
            color_token="surface-border",
            display_order=1,
            default_visibility="public",
            is_active=True,
            is_critical=False,
            created_by_id=admin.id,
            updated_by_id=admin.id,
        )
    )
    db_session.commit()


def test_default_seed_leaves_timeline_event_types_empty(db_session: Session) -> None:
    assert db_session.scalar(select(TimelineEventTypeConfig)) is None


def test_timeline_note_comments_handover_ai_and_exports(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    ensure_manual_note_event_type(db_session)
    account = create_account(db_session)

    create_response = client.post(
        f"/api/accounts/{account.id}/timeline-notes",
        headers=headers,
        json={
            "event_type": "manual_note",
            "title": "Delivery delay review",
            "description": "Delivery delay discussed with client sponsor.",
            "tags": ["delivery", "risk"],
        },
    )
    assert create_response.status_code == 201
    entry = create_response.json()
    assert entry["is_system_generated"] is False

    list_response = client.get(f"/api/accounts/{account.id}/timeline", headers=headers, params={"search": "delivery", "page": 1, "page_size": 10})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["id"] == entry["id"]

    comment_response = client.post(
        f"/api/timeline-events/{entry['id']}/comments",
        headers=headers,
        json={"body": "Follow-up owner confirmed.", "mentions": []},
    )
    assert comment_response.status_code == 201
    comment = comment_response.json()

    comments_response = client.get(f"/api/timeline-events/{entry['id']}/comments", headers=headers)
    assert comments_response.status_code == 200
    assert comments_response.json()["total"] == 1

    update_comment = client.patch(
        f"/api/timeline-events/{entry['id']}/comments/{comment['id']}",
        headers=headers,
        json={"body": "Follow-up owner confirmed for Friday.", "mentions": []},
    )
    assert update_comment.status_code == 200
    assert "Friday" in update_comment.json()["body"]

    delete_comment = client.delete(f"/api/timeline-events/{entry['id']}/comments/{comment['id']}", headers=headers)
    assert delete_comment.status_code == 200

    ai_response = client.post(
        f"/api/accounts/{account.id}/timeline/ai-search",
        headers=headers,
        json={"query": "Show delivery delay risk", "scopes": ["timeline"], "document_search": False, "limit": 5},
    )
    assert ai_response.status_code == 200
    assert ai_response.json()["results"]
    assert ai_response.json()["audit_id"]

    handover_response = client.post(f"/api/accounts/{account.id}/handover-summary", headers=headers, json={"selected_sections": ["account", "recent_timeline"]})
    assert handover_response.status_code == 201
    summary = handover_response.json()
    assert summary["citations"]

    export_response = client.post(f"/api/handover-summaries/{summary['id']}/export", headers=headers)
    assert export_response.status_code == 200
    assert export_response.headers["content-type"] == "application/pdf"
    assert export_response.content.startswith(b"%PDF")
    assert b"xref" in export_response.content
    assert b"%%EOF" in export_response.content

    share_response = client.post(f"/api/handover-summaries/{summary['id']}/share", headers=headers)
    assert share_response.status_code == 200
    assert share_response.json()["internal_share_url"].startswith(f"/accounts/{account.id}")


def test_sensitive_timeline_authorization_and_retention_tombstones(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    ensure_manual_note_event_type(db_session)
    account_manager = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=account_manager)

    sensitive_response = client.post(
        f"/api/accounts/{account.id}/timeline-notes",
        headers=admin_headers,
        json={
            "event_type": "manual_note",
            "title": "Executive commercial risk",
            "description": "Commercial terms require executive handling.",
            "is_sensitive": True,
            "sensitivity_level": "executive",
        },
    )
    assert sensitive_response.status_code == 201
    sensitive_id = sensitive_response.json()["id"]

    am_headers = auth_headers(client, account_manager.email, "User@12345")
    am_timeline = client.get(f"/api/accounts/{account.id}/timeline", headers=am_headers, params={"show_sensitive": True})
    assert am_timeline.status_code == 200
    assert am_timeline.json()["total"] == 0

    entry = db_session.get(TimelineEntry, sensitive_id)
    assert entry is not None
    entry.event_at = utc_now() - timedelta(days=10)
    db_session.commit()

    policy_response = client.post(
        "/api/admin/retention-policies",
        headers=admin_headers,
        json={"name": "Delete old timeline", "action": "delete", "duration_days": 1, "reason_template": "Test retention policy."},
    )
    assert policy_response.status_code == 201
    policy_id = policy_response.json()["id"]

    simulate_response = client.post(f"/api/admin/retention-policies/{policy_id}/simulate", headers=admin_headers, json={"limit": 50})
    assert simulate_response.status_code == 200
    assert simulate_response.json()["matched_count"] >= 1
    assert simulate_response.json()["affected_count"] == 0

    run_response = client.post(f"/api/admin/retention-policies/{policy_id}/run", headers=admin_headers, json={"limit": 50})
    assert run_response.status_code == 200
    assert run_response.json()["affected_count"] >= 1

    db_session.refresh(entry)
    assert entry.status == "deleted"
    assert db_session.scalar(select(TimelineTombstone).where(TimelineTombstone.original_event_id == sensitive_id)) is not None

    hidden_response = client.get(f"/api/accounts/{account.id}/timeline", headers=admin_headers, params={"show_sensitive": True})
    assert hidden_response.status_code == 200
    assert sensitive_id not in {item["id"] for item in hidden_response.json()["items"]}

    actions_response = client.get(
        "/api/admin/retention-actions",
        headers=admin_headers,
        params={"entity_type": "timeline_entry", "action": "delete", "status": "complete", "search": "Test retention"},
    )
    assert actions_response.status_code == 200
    assert actions_response.json()["total"] >= 1


def test_timeline_filters_handover_history_and_owner_validation(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    ensure_manual_note_event_type(db_session)
    account = create_account(db_session)
    account_manager = seeded_user(db_session, "account_manager")

    create_response = client.post(
        f"/api/accounts/{account.id}/timeline-notes",
        headers=headers,
        json={
            "event_type": "manual_note",
            "title": "Governance decision",
            "description": "Governance reviewed account risk.",
            "tags": ["governance"],
        },
    )
    assert create_response.status_code == 201
    entry = create_response.json()
    db_entry = db_session.get(TimelineEntry, entry["id"])
    assert db_entry is not None
    db_entry.source_record_type = "governance_event"
    db_entry.source_record_id = "gov-123"
    db_session.commit()

    filtered = client.get(
        f"/api/accounts/{account.id}/timeline",
        headers=headers,
        params={
            "source_record_type": "governance_event",
            "source_record_id": "gov-123",
            "account_stage": "Active",
            "risk_status": "warning",
        },
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1

    wrong_stage = client.get(f"/api/accounts/{account.id}/timeline", headers=headers, params={"account_stage": "Archived"})
    assert wrong_stage.status_code == 200
    assert wrong_stage.json()["total"] == 0

    unauthorized_owner = client.post(
        f"/api/accounts/{account.id}/timeline-notes",
        headers=headers,
        json={"event_type": "manual_note", "description": "Assign to someone without account access.", "owner_id": account_manager.id},
    )
    assert unauthorized_owner.status_code == 422
    assert unauthorized_owner.json()["detail"]["errors"][0]["field"] == "owner_id"

    first_summary = client.post(
        f"/api/accounts/{account.id}/handover-summary",
        headers=headers,
        json={"selected_sections": ["account", "governance"], "ownership_change_id": "change-1"},
    )
    assert first_summary.status_code == 201

    history = client.get(
        f"/api/accounts/{account.id}/handover-summaries",
        headers=headers,
        params={"search": "governance", "ownership_change_id": "change-1", "page": 1, "page_size": 10},
    )
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["ownership_change_id"] == "change-1"


def test_engagement_timeline_hides_sensitive_entries_for_unauthorized_viewers(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    ensure_manual_note_event_type(db_session)
    account_manager = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=account_manager)
    engagement = create_engagement(db_session, account, account_manager)

    sensitive_response = client.post(
        f"/api/accounts/{account.id}/timeline-notes",
        headers=admin_headers,
        json={
            "event_type": "manual_note",
            "title": "Executive delivery note",
            "description": "Sensitive engagement context.",
            "is_sensitive": True,
            "sensitivity_level": "executive",
        },
    )
    assert sensitive_response.status_code == 201
    entry = db_session.get(TimelineEntry, sensitive_response.json()["id"])
    assert entry is not None
    entry.engagement_id = engagement.id
    db_session.commit()

    am_headers = auth_headers(client, account_manager.email, "User@12345")
    hidden = client.get(f"/api/engagements/{engagement.id}/timeline", headers=am_headers, params={"show_sensitive": True})
    assert hidden.status_code == 200
    assert hidden.json()["total"] == 0

    visible = client.get(f"/api/engagements/{engagement.id}/timeline", headers=admin_headers, params={"show_sensitive": True})
    assert visible.status_code == 200
    assert visible.json()["total"] == 1
    assert visible.json()["items"][0]["is_sensitive"] is True
