# Notification Workflow Revamp

## Summary

Workflow-first notification delivery replaces the old small trigger list as the source of truth. Notifications are persisted for the navbar bell and Notification Center, configurable by Admin, and email-capable for mandatory and SLA-triggered events.

## Scope

- In scope: full trigger catalog, workflow/timing metadata, Admin timing controls, persisted bell summary, draft account approval notifications, task assignment notifications, mandatory email delivery, API and UI tests.
- Out of scope: executive digests, Slack, Teams, and a full scheduler worker that materializes every future due reminder.

## Requirement Links

- PRD IDs: Notifications, SLA Escalation, account onboarding approval workflow, task/workflow alerts.
- Related docs: `specs/15-notification-workflow-revamp.md`.

## User Flow

An AM creates an account draft. KAM Head/Admin users receive a persisted bell notification to review it. When the draft is approved, rejected, or linked, the draft creator and assigned owner receive outcome notifications. When a task is created or reassigned, the assignee receives a persisted notification.

## Backend Plan

- Routers: `backend/app/routers/notifications.py`.
- Services: `backend/app/services/notifications.py`, `backend/app/services/notification_catalog.py`, workflow hooks in onboarding and tasks.
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
- Form behavior: Admin can filter by workflow, edit channel/priority/timing, test, reset, and dry-run timed triggers.
- Backend error display: existing toast/error-state behavior is reused.

## Validation And Errors

- Backend validates trigger slugs, labels, quiet hours, timing integers, mandatory/off conflicts, and active test recipients.
- Frontend keeps loading, empty, and error states already present in notification pages.

## Tests

- Backend unit/API tests cover catalog seeding, mandatory email enforcement, bell summary, admin timing update/test/dry-run, draft workflow notifications, and task creation notifications.
- Frontend tests should cover tray summary loading and admin trigger settings once the component test suite is expanded.

## Linting And Quality

- Relevant Docker backend tests should be run before handoff.
- Frontend build/test should be run after UI changes.

## Open Questions

- A production scheduler worker should be implemented in a separate pass to create all future due/reminder notifications from the timing configuration.

## Handoff Notes

- Manual verification: create a draft account as AM, log in as KAM Head/Admin, open bell; approve/reject/link and verify creator/owner bell; create task and verify assignee bell.
