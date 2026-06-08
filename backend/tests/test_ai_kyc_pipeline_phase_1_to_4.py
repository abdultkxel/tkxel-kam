import json
import logging
from collections.abc import Generator
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, DocumentExtraction, SourceDocument, SourceDocumentChunk, SourceDocumentExtraction, User
from app.services.kyc_document_extraction import KycDocumentExtractionService
from app.services.kyc_embeddings import LocalHashEmbeddingClient
from app.services.kyc_gateway import KycGatewayRequest, LocalOpenAiCompatibleKycGatewayAdapter, OpenAiKycGatewayAdapter
from app.services.kyc_retrieval import KycRetrievalService
from app.services.kyc import KycService
from app.services.kyc_web_research import KycWebResearchService
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


def test_document_extraction_stores_text_metadata_chunks_and_retrieval_context(db_session: Session, tmp_path) -> None:
    session = db_session
    admin = session.scalar(select(User).where(User.role == "super_admin"))
    assert admin is not None
    account = Account(
        name="AI KYC Source Account",
        project_name="Platform modernization",
        segment="Enterprise",
        region="North America",
        lifecycle_status="Active",
        commercial_value=500000,
        currency="USD",
        service_context="Modernization program with governance, renewals, and executive visibility.",
        commercial_summary="Annual SOW with renewal and payment terms.",
        initial_notes="Client wants stronger reporting and stakeholder alignment.",
        created_by_id=admin.id,
    )
    session.add(account)
    session.flush()

    source_file = tmp_path / "sow.txt"
    source_file.write_text(
        "\n".join(
            [
                "Scope of Work",
                "SOW states Tkxel will deliver platform modernization, monthly governance, and executive stakeholder reporting.",
                "Commercial Terms",
                "Contract Value: USD 500000. Payment terms are monthly in arrears.",
                "Renewal Terms",
                "Renewal planning requires a ninety day notice period before expiry.",
                "Deliverables",
                "Executive dashboards, governance cadence, and stakeholder reporting.",
                "Risks",
                "Client data access dependency and approval delays.",
            ]
        ),
        encoding="utf-8",
    )
    document = SourceDocument(
        account_id=account.id,
        title="Demo SOW",
        source_type="sow",
        file_name=source_file.name,
        storage_backend="local",
        storage_path=str(source_file),
        mime_type="text/plain",
        uploaded_by_id=admin.id,
        uploaded_by_name=admin.full_name,
        extraction_status="queued",
        confidence=90,
        pages=0,
        is_sensitive=False,
    )
    session.add(document)
    session.commit()

    extraction = KycDocumentExtractionService(session).extract_document(document, force=True)
    chunks = KycDocumentExtractionService(session).chunk_document(document, extraction=extraction, force=True)
    session.commit()

    assert extraction.status == "completed"
    assert "platform modernization" in (extraction.normalized_text or "")
    assert document.extraction_status == "completed"
    assert document.checksum_sha256
    assert chunks
    section_labels = {chunk.section_label for chunk in chunks}
    assert "Scope of Work" in section_labels
    assert "Commercial Terms" in section_labels
    assert "Renewal Terms" in section_labels
    assert "Deliverables" in section_labels
    assert "Risks And Assumptions" in section_labels
    commercial_chunk = next(chunk for chunk in chunks if chunk.section_label == "Commercial Terms")
    assert commercial_chunk.sensitivity_level == "commercial"
    assert commercial_chunk.embedding_provider == "local_hash"
    assert commercial_chunk.embedding_model
    assert commercial_chunk.embedding_json
    assert commercial_chunk.embedding_hash == commercial_chunk.chunk_hash
    assert commercial_chunk.metadata_json["chunk_strategy"] == "section_page_token"
    assert commercial_chunk.metadata_json["document_extraction_id"]
    assert commercial_chunk.metadata_json["source_file"] == "sow.txt"
    assert commercial_chunk.page_number == 1
    assert session.scalar(select(SourceDocumentExtraction).where(SourceDocumentExtraction.source_document_id == document.id)) is not None
    assert session.scalar(select(SourceDocumentChunk).where(SourceDocumentChunk.source_document_id == document.id)) is not None

    session.refresh(account)
    context = KycRetrievalService(session, embedding_client=LocalHashEmbeddingClient()).prepare_context(
        account=account,
        source_documents=[document],
        current_user=admin,
        workstreams=[{"key": "client_research", "title": "Client Research"}],
        can_view_sensitive=True,
    )
    assert context
    assert any(item.get("source_chunk_id") for item in context)
    assert any("monthly governance" in item.get("text", "") for item in context)


def test_kyc_rag_retrieves_top_workstream_chunks_and_enforces_sensitive_filter(db_session: Session, tmp_path) -> None:
    session = db_session
    admin = session.scalar(select(User).where(User.role == "super_admin"))
    assert admin is not None
    account = Account(
        name="RAG Phase Six Account",
        project_name="Service expansion",
        segment="Enterprise",
        region="North America",
        lifecycle_status="Active",
        commercial_value=725000,
        currency="USD",
        service_context="Dedicated engineering and governance program.",
        commercial_summary="Commercial terms should only be visible to authorized reviewers.",
        created_by_id=admin.id,
    )
    session.add(account)
    session.flush()

    source_file = tmp_path / "rag-sow.txt"
    source_file.write_text(
        "\n".join(
            [
                "Scope of Work",
                "Tkxel will provide a dedicated delivery team, governance cadence, service desk improvements, and executive reporting.",
                "Stakeholders",
                "Client sponsor is the VP of Digital. Tkxel stakeholders include the AM, delivery lead, and solution architect.",
                "Commercial Terms",
                "Contract Value: USD 725000. Billing is monthly in arrears with payment due net thirty.",
                "Renewal Terms",
                "The engagement auto renews annually unless either party provides ninety days notice before expiry.",
                "Deliverables",
                "Release automation, dashboard modernization, governance packs, and integration support.",
                "Risks",
                "Data access, third-party API readiness, and delayed approvals may affect delivery milestones.",
            ]
        ),
        encoding="utf-8",
    )
    document = SourceDocument(
        account_id=account.id,
        title="RAG Demo SOW",
        source_type="sow",
        file_name=source_file.name,
        storage_backend="local",
        storage_path=str(source_file),
        mime_type="text/plain",
        uploaded_by_id=admin.id,
        uploaded_by_name=admin.full_name,
        extraction_status="queued",
        confidence=92,
        pages=0,
        is_sensitive=False,
    )
    session.add(document)
    session.commit()

    extraction_service = KycDocumentExtractionService(session)
    extraction = extraction_service.extract_document(document, force=True)
    extraction_service.chunk_document(document, extraction=extraction, force=True)
    session.commit()

    retrieval = KycRetrievalService(session, embedding_client=LocalHashEmbeddingClient())
    contexts_by_workstream = retrieval.prepare_workstream_contexts(
        account=account,
        source_documents=[document],
        current_user=admin,
        workstreams=[
            {"key": "tkxel_engagement", "title": "Tkxel Engagement with Client"},
            {"key": "stakeholder_details", "title": "Stakeholder Details"},
            {"key": "financial_landscape", "title": "Financial Landscape"},
        ],
        can_view_sensitive=True,
        top_k_per_workstream=20,
    )

    assert set(contexts_by_workstream) == {"tkxel_engagement", "stakeholder_details", "financial_landscape"}
    assert all(len(items) <= 10 for items in contexts_by_workstream.values())
    financial_contexts = contexts_by_workstream["financial_landscape"]
    engagement_contexts = contexts_by_workstream["tkxel_engagement"]
    stakeholder_contexts = contexts_by_workstream["stakeholder_details"]
    assert any(item.get("section_label") in {"Commercial Terms", "Renewal Terms"} for item in financial_contexts)
    assert any(item.get("section_label") in {"Scope of Work", "Deliverables"} for item in engagement_contexts)
    assert any(item.get("section_label") == "Stakeholders And Responsibilities" or "stakeholder" in item.get("text", "").lower() for item in stakeholder_contexts)
    assert all("financial_landscape" in item.get("matched_workstreams", []) for item in financial_contexts)
    assert all(item.get("retrieval_score") is not None and item.get("retrieval_query") for item in financial_contexts)
    assert all(item.get("rank_reason") for item in financial_contexts)

    restricted_contexts = retrieval.prepare_workstream_contexts(
        account=account,
        source_documents=[document],
        current_user=admin,
        workstreams=[{"key": "financial_landscape", "title": "Financial Landscape"}],
        can_view_sensitive=False,
        top_k_per_workstream=20,
    )["financial_landscape"]
    restricted_text = "\n".join(item.get("text", "") for item in restricted_contexts)
    assert "Contract Value: USD 725000" not in restricted_text
    assert all(item.get("sensitivity_level") != "commercial" for item in restricted_contexts)


def test_pdf_extraction_uses_page_aware_text_and_stores_document_extractions(db_session: Session, tmp_path) -> None:
    fitz = pytest.importorskip("fitz")
    session = db_session
    admin = session.scalar(select(User).where(User.role == "super_admin"))
    assert admin is not None

    source_file = tmp_path / "demo-sow.pdf"
    pdf = fitz.open()
    first_page = pdf.new_page()
    first_page.insert_text((72, 72), "Client name: McDonald's Corporation\nContract Terms\nCommercial value USD 185000")
    second_page = pdf.new_page()
    second_page.insert_text((72, 72), "Renewal Terms\nAuto renewal requires eight weeks notice before expiry.")
    pdf.save(source_file)
    pdf.close()

    document = SourceDocument(
        title="Demo PDF SOW",
        source_type="sow",
        file_name=source_file.name,
        storage_backend="local",
        storage_path=str(source_file),
        mime_type="application/pdf",
        uploaded_by_id=admin.id,
        uploaded_by_name=admin.full_name,
        extraction_status="queued",
        confidence=90,
        pages=0,
        is_sensitive=False,
    )
    session.add(document)
    session.commit()

    extraction = KycDocumentExtractionService(session).extract_document(document, force=True)
    page_rows = list(
        session.scalars(
            select(DocumentExtraction)
            .where(DocumentExtraction.document_id == document.id)
            .order_by(DocumentExtraction.page_number)
        )
    )

    assert extraction.status == "completed"
    assert extraction.page_count == 2
    assert extraction.metadata_json["extractor_stack"] == "pymupdf"
    assert "McDonald's Corporation" in (extraction.raw_text or "")
    assert "Renewal Terms" in (extraction.raw_text or "")
    assert len(page_rows) == 2
    assert page_rows[0].page_number == 1
    assert page_rows[0].source_file == "demo-sow.pdf"
    assert page_rows[0].checksum
    assert page_rows[0].metadata_json["extractor"] == "pymupdf"
    assert "Commercial value" in page_rows[0].raw_text
    assert "eight weeks notice" in page_rows[1].raw_text


def test_docx_extraction_reads_paragraphs_tables_and_stores_document_extractions(db_session: Session, tmp_path) -> None:
    docx = pytest.importorskip("docx")
    session = db_session
    admin = session.scalar(select(User).where(User.role == "super_admin"))
    assert admin is not None

    source_file = tmp_path / "demo-charter.docx"
    document_file = docx.Document()
    document_file.add_heading("Project Charter", level=1)
    document_file.add_paragraph("Client name: McDonald's Corporation")
    document_file.add_paragraph("Deliverables include mobile ordering, loyalty personalization, and release automation.")
    table = document_file.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Start Date"
    table.cell(0, 1).text = "07/01/2026"
    table.cell(1, 0).text = "Notice Period"
    table.cell(1, 1).text = "56 days"
    document_file.save(source_file)

    source_document = SourceDocument(
        title="Demo DOCX Charter",
        source_type="project_charter",
        file_name=source_file.name,
        storage_backend="local",
        storage_path=str(source_file),
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        uploaded_by_id=admin.id,
        uploaded_by_name=admin.full_name,
        extraction_status="queued",
        confidence=90,
        pages=0,
        is_sensitive=False,
    )
    session.add(source_document)
    session.commit()

    extraction = KycDocumentExtractionService(session).extract_document(source_document, force=True)
    page_rows = list(session.scalars(select(DocumentExtraction).where(DocumentExtraction.document_id == source_document.id)))

    assert extraction.status == "completed"
    assert extraction.page_count == 1
    assert source_document.ocr_status == "not_required"
    assert "loyalty personalization" in (extraction.raw_text or "")
    assert "Start Date | 07/01/2026" in (extraction.raw_text or "")
    assert len(page_rows) == 1
    assert page_rows[0].page_number == 1
    assert page_rows[0].source_file == "demo-charter.docx"
    assert page_rows[0].metadata_json["extractor"] == "python-docx"
    assert page_rows[0].checksum


def test_openai_adapter_enforces_schema_and_source_bound_citations() -> None:
    adapter = object.__new__(OpenAiKycGatewayAdapter)
    adapter.settings = SimpleNamespace(
        ai_kyc_model="gpt-5-mini",
        ai_kyc_max_input_tokens=35000,
        ai_kyc_max_output_tokens=4000,
        ai_kyc_temperature=0.2,
        ai_kyc_timeout_seconds=30,
        ai_kyc_max_retries=0,
        ai_kyc_retry_backoff_seconds=0,
    )

    def fake_call_openai(prompt: str):  # noqa: ANN001
        assert "Do not perform additional web search" in prompt
        assert "Account Information Reference style guide" in prompt
        assert "target_depth" in prompt
        return (
            json.dumps(
                {
                    "status": "complete",
                    "workstreams": [
                        {
                            "workstream_key": "client_research",
                            "title": "Client Research",
                            "status": "complete",
                            "confidence": 86,
                            "fields": [
                                {
                                    "key": "company_snapshot",
                                    "value": "The client is pursuing platform modernization with monthly governance.",
                                    "confidence": 86,
                                    "citations": [
                                        {
                                            "source_document_id": "doc-1",
                                            "source_chunk_id": "chunk-1",
                                            "label": "Demo SOW",
                                            "excerpt": "platform modernization with monthly governance",
                                            "confidence": 86,
                                        }
                                    ],
                                    "missing_evidence_note": "",
                                    "conflicts": [],
                                    "reviewer_notes": ["Validate stakeholder names before approval."],
                                    "suggested_follow_up_questions": ["Who is the executive sponsor?"],
                                }
                            ],
                            "missing_fields": [],
                            "conflicts": [],
                        }
                    ],
                }
            ),
            {"response_id": "resp-1", "usage": {"input_tokens": 100, "output_tokens": 80}},
        )

    adapter._call_openai = fake_call_openai  # type: ignore[method-assign]
    request = KycGatewayRequest(
        account_context={
            "id": "acct-1",
            "name": "Demo Client",
            "field_catalog": [{"key": "company_snapshot", "label": "Company snapshot", "workstream_key": "client_research"}],
        },
        source_documents=[{"id": "doc-1", "title": "Demo SOW", "source_type": "sow"}],
        prior_snapshot_fields={},
        research_sources=["documents"],
        requester_id="user-1",
        requester_role="kam_head",
        trigger_source="kyc_page",
        can_view_sensitive=True,
        workstreams=[{"key": "client_research", "title": "Client Research", "sort_order": 1}],
        retrieved_context=[
            {
                "source_type": "source_document",
                "source_document_id": "doc-1",
                "source_chunk_id": "chunk-1",
                "source_record_id": "doc-1",
                "label": "Demo SOW",
                "text": "platform modernization with monthly governance",
                "excerpt": "platform modernization with monthly governance",
            }
        ],
    )

    response = adapter.run(request)

    assert response.status == "complete"
    assert response.metadata["provider_response_id"] == "resp-1"
    workstream = response.workstreams[0]
    assert workstream.status == "complete"
    assert workstream.output["company_snapshot"]["confidence"] == 86
    assert workstream.citations[0]["source_chunk_id"] == "chunk-1"


def test_local_ollama_adapter_falls_back_when_model_returns_invalid_json() -> None:
    adapter = object.__new__(LocalOpenAiCompatibleKycGatewayAdapter)
    adapter.settings = SimpleNamespace(
        ai_kyc_provider="ollama",
        ai_kyc_base_url="http://ollama:11434/v1",
        ai_kyc_model="qwen3:0.6b",
        ai_kyc_max_input_tokens=35000,
        ai_kyc_max_output_tokens=768,
        ai_kyc_temperature=0,
        ai_kyc_timeout_seconds=30,
        ai_kyc_max_retries=0,
        ai_kyc_retry_backoff_seconds=0,
        ai_kyc_retrieval_top_k=2,
    )

    def fake_call_ollama_native(prompt: str, *, max_output_tokens: int | None = None):  # noqa: ANN001
        assert "Return only valid JSON" in prompt
        assert "Account Information Reference style" in prompt
        assert "25-55 words" in prompt
        assert "payment terms hidden from client research" not in prompt
        return (
            '{"status":"complete","fields":[{"key":"company_snapshot","value":"unterminated"',
            {"usage": {"prompt_eval_count": 10, "eval_count": 5}, "latency_ms": 1},
        )

    adapter._call_ollama_native = fake_call_ollama_native  # type: ignore[method-assign]
    request = KycGatewayRequest(
        account_context={
            "id": "acct-1",
            "name": "Demo Client",
            "field_catalog": [{"key": "company_snapshot", "label": "Company snapshot", "workstream_key": "client_research"}],
        },
        source_documents=[{"id": "doc-1", "title": "Demo SOW", "source_type": "sow"}],
        prior_snapshot_fields={},
        research_sources=["documents"],
        requester_id="user-1",
        requester_role="kam_head",
        trigger_source="kyc_page",
        can_view_sensitive=True,
        workstreams=[{"key": "client_research", "title": "Client Research", "sort_order": 1}],
        retrieved_context=[
            {
                "source_type": "source_document",
                "source_document_id": "doc-1",
                "source_chunk_id": "chunk-1",
                "source_record_id": "doc-1",
                "label": "Demo SOW",
                "text": "The SOW covers platform modernization, governance, renewal planning, and executive reporting.",
                "excerpt": "platform modernization, governance, renewal planning, and executive reporting",
                "matched_workstreams": ["client_research"],
                "retrieval_score": 90,
            },
            {
                "source_type": "source_document",
                "source_document_id": "doc-1",
                "source_chunk_id": "chunk-financial",
                "source_record_id": "doc-1",
                "label": "Demo SOW",
                "text": "payment terms hidden from client research",
                "excerpt": "payment terms hidden from client research",
                "matched_workstreams": ["financial_landscape"],
                "retrieval_score": 999,
            }
        ],
    )

    response = adapter.run(request)

    assert response.status == "complete"
    assert response.metadata["schema_fallback_count"] == 1
    workstream = response.workstreams[0]
    assert workstream.status == "complete"
    assert "platform modernization" in workstream.output["company_snapshot"]["value"]
    assert workstream.output["company_snapshot"]["confidence"] <= 55
    assert workstream.citations[0]["source_chunk_id"] == "chunk-1"


def test_local_ollama_verbose_logging_emits_prompt_and_response(caplog) -> None:  # noqa: ANN001
    adapter = object.__new__(LocalOpenAiCompatibleKycGatewayAdapter)
    adapter.settings = SimpleNamespace(
        ai_kyc_provider="ollama",
        ai_kyc_base_url="http://ollama:11434/v1",
        ai_kyc_model="qwen3:8b",
        ai_kyc_max_input_tokens=35000,
        ai_kyc_max_output_tokens=1200,
        ai_kyc_temperature=0,
        ai_kyc_timeout_seconds=30,
        ai_kyc_max_retries=0,
        ai_kyc_retry_backoff_seconds=0,
        ai_kyc_retrieval_top_k=2,
        ai_kyc_verbose_logging=True,
        ai_kyc_verbose_log_max_chars=20000,
    )

    def fake_call_ollama_native(prompt: str, *, max_output_tokens: int | None = None):  # noqa: ANN001
        assert "platform modernization" in prompt
        assert "maximum detail from the extracted document text" in prompt
        assert "Tavily/API-backed web context" in prompt
        assert "direct Google scraping" in prompt
        assert "unofficial LinkedIn scraping" in prompt
        assert "uncredentialed ZoomInfo access" in prompt
        return (
            json.dumps(
                {
                    "status": "complete",
                    "fields": [
                        {
                            "key": "company_snapshot",
                            "value": "Detailed source-backed account profile for platform modernization, governance, renewal planning, and executive reporting.",
                            "confidence": 82,
                            "missing_evidence_note": "",
                            "suggested_follow_up_questions": ["Confirm executive sponsor."],
                        }
                    ],
                    "missing_fields": [],
                }
            ),
            {"usage": {"prompt_eval_count": 20, "eval_count": 15}, "latency_ms": 7},
        )

    adapter._call_ollama_native = fake_call_ollama_native  # type: ignore[method-assign]
    request = KycGatewayRequest(
        account_context={
            "id": "acct-1",
            "name": "Demo Client",
            "field_catalog": [{"key": "company_snapshot", "label": "Company snapshot", "workstream_key": "client_research"}],
        },
        source_documents=[{"id": "doc-1", "title": "Demo SOW", "source_type": "sow"}],
        prior_snapshot_fields={},
        research_sources=["documents"],
        requester_id="user-1",
        requester_role="kam_head",
        trigger_source="kyc_page",
        can_view_sensitive=True,
        workstreams=[{"key": "client_research", "title": "Client Research", "sort_order": 1}],
        retrieved_context=[
            {
                "source_type": "source_document",
                "source_document_id": "doc-1",
                "source_chunk_id": "chunk-1",
                "source_record_id": "doc-1",
                "label": "Demo SOW",
                "text": "The SOW covers platform modernization, governance, renewal planning, and executive reporting.",
                "excerpt": "platform modernization, governance, renewal planning, and executive reporting",
            }
        ],
    )

    prepared_prompts = adapter.debug_prompt_sections(request)
    assert prepared_prompts[0]["status"] == "prompt_prepared"
    assert "platform modernization" in prepared_prompts[0]["prompt"]
    assert "maximum detail from the extracted document text" in prepared_prompts[0]["prompt"]

    with caplog.at_level(logging.INFO):
        response = adapter.run(request)

    logs = "\n".join(record.message for record in caplog.records)
    assert response.status == "complete"
    assert "[AI_KYC_VERBOSE] local_ollama.run.start" in logs
    assert "[AI_KYC_VERBOSE] local_ollama.workstream.prompt" in logs
    assert "platform modernization" in logs
    assert "[AI_KYC_VERBOSE] local_ollama.workstream.raw_response_text" in logs
    assert "Detailed source-backed account profile" in logs


def test_web_research_contexts_preserve_cited_urls_for_kyc_retrieval() -> None:
    service = object.__new__(KycWebResearchService)
    service.settings = SimpleNamespace(ai_kyc_web_research_max_sources=2)
    account = SimpleNamespace(id="acct-1")

    contexts = service._contexts_from_output(  # noqa: SLF001
        account=account,
        output_text="Acme has public product pages and recent business coverage.",
        annotations=[
            {"title": "Acme product page", "url": "https://example.com/products"},
            {"title": "Acme news", "url": "https://news.example.com/acme"},
        ],
        sources=[],
    )

    assert len(contexts) == 2
    assert contexts[0]["source_type"] == "web_research"
    assert contexts[0]["source_route"] == "https://example.com/products"
    assert contexts[0]["source_record_id"].startswith("web-")


def test_kyc_gateway_failure_fallback_uses_retrieved_contexts_for_reviewable_draft() -> None:
    service = object.__new__(KycService)
    service.settings = SimpleNamespace(ai_kyc_model="qwen3:8b")
    service.gateway = SimpleNamespace(name="local-openai-compatible")
    account = SimpleNamespace(id="acct-1", name="McDonald's Corporation")
    started_at = datetime.now(timezone.utc)
    request = KycGatewayRequest(
        account_context={
            "id": "acct-1",
            "name": "McDonald's Corporation",
            "field_catalog": [{"key": "company_snapshot", "label": "Company snapshot", "workstream_key": "client_research"}],
        },
        source_documents=[{"id": "doc-1", "title": "McDonald's narrative SOW", "source_type": "sow"}],
        prior_snapshot_fields={},
        research_sources=["documents", "approved_web_research"],
        requester_id="user-1",
        requester_role="kam_head",
        trigger_source="kyc_page",
        can_view_sensitive=True,
        workstreams=[{"key": "client_research", "title": "Client Research", "sort_order": 2}],
        retrieved_context=[
            {
                "source_type": "source_document",
                "source_document_id": "doc-1",
                "source_chunk_id": "chunk-sow-1",
                "source_record_id": "doc-1",
                "label": "McDonald's narrative SOW",
                "text": "The SOW describes a digital restaurant modernization program with mobile ordering, loyalty personalization, governance cadence, renewal planning, and executive reporting.",
                "excerpt": "digital restaurant modernization program with mobile ordering",
                "confidence": 92,
                "trust_score": 92,
            },
            {
                "source_type": "web_research",
                "source_record_id": "web-1",
                "label": "McDonald's corporate website",
                "source_route": "https://www.mcdonalds.com/",
                "text": "McDonald's operates a global restaurant system and digital customer experience channels, including mobile app, ordering, loyalty, and customer engagement programs.",
                "excerpt": "global restaurant system and digital customer experience channels",
                "confidence": 78,
                "trust_score": 78,
            },
        ],
    )

    response = service._gateway_failure_fallback_response(  # noqa: SLF001
        account,
        request,
        "AI/LLM Gateway failure: timed out waiting for Qwen.",
        started_at=started_at,
    )

    assert response is not None
    assert response.status == "partial"
    assert response.metadata["adapter"] == "local-openai-compatible-retrieved-context-fallback"
    assert "Provider issue: AI/LLM Gateway failure" in response.metadata["detailed_description"]
    assert "McDonald's corporate website" in response.metadata["detailed_description"]
    client_research = next(result for result in response.workstreams if result.workstream_key == "client_research")
    assert client_research.status == "complete"
    assert "company_snapshot" in client_research.output
    assert "mobile app" in client_research.output["company_snapshot"]["value"]
    assert client_research.output["company_snapshot"]["conflicts"] == ["AI/LLM Gateway failure: timed out waiting for Qwen."]
    assert client_research.citations[0]["source_route"] == "https://www.mcdonalds.com/"
