# Alert Rules And Notification Delivery

## Summary

The platform now has a backend-owned Alerts system. Alert rules define when persisted alert records are created or updated; notification defaults and Profile preferences define how users are notified after an alert exists.

V1 intentionally has no standalone alert center, no custom condition builder, no automatic task creation, no escalation-module alert, and no new Project model. Project context is copied from `accounts.project_name` and engagement/SOW context when available.

## Product Surfaces

### Admin Alert Rules

- Surface: `Admin -> Alert Rules`.
- Component: `frontend/src/components/admin/AlertRulesPanel.tsx`.
- Source of truth: backend `alert_rules`.
- APIs:
  - `GET /api/admin/alert-rules`
  - `PATCH /api/admin/alert-rules/{rule_id}`
  - `POST /api/admin/alert-rules/{rule_id}/preview`
- Purpose: configure alert generation policy: active state, threshold, severity, snooze days, recipient policy, and leadership escalation.
- Preview is non-mutating and creates no alerts or notifications.

### Account Alert Details

- Surface: account/project page overview.
- Component: `frontend/src/components/account/Account360.tsx`.
- Source of truth: backend `alerts`.
- Active alerts load from `GET /api/alerts?account_id={id}&status=active`.
- Notification links use `/accounts/{account_id}?tab=overview&alert={alert_id}` and focus the alert drawer.
- Acknowledge, snooze, and resolve actions live in the drawer only.
- Suggested actions are guidance/links only in V1.

### Profile Notifications

- Surface: `Profile -> Notifications`.
- APIs:
  - `GET /api/users/me/notification-preferences`
  - `PUT /api/users/me/notification-preferences`
- Purpose: personal delivery mode for active backend triggers.
- For alerts, the trigger is `alert_created`.
- Supported modes remain `in_app`, `in_app_email`, and `off`.
- Turning `alert_created` off suppresses visible delivery for that user, but the alert record is still created.

### Admin Notification Defaults

- Surface: Admin notification defaults.
- Purpose: platform defaults for delivery trigger behavior.
- `alert_created` is optional but seeded active with default mode `in_app` and default cadence `immediate`.
- Email is queued only when Admin/Profile mode resolves to `in_app_email`.

## Data Model

### `alert_rules`

Seeded and editable platform rules.

- `rule_key`
- `name`
- `description`
- `alert_type`
- `source_type`
- `threshold_value`
- `threshold_unit`
- `severity`
- `snooze_days`
- `recipient_policy`
- `escalation_enabled`
- `is_active`
- `sort_order`
- audit fields

### `alerts`

General persisted alert records.

- rule id/key, alert type, title, detail, severity, status
- owner id/name/email
- account id/name, engagement id/name, project name
- source type/id/route
- source evidence JSON
- previous/new value JSON
- recommended action
- deduplication key
- first/last triggered timestamps
- snooze/resolve timestamps and resolved reason
- audit fields

One active alert is maintained per rule/source deduplication key. Resolved alerts are historical; if the condition recurs after resolution, evaluation creates a new alert row.

### `alert_status_history`

Status transition history for creation, manual status changes, auto-resolution, and reactivation.

- alert id
- from/to status
- reason
- actor id/name, using `System` for worker/evaluator actions
- metadata JSON
- created timestamp

### Legacy Table

`account_change_alerts` remains in the schema for historical compatibility, but the analytics route and service creation/read paths are no longer used by the frontend after migration to `/api/alerts`.

## Seeded Rules

Exactly seven default rules are inserted by migration and idempotent seed. Seed updates stable names/descriptions/source metadata but preserves editable admin values.

| Rule key | Default threshold | Severity | Source |
| --- | ---: | --- | --- |
| `low_overall_health` | `60` score | high | account |
| `overall_score_drop` | `10` points | high | score snapshot |
| `engagement_renewal_window` | `60` days | medium | engagement |
| `opportunity_stalled` | `90` days | medium | opportunity |
| `task_overdue` | `0` days | medium | task |
| `governance_event_overdue` | `1` day | high | governance event |
| `governance_action_overdue` | `1` day | high | governance action item |

## Lifecycle

Allowed statuses:

- `open`
- `acknowledged`
- `snoozed`
- `resolved`

Behavior:

- `snoozed` requires `snoozed_until`.
- Active counts hide snoozed alerts until `snoozed_until` has elapsed.
- If snooze expires and the condition still matches, the alert reopens and sends `alert_created` with event metadata `reactivated`.
- If an acknowledged or snoozed condition worsens, the alert reopens and notifies.
- If a condition clears, evaluation auto-resolves the alert with reason `condition_cleared`.
- If a resolved condition recurs, evaluation creates a new alert row.

## Evaluation

Evaluation can be event-driven, manual, or scheduled.

Event hooks call account-scoped evaluation after relevant commits:

- account health/score recalculation
- engagement create/update/health recalculation
- opportunity create/update/stage change
- task create/update
- governance event/action create/update/complete

Manual evaluation:

- `POST /api/alerts/evaluate`
- `scope=all` requires `alerts:configure`
- `scope=account` requires `alerts:view` plus account visibility

Scheduled evaluation:

- Backend worker loop runs every `ALERTS_WORKER_INTERVAL_SECONDS` seconds.
- Default interval is 300 seconds.
- UTC comparisons are used for due/overdue checks.
- Worker runs are logged to `scheduled_worker_runs` with `job_type=alert_evaluation`.
- Success and failure runs are persisted.

## Public APIs

### Alerts

- `GET /api/alerts`
  - filters: `status`, `severity`, `alert_type`, `account_id`, `owner_id`, `source_type`, `search`, `page`, `page_size`
- `GET /api/alerts/{alert_id}`
- `PATCH /api/alerts/{alert_id}/status`
  - body: `status`, optional `reason`, optional `snoozed_until`
- `POST /api/alerts/evaluate`
  - body: `scope: all|account`, optional `account_id`, optional `rule_id`
  - returns evaluated, matched, created, updated, resolved, reactivated, notifications created, and worker run id

### Admin Rules

- `GET /api/admin/alert-rules`
- `PATCH /api/admin/alert-rules/{rule_id}`
- `POST /api/admin/alert-rules/{rule_id}/preview`

All routes include OpenAPI summaries, descriptions, and common error responses.

## Permissions

New RBAC permissions:

- `alerts:view`
- `alerts:update`
- `alerts:configure`

Rules:

- Rule configuration and global evaluation require `alerts:configure`.
- Listing/viewing alerts requires `alerts:view`.
- Status updates are allowed for:
  - alert owner
  - account/source owner via account ownership
  - users with `alerts:update`
  - users with portfolio-style update permissions used by account/task owners

## Notification Delivery

Alert creation and reactivation queue notifications through `NotificationsService` with trigger `alert_created`.

Recipient rules:

- Alert owner and first recipient: source record owner, fallback to primary account owner.
- If a rule uses `account_owner_first`, the primary account owner is tried before the source owner.
- Leadership escalation sends high/critical alerts to KAM Head/Admin roles when the rule escalation toggle is enabled.

Profile preferences:

- `off`: alert row is created; notification record is stored as `skipped` with `reason=preference_off`.
- `in_app`: in-app notification is delivered.
- `in_app_email`: in-app notification is delivered and email queue metadata is stored.

Tests assert notification and email queue metadata; external SMTP delivery is not required.

## Frontend Notes

- `frontend/src/services/alerts.ts` wraps all alert/rule APIs.
- The old frontend-local alert store/types were removed; Admin Alert Rules now use backend state only.
- `frontend/src/components/alerts/AlertsOverview.tsx` reads backend alerts if used, but V1 does not add a dedicated alert center route.
- Account alert drawer text uses user-facing labels: `Alerts`, `Alert Rules`, and `Alert details`.
- Backend validation errors are surfaced beside matching Admin Alert Rule fields.

## Configuration

Environment variables:

- `ALERTS_WORKER_ENABLED`, default `true`
- `ALERTS_WORKER_INITIAL_DELAY_SECONDS`, default `30`
- `ALERTS_WORKER_INTERVAL_SECONDS`, default `300`

These are documented in `.env.example` and passed through Docker Compose.

## Test Notes

Focused Docker command used during implementation:

```bash
docker compose run --rm --no-deps \
  -e DATABASE_URL=sqlite:///./test-alerts.db \
  -e ALERTS_WORKER_ENABLED=false \
  -e NOTIFICATIONS_REPORTING_WORKER_ENABLED=false \
  -e TIMELINE_RETENTION_WORKER_ENABLED=false \
  -e INTEGRATIONS_WORKER_ENABLED=false \
  -e KYC_WORKER_ENABLED=false \
  backend pytest tests/test_alerts.py tests/test_gap_fixes_analytics_admin_ai.py -q
```

Result:

- `8 passed`
- `python3 -m compileall backend/app` also passed locally.

Additional broad command attempted:

```bash
docker compose run --rm --no-deps \
  -e DATABASE_URL=sqlite:///./test-alerts.db \
  -e ALERTS_WORKER_ENABLED=false \
  -e NOTIFICATIONS_REPORTING_WORKER_ENABLED=false \
  -e TIMELINE_RETENTION_WORKER_ENABLED=false \
  -e INTEGRATIONS_WORKER_ENABLED=false \
  -e KYC_WORKER_ENABLED=false \
  backend pytest tests/test_alerts.py tests/test_gap_fixes_analytics_admin_ai.py tests/test_notifications_dashboards_reporting.py -q
```

Result:

- Alert-specific tests passed.
- Existing dashboard/role/custom-field tests failed because seeded users for `leadership_viewer`, `delivery_lead`, and `commercial_stakeholder` were not present in that fixture and custom account fields were not returned by the report field endpoint in that run. Those failures are outside this Alerts implementation.

Frontend verification:

```bash
docker compose run --rm --no-deps frontend npm run typecheck
docker compose run --rm --no-deps frontend npm run test -- src/components/admin/AlertRulesPanel.test.tsx src/components/account/Account360.test.tsx
```

Result:

- Typecheck passed.
- `9 passed` across the focused frontend tests.
- Account360 tests still print existing CKEditor stylesheet parsing noise and React act warnings in jsdom, but the tests pass.
