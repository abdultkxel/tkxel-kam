from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import CustomFieldValue, Engagement
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


def auth_headers(client: TestClient, email: str = "admin@tkxelkam.com", password: str = "Admin@12345") -> dict[str, str]:
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
        "project_name": "Customer intelligence modernization",
        "company_url": "https://customer.example.com",
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
                "citations": [
                    {
                        "label": "Project Charter p1",
                        "page_number": 1,
                        "excerpt": "Customer intelligence modernization scope.",
                        "field_key": "account_name",
                    }
                ],
            }
        ],
        "engagement_drafts": [],
    }


def iso_days_from_now(days: int) -> str:
    value = datetime.now(timezone.utc) + timedelta(days=days)
    return value.replace(hour=12, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def date_days_from_now(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def engagement_payload(owner_id: str, **overrides) -> dict:
    payload = {
        "name": "Strategic SOW QA",
        "description": "QA coverage for manually managed Engagement/SOW records.",
        "owner_id": owner_id,
        "service_lines": ["Engineering", "Customer Success"],
        "source_links": [{"title": "Signed SOW", "url": "https://customer.example.com/sow"}],
        "contract_value": 87500,
        "currency": "USD",
        "delivery_status": "active",
        "commercial_status": "healthy",
        "health_score": 82,
        "health_status": "green",
        "renewal_risk": "medium",
        "start_date": iso_days_from_now(-15),
        "end_date": iso_days_from_now(120),
        "renewal_date": iso_days_from_now(90),
        "notice_period_days": 45,
        "notice_deadline": iso_days_from_now(1),
        "resource_dependency_notes": "Named platform engineer availability.",
        "risks": ["Dependency on customer data access"],
        "source_citation": "SOW section 3.",
    }
    payload.update(overrides)
    return payload


ENGAGEMENT_RESPONSE_FIELDS = {
    "id",
    "account_id",
    "name",
    "description",
    "status",
    "owner_id",
    "owner_name",
    "service_lines",
    "source_document_ids",
    "source_links",
    "value",
    "contract_value",
    "currency",
    "delivery_status",
    "commercial_status",
    "delivery_health",
    "health_score",
    "health_status",
    "renewal_risk",
    "start_date",
    "end_date",
    "renewal_date",
    "notice_deadline",
    "notice_period_days",
    "days_to_expiry",
    "renewal_status",
    "resource_dependency_notes",
    "risks",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
}


def create_engagement_for_account(client: TestClient, headers: dict[str, str], account_id: str, owner_id: str, **overrides) -> dict:
    response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=engagement_payload(owner_id, **overrides))
    assert response.status_code == 201
    return response.json()


def create_approved_account(client: TestClient, headers: dict[str, str], account_name: str) -> tuple[str, str, dict]:
    owner = seeded_user(client, headers, "account_manager")
    draft_response = client.post("/api/onboarding/drafts", headers=headers, json=draft_payload(account_name, owner["id"]))
    assert draft_response.status_code == 201

    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    approved = approve_response.json()
    return approved["approved_account_id"], owner["id"], approved


def test_onboarding_draft_approval_creates_account_sources_without_engagement(client: TestClient) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")

    create_response = client.post("/api/onboarding/drafts", headers=headers, json=draft_payload("Northwind Workspace", owner["id"]))
    assert create_response.status_code == 201
    draft = create_response.json()
    assert draft["status"] == "ready_for_review"
    assert draft["source_documents"][0]["citations"][0]["field_key"] == "account_name"

    list_response = client.get("/api/onboarding/drafts", headers=headers, params={"search": "Northwind", "status": "ready_for_review", "page": 1, "page_size": 5})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    approve_response = client.post(f"/api/onboarding/drafts/{draft['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    account_id = approve_response.json()["approved_account_id"]

    overview_response = client.get(f"/api/accounts/{account_id}/overview", headers=headers)
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["account"]["name"] == "Northwind Workspace"
    assert overview["account"]["primary_owner"]["user_id"] == owner["id"]
    assert overview["engagements"]["total"] == 0
    assert overview["attachments"]["total"] == 1

    rollup_response = client.get(f"/api/accounts/{account_id}/health/rollup", headers=headers)
    assert rollup_response.status_code == 200
    rollup = rollup_response.json()
    assert rollup["metric_version"] == "account-rollup-v1"
    assert rollup["contributions"] == []


def test_onboarding_validation_and_authorization_errors_are_enforced(client: TestClient) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")

    invalid_response = client.post(
        "/api/onboarding/drafts",
        headers=headers,
        json={**draft_payload("Invalid Workspace", owner["id"]), "source_documents": []},
    )
    assert invalid_response.status_code == 422
    assert invalid_response.json()["message"] == "Validation failed"

    draft_response = client.post("/api/onboarding/drafts", headers=headers, json=draft_payload("Authorization Workspace", owner["id"]))
    assert draft_response.status_code == 201

    account_manager_headers = auth_headers(client, "account.manager.user@tkxelkam.com", "User@12345")
    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=account_manager_headers)
    assert approve_response.status_code == 403


def test_engagement_list_endpoint_returns_items_empty_state_and_rejects_unauthorized_access(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement List API Workspace")

    empty_response = client.get(f"/api/accounts/{account_id}/engagements", headers=headers)
    assert empty_response.status_code == 200
    assert empty_response.json()["items"] == []
    assert empty_response.json()["total"] == 0

    created = create_engagement_for_account(client, headers, account_id, owner_id, name="Endpoint list coverage")
    list_response = client.get(f"/api/accounts/{account_id}/engagements", headers=headers, params={"search": "Endpoint list", "page": 1, "page_size": 10})
    assert list_response.status_code == 200
    page = list_response.json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == created["id"]
    assert page["items"][0]["account_id"] == account_id

    unauthorized_headers = auth_headers(client, "content.specialist.user@tkxelkam.com", "User@12345")
    unauthorized_response = client.get(f"/api/accounts/{account_id}/engagements", headers=unauthorized_headers)
    assert unauthorized_response.status_code == 403


def test_engagement_create_endpoint_validates_payload_calculates_notice_and_returns_shape(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Create API Workspace")

    create_response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=engagement_payload(owner_id))
    assert create_response.status_code == 201
    created = create_response.json()
    assert ENGAGEMENT_RESPONSE_FIELDS.issubset(created.keys())
    assert created["account_id"] == account_id
    assert created["name"] == "Strategic SOW QA"
    assert created["contract_value"] == 87500
    assert created["health_score"] == 82
    assert created["source_links"][0]["url"] == "https://customer.example.com/sow"
    assert created["notice_deadline"].startswith(date_days_from_now(45))
    assert created["days_to_expiry"] == 120
    assert created["renewal_status"] == "upcoming_notice_window"

    missing_name = engagement_payload(owner_id)
    missing_name.pop("name")
    missing_name_response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=missing_name)
    assert missing_name_response.status_code == 422
    assert any(error["field"] == "name" for error in missing_name_response.json()["errors"])

    bad_dates_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id, start_date=iso_days_from_now(5), end_date=iso_days_from_now(1)),
    )
    assert bad_dates_response.status_code == 422

    negative_value_response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=engagement_payload(owner_id, contract_value=-1))
    assert negative_value_response.status_code == 422

    negative_notice_response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=engagement_payload(owner_id, notice_period_days=-1))
    assert negative_notice_response.status_code == 422


def test_engagement_detail_endpoint_returns_detail_404_and_rejects_unauthorized_access(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Detail API Workspace")
    created = create_engagement_for_account(client, headers, account_id, owner_id, name="Endpoint detail coverage")

    detail_response = client.get(f"/api/engagements/{created['id']}", headers=headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert ENGAGEMENT_RESPONSE_FIELDS.issubset(detail.keys())
    assert detail["id"] == created["id"]
    assert detail["account_id"] == account_id
    assert detail["name"] == "Endpoint detail coverage"

    missing_response = client.get("/api/engagements/missing-engagement", headers=headers)
    assert missing_response.status_code == 404

    unauthorized_headers = auth_headers(client, "content.specialist.user@tkxelkam.com", "User@12345")
    unauthorized_response = client.get(f"/api/engagements/{created['id']}", headers=unauthorized_headers)
    assert unauthorized_response.status_code == 403


def test_engagement_patch_endpoint_updates_recalculates_notice_and_validates_payload(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Patch API Workspace")
    created = create_engagement_for_account(client, headers, account_id, owner_id, name="Endpoint patch coverage")

    update_response = client.patch(
        f"/api/engagements/{created['id']}",
        headers=headers,
        json={
            "name": "Endpoint patch updated",
            "description": "Updated description",
            "service_lines": ["Cloud", "Data"],
            "contract_value": 99000,
            "currency": "EUR",
            "delivery_status": "watch",
            "commercial_status": "risk",
            "health_score": 66,
            "health_status": "amber",
            "renewal_risk": "high",
            "end_date": iso_days_from_now(120),
            "renewal_date": iso_days_from_now(40),
            "notice_period_days": 12,
            "notice_deadline": iso_days_from_now(1),
            "resource_dependency_notes": "Updated resource note.",
            "risks": ["Updated risk"],
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert ENGAGEMENT_RESPONSE_FIELDS.issubset(updated.keys())
    assert updated["name"] == "Endpoint patch updated"
    assert updated["description"] == "Updated description"
    assert updated["service_lines"] == ["Cloud", "Data"]
    assert updated["contract_value"] == 99000
    assert updated["currency"] == "EUR"
    assert updated["delivery_status"] == "watch"
    assert updated["commercial_status"] == "risk"
    assert updated["health_score"] == 66
    assert updated["health_status"] == "amber"
    assert updated["renewal_risk"] == "high"
    assert updated["resource_dependency_notes"] == "Updated resource note."
    assert updated["risks"] == ["Updated risk"]
    assert updated["notice_deadline"].startswith(date_days_from_now(28))
    assert updated["renewal_status"] == "notice_due"

    bad_dates_response = client.patch(
        f"/api/engagements/{created['id']}",
        headers=headers,
        json={"start_date": iso_days_from_now(10), "end_date": iso_days_from_now(3)},
    )
    assert bad_dates_response.status_code == 422

    negative_value_response = client.patch(f"/api/engagements/{created['id']}", headers=headers, json={"contract_value": -10})
    assert negative_value_response.status_code == 422

    negative_notice_response = client.patch(f"/api/engagements/{created['id']}", headers=headers, json={"notice_period_days": -1})
    assert negative_notice_response.status_code == 422


def test_engagement_archive_endpoint_archives_without_hard_delete_and_hides_from_active_list(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Archive API Workspace")
    created = create_engagement_for_account(client, headers, account_id, owner_id, name="Endpoint archive coverage")

    archive_response = client.delete(f"/api/engagements/{created['id']}", headers=headers)
    assert archive_response.status_code == 200
    assert archive_response.json()["message"] == "Engagement archived successfully"

    archived = db_session.get(Engagement, created["id"])
    assert archived is not None
    assert archived.status == "archived"
    assert archived.archived_at is not None

    active_list = client.get(f"/api/accounts/{account_id}/engagements", headers=headers, params={"search": "Endpoint archive coverage"})
    assert active_list.status_code == 200
    assert active_list.json()["items"] == []

    detail_response = client.get(f"/api/engagements/{created['id']}", headers=headers)
    assert detail_response.status_code == 404


def test_engagement_summary_endpoint_returns_account_overview_and_engagement_360_fields(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Summary API Workspace")
    created = create_engagement_for_account(client, headers, account_id, owner_id, name="Endpoint summary coverage")

    summary_response = client.get(f"/api/engagements/{created['id']}/summary", headers=headers)
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["id"] == created["id"]
    assert summary["account_id"] == account_id
    assert summary["name"] == "Endpoint summary coverage"
    assert summary["owner_id"] == owner_id
    assert summary["service_lines"] == ["Engineering", "Customer Success"]
    assert summary["source_links"][0]["url"] == "https://customer.example.com/sow"
    assert summary["contract_value"] == 87500
    assert summary["currency"] == "USD"
    assert summary["delivery_status"] == "active"
    assert summary["commercial_status"] == "healthy"
    assert summary["health_score"] == 82
    assert summary["health_status"] == "green"
    assert summary["renewal_risk"] == "medium"
    assert summary["notice_deadline"].startswith(date_days_from_now(45))
    assert summary["days_to_expiry"] == 120
    assert summary["renewal_status"] == "upcoming_notice_window"
    assert summary["resource_dependency_notes"] == "Named platform engineer availability."
    assert summary["risks"] == ["Dependency on customer data access"]
    assert summary["latest_health"]["overall"] == 82
    assert summary["created_at"]
    assert summary["updated_at"]


def test_manual_engagement_crud_calculations_timeline_and_access(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement QA Workspace")

    create_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id),
    )
    assert create_response.status_code == 201
    created = create_response.json()
    engagement_id = created["id"]
    assert created["account_id"] == account_id
    assert created["name"] == "Strategic SOW QA"
    assert created["contract_value"] == 87500
    assert created["notice_deadline"].startswith(date_days_from_now(45))
    assert created["days_to_expiry"] == 120
    assert created["renewal_status"] == "upcoming_notice_window"

    list_response = client.get(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        params={"search": "Strategic", "status": "active", "owner": owner_id, "renewal_window": "next_90", "page": 1, "page_size": 10},
    )
    assert list_response.status_code == 200
    listed_ids = {item["id"] for item in list_response.json()["items"]}
    assert engagement_id in listed_ids

    detail_response = client.get(f"/api/engagements/{engagement_id}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["source_links"][0]["url"] == "https://customer.example.com/sow"

    timeline_response = client.get(f"/api/engagements/{engagement_id}/timeline", headers=headers)
    assert timeline_response.status_code == 200
    assert {event["event_type"] for event in timeline_response.json()["items"]} == {"engagement_created"}
    created_event = timeline_response.json()["items"][0]
    assert created_event["account_id"] == account_id
    assert created_event["engagement_id"] == engagement_id
    assert created_event["source_module"] == "engagements"
    assert created_event["actor_id"]
    assert created_event["new_value"]["notice_deadline"].startswith(date_days_from_now(45))

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxelkam.com", "User@12345")
    viewer_list = client.get(f"/api/accounts/{account_id}/engagements", headers=viewer_headers)
    assert viewer_list.status_code == 200
    viewer_update = client.patch(f"/api/engagements/{engagement_id}", headers=viewer_headers, json={"health_status": "red"})
    assert viewer_update.status_code == 403

    update_response = client.patch(
        f"/api/engagements/{engagement_id}",
        headers=headers,
        json={
            "name": "Strategic SOW QA - Renewed",
            "service_lines": ["Engineering", "Data"],
            "contract_value": 91000,
            "currency": "EUR",
            "delivery_status": "watch",
            "health_score": 68,
            "health_status": "amber",
            "renewal_risk": "high",
            "start_date": iso_days_from_now(-10),
            "end_date": iso_days_from_now(150),
            "renewal_date": iso_days_from_now(20),
            "notice_period_days": 10,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Strategic SOW QA - Renewed"
    assert updated["contract_value"] == 91000
    assert updated["health_score"] == 68
    assert updated["health_status"] == "amber"
    assert updated["delivery_status"] == "watch"
    assert updated["notice_deadline"].startswith(date_days_from_now(10))
    assert updated["days_to_expiry"] == 150
    assert updated["renewal_status"] == "renewal_due"

    timeline_after_update = client.get(f"/api/engagements/{engagement_id}/timeline", headers=headers)
    assert timeline_after_update.status_code == 200
    event_types = {event["event_type"] for event in timeline_after_update.json()["items"]}
    assert {
        "engagement_created",
        "engagement_updated",
        "sow_terms_updated",
        "renewal_dates_updated",
        "engagement_health_changed",
        "engagement_delivery_status_changed",
    }.issubset(event_types)

    archive_response = client.delete(f"/api/engagements/{engagement_id}", headers=headers)
    assert archive_response.status_code == 200
    assert archive_response.json()["message"] == "Engagement archived successfully"

    archived_detail = client.get(f"/api/engagements/{engagement_id}", headers=headers)
    assert archived_detail.status_code == 404
    active_list = client.get(f"/api/accounts/{account_id}/engagements", headers=headers, params={"search": "Strategic SOW QA - Renewed"})
    assert active_list.status_code == 200
    assert engagement_id not in {item["id"] for item in active_list.json()["items"]}

    timeline_after_archive = client.get(f"/api/engagements/{engagement_id}/timeline", headers=headers)
    assert timeline_after_archive.status_code == 200
    assert "engagement_archived" in {event["event_type"] for event in timeline_after_archive.json()["items"]}


def test_manual_engagement_create_validation_errors(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Engagement Validation Workspace")

    missing_name = engagement_payload(owner_id)
    missing_name.pop("name")
    missing_name_response = client.post(f"/api/accounts/{account_id}/engagements", headers=headers, json=missing_name)
    assert missing_name_response.status_code == 422
    assert any(error["field"] == "name" for error in missing_name_response.json()["errors"])

    bad_dates_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id, start_date=iso_days_from_now(5), end_date=iso_days_from_now(1)),
    )
    assert bad_dates_response.status_code == 422

    negative_value_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id, contract_value=-1),
    )
    assert negative_value_response.status_code == 422

    negative_notice_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id, notice_period_days=-1),
    )
    assert negative_notice_response.status_code == 422

    expired_response = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(
            owner_id,
            name="Expired SOW QA",
            start_date=iso_days_from_now(-90),
            end_date=iso_days_from_now(-1),
            renewal_date=None,
            notice_period_days=None,
        ),
    )
    assert expired_response.status_code == 201
    assert expired_response.json()["renewal_status"] == "expired"


def test_account_filters_owner_history_engagement_health_and_openapi_docs(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Globex Workspace")
    ops_lead = seeded_user(client, headers, "ops_lead")

    account_list = client.get(
        "/api/accounts",
        headers=headers,
        params={"search": "Globex", "lifecycle_status": "Onboarding", "segment": "Growth", "risk_status": "warning", "page": 1, "page_size": 1},
    )
    assert account_list.status_code == 200
    assert account_list.json()["items"][0]["id"] == account_id
    assert account_list.json()["items"][0]["health"]["overall"] == 45

    email_search = client.get(
        "/api/accounts",
        headers=headers,
        params={"search": "account.manager.user@tkxelkam.com", "page": 1, "page_size": 5},
    )
    assert email_search.status_code == 200
    assert any(item["id"] == account_id for item in email_search.json()["items"])

    owner_response = client.post(
        f"/api/accounts/{account_id}/owners",
        headers=headers,
        json={"user_id": ops_lead["id"], "ownership_role": "ops_lead", "rationale": "Delivery governance owner."},
    )
    assert owner_response.status_code == 201

    history_response = client.get(f"/api/accounts/{account_id}/ownership-history", headers=headers, params={"page": 1, "page_size": 10})
    assert history_response.status_code == 200
    assert history_response.json()["total"] >= 2

    bad_engagement = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json={
            "name": "Bad dates",
            "owner_id": owner_id,
            "service_lines": ["Engineering"],
            "delivery_status": "active",
            "start_date": "2026-05-30T00:00:00Z",
            "end_date": "2026-05-01T00:00:00Z",
        },
    )
    assert bad_engagement.status_code == 422

    created_engagement = client.post(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        json=engagement_payload(owner_id, name="Customer health workspace"),
    )
    assert created_engagement.status_code == 201

    engagements = client.get(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        params={"search": "Customer", "service_line": "Engineering", "page": 1, "page_size": 1},
    )
    assert engagements.status_code == 200
    engagement_id = engagements.json()["items"][0]["id"]

    health_status_update = client.patch(f"/api/engagements/{engagement_id}", headers=headers, json={"health_status": "red"})
    assert health_status_update.status_code == 200
    assert health_status_update.json()["health_status"] == "red"

    rollup_response = client.get(f"/api/accounts/{account_id}/health/rollup", headers=headers)
    assert rollup_response.status_code == 200
    rollup = rollup_response.json()
    assert rollup["metric_version"] == "engagement-health-rollup-adapter-v1"
    assert rollup["overall"] == 45
    assert rollup["rag_status"] == "warning"
    assert rollup["contributions"][0]["health_status"] == "red"
    assert rollup["contributions"][0]["scoring_status"] == "pending_scoring_engine"

    timeline_response = client.get(f"/api/engagements/{engagement_id}/timeline", headers=headers)
    assert timeline_response.status_code == 200
    assert any(event["event_type"] == "engagement_health_changed" for event in timeline_response.json()["items"])

    health_response = client.post(f"/api/engagements/{engagement_id}/health/recalculate", headers=headers)
    assert health_response.status_code == 200
    assert health_response.json()["rag_status"] in {"healthy", "warning", "critical"}

    health_history = client.get(f"/api/engagements/{engagement_id}/health", headers=headers, params={"page": 1, "page_size": 5})
    assert health_history.status_code == 200
    assert health_history.json()["total"] >= 2

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert paths["/api/onboarding/drafts"]["post"]["summary"] == "Create onboarding draft"
    assert paths["/api/accounts/{account_id}/overview"]["get"]["summary"] == "Read account overview"
    assert paths["/api/engagements/{engagement_id}/health/recalculate"]["post"]["summary"] == "Recalculate engagement health"


def test_account_list_supports_server_sorting(client: TestClient) -> None:
    headers = auth_headers(client)
    create_approved_account(client, headers, "Aardvark Workspace")
    create_approved_account(client, headers, "Zenith Workspace")

    name_desc = client.get(
        "/api/accounts",
        headers=headers,
        params={"sort": "name", "direction": "desc", "page": 1, "page_size": 2},
    )
    assert name_desc.status_code == 200
    assert [item["name"] for item in name_desc.json()["items"]] == ["Zenith Workspace", "Aardvark Workspace"]

    value_desc = client.get(
        "/api/accounts",
        headers=headers,
        params={"sort": "commercial_value", "direction": "desc", "page": 1, "page_size": 2},
    )
    assert value_desc.status_code == 200
    assert value_desc.json()["items"][0]["commercial_value"] >= value_desc.json()["items"][1]["commercial_value"]

    owner_sort = client.get(
        "/api/accounts",
        headers=headers,
        params={"sort": "owner_name", "direction": "asc", "page": 1, "page_size": 2},
    )
    assert owner_sort.status_code == 200
    assert owner_sort.json()["items"][0]["primary_owner"]["user_name"] == "Account Manager KAM"


def test_account_creation_accepts_field_builder_values(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")

    field_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "account_onboarding_workspace",
            "field_key": "customer_tier",
            "label": "Customer Tier",
            "field_type": "single_select",
            "options": ["Gold", "Silver"],
            "is_required": True,
            "show_in_detail": True,
        },
    )
    assert field_response.status_code == 201

    definitions = client.get("/api/accounts/custom-fields", headers=headers)
    assert definitions.status_code == 200
    assert any(item["field_key"] == "customer_tier" for item in definitions.json())

    missing_required = client.post(
        "/api/onboarding/drafts",
        headers=headers,
        json=draft_payload("Required Field Workspace", owner["id"]),
    )
    assert missing_required.status_code == 422
    assert missing_required.json()["detail"]["errors"][0]["field"] == "custom_field_values.customer_tier"

    draft_response = client.post(
        "/api/onboarding/drafts",
        headers=headers,
        json={**draft_payload("Field Builder Workspace", owner["id"]), "custom_field_values": {"customer_tier": "Gold"}},
    )
    assert draft_response.status_code == 201
    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    account_id = approve_response.json()["approved_account_id"]

    values = [value for value in db_session.query(CustomFieldValue).filter(CustomFieldValue.record_id == account_id).all()]
    assert values
    assert values[0].value == "Gold"
