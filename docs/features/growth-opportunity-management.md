# Growth & Opportunity Management

## Summary

Build opportunity management as a fully functional account and engagement growth workflow. The feature covers opportunity creation, assignment, value/target tracking, board and list pipeline views, stage movement, filtering, totals, soft archive behavior, timeline-backed history for stage changes, wins, losses, archived records, decisions, and task-linked opportunity action items.

## Scope

- In scope:
  - Opportunity CRUD for account-level and engagement-level opportunities.
  - Opportunity type configuration for Admin/KAM Head.
  - Pipeline stages using the current UI stage names.
  - User-directed movement between stages by drag/drop or list/detail controls.
  - Board view grouped by stage.
  - List view with search, filters, sorting, and pagination.
  - Pipeline totals by stage and value.
  - Detail dialog with field values, opportunity action items, decisions, history, and optional linked task context.
  - Optional first-class Task creation from opportunity action items using source type `opportunity_action_item`.
  - Soft archive/delete behavior that preserves timeline and source-link integrity.
  - Timeline events for creation, stage changes, wins, losses, archives, and source-linked decisions.
  - Audit events for material opportunity and taxonomy changes.
  - Account 360 Opportunities tab backed by the same APIs.
- Out of scope:
  - Full service catalog, whitespace, and adjacency recommendation workflow.
  - Retention/stabilization plan workflow.
  - Automatic task creation from free-text opportunity `next_step` without an action item.
  - AI forecasting and stage prediction changes beyond consuming opportunity data.
  - Replacement of pre-sales CRM or sales pipeline tooling.

## Requirement Links

- PRD IDs: V3-FR-029, V3-FR-030, V3-FR-031, V3-FR-032.
- Related user stories: Story 7.1 - Opportunity CRUD, board, and list; Story 7.2 - Opportunity type configuration.
- Related docs:
  - `requirements/KAM PRD.pdf`
  - `requirements/KAM_USER_STORIES.md`
  - `specs/03-relationships-planning-growth-retention.md`
  - `specs/06-timeline-and-handover.md`
  - `specs/07-notifications-dashboards-and-reporting.md`
  - `specs/11-analytics-benchmarking-and-alerts.md`

## Work Breakdown

- 10.1 Opportunity Management:
  - Create opportunities.
  - Assign owners.
  - Define opportunity value.
  - Set target dates.
  - Track next actions.
- 10.2 Opportunity Pipeline Tracking:
  - Board view.
  - List view.
  - Pipeline stage movement.
  - Pipeline filtering.
  - Pipeline totals.
- 10.3 Opportunity Timeline Tracking:
  - Stage-change tracking.
  - Win/loss tracking.
  - Decision history.

## User Flow

1. User opens Opportunities or Account 360 Opportunities.
2. User filters/searches pipeline by account, engagement, type, service line, owner, stage, target date, value range, or source.
3. User creates an opportunity with account, optional engagement, type, service line, owner, stage, next step, target date, value, and source context.
4. User reviews opportunities in board or list mode.
5. User moves an opportunity between stages.
6. System validates the transition and writes before/after timeline and audit records.
7. If stage is won/lost, user may provide outcome reason; required outcome reasons can be enforced later when configuration exists.
8. User opens the detail dialog to inspect field values, action items, linked task state, stage history, decisions, and source-linked timeline entries.

## Detailed User Flows By Breakdown Task

### 10.1 Opportunity Management

#### Create Opportunity

1. KAM opens `/opportunities` or the Account 360 Opportunities tab.
2. KAM selects "Add opportunity".
3. System opens a create modal with account prefilled when launched from Account 360.
4. KAM enters required fields:
   - Account.
   - Optional engagement.
   - Opportunity name.
   - Opportunity type.
   - Service line.
   - Owner.
   - Stage.
   - Estimated value.
   - Target date.
   - Next step.
   - Source context.
5. KAM submits.
6. Backend validates required fields, account access, active type/stage, active owner, non-negative value, and target date.
7. System creates the opportunity, writes audit history, and creates a source-linked timeline entry.
8. UI closes the modal, inserts the opportunity into the board/list, refreshes pipeline totals, and shows a success state.
9. Initial backend seed data mirrors the current mock opportunities so the API-backed board is useful immediately in local/dev environments.

#### Assign Owner

1. KAM opens an opportunity detail dialog or edit modal.
2. KAM changes owner from the owner selector.
3. Backend validates that the owner is active and allowed for the account/opportunity context.
4. System saves owner change and writes audit metadata.
5. If configured later, notifications/tasks can consume this owner change, but this feature does not create notifications.
6. UI updates owner on the card, list row, detail dialog, filters, and dashboard/analytics consumers.

#### Define Opportunity Value

1. KAM enters or updates estimated value and currency.
2. Backend rejects negative values and invalid currency.
3. System stores the commercial value.
4. UI recalculates:
   - Pipeline total.
   - Stage total.
   - Account open pipeline.
   - Dashboard pipeline cards.
   - Analytics input rows.
5. Material value changes should be audit logged; timeline entry is only needed if product treats value change as a material opportunity event.

#### Set Target Date

1. KAM enters or updates target date.
2. Backend validates a valid date and stores it.
3. UI updates card urgency, list sort, filters, "next closes", and dashboard calendar projection.
4. This feature does not create a standalone calendar record; future Task/Calendar work can consume `target_date`.

#### Track Next Actions

1. KAM enters a next step while creating or editing the opportunity.
2. KAM may add one or more opportunity action items with title, owner, owner email, due date, status, notes, and a create-task checkbox.
3. Backend stores `next_step` as execution context and stores action items under the opportunity.
4. When `create_task` is true, backend creates or updates a linked first-class Task with source type `opportunity_action_item`, source record ID set to the action item ID, and `future_task_id` stored on the action item.
5. UI displays the next step in the card/detail/list and action items in the detail dialog, including whether a task is linked.
6. Completing the linked Task marks the source opportunity action item as completed.

### 10.2 Opportunity Pipeline Tracking

#### Board View

1. User opens `/opportunities` with board mode selected.
2. UI loads pipeline stages and opportunities from backend.
3. System groups opportunities by stage.
4. Each column shows count and total value.
5. Each card shows account, name, type, service line, owner, value, target date, next step, source context, and detail action.
6. Empty columns show a drop-ready empty state.

#### List View

1. User switches from board to list mode.
2. UI keeps the same filters/search/sort context.
3. List shows paginated opportunity rows with account, engagement, type, service line, owner, stage, value, target date, next step, and updated date.
4. User can open detail, edit, archive where permitted, or change stage from row controls.
5. Pagination is backend-backed.

#### Pipeline Stage Movement

1. User drags a card to another stage or changes stage from the list/detail view.
2. UI shows a pending movement state but does not permanently move the card until API succeeds.
3. Backend validates that the target stage is one of the seeded/current UI stages.
4. User-directed movement is allowed between any valid stages; there is no stage-to-stage transition restriction for this implementation.
5. If the target stage is Won or Lost, backend stores outcome reason when provided. Required outcome reasons can be enforced later when admin configuration exists.
6. Backend stores the new stage, writes stage history, writes before/after timeline event, and audit logs the transition.
7. UI refreshes the opportunity, updates board/list/totals, and shows success.
8. If backend rejects the move, UI keeps the original stage and shows the transition error near the moved card/control.

#### Pipeline Filtering

1. User filters by account, engagement, type, service line, owner, stage, target date range, value range, or source.
2. UI sends filters to `GET /api/opportunities`.
3. Backend applies account authorization before pagination and totals.
4. UI shows matching results, active filter chips, and a clear-filters action.
5. Empty results show a filter-specific empty state.

#### Pipeline Totals

1. Backend returns opportunities and enough total metadata to calculate in-view pipeline totals.
2. UI shows:
   - Open pipeline value.
   - Closing soon count.
   - Won value.
   - Average opportunity value.
   - Stage totals.
3. Dashboard and Account 360 consume the same normalized opportunity data or a lightweight summary endpoint if needed for performance.

### 10.3 Opportunity Timeline Tracking

#### Stage-Change Tracking

1. User changes opportunity stage.
2. Backend captures before stage, after stage, actor, timestamp, reason, and source context.
3. Backend writes `opportunity_stage_history`.
4. Backend writes account timeline entry with before/after values.
5. Detail dialog shows stage history newest-first.
6. Account Timeline can show the opportunity event with source link.

#### Win/Loss Tracking

1. User moves an opportunity to Won or Lost.
2. System allows the user to enter an outcome reason.
3. Backend stores outcome reason when provided, writes stage history, writes timeline entry, and audit logs the outcome.
4. Won/Lost opportunities remain visible in list/history/reporting but are excluded from open-pipeline totals.
5. UI updates board/list/detail and makes terminal status clear.

#### Decision History

1. User opens opportunity detail dialog.
2. User adds or reviews standalone decisions tied to the opportunity, such as commercial approval, client decision, deferral rationale, or next-step commitment.
3. Backend stores decision text, actor/owner, timestamp, and optional source context.
4. Important decisions write timeline entries or link to existing timeline entries.
5. Detail dialog shows decisions alongside stage history.
6. Handover, AI brief, and governance sources can cite these records through stable source links later.

#### Archive Opportunity

1. User archives an opportunity from the detail dialog or list row action.
2. Backend performs a soft archive by setting archive metadata instead of hard deleting the record.
3. System writes audit metadata and a source-linked timeline entry.
4. Archived opportunities are hidden from default board/list open pipeline views and excluded from open pipeline totals.
5. Archived opportunities remain reachable through source links, history, reporting, and explicit archive filters.
6. User can restore an archived opportunity from the detail dialog when viewing archived records.
7. Restore clears archive metadata, writes audit/timeline history, and returns the opportunity to active pipeline views.
8. Hard delete is not part of this feature because PRD/user-story language prioritizes timeline and source-link continuity.

#### Detail Dialog

1. User clicks an opportunity card or list row action.
2. UI opens a conventional modal/dialog rather than navigating away from the board.
3. Dialog shows:
   - Account and optional engagement.
   - Opportunity name, type, service line, owner, value, currency, stage, target date, next step, and source context.
   - Editable fields for users with update permission.
   - Stage history with before/after values.
   - Win/loss outcome reason where present.
   - Opportunity action items and linked task state.
   - Decision history.
   - Source-linked timeline references.
   - Linked-task indicator where an action item created a Task.
4. User can edit, change stage, add decision, or close the dialog.
5. Detail save sends field edits and stage changes through a single backend update so the user does not get a partial stage move when another field fails validation.
6. Dialog supports archive confirmation, restore for archived records, inline side-panel errors, and expandable stage history.
7. Dialog refreshes the parent board/list after successful changes.

#### Task-Linked Action Items

1. Opportunity records keep `next_step`, action items, `target_date`, `owner_id`, and stable source route fields.
2. Users can choose whether each new action item creates a first-class Task.
3. Linked Tasks use source type `opportunity_action_item` so the Tasks module can filter and badge them separately from manual and governance tasks.
4. The opportunity action item stores the linked task ID in `future_task_id`.
5. Completing the linked Task updates the opportunity action item to `completed`, setting completion metadata from the task actor/time.

## Affected Surfaces And Current Design Inventory

- Sidebar:
  - `frontend/src/components/layout/Sidebar.tsx` already exposes `/opportunities`.
  - No navigation work is expected beyond making the destination fully functional.
- Opportunities page:
  - `frontend/src/pages/Opportunities.tsx` currently has mock/local-store filtering, pipeline totals, and a create dialog.
  - It needs API loading/error/empty states, board/list toggle, richer filters, create/edit validation, soft archive behavior, seeded backend records, and detail dialog entry points.
- Opportunity board:
  - `frontend/src/components/opportunities/OpportunityBoard.tsx` currently supports drag between fixed local stages.
  - It needs API-confirmed stage movement, loading state per moved card/column, and stage validation against the current UI stage names.
- Opportunity cards:
  - `frontend/src/components/opportunities/OpportunityCard.tsx` currently shows name, account, stage, estimated value, target close date, and owner.
  - Cards should also surface type, service line, next step, target date urgency, source context, and a detail action without making drag handles fight with click actions.
- Opportunity store/types:
  - `frontend/src/stores/opportunityStore.ts` and `frontend/src/types/opportunity.ts` are mock/local and too narrow for PRD fields.
  - They need API-backed state, pagination metadata, filters, stage definitions, type taxonomy, action states, and compatibility mapping for existing consumers.
- Account 360:
  - `frontend/src/components/account/Account360.tsx` uses opportunity data for overview metrics, open pipeline value, Stage Prediction, AI Brief, handover, and the Opportunities tab.
  - Account-scoped loading should reuse the same opportunity API rather than filtering stale mock data.
  - Account 360 Opportunities supports account-prefilled create and detail dialogs from the same opportunity components.
- Dashboard:
  - `frontend/src/pages/Dashboard.tsx` uses opportunity data for My Pipeline, open pipeline value, stage totals, next closes, dashboard calendar items, and the V4 Intelligence Layer.
  - Dashboard should consume either an opportunity summary endpoint or a bounded list query to avoid heavy portfolio loads.
- Analytics:
  - `frontend/src/pages/Analytics.tsx` uses opportunities for open pipeline and Opportunity Intelligence charts.
  - Analytics can initially reuse API-backed store data, but long-term portfolio reporting should move to server-side aggregation.
- AI/search/handover:
  - `frontend/src/services/aiSearch.ts` converts open opportunities into source-like timeline entries for "open opportunities" intent.
  - `frontend/src/services/aiSummary.ts` includes opportunities in account briefs.
  - `frontend/src/services/handoverSummary.ts` includes open opportunities in ownership handover summaries.
  - These should continue working from the normalized frontend opportunity type, while backend-generated timeline records become the source of truth for historical changes.
- Governance:
  - `frontend/src/components/governance/GovernancePanel.tsx` requests governance briefs with `sourceModules: ['timeline', 'opportunities', 'health', 'governance']`.
  - Backend governance brief/agenda logic should be able to cite active opportunities once opportunity persistence exists.
- Timeline:
  - Frontend local emitters already define opportunity creation, movement, won, lost, and deferred event shapes, but current stage names only include Identified, Qualified, Proposal Sent, Negotiation, Won, and Lost.
  - Backend implementation must own these timeline writes for persisted opportunity operations; frontend should stop emitting duplicate local opportunity events for API-backed mutations.
- Admin:
  - `frontend/src/components/admin/AdminCustomizationPanel.tsx` currently has mock customization for Opportunity custom fields.
  - A dedicated admin taxonomy surface is needed for opportunity types; stage names should remain aligned to the current UI stages for now.
- Backend account overview:
  - `backend/app/schemas.py` already has `AccountSummaryCardsRead.open_opportunities`.
  - `backend/app/services/accounts.py` currently returns the default value only; it should count open persisted opportunities when the backend model exists.
- Calendar:
  - Dashboard currently projects open opportunity target dates into calendar items.
  - The shared calendar utility does not yet include opportunities; decide whether opportunity target dates should be part of the unified calendar in this feature or remain dashboard-only until the Tasks/Calendar feature.

## Feature Boundaries And Overlap Control

The goal is to make opportunities complete without taking ownership of adjacent features. This feature should provide stable opportunity data and source links that other features can consume later, while avoiding broad changes in Task/Calendar, AI, Analytics, Governance, Account Planning, and Timeline feature areas.

- Owned by this feature:
  - Persisted opportunity domain model, API, service, repository, schemas, validation, and RBAC checks.
  - Opportunity type taxonomy needed by opportunity forms, filters, reports, and analytics.
  - Seeded pipeline stage definitions matching the current UI stage names.
  - User-directed movement between any valid pipeline stages.
  - Opportunity create/read/update/soft archive and stage transition behavior.
  - Stage history, opportunity-local action items, and decision history attached to opportunities.
  - Backend timeline entries for opportunity creation, stage changes, wins, losses, archives, and source-linked decisions.
  - Opportunity board, list, detail dialog, create/edit modal, pipeline totals, field-level errors, and loading/empty/error states.
  - Account 360 Opportunities tab and account overview open-opportunity count.
- Support, but do not fully implement here:
  - Dashboard: consume opportunity API data for current pipeline cards/totals and target-date projections; avoid building a new dashboard aggregation/reporting engine.
  - Analytics: keep opportunity values available and normalized; avoid implementing server-side portfolio analytics beyond any lightweight query needed by current screens.
  - AI/search/handover: preserve normalized opportunity fields and source routes so existing local AI/search/handover utilities still work; avoid building new AI endpoints or forecast algorithms.
  - Governance: expose opportunity records/timeline entries as sourceable data; avoid changing governance agenda/brief behavior beyond preventing broken references.
  - Account Planning/Whitespace: allow `source_context` and source record fields so future recommendations can create opportunities; do not build service catalog, whitespace capture, or adjacency recommendation workflows.
  - Timeline: write required opportunity timeline entries through existing `TimelineService`; do not implement full timeline list/filter/admin retention APIs.
  - Admin Field Builder: allow opportunity module custom fields if existing runtime field APIs support it; do not redesign the field builder.
- Explicitly avoid in this feature:
  - Creating first-class Tasks from opportunity next actions/action items.
  - Implementing `/api/tasks`, `/api/calendar/items`, task evidence, reminders, or unified calendar ownership.
  - Implementing opportunity stagnation alerts, notification escalation windows, or SLA reminder jobs.
  - Implementing predictive forecast charts, AI stage prediction changes, or AI-generated opportunity scoring.
  - Implementing whitespace/service catalog recommendations or automatic conversion from recommendations.
  - Implementing external CRM/sales pipeline integrations.
  - Replacing sales/pre-sales CRM workflows; this remains a post-sales KAM operating pipeline.

## Supporting Contracts For Other Features

- Opportunity read DTO should include stable fields other features can consume without knowing persistence internals:
  - `id`, `account_id`, `account_name`, `engagement_id`, `engagement_name`, `name`, `type_id`, `type_name`, `type_slug`, `service_line`, `value`, `currency`, `owner_id`, `owner_name`, `stage`, `next_step`, `target_date`, `source_context`, `source_record_id`, `source_record_type`, `source_record_route`, `outcome_reason`, `archived_at`, `created_at`, `updated_at`.
- Stage transition response should return the updated opportunity plus a stage-history record, including before/after values and timeline entry ID.
- Timeline entries should use:
  - `event_type="opportunity_event"`
  - `module="opportunity"`
  - `source_record_type="opportunity"`
  - `source_record_route="/opportunities?opportunity=<id>"` or an equivalent detail route.
- Dashboard/Analytics should be able to calculate open pipeline from list data where `stage` is not terminal. If performance becomes an issue, add a small opportunity summary endpoint instead of broad dashboard-specific logic.
- Future Task/Calendar work can attach to `next_step`, opportunity-local action items, `target_date`, `owner_id`, and source route without this feature creating task rows.
- Future Task work should be able to show tasks linked to an opportunity in the opportunity detail dialog without requiring opportunity data-model rewrites.
- Future Account Planning/Whitespace work can create an opportunity by calling `POST /api/opportunities` with `source_context` and optional source record fields.

## Backend Plan

- Routers:
  - `GET /api/opportunities`
  - `POST /api/opportunities`
  - `GET /api/opportunities/{opportunity_id}`
  - `PATCH /api/opportunities/{opportunity_id}`
  - `DELETE /api/opportunities/{opportunity_id}`
  - `POST /api/opportunities/{opportunity_id}/restore`
  - `POST /api/opportunities/{opportunity_id}/stage`
  - `GET /api/admin/opportunity-types`
  - `POST /api/admin/opportunity-types`
  - `PATCH /api/admin/opportunity-types/{type_id}`
  - `DELETE /api/admin/opportunity-types/{type_id}`
- Services:
  - `OpportunityService` for business rules, permissions, validation, stage transitions, timeline, and audit.
  - Admin taxonomy methods for opportunity type lifecycle.
- Repositories:
  - `OpportunityRepository` for opportunity list/detail/persistence and taxonomy lookups.
- Schemas/validation:
  - Create/update/read/page schemas for opportunities.
  - Stage transition request schema.
  - Opportunity type create/update/read/page schemas.
  - Field-level errors for required account/type/service line/owner/stage/next step/target date and invalid value/transition.
- Helpers:
  - Target-stage validation.
  - Pipeline total aggregation.
  - Source context normalization.

## API Documentation

- Swagger summary/description updates for every new opportunity/admin route.
- Response descriptions for list/detail/create/update/delete/stage transition.
- Error responses:
  - 400 invalid target stage or in-use type delete.
  - 403 missing module/account permission.
  - 404 missing opportunity/account/type/owner.
  - 422 field validation failures.

## Database Plan

- Tables:
  - `opportunity_types`
  - `opportunity_stage_definitions`
  - `opportunities`
  - `opportunity_stage_history`
  - `opportunity_decisions`
  - `opportunity_action_items`
- Key columns:
  - Opportunities: account, optional engagement, type, service line, owner, name, value, currency, stage, next step, target date, source context, outcome reason, status metadata, archive metadata, created/updated fields.
  - Stage history: before stage, after stage, actor, reason, decision metadata, timestamp, timeline entry.
  - Action items: opportunity, title, owner, owner email, due date, status, notes, completion metadata, optional linked task ID, created/updated fields.
  - Types/stages: slug, name, active state, display order, configuration flags.
- Migrations:
  - Current local setup uses `Base.metadata.create_all`; add model tables and any needed schema sync only for legacy compatibility.
- Snake_case schema check:
  - All table and column names must remain snake_case.

## Frontend Plan

- Pages/components:
  - Upgrade `Opportunities` from mock/local store to API-backed board and list views.
  - Reuse `OpportunityBoard` while making stage movement API-confirmed.
  - Add `OpportunityList`.
  - Add create/edit modal.
  - Add detail dialog with action items, timeline/history/decision context, and future linked-task area.
  - Add Admin taxonomy panel for opportunity types.
  - Keep stage names aligned to the current UI stages for now.
  - Update Account 360 Opportunities tab to use API data for the active account.
- Stores/hooks/services:
  - Add `frontend/src/services/opportunities.ts`.
  - Update `opportunityStore` for async list/create/update/delete/stage operations.
  - Keep API mapping isolated in service layer.
- Form behavior:
  - Do not use HTML `required`.
  - Show backend field errors next to matching fields.
- Backend error display:
  - Invalid target stages and missing outcome reasons should be visible near stage controls.

## Validation And Errors

- Backend validation classes/schemas:
  - Opportunity create/update/stage/type schemas.
  - Opportunity action item create/update schemas.
  - Non-negative value validation.
  - Active type/stage validation.
  - Valid target-stage validation.
- Field-level error messages:
  - Account is required.
  - Opportunity type is required.
  - Service line is required.
  - Owner is required.
  - Stage is required.
  - Next step is required.
  - Target date is required.
  - Action item title is required.
  - Action item due date is required when an action item is added.
  - Opportunity value cannot be negative.
  - Target stage is not valid.
  - Outcome reason is optional until admin configuration introduces a required rule.
- Frontend display behavior:
  - Surface field errors next to inputs.
  - Surface transition errors near board/list stage controls.

## Tests

- Backend unit/API tests:
  - Create opportunity happy path.
  - Required field validation.
  - Non-negative value validation.
  - List filters/search/sort/pagination.
  - Valid stage transition writes history and timeline before/after values.
  - Invalid target stage rejected.
  - Win/loss reason stored when provided and optional by default.
  - Opportunity-local action items create/update with the opportunity detail.
  - Soft archive hides default board/list records while preserving detail/history access.
  - Opportunity type create/update/deactivate/delete rules.
  - Permission boundaries for KAM, KAM Head, Admin, Leadership Viewer, and Commercial Stakeholder.
- Frontend unit/component tests:
  - Service mapping and error mapping.
  - Create/edit modal field error display.
  - Board stage movement waits for API confirmation.
  - List filter/sort behavior.
  - Admin type configuration validation messages.
- Edge cases:
  - Inactive type remains visible on historical opportunities.
  - Won/lost and archived opportunities remain in reporting and timeline.
  - Account access changes do not expose unauthorized opportunity details.

## Linting And Quality

- Lint/typecheck commands:
  - `docker compose run --rm --no-deps backend pytest`
  - `docker compose run --rm --no-deps frontend npm run build`
  - `docker compose run --rm --no-deps frontend npm run test`
- Known code smells or tradeoffs:
  - Free-text opportunity `next_step` remains execution context only; task creation is available from structured action items.
  - Demo opportunity records are seeded only for fresh non-SQLite local databases with no existing accounts/opportunities so existing customer-like local data is not polluted.

## Resolved Product Decisions

- Stage names will match the current UI for now: Identified, Qualified, Proposal Sent, Negotiation, Won, Lost.
- Stage movement is user-directed for now: any valid stage can be moved to any other valid stage.
- Opportunity title/name is free text for the account manager.
- Opportunity delete behavior is soft archive because PRD/user-story language protects timeline history and source-link continuity.
- Outcome reason follows PRD wording of "where configured"; it is optional now because admin outcome-reason configuration is not part of this feature.
- Opportunity detail should be implemented as a dialog/modal.
- Opportunity action items can optionally create linked first-class Tasks with source type `opportunity_action_item`.
- First-class task execution remains owned by the Tasks module; opportunity action items only create and sync the linked task.

## Open Questions

- No blocking questions remain for the implemented scope.

## Implementation Notes

- Backend:
  - Added opportunity models, repository, service, and router.
  - Added opportunity type taxonomy and seeded stage/type reference data.
  - Added create/list/detail/update/soft archive/stage transition APIs.
  - Added restore API for soft-archived opportunities and validation to reject no-op stage transitions without adding history noise.
  - Added standalone opportunity decisions and opportunity-local action item APIs.
  - Added backend timeline and audit writes for create, stage changes, decisions, and archives.
  - Added open opportunity count to account summary cards.
  - Updated RBAC defaults so Admin/Super Admin/KAM Head can configure opportunity types.
- Frontend:
  - Replaced the local-only opportunity path with an API service and async Zustand store.
  - Updated Opportunities with API-backed board/list filters, totals, create flow, detail dialog, stage movement, decisions, action items, and archive.
  - Added target-to, service-line, source-context, pagination, engagement selection, restore, archive confirmation, expandable history, and inline side-panel error handling.
  - Updated board/card components for API-confirmed drag movement, win/loss reason capture, source context, and detail entry.
  - Loaded opportunity data in the app shell so Dashboard, Account 360, Analytics, AI search, and handover consumers use normalized API-backed opportunity records.
  - Updated Account 360 Opportunities with account-prefilled create and detail dialog flows.
  - Added Admin > Opportunities for opportunity type taxonomy management.
- Test coverage:
  - Added backend API coverage for create/list/stage/decision/action/archive/restore/type lifecycle.
  - Added frontend opportunity service mapping and create/update payload coverage.

## Handoff Notes

- Setup notes:
  - New branch: `feature/growth-opportunity-management`.
  - Branch was created from `feature/governance-reviews` as requested.
- Manual verification:
  - Automated QA completed.
  - Local stack smoke check completed: backend health returned OK, frontend returned HTTP 200, and authenticated opportunity list returned seeded records.
  - Manual browser flow is still recommended for drag/drop feel, long text fit, and modal ergonomics against real local data.
- Follow-ups:
  - Convert opportunity-local action items to first-class linked Tasks when the Task feature lands.
  - Add outcome-reason configuration if Admin/KAM Head requirements expand beyond the current optional reason behavior.
  - Consider server-side portfolio analytics endpoints if dashboard/analytics opportunity aggregation grows beyond current bounded list usage.
