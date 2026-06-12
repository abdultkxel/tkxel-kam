# RBAC Hardcoded Role Audit

## Summary

Audit date: 2026-06-12.

The platform has a module/action RBAC model in `backend/app/rbac.py` and `backend/app/repositories/rbac.py`, and Admin users can create custom roles with explicit permission grants. Several backend services and frontend views still gate behavior with fixed role slugs such as `super_admin`, `admin`, `kam_head`, `account_manager`, and `leadership_viewer`.

The main contradiction: a custom role can be granted all permissions in Admin, but still be denied actions, hidden from controls, or scoped to assigned accounts because code checks role names after or instead of checking permissions.

## Implementation Status

Updated on 2026-06-12.

The first implementation slice converted the main service-action gates to capability checks:

- Added the service-specific permission catalog in `backend/app/rbac_catalog.py`.
- Added permission metadata columns for catalog-driven permissions.
- Updated `RbacService.seed_defaults()` to seed the new catalog and remove old generic permission rows and grants.
- Added `GET /api/users/me/capabilities`.
- Replaced the most important backend title gates for account scope, onboarding assignment/approval, KYC approval/sensitive visibility, portfolio scoping, timeline sensitive/moderation checks, playbooks, tasks, reports, analytics, notifications, and integrations.
- Rebuilt the Admin Roles tab around catalog sections, risk, tags, dependencies, presets, and catalog-only grant summaries.

Remaining intentional role-title usage is limited to protected `super_admin` management, seeded persona labels/profile selection, and a compatibility fallback in local timeline filtering for utility callers that do not yet receive capability context.

## Backend Findings

### Central Account Access Gates

- `backend/app/services/account_access.py:8` defines `GLOBAL_VIEW_ROLES = {"super_admin", "admin", "kam_head", "leadership", "leadership_viewer"}`.
- `backend/app/services/account_access.py:9` defines `GLOBAL_EDIT_ROLES = {"super_admin", "admin", "kam_head"}`.
- `backend/app/services/account_access.py:21` allowed global account view only for `GLOBAL_VIEW_ROLES`; custom roles with portfolio account visibility still had to be account owners.
- `backend/app/services/account_access.py:26` allows global account update only for `GLOBAL_EDIT_ROLES`; custom roles with update permissions must still be active AM/supporting owners.
- `backend/app/services/account_access.py:38` blocks archived account updates unless the user role is in `GLOBAL_EDIT_ROLES`.
- `backend/app/services/account_access.py:43` checked draft assignment permission, then still required `GLOBAL_EDIT_ROLES`.
- `backend/app/services/account_access.py:48` checked draft approval permission, then still required `GLOBAL_EDIT_ROLES`.

Impact: this central service causes custom admin-like roles to lose global account visibility, global edit authority, ownership management, and onboarding approval even when permissions are granted.

### Account Workspace

- `backend/app/services/accounts.py:80` required account visibility permission, but `backend/app/services/accounts.py:81` forcibly scoped `account_manager` and `am` users to themselves by role.
- `backend/app/services/accounts.py:125` builds UI permissions from `GLOBAL_EDIT_ROLES`, not RBAC grants. `can_assign`, `can_delete`, and `can_approve` are false for custom roles with matching permissions.
- `backend/app/services/accounts.py:472`, `backend/app/services/accounts.py:494`, `backend/app/services/accounts.py:505`, and `backend/app/services/accounts.py:516` block sensitive source-document extraction/view/download/chunks unless the role is in `GLOBAL_EDIT_ROLES` or is `account_manager`/`am`.
- `backend/app/services/accounts.py:713` uses a fixed role map for eligible account owners: AM roles, ops/delivery roles, leadership roles, plus Admin/KAM Head.

Impact: custom all-permission roles do not receive the same UI capability payloads or sensitive-document access as Admin/KAM Head. Custom operational roles cannot be selected as account owners unless their slug is in the hardcoded map.

### Onboarding Drafts

- `backend/app/services/onboarding.py:63` defines primary account-manager eligibility as `{"account_manager", "am"}`.
- `backend/app/services/onboarding.py:64` defines global onboarding draft visibility as `{"super_admin", "admin", "kam_head"}`.
- `backend/app/services/onboarding.py:97` required onboarding visibility permission, but `backend/app/services/onboarding.py:98` applied role-based draft visibility.
- `backend/app/services/onboarding.py:129` requires create permission, but returns account manager candidates only for `PRIMARY_ACCOUNT_MANAGER_ROLES`.
- `backend/app/services/onboarding.py:840` and `backend/app/services/onboarding.py:853` block sensitive draft document download/extraction unless the role is one of Admin, Super Admin, KAM Head, Account Manager, or AM.
- `backend/app/services/onboarding.py:1880` gives global draft visibility only to `ONBOARDING_GLOBAL_VIEW_ROLES`.
- `backend/app/services/onboarding.py:1897` checked draft assignment permission, then still required `ONBOARDING_GLOBAL_VIEW_ROLES` for clearing or assigning a draft owner.

Impact: this is the source of the observed error: custom roles with all permissions still cannot assign onboarding drafts to other AMs.

### KYC

- `backend/app/services/kyc.py:1104` requires `kyc:approve`, then `backend/app/services/kyc.py:1107` requires the literal role slug `kam_head`.
- `backend/app/services/kyc.py:3268` grants sensitive KYC visibility to `GLOBAL_EDIT_ROLES`, `account_manager`, and `am`, then falls back to `kyc:export`.

Impact: KYC approval is stricter than RBAC and appears to deny Admin, Super Admin, and custom roles unless another path bypasses this helper.

### Dashboard Profiles And Portfolio Scope

- `backend/app/services/dashboards.py:15` through `backend/app/services/dashboards.py:20` define dashboard persona sets by role slug.
- `backend/app/services/dashboards.py:52` permits task-summary refresh based on profile role and `ADMIN_ROLES`, not only `dashboards_reporting` grants.
- `backend/app/services/dashboards.py:84` and `backend/app/services/dashboards.py:100` treat `include_admin` as `current_user.role in ADMIN_ROLES`.
- `backend/app/services/dashboards.py:115` maps dashboard profile by fixed role set, falling back custom roles to `rbac_widgets`.
- `backend/app/services/dashboards.py:131` lets only Admin roles access arbitrary dashboard endpoints.
- `backend/app/services/dashboards.py:318` makes portfolio account scope global only for `GLOBAL_VIEW_ROLES`.
- `backend/app/services/dashboards.py:388` special-cases AM widgets by `AM_ROLES`.

Impact: custom roles with dashboard/reporting permissions do not receive equivalent Admin/KAM/Leadership dashboard behavior or portfolio scope.

### Portfolio And Account Scope Reuse

The following services use `GLOBAL_VIEW_ROLES` or equivalent role sets to decide global portfolio visibility after checking module permissions:

- `backend/app/services/reports.py:407`
- `backend/app/services/opportunities.py:98`
- `backend/app/services/analytics.py:188`
- `backend/app/services/retention.py:46`
- `backend/app/services/tasks.py:191`
- `backend/app/services/tasks.py:338`
- `backend/app/services/playbooks_tasks.py:290`
- `backend/app/services/playbooks_tasks.py:464`
- `backend/app/services/governance.py:106`
- `backend/app/services/escalations.py:73`
- `backend/app/services/csat.py:61`
- `backend/app/services/signals.py:142`
- `backend/app/services/signals.py:924`
- `backend/app/services/scoring.py:398`
- `backend/app/services/ai_assistance.py:381`
- `backend/app/services/ai_assistance.py:591`
- `backend/app/services/kam_ai_chat.py:1135`
- `backend/app/services/notifications.py:954`
- `backend/app/services/notifications.py:959`

Impact: a custom role with broad module `view` permissions can still see only assigned accounts, assigned tasks, or own AI runs. This may be intentional account-scope policy, but it contradicts the expectation that an all-permission role behaves like Admin/KAM Head.

### Reports

- `backend/app/services/reports.py:138` lists all reports only when the user role is `super_admin`, `admin`, or `kam_head`.
- `backend/app/services/reports.py:416` allows viewing any report only for `super_admin`, `admin`, or `kam_head`; other roles need shared visibility or ownership.

Impact: custom roles with `dashboards_reporting:configure` can update reports through `_require_report_update`, but may not see all reports first.

### Tasks, Governance, Escalations, And Playbook Work

- `backend/app/services/tasks.py:664` allows task update by role shortcut only for `GLOBAL_EDIT_ROLES`; otherwise it falls back to task ownership or account update access.
- `backend/app/services/governance.py:1144` allows governance event update by role shortcut only for `GLOBAL_EDIT_ROLES`; otherwise it falls back to event ownership or account update access.
- `backend/app/services/escalations.py:360` allows escalation update by role/account ownership logic, while `backend/app/services/escalations.py:377` allows closure-evidence override only for `GLOBAL_EDIT_ROLES` or `kam_head`.
- `backend/app/services/playbooks_tasks.py:501` blocks playbook template operations and execution unless the role is literally `super_admin`, even after `playbooks_tasks_calendar:configure`.
- `backend/app/services/playbooks_tasks.py:506` and `backend/app/services/playbooks_tasks.py:514` use `GLOBAL_EDIT_ROLES` shortcuts for account work and task update.

Impact: custom roles with update/configure permissions can be blocked from cross-account work, escalation closure overrides, and playbook operations.

### Timeline And Handover

- `backend/app/services/timeline.py:72` through `backend/app/services/timeline.py:74` define sensitive, legal-sensitive, and moderator roles by slug.
- `backend/app/services/timeline.py:316` lets only the author or `TIMELINE_MODERATOR_ROLES` edit non-system timeline entries.
- `backend/app/services/timeline.py:916` through `backend/app/services/timeline.py:931` expose sensitive entries by role set, not by module permission or field permission.
- `backend/app/services/timeline.py:933` allows comment mutation by author, timeline moderator role, or `account_timeline:delete`.

Impact: custom roles with timeline permissions cannot necessarily view sensitive timeline content or moderate entries unless they also match the hardcoded role set.

### Notifications And Integrations

- `backend/app/services/notifications.py:927` chooses Admin/KAM Head notification recipients by hardcoded role list.
- `backend/app/services/notifications.py:954` and `backend/app/services/notifications.py:959` scope digest data by hardcoded portfolio roles.
- `backend/app/services/integrations.py:1004` sends integration failure alerts only to active `super_admin` and `admin` users.
- `backend/app/services/in_app_notifications.py:17` defines admin notification recipients as `("super_admin", "admin", "kam_head")`.

Impact: custom platform-admin roles may miss operational/admin notifications even if they have configure permissions.

### KAM AI Sensitive Context

- `backend/app/services/kam_ai_chat.py:1159` allows sensitive AI source context only for `super_admin`, `admin`, `kam_head`, and `account_manager`.

Impact: custom roles with AI/search permissions and account access may not receive the same source context as named roles.

## Frontend Findings

### Navigation And Admin Entry

- `frontend/src/components/layout/Sidebar.tsx:35` shows the Admin nav item only for `leadership`, `admin`, or `super_admin`.
- `frontend/src/components/layout/MobileNav.tsx:14` uses the same hardcoded Admin nav rule.

Impact: custom roles with `admin_audit_security_rbac:configure` can be blocked from discovering the Admin UI. KAM Head is also excluded even though seeded RBAC grants all permissions.

### Accounts And Onboarding UI

- `frontend/src/pages/Accounts.tsx:75` treats only leadership, KAM Head, Admin, and Super Admin as privileged.
- `frontend/src/pages/Accounts.tsx:76` shows draft accounts only to KAM Head, Admin, and Super Admin.
- `frontend/src/pages/Accounts.tsx:421` filters bulk owner options to users whose role is exactly `am`.
- `frontend/src/pages/Onboarding.tsx:508` and `frontend/src/pages/Onboarding.tsx:514` decide default/self assignment behavior from `account_manager` and `am` role names.
- `frontend/src/components/account/CreateAccountDialog.tsx:622` and `frontend/src/components/account/CreateAccountDialog.tsx:628` repeat the same role-name assignment logic.

Impact: even if backend assignment gates are fixed, custom roles may still see incomplete draft lists or wrong assignment controls.

### Account 360 And Stakeholders

- `frontend/src/components/account/Account360.tsx:103` marks privileged views by leadership/admin/super_admin role names.
- `frontend/src/components/account/StakeholderTab.tsx:444` allows stakeholder management only for Admin, Super Admin, KAM Head, Account Manager, AM, or KAM role slugs.

Impact: custom roles with stakeholder/account permissions can lose management controls or privileged view sections.

### KYC UI

- `frontend/src/components/account/KYCAssistedReview.tsx:91` sets `isSuperAdmin` from the literal role slug.
- `frontend/src/components/account/KYCAssistedReview.tsx:498`, `frontend/src/components/account/KYCAssistedReview.tsx:556`, and `frontend/src/components/account/KYCAssistedReview.tsx:642` show advanced KYC prompt/run/debug/source-review panels only to Super Admin.

Impact: custom KYC admin roles with create/configure permissions cannot use those UI paths.

### Timeline UI

- `frontend/src/components/timeline/AddNoteModal.tsx:51` decides leadership/sensitive-note behavior by role name.
- `frontend/src/components/timeline/TimelineCard.tsx:60` and `frontend/src/components/timeline/TimelineCard.tsx:61` decide annotate/moderate controls by Admin/Super Admin/KAM Head role names.
- `frontend/src/components/timeline/TimelineFilters.tsx:30` shows sensitive filters only to leadership/admin/super_admin.
- `frontend/src/types/timeline.ts:109` through `frontend/src/types/timeline.ts:121` locally filters sensitive timeline entries by role names. This function is reused by Account 360 timeline display and AI/timeline search helpers.

Impact: frontend timeline visibility can disagree with backend permissions and can hide entries for custom roles before the API is even queried or rendered.

### Playbook, Tasks, Analytics, And AI UI

- `frontend/src/pages/Playbook.tsx:160` and `frontend/src/pages/Playbook.tsx:161` allow playbook configuration only for Super Admin.
- `frontend/src/pages/Tasks.tsx:49` makes the page read-only only for `leadership_viewer`; other read-only custom roles may still see mutation controls until the backend rejects them.
- `frontend/src/pages/Analytics.tsx:182` restricts only `am` and `account_manager`; it does not evaluate `analytics_portfolio:view`.
- `frontend/src/components/ai/AIBriefCard.tsx:67` treats only leadership, admin, and super_admin as privileged.

Impact: the frontend is not consistently using backend permissions/effective capability payloads for these workflows.

## Role Checks That May Be Intentional, But Need Explicit Product Decisions

- Hidden/protected Super Admin management in `backend/app/services/user_management.py` and `backend/app/repositories/users.py`.
- Seed-data role creation and demo-user lookup in `backend/app/services/seed.py`.
- Dashboard persona selection in `backend/app/services/dashboards.py` if custom roles are intentionally meant to receive `rbac_widgets`.
- Playbook operation being Super Admin only, documented in `docs/features/scoring-signals-playbooks-and-tasks.md`.
- Account owner eligibility maps if ownership assignment is meant to be a separate persona taxonomy rather than RBAC.
- Notification recipient policies if operational routing intentionally targets named personas instead of permission holders.

## Recommended Refactor Direction

- Use permission checks as the primary action authority. If a role has `onboarding:assign_owner`, it should be able to assign drafts unless a separate explicit policy blocks it.
- Replace `GLOBAL_VIEW_ROLES` and `GLOBAL_EDIT_ROLES` with capability helpers that combine RBAC grants and account ownership rules.
- Decide whether `module:view` means global portfolio view or assigned-account view. If both are needed, add an explicit scope concept instead of encoding scope in role names.
- Move sensitive-data access to field permissions or named capability helpers, not fixed role sets.
- Return effective capabilities from backend APIs and have frontend controls read those capabilities instead of `user.role`.
- Keep protected setup behavior for `super_admin` explicit and documented separately from normal RBAC.

## Test Notes

- This audit drove the implemented RBAC redesign in `docs/features/rbac-permission-model-redesign.md`.
- Backend service action gates were converted to permission/capability helpers across account access, onboarding, KYC, portfolio dashboards/reporting/analytics, timeline moderation/sensitive visibility, playbooks, tasks, notifications, AI, and related operational services.
- Frontend controls were converted to `/api/users/me/capabilities` for Admin navigation, accounts/onboarding, KYC, timeline, playbooks, tasks, analytics, and privileged account sections.
- Remaining role-title usages are limited to protected setup behavior, seeded/demo persona labels, dashboard persona/display profiles, ownership-role taxonomy strings such as `primary_am`, and legacy notification policy names that now resolve through permission-based recipient selection.
- Verification commands are listed in `docs/features/rbac-permission-model-redesign.md`.
