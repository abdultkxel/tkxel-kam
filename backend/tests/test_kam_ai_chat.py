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
    def fake_combined_answer(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001
        return {
            "answer_markdown": f"Source-backed OpenAI answer for {query} using {len(sources)} source records.",
            "confidence": "high" if sources else "low",
            "intent": "risk",
            "recommended_actions": ["Review the cited source records before customer follow-up."],
            "missing_evidence": [],
            "follow_up_questions": ["Which executive stakeholder should be included?"],
            "provider": "test_provider",
            "model": "test_model",
            "usage": {"test": True},
            "metadata": {"combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined_answer)
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
    assert assistant["content"].startswith("Source-backed OpenAI answer")
    assert assistant["model_provider"] == "test_provider"
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
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


def test_kam_ai_chat_combines_internal_vector_results_with_openai_by_default(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_combined(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001
        calls.append({"query": query, "source_count": len(sources), "account_count": len(accounts), "role": current_user.role, "reason": reason})
        return {
            "answer_markdown": "Combined KAM and OpenAI answer for internal account evidence.",
            "confidence": "medium",
            "intent": "risk",
            "recommended_actions": [],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_combined_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Default KAM AI chat should use the combined OpenAI path")

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined)
    monkeypatch.setattr(KamAiChatService, "_generate_answer", fail_internal_answer)
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
    assert calls and calls[0]["reason"] == "default_combined_search"
    assert calls[0]["source_count"] > 0
    assert assistant["model_provider"] == "openai_combined_search"
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
    assert assistant["sources"]
    assert "OpenAI was not needed" not in assistant["content"]


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


def test_kam_ai_chat_external_search_keywords_combine_internal_sources_with_openai(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_combined(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001
        calls.append({"query": query, "source_count": len(sources), "account_count": len(accounts), "role": current_user.role, "reason": reason})
        return {
            "answer_markdown": "Combined KAM and OpenAI web search answer for Cafe Zupas.",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": [],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_combined_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Internal answer path should not run for explicit external-search requests")

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined)
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
    assert calls[0]["reason"] == "user_requested_external_search"
    assert calls[0]["source_count"] > 0
    assert assistant["model_provider"] == "openai_combined_search"
    assert assistant["metadata_json"]["external_search_requested"] is True
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
    assert assistant["metadata_json"]["internal_source_count"] > 0
    assert assistant["sources"]


def test_kam_ai_chat_plain_search_terms_combine_internal_sources_with_openai(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_combined(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001
        calls.append({"query": query, "source_count": len(sources), "account_count": len(accounts), "role": current_user.role, "reason": reason})
        return {
            "answer_markdown": "Combined answer from OpenAI web search and authorized KAM records.",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": [],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_combined_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Plain search requests should not stop at the internal-only answer path")

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined)
    monkeypatch.setattr(KamAiChatService, "_generate_answer", fail_internal_answer)
    headers = auth_headers(client)
    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "Plain search", "account_id": "demo-project-cafe-zupas", "scopes": ["timeline", "kyc", "documents"]},
    )
    assert create_response.status_code == 201

    message_response = client.post(
        f"/api/ai/chat-sessions/{create_response.json()['id']}/messages",
        headers=headers,
        json={"content": "Search for Cafe Zupas details", "scopes": ["timeline", "kyc", "documents"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert calls and calls[0]["reason"] == "user_requested_external_search"
    assert calls[0]["source_count"] > 0
    assert assistant["model_provider"] == "openai_combined_search"
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
    assert "OpenAI was not needed" not in assistant["content"]


@pytest.mark.parametrize(
    ("query", "expected_reason"),
    [
        ("Research Cafe Zupas", "user_requested_external_search"),
        ("Look up Fintua", "user_requested_external_search"),
        ("Give me information about Fintua", "public_context_lookup"),
    ],
)
def test_kam_ai_chat_public_search_detection_handles_common_user_wording(query: str, expected_reason: str) -> None:
    assert KamAiChatService._external_search_reason(query) == expected_reason


def test_kam_ai_chat_industry_context_combines_vector_and_openai_search(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_combined(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001, ARG001
        calls.append({"query": query, "source_count": len(sources), "reason": reason})
        return {
            "answer_markdown": "Restaurant industry context combined with Cafe Zupas KAM evidence.",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": ["Validate public market findings before customer follow-up."],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_combined_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Industry context should use OpenAI web search plus internal evidence")

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined)
    monkeypatch.setattr(KamAiChatService, "_generate_answer", fail_internal_answer)
    headers = auth_headers(client)
    create_response = client.post(
        "/api/ai/chat-sessions",
        headers=headers,
        json={"title": "Industry context", "account_id": "demo-project-cafe-zupas", "scopes": ["timeline", "kyc", "documents"]},
    )
    assert create_response.status_code == 201

    message_response = client.post(
        f"/api/ai/chat-sessions/{create_response.json()['id']}/messages",
        headers=headers,
        json={"content": "Get me details from the restaurant industry for Cafe Zupas", "scopes": ["timeline", "kyc", "documents"], "document_search": True},
    )

    assert message_response.status_code == 200
    assistant = message_response.json()["messages"][1]
    assert calls and calls[0]["reason"] == "industry_or_market_context"
    assert calls[0]["source_count"] > 0
    assert assistant["model_provider"] == "openai_combined_search"
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
    assert assistant["sources"]


def test_kam_ai_chat_public_profile_lookup_uses_openai_web_search(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_combined(self, query, *, sources, accounts, current_user, reason):  # noqa: ANN001, ARG001
        calls.append({"query": query, "source_count": len(sources), "reason": reason})
        return {
            "answer_markdown": "Best matching public URLs:\n- LinkedIn: https://www.linkedin.com/company/fintua/",
            "confidence": "medium",
            "intent": "general",
            "recommended_actions": ["Verify the URL before saving it to the account profile."],
            "missing_evidence": [],
            "follow_up_questions": [],
            "provider": "openai_combined_search",
            "model": "gpt-test",
            "usage": {"test": True},
            "metadata": {"external_search_requested": True, "combined_internal_and_external": True, "openai_used_because": reason, "internal_source_count": len(sources)},
        }

    def fail_internal_answer(self, query, *, sources, accounts, current_user):  # noqa: ANN001, ARG001
        raise AssertionError("Public profile lookups should use OpenAI web search instead of internal-only answers")

    monkeypatch.setattr(KamAiChatService, "_generate_combined_openai_answer", fake_combined)
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
    assert calls and calls[0]["query"] == "What is Fintua's LinkedIn URL?"
    assert calls[0]["reason"] == "public_profile_lookup"
    assert assistant["model_provider"] == "openai_combined_search"
    assert assistant["metadata_json"]["external_search_requested"] is True
    assert assistant["metadata_json"]["combined_internal_and_external"] is True
    assert "linkedin.com/company/fintua" in assistant["content"]


def test_kam_ai_chat_combined_openai_search_uses_web_search_tool(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
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
    assert answer["provider"] == "openai_combined_search"
    assert answer["metadata"]["openai_web_search_used"] is True
    assert answer["metadata"]["openai_url_citations"][0]["url"] == "https://example.com/cafe-zupas"


def test_kam_ai_chat_openai_call_requests_web_search_sources(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    service = KamAiChatService(db_session)
    service.settings.kam_ai_api_key = "test-key"
    service.settings.kam_ai_model = "gpt-test"
    captured: dict[str, object] = {}

    class FakeResponse:
        id = "resp-test"
        output_text = '{"answer_markdown":"ok","confidence":"medium","intent":"general","recommended_actions":[],"missing_evidence":[],"follow_up_questions":[]}'
        usage = {"input_tokens": 10, "output_tokens": 20}

        def model_dump(self):  # noqa: ANN201
            return {
                "output": [
                    {"type": "web_search_call", "action": {"sources": [{"title": "Industry report", "url": "https://example.com/report"}]}},
                    {"type": "message", "content": [{"annotations": [{"type": "url_citation", "title": "Industry report", "url": "https://example.com/report", "start_index": 0, "end_index": 6}]}]},
                ]
            }

    class FakeResponses:
        def create(self, **kwargs):  # noqa: ANN003, ANN201
            captured.update(kwargs)
            return FakeResponse()

    class FakeOpenAI:
        def __init__(self, **kwargs):  # noqa: ANN003
            self.responses = FakeResponses()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)

    text, metadata = service._call_openai("Summarize public industry context", use_web_search=True)

    assert "ok" in text
    assert captured["tools"] == [{"type": "web_search", "search_context_size": "medium", "user_location": {"type": "approximate", "country": "US"}}]
    assert captured["include"] == ["web_search_call.action.sources"]
    assert metadata["web_search_used"] is True
    assert metadata["web_sources"][0]["url"] == "https://example.com/report"
    assert metadata["url_citations"][0]["url"] == "https://example.com/report"


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
