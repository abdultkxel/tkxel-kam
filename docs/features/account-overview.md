# Account Overview

## Summary

Account Overview is the primary account intelligence workspace for KAM users. It should preserve the existing `/accounts/:id` and Account 360 design while making `GET /api/accounts/{account_id}/overview` the frontend source of truth for account profile, summary cards, permissions, first-page engagements, and attachments.

The first implementation slice is the frontend-backend bridge for Story 3.1: load the overview payload, render backend-backed summary cards, link cards to source sections, and enforce read-only behavior for leadership viewers.

## Scope

- In scope:
  - API-backed Account Overview entry at `/accounts/:id`.
  - Frontend service contract and mapper for `GET /api/accounts/{account_id}/overview`.
  - Summary cards for commercial value, lifecycle/stage, health, open signals, overdue activities, next governance event, open opportunities, and active escalations where backend data exists.
  - Source-linked navigation from summary cards to Account 360 tabs.
  - Read-only UI behavior from backend `permissions.read_only`.
  - Loading, empty, and error states for the overview shell and module sections.
  - Focused backend and frontend coverage for the overview payload, permissions, read-only behavior, and missing downstream data.
- Out of scope:
  - Rebuilding the Account 360 visual design from scratch.
  - Implementing full downstream modules that have their own specs, such as opportunities, governance, escalations, KYC, timeline, scoring, and content.
  - New database tables unless a summary-card count requires a missing persisted source that belongs to this feature slice.
  - Production AI Account Brief generation beyond preserving the existing Account 360 AI brief entry point.

## Requirement Links

- PRD IDs:
  - `V3-FR-010` - Account Overview as the primary workspace for account profile, engagements, KYC, stakeholders, plan, scores, signals, activities, opportunities, education, escalations, governance, attachments, timeline, and AI brief.
  - `V3-FR-011` - Account summary cards for ARR/commercial value, stage, health, open signals, overdue activities, next governance event, open opportunities, and active escalations, with links to source sections.
  - `V3-FR-012` - Leadership Viewer read-only Account Overview with no restricted edit controls.
- Tickets:
  - None yet.
- Related docs:
  - `requirements/KAM_USER_STORIES.md` Story 3.1 - Unified account workspace.
  - `specs/01-account-workspace-and-engagements.md`.
  - `README.md` Docker-first workflow, Swagger, and test commands.
  - `AGENTS.md` feature context, backend, frontend, and quality rules.

## User Flow

1. Authorized user opens `/accounts/:id`.
2. Frontend loads the unified overview payload from `GET /api/accounts/{account_id}/overview`.
3. User sees account profile, summary cards, section tabs, quick actions, and embedded timeline entry points.
4. User clicks a summary card to jump to the matching Account 360 section.
5. KAM/KAM Head/Admin users see operational controls only when backend permissions allow them.
6. Leadership Viewer sees authorized intelligence but does not see edit, create, assign, approval, or restricted management controls.
7. Empty downstream sections show useful empty states without breaking the overall page.

## Backend Plan

- Routers:
  - Keep `backend/app/routers/accounts.py` thin.
  - Existing endpoints:
    - `GET /api/accounts/{account_id}/overview`
    - `GET /api/accounts/{account_id}/summary-cards`
    - `GET /api/accounts/{account_id}/permissions`
  - Extend Swagger descriptions and response docs only if the response contract changes.
- Services:
  - Keep account-view authorization and summary-card calculation in `AccountService`.
  - Use downstream domain services only for first-page or summary data needed by the overview contract.
  - Ensure missing downstream module data defaults safely instead of raising errors that break the whole overview.
- Repositories:
  - Use `AccountRepository` for account, ownership, attachment, and account-level count queries.
  - Account summary counts for open signals, overdue activities, open opportunities, and active escalations are derived from existing persisted downstream tables.
  - Avoid direct database access from routers.
- Schemas/validation:
  - Existing response schemas are in `backend/app/schemas.py`:
    - `AccountOverviewRead`
    - `AccountSummaryCardsRead`
    - `AccountPermissionsRead`
  - Account existence and access checks remain service-level validation.
  - Summary cards must not include fields the current user cannot view.
- Helpers:
  - Use existing pagination helpers and account access helpers.
  - Add small mapping/count helpers only when they reduce duplication across overview and list screens.

## API Documentation

- Swagger summary/description updates:
  - Keep `Read account overview` as the unified Account Overview payload.
  - Confirm `Read account summary cards` describes commercial value, lifecycle/stage, risk, health, governance, signal, opportunity, and escalation data.
  - Confirm `Read account permissions` documents effective UI permissions.
- Response descriptions:
  - Document `401`, `403`, and `404` for overview and summary endpoints.
  - Add `403` and `404` response descriptions to permissions endpoint if missing during implementation.
- Error responses:
  - `401`: missing, invalid, or expired bearer token.
  - `403`: authenticated user cannot view this account.
  - `404`: account was not found.
  - Section-level downstream failures should be represented as empty/default summary values where the backend contract supports it.

## Database Plan

- Tables:
  - Use existing account workspace tables for accounts, owners, source documents, engagements, KYC snapshots, opportunities, escalations, governance, and timeline records as each downstream module is available.
- Columns:
  - No new Account Overview table is planned.
  - Summary card values should be derived from authoritative domain records, not duplicated in a separate overview table.
- Migrations:
  - No migration for the planning slice.
  - Add migrations later only when a missing persisted downstream source is explicitly implemented.
- Snake_case schema check:
  - Any new database tables or columns must use snake_case.

## Frontend Plan

- Pages/components:
  - Refactor `frontend/src/pages/AccountDetail.tsx` to load `getAccountOverview()` instead of only `getAccount()`.
  - Pass the overview payload into `frontend/src/components/account/Account360.tsx`.
  - Keep existing Account 360 tabs and layout.
  - Use summary-card clicks to call the existing tab/search-param behavior.
- Stores/hooks/services:
  - Add `getAccountOverview(token, accountId)` to `frontend/src/services/accountWorkspace.ts`.
  - Define frontend types for overview, summary cards, and permissions.
  - Continue using existing stores for downstream sections until each module is separately API-backed, but prefer the overview payload for account, summary cards, first-page engagements, attachments, and permissions.
  - Avoid direct API calls inside components outside the service layer.
- Form behavior:
  - No new form is planned in this slice.
  - Hide or disable edit/create controls from `overview.permissions`, especially for read-only users.
  - Do not use the HTML `required` attribute if forms are touched later.
- Backend error display:
  - Account-level load errors should use the existing `EmptyState` pattern.
  - Future field-level mutation errors should display backend validation messages beside matching fields.

## Validation And Errors

- Backend validation classes/schemas:
  - `AccountOverviewRead`, `AccountSummaryCardsRead`, and `AccountPermissionsRead` define the overview response contract.
  - Account ID validation is handled through existing lookup and authorization service methods.
- Field-level error messages:
  - No field-editing behavior in this planning slice.
  - If status, ownership, attachment, or engagement mutations are pulled into the slice later, use existing Pydantic request schemas and surface backend field errors.
- Frontend display behavior:
  - Show skeletons while loading the overview shell.
  - Show account-level error state for inaccessible or missing accounts.
  - Show empty states for no engagements, no attachments, no opportunities, no escalations, no governance, or no timeline entries.
  - Do not let missing downstream module data block the account header and summary cards.

## Tests

- Backend unit/API tests:
  - Existing `backend/tests/test_account_workspace.py` covers overview creation after onboarding approval.
  - Add/confirm tests for:
    - `GET /api/accounts/{account_id}/overview` happy path with account, summary cards, permissions, engagements, and attachments.
    - `403` unauthorized account access.
    - `404` missing account.
    - Leadership Viewer `permissions.read_only`.
    - Summary card defaults when downstream data is missing.
    - Swagger/OpenAPI summaries and response descriptions for overview, summary cards, and permissions.
- Frontend unit/component tests:
  - Add `AccountDetail` test proving `/api/accounts/{id}/overview` is called.
  - Add `Account360` test proving summary cards render from `overview.summaryCards`.
  - Add card navigation test for source-linked tab changes.
  - Add read-only behavior test proving restricted controls are hidden when `permissions.readOnly` is true.
  - Add loading and error state coverage for the overview shell.
- Edge cases:
  - Account exists but has no engagements or attachments.
  - Leadership Viewer can view account intelligence but cannot see restricted actions.
  - Summary-card counts are zero.
  - Downstream module data is absent while the account profile still loads.
  - Cached account exists locally but backend overview refresh fails.

## Linting And Quality

- Lint/typecheck commands:
  - Backend focused check: `docker compose run --rm --no-deps backend pytest tests/test_account_workspace.py`.
  - Frontend focused check: `docker compose run --rm --no-deps frontend npm test -- AccountDetail.test.tsx Account360.test.tsx`.
  - Full check: `make test`.
- Verification run:
  - Current Account Overview check run on 2026-06-02:
    - `docker compose run --rm --no-deps backend pytest tests/test_account_workspace.py` - passed, 19 tests; existing warnings for Starlette/httpx deprecation, FastAPI 422 deprecation, and duplicate `signals.py` OpenAPI operation ID.
    - `docker compose run --rm --no-deps frontend npm test -- AccountDetail.test.tsx Account360.test.tsx` - passed, 2 files and 4 tests; existing React Router v7 future-flag warnings.
    - `make test` - failed during the backend pytest step with 78 passed and 2 failed; failures were `tests/test_allowed_email_domains.py::test_seeded_domains_are_available_to_admin` expecting `camp1.tkxel.io` in seeded domains and `tests/test_stakeholder_api.py::test_unauthorized_account_user_cannot_access_stakeholders` raising `403` while creating a stakeholder with the seeded admin.
    - Skipped by `make test`: full frontend `npm test`, because the Makefile stops after the backend pytest failure.
  - `docker compose run --rm --no-deps backend pytest tests/test_account_workspace.py` - passed, 19 tests.
  - `docker compose run --rm --no-deps frontend npm test -- accountWorkspace.test.ts` - passed, 2 tests.
  - `docker compose run --rm --no-deps frontend npm test -- AccountDetail.test.tsx accountWorkspace.test.ts` - passed, 3 tests.
  - `docker compose run --rm --no-deps frontend npm test -- Account360.test.tsx KYCAgentOverview.test.tsx AccountDetail.test.tsx accountWorkspace.test.ts` - passed, 8 tests.
  - `docker compose run --rm --no-deps frontend npm run build` - passed; Vite reported the existing large chunk warning.
- Known code smells or tradeoffs:
  - `Account360` currently derives multiple overview values from local stores; the first implementation should migrate account, summary-card, permissions, first-page engagement, and attachment data to the overview payload without rewriting every downstream tab.
  - Summary cards still represent section-level health with counts/nulls rather than per-section load status metadata.

## Open Questions

- Should summary card `stage` display lifecycle status, frontend account stage, or a dedicated backend stage field?
- Should the overview endpoint include first-page timeline entries now, or should the Timeline tab remain independently loaded until the timeline feature slice owns it?
- Should summary cards return route/tab metadata from the backend, or should frontend maintain the card-to-tab mapping?
- Which edit controls are explicitly allowed for Admin when policy allows view but not account maintenance?
- Should missing downstream module data be represented only as zero/null values, or should the overview contract include per-section status metadata?

## Handoff Notes

- Setup notes:
  - Use Docker-first workflow from `README.md`.
  - Swagger is available at `http://127.0.0.1:8001/docs`.
  - Default super admin login is documented in `README.md`.
- Manual verification:
  - Open `/accounts/:id`.
  - Confirm the frontend requests `/api/accounts/{id}/overview`.
  - Confirm summary cards use backend data and card clicks switch tabs.
  - Confirm Leadership Viewer sees read-only Account Overview with no restricted controls.
  - Confirm account page still renders with no engagements, no attachments, no opportunities, no escalations, and no governance events.
- Follow-ups:
  - Frontend overview service and types are implemented in `frontend/src/services/accountWorkspace.ts`.
  - `AccountDetail` now loads `GET /api/accounts/{id}/overview` and passes the overview payload to `Account360`.
  - `Account360` Overview summary cards now read from `overview.summaryCards`, navigate via existing tab search-param behavior, and hide mutation controls when `overview.permissions` is read-only.
  - Backend Account Overview tests now cover 403/404 access, Leadership Viewer read-only permissions, empty downstream data, downstream summary counts, and Swagger summaries/responses.
