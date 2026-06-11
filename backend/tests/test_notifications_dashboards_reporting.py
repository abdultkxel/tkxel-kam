from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountChangeAlert, AccountOwner, CustomFieldDefinition, Engagement, GovernanceEvent, NotificationRecord, Signal, SlaEscalatedItem, Task
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


def create_account_change_alert(db_session: Session, account: Account, owner: dict) -> AccountChangeAlert:
    alert = AccountChangeAlert(
        account_id=account.id,
        alert_type="health",
        reason_code="health_drop",
        affected_metric="health_overall",
        previous_value_json={"value": 72},
        new_value_json={"value": account.health_overall},
        change_magnitude=30,
        severity="critical",
        status="open",
        owner_id=owner["id"],
        owner_name=owner["full_name"],
        recommended_action="Review account recovery plan.",
        source_evidence_json=[{"label": "Health score", "value": account.health_overall}],
        deduplication_key=f"dashboard-alert-{account.id}",
        created_by_id=owner["id"],
    )
    db_session.add(alert)
    db_session.commit()
    return alert


def create_engagement_health_item(db_session: Session, account: Account, owner: dict, *, ops_lead: dict | None = None) -> Engagement:
    now = datetime.now(timezone.utc)
    engagement = Engagement(
        account_id=account.id,
        name="Delivery Recovery SOW",
        owner_id=owner["id"],
        owner_name=owner["full_name"],
        ops_lead_id=ops_lead["id"] if ops_lead else None,
        ops_lead_name=ops_lead["full_name"] if ops_lead else None,
        service_lines=["Engineering"],
        value=150000,
        currency="USD",
        delivery_health=48,
        health_status="critical",
        renewal_risk="high",
        start_date=now - timedelta(days=90),
        end_date=now + timedelta(days=120),
        renewal_date=now + timedelta(days=60),
        created_by_id=owner["id"],
    )
    db_session.add(engagement)
    db_session.commit()
    return engagement


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
    admin_user = client.get("/api/auth/me", headers=admin_headers).json()
    account = create_owned_account(db_session, owner, "dashboard-report-account")
    db_session.add(
        NotificationRecord(
            recipient_user_id=admin_user["id"],
            recipient_name=admin_user["full_name"],
            recipient_email=admin_user["email"],
            trigger="admin_system_alert",
            title="Dashboard delivery failed",
            body="The dashboard alert notification failed.",
            account_id=account.id,
            account_name_snapshot=account.name,
            source_record_type="account",
            source_record_id=account.id,
            source_record_route=f"/accounts/{account.id}",
            priority="critical",
            delivery_status="failed",
            deduplication_key="dashboard-admin-system-alert",
        )
    )
    db_session.commit()

    current_dashboard = client.get("/api/dashboards/me", headers=admin_headers)
    assert current_dashboard.status_code == 200
    assert current_dashboard.json()["dashboard"] == "kam_head_portfolio"
    assert current_dashboard.json()["role_group"] == "admin"
    admin_keys = [item["key"] for item in current_dashboard.json()["widgets"]]
    assert admin_keys[:6] == ["summary", "forecast_chart", "account_portfolio", "high_risk_accounts", "critical_tasks", "governance_calendar"]
    assert "governance" not in admin_keys
    assert "governance_cadence" not in admin_keys
    assert "health_distribution" not in admin_keys
    assert "escalations" not in admin_keys
    assert "account_change_alerts" not in admin_keys
    assert "decision_queue" not in admin_keys
    assert "sla_compliance" not in admin_keys
    assert "admin_system" in admin_keys
    admin_widget = next(item for item in current_dashboard.json()["widgets"] if item["key"] == "admin_system")
    assert admin_widget["value"]["failed_notifications"] == 1
    assert "dashboard_rules" not in admin_widget["value"]
    assert admin_widget["items"][0]["source_type"] == "notification_record"
    assert admin_widget["items"][0]["title"] == "Dashboard delivery failed"
    assert admin_widget["items"][0]["account_name"] == account.name

    dashboard = client.get("/api/dashboards/am-home", headers=admin_headers)
    assert dashboard.status_code == 200
    widget_keys = {item["key"] for item in dashboard.json()["widgets"]}
    assert "tasks" in widget_keys
    assert "ai_task_summary" not in widget_keys
    assert "forecast_chart" in widget_keys

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
    account = create_owned_account(db_session, owner, "role-dashboard-account")
    alert = create_account_change_alert(db_session, account, owner)
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Task(
                account_id=account.id,
                title="Open account follow-up",
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                due_at=now + timedelta(days=2),
                status="open",
                priority="medium",
                created_by_id=owner["id"],
            ),
            Task(
                account_id=account.id,
                title="Overdue blocker",
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                due_at=now - timedelta(days=1),
                status="in_progress",
                priority="critical",
                created_by_id=owner["id"],
            ),
            Signal(
                account_id=account.id,
                signal_type="weak_metric",
                severity="critical",
                status="new",
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                title="Critical relationship signal",
                detail="Relationship health dropped below threshold.",
                due_at=now + timedelta(days=1),
                created_at=now,
                updated_at=now,
            ),
            GovernanceEvent(
                account_id=account.id,
                owner_id=owner["id"],
                owner_name=owner["full_name"],
                governance_type="QBR",
                deduplication_key="role-dashboard-qbr",
                scheduled_at=now + timedelta(days=5),
                status="scheduled",
                created_by_id=owner["id"],
                created_by_name=owner["full_name"],
            ),
        ]
    )
    supporting_account = create_owned_account(db_session, owner, "supporting-workload-account")
    for assignment in supporting_account.owners:
        assignment.ownership_role = "supporting_am"
        assignment.is_primary = False
    db_session.commit()
    removed_dashboard_widgets = {
        "stale_kyc",
        "renewal_focus",
        "governance",
        "governance_cadence",
        "health_distribution",
        "strategic_health",
        "escalations",
        "major_escalations",
        "account_change_alerts",
        "decision_queue",
        "sla_compliance",
    }

    admin_dashboard = client.get("/api/dashboards/me", headers=admin_headers)
    assert admin_dashboard.status_code == 200
    admin_keys = {item["key"] for item in admin_dashboard.json()["widgets"]}
    assert removed_dashboard_widgets.isdisjoint(admin_keys)

    owner_headers = auth_headers(client, owner["email"], "User@12345")
    am_dashboard = client.get("/api/dashboards/me", headers=owner_headers, params={"page_size": 50})
    assert am_dashboard.status_code == 200
    assert am_dashboard.json()["dashboard"] == "am_home"
    assert am_dashboard.json()["role_group"] == "account_manager"
    assert "leadership" not in {item["key"] for item in am_dashboard.json()["widgets"]}
    am_keys = [item["key"] for item in am_dashboard.json()["widgets"]]
    assert am_keys == ["summary", "account_portfolio", "critical_tasks", "tasks", "opportunities", "forecast_chart", "governance_calendar"]
    assert "ai_task_summary" not in am_keys
    assert removed_dashboard_widgets.isdisjoint(am_keys)
    assert "forecast_chart" in am_keys
    assert "governance_calendar" in am_keys
    summary = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "summary")
    assert [tile["label"] for tile in summary["metadata"]["tiles"]] == ["My Accounts", "At risk", "Critical tasks", "Open tasks"]
    assert summary["metadata"]["tiles"][1]["route"] == "/accounts?risk=at_risk"
    assert summary["metadata"]["tiles"][0]["route"] == "/accounts"
    critical_tasks = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "critical_tasks")
    critical_task_titles = {item["title"] for item in critical_tasks["items"]}
    assert "Overdue blocker" in critical_task_titles
    assert "Critical relationship signal" not in critical_task_titles
    assert critical_tasks["metadata"]["source_counts"]["critical_tasks"] >= 1
    tasks = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "tasks")
    assert tasks["value"]["open"] == 1
    assert tasks["value"]["in_progress"] == 1
    assert tasks["value"]["overdue"] == 1
    assert tasks["value"]["due_this_week"] == 1
    opportunities = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "opportunities")
    assert opportunities["title"] == "Opportunities & pipeline"
    assert opportunities["metadata"]["masked"] is False
    assert opportunities["value"]["stalled"] == 0
    governance_calendar = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "governance_calendar")
    assert governance_calendar["items"][0]["route"] == f"/accounts/{account.id}?tab=governance"
    am_forecast = next(item for item in am_dashboard.json()["widgets"] if item["key"] == "forecast_chart")
    assert am_forecast["title"] == "6-Month Revenue Forecast"
    assert am_forecast["data_scope"] == "assigned_accounts"
    assert am_forecast["metadata"]["chart_type"] == "line"
    assert am_forecast["metadata"]["masked"] is False
    assert len(am_forecast["value"]["points"]) == 6
    assert isinstance(am_forecast["value"]["points"][0]["forecast_revenue"], (int, float))

    kam_head = seeded_user(client, admin_headers, "kam_head")
    kam_headers = auth_headers(client, kam_head["email"], "User@12345")
    kam_dashboard = client.get("/api/dashboards/me", headers=kam_headers)
    assert kam_dashboard.status_code == 200
    assert kam_dashboard.json()["dashboard"] == "kam_head_portfolio"
    assert kam_dashboard.json()["role_group"] == "kam_head"
    kam_keys = [item["key"] for item in kam_dashboard.json()["widgets"]]
    assert removed_dashboard_widgets.isdisjoint(kam_keys)
    assert "forecast_chart" in kam_keys
    assert "governance_calendar" in kam_keys
    kam_forecast = next(item for item in kam_dashboard.json()["widgets"] if item["key"] == "forecast_chart")
    assert kam_forecast["data_scope"] == "portfolio"
    assert kam_forecast["metadata"]["masked"] is False
    assert len(kam_forecast["value"]["points"]) == 6
    workload_widget = next(item for item in kam_dashboard.json()["widgets"] if item["key"] == "am_workload")
    owner_workload = next(item for item in workload_widget["items"] if item["owner_id"] == owner["id"])
    assert owner_workload["accounts"] >= 2
    assert owner_workload["route"] == f"/accounts?primary_am={owner['id']}"
    high_risk = next(item for item in kam_dashboard.json()["widgets"] if item["key"] == "high_risk_accounts")
    high_risk_account = next(item for item in high_risk["items"] if item["account_id"] == account.id)
    assert high_risk_account["route"] == f"/accounts/{account.id}?tab=health"
    assert "Critical risk status" in high_risk_account["risk_reason"]
    assert "below the critical threshold of 60" in high_risk_account["risk_reason"]

    reduced = client.get("/api/dashboards/leadership", headers=kam_headers)
    assert reduced.status_code == 200
    assert reduced.json()["dashboard"] == "kam_head_portfolio"
    assert reduced.json()["metadata"]["requested_dashboard"] == "leadership"
    assert reduced.json()["metadata"]["reduced_scope"] is True
    reduced_keys = {item["key"] for item in reduced.json()["widgets"]}
    assert removed_dashboard_widgets.isdisjoint(reduced_keys)

    leader = seeded_user(client, admin_headers, "leadership_viewer")
    leader_headers = auth_headers(client, leader["email"], "User@12345")
    leader_dashboard = client.get("/api/dashboards/me", headers=leader_headers)
    assert leader_dashboard.status_code == 200
    assert leader_dashboard.json()["dashboard"] == "leadership"
    assert leader_dashboard.json()["read_only"] is True
    leader_keys = {item["key"] for item in leader_dashboard.json()["widgets"]}
    assert "growth" not in leader_keys
    assert removed_dashboard_widgets.isdisjoint(leader_keys)
    assert "opportunities" in leader_keys
    assert "governance_calendar" in leader_keys
    forecast = next(item for item in leader_dashboard.json()["widgets"] if item["key"] == "forecast_chart")
    assert forecast["title"] == "6-Month Revenue Forecast"
    assert forecast["metadata"]["chart_type"] == "line"
    assert forecast["value"]["pipeline_value"] == "Restricted"
    assert forecast["value"]["weighted_forecast"] == "Restricted"
    assert forecast["value"]["points"][0]["forecast_revenue"] == "Restricted"
    assert forecast["value"]["summary"] == "Forecast calculated with the shared KAM AI logic. Commercial values are restricted for this role."
    opportunities = next(item for item in leader_dashboard.json()["widgets"] if item["key"] == "opportunities")
    assert opportunities["metadata"]["masked"] is True
    summaries = next(item for item in leader_dashboard.json()["widgets"] if item["key"] == "executive_summaries")
    account_summary = next(item for item in summaries["items"] if item["account_id"] == account.id)
    assert account_summary["health_score"] == account.health_overall
    assert "summary" not in account_summary


def test_delivery_lead_dashboard_and_system_role_protection(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    delivery = seeded_user(client, admin_headers, "delivery_lead")
    legacy_delivery = seeded_user(client, admin_headers, "delivery_stakeholder")
    account = create_owned_account(db_session, owner, "delivery-dashboard-account")
    create_engagement_health_item(db_session, account, owner, ops_lead=delivery)
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
        AccountOwner(
            account_id=account.id,
            user_id=legacy_delivery["id"],
            user_name=legacy_delivery["full_name"],
            user_email=legacy_delivery["email"],
            ownership_role="delivery_stakeholder",
            is_primary=False,
            is_active=True,
            rationale="Legacy delivery assignment.",
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
    widget_keys = {item["key"] for item in body["widgets"]}
    assert {"tasks", "signals", "governance_calendar", "engagement_health"}.issubset(widget_keys)
    assert "escalations" not in widget_keys
    assert "decision_queue" not in widget_keys
    assert "governance" not in widget_keys
    engagement_health = next(item for item in body["widgets"] if item["key"] == "engagement_health")
    assert engagement_health["items"][0]["delivery_health"] == 48

    legacy_headers = auth_headers(client, legacy_delivery["email"], "User@12345")
    legacy_dashboard = client.get("/api/dashboards/me", headers=legacy_headers)
    assert legacy_dashboard.status_code == 200
    assert legacy_dashboard.json()["dashboard"] == "delivery"
    assert legacy_dashboard.json()["role_group"] == "delivery_lead"

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
