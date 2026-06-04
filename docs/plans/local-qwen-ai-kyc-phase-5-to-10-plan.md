# Local Qwen AI KYC Phase 5-10 Implementation Plan

## Purpose

Implement Phase 5-10 of `docs/plans/ai-kyc-pipeline-implementation-plan.md` using a free local model path for demo and testing.

Primary local provider:

- Qwen served through Ollama or LM Studio.
- Backend communicates through an OpenAI-compatible local HTTP API.
- No paid OpenAI API calls are required for the demo path.

Fallback providers:

- `deterministic_local` remains available for offline workflow tests.
- `openai` remains available only when explicitly configured.

## External References

- Ollama exposes OpenAI-compatible endpoints for local models: `https://docs.ollama.com/openai`
- LM Studio can run a local OpenAI-compatible API server: `https://lmstudio.ai/docs/developer/core/server`
- Qwen documents LM Studio local usage: `https://qwen.readthedocs.io/en/latest/run_locally/lmstudio.html`
- LM Studio can operate locally/offline and serve local requests: `https://www.lmstudio.ai/docs/app/offline`

## Current Implementation Baseline

Already implemented in Phase 1-4:

- Document extraction for PDF, DOCX, plain text, and OCR fallback.
- Source extraction and chunk storage.
- Retrieval over source documents, account context, engagements, timeline, reviewed Fathom imports, and prior snapshots.
- Local hash embedding fallback and OpenAI embedding support.
- OpenAI-backed KYC adapter behind `KycGatewayAdapter`.
- Existing KYC draft/review/approval/snapshot workflow remains intact.

Evidence:

- `backend/app/services/kyc_gateway.py`
- `backend/app/services/kyc_document_extraction.py`
- `backend/app/services/kyc_embeddings.py`
- `backend/app/services/kyc_retrieval.py`
- `backend/app/services/kyc.py`
- `backend/tests/test_ai_kyc_pipeline_phase_1_to_4.py`
- `docs/features/ai-kyc-pipeline-phase-1-to-4.md`

## Goal

Make AI KYC strong enough for a local demo without paid API usage:

1. Run Qwen locally through Ollama or LM Studio.
2. Use the existing extraction/retrieval pipeline as source context.
3. Generate strict source-cited KYC output.
4. Run KYC generation asynchronously.
5. Preserve approved snapshots until KAM Head approval.
6. Add UI for run status, citations, source coverage, retry/cancel, and rejection modal.
7. Add tests and security checks.
8. Tune prompt quality using reference KYC/SOW documents.

## Provider Decision

Approved implementation decision:

- Add `AI_KYC_PROVIDER=local_openai_compatible`.
- Use the same OpenAI SDK/client pattern where possible, but point `base_url` to a local server.
- Keep provider naming generic because both Ollama and LM Studio expose OpenAI-compatible APIs.
- Support Ollama and LM Studio equally through configuration.
- Document Ollama as the default local server because it is easier to run headless for demos, scripts, and background workers.
- Keep LM Studio as a first-class alternative for users who prefer a desktop UI and manually loaded local models.

Approved local model default:

- Default `.env` model: `qwen3:8b`.
- Reason: best default balance for local demo speed, lower timeout risk, and acceptable KYC quality when combined with retrieval/source chunks.
- Optional quality upgrade: larger Qwen instruct/chat model through Ollama or LM Studio when the demo laptop handles it reliably.

Local endpoint defaults:

- Ollama: `http://127.0.0.1:11434/v1`
- LM Studio: `http://127.0.0.1:1234/v1`

Default local API key:

- Many local OpenAI-compatible servers accept any non-empty key.
- Use `AI_KYC_API_KEY=local-demo` for local provider only.

## Environment Variables

Add/update env examples:

```env
AI_KYC_PROVIDER=local_openai_compatible
AI_KYC_API_KEY=local-demo
AI_KYC_BASE_URL=http://127.0.0.1:11434/v1
AI_KYC_MODEL=qwen3:8b
AI_KYC_TIMEOUT_SECONDS=120
AI_KYC_MAX_RETRIES=1
AI_KYC_MAX_INPUT_TOKENS=18000
AI_KYC_MAX_OUTPUT_TOKENS=6000
AI_KYC_TEMPERATURE=0.1
AI_KYC_MAX_COST_PER_RUN_USD=0
AI_KYC_DAILY_BUDGET_USD=0
AI_KYC_MONTHLY_BUDGET_USD=0
AI_KYC_ESTIMATED_INPUT_COST_PER_1K_USD=0
AI_KYC_ESTIMATED_OUTPUT_COST_PER_1K_USD=0

AI_KYC_USE_EMBEDDINGS=true
AI_KYC_EMBEDDING_PROVIDER=local_hash
AI_KYC_EMBEDDING_MODEL=local_hash
AI_KYC_EMBEDDING_DIMENSIONS=384

KYC_WORKER_ENABLED=true
KYC_WORKER_MODE=local
KYC_WORKER_INTERVAL_SECONDS=5
KYC_WORKER_BATCH_SIZE=1

REDIS_URL=redis://127.0.0.1:6379/0
KYC_QUEUE_BACKEND=local
```

Notes:

- Use `AI_KYC_BASE_URL=http://127.0.0.1:1234/v1` for LM Studio.
- Use local hash embeddings first to avoid paid embedding calls.
- Optional later enhancement: add local embedding model support through Ollama/LM Studio if a stable embeddings endpoint/model is configured.
- `REDIS_URL` is documented for future queue migration, but Phase 6 should start with `KYC_QUEUE_BACKEND=local`.

## Local Model Setup Plan

### Ollama Path

Developer/demo operator steps:

```bash
ollama pull qwen3:8b
ollama serve
curl http://127.0.0.1:11434/v1/models
```

Application config:

```env
AI_KYC_PROVIDER=local_openai_compatible
AI_KYC_BASE_URL=http://127.0.0.1:11434/v1
AI_KYC_API_KEY=local-demo
AI_KYC_MODEL=qwen3:8b
```

### LM Studio Path

Developer/demo operator steps:

1. Install LM Studio.
2. Download a Qwen instruct/chat model suitable for local hardware.
3. Start the local server from Developer/Server mode.
4. Enable OpenAI-compatible endpoint.
5. Verify `http://127.0.0.1:1234/v1/models`.

Application config:

```env
AI_KYC_PROVIDER=local_openai_compatible
AI_KYC_BASE_URL=http://127.0.0.1:1234/v1
AI_KYC_API_KEY=local-demo
AI_KYC_MODEL=<lm-studio-loaded-model-id>
```

## Phase 5: Strict KYC Output Schema With Citations

### Scope

Add strict schema validation that works with local Qwen output.

Implementation tasks:

- Create/extend Pydantic models for KYC AI response:
  - top-level status
  - five workstreams
  - fields
  - citations
  - confidence
  - missing fields
  - conflicts
  - reviewer notes
  - suggested follow-up questions
- Add JSON extraction/repair guard for local-model output:
  - Strip markdown fences.
  - Reject non-JSON if parsing fails.
  - Do not silently accept unsupported facts.
- Validate all citation references against retrieved source chunk/document/platform IDs.
- Downgrade fields with missing citations to low confidence and missing evidence notes.
- Add workstream-level partial handling.
- Keep deterministic adapter tests independent from local model availability.

Files likely to modify/create:

- `backend/app/services/kyc_gateway.py`
- `backend/app/services/kyc_prompt_builder.py`
- `backend/app/schemas.py`
- `backend/app/services/kyc.py`
- `backend/tests/test_ai_kyc_phase_5_schema.py`

Acceptance criteria:

- Malformed model output fails safely.
- Unsupported citations are rejected or marked weak.
- Every returned field has citation/confidence/missing-evidence metadata.
- Local Qwen output can be parsed when it follows the strict prompt.

## Phase 6: Async KYC Job Lifecycle

### Scope

Move real KYC generation out of the request path.

Implementation tasks:

- Add lifecycle for:
  - `pending`
  - `running`
  - `partial`
  - `complete`
  - `failed`
  - `cancelled`
- Add retry metadata:
  - retry count
  - max retries
  - next retry time
  - failure message
- Add cancel and retry endpoints.
- Add worker service:
  - local in-process mode first
  - Redis/RQ optional mode if Redis is available
- Add manual admin trigger:
  - `POST /api/admin/kyc/jobs/run-pending`
- Prevent duplicate active runs per account unless explicitly allowed.
- Preserve previous approved snapshot and previous completed output while a new run is running.

Recommended queue design:

- MVP/demo: local worker loop plus manual trigger.
- Phase 6 implementation: local worker loop plus manual trigger first.
- Redis/RQ: defer until the local Qwen KYC path is stable and the job lifecycle/schema/citation behavior is proven.
- Pre-prod upgrade path: add Redis + RQ behind the same queue interface once Docker Redis is stable.

Files likely to modify/create:

- `backend/app/services/kyc_worker.py`
- `backend/app/services/kyc.py`
- `backend/app/repositories/kyc.py`
- `backend/app/routers/kyc.py`
- `backend/app/dependencies.py`
- `backend/app/main.py`
- `docker-compose.yml`
- `backend/app/config.py`
- `backend/tests/test_ai_kyc_phase_6_worker.py`

Acceptance criteria:

- Triggering KYC returns a run/draft status without waiting for full local model completion.
- Worker can complete a queued run.
- Retry works.
- Cancel works before processing.
- Failed local model call does not replace approved KYC snapshot.

## Phase 7: Review, Approval, Snapshot, And Audit Enhancements

### Scope

Harden human review and official KYC snapshot behavior.

Implementation tasks:

- Enforce KAM Head-only approval.
- Keep AM/Admin/Super Admin view/edit permissions according to current RBAC rules.
- Require rejection reason in a visible modal-friendly API response flow.
- Link KYC agent run to AI gateway/provider run metadata.
- Add source coverage summary:
  - document coverage
  - chunk coverage
  - workstream coverage
  - missing source types
- Improve diff against latest approved snapshot.
- Store manual edits separately from model-generated values where possible.
- Ensure draft output does not update official account intelligence before approval.
- Add audit/timeline events for:
  - run queued
  - run started
  - run completed/failed/cancelled
  - draft created
  - draft edited
  - draft approved/rejected

Files likely to modify/create:

- `backend/app/services/kyc.py`
- `backend/app/repositories/kyc.py`
- `backend/app/services/audit.py`
- `backend/app/services/timeline.py`
- `backend/app/schemas.py`
- `backend/tests/test_ai_kyc_phase_7_review_snapshot.py`

Acceptance criteria:

- Only KAM Head can approve.
- Rejection requires a clear reason.
- Approved snapshots remain immutable.
- New run output is advisory until approved.
- Audit/timeline events exist for important actions.

## Phase 8: KYC UI For Run Status, Citations, Review, And Approval

### Scope

Improve frontend KYC experience for local AI runs.

Implementation tasks:

- Add run status panel:
  - pending/running/complete/partial/failed/cancelled
  - provider/model
  - safe usage metadata
  - retry/cancel controls
- Add five-workstream status display.
- Add source coverage panel.
- Add citation drawer:
  - source type
  - document/source name
  - page/section
  - excerpt
  - confidence
  - source route
- Add extraction status indicators in Documents tab.
- Add rejection reason modal/popup.
- Preserve previous completed/approved content while a new run is pending/running.
- Show local provider warning:
  - "Using local Qwen via Ollama/LM Studio. Output quality depends on loaded local model."

Files likely to modify/create:

- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/KycRunStatusPanel.tsx`
- `frontend/src/components/account/KycCitationDrawer.tsx`
- `frontend/src/components/account/KycSourceCoveragePanel.tsx`
- `frontend/src/components/account/KycRejectionModal.tsx`
- `frontend/src/components/account/AccountWorkspacePanel.tsx`
- `frontend/src/services/kyc.ts`
- `frontend/src/types/kyc.ts`
- frontend tests for KYC UI.

Acceptance criteria:

- User can see run progress.
- User can inspect citations.
- User can retry/cancel where authorized.
- Rejection reason modal appears immediately.
- Leadership/unauthorized roles cannot see restricted content.

## Phase 9: Tests And Security Review

### Scope

Add automated confidence for local provider, schema, async jobs, UI, and security.

Backend tests:

- Local OpenAI-compatible adapter request construction.
- Provider selection for Ollama/LM Studio config.
- Strict schema validation.
- Malformed Qwen-style output rejection.
- Citation validation.
- Sensitive context exclusion before prompt construction.
- Job lifecycle success/failure/retry/cancel.
- Snapshot immutability.
- KAM Head-only approval.
- Safe logging: no raw prompt/source text/secrets.

Frontend tests:

- Run status loading/error/empty states.
- Workstream status display.
- Citation drawer.
- Retry/cancel controls.
- Rejection modal.
- Sensitive citation masking.

Manual tests:

- Start Ollama or LM Studio with Qwen.
- Upload/reference an SOW.
- Extract/chunk source.
- Trigger KYC run.
- Worker completes run.
- Review citations.
- Reject with reason.
- Retry/regenerate.
- Approve as KAM Head.
- Verify snapshot changes only after approval.

## Phase 10: Reference Document Prompt Tuning

### Scope

Use reference documents to improve KYC depth and field quality.

Reference documents:

- `requirements/Account Informationn Reference .pdf`
- `requirements/SOW_CANVS_TKLLC_007 .pdf`
- `requirements/SOW_CANVS_TKLLC_007 .docx`

Implementation tasks:

- Extract/reference these documents during prompt design.
- Build expected KYC depth checklist from the reference Account Information document.
- Tune local Qwen prompts for:
  - fuller field content
  - source-bound wording
  - no unsupported public-web claims
  - clear missing evidence notes
  - useful follow-up questions
- Add prompt fixture tests using mocked local-provider output.
- Do not seed reference docs as official customer data.
- Do not attach reference documents to a demo account in this phase.
- Use reference documents only for prompt tuning, expected-depth checks, and non-customer prompt fixtures.

Acceptance criteria:

- KYC output is richer than one-liners.
- Fields are sectioned and source-cited.
- Weak/missing evidence is explicit.
- Local model prompt remains compatible with Ollama/LM Studio response behavior.

## Security And Data Privacy Rules

- Never send local demo KYC prompts to paid/external OpenAI unless `AI_KYC_PROVIDER=openai`.
- For `local_openai_compatible`, all model calls should go to `AI_KYC_BASE_URL`.
- Do not scrape LinkedIn.
- Do not call ZoomInfo, Crunchbase, Travoly/Trivoly, or web search.
- Do not log raw prompts or full source text.
- Do not log model API key values.
- Keep deterministic adapter available for tests.
- Redact sensitive commercial/financial context when caller lacks permission.
- Mask restricted citations for unauthorized viewers.

## Cost Model

Local Qwen through Ollama/LM Studio:

- API cost: zero.
- Hardware cost: local laptop CPU/GPU usage.
- Main tradeoff: slower generation and variable output quality compared with hosted models.

OpenAI optional fallback:

- Disabled by default for this local plan.
- Requires explicit env change and budget caps.

## Risks

| Risk | Severity | Mitigation |
|---|---:|---|
| Local Qwen returns malformed JSON | High | Strict prompt, JSON parsing guard, schema validation, retry once, safe failure. |
| Local model output is too shallow | High | Phase 10 prompt tuning against reference documents; larger model option. |
| Local model is slow or times out | Medium | Async worker, longer timeout, smaller retrieval context, smaller model option. |
| Ollama/LM Studio model IDs vary by machine | Medium | Configurable `AI_KYC_MODEL`; health-check endpoint; docs for both paths. |
| Citation hallucination | Critical | Validate citations against retrieved chunks/documents; downgrade unsupported claims. |
| Sensitive data leakage to logs | Critical | Safe logging, no raw prompt/source text. |
| Redis not available locally | Medium | Local worker fallback and manual admin run endpoint. |

## Recommended Implementation Order

1. Add `local_openai_compatible` provider adapter using existing OpenAI-compatible client path.
2. Add strict schema and citation validation.
3. Add local provider health check/smoke test endpoint or admin-visible status.
4. Add async worker lifecycle with the local worker loop and manual trigger.
5. Add retry/cancel endpoints.
6. Add source coverage and run retrieval endpoint.
7. Add KYC UI panels: status, citations, source coverage, rejection modal.
8. Add tests and security checks.
9. Tune prompt with reference documents.
10. Document local demo setup for Ollama and LM Studio.

## Resolved Questions Before Implementation

1. Ollama and LM Studio should both be supported equally through config.
   - Decision: implement one `local_openai_compatible` provider path.
   - Default documentation: Ollama because it is easier to run headless.
   - First-class alternative: LM Studio for users who prefer a UI.
2. Default local Qwen model should be `qwen3:8b`.
   - Decision: set `.env`/example default to `qwen3:8b`.
   - Larger Qwen models remain optional quality upgrades through `AI_KYC_MODEL`.
3. Phase 6 should start with a local worker loop plus manual trigger.
   - Decision: do not add Redis/RQ in the first local Qwen implementation.
   - Redis/RQ should be added later after local model generation, strict schema parsing, citations, and UI status behavior are stable.
4. Reference documents should be used only for prompt tuning.
   - Decision: do not seed or attach the reference documents to demo/customer accounts.
   - Reference docs are used for expected-depth guidance, prompt fixtures, and quality checks only.

## Final Implementation Defaults

- Provider: `local_openai_compatible`.
- Local servers: Ollama and LM Studio equally supported through env config.
- Documented default server: Ollama.
- First-class alternate server: LM Studio through env `AI_KYC_BASE_URL`.
- Default model: `qwen3:8b`.
- Embeddings: `local_hash` for first local demo.
- Queue: local worker loop plus manual trigger first, Redis/RQ later.
- Reference documents: prompt tuning only, not seeded or attached as official customer data.

## Implementation Readiness Plan

Implementation can start without additional provider credentials because the selected path uses local Qwen through Ollama or LM Studio.

Ready-to-implement sequence:

1. Add/finish the `local_openai_compatible` adapter behavior using `AI_KYC_BASE_URL`, `AI_KYC_MODEL`, and `AI_KYC_API_KEY`.
2. Add strict output schema parsing and citation validation before expanding UI behavior.
3. Add local worker lifecycle using `KYC_QUEUE_BACKEND=local`, `KYC_WORKER_ENABLED=true`, and a manual run-pending trigger.
4. Add retry/cancel/run-history endpoints and keep approved snapshots unchanged until KAM Head approval.
5. Add UI status/citation/source coverage/rejection modal changes.
6. Tune prompts using reference documents only as quality references.
7. Add Redis/RQ only after the local Qwen flow is stable.

No code, schema, packages, or runtime config have been changed by this plan update.

## Implementation Status

Implemented items:

- Added `local_openai_compatible` provider support for Ollama/LM Studio OpenAI-compatible local chat APIs.
- Set local Qwen defaults in env examples and local `.env`: `qwen3:8b`, local hash embeddings, zero AI budget, and local queue mode.
- Added persisted local KYC job lifecycle for pending, running, complete, partial, failed, cancelled, retry, and cancel.
- Added manual run-pending endpoints, including `/api/admin/kyc/jobs/run-pending`.
- Added a local KYC worker loop controlled by `KYC_WORKER_ENABLED`.
- Preserved approved snapshots; queued/new AI output updates drafts only and does not become official until KAM Head approval.
- Added KAM Head-only approve/reject enforcement.
- Added frontend run status, provider/model display, source coverage display, retry/cancel/manual run-pending controls, workstream citations, and an immediate rejection modal.
- Added feature context at `docs/features/local-qwen-ai-kyc-phase-5-to-10.md`.

Remaining items:

- Redis/RQ remains deferred until the local Qwen path is stable.
- Prompt tuning with reference documents still needs real local-model output review.
- Full production redaction policy should be centralized later; current sensitive field/citation masking remains service-level.
- Local provider health check endpoint can be added as a follow-up if demo operators need a preflight screen.

Technical notes:

- No database migration was required because `kyc_agent_runs`, `kyc_workstream_outputs`, retry fields, provider metadata, source context, and draft linkage already existed.
- The deterministic adapter remains synchronous and test-friendly.
- Local AI adapters are async-preferred, so browser requests return queued persisted runs/drafts instead of waiting for model completion.

Tests run:

- `python -m compileall backend/app/services/kyc_gateway.py backend/app/services/kyc.py backend/app/services/kyc_worker.py backend/app/routers/kyc.py backend/app/schemas.py backend/app/main.py`
- `backend/.venv/bin/python -m pytest backend/tests/test_ai_kyc_pipeline_phase_1_to_4.py backend/tests/test_kyc_ai_extraction.py -q`
- `npm --prefix frontend run test -- --run src/components/account/KYCAgentOverview.test.tsx src/components/account/KYCAssistedReview.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run build`
