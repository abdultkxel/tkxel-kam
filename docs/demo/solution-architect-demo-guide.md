# Solution Architect Demo Guide

Generated on 2026-06-03.

This guide explains how to demo the KAM Intelligence Platform end to end for a solution architect audience. It is designed for a local Docker-based demo using the currently implemented application. Application code was not modified to create this guide.

## Demo Preflight

### Local URLs

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8001/health`
- Backend OpenAPI: `http://127.0.0.1:8001/docs`
- PostgreSQL from host/DBeaver: `127.0.0.1:5433`

### Default Local Login

Use only if the local seed data is unchanged:

- Email: `admin@tkxel.com`
- Password: `Admin@12345`
- Role: `super_admin`

Seeded role users also exist with the default password `User@12345`, for example:

- `account.manager.user@tkxel.com`
- `kam.head.user@tkxel.com`
- `ops.lead.user@tkxel.com`
- `leadership.viewer.user@tkxel.com`

### Start And Verify The Stack

What to run:

```bash
docker compose up --build
curl -fsS http://127.0.0.1:8001/health
docker compose ps
```

What should happen:

- `db`, `backend`, and `frontend` containers should be running.
- Health endpoint should return `{"status":"ok","service":"kam-backend"}`.

Database tables to check:

- `users`
- `roles`
- `permissions`
- `role_permissions`
- `platform_settings`
- `integration_connections`

Logs to watch:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

Files/modules powering this behavior:

- `docker-compose.yml`
- `backend/app/main.py`
- `backend/app/database.py`
- `backend/app/services/seed.py`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`

## 1. Demo Objective

The objective is to show a complete strategic account-management lifecycle:

1. A user signs in and lands in an operational workspace.
2. An account and engagement are created or reviewed.
3. AI-assisted KYC, search, account briefs, and handoff workflows generate source-backed insight.
4. Governance, tasks, notifications, reports, and timeline entries preserve operational accountability.
5. Admin settings control users, RBAC, allowed domains, integrations, notifications, scoring, and audit.
6. Database and logs prove that the experience is server-backed, auditable, and not frontend-only.

Architectural point to emphasize:

- The platform is not a static dashboard. It is a workflow system with persisted records, RBAC, audit logs, notifications, local workers, and integration run logs.

## 2. System Architecture Summary

### What To Explain

- Frontend: React/Vite SPA using typed service calls and protected routes.
- Backend: FastAPI with routers, services, repositories, Pydantic validation, SQLAlchemy models, JWT auth, RBAC, and audit logging.
- Database: PostgreSQL, seeded locally through backend startup.
- Workers: in-process FastAPI background loops for retention, notifications/reporting, and integration sync.
- Integrations: Google Sign-In, Google Calendar, Fathom, manual CSAT, Mailtrap SMTP, and AI/LLM Gateway observability.

### Files/Modules

- Frontend: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/api.ts`
- Backend: `backend/app/main.py`, `backend/app/dependencies.py`, `backend/app/config.py`
- Database: `backend/app/models.py`, `backend/app/database.py`, `backend/migrations/*.sql`
- Services: `backend/app/services/*`
- Repositories: `backend/app/repositories/*`

### Data Flow To Explain

1. UI click calls a frontend service.
2. Frontend service calls `/api/*` with bearer token.
3. FastAPI dependency validates JWT and allowed email-domain policy.
4. Service enforces RBAC/account access.
5. Repository persists SQLAlchemy model records.
6. Service writes audit logs, timeline events, notifications, or integration logs.
7. UI refreshes from API response.

## 3. Main User Roles

| Role | Demo Purpose | Example Local User |
| --- | --- | --- |
| `super_admin` | Full platform setup, users, RBAC, integrations, audit | `admin@tkxel.com` |
| `admin` | Admin settings, users, configuration | `admin.user@tkxel.com` |
| `account_manager` | Account owner workflow, tasks, KYC, governance | `account.manager.user@tkxel.com` |
| `kam_head` | Portfolio oversight, approvals, reporting, configuration | `kam.head.user@tkxel.com` |
| `ops_lead` | Delivery/governance/task collaboration | `ops.lead.user@tkxel.com` |
| `leadership_viewer` | Executive dashboard and read-only visibility | `leadership.viewer.user@tkxel.com` |
| `content_specialist` | Content catalog and client education | `content.specialist.user@tkxel.com` |
| `commercial_stakeholder` | Commercial/growth/renewal participation | `commercial.stakeholder.user@tkxel.com` |
| `delivery_stakeholder` | Delivery health/escalation participation | `delivery.stakeholder.user@tkxel.com` |

Database tables:

- `users`
- `roles`
- `permissions`
- `role_permissions`
- `audit_logs`

Files/modules:

- `backend/app/rbac.py`
- `backend/app/services/rbac.py`
- `backend/app/services/seed.py`
- `backend/app/routers/admin.py`
- `frontend/src/components/admin/AdminUsersPanel.tsx`
- `frontend/src/components/admin/AdminRolesPanel.tsx`

## 4. End-To-End User Journey

Use this as the primary demo path.

### Step 1: Sign In

What to click:

- Open `http://127.0.0.1:5173`.
- On Login, enter email/password.
- Click `Sign in`.

What data to enter:

- Email: `admin@tkxel.com`
- Password: `Admin@12345`

What should happen:

- User is redirected to Dashboard.
- JWT is stored by the frontend auth context.
- Dashboard widgets load via backend APIs.

Database tables that should change:

- Normally no new row for login.
- Password reset/change flows can update `password_reset_tokens`.
- Audit is not consistently written for every login; auth state is primarily JWT based.

Logs that should appear:

- Backend access logs for `/api/auth/login`, `/api/auth/me`, and dashboard endpoints.
- Frontend dev server logs only if a build/runtime error occurs.

Files/modules:

- `frontend/src/pages/Login.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `backend/app/routers/auth.py`
- `backend/app/services/auth.py`
- `backend/app/security.py`
- `backend/app/dependencies.py`

### Step 2: Review Dashboard And Portfolio Signals

What to click:

- Click `Dashboard` in the sidebar.
- Switch any visible dashboard mode/cards if available.
- Open a high-risk or stale account card if shown.

What data to enter:

- None.

What should happen:

- AM/KAM Head/Leadership dashboard widgets show accounts, risks, tasks, opportunities, stale KYC, escalations, governance, and AI task summary depending on role.

Database tables that should be read:

- `accounts`
- `account_owners`
- `kyc_snapshots`
- `signals`
- `tasks`
- `escalations`
- `opportunities`
- `governance_events`

Logs that should appear:

- Backend GET requests for dashboard endpoints.

Files/modules:

- `frontend/src/pages/Dashboard.tsx`
- `backend/app/routers/dashboards.py`
- `backend/app/repositories/dashboards.py`
- `backend/app/services/notifications.py`

### Step 3: Open Account Workspace

What to click:

- Click `Accounts`.
- Search or select an account.
- Open the account detail page.

What data to enter:

- Search term: a visible seeded/demo account name, or create a new account in the next step.

What should happen:

- Account 360 opens with tabs for Overview, Engagements, Stakeholders, Planning, Growth, Renewal, Retention, KYC, Health, Stage, Opportunities, Education, Escalation, Governance, Notes, Timeline, and Documents.

Database tables that should be read:

- `accounts`
- `account_owners`
- `engagements`
- `stakeholders`
- `opportunities`
- `timeline_entries`
- `source_documents`
- `kyc_drafts`
- `kyc_snapshots`

Logs that should appear:

- Backend GET requests under `/api/accounts`.

Files/modules:

- `frontend/src/pages/Accounts.tsx`
- `frontend/src/pages/AccountDetail.tsx`
- `frontend/src/components/account/Account360.tsx`
- `backend/app/routers/accounts.py`
- `backend/app/services/accounts.py`
- `backend/app/repositories/accounts.py`

## 5. Account / Workspace / Engagement Flow

### Step 1: Create An Account Onboarding Draft

What to click:

- Go to `Accounts`.
- Click `Create account`.
- Fill the form.
- Click `Create draft`.

What data to enter:

- Account name: `Demo Strategic Account 2026`
- Project name: `Platform Modernization Program`
- Company URL: `https://demo-strategic-account.example.com`
- Manager name: `Demo Account Manager`
- Manager email: `account.manager.user@tkxel.com`
- Custom fields: choose any visible values, for example `Customer Tier = Gold` if shown.

What should happen:

- A draft is created for review instead of immediately becoming an official account.
- Validation errors should appear beside fields if invalid.
- If approval is available in the flow, approving the draft creates official account and engagement records.

Database tables that should change:

- Draft creation:
  - `onboarding_drafts`
  - `onboarding_draft_engagements`
  - `custom_field_values` if custom fields are entered
  - `audit_logs`
- Approval:
  - `accounts`
  - `account_owners`
  - `account_ownership_history`
  - `engagements`
  - `timeline_entries`
  - `audit_logs`

Logs that should appear:

- Backend POST requests to onboarding/account endpoints.
- Validation failures appear as 422 responses.

Files/modules:

- `frontend/src/components/account/CreateAccountDialog.tsx`
- `frontend/src/services/accountWorkspace.ts`
- `backend/app/routers/onboarding.py`
- `backend/app/routers/accounts.py`
- `backend/app/services/onboarding.py`
- `backend/app/services/accounts.py`
- `backend/app/services/audit.py`

### Step 2: Create Or Update Engagement/SOW

What to click:

- Open the account.
- Click `Engagements`.
- Click `Add engagement` or edit an existing engagement.
- Save.

What data to enter:

- Engagement name: `Cloud Delivery Pod`
- Status: `active`
- Service lines: `Cloud & DevOps`, `Product Engineering`
- Start date: current date
- End date: a future date
- Renewal date: 60-90 days before end date
- Notice deadline: 30-45 days before renewal date
- Delivery status: `active` or `watch`
- Commercial status: `healthy` or `watch`
- Health status: `green` or `amber`

What should happen:

- Engagement is persisted.
- Renewal and delivery fields appear in account workspace.
- Timeline and audit records are written.

Database tables that should change:

- `engagements`
- `engagement_health_snapshots` when health changes are captured
- `account_health_rollups` if rollups recalculate
- `timeline_entries`
- `audit_logs`

Logs that should appear:

- Backend POST/PATCH requests under `/api/accounts/{account_id}/engagements` or `/api/engagements/{engagement_id}`.

Files/modules:

- `frontend/src/components/account/EngagementsPanel.tsx`
- `frontend/src/components/account/EngagementFormDialog.tsx`
- `frontend/src/hooks/useEngagements.ts`
- `backend/app/routers/engagements.py`
- `backend/app/services/engagements.py`
- `backend/app/services/engagement_health_rollup.py`

### Step 3: Add Stakeholder Context

What to click:

- Open account.
- Click `Stakeholders`.
- Click add/create stakeholder.
- Save stakeholder and optionally add an interaction.

What data to enter:

- Name: `Ayesha Sponsor`
- Role: `executive_sponsor`
- Email: `ayesha.sponsor@example.com`
- Influence: `high`
- Sentiment: `positive`
- Political risk: `low`
- Interaction note: `Executive sponsor aligned on QBR outcomes.`

What should happen:

- Stakeholder appears in stakeholder map.
- Coverage gaps recalculate.
- Timeline/audit entries are created for meaningful changes.

Database tables that should change:

- `stakeholders`
- `stakeholder_interactions`
- `stakeholder_coverage_gaps`
- `timeline_entries`
- `audit_logs`

Logs that should appear:

- Backend requests to stakeholder endpoints.

Files/modules:

- `frontend/src/components/account/StakeholderTab.tsx`
- `frontend/src/components/account/StakeholderFormDrawer.tsx`
- `backend/app/routers/stakeholders.py`
- `backend/app/services/stakeholders.py`
- `backend/app/repositories/stakeholders.py`

### Step 4: Create Opportunity And Task

What to click:

- Open account.
- Click `Opportunities`.
- Create a new opportunity.
- Then open `Tasks` and create or update a related task.

What data to enter:

- Opportunity name: `Cloud Optimization Expansion`
- Type: `upsell` or `expansion`
- Stage: `identified`
- Value: `75000`
- Currency: `USD`
- Target date: a future date
- Task title: `Prepare expansion discovery plan`
- Task priority: `high`
- Owner: current account manager

What should happen:

- Opportunity appears in account workspace and opportunity board.
- Task appears in task list.
- Audit and timeline entries preserve activity history.

Database tables that should change:

- `opportunities`
- `opportunity_stage_history`
- `opportunity_action_items` if action items are created
- `tasks`
- `task_evidence` if evidence is added
- `timeline_entries`
- `audit_logs`

Logs that should appear:

- Backend POST/PATCH requests to `/api/opportunities` and `/api/tasks`.

Files/modules:

- `frontend/src/pages/Opportunities.tsx`
- `frontend/src/pages/Tasks.tsx`
- `frontend/src/services/opportunities.ts`
- `frontend/src/services/playbooksTasks.ts`
- `backend/app/routers/opportunities.py`
- `backend/app/services/opportunities.py`
- `backend/app/routers/tasks.py`
- `backend/app/services/playbooks_tasks.py`

## 6. AI Modules Demo Flow

### Step 1: KAM AI Search

What to click:

- Click the AI launcher or press `Cmd/Ctrl + K`.
- Enter a query.
- Submit search.

What data to enter:

- Query: `What are the top renewal risks and next actions for my accounts?`
- Scopes: leave `Timeline`, `Opportunities`, `Governance`, `Notes`, and `KYC` selected if visible.

What should happen:

- AI panel returns an advisory answer with citations/source entries.
- Query history/run is persisted.

Database tables that should change:

- `ai_gateway_runs`
- `audit_logs`

Logs that should appear:

- Backend POST to `/api/ai/search`.

Files/modules:

- `frontend/src/components/ai/KAMAIPanel.tsx`
- `frontend/src/services/aiAssistance.ts`
- `backend/app/routers/ai.py`
- `backend/app/services/ai_assistance.py`
- `backend/app/services/integrations.py`

### Step 2: AI KYC Workstreams

What to click:

- Open an account.
- Click `KYC`.
- Click `Start AI data refresh`, `Refresh AI Data`, or `Create KYC draft` depending on the visible state.
- Review workstreams.
- Save edits and approve KYC if a draft is ready.

What data to enter:

- Optional edit: update `Company snapshot` with `Demo account is expanding governance and cloud modernization scope.`
- Approval change summary: `Approved demo KYC after source-backed review.`

What should happen:

- Five KYC workstreams run or refresh.
- Draft fields, citations, confidence, completeness, missing fields, and conflicts are shown.
- Approved KYC creates an immutable snapshot.

Database tables that should change:

- `kyc_agent_runs`
- `kyc_workstream_outputs`
- `kyc_drafts`
- `kyc_snapshots`
- `ai_gateway_runs`
- `timeline_entries`
- `audit_logs`

Logs that should appear:

- Backend POST to `/api/accounts/{account_id}/kyc/agent-runs` or `/api/accounts/{account_id}/kyc/drafts`.
- Backend PATCH/POST for draft update/approve.

Files/modules:

- `frontend/src/components/account/KYCAgentOverview.tsx`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/services/kyc.ts`
- `backend/app/routers/kyc.py`
- `backend/app/services/kyc.py`
- `backend/app/services/kyc_gateway.py`

### Step 3: Account AI Brief, Stage Prediction, Forecast, Handoff

What to click:

- Open an account.
- Use visible AI actions/cards for account brief, stage prediction, forecast, or handoff.
- If using API directly, call the endpoints from Swagger.

What data to enter:

- Handoff focus: `Renewal risk, executive governance, and expansion pipeline.`
- Forecast months: `6`

What should happen:

- AI-generated advisory outputs include citations and disclaimers.
- Human-confirmed stage changes write official lifecycle updates only after explicit action.

Database tables that should change:

- `ai_gateway_runs`
- `accounts` only if a human-confirmed stage change is applied
- `timeline_entries` if notes or stage changes are created
- `notification_records` if stage-change notifications are queued
- `audit_logs`

Logs that should appear:

- Backend POST to `/api/accounts/{account_id}/ai/brief`
- Backend POST to `/api/accounts/{account_id}/ai/stage-prediction`
- Backend POST to `/api/ai/forecast`
- Backend POST to `/api/accounts/{account_id}/ai/handoff`

Files/modules:

- `backend/app/routers/ai.py`
- `backend/app/services/ai_assistance.py`
- `frontend/src/components/ai/AIBriefCard.tsx`
- `frontend/src/components/account/Account360.tsx`

### Step 4: Timeline AI Search

What to click:

- Open an account.
- Open `Timeline`.
- Use the Timeline AI Search component.

What data to enter:

- Query: `Show escalation, delivery delay, and governance decisions for the last quarter.`

What should happen:

- Timeline search returns source-backed matching events/documents.
- Search is audited.

Database tables that should change:

- `timeline_ai_search_audits`
- `ai_gateway_runs`
- `audit_logs`

Logs that should appear:

- Backend POST to `/api/accounts/{account_id}/timeline/ai-search`.

Files/modules:

- `frontend/src/components/ai/TimelineAISearch.tsx`
- `backend/app/routers/timeline.py`
- `backend/app/services/timeline.py`

## 7. Fathom Integration Demo Flow

Current local readiness:

- Fathom API key and webhook secret are configured in the running backend.
- Live external sync still depends on Fathom API availability and response compatibility.

### Step 1: Show Fathom Configuration

What to click:

- Go to `Admin`.
- Click `Integrations`.
- Select `Fathom`.

What data to enter:

- Do not expose secret values during the demo.
- Confirm fields exist for base URL, meetings path, API key, webhook secret, auto-approve, transcript, and CRM match options.

What should happen:

- Fathom connection card and configuration drawer appear.
- Credentials are masked in responses.

Database tables that should change:

- No change unless saving configuration.
- Saving changes updates `integration_connections`.
- Audit logs update in `audit_logs`.

Logs that should appear:

- Backend GET `/api/admin/integrations`.
- Backend PATCH `/api/admin/integrations/fathom` if saved.

Files/modules:

- `frontend/src/components/admin/IntegrationsPanel.tsx`
- `frontend/src/services/integrations.ts`
- `backend/app/routers/governance.py`
- `backend/app/services/integrations.py`

### Step 2: Test Or Sync Fathom

What to click:

- In Fathom integration drawer, click `Test`.
- Then click sync if visible, or use API `POST /api/admin/integrations/fathom/sync`.

What data to enter:

- None if API key is already configured.

What should happen:

- Test passes if Fathom responds with expected records.
- Sync stores imported meeting items.
- Action items become task suggestions.
- Failures are logged with failure count/backoff.

Database tables that should change:

- `integration_sync_runs`
- `integration_sync_logs`
- `integration_imported_items`
- `fathom_task_suggestions`
- `audit_logs`
- `notification_records` if repeated failure alert threshold is reached

Logs that should appear:

- Backend integration test/sync logs.
- On failure, log message for provider failure/backoff.

Files/modules:

- `backend/app/services/integrations.py`
- `backend/app/repositories/integrations.py`
- `backend/app/routers/integrations.py`
- `backend/app/routers/governance.py`

### Step 3: Approve Fathom Summary And Task Suggestion

What to click:

- Open imported Fathom item/review queue if visible.
- Approve or reject a summary.
- Open Fathom task suggestions.
- Approve a suggestion.

What data to enter:

- Map to account if required.
- Review note: `Approved for demo; action item is valid.`

What should happen:

- Approved summary creates timeline event.
- Approved task suggestion creates a task for current user.
- Rejected items stay auditable.

Database tables that should change:

- `integration_imported_items`
- `fathom_task_suggestions`
- `tasks`
- `timeline_entries`
- `audit_logs`

Logs that should appear:

- Backend POST to Fathom item approve/reject routes.
- Backend POST to task suggestion approve/reject routes.

Files/modules:

- `backend/app/services/integrations.py`
- `backend/app/routers/integrations.py`
- `backend/app/services/playbooks_tasks.py`
- `frontend/src/components/admin/IntegrationsPanel.tsx`

## 8. Google Sign-In Demo Flow

Current local readiness:

- Frontend has `VITE_GOOGLE_SIGN_IN_CLIENT_ID`.
- Running Docker backend currently lacks `GOOGLE_SIGN_IN_CLIENT_ID` because root `.env` does not define it.
- Add the backend client ID to root `.env` and restart Docker before a live Google Sign-In demo.

### Step 1: Confirm Configuration

What to click:

- Open Login page.
- Confirm Google button appears.

What data to enter:

- None.

What should happen:

- Google Identity Services button renders if frontend client ID is configured.
- Backend will only accept the credential if its own `GOOGLE_SIGN_IN_CLIENT_ID` is configured and matches.

Database tables that should change:

- No table changes on successful Google Sign-In.
- Existing `users` row is read.

Logs that should appear:

- Frontend loads `https://accounts.google.com/gsi/client`.
- Backend POST `/api/auth/google`.

Files/modules:

- `frontend/src/pages/Login.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `backend/app/routers/auth.py`
- `backend/app/services/auth.py`
- `backend/app/services/google_identity.py`

### Step 2: Sign In With Google

What to click:

- Click Google Sign-In button.
- Choose a Google account.

What data to enter:

- Use an existing active local user email on an allowed domain, for example a Tkxel domain account that also exists in `users`.

What should happen:

- Backend verifies ID token audience.
- Backend blocks unknown users.
- Backend blocks disallowed domains.
- Existing active allowed user receives a JWT and enters the app.

Database tables that should change:

- No new user row should be created.
- `users` is read.
- `platform_settings` is read for allowed domains.

Logs that should appear:

- Backend POST `/api/auth/google`.
- Failure detail if backend client ID is missing, token invalid, user missing, user inactive, or domain disallowed.

Files/modules:

- `backend/app/services/google_identity.py`
- `backend/app/services/email_domains.py`
- `backend/app/services/auth.py`
- `backend/tests/test_allowed_email_domains.py`

## 9. Email / Mailtrap Demo Flow

Current local readiness:

- Running backend reports Mailtrap SMTP settings configured and `MAIL_ENABLED=true`.
- Live Mailtrap inbox delivery should be verified during demo rehearsal.

### Step 1: Trigger Password Reset Email

What to click:

- Go to Login.
- Click `Reset password`.
- Enter a known user email.
- Submit.

What data to enter:

- Email: `admin@tkxel.com` or another active seeded user.

What should happen:

- Backend creates a password reset token record.
- Backend sends a Mailtrap email using SMTP.
- Mail appears in Mailtrap inbox.

Database tables that should change:

- `password_reset_tokens`
- Possibly `audit_logs` depending on auth flow coverage

Logs that should appear:

- Backend POST `/api/auth/forgot-password`.
- SMTP send log if logging is enabled.
- Errors if SMTP fails.

Files/modules:

- `frontend/src/pages/ResetPassword.tsx`
- `backend/app/routers/auth.py`
- `backend/app/services/auth.py`
- `backend/app/services/email_delivery.py`

### Step 2: Trigger Notification/Report Email

What to click:

- Go to `Reports`.
- Create or open a saved report.
- Export report or schedule/send report if available.
- Alternatively configure notification preference to `In-app + Email` and trigger a notification.

What data to enter:

- Report name: `Demo Account Risk Report`
- Data source: `accounts` or `tasks`
- Export format: `csv` or `pdf`
- Recipient: current admin or KAM user

What should happen:

- Report run is created.
- Email is sent through Mailtrap when delivery channel includes email.
- Notification/report delivery metadata is stored.

Database tables that should change:

- `report_definitions`
- `report_runs`
- `report_schedules` if scheduled
- `notification_records` for notification paths
- `audit_logs`

Logs that should appear:

- Backend POST `/api/reports`
- Backend POST `/api/reports/{report_id}/export`
- SMTP delivery attempt metadata

Files/modules:

- `frontend/src/pages/Reports.tsx`
- `backend/app/routers/reports.py`
- `backend/app/services/reports.py`
- `backend/app/services/email_delivery.py`
- `backend/app/services/notifications.py`

## 10. Queue / Job Demo Flow

### Step 1: Show Worker Health And Job Logs

What to click:

- Go to `Admin`.
- Click `Audit log`.
- Open system health, job logs, or error logs area.

What data to enter:

- Filter job type if available: `sla_evaluation`, `digest_generation`, `report_schedule`, or integration sync.

What should happen:

- System health should show database/email/workers/notifications/integrations status.
- Job logs show scheduled/manual worker outcomes when jobs have run.

Database tables that should be read:

- `scheduled_worker_runs`
- `notification_records`
- `integration_connections`
- `audit_logs`
- `access_logs`

Logs that should appear:

- Backend GET `/api/admin/system-health`
- Backend GET `/api/admin/job-logs`
- Backend GET `/api/admin/error-logs`

Files/modules:

- `frontend/src/components/admin/AdminAuditPanel.tsx`
- `backend/app/routers/admin_security.py`
- `backend/app/services/admin_security.py`
- `backend/app/main.py`

### Step 2: Run SLA Evaluation

What to click:

- From Swagger or UI action if available, run `POST /api/sla/jobs/evaluate`.

What data to enter:

- No body required for default evaluation.

What should happen:

- SLA evaluator checks active rules against signals, tasks, KYC, and escalations.
- Escalated items and notifications are created if thresholds are breached.
- A worker run is persisted.

Database tables that should change:

- `scheduled_worker_runs`
- `sla_escalated_items`
- `notification_records`
- `audit_logs`

Logs that should appear:

- Backend POST `/api/sla/jobs/evaluate`.
- Worker result details in backend logs if info logging is visible.

Files/modules:

- `backend/app/routers/notifications.py`
- `backend/app/services/notifications.py`
- `backend/app/repositories/notifications.py`

### Step 3: Run Integration Sync Job

What to click:

- Go to Admin > Integrations.
- Click Sync for a provider if visible, or use Swagger `POST /api/admin/integrations/{provider}/sync`.

What data to enter:

- Provider: `fathom`, `google_calendar`, or `ai_llm_gateway`.

What should happen:

- Sync run is persisted.
- Success or configuration-required failure is logged.
- Repeated failures can queue admin alerts.

Database tables that should change:

- `integration_sync_runs`
- `integration_sync_logs`
- `integration_imported_items` for providers that return records
- `notification_records` after repeated failure threshold
- `audit_logs`

Logs that should appear:

- Backend POST `/api/admin/integrations/{provider}/sync`.
- Integration failure warning if provider config is missing.

Files/modules:

- `backend/app/routers/governance.py`
- `backend/app/routers/integrations.py`
- `backend/app/services/integrations.py`

## 11. Admin Settings Demo Flow

### Step 1: Allowed Email Domains

What to click:

- Go to `Admin`.
- Open `Settings`.
- Find Allowed Email Domains.
- Edit and save.

What data to enter:

- `tkxel.com, tkxel.io, camp1.tkxel.com, camp1.tkxel.io`

What should happen:

- Domains are trimmed, lowercased, deduplicated, and saved.
- Invalid domains are rejected.
- Existing users on now-disallowed domains cannot log in after removal.

Database tables that should change:

- `platform_settings`
- `audit_logs`

Logs that should appear:

- Backend PATCH `/api/admin/settings/allowed-email-domains`.

Files/modules:

- `frontend/src/components/admin/AllowedEmailDomainsPanel.tsx`
- `backend/app/routers/admin.py`
- `backend/app/services/email_domains.py`

### Step 2: Users And RBAC

What to click:

- Go to `Admin`.
- Click `Users`.
- Create or edit a user.
- Click `Roles`.
- Review role permissions.

What data to enter:

- User email: `demo.kam.user@tkxel.com`
- Full name: `Demo KAM User`
- Role: `account_manager`
- Primary Google Calendar ID: `demo.kam.user@tkxel.com`
- Password: use a strong demo password if creating a user

What should happen:

- User is created only if email domain is allowed.
- Role and permission model determines available backend actions.
- User-created email may be sent if mail is enabled.

Database tables that should change:

- `users`
- `roles` if custom role is created
- `role_permissions` if permissions are edited
- `audit_logs`

Logs that should appear:

- Backend POST/PATCH `/api/admin/users`.
- Backend GET/PATCH `/api/admin/roles`.
- SMTP attempt for `user_created` email if configured.

Files/modules:

- `frontend/src/components/admin/AdminUsersPanel.tsx`
- `frontend/src/components/admin/AdminRolesPanel.tsx`
- `backend/app/routers/admin.py`
- `backend/app/services/user_management.py`
- `backend/app/services/rbac.py`

### Step 3: Integrations And Security Alert Email

What to click:

- Go to `Admin`.
- Click `Integrations`.
- Update security/admin alert email.
- Open provider config drawers.

What data to enter:

- Administration alert email: `abdul.rehman@tkxel.io` or another valid admin inbox.
- Do not show secret values live.

What should happen:

- Security alert email setting is saved.
- Integration credentials remain masked in responses.

Database tables that should change:

- `platform_settings`
- `integration_connections`
- `audit_logs`

Logs that should appear:

- Backend PATCH `/api/admin/settings/security-alert-email`.
- Backend PATCH `/api/admin/integrations/{provider}` if provider config is changed.

Files/modules:

- `frontend/src/components/admin/IntegrationsPanel.tsx`
- `backend/app/routers/integrations.py`
- `backend/app/services/integrations.py`
- `backend/app/services/secret_encryption.py`

### Step 4: Notification, SLA, Timeline, Scoring, Field Builder

What to click:

- In Admin, open:
  - `Settings` or notifications/reporting panel
  - `Timeline`
  - `Scoring`
  - `Field builder`
  - `Audit log`

What data to enter:

- SLA rule name: `Demo critical task inactivity`
- Inactivity minutes: `60`
- Timeline event type: `Demo executive checkpoint`
- Custom field label: `Demo Account Tier`
- Field key: `demo_account_tier`

What should happen:

- Admin changes persist and are auditable.
- Custom fields appear in configured runtime forms.
- Scoring/timeline changes affect future records.

Database tables that should change:

- `notification_trigger_configs`
- `sla_rules`
- `timeline_event_types`
- `custom_field_definitions`
- `scoring_metric_definitions`
- `scoring_metric_versions`
- `audit_logs`

Logs that should appear:

- Backend admin endpoint POST/PATCH calls.

Files/modules:

- `frontend/src/components/admin/AdminNotificationsReportingPanel.tsx`
- `frontend/src/components/admin/ScoringEngineBuilder.tsx`
- `frontend/src/components/admin/AdminFieldBuilderPanel.tsx`
- `frontend/src/pages/Admin.tsx`
- `backend/app/routers/notifications.py`
- `backend/app/routers/timeline.py`
- `backend/app/routers/scoring.py`
- `backend/app/routers/custom_fields.py`

## 12. Database Verification Steps Using PostgreSQL / DBeaver

### DBeaver Connection

Create a PostgreSQL connection:

- Host: `127.0.0.1`
- Port: `5433`
- Database: `kam_intelligence`
- Username: `kam_app`
- Password: `kam_app_password`

If connecting from another container on the Docker network:

- Host: `db`
- Port: `5432`

### Verification Queries

Use these after each demo action.

Accounts and engagements:

```sql
select id, name, lifecycle_status, risk_status, created_at
from accounts
order by created_at desc
limit 10;

select id, account_id, name, status, renewal_date, notice_deadline, created_at
from engagements
order by created_at desc
limit 10;
```

Onboarding:

```sql
select id, account_name, status, created_at, approved_at
from onboarding_drafts
order by created_at desc
limit 10;
```

KYC and AI:

```sql
select id, account_id, status, trigger_source, confidence, completeness, created_at
from kyc_agent_runs
order by created_at desc
limit 10;

select id, account_id, status, confidence, completeness, updated_at
from kyc_drafts
order by updated_at desc
limit 10;

select id, account_id, version, confidence, completeness, approved_at
from kyc_snapshots
order by approved_at desc
limit 10;

select id, request_type, status, actor_name, account_id, created_at
from ai_gateway_runs
order by created_at desc
limit 20;
```

Tasks, signals, opportunities:

```sql
select id, title, status, priority, owner_name, account_id, created_at
from tasks
order by created_at desc
limit 20;

select id, title, signal_type, severity, status, account_id, created_at
from signals
order by created_at desc
limit 20;

select id, name, stage, value, owner_name, account_id, created_at
from opportunities
order by created_at desc
limit 20;
```

Fathom and integrations:

```sql
select provider, status, enabled, last_test_status, last_synced_at, failure_count, last_error
from integration_connections
order by provider;

select id, provider, trigger_type, status, message, created_at, finished_at
from integration_sync_runs
order by created_at desc
limit 20;

select id, provider, action, status, message, created_at
from integration_sync_logs
order by created_at desc
limit 20;

select id, provider, title, mapping_status, review_status, account_id, created_at
from integration_imported_items
order by created_at desc
limit 20;

select id, title, status, account_id, created_task_id, created_at
from fathom_task_suggestions
order by created_at desc
limit 20;
```

Email/notifications/jobs/audit:

```sql
select id, trigger, title, recipient_email, delivery_status, email_queued, created_at
from notification_records
order by created_at desc
limit 20;

select id, job_type, mode, status, matched_count, affected_count, error_message, created_at
from scheduled_worker_runs
order by created_at desc
limit 20;

select id, module, action, entity_type, actor_name, created_at
from audit_logs
order by created_at desc
limit 30;

select id, module, entity_type, decision, actor_name, created_at
from access_logs
order by created_at desc
limit 30;
```

## 13. Logs / Terminal Commands To Watch During Demo

### Watch Containers

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

Expected backend log patterns:

- `GET /health`
- `POST /api/auth/login`
- `GET /api/accounts`
- `POST /api/accounts/.../kyc/...`
- `POST /api/ai/search`
- `POST /api/admin/integrations/{provider}/sync`
- Worker messages for retention, notifications/reporting, or integrations when jobs run.

### Confirm Runtime Settings Without Printing Secrets

```bash
docker compose exec -T backend python - <<'PY'
from app.config import get_settings
s = get_settings()
print("mail_enabled", s.mail_enabled)
print("mail_host_configured", bool(s.mail_host))
print("google_sign_in_configured", bool(s.google_sign_in_client_id))
print("google_calendar_configured", bool(s.google_calendar_client_id and s.google_calendar_client_secret))
print("fathom_configured", bool(s.fathom_api_key and s.fathom_webhook_secret))
print("workers", s.timeline_retention_worker_enabled, s.notifications_reporting_worker_enabled, s.integrations_worker_enabled)
PY
```

### Quick API Smoke Test

```bash
curl -fsS http://127.0.0.1:8001/health
```

Optional login token check:

```bash
curl -sS -X POST http://127.0.0.1:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tkxel.com","password":"Admin@12345"}'
```

Do not paste returned JWTs into public chat or screenshots.

## 14. Known Limitations

- Background work is implemented as local FastAPI in-process workers, not a durable distributed queue.
- There is no OS cron, Celery beat, Kubernetes CronJob, or external scheduler in the repo.
- AI modules are deterministic/source-backed advisory workflows unless a real AI/LLM Gateway is configured later.
- Full semantic/vector document search is not implemented.
- Fathom API sync depends on live API availability and expected response schema.
- Fathom webhook live delivery requires a public tunnel or reachable backend URL.
- Google Sign-In code is implemented, but current Docker backend needs `GOOGLE_SIGN_IN_CLIENT_ID` added to root `.env` before live demo.
- Google Calendar OAuth/write needs `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`; current backend env has those empty.
- `frontend/.env.example` and `backend/.env.example` reference port `8002` in places, while Docker local backend runs on `8001`.
- Email sending is synchronous SMTP and does not have durable outbox/retry.
- Runtime database schema reconciliation is used alongside SQL migrations; production should move to strict migration execution.
- Some frontend fallback/mock data paths remain and should be avoided during production-facing demo unless explicitly positioned as fallback.

## 15. Backup Plan If Integrations Fail Live

### If Google Sign-In Fails

Use email/password login:

- Email: `admin@tkxel.com`
- Password: `Admin@12345`

Explain:

- Google Sign-In requires backend and frontend client IDs to match and authorized local origins.
- The backend enforces existing active local user and allowed-domain checks.

Show instead:

- `frontend/src/pages/Login.tsx`
- `backend/app/services/google_identity.py`
- `backend/app/services/auth.py`
- `backend/tests/test_allowed_email_domains.py`

Database proof:

- `users`
- `platform_settings`

### If Fathom Sync Fails

Show:

- Admin > Integrations > Fathom configuration.
- Integration sync logs.
- Failure count/backoff and admin alert behavior.

Then demo source-backed workflow using internal records:

- Create a task manually from `Tasks`.
- Add a timeline note.
- Show how an approved Fathom item would write to `timeline_entries` and `tasks`.

Database proof:

- `integration_connections`
- `integration_sync_runs`
- `integration_sync_logs`
- `notification_records`
- `tasks`
- `timeline_entries`

Files/modules:

- `backend/app/services/integrations.py`
- `backend/app/routers/integrations.py`
- `frontend/src/components/admin/IntegrationsPanel.tsx`

### If Mailtrap Email Fails

Show:

- Mail settings presence without showing secrets.
- Email templates in `backend/app/services/email_delivery.py`.
- Notification/report/password-reset records.

Then demo:

- In-app notifications from Notification Center.
- Report run creation.

Database proof:

- `password_reset_tokens`
- `notification_records`
- `report_runs`
- `audit_logs`

### If AI Output Looks Sparse

Create more source data first:

- Add an engagement.
- Add a stakeholder interaction.
- Create an opportunity.
- Add a timeline note.
- Create or approve KYC.

Then rerun:

- KAM AI search
- Account brief
- Timeline AI search
- Handoff brief

Database proof:

- `timeline_entries`
- `opportunities`
- `kyc_snapshots`
- `ai_gateway_runs`

### If Workers Do Not Show New Runs

Use manual triggers:

- `POST /api/sla/jobs/evaluate`
- `POST /api/admin/integrations/{provider}/sync`
- Admin retention policy manual run if a policy exists.

Then check:

- `scheduled_worker_runs`
- `integration_sync_runs`
- `integration_sync_logs`
- `sla_escalated_items`
- `notification_records`

## Suggested Demo Narrative

Use this closing narrative for the architect:

1. "This is an operational account workspace, not just a dashboard."
2. "Every business action is persisted, permissioned, and auditable."
3. "AI is advisory and source-backed; official mutations need human confirmation."
4. "Integrations feed review queues before creating business records."
5. "Admin controls define the rules: users, RBAC, allowed domains, integrations, notifications, scoring, timeline, and audit."
6. "The current demo is pre-prod ready in structure, with production hardening still needed for durable queues, strict migrations, real AI gateway generation, and deployment-grade secrets."
