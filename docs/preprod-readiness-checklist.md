# Pre-Production Readiness Checklist

Generated: 2026-06-03

Purpose: turn the current KAM Intelligence Platform from feature-rich MVP into a cleaner pre-production candidate.

Status legend:

- `[x]` Complete
- `[~]` In progress
- `[ ]` Pending
- `[!]` Blocked or needs decision

## 1. Verification Hygiene

- `[x]` Frontend tests pass from a clean local/Docker workflow.
- `[x]` Frontend production build passes without generated-file ownership issues.
- `[x]` Backend tests pass from a clean local/Docker workflow.
- `[~]` Add or confirm lint/typecheck scripts for frontend and backend.
- `[x]` Document the exact pre-prod verification command set.
- `[x]` Ensure generated artifacts such as `frontend/dist` are not committed or owned by root in the working tree.

## 2. Mock And Prototype Surface Cleanup

- `[x]` Unsupported dashboard voice/audio prompt wording removed.
- `[x]` Unsupported Admin `Customization` navigation hidden.
- `[ ]` Review remaining local-only/prototype UI from `docs/audits/ui-scope-audit.md`.
- `[ ]` Hide, label, or API-wire local-only Account Notes.
- `[ ]` Hide, label, or API-wire local-only Admin Alert Rules, Segments, and Policies.
- `[ ]` Ensure KAM AI fallback/local paths are clearly non-authoritative or backend-backed.
- `[ ]` Remove disabled/dead actions from demo surfaces or connect them to required APIs.

## 3. Architecture Boundaries

- `[ ]` Review backend `models.py` and `schemas.py` size and create a domain split plan.
- `[ ]` Confirm routers stay thin and business logic lives in services.
- `[ ]` Confirm database access is consistently routed through repositories for persistence-heavy workflows.
- `[ ]` Confirm frontend API calls stay in the service layer.
- `[ ]` Document accepted exceptions and migration path for oversized modules.

## 4. Database, Migrations, And Seed Data

- `[ ]` Confirm every model change has an ordered migration.
- `[ ]` Test database refresh from scratch with migrations and base seed data.
- `[ ]` Confirm 9 default RBAC roles are seeded with permissions.
- `[ ]` Confirm default allowed domains are seeded without admin lockout risk.
- `[ ]` Confirm realistic pre-prod demo data exists for accounts, KYC, tasks, signals, governance, reports, and integrations.
- `[ ]` Document seed credentials and reset procedure in a non-secret handoff doc.

## 5. Security And Access Control

- `[ ]` Review secrets handling and ensure real credentials are not hardcoded into tracked files.
- `[ ]` Confirm integration credentials are encrypted or otherwise protected at rest.
- `[ ]` Confirm RBAC checks are enforced in backend services before data leaves the API.
- `[ ]` Confirm field-level security for commercial, legal, executive, escalation, stakeholder, and attachment data.
- `[ ]` Confirm active sessions are invalidated or denied after domain policy changes where required.
- `[ ]` Review upload validation for file type, size, storage path, and sensitive attachment handling.

## 6. Audit, Timeline, Notifications, And Observability

- `[ ]` Confirm audit logs are emitted for create/update/delete/approve/configuration actions.
- `[ ]` Confirm important business events write timeline entries consistently.
- `[ ]` Confirm in-app notifications and email notifications are triggered for required events.
- `[ ]` Confirm notification deduplication and SLA escalation behavior.
- `[ ]` Add or verify health endpoints, scheduler status, integration sync run logs, and error correlation IDs.
- `[ ]` Document log levels and operational monitoring expectations.

## 7. Integrations And AI Gateway

- `[ ]` Confirm Google Sign-In and allowed domain checks in local/pre-prod setup.
- `[ ]` Confirm Google Calendar read/write mapping and fallback calendar behavior.
- `[ ]` Confirm Fathom API/webhook behavior stores reviewed meeting summaries/action suggestions in the database.
- `[ ]` Confirm CSAT manual intake is persisted and later-integration-ready.
- `[ ]` Confirm AI/LLM Gateway run logging includes source context, RBAC context, request type, status, and error handling.
- `[ ]` Confirm integration retry/backoff and repeated-failure admin alerting.

## 8. Documentation And Architect Review Pack

- `[ ]` Create system architecture overview.
- `[ ]` Create module map with frontend routes, backend routers, services, repositories, and database entities.
- `[ ]` Create RBAC matrix.
- `[ ]` Create integration architecture document.
- `[ ]` Create AI boundary and data-governance document.
- `[ ]` Create pre-prod runbook with setup, seed, smoke test, troubleshooting, and known limitations.

## 9. CI/CD And Release Discipline

- `[ ]` Add CI workflow for frontend build/tests, backend tests, and migration smoke checks.
- `[ ]` Add PR checklist items for tests, migrations, audit/timeline, RBAC, and docs.
- `[ ]` Define branch/release naming convention.
- `[ ]` Add environment-specific config guidance for local, pre-prod, and production.
- `[ ]` Ensure dirty/generated files are excluded from release packaging.

## 10. Current Work Log

- `[x]` Created UI cleanup plan and summary.
- `[x]` Cleaned unsupported dashboard voice wording and Admin Customization navigation.
- `[x]` Aligned stale `CreateAccountDialog` frontend tests with onboarding-draft workflow.
- `[x]` Repaired frontend generated artifact ownership so the normal production build can run.
- `[x]` Added `frontend/.vite` to frontend gitignore so local build cache does not appear as a release artifact.
- `[x]` Ran frontend targeted test: `npm test -- CreateAccountDialog` from `frontend` - 3 passed.
- `[x]` Ran frontend full test suite: `npm test` from `frontend` - 25 files / 52 tests passed.
- `[x]` Added and ran frontend typecheck script: `npm run typecheck` from `frontend` - passed.
- `[x]` Ran frontend production build: `npm run build` from `frontend` - passed with existing large chunk warning.
- `[x]` Ran backend test suite: `backend/.venv/bin/python -m pytest backend/tests` - 105 tests passed, 8 deprecation warnings.
- `[ ]` Backend lint/typecheck tooling still needs a deliberate tool choice, e.g. Ruff/Mypy configuration, before becoming a pre-prod gate.

## 11. Verified Command Set

Run these from the repository root unless otherwise noted:

- Frontend targeted account-create test: `npm test -- CreateAccountDialog` from `frontend`
- Frontend typecheck: `npm run typecheck` from `frontend`
- Frontend full tests: `npm test` from `frontend`
- Frontend production build: `npm run build` from `frontend`
- Backend full tests: `backend/.venv/bin/python -m pytest backend/tests`

Current verification notes:

- Frontend build emits a Vite large chunk warning for the main bundle.
- Frontend tests emit React Router v7 future-flag warnings.
- Backend tests emit FastAPI/Starlette and HTTP 422 deprecation warnings.
- Frontend typecheck is available through `npm run typecheck`.
- No true frontend lint script or backend lint/typecheck script is currently available.
