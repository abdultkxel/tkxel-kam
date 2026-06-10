# UI KYC, Account, And Engagement Cleanup

## Scope

Implements the requested placement and behavior adjustments for account onboarding, KYC review, account listing, and engagement charter import.

## Completed Behavior

- Account Overview KYC intelligence workstreams open all five sections by default and each section can be collapsed or reopened independently.
- Account creation upload continues to run extraction without creating a draft until the user clicks `Create draft`.
- Account creation upload now uses the shared SOW structured extraction path with OpenAI first when configured, then local/deterministic fallback.
- Stored uploaded SOW/charter documents remain available for KYC/RAG after the reviewed form values create the draft.
- Account approval continues to create the default stakeholder and default KYC draft when those records do not already exist.
- Engagement tab includes `Import Charter`, which uploads a charter/SOW file, stores the source document, extracts text/chunks, maps engagement fields, and creates stakeholders from extracted stakeholder content.
- KYC prompt, OpenAI response, provider debug/logs, Qwen/Ollama debug output, and runtime source extraction review are visible only to `super_admin`.
- KYC screen no longer shows the legacy `Research question`, bottom `Detailed AI description`, or right-sidebar `Review gates` sections.
- CKEditor-backed fields render as readable text first and become editable on click.
- Account listing saved views and persisted saved-filter state have been removed.
- Stage Growth section label changed from `Whitespace and recommendations` to `Recommendations`.

## API Notes

- `POST /api/accounts/{account_id}/engagements/from-charter`
  - Accepts multipart file upload.
  - Creates an engagement from extracted project charter/SOW fields.
  - Stores the uploaded source document and document chunks for future KYC retrieval.
  - Creates stakeholder rows from extracted stakeholder data.

## Files Changed

- `backend/app/routers/accounts.py`
- `backend/app/services/engagements.py`
- `backend/app/services/onboarding.py`
- `backend/app/services/sow_extraction.py`
- `frontend/src/components/account/EngagementsPanel.tsx`
- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx`
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

- Frontend account listing tests were updated to remove saved-view assertions.
- KYC review tests were updated for super-admin-only debug panels and non-super-admin visibility.
- Additional backend validation is covered by py_compile and targeted service/API tests.

## Follow-Ups

- Add a browser/e2e test for charter Excel import once stable fixture workbooks are available.
- Confirm whether KYC approval auto-acknowledgement should remain hidden or be moved into a compact confirmation modal.
