# Notifications, Dashboards, And Reporting

## Summary

Implements server-backed notification preferences, notification center, SLA escalation, executive digests, role dashboards, and configurable reports for the KAM Intelligence Platform.

## Scope

- In scope: notification persistence, preferences, trigger defaults, SLA rules/evaluation, digest schedules/runs, AM/KAM Head/Leadership dashboards, AI Task Summary, report builder, report preview/export, scheduled report runs.
- Out of scope: production SMTP/provider delivery. Email is represented through queued/logged delivery metadata until a provider is configured.

## Requirement Links

- PRD IDs: V3-FR-066, V3-FR-083, V3-FR-084, V3-FR-085, V3-FR-086, V3-FR-087, V3-FR-088, V3-FR-089, V3-FR-090, V3-FR-134.
- Spec: `specs/07-notifications-dashboards-and-reporting.md`

## User Flow

Users review notifications from the topbar tray or Notification Center, update personal preferences from Profile, and view API-backed dashboard widgets from Dashboard. Admin/KAM Head users configure notification defaults and SLA rules from Admin Settings. Users create reports from Reports, preview rows, save definitions, and export CSV/PDF. Authorized users preview/schedule digests and run SLA evaluation manually while local workers process due SLA/digest/report jobs.

## Backend Plan

- Routers: `notifications.py`, `dashboards.py`, `reports.py`
- Services: `notifications.py`, `dashboards.py`, `reports.py`
- Repositories: `notifications.py`, `dashboards.py`, `reports.py`
- Schemas/validation: notification modes, mandatory triggers, SLA item types/windows, schedule timezones, report fields, export formats.
- Helpers: deterministic digest/dashboard/report summarization, deduplication keys, schedule next-run calculation.

## API Documentation

- Swagger tags added for Notifications/SLA/Digests and Dashboards/Reporting.
- Routes include summaries/descriptions for list, create, update, preview, export, and manual job endpoints.

## Database Plan

- Tables: notification trigger configs, preferences, records, SLA rules, escalated items, digest schedules/runs, report definitions/schedules/runs, scheduled worker runs.
- Migration: `backend/migrations/20260602_notifications_dashboards_reporting.sql`
- Snake_case schema used for all new tables and columns.

## Frontend Plan

- Pages/components: Dashboard, Notifications, Reports, NotificationTray, NotificationPreferencesPanel, AdminNotificationsReportingPanel.
- Services: `frontend/src/services/notificationsReporting.ts`
- Form behavior: frontend validation is lightweight; backend validation remains authoritative.
- Backend errors display near panels/forms as inline error blocks or toast messages.

## Validation And Errors

- Mandatory triggers cannot be disabled.
- Schedules require valid cadence/timezone/recipients.
- SLA windows must be positive.
- Report fields are checked against permission-scoped field metadata.
- Sensitive Field Builder fields are excluded from report fields.

## Tests

- Backend API tests cover preferences, mandatory trigger validation, notification read, SLA evaluation/deduplication, dashboards, report preview/export, and digest preview.
- Frontend tests cover notification preferences, notification center loading/empty/error basics, and report builder preview flow.

## Linting And Quality

- Relevant backend and frontend tests should be run before handoff.
- Known tradeoff: email delivery uses queued/logged local behavior pending provider configuration.

## Open Questions

- Production email provider and retry interval.
- Exact non-SLA notification deduplication windows.
- Final PDF layout requirements.

## Handoff Notes

- Local worker can be controlled with `NOTIFICATIONS_REPORTING_WORKER_ENABLED`.
- Manual SLA evaluation is available through Admin settings and Reports > SLA escalations.
