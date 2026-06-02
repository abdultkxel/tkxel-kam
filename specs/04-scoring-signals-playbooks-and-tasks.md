# Feature Specification: Scoring Signals Playbooks And Tasks

## Feature Overview

Configure metric definitions, calculate health scores, generate deterministic signals, manage the Attention Center, configure playbooks, and execute tasks/activities with calendar visibility.

## Business Goal

Make account health explainable and actionable by connecting metrics, weak signals, recommended playbooks, and owned tasks without allowing AI or task completion to artificially change health.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Admin
- Ops Lead
- Leadership Viewer / Executive
- Platform
- AI

## User Stories Covered

- Story 9.1 - Metric definition configuration
- Story 9.2 - Score calculation, refresh, and snapshots
- Story 10.1 - Deterministic signal generation and detail
- Story 10.2 - Attention Center and signal lifecycle
- Story 11.1 - Playbook template configuration and execution
- Story 11.2 - Tasks, activities, and unified calendar

## Functional Requirements

- Configure metric definitions with name, scope, weight, thresholds, formula, freshness rule, owner, source, and effective date.
- Validate and publish versioned metric configurations.
- Support AM-submitted account scores and mapped scoring calculators where configured.
- Calculate account and engagement scores from approved KYC, opportunities, stakeholders, activities, escalations, governance, CSAT, commercial fields, and Ops updates.
- Classify consolidated account health using RAG status: Red, Amber, Green.
- Support event-driven, scheduled, and manual recalculation.
- Store score snapshots with drivers, freshness, trend, status, and reason codes.
- Generate deterministic signals from configured rules.
- Display signal reason codes, evidence, severity, source records, owner, age, confidence, and citations.
- Support signal lifecycle: New, Reviewed, Accepted, Dismissed, Converted, Resolved.
- Provide Attention Center for urgent operational items.
- Configure playbook templates and mappings from signals/weak metrics.
- Suggest improvement actions from the approved activity set when score or RAG movement indicates a weak metric.
- Execute playbooks only after AM selection.
- Create tasks with owners, due dates, status, priority, notes, evidence, outcomes, and source links.
- Display tasks and key dates in unified calendar.

## Non-Functional Requirements

- Health scores must be deterministic, explainable, versioned, and auditable.
- AI may explain signals but cannot authoritatively create signals or change lifecycle status.
- Dashboard and Attention Center lists must be performant through pagination and filters.
- Calendar should remain usable even when integrations are unavailable.

## Permissions & Authorization

- Admin/KAM Head configure metrics, signal rules, playbook templates, mappings, and SLA-related task rules.
- KAM/KAM Head view and manually refresh scores for authorized accounts.
- Assigned KAM manages signal lifecycle and executes playbooks.
- Ops Lead contributes assigned operational task updates.
- Leadership Viewer can view authorized scores/signals/tasks without operational edit controls.

## Validation Rules

- Metric publish blocks invalid formulas, missing weights, conflicting thresholds, circular dependencies, invalid freshness rules, and invalid effective dates.
- Recalculation uses only published metric versions and approved authoritative records.
- Manual score submissions require metric/calculator mapping, score value, submitter, timestamp, and source/evidence where configured.
- Missing required score inputs mark score incomplete/dirty rather than silently calculating.
- Signal requires account or engagement, rule, severity, evidence, owner, and lifecycle status.
- Duplicate active signal for same account/rule/source is suppressed or merged.
- Dismissal requires reason where configured.
- Convert requires target object type.
- Task requires account, owner, due date, status, priority, and title.
- Task completion requires outcome/evidence where configured.
- Deactivated playbook templates cannot be newly executed.

## Search Requirements

- Search metric name/slug.
- Search signal title, reason code, source, and evidence.
- Search Attention Center by account, signal, reason.
- Search playbook template name/objective.
- Search task title, notes, evidence, and outcome.
- Search calendar items by title/account.

## Filter Requirements

- Metrics: scope, active state, source, owner, effective date.
- Score snapshots: date range, metric, RAG status, stale/dirty.
- Manual score submissions: submitter, calculator, account, engagement, submission date.
- Signals: severity, age, lifecycle status, owner, account, engagement, signal type, SLA status, renewal window.
- Attention Center: severity, owner, account, status, age, SLA, playbook availability, renewal/notice window, signal type.
- Playbooks: active state, signal type, weak metric, owner rule.
- Tasks/calendar: account, engagement, owner, due date, status, priority, source, my items, governance, score activities, renewal items.

## Sort Requirements

- Metrics: name, updated date, scope, effective date.
- Score snapshots: calculated date, score, trend.
- Signals: severity, age, SLA due, created date.
- Attention Center: priority/severity, SLA due, age, account.
- Playbooks: name, updated date, active state.
- Tasks: due date, priority, status, updated date.
- Calendar: date/time chronological.

## Pagination Requirements

- Metric list and version history are paginated.
- Score snapshot history is paginated.
- Signal and Attention Center lists are paginated.
- Playbook templates are paginated.
- Task lists are paginated.
- Calendar supports date navigation and lazy loading by range.

## API Requirements

- `GET /api/admin/metrics`
- `POST /api/admin/metrics`
- `PATCH /api/admin/metrics/{metric_id}`
- `POST /api/admin/metrics/{metric_id}/validate`
- `POST /api/admin/metrics/{metric_id}/publish`
- `GET /api/admin/metrics/{metric_id}/versions`
- `GET /api/accounts/{account_id}/scores`
- `POST /api/accounts/{account_id}/scores/recalculate`
- `GET /api/accounts/{account_id}/score-snapshots`
- `GET /api/engagements/{engagement_id}/scores`
- `POST /api/scoring/jobs`
- `GET /api/signals`
- `GET /api/signals/{signal_id}`
- `POST /api/signals/evaluate`
- `GET /api/signals/{signal_id}/evidence`
- `POST /api/signals/{signal_id}/ai-explanation`
- `GET /api/attention-center`
- `PATCH /api/signals/{signal_id}/status`
- `POST /api/signals/{signal_id}/convert`
- `GET /api/signals/{signal_id}/recommended-playbooks`
- `GET /api/admin/playbook-templates`
- `POST /api/admin/playbook-templates`
- `PATCH /api/admin/playbook-templates/{template_id}`
- `POST /api/playbooks/{template_id}/execute`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `POST /api/tasks/{task_id}/evidence`
- `GET /api/calendar/items`

## UI Requirements

- Metric builder with formula editor, thresholds, weights, source selection, freshness rules, validation, publish, and version history.
- Score detail panel with RAG status, driver breakdown, freshness, trend, reason codes, and refresh button.
- Score history chart/table.
- Signal detail drawer with evidence, lifecycle controls, source links, and AI explanation action.
- Attention Center with default views, filters, counts, lifecycle actions, and recommended playbooks.
- Playbook builder with versioning and activation controls.
- Task list/detail, evidence upload, activity history, and unified calendar.

## Loading States

- Metric validation and publish loading.
- Score recalculation/job loading.
- Signal evidence and AI explanation loading.
- Attention Center list loading.
- Playbook execution/task creation loading.
- Calendar range loading.

## Empty States

- No metrics configured.
- No score snapshots.
- No active signals.
- No attention items today.
- No playbook templates.
- No tasks/calendar items.

## Error States

- Invalid metric formula or threshold.
- Recalculation failed with job log reference.
- Restricted signal evidence.
- Failed lifecycle transition.
- Inactive/invalid playbook template.
- Failed evidence upload.
- Calendar integration unavailable.

## Edge Cases

- Formula changes never rewrite historical snapshots.
- AI explanation cannot change signal status.
- Status transitions should be idempotent.
- Source-linked tasks remain if original signal is resolved.
- Completing tasks does not automatically improve health.
- Existing executed playbooks retain original template version.

## PRD and Frontend Review Additions

- Account and Engagement scores must both be first-class scoring outputs; Engagement scores roll up into Account Health according to the active published metric configuration.
- Seeded deterministic signal rule types must include SOW expiry, renewal date, notice-period deadline, stale KYC, weak metric, stakeholder gap, and escalation SLA signals.
- Attention Center must answer "what needs attention today" and include SLA reminders, ownership, SOW expiry, renewal windows, notice-window tasks, signal lifecycle state, and recommended playbooks.
- Playbook templates must capture objective, applicable signal types, weak metrics, activities, default owner rule, due-date rule, success criteria, skip rules, version, and active/inactive state.
- Playbook recommendations must not create tasks until an AM selects and executes a template; execution must retain the template version used.
- Ops Lead updates on assigned operational tasks must be captured in task history and account timeline where configured.
- Unified calendar must merge governance events, score activities, renewal dates, SOW end dates, notice deadlines, and task due dates with filters for governance, score activities, renewal items, account, engagement, owner, and my items.
- Optional AI explanations must use the approved AI/LLM Gateway only; AI output is advisory, source-backed, clearly labeled, and must not create authoritative scores, signals, playbooks, tasks, or lifecycle changes.
- External integrations in this feature are limited to approved PRD integrations: Google Calendar for calendar context, CSAT for score input, and AI/LLM Gateway for advisory explanation. Any other source must be manual entry, uploaded/linked evidence, CSV/manual input, or future scope.
- Frontend implementation must preserve and API-back the existing Account 360 Health tab, score calculator/history panels, Admin Scoring Engine Builder, Tasks lane board/Attention surface, Governance calendar toggles, and Playbook page. The existing Playbook content page should remain available while operational playbook template management is added.

## Resolved Implementation Defaults

- Default RAG thresholds are Green `75-100`, Amber `60-74`, and Red `0-59`. Existing legacy labels `healthy`, `warning`, and `critical` may be mapped to Green, Amber, and Red for compatibility.
- Metric formulas must use a safe JSON/DSL expression format with allowlisted score inputs and operators only. Supported MVP operators are arithmetic `+`, `-`, `*`, `/`, comparison operators, `min`, `max`, `avg`, `sum`, `clamp`, and `coalesce`; arbitrary code execution/eval is forbidden.
- Manual AM calculator submissions are score inputs, not direct authoritative overrides. A submission must include scope, account or engagement, calculator/metric mapping, selected values, submitter, timestamp, source/evidence when configured, and validation status.
- Official score changes occur only when the scoring engine creates a snapshot from the active published metric version.
- Signal statuses are `new`, `reviewed`, `accepted`, `dismissed`, `converted`, and `resolved`; dismissal requires a reason when configured and conversion requires a target type such as `task` or `playbook`.
- Task statuses are `todo`, `in_progress`, `blocked`, `done`, and `skipped`; task priorities are `low`, `medium`, `high`, and `critical`.
- Task completion requires outcome/evidence when the task source or template marks evidence as required.
- Calendar dates are stored in UTC and rendered in the user's local timezone. The calendar API must require a date range and support lazy loading by range; recurring governance behavior remains owned by the governance module.
- Bulk signal lifecycle updates are out of scope for the first implementation unless added in a later requirement.
- Recalculation during metric publish must avoid rewriting existing snapshots: publish creates a new version, impacted records are recalculated or marked dirty, and historical snapshots keep their original version payload.
- Duplicate active signals are unique by account, optional engagement, rule, source record, and condition key; duplicates should be merged or suppressed with audit metadata.
- If a task or signal owner is deactivated, the item remains visible to authorized users and must be reassigned before owner-only lifecycle updates can proceed.

## Missing Requirements

- Exact persisted signal rule condition schema fields still need implementation-level definition.
- Exact seeded default metric catalog and playbook template catalog must be chosen during implementation.
- Exact CSAT source payload shape depends on the approved integration spec and may start with manual/CSV-backed score inputs.

## Ambiguous Requirements

- Whether score-triggered improvement actions should be displayed as direct task suggestions, playbook recommendations, or both is partially resolved as both: weak metrics recommend playbooks and may also expose approved activity suggestions, but tasks are created only after user selection.
- Which task sources require evidence remains template/configuration-driven.

## Conflicting Requirements

- No direct conflict, but playbooks can create tasks from selected recommendations while health must not improve from completion alone. Score-driver rules must make this explicit.

## Unspecified Edge Cases

- Handling recalculation during metric publish.
- Signal duplication across account and engagement levels.
- Calendar conflicts and timezone behavior.
- Task reassignment when owner is deactivated.

## Audit/Logging Requirements

- Audit metric config changes, validation, publish, activation, deactivation, and versioning.
- Log scoring jobs, failures, dirty marks, and recalculation source.
- Timeline material score changes with before/after values.
- Audit signal creation, lifecycle changes, dismissal reasons, conversion, and AI explanation requests.
- Audit playbook template changes and execution.
- Timeline task creation, completion, skipped status, and material outcome changes.

## Test Scenarios

- Validate and publish metric configuration.
- Reject invalid metric formula.
- Recalculate score and verify drivers/freshness.
- Preserve snapshot after formula change.
- Generate deterministic signal with evidence.
- Dismiss signal with required reason.
- Convert signal to playbook/tasks.
- Request AI explanation and verify it does not change status.
- Execute active playbook and create tasks.
- Block execution of deactivated template.
- Complete task and verify score does not automatically improve.
- Filter Attention Center by severity, SLA, and owner.

## Acceptance Criteria

- Scoring, signals, playbooks, and tasks are linked through source-backed, auditable workflows.
- Health scores are explainable and versioned.
- Signals are deterministic and lifecycle-managed.
- Playbooks require user selection.
- Tasks and calendar items are searchable, filterable, sortable, paginated, and permission-aware.

## Implementation Status

### Completed Items

- Database models, relationships, migration, and additive table initialization are implemented for scoring metric definitions/versions, manual score submissions, score snapshots, scoring jobs, signal rules/events, signals, playbook templates/versions/executions, tasks, task evidence, task history, account health rollups, and engagement health snapshots.
- Backend repository and service layers are implemented for scoring, signals/attention, playbooks, tasks, evidence, and unified calendar workflows.
- RBAC is implemented for scoring, signals/attention, and playbooks/tasks/calendar modules. Feature tests cover admin configuration denial for non-admin users and account-level authorization denial for unauthorized recalculation.
- Metric definition list/create/update/validate/publish/version-history APIs are implemented with formula safety validation, threshold validation, audit logging, search/filter/sort, and pagination.
- Published account metric definitions are used during account scoring for active weights, thresholds, formula-derived drivers, source context, RAG status, reason codes, snapshots, trend, freshness, audit, and account timeline entries.
- Account score recalculation supports manual calculator submissions as score inputs, persists snapshots, records jobs, updates rollups, and can trigger deterministic signal evaluation.
- Deterministic seeded signal types are implemented for stale KYC, weak metric, stakeholder gap, SOW expiry, renewal date, notice window, and escalation SLA.
- Signal list, Attention Center, signal evidence, advisory AI explanation, reviewed lifecycle update, signal-to-task conversion, and recommended playbooks are implemented with account authorization checks and pagination/filter/sort support where applicable.
- Admin signal-rule list/create/update APIs are implemented with RBAC, validation, audit logging, version increments on evaluation-impacting changes, and pagination.
- Playbook template list and explicit playbook execution are implemented and tested. Execution creates tasks only after user selection and stores the template version used.
- Task list/create/update/evidence APIs are implemented with owner/account authorization, validation, task history, audit logging, source links, evidence, outcome/skip requirements, pagination, filtering, and sorting.
- Authenticated frontend task creation and lifecycle changes now persist through backend APIs only; local task fallback remains only for unauthenticated/mock mode.
- Task creation, signal-created tasks, task completion, and skipped tasks write database-backed timeline entries.
- Unified calendar API merges task due dates, SOW expiry, renewal dates, and notice deadlines with account/owner/date filters and pagination in feature tests. Governance-event merge support is implemented in the same calendar service.
- Frontend API backing is implemented for Account 360 score recalculation/history, Admin Scoring Engine Builder, Tasks board/Attention surface, Playbook page, and related scoring/signal/task service calls. Feature tests cover the Tasks page backend load/error/update flow.
- Loading, empty, and error states are implemented for the main API-backed scoring/task/playbook frontend surfaces; direct frontend regression coverage currently exists for the Tasks page load and error states.
- Automated verification passed for this feature using:
  - `DATABASE_URL=sqlite:////tmp/kam_lifespan_test.db .venv/bin/pytest tests/test_scoring_signals_playbooks_tasks.py -q`
  - `npm test -- Tasks.test.tsx`
  - `npm run build`

### Remaining Items

- A real background scheduler/worker for recurring scheduled recalculation is not implemented. The current implementation supports manual/event/scheduled job records and synchronous local execution through the scoring job API.
- Engagement score APIs and persisted engagement score snapshots are implemented, but direct endpoint regression coverage should be added before marking the engagement scoring flow fully complete.
- Playbook template create/update APIs are implemented, but direct regression coverage should be added before marking template authoring fully complete.
- Signal rule CRUD is implemented, but the persisted `condition_json` schema is still MVP-level. The evaluator currently handles the seeded deterministic rule families rather than a fully generic condition engine for arbitrary admin-authored rule JSON.
- Signal-to-playbook conversion is implemented through the conversion API, but direct regression coverage should be added before marking that conversion path fully complete.
- A real AI/LLM Gateway adapter is not implemented for signal explanations. Current AI explanation behavior is a local advisory adapter and does not mutate authoritative scores, signals, playbooks, tasks, or statuses.
- Google Calendar and CSAT integrations are not implemented in this feature. Calendar currently merges internal governance/task/engagement dates; CSAT starts as manual/calculator-backed score input.
- Direct automated tests are still needed for dismissal reason enforcement, inactive playbook execution rejection, engagement score recalculation endpoints, formula-change snapshot immutability, task completion not improving health automatically, source-linked task retention after signal resolution, deactivated owner reassignment handling, and calendar date-range lazy loading.
- Full backend-suite verification requires the configured local Postgres service at `127.0.0.1:5433` to be running. The feature-specific backend tests passed with a temporary SQLite lifespan database because the default local Postgres was unavailable during verification.
- Frontend behavioral tests currently cover the Tasks page loading/error/update flow. Additional component tests should be added for Admin Scoring Engine Builder, Account 360 health recalculation/history, Playbook page, and calendar views.

### Technical Notes

- Health changes are authoritative only when a scoring snapshot is created by the scoring engine. Task completion, playbook execution, and AI explanations do not directly improve health scores.
- Historical score snapshots are stored independently from later metric configuration changes. Published metric versions are referenced in snapshot context and must not be rewritten retroactively.
- Approved signal generation remains deterministic; AI output is advisory and source-backed.
- Field Builder does not currently affect scoring metrics, signal rules, playbook templates, tasks, or calendar items. Existing Field Builder runtime modules remain unaffected. If custom fields are later required for this feature, module registrations and custom field value persistence must be added explicitly.
- The frontend build passes with the existing Vite large-chunk warning; no feature-specific build failure remains.
