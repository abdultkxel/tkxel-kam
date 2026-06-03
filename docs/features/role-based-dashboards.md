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
- Admin/Super Admin default to KAM Head Portfolio plus an admin/system widget.
- Leadership dashboard is read-only and masks commercial pipeline, revenue-risk, and forecast values.
- Forecast Chart is available as an MVP stage-weighted open-opportunity widget.
- Dashboard widgets and items include route metadata for source navigation.
- `delivery_lead` is added as the preferred system role while `delivery_stakeholder` remains a legacy-compatible delivery dashboard role.

## Backend

- Router: `backend/app/routers/dashboards.py`
- Service: `backend/app/services/dashboards.py`
- Repository: `backend/app/repositories/dashboards.py`
- Schemas: `backend/app/schemas.py`
- RBAC seed: `backend/app/rbac.py`
- Owner eligibility: `backend/app/services/accounts.py`

## Frontend

- Page: `frontend/src/pages/Dashboard.tsx`
- API service: `frontend/src/services/notificationsReporting.ts`
- Role types: `frontend/src/types/user.ts`, `frontend/src/types/timeline.ts`

## Tests

- Backend: `backend/tests/test_notifications_dashboards_reporting.py`
- Frontend: `frontend/src/pages/Dashboard.test.tsx`

## Known Follow-Ups

- Decide whether existing `delivery_stakeholder` users should be migrated to `delivery_lead` or kept as a visible legacy role.
- Replace MVP forecast weights with finalized forecasting rules when available.
- Introduce a centralized dashboard/report/export redaction service for sensitive fields beyond the current Leadership commercial masking.
