# Playbooks, Activities, Tasks & Calendar Coverage Report

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| Create/configure playbook templates with objectives, activities, success criteria, skip rules, owner rules, due-date rules, versioning, and active state | Complete | `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services/playbooks_tasks.py`, `frontend/src/pages/Playbook.tsx` |
| Admin/KAM Head template configuration with RBAC | Complete | `backend/app/rbac.py`, `backend/app/services/playbooks_tasks.py`, `frontend/src/pages/Playbook.tsx` |
| Recommended playbooks from signal context without silent task creation | Complete | `GET /api/signals/{signal_id}/recommended-playbooks`, `backend/app/services/playbooks_tasks.py`, `frontend/src/pages/Playbook.tsx` |
| Confirmed playbook execution creates account-specific tasks | Complete | `POST /api/playbooks/{template_id}/execute`, `backend/app/services/playbooks_tasks.py`, `backend/tests/test_playbooks_tasks_calendar.py` |
| Deactivated templates cannot execute | Complete | `backend/app/services/playbooks_tasks.py`, `backend/tests/test_playbooks_tasks_calendar.py` |
| Task create/list/update with owners, due dates, status, priority, notes, outcome, source signal/metric | Complete | `backend/app/models.py`, `backend/app/routers/playbooks_tasks.py`, `frontend/src/pages/Tasks.tsx` |
| Task evidence supports notes, links, and files with validation | Complete | `backend/app/services/playbooks_tasks.py`, `backend/app/routers/playbooks_tasks.py`, `frontend/src/pages/Tasks.tsx` |
| Ops/owner task contribution and Leadership Viewer read-only | Complete | `backend/app/services/playbooks_tasks.py`, `backend/app/rbac.py`, backend authorization tests |
| Search/filter/sort/pagination for templates and tasks, including owner-rule template filter and active-state template sorting | Complete | `backend/app/repositories/playbooks_tasks.py`, `backend/app/routers/playbooks_tasks.py`, `frontend/src/pages/Playbook.tsx`, frontend filters/tests |
| Unified calendar with governance, task/activity, SOW expiry, renewal date, notice deadline, and filters | Complete | `GET /api/calendar/items`, `backend/app/services/playbooks_tasks.py`, `frontend/src/components/governance/GovernancePanel.tsx` |
| Audit and timeline for template/task/playbook lifecycle | Complete | `backend/app/services/playbooks_tasks.py`, `backend/tests/test_playbooks_tasks_calendar.py` |
| Field Builder impact for `playbooks_tasks_calendar` | Complete | `backend/app/services/playbooks_tasks.py`, `frontend/src/pages/Playbook.tsx`, `frontend/src/pages/Tasks.tsx` |
| Task completion does not directly improve health metrics | Complete | No health recalculation/update is called from task completion in `backend/app/services/playbooks_tasks.py` |
| Frontend loading, empty, error, read-only, responsive behavior | Complete | `frontend/src/pages/Playbook.tsx`, `frontend/src/pages/Tasks.tsx`, `frontend/src/components/governance/GovernancePanel.tsx`, `frontend/src/pages/PlaybooksTasksCalendar.test.tsx` |

## Missing Requirements

- No missing requirement identified for Story 11.1/11.2 scope.

## Field Builder Impact

- `playbooks_tasks_calendar` custom fields are persisted against playbook template records and task records through the existing `custom_field_values` table.
- Required custom fields are validated server-side and surfaced in frontend create/edit forms.

## Missing Tests

- No dedicated browser screenshot test was added. Responsive behavior is covered through existing layout classes and DOM-level frontend tests.
- Full binary preview/delete lifecycle for evidence files is not covered because this story only requires evidence creation and validation.

## Potential Bugs / Edge Cases

- Recommended playbooks use a bridge endpoint until a persisted signal store exists; signal id is accepted for routing and audit context while matching is based on supplied signal type/metric context.
- Calendar projections reflect current source records. If a source task/engagement is edited, the calendar item changes with it.
- Existing seeded databases receive new RBAC grants only when startup seed runs.

## Security Concerns

- Account-scoped task and calendar access is filtered by account ownership/global view roles.
- Leadership Viewer can read but cannot create/update templates, tasks, evidence, or playbook executions.
- Evidence file upload reuses the existing MIME/size allow-list and local storage adapter.
