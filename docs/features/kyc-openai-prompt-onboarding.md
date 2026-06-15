# KYC OpenAI Prompt And Onboarding Defaults

## Scope

Implements the account-creation and KYC review workflow where uploaded SOW/charter evidence drives the KYC prompt, account approval seeds default account intelligence, and AI KYC uses OpenAI as the active provider.

## Decisions

- OpenAI is the primary KYC provider when `AI_KYC_PROVIDER=openai`.
- Local fallback code remains available but is paused by default through `AI_KYC_FALLBACK_ENABLED=false`.
- Provider credentials are environment-only and are not stored in Admin Integrations.
- The user-editable KYC prompt is stored with the KYC run metadata so re-runs can preserve reviewer intent.
- Approved KYC snapshots remain immutable. Re-running AI creates or updates drafts/run output and does not replace an approved snapshot until a KAM Head or Super Admin approves it.
- Account approval from onboarding seeds a default stakeholder and a default source-prefilled KYC draft when those records do not already exist.
- KYC prompt generation uses account fields, approved SOW/charter source documents, structured SOW metadata, extracted document text excerpts, and previous approved KYC snapshot context.
- The visible KYC prompt is a compact textarea, not a rich text editor, and provider routing/fallback wording is not included in the user-facing prompt. The prompt is read-only until an admin clicks it to edit.
- The KYC prompt, OpenAI response, and runtime source extraction review are now visible only to `admin` and `super_admin`; Account Manager, KAM Head, and other users use a simple `Run KYC` action plus the mapped KYC fields, draft queue, issues, and snapshot history.
- The KYC tab uses native textareas for KYC fields, AI output, logs, source extraction review, rejection notes, and restore notes so CKEditor toolbars do not open on field focus.
- KYC review surfaces no longer show confidence/completeness/source-coverage percentages in the visible review sections.
- The legacy KYC `Research question`, bottom `Detailed AI description`, and right-sidebar `Review gates` panels are removed from the normal KYC review surface.
- Direct Google scraping, unofficial LinkedIn scraping, and uncredentialed ZoomInfo access remain blocked. Web enrichment must come through approved provider context such as Tavily or future approved APIs.

## API Contract

- `GET /api/accounts/{account_id}/kyc/default-prompt`
  - Returns an editable default prompt plus selected source document IDs and source summaries.
  - Used by the KYC tab before triggering a draft/run.
- `POST /api/accounts/{account_id}/kyc/drafts`
  - Accepts optional `prompt`.
  - Queued and immediate AI draft creation persist the prompt into run metadata.
- `POST /api/accounts/{account_id}/kyc/agent-runs`
  - Accepts optional `prompt`.
  - Refresh/retry preserves the prior run prompt when no new prompt is provided.

## Data Model Notes

- Existing `kyc_agent_runs.provider_json` stores provider/model/fallback metadata and the reviewer prompt.
- Existing `kyc_agent_runs.retrieval_summary_json` stores source document IDs, source coverage, reviewer prompt, prompt debug sections, raw responses, workstream calls, and runtime events.
- Existing `kyc_drafts` stores default onboarding KYC drafts and AI-generated drafts.
- Existing `stakeholders` stores the default stakeholder seeded during onboarding approval.
- Existing immutable `kyc_snapshots` continue to represent approved versions.

## Backend Implementation

- Config and environment:
  - `backend/app/config.py`
  - `.env.example`
  - `docker-compose.yml`
- KYC gateway and fallback:
  - `backend/app/services/kyc_gateway.py`
- KYC prompt/run workflow:
  - `backend/app/services/kyc.py`
  - `backend/app/routers/kyc.py`
  - `backend/app/schemas.py`
- Onboarding approval defaults:
  - `backend/app/services/onboarding.py`

## Frontend Implementation

- KYC tab editable prompt window:
  - `frontend/src/components/account/KYCAssistedReview.tsx`
- KYC HTML-to-text display helper:
  - `frontend/src/utils/htmlText.ts`
- KYC API service/types:
  - `frontend/src/services/kyc.ts`
  - `frontend/src/types/kyc.ts`

## Validation And Security Notes

- KYC approval permissions remain enforced by existing backend authorization rules.
- Sensitive KYC fields still use existing RBAC visibility.
- AI prompts and raw responses are intentionally captured for local/demo traceability, but provider secrets are not logged.
- OpenAI runtime failures fail the run unless fallback is explicitly enabled in environment settings.
- If both providers fail, the run remains failed and existing approved KYC remains active.

## Tests

- `docker compose exec -T backend pytest -q tests/test_kyc_ai_extraction.py tests/test_account_workspace.py::test_onboarding_draft_approval_creates_account_sources_and_engagement tests/test_account_workspace.py::test_onboarding_upload_extracts_customer_from_contract_style_sow`
- `python3 -m py_compile backend/app/services/kyc_gateway.py backend/app/services/kyc.py backend/app/services/onboarding.py backend/app/schemas.py backend/app/routers/kyc.py`
- `docker compose run --rm --no-deps frontend npm test -- KYCAssistedReview.test.tsx`
- `docker compose run --rm --no-deps frontend npm test -- htmlText.test.ts`
- `docker compose run --rm --no-deps frontend npm run typecheck`

## Known Follow-Ups

- Confirm the production OpenAI model name and access before a production demo.
- Decide whether prompt debug storage should be redacted or admin-gated outside local/demo environments.
- Add a full browser test for SOW upload, prompt editing, AI run, approval, and snapshot restore once the test harness has stable fixture documents.
