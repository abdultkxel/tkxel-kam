from collections.abc import Generator
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_kyc_service
from app.main import app
from app.models import AuditLog, KycAgentRun, KycDraft, KycSnapshot, KycWorkstreamOutput, SourceDocumentChunk, SourceDocumentExtraction, Stakeholder, TimelineEntry
from app.services.kyc import KycService
from app.services.kyc_gateway import DeterministicKycGatewayAdapter
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

    def override_kyc_service() -> KycService:
        return KycService(db_session, gateway=DeterministicKycGatewayAdapter())

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_kyc_service] = override_kyc_service
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


def seeded_user(client: TestClient, headers: dict[str, str], role: str) -> dict:
    response = client.get("/api/admin/users", headers=headers, params={"role": role, "page": 1, "page_size": 1})
    assert response.status_code == 200
    return response.json()["items"][0]


def onboarding_payload(account_name: str, owner_id: str) -> dict:
    return {
        "account_name": account_name,
        "project_name": "KYC intelligence rollout",
        "company_url": "https://customer.example.com",
        "lifecycle_status": "Onboarding",
        "segment": "Enterprise",
        "region": "North America",
        "service_context": "Modernization program with executive governance.",
        "commercial_summary": "Monthly pod model with renewal review.",
        "commercial_value": 240000,
        "currency": "USD",
        "primary_owner_id": owner_id,
        "source_citation": "Project Charter p1: account and engagement scope.",
        "source_documents": [
            {
                "title": "KYC Project Charter",
                "source_type": "project_charter",
                "file_name": "kyc-charter.pdf",
                "confidence": 91,
                "pages": 8,
                "citations": [
                    {"label": "Charter p1", "page_number": 1, "excerpt": "Executive governance and modernization scope.", "field_key": "project_charters"},
                    {"label": "Charter p2", "page_number": 2, "excerpt": "Client strategy and stakeholder context.", "field_key": "strategy"},
                ],
            },
            {
                "title": "KYC Renewal SOW",
                "source_type": "sow",
                "file_name": "kyc-renewal-sow.pdf",
                "extraction_status": "needs_review",
                "confidence": 84,
                "pages": 16,
                "citations": [
                    {"label": "SOW p6", "page_number": 6, "excerpt": "Renewal, notice window, billing model, and obligations.", "field_key": "renewal_cycle"},
                    {"label": "SOW p7", "page_number": 7, "excerpt": "Support obligations and SLA language.", "field_key": "obligations"},
                ],
            },
        ],
        "engagement_drafts": [
            {
                "name": "KYC intelligence rollout",
                "owner_id": owner_id,
                "service_lines": ["Engineering", "Customer Success"],
                "value": 240000,
                "currency": "USD",
                "delivery_status": "active",
                "confidence": 88,
                "start_date": "2026-05-30T00:00:00Z",
                "end_date": "2026-11-30T00:00:00Z",
                "renewal_date": "2026-11-30T00:00:00Z",
                "notice_deadline": "2026-10-30T00:00:00Z",
                "notice_period_days": 30,
                "source_citation": "SOW p6: delivery and renewal terms.",
            }
        ],
    }


def create_account(client: TestClient, headers: dict[str, str], account_name: str) -> tuple[str, str]:
    owner = seeded_user(client, headers, "account_manager")
    draft_response = client.post("/api/onboarding/drafts", headers=headers, json=onboarding_payload(account_name, owner["id"]))
    assert draft_response.status_code == 201
    approve_response = client.post(f"/api/onboarding/drafts/{draft_response.json()['id']}/approve", headers=headers)
    assert approve_response.status_code == 200
    return approve_response.json()["approved_account_id"], owner["id"]


def test_onboarding_approval_seeds_stakeholder_default_kyc_and_prompt(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Prompt Seed Account")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    stakeholder = db_session.scalar(select(Stakeholder).where(Stakeholder.account_id == account_id))
    assert stakeholder is not None
    assert stakeholder.role == "executive_sponsor"
    assert stakeholder.name

    default_draft = db_session.scalar(select(KycDraft).where(KycDraft.account_id == account_id, KycDraft.trigger_source == "onboarding_draft"))
    assert default_draft is not None
    assert default_draft.source_document_ids
    assert default_draft.detailed_description
    assert default_draft.status == "ready_for_review"

    prompt_response = client.get(f"/api/accounts/{account_id}/kyc/default-prompt", headers=kam_headers)
    assert prompt_response.status_code == 200
    prompt = prompt_response.json()["prompt"]
    assert "KYC Prompt Seed Account" in prompt
    assert "Uploaded SOW/charter/document evidence" in prompt
    assert prompt_response.json()["source_document_ids"]


def test_kyc_draft_approval_creates_snapshot_freshness_logs_and_search(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Northwind")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    missing_freshness = client.get(f"/api/accounts/{account_id}/kyc/freshness", headers=kam_headers)
    assert missing_freshness.status_code == 200
    assert missing_freshness.json()["has_approved_snapshot"] is False

    create_response = client.post(
        f"/api/accounts/{account_id}/kyc/drafts",
        headers=kam_headers,
        json={"trigger_source": "account_overview", "notes": "Validate executive sponsor before sharing."},
    )
    assert create_response.status_code == 201
    draft = create_response.json()
    assert draft["status"] == "ready_for_review"
    assert draft["ai_disclaimer"]
    assert draft["confidence"] >= 70
    assert draft["conflicts"]

    list_response = client.get(
        f"/api/accounts/{account_id}/kyc/drafts",
        headers=kam_headers,
        params={"search": "Competitor", "status": "ready_for_review", "sort": "confidence", "direction": "desc", "page": 1, "page_size": 1},
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] >= 1

    approve_response = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{draft['id']}/approve",
        headers=kam_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True, "change_summary": ["Approved initial KYC baseline."]},
    )
    assert approve_response.status_code == 200
    approved = approve_response.json()
    assert approved["status"] == "approved"
    assert approved["approved_snapshot_id"]

    snapshots = client.get(f"/api/accounts/{account_id}/kyc/snapshots", headers=kam_headers, params={"search": "baseline", "source": "documents", "page": 1, "page_size": 5})
    assert snapshots.status_code == 200
    assert snapshots.json()["total"] == 1
    snapshot_id = snapshots.json()["items"][0]["id"]

    snapshot = client.get(f"/api/accounts/{account_id}/kyc/snapshots/{snapshot_id}", headers=kam_headers)
    assert snapshot.status_code == 200
    assert snapshot.json()["version"] == 1
    assert snapshot.json()["change_summary"] == ["Approved initial KYC baseline."]

    freshness = client.get(f"/api/accounts/{account_id}/kyc/freshness", headers=kam_headers)
    assert freshness.status_code == 200
    assert freshness.json()["has_approved_snapshot"] is True
    assert freshness.json()["freshness_status"] == "fresh"

    account = client.get(f"/api/accounts/{account_id}", headers=kam_headers)
    assert account.status_code == 200
    assert account.json()["governance_completeness"]["current_kyc"] is True

    assert db_session.scalar(select(KycSnapshot).where(KycSnapshot.id == snapshot_id)) is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == snapshot_id, AuditLog.action == "snapshot_create")) is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "kyc_ai_extraction")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.source_record_id == snapshot_id, TimelineEntry.event_type == "kyc_approved")) is not None

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert openapi.json()["paths"]["/api/accounts/{account_id}/kyc/drafts"]["post"]["summary"] == "Create KYC draft"


def test_kyc_approval_validation_and_authorization_are_enforced(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Validation")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")
    am_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    draft_response = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "manual"})
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    update_response = client.patch(
        f"/api/accounts/{account_id}/kyc/drafts/{draft_id}",
        headers=kam_headers,
        json={"fields": [{"key": "company_snapshot", "value": "", "reviewed": True}]},
    )
    assert update_response.status_code == 200
    assert "Company snapshot" in update_response.json()["missing_fields"]

    blocked = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{draft_id}/approve",
        headers=kam_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True},
    )
    assert blocked.status_code == 422
    assert blocked.json()["detail"]["message"] == "KYC approval validation failed"

    unauthorized = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{draft_id}/approve",
        headers=am_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True, "override_reason": "Authorized exception."},
    )
    assert unauthorized.status_code == 403

    approved = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{draft_id}/approve",
        headers=kam_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True, "override_reason": "Company snapshot will be confirmed in next governance review."},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_kyc_agent_runs_support_partial_failure_refresh_filters_and_sensitive_masking(client: TestClient, db_session: Session) -> None:
    class PartialGateway(DeterministicKycGatewayAdapter):
        def run(self, request):  # noqa: ANN001, ANN201 - simple test double
            return super().run(replace(request, research_sources=[*request.research_sources, "fail:financial_landscape"]))

    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Agent Runs")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")
    am_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    def override_kyc_service() -> KycService:
        return KycService(db_session, gateway=PartialGateway())

    app.dependency_overrides[get_kyc_service] = override_kyc_service
    try:
        run_response = client.post(f"/api/accounts/{account_id}/kyc/agent-runs", headers=kam_headers, json={"research_sources": ["Trivoly"]})
    finally:
        app.dependency_overrides[get_kyc_service] = lambda: KycService(db_session, gateway=DeterministicKycGatewayAdapter())
    assert run_response.status_code == 201
    run = run_response.json()
    assert run["status"] == "partial"
    assert any(workstream["workstream_key"] == "financial_landscape" and workstream["status"] == "failed" for workstream in run["workstreams"])

    list_response = client.get(
        f"/api/accounts/{account_id}/kyc/agent-runs",
        headers=kam_headers,
        params={"status": "partial", "workstream": "financial_landscape", "search": "architecture", "page": 1, "page_size": 1},
    )
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    refreshed = client.post(f"/api/accounts/{account_id}/kyc/agent-runs/{run['id']}/refresh", headers=kam_headers)
    assert refreshed.status_code == 200
    assert refreshed.json()["previous_run_id"] == run["id"]

    draft_response = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "account_overview"})
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    am_view = client.get(f"/api/accounts/{account_id}/kyc/drafts/{draft_id}", headers=am_headers)
    assert am_view.status_code == 200
    payment_field = next(field for field in am_view.json()["fields"] if field["key"] == "payment_behaviour")
    assert payment_field["value"] != "Restricted KYC field"

    am_update = client.patch(
        f"/api/accounts/{account_id}/kyc/drafts/{draft_id}",
        headers=am_headers,
        json={"fields": [{"key": "payment_behaviour", "value": "Trying to overwrite hidden finance data."}]},
    )
    assert am_update.status_code == 200

    kam_view = client.get(f"/api/accounts/{account_id}/kyc/drafts/{draft_id}", headers=kam_headers)
    assert kam_view.status_code == 200
    payment_field = next(field for field in kam_view.json()["fields"] if field["key"] == "payment_behaviour")
    assert payment_field["value"] != "Restricted KYC field"


def test_uploaded_source_document_is_stored_extracted_and_downloadable(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Downloadable SOW")

    upload_response = client.post(
        f"/api/accounts/{account_id}/attachments/upload",
        headers=admin_headers,
        data={"source_type": "sow", "title": "Downloadable Test SOW", "extract_now": "true", "is_sensitive": "false"},
        files={"file": ("downloadable-sow.txt", b"SOW says the client needs account intelligence, governance, and KYC research.", "text/plain")},
    )
    assert upload_response.status_code == 201
    document = upload_response.json()
    assert document["file_name"] == "downloadable-sow.txt"
    assert document["storage_backend"] == "local"
    assert document["extraction_status"] == "completed"
    assert document["extracted_text_checksum"]

    download_response = client.get(f"/api/accounts/{account_id}/attachments/{document['id']}/download", headers=admin_headers)
    assert download_response.status_code == 200
    assert download_response.content == b"SOW says the client needs account intelligence, governance, and KYC research."


def test_account_attachment_upload_extracts_and_exposes_chunks(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Upload Extraction")

    upload_response = client.post(
        f"/api/accounts/{account_id}/attachments/upload",
        headers=admin_headers,
        data={"title": "Uploaded SOW", "source_type": "sow", "is_sensitive": "false", "extract_now": "true"},
        files={"file": ("uploaded-sow.txt", b"SOW confirms renewal planning, governance cadence, and delivery obligations.", "text/plain")},
    )

    assert upload_response.status_code == 201
    document = upload_response.json()
    assert document["extraction_status"] == "completed"
    assert document["checksum_sha256"]

    extraction = client.get(f"/api/accounts/{account_id}/attachments/{document['id']}/extraction", headers=admin_headers)
    assert extraction.status_code == 200
    assert extraction.json()["status"] == "completed"

    chunks = client.get(f"/api/accounts/{account_id}/attachments/{document['id']}/chunks", headers=admin_headers, params={"page": 1, "page_size": 10})
    assert chunks.status_code == 200
    assert chunks.json()["total"] >= 1
    assert "renewal planning" in chunks.json()["items"][0]["chunk_text"]

    assert db_session.scalar(select(SourceDocumentExtraction).where(SourceDocumentExtraction.source_document_id == document["id"])) is not None
    assert db_session.scalar(select(SourceDocumentChunk).where(SourceDocumentChunk.source_document_id == document["id"])) is not None


def test_kyc_gateway_exception_creates_reviewable_failed_draft(client: TestClient, db_session: Session) -> None:
    class FailingGateway:
        def run(self, request):  # noqa: ANN001, ANN201 - simple test double
            raise RuntimeError("provider timeout")

    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Gateway Failure")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    def override_kyc_service() -> KycService:
        return KycService(db_session, gateway=FailingGateway())

    app.dependency_overrides[get_kyc_service] = override_kyc_service
    try:
        draft_response = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "account_overview"})
    finally:
        app.dependency_overrides[get_kyc_service] = lambda: KycService(db_session, gateway=DeterministicKycGatewayAdapter())

    assert draft_response.status_code == 201
    draft = draft_response.json()
    assert draft["status"] == "ready_for_review"
    assert draft["confidence"] == 0
    assert "One or more AI KYC workstreams failed during extraction." in draft["conflicts"]
    assert "Industry overview" in draft["missing_fields"]

    run_response = client.get(f"/api/accounts/{account_id}/kyc/agent-runs/{draft['agent_run_id']}", headers=kam_headers)
    assert run_response.status_code == 200
    run = run_response.json()
    assert run["status"] == "failed"
    assert all(workstream["status"] == "failed" for workstream in run["workstreams"])
    assert all("provider timeout" in workstream["error_message"] for workstream in run["workstreams"])

    assert db_session.scalar(select(AuditLog).where(AuditLog.action == "kyc_ai_extraction")) is not None


def test_kyc_reject_preserves_draft_and_requires_reason(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Rejection")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    draft_response = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "account_overview"})
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    invalid_reject = client.post(f"/api/accounts/{account_id}/kyc/drafts/{draft_id}/reject", headers=kam_headers, json={"reason": ""})
    assert invalid_reject.status_code == 422

    rejected = client.post(f"/api/accounts/{account_id}/kyc/drafts/{draft_id}/reject", headers=kam_headers, json={"reason": "Needs finance stakeholder confirmation."})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["rejection_reason"] == "Needs finance stakeholder confirmation."

    listed = client.get(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, params={"status": "rejected", "page": 1, "page_size": 10})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


def test_kyc_snapshot_restore_creates_new_active_version_and_requires_kam_head(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Restore Versioning")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")
    am_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    first_draft = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "account_overview"})
    assert first_draft.status_code == 201
    first_approved = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{first_draft.json()['id']}/approve",
        headers=kam_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True, "change_summary": ["Approved v1."]},
    )
    assert first_approved.status_code == 200
    v1_snapshot_id = first_approved.json()["approved_snapshot_id"]

    second_draft = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "manual"})
    assert second_draft.status_code == 201
    second_approved = client.post(
        f"/api/accounts/{account_id}/kyc/drafts/{second_draft.json()['id']}/approve",
        headers=kam_headers,
        json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True, "change_summary": ["Approved v2."]},
    )
    assert second_approved.status_code == 200
    assert second_approved.json()["approved_snapshot_id"] != v1_snapshot_id

    unauthorized = client.post(
        f"/api/accounts/{account_id}/kyc/snapshots/{v1_snapshot_id}/restore",
        headers=am_headers,
        json={"reason": "Prefer the previous approved version."},
    )
    assert unauthorized.status_code == 403

    invalid = client.post(f"/api/accounts/{account_id}/kyc/snapshots/{v1_snapshot_id}/restore", headers=kam_headers, json={"reason": ""})
    assert invalid.status_code == 422

    restored = client.post(
        f"/api/accounts/{account_id}/kyc/snapshots/{v1_snapshot_id}/restore",
        headers=kam_headers,
        json={"reason": "Previous version has the correct stakeholder and financial context."},
    )
    assert restored.status_code == 200
    restored_body = restored.json()
    assert restored_body["version"] == 3
    assert restored_body["change_summary"][0] == "Restored KYC snapshot v1 as v3."
    assert restored_body["source_context"]["restore_metadata"]["restored_from_snapshot_id"] == v1_snapshot_id

    freshness = client.get(f"/api/accounts/{account_id}/kyc/freshness", headers=kam_headers)
    assert freshness.status_code == 200
    assert freshness.json()["snapshot_version"] == 3
    assert freshness.json()["snapshot_id"] == restored_body["id"]

    active_again = client.post(
        f"/api/accounts/{account_id}/kyc/snapshots/{restored_body['id']}/restore",
        headers=kam_headers,
        json={"reason": "Trying to restore active version."},
    )
    assert active_again.status_code == 400

    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == restored_body["id"], AuditLog.action == "snapshot_restore")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.source_record_id == restored_body["id"], TimelineEntry.event_type == "kyc_restored")) is not None


def test_kyc_configuration_requires_configure_permission_and_normalizes_sources(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")
    am_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    denied = client.get("/api/kyc/configuration", headers=am_headers)
    assert denied.status_code == 403

    config = client.get("/api/kyc/configuration", headers=kam_headers)
    assert config.status_code == 200
    assert "company_snapshot" in config.json()["required_field_keys"]
    assert "core_offerings" in config.json()["required_field_keys"]
    assert "monetization_model" in config.json()["required_field_keys"]
    assert any(field["key"] == "gross_margins" and field["sensitive"] for field in config.json()["field_catalog"])
    assert any(field["key"] == "market_size_growth" for field in config.json()["field_catalog"])

    updated = client.patch(
        "/api/kyc/configuration",
        headers=kam_headers,
        json={
            "freshness_threshold_days": 120,
            "low_confidence_threshold": 65,
            "research_sources": ["documents", "fathom_reviewed", "documents"],
            "required_field_keys": ["company_snapshot", "renewal_cycle"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["freshness_threshold_days"] == 120
    assert updated.json()["research_sources"] == ["documents", "fathom_reviewed"]

    invalid = client.patch("/api/kyc/configuration", headers=admin_headers, json={"required_field_keys": ["not_a_real_field"]})
    assert invalid.status_code == 422

    invalid_source = client.patch("/api/kyc/configuration", headers=admin_headers, json={"research_sources": ["UnapprovedSource"]})
    assert invalid_source.status_code == 422


def test_local_ai_kyc_queue_manual_worker_retry_cancel_and_draft_population(client: TestClient, db_session: Session) -> None:
    class AsyncDeterministicGateway(DeterministicKycGatewayAdapter):
        name = "local-openai-compatible"
        is_async_preferred = True

        def run(self, request):  # noqa: ANN001
            response = super().run(request)
            return replace(
                response,
                metadata={
                    **response.metadata,
                    "model": "qwen3:8b",
                    "detailed_description": "Raw Qwen KYC response for the local queue account.",
                },
            )

    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Local Qwen Queue")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    def override_kyc_service() -> KycService:
        return KycService(db_session, gateway=AsyncDeterministicGateway())

    app.dependency_overrides[get_kyc_service] = override_kyc_service
    try:
        draft_response = client.post(
            f"/api/accounts/{account_id}/kyc/drafts",
            headers=kam_headers,
            json={"trigger_source": "kyc_page", "prompt": "Use the uploaded SOW and stakeholder records to create a detailed KYC."},
        )
        assert draft_response.status_code == 201
        queued_draft = draft_response.json()
        assert queued_draft["confidence"] > 0
        assert queued_draft["agent_run_id"]
        assert "KYC generation is queued" in queued_draft["conflicts"][0]
        assert queued_draft["detailed_description"] == ""
        assert any(field["value"] for field in queued_draft["fields"])
        assert any(field["citations"] for field in queued_draft["fields"])

        pending_run = client.get(f"/api/accounts/{account_id}/kyc/agent-runs/{queued_draft['agent_run_id']}", headers=kam_headers)
        assert pending_run.status_code == 200
        assert pending_run.json()["status"] == "pending"
        assert pending_run.json()["retrieval_summary"]["reviewer_prompt"].startswith("Use the uploaded SOW")
        assert all(workstream["status"] == "pending" for workstream in pending_run.json()["workstreams"])

        processed = client.post("/api/admin/kyc/jobs/run-pending", headers=kam_headers, params={"limit": 1})
        assert processed.status_code == 200
        assert processed.json()["processed_count"] == 1
        assert processed.json()["processed_runs"][0]["status"] == "complete"

        populated_draft = client.get(f"/api/accounts/{account_id}/kyc/drafts/{queued_draft['id']}", headers=kam_headers)
        assert populated_draft.status_code == 200
        assert populated_draft.json()["confidence"] >= 70
        assert any(field["value"] for field in populated_draft.json()["fields"])
        assert "Raw Qwen KYC response for the local queue account." in populated_draft.json()["detailed_description"]
        assert populated_draft.json()["detailed_description"].count("kyc-run:") == 1

        approve = client.post(
            f"/api/accounts/{account_id}/kyc/drafts/{queued_draft['id']}/approve",
            headers=kam_headers,
            json={"conflicts_acknowledged": True, "low_confidence_acknowledged": True},
        )
        assert approve.status_code == 200
        snapshots = client.get(f"/api/accounts/{account_id}/kyc/snapshots", headers=kam_headers)
        assert snapshots.status_code == 200
        assert "Raw Qwen KYC response for the local queue account." in snapshots.json()["items"][0]["detailed_description"]

        retry_run = client.post(f"/api/accounts/{account_id}/kyc/agent-runs/{queued_draft['agent_run_id']}/retry", headers=kam_headers)
        assert retry_run.status_code == 400

        new_run = client.post(f"/api/accounts/{account_id}/kyc/agent-runs", headers=kam_headers, json={"trigger_source": "kyc_page"})
        assert new_run.status_code == 201
        assert new_run.json()["status"] == "pending"
        cancelled = client.post(f"/api/accounts/{account_id}/kyc/agent-runs/{new_run.json()['id']}/cancel", headers=kam_headers)
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        retried = client.post(f"/api/accounts/{account_id}/kyc/agent-runs/{new_run.json()['id']}/retry", headers=kam_headers)
        assert retried.status_code == 200
        assert retried.json()["status"] == "pending"
    finally:
        app.dependency_overrides[get_kyc_service] = lambda: KycService(db_session, gateway=DeterministicKycGatewayAdapter())


def test_stale_running_kyc_run_is_released_before_web_research_queue(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Stale Run Release")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    draft_response = client.post(f"/api/accounts/{account_id}/kyc/drafts", headers=kam_headers, json={"trigger_source": "kyc_page"})
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    stale_started_at = datetime.now(timezone.utc) - timedelta(hours=2)
    stale_run = KycAgentRun(
        account_id=account_id,
        status="running",
        trigger_source="kyc_page",
        source_document_ids=[],
        research_sources=["documents"],
        triggered_by_name="KAM Head User",
        queued_at=stale_started_at,
        started_at=stale_started_at,
        max_retries=1,
        model_name="qwen3:8b",
    )
    db_session.add(stale_run)
    db_session.flush()
    db_session.add(
        KycWorkstreamOutput(
            run_id=stale_run.id,
            account_id=account_id,
            workstream_key="market_research",
            title="Market Research",
            status="running",
            sort_order=1,
            started_at=stale_started_at,
        )
    )
    db_session.commit()

    research_response = client.post(
        f"/api/accounts/{account_id}/kyc/web-research",
        headers=kam_headers,
        json={"draft_id": draft_id},
    )
    assert research_response.status_code == 201
    assert research_response.json()["status"] == "pending"

    db_session.refresh(stale_run)
    assert stale_run.status == "failed"
    assert stale_run.completed_at is not None
    assert "timed out" in (stale_run.error_message or "")
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == stale_run.id, AuditLog.action == "agent_run_timeout_release")) is not None


def test_running_kyc_run_can_be_cancelled(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    account_id, _ = create_account(client, admin_headers, "KYC Running Cancel")
    kam_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")

    started_at = datetime.now(timezone.utc)
    run = KycAgentRun(
        account_id=account_id,
        status="running",
        trigger_source="kyc_page",
        source_document_ids=[],
        research_sources=["documents"],
        triggered_by_name="KAM Head User",
        queued_at=started_at,
        started_at=started_at,
        max_retries=1,
        model_name="qwen3:8b",
    )
    db_session.add(run)
    db_session.flush()
    db_session.add(
        KycWorkstreamOutput(
            run_id=run.id,
            account_id=account_id,
            workstream_key="market_research",
            title="Market Research",
            status="running",
            sort_order=1,
            started_at=started_at,
        )
    )
    db_session.commit()

    response = client.post(f"/api/accounts/{account_id}/kyc/agent-runs/{run.id}/cancel", headers=kam_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["error_message"] == "Cancelled while running."

    db_session.refresh(run)
    assert run.status == "cancelled"
    assert run.completed_at is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == run.id, AuditLog.action == "agent_run_cancel")) is not None
