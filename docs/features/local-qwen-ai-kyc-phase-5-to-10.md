# Local Qwen AI KYC Phase 5-10

## Summary

Implements the free local AI path for the production-grade KYC pipeline using Qwen through Ollama or LM Studio via an OpenAI-compatible local API.

## Decisions

- Provider uses `AI_KYC_PROVIDER=local_openai_compatible`.
- Ollama is the documented default local server.
- LM Studio is a first-class alternative through `AI_KYC_BASE_URL`.
- Default local model is `qwen3:8b`.
- Local hash embeddings are the default for demo to avoid paid embedding calls.
- Phase 6 uses a local worker loop plus manual run-pending trigger.
- Redis/RQ is deferred until local model output, schema validation, citations, and UI status behavior are stable.
- Reference KYC/SOW documents are for prompt tuning only and are not seeded or attached to demo accounts.

## API Changes

- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/retry`
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/cancel`
- `POST /api/kyc/jobs/run-pending`
- `POST /api/admin/kyc/jobs/run-pending`

Existing KYC draft and agent-run APIs now support queued local AI runs when the configured gateway is async-preferred.

## Backend Implementation

- Local OpenAI-compatible adapter added for Ollama/LM Studio chat-completion APIs.
- Real/local AI provider calls are queued instead of executed in the browser request path.
- Pending runs create persisted `kyc_agent_runs` and `kyc_workstream_outputs`.
- Local worker processes queued runs and updates linked KYC drafts after completion.
- Failed runs keep approved snapshots unchanged.
- Retry and cancel lifecycle actions are persisted and audited.
- KAM Head-only approve/reject enforcement is applied in the KYC service.

Important files:

- `backend/app/services/kyc_gateway.py`
- `backend/app/services/kyc.py`
- `backend/app/services/kyc_worker.py`
- `backend/app/repositories/kyc.py`
- `backend/app/routers/kyc.py`
- `backend/app/schemas.py`
- `backend/app/main.py`

## Frontend Implementation

- KYC Agent Overview displays provider/model metadata, citations, pending/running/cancelled statuses, retry, cancel, and manual run-pending controls.
- KYC Review displays latest AI run status and source coverage.
- KYC rejection now opens an immediate modal instead of relying on a down-page rejection reason field.

Important files:

- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/services/kyc.ts`
- `frontend/src/types/kyc.ts`

## Environment

Recommended local defaults:

```env
AI_KYC_PROVIDER=local_openai_compatible
AI_KYC_API_KEY=local-demo
AI_KYC_BASE_URL=http://127.0.0.1:11434/v1
AI_KYC_MODEL=qwen3:8b
AI_KYC_EMBEDDING_PROVIDER=local_hash
AI_KYC_EMBEDDING_MODEL=local_hash
AI_KYC_EMBEDDING_DIMENSIONS=384
KYC_QUEUE_BACKEND=local
KYC_WORKER_ENABLED=true
```

Use `AI_KYC_BASE_URL=http://127.0.0.1:1234/v1` for LM Studio.

## Testing Notes

Automated coverage includes local queue persistence, manual worker processing, draft population after run completion, cancel, and retry behavior with a fake async local adapter.

Checks run during implementation:

- `python -m compileall backend/app/services/kyc_gateway.py backend/app/services/kyc.py backend/app/services/kyc_worker.py backend/app/routers/kyc.py backend/app/schemas.py backend/app/main.py`
- `backend/.venv/bin/python -m pytest backend/tests/test_ai_kyc_pipeline_phase_1_to_4.py backend/tests/test_kyc_ai_extraction.py -q`
- `npm --prefix frontend run test -- --run src/components/account/KYCAgentOverview.test.tsx src/components/account/KYCAssistedReview.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run build`

Manual local test:

1. Run `ollama pull qwen3:8b`.
2. Run `ollama serve`.
3. Start backend/frontend.
4. Create an account and upload/attach source material.
5. Open Account KYC.
6. Create KYC draft or refresh AI data.
7. Verify the run goes `pending`/`running`/`complete`.
8. Review citations and approve/reject as KAM Head.

## Risks

- Local Qwen may return malformed JSON; schema parsing fails safely.
- Local model quality depends on selected model and source retrieval quality.
- Long prompts can still be slow; async worker prevents browser request timeouts.
- Redis/RQ is intentionally deferred and should be added once the local path is stable.
