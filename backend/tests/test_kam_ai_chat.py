from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AiGatewayRun, KamAiChatSession, KamAiSourceChunk, User
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


def test_kam_ai_chat_uses_internal_vector_results_before_openai(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    called_openai = False

    def fail_if_openai_called(self, prompt):  # noqa: ANN001, ARG001
        nonlocal called_openai
        called_openai = True
        raise AssertionError("OpenAI should not be called when internal vector evidence exists")

    monkeypatch.setattr(KamAiChatService, "_call_openai", fail_if_openai_called)
    headers = auth_headers(client)
    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "Internal first", "account_id": "demo-project-cafe-zupas", "scopes": ["timeline", "kyc", "documents", "tasks", "signals"]},
    )
    assert create_response.status_code == 201

    message_response = client.post(
        f"/api/ai/chat-sessions/{create_response.json()['id']}/messages",
        headers=headers,
        json={"content": "Cafe Zupas risk signals and next actions", "scopes": ["timeline", "kyc", "documents", "tasks", "signals"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert assistant["model_provider"] == "internal_vector_search"
    assert assistant["sources"]
    assert called_openai is False


def test_kam_ai_chat_uses_openai_when_no_internal_vector_evidence(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    service = KamAiChatService(db_session)
    service.settings.kam_ai_provider = "openai"
    service.settings.kam_ai_api_key = "test-key"
    service.settings.kam_ai_model = "gpt-test"
    user = db_session.scalar(select(User).where(User.email == "admin@tkxel.com"))
    assert user is not None
    prompts: list[str] = []

    def fake_call_openai(prompt: str):  # noqa: ANN001
        prompts.append(prompt)
        return (
            '{"answer_markdown":"No internal KAM records matched. Here is general guidance from OpenAI fallback.",'
            '"confidence":"low","intent":"general","recommended_actions":["Add account source records."],'
            '"missing_evidence":["No matching internal KAM records were found."],"follow_up_questions":["Which account should this be scoped to?"]}',
            {"usage": {"input_tokens": 20, "output_tokens": 30}},
        )

    monkeypatch.setattr(service, "_call_openai", fake_call_openai)

    answer = service._generate_answer("Explain an unsupported market topic", sources=[], accounts=[], current_user=user)

    assert prompts
    assert "unsupported market topic" in prompts[0]
    assert answer["provider"] == "openai"
    assert answer["metadata"]["openai_used_because"] == "no_internal_vector_match"
    assert answer["missing_evidence"] == ["No matching internal KAM records were found."]


def test_kam_ai_chat_external_search_keywords_force_openai_even_with_internal_matches(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_external(self, query, *, accounts, current_user):  # noqa: ANN001
        calls.append({"query": query, "account_count": len(accounts), "role": current_user.role})
        return {
            "answer_markdown": "OpenAI web search answer for Cafe Zupas.",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": [],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_external_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "openai_used_because": "user_requested_external_search"},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Internal answer path should not run for explicit external-search requests")

    monkeypatch.setattr(KamAiChatService, "_generate_external_openai_answer", fake_external)
    monkeypatch.setattr(KamAiChatService, "_generate_answer", fail_internal_answer)
    headers = auth_headers(client)
    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "External search", "account_id": "demo-project-cafe-zupas", "scopes": ["timeline", "kyc", "documents"]},
    )
    assert create_response.status_code == 201

    message_response = client.post(
        f"/api/ai/chat-sessions/{create_response.json()['id']}/messages",
        headers=headers,
        json={"content": "Use OpenAI and search on Google for Cafe Zupas public news", "scopes": ["timeline", "kyc", "documents"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert calls and calls[0]["query"] == "Use OpenAI and search on Google for Cafe Zupas public news"
    assert assistant["model_provider"] == "openai_external_search"
    assert assistant["metadata_json"]["external_search_requested"] is True
    assert assistant["sources"] == []


def test_kam_ai_chat_public_profile_lookup_uses_openai_web_search(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_external(self, query, *, accounts, current_user):  # noqa: ANN001, ARG001
        calls.append(query)
        return {
            "answer_markdown": "Best matching public URLs:\n- LinkedIn: https://www.linkedin.com/company/fintua/",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": ["Verify the URL before saving it to the account profile."],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_external_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "openai_used_because": "public_profile_lookup"},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Public profile lookups should use OpenAI web search instead of internal-only answers")

    monkeypatch.setattr(KamAiChatService, "_generate_external_openai_answer", fake_external)
    monkeypatch.setattr(KamAiChatService, "_generate_answer", fail_internal_answer)
    headers = auth_headers(client)
    create_response = client.post("/api/ai/chat-sessions", headers=headers, json={"title": "Fintua LinkedIn lookup"})
    assert create_response.status_code == 201

    message_response = client.post(
        f"/api/ai/chat-sessions/{create_response.json()['id']}/messages",
        headers=headers,
        json={"content": "What is Fintua's LinkedIn URL?", "scopes": ["timeline", "kyc", "documents"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert calls == ["What is Fintua's LinkedIn URL?"]
    assert assistant["model_provider"] == "openai_external_search"
    assert assistant["metadata_json"]["external_search_requested"] is True
    assert "linkedin.com/company/fintua" in assistant["content"]
    assert assistant["sources"] == []


def test_kam_ai_chat_openai_external_search_uses_web_search_tool(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    service = KamAiChatService(db_session)
    service.settings.kam_ai_provider = "openai"
    service.settings.kam_ai_api_key = "test-key"
    service.settings.kam_ai_model = "gpt-test"
    user = db_session.scalar(select(User).where(User.email == "admin@tkxel.com"))
    assert user is not None
    calls: list[dict[str, object]] = []

    def fake_call_openai(prompt: str, *, use_web_search: bool = False):  # noqa: ANN001
        calls.append({"prompt": prompt, "use_web_search": use_web_search})
        return (
            '{"answer_markdown":"OpenAI web search fallback answer.", "confidence":"medium", "intent":"general",'
            '"recommended_actions":[], "missing_evidence":[], "follow_up_questions":[]}',
            {
                "usage": {"input_tokens": 40, "output_tokens": 50},
                "web_search_used": use_web_search,
                "url_citations": [{"title": "Cafe Zupas", "url": "https://example.com/cafe-zupas"}],
                "web_sources": [],
                "response_id": "resp-test",
            },
        )

    monkeypatch.setattr(service, "_call_openai", fake_call_openai)

    answer = service._generate_external_openai_answer("Search the web for Cafe Zupas", accounts=[], current_user=user)

    assert calls and calls[0]["use_web_search"] is True
    assert "Search the web for Cafe Zupas" in str(calls[0]["prompt"])
    assert answer["provider"] == "openai_external_search"
    assert answer["metadata"]["openai_web_search_used"] is True
    assert answer["metadata"]["openai_url_citations"][0]["url"] == "https://example.com/cafe-zupas"


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
