# Feature Specification: Notifications Dashboards And Reporting

## Feature Overview

Provide notification preferences, SLA escalation, scheduled executive digests, AM Home, KAM Head Portfolio, Leadership Dashboard, and configurable reporting.

## Business Goal

Surface what needs attention today for every role while enabling leadership visibility and scheduled reporting without exposing unauthorized data.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Leadership Viewer / Executive
- Admin
- User
- Platform

## User Stories Covered

- Story 17.1 - Notifications and user preferences
- Story 17.2 - SLA escalation to KAM Head
- Story 17.3 - Scheduled executive digests
- Story 18.1 - AM Home dashboard
- Story 18.2 - KAM Head Portfolio dashboard
- Story 18.3 - Leadership dashboard
- Story 18.4 - Configurable report builder

## Functional Requirements

- Notify users for new signals, overdue activities, stale KYC, renewals, unresolved escalations, mentions, comments, and governance reminders.
- Support notification preferences by trigger, channel, and digest cadence.
- Escalate unresolved/inactive signals, critical activities, stale KYC, and formal escalations to KAM Head after configurable windows.
- Reset SLA timer on qualifying activity.
- Generate scheduled executive digests with strategic risks, retention outlook, growth opportunities, major escalations, and required decisions.
- Provide AM Home with assigned accounts, signals, overdue activities, stale KYC, renewals, escalations, opportunities, and tasks.
- Provide KAM Head Portfolio dashboard with health distribution, high-risk accounts, stale KYC, escalations, renewal focus, AM workload, overdue actions, and governance cadence.
- Provide Leadership Dashboard with strategic health, retention, growth, revenue risk, major escalations, executive summaries, and decision queue.
- Provide configurable report builder with fields, filters, date ranges, grouping, layout, preview, and export format.
- Support report or digest scheduling where selected by an authorized user.
- Track product-goal compliance metrics: critical/red accounts with owner, signal review, and action plan; active accounts with current KYC, accountable AM, engagement records, and next governance date; fresh score snapshots; critical signal/escalation SLA review rates; ownership changes with handover summary.

## Non-Functional Requirements

- Dashboards must load standard views within 3 seconds.
- Widget failures should not break full dashboard.
- Digest/report generation must enforce permissions at generation and viewing time.
- Notification delivery failures must be logged and retryable where configured.

## Permissions & Authorization

- Users manage their own notification preferences.
- Admin configures notification defaults and SLA rules.
- KAM sees assigned account dashboard data.
- KAM Head sees portfolio data for authorized scope.
- Leadership Viewer sees executive read-only dashboard/report data.
- Report fields and exports must be filtered by user permissions.

## Validation Rules

- Mandatory triggers cannot be disabled if policy prohibits.
- Email channel requires verified email.
- SLA window must be positive duration.
- SLA rule requires item type, inactivity window, qualifying activities, and recipient policy.
- Digest schedule requires cadence, recipients, and section selection.
- Digest/report schedules require timezone, cadence, recipient list, permission-scoped sections, and delivery channel.
- Report selected fields must be permitted for the user and compatible with selected data source.

## Search Requirements

- Search notification title/body.
- Search assigned accounts on AM Home.
- Search account/decision on Leadership Dashboard.
- Search fields and saved reports.
- Search digest title/content.

## Filter Requirements

- Notifications: unread/read, trigger, account, date range, channel.
- Escalated items: item type, owner, account, severity, SLA state, escalated date.
- Digests: cadence, recipient, date range, status.
- AM Home: account, date range, item type, priority, due date.
- KAM Head dashboard: AM, segment, region, industry, lifecycle status, risk, date range.
- KAM Head governance filters: KYC freshness, score freshness, governance cadence, missing action plan, SLA compliance.
- Leadership dashboard: date range, segment, industry, region, stage, risk.
- Reports: data-source-specific filters, date range, grouping.

## Sort Requirements

- Notifications: newest first, priority.
- Escalated items: SLA overdue age, severity, account.
- Digest history: sent date newest first.
- AM Home: urgency, due date, health risk.
- KAM Head dashboard lists: risk, health, overdue count, renewal date.
- Leadership lists: revenue risk, health, escalation severity.
- Saved reports: name, owner, updated date.

## Pagination Requirements

- Notification center is paginated.
- Escalated item list is paginated.
- Digest history is paginated.
- Embedded dashboard lists are paginated.
- Report previews and saved reports are paginated.

## API Requirements

- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `GET /api/users/me/notification-preferences`
- `PUT /api/users/me/notification-preferences`
- `GET /api/admin/sla-rules`
- `POST /api/admin/sla-rules`
- `PATCH /api/admin/sla-rules/{rule_id}`
- `GET /api/escalated-items`
- `POST /api/sla/jobs/evaluate`
- `GET /api/digests`
- `POST /api/digests/schedules`
- `PATCH /api/digests/schedules/{schedule_id}`
- `POST /api/digests/{digest_id}/send`
- `GET /api/digests/{digest_id}`
- `GET /api/dashboards/am-home`
- `GET /api/dashboards/kam-head-portfolio`
- `GET /api/dashboards/leadership`
- `GET /api/reports/fields`
- `POST /api/reports/preview`
- `POST /api/reports`
- `GET /api/reports/{report_id}`
- `POST /api/reports/{report_id}/export`

## UI Requirements

- Notification center with unread/read states and preference screen.
- SLA configuration and escalated-items view.
- Digest schedule, preview, and delivery history.
- AM Home operational dashboard.
- KAM Head Portfolio dashboard with charts/tables/drilldowns.
- Leadership Dashboard with read-only executive cards and decision queue.
- Report builder wizard with source, fields, filters, grouping, layout, preview, and export.

## Loading States

- Notification center loading.
- Preference save loading.
- SLA evaluation/configuration loading.
- Digest preview/generation loading.
- Dashboard skeletons per widget.
- Report preview/export loading.

## Empty States

- No notifications.
- No escalated items.
- No digest schedules/history.
- No assigned accounts.
- No visible portfolio accounts.
- No saved reports or selected report fields.

## Error States

- Preference save failure.
- Notification delivery failure.
- Invalid SLA rule.
- Digest generation/delivery failure.
- Widget-level dashboard data failure.
- Forbidden report field or invalid grouping.
- Export failure.

## Edge Cases

- Mentions do not grant access to restricted records.
- Preference changes affect future notifications only.
- Mandatory policy notifications may override "off" preferences.
- Timer reset must be auditable.
- Digest redactions must not reveal hidden-record counts.
- Saved report owner may lose access; export must re-check permissions.

## Missing Requirements

- Notification trigger catalog and default preferences are not fully specified.
- SLA qualifying activity definitions are not specified.
- Digest cadence values are not enumerated.
- Dashboard widget layouts and exact KPIs are not fully defined.
- Report export formats are not specified.
- Scheduled report behavior, recipients, and cadence defaults are not specified separately from executive digests.

## Ambiguous Requirements

- Whether KAM Head can configure SLA rules or only Admin can is described in multiple ways.
- Whether executive digests are user-scheduled or centrally scheduled by Admin is unclear.
- Whether reports can be scheduled separately from digests is not specified.
- Product-goal thresholds are listed in the PRD but ownership of monitoring/alerting for each threshold is not assigned.

## Conflicting Requirements

- No explicit conflict, but "off where permitted" for notifications conflicts with mandatory SLA escalation unless mandatory trigger policy is defined.

## Unspecified Edge Cases

- Notification deduplication across channels.
- Timezone handling for digests and dashboard date windows.
- Large export limits.
- Dashboard cache invalidation.

## Audit/Logging Requirements

- Log notification delivery status, channel, trigger, recipient, and source record.
- Audit preference updates.
- Audit SLA rule changes and timer resets.
- Log digest generation, recipients, redactions, and delivery.
- Audit report creation, preview/export, selected fields, filters, and recipient access.

## Test Scenarios

- Save notification preferences and verify future delivery behavior.
- Block disabling mandatory notification trigger.
- Escalate inactive signal after configured window.
- Reset SLA timer after qualifying activity.
- Generate digest with permission-scoped sections.
- Load AM Home with assigned accounts only.
- Load Leadership Dashboard with no edit controls.
- Create report with permitted fields.
- Attempt report with forbidden field and verify validation.
- Export saved report after permissions change.

## Acceptance Criteria

- Notifications, SLA escalations, digests, dashboards, and reports are permission-aware and auditable.
- Dashboards answer "what needs attention today" for the relevant role.
- Reports and digests never leak restricted fields.
- Lists and embedded tables support expected filters, sorting, search, and pagination.
