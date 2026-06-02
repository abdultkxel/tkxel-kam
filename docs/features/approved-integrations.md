# Approved Integrations

## Summary

Implements `specs/09-approved-integrations.md`: approved Google Calendar, Fathom, CSAT, and AI/LLM Gateway integration configuration, sync status, review queues, mapping, retry/logging, CSAT manual intake, and Calendar ID profile settings.

## Scope

- In scope: four approved adapters only, API-backed Admin Integrations UI, connection testing/sync/retry/disconnect, sync logs/runs, mapping rules, imported items, Fathom API-key sync/webhooks/review/redaction/task suggestions/meeting links, manual CSAT scores, AI Gateway run observability, local scheduled sync worker, profile/admin user Calendar IDs, outbound governance Calendar writes, and administration/security alert email settings.
- Out of scope: unapproved adapters, final third-party CSAT API integration, final CSAT formula, provider-specific Fathom credentials until supplied, and credential encryption-at-rest beyond masked API/log/audit exposure.

## Requirement Links

- PRD IDs: Story 20, Story 20.1, Story 20.2, Story 25.
- Related docs: `specs/09-approved-integrations.md`, `requirements/KAM PRD.pdf`.

## User Flow

Admins configure one of the four approved adapters from Admin Settings, test/sync it, review logs and imported records, and map or approve source items into account workflows. KAM users with RBAC can trigger syncs, maintain their own primary Google Calendar ID in profile, and create manual CSAT scores for authorized accounts.

## Backend Plan

- Routers: `backend/app/routers/integrations.py`, `backend/app/routers/csat.py`, compatibility routes in `backend/app/routers/governance.py`.
- Services: `backend/app/services/integrations.py`, `backend/app/services/csat.py`, outbound governance Calendar mirroring in `backend/app/services/governance.py`.
- Repositories: `backend/app/repositories/integrations.py`, `backend/app/repositories/csat.py`.
- Schemas/validation: integration provider canonicalization, credential/settings validation, Calendar ID validation, mapping/review schemas, CSAT create/update validation.

## API Documentation

- Added Swagger summaries/descriptions for approved integration status, test, sync, retry, disconnect, logs, sync runs, mapping rules, imported items, Fathom review/suggestions, security alert settings, Google Calendar OAuth, CSAT scores, and AI Gateway runs.
- Preserved existing `/api/admin/integrations` governance compatibility endpoints while adding spec-facing aliases such as `/api/integrations/calendar/events`, `/api/integrations/fathom/items`, `/api/integrations/csat/scores`, and `/api/admin/ai-gateway/runs`.
- Added `/api/integrations/fathom/webhook` for signed Fathom meeting content webhooks.

## Database Plan

- Tables: `integration_connections`, `integration_sync_logs`, `integration_sync_runs`, `integration_mapping_rules`, `integration_imported_items`, `fathom_task_suggestions`, `csat_scores`, `ai_gateway_runs`.
- Columns: `users.primary_google_calendar_id` plus integration retry/test/token metadata.
- Migrations: additive startup migrations/backfills in `backend/app/database.py`.
- Snake_case schema check: new table and column names use snake_case.

## Frontend Plan

- Pages/components: `frontend/src/components/admin/IntegrationsPanel.tsx`, `frontend/src/pages/HealthScores.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/admin/AdminUsersPanel.tsx`.
- Services: `frontend/src/services/integrations.ts`, `frontend/src/services/csat.ts`, updated auth/admin user services.
- Form behavior: backend-backed loading, empty, error, save success, field-level validation display, secret masking, and responsive layouts.

## Validation And Errors

- Backend rejects unknown providers, unknown credential/setting fields, invalid URLs/emails/scopes/sync intervals/deduplication windows, invalid Calendar IDs, invalid CSAT scales/scores, duplicate CSAT source IDs, and unauthorized account mappings.
- Frontend avoids raw HTML `required` and displays backend validation errors beside relevant fields where supported.

## Tests

- Backend: `backend/tests/test_content_escalations_governance.py` covers approved adapter list, configuration-required sync, monkeypatched provider sync/deduplication, profile/admin Calendar IDs, manual CSAT flow, CSAT alias list, and CSAT map route.
- Frontend: `frontend/src/components/admin/IntegrationsPanel.test.tsx` covers API-backed adapter loading and sync action.

## Linting And Quality

- Ran `python -m compileall backend/app`.
- Ran `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_content_escalations_governance.py -q`.
- Ran `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_rbac.py -q`.
- Ran `npx tsc --noEmit`.
- Ran `npm run test -- IntegrationsPanel.test.tsx`.
- Ran `npx vite build --outDir /tmp/tkxel-kam-frontend-build --emptyOutDir`.
- Ran `git diff --check` and a secret scan for supplied demo credentials.

## Open Questions

- Third-party CSAT vendor mapping is pending; the internal/manual CSAT module already uses the Technical Logic Document category-weighted formula.
- Fathom API-key and webhook-secret contract is implemented for internal workflows. Future OAuth remains pending for multi-user/public app flows.
- Fathom OAuth is pending. Planned redirect path is `/api/integrations/fathom/oauth/callback`.
- Credential encryption-at-rest is implemented for stored integration secrets; production may still prefer an external secret manager for rotation and centralized governance.

## Handoff Notes

- The production Admin Integrations UI now uses the API service layer; existing mock stores remain only as fixture/development context.
- Google Calendar OAuth/client credentials must be provided through environment variables or secure admin settings, not source code.
- Fathom API key and webhook secret can be provided through ignored local environment files or Admin integration configuration. The Admin Integrations panel shows recent imported Fathom meetings with openable meeting/share links.
- Fathom redirect reference for future OAuth work: development `http://127.0.0.1:8001/api/integrations/fathom/oauth/callback`; production `https://<production-api-domain>/api/integrations/fathom/oauth/callback` or the same path on the app domain when `/api` is reverse-proxied.
- Local scheduled sync is controlled by integration worker settings in `backend/app/config.py`.
