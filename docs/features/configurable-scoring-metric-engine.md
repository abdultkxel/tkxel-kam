# Configurable Scoring And Metric Engine

## Summary

The Configurable Scoring and Metric Engine lets Admin/KAM Head users define, validate, publish, activate, deactivate, and version score metrics without engineering changes. Published metric versions are used by account and engagement scoring APIs, primarily surfaced in Account Detail -> Health.

Primary admin surface:

```text
http://127.0.0.1:5173/admin?section=scoring
```

Primary account surface:

```text
Account Detail -> Health
```

## Requirement Links

- `requirements/KAM_USER_STORIES.md` Story 9.1 - Metric definition configuration.
- `requirements/KAM_USER_STORIES.md` Story 9.2 - Score calculation, refresh, and snapshots.
- Related feature context: `docs/features/account-health-score-metrics.md`.
- Related implementation surface: `docs/features/scoring-signals-playbooks-and-tasks.md`.

## Product Rule

Admin-configured published metrics are the source of future account and engagement scoring. Once an Admin/KAM Head updates and publishes a metric configuration in Admin -> Scoring, future score recalculations must use the latest active published metric version. Historical score snapshots must retain the metric version and calculation details that existed at the time of calculation.

## Story 9.1 - Metric Definition Configuration

As an Admin, I want configurable metric definitions, so that health scoring can evolve without engineering support.

### Acceptance Criteria

- Admin/KAM Head can create, edit, activate, deactivate, validate, and version metrics.
- Metric includes name, scope, weight, thresholds, freshness rule, owner, source, and effective date.
- Invalid configuration is blocked before publish.
- Editing a published metric must preserve old published versions for historical snapshots.
- Newly published active metrics are used by future recalculations only.

### UI Requirements

- Admin -> Scoring metric builder at `/admin?section=scoring`.
- Metric list with search, filters, sort, pagination, active/inactive state, and status.
- Metric form/editor with:
  - Name and slug.
  - Scope: account or engagement.
  - Weight.
  - Thresholds.
  - Freshness rule.
  - Owner role.
  - Source.
  - Effective date.
  - Formula editor using structured formula JSON only.
  - Test/validate action.
  - Publish action.
  - Activate/deactivate action.
  - Version history.
- Empty state prompts creating the first metric.
- Loading state during list fetch and validation/publish.
- Error state highlights invalid formula/threshold/freshness fields.

### API Requirements

- `GET /api/admin/metrics`
- `POST /api/admin/metrics`
- `PATCH /api/admin/metrics/{metric_id}`
- `POST /api/admin/metrics/{metric_id}/validate`
- `POST /api/admin/metrics/{metric_id}/publish`
- `GET /api/admin/metrics/{metric_id}/versions`

### Validation Rules

- Block unsafe or unsupported formulas.
- Use structured formula types only:
  - `weighted_sum`
  - `weighted_average`
  - `average`
  - `ratio`
  - `composite_weighted_sum`
  - compatibility `field`/`constant` for seeded and legacy metrics.
- Block missing or non-numeric weights.
- Block conflicting thresholds.
- Block circular metric dependencies, including a metric depending on itself.
- Block invalid freshness rules.
- Block invalid effective dates.
- Weight totals must follow configured rules for the metric scope/category.
- Deactivated metrics cannot be selected for new formulas.
- Publish must be blocked unless validation passes.

### Permissions

- Configure: Admin, KAM Head.
- View published definitions: authorized users where relevant.
- Operational users may view scoring outputs and trigger account scoring where account access allows, but cannot configure metric definitions.

### Filters, Search, Sort, Pagination

- Filters:
  - Scope.
  - Active state.
  - Source.
  - Owner.
  - Effective date.
  - Status.
- Search:
  - Metric name.
  - Metric slug.
- Sorting:
  - Name.
  - Updated date.
  - Scope.
  - Effective date.
  - Weight.
- Pagination:
  - Metric list.
  - Metric version history.

### Edge Cases

- Published versions remain available for historical snapshots.
- Editing a published metric creates or publishes a newer version rather than mutating previous snapshot evidence.
- A metric with a future effective date should not affect recalculations before that date.
- Inactive metrics should not be used by score recalculation.
- Validation should explain exact failing fields.

## Story 9.2 - Score Calculation, Refresh, And Snapshots

As a KAM, I want account and engagement scores to calculate with drivers and freshness, so that health status is explainable.

### Acceptance Criteria

- Scores calculate at Account and Engagement levels.
- Account Detail -> Health is the primary score experience.
- Inputs include approved authoritative records where available:
  - KYC.
  - Opportunities.
  - Stakeholders.
  - Activities/tasks.
  - Escalations.
  - Governance.
  - CSAT.
  - Manual commercial/account health fields.
  - Ops updates.
- Health-tab manual inputs may fill gaps where authoritative source fields do not yet exist.
- Event-driven, scheduled, job-triggered, and manual/on-demand recalculation are supported.
- Every score shows:
  - Freshness.
  - Last calculated timestamp.
  - Trend.
  - Status.
  - Drivers.
  - Reason codes.
  - RAG status.
- Score history is retained as snapshots.
- Formula changes do not rewrite historical snapshots.

### UI Requirements

- Account Detail -> Health score detail panel.
- Show:
  - Overall score.
  - RAG status.
  - Category/driver breakdown.
  - Freshness.
  - Trend.
  - Reason codes.
  - Manual refresh/recalculate button.
  - Dirty/incomplete status when inputs are missing.
- Score history chart/table with snapshot comparison.
- Loading state during score fetch and recalculation.
- Empty score state when no score snapshot or metric config exists.
- Error state for calculation failure with job context when available.

### API Requirements

- `GET /api/accounts/{account_id}/scores`
- `POST /api/accounts/{account_id}/scores/recalculate`
- `GET /api/accounts/{account_id}/score-snapshots`
- `GET /api/engagements/{engagement_id}/scores`
- `POST /api/scoring/jobs`

### Validation Rules

- Recalculate only against active published metric versions.
- Use approved authoritative records where available.
- Required missing inputs mark score `incomplete`/dirty and add reason codes.
- Manual inputs must be validated by scale and supported criteria.
- Score calculations must not execute arbitrary expressions.
- AI may explain score drivers/signals but cannot create authoritative scores.

### Permissions

- View: authorized users with account/scoring visibility.
- Manual refresh: KAM, KAM Head, and authorized operational roles for assigned accounts.
- Configure jobs: Admin/KAM Head according to RBAC.
- Configure metric definitions: Admin/KAM Head only.

### Filters, Search, Sort, Pagination

- Snapshot filters:
  - Date range.
  - Metric/category where supported.
  - RAG status.
  - Stale/dirty status.
  - Scope: account or engagement.
- Sorting:
  - Calculated date.
  - Score.
  - RAG status.
  - Freshness.
  - Trend.
- Pagination:
  - Score snapshot history.
  - Version history.

### Edge Cases

- Scheduled runs create scoring job logs.
- Failed calculations record job failure details.
- Stale indicators are shown when source data freshness rules fail.
- Historical snapshots preserve:
  - Metric version.
  - Raw score.
  - Normalized score.
  - Weight.
  - Weighted score.
  - Drivers.
  - Reason codes.
  - Evidence/source context.
- If metric configuration is missing, the UI should show an empty/incomplete state instead of silently using hidden defaults.

## Relationship To Last Implemented Feature

The last implemented Account Health Scoring, Signals, and Attention work is relevant to this user story.

Relevant implemented pieces:

- Admin Scoring uses configurable account-health category metrics.
- Account Detail -> Health reads account-scoped score APIs.
- Account recalculation uses published active metric definitions.
- Score snapshots preserve drivers, reason codes, freshness, trend, status, and metric version.
- Normalized metric snapshot rows were added for category/criterion evidence.
- Health-tab manual inputs support missing criteria for Relationship, Resource, Service Line, Contract, Account Risk, and CSAT.
- Signals and Attention Center consume persisted score output and weak-metric reason codes.

Remaining Story 9 gaps to track:

- Admin metric builder needs a fuller formula editor and version-history UI.
- Metric list filters should expand to source, owner, and effective date.
- Snapshot filters should expand to metric/category and stale/dirty filters.
- Scheduled/event recalculation needs production scheduling beyond manual job trigger.
- Backend pytest runner currently hangs in the local file-backed DB startup path; service-level smoke and frontend tests passed, but full backend pytest still needs environment cleanup.

## Field Builder Impact

Field Builder does not define score formulas or metric criteria. It can add module-level custom fields for account, engagement, task, or content screens, but metric definitions and formula behavior remain owned by Admin -> Scoring. Custom fields may later be referenced as source mappings only after explicit validation rules are added.

## Test Expectations

Backend tests should cover:

- Metric create/edit/validate/publish/version history.
- Invalid formula, threshold, freshness, dependency, and effective-date validation.
- Account recalculation using active published metrics.
- Engagement score read/recalculation.
- Dirty/incomplete scores when required inputs are missing.
- Historical snapshot preservation after formula changes.
- Job logs for manual/scheduled/event recalculation.
- Authorization for configure/view/manual refresh.

Frontend tests should cover:

- Admin Scoring loading, empty, error, validation, publish, active/inactive, pagination, search, filters, sort, and version history states.
- Account Health score loading, empty, error, recalculation, dirty/incomplete state, driver breakdown, reason codes, and snapshot comparison.
- Responsive behavior for Admin Scoring and Account Health.
