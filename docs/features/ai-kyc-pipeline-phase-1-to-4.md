# AI KYC Pipeline Phase 1-4

## Summary

Phases 1-4 replace the purely placeholder KYC gateway path with production-oriented plumbing for source ingestion, text extraction, chunking/retrieval, and a swappable OpenAI-backed KYC adapter. The implementation keeps the deterministic adapter available for tests/offline demos and uses OpenAI only when `AI_KYC_PROVIDER=openai` is configured.

## Scope

- In scope:
  - OpenAI provider adapter for source-bound KYC generation.
  - Environment-driven AI KYC model, provider, retry, token, and retrieval settings.
  - PDF, DOCX, and text extraction service with OCR fallback for low-text PDFs.
  - Source extraction metadata and chunk storage in the database.
  - Local hash embeddings for tests/offline fallback and OpenAI embeddings for configured environments.
  - Hybrid retrieval from source documents, account context, engagements, timeline history, Fathom approved imports, and prior KYC snapshots.
  - Account attachment upload/extract/chunk API endpoints.
  - KYC run metadata for provider, usage, and retrieval summary.
- Out of scope:
  - Phase 5 strict prompt tuning against final sample KYC documents.
  - Phase 6 production Redis/Celery worker replacement.
  - Phase 7+ UI review redesign beyond existing KYC draft/review screens.
  - LinkedIn, ZoomInfo, Crunchbase, or Travoly/Trivoly direct integrations.

## Requirement Links

- Related plan: `docs/plans/ai-kyc-pipeline-implementation-plan.md`
- Readiness review: `docs/plans/phase-1-to-4-readiness-review.md`
- Spec: `specs/02-kyc-and-ai-extraction.md`

## User Flow

An authorized account user uploads an SOW, charter, or attachment from the account documents area. The backend stores the file locally, records checksum and extraction metadata, extracts readable text, chunks the text, and makes those chunks available to KYC retrieval. When KYC is triggered with OpenAI enabled, the KYC service gathers ranked source chunks and sends only the supplied source context to the OpenAI adapter, which must return source-cited workstream fields.

## Backend Plan

- Routers:
  - `backend/app/routers/accounts.py`
  - `backend/app/routers/kyc.py`
- Services:
  - `backend/app/services/accounts.py`
  - `backend/app/services/kyc.py`
  - `backend/app/services/kyc_document_extraction.py`
  - `backend/app/services/kyc_embeddings.py`
  - `backend/app/services/kyc_gateway.py`
  - `backend/app/services/kyc_retrieval.py`
- Repositories:
  - Existing `AccountRepository` and `KycRepository` remain in use.
- Schemas/validation:
  - `backend/app/schemas.py`
- Helpers:
  - Extraction, token estimation, trust scoring, embedding normalization, and cosine similarity helpers live in the KYC service files.

## API Documentation

- Added Swagger metadata for:
  - `POST /api/accounts/{account_id}/attachments/upload`
  - `POST /api/accounts/{account_id}/attachments/{attachment_id}/extract`
  - `GET /api/accounts/{account_id}/attachments/{attachment_id}/extraction`
  - `GET /api/accounts/{account_id}/attachments/{attachment_id}/chunks`

## Database Plan

- Tables:
  - `source_document_extractions`
  - `source_document_chunks`
- Columns:
  - Added storage, checksum, extraction, OCR, provider, retrieval, reviewer-note, and chunk-reference metadata.
- Migrations:
  - `backend/migrations/20260603_ai_kyc_pipeline_phase_1_to_4.sql`
- Snake_case schema check:
  - New tables and columns use snake_case.

## Frontend Plan

- Current phase exposes backend APIs and persisted records.
- Existing document/KYC UI can consume expanded source document and KYC run payloads.
- Later phases should add richer KYC run status, citation drill-down, and extraction management UI.

## Validation And Errors

- Uploads reject empty files, unsupported content types, files over 25 MB, unsupported source types, and unavailable storage.
- Extraction records failed status and error messages instead of replacing approved KYC snapshots.
- Sensitive source extraction/chunk access honors KYC sensitive-field visibility for KAM Head, AM, Admin, and Super Admin.
- OpenAI adapter rejects malformed JSON and source citations that do not reference supplied documents, chunks, or platform records.
- OpenAI adapter enforces input token limits and can enforce a per-run budget when estimated input/output token cost rates are configured through env variables.

## Tests

- Backend tests:
  - `backend/tests/test_ai_kyc_pipeline_phase_1_to_4.py`
  - `backend/tests/test_kyc_ai_extraction.py`
- Covered:
  - Text extraction storage.
  - Chunk creation.
  - Retrieval context with local embeddings.
  - OpenAI adapter source-bound schema normalization.
  - Existing KYC draft, approval, run, refresh, validation, authorization, rejection, and configuration behavior.

## Linting And Quality

- Test command run:
  - `cd backend && .venv/bin/python -m pytest tests/test_ai_kyc_pipeline_phase_1_to_4.py tests/test_kyc_ai_extraction.py -q`
- Result:
  - `9 passed`
- Known tradeoffs:
  - Embeddings are stored as JSON arrays for MVP portability; production can move to `pgvector`.
  - KYC generation remains synchronous in the existing KYC service path until the later Redis/Celery worker phase.
  - OCR support depends on Poppler and Tesseract availability in the runtime image.
  - Budget estimation requires configured token-price rates; defaults are `0` to avoid hard-coding provider pricing.

## Open Questions

- Which final OpenAI model should be locked for demo cost and output quality after live testing?
- Should Phase 5 use OpenAI structured output mode once the final strict schema is tuned against reference documents?
- Should production vector search use `pgvector`, an external vector DB, or remain JSON-backed for pre-prod?

## Handoff Notes

- Setup notes:
  - Configure `AI_KYC_PROVIDER=openai` and `AI_KYC_API_KEY` in local ignored env files to enable live OpenAI calls.
  - Use `AI_KYC_PROVIDER=deterministic_local` for offline demos and tests.
- Manual verification:
  - Upload a text/PDF/DOCX source under an account.
  - Trigger extraction.
  - Confirm extraction/chunks are stored in DB.
  - Trigger a KYC run with OpenAI configured.
  - GPT-5-family models are called without `temperature`, because current Responses API rejects that parameter for `gpt-5-mini`.
  - Live smoke test reached OpenAI but returned `429 insufficient_quota`; add billing/quota or use another funded key before expecting populated AI fields.
- Follow-ups:
  - Implement Redis-backed async worker lifecycle.
  - Add UI citation drill-down and extraction status indicators.
  - Tune prompts against `requirements/Account Informationn Reference .pdf` and SOW reference documents.
