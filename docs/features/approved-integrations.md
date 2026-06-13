# Approved Integrations

## Summary

Implements `specs/09-approved-integrations.md`: approved Google Calendar, CSAT, and AI/LLM Gateway integration configuration, sync status, retry/logging, CSAT manual intake, Calendar ID profile settings, and user-owned Fathom meeting capture. Google Calendar is outbound-only for governance events, and Admin Integrations now shows only Google Calendar and AI/LLM Gateway.

## Scope

- In scope: API-backed Admin Integrations UI for admin-owned external adapters, connection testing/sync/retry/disconnect for supported adapters, sync logs/runs, mapping rules, imported items, personal Fathom meeting capture, manual CSAT scores, AI Gateway run observability, local scheduled sync worker, profile/admin user Calendar IDs, outbound governance Calendar writes, and administration/security alert email settings.
- Out of scope: global/admin Fathom import or webhook workflows, unapproved adapters, final third-party CSAT API integration, final CSAT formula, generic Fathom-to-task creation outside governance completion, full Fathom OAuth, and credential encryption-at-rest beyond masked API/log/audit exposure.

## Requirement Links

- PRD IDs: Story 20, Story 20.1, Story 20.2, Story 25.
- Related docs: `specs/09-approved-integrations.md`, `requirements/KAM PRD.pdf`.

## User Flow

Admins configure Google Calendar and AI/LLM Gateway from Admin Integrations, test/sync supported adapters, and review logs. KAM users with RBAC can maintain their own primary Google Calendar ID in profile, create manual CSAT scores for authorized accounts, connect a personal Fathom API key, and keep private meeting artifacts for copy/paste or governance completion. Governance events are pushed to the event owner's primary Google Calendar ID when configured.

## Backend Plan

- Routers: `backend/app/routers/integrations.py`, `backend/app/routers/meeting_capture.py`, `backend/app/routers/csat.py`, compatibility routes in `backend/app/routers/governance.py`.
- Services: `backend/app/services/integrations.py`, `backend/app/services/meeting_capture.py`, `backend/app/services/csat.py`, outbound governance Calendar mirroring and meeting artifact completion in `backend/app/services/governance.py`.
- Repositories: `backend/app/repositories/integrations.py`, `backend/app/repositories/meeting_capture.py`, `backend/app/repositories/csat.py`.
- Schemas/validation: integration provider canonicalization, credential/settings validation, Calendar ID validation, mapping/review schemas, personal Fathom connection schemas, meeting artifact schemas, CSAT create/update validation.

## API Documentation

- Added Swagger summaries/descriptions for approved integration status, test, sync, retry, disconnect, logs, sync runs, mapping rules, imported items, user-owned Fathom meeting capture, security alert settings, Google Calendar OAuth, CSAT scores, and AI Gateway runs.
- Preserved existing `/api/admin/integrations` governance compatibility endpoints while adding spec-facing aliases such as `/api/integrations/calendar/events`, `/api/integrations/csat/scores`, and `/api/admin/ai-gateway/runs`.
- Retired global/admin Fathom import, review, task-suggestion, and webhook endpoints; personal meeting capture remains active.
- Added `/api/meeting-capture/fathom/connection`, `/api/meeting-capture/fathom/sync`, and `/api/meeting-capture/meetings` for user-owned meeting capture.

## Database Plan

- Tables: `integration_connections`, `integration_sync_logs`, `integration_sync_runs`, `integration_mapping_rules`, `integration_imported_items`, `fathom_task_suggestions` for historical suggestions, `user_integration_connections`, `meeting_artifacts`, `csat_scores`, `ai_gateway_runs`.
- Columns: `users.primary_google_calendar_id` plus integration retry/test/token metadata.
- Migrations: additive startup migrations/backfills in `backend/app/database.py`.
- Snake_case schema check: new table and column names use snake_case.

## Frontend Plan

- Pages/components: `frontend/src/components/admin/IntegrationsPanel.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/governance/CompleteGovernanceEventDialog.tsx`, `frontend/src/pages/HealthScores.tsx`, `frontend/src/components/admin/AdminUsersPanel.tsx`.
- Services: `frontend/src/services/integrations.ts`, `frontend/src/services/meetingCapture.ts`, `frontend/src/services/csat.ts`, updated auth/admin user services.
- Form behavior: backend-backed loading, empty, error, save success, field-level validation display, secret masking, and responsive layouts.

## Validation And Errors

- Backend rejects unknown providers, unknown credential/setting fields, invalid URLs/emails/scopes/sync intervals/deduplication windows, invalid Calendar IDs, invalid CSAT scales/scores, duplicate CSAT source IDs, and unauthorized account mappings.
- Frontend avoids raw HTML `required` and displays backend validation errors beside relevant fields where supported.

## Tests

- Backend: `backend/tests/test_content_escalations_governance.py` covers approved adapter list without global Fathom, retired Fathom admin/global endpoint responses, configuration-required sync, disabled Google Calendar inbound sync, Google Calendar OAuth callback redirect, profile/admin Calendar IDs, manual CSAT flow, CSAT alias list, CSAT map route, and personal Fathom meeting capture sync/privacy.
- Backend: `backend/tests/test_governance.py` covers outbound Google Calendar mirroring to the governance owner's Calendar ID without invitees, Google Calendar update PATCH behavior, governance reminder task create/update/cancel behavior, duplicate manual governance event conflict handling, provider HTTP error reason reporting, and governance completion from a meeting artifact with owner-assigned action tasks.
- Frontend: `frontend/src/components/admin/IntegrationsPanel.test.tsx` covers API-backed adapter loading, filtering stale Fathom/CSAT rows out of Admin Integrations, hidden Google Calendar inbound sync controls, and sync action for supported adapters. `frontend/src/pages/GoogleCalendarOAuthCallback.test.tsx` covers the Calendar OAuth completion screen. `frontend/src/services/meetingCapture.test.ts` and `frontend/src/services/governance.test.ts` cover personal Fathom/governance payload mapping.

## Linting And Quality

- Current governance Calendar/task flow verification:
  - `docker compose run --rm --no-deps backend pytest tests/test_governance.py -q`
  - `docker compose run --rm --no-deps backend pytest tests/test_content_escalations_governance.py -q`
  - `docker compose run --rm --no-deps backend python -m compileall app tests/test_governance.py tests/test_content_escalations_governance.py`
  - `docker compose run --rm --no-deps frontend npm run test -- governance.test.ts meetingCapture.test.ts IntegrationsPanel.test.tsx GoogleCalendarOAuthCallback.test.tsx`
  - `docker compose run --rm --no-deps frontend npx tsc --noEmit`
  - `git diff --check`
- Ran `python -m compileall backend/app`.
- Ran `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_content_escalations_governance.py -q`.
- Ran `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_rbac.py -q`.
- Ran `npx tsc --noEmit`.
- Ran `npm run test -- IntegrationsPanel.test.tsx`.
- Ran `npx vite build --outDir /tmp/tkxel-kam-frontend-build --emptyOutDir`.
- Ran `git diff --check` and a secret scan for supplied demo credentials.

## Open Questions

- Third-party CSAT vendor mapping is pending; the internal/manual CSAT module already uses the Technical Logic Document category-weighted formula.
- Global/admin Fathom API-key and webhook workflows are retired. Personal Fathom API-key storage is implemented for per-user meeting capture.
- Credential encryption-at-rest is implemented for stored integration secrets; production may still prefer an external secret manager for rotation and centralized governance.

## Handoff Notes

- The production Admin Integrations UI now uses the API service layer and displays only Google Calendar and AI/LLM Gateway; existing mock stores remain only as fixture/development context.
- Google Calendar OAuth/client credentials must be provided through environment variables or secure admin settings, not source code.
- Google Calendar OAuth callbacks exchange tokens in the backend and redirect to a frontend completion screen at `/admin/integrations/google-calendar/callback`.
- Google Calendar OAuth requests only the Calendar events scope used for outbound governance event create/update pushes.
- Fathom API keys are managed from Profile meeting integrations. Admin/global Fathom configuration, webhook intake, and meeting-link previews are retired.
- Personal Fathom API keys are saved from Profile and stored in `user_integration_connections`; they are masked in responses.
- Personal Fathom on-demand resolve stores only the requested summary/action items in `meeting_artifacts` and does not store full transcripts.
- Local scheduled sync is controlled by integration worker settings in `backend/app/config.py`; Google Calendar inbound sync is skipped because governance now pushes outbound only.
- Outbound Google Calendar writes never send invitees. Governance attendee emails remain in-app metadata only.
- Outbound Google Calendar writes target the governance event owner's `primary_google_calendar_id`. If the owner profile has no Calendar ID, the write is skipped and logged instead of falling back to a shared or creator calendar.
- Google Calendar HTTP failures include the provider status/message/reason and target Calendar ID in sync logs when Google returns structured error JSON.
