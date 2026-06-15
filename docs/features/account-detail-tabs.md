# Account Detail Tabs

## Summary

Account detail now uses a streamlined Account 360 tab set. Stakeholders remains a standalone account tab. Standalone Planning, Growth, Renewal, Retention, and Escalation tabs are removed from the account detail navigation.

Growth and Retention remain available as two internal tabs inside Stage. The previous Stage Control lifecycle panel is removed from Account 360.

## Scope

- In scope:
  - Account detail tab order: Overview, Engagement, Stakeholders, KYC, Health, Stage, Opportunities, Governance, Education, Timeline, Notes, Documents.
  - Account overview command center without the Generate handover button.
  - Account overview AI Brief that synthesizes local account/timeline/opportunity/governance data and can save the generated text as a timeline note.
  - Engagement owner assignment follows the account's active primary Account Manager and is read-only in the engagement form.
  - Engagement profile shows the linked account name rather than the raw account id.
  - Legacy deep links for `engagements`, `stakeholders`, `growth`, `retention`, `renewal`, and `planning`.
  - Stage tab renders existing Growth whitespace and Retention plan panels as two internal tabs.
- Out of scope:
  - Removing retention, renewal, or account-planning backend APIs.
  - Changing engagement renewal fields used by other modules.
  - Reworking the global Escalations page or governance renewal signals.

## Requirement Links

- PRD IDs: None provided.
- Tickets: None provided.
- Related docs:
  - `docs/features/relationships-planning-growth-retention.md`
  - `docs/features/growth-opportunity-management.md`

## User Flow

Users open an account detail page and see the reduced Account 360 tab set with Stakeholders available after Engagement. Selecting Stage shows only the Growth and Retention workspace tabs. Old saved URLs such as `/accounts/:id?tab=stakeholders` open Stakeholders, while `/accounts/:id?tab=growth`, `/accounts/:id?tab=retention`, `/accounts/:id?tab=renewal`, or `/accounts/:id?tab=planning` land on Stage with the matching workspace tab selected where possible.

## Backend Plan

- Routers: No backend route changes.
- Services: Engagement create/update and import approval resolve owner from the account's active primary Account Manager.
- Repositories: No repository changes.
- Schemas/validation: Engagement create accepts omitted `owner_id`; backend assigns the account primary Account Manager. Engagement responses include `account_name` for display.
- Helpers: Engagement service helper resolves the active primary Account Manager and returns a field-level error when missing.

## API Documentation

- Swagger summary/description updates: Not applicable.
- Response descriptions: Not applicable.
- Error responses: Not applicable.

## Database Plan

- Tables: No changes.
- Columns: No changes.
- Migrations: None.
- Snake_case schema check: Not applicable.

## Frontend Plan

- Pages/components:
  - `frontend/src/components/account/Account360.tsx`
  - `frontend/src/pages/AccountDetail.tsx`
- Stores/hooks/services:
  - Reuse existing account, stakeholder, opportunity, governance, timeline, growth whitespace, and retention plan stores/services.
- Form behavior:
  - Existing Growth and Retention forms keep their current validation and backend error behavior.
  - The AI Brief `Edit summary` action stores the generated summary as an editable timeline note rather than changing account master data.
  - The Engagement/SOW form displays Account Manager as read-only and does not submit owner changes.
- Backend error display:
  - Existing Growth and Retention panels continue showing their own API errors.

## Validation And Errors

- Backend validation classes/schemas: Existing validation remains authoritative.
- Field-level error messages: Existing panel behavior is unchanged.
- Frontend display behavior: Removed tabs cannot be selected from Account 360; Stakeholders remains selectable and legacy query params resolve to supported tabs.

## Tests

- Backend unit/API tests:
  - `backend/tests/test_account_workspace.py`
- Frontend unit/component tests:
  - `frontend/src/components/account/Account360.test.tsx`
  - `frontend/src/components/account/EngagementsPanel.test.tsx`
  - `frontend/src/pages/EngagementDetail.test.tsx`
- Edge cases:
  - Removed standalone tab names do not render as Account 360 tabs.
  - Stakeholders renders as a standalone Account 360 tab.
  - Legacy Growth/Retention/Renewal/Planning links resolve to Stage.
  - Stage Control lifecycle copy and controls do not render in Account 360.
  - Legacy Engagements links resolve to Engagement and Stakeholders links resolve to Stakeholders.

## Linting And Quality

- Lint/typecheck commands:
  - `docker compose run --rm backend pytest tests/test_account_workspace.py -k engagement`
  - `docker compose run --rm --no-deps frontend npm test -- Account360.test.tsx`
  - `docker compose run --rm --no-deps frontend npm test -- EngagementsPanel.test.tsx`
  - `docker compose run --rm --no-deps frontend npm test -- EngagementDetail.test.tsx`
  - `docker compose run --rm --no-deps frontend npm run typecheck`
- Known code smells or tradeoffs:
  - Renewal-related domain models and APIs remain because engagement renewal data is still used by retention, governance, scoring, and notifications.

## Open Questions

- None.

## Handoff Notes

- Setup notes: No migration or seed changes.
- Manual verification: Open `/accounts/:id?tab=stakeholders` to confirm Stakeholders opens, then `/accounts/:id?tab=stage`, `/accounts/:id?tab=growth`, and `/accounts/:id?tab=renewal`; the Stage URLs should show Stage with only Growth/Retention workspace tabs.
- Follow-ups: None.
