from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
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
        "engagement_drafts": [
            {
                "name": "Customer intelligence modernization",
                "owner_id": owner_id,
                "service_lines": ["Engineering", "Customer Success"],
                "value": 125000,
                "currency": "USD",
                "delivery_status": "active",
                "confidence": 88,
                "start_date": "2026-05-30T00:00:00Z",
                "end_date": "2026-11-30T00:00:00Z",
                "renewal_date": "2026-11-30T00:00:00Z",
                "notice_deadline": "2026-10-30T00:00:00Z",
                "notice_period_days": 30,
                "source_citation": "SOW p2: delivery and renewal terms.",
            }
        ],
    }


def create_approved_account(client: TestClient, headers: dict[str, str], account_name: str) -> tuple[str, str, dict]:
    owner = seeded_user(client, headers, "account_manager")
    draft_response = client.post("/api/onboarding/drafts", headers=headers, json=draft_payload(account_name, owner["id"]))
    assert draft_response.status_code == 201

    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    approved = approve_response.json()
    return approved["approved_account_id"], owner["id"], approved


def test_onboarding_draft_approval_creates_account_engagement_sources_and_rollup(client: TestClient) -> None:
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
    assert overview["engagements"]["total"] == 1
    assert overview["attachments"]["total"] == 1

    rollup_response = client.get(f"/api/accounts/{account_id}/health/rollup", headers=headers)
    assert rollup_response.status_code == 200
    assert rollup_response.json()["contributions"][0]["score"] == 88


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


def test_account_filters_owner_history_engagement_health_and_openapi_docs(client: TestClient) -> None:
    headers = auth_headers(client)
    account_id, owner_id, _ = create_approved_account(client, headers, "Globex Workspace")
    ops_lead = seeded_user(client, headers, "ops_lead")

    account_list = client.get(
        "/api/accounts",
        headers=headers,
        params={"search": "Globex", "lifecycle_status": "Onboarding", "segment": "Growth", "risk_status": "critical", "page": 1, "page_size": 1},
    )
    assert account_list.status_code == 200
    assert account_list.json()["items"][0]["id"] == account_id

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

    engagements = client.get(
        f"/api/accounts/{account_id}/engagements",
        headers=headers,
        params={"search": "Customer", "service_line": "Engineering", "page": 1, "page_size": 1},
    )
    assert engagements.status_code == 200
    engagement_id = engagements.json()["items"][0]["id"]

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
