# User-Owned Task Scope

## Summary

Task lists and task-derived dashboard counts are scoped to the signed-in user's assigned tasks. Portfolio or account access no longer widens task visibility to tasks owned by other users.

## Scope Implemented

- `GET /api/tasks` forces `owner_id` to the current user, even when another `owner_id` query parameter is supplied.
- Task detail, task history, task update/delete, and task evidence actions require the task to be assigned to the current user.
- Calendar task rows are fetched for the current user only; governance and renewal calendar rows keep their existing calendar filtering.
- Dashboard task counts, task lists, today's tasks, critical-task portions of Critical Actions, and AI task-summary task counts use the current user's task ownership.
- Dashboard summary labels display `Tasks` instead of `Open tasks`.

## Backend

- `backend/app/services/playbooks_tasks.py`
- `backend/app/repositories/playbooks_tasks.py`
- `backend/app/services/dashboards.py`
- Legacy alignment: `backend/app/services/tasks.py`

## Frontend

- `frontend/src/components/dashboard/RoleDashboard.tsx`
- `frontend/src/pages/Dashboard.test.tsx`
- `frontend/src/pages/Tasks.test.tsx`

## Tests

- `backend/tests/test_playbooks_tasks_calendar.py`
- `backend/tests/test_notifications_dashboards_reporting.py`
- `frontend/src/pages/Dashboard.test.tsx`
- `frontend/src/pages/Tasks.test.tsx`

## Notes

- Ownership means `Task.owner_id == current_user.id`.
- Task assignment workflows may still create tasks for another owner; those tasks appear to the assigned owner, not automatically to the creator.
