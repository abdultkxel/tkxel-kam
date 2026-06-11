# Scoring, Signals, Playbooks, And Tasks

## Scope

This feature covers backend-backed task execution for playbooks, signals, governance follow-ups, opportunities, renewals, and manual work items.

## Current Update

- The Tasks page now supports two presentation modes:
  - Kanban board grouped by canonical lifecycle status: Open, In progress, Blocked, Done, Cancelled.
  - List view using the existing full-detail task cards with notes, outcomes, evidence, and lifecycle actions.
- Kanban is the default view for the task listing page.
- List view remains available through the Tasks page view toggle and can also be opened with `?view=list`.
- Existing task search, filters, sorting, pagination, loading, empty, error, authorization, note/evidence, account-link, and status-update behavior remain API-backed.

## Files

- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/Tasks.test.tsx`
- `frontend/src/pages/PlaybooksTasksCalendar.test.tsx`

## API Contract

No backend API changes were required. Both Kanban and List views use the existing `GET /api/tasks`, `PATCH /api/tasks/{task_id}`, and `POST /api/tasks/{task_id}/evidence` endpoints.

## RBAC

- Leadership Viewer remains read-only.
- Authorized task users can continue starting, blocking, resuming, completing, cancelling, adding notes, and adding evidence where the backend allows it.

## Test Notes

- Frontend tests cover loading/error behavior, backend filter requests, default Kanban rendering, `view=list` routing, task status updates, and List-view evidence posting.

## Remaining Notes

- Kanban currently groups the current paginated result set returned by the backend. Server-side swimlane totals across all pages would require a separate aggregate endpoint.
- Drag-and-drop status movement is intentionally not included yet; lifecycle changes use explicit buttons to preserve audit-friendly behavior.
