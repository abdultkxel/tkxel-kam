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
- Admin/Super Admin receive the platform-wide portfolio, risk, governance, commercial, decision, and admin/system widgets in the backend-defined order.
- Leadership dashboard is read-only and masks commercial pipeline, revenue-risk, and forecast values.
- Forecast Chart is available where `analytics_portfolio:view` is allowed, and on the Account Manager dashboard from assigned-account opportunities with sensitive values masked before leaving the backend when required.
- Dashboard widgets and items include route metadata for source navigation.
- `delivery_lead` is added as the preferred system role while `delivery_stakeholder` remains a legacy-compatible delivery dashboard role.
- Dashboard UI now uses the approved V4 dashboard visual language from `Feature/Playbooks-Activities` while omitting the previous Generative command center.
- `governance_calendar`, `account_change_alerts`, and `engagement_health` widgets are returned where role/RBAC permits.
- The dashboard calendar is rendered from `GET /api/governance-events/calendar`; `governance_calendar` is the visibility/enabler widget.
- Commercial opportunity, pipeline, revenue-risk, and forecast values are masked by the backend for roles that should not receive sensitive values.
- Dashboard panels must use persisted records or backend-derived aggregates only. Unsupported data is represented as an empty widget/state, not demo/sample payloads.
- Admin/system alerts are sourced from failed worker runs, failed notification records, integration error connections, and persisted account-change alert counts.
- Executive summaries are account fact rows from authorized account records, not generated placeholder prose.
- Account Manager dashboard scope is intentionally focused on clickable attention tiles, account portfolio table, signals/critical tasks, merged task breakdown/listing, upcoming governance, opportunities/pipeline, assigned-account forecast, and the governance calendar. Stale KYC, renewal focus, duplicate AI task summary, and escalation panels are omitted for this role.

## Backend

- Router: `backend/app/routers/dashboards.py`
- Service: `backend/app/services/dashboards.py`
- Repository: `backend/app/repositories/dashboards.py`
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
- Frontend: `frontend/src/pages/Dashboard.test.tsx`

Latest verification:

- `docker compose run --rm --no-deps backend pytest tests/test_notifications_dashboards_reporting.py -q` passed with 9 tests.
- `docker compose run --rm --no-deps frontend npm test -- Dashboard.test.tsx` passed with 3 tests.
- `docker compose run --rm --no-deps frontend npm run typecheck` passed.
- `npm --prefix frontend test -- Dashboard.test.tsx` passed with 3 tests.
- `npm --prefix frontend run typecheck` passed.
- `make test` passed: backend 117 tests and frontend 59 tests.

## Known Follow-Ups

- Decide whether existing `delivery_stakeholder` users should be migrated to `delivery_lead` or kept as a visible legacy role.
- Replace MVP forecast weights with finalized forecasting rules when available.
- Introduce a centralized dashboard/report/export redaction service for sensitive fields beyond the current Leadership commercial masking.
