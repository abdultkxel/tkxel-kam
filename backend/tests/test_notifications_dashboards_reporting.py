from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, CustomFieldDefinition, NotificationRecord, Signal, SlaEscalatedItem, Task
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


def create_owned_account(db_session: Session, owner: dict, account_id: str = "ndr-account") -> Account:
    account = Account(
        id=account_id,
        name="Notifications Account",
        lifecycle_status="Active",
        segment="Growth",
        region="US",
        risk_status="critical",
        commercial_value=200000,
        currency="USD",
        health_overall=42,
        health_relationship=45,
        health_usage=50,
        health_delivery=38,
        health_commercial=55,
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


def test_notification_preferences_validation_pagination_and_read(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    preferences = client.get("/api/users/me/notification-preferences", headers=headers)
    assert preferences.status_code == 200
    mandatory = next(item for item in preferences.json() if item["mandatory"])

    denied = client.put(
        "/api/users/me/notification-preferences",
        headers=headers,
        json={"items": [{"trigger": mandatory["trigger"], "mode": "off", "digest_cadence": "daily"}]},
    )
    assert denied.status_code == 400

    db_session.add(
        NotificationRecord(
            recipient_user_id=client.get("/api/auth/me", headers=headers).json()["id"],
            recipient_name="Admin",
            recipient_email="admin@tkxel.com",
            trigger="new_signal",
            title="Signal needs review",
            body="A critical signal is waiting.",
            priority="critical",
            delivery_status="delivered",
            deduplication_key="test-notification-read",
        )
    )
    db_session.commit()

    listed = client.get("/api/notifications", headers=headers, params={"search": "signal", "read_state": "unread", "page": 1, "page_size": 1})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    notification_id = listed.json()["items"][0]["id"]

    read = client.patch(f"/api/notifications/{notification_id}/read", headers=headers)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None


def test_sla_evaluation_creates_deduplicated_escalation_notification(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account = create_owned_account(db_session, owner, "sla-account")
    old = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add(
        Signal(
            account_id=account.id,
            signal_type="weak_metric",
            severity="critical",
            status="new",
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            title="Critical relationship health drop",
            detail="Relationship health dropped below threshold.",
            due_at=old,
            updated_at=old,
            created_at=old,
        )
    )
    db_session.commit()

    first = client.post("/api/sla/jobs/evaluate", headers=admin_headers)
    assert first.status_code == 200
    assert first.json()["escalated_items"] >= 1
    assert first.json()["notifications_created"] >= 1

    second = client.post("/api/sla/jobs/evaluate", headers=admin_headers)
    assert second.status_code == 200
    assert second.json()["duplicate_notifications"] >= 1

    escalated = client.get("/api/escalated-items", headers=admin_headers, params={"item_type": "signal", "page": 1, "page_size": 5})
    assert escalated.status_code == 200
    assert escalated.json()["total"] >= 1


def test_dashboard_digest_and_report_workflows(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    create_owned_account(db_session, owner, "dashboard-report-account")

    current_dashboard = client.get("/api/dashboards/me", headers=admin_headers)
    assert current_dashboard.status_code == 200
    assert current_dashboard.json()["dashboard"] == "kam_head_portfolio"
    assert current_dashboard.json()["role_group"] == "admin"

    dashboard = client.get("/api/dashboards/am-home", headers=admin_headers)
    assert dashboard.status_code == 200
    widget_keys = {item["key"] for item in dashboard.json()["widgets"]}
    assert "ai_task_summary" in widget_keys

    refresh = client.post("/api/dashboards/am-home/task-summary/refresh", headers=admin_headers)
    assert refresh.status_code == 200
    assert refresh.json()["widget"]["key"] == "ai_task_summary"

    digest = client.post("/api/digests/preview", headers=admin_headers, json={"sections": ["strategic_risks", "major_escalations"], "filters": {}})
    assert digest.status_code == 200
    assert digest.json()["status"] == "preview"

    fields = client.get("/api/reports/fields", headers=admin_headers, params={"data_source": "accounts"})
    assert fields.status_code == 200
    assert any(item["field"] == "name" for item in fields.json()["fields"])

    preview = client.post(
        "/api/reports/preview",
        headers=admin_headers,
        json={"data_source": "accounts", "fields": ["name", "risk_status", "health_overall"], "filters": {"search": "Notifications"}, "page": 1, "page_size": 5},
    )
    assert preview.status_code == 200
    assert preview.json()["total"] >= 1

    report = client.post(
        "/api/reports",
        headers=admin_headers,
        json={"name": "Account risk report", "visibility": "private", "data_source": "accounts", "fields": ["name", "risk_status"], "filters": {}, "grouping": [], "layout": {"type": "table"}, "export_format": "csv"},
    )
    assert report.status_code == 201

    exported = client.post(f"/api/reports/{report.json()['id']}/export", headers=admin_headers, json={"export_format": "csv"})
    assert exported.status_code == 200
    assert exported.json()["content_json"]["format"] == "csv"


def test_role_based_dashboard_profiles_and_reduced_direct_endpoints(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    create_owned_account(db_session, owner, "role-dashboard-account")

    owner_headers = auth_headers(client, owner["email"], "User@12345")
    am_dashboard = client.get("/api/dashboards/me", headers=owner_headers)
    assert am_dashboard.status_code == 200
    assert am_dashboard.json()["dashboard"] == "am_home"
    assert am_dashboard.json()["role_group"] == "account_manager"
    assert "leadership" not in {item["key"] for item in am_dashboard.json()["widgets"]}
    assert "ai_task_summary" in {item["key"] for item in am_dashboard.json()["widgets"]}

    kam_head = seeded_user(client, admin_headers, "kam_head")
    kam_headers = auth_headers(client, kam_head["email"], "User@12345")
    kam_dashboard = client.get("/api/dashboards/me", headers=kam_headers)
    assert kam_dashboard.status_code == 200
    assert kam_dashboard.json()["dashboard"] == "kam_head_portfolio"
    assert kam_dashboard.json()["role_group"] == "kam_head"

    reduced = client.get("/api/dashboards/leadership", headers=kam_headers)
    assert reduced.status_code == 200
    assert reduced.json()["dashboard"] == "kam_head_portfolio"
    assert reduced.json()["metadata"]["requested_dashboard"] == "leadership"
    assert reduced.json()["metadata"]["reduced_scope"] is True

    leader = seeded_user(client, admin_headers, "leadership_viewer")
    leader_headers = auth_headers(client, leader["email"], "User@12345")
    leader_dashboard = client.get("/api/dashboards/me", headers=leader_headers)
    assert leader_dashboard.status_code == 200
    assert leader_dashboard.json()["dashboard"] == "leadership"
    assert leader_dashboard.json()["read_only"] is True
    forecast = next(item for item in leader_dashboard.json()["widgets"] if item["key"] == "forecast_chart")
    assert forecast["value"]["pipeline_value"] == "Restricted"


def test_delivery_lead_dashboard_and_system_role_protection(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    delivery = seeded_user(client, admin_headers, "delivery_lead")
    account = create_owned_account(db_session, owner, "delivery-dashboard-account")
    db_session.add(
        AccountOwner(
            account_id=account.id,
            user_id=delivery["id"],
            user_name=delivery["full_name"],
            user_email=delivery["email"],
            ownership_role="ops_lead",
            is_primary=False,
            is_active=True,
            rationale="Delivery lead assignment.",
            created_by_id=owner["id"],
        )
    )
    db_session.add(
        Task(
            account_id=account.id,
            title="Resolve delivery blocker",
            owner_id=delivery["id"],
            owner_name=delivery["full_name"],
            due_at=datetime.now(timezone.utc) + timedelta(days=1),
            status="open",
            priority="critical",
            created_by_id=owner["id"],
        )
    )
    db_session.commit()

    delivery_headers = auth_headers(client, delivery["email"], "User@12345")
    dashboard = client.get("/api/dashboards/me", headers=delivery_headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["dashboard"] == "delivery"
    assert body["role_group"] == "delivery_lead"
    assert {"tasks", "signals", "escalations", "governance"}.issubset({item["key"] for item in body["widgets"]})

    protected = client.delete("/api/admin/roles/delivery_lead", headers=admin_headers)
    assert protected.status_code == 400
    assert protected.json()["detail"] == "System roles cannot be deleted"


def test_account_manager_cannot_configure_sla_rules(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    response = client.get("/api/admin/sla-rules", headers=owner_headers)
    assert response.status_code == 403


def test_notification_sources_and_escalated_items_are_redacted_after_access_loss(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account = create_owned_account(db_session, owner, "restricted-notification-account")
    db_session.add(
        NotificationRecord(
            recipient_user_id=owner["id"],
            recipient_name=owner["full_name"],
            recipient_email=owner["email"],
            trigger="new_signal",
            title="Restricted account signal",
            body="A restricted account has an update.",
            account_id=account.id,
            account_name_snapshot=account.name,
            source_record_type="signal",
            source_record_id="hidden-source-id",
            source_record_route=f"/accounts/{account.id}",
            priority="high",
            delivery_status="delivered",
            deduplication_key="restricted-notification-source",
        )
    )
    db_session.add(
        SlaEscalatedItem(
            source_type="signal",
            source_record_id="hidden-source-id",
            account_id=account.id,
            title="Hidden escalated signal",
            severity="critical",
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            recipient_user_id=owner["id"],
            recipient_name=owner["full_name"],
            sla_window_key="test-window",
            deduplication_key="hidden-escalated-signal",
        )
    )
    for assignment in account.owners:
        assignment.is_active = False
    db_session.commit()

    owner_headers = auth_headers(client, owner["email"], "User@12345")
    notifications = client.get("/api/notifications", headers=owner_headers, params={"search": "Restricted account signal"})
    assert notifications.status_code == 200
    item = notifications.json()["items"][0]
    assert item["title"] == "Restricted notification source"
    assert item["source_record_route"] is None
    assert item["account_name_snapshot"] is None

    escalated = client.get("/api/escalated-items", headers=owner_headers, params={"account_id": account.id})
    assert escalated.status_code == 200
    assert escalated.json()["total"] == 0


def test_digest_visibility_and_recipient_authorization(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    commercial = seeded_user(client, admin_headers, "commercial_stakeholder")
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    digest = client.post("/api/digests/preview", headers=admin_headers, json={"sections": ["strategic_risks"], "filters": {}})
    assert digest.status_code == 200
    digest_id = digest.json()["id"]

    hidden = client.get(f"/api/digests/{digest_id}", headers=owner_headers)
    assert hidden.status_code == 403
    history = client.get("/api/digests", headers=owner_headers)
    assert history.status_code == 200
    assert digest_id not in {item["id"] for item in history.json()["items"]}

    unauthorized_schedule = client.post(
        "/api/digests/schedules",
        headers=admin_headers,
        json={"name": "Unauthorized digest", "cadence": "weekly", "timezone": "UTC", "recipient_user_ids": [commercial["id"]], "sections": ["strategic_risks"], "delivery_channels": ["in_app"]},
    )
    assert unauthorized_schedule.status_code == 400
    assert "authorized" in unauthorized_schedule.text


def test_report_security_validation_and_field_builder_sensitivity(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")

    db_session.add(
        CustomFieldDefinition(
            module="account_overview",
            field_key="private_margin",
            label="Private Margin",
            field_type="text",
            is_sensitive=True,
            is_active=True,
        )
    )
    db_session.add(
        CustomFieldDefinition(
            module="account_overview",
            field_key="public_tier",
            label="Public Tier",
            field_type="text",
            is_sensitive=False,
            is_active=True,
        )
    )
    db_session.commit()

    fields = client.get("/api/reports/fields", headers=admin_headers, params={"data_source": "accounts"})
    assert fields.status_code == 200
    field_keys = {item["field"] for item in fields.json()["fields"]}
    assert "custom:public_tier" in field_keys
    assert "custom:private_margin" not in field_keys

    invalid_pdf = client.post(
        "/api/reports",
        headers=admin_headers,
        json={"name": "PDF without layout", "visibility": "private", "data_source": "accounts", "fields": ["name"], "filters": {}, "grouping": [], "layout": {}, "export_format": "pdf"},
    )
    assert invalid_pdf.status_code == 400

    private_report = client.post(
        "/api/reports",
        headers=admin_headers,
        json={"name": "Private schedule report", "visibility": "private", "data_source": "accounts", "fields": ["name"], "filters": {}, "grouping": [], "layout": {"type": "table"}, "export_format": "csv"},
    )
    assert private_report.status_code == 201

    unauthorized_schedule = client.post(
        f"/api/reports/{private_report.json()['id']}/schedules",
        headers=admin_headers,
        json={"cadence": "weekly", "timezone": "UTC", "recipient_user_ids": [owner["id"]], "delivery_channels": ["in_app"]},
    )
    assert unauthorized_schedule.status_code == 400
    assert "authorized" in unauthorized_schedule.text

    shared_report = client.post(
        "/api/reports",
        headers=admin_headers,
        json={"name": "Shared schedule report", "visibility": "shared", "data_source": "accounts", "fields": ["name"], "filters": {}, "grouping": [], "layout": {"type": "table"}, "export_format": "csv"},
    )
    assert shared_report.status_code == 201
    schedule = client.post(
        f"/api/reports/{shared_report.json()['id']}/schedules",
        headers=admin_headers,
        json={"cadence": "weekly", "timezone": "UTC", "recipient_user_ids": [owner["id"]], "delivery_channels": ["in_app"]},
    )
    assert schedule.status_code == 201
    run = client.post(f"/api/reports/schedules/{schedule.json()['id']}/run", headers=admin_headers)
    assert run.status_code == 200
    assert run.json()["recipients_json"] == [owner["id"]]
    assert run.json()["generated_by_id"] == owner["id"]
