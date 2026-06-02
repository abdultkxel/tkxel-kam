# Feature Specification: Analytics Benchmarking And Alerts

## Feature Overview

Provide portfolio analytics, benchmarking, KAM performance insights, and proactive account-change alerts.

## Business Goal

Give KAM Heads and leadership measurable portfolio intelligence to identify health trends, benchmark cohorts, and respond to meaningful changes before they become unmanaged risk.

## User Roles

- KAM Head / VP
- Leadership Viewer / Executive
- Admin
- Platform

## User Stories Covered

- Story 22.1 - Portfolio analytics and benchmarking
- Story 22.2 - Proactive account-change alerts

## Functional Requirements

- Provide analytics for health trends, score drivers, escalation intelligence, opportunity intelligence, content effectiveness, and KAM performance.
- Filter analytics by date range, AM, segment, industry, stage, and engagement type.
- Benchmark accounts across segments, industries, and engagement types.
- Generate proactive account-change alerts for score drops, stale KYC, opportunity stagnation, escalation aging, renewal risk, stakeholder gaps, and governance overdue.
- Include CSAT decline as a proactive alert and analytics driver where CSAT data is available.
- Track PRD success-metric analytics for red/critical account action plans, active-account governance completeness, score snapshot freshness, SLA review compliance, and handover completion.
- Allow account-change alert status updates.
- Suppress or group duplicate active alerts.

## Non-Functional Requirements

- Analytics must respect RBAC and field-level access.
- Historical analytics should use score snapshots and configuration versions.
- Small cohorts should be suppressed or flagged where policy requires.
- Analytics dashboards should support paginated drilldown tables.

## Permissions & Authorization

- KAM Head and Leadership Viewer can view authorized portfolio analytics and benchmarks.
- Admin can configure alert rules and view system-level analytics where permitted.
- Sensitive commercial/executive fields remain field-permission protected.

## Validation Rules

- Date range required for trend views.
- Cohort must meet minimum record threshold where configured.
- Alert rule requires condition, severity, source, active state, and dedupe behavior.
- Alert status transitions must be valid and auditable.

## Search Requirements

- Search accounts, cohorts, AMs, and alert reasons.
- Search benchmark tables by account or segment.

## Filter Requirements

- Analytics filters: date range, AM, segment, industry, stage, engagement type.
- Benchmark filters: cohort, segment, industry, engagement type, health band.
- Alerts: alert type, severity, account, AM, date range, status, CSAT trend, SLA compliance.

## Sort Requirements

- Analytics drilldowns: health trend, risk, opportunity value, escalation count.
- Benchmark rows: performance, health, cohort rank, variance.
- Alerts: severity, age, created date.

## Pagination Requirements

- Benchmark rows are paginated.
- Analytics drilldown tables are paginated.
- Account-change alert lists are paginated.

## API Requirements

- `GET /api/analytics/portfolio`
- `GET /api/analytics/benchmarks`
- `GET /api/analytics/kam-performance`
- `GET /api/analytics/account-change-alerts`
- `PATCH /api/analytics/account-change-alerts/{alert_id}/status`
- Proposed admin alert config: `GET /api/admin/account-change-alert-rules`
- Proposed admin alert config: `POST /api/admin/account-change-alert-rules`
- Proposed admin alert config: `PATCH /api/admin/account-change-alert-rules/{rule_id}`

## UI Requirements

- Analytics dashboard with charts, cohort selector, filters, and drilldowns.
- Analytics must be reachable as a first-class `/analytics` route and role-aware navigation item for Leadership/KAM Head/Admin; current frontend has an Analytics page but the route currently redirects to Dashboard.
- Benchmark comparison cards/tables.
- Account-change alerts panel/list with detail drawer, reason codes, source evidence, and status controls.
- Permission-aware redaction for restricted metrics.

## Loading States

- Chart loading.
- Benchmark table loading.
- Alert list/detail loading.
- Filtered analytics refresh loading.

## Empty States

- No analytics data for selected filters.
- Insufficient cohort size.
- No account-change alerts.
- No KAM performance data.

## Error States

- Invalid filter combination.
- Insufficient data for benchmark.
- Analytics source unavailable.
- Alert rule evaluation failure.
- Forbidden sensitive metric.

## Edge Cases

- Small cohorts are suppressed or flagged to avoid misleading comparisons.
- Historical metrics use snapshot versions instead of current formulas.
- Alerts are separate from operational signals unless configured to create signals.
- Duplicate active alerts are suppressed or grouped.

## Missing Requirements

- Benchmark cohort minimum size is not specified.
- KAM performance metric definitions are not specified.
- Alert status lifecycle values are not enumerated.
- PRD success-metric thresholds are defined, but calculation windows and dashboard ownership are not specified.
- Content effectiveness calculations are not defined.

## Ambiguous Requirements

- Whether proactive alerts are deterministic rules, analytics thresholds, or AI-assisted is not specified.
- Whether Leadership Viewer can update alert status is unclear.
- Whether alerts create notifications by default is not defined.

## Conflicting Requirements

- No explicit conflict, but account-change alerts overlap with rule-based signals. Ownership and conversion behavior must be clarified.

## Unspecified Edge Cases

- Alert recalculation after underlying data correction.
- Benchmarking archived/dormant accounts.
- Accounts moving between segments/industries during selected period.
- Handling missing historical snapshots.

## Audit/Logging Requirements

- Log analytics query metadata for sensitive dashboards where required.
- Audit alert rule configuration.
- Audit alert creation, dedupe/grouping, status changes, and source evidence.
- Log benchmark cohort criteria used for generated results.

## Test Scenarios

- Load portfolio analytics with date/AM/segment filters.
- Benchmark accounts across a valid cohort.
- Suppress benchmark for too-small cohort.
- Generate alert for score drop.
- Suppress duplicate active alert.
- Update alert status and verify audit.
- Verify Leadership Viewer sees only authorized metrics.
- Verify historical score uses snapshot values.

## Acceptance Criteria

- Analytics and benchmarks are filterable, permission-aware, and based on correct historical data.
- Proactive alerts identify meaningful changes and provide source evidence.
- Drilldowns and alerts support search, filters, sort, pagination, and audit.

## Added From Technical Logic Document

- Analytics and portfolio intelligence must use approved records and immutable snapshots where available, especially for KYC, scoring, CSAT, renewal, opportunities, governance, escalations, and timeline-derived trends.
- Benchmarking must support cohort filters such as segment, industry, region, account size, service mix, AM/KAM, lifecycle status, and date range while suppressing or flagging cohorts too small to be meaningful.
- Portfolio analytics must distinguish operational deterministic signals from analytics/account-change alerts. Alerts may recommend signal creation only when configured; they must not silently create operational signals.
- Account-change alerts must include reason code, source evidence, affected metric/category, previous value, new value, change magnitude, created date, owner, status, and recommended action.
- Historical analytics must use the score snapshot version and formula version that was active at the time of calculation. Later scoring configuration changes must not rewrite historical analytics.
- KAM performance analytics must be based on clearly configured metrics such as portfolio health movement, overdue action rate, governance cadence, renewal readiness, retention outcomes, growth/opportunity progress, and SLA responsiveness.
- Content effectiveness calculations require explicit formula configuration before they can become official KPIs; until configured, content analytics should remain descriptive only.
- Analytics drilldowns must preserve RBAC and field-level security. Restricted metrics should be redacted or excluded without revealing hidden-record counts.
- Stage prediction and forecast outputs from AI Assistance may appear in analytics only after explicit human confirmation for that destination. Directional AI forecasts must remain labeled as directional and non-authoritative.
- Proactive benchmark/account-change alerts must support status lifecycle, deduplication/grouping, source evidence, owner assignment, audit, and optional notification routing.
- Analytics query metadata for sensitive dashboards must be logged where policy requires, including actor, filters/cohort, timestamp, and redaction state.
