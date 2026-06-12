# Governance & Reviews

## Purpose

Governance records capture QBRs, SteerCos, monthly reviews, and executive reviews against accounts. They hold agenda, attendee emails, decisions, notes, action items, reminders, and calendar-facing metadata so KAM users can keep governance cadence visible from account workspaces and the Governance page.

## Current Scope

- Account workspace governance cards support create, edit, complete, and delete flows.
- Governance page table and detail drawer support edit, complete, cancel, and delete flows.
- Admin > Governance manages governance recurrence rules only; integration status and sync controls remain in Admin > Integrations.
- Governance prep tasks are generated from governance events, but only the next active event per account/governance type has an open prep task.
- Governance prep task due dates are set three business days before the event; recurring schedules generate multiple governance events without flooding Tasks.
- Governance prep task titles are action-oriented, for example `Prepare for QBR: Account Name`, and descriptions explain that prep is due three business days before the event.
- Editing uses `PATCH /api/governance-events/{event_id}` and updates event type, schedule, agenda, and attendee emails through the central frontend service/store layer.
- Deleting uses `DELETE /api/governance-events/{event_id}` and removes the event from list/detail surfaces after the backend authorizes the update.

## Backend Behavior

- Router: `backend/app/routers/governance.py`
- Service: `backend/app/services/governance.py`
- Repository: `backend/app/repositories/governance.py`
- Delete cancels linked governance reminder tasks and governance action-item tasks before removing the event.
- Delete writes a governance timeline entry, logs a `governance_reviews` audit record, removes Field Builder values for the governance record, and refreshes the account next-governance rollup.
- Update refreshes the governance event deduplication key when account, type, or schedule changes so edited records keep the same duplicate protection as newly created events.
- The notification/reporting worker evaluates due governance reminders and queues the existing `governance_reminder` trigger when the next prep task enters its three-business-day window.

## Frontend Behavior

- Service/store: `frontend/src/services/governance.ts`, `frontend/src/stores/governanceStore.ts`
- Shared edit dialog: `frontend/src/components/governance/EditGovernanceEventDialog.tsx`
- Delete/action wrapper: `frontend/src/components/governance/GovernanceEventActions.tsx`
- Admin recurrence panel: `frontend/src/components/admin/AdminGovernancePanel.tsx`
- Admin recurrence list resolves account-scoped rules to visible account names in each row.
- Account workspace: `frontend/src/components/account/AccountWorkspacePanel.tsx`
- Governance page: `frontend/src/components/governance/GovernancePanel.tsx`
- Account workspace `View calendar` routes to `/dashboard#governance-calendar`; the dashboard scrolls to the rendered calendar panel after widgets load.

## Validation And Error Display

- Frontend form validation mirrors required date/time and agenda checks without using the HTML `required` attribute.
- Backend validation remains authoritative; API field errors are displayed next to matching edit fields.
- Delete uses confirmation before mutation and reports API failures through toast feedback.

## Tests

- Backend: `backend/tests/test_governance.py`
  - Update flow refreshes event deduplication keys after schedule/type edits.
  - Delete flow removes the governance event, cancels linked tasks, and writes audit coverage.
  - Prep-task flow keeps one open governance prep task per account/type and advances to the next event after completion.
  - Reminder scheduler queues one `governance_reminder` notification per due event.
  - OpenAPI exposes the delete route summary.
- Frontend: `frontend/src/services/governance.test.ts`, `frontend/src/components/governance/GovernanceEventActions.test.tsx`, `frontend/src/components/admin/AdminGovernancePanel.test.tsx`
  - Service tests cover update payload mapping and DELETE API wiring.
  - Component tests cover populated edit submission and delete confirmation.
  - Admin panel test covers recurrence rendering with account names and without the integrations card or integrations API load.

## Handoff Notes

- Dashboard failed earlier because forecast generation assumed engagement SOW dates were `datetime`; date-only SOW values are now handled in `backend/app/services/forecasting.py`.
