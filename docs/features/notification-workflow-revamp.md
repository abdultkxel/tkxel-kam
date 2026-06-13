# Notification Workflow Revamp

## Summary

Workflow-first notification delivery replaces the old small trigger list as the source of truth. Notifications are persisted for the navbar bell and Notification Center, configurable by Admin, and email-capable for admin test/SLA-triggered events. Domain workflow hooks added in this pass queue in-app notifications only.

## Scope

- In scope: full trigger catalog, workflow/timing metadata, Admin timing controls, persisted bell summary, in-app domain workflow notifications, draft account approval notifications, KYC lifecycle notifications, source document notifications, task assignment notifications, escalation notifications, Admin/RBAC security notifications, mandatory email delivery for explicit admin/test paths, API and UI tests.
- Out of scope: executive digests, Slack, Teams, and a full scheduler worker that materializes every future due reminder.

## Requirement Links

- PRD IDs: Notifications, SLA Escalation, account onboarding approval workflow, task/workflow alerts.
- Related docs: `specs/15-notification-workflow-revamp.md`.

## User Flow

An AM creates an account draft. KAM Head/Admin users receive a persisted bell notification to review it. When the draft is approved, rejected, or linked, the draft creator and assigned owner receive outcome notifications. Account ownership, attachments, source extraction, KYC review/approval/rejection, engagement health, opportunities, governance events/actions/decisions, escalations, CSAT, RBAC, and Admin security changes now create in-app notifications for the affected users. When a task is created or reassigned, the assignee receives a persisted notification.

## Backend Plan

- Routers: `backend/app/routers/notifications.py`.
- Services: `backend/app/services/notifications.py`, `backend/app/services/in_app_notifications.py`, `backend/app/services/notification_catalog.py`, workflow hooks in onboarding, accounts, KYC, engagements, opportunities, governance, escalations, CSAT, RBAC/Admin security, analytics, integrations, AI assistance, and tasks.
- Repositories: `backend/app/repositories/notifications.py`.
- Schemas/validation: notification trigger timing fields, test request, summary response, scheduler dry-run response.

## API Documentation

- Added summary/description metadata for bell summary, single-trigger update/reset/test, and scheduler dry-run routes.
- Existing list/read/preference/SLA endpoints remain compatible.

## Database Plan

- Tables: `notification_trigger_configs`, `notification_records`, `scheduled_worker_runs`.
- Columns: workflow, priority, recipient policy, timing mode/unit/value fields, repeat/escalation settings, quiet hours, template JSON, record action label.
- Migrations: `backend/migrations/20260604_notification_workflow_revamp.sql`.
- Snake_case schema check: all new database columns are snake_case.

## Frontend Plan

- Pages/components: `NotificationTray`, `Notifications`, `AdminNotificationsReportingPanel`.
- Services: `frontend/src/services/notificationsReporting.ts`.
- Form behavior: Admin can filter by workflow, edit channel/priority/timing, test, and reset trigger defaults.
- Admin Settings now hides signal/escalation workflow trigger defaults and no longer shows SLA rule configuration or SLA run controls.
- The notification trigger catalog has been pruned to implemented runtime emitters. Seed/bootstrap removes stale trigger configs and preferences such as old renewal, Fathom, signal, content, retention, and planning defaults while preserving historical notification records.
- Admin Settings, Profile notification preferences, and Notification Center trigger filters now surface only configurable triggers. Runtime-only escalation/SLA configs remain available for existing backend emitters but are hidden from Admin Settings defaults.
- Admin trigger defaults are paginated in the Settings panel so large trigger catalogs remain scannable.
- Notification scheduler dry-run controls and scheduler run history are no longer shown in Admin Settings.
- Backend error display: existing toast/error-state behavior is reused.

## Validation And Errors

- Backend validates trigger slugs, labels, quiet hours, timing integers, mandatory/off conflicts, and active test recipients.
- Frontend keeps loading, empty, and error states already present in notification pages.

## Tests

- Backend unit/API tests cover base/catalog seeding, mandatory email enforcement for explicit admin test paths, bell summary, admin timing update/test/dry-run, draft workflow notifications, task creation notifications, account-owner notifications, and escalation notifications.
- Frontend tests cover tray summary loading and Admin trigger settings visibility/pagination.

## Linting And Quality

- Latest focused run: `docker compose exec -T backend pytest -q tests/test_notification_workflow_revamp.py tests/test_notifications_dashboards_reporting.py::test_notification_preferences_validation_pagination_and_read tests/test_notifications_dashboards_reporting.py::test_sla_evaluation_creates_deduplicated_escalation_notification` passed.
- Relevant Docker backend tests should be run before handoff.
- Frontend build/test should be run after UI changes.

## Open Questions

- A production scheduler worker should be implemented in a separate pass to create all future due/reminder notifications from the timing configuration, including governance reminders/overdue actions, renewal due/overdue, opportunity overdue, and handover overdue events.

## Handoff Notes

- Manual verification: create a draft account as AM, log in as KAM Head/Admin, open bell; approve/reject/link and verify creator/owner bell; create task and verify assignee bell; add an account owner, upload/extract an attachment, create escalation, create CSAT score, and verify each event appears in the header bell and Notification Center.
