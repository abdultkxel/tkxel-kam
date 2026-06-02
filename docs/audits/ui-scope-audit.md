# UI Scope Audit

Generated: 2026-06-03

## Scope And Sources

This audit compares current frontend UI surfaces against the source-of-truth files in `specs/*`, `requirements/*`, and `docs/*`. No application code was modified.

Reviewed sources include:

- `specs/01` through `specs/14`, coverage reports, and `specs/IMPLEMENTATION_PLAN.md`
- `requirements/KAM PRD.pdf`
- `requirements/Technical Module Logic and Developer Flows.pdf`
- `requirements/KAM_USER_STORIES.md`
- `docs/features/*`
- Frontend routes in `frontend/src/App.tsx`, layout/navigation components, page components, admin panels, and frontend service/store usage

## Executive Summary

Most primary navigation items and business-module pages are supported by the current specifications or feature docs. The strongest scope risks are not whole unsupported modules; they are mock/prototype controls that look real, local-only actions that do not persist, and a small number of labels/actions that imply capabilities not defined in the requirements.

Unsupported or not-found items:

- `Voice brief` / `spoken QBR brief` prompt in the dashboard intelligence widget.
- Admin `Customization` section as a standalone mock stage/playbook/custom-field editor.
- Keyboard shortcut help modal and global hotkey workflow as an explicit product feature.

High-risk demo placeholders:

- Onboarding `Mock intake`/file-name-based AI extraction copy.
- Local-only Account Notes panel.
- Local-only Admin Alert Rules, Segments, Policies, and Customization panels.
- Local AI Account Brief generation and KAM AI fallback/history/document search that can look official.
- Disabled `Generate portfolio report` button.

## Supported UI Items

| UI item | Route/page | Component/file path | Supporting source |
| --- | --- | --- | --- |
| Login, Google Sign-In, allowed email domain controls, profile calendar ID | `/login`, `/profile`, `/admin?section=settings` | `frontend/src/pages/Login.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/admin/AllowedEmailDomainsPanel.tsx` | `specs/13-allowed-email-domains-and-google-sign-in.md`, `specs/09-approved-integrations.md` |
| Dashboard AM/KAM Head/Leadership modes, notification and AI summary widgets | `/dashboard` | `frontend/src/pages/Dashboard.tsx` | `specs/07-notifications-dashboards-and-reporting.md`, `requirements/KAM_USER_STORIES.md` |
| Notification Center, notification tray, profile notification preferences | `/notifications`, topbar, `/profile` | `frontend/src/pages/Notifications.tsx`, `frontend/src/components/notifications/NotificationTray.tsx`, `frontend/src/components/notifications/NotificationPreferencesPanel.tsx` | `specs/07-notifications-dashboards-and-reporting.md`, `docs/features/notifications-dashboards-reporting.md` |
| Account portfolio views, filters, saved views, Account 360 tabs | `/accounts`, `/accounts/:id` | `frontend/src/pages/Accounts.tsx`, `frontend/src/components/account/Account360.tsx` | `specs/01-account-workspace-and-engagements.md`, `requirements/KAM_USER_STORIES.md` |
| Charter/SOW onboarding review and approval workflow | `/accounts/onboarding` | `frontend/src/pages/Onboarding.tsx` | `specs/01-account-workspace-and-engagements.md`, `specs/02-kyc-and-ai-extraction.md` |
| KYC AI review, workstream status, approve/reject/edit | Account 360 KYC tab | `frontend/src/components/account/KYCAgentOverview.tsx`, `frontend/src/components/account/KYCAssistedReview.tsx` | `specs/02-kyc-and-ai-extraction.md` |
| Stakeholders, planning, growth, renewal, retention | Account 360 tabs | `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx`, `frontend/src/components/account/StakeholderTab.tsx` | `specs/03-relationships-planning-growth-retention.md`, `docs/features/relationships-planning-growth-retention.md` |
| Opportunities board/list/detail/action items/decisions/archive | `/opportunities`, Account 360 Opportunities tab | `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/opportunities/*` | `specs/03-relationships-planning-growth-retention.md`, `docs/features/growth-opportunity-management.md` |
| Scoring, health, CSAT intake, calculators, score history | `/health-scores`, Account 360 Health tab | `frontend/src/pages/HealthScores.tsx`, `frontend/src/components/account/ScoreCalculators.tsx`, `frontend/src/components/account/ScoreHistoryPanel.tsx` | `specs/04-scoring-signals-playbooks-and-tasks.md`, `specs/09-approved-integrations.md` |
| Tasks, playbooks, playbook manual, unified calendar/task surfaces | `/tasks`, `/playbook`, `/governance` | `frontend/src/pages/Tasks.tsx`, `frontend/src/pages/Playbook.tsx`, `frontend/src/components/governance/GovernancePanel.tsx` | `specs/04-scoring-signals-playbooks-and-tasks.md`, `specs/14-playbooks-activities-tasks-calendar-user-story-trace.md` |
| Content catalog, recommendations, sent content, escalation lifecycle | `/admin?section=content`, Account 360 Education/Escalation tabs, `/escalations` | `frontend/src/components/admin/AdminContentPanel.tsx`, `frontend/src/components/account/AccountWorkspacePanel.tsx`, `frontend/src/pages/Escalations.tsx` | `specs/05-content-escalations-and-governance.md` |
| Governance calendar, governance event register, agenda draft, governance brief | `/governance`, Account 360 Governance tab | `frontend/src/components/governance/GovernancePanel.tsx`, `frontend/src/components/account/AccountWorkspacePanel.tsx` | `specs/05-content-escalations-and-governance.md`, `docs/features/governance-reviews.md` |
| Timeline, handover summary, manual notes/comments/retention | Account 360 Timeline tab, global note modal, admin retention | `frontend/src/components/timeline/*`, `frontend/src/components/admin/RetentionJobHistory.tsx` | `specs/06-timeline-and-handover.md`, `docs/features/timeline-and-handover.md` |
| Reports, digests, SLA escalations, analytics, alerts | `/reports`, `/analytics` | `frontend/src/pages/Reports.tsx`, `frontend/src/pages/Analytics.tsx` | `specs/07-notifications-dashboards-and-reporting.md`, `specs/11-analytics-benchmarking-and-alerts.md` |
| Admin users, roles, field builder, audit, integrations, allowed domains | `/admin` | `frontend/src/pages/Admin.tsx`, `frontend/src/components/admin/*` | `specs/09-approved-integrations.md`, `specs/10-admin-security-rbac-and-audit.md`, `specs/13-allowed-email-domains-and-google-sign-in.md` |

## Unsupported Or Requirement-Confirmation Items

| UI item name | Page/route where it appears | Component/file path | Related backend/API path if any | Why it appears unsupported | Remove, hide, or confirm | Risk of removing it | Suggested action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Voice brief` prompt and `Prepare a spoken QBR brief` query | `/dashboard` | `frontend/src/components/dashboard/V4IntelligenceLayer.tsx` | Opens KAM AI, which may call `/api/ai/search`; no voice/audio endpoint exists | Specs support AI search, Account Briefs, governance briefs, and forecast charts, but no source mentions voice, audio playback, speech synthesis, or spoken brief generation. The label implies an audio/narration capability that the app does not provide. | Needs requirement confirmation or rename | Low if renamed; medium if removed because it is one of three visible dashboard AI prompt tiles | Rename to `QBR brief` or `Pre-meeting brief`, or add a new voice/audio requirement before demoing it as voice. |
| Admin `Customization` section: Stage Rule Builder, Drag-and-drop Step Editor, Custom Fields | `/admin?section=customization` | `frontend/src/components/admin/AdminCustomizationPanel.tsx` | None; local React state and toast only | The concepts are covered elsewhere as API-backed modules: Admin Planning, Field Builder, Scoring Engine, and Playbook Template configuration. No requirement supports this standalone mock editor as a separate persisted admin area. `docs/features/growth-opportunity-management.md` identifies it as mock customization context, not a production requirement. | Hide or replace with linked production panels | Low to medium. Removing the section reduces confusion but may remove a visual demo artifact. | Hide this section from production/demo, or convert it into links/cards for Admin Planning, Field Builder, Scoring, and Playbooks. |
| Keyboard shortcut help modal and global hotkey workflow | All authenticated pages | `frontend/src/hooks/useKeyboardShortcuts.ts`, `frontend/src/components/layout/AppShell.tsx` | None | Platform specs require keyboard accessibility, focus states, and semantic controls, but no requirement defines global hotkeys, a shortcut palette, or shortcuts such as `N`, `E`, `G then D`, `G then A`. | Needs requirement confirmation | Low. Removing the modal does not remove core workflows, but removing shortcuts may reduce power-user convenience. | Either document it in `specs/12-platform-readiness-reliability-and-scope-guardrails.md` as a supported usability feature or hide the help modal until product confirms. |

## Partially Supported UI Items

These are backed by requirements, but the current UI implementation is local-only, prototype-labeled, duplicated, or not yet wired to the authoritative backend/API path expected by the specs.

| UI item | Route/page | Component/file path | Related backend/API path if any | Why partial | Suggested action |
| --- | --- | --- | --- | --- | --- |
| Onboarding `Mock intake` and file-name-based extraction copy | `/accounts/onboarding` | `frontend/src/pages/Onboarding.tsx` | `/api/accounts/onboarding-drafts` | AI onboarding extraction is supported, but the UI explicitly says file names are used for prototype extraction. That should not be demoed as real source-backed extraction. | Replace mock copy with source-backed upload/link wording, or clearly label as demo-only until true document extraction is connected. |
| Account Notes panel | `/accounts/:id?tab=notes` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | Expected: timeline note APIs from `specs/06` | Account notes/manual notes are supported, but this panel stores notes in component state only and does not persist timeline notes, mentions, attachments, sensitivity, or audit metadata. | Connect Add Note to the timeline note API or replace the panel with the server-backed Timeline note workflow. |
| Account Documents and citations list | `/accounts/:id?tab=documents` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | Expected: attachments/source document APIs | Source documents and citations are supported, but this panel reads from `useV3Store` local source documents rather than an authoritative API-backed document/attachment list. | Wire to source document/attachment APIs, or hide when only local prototype data exists. |
| Account bulk `Change AM` | `/accounts` | `frontend/src/pages/Accounts.tsx` | Expected: account ownership/update API and timeline/audit writes | Ownership changes are supported, but the UI uses mock user options and local store/timeline emitters for selected accounts. | Use backend user search/options and persist ownership changes with audit/timeline writes. |
| Account bulk `Add tag` | `/accounts` | `frontend/src/pages/Accounts.tsx` | None found for bulk tagging | Segments/reference data are supported, but arbitrary bulk tagging is not clearly defined as an account mutation workflow and appears local-only. | Confirm requirement or hide until a persisted account tags/segments API exists. |
| Account selected `Export CSV` | `/accounts` | `frontend/src/pages/Accounts.tsx` | None; client-side export | Reporting/export is supported, but this export bypasses Reports permissions, redaction, audit, and backend-generated exports. | Route to Reports/export API or label it as local view export with role-safe fields only. |
| Disabled `Generate portfolio report` | `/accounts` | `frontend/src/pages/Accounts.tsx` | Expected: `/api/reports` / report export APIs | Portfolio reporting is supported, but this button is disabled and performs no action. | Remove the button, or connect it to a saved report/report export flow. |
| Admin Alert Rules | `/admin?section=alerts` | `frontend/src/components/admin/AlertRulesPanel.tsx`, `frontend/src/stores/alertStore.ts` | Proposed by specs: `/api/admin/account-change-alert-rules` | Alert rules are supported, but this panel is local Zustand state and mock account evaluation. | Connect to the persisted alert-rule API and audit changes. |
| Admin Segments | `/admin?section=segments` | `frontend/src/components/admin/SegmentSettings.tsx`, `frontend/src/stores/accountStore.ts` | Expected: admin reference-data API | Reference data for account segments is supported, but this adds local segment tags only. | Use the reference data/settings API or remove the section from demo until persisted. |
| Admin Policies / sensitive access request | `/admin?section=policies` | `frontend/src/components/admin/SensitivePolicyTable.tsx`, `frontend/src/stores/integrationStore.ts` | Expected: field permission and sensitive access log APIs | Sensitive policies and access logs are supported, but the table and `Ali Khan requested access...` request are hardcoded/local. Grant buttons only update local state. | Replace with real field-permission/sensitive-access APIs, or hide pending access request card. |
| Admin status strip `Integrations` count | `/admin` | `frontend/src/pages/Admin.tsx`, `frontend/src/stores/integrationStore.ts` | `/api/admin/integrations` exists in the Integrations panel | Integrations are supported and the main panel is API-backed, but the top status strip uses mock integration store counts. | Use the same backend integration list used by `IntegrationsPanel`. |
| KAM AI local fallback, local document search, local query history | Global AI panel | `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/services/aiSearch.ts`, `frontend/src/services/semanticDocumentSearch.ts`, `frontend/src/stores/aiStore.ts` | `/api/ai/search`; expected history/forecast/brief endpoints from `specs/08` and `specs/09` | AI search is supported, but fallback answers, document search, forecast chart, and history can come from local stores without AI Gateway run logging or backend persistence. | Keep fallback for outage only with a clear non-authoritative label; route history/forecast/document retrieval through backend where available. |
| AI Account Brief card | Account 360 Overview | `frontend/src/components/ai/AIBriefCard.tsx`, `frontend/src/services/aiSummary.ts`, `frontend/src/stores/aiSummaryStore.ts` | Expected: `/api/accounts/{account_id}/ai-briefs`, `/api/ai-briefs/{brief_id}/refresh`, `/api/ai-briefs/{brief_id}/feedback`, `/api/ai-briefs/{brief_id}/timeline-note` | AI Account Briefs are supported, but the current card uses local synthesis/store and local timeline emit for edited summaries instead of the required backend brief/cache/feedback/timeline-note APIs. | Connect to `specs/08` AI brief APIs or label as local prototype. |
| Opportunity board drag movement pending state | `/opportunities` | `frontend/src/components/opportunities/OpportunityBoard.tsx`, `frontend/src/pages/Opportunities.tsx` | `/api/opportunities/{id}/stage` | Opportunity stage movement is supported. Existing coverage notes a missing separate pending state for board movement before API confirmation. | Add per-card/column saving state and visible rejection feedback. |
| Account Governance `View calendar` button | `/accounts/:id?tab=governance` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | `/api/governance-events`, `/api/governance-events/calendar` | Governance calendar is supported, but the button routes to `/dashboard`. `docs/features/governance-reviews.md` notes this as a decision point; the primary calendar now exists at `/governance`. | Change to `/governance?account=<id>` after product confirmation. |
| Topbar account search | All authenticated pages | `frontend/src/components/ai/AISearchBar.tsx`, `frontend/src/components/layout/Topbar.tsx` | `/api/accounts` indirectly via `/accounts` | Search is supported, but the control navigates to `/accounts?q=...` while Accounts reads `search`, so submitted searches are not applied. | Change query param to `search` or make Accounts accept `q` as an alias. |

## UI Items Not Found In Specs Or Requirements

| UI item | Route/page | Component/file path | Status | Suggested action |
| --- | --- | --- | --- | --- |
| `Voice brief` prompt | `/dashboard` | `frontend/src/components/dashboard/V4IntelligenceLayer.tsx` | Not supported | Rename or add voice/audio requirement. |
| Admin standalone `Customization` mock section | `/admin?section=customization` | `frontend/src/components/admin/AdminCustomizationPanel.tsx` | Not supported as a distinct persisted module | Hide or replace with real configured admin modules. |
| Global shortcut palette/hotkeys | All authenticated pages | `frontend/src/hooks/useKeyboardShortcuts.ts`, `frontend/src/components/layout/AppShell.tsx` | Not explicitly specified | Document as supported platform usability or hide palette. |

## Duplicate Or Redundant UI Items

| Duplicate/redundant item | Where it appears | Why redundant | Suggested action |
| --- | --- | --- | --- |
| Admin `Customization > Custom Fields` vs Field Builder | `/admin?section=customization`, `/admin?section=fields` | Field Builder is the requirement-backed custom-field module. The customization panel has a separate local custom field mock. | Remove/hide the customization custom-field block or redirect to Field Builder. |
| Admin `Customization > Drag-and-drop Step Editor` vs Playbook Template builder | `/admin?section=customization`, `/playbook` | Playbook template configuration is implemented in the Playbook page with API services; the customization editor is local-only. | Remove/hide the customization step editor. |
| Admin `Customization > Stage Rule Builder` vs Admin Planning/Scoring/Opportunity stage config | `/admin?section=customization`, `/admin?section=planning`, `/admin?section=scoring`, `/admin?section=opportunities` | Stage/rule behavior is distributed across supported admin modules. This panel duplicates concepts without persistence. | Replace with links to supported sections. |
| Account Notes vs Timeline Add Note | `/accounts/:id?tab=notes`, Account 360 Timeline, global note modal | Timeline notes are the supported persisted record; Account Notes stores local component state. | Use the Timeline note API from the Notes tab. |
| Account CSV export vs Reports exports | `/accounts`, `/reports` | Reports are the governed export surface; Accounts export is client-side and unaudited. | Route selected-account export through Reports or clearly limit it as local view export. |
| Redirect-only aliases | `/alerts`, `/attention`, `/onboarding`, `/settings` | They are not dead, but duplicate canonical routes: `/dashboard`, `/tasks`, `/accounts/onboarding`, `/profile`. | Keep as backward-compatible aliases or document/remove if not needed. |

## Placeholder Or Mock UI That Should Not Be Demoed As Production

| Placeholder/mock UI | Route/page | Component/file path | Why it should not be demoed as production |
| --- | --- | --- | --- |
| Mock intake text and file-name prototype extraction | `/accounts/onboarding` | `frontend/src/pages/Onboarding.tsx` | The UI explicitly states prototype extraction and does not show real document parsing. |
| Admin Customization section | `/admin?section=customization` | `frontend/src/components/admin/AdminCustomizationPanel.tsx` | Local-only state, no API, no audit, duplicates supported modules. |
| Admin Alert Rules | `/admin?section=alerts` | `frontend/src/components/admin/AlertRulesPanel.tsx`, `frontend/src/stores/alertStore.ts` | Local-only alert rule save/evaluation. |
| Admin Segments | `/admin?section=segments` | `frontend/src/components/admin/SegmentSettings.tsx` | Local-only segment tags. |
| Admin Policies pending access request | `/admin?section=policies` | `frontend/src/components/admin/SensitivePolicyTable.tsx` | Hardcoded access request and local grant state. |
| Account Notes panel | `/accounts/:id?tab=notes` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | Notes disappear on reload and do not create timeline/audit records. |
| AI Account Brief local synthesis | `/accounts/:id` | `frontend/src/components/ai/AIBriefCard.tsx` | Looks like a requirement-backed AI brief, but bypasses backend brief cache/history/feedback/timeline-note APIs. |
| KAM AI local fallback and local history | Global AI panel | `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/stores/aiStore.ts` | Can display non-persisted answers/history when backend fails; should be labeled as fallback. |
| Disabled portfolio report button | `/accounts` | `frontend/src/pages/Accounts.tsx` | Visible production action but intentionally disabled. |

## Dead Navigation Links

No primary sidebar or mobile navigation links were found that route to missing pages. The following routing issues should still be treated as cleanup items:

| Link/action | Route/page | Component/file path | Issue | Suggested action |
| --- | --- | --- | --- | --- |
| `View calendar` from Account Governance | `/accounts/:id?tab=governance` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | Routes to `/dashboard` instead of the governance calendar workspace. | Change to `/governance?account=<id>` once confirmed. |
| Topbar search submit | All authenticated pages | `frontend/src/components/ai/AISearchBar.tsx` | Routes to `/accounts?q=...`; Accounts reads `search`, so the filter is not applied. | Use `/accounts?search=...` or accept `q` in Accounts. |
| Redirect aliases | `/alerts`, `/attention`, `/onboarding`, `/settings` | `frontend/src/App.tsx` | Not dead, but legacy/duplicate aliases. | Keep intentionally or document/remove. |

## Buttons That Do Not Perform Required Actions

| Button/action | Route/page | Component/file path | Current behavior | Required/supported behavior | Suggested action |
| --- | --- | --- | --- | --- | --- |
| `Generate portfolio report` | `/accounts` | `frontend/src/pages/Accounts.tsx` | Disabled, no action. | Portfolio reporting/export should use report APIs and audit/permission controls. | Remove or connect to `/reports`/report export. |
| `Save stage rules` | `/admin?section=customization` | `frontend/src/components/admin/AdminCustomizationPanel.tsx` | Toast only, local state. | Stage/rule configuration must persist through supported admin modules. | Hide or replace with real API-backed configuration. |
| `Add field` in Admin Customization | `/admin?section=customization` | `frontend/src/components/admin/AdminCustomizationPanel.tsx` | Adds local field only. | Custom fields must use Field Builder API. | Remove/redirect to Field Builder. |
| `Grant 24h / 7 days / permanent` | `/admin?section=policies` | `frontend/src/components/admin/SensitivePolicyTable.tsx` | Local hardcoded audit entry. | Sensitive access grants/logs must persist and be audited. | Connect to sensitive-access API or hide request card. |
| `Save note` in Account Notes | `/accounts/:id?tab=notes` | `frontend/src/components/account/AccountWorkspacePanel.tsx` | Saves only in component state. | Manual notes must persist as timeline entries with sensitivity/audit. | Use timeline note API. |
| Topbar `Search` | All authenticated pages | `frontend/src/components/ai/AISearchBar.tsx` | Navigates with wrong query param. | Should filter account search results. | Use `search` query param. |

## Recommended Cleanup Priority

P0 for demo readiness:

- Rename or hide `Voice brief`.
- Hide Admin `Customization` or replace it with links to real admin modules.
- Remove/disable demo exposure of local-only Account Notes and Admin Policies request card.
- Fix topbar search query parameter.
- Remove or wire `Generate portfolio report`.

P1 for production readiness:

- Wire Admin Alert Rules, Segments, Policies, Account Documents, and Account Notes to backend services.
- Connect AI Account Brief to the `specs/08` backend API contract.
- Add clear fallback labeling for any KAM AI local/offline path.
- Use backend integration counts in Admin status strip.

P2 cleanup:

- Decide whether redirect aliases should remain documented compatibility routes.
- Document or remove the shortcut palette/hotkeys.
- Change Account Governance `View calendar` to the governance workspace once product confirms the route behavior.
