# Playbooks, Activities, Tasks, And Calendar User Story Trace

Source: `requirements/KAM_USER_STORIES.md`

## Scope

This trace maps the requested Playbooks, Activities, Tasks, and Calendar capabilities to the matching user stories in the PRD user-story file.

## Primary User Stories

### Story 11.1 - Playbook Template Configuration And Execution

As a KAM Head, I want configurable playbook templates, so that recommended actions can be selected and executed consistently.

Applies to:

- Playbook configuration
- Playbook template creation
- Objective definition
- Activity configuration
- Success criteria configuration
- Skip rule configuration
- Playbook selection
- Playbook execution
- Task generation from playbooks
- Default owner assignment

Evidence from user story:

- Templates include objective, signal types, weak metrics, activities, default owners, due dates, success criteria, and skip rules.
- Templates can be created, edited, versioned, activated, and deactivated.
- AM selects a recommended playbook; the system does not auto-execute playbooks.
- Admin playbook builder is required.
- Recommended playbook chooser from signal/detail pages is required.
- Existing executed playbooks keep original version.
- Playbook recommendation does not create tasks until AM confirms.

API requirements:

- `GET /api/admin/playbook-templates`
- `POST /api/admin/playbook-templates`
- `PATCH /api/admin/playbook-templates/{template_id}`
- `POST /api/playbooks/{template_id}/execute`

Validation requirements:

- Template requires objective, at least one activity, owner rule, and due-date rule.
- Deactivated templates cannot be newly executed.
- Skip rules require skip reason.

Permissions:

- Configure: Admin, KAM Head.
- Execute: assigned KAM.
- View recommendations: authorized users.

Search/filter/sort/pagination:

- Filters: active state, signal type, weak metric, owner rule.
- Search: template name/objective.
- Sorting: name, updated date, active state.
- Pagination for template list.

States:

- Empty template state prompts creation.
- Loading state while creating tasks from playbook.
- Error state if template version is inactive or invalid.

### Story 11.2 - Tasks, Activities, And Unified Calendar

As a KAM, I want tasks and calendar items from playbooks, renewal dates, governance, and scoring activities, so that I can manage execution in one place.

Applies to:

- Task and activity management
- Task creation
- Evidence upload
- Notes
- Task status updates
- Priority setting
- Owner assignment
- Execution tracking
- Activity history
- Unified calendar
- Governance event tracking
- Renewal date tracking
- Due-date tracking
- Calendar filtering

Evidence from user story:

- Tasks include owner, due date, status, priority, notes, evidence, outcome, and source signal/metric.
- Ops Lead can contribute to assigned operational activities.
- Completion affects metrics only through underlying data changes.
- Calendar displays activities, SOW end dates, renewal dates, notice deadlines, due dates, and governance events.
- Task list, task detail, activity history, evidence upload, and calendar view are required.
- Calendar filters and "my items" view are required.
- Source-linked task remains if original signal is resolved.

API requirements:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `POST /api/tasks/{task_id}/evidence`
- `GET /api/calendar/items`

Validation requirements:

- Task requires account, owner, due date, status, priority, and title.
- Completion requires outcome where configured.
- Evidence file/link must pass attachment validation.

Permissions:

- Manage owned tasks: assigned owner.
- Contribute Ops updates: assigned Ops Lead.
- View: authorized account users.

Search/filter/sort/pagination:

- Filters: account, engagement, owner, due date, status, priority, source, my items, governance, score activities, renewal items.
- Search: task title, notes, outcome.
- Sorting: due date, priority, status, updated date.
- Pagination for task list.
- Calendar supports date navigation.

States:

- Empty task state for no tasks.
- Loading calendar state.
- Error state for unavailable calendar integration or failed evidence upload.

## Requested Capability Mapping

| Requested capability | Matching story | Notes |
| --- | --- | --- |
| Playbook Configuration | Story 11.1 | Covers configurable templates and admin builder. |
| Create playbook templates | Story 11.1 | `POST /api/admin/playbook-templates`. |
| Define objectives | Story 11.1 | Template requires objective. |
| Configure activities | Story 11.1 | Template requires at least one activity. |
| Configure success criteria | Story 11.1 | Templates include success criteria. |
| Configure skip rules | Story 11.1 | Skip rules require skip reason. |
| Playbook Execution | Story 11.1 | `POST /api/playbooks/{template_id}/execute`. |
| Select playbooks | Story 11.1 | AM selects recommended playbook; no auto-execution. |
| Generate tasks | Story 11.1 and Story 11.2 | Playbook execution creates tasks; task management is Story 11.2. |
| Assign owners | Story 11.1 and Story 11.2 | Templates include default owners; tasks require owners. |
| Track execution | Story 11.2 | Task list, detail, activity history, status, and outcome. |
| Task and Activity Management | Story 11.2 | Main story for tasks, activities, evidence, notes, and status. |
| Create tasks | Story 11.2 | `POST /api/tasks`. |
| Add evidence | Story 11.2 | `POST /api/tasks/{task_id}/evidence`. |
| Add notes | Story 11.2 | Tasks include notes; task search includes notes. |
| Update task status | Story 11.2 | `PATCH /api/tasks/{task_id}`. |
| Set priorities | Story 11.2 | Task requires priority; filters/sorting include priority. |
| Unified Calendar | Story 11.2 | Main calendar story. |
| Governance event tracking | Story 11.2 and Story 14.1 | Calendar displays governance events; governance management is Story 14.1. |
| Renewal date tracking | Story 11.2 and Story 8.1 | Calendar displays renewal dates; renewal intelligence is Story 8.1. |
| Due-date tracking | Story 11.2 | Calendar displays due dates and task list filters by due date. |
| Calendar filtering | Story 11.2 | Calendar filters and "my items" view. |

## Supporting User Stories

### Story 8.1 - Renewal Intelligence And Notice Windows

Supports renewal date and notice-window calendar items.

Relevant evidence:

- Renewal risks, SOW expiry, and notice deadlines appear in Account Overview, Engagement 360, dashboards, signals, tasks, calendar, and reports.
- Approved terms create renewal signals, notice-window tasks, and calendar items.

### Story 10.2 - Attention Center And Signal Lifecycle

Supports recommended playbooks from signals and conversion into tasks/playbooks.

Relevant evidence:

- Attention Center shows signals, severity, age, review status, recommended playbooks, SLA reminders, ownership, SOW expiry, and notice-window tasks.
- Recommended playbook panel is required.
- `GET /api/signals/{signal_id}/recommended-playbooks`
- Convert requires target object type such as task/playbook.
- Playbook recommendations do not create tasks until AM confirms.

### Story 14.1 - Governance Event Management

Supports governance events and governance action items appearing in the unified calendar.

Relevant evidence:

- Events include account, engagement if applicable, date, attendees, agenda, notes, decisions, action items, and status.
- Governance list/calendar and detail page are required.
- Action items require owner and due date.

## Consolidated Feature Requirements

### Database

- Playbook templates
- Playbook template versions
- Playbook activities
- Playbook executions
- Tasks/activities
- Task evidence
- Calendar item projections or unified calendar source query

### Backend APIs

- Admin playbook template CRUD
- Playbook execution endpoint
- Task list/create/update endpoints
- Task evidence endpoint
- Calendar item endpoint
- Recommended playbooks endpoint from signals

### Frontend UI

- Admin playbook builder
- Recommended playbook chooser
- Task list
- Task detail
- Activity history
- Evidence upload
- Unified calendar
- Calendar filters and "my items" view

### RBAC

- Admin and KAM Head configure playbooks.
- Assigned KAM executes playbooks.
- Assigned owner manages owned tasks.
- Assigned Ops Lead contributes operational updates.
- Authorized account users can view.

### Validation

- Playbook template requires objective, at least one activity, owner rule, and due-date rule.
- Skip rules require skip reason.
- Deactivated templates cannot be executed.
- Task requires account, owner, due date, status, priority, and title.
- Evidence upload/link must pass attachment validation.
- Completion requires outcome where configured.

### Search, Filter, Sort, Pagination

- Template list: filter by active state, signal type, weak metric, owner rule.
- Template list: search by template name/objective.
- Template list: sort by name, updated date, active state.
- Template list: paginate.
- Task list: filter by account, engagement, owner, due date, status, priority, source, my items, governance, score activities, renewal items.
- Task list: search by task title, notes, outcome.
- Task list: sort by due date, priority, status, updated date.
- Task list: paginate.
- Calendar: date navigation and filters.

## Added From Technical Logic Document

- Playbook template fields must include objective, triggering signal types, weak metric conditions, default activities, default owners, due-date logic, success criteria, skip rules, evidence requirements, version, and active/inactive state.
- Playbook recommendations must remain suggestions until an authorized user executes the selected playbook. Execution must create tasks from the selected template version and preserve source signal/metric context.
- Task lifecycle must support `Open -> In Progress -> Blocked -> Done -> Cancelled`. Legacy labels such as `todo` or `skipped` may only be retained through explicit migration/mapping and must not be treated as the canonical lifecycle.
- Task records must include account, optional engagement, owner, due date, status, priority, notes, evidence, outcome, source signal/metric/playbook/governance context, and timeline/audit metadata.
- Task completion must not directly change account or engagement health. Health changes only through source-data updates and scoring recalculation.
- Governance action items approved from governance/Fathom review must become tasks with source governance event/action-item linkage.
- Unified calendar must show governance events, SOW end dates, renewal dates, notice deadlines, score-linked tasks, task due dates, and personal `my items`.
- Calendar source rows must remain projections from source modules unless a persisted calendar record is explicitly required. Calendar display must not duplicate or mutate source task, governance, engagement, renewal, or signal records.
- If a task owner is deactivated, the task remains visible to authorized users and must be reassigned before owner-only lifecycle updates can continue.
- Evidence requirements are controlled by playbook/template/source configuration. Completion without required outcome/evidence must be blocked with field-level validation.

## Implementation Status

### Completed Items

- Backend models and tables are implemented for playbook templates, template activities, playbook executions, tasks, and task evidence.
- Backend APIs are implemented for admin playbook templates, playbook execution, task list/create/update, task evidence, unified calendar items, and signal-to-playbook recommendations.
- Playbook templates store objectives, signal types, weak metrics, owner rules, due-date rules, success criteria, skip rules, active state, activities, versions, and execution snapshots.
- Task records support account/engagement context, owner, due date, status, priority, notes, outcome, success criteria, source signal/metric metadata, evidence requirements, completion/skip metadata, audit, and timeline writes.
- Evidence supports note, link, and file evidence through existing upload validation/storage patterns.
- Unified calendar returns permission-aware governance events/action items, playbook tasks, SOW expiry dates, renewal dates, and notice deadlines.
- RBAC uses `playbooks_tasks_calendar`; Admin/KAM Head configure templates, account-authorized users execute/manage account work, assigned task owners can update owned tasks, and Leadership Viewer is read-only.
- Search/filter/sort/pagination are implemented for template and task lists. Calendar supports date, account, engagement, owner, my-items, source toggles, and search filters.
- Frontend Playbook tab is now the operational home for templates, recommendations, and confirmed execution, with the KAM manual retained as a secondary view.
- Frontend Tasks page is backend-backed with loading, empty, error, filter, sort, pagination, manual task creation, task status changes, and note/link/file evidence controls.
- Frontend Governance calendar is wired to `/api/calendar/items` while preserving the existing design, filters, detail drawer, and local fallback behavior.
- Runtime Field Builder fields for `playbooks_tasks_calendar` render and persist on playbook template and task create/update surfaces.
- Automated backend and frontend tests were added for template lifecycle, recommendation matching, execution, tasks, evidence, authorization, calendar items, loading/filter behavior, and evidence posting.

### Remaining Items

- The signal recommendation endpoint is a bridge implementation because a persisted signal store is not implemented in this module. It accepts signal id plus optional signal type/metric/account context and matches active template rules.
- Calendar projections are source-query based, not persisted calendar rows. This keeps source links authoritative but means calendar history is derived from current source records.
- Field-level security for individual custom fields remains limited to current platform Field Builder primitives.
- Real external calendar write-back is not part of this implementation; unified calendar reads local governance/task/renewal sources.

### Technical Notes

- Plain SQL migration artifact: `backend/migrations/20260531_playbooks_tasks_calendar.sql`.
- Runtime table creation remains aligned with the existing SQLAlchemy `create_all` startup pattern.
- Task completion records outcomes/evidence and does not directly change account or engagement health scores.
- Recommendation-created tasks require explicit playbook execution confirmation and are never created silently.
