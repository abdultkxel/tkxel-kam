import json
from collections.abc import Generator
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, SourceDocument, SourceDocumentChunk, SourceDocumentExtraction, User
from app.services.kyc_document_extraction import KycDocumentExtractionService
from app.services.kyc_embeddings import LocalHashEmbeddingClient
from app.services.kyc_gateway import KycGatewayRequest, OpenAiKycGatewayAdapter
from app.services.kyc_retrieval import KycRetrievalService
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
        "SOW states Tkxel will deliver platform modernization, monthly governance, "
        "renewal planning, payment terms, and executive stakeholder reporting.",
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
        assert "Do not use web search" in prompt
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
