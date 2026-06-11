# Role-Based Dashboards

## Summary

Implements role-resolved dashboard behavior so users no longer see AM Home, KAM Head Portfolio, and Leadership Dashboard as a universal switcher. The backend now chooses the dashboard profile from the logged-in user's role, RBAC grants, and account scope.

## Requirement Links

- Planning source: `docs/plans/role-based-dashboard-plan.md`
- Source of truth: `requirements/Technical Module Logic and Developer Flows.pdf`
- Related spec: `specs/07-notifications-dashboards-and-reporting.md`

## Scope Implemented

- `GET /api/dashboards/me` returns the correct dashboard for Admin/Super Admin, KAM Head, AM/KAM, Leadership Viewer, Ops Lead, Delivery Lead, and RBAC-limited other roles.
- Existing direct dashboard endpoints return reduced current-user scope when the requested dashboard is not allowed for the caller role.
- Admin/Super Admin receive the platform-wide portfolio, risk, governance, commercial, and admin/system widgets in the backend-defined order.
- Leadership dashboard is read-only and masks commercial pipeline, revenue-risk, and forecast values.
- Forecast Chart is available where `analytics_portfolio:view` is allowed, and on the Account Manager dashboard from assigned-account opportunities with sensitive values masked before leaving the backend when required.
- Dashboard widgets and items include route metadata for source navigation.
- `delivery_lead` is added as the preferred system role while `delivery_stakeholder` remains a legacy-compatible delivery dashboard role.
- Dashboard UI now uses the approved V4 dashboard visual language from `Feature/Playbooks-Activities` while omitting the previous Generative command center.
- `governance_calendar` and `engagement_health` widgets are returned where role/RBAC permits.
- The dashboard calendar is rendered from `GET /api/governance-events/calendar`; `governance_calendar` is the visibility/enabler widget.
- Commercial opportunity, pipeline, revenue-risk, and forecast values are masked by the backend for roles that should not receive sensitive values.
- Dashboard panels must use persisted records or backend-derived aggregates only. Unsupported data is represented as an empty widget/state, not demo/sample payloads.
- Admin/system alerts are sourced from failed worker runs, failed notification records, integration error connections, and persisted account-change alert counts.
- Executive summaries are account fact rows from authorized account records, not generated placeholder prose.
- Stale KYC, Renewal focus, Health distribution, SLA compliance, Account-change alerts, Decision queue, and escalation panels are omitted from all role dashboards.
- Account Manager dashboard scope is intentionally focused on clickable attention tiles, paginated account portfolio table, critical tasks, merged task breakdown/listing, opportunities/pipeline, assigned-account forecast, and the global governance calendar. Duplicate AI task summary, escalation, upcoming-governance, and governance-cadence panels are omitted for this role.
- All role dashboards now expose governance through `governance_calendar` only; standalone upcoming-governance and governance-cadence dashboard panels are omitted.
- AM workload counts active AM ownership assignments, including supporting AM ownership records, deduped per owner/account.
- AM workload rows link to `/accounts?primary_am=<user_id>`, and KAM Head/Admin account lists expose an Account Manager filter.
- At-risk accounts are defined as `warning` or `critical` risk status; at-risk dashboard routes use `risk=at_risk` and row clicks open the account Health tab.
- At-risk dashboard rows now include a derived user-facing reason from risk status, health-score thresholds, and relevant lifecycle status instead of exposing only a raw risk label.
- 6-Month Revenue Forecast is calculated for the current dashboard account scope by default and can be filtered to a single account through dashboard/account forecast filters.
- Dashboard filter state is URL-backed so tile clicks, manual filters, pagination, and browser refreshes use the same request parameters.
- User-facing account number/internal ID display is hidden from account cards, account tables, account detail headers, engagement source-document summaries, and KYC run summaries.
- Report-builder field selection hides raw internal identifier fields such as account, task, signal, escalation, and opportunity IDs while preserving backend compatibility for existing saved reports.
- Dashboard-specific dead code for removed Health Distribution, Account-change Alerts, and escalation widgets has been removed so those panels are not reintroduced accidentally.
- Account bulk CSV export no longer includes the dashboard-removed open-escalations column.
- Account Manager opportunities/pipeline uses the compact reference layout with Open opps, Total value, and Stalled tiles plus data-source/stalled-signal rows. Assigned-account opportunity values are shown when `opportunity_management:view` is available; unauthorized/commercial-sensitive values remain backend-masked.
- Dashboard top metric tiles are clickable for all roles, using backend-provided routes when present and route fallbacks by metric key otherwise.
- Task summary tiles deep-link to `/tasks` with real module filters (`status`, `due`, `my_items`, and account query aliases). AI task summary source-count tiles also link to their source module.
- Opportunity Open opps/Total value/Stalled tiles deep-link to `/opportunities` with persisted API filters (`open_only` and `stalled`) rather than client-only or hardcoded filtering.

## Backend

- Router: `backend/app/routers/dashboards.py`
- Service: `backend/app/services/dashboards.py`
- Repository: `backend/app/repositories/dashboards.py`
- Opportunity filter API: `backend/app/routers/opportunities.py`, `backend/app/services/opportunities.py`, `backend/app/repositories/opportunities.py`
- Schemas: `backend/app/schemas.py`
- RBAC seed: `backend/app/rbac.py`
- Owner eligibility: `backend/app/services/accounts.py`

## Frontend

- Page: `frontend/src/pages/Dashboard.tsx`
- Components: `frontend/src/components/dashboard/RoleDashboard.tsx`
- API service: `frontend/src/services/notificationsReporting.ts`
- Calendar API service: `frontend/src/services/governance.ts`
- Role types: `frontend/src/types/user.ts`, `frontend/src/types/timeline.ts`

## Tests

- Backend: `backend/tests/test_notifications_dashboards_reporting.py`
- Backend opportunity filter coverage: `backend/tests/test_opportunities.py`
- Frontend: `frontend/src/pages/Dashboard.test.tsx`
- Frontend task/opportunity link coverage: `frontend/src/pages/Tasks.test.tsx`, `frontend/src/services/opportunities.test.ts`

Latest verification:

- `python3 -m py_compile backend/app/services/dashboards.py backend/app/repositories/dashboards.py backend/app/repositories/accounts.py backend/app/routers/dashboards.py backend/app/routers/accounts.py` passed after dashboard filtering and widget cleanup.
- `docker compose run --rm --no-deps frontend npm run typecheck` passed after dashboard/account UI cleanup.
- `docker compose run --rm --no-deps frontend npm test -- --run src/pages/Dashboard.test.tsx src/pages/Accounts.test.tsx src/pages/Notifications.test.tsx` passed with 13 tests after dashboard/account filter and ID-display cleanup.
- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py::test_role_based_dashboard_profiles_and_reduced_direct_endpoints tests/test_notifications_dashboards_reporting.py::test_notification_preferences_validation_pagination_and_read -q` passed with 2 tests after dashboard widget cleanup.
- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py -q` passed 7 tests and failed 2 unrelated seed assumptions because this branch no longer seeds `delivery_stakeholder` and `commercial_stakeholder` demo users expected by those legacy tests.
- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py -q` passed with 9 tests after dashboard panel functionality fixes.
- `docker compose run --rm --no-deps frontend npm test -- Dashboard.test.tsx` passed with 9 tests after health donut, portfolio paging, and AM workload rendering coverage.
- `docker compose run --rm --no-deps frontend npm run typecheck` passed after dashboard pagination/rendering updates.
- `docker compose run --rm --no-deps backend python -m py_compile app/services/dashboards.py app/repositories/dashboards.py app/routers/dashboards.py` passed.
- `docker compose run --rm --no-deps frontend npm test -- Dashboard.test.tsx` passed with 4 tests after generic top/task/opportunity tile clickability coverage.
- `docker compose run --rm --no-deps frontend npm run typecheck` passed after generic tile clickability updates.
- `python3 -m py_compile backend/app/services/dashboards.py` passed.
- `python3 -m py_compile backend/app/routers/opportunities.py backend/app/services/opportunities.py backend/app/repositories/opportunities.py backend/app/services/dashboards.py` passed.
- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py -q` passed with 9 tests after removing Stale KYC and Renewal focus panels.
- `docker compose run --rm --no-deps frontend npm test -- Dashboard.test.tsx` passed with 3 tests after removing Stale KYC and Renewal focus panels.
- `docker compose run --rm --no-deps frontend npm run typecheck` passed.
- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py tests/test_opportunities.py -q` passed with 11 tests before the final active-only repository cleanup; a later rerun stalled in Docker after 10 passing tests and its one-off container was stopped.
- `docker compose run --rm --no-deps backend pytest tests/test_opportunities.py::test_opportunity_create_list_stage_decision_action_archive_flow -q` passed after the final active-only repository cleanup.
- `docker compose run --rm --no-deps frontend npm test -- Dashboard.test.tsx Tasks.test.tsx opportunities.test.ts` passed with 10 tests.

## Known Follow-Ups

- Decide whether existing `delivery_stakeholder` users should be migrated to `delivery_lead` or kept as a visible legacy role.
- Replace MVP forecast weights with finalized forecasting rules when available.
- Introduce a centralized dashboard/report/export redaction service for sensitive fields beyond the current Leadership commercial masking.
