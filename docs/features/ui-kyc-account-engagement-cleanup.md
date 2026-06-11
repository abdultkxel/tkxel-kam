# UI KYC, Account, And Engagement Cleanup

## Scope

Implements the requested placement and behavior adjustments for account onboarding, KYC review, account listing, and engagement charter import.

## Completed Behavior

- Account Overview KYC intelligence workstreams are closed by default; each section can be opened independently and stays open during refreshes when still available.
- Account Overview Health score calculator field groups and service line mapping are collapsed by default and can be opened independently when reviewing inputs.
- Account creation upload continues to run extraction without creating a draft until the user clicks `Create draft`.
- Account creation upload now uses the shared SOW structured extraction path with OpenAI first when configured, then local/deterministic fallback.
- Stored uploaded SOW/charter documents remain available for KYC/RAG after the reviewed form values create the draft.
- Account approval continues to create the default stakeholder and default KYC draft when those records do not already exist.
- Engagement tab includes `Import Charter`, which uploads a charter/SOW file, stores the source document, extracts text/chunks, maps engagement fields, and creates stakeholders from extracted stakeholder content.
- Engagement list/detail APIs normalize legacy seeded source links that used `route` into the public `url` field so existing demo Engagement/SOW records load correctly.
- KYC prompt, OpenAI response, provider debug/logs, Qwen/Ollama debug output, and runtime source extraction review are visible only to `super_admin`.
- KYC screen no longer shows the legacy `Research question`, bottom `Detailed AI description`, or right-sidebar `Review gates` sections.
- Account Overview KYC Client Research now renders in a full-width readable workstream layout with nested research details and source snippets formatted as text.
- CKEditor-backed fields render as readable text first and become editable on click.
- Account listing saved views and persisted saved-filter state have been removed.
- Account listing segment filter chips have been removed; the Accounts API request no longer forwards legacy `segment` query params from the page.
- Account listing now uses a consolidated search, filter, sort, and view control surface with active chips, risk pills, and an explicit AM workload chip for dashboard workload links.
- Stage Growth section label changed from `Whitespace and recommendations` to `Recommendations`.

## API Notes

- `POST /api/accounts/{account_id}/engagements/from-charter`
  - Accepts multipart file upload.
  - Creates an engagement from extracted project charter/SOW fields.
  - Stores the uploaded source document and document chunks for future KYC retrieval.
  - Creates stakeholder rows from extracted stakeholder data.

## Files Changed

- `backend/app/routers/accounts.py`
- `backend/app/schemas.py`
- `backend/app/services/engagements.py`
- `backend/app/services/onboarding.py`
- `backend/app/services/seed.py`
- `backend/app/services/sow_extraction.py`
- `frontend/src/components/account/EngagementsPanel.tsx`
- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx`
- `frontend/src/components/account/ScoreCalculators.tsx`
- `frontend/src/components/account/ScoreCalculators.test.tsx`
- `frontend/src/components/ui/RichTextEditor.tsx`
- `frontend/src/hooks/useEngagements.ts`
- `frontend/src/pages/Accounts.tsx`
- `frontend/src/services/accountWorkspace.ts`
- `frontend/src/stores/accountStore.ts`
- `frontend/src/types/account.ts`

## Validation And Security Notes

- The backend remains authoritative for source-document extraction, account draft creation, engagement creation, stakeholder persistence, RBAC, audit, and timeline events.
- Non-super-admin users no longer see prompt/raw-response/debug extraction surfaces on the KYC screen.
- KYC approval still calls the backend approval endpoint and records acknowledgements/change summary through existing audit behavior.
- Direct Google/LinkedIn scraping is not introduced by this change.

## Tests

- Frontend account listing tests were updated to remove saved-view assertions and cover the segment-filter removal and AM workload query behavior.
- Account Overview KYC agent tests cover Client Research nested values, readable source snippets, and the full-width workstream list.
- Account Overview Health score calculator tests cover collapsed-by-default field groups, service line mapping, and expansion on demand.
- Engagement API tests cover legacy seeded source-link normalization for Engagement/SOW list loading.
- KYC review tests were updated for super-admin-only debug panels and non-super-admin visibility.
- Additional backend validation is covered by py_compile and targeted service/API tests.

## Follow-Ups

- Add a browser/e2e test for charter Excel import once stable fixture workbooks are available.
- Confirm whether KYC approval auto-acknowledgement should remain hidden or be moved into a compact confirmation modal.
