# Application Architecture Audit

Generated on 2026-06-03.

This audit reviews the current repository implementation only. It does not modify application code. Evidence was gathered from `/specs`, `/requirements`, `/docs`, backend source, frontend source, tests, Docker configuration, and environment examples.

## 1. High-Level Application Architecture

### What Was Implemented

The KAM Intelligence Platform is implemented as a two-tier web application:

- A React/Vite single-page frontend served locally from port `5173`.
- A FastAPI backend API served locally from port `8001`.
- A PostgreSQL database, normally provided by Docker Compose on host port `5433`.
- Domain modules are exposed as FastAPI routers, with business logic placed in service classes and database persistence placed in repository classes.
- Startup initializes database tables, seeds default data, and optionally starts local in-process scheduled workers.

### Where It Is Implemented

- Frontend app entry and routing: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Frontend layout shell: `frontend/src/components/layout/AppShell.tsx`
- Backend app startup and router registration: `backend/app/main.py`
- Backend config: `backend/app/config.py`
- Backend DB session and schema reconciliation: `backend/app/database.py`
- Backend data models and schemas: `backend/app/models.py`, `backend/app/schemas.py`
- Backend service/repository layers: `backend/app/services/*`, `backend/app/repositories/*`
- Local orchestration: `docker-compose.yml`

### Important Files, Classes, and Functions

- `app.main.lifespan()` starts `init_db()`, `seed_default_data()`, and local worker loops.
- `app.database.init_db()` creates and reconciles database tables.
- `app.services.seed.seed_default_data()` seeds roles, users, allowed domains, integrations, KYC config, scoring, timeline, and notifications.
- `frontend/src/services/api.ts` centralizes authenticated API calls.

### Data Flow

Browser routes render React pages and components. Pages call typed frontend service functions, which call FastAPI endpoints through `apiRequest()`. Backend routers validate request payloads with Pydantic schemas, delegate business rules to services, and services use repositories to read or persist SQLAlchemy models. Domain services also write audit logs, timeline entries, notifications, and integration sync logs where applicable.

### Missing or Incomplete Implementation

- `backend/app/models.py` and `backend/app/schemas.py` are very large monoliths. This is workable for demo/pre-prod but harder to review for production architecture.
- Database lifecycle mixes SQL migration files under `backend/migrations` with runtime `Base.metadata.create_all()` and schema reconciliation in `backend/app/database.py`; production should use a stricter migration runner.
- Router ownership is slightly split: integration list/update/sync routes are in `backend/app/routers/governance.py`, while most integration operations are in `backend/app/routers/integrations.py`. Functional coverage exists, but the organization is harder to reason about.
- Background work is local/in-process, not a durable distributed job queue.

## 2. Frontend Framework and Structure

### What Was Implemented

The frontend uses React 18, TypeScript, Vite, React Router, Tailwind CSS, Radix primitives, Zustand-like stores, and a service layer for API calls. It includes authenticated routes, app shell navigation, dashboards, account workspace, KYC, opportunities, tasks, governance, notifications, reports, admin settings, profile, and AI panels.

### Where It Is Implemented

- React bootstrap: `frontend/src/main.tsx`
- Route map: `frontend/src/App.tsx`
- Auth context: `frontend/src/contexts/AuthContext.tsx`
- Protected route wrapper: `frontend/src/components/auth/RequireAuth.tsx`
- Layout: `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/Topbar.tsx`, `frontend/src/components/layout/MobileNav.tsx`
- Pages: `frontend/src/pages/*`
- Domain components: `frontend/src/components/account/*`, `frontend/src/components/admin/*`, `frontend/src/components/ai/*`, `frontend/src/components/timeline/*`
- API service layer: `frontend/src/services/*`
- Stores: `frontend/src/stores/*`
- Shared UI and styling: `frontend/src/components/ui/*`, `frontend/src/index.css`

### Important Files, Classes, and Functions

- `AuthProvider` in `frontend/src/contexts/AuthContext.tsx`
- `apiRequest()` in `frontend/src/services/api.ts`
- `AppShell()` in `frontend/src/components/layout/AppShell.tsx`
- `KAMAIPanel()` in `frontend/src/components/ai/KAMAIPanel.tsx`
- `IntegrationsPanel()` in `frontend/src/components/admin/IntegrationsPanel.tsx`

### Data Flow

Authenticated frontend pages read the bearer token from `AuthContext`, call frontend services such as `accountWorkspace`, `kyc`, `integrations`, `notifications`, `reports`, and `aiAssistance`, and render server-backed state into pages and panels. Some cross-page data is cached in stores such as account, opportunity, timeline, governance, notification, and AI stores.

### Missing or Incomplete Implementation

- Some frontend fallback/mock paths remain, including `frontend/src/data/v3Mock.ts` and local fallback behavior in AI/search-related UI. These are useful during development but should be clearly disabled or labeled for production demos if backend data exists.
- `frontend/src/components/layout/AppShell.tsx` still creates frontend-local governance overdue notifications from loaded governance events. Production notification generation should remain backend-owned and persisted.
- `frontend/.env.example` only declares `VITE_API_BASE_URL=http://127.0.0.1:8002`, while Docker and root `.env.example` use backend port `8001`. This can break local setup.
- `VITE_GOOGLE_SIGN_IN_CLIENT_ID` is used by `frontend/src/pages/Login.tsx` but is not documented in `frontend/.env.example`.

## 3. Backend Framework and Structure

### What Was Implemented

The backend uses FastAPI, SQLAlchemy, Pydantic schemas, PyJWT authentication, repository/service separation, and OpenAPI route metadata. Most routers are thin, with domain logic concentrated in services. Tests exist for major backend feature areas.

### Where It Is Implemented

- FastAPI app and route registration: `backend/app/main.py`
- Routers: `backend/app/routers/*`
- Services: `backend/app/services/*`
- Repositories: `backend/app/repositories/*`
- Models: `backend/app/models.py`
- Schemas: `backend/app/schemas.py`
- Dependencies and auth guards: `backend/app/dependencies.py`
- Tests: `backend/tests/*`

### Important Files, Classes, and Functions

- `get_current_user()` and `require_permission()` in `backend/app/dependencies.py`
- `AuthService` in `backend/app/services/auth.py`
- `RbacService` in `backend/app/services/rbac.py`
- `AccountAccessService` in `backend/app/services/account_access.py`
- `AuditService` in `backend/app/services/audit.py`
- Domain services such as `KycService`, `IntegrationService`, `TimelineService`, `NotificationsService`, `ReportsService`, `AiAssistanceService`

### Data Flow

FastAPI receives `/api/*` requests, resolves dependencies, authenticates JWT tokens, enforces email-domain and RBAC policies, validates payloads, and calls domain services. Services coordinate repositories and cross-cutting services such as audit, notifications, email delivery, timeline events, integrations, and AI run logging.

### Missing or Incomplete Implementation

- The service/repository pattern is broadly followed, but the huge model/schema files reduce modular clarity.
- Some modules own adjacent routes because of incremental development history, such as integration routes split between `governance.py` and `integrations.py`.
- There is no explicit production ASGI process manager configuration beyond Docker/Uvicorn development commands.

## 4. Database Schema and Major Entities

### What Was Implemented

The database is PostgreSQL-backed through SQLAlchemy ORM models. The schema covers users, RBAC, account workspaces, onboarding, KYC, engagements, stakeholders, opportunities, account planning, retention, scoring, signals, playbooks/tasks/calendar, timeline, content, escalations, governance, notifications, reports, integrations, CSAT, AI gateway runs, audit, and admin security.

### Where It Is Implemented

- Model definitions: `backend/app/models.py`
- Database engine/session: `backend/app/database.py`
- SQL migration files: `backend/migrations/*.sql`
- Seed data: `backend/app/services/seed.py`
- Repository access: `backend/app/repositories/*`

### Important Entities

- Auth/RBAC/Admin: `User`, `PasswordResetToken`, `Role`, `Permission`, `RolePermission`, `PlatformSetting`, `FieldPermission`, `ConfigurationChange`
- Account workspace: `Account`, `AccountOwner`, `AccountOwnershipHistory`, `OnboardingDraft`, `OnboardingDraftEngagement`, `SourceDocument`, `SourceCitation`
- KYC: `KycDraft`, `KycSnapshot`, `KycAgentRun`, `KycWorkstreamOutput`, `KycConfiguration`
- Engagements and health: `Engagement`, engagement health and rollup models
- Relationships/planning/growth/retention: `Stakeholder`, `StakeholderInteraction`, `StakeholderCoverageGap`, `Opportunity`, `AccountPlan`, `AccountWhitespaceItem`, `RetentionPlan`, `RetentionAction`
- Scoring/signals/tasks: `ScoringMetricDefinition`, `ScoreSnapshot`, `SignalRule`, `Signal`, `SignalEvent`, `PlaybookTemplate`, `PlaybookExecution`, `Task`, `TaskEvidence`
- Timeline/handover: `TimelineEntry`, `TimelineComment`, `TimelineRetentionPolicy`, `TimelineTombstone`, `HandoverSummary`, `HandoverShare`, `TimelineAiSearchAudit`
- Communications/reporting: `NotificationRecord`, `NotificationPreference`, `SlaRule`, `DigestSchedule`, `ReportDefinition`, `ReportSchedule`, `ReportRun`, `ScheduledWorkerRun`
- Integrations/AI: `IntegrationConnection`, `IntegrationSyncLog`, `IntegrationSyncRun`, `IntegrationMappingRule`, `IntegrationImportedItem`, `FathomTaskSuggestion`, `CsatScore`, `AiGatewayRun`
- Audit/security: `AuditLog`, `AccessLog`

### Data Flow

Services create and update ORM models through repositories. Commit behavior is usually service-owned. Seed data creates baseline roles, users, platform settings, integrations, KYC config, scoring rules, timeline event types, and notification defaults.

### Missing or Incomplete Implementation

- There is no Alembic-style migration chain. The current lifecycle relies on SQL migrations plus runtime reconciliation in `init_db()`.
- Several environment-driven defaults are seeded at app startup, which is convenient locally but should be controlled in production deployments.
- Runtime schema reconciliation may hide migration drift during development.

## 5. Authentication Flow

### What Was Implemented

Authentication supports email/password login, Google Sign-In, logout endpoint, current-user lookup, password reset, and password change. Passwords are hashed with `pwdlib[argon2]`. JWT bearer tokens are used for API authentication. Allowed email domains are enforced during login, Google Sign-In, password reset, user management, and every authenticated request.

### Where It Is Implemented

- Backend auth router: `backend/app/routers/auth.py`
- Auth service: `backend/app/services/auth.py`
- Password/JWT helpers: `backend/app/security.py`
- Current user dependency: `backend/app/dependencies.py`
- Allowed email-domain policy: `backend/app/services/email_domains.py`
- Frontend auth context: `frontend/src/contexts/AuthContext.tsx`
- Login/reset UI: `frontend/src/pages/Login.tsx`, `frontend/src/pages/ResetPassword.tsx`

### Important Files, Classes, and Functions

- `AuthService.login()`
- `AuthService.google_sign_in()`
- `AuthService.request_password_reset()`
- `AuthService.reset_password()`
- `AuthService.change_password()`
- `get_current_user()`
- `create_access_token()`, `decode_access_token()`, `hash_password()`, `verify_password()`

### Data Flow

For email/password login, the frontend posts credentials to `/api/auth/login`. The backend validates the allowed email domain, finds an active user, verifies the password hash, and returns a JWT. The frontend stores the token in local storage and sends it as `Authorization: Bearer ...`. For password reset, reset tokens are hashed in the database and optionally emailed.

### Missing or Incomplete Implementation

- JWTs are stateless; logout does not appear to revoke tokens server-side. Domain-removal invalidation is achieved by checking the current user's domain on every authenticated request, not by token revocation.
- There is no refresh-token rotation or device/session table.
- `EXPOSE_RESET_TOKENS=true` is enabled in local examples for development; production must disable it.

## 6. Authorization/RBAC Flow

### What Was Implemented

RBAC is implemented with module/action permissions, seeded default roles, and account-level access checks. Admin routes generally depend on `require_permission()`, while domain services call `AccountAccessService` for module and account scope enforcement.

### Where It Is Implemented

- RBAC catalog and default roles: `backend/app/rbac.py`
- RBAC service: `backend/app/services/rbac.py`
- RBAC repository: `backend/app/repositories/rbac.py`
- Dependency wrapper: `backend/app/dependencies.py`
- Account access: `backend/app/services/account_access.py`
- Admin RBAC API: `backend/app/routers/admin.py`
- Admin security API: `backend/app/routers/admin_security.py`
- User/role UI: `frontend/src/components/admin/AdminUsersPanel.tsx`, `frontend/src/components/admin/AdminRolesPanel.tsx`

### Important Files, Classes, and Functions

- `DEFAULT_ROLES` in `backend/app/rbac.py`
- `default_permission_keys_for()`
- `RbacService.seed_defaults()`
- `RbacService.user_has_permission()`
- `require_permission(module, action)`
- `AccountAccessService.require_module_permission()`
- `AccountAccessService.require_account_update()`

### Data Flow

Startup seeds roles and permissions. API calls authenticate a user, then either route dependencies or service methods check that the user's role has the needed module/action permission. Account-scoped modules additionally check account ownership or global-view roles before returning or mutating account-linked records.

### Missing or Incomplete Implementation

- Default roles are seeded and functional, but frontend route/menu visibility should continue to be audited against RBAC so users do not see actions that only fail after clicking.
- Field-level permissions exist under admin security, but not every frontend display path necessarily hides sensitive fields before render.
- Multi-tenant readiness is represented in RBAC/module scope, but full runtime tenant isolation is not implemented.

## 7. Queue and Job Architecture

### What Was Implemented

The application uses local in-process async worker loops started by FastAPI lifespan when enabled. Workers process timeline retention, notification SLA/digests/reports, and integration scheduled syncs. Job outcomes are persisted through worker-run/log entities.

### Where It Is Implemented

- Worker startup: `backend/app/main.py`
- Worker settings: `backend/app/config.py`
- Timeline retention: `backend/app/services/timeline.py`
- Notifications and digest jobs: `backend/app/services/notifications.py`
- Scheduled report jobs: `backend/app/services/reports.py`
- Integration scheduled sync: `backend/app/services/integrations.py`
- Worker logs: `ScheduledWorkerRun` in `backend/app/models.py`
- Admin job/error log UI/API: `backend/app/services/admin_security.py`, `backend/app/routers/admin_security.py`

### Important Files, Classes, and Functions

- `timeline_retention_worker_loop()`
- `notifications_reporting_worker_loop()`
- `integrations_worker_loop()`
- `TimelineService.run_due_retention_policies()`
- `NotificationsService.evaluate_sla()`
- `NotificationsService.run_due_digest_schedules()`
- `ReportsService.run_due_schedules()`
- `IntegrationService.scheduled_sync_due_connections()`

### Data Flow

On startup, enabled loops sleep for an initial delay, then repeatedly open database sessions, run due jobs, log worker outcomes, and sleep until the next interval.

### Missing or Incomplete Implementation

- There is no durable queue such as Celery, RQ, Dramatiq, Sidekiq, or a cloud job queue.
- In multi-replica deployments, each backend process could start its own workers unless explicitly disabled.
- There is no strong distributed locking for overlapping scheduled/manual integration syncs.

## 8. Email Sending Architecture

### What Was Implemented

Email delivery is implemented through an SMTP service with a small built-in template catalog. Email is used for password reset/change, notifications, SLA escalation, digests, report-ready messages, integration failure alerts, and mentions.

### Where It Is Implemented

- SMTP delivery and templates: `backend/app/services/email_delivery.py`
- Email settings: `backend/app/config.py`
- Auth email triggers: `backend/app/services/auth.py`
- Notification email triggers: `backend/app/services/notifications.py`
- Report email triggers: `backend/app/services/reports.py`
- Integration failure alerts: `backend/app/services/integrations.py`
- Feature notes: `docs/features/mailtrap-email-delivery.md`

### Important Files, Classes, and Functions

- `EmailDeliveryService.send_template()`
- `EmailTemplateCatalog`
- `EmailDeliveryResult`
- `NotificationsService.queue_notification()`
- `IntegrationService._send_admin_alert()`

### Data Flow

Services call `EmailDeliveryService.send_template()` with a template key, recipient, and context. The service renders subject/body templates, checks `MAIL_ENABLED` and SMTP settings, sends through `smtplib`, and returns delivery metadata. Notification records store email delivery metadata when in-app plus email delivery is selected.

### Missing or Incomplete Implementation

- Email sending is synchronous from request/job execution, not a durable outbox.
- Email is disabled by default in examples.
- There is no retry queue, bounce tracking, suppression list, or provider webhook handling.
- Template catalog is code-defined rather than database-managed.

## 9. Google Sign-In Integration

### What Was Implemented

Google Sign-In uses Google Identity Services on the frontend and Google ID-token verification on the backend. Only existing active local users are allowed to sign in; unauthorized Google users are blocked before local account creation. Allowed email domains are enforced case-insensitively.

### Where It Is Implemented

- Frontend Google button: `frontend/src/pages/Login.tsx`
- Frontend auth call: `frontend/src/contexts/AuthContext.tsx`
- Backend auth route: `backend/app/routers/auth.py`
- Backend auth service: `backend/app/services/auth.py`
- Google token verifier: `backend/app/services/google_identity.py`
- Allowed domains: `backend/app/services/email_domains.py`
- Docker env reference: `docker-compose.yml`
- Spec: `specs/13-allowed-email-domains-and-google-sign-in.md`

### Important Files, Classes, and Functions

- `Login()` loads `https://accounts.google.com/gsi/client`.
- `AuthService.google_sign_in()`
- `GoogleIdentityVerifier.verify()`
- `EmailDomainPolicyService.require_email_allowed()`

### Data Flow

The frontend receives a Google credential from the GIS script and posts it to `/api/auth/google`. The backend verifies the token audience against `GOOGLE_SIGN_IN_CLIENT_ID`, requires a verified email, checks the allowed domain policy, finds an existing active user, and returns a normal application JWT.

### Missing or Incomplete Implementation

- `VITE_GOOGLE_SIGN_IN_CLIENT_ID` is required by the frontend but is missing from `frontend/.env.example`.
- The backend `GOOGLE_SIGN_IN_CLIENT_ID` is present in Docker Compose but not in `backend/.env.example`.
- No local user auto-creation is implemented, intentionally matching current requirements.

## 10. Fathom Integration Flow

### What Was Implemented

Fathom is implemented as an approved API-key integration with manual/scheduled sync, signed webhook intake, imported meeting items, redaction, approval/rejection, timeline creation, and Fathom-derived task suggestions. Meeting links and action items are stored in imported payload/suggestion records.

### Where It Is Implemented

- Integration service: `backend/app/services/integrations.py`
- Integration repository: `backend/app/repositories/integrations.py`
- Integration routers: `backend/app/routers/integrations.py`, `backend/app/routers/governance.py`
- Admin UI: `frontend/src/components/admin/IntegrationsPanel.tsx`
- Frontend service: `frontend/src/services/integrations.ts`
- Models: `IntegrationConnection`, `IntegrationImportedItem`, `FathomTaskSuggestion`, `Task`, `TimelineEntry` in `backend/app/models.py`
- Spec and feature doc: `specs/09-approved-integrations.md`, `docs/features/approved-integrations.md`

### Important Files, Classes, and Functions

- `IntegrationService._fetch_provider_records()`
- `IntegrationService.handle_fathom_webhook()`
- `IntegrationService._verify_fathom_webhook()`
- `IntegrationService.approve_fathom_item()`
- `IntegrationService.redact_fathom_item()`
- `IntegrationService._create_fathom_suggestions()`
- `IntegrationService.approve_fathom_task_suggestion()`

### Data Flow

Admins configure the Fathom integration with API key and webhook secret. Manual or scheduled sync fetches Fathom meeting records, stores them as `IntegrationImportedItem`, and creates pending task suggestions from action items. Webhook intake verifies signed headers, deduplicates by webhook ID, stores imported records, and creates suggestions. Approved Fathom summaries create source-linked timeline entries; approved suggestions create tasks.

### Missing or Incomplete Implementation

- The integration uses API keys and webhooks, not Fathom OAuth.
- Fathom response schema is inferred through flexible fields such as `items`, `recordings`, `summary`, `action_items`, and `recording_playback_url`; this should be verified against the actual Fathom API contract.
- Admin UI exposes integration config and recent imported Fathom items, but a full production review queue/mapping rules UI remains less complete than the backend.

## 11. AI Modules and AI Agents

### What Was Implemented

The app has multiple AI-assisted modules, mostly implemented as deterministic, source-backed advisory workflows with audit/run logging:

- KYC extraction workstreams and immutable snapshots.
- KAM AI search panel.
- Account AI brief, stage prediction, forecast, and handoff brief.
- Timeline AI search.
- Governance agenda drafts and governance briefs.
- Signal AI explanations.
- Unified `AiGatewayRun` records for AI run observability.

### Where It Is Implemented

- KYC gateway interface and local adapter: `backend/app/services/kyc_gateway.py`
- KYC service/routes: `backend/app/services/kyc.py`, `backend/app/routers/kyc.py`
- AI Assistance service/routes: `backend/app/services/ai_assistance.py`, `backend/app/routers/ai.py`
- Timeline AI search: `backend/app/services/timeline.py`, `backend/app/routers/timeline.py`
- Signal explanation: `backend/app/services/signals.py`, `backend/app/routers/signals.py`
- Governance generation: `backend/app/services/governance.py`, `backend/app/routers/governance.py`
- Unified AI Gateway runs: `backend/app/services/integrations.py`, `backend/app/repositories/integrations.py`
- Frontend AI UI: `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/components/ai/TimelineAISearch.tsx`, `frontend/src/services/aiAssistance.ts`

### Important Files, Classes, and Functions

- `KycGatewayAdapter` protocol
- `DeterministicKycGatewayAdapter`
- `AiAssistanceService.search()`
- `AiAssistanceService.account_brief()`
- `AiAssistanceService.stage_prediction()`
- `AiAssistanceService.forecast()`
- `IntegrationService.log_ai_gateway_run()`

### Data Flow

AI workflows gather only authorized source records, generate deterministic advisory responses, attach citations/source context, write `AiGatewayRun` or module-specific run records, and expose results through frontend panels. Mutating workflows require explicit human confirmation before official records are changed.

### Missing or Incomplete Implementation

- KYC and AI Assistance are not yet backed by a real LLM/gateway for generation; `DeterministicKycGatewayAdapter` states it is local until a real AI/LLM Gateway is connected.
- No production semantic/vector index is implemented for document retrieval.
- AI Gateway configuration and run logs exist, but full vendor request/response orchestration is still partial.
- Some frontend AI behavior still has local fallback paths.

## 12. External Libraries and Integrations

### What Was Implemented

Backend libraries include FastAPI, SQLAlchemy, psycopg, Uvicorn, PyJWT, pwdlib/Argon2, python-dotenv, python-multipart, email-validator, google-auth, requests, and cryptography. Frontend libraries include React, Vite, TypeScript, React Router, Tailwind, Radix UI, Lucide, Sonner, Recharts, React Hook Form, dnd-kit, date-fns, react-window, and Vitest.

Approved integrations are Google Calendar, Fathom, manual CSAT, and AI/LLM Gateway. Google Sign-In is also implemented for authentication.

### Where It Is Implemented

- Backend dependencies: `backend/requirements.txt`, `backend/requirements-dev.txt`
- Frontend dependencies: `frontend/package.json`
- Docker images: `backend/Dockerfile`, `frontend/Dockerfile`
- Google Sign-In: `backend/app/services/google_identity.py`, `frontend/src/pages/Login.tsx`
- Google Calendar: `backend/app/services/integrations.py`
- Fathom: `backend/app/services/integrations.py`
- CSAT: `backend/app/routers/csat.py`, `backend/app/services/csat.py`
- AI/LLM Gateway observability: `backend/app/services/integrations.py`

### Important Files, Classes, and Functions

- `IntegrationService.google_oauth_authorize_url()`
- `IntegrationService.google_oauth_callback()`
- `IntegrationService.write_governance_event_to_calendar()`
- `IntegrationService._fetch_provider_records()`
- `GoogleIdentityVerifier`
- `EmailDeliveryService`

### Data Flow

Integrations are configured from Admin UI and stored as `IntegrationConnection` records with masked/encrypted credentials. Syncs pull provider records into `IntegrationImportedItem` records. Mapped/approved imported items create downstream governance, timeline, task, or CSAT records as appropriate.

### Missing or Incomplete Implementation

- Google Calendar OAuth stores access/refresh token fields, but automatic token refresh/revocation handling is not clearly implemented.
- S3 environment placeholders exist, but `ContentStorageService` currently supports local storage only.
- AI/LLM Gateway health check exists, but actual provider-backed AI generation is not fully wired.

## 13. Environment Variables Required

### What Was Implemented

Backend settings are loaded through `backend/app/config.py`. Root and service-specific environment examples exist. Docker Compose passes core local settings into backend and frontend services.

### Where It Is Implemented

- Backend settings: `backend/app/config.py`
- Backend env example: `backend/.env.example`
- Frontend env example: `frontend/.env.example`
- Root env example: `.env.example`
- Docker Compose env wiring: `docker-compose.yml`

### Important Environment Variables

- Database: `DATABASE_URL`, `POSTGRES_HOST_PORT`
- JWT/auth: `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `RESET_TOKEN_EXPIRE_MINUTES`, `EXPOSE_RESET_TOKENS`
- Seed users: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_FULL_NAME`, `SUPER_ADMIN_TITLE`, `SEED_USER_PASSWORD`
- CORS/frontend: `BACKEND_CORS_ORIGINS`, `FRONTEND_APP_URL`, `VITE_API_BASE_URL`
- Domain policy: `ALLOWED_EMAIL_DOMAINS`
- Google Sign-In: `GOOGLE_SIGN_IN_CLIENT_ID`, `VITE_GOOGLE_SIGN_IN_CLIENT_ID`
- Google Calendar: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID`
- Fathom: `FATHOM_API_KEY`, `FATHOM_BASE_URL`, `FATHOM_RECORDINGS_PATH`, `FATHOM_WEBHOOK_SECRET`
- Mail: `MAIL_ENABLED`, `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `MAIL_SEND_DURING_TESTS`
- Storage: `CONTENT_STORAGE_BACKEND`, `LOCAL_CONTENT_STORAGE_DIR`, `S3_BUCKET_NAME`, `S3_REGION`
- Secret handling: `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`
- Workers: `TIMELINE_RETENTION_WORKER_ENABLED`, `TIMELINE_RETENTION_WORKER_INITIAL_DELAY_SECONDS`, `TIMELINE_RETENTION_WORKER_INTERVAL_SECONDS`, `NOTIFICATIONS_REPORTING_WORKER_ENABLED`, `NOTIFICATIONS_REPORTING_WORKER_INITIAL_DELAY_SECONDS`, `NOTIFICATIONS_REPORTING_WORKER_INTERVAL_SECONDS`, `INTEGRATIONS_WORKER_ENABLED`, `INTEGRATIONS_WORKER_INITIAL_DELAY_SECONDS`, `INTEGRATIONS_WORKER_INTERVAL_SECONDS`

### Data Flow

`get_settings()` reads environment variables and returns an app-wide settings object. Backend services read settings for DB connections, JWT, mail, integration credentials, storage, CORS, and worker scheduling. Frontend Vite variables are read at build/runtime by frontend code.

### Missing or Incomplete Implementation

- `backend/.env.example` does not document every setting used by `backend/app/config.py`, including `GOOGLE_SIGN_IN_CLIENT_ID`, `ALLOWED_EMAIL_DOMAINS`, `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`, and worker toggles.
- `frontend/.env.example` points to `http://127.0.0.1:8002`, while Docker Compose and root `.env.example` use `http://127.0.0.1:8001`.
- `frontend/.env.example` does not include `VITE_GOOGLE_SIGN_IN_CLIENT_ID`.
- Real secrets must not be committed to env examples; current examples use placeholders, which is correct.

## 14. Local Development Setup

### What Was Implemented

Docker Compose is the default local workflow. It starts PostgreSQL, backend, and frontend services. Backend runs with Uvicorn reload. Frontend runs Vite dev server. The backend seeds data at startup and exposes a CLI for migrate/seed operations.

### Where It Is Implemented

- Docker Compose: `docker-compose.yml`
- Backend Dockerfile: `backend/Dockerfile`
- Frontend Dockerfile: `frontend/Dockerfile`
- Backend CLI: `backend/app/cli.py`
- Frontend scripts: `frontend/package.json`
- Backend tests: `backend/tests/*`
- Frontend tests: `frontend/src/**/*.test.tsx`, `frontend/src/**/*.test.ts`

### Important Commands and Files

- `docker compose up --build`
- Backend CLI commands: `python -m app.cli migrate`, `python -m app.cli seed`
- Frontend scripts: `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`
- Backend tests: `python -m pytest backend/tests`

### Data Flow

Docker Compose creates a PostgreSQL container, waits for database health, starts the backend with `DATABASE_URL` pointing at the database service, and starts the frontend with `VITE_API_BASE_URL` pointing at the backend host port. Backend startup initializes schema and seeds default users/roles/settings.

### Missing or Incomplete Implementation

- The backend env example references Google Calendar redirect URI port `8002`, while the Docker backend port is `8001`.
- `frontend/.env.example` points to backend port `8002`; this should be aligned with Docker/local backend unless a separate local backend port is intended.
- Default local credentials exist in Docker Compose and seed logic, so pre-prod should require secret overrides.

## 15. Deployment Assumptions

### What Was Implemented

The repository includes Dockerfiles for backend and frontend and a local Docker Compose stack. The backend can run as a Uvicorn ASGI app. Frontend builds through Vite. PostgreSQL is the assumed database. Mail, Google, Fathom, and AI Gateway integrations are environment-driven.

### Where It Is Implemented

- Backend deployment image: `backend/Dockerfile`
- Frontend deployment image: `frontend/Dockerfile`
- Local orchestration: `docker-compose.yml`
- Runtime settings: `backend/app/config.py`
- Build/test scripts: `frontend/package.json`, `backend/requirements*.txt`
- Pre-prod checklist: `docs/preprod-readiness-checklist.md`

### Important Files, Classes, and Functions

- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`

### Data Flow

A deployment is expected to provide a PostgreSQL database, backend environment variables, frontend Vite variables at build/runtime, SMTP credentials, and optional integration credentials. The backend should expose `/health`; frontend should call the configured `VITE_API_BASE_URL`.

### Missing or Incomplete Implementation

- There is no production Compose/Kubernetes manifest, reverse proxy config, SSL/TLS config, or CI/CD pipeline definition in the reviewed files.
- In-process workers are not safe for scaled multi-instance deployment unless only one worker-enabled backend instance is run.
- Runtime schema reconciliation should be replaced by managed migrations for production.
- Secret management is environment-based; production should use a secrets manager and set `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`.
- Static frontend production serving assumptions are not fully documented.

## Summary Findings

- The application is architecturally presentable for an advanced demo or pre-prod walkthrough: most business domains have server-backed APIs, persistence, tests, and UI surfaces.
- The strongest production gaps are operational rather than feature-only: migration discipline, durable job queue/outbox, token/session revocation, env documentation consistency, worker scaling controls, and deployment hardening.
- The clearest implementation gaps by module are real AI Gateway orchestration, Google Calendar token refresh, complete Fathom review/mapping UI, and removal or isolation of frontend mock/fallback behavior for demos.
