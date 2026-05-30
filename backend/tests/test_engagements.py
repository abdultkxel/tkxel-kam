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


def auth_headers(client: TestClient, email: str = "account.manager.user@tkxelkam.com", password: str = "User@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def engagement_payload(**overrides) -> dict:
    payload = {
        "name": "Cloud Governance Managed Services",
        "status": "active",
        "source_document_links": [{"title": "Cloud Governance SOW FY26.pdf", "url": "https://docs.example.com/cloud-sow", "type": "sow"}],
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "renewal_date": "2027-01-01",
        "notice_deadline": "2026-10-03",
        "notice_period_days": 90,
        "owner_id": "usr-002",
        "owner_name": "Ali Khan",
        "service_lines": ["Cloud", "FinOps"],
        "value": 860000,
        "currency": "USD",
        "delivery_status": "watch",
        "delivery_health": 88,
        "resource_dependency": "Two named architects need backup coverage.",
        "commercial_context": "Auto-renewal with uplift clause pending confirmation.",
        "risks": ["Notice deadline falls before QBR"],
    }
    payload.update(overrides)
    return payload


def test_account_engagement_crud_filters_and_validation(client: TestClient) -> None:
    headers = auth_headers(client)

    create_response = client.post("/api/accounts/amd-001/engagements", headers=headers, json=engagement_payload())
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["account_id"] == "amd-001"
    assert created["name"] == "Cloud Governance Managed Services"
    assert created["service_lines"] == ["Cloud", "FinOps"]
    assert created["health_dirty"] is True

    list_response = client.get(
        "/api/accounts/amd-001/engagements",
        headers=headers,
        params={"search": "governance", "service_line": "Cloud", "sort_by": "value", "page": 1, "page_size": 5},
    )
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == created["id"]

    update_response = client.patch(
        f"/api/engagements/{created['id']}",
        headers=headers,
        json={"delivery_status": "on_track", "risks": []},
    )
    assert update_response.status_code == 200
    assert update_response.json()["delivery_status"] == "on_track"

    invalid_response = client.post(
        "/api/accounts/amd-001/engagements",
        headers=headers,
        json=engagement_payload(end_date="2025-12-31"),
    )
    assert invalid_response.status_code == 422


def test_engagement_health_recalculation_and_account_rollup_exclude_drafts(client: TestClient) -> None:
    headers = auth_headers(client)

    active_response = client.post("/api/accounts/amd-001/engagements", headers=headers, json=engagement_payload())
    draft_response = client.post(
        "/api/accounts/amd-001/engagements",
        headers=headers,
        json=engagement_payload(
            name="Draft AI Modernization SOW",
            status="draft",
            value=200000,
            delivery_status="on_track",
            notice_period_days=60,
            renewal_date="2027-02-01",
            notice_deadline="2026-12-03",
        ),
    )
    assert active_response.status_code == 201
    assert draft_response.status_code == 201
    active = active_response.json()
    draft = draft_response.json()

    health_response = client.post(f"/api/engagements/{active['id']}/health/recalculate", headers=headers)
    assert health_response.status_code == 200
    health = health_response.json()
    assert health["dirty"] is False
    assert health["formula_version"] == "engagement-health-v1"
    assert health["score"] > 0

    draft_health_response = client.post(f"/api/engagements/{draft['id']}/health/recalculate", headers=headers)
    assert draft_health_response.status_code == 200
    assert draft_health_response.json()["dirty"] is True

    rollup_response = client.get("/api/accounts/amd-001/health/rollup", headers=headers)
    assert rollup_response.status_code == 200
    rollup = rollup_response.json()
    assert rollup["rollup_score"] == health["score"]
    assert rollup["dirty_count"] == 0
    assert [item["engagement_id"] for item in rollup["contributions"]] == [active["id"]]
    assert rollup["snapshots"][0]["formula_version"] == "engagement-health-v1"


def test_engagement_permissions_allow_viewer_read_and_kam_head_archive(client: TestClient) -> None:
    kam_headers = auth_headers(client)
    create_response = client.post("/api/accounts/amd-001/engagements", headers=kam_headers, json=engagement_payload())
    assert create_response.status_code == 201
    engagement_id = create_response.json()["id"]

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxelkam.com")
    read_response = client.get(f"/api/engagements/{engagement_id}", headers=viewer_headers)
    create_forbidden = client.post("/api/accounts/amd-001/engagements", headers=viewer_headers, json=engagement_payload(name="Viewer Attempt"))
    assert read_response.status_code == 200
    assert create_forbidden.status_code == 403

    kam_head_headers = auth_headers(client, "kam.head.user@tkxelkam.com")
    delete_response = client.delete(f"/api/engagements/{engagement_id}", headers=kam_head_headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Engagement archived successfully"

    missing_response = client.get(f"/api/engagements/{engagement_id}", headers=kam_headers)
    assert missing_response.status_code == 404


def test_openapi_documents_engagement_apis(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert paths["/api/accounts/{account_id}/engagements"]["get"]["summary"] == "List account engagements"
    assert paths["/api/accounts/{account_id}/engagements"]["post"]["summary"] == "Create an account engagement"
    assert paths["/api/engagements/{engagement_id}"]["patch"]["summary"] == "Update an engagement"
    assert paths["/api/engagements/{engagement_id}/health/recalculate"]["post"]["summary"] == "Recalculate engagement health"
    assert paths["/api/accounts/{account_id}/health/rollup"]["get"]["summary"] == "Read account health rollup"
