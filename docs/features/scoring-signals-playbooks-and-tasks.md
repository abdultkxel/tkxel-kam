# Scoring, Signals, Playbooks, And Tasks

## Scope

This feature covers backend-backed task execution for playbooks, signals, governance follow-ups, opportunities, renewals, and manual work items.

## Current Update

- Score recalculation signal refresh now tolerates legacy score snapshot drivers stored as strings, JSON text, or mixed driver arrays. Dimension-drop signal comparison only uses structured driver objects and still falls back to overall-score drop detection.
- Account score recalculation now persists all current health dimensions, including delivery/resource health, and the Account Health UI maps backend technical score drivers to the visible relationship, usage, delivery, and commercial meters immediately after save/recalculate.
- Score calculator controls reseed when persisted account health changes so post-recalculation projections do not stay stuck on pre-recalculation local state.
- Playbook operations are now Super Admin-only:
  - Super Admin can access the operational template catalog, recommendations, execution controls, create/edit form, and manual.
  - Admin, KAM Head, Account Manager, Delivery Lead, Leadership/Executive, and all other roles see the KAM playbook as a read-only manual on `/playbook`.
  - Backend template creation, template update, and playbook execution endpoints reject non-Super Admin users even if they hold broader module permissions.
- The Tasks page now supports two presentation modes:
  - Kanban board grouped by canonical lifecycle status: Open, In progress, Blocked, Done, Cancelled.
  - List view using the existing full-detail task cards with notes, outcomes, evidence, and lifecycle actions.
- Kanban is the default view for the task listing page.
- List view remains available through the Tasks page view toggle and can also be opened with `?view=list`.
- Existing task search, filters, sorting, pagination, loading, empty, error, authorization, note/evidence, account-link, and status-update behavior remain API-backed.
- Dashboard-to-task links tolerate legacy task records stored as `todo` by treating them as open work in backend filters and rendering them in the Open Kanban column.
- The Tasks page accepts backend `critical` priority values so dashboard critical/open task links do not land on an apparently empty board when older or seeded records use that priority.

## Files

- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/Tasks.test.tsx`
- `frontend/src/pages/Playbook.tsx`
- `frontend/src/pages/PlaybooksTasksCalendar.test.tsx`
- `frontend/src/components/account/Account360.tsx`
- `frontend/src/components/account/Account360.test.tsx`
- `frontend/src/components/account/ScoreCalculators.tsx`
- `frontend/src/components/account/ScoreCalculators.test.tsx`
- `backend/app/services/playbooks_tasks.py`
- `backend/app/services/scoring.py`
- `backend/app/services/signals.py`
- `backend/tests/test_scoring_signals_playbooks_tasks.py`
- `backend/tests/test_playbooks_tasks_calendar.py`

## API Contract

No backend API changes were required. Both Kanban and List views use the existing `GET /api/tasks`, `PATCH /api/tasks/{task_id}`, and `POST /api/tasks/{task_id}/evidence` endpoints.

## RBAC

- Playbook template operations and playbook execution are restricted to `super_admin`.
- Non-Super Admin users can view the static/manual KAM playbook only from the Playbook page.
- Leadership Viewer remains read-only.
- Authorized task users can continue starting, blocking, resuming, completing, cancelling, adding notes, and adding evidence where the backend allows it.

## Test Notes

- Frontend tests cover loading/error behavior, backend filter requests, dashboard open-task links with legacy `todo` records, default Kanban rendering, `view=list` routing, task status updates, and List-view evidence posting.
- Backend tests cover legacy `todo` records returned by dashboard open-task filters.
- Backend scoring/signals tests cover account score recalculation with signal evaluation when previous score snapshots contain legacy string-based drivers.
- Backend tests cover delivery/resource health persistence after account score recalculation, and frontend tests cover technical-driver-to-health mapping plus calculator reseeding after health changes.

## Remaining Notes

- Kanban currently groups the current paginated result set returned by the backend. Server-side swimlane totals across all pages would require a separate aggregate endpoint.
- Drag-and-drop status movement is intentionally not included yet; lifecycle changes use explicit buttons to preserve audit-friendly behavior.
