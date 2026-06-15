# API-Backed Demo Runtime Data

## Summary

The demo frontend must not show locally seeded/mock store records. Runtime views should render persisted API data, user-created session data, or empty states when a backend source is not available yet.

For this project, "directly from DB" means:

1. React reads data through authenticated backend APIs.
2. Backend services/repositories read and write the database.
3. Browser stores may only hold ephemeral UI state, request state, or an API response cache that is cleared/reloaded from the API. They must not be the source of business/runtime records.

## Scope

- Reset local Zustand stores that previously initialized accounts, timeline entries, governance events, alerts, notifications, score snapshots, activity tasks, integration logs, and V3 workspace records from frontend mock files.
- Remove runtime imports from `@/data/mock` and `@/data/v3Mock` in application components and stores.
- Keep account detail opportunities and governance tabs hydrated from backend APIs when an account is opened.
- Stop Playbook recommendations from using a fabricated signal id when no backend signal exists.
- Remove fixed fixture user ids from the legacy local retention helper.
- Keep login validation controlled by React/backend error handling rather than native required-field behavior.

## Decisions

- Empty states are preferred over showing local sample data.
- Frontend mock modules may remain in the repository for historical/tests only, but production runtime code must not import them.
- Demo data should come from backend seed commands and normal APIs, not frontend store initialization.
- UI constants such as labels, filters, enum display text, and empty-state copy can stay in code. Runtime records such as accounts, alerts, tasks, timeline entries, retention policies/runs, notifications, segment catalogs, and sensitive policies must be API-backed.

## Changes On 2026-06-12

- `AccountDetail` no longer falls back to or writes through `accountStore`; it renders only data loaded from `GET /api/accounts/{id}`.
- `Tasks` now loads account filter/create-task options from `GET /api/accounts` instead of `accountStore`.
- `AddGovernanceEventDialog` now loads its account selector from `GET /api/accounts` when the dialog opens.
- `GovernancePanel` now loads account filters from `GET /api/accounts` and removed the local-store calendar fallback. Calendar data comes from `GET /api/calendar/items`; API failure or empty DB state now shows an error/empty state.
- Removed the unused legacy `GovernanceDashboard` component because it built calendar data only from local stores.

## Changes On 2026-06-14

- `AppShell` no longer globally preloads account business records from `accountStore` and no longer creates synthetic governance notifications from local stores.
- Account selectors in opportunities, governance, timeline notes, alert overview, CSV import, and scoring builder now use `GET /api/accounts`.
- `Account360` now reads timeline entries from `GET /api/accounts/{id}/timeline`, recalculates/persists scores through score APIs, and refreshes alerts through backend alert evaluation instead of local account/score/timeline stores.
- `AccountWorkspacePanel` now loads documents, notes, and account workspace data through backend services only; the V3 store fallback and local timeline side effects were removed.
- KYC intake uploads attachments, creates KYC drafts, and creates review tasks through backend APIs only.
- Score calculator activities now read and update task/evidence records through `/api/tasks` and no longer import `scoreActivityStore` or `scoreActivityTemplates`.
- Timeline note/comment flows no longer synthesize browser notifications; mentions are sent through the backend timeline APIs.
- AI brief edits and KYC workflow changes now persist through `createTimelineNote` instead of the local timeline emitter.
- `timelineRetention.ts` now runs backend retention policies instead of mutating integration/notification/timeline stores.
- The unused local timeline emitter, score activity action helper, and local `useTimeline` hook were deleted.

## Remaining Runtime Data Audit

No reachable runtime blockers remain from the audited set. Legacy store modules may still exist for historical/test code, but runtime pages, components, hooks, services, and utilities do not import the disallowed stores or frontend mock data.

The only runtime store imports left after the scan are:

- `uiStore` for ephemeral UI state.
- `governanceStore`, whose actions call governance backend services and cache API responses.
- `opportunityStore`, whose actions call opportunity backend services and cache API responses.

## Possible Future API Designs

These are not required by the current reachable runtime after the cleanup, but they document useful API shapes if the retired settings panels return.

### Admin Segment Catalog

- Table: `account_segments` with `id`, `slug`, `name`, `description`, `display_order`, `is_active`, `created_by_id`, `updated_by_id`, timestamps.
- Routes:
  - `GET /api/admin/segments?page=&page_size=&active_state=&search=`
  - `POST /api/admin/segments`
  - `PATCH /api/admin/segments/{segment_id}`
- Validation:
  - Slug unique and snake/kebab safe.
  - Name required, max 80 chars.
  - Cannot deactivate a segment still used by active accounts unless `force=true`.
- Frontend replacement:
  - `SegmentSettings` reads and mutates this API only.

### Sensitive Policy Projection

- Option A, preferred if no new policy model is needed: expose sensitive field definitions from existing Field Builder APIs plus audit history from `GET /api/admin/audit-logs`.
- Option B, if the UI needs policy-level records: add `sensitive_access_policies` with module, field key, role grants, retention behavior, notification behavior, and audit metadata.
- Routes:
  - `GET /api/admin/sensitive-policies?module=&search=`
  - `PATCH /api/admin/sensitive-policies/{policy_id}`
  - `GET /api/admin/sensitive-policy-audits?policy_id=&actor_id=&date_from=&date_to=`
- Frontend replacement:
  - `SensitivePolicyTable` should render real policy and audit rows from these APIs, never `integrationStore`.

## Existing API Reuse

- Alert rules: use frontend service functions for `GET/POST/PATCH /api/admin/signal-rules`; use `/api/analytics/account-change-alerts` for account alert rows.
- Notifications: use `frontend/src/services/notificationsReporting.ts`.
- Timeline retention: use `frontend/src/services/timeline.ts` retention functions.
- Score activities: use `frontend/src/services/playbooksTasks.ts` task/evidence/calendar functions and playbook template APIs.
- Account workspace: use `frontend/src/services/accountWorkspace.ts` for accounts, source documents, onboarding drafts, and engagements.
- Retention plans: use `frontend/src/services/relationshipsPlanning.ts`.

## Test Notes

- 2026-06-14 verification:
  - Forbidden runtime store/mock scan returned no matches for account, V3, score activity, alert, notification, integration, timeline, AI summary, local timeline emitter, or frontend mock data sources.
  - Broader store scan only found `uiStore` plus `governanceStore`/`opportunityStore`; the latter two are API response caches whose actions call backend services.
  - `docker compose run --rm --no-deps frontend npm run typecheck` passed.
  - `docker compose run --rm --no-deps frontend npm run test -- ScoreCalculators.test.tsx` passed.
- Runtime mock import scan:
  `rg -n "@/data/mock|@/data/v3Mock|usr-00[0-9]|amd-001|manual-signal|dummy" frontend/src -g '!**/data/mock.ts' -g '!**/data/v3Mock.ts' -g '!*.test.tsx' -g '!*.test.ts'`
- Runtime store import scan:
  `rg -n "useAccountStore|useV3Store|useScoreActivityStore|useAlertStore|useNotificationStore|useIntegrationStore|useTimelineStore|useAISummaryStore|emitTimelineEvent|@/data/scoreActivityTemplates" frontend/src/pages frontend/src/components frontend/src/hooks frontend/src/services frontend/src/utils -g '!*.test.ts' -g '!*.test.tsx'`
- API-cache/UI store scan:
  `rg -n "from '@/stores|from \"@/stores" frontend/src/pages frontend/src/components frontend/src/hooks frontend/src/services frontend/src/utils -g '!*.test.ts' -g '!*.test.tsx'`
- Frontend typecheck should be run after each cleanup pass. Remaining failures, if any, should be recorded with the owning component and whether they predate the API-backed work.
