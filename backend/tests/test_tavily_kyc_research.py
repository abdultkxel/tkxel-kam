from collections.abc import Generator
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, AuditLog, KycSnapshot, TimelineEntry, User
from app.schemas import KycDraftApproveRequest, KycDraftCreateRequest, KycDraftUpdateRequest, KycWebResearchCreateRequest
from app.services.kyc import KycService
from app.services.kyc_gateway import DeterministicKycGatewayAdapter
from app.services.seed import seed_default_data
from app.services.tavily_research import KycResearchContext, KycResearchResult, KycResearchSummary, OllamaKycResearchSummarizer, TavilyKycResearchProvider


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        seed_default_data(session)
        yield session
    Base.metadata.drop_all(bind=engine)


def test_tavily_provider_normalizes_sources_and_blocks_social_domains() -> None:
    provider = object.__new__(TavilyKycResearchProvider)
    provider.settings = SimpleNamespace(
        tavily_api_key="tvly-test",
        tavily_extract_enabled=False,
        tavily_max_results=4,
        tavily_search_depth="advanced",
        tavily_include_answer=False,
        tavily_include_raw_content=True,
        tavily_include_images=False,
        tavily_include_domains="",
        tavily_exclude_domains="linkedin.com,facebook.com",
        tavily_search_endpoint="/search",
        tavily_extract_endpoint="/extract",
        tavily_base_url="https://api.tavily.com",
        tavily_timeout_seconds=45,
        tavily_max_retries=0,
        tavily_retry_backoff_seconds=0,
        tavily_per_run_credit_limit=10,
        ai_kyc_verbose_logging=False,
        ai_kyc_verbose_log_max_chars=1000,
    )

    def fake_post_json(endpoint: str, body: dict):  # noqa: ANN001
        assert endpoint == "/search"
        assert "linkedin.com" in body["exclude_domains"]
        return {
            "request_id": "req-1",
            "results": [
                {
                    "title": "Acme official website",
                    "url": "https://www.acme.com/about",
                    "content": "Acme provides digital ordering, loyalty personalization, and restaurant analytics.",
                    "score": 0.92,
                },
                {
                    "title": "Acme LinkedIn",
                    "url": "https://www.linkedin.com/company/acme",
                    "content": "Blocked social profile.",
                    "score": 0.99,
                },
            ],
        }

    provider._post_json = fake_post_json  # type: ignore[method-assign]
    account = SimpleNamespace(id="acct-1", name="Acme Inc", company_url="https://www.acme.com")

    result = provider.research(account=account, source_documents=[], retrieved_context=[])

    assert len(result.queries) == 4
    assert len(result.contexts) == 1
    context = result.contexts[0]
    assert context.source_type == "web_research"
    assert context.source_route == "https://www.acme.com/about"
    assert context.confidence >= 80
    assert "digital ordering" in context.text
    assert result.metadata["source_count"] == 1


def test_tavily_provider_uses_custom_query_and_still_blocks_social_domains() -> None:
    provider = object.__new__(TavilyKycResearchProvider)
    provider.settings = SimpleNamespace(
        tavily_api_key="tvly-test",
        tavily_extract_enabled=False,
        tavily_max_results=4,
        tavily_search_depth="advanced",
        tavily_include_answer=False,
        tavily_include_raw_content=True,
        tavily_include_images=False,
        tavily_include_domains="",
        tavily_exclude_domains="linkedin.com,facebook.com",
        tavily_search_endpoint="/search",
        tavily_extract_endpoint="/extract",
        tavily_base_url="https://api.tavily.com",
        tavily_timeout_seconds=45,
        tavily_max_retries=0,
        tavily_retry_backoff_seconds=0,
        tavily_per_run_credit_limit=10,
        ai_kyc_verbose_logging=False,
        ai_kyc_verbose_log_max_chars=1000,
    )
    seen_queries: list[str] = []

    def fake_post_json(endpoint: str, body: dict):  # noqa: ANN001
        seen_queries.append(body["query"])
        assert "linkedin.com" in body["exclude_domains"]
        return {
            "request_id": "req-custom",
            "results": [
                {
                    "title": "Cafe Zupas official website",
                    "url": "https://cafezupas.com/about",
                    "content": "Cafe Zupas is a US restaurant brand focused on house-made soups, salads, sandwiches, and catering.",
                    "score": 0.9,
                },
                {
                    "title": "Cafe Zupas LinkedIn",
                    "url": "https://www.linkedin.com/company/cafe-zupas",
                    "content": "Blocked profile.",
                    "score": 0.99,
                },
            ],
        }

    provider._post_json = fake_post_json  # type: ignore[method-assign]
    account = SimpleNamespace(id="acct-1", name="Cafe Zupas", company_url="https://cafezupas.com")

    result = provider.research(account=account, source_documents=[], retrieved_context=[], custom_query="  What is Cafe Zupas in USA?  ")

    assert result.queries == ["What is Cafe Zupas in USA?"]
    assert seen_queries == ["What is Cafe Zupas in USA?"]
    assert len(result.contexts) == 1
    assert result.contexts[0].source_route == "https://cafezupas.com/about"
    assert result.metadata["custom_query"] == "What is Cafe Zupas in USA?"


def test_ollama_research_summarizer_parses_json_and_falls_back_on_invalid_response() -> None:
    summarizer = object.__new__(OllamaKycResearchSummarizer)
    summarizer.settings = SimpleNamespace(
        ai_kyc_research_summarizer_model="qwen3:8b",
        ai_kyc_research_summarizer_provider="ollama",
        ai_kyc_research_summarizer_base_url="http://ollama:11434/v1",
        ai_kyc_research_summarizer_max_output_tokens=1000,
        ai_kyc_research_summarizer_temperature=0.1,
        ai_kyc_research_summarizer_timeout_seconds=10,
        ai_kyc_verbose_logging=False,
        ai_kyc_verbose_log_max_chars=1000,
        tavily_max_results=3,
        ai_kyc_api_key="local-demo",
    )
    account = SimpleNamespace(id="acct-1", name="Acme Inc", company_url="https://www.acme.com", segment="Enterprise", region="US", service_context="")
    research_result = KycResearchResult(
        contexts=[
            KycResearchContext(
                source_type="web_research",
                source_record_id="tavily-1",
                label="Acme official website",
                text="Acme provides digital ordering and loyalty personalization.",
                excerpt="Acme provides digital ordering and loyalty personalization.",
                source_route="https://www.acme.com/about",
                confidence=84,
                trust_score=84,
            )
        ],
        queries=["Acme Inc official website company profile"],
    )

    def fake_call_local_model(prompt: str):  # noqa: ANN001
        assert "Do not invent facts" in prompt
        return (
            '{"summary_markdown":"## Company Profile\\nAcme provides digital ordering (Acme official website).","sources":[{"title":"Acme official website","url":"https://www.acme.com/about","excerpt":"digital ordering","confidence":84}],"confidence":82,"missing_evidence_notes":["Revenue not found."],"follow_up_questions":["Confirm executive sponsor."]}',
            {"usage": {"prompt_tokens": 100, "completion_tokens": 50}},
        )

    summarizer._call_local_model = fake_call_local_model  # type: ignore[method-assign]
    summary = summarizer.summarize(account=account, research_result=research_result, internal_context=[])

    assert summary.confidence == 82
    assert "Company Profile" in summary.summary_markdown
    assert summary.sources[0]["url"] == "https://www.acme.com/about"

    def fake_bad_model(prompt: str):  # noqa: ANN001
        return ("not json", {})

    summarizer._call_local_model = fake_bad_model  # type: ignore[method-assign]
    fallback = summarizer.summarize(account=account, research_result=research_result, internal_context=[])

    assert fallback.error_message
    assert fallback.confidence == 45
    assert "Local summarizer failed" in fallback.summary_markdown


def test_tavily_ollama_research_run_appends_to_draft_and_snapshot(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    session = db_session
    kam_head = session.scalar(select(User).where(User.role == "kam_head"))
    assert kam_head is not None
    account = Account(
        name="Acme Inc",
        project_name="Digital customer experience",
        company_url="https://www.acme.com",
        segment="Enterprise",
        region="North America",
        lifecycle_status="Active",
        commercial_value=250000,
        currency="USD",
        service_context="Modernization program with governance cadence.",
        created_by_id=kam_head.id,
    )
    session.add(account)
    session.commit()

    class FakeTavilyProvider:
        def research(self, *, account, source_documents, retrieved_context, custom_query=None):  # noqa: ANN001
            assert custom_query == "Tell me about Acme Inc in USA"
            return KycResearchResult(
                contexts=[
                    KycResearchContext(
                        source_type="web_research",
                        source_record_id="tavily-acme-official",
                        label="Acme official website",
                        text="Acme provides digital ordering, loyalty personalization, restaurant analytics, and customer engagement platforms.",
                        excerpt="Acme provides digital ordering, loyalty personalization, restaurant analytics, and customer engagement platforms.",
                        source_route="https://www.acme.com/about",
                        confidence=86,
                        trust_score=86,
                        metadata={"provider": "tavily", "query": "Acme Inc official website company profile"},
                    )
                ],
                queries=["Acme Inc official website company profile"],
                metadata={"provider": "tavily", "source_count": 1},
            )

    class FakeSummarizer:
        def summarize(self, *, account, research_result, internal_context):  # noqa: ANN001
            return KycResearchSummary(
                summary_markdown="## Company Profile\nAcme provides digital ordering and loyalty personalization (https://www.acme.com/about).",
                sources=[{"title": "Acme official website", "url": "https://www.acme.com/about", "excerpt": "digital ordering", "confidence": 86}],
                confidence=84,
                missing_evidence_notes=["Revenue was not found in Tavily sources."],
                follow_up_questions=["Confirm executive sponsor."],
                model="qwen3:8b",
                provider="ollama",
                metadata={"usage": {"prompt_tokens": 100, "completion_tokens": 80}},
            )

    monkeypatch.setattr("app.services.kyc.TavilyKycResearchProvider", FakeTavilyProvider)
    monkeypatch.setattr("app.services.kyc.OllamaKycResearchSummarizer", FakeSummarizer)

    service = KycService(session, gateway=DeterministicKycGatewayAdapter())
    draft = service.create_draft(account.id, KycDraftCreateRequest(trigger_source="kyc_page"), kam_head)
    service.update_draft(
        account.id,
        draft.id,
        KycDraftUpdateRequest(detailed_description="<p>Existing reviewer detail.</p>"),
        current_user=kam_head,
    )

    run = service.trigger_web_research(account.id, KycWebResearchCreateRequest(draft_id=draft.id, query="Tell me about Acme Inc in USA"), kam_head)
    assert run.status == "pending"
    assert run.provider["research_only"] is True
    assert run.provider["custom_query"] == "Tell me about Acme Inc in USA"

    processed = service.process_agent_run(run.id, kam_head)
    assert processed.status == "complete"

    updated = service.get_draft(account.id, draft.id, kam_head)
    assert "Existing reviewer detail" in updated.detailed_description
    assert "kyc-research-run:" in updated.detailed_description
    assert "Acme provides digital ordering" in updated.detailed_description
    assert "tavily_web_research" in updated.research_sources
    assert updated.citations[0].source_route == "https://www.acme.com/about"
    assert updated.detailed_description.count("kyc-research-run:") == 1

    approved = service.approve_draft(
        account.id,
        draft.id,
        KycDraftApproveRequest(conflicts_acknowledged=True, low_confidence_acknowledged=True, override_reason="Demo approval."),
        kam_head,
    )
    snapshot = session.scalar(select(KycSnapshot).where(KycSnapshot.id == approved.approved_snapshot_id))
    assert snapshot is not None
    assert "Acme provides digital ordering" in snapshot.detailed_description
    assert session.scalar(select(AuditLog).where(AuditLog.action == "web_research_appended")) is not None
    assert session.scalar(select(TimelineEntry).where(TimelineEntry.event_type == "kyc_web_research")) is not None
