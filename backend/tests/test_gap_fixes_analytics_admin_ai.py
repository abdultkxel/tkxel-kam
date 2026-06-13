from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AiGatewayRun, Alert, AlertStatusHistory, AuditLog, NotificationRecord, ScheduledWorkerRun
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


def create_risky_account(db_session: Session, owner: dict, account_id: str = "gap-risk-account") -> Account:
    account = Account(
        id=account_id,
        name="Gap Fix Risk Account",
        lifecycle_status="Active",
        segment="Enterprise",
        region="North America",
        risk_status="critical",
        commercial_value=250000,
        currency="USD",
        health_overall=48,
        health_relationship=42,
        health_usage=50,
        health_delivery=55,
        health_commercial=45,
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
            rationale="Gap-fix test owner.",
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account


def test_backend_alerts_are_persisted_with_audit_history_and_notification(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    account = create_risky_account(db_session, owner)

    response = client.post("/api/alerts/evaluate", headers=headers, json={"scope": "account", "account_id": account.id})
    assert response.status_code == 200
    assert response.json()["created"] >= 1
    assert response.json()["worker_run_id"]

    listed = client.get("/api/alerts", headers=headers, params={"account_id": account.id, "status": "active", "page": 1, "page_size": 10})
    assert listed.status_code == 200
    alert = next(item for item in listed.json()["items"] if item["account_id"] == account.id and item["rule_key"] == "low_overall_health")
    assert alert["severity"] == "high"
    assert alert["status"] == "open"
    assert alert["source_record_route"] == f"/accounts/{account.id}?tab=overview&alert={alert['id']}"

    persisted_alert = db_session.get(Alert, alert["id"])
    assert persisted_alert is not None
    assert persisted_alert.deduplication_key == f"low_overall_health:account:{account.id}"

    status_history = db_session.scalar(select(AlertStatusHistory).where(AlertStatusHistory.alert_id == alert["id"], AlertStatusHistory.to_status == "open"))
    assert status_history is not None

    audit_log = db_session.scalar(select(AuditLog).where(AuditLog.action == "create_alert", AuditLog.entity_id == alert["id"]))
    assert audit_log is not None

    notification = db_session.scalar(select(NotificationRecord).where(NotificationRecord.trigger == "alert_created", NotificationRecord.source_record_id == alert["id"], NotificationRecord.recipient_user_id == owner["id"]))
    assert notification is not None
    assert notification.recipient_user_id == owner["id"]

    worker_run = db_session.get(ScheduledWorkerRun, response.json()["worker_run_id"])
    assert worker_run is not None
    assert worker_run.job_type == "alert_evaluation"
    assert worker_run.status == "complete"

    duplicate = client.post("/api/alerts/evaluate", headers=headers, json={"scope": "account", "account_id": account.id})
    assert duplicate.status_code == 200
    assert duplicate.json()["created"] == 0


def test_admin_security_log_endpoints_read_persisted_records(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    account = create_risky_account(db_session, owner, "gap-admin-health-account")
    client.post("/api/alerts/evaluate", headers=headers, json={"scope": "account", "account_id": account.id})

    health = client.get("/api/admin/system-health", headers=headers)
    assert health.status_code == 200
    assert health.json()["status"] in {"healthy", "degraded", "failed"}

    audit = client.get("/api/admin/audit-logs", headers=headers, params={"page": 1, "page_size": 5})
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1

    jobs = client.get("/api/admin/job-logs", headers=headers, params={"page": 1, "page_size": 5})
    assert jobs.status_code == 200
    assert "items" in jobs.json()

    errors = client.get("/api/admin/error-logs", headers=headers, params={"page": 1, "page_size": 5})
    assert errors.status_code == 200
    assert "items" in errors.json()


def test_ai_query_history_and_rerun_are_persisted_in_gateway_runs(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    create_risky_account(db_session, owner, "gap-ai-account")

    accounts = client.get("/api/ai/accounts", headers=headers)
    assert accounts.status_code == 200
    assert any(item["id"] == "gap-ai-account" and item["segment"] == "Enterprise" for item in accounts.json())

    query = client.post(
        "/api/ai/query",
        headers=headers,
        json={"query": "show critical risk accounts", "scopes": ["timeline", "signals", "opportunities"], "limit": 5},
    )
    assert query.status_code == 200
    run_id = query.json()["run_id"]
    assert run_id

    run = db_session.get(AiGatewayRun, run_id)
    assert run is not None
    assert run.prompt_json["query"] == "show critical risk accounts"
    assert run.response_json["answer"]

    history = client.get("/api/ai/query-history", headers=headers, params={"page": 1, "page_size": 5})
    assert history.status_code == 200
    assert any(item["run_id"] == run_id and item["answer"] for item in history.json()["items"])

    rerun = client.post(f"/api/ai/query-history/{run_id}/rerun", headers=headers)
    assert rerun.status_code == 200
    assert rerun.json()["query"] == "show critical risk accounts"
