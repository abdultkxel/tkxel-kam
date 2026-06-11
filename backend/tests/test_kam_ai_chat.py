from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AiGatewayRun, KamAiChatSession, KamAiSourceChunk
from app.services.kam_ai_chat import KamAiChatService
from app.services.seed import seed_demo_project_data


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
        seed_demo_project_data(session)
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


def test_kam_ai_chat_persists_session_messages_sources_and_ai_run(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_generate_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001
        return {
            "answer_markdown": f"Source-backed answer for {query} using {len(sources)} source records.",
            "confidence": "high" if sources else "low",
            "intent": "risk",
            "recommended_actions": ["Review the cited source records before customer follow-up."],
            "missing_evidence": [],
            "follow_up_questions": ["Which executive stakeholder should be included?"],
            "provider": "test_provider",
            "model": "test_model",
            "usage": {"test": True},
        }

    monkeypatch.setattr(KamAiChatService, "_generate_answer", fake_generate_answer)
    headers = auth_headers(client)

    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "Cafe Zupas prep", "account_id": "demo-project-cafe-zupas", "scopes": ["timeline", "kyc", "tasks", "signals", "documents"]},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    message_response = client.post(
        f"/api/ai/chat-sessions/{session_id}/messages",
        headers=headers,
        json={"content": "What are the risk signals and next actions for Cafe Zupas?", "scopes": ["timeline", "kyc", "tasks", "signals", "documents"], "document_search": True},
    )

    assert message_response.status_code == 200
    body = message_response.json()
    assert body["title"].startswith("Cafe Zupas prep")
    assert body["message_count"] == 2
    assert [message["role"] for message in body["messages"]] == ["user", "assistant"]
    assistant = body["messages"][1]
    assert assistant["status"] == "complete"
    assert assistant["content"].startswith("Source-backed answer")
    assert assistant["model_provider"] == "test_provider"
    assert assistant["sources"]
    assert any(source["account_name"] == "Cafe Zupas" for source in assistant["sources"])
    assert assistant["ai_gateway_run_id"]

    assert db_session.scalar(select(KamAiSourceChunk).where(KamAiSourceChunk.account_id == "demo-project-cafe-zupas")) is not None
    assert db_session.scalar(select(AiGatewayRun).where(AiGatewayRun.id == assistant["ai_gateway_run_id"])) is not None

    list_response = client.get("/api/ai/chat-sessions", headers=headers)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] >= 1
    assert listed["items"][0]["id"] == session_id


def test_kam_ai_chat_sessions_are_private_to_session_owner(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    create_response = client.post("/api/ai/chat-sessions", headers=admin_headers, json={"title": "Private admin chat"})
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    account_manager_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")
    read_response = client.get(f"/api/ai/chat-sessions/{session_id}", headers=account_manager_headers)

    assert read_response.status_code == 404


def test_kam_ai_chat_forecast_query_persists_chart_metadata(client: TestClient) -> None:
    headers = auth_headers(client)
    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "Forecast chart", "scopes": ["timeline", "kyc", "documents", "opportunities"]},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    message_response = client.post(
        f"/api/ai/chat-sessions/{session_id}/messages",
        headers=headers,
        json={"content": "Give me a forecasting chart for Cafe Zupas for the next 6 months", "scopes": ["timeline", "kyc", "documents", "opportunities"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert assistant["intent"] == "forecast"
    assert assistant["model_provider"] == "deterministic_forecast"
    assert assistant["metadata_json"]["visualization_type"] == "forecast_chart"
    chart = assistant["metadata_json"]["forecast_chart"]
    assert chart["title"] == "6-Month Revenue Forecast"
    assert chart["scope"] == "account"
    assert len(chart["points"]) == 6
    assert chart["totals"]["account_count"] == 1


def test_kam_ai_chat_archive_hides_session_from_default_list(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    create_response = client.post("/api/ai/chat-sessions", headers=headers, json={"title": "Archive me"})
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    archive_response = client.patch(f"/api/ai/chat-sessions/{session_id}", headers=headers, json={"archived": True})

    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"
    list_response = client.get("/api/ai/chat-sessions", headers=headers)
    assert list_response.status_code == 200
    assert all(item["id"] != session_id for item in list_response.json()["items"])
    assert db_session.scalar(select(KamAiChatSession).where(KamAiChatSession.id == session_id)).archived_at is not None
