# Role-Based Dashboard Plan

## Product Decisions From Re-Analysis

These decisions were confirmed after the initial planning pass and should drive implementation:

- Use Tkxel terminology `Delivery Lead` as the product-facing role name.
- Treat existing `delivery_stakeholder` and new/planned `delivery_lead` as the same dashboard audience during migration, but the preferred system role should be `delivery_lead`.
- Admin and Super Admin should default to KAM Head Portfolio with extra admin/system widgets, not a separate Admin Dashboard.
- Admin and Super Admin should not get a "view as dashboard" switch in the first implementation.
- KAM Head should see only KAM Head Portfolio, not Leadership Dashboard.
- Ops Lead dashboard scope should include all three sources: account ownership role, engagement ownership/assignment, and directly assigned tasks.
- Delivery Lead scope should come from DL/account assignment and engagement assignment. If no Delivery Lead is assigned, the dashboard should show empty/limited data without failing.
- Forecast Chart should be implemented directly in the dashboard now.
- Leadership Viewer commercial pipeline values should be masked by default.
- Existing direct dashboard endpoints should return permission-scoped reduced widgets rather than a full unauthorized dashboard or a hard 403.
- Widget rules should be hard-coded by role for the first implementation, not configured in Admin Settings.

## Plan Review Verification

This review is documentation-only. No application code, UI route, API route, database schema, migration, or business logic has been changed as part of this dashboard planning review.

Checklist:

- Admin/Super Admin, KAM Head, KAM/AM, Leadership Viewer/Executive, Ops Lead, and Delivery Lead have separate dashboard behavior.
- Admin/Super Admin default to KAM Head Portfolio with extra admin/system widgets, which is distinct from the KAM Head-only portfolio behavior.
- Other roles use RBAC-based widget visibility through the `rbac_widgets` dashboard profile and module/field-level permission checks.
- The current issue of showing all dashboards to every user is addressed by removing the normal-user dashboard mode switch and adding backend role/profile resolution through `GET /api/dashboards/me`.
- Existing direct dashboard endpoints are planned to return permission-scoped reduced widgets so they cannot expose unauthorized full-dashboard data.
- Governance Calendar remains out of the sidebar and is planned as a role-appropriate dashboard widget/link.
- Widgets are mapped to their correct source modules/tabs in the widget link mapping table.
- Leadership dashboard is read-only, with no create/update/delete/refresh controls that mutate official records.
- Sensitive commercial, financial, escalation, executive, attachment, and source widgets must respect RBAC and field-level security before leaving the backend.
- Required system roles are planned as non-deletable through `Role.is_system`, backend delete protection, frontend disabled delete controls, and tests.

## 1. Current Dashboard Implementation

The current frontend has one dashboard page at `frontend/src/pages/Dashboard.tsx`. It keeps a local `mode` state with three hard-coded options:

- `am` -> AM Home
- `portfolio` -> KAM Head Portfolio
- `leadership` -> Leadership

Evidence:

- `frontend/src/pages/Dashboard.tsx` defines `type DashboardMode = 'am' | 'portfolio' | 'leadership'`.
- `frontend/src/pages/Dashboard.tsx` renders all three mode buttons from `modeLabels`.
- `frontend/src/pages/Dashboard.tsx` chooses one of `getAmHomeDashboard`, `getKamHeadPortfolio`, or `getLeadershipDashboard` based only on local frontend state.
- `frontend/src/services/notificationsReporting.ts` exposes all three dashboard API calls to any caller with a token.

Backend dashboard implementation exists in:

- `backend/app/routers/dashboards.py`
- `backend/app/services/dashboards.py`
- `backend/app/repositories/dashboards.py`
- `backend/app/schemas.py` with `DashboardRead`, `DashboardWidgetRead`, and `TaskSummaryRefreshRead`.

The technical logic source of truth, `requirements/Technical Module Logic and Developer Flows.pdf`, section 18, defines dashboards as role-specific attention-first views:

- AM Home: assigned accounts, signals, overdue activities, stale KYC, renewals, open escalations, opportunities, tasks, AI task summary.
- KAM Head Portfolio: health distribution, high-risk accounts, stale KYC, escalations, renewal focus, AM workload, overdue actions, governance cadence, proactive account-change alerts.
- Leadership Dashboard: strategic health, retention outlook, growth pipeline, revenue risk, major escalations, executive summaries, decision queue.

## 2. Current Dashboard Routes

Frontend routes:

| Route | Component | Evidence |
|---|---|---|
| `/dashboard` | `Dashboard` | `frontend/src/App.tsx` |
| `/` | Redirects to `/dashboard` | `frontend/src/App.tsx` |
| `/alerts` | Redirects to `/dashboard` | `frontend/src/App.tsx` |

Backend API routes:

| Endpoint | Current purpose | Evidence |
|---|---|---|
| `GET /api/dashboards/am-home` | AM Home dashboard | `backend/app/routers/dashboards.py` |
| `POST /api/dashboards/am-home/task-summary/refresh` | Refresh AI Task Summary | `backend/app/routers/dashboards.py` |
| `GET /api/dashboards/kam-head-portfolio` | KAM Head Portfolio dashboard | `backend/app/routers/dashboards.py` |
| `GET /api/dashboards/leadership` | Leadership dashboard | `backend/app/routers/dashboards.py` |

Current route gap:

- There is no role-aware `GET /api/dashboards/me` endpoint.
- Existing endpoints check `dashboards_reporting:view` but do not enforce that the requested dashboard type matches the logged-in role.

## 3. Current Dashboard Components/Widgets

Current frontend component:

- `frontend/src/pages/Dashboard.tsx`

Current frontend widget renderers:

- `TaskSummaryCard`
- `WidgetCard`
- `DashboardLoading`
- `EmptyDashboard`

Current backend widget keys:

| Dashboard | Widget keys | Evidence |
|---|---|---|
| AM Home | `summary`, `ai_task_summary`, `accounts`, `tasks`, `signals`, `escalations`, `opportunities`, `governance` | `backend/app/services/dashboards.py` |
| KAM Head Portfolio | `health_distribution`, `high_risk_accounts`, `stale_kyc`, `escalations`, `renewal_focus`, `am_workload`, `overdue_actions`, `governance_cadence`, `sla_compliance` | `backend/app/services/dashboards.py` |
| Leadership | `strategic_health`, `retention`, `growth`, `revenue_risk`, `major_escalations`, `executive_summaries`, `decision_queue` | `backend/app/services/dashboards.py` |

Current widget response shape:

- `key`
- `title`
- `status`
- `generated_at`
- `data_scope`
- `value`
- `items`
- `metadata`
- `error`

Evidence: `backend/app/schemas.py`.

Current widget gaps:

- Widgets do not have a first-class `links` or `primary_route` field.
- Many item rows include IDs but no route.
- `WidgetCard` renders item values as text instead of source links.
- Forecast Chart is not part of the current dashboard API. Forecast/analytics behavior appears closer to `frontend/src/pages/Analytics.tsx` and `backend/app/services/analytics.py`, but the re-analysis decision is to implement Forecast Chart directly on Dashboard.
- Global/Governance Calendar is not represented as a calendar widget in `Dashboard.tsx`; dashboard has only governance list/cadence projections.

## 4. Current Role/RBAC Implementation

Default roles are defined in `backend/app/rbac.py`:

- `super_admin`
- `admin`
- `account_manager`
- `ops_lead`
- `kam_head`
- `leadership_viewer`
- `content_specialist`
- `commercial_stakeholder`
- `delivery_stakeholder`

Re-analysis decision:

- The product-facing role should be Delivery Lead.
- Existing `delivery_stakeholder` is functionally the same audience, but the preferred system role slug should be `delivery_lead` for Tkxel terminology.
- Implementation should either add `delivery_lead` as a system role while keeping `delivery_stakeholder` as a backward-compatible alias, or rename/migrate existing local role usage carefully. The plan recommends additive aliasing first to avoid breaking existing tests and records.
- Frontend role typing should add `delivery_lead` while keeping `delivery_stakeholder` until migration is complete.

Frontend role type is defined in `frontend/src/types/user.ts` and includes:

- `am`
- `account_manager`
- `leadership`
- `leadership_viewer`
- `admin`
- `super_admin`
- `ops_lead`
- `kam_head`
- `content_specialist`
- `commercial_stakeholder`
- `delivery_stakeholder`

Current role/RBAC behavior:

- Backend uses module/action permissions seeded through `RbacService.seed_defaults()` in `backend/app/services/rbac.py`.
- Dashboard services call `AccountAccessService.require_module_permission(current_user, "dashboards_reporting", "view")`.
- Default roles generally receive `dashboards_reporting:view`, so they can all call all existing dashboard endpoints.
- `GLOBAL_VIEW_ROLES` in `backend/app/services/account_access.py` is used by dashboards indirectly to decide portfolio vs assigned-account scope.

Current UI role helper:

- `frontend/src/hooks/useRole.ts` returns authenticated user or fallback mock `currentUser`.
- The mock fallback has role `leadership` in `frontend/src/data/mock.ts`.
- In authenticated routes this should usually be replaced by real user context, but it is still risky for demo and test paths because it can bias UI toward leadership behavior.

## 5. Current Issue Causing All Dashboards To Show To All Users

Primary issue:

- `frontend/src/pages/Dashboard.tsx` renders all dashboard mode buttons for all authenticated users with no role filtering.

Secondary issue:

- Backend endpoints in `backend/app/routers/dashboards.py` and `backend/app/services/dashboards.py` enforce only `dashboards_reporting:view`, not dashboard-type authorization.

Result:

- Any user with `dashboards_reporting:view` can click AM Home, KAM Head Portfolio, and Leadership in the UI.
- Any user with `dashboards_reporting:view` can directly call all three dashboard APIs.
- Leadership read-only behavior is not represented in the dashboard API response or enforced by the dashboard frontend.

## 6. Proposed Dashboard Routing Logic

Preferred backend-led routing:

1. Add `GET /api/dashboards/me`.
2. Backend reads `current_user.role`.
3. Backend resolves a dashboard profile:
   - `kam_head_portfolio`
   - `am_home`
   - `leadership`
   - `operations`
   - `delivery`
   - `rbac_widgets`
4. Backend returns only widgets allowed for the user role and permissions.
5. Frontend `/dashboard` calls only `GET /api/dashboards/me`.
6. Frontend does not render the AM/KAM Head/Leadership mode switch for normal users.

Role-to-dashboard mapping:

| Role/group | Default dashboard profile |
|---|---|
| `super_admin`, `admin` | `kam_head_portfolio` with extra admin/system widgets |
| `kam_head` | `kam_head_portfolio` |
| `account_manager`, `am` | `am_home` |
| `leadership_viewer`, `leadership`, executive aliases | `leadership` read-only |
| `ops_lead` | `operations` |
| `delivery_lead`, `delivery_stakeholder` legacy alias | `delivery` |
| Other roles | `rbac_widgets` composed only from permitted widgets |

Compatibility approach:

- Keep the existing three endpoints initially for backward compatibility.
- Add backend reduced-widget behavior to existing endpoints:
  - AM Home endpoint should return assigned/permission-scoped AM-style widgets for callers that are not AMs.
  - KAM Head Portfolio endpoint should return only widgets allowed by the caller role and RBAC, not the full KAM Head view.
  - Leadership endpoint should return read-only and redacted widgets where permitted; it must not expose unmasked commercial values to Leadership Viewer.
  - Direct endpoint calls should never disclose data outside the caller's dashboard profile, account scope, field permissions, or module permissions.
- The frontend should stop calling these directly for normal dashboard rendering. No Admin/Super Admin "view as dashboard" control should be added in the first implementation.

Admin/Super Admin behavior:

- Admin/Super Admin may have broader visibility.
- They should not see the same uncontrolled three-button switch shown to all users.
- Admin/Super Admin should default to KAM Head Portfolio with additional admin/system widgets.
- Skip any Admin/Super Admin "view as dashboard" control in the first implementation.

KAM Head behavior:

- KAM Head should see KAM Head Portfolio only.
- KAM Head should not see Leadership Dashboard.

## 7. Proposed Dashboard Layout Per Role

### Admin / Super Admin

Purpose: platform-wide attention, setup health, and governance oversight.

Recommended widgets:

- Account Portfolio Table
- At Risk Accounts
- Signals / Critical Tasks
- Open Escalations
- Upcoming Governance
- Global / Governance Calendar
- Health Distribution
- Stale KYC
- Renewal Focus
- Opportunities / Pipeline
- Decision Queue
- Admin/system alerts where available
- Forecast Chart

Notes:

- Commercial/financial widgets must respect RBAC and field-level security.
- Admin/Super Admin can use broader filters and exports if `dashboards_reporting:export` is granted.

### KAM Head

Purpose: portfolio-level account governance and AM workload.

Recommended widgets:

- Health Distribution
- At Risk Accounts
- Stale KYC
- Renewal Focus
- Open Escalations
- Signals / Critical Tasks
- Account Portfolio Table
- AM Workload
- Upcoming Governance
- Governance Cadence
- Global / Governance Calendar
- Opportunities / Pipeline
- Decision Queue
- Proactive account-change alerts where implemented
- Forecast Chart

### KAM / AM / Account Manager

Purpose: assigned-account attention view.

Recommended widgets:

- My Accounts
- Signals / Critical Tasks
- Tasks Summary
- AI Task Summary
- Stale KYC
- Renewal Focus
- Upcoming Governance
- Open Escalations
- Opportunities / Pipeline
- Assigned-account mini portfolio table
- Forecast Chart for assigned/authorized accounts

### Leadership Viewer / Executive

Purpose: read-only strategic visibility.

Recommended widgets:

- Strategic Health / Health Distribution
- Retention Outlook
- Opportunities / Pipeline with commercial values masked by default
- Forecast Chart with commercial values masked by default
- Revenue Risk masked by default
- Major Escalations
- Executive Summaries
- Decision Queue
- Governance Calendar summary without edit controls

Rules:

- No create/update/delete controls.
- Widget rows link only to read-only account/source views.
- Sensitive fields must be hidden or masked before leaving the backend.

### Ops Lead

Purpose: operational delivery and escalation focus.

Scope:

- Account ownership role `ops_lead`.
- Engagement ownership/assignment where available.
- Directly assigned tasks.

Recommended widgets:

- Operational Tasks Summary
- Signals / Critical Tasks
- Open Escalations
- Upcoming Governance
- Governance Calendar filtered to operational/delivery reviews
- At Risk Accounts where Ops Lead has account ownership/access
- Delivery/engagement health items where implemented
- Decision Queue limited to operational blockers

### Delivery Lead

Current role mapping decision:

- Tkxel product terminology should use Delivery Lead.
- Current code has `delivery_stakeholder`; implementation should introduce `delivery_lead` as the preferred system role and keep `delivery_stakeholder` as a legacy-compatible alias/group until existing references are migrated.
- Delivery Lead scope should come from account/engagement DL assignment. If no Delivery Lead is assigned, show empty or assigned-task-only widgets.

Recommended widgets:

- Delivery-focused Tasks Summary
- Delivery risk signals
- Open delivery escalations
- Engagement/SOW health items
- Upcoming delivery reviews/governance
- Resource/delivery score placeholders only where supported
- Account links limited to authorized delivery scope

### Other Roles

Purpose: no full custom dashboard by default.

Rules:

- Show only widgets allowed by RBAC and account scope.
- `content_specialist` might see content-related tasks/notifications only if supported.
- `commercial_stakeholder` might see renewal/opportunity/commercial widgets where RBAC allows and sensitive field policy permits.
- If no widgets are allowed, show the existing empty state with a clear "No dashboard widgets are available for your role" message.

## 8. Widget-To-Role Visibility Matrix

Legend:

- `Y`: visible by default
- `RBAC`: visible only if module/action and field-level permissions allow it
- `RO`: read-only
- `N`: hidden
- `Partial`: visible with restricted/masked content

| Widget | Admin/Super Admin | KAM Head | KAM/AM | Leadership/Executive | Ops Lead | Delivery Lead | Other roles |
|---|---:|---:|---:|---:|---:|---:|---:|
| My Accounts | Y | Partial | Y | N | Partial | Partial | RBAC |
| At Risk Accounts | Y | Y | Assigned only | RO | Assigned/authorized | Assigned/authorized | RBAC |
| Signals / Critical Tasks | Y | Y | Y | RO summary | Y | Y | RBAC |
| Upcoming Governance | Y | Y | Y | RO | Y | Y | RBAC |
| Tasks Summary | Y | Y | Y | RO summary | Y | Y | RBAC |
| Account Portfolio Table | Y | Y | Assigned only | RO strategic | Authorized only | Authorized only | RBAC |
| Forecast Chart | Y | Y | Assigned scope | RO masked | Operational only | Delivery only | RBAC |
| Global / Governance Calendar | Y | Y | Assigned/authorized | RO summary | Authorized | Authorized | RBAC |
| Health Distribution | Y | Y | Assigned scope | RO | Authorized | Authorized | RBAC |
| Stale KYC | Y | Y | Y | RO summary | N | N | RBAC |
| Renewal Focus | Y | Y | Y | RO strategic | Partial | Partial | RBAC |
| Open Escalations | Y | Y | Y | RO major only | Y | Y | RBAC |
| Opportunities / Pipeline | Y | Y | Y | RO masked | N | Partial | RBAC |
| Executive Summaries | Y | Y | N | RO | N | N | RBAC |
| Decision Queue | Y | Y | Assigned decisions | RO | Operational only | Delivery only | RBAC |
| AI Task Summary | Y | Y | Y | RO/generated summary only | Y | Y | RBAC |
| AM Workload | Y | Y | N | N | N | N | N |
| SLA Compliance | Y | Y | N | RO summary | Y | Y | RBAC |
| Proactive account-change alerts | Y | Y | Assigned only | RO summary | Authorized only | Authorized only | RBAC |

## 9. Required Changes To Make Core Roles Non-Deletable

Current backend behavior:

- `backend/app/models.py` has `Role.is_system`.
- `backend/app/services/rbac.py` prevents deleting `role.is_system`.
- `backend/app/repositories/rbac.py` seeds all `DEFAULT_ROLES` as `is_system=True`.
- `backend/tests/test_rbac.py` already tests system role deletion protection.

Current frontend behavior:

- `frontend/src/components/admin/AdminRolesPanel.tsx` disables the Delete button for `role.is_system`.

Required planning checks:

- Confirm all core dashboard roles exist in `backend/app/rbac.py` as `DEFAULT_ROLES`.
- Confirm Admin/Super Admin, KAM Head, Account Manager/KAM, Leadership Viewer, Ops Lead, and Delivery role are `is_system=True`.
- Add or migrate to a Delivery Lead system role:
  - Preferred slug: `delivery_lead`.
  - Display name: `Delivery Lead`.
  - Keep `delivery_stakeholder` as a backward-compatible role/group alias until existing users/tests/data are migrated.
- Keep `super_admin` hidden from role management as currently done by `backend/app/repositories/rbac.py` and `frontend/src/components/admin/AdminRolesPanel.tsx`.
- If adding `delivery_lead`, update seeds/tests/docs; no deletion should be allowed because it must be a system role.

## 10. Required Frontend Changes

Files likely to change:

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/services/notificationsReporting.ts`
- `frontend/src/types/user.ts`
- `frontend/src/components/layout/Sidebar.tsx` only if dashboard labels/visibility need small navigation support.
- `frontend/src/components/layout/MobileNav.tsx` only if sidebar logic changes.
- Dashboard tests to add, likely `frontend/src/pages/Dashboard.test.tsx`.

Required UI behavior:

- Remove normal-user mode buttons for AM Home, KAM Head Portfolio, and Leadership.
- Resolve dashboard type from the logged-in user role or from backend `GET /api/dashboards/me`.
- Show role-specific title and description.
- Render only widgets returned by backend for that user.
- Render dashboard item links where `route` or `primary_route` exists.
- For Leadership dashboard, render read-only cards and suppress all refresh/create/update controls unless explicitly safe.
- Render Forecast Chart directly in the dashboard, with masked values for Leadership Viewer.
- Show loading, empty, error, and widget-level failed states.
- Keep Dashboard as the single sidebar item.

Recommended frontend helper:

- `frontend/src/utils/dashboardRolePolicy.ts` or similar if frontend needs local role labels while backend remains authoritative.

## 11. Required Backend/API Changes

Files likely to change:

- `backend/app/routers/dashboards.py`
- `backend/app/services/dashboards.py`
- `backend/app/repositories/dashboards.py`
- `backend/app/schemas.py`
- `backend/app/rbac.py` if Delivery Lead role or dashboard permissions need refinement.
- `backend/tests/test_notifications_dashboards_reporting.py`
- Potential new `backend/tests/test_role_based_dashboards.py`

Recommended API changes:

1. Add `GET /api/dashboards/me`.
2. Add a backend dashboard role resolver.
3. Add dashboard profile metadata to `DashboardRead`, such as:
   - `dashboard`
   - `display_name`
   - `role_group`
   - `read_only`
   - `allowed_filters`
4. Add optional route metadata to `DashboardWidgetRead` or each widget item:
   - `primary_route`
   - `source_module`
   - `source_record_type`
   - `source_record_id`
5. Add backend role guards to existing direct dashboard endpoints.
6. Return permission-scoped reduced widgets from existing direct dashboard endpoints when the caller is not in the canonical dashboard role.
7. Add operations/delivery dashboard builders or compose them from existing repository queries.
8. Add Forecast Chart data to dashboard APIs.
9. Apply sensitive field redaction before returning dashboard widgets.

Backend authorization rules:

- Dashboard type authorization must be enforced in backend through role/profile resolution and reduced-widget responses, not only frontend filtering.
- Leadership dashboard must be read-only and source data must be redacted/masked where required.
- Leadership Viewer commercial pipeline, forecast, and revenue-risk values must be masked by default.
- Commercial, escalation, executive, attachment, and financial widgets must use RBAC and field-level security before leaving the API.
- A notification/source route or dashboard item route must not grant access to unauthorized records.
- Existing direct dashboard endpoints should not throw hard 403 solely because the requested dashboard type is not the caller's default; they should reduce widgets and data to the caller's permission scope.

## 12. Required Database Changes, If Any

No migration is required for the MVP if role-to-widget rules are code-defined.

Possible future database/configuration changes:

- Dashboard widget rule table if Admin/KAM Head later need configurable widget visibility from Admin Settings.
- Dashboard layout preference table if users can personalize widget order/visibility.
- Role alias table if "Delivery Lead" must be a label/alias over `delivery_stakeholder`.

If adding a new `delivery_lead` system role:

- A migration may not be required if roles are seeded/upserted at startup.
- Tests and seed logic must still confirm the role exists and is `is_system=True`.
- Because widget rules are hard-coded for the first implementation, no dashboard-rules table should be added now.

## 13. Required RBAC/Permission Changes

Current permission module:

- `dashboards_reporting`

Current actions:

- `view`, `create`, `update`, `delete`, `approve`, `configure`, `assign`, `export`

Required policy changes:

- Keep `dashboards_reporting:view` as the baseline permission to see any dashboard.
- Use role group plus RBAC to choose the dashboard profile.
- Use hard-coded role-to-widget rules for the first implementation.
- Use module permissions to decide specific widgets:
  - Accounts: `account_overview:view`
  - Tasks: `playbooks_tasks_calendar:view`
  - Signals: `signals_attention:view`
  - Governance: `governance_reviews:view`
  - KYC freshness: `kyc:view`
  - Opportunities/Pipeline: `opportunity_management:view`
  - Escalations: `escalation_management:view`
  - Forecast/Analytics: `analytics_portfolio:view`
  - Reports/export: `dashboards_reporting:export`
- Use field-level permissions from Admin Security for sensitive fields before response assembly.
- Consider `dashboards_reporting:configure` only for future dashboard rules/layout configuration, not normal viewing.

## 14. Navigation/Sidebar Impact

Current sidebar:

- Dashboard
- Accounts
- Tasks
- Opportunities
- Playbook
- Admin

Evidence:

- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/MobileNav.tsx`

Planned sidebar behavior:

- Keep one `Dashboard` item.
- Do not add AM Home, KAM Head Portfolio, Leadership, Operations, or Delivery as separate sidebar tabs.
- Governance Calendar remains removed from sidebar, but role-appropriate dashboard widgets must link to governance/calendar surfaces.
- Admin remains privileged and should continue to be hidden from users without admin access.

Current Admin sidebar filter issue to note:

- Sidebar privileged check allows `user.role === 'leadership'`, but seeded leadership role is `leadership_viewer`.
- This is separate from the dashboard issue but should be reviewed later so admin navigation is not shown to inappropriate roles.

## 15. Dashboard Widget Link Mapping To Account Tabs/Modules

Target links should use existing routes and account tabs where possible.

| Widget/item | Target route/module |
|---|---|
| My Accounts / Assigned Accounts | `/accounts` or `/accounts/:id` |
| At Risk Accounts | `/accounts?risk=critical` or `/accounts/:id?tab=health` |
| Signals / Critical Tasks | `/tasks` for tasks; source route from signal where available; otherwise `/accounts/:id?tab=health` or `/accounts/:id?tab=timeline` |
| Upcoming Governance | `/governance` or `/accounts/:id?tab=governance` |
| Tasks Summary | `/tasks` with status/priority filters |
| Account Portfolio Table | `/accounts` with matching filters |
| Forecast Chart | In-dashboard chart with optional drilldown to `/analytics`; values masked for Leadership Viewer |
| Global / Governance Calendar | `/governance` |
| Health Distribution | `/accounts?risk=...` or `/accounts/:id?tab=health` |
| Stale KYC | `/accounts/:id?tab=kyc` |
| Renewal Focus | `/accounts/:id?tab=stage` or `/accounts/:id?tab=engagements` depending source |
| Open Escalations | `/escalations` if route remains, otherwise `/accounts/:id?tab=timeline` or source route |
| Opportunities / Pipeline | `/opportunities` or `/accounts/:id?tab=opportunities` |
| Executive Summaries | `/accounts/:id` read-only overview or future AI brief route |
| Decision Queue | source route from signal/governance/opportunity item; fallback `/accounts/:id?tab=timeline` |
| AI Task Summary | `/tasks` and source-count drilldowns to tasks/signals |
| AM Workload | `/accounts?owner=...` |
| SLA Compliance | `/reports`/SLA view or source item routes |

Important current tab caveat:

- `frontend/src/components/account/Account360.tsx` currently has tabs such as `Engagements`, `Stakeholders`, `Planning`, `Growth`, `Renewal`, and `Retention`.
- Earlier UI cleanup planning requested a new tab structure with `Engagement`, `KYC`, `Health`, `Stage`, `Opportunities`, `Governance`, `Education`, `Timeline`, `Notes`, and `Documents`.
- Dashboard link mapping should use whichever account tab structure is active at implementation time and should preserve aliases for old query parameters where possible.

## 16. Security Concerns

1. Frontend-only dashboard filtering is insufficient.
   - Direct calls to `/api/dashboards/kam-head-portfolio` or `/api/dashboards/leadership` must not return unauthorized full-profile data.
   - Per product decision, direct calls should return permission-scoped reduced widgets rather than a hard 403 solely because the requested dashboard type is not the caller's default.

2. Commercial and financial data leakage.
   - `backend/app/services/dashboards.py` leadership widgets calculate `pipeline_value`, `revenue_risk`, and `at_risk_value`.
   - These must be masked for Leadership Viewer by default and hidden/masked for any role without field-level permission.

3. Leadership read-only behavior.
   - Leadership dashboard must not expose refresh/create/update controls that mutate records.

4. Governance Calendar visibility.
   - Calendar items can reveal executive reviews, attendees, decisions, or sensitive cadence. Backend should filter before response.

5. Escalation sensitivity.
   - Major escalation widgets must not expose RCA/legal-risk or restricted escalation content unless permitted.

6. Attachment/source risk.
   - Dashboard widgets must not expose sensitive attachment names, source excerpts, or direct routes unless the user can view the source.

7. Mock role fallback.
   - `frontend/src/hooks/useRole.ts` falls back to `currentUser` from `frontend/src/data/mock.ts`, currently role `leadership`. This should not drive authenticated dashboard authorization.

8. Widget routes.
   - Dashboard item links must route to pages that independently enforce RBAC. Links are convenience, not authorization.

## 17. Assumptions

- The source of truth is `requirements/Technical Module Logic and Developer Flows.pdf`.
- Dashboard route remains `/dashboard`.
- Existing backend dashboard endpoints should be preserved during transition but guarded.
- Existing default roles are still expected to be seeded.
- `delivery_lead` is the preferred Delivery Lead system role; `delivery_stakeholder` should remain a legacy-compatible alias/group during migration.
- `leadership_viewer` is the seeded role matching "Leadership Viewer / Executive".
- Admin/Super Admin can have broader dashboard visibility, but regular users should not see a dashboard switcher.
- Other roles should receive a limited widget set rather than a custom full dashboard unless RBAC explicitly allows it.
- Widget visibility rules are hard-coded by role for the first implementation.
- Forecast Chart is in scope for dashboard implementation now.

## 18. Resolved Questions And Remaining Questions

Resolved:

1. Delivery Lead should use Tkxel terminology. Preferred system role slug: `delivery_lead`; keep `delivery_stakeholder` as a legacy-compatible alias/group during migration.
2. Admin/Super Admin should default to KAM Head Portfolio with extra admin/system widgets.
3. Admin/Super Admin dashboard switching/"view as" is skipped for the first implementation.
4. KAM Head should see only KAM Head Portfolio.
5. Ops Lead scope should include account ownership role, engagement ownership/assignment, and directly assigned tasks.
6. Delivery Lead scope should use DL account/engagement assignment; if not assigned, show empty/limited data without failing.
7. Forecast Chart should be implemented in Dashboard now.
8. Leadership Viewer commercial pipeline values should be masked by default.
9. Existing direct endpoints should return permission-scoped reduced widgets, not full unauthorized dashboards and not a hard 403 solely because the endpoint is not the user's default dashboard.
10. Dashboard widget visibility should be hard-coded by role for the first implementation.

Remaining questions:

1. Should `delivery_stakeholder` users be automatically migrated to `delivery_lead`, or should both roles remain visible in Admin temporarily?
2. Should the Forecast Chart formula evolve beyond the initial stage-weighted open-opportunity forecast once finance/forecasting rules are finalized?
3. Should deeper field-level dashboard redaction use a centralized policy service shared by reports, exports, AI retrieval, and dashboards?

## 19. Suggested Implementation Phases

### Phase 1: Backend Role Resolver And Endpoint

- Add dashboard role resolver service method.
- Add `GET /api/dashboards/me`.
- Return the correct dashboard profile for Admin/Super Admin, KAM Head, AM, Leadership, Ops Lead, Delivery Lead, and other RBAC-limited roles.
- Default Admin/Super Admin to KAM Head Portfolio plus extra admin/system widgets.
- Add backend tests that each role receives the correct dashboard profile.

### Phase 2: Delivery Lead Role Alignment

- Add preferred `delivery_lead` role handling in the dashboard role resolver.
- Keep `delivery_stakeholder` as a legacy-compatible alias/group for dashboard access during migration.
- Confirm both Delivery Lead role paths are non-deletable/system-protected where applicable.

### Phase 3: Frontend Dashboard Routing Cleanup

- Update `Dashboard.tsx` to call `/api/dashboards/me`.
- Remove normal-user dashboard mode buttons.
- Show role-specific title, loading, empty, and error states.
- Add frontend tests for AM, KAM Head, Leadership, Ops, Delivery, and Other role render behavior.

### Phase 4: Direct Endpoint Reduced Widgets

- Add reduced-widget behavior to direct dashboard endpoints.
- Ensure callers receive only widgets/data allowed by their role, RBAC grants, field permissions, and account/engagement/task scope.
- Add tests for direct endpoint access attempts by non-default roles.

### Phase 5: Widget Visibility, Forecast Chart, And Source Links

- Add role/RBAC widget visibility matrix in backend.
- Add widget/item link metadata.
- Add Forecast Chart widget and backend data assembly.
- Update `WidgetCard` to render source links.
- Map Governance Calendar widgets to `/governance` and account widgets to account tabs.

### Phase 6: Ops/Delivery Dashboards

- Add `operations` and `delivery` dashboard builders.
- Use existing tasks, signals, escalation, governance, account, and engagement repositories.
- Scope Ops Lead by account ownership role, engagement ownership/assignment, and assigned tasks.
- Scope Delivery Lead by DL account/engagement assignment and assigned tasks.
- Keep Delivery Score placeholders out unless source framework is provided.

### Phase 7: Sensitive Field Redaction

- Apply field-level security to dashboard values and items.
- Mask Leadership Viewer commercial pipeline, forecast, and revenue-risk values by default.
- Add tests for commercial/revenue, escalation, executive, attachment, and financial redaction.

### Phase 8: Admin Role Protection Confirmation

- Confirm all core dashboard roles are system roles.
- If adding `delivery_lead`, seed it as `is_system=True` and protect it from deletion.
- Update tests for role list and deletion protection.

## 20. Test Plan

Backend tests:

- `super_admin` receives Admin/Super Admin dashboard profile.
- `admin` receives Admin/Super Admin dashboard profile.
- `kam_head` receives KAM Head Portfolio dashboard.
- `account_manager` receives AM Home dashboard.
- `leadership_viewer` receives Leadership dashboard with `read_only=true`.
- `ops_lead` receives Operations dashboard.
- `delivery_lead` receives Delivery dashboard.
- `delivery_stakeholder` receives Delivery dashboard as a legacy-compatible alias/group until migration completes.
- `content_specialist` receives only RBAC-allowed widgets or empty widget state.
- Direct call to KAM Head endpoint by Account Manager returns permission-scoped reduced widgets.
- Direct call to Leadership endpoint by Account Manager returns permission-scoped reduced widgets.
- Admin/Super Admin dashboard profile is KAM Head Portfolio plus admin/system widgets and no "view as" switch.
- KAM Head cannot access Leadership profile as their default dashboard.
- Ops Lead dashboard includes account ownership role, engagement assignment, and directly assigned task sources.
- Delivery Lead dashboard handles no DL assignment with empty/limited data instead of failure.
- Forecast Chart appears in role-appropriate dashboard responses.
- Leadership Viewer forecast/pipeline/revenue-risk values are masked by default.
- Sensitive commercial fields are hidden/masked for roles without permission.
- Governance, escalation, KYC, task, opportunity, and account widgets only include records within account/user scope.
- Widget links do not appear for unauthorized source records.
- System roles cannot be deleted.

Frontend tests:

- Dashboard page renders no all-role mode switch for normal users.
- Account Manager sees AM dashboard title/widgets.
- KAM Head sees portfolio dashboard title/widgets.
- Leadership Viewer sees read-only dashboard and no mutation buttons.
- Ops Lead sees operational widgets.
- Delivery role sees delivery widgets.
- Other role sees empty/RBAC-limited state.
- Widget links navigate to expected routes.
- Loading, empty, error, and widget-level failed states render correctly.
- Mobile and desktop layouts remain responsive.

Manual verification:

- Log in as each seeded role user.
- Visit `/dashboard`.
- Confirm only the correct dashboard appears.
- Confirm sidebar still has only Dashboard, Accounts, Tasks, Opportunities, Playbook, and Admin where permitted.
- Confirm Governance Calendar is reachable from dashboard widgets where role-appropriate.
- Confirm Leadership cannot perform edits from dashboard.

## 21. Implementation Status

Completed items:

- Added backend role-based dashboard resolution through `GET /api/dashboards/me`.
- Removed the frontend AM/KAM Head/Leadership dashboard mode switch from normal dashboard rendering.
- Admin/Super Admin now receive KAM Head Portfolio behavior with an extra `admin_system` widget.
- KAM Head defaults to KAM Head Portfolio and direct Leadership endpoint calls are reduced back to the caller's authorized dashboard profile.
- KAM/AM defaults to AM Home with assigned-account attention widgets and refreshable AI Task Summary.
- Leadership Viewer defaults to a read-only Leadership Dashboard.
- Leadership Viewer commercial pipeline, revenue-risk, and forecast values are masked with `Restricted`.
- Ops Lead and Delivery Lead dashboard profiles were added with account ownership, engagement assignment, and assigned-task scope.
- Added preferred system role `delivery_lead` while keeping `delivery_stakeholder` as a legacy-compatible delivery dashboard role.
- `delivery_lead` is seeded as a system role and protected from deletion by existing RBAC delete rules.
- Forecast Chart is implemented as a stage-weighted open-opportunity dashboard widget.
- Widget responses now include `primary_route`, and widget items include route metadata where a source route is known.
- Frontend dashboard widgets render source links and forecast bars.
- Direct dashboard endpoints now return the caller's authorized dashboard with `metadata.reduced_scope=true` when the requested dashboard is not allowed for that role, except Admin/Super Admin broader access.

Files changed:

- `backend/app/rbac.py`
- `backend/app/repositories/dashboards.py`
- `backend/app/routers/dashboards.py`
- `backend/app/schemas.py`
- `backend/app/services/accounts.py`
- `backend/app/services/dashboards.py`
- `backend/tests/test_notifications_dashboards_reporting.py`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Dashboard.test.tsx`
- `frontend/src/services/notificationsReporting.ts`
- `frontend/src/types/user.ts`
- `frontend/src/types/timeline.ts`
- `docs/features/role-based-dashboards.md`
- `docs/features/README.md`

Tests run:

- `backend/.venv/bin/python -m pytest backend/tests/test_notifications_dashboards_reporting.py::test_dashboard_digest_and_report_workflows backend/tests/test_notifications_dashboards_reporting.py::test_role_based_dashboard_profiles_and_reduced_direct_endpoints backend/tests/test_notifications_dashboards_reporting.py::test_delivery_lead_dashboard_and_system_role_protection -q`
- `backend/.venv/bin/python -m pytest backend/tests/test_notifications_dashboards_reporting.py backend/tests/test_rbac.py::test_system_and_assigned_roles_are_protected_from_delete -q`
- `backend/.venv/bin/python -m pytest backend/tests/test_rbac.py -q`
- `npm --prefix frontend run test -- --run src/pages/Dashboard.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run build`
- `python -m compileall backend/app/services/dashboards.py backend/app/routers/dashboards.py backend/app/repositories/dashboards.py backend/app/rbac.py`

Remaining items:

- Full suite execution is still recommended before merge because this touches shared dashboard schemas and role seed data.
- `delivery_stakeholder` to `delivery_lead` migration/visibility policy remains a product decision.
- Field-level dashboard redaction is implemented for Leadership commercial forecast/pipeline/revenue-risk values, but a centralized cross-module redaction service is still recommended for all sensitive dashboard fields.
- Forecast formula is an MVP stage-weighted pipeline calculation and should be revisited when formal forecast rules are finalized.

Issues found:

- SQLite test DB returned naive task due dates while production-oriented code used timezone-aware `now`; dashboard overdue checks were normalized with a helper so local and production datetime comparisons both work.
