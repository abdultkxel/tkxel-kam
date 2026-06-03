# Production AI KYC Pipeline Implementation Plan

Status: Planning only. No application code, package installation, database schema, external API call, or integration behavior has been changed.

## Evidence Reviewed

- Current KYC service and gateway: `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py`, `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py`.
- Current KYC persistence: `backend/app/models.py`, `backend/app/schemas.py`.
- Current account source document and attachment handling: `backend/app/routers/accounts.py`, `backend/app/services/accounts.py`, `backend/app/repositories/accounts.py`, `frontend/src/components/account/AccountWorkspacePanel.tsx`.
- Current storage helper: `backend/app/services/storage.py`.
- Current AI assistance and AI gateway run logging: `backend/app/services/ai_assistance.py`, `backend/app/routers/ai.py`, `backend/app/services/integrations.py`, `backend/app/models.py`.
- Current Fathom integration and review flow: `backend/app/services/integrations.py`, `backend/app/routers/integrations.py`.
- Current local workers/jobs: `backend/app/main.py`, `docs/demo/integration-verification-report.md`.
- Current RBAC/audit/timeline patterns: `backend/app/services/account_access.py`, `backend/app/services/audit.py`, `backend/app/services/timeline.py`.
- Frontend KYC UI and tests: `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCAgentOverview.tsx`, `frontend/src/services/kyc.ts`, `frontend/src/types/kyc.ts`, `frontend/src/components/account/KYCAssistedReview.test.tsx`.
- Specifications and requirements: `specs/02-kyc-and-ai-extraction.md`, `specs/08-ai-assistance-and-forecasting.md`, `specs/09-approved-integrations.md`, `requirements/KAM PRD.pdf`, `requirements/Technical Module Logic and Developer Flows.pdf`, `requirements/KAM_USER_STORIES.md`.

## 1. Current KYC Architecture Summary

The current KYC implementation is structurally solid but not production-grade AI yet.

What exists:
- `backend/app/services/kyc.py` owns KYC draft creation, update, approval, rejection, freshness, configuration, agent runs, workstream outputs, audit logs, and timeline events.
- `backend/app/services/kyc_gateway.py` defines `KycGatewayAdapter` and a `DeterministicKycGatewayAdapter`.
- `backend/app/routers/kyc.py` exposes KYC drafts, snapshots, freshness, configuration, and agent-run APIs.
- `backend/app/models.py` contains `KycDraft`, `KycSnapshot`, `KycAgentRun`, `KycWorkstreamOutput`, and `KycConfiguration`.
- `backend/app/models.py` contains `SourceDocument` and `SourceCitation` for account/engagement/onboarding source evidence.
- `backend/app/services/accounts.py` supports adding/listing/deleting account attachments as `SourceDocument` records.
- `backend/app/services/integrations.py` contains `AiGatewayRun` logging for AI observability.
- `frontend/src/components/account/KYCAssistedReview.tsx` provides draft list, search/filter/sort/pagination, freshness, snapshot history, field editing, approval, rejection, and loading/error/empty states.

How current KYC data flows:
1. Frontend calls `POST /api/accounts/{account_id}/kyc/drafts` through `frontend/src/services/kyc.ts`.
2. `KycService.create_draft()` resolves authorized source documents, prior snapshot, configured research source names, and account context.
3. `KycService._build_agent_run()` creates a `KycAgentRun`, calls the configured gateway adapter, saves `KycWorkstreamOutput` rows, then creates a `KycDraft`.
4. Reviewers edit, approve, or reject the draft.
5. Approval creates an immutable `KycSnapshot`; previous snapshots remain viewable.

Current key limitation:
- `DeterministicKycGatewayAdapter` generates templated one-line outputs from local metadata. It does not call OpenAI, Qwen, an external AI Gateway, or approved research APIs.

## 2. Current Gaps

Critical gaps:
- No real AI/LLM provider adapter is configured in `backend/app/config.py`.
- `kyc_gateway.py` has only the deterministic local adapter.
- Source documents store metadata and citations, but not extracted full text.
- No PDF/DOCX/plain text extraction pipeline exists for account source documents.
- No OCR detection or OCR fallback exists.
- No chunking, full-text retrieval, vector search, or RAG layer exists for KYC.
- KYC generation currently runs synchronously inside the request path.
- `KycAgentRun` has status fields, but there is no durable KYC queue or worker lifecycle.
- Current citations are generated from existing `SourceCitation` rows, not from page/section-aware extracted document chunks.
- Current research source names such as Trivoly, ZoomInfo, and CrunchBase are labels, not live approved source calls.
- LinkedIn is mentioned in requirements/specs as a possible research source, but no approved LinkedIn API/data-access path exists.
- Prompt templates, strict AI output schema, retry policy, timeout policy, token limits, and budget limits are not yet implemented for KYC.
- `AiGatewayRun` exists, but KYC agent runs are not consistently linked to unified AI gateway run logs.
- Safe prompt/response logging rules need tightening so raw prompts, source text, secrets, and sensitive commercial details are not exposed.

## 3. Proposed Architecture

Production KYC should become a pipeline with distinct stages:

1. Source collection
   - Collect approved account context, engagement records, source documents, user notes, timeline history, reviewed Fathom summaries/action items, and prior KYC snapshots.

2. Source ingestion and extraction
   - Extract full readable text from PDF, DOCX, and plain text attachments.
   - Store extraction text and metadata.
   - Store page/section-level extraction records where possible.

3. Chunking and retrieval
   - Chunk extracted text and relevant platform records.
   - Store chunk metadata and source mapping.
   - Retrieve only the most relevant, RBAC-safe chunks for each KYC workstream.

4. AI generation
   - Call a swappable AI provider adapter.
   - Require strict JSON/schema output.
   - Generate all five workstreams with citations, confidence, missing evidence notes, conflicts, reviewer notes, and follow-up questions.

5. Persistence and review
   - Store `KycAgentRun`, `KycWorkstreamOutput`, and `KycDraft`.
   - Preserve prior approved snapshot until human approval creates a new immutable snapshot.

6. Observability and governance
   - Link KYC runs to `AiGatewayRun`.
   - Audit generation, review, approval, rejection, retry, failure, and configuration.
   - Redact logs and enforce field-level RBAC before retrieval and serialization.

## 4. AI Provider Adapter Design

Existing foundation:
- `backend/app/services/kyc_gateway.py` already defines `KycGatewayAdapter`, `KycGatewayRequest`, `KycGatewayResponse`, and workstream result DTOs.

Proposed adapter layers:
- `KycGatewayAdapter`: existing protocol retained.
- `BaseLlmKycGatewayAdapter`: shared prompt construction, schema validation, retry, timeout, usage parsing, and safe error handling.
- `OpenAiKycGatewayAdapter`: OpenAI SDK or OpenAI-compatible HTTP adapter.
- `QwenKycGatewayAdapter`: Qwen adapter, preferably through an OpenAI-compatible endpoint when possible.
- `HttpAiGatewayKycAdapter`: generic enterprise AI/LLM Gateway adapter for a configured gateway endpoint.
- `DeterministicKycGatewayAdapter`: retained for tests/local fallback only, not production default.

Provider selection:
- Read from environment variables and optionally Admin AI/LLM Gateway integration settings.
- Recommended provider priority:
  1. `AI_KYC_PROVIDER` env setting if present.
  2. Enabled `ai_llm_gateway` integration config.
  3. Deterministic adapter only when explicitly enabled for local/test.

Adapter outputs must be validated before persistence:
- Reject malformed JSON.
- Reject unknown workstream keys or field keys.
- Reject citations that do not map to allowed source chunks/documents.
- Convert unsupported claims to missing/insufficient evidence notes.

## 5. Document Extraction Design

Current foundation:
- `SourceDocument` tracks account/engagement/draft, title, source type, file name, file URL, link URL, extraction status, confidence, pages, sensitivity, and timestamps.
- `SourceCitation` tracks document citation label, page number, excerpt, and field key.
- `ContentStorageService` supports storing uploaded content, but account attachment API currently accepts metadata rather than a file upload stream.

Proposed extraction workflow:
1. User uploads or links a charter/SOW/attachment.
2. Store the uploaded file in local/S3 storage using an account-source upload endpoint.
3. Create or update `SourceDocument`.
4. Queue document extraction.
5. Extract text by file type:
   - PDF: page-aware extraction.
   - DOCX: paragraph/table extraction with section headings where possible.
   - Plain text: direct read with line offsets.
6. Detect scanned/low-text PDFs.
7. Run OCR only if OCR support is enabled and installed.
8. Store extracted text, page count, checksum, extraction status, errors, and timestamps.
9. Chunk the extracted text and store chunk records linked to the document.

Extraction status lifecycle:
- `pending`
- `running`
- `completed`
- `failed`
- `needs_review`
- `ocr_required`
- `unsupported`

Extraction must not block manual KYC:
- If extraction fails, KYC can still be manually edited.
- Failed/weak sources should surface as insufficient evidence.

## 6. Database/Schema Changes

Do not apply these changes yet. Proposed future migration scope:

Source document extraction:
- Add to `source_documents`:
  - `storage_backend`
  - `storage_path`
  - `mime_type`
  - `size_bytes`
  - `checksum_sha256`
  - `extracted_text_checksum`
  - `extraction_started_at`
  - `extraction_completed_at`
  - `extraction_error`
  - `ocr_status`
  - `ocr_engine`

New table: `source_document_extractions`
- `id`
- `source_document_id`
- `status`
- `extractor_name`
- `extractor_version`
- `mime_type`
- `page_count`
- `raw_text`
- `normalized_text`
- `metadata_json`
- `error_message`
- `started_at`
- `completed_at`
- `created_at`

New table: `source_document_chunks`
- `id`
- `source_document_id`
- `extraction_id`
- `account_id`
- `engagement_id`
- `chunk_index`
- `chunk_text`
- `chunk_hash`
- `page_number`
- `section_label`
- `start_offset`
- `end_offset`
- `token_count`
- `sensitivity_level`
- `source_type`
- `metadata_json`
- `created_at`

Optional table: `source_document_embeddings`
- `id`
- `chunk_id`
- `provider`
- `model`
- `embedding_vector`
- `embedding_hash`
- `created_at`

KYC run enhancements:
- Add to `kyc_agent_runs`:
  - `queued_at`
  - `retry_count`
  - `max_retries`
  - `next_retry_at`
  - `ai_gateway_run_id`
  - `retrieval_summary_json`
  - `provider_json`
  - `usage_json`
  - `cost_json`

KYC workstream enhancements:
- Add to `kyc_workstream_outputs`:
  - `reviewer_notes_json`
  - `follow_up_questions_json`
  - `retrieved_chunk_ids`
  - `provider_response_id`

Citation enhancements:
- Extend citation JSON or create normalized `kyc_citations` table if reporting/search requires it:
  - `source_type`
  - `source_record_id`
  - `source_document_id`
  - `source_chunk_id`
  - `page_number`
  - `section_label`
  - `excerpt`
  - `confidence`
  - `restricted`

## 7. RAG/Search Design

Recommended first step:
- Use PostgreSQL full-text search and metadata filters before adding vector search.
- This keeps the first production iteration simpler and compatible with the existing PostgreSQL stack.

Recommended retrieval layers:
1. Structured retrieval:
   - Account profile fields.
   - Engagement records.
   - Approved KYC snapshots.
   - Reviewed Fathom imported items.
   - Timeline notes/events.

2. Text retrieval:
   - `source_document_chunks` filtered by account, engagement, source type, sensitivity, and RBAC.
   - Full-text rank by workstream query terms.

3. Optional embedding retrieval:
   - Use pgvector if available and approved.
   - Store embeddings per chunk, not per whole document.
   - Recompute embeddings when chunk text changes.

Workstream-specific retrieval:
- Market Research: external approved research plus internal account context.
- Client Research: account metadata, website/research sources, notes, timeline, prior snapshots.
- Stakeholder Details: stakeholder records, Fathom reviewed interviews, timeline, notes, approved internal sources.
- Tkxel Engagement with Client: charters, SOWs, engagement records, governance, delivery notes, Fathom reviewed summaries.
- Financial Landscape: SOW/commercial notes, approved commercial fields, renewal terms, payment behavior, finance-sensitive records.

RBAC rule:
- Retrieval must filter unauthorized records and sensitive fields before context is sent to the model.
- Do not reveal that hidden records exist.

## 8. KYC Prompt/Schema Design

Prompt must be strict and source-bound:
- System instruction: AI must not invent unsupported facts.
- Developer instruction: use only supplied context and approved gateway research results.
- User instruction: produce KYC for the selected account.
- Context blocks: account, engagements, prior snapshot, source chunks, timeline, notes, Fathom reviewed summaries, research snippets.

Output format:
- Strict JSON object.
- Validate with Pydantic before storing.
- Unknown fields are rejected.
- Missing citations downgrade confidence or mark insufficient evidence.

Required top-level schema:
- `status`
- `workstreams`
- `global_conflicts`
- `global_missing_evidence`
- `model_metadata`

Workstream schema:
- `workstream_key`
- `title`
- `status`
- `fields`
- `missing_fields`
- `conflicts`
- `reviewer_notes`
- `suggested_follow_up_questions`
- `confidence`

Field schema:
- `key`
- `label`
- `value`
- `confidence`
- `citations`
- `missing_evidence_note`
- `conflicts`
- `reviewer_notes`
- `suggested_follow_up_questions`

Field catalog:
- Use the existing catalog in `backend/app/services/kyc.py` as the initial canonical set.
- Add configuration only after product confirms reference document depth and final field list.

## 9. Citation Model

Every AI-generated KYC answer must include citation objects:

- `source_type`: source document, timeline, account, engagement, fathom, prior_snapshot, approved_research.
- `source_record_id`: platform record ID when available.
- `source_document_id`: when from a source document.
- `source_chunk_id`: when from extracted/chunked text.
- `label`: human-readable source label.
- `page_number`: PDF/DOCX page when available.
- `section_label`: section heading when available.
- `excerpt`: short cited excerpt.
- `confidence`: citation confidence or source confidence.
- `restricted`: whether viewer needs sensitive access.
- `source_route`: route to open the source record where available.

Validation:
- Excerpts must come from known source chunks or approved platform records.
- If an answer lacks citations, it must be flagged as weak/insufficient evidence.
- Financial/commercial citations must be restricted unless user has sensitive KYC view/export permission.

## 10. Async Job/Queue Design

Current state:
- `backend/app/main.py` runs local in-process workers for timeline retention, notifications/reporting, and integrations.
- There is no durable external queue.
- KYC generation currently happens synchronously inside service methods.

Recommended production design:
- Use `KycAgentRun` as the durable job record.
- Add a dedicated KYC worker that claims pending runs and processes them.
- For production/pre-prod, prefer a durable queue such as Celery/RQ/Arq with Redis if infrastructure allows.
- For local/demo, support an in-process KYC worker loop like existing worker loops.

Run status lifecycle:
- `pending`
- `running`
- `partial`
- `complete`
- `failed`
- `cancelled`

Workstream status lifecycle:
- `pending`
- `running`
- `complete`
- `failed`

Job behavior:
- `POST /api/accounts/{account_id}/kyc/agent-runs` creates a pending run.
- Worker picks up pending run.
- Worker processes source collection, retrieval, AI generation, schema validation, and workstream persistence.
- Draft is created or refreshed only after usable output exists.
- Previous approved snapshot remains unchanged.
- Previous completed output remains visible while the new run is pending/running.
- Retry respects max retries and backoff.

Locking:
- Prevent two workers from processing the same run.
- Allow multiple accounts to process independently.
- Decide whether the same account can have multiple concurrent runs; recommended default is one active run per account.

## 11. Snapshot/Review/Approval Workflow

Current workflow to preserve:
- Drafts are advisory.
- Users can edit fields.
- Low-confidence and conflicts require acknowledgement.
- Missing required fields require completion or override reason.
- Approval creates immutable `KycSnapshot`.
- Rejection preserves draft for audit.

Production workflow additions:
- KYC run begins pending/running and shows workstream progress.
- AI output creates a draft only after schema validation.
- Failed/partial workstreams are preserved and visible.
- Reviewer can enrich missing fields manually.
- Manual edits are clearly distinguishable from AI output.
- Draft-to-snapshot diff must compare against latest approved snapshot.
- New snapshot version never overwrites previous snapshot.
- Draft output must not affect metrics, signals, stage, reports, or official AI briefs before approval.

Reference document dependency:
- KYC quality tuning and content depth are blocked until sample/reference KYC documents are reviewed.

## 12. Security/RBAC/Audit Design

RBAC:
- Reuse `AccountAccessService` and existing KYC permissions.
- Enforce account access and module permission before source retrieval.
- Apply field-level sensitive filtering before sending context to AI.
- Sensitive financial/commercial fields include margins, revenue, payment behavior, billing models, commercial terms, legal terms, and restricted citations.

Audit:
- Log:
  - KYC run queued.
  - KYC run started.
  - Source extraction started/completed/failed.
  - Retrieval context prepared.
  - AI provider call completed/failed.
  - Draft created.
  - Draft edited.
  - Draft approved.
  - Draft rejected.
  - Snapshot created.
  - Retry/cancel/failure.
  - KYC configuration changes.

Safe logging:
- Do not log raw prompts by default.
- Do not log full source text.
- Do not log API keys, tokens, provider secrets, or raw credential payloads.
- Store sanitized source context IDs, token usage, provider, model, latency, and high-level prompt labels.
- `AiGatewayRun.prompt_json` should contain a redacted prompt summary, not full source content.

Redaction:
- The AI prompt builder must redact or exclude source chunks the user is not allowed to see.
- Response serialization must mask restricted citations for unauthorized users.
- Fathom material must be reviewed/redacted before KYC can consume it.

## 13. External Research Source Integration Design

Approved integration boundary:
- AI/LLM Gateway is the only approved KYC research integration boundary.
- Trivoly/Travoly, ZoomInfo, CrunchBase, RocketReach, web search, LinkedIn, news/social sources, and future KNACK are research sources through the AI/LLM Gateway, not standalone adapters unless separately approved.

Allowed behavior:
- Pass configured research source labels to the AI/LLM Gateway.
- Accept source-backed snippets from the approved gateway response.
- Store research source labels and citations in KYC run/draft/snapshot records.

Blocked behavior:
- Do not implement random standalone scrapers.
- Do not scrape LinkedIn unofficially.
- Do not call unapproved research APIs.

LinkedIn status:
- Blocked until an approved LinkedIn API/data-access method is available and approved by product/security/legal.

## 14. Environment Variables Required

Core provider:
- `AI_KYC_PROVIDER`: `openai`, `qwen`, `gateway`, or `deterministic_local`.
- `AI_KYC_API_KEY`
- `AI_KYC_BASE_URL`
- `AI_KYC_MODEL`
- `AI_KYC_ORGANIZATION`
- `AI_KYC_PROJECT`
- `AI_KYC_TIMEOUT_SECONDS`
- `AI_KYC_MAX_RETRIES`
- `AI_KYC_RETRY_BACKOFF_SECONDS`

Token and output limits:
- `AI_KYC_MAX_INPUT_TOKENS`
- `AI_KYC_MAX_OUTPUT_TOKENS`
- `AI_KYC_TEMPERATURE`
- `AI_KYC_TOP_P`

Budget controls:
- `AI_KYC_MAX_COST_PER_RUN_USD`
- `AI_KYC_DAILY_BUDGET_USD`
- `AI_KYC_MONTHLY_BUDGET_USD`
- `AI_KYC_WARN_COST_THRESHOLD_USD`

Retrieval:
- `AI_KYC_RETRIEVAL_TOP_K`
- `AI_KYC_CHUNK_SIZE_TOKENS`
- `AI_KYC_CHUNK_OVERLAP_TOKENS`
- `AI_KYC_USE_EMBEDDINGS`
- `AI_KYC_EMBEDDING_PROVIDER`
- `AI_KYC_EMBEDDING_MODEL`
- `AI_KYC_EMBEDDING_DIMENSIONS`

Document extraction:
- `KYC_DOCUMENT_EXTRACTION_ENABLED`
- `KYC_DOCUMENT_EXTRACTION_WORKER_ENABLED`
- `KYC_DOCUMENT_EXTRACTION_MAX_FILE_MB`
- `KYC_OCR_ENABLED`
- `KYC_OCR_ENGINE`
- `KYC_OCR_MIN_TEXT_CHARS`

Workers:
- `KYC_WORKER_ENABLED`
- `KYC_WORKER_INITIAL_DELAY_SECONDS`
- `KYC_WORKER_INTERVAL_SECONDS`
- `KYC_WORKER_BATCH_SIZE`
- `KYC_WORKER_MAX_CONCURRENT_RUNS`

Existing related env:
- `DATABASE_URL`
- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`
- `CONTENT_STORAGE_BACKEND`
- `LOCAL_CONTENT_STORAGE_DIR`

## 15. Libraries/Packages Recommended

Do not add these yet. Candidate packages:

AI providers:
- `openai` for OpenAI and OpenAI-compatible Qwen endpoints.
- `httpx` if not already available for generic gateway HTTP calls.

Document extraction:
- `pypdf` or `pdfplumber` for PDF text extraction.
- `python-docx` for DOCX extraction.
- `beautifulsoup4` if HTML/text links need controlled parsing later.
- `Pillow` and `pytesseract` only if OCR is approved and installed locally.
- `python-magic` or standard MIME validation if stronger file-type detection is needed.

RAG/search:
- PostgreSQL full-text search first.
- `pgvector` only if embedding search is approved and Postgres extension can be enabled.
- `tiktoken` or provider tokenizer for chunk/token counting.

Schema validation:
- Existing Pydantic models in `backend/app/schemas.py` can be extended.

Queue:
- Local in-process worker initially.
- Celery/RQ/Arq plus Redis for production-grade durable queue if infrastructure allows.

## 16. Files Likely To Create

Backend:
- `backend/app/services/kyc_ai_provider.py`
- `backend/app/services/kyc_prompt_builder.py`
- `backend/app/services/kyc_retrieval.py`
- `backend/app/services/kyc_document_extraction.py`
- `backend/app/services/kyc_chunking.py`
- `backend/app/services/kyc_worker.py`
- `backend/app/repositories/kyc_sources.py`
- `backend/app/routers/kyc_sources.py` if document extraction status APIs are separated.
- `backend/migrations/YYYYMMDD_ai_kyc_pipeline.sql`
- Backend tests for provider adapter, extraction, retrieval, KYC worker, schema validation, RBAC, and snapshot workflow.

Frontend:
- `frontend/src/components/account/KycRunStatusPanel.tsx`
- `frontend/src/components/account/KycCitationDrawer.tsx`
- `frontend/src/components/account/KycSourceCoveragePanel.tsx`
- `frontend/src/components/account/KycReferenceDocsBlockedNotice.tsx`
- Frontend tests for run status, citations, errors, and sensitive masking.

Docs:
- `docs/features/ai-kyc-pipeline.md`
- `docs/demo/ai-kyc-pipeline-verification.md`

## 17. Files Likely To Modify

Backend:
- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/services/kyc.py`
- `backend/app/services/kyc_gateway.py`
- `backend/app/repositories/kyc.py`
- `backend/app/routers/kyc.py`
- `backend/app/services/accounts.py`
- `backend/app/routers/accounts.py`
- `backend/app/repositories/accounts.py`
- `backend/app/services/integrations.py`
- `backend/app/services/timeline.py`
- `backend/app/dependencies.py`
- `backend/app/services/seed.py`

Frontend:
- `frontend/src/services/kyc.ts`
- `frontend/src/types/kyc.ts`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/AccountWorkspacePanel.tsx`
- `frontend/src/services/accountWorkspace.ts`
- `frontend/src/types/account.ts`

Specs/docs:
- `specs/02-kyc-and-ai-extraction.md`
- `specs/08-ai-assistance-and-forecasting.md`
- `specs/09-approved-integrations.md`
- `docs/demo/integration-verification-report.md`

## 18. API Endpoints To Add/Change

Keep existing:
- `GET /api/accounts/{account_id}/kyc/drafts`
- `POST /api/accounts/{account_id}/kyc/drafts`
- `GET /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `PATCH /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/approve`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/reject`
- `GET /api/accounts/{account_id}/kyc/snapshots`
- `GET /api/accounts/{account_id}/kyc/freshness`
- `GET /api/accounts/{account_id}/kyc/agent-runs`
- `POST /api/accounts/{account_id}/kyc/agent-runs`
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/refresh`

Likely additions:
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/retry`
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/cancel`
- `GET /api/accounts/{account_id}/kyc/agent-runs/{run_id}/retrieval`
- `GET /api/accounts/{account_id}/kyc/source-coverage`
- `POST /api/accounts/{account_id}/attachments/upload`
- `GET /api/accounts/{account_id}/attachments/{attachment_id}/extraction`
- `POST /api/accounts/{account_id}/attachments/{attachment_id}/extract`
- `GET /api/accounts/{account_id}/attachments/{attachment_id}/chunks`
- `POST /api/admin/kyc/jobs/run-pending` for admin/manual local worker trigger if needed.

Behavior changes:
- `POST /api/accounts/{account_id}/kyc/drafts` should likely create/queue a KYC run and return run/draft status rather than blocking on synchronous AI.
- Existing response compatibility needs a migration strategy so the current frontend does not break.

## 19. UI Changes Required

KYC screen:
- Show current approved snapshot separately from active run/draft.
- Show pending/running/complete/failed/partial KYC run status.
- Show independent status for five workstreams.
- Show previous completed output while a new run is pending/running.
- Show source coverage by source type.
- Show citation drawer with page/section/excerpt/source route.
- Show missing evidence notes and suggested follow-up questions.
- Show conflicts and reviewer notes per field.
- Show provider/model/run metadata in safe form.
- Add Retry and Cancel controls where authorized.
- Show "quality tuning blocked pending reference KYC documents" notice until sample/reference docs are reviewed.

Documents tab:
- Show extraction status for each attachment.
- Show extracted text availability.
- Show chunk count/page count where available.
- Show extraction error and retry extraction action for authorized users.

Admin/Integrations:
- Show AI provider/gateway health.
- Show AI Gateway runs linked to KYC runs.
- Show sanitized usage, model, latency, token counts, and errors.

## 20. Testing Strategy

Backend unit tests:
- Provider selection from env.
- OpenAI/Qwen/gateway adapter request construction with mocked HTTP.
- Strict schema validation.
- Rejection of malformed AI output.
- Citation source mapping and citation validation.
- Sensitive source exclusion before prompt construction.
- Document extraction for PDF/DOCX/text fixtures.
- Scanned/low-text PDF detection.
- Chunking and retrieval ranking.
- KYC job lifecycle pending/running/complete/failed/partial/retry.
- Snapshot immutability and no auto-replacement.
- Fathom reviewed-only inclusion.
- LinkedIn blocked without approved API.
- Safe logging/masked prompts.

Backend integration tests:
- Trigger KYC run and poll status.
- Run worker with mocked provider.
- Approve draft and verify snapshot.
- Failed workstream preserves other workstreams.
- Unauthorized user cannot retrieve or send sensitive context.
- AI Gateway run log is linked and sanitized.

Frontend tests:
- KYC run status loading/error/empty states.
- Workstream status panel.
- Citation drawer.
- Sensitive citation masking.
- Retry/cancel authorization.
- Review/approval field validation.

Security tests:
- Prompt builder does not include unauthorized account records.
- Prompt builder does not include restricted commercial fields for unauthorized users.
- Logs do not contain secrets or full sensitive source text.

Manual verification:
- Upload a sample charter/SOW.
- Verify extraction text stored.
- Trigger KYC run.
- Verify citations link back to document/page/section.
- Approve KYC.
- Verify official snapshot changes only after approval.

## 21. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| AI hallucination creates unsupported KYC facts | Critical | Strict schema, citation validation, insufficient-data fallback, human approval. |
| Sensitive financial data leaks to provider or logs | Critical | RBAC-filtered retrieval, redacted prompts/logs, provider policy review. |
| LinkedIn/web data access violates terms | Critical | Block until approved API/data-access path exists. |
| Document extraction quality is poor | High | Show extraction confidence/errors, allow manual review, add OCR only when approved. |
| Long documents exceed model limits | High | Chunking/retrieval and token budgets. |
| Synchronous AI requests time out | High | Async job lifecycle and background worker. |
| Duplicate/concurrent KYC runs confuse reviewers | Medium | One active run per account by default and clear run history. |
| Vector search adds operational complexity | Medium | Start with PostgreSQL full-text search, add pgvector later if needed. |
| Reference quality expectations are unknown | Medium | Block prompt tuning until sample/reference KYC docs are reviewed. |

## 22. Assumptions

- PostgreSQL remains the primary database.
- Source documents can be stored locally for local/demo and S3-like storage later.
- OpenAI is the primary AI provider for the first implementation.
- OpenAI credentials will live only in `.env`; they will not be stored in Admin Integrations.
- OpenAI API usage is generally billed, so the first implementation should use the lowest-cost suitable GPT model and enforce budget caps instead of assuming a permanently free API model.
- SOW documents already exist through account creation or SOW Management and should be ingested from that flow.
- OCR is included in the first implementation.
- Vector search/embeddings are included in the first implementation.
- Redis should be considered for background KYC jobs.
- Sensitive financial KYC fields are visible to KAM Head, AM, Admin, Super Admin, and further RBAC-approved users.
- Only KAM Head can approve KYC.
- KYC rejection should use an immediately visible popup/modal for rejection reason capture.
- Trivoly/Travoly, ZoomInfo, and Crunchbase are excluded from the first implementation.
- LinkedIn remains on hold for a future phase.
- A deterministic adapter remains available for tests but not for production KYC quality.
- Fathom data can be used only after review/redaction.
- Current KYC field catalog is the initial field catalog until reference KYC documents refine it.
- Reference documents are available at `requirements/Account Informationn Reference .pdf`, `requirements/SOW_CANVS_TKLLC_007 .pdf`, and `requirements/SOW_CANVS_TKLLC_007 .docx`.
- No official metrics/signals/stage/dashboard logic consumes draft KYC.
- Direct external research sources are not included in the first implementation.

## 23. Questions For Me Before Implementation

Answered decisions:
- Primary provider: OpenAI.
- Credential storage: `.env` only.
- Model direction: lowest-cost suitable GPT model first; enforce budget caps because OpenAI API usage is generally billed.
- Source documents: SOW documents already exist through account creation/SOW Management and should be ingested from there.
- OCR: included in first implementation.
- Vector search/embeddings: included in first implementation.
- Jobs: consider Redis-backed jobs.
- Sensitive KYC visibility: KAM Head, AM, Admin, Super Admin, and further RBAC-approved users.
- Approval: only KAM Head can approve KYC.
- Rejection UX: rejection reason must be captured in an immediately visible modal/popup.
- Approved research sources for first implementation: OpenAI over supplied platform/document context only.
- LinkedIn: on hold for a later phase.
- Reference documents: `requirements/Account Informationn Reference .pdf`, `requirements/SOW_CANVS_TKLLC_007 .pdf`, and `requirements/SOW_CANVS_TKLLC_007 .docx`.

Remaining open questions:
1. What exact OpenAI monthly budget cap should be enforced for local/demo/pre-prod?
2. Should sensitive commercial fields be sent to OpenAI for authorized users, or should those fields always be redacted from provider calls and only shown locally?
3. Which low-cost GPT model is available on the provided OpenAI account: `gpt-5-mini`, another GPT mini/nano model, or a different account-specific model?
4. Is Tesseract acceptable for local OCR, or should OCR use another approved engine?
5. Can pgvector be enabled in the current PostgreSQL/Docker environment?
6. Should Redis jobs use RQ for simpler job processing or Celery for broader production conventions?
7. Should the reference documents be seeded as demo account/SOW data, or only used as prompt-quality references during implementation?
8. Should OpenAI web search remain disabled entirely in this phase? Recommended: keep disabled and use only supplied platform/document context.

## 24. Suggested Implementation Phases

Phase 1: Audit existing KYC and AI gateway structure
- Confirm OpenAI model availability, source types, permissions, reference document usage, Redis, pgvector, OCR engine, and target architecture.
- Update feature docs/specs if product decisions change.

Phase 2: Add document extraction and source text storage
- Add schema for extraction metadata and text.
- Add ingestion/extraction support for SOW documents from account creation/SOW Management plus PDF, DOCX, and plain text attachments.
- Add OCR support for scanned/low-text documents.
- Add extraction status UI.

Phase 3: Add chunking/retrieval layer
- Add chunk table and retrieval service.
- Implement RBAC-safe retrieval from documents, account records, engagements, timeline, notes, reviewed Fathom items, and prior snapshots.
- Add vector search/embeddings using the selected OpenAI embedding model.

Phase 4: Add AI provider adapter
- Add OpenAI provider adapter behind the existing KYC gateway contract.
- Add env settings, timeout, retry, token, and budget controls.
- Keep deterministic adapter for tests only.

Phase 5: Add strict KYC output schema with citations
- Add Pydantic response schema.
- Validate workstreams, fields, citations, confidence, conflicts, reviewer notes, and follow-up questions.
- Reject or downgrade unsupported claims.

Phase 6: Add async KYC job lifecycle
- Add pending/running/complete/failed/partial/retry/cancel behavior.
- Add Redis-backed queue integration, with a local/manual worker command fallback.
- Preserve old approved snapshot and old completed output during refresh.

Phase 7: Add review/approval/snapshot workflow enhancements
- Link AI Gateway run to KYC agent run.
- Improve diff, source coverage, and missing evidence handling.
- Preserve immutability and KAM Head-only approval gate.

Phase 8: Add UI for KYC run, status, citations, review, approval
- Add workstream status panel, source coverage panel, citation drawer, retry/cancel controls, extraction status indicators, and rejection reason modal/popup.

Phase 9: Add tests and security review
- Add backend/frontend tests for all pipeline stages.
- Review prompt safety, sensitive field filtering, and log redaction.

Phase 10: Add reference-doc based prompt tuning
- Review sample/reference KYC documents.
- Tune prompts, field depth, follow-up questions, and quality thresholds.
- Do not invent expected KYC depth before this phase.

## Phase 1-4 Implementation Status - 2026-06-03

Completed:
- Phase 1 architecture audit/alignment was translated into implementation scope and tracked in `docs/features/ai-kyc-pipeline-phase-1-to-4.md`.
- Phase 2 document extraction and source text storage were implemented for local files, PDF, DOCX, plain text/CSV, and OCR fallback for low-text PDFs.
- Phase 3 chunking/retrieval was implemented with source trust ranking, RBAC filtering, local hash embeddings fallback, OpenAI embeddings support, and retrieval over source documents, account context, engagements, timeline entries, approved Fathom imports, and prior KYC snapshots.
- Phase 4 OpenAI provider adapter was implemented behind the existing KYC gateway contract with environment-driven provider/model/retry/token settings.
- New account source-document upload/extract/chunk endpoints were added and documented in OpenAPI.
- Persistent schema support was added in `backend/migrations/20260603_ai_kyc_pipeline_phase_1_to_4.sql`.

Files changed:
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/dependencies.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/accounts.py`
- `backend/app/services/accounts.py`
- `backend/app/services/kyc.py`
- `backend/app/services/kyc_gateway.py`
- `backend/app/services/kyc_document_extraction.py`
- `backend/app/services/kyc_embeddings.py`
- `backend/app/services/kyc_retrieval.py`
- `backend/Dockerfile`
- `backend/requirements.txt`
- `backend/tests/test_ai_kyc_pipeline_phase_1_to_4.py`
- `backend/tests/test_kyc_ai_extraction.py`
- `.env.example`
- `backend/.env.example`
- `docker-compose.yml`
- `docs/features/ai-kyc-pipeline-phase-1-to-4.md`
- `docs/features/README.md`

Tests run:
- `cd backend && .venv/bin/python -m pytest tests/test_ai_kyc_pipeline_phase_1_to_4.py tests/test_kyc_ai_extraction.py -q` -> 9 passed.
- `cd backend && AI_KYC_PROVIDER=deterministic_local AI_KYC_USE_EMBEDDINGS=false .venv/bin/python -m pytest -q` -> 108 passed.
- `docker compose up -d --build backend` completed.
- `curl http://127.0.0.1:8001/openapi.json` returned HTTP 200.
- Live Postgres contains `source_document_extractions` and `source_document_chunks`.

Remaining:
- Phase 5 strict response schema/prompt quality tuning against reference KYC documents.
- Phase 6 Redis/Celery asynchronous KYC lifecycle.
- Phase 7+ review UI improvements, citation drill-down, extraction review UI, and rejection modal refinement.
- Production vector storage decision: current implementation stores vectors as JSON for portability; `pgvector` remains a production enhancement.

Technical notes:
- `AI_KYC_PROVIDER=openai` enables the live OpenAI path; `deterministic_local` remains available for offline tests and demos.
- OpenAI calls are source-bound; the prompt instructs the model not to use web search or unsupported external sources.
- LinkedIn and direct ZoomInfo/Crunchbase/Travoly/Trivoly access remain blocked until approved data/API access is available.
- Approved KYC snapshots are still preserved by the existing review/approval workflow; new runs do not auto-replace approved snapshots.
