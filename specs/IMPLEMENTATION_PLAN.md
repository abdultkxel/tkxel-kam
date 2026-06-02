# KAM Implementation Plan

This plan sequences implementation from the PRD, user stories, feature specs, and current React design. It is planning documentation only; it does not include implementation code.

## Comparison Inputs

- `requirements/KAM PRD.pdf` - PRD V3 consolidated module catalog, workflows, phase rules, integrations, and scope guardrails.
- `requirements/KAM_USER_STORIES.md` - 55 user stories across 24 PRD sections.
- `specs/*.md` - 12 grouped feature specifications with traceability.
- Current frontend design in `frontend/src` - operational React screens backed mostly by mock stores.
- Current backend in `backend/app` - FastAPI auth, profile, users, roles, permissions, seeds, repositories, services, and Swagger scaffolding.

## Current Baseline

- Backend foundation exists for authentication, profile update, password reset, users CRUD, roles CRUD, permissions, seeded roles/users, and admin RBAC.
- Backend still lacks domain APIs, database models, services, and repositories for accounts, engagements, KYC, timeline, scoring, tasks, opportunities, governance, notifications, integrations, AI, dashboards, reporting, and analytics.
- Frontend already has useful operational design for Dashboard, Accounts, Account 360, Onboarding, Opportunities, Tasks, Governance, Playbook, Admin, Profile, Notifications, and KAM AI.
- Frontend data is mostly local/mock state. Implementation should replace store-by-store with API-backed services while preserving the existing operational layouts.
- `frontend/src/pages/Analytics.tsx` exists, but `/analytics` currently redirects to `/dashboard`. Analytics must be wired as a real route when that module starts.
- `/governance` exists, but it is not in the primary sidebar. Governance should be made reachable through role-appropriate navigation or a clearly accepted dashboard workflow.
- Account 360 already has tabs for Overview, Engagements, KYC, Health, Stage, Opportunities, Education, Governance, Notes, Timeline, and Documents. It still needs fuller PRD surfaces for stakeholders, account plan, whitespace, renewal intelligence, and retention plans.

## Priority Principles

- Build security, audit, tenant-ready scoping, and shared patterns before domain modules.
- Build account and engagement foundations before any module that attaches to an account.
- Build timeline/audit events early so every later module can emit immutable source-linked history from the beginning.
- Convert existing frontend screens incrementally instead of rebuilding the UI from scratch.
- Keep each feature slice vertically complete: migration, model, repository, service, router, schemas, Swagger docs, backend tests, frontend API integration, field errors, frontend tests, seeds or fixtures, and Docker verification.
- Do not start AI, analytics, or integrations as production features until the source data they depend on exists in the backend.

## Priority Roadmap

| Priority | Module | Specs | Why This Order | Start With | Completion Gate |
| --- | --- | --- | --- | --- | --- |
| 0 | Implementation readiness | All specs | Prevents drift before coding begins. | Confirm route/nav map, module backlog, API naming, pagination contract, validation format, audit contract, and seed strategy. | Every story has a planned route/API/data owner and no unknown critical dependency. |
| 1 | Platform, security, RBAC, audit | `10`, `12` | Every API and screen needs authorization, audit, seeded roles, and predictable error handling. | Permission catalog, role seed expansion, audit log model, field-permission policy, tenant-ready columns, standard list pagination response. | Auth/RBAC/audit tests pass; Swagger shows auth and admin APIs; seeded roles and users are deterministic. |
| 2 | Account onboarding, accounts, engagements | `01` | Accounts are the root entity for nearly all modules. | `accounts`, `account_owners`, `source_documents`, `engagements`, attachments, account list, Account Overview, onboarding import/approval. | Accounts and engagements are CRUD-capable, searchable, filterable, sortable, paginated, permission-aware, and wired into current `/accounts` screens. |
| 3 | Timeline and handover backbone | `06` | Later modules must create source-linked timeline events consistently. | Timeline event model/service, event type config, visibility rules, notes, source links, retention states, handover summary shell. | Account Timeline tab is API-backed and at least account/engagement changes emit timeline and audit records. |
| 4 | KYC and AI extraction review | `02` | KYC feeds stage, scoring, dashboards, AI briefs, and renewal readiness. | KYC drafts, review/approval workflow, freshness, source citations, research-source records, manual fallback. | Onboarding/KYC screens can approve/reject source-backed drafts and update account KYC snapshots. |
| 5 | Scoring, signals, playbooks, tasks | `04` | Health, attention center, dashboards, notifications, and analytics depend on scores and operational tasks. | Scoring config/versioning, score snapshots, signal rules, task/playbook templates, evidence capture, Task board API. | Account Health and Tasks screens are API-backed; score changes create timeline/audit events; signals/tasks support lifecycle and pagination. |
| 6 | Relationships, planning, opportunities, renewal, retention | `03` | Growth and retention workflows need account, engagement, KYC, and timeline foundations. | Stakeholders, account plan, service catalog, opportunities API, renewal terms, retention plans. | Opportunities screen is API-backed; missing stakeholder/plan/renewal/retention UI is added or linked from Account 360. |
| 7 | Content, escalations, governance | `05` | These workflows depend on accounts, timeline, notifications hooks, and role-scoped access. | Content catalog, sent-content history, escalation lifecycle, governance events/calendar, AI agenda/brief shell. | Governance is route/nav reachable; escalation and governance records emit timeline/audit and support required filters/pagination. |
| 8 | Notifications, SLA, dashboards, reports | `07` | Notifications and dashboards need signals, tasks, escalations, governance, and renewal data. | Notification preferences, notification center/tray API, SLA rules, escalated item list, dashboard API endpoints, report builder shell. | Dashboard widgets are API-backed, notification tray works from backend, and reports/digests enforce permission-scoped data. |
| 9 | Approved integrations | `09` | Integrations should import into real accounts, engagements, governance, timeline, and KYC records. | Adapter config model, Google Calendar, Fathom, CSAT, AI/LLM gateway logs, mapping/review queues. | Admin Integrations is API-backed with test/sync/retry logs and unmapped item review. |
| 10 | AI assistance, semantic search, forecasting | `08` | AI needs source records, permissions, timeline, docs, scores, opportunities, and governance data. | AI gateway abstraction, query logs, source retrieval service, semantic document search, AI briefs, stage prediction, forecast data contract. | KAM AI answers cite authorized sources, log runs, redact restricted data, and handle low-confidence states. |
| 11 | Analytics, benchmarking, proactive alerts | `11` | Analytics should run after reliable historical operational data exists. | `/analytics` route/nav, portfolio analytics APIs, benchmark cohorts, KAM performance, account-change alerts. | Analytics is a first-class route, drilldowns are paginated, benchmarks respect cohort rules, and alerts are auditable. |

## Recommended First Sprint

Start with Priority 0 and Priority 1, then move directly into Priority 2.

1. Freeze conventions: pagination response shape, filter names, sort syntax, error response shape, audit event shape, timeline event shape, and permission naming.
2. Expand RBAC to cover every module in the PRD, not only current Admin screens.
3. Add cross-cutting audit and permission utilities before adding domain routers.
4. Define the account/engagement ERD and API contracts.
5. Convert `/accounts` list and `/accounts/:id` overview to backend data first because many existing screens already read account state.

## Feature Slice Workflow

Use this workflow for each module:

1. Re-read the feature spec, linked user stories, and PRD section before coding.
2. Identify tables using snake_case names and columns.
3. Add migration and SQLAlchemy models.
4. Add Pydantic validation schemas with meaningful field-level messages.
5. Add repository methods for persistence and query composition.
6. Add service methods for business rules, authorization decisions, audit, timeline side effects, and validation orchestration.
7. Add FastAPI router endpoints with summaries, descriptions, response models, errors, examples where useful, and tags for Swagger.
8. Add backend unit tests for validation, permissions, service rules, repository queries, pagination, edge cases, and Swagger-visible endpoints.
9. Add or update frontend service clients and replace one mock-store surface at a time.
10. Display backend validation errors at the matching frontend form fields.
11. Add frontend tests for happy path, field errors, permissions, empty/loading/error states, delete confirmations, and pagination.
12. Run through Docker and Makefile commands before considering the slice done.

## Frontend Design Alignment Map

| Spec | Existing Frontend Surface | Required Alignment |
| --- | --- | --- |
| `01` Account Workspace | `/accounts`, `/accounts/onboarding`, `/accounts/:id`, Account 360 tabs, CSV import, create account dialog | Preserve layout, card/table toggle, saved views, and tabs while replacing mock stores with APIs and adding real pagination. |
| `02` KYC | Onboarding extraction review, Account 360 KYC tab, KYC assisted review components | Wire drafts, citations, freshness, and approval/rejection to backend. |
| `03` Relationships/Growth/Retention | `/opportunities`, Account 360 Opportunities and Stage tabs | Add missing stakeholder map, account plan, whitespace, renewal, and retention surfaces. |
| `04` Scoring/Signals/Tasks | `/tasks`, `/playbook`, Account 360 Health tab, Admin Scoring | Wire score config, snapshots, signals, playbooks, and evidence-backed task lifecycle. |
| `05` Content/Escalations/Governance | `/governance`, Account 360 Education/Governance areas, escalation components | Make Governance role-reachable, add escalation detail workflows, and backend content history. |
| `06` Timeline/Handover | Account 360 Timeline tab, Add Note modal, Handover summary, Admin Timeline/Retention | Centralize timeline event creation in backend services and enforce visibility/retention. |
| `07` Notifications/Dashboards/Reports | `/dashboard`, Notification tray, Admin notification settings | Add backend notification center, SLA/digest/report screens, and API-backed widgets. |
| `08` AI | Topbar AI search, KAM AI panel, AI brief cards, timeline AI search services | Replace local search with AI gateway/retrieval services and preserve citations/history. |
| `09` Integrations | Admin Integrations panel | Wire adapter config, mapping, test, sync, retry, and error logs to backend. |
| `10` Admin/RBAC | Admin tabbed sections, Users/Roles panels | Preserve tabbed admin UX and expand permissions/reference/audit/policy screens. |
| `11` Analytics | Analytics page exists but route redirects | Add real `/analytics` route/nav for authorized roles before implementing analytics APIs. |
| `12` Platform Readiness | Cross-cutting shell, Makefile, Docker | Enforce performance, accessibility, tests, observability, scope guardrails, and Docker consistency across every module. |

## Cross-Cutting Definition Of Done

- Every new API has Swagger documentation, response models, status codes, and validation error documentation.
- Every new API has backend tests for success, validation failure, permission failure, pagination, and at least one relevant edge case.
- Every new frontend form shows field-level backend errors and meaningful general failure messages.
- Every list that can grow supports search, filters, sorting, and pagination as described in its spec.
- Every destructive action has confirmation and success/failure feedback.
- Every material domain change writes audit logs and, where product-visible, timeline events.
- Every table and column uses snake_case naming.
- Every backend module follows Repository and Service patterns already started in `backend/app/repositories` and `backend/app/services`.
- Every seed is deterministic and safe to re-run.
- Every module is tested through Docker using the Makefile path before handoff.

## Things To Avoid

- Do not implement AI, analytics, or integrations first; they will become mock-heavy without reliable source records.
- Do not rebuild the frontend layout unless the spec requires a missing surface. The current design already covers most operational workflows.
- Do not leave any module using only local mock stores once its backend API is introduced.
- Do not add unpaginated backend list endpoints for records that can grow.
- Do not rely on frontend-only permission checks; enforce permissions in backend services and queries.

