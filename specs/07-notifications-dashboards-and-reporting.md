# Feature Specification: Notifications Dashboards And Reporting

## Feature Overview

Provide notification preferences, SLA escalation, scheduled executive digests, AM Home, KAM Head Portfolio, Leadership Dashboard, and configurable reporting.

## Business Goal

Surface what needs attention today for every role while enabling leadership visibility and scheduled reporting without exposing unauthorized data.

## User Roles

- Account Manager / KAM
- Ops Lead
- KAM Head / VP
- Leadership Viewer / Executive
- Commercial Stakeholder
- Delivery Stakeholder
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
- Maintain a server-side notification record for each in-app notification and delivery attempt.
- Support notification preferences by trigger, channel, and digest cadence.
- Escalate unresolved/inactive signals, critical activities, stale KYC, and formal escalations to KAM Head after configurable windows.
- Escalation notification records must capture recipient, channel, timestamp, related source item, escalation reason, SLA window key, delivery status, retry count, and source route.
- Duplicate escalation notifications for the same source item, recipient, channel, and SLA window must be suppressed.
- Reset SLA timer on qualifying activity.
- Run SLA evaluation through a local scheduled worker and through an authorized manual admin/KAM Head action.
- Generate scheduled executive digests with strategic risks, retention outlook, growth opportunities, major escalations, and required decisions.
- Log every digest generation and delivery attempt with recipients, schedule, permissions scope, redactions, delivery channel, status, and error details.
- Provide AM Home with assigned accounts, signals, overdue activities, stale KYC, renewals, escalations, opportunities, and tasks.
- Provide an AM Home AI Task Summary card that synthesizes active tasks and attention signals across assigned accounts with headline, short narrative, top blockers/risks, recommended focus, source counts, refreshed timestamp, and manual refresh. Refreshing the card must not block other dashboard widgets.
- Provide KAM Head Portfolio dashboard with health distribution, high-risk accounts, stale KYC, escalations, renewal focus, AM workload, overdue actions, and governance cadence.
- Provide Leadership Dashboard with strategic health, retention, growth, revenue risk, major escalations, executive summaries, and decision queue.
- Provide configurable report builder with fields, filters, date ranges, grouping, layout, preview, and export format.
- Minimum report export formats are CSV for tabular reports and PDF for executive/report-layout exports.
- Support report or digest scheduling where selected by an authorized user.
- Report schedules must be evaluated by a local scheduled worker and must also support an authorized manual run.
- Track product-goal compliance metrics: critical/red accounts with owner, signal review, and action plan; active accounts with current KYC, accountable AM, engagement records, and next governance date; fresh score snapshots; critical signal/escalation SLA review rates; ownership changes with handover summary.
- Dashboard APIs must return per-widget status, generated timestamp, data scope, and fallback/error metadata so one failed widget does not break the full dashboard.
- Notification source routes must be permission-checked at read/render time; a notification must never grant access to a restricted account or record.

## Non-Functional Requirements

- Dashboards must load standard views within 3 seconds.
- Widget failures should not break full dashboard.
- Digest/report generation must enforce permissions at generation and viewing time.
- Notification delivery failures must be logged and retryable where configured.
- Scheduled workers must be idempotent and safe to rerun after restarts.
- Dashboard and report queries should prefer indexed fields, scoped data access, and bounded result sizes.

## Permissions & Authorization

- Users manage their own notification preferences.
- Admin and KAM Head users with `notifications_digests:configure` can configure notification defaults and SLA rules.
- KAM sees assigned account dashboard data.
- Ops Lead sees operational dashboard/report data for authorized delivery scope.
- KAM Head sees portfolio data for authorized scope.
- Leadership Viewer sees executive read-only dashboard/report data.
- Commercial and Delivery Stakeholders see only permission-scoped dashboard/report fields.
- Report fields and exports must be filtered by user permissions.
- Only users with `dashboards_reporting:export` may export reports.
- Only users with `dashboards_reporting:configure` may configure shared report definitions or schedules.

## Validation Rules

- Mandatory triggers cannot be disabled if policy prohibits.
- Email channel requires verified email.
- Notification trigger must exist in the active trigger catalog.
- SLA window must be positive duration.
- SLA rule requires item type, inactivity window, qualifying activities, and recipient policy.
- SLA rule item type must be one of the supported source types: signal, task/activity, KYC freshness, or formal escalation.
- Digest schedule requires cadence, recipients, and section selection.
- Digest/report schedules require timezone, cadence, recipient list, permission-scoped sections, and delivery channel.
- Digest/report schedule timezone must be a valid IANA timezone.
- Digest/report recipients must be active users who are authorized for the selected sections at send time.
- Report selected fields must be permitted for the user and compatible with selected data source.
- Report filters, grouping, sorting, and export format must be compatible with the selected data source.
- PDF exports must use a report layout; CSV exports must use tabular fields.

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

## Database/Storage Requirements

- Store notification records with recipient, trigger, title/body, account/source identifiers, source route, priority, read state, channel state, delivery metadata, deduplication key, created timestamp, and read timestamp.
- Store notification preference rows per user and trigger, including channel mode, digest cadence, and policy override state.
- Store notification trigger/default configuration for mandatory triggers, supported channels, default mode, and display metadata.
- Store SLA rules with item type, severity/priority filters, inactivity window, qualifying activity definitions, recipient policy, enabled state, and audit timestamps.
- Store SLA evaluation state or escalated-item records with source item, current SLA state, last qualifying activity timestamp, last escalated timestamp, recipient, deduplication key, and resolution timestamp.
- Store digest schedules with owner, name, cadence, timezone, recipients, sections, filters, delivery channels, enabled state, last run, and next run.
- Store digest runs with generated content summary, recipients, redactions, delivery attempts, status, errors, and immutable generation timestamp.
- Store report definitions with owner, visibility, data source, selected fields, filters, grouping, layout, export defaults, created/updated timestamps, and audit metadata.
- Store report schedules and report export/run history with permission scope, recipients, status, export format, storage metadata, errors, and generated timestamp.
- Store scheduled-worker run logs for SLA evaluation, digest generation, and report generation.
- Add indexes for recipient/read state, trigger/date, account/source, SLA state/date, schedule next run, report owner/visibility, and digest/report run date.
- Field Builder custom fields may appear in report fields only when active, non-sensitive or explicitly permitted, and compatible with the selected data source.

## API Requirements

- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `PATCH /api/notifications/read-all`
- `GET /api/notifications/triggers`
- `GET /api/users/me/notification-preferences`
- `PUT /api/users/me/notification-preferences`
- `GET /api/admin/notification-defaults`
- `PUT /api/admin/notification-defaults`
- `GET /api/admin/sla-rules`
- `POST /api/admin/sla-rules`
- `PATCH /api/admin/sla-rules/{rule_id}`
- `GET /api/escalated-items`
- `POST /api/sla/jobs/evaluate`
- `GET /api/digests`
- `GET /api/digests/schedules`
- `POST /api/digests/schedules`
- `PATCH /api/digests/schedules/{schedule_id}`
- `POST /api/digests/preview`
- `POST /api/digests/{digest_id}/send`
- `GET /api/digests/{digest_id}`
- `GET /api/dashboards/am-home`
- `POST /api/dashboards/am-home/task-summary/refresh`
- `GET /api/dashboards/kam-head-portfolio`
- `GET /api/dashboards/leadership`
- `GET /api/reports/fields`
- `GET /api/reports`
- `POST /api/reports/preview`
- `POST /api/reports`
- `GET /api/reports/{report_id}`
- `PATCH /api/reports/{report_id}`
- `DELETE /api/reports/{report_id}`
- `POST /api/reports/{report_id}/export`
- `GET /api/reports/{report_id}/runs`
- `GET /api/reports/schedules`
- `POST /api/reports/{report_id}/schedules`
- `PATCH /api/reports/schedules/{schedule_id}`
- `POST /api/reports/schedules/{schedule_id}/run`

## UI Requirements

- Notification center with unread/read states and preference screen.
- Notification center supports search, filters, pagination, mark read, mark all read, source links, empty state, and delivery/error indicators.
- SLA configuration and escalated-items view.
- Digest schedule, preview, and delivery history.
- AM Home operational dashboard.
- AM Home includes an API-backed AI Task Summary card with refresh action, loading state, stale timestamp, and source-count disclosure.
- KAM Head Portfolio dashboard with charts/tables/drilldowns.
- Leadership Dashboard with read-only executive cards and decision queue.
- Report builder wizard with source, fields, filters, grouping, layout, preview, and export.
- Preserve Dashboard as the default route and make widgets API-backed incrementally; report builder and digest history need dedicated role-aware screens or tabs because they are not present in the current frontend shell.
- Admin settings must expose notification defaults, mandatory trigger policy, and SLA rule management for authorized roles.
- Profile or notification settings must expose user notification preferences.
- Report and digest screens must use the existing frontend service/API layer, not direct fetch calls from components.

## Loading States

- Notification center loading.
- Preference save loading.
- SLA evaluation/configuration loading.
- Digest preview/generation loading.
- Dashboard skeletons per widget.
- Report preview/export loading.
- AI Task Summary refresh loading.

## Empty States

- No notifications.
- No escalated items.
- No digest schedules/history.
- No assigned accounts.
- No visible portfolio accounts.
- No saved reports or selected report fields.
- No report/digest schedules.
- No permission-scoped report fields for selected data source.

## Error States

- Preference save failure.
- Notification delivery failure.
- Invalid SLA rule.
- Digest generation/delivery failure.
- Widget-level dashboard data failure.
- Forbidden report field or invalid grouping.
- Export failure.
- Notification source record no longer visible to the user.
- AI Task Summary refresh failure.

## Security Requirements

- Enforce RBAC on every endpoint and again at report/digest generation time.
- Re-check access when a user opens a notification source link, views digest history, previews a report, exports a report, or receives a scheduled digest/report.
- Do not expose hidden-record counts or names in dashboard summaries, digest redactions, notifications, or exports.
- Store only permission-scoped digest/report content; if immutable run content is stored, it must include redaction metadata and be hidden from users who lose access.
- Sensitive Field Builder fields must be excluded from reports unless explicitly permitted by module and field-level policy.
- Scheduled jobs must not run as an unrestricted superuser context; they must evaluate recipient-specific permission scopes.
- Delivery logs must avoid storing secrets, email provider credentials, or raw access tokens.
- Email notifications should contain minimal context and require in-app access for restricted details.

## Edge Cases

- Mentions do not grant access to restricted records.
- Preference changes affect future notifications only.
- Mandatory policy notifications may override "off" preferences.
- Timer reset must be auditable.
- Digest redactions must not reveal hidden-record counts.
- Saved report owner may lose access; export must re-check permissions.
- Notification recipient may become inactive before delivery; delivery should be skipped and logged.
- Source item may be deleted, archived, restricted, or reassigned after notification creation.
- SLA evaluation may run multiple times for the same item/window; deduplication must prevent duplicate notifications.
- Timezone changes should affect future scheduled runs without rewriting historical run timestamps.
- Large exports must be bounded and return a clear limit error or background run state.
- Dashboard filters may produce no visible records because of RBAC even when portfolio data exists.

## Missing Requirements

- Exact trigger catalog labels, mandatory policy by trigger, and default preferences require product confirmation before final seeding.
- Exact SLA qualifying activity definitions require product confirmation before final seeding.
- Dashboard widget layouts and exact KPI thresholds beyond the PRD examples are not fully defined.
- Scheduled report cadence defaults are not specified separately from executive digests.
- Email delivery provider configuration is not specified; implementation should use a queued/logged adapter boundary and support local no-op delivery.

## Ambiguous Requirements

- KAM Head configuration is treated as allowed only when the user has `notifications_digests:configure`; Admin/Super Admin retain full configuration.
- Executive digests are treated as both centrally schedulable by Admin/KAM Head and user-schedulable where RBAC permits.
- Reports are treated as schedulable separately from executive digests.
- Product-goal thresholds are listed in the PRD but ownership of monitoring/alerting for each threshold is not assigned.

## Conflicting Requirements

- No explicit conflict, but "off where permitted" for notifications conflicts with mandatory SLA escalation unless mandatory trigger policy is defined.

## Unspecified Edge Cases

- Exact notification deduplication window for non-SLA triggers is not specified.
- Dashboard cache duration and invalidation rules are not specified.
- PDF visual layout requirements are not specified.
- Email retry count and retry interval are not specified.

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
- Skip digest delivery to an inactive or unauthorized recipient.
- Load AM Home with assigned accounts only.
- Refresh AI Task Summary and verify widget refresh does not reload the full dashboard.
- Load Leadership Dashboard with no edit controls.
- Create report with permitted fields.
- Attempt report with forbidden field and verify validation.
- Export saved report after permissions change.
- Suppress duplicate SLA escalation notification for the same source item and SLA window.
- Verify Field Builder sensitive fields are excluded from report fields unless explicitly permitted.
- Verify notification source link returns forbidden/not found instead of leaking restricted record details.
- Verify local scheduled worker evaluates due SLA rules, digests, and report schedules idempotently.

## Acceptance Criteria

- Notifications, SLA escalations, digests, dashboards, and reports are permission-aware and auditable.
- Dashboards answer "what needs attention today" for the relevant role.
- Reports and digests never leak restricted fields.
- Lists and embedded tables support expected filters, sorting, search, and pagination.

## Implementation Status

### Completed Items

- Notification center is implemented and tested with server-side notification records, unread/read state, mark read, mark all read, search, filters, sort, pagination, source-route redaction, delivery metadata, and recipient scoping.
- User notification preferences are implemented and tested with trigger catalog defaults, mandatory trigger enforcement, digest cadence, policy override metadata, preference save loading/error states, and audit logging.
- Admin notification defaults are implemented and tested through RBAC-protected configuration endpoints and Admin Settings UI.
- SLA rule configuration is implemented and tested with item type validation, positive inactivity windows, qualifying activity definitions, recipient policy validation, pagination, RBAC, and audit logging.
- SLA escalation evaluation is implemented and tested through authorized manual action and a local scheduled worker loop, with escalated-item records, deduplication by source item/recipient/SLA window, worker run logs, and notification creation.
- Escalated-items list is implemented and tested with search, item type, owner, account, severity, SLA state, date filtering, sorting, pagination, and account-scope enforcement.
- Executive digest preview, schedules, history, send action, and scheduled generation are implemented and tested with timezone validation, active authorized recipients, permission-scoped generation, redaction metadata, delivery attempts, status/error fields, pagination, and RBAC.
- AM Home dashboard is implemented and tested with assigned accounts, signals, overdue/active tasks, stale KYC, governance cadence, escalations, opportunities, widget statuses, generated timestamps, data scope, loading state, empty state, and error state.
- AM Home AI Task Summary card is implemented and tested with headline, narrative, blockers, recommended focus, source counts, refreshed timestamp, and manual refresh that updates only the summary widget.
- KAM Head Portfolio dashboard is implemented and tested with health distribution, high-risk accounts, stale KYC, escalations, renewal focus, AM workload, overdue actions, governance cadence, and SLA compliance widgets.
- Leadership Dashboard is implemented and tested with strategic health, retention outlook, growth, revenue risk, major escalations, executive summaries, and decision queue widgets.
- Configurable report builder is implemented and tested with data sources, permission-scoped fields, filters, grouping, sorting, pagination, preview, saved reports, CSV export, PDF export validation, export run history, and schedules.
- Report and digest schedules are implemented and tested through local scheduled workers and authorized manual runs.
- Field Builder impact is reviewed and tested: active non-sensitive custom fields can appear in report fields, while sensitive custom fields are excluded unless future explicit field-level policy is added.
- Report/digest security is implemented and tested with generation-time and view-time permission checks, recipient authorization, hidden content prevention, redaction metadata, and source access redaction.
- Database storage is implemented with dedicated tables for notification triggers, notification preferences, notification records, SLA rules, SLA escalated items, digest schedules/runs, report definitions/schedules/runs, and scheduled-worker run logs.
- Frontend screens and components are implemented and tested for Dashboard, Notifications, Reports, Profile notification preferences, Admin notification/SLA settings, and notification tray behavior.
- Automated tests were added and passed for happy paths, validation, authorization, pagination/search/filter behavior, Field Builder sensitivity, source redaction, digest/report security, and report export validation.

### Remaining Items

- Direct email provider delivery is not implemented because provider configuration is not specified. Current behavior records/queues email-capable delivery metadata and keeps restricted details in-app.
- Dashboard standard-view performance target of loading within 3 seconds is not benchmark-tested. Queries are bounded and paginated, but no automated performance test exists yet.
- Exact product-approved notification trigger labels, mandatory policies, default preferences, SLA qualifying activity definitions, dashboard KPI thresholds, and PDF visual layout still require product confirmation.
- Notification delivery retry interval and max retry policy are not finalized beyond persisted retry/status fields.
- Dashboard widget failure isolation is implemented through widget-level status/error response shape and frontend rendering, but most current widgets are generated from shared service queries rather than fully independent widget jobs.
- Large export background job behavior is bounded by preview/export row limits, but a separate async export queue and explicit limit-error workflow remain future work.

### Technical Notes

- Backend feature files include `backend/app/routers/notifications.py`, `backend/app/routers/dashboards.py`, `backend/app/routers/reports.py`, `backend/app/services/notifications.py`, `backend/app/services/dashboards.py`, `backend/app/services/reports.py`, and matching repositories.
- Database changes are captured in `backend/migrations/20260602_notifications_dashboards_reporting.sql` and additive startup migration logic in `backend/app/database.py`.
- The local worker loop is controlled by `NOTIFICATIONS_REPORTING_WORKER_ENABLED`, `NOTIFICATIONS_REPORTING_WORKER_INITIAL_DELAY_SECONDS`, and `NOTIFICATIONS_REPORTING_WORKER_INTERVAL_SECONDS`.
- Feature documentation is tracked in `docs/features/notifications-dashboards-reporting.md` and linked from `docs/features/README.md`.
- Verification completed:
  - `backend/.venv/bin/python -m pytest backend/tests/test_notifications_dashboards_reporting.py -q` passed with 7 tests.
  - `backend/.venv/bin/python -m pytest backend/tests -q` passed with 91 tests.
  - `npm test -- --run src/components/notifications/NotificationPreferencesPanel.test.tsx src/pages/Reports.test.tsx` passed with 3 tests.
  - `npx tsc && npx vite build --outDir dist-user-check` passed; the temporary output was removed after verification.
