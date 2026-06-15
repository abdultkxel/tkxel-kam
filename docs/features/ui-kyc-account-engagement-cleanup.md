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
- Engagement tab includes `Import Charter`, which uploads a charter/SOW file, stores the source document, reads it with deterministic document parsers, maps engagement fields, and creates an editable engagement draft.
- Imported engagement drafts can be edited, saved, approved, or rejected by users who can update the account. Approval creates the official Engagement/SOW record, links the source document, and creates drafted stakeholders.
- Engagement draft create/update notifications go to the assigned AM and KAM Head with the actor excluded; approval notifies KAM Head that a new engagement has been onboarded.
- Engagement list/detail APIs normalize legacy seeded source links that used `route` into the public `url` field so existing demo Engagement/SOW records load correctly.
- KYC prompt, OpenAI response, and runtime source extraction review are visible only to `admin` and `super_admin`; Account Manager, KAM Head, and other users only see the simple `Run KYC` action.
- Provider debug/logs and Qwen/Ollama debug output remain limited to admin users with KYC debug permission.
- KYC prompt and review fields use native textareas that render read-only first and become editable when clicked.
- KYC review sections no longer display confidence/completeness/source-coverage percentages.
- KYC screen no longer shows the legacy `Research question`, bottom `Detailed AI description`, or right-sidebar `Review gates` sections.
- Account Overview KYC Client Research now renders in a full-width readable workstream layout with nested research details and source snippets formatted as text.
- Account Overview KYC workstream cards no longer display workstream or field confidence percentages.
- KYC review no longer mounts CKEditor instances, avoiding toolbar/dropdown focus issues on the KYC screen.
- Account listing saved views and persisted saved-filter state have been removed.
- Account listing segment filter chips have been removed; the Accounts API request no longer forwards legacy `segment` query params from the page.
- Account listing now uses a consolidated search, filter, sort, and view control surface with active chips, risk pills, and an explicit AM workload chip for dashboard workload links.
- Stage Growth section label changed from `Whitespace and recommendations` to `Recommendations`.

## API Notes

- `POST /api/accounts/{account_id}/engagements/from-charter`
  - Accepts multipart file upload.
  - Creates an editable engagement import draft from deterministic project charter/SOW parsing.
  - Stores the uploaded source document and document chunks for future KYC retrieval without calling AI extraction.
- `GET /api/accounts/{account_id}/engagement-drafts`
  - Lists pending engagement import drafts for the account.
- `PATCH /api/engagement-drafts/{draft_id}`
  - Saves editable draft fields and sends draft-change notifications.
- `POST /api/engagement-drafts/{draft_id}/approve`
  - Converts the draft into an official engagement, links source documents, creates drafted stakeholders, and sends approval/onboarding notifications.
- `POST /api/engagement-drafts/{draft_id}/reject`
  - Rejects the draft with a reason and notifies the draft creator/owner.

## Files Changed

- `backend/app/routers/accounts.py`
- `backend/app/routers/engagements.py`
- `backend/app/schemas.py`
- `backend/app/services/engagements.py`
- `backend/app/services/notification_catalog.py`
- `backend/app/services/onboarding.py`
- `backend/app/services/seed.py`
- `backend/app/services/sow_extraction.py`
- `backend/migrations/20260614_engagement_import_drafts.sql`
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
- Non-admin users no longer see prompt/raw-response/runtime extraction surfaces on the KYC screen, but they can still run KYC through the simplified action.
- KYC approval still calls the backend approval endpoint and records acknowledgements/change summary through existing audit behavior.
- Direct Google/LinkedIn scraping is not introduced by this change.

## Tests

- Frontend account listing tests were updated to remove saved-view assertions and cover the segment-filter removal and AM workload query behavior.
- Account Overview KYC agent tests cover Client Research nested values, readable source snippets, hidden confidence percentages, and the full-width workstream list.
- Account Overview Health score calculator tests cover collapsed-by-default field groups, service line mapping, and expansion on demand.
- Engagement API tests cover legacy seeded source-link normalization for Engagement/SOW list loading.
- Engagement charter-import API tests cover deterministic parser usage, draft save notifications, approval, source-document linking, and stakeholder creation.
- Engagement tab tests cover imported draft review actions.
- KYC review tests cover Admin/Super Admin prompt/source visibility, Account Manager/KAM Head simplified KYC running, read-only prompt activation on click, and hidden percentage badges.
- Additional backend validation is covered by py_compile and targeted service/API tests.

## Follow-Ups

- Add a browser/e2e test for charter Excel import once stable fixture workbooks are available.
- Confirm whether KYC approval auto-acknowledgement should remain hidden or be moved into a compact confirmation modal.
