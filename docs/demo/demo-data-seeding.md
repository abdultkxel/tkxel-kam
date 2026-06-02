# Demo Data Seeding

This document describes the local-only demo data seeder for the KAM Intelligence Platform.

The seeder is designed for local development, QA, and solution-architect demos. It creates realistic, varied records across the major modules so the application can be tested end to end without real emails, real external APIs, or production integrations.

## Safety Rules

- The demo seeder is explicit. It does not run on application startup.
- The seeder refuses to run when `APP_ENV`, `ENVIRONMENT`, `KAM_ENV`, or `NODE_ENV` is `production` or `prod`.
- The seeder only allows SQLite, local hosts, or local KAM-style database names unless `KAM_ALLOW_DEMO_SEED_NONLOCAL=true` is set intentionally.
- No real email is sent. Seeded notifications are in-app only and use `email_queued=false`.
- No Google, Fathom, CSAT, or AI Gateway API calls are made.
- External integration rows are seeded as local sample/import history records only.
- Seeded records are clearly marked with `[DEMO]`, `demo-` identifiers, and/or `demo_seed` metadata.
- The seeder is idempotent. Running it again updates the same deterministic demo records instead of duplicating them.

## Seeder Command

Run from the repository root with Docker:

```bash
docker compose exec backend python -m app.cli seed-demo
```

Run locally from the backend environment:

```bash
cd backend
python -m app.cli seed-demo
```

Expected output:

```text
Seeded local demo data: accounts=24, ai_runs=16, csat_scores=24, engagements=48, fathom_items=10, kyc_runs=14, notifications=24, signals=48, tasks=72, users=9
```

## Test Login Credentials

All demo users use this password:

```text
Demo@12345
```

Seeded users:

- `demo.admin@tkxel.com` - Admin
- `demo.kam.head@tkxel.com` - KAM Head
- `demo.kam.nadia@tkxel.com` - Account Manager
- `demo.kam.omar@tkxel.io` - Account Manager
- `demo.ops.ayesha@camp1.tkxel.com` - Ops Lead
- `demo.delivery.hassan@camp1.tkxel.io` - Delivery Stakeholder
- `demo.commercial.sara@tkxel.io` - Commercial Stakeholder
- `demo.content.zain@tkxel.com` - Content Specialist
- `demo.executive.viewer@tkxel.io` - Leadership Viewer

The standard default admin may also exist from base seeding:

```text
admin@tkxel.com
Admin@12345
```

## Seeding Plan

The seeder reads the current SQLAlchemy models and uses existing default seed data for roles, permissions, settings, allowed domains, signal rules, playbooks, and notification settings.

It then creates deterministic demo data for these end-to-end flows:

- Admin and RBAC testing
- Account workspace and engagement testing
- Onboarding draft review
- KYC and AI extraction review
- Relationship planning, stakeholders, whitespace, opportunities, and retention views
- Scoring, signals, playbooks, and tasks
- Content, escalations, governance, and reminders
- Timeline, comments, handover summaries, and internal shares
- Notifications, dashboards, reports, digests, and scheduled worker history
- Google Calendar, Fathom, AI Gateway, and CSAT sample integration history
- Audit logs and access logs

## Required Relationships

The seeder creates records in dependency order:

- Users depend on seeded roles and allowed Tkxel domains.
- Accounts reference creator users and have owner/history records.
- Engagements reference accounts and delivery/commercial users.
- Renewal profiles and health snapshots reference engagements.
- Source documents reference accounts and selected engagements.
- KYC runs, drafts, workstreams, and snapshots reference accounts and source documents.
- Stakeholders, interactions, coverage gaps, plans, opportunities, and action items reference accounts and users.
- Signals reference accounts, optional engagements, and seeded signal rules.
- Tasks reference accounts, engagements, optional playbook executions, owners, and evidence.
- Content sends, escalations, governance events, timeline entries, comments, handovers, notifications, reports, and integration records reference the relevant accounts and users.

There is no standalone `workspaces` table in the current schema. The account workspace is represented by the `accounts` table plus related owners, engagements, documents, plans, stakeholders, KYC, scoring, timeline, and governance records.

## Data Created

### Users And Admin Screens

- 9 demo users across default roles.
- Allowed Tkxel email domains are used.
- `primary_google_calendar_id` defaults to the user's email.
- Audit/access records are seeded for admin audit screens.

### Accounts And Workspaces

- 24 accounts named with `[DEMO]`.
- Varied segments, regions, lifecycle statuses, risk statuses, commercial values, currencies, and health scores.
- Account owner records and ownership history.
- Enough rows for list pagination, search, sorting, and filter combinations.

### Engagements

- 48 engagements, two per account.
- Varied statuses, stages, billing models, start/end dates, renewal dates, delivery health, margin, CSAT, and governance cadence.
- Renewal profiles and engagement health snapshots.

### Onboarding And Documents

- Source documents for selected accounts and engagements.
- Onboarding drafts with different statuses and draft engagement rows.

### Relationship Planning And Growth

- Stakeholders with different influence, sentiment, roles, and last-contact dates.
- Stakeholder interactions and coverage gaps.
- Account plans, plan actions, plan versions, whitespace items, and service recommendations.
- Opportunities, decisions, action items, and stage history.

### Scoring And Signals

- Manual score submissions.
- Scoring jobs, score snapshots, and account score rollups.
- 48 signals with varied types, severities, statuses, due dates, evidence, citations, and source records.
- Playbook executions where supported by the local PostgreSQL schema.
- 72 tasks with owners, statuses, priorities, due dates, success criteria, evidence requirements, and evidence rows.

### KYC And AI

- KYC extraction runs, five workstreams per run, drafts, citations, conflicts, missing fields, and approved immutable snapshots.
- AI Gateway run records with source context, labels, usage metadata, and affected records.

### Content, Escalations, Governance, Timeline, And Handover

- Content items and sent history with no email dispatch.
- Escalations, escalation updates, and escalation notifications.
- Governance events, decisions, actions, and citations.
- Timeline entries, editable-style comments, handover summaries, internal share tokens, and AI timeline search audit records.

### Notifications, Dashboards, Reports, And Workers

- 24 in-app notification records.
- Report definitions, report schedules, report runs.
- Digest schedule and digest run.
- Scheduled worker run history.

### Integrations And CSAT

- Integration sync runs and logs for Google Calendar, Fathom, AI Gateway, and CSAT.
- Fathom imported item records, mapping rules, and action item suggestions.
- Manual CSAT score records across accounts and engagements.

## Filters And Reports To Test

Use the seeded data to test:

- Account search by `[DEMO]` account names.
- Account filters by segment, region, lifecycle status, risk status, owner, and health.
- Engagement filters by status, stage, renewal date, billing model, delivery health, and account.
- KYC filters by status, confidence, completeness, stale/fresh status, conflicts, and missing fields.
- Stakeholder filters by sentiment, influence, decision role, and last-contact date.
- Opportunity filters by stage, value, close date, owner, and account.
- Signal filters by type, severity, status, owner, due date, and account.
- Task filters by status, priority, owner, due date, source type, account, and engagement.
- Governance filters by event type, status, cadence, account, date, and owner.
- Notification filters by read/unread, priority, trigger, account, and channel.
- Report and dashboard widgets for health, renewal, escalation, signal, CSAT, opportunity, and task summaries.
- Pagination on account, engagement, signal, task, notification, report, timeline, and integration-history lists.

## External Calls And Email Safety

The demo seeder does not instantiate or call provider adapters. It only inserts local records.

- Mailtrap is not used by this seeder.
- Email delivery services are not called.
- Google Calendar APIs are not called.
- Google Sign-In is not called.
- Fathom APIs and webhooks are not called.
- AI Gateway/LLM APIs are not called.
- CSAT third-party APIs are not called.

Seeded integration rows include metadata such as `external_api_called=false` so demo users can show integration screens without live provider dependency.

## Implementation Files

- Seeder service: `backend/app/services/demo_seed.py`
- CLI command: `backend/app/cli.py`
- Model compatibility mapping: `backend/app/models.py`
- Automated tests: `backend/tests/test_demo_seed.py`

## Test Coverage

Targeted tests cover:

- Demo users, accounts, engagements, tasks, signals, notifications, KYC, Fathom, AI, and CSAT sample data.
- Idempotency by running the seeder twice.
- No email queueing for seeded notifications.
- Production-environment blocking.
- Password hashing for seeded users.

Run tests:

```bash
docker compose exec backend python -m pytest tests/test_demo_seed.py -q
```

Verified locally:

```text
4 passed, 1 warning
```

The warning is an existing deprecation warning from `app/services/kyc.py` and is not caused by the demo seeder.

## Local Schema Notes

The local PostgreSQL database may contain older columns from previous feature branches. The seeder and model mapping account for the local task/task-evidence columns required by current services:

- `tasks.source_record_route`
- `tasks.evidence_json`
- `tasks.created_by_name`
- `task_evidence.metadata_json`

The local `playbook_executions` table may also include legacy required columns. The demo seeder uses a compatibility upsert for local PostgreSQL playbook execution rows.

Governance recurrence rules are not seeded because the local table shape may differ from the current ORM model. Standalone governance events, decisions, actions, and citations are seeded instead.
