# Requirements Coverage Report: Notification Workflow Revamp

Source spec: `specs/15-notification-workflow-revamp.md`

Review date: 2026-06-05

## Summary

The implementation now has a workflow-first notification catalog, persisted bell/center records, Admin-configurable timing metadata, mandatory/SLA email behavior, draft-account and task workflow notifications, archive support, scheduler dry-run/history, and focused automated coverage.

The largest remaining gap is full workflow migration for every catalog trigger. The catalog and configuration contract exist for all triggers, but only the highest-risk workflows are currently wired end-to-end.

## Coverage Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Replace piecemeal trigger source with workflow catalog | Complete | `backend/app/services/notification_catalog.py`, `backend/app/services/notifications.py` |
| Full trigger catalog exists with workflow, recipient policy, priority, action | Complete | `backend/app/services/notification_catalog.py`, `backend/tests/test_notification_workflow_revamp.py` |
| Default-enabled vs optional disabled trigger behavior | Complete | `backend/app/services/notification_catalog.py`, `NotificationsService.seed_defaults` |
| Persist notifications for navbar bell and Notification Center | Complete | `backend/app/models.py`, `backend/app/repositories/notifications.py`, `frontend/src/components/notifications/NotificationTray.tsx`, `frontend/src/pages/Notifications.tsx` |
| Navbar bell uses persisted summary source | Complete | `GET /api/notifications/summary`, `NotificationTray.tsx`, `NotificationTray.test.tsx` |
| Notification Center uses same persisted source | Complete | `GET /api/notifications`, `frontend/src/pages/Notifications.tsx` |
| In-app default channel | Complete | `NotificationTriggerConfig.default_mode`, catalog defaults |
| Email delivery for mandatory/SLA notifications | Complete | `NotificationsService.queue_notification`, `test_mandatory_notifications_force_email_delivery` |
| User preferences cannot disable mandatory triggers | Complete | `NotificationsService.update_preferences`, existing `test_notifications_dashboards_reporting.py` |
| Admin cannot disable mandatory catalog triggers | Complete | `NotificationsService.update_trigger_config`, `update_defaults`, `test_full_catalog_is_seeded_with_admin_timing_controls` |
| Admin trigger timing configuration | Complete | `NotificationTriggerConfig` timing columns, `NotificationTriggerUpdateRequest`, `AdminNotificationsReportingPanel.tsx` |
| Business days default for pending/reminder config | Complete | `REMINDER_DEFAULTS`, seed assertions |
| Scheduler dry-run | Complete | `POST /api/admin/notification-scheduler/dry-run`, `dryRunNotificationScheduler`, tests |
| Scheduler run history list | Complete | `GET /api/admin/notification-scheduler/runs`, `getNotificationSchedulerRuns`, Admin UI history |
| Actual timed scheduler materializes every due reminder | Missing | No production worker creates all pending/due/checkpoint notifications from timing config yet. |
| Account draft creation notifies KAM Head/Admin approvers | Complete | `OnboardingService._notify_draft_created`, backend workflow test |
| Draft approval/rejection/link outcomes notify creator/owner | Complete | `OnboardingService._notify_draft_outcome`, backend workflow test |
| Draft resubmission/changes-requested/concurrent conflict | Missing | Catalog exists; no dedicated workflow action is implemented in onboarding service. |
| CSV import notification behavior | Partial | Catalog exists; current CSV import still creates/approves/links through existing flow, but no import summary notification is wired. |
| Task creation notifies assignee | Complete | `TaskService`, `PlaybooksTasksService`, backend workflow test |
| Task reassignment notifies new and previous assignee | Partial | Both task services have notification hooks; no focused automated test yet. |
| Other catalog workflows: KYC, governance, CSAT, opportunity, admin/security, etc. | Partial | Catalog/config exists; only existing legacy SLA/integration/analytics paths and new draft/task paths are wired end-to-end. |
| Search/filter/sort/pagination | Complete | Search, trigger, workflow, priority, account, channel, date, read/archived state, sort, pagination in router/repository/UI. |
| Archive mutation and archived state | Complete | `archived_at`, `PATCH /api/notifications/{id}/archive`, UI archive action, tests |
| Unknown trigger filter returns meaningful error | Complete | `NotificationsService.list_notifications`, backend test |
| RBAC list/read/source redaction | Complete | `AccountAccessService` checks in `NotificationsService`, existing redaction tests |
| Count excludes hidden/archived notifications | Complete | repository unread conditions and default archived exclusion |
| Source links rechecked/read redacted | Complete | `_notification_read`, existing tests |
| Deduplication | Complete for implemented events | `deduplication_key` unique constraint, queue helper, workflow keys, SLA tests |
| Delivery attempt audit row per channel | Partial | Email metadata is stored in notification metadata; there is no separate delivery-attempt table. |
| Notification template rendering | Partial | `template_json` exists and seeded; implemented workflow calls still pass rendered title/body directly. |
| Domain event orchestrator abstraction | Partial | Central service and catalog exist, but workflow services call `NotificationsService` directly rather than a dedicated orchestrator class. |
| Slack/Teams future support | Partial | Supported channels schema is extensible but currently limited to in-app/email as intended for this pass. |
| Settings page groups user preferences by workflow | Missing | Preference panel still lists preferences without workflow grouping. |
| Admin settings workflow grouping/timing/test/reset/dry-run | Complete | `AdminNotificationsReportingPanel.tsx` |
| Optional notifications separate expandable area | Partial | Admin UI can filter workflow and enable optional triggers, but no dedicated expandable optional section. |
| Field-level backend validation errors for timing | Partial | Backend validates values and quiet hours; frontend shows toast-level errors, not field-level messages in Admin notification settings. |
| Loading/empty/error states | Complete | Notification tray, center, and Admin panel preserve loading/empty/error states. |
| Responsive UI | Complete | Grid layouts use responsive tracks in modified notification surfaces. |
| Feature documentation | Complete | `docs/features/notification-workflow-revamp.md`, `docs/features/README.md` |

## Missing Requirements

- Production scheduler worker for all due-date, pending, checkpoint, repeat, and escalation rules.
- Full workflow migration for every catalog trigger.
- User preference grouping by workflow.
- Dedicated optional-notifications expandable area in Admin settings.
- Separate delivery-attempt table for channel attempts.
- Dedicated notification orchestrator/template-renderer/recipient-resolver classes.
- Field-level frontend errors in Admin notification settings.

## Field Builder Impact

Field Builder does not automatically create notification triggers. That is correct per the spec.

Current impact:

- Notifications do not render custom field values into bodies by default, reducing privacy risk.
- Account-change alerts may indirectly relate to fields, but notification text currently uses system-generated titles/bodies and does not expose arbitrary custom field values.
- Historical notifications are safe from custom field deletion because they store rendered text and metadata snapshots.

Remaining risk:

- If future notification templates support custom field interpolation, they must check `CustomFieldDefinition.is_sensitive`, field permissions, and recipient access before rendering values.

## Missing Tests

- Task reassignment new/previous assignee notification.
- CSV import summary/importer notification.
- Admin notification settings field-level error display.
- User notification preferences grouped by workflow.
- Scheduler worker materialization tests.
- End-to-end browser tests for AM draft -> approver bell -> approval -> AM bell.
- Full recipient-policy unit tests for every catalog recipient policy.

## Potential Bugs Fixed In This Review

- Mandatory trigger deactivation could mutate the ORM object before raising an error. Fixed with pre-validation in `NotificationsService.update_trigger_config` and `update_defaults`.
- Archived notifications were not modeled, so hidden/archived-state behavior was impossible. Fixed with `archived_at`, archive API, filters, and UI.
- Unknown trigger filters silently returned empty lists. Fixed with explicit validation.
- Scheduler dry-run created run logs but there was no API/UI history. Fixed with scheduler run history endpoint and Admin display.

## Security Concerns

- Full notification bodies must continue avoiding sensitive custom field values.
- External email delivery for mandatory/SLA notifications uses existing template delivery metadata; future external channels need data policy review.
- Source route access is redacted on notification read, but every target page must still enforce its own RBAC.
- Admin test notifications can create records for active users; this is protected by notification configure RBAC.

## Edge Cases Not Fully Handled

- Month-based business timing semantics are not implemented by a scheduler.
- Holiday calendars are not implemented; business-day config currently means configuration metadata, not full scheduling logic.
- Repeat reminders do not yet stop based on source resolution because the production scheduler is not implemented.
- CSV import can create many draft/account actions; product still needs final behavior for summary vs per-row notifications.
- Optional trigger noise controls rely on Admin configuration and deduplication, but broad optional workflow hooks are not wired yet.

## Verification

- `docker compose run --rm --no-deps backend pytest tests/test_notification_workflow_revamp.py -q`
- `docker compose run --rm --no-deps backend pytest tests/test_notification_workflow_revamp.py tests/test_notifications_dashboards_reporting.py -q`
- `docker compose run --rm --no-deps frontend npm test -- NotificationTray.test.tsx Notifications.test.tsx`
- `docker compose run --rm --no-deps frontend npm run typecheck`
