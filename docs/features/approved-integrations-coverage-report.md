# Approved Integrations Requirements Coverage Report

Phase 3 self-review for `specs/09-approved-integrations.md`.

## Review Outcome

- Status: Partial overall.
- Phase 3 fixes applied: sync-run failure-type filtering, sync-log severity/date/search filtering, imported-item payload search for external participant metadata, Admin in-app notifications for repeated integration failures, and unified AI Gateway run logging for KYC extraction, Timeline AI Search, and signal explanations. Global/admin Fathom has since been retired in favor of personal Profile meeting capture.
- Verified: backend compile, approved-integrations backend tests, frontend TypeScript, integration panel test, production frontend build, and whitespace check.

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Only active admin-owned adapters are configurable in Admin Integrations: Google Calendar and AI/LLM Gateway. | Complete | `backend/app/services/integrations.py`, `backend/app/repositories/integrations.py`, `frontend/src/components/admin/IntegrationsPanel.tsx`, `backend/tests/test_content_escalations_governance.py` |
| Adapter list hides moved/internal adapters before configuration and normalizes canonical IDs. | Complete | `backend/app/services/integrations.py`, `backend/app/schemas.py`, `frontend/src/components/admin/IntegrationsPanel.tsx` |
| Adapter configure, test, sync, status, retry, disconnect, dedupe, error logging. | Complete | `backend/app/routers/integrations.py`, `backend/app/services/integrations.py`, `backend/app/repositories/integrations.py`; Google Calendar keeps OAuth/test/logging but skips inbound sync by product decision. |
| Repeated failures use retry backoff and create Admin alerts. | Complete | `backend/app/services/integrations.py`, `backend/app/services/notifications.py`, `backend/tests/test_content_escalations_governance.py` |
| Manual sync and local scheduled sync. | Complete | `backend/app/main.py`, `backend/app/config.py`, `backend/app/services/integrations.py` |
| Google Calendar OAuth, minimum outbound event scope, outbound governance scheduling/update, owner profile Calendar resolution. | Complete | `backend/app/routers/integrations.py`, `backend/app/services/integrations.py`, `backend/app/services/governance.py` |
| KAM profile primary Calendar ID and Admin user-management Calendar ID, defaulted from user email. | Complete | `backend/app/services/user_management.py`, `backend/app/services/seed.py`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/admin/AdminUsersPanel.tsx` |
| Global/admin Fathom API-key sync, signed webhook, meeting/share links, imported review items, redaction, approve/reject. | Retired | Fathom moved to personal Profile meeting capture; retired admin/global endpoints return `404`, and historical records are preserved. |
| Personal Fathom connection and user-owned meeting artifacts. | Complete | `backend/app/services/meeting_capture.py`, `backend/app/routers/meeting_capture.py`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/governance/CompleteGovernanceEventDialog.tsx`, `backend/tests/test_content_escalations_governance.py` |
| Fathom transcript sensitivity controls. | Complete | `backend/app/services/integrations.py`, `backend/app/schemas.py` |
| Fathom task suggestions approve/reject into current-user tasks. | Retired | Historical data structures remain, but admin/global Fathom task-suggestion endpoints are no longer exposed. Governance completion now owns Fathom-assisted task creation. |
| Manual CSAT module with score scale, normalization, mapping, freshness, trend, timeline/scoring links. | Complete | `backend/app/services/csat.py`, `backend/app/repositories/csat.py`, `backend/app/routers/csat.py`, `frontend/src/pages/HealthScores.tsx` |
| Future third-party CSAT writes into same CSAT storage model. | Partial | Storage/API model exists in `backend/app/models.py` and `backend/app/services/csat.py`; no external CSAT adapter yet by requirement decision. |
| AI/LLM Gateway connection status and unified run table. | Partial | `backend/app/models.py`, `backend/app/services/integrations.py`, `backend/app/routers/integrations.py`, `backend/app/services/kyc.py`, `backend/app/services/timeline.py`, `backend/app/services/signals.py`; KYC, Timeline AI Search, and signal explanations are wired, while future summary/semantic retrieval paths still need linkage. |
| AI Gateway receives RBAC-filtered context and advisory labels. | Partial | `backend/app/services/integrations.py`, `backend/app/services/kyc.py`, `backend/app/services/timeline.py`, `backend/app/services/signals.py`; current wired paths include permission scope/source context, but full vendor gateway guardrails remain future work. |
| Unmapped imported item queues and mapping rules. | Complete backend, Partial frontend | Backend/API: `backend/app/services/integrations.py`; frontend has Fathom meeting list but no full mapping-rules/review-queue workspace yet. |
| Imported records store source IDs, links, metadata, mapping/review state, dedupe keys, result links. | Complete | `backend/app/models.py`, `backend/app/services/integrations.py` |
| Administration/security alert email in Admin Settings with default. | Complete | `backend/app/services/integrations.py`, `frontend/src/components/admin/IntegrationsPanel.tsx` |
| Credential secrets are encrypted at rest and masked from responses, logs, audits, notifications, and tests. | Complete | Encryption/masking: `backend/app/services/secret_encryption.py`, `backend/app/services/integrations.py`, `backend/app/schemas.py` |
| Integration failures do not block core workflows. | Complete | `backend/app/services/integrations.py`, `backend/app/services/governance.py` |
| Account-level permissions are applied to imported items, CSAT, and AI runs. | Complete | `backend/app/services/integrations.py`, `backend/app/services/csat.py` |
| RBAC gates integration configure/view/sync/retry and profile/admin Calendar changes. | Complete | `backend/app/rbac.py`, `backend/app/services/integrations.py`, `backend/app/services/user_management.py` |
| Search logs by message/source/account/adapter. | Partial | `backend/app/repositories/integrations.py`; message/source/payload/provider supported, account search is only indirect through payload/result metadata. |
| Search unmapped imported items by title, source ID, external participant, and date. | Complete | `backend/app/repositories/integrations.py`, `backend/tests/test_content_escalations_governance.py` |
| Search mapping rules by name/tag/account pattern. | Complete backend, Partial frontend | `backend/app/repositories/integrations.py`; dedicated frontend mapping-rule screen remains partial. |
| Adapter logs filter by adapter, status, severity, date range. | Complete | `backend/app/repositories/integrations.py`, `backend/app/routers/integrations.py`, `backend/app/routers/governance.py` |
| Imported items filter by adapter, mapped/unmapped, account, date, status. | Complete | `backend/app/repositories/integrations.py`, `backend/app/routers/integrations.py` |
| Sync history filter by adapter, status, started date, failure type. | Complete | `backend/app/repositories/integrations.py`, `backend/app/routers/integrations.py` |
| CSAT filter/search/sort/pagination. | Complete | `backend/app/repositories/csat.py`, `backend/app/services/csat.py`, `backend/app/routers/csat.py` |
| Logs, imported queues, sync history, CSAT lists are paginated and sorted newest/date-first as required. | Complete | `backend/app/repositories/integrations.py`, `backend/app/repositories/csat.py` |
| Required API endpoints from the spec exist. | Complete | `backend/app/routers/integrations.py`, `backend/app/routers/csat.py`, compatibility routes in `backend/app/routers/governance.py` |
| Database/storage tables and source references. | Complete | `backend/app/models.py`, `backend/app/database.py` |
| Audit configuration changes, tests, syncs, review decisions, CSAT changes, Calendar writes. | Complete | `backend/app/services/integrations.py`, `backend/app/services/csat.py`, `backend/app/services/governance.py`, `backend/app/services/user_management.py` |
| Webhook signature validation and replay rejection. | Complete | `backend/app/services/integrations.py`, `backend/tests/test_content_escalations_governance.py` |
| Provider pagination and duplicate records across pages. | Partial | Fathom pagination added in `backend/app/services/integrations.py`; duplicate handling depends on imported-item external ID dedupe. Google Calendar inbound provider pagination is no longer in scope for the outbound-only flow. |
| UI adapter cards, configure/test/sync/retry, logs, credentials masking, loading/empty/error states. | Complete | `frontend/src/components/admin/IntegrationsPanel.tsx`, `frontend/src/services/integrations.ts`, `frontend/src/components/admin/IntegrationsPanel.test.tsx`; Admin Integrations shows Google Calendar and AI/LLM Gateway only, while Google Calendar hides inbound sync/read-token controls. |
| Profile/Admin user Calendar ID UI states. | Complete | `frontend/src/pages/Profile.tsx`, `frontend/src/components/admin/AdminUsersPanel.tsx` |
| CSAT trend/manual score UI states. | Complete | `frontend/src/pages/HealthScores.tsx`, `frontend/src/services/csat.ts` |
| Mapping rules screen, full unmapped/review queue, AI Gateway run log UI, error log detail drawer. | Partial | Backend APIs exist; full production UI remains to be expanded beyond Admin Integrations preview/list areas. |

## Missing Or Partial Requirements

- Full AI Gateway cross-feature run linkage is partial. The unified `ai_gateway_runs` table and routes exist, and KYC extraction, Timeline AI Search, and signal explanations now write unified run records. Future summary/semantic retrieval paths still need linkage as those workflows are expanded.
- Full Admin UI for mapping rules, unmapped item queue, AI Gateway run logs, and error-log detail drawer is partial.
- Google Calendar external edit/deletion conflict reconciliation is partial; inbound provider pagination is intentionally out of scope for the outbound-only flow.
- Sync concurrency locking for "Admin disables adapter while sync is running" and scheduled/manual sync overlap is partial.
- Fathom OAuth is intentionally missing for the current MVP. The active Fathom path uses personal API keys in Profile; global/admin Fathom workflows are retired.
- External third-party CSAT adapter mapping is pending product inputs; the internal/manual CSAT scoring formula is implemented.

## Field Builder Impact

- No direct field-builder impact was found.
- Approved integrations use fixed domain tables and schemas rather than `custom_field_definitions` or dynamic custom-field values.
- Existing custom-field behavior remains isolated from integration connections, imported items, user meeting artifacts, Fathom suggestions, CSAT scores, and AI Gateway run records.

## Missing Tests

- Needed next: AI Gateway run logging assertions for KYC and signal explanation paths, frontend mapping-rule/review-queue interactions, frontend AI Gateway run log UI, Google Calendar token expiry/revocation, outbound Calendar write fallback/error branches, and sync overlap/adapter-disabled race conditions.
- Current coverage added or verified: approved adapter list without global Fathom, retired Fathom admin/global endpoints, config-required sync, disabled Calendar inbound sync, owner-profile outbound Calendar writes without invitees, profile/Admin Calendar IDs, personal Fathom meeting capture, manual CSAT, CSAT mapping, sync-run failure filtering, Admin repeated-failure notifications, and Timeline AI Search unified AI Gateway run logging.

## Potential Bugs And Security Concerns

- Severity is implemented as a filter over operational log status plus message/payload content because the existing log schema does not have a standalone severity column. A dedicated `severity` column would be cleaner if reporting needs strict severity semantics.
- `IntegrationService.list_imported_items` filters account visibility after pagination, so non-global users can receive pages with fewer visible records than `total`. This is acceptable for Admin-heavy review queues but should be tightened for broad KAM usage.
- Secrets are stored in encrypted JSON markers when configured through Admin settings; production may still prefer an external secret manager for rotation and centralized governance.
- Admin alert emails are sanitized, but the configured SMTP environment must remain ignored and must not be committed.

## Edge Cases Not Fully Handled

- Google Calendar external deletion and owner-calendar reassignment conflict reconciliation.
- Provider API rate limiting and partial-page sync recovery beyond current failure logging/retry.
- Sync overlap prevention when a scheduled sync and manual sync target the same adapter.
- Historical Fathom suggestions approved or rejected concurrently by multiple reviewers.
- Personal Fathom API key revocation and token rotation UX.
- CSAT retraction semantics; updates/corrections are supported, but explicit retraction workflow is not.

## Phase 3 Fixes Applied

- Added sync-run `failure_type` filtering in repository, service, and routes.
- Added sync-log `severity`, `date_from`, `date_to`, and `search` filtering in repository, service, and routes.
- Extended imported-item search to sanitized provider payloads for external participant metadata.
- Historical global Fathom webhook replay and pagination work remains in preserved code/data paths, but the admin/global endpoints are now retired.
- Added in-app Admin notifications for repeated integration failures.
- Added unified AI Gateway run logging for KYC extraction, Timeline AI Search, and signal explanations.
- Added tests for retired Fathom admin/global endpoints, log/imported-item search filters, sync-run failure filtering, and repeated-failure notifications.

## Verification

- `docker compose run --rm --no-deps backend python -m compileall app tests/test_governance.py tests/test_content_escalations_governance.py`
- `docker compose run --rm --no-deps backend pytest tests/test_governance.py tests/test_content_escalations_governance.py -q`
- `docker compose run --rm --no-deps frontend npx tsc --noEmit`
- `docker compose run --rm --no-deps frontend npm run test -- governance.test.ts meetingCapture.test.ts IntegrationsPanel.test.tsx GoogleCalendarOAuthCallback.test.tsx`
- `git diff --check`
