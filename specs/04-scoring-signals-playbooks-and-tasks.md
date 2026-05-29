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

## Missing Requirements

- Metric formula syntax and supported operators are not specified.
- Manual score submission/calculator schema is not specified.
- RAG threshold defaults are not specified.
- Signal rule configuration model is not specified.
- Task statuses and priority values are not fully enumerated.
- Calendar recurrence behavior is not specified.

## Ambiguous Requirements

- "AM submits account scores" appears in workflow, but metric engine also calculates scores from data; manual score input boundaries need clarification.
- Whether score-triggered improvement actions are tasks, playbook recommendations, or both is not fully specified.
- Whether bulk signal lifecycle updates are allowed is not specified.
- Which evidence is mandatory for task completion is configuration-dependent and undefined.

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
