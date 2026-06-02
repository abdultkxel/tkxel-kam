# Requirements Coverage Report: Relationships Planning Growth And Retention

Source specification: `specs/03-relationships-planning-growth-retention.md`

## Phase 3 Fixes Applied

- Added the Account 360 retention recommendation-to-task workflow with selected recommendations, active plan selection, due date, and explicit confirmation before task creation.
- Added frontend coverage for the confirmed retention task workflow.
- Added rollback guards around retention plan updates and recommendation-to-task conversion to prevent partial transaction state after validation errors.

## Coverage Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Stakeholder maps at account and engagement levels | Complete | `backend/app/services/stakeholders.py`, `frontend/src/components/account/StakeholderTab.tsx` |
| Stakeholder roles, influence, relationship strength, sentiment, political risk, engagement history | Complete | `backend/app/schemas.py`, `backend/app/services/stakeholders.py`, `frontend/src/components/account/StakeholderFormDrawer.tsx`, `frontend/src/components/account/StakeholderDetailPanel.tsx` |
| Configurable stakeholder coverage gap rules | Complete | `backend/app/services/stakeholder_config.py`, `backend/app/services/stakeholder_gap_service.py`, `frontend/src/components/admin/AdminRelationshipPlanningPanel.tsx` |
| Prevent duplicate unresolved stakeholder coverage gaps | Complete | `backend/app/services/stakeholder_gap_service.py`, `backend/tests/test_relationships_planning_growth_retention.py` |
| Redact sensitive stakeholder fields, notes, nodes, and graph edges | Complete | `backend/app/services/stakeholders.py`, `frontend/src/components/account/StakeholderOrgChart.tsx`, `frontend/src/components/account/StakeholderDetailPanel.tsx` |
| Org chart visualization and hierarchy validation | Complete | `backend/app/services/stakeholders.py`, `frontend/src/components/account/StakeholderOrgChart.tsx` |
| Account plan with retention/growth/risks/opportunities/commitments/service gaps/next actions | Complete | `backend/app/services/account_planning.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Account plan history with actor, timestamp, previous values, change summary | Complete | `backend/app/repositories/account_planning.py`, `backend/app/services/account_planning.py` |
| Service catalog and adjacency rules | Complete | `backend/app/services/service_catalog.py`, `frontend/src/components/admin/AdminRelationshipPlanningPanel.tsx` |
| Whitespace input capture and adjacency recommendations | Complete | `backend/app/services/service_catalog.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Whitespace/recommendations influence growth scoring and planning where configured | Partial | Recommendations create opportunities and planning service gaps are persisted; scoring-engine influence is not wired. Evidence: `backend/app/services/service_catalog.py`, `backend/app/services/opportunities.py` |
| Account-level and engagement-level opportunities in board/list views | Complete | `backend/app/services/opportunities.py`, `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/opportunities/OpportunityBoard.tsx` |
| Opportunity type configuration and seeded types | Complete | `backend/app/services/opportunities.py`, `backend/app/services/seed.py`, `frontend/src/components/admin/AdminRelationshipPlanningPanel.tsx` |
| Source-linked opportunity decisions reachable from timeline | Complete | `backend/app/services/opportunities.py`, `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/account/Account360.tsx` |
| Renewal readiness/risk/SOW/notice/exposure/owner/confidence/source citation | Complete | `backend/app/services/retention.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Renewal intelligence surfaced across existing product surfaces | Partial | Account 360 and Engagement 360 expose renewal context; dashboard/signals/tasks/calendar have related surfaces; reports are not implemented as a real module. Evidence: `frontend/src/components/account/Account360.tsx`, `frontend/src/pages/EngagementDetail.tsx`, `backend/app/services/signals.py`, `backend/app/services/tasks.py` |
| Manual and CSV/manual-imported commercial fields | Partial | Manual renewal update exists; CSV commercial import schema/UI is not implemented. Evidence: `backend/app/services/retention.py`, `frontend/src/pages/EngagementDetail.tsx` |
| Renewal signals, notice-window tasks, calendar items from approved SOW terms | Partial | Signals/tasks/calendar infrastructure exists and retention recommendations can create tasks after confirmation; no direct approved-SOW auto-generation workflow was added in this feature. Evidence: `backend/app/services/signals.py`, `backend/app/services/tasks.py`, `backend/app/services/retention.py` |
| Retention/renewal/stabilization plans with actions, owners, due dates, success criteria, milestones, history | Complete backend / Partial frontend | Backend supports full structure; Account 360 UI creates plans and confirmed tasks but does not yet expose a full milestone/action editor. Evidence: `backend/app/services/retention.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Keep retention plans visible after renewal cycle | Complete | `backend/app/repositories/retention.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Require explicit confirmation before recommendation-created records | Complete | `backend/app/services/service_catalog.py`, `backend/app/services/retention.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| RBAC for KAM, KAM Head, Leadership Viewer, Admin, Commercial Stakeholder | Complete / Partial for field-level commercial permissions | Module permissions exist; per-field commercial permissions remain broader product Field Builder/RBAC scope. Evidence: `backend/app/rbac.py`, `backend/app/services/account_access.py` |
| Validation rules for stakeholders, active roles, ranges, services, opportunities, stages, renewal dates, retention plans, hierarchy cycles, task confirmation | Complete | `backend/app/schemas.py`, `backend/app/services/stakeholders.py`, `backend/app/services/opportunities.py`, `backend/app/services/retention.py` |
| CSV/manual commercial import validation | Missing | No dedicated commercial import endpoint or UI exists for this feature. |
| Search/filter/sort/pagination for operational lists | Partial | Opportunities, services, recommendations, renewals, retention plans, stakeholder search/filter, and list pagination exist; stakeholder/gap sorting and account-action-specific search/filter/pagination are limited. Evidence: `backend/app/routers/opportunities.py`, `backend/app/routers/service_catalog.py`, `backend/app/routers/retention.py`, `backend/app/routers/stakeholders.py` |
| Required API endpoints | Complete | `backend/app/routers/account_planning.py`, `backend/app/routers/service_catalog.py`, `backend/app/routers/retention.py`, `backend/app/routers/stakeholders.py`, `backend/app/routers/opportunities.py` |
| Account 360 planning/growth/renewal/retention UI | Complete | `frontend/src/components/account/Account360.tsx`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx` |
| Engagement 360 renewal fields, source type, citations, manual override, notice status | Partial | Engagement page exposes SOW/renewal terms and source links; it does not yet consume the richer `/api/engagements/{id}/renewal` profile for confidence/source type/manual override editing. Evidence: `frontend/src/pages/EngagementDetail.tsx`, `backend/app/routers/retention.py` |
| Admin relationship planning settings | Complete | `frontend/src/pages/Admin.tsx`, `frontend/src/components/admin/AdminRelationshipPlanningPanel.tsx` |
| Opportunity board/list/create/edit/detail/totals | Complete | `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/opportunities/OpportunityBoard.tsx` |
| Opportunity board move pending state | Partial | Stage edits use API save state in detail flows; drag/drop board move pending state is not implemented as a separate interaction. Evidence: `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/opportunities/OpportunityBoard.tsx` |
| Loading, empty, and error states | Complete | `frontend/src/components/account/RelationshipsPlanningGrowthRetention.tsx`, `frontend/src/components/admin/AdminRelationshipPlanningPanel.tsx`, `frontend/src/pages/Opportunities.tsx`, `frontend/src/components/account/StakeholderTab.tsx` |
| Audit and timeline requirements | Complete | `backend/app/services/account_planning.py`, `backend/app/services/service_catalog.py`, `backend/app/services/opportunities.py`, `backend/app/services/retention.py`, `backend/app/services/stakeholders.py` |
| Automated tests for happy path, validation, auth, pagination, recommendation conversion, frontend confirmation | Complete for implemented scope | `backend/tests/test_relationships_planning_growth_retention.py`, `frontend/src/components/account/RelationshipsPlanningGrowthRetention.test.tsx` |

## Field Builder Impact

- Field Builder does not currently impact the relationships planning, service catalog, renewal, or retention modules.
- This feature uses fixed schemas plus admin-managed taxonomies/configuration.
- Existing Field Builder runtime modules remain unaffected: onboarding/account overview, content, escalations/governance, playbooks/tasks/calendar.
- If product expects custom fields on account plans, service catalog, renewal profiles, or retention plans, module registration and `custom_field_values` persistence must be added explicitly.

## Missing Requirements

- Dedicated CSV/manual commercial import endpoint, UI, validation rules, and source provenance ownership.
- Rich Engagement 360 renewal profile editor backed by `/api/engagements/{engagement_id}/renewal`.
- Direct approved-SOW workflow that creates renewal signals, notice-window tasks, and calendar items while reconciling the explicit-confirmation rule.
- Full frontend milestone/action editor for retention plans.
- Dedicated stakeholder/gap sorting and account-plan action list search/filter/pagination.
- Per-field commercial permissions beyond current module-level RBAC.

## Missing Tests

- CSV/manual commercial import tests are missing because the workflow is not implemented.
- Engagement renewal profile frontend edit tests are missing because the page does not yet consume the richer retention profile API.
- Frontend tests for full retention milestone/action editing are missing because only plan creation and recommendation-to-task confirmation are implemented in the UI.

## Potential Bugs Fixed

- Retention plan updates and recommendation-to-task conversion now roll back on validation failures.
- Retention recommendation task creation is now available in UI and covered by a frontend test, closing the previous backend-only gap.

## Security Concerns

- Sensitive stakeholder redaction is implemented for fields, notes, graph nodes, and graph edges.
- Commercial data currently relies on module-level RBAC; field-level commercial masking should be implemented if individual commercial fields require stricter access than the module.
- Recommendation conversion endpoints require explicit confirmation and account authorization.

## Edge Cases Not Fully Handled

- Conflicts between manual renewal terms and approved SOW extraction need a richer source precedence model.
- Service catalog changes can make existing whitespace recommendations stale; stale handling exists but does not yet expose a full admin remediation workflow.
- Task completion from retention recommendations does not change account health automatically, which matches the spec.

## Verification

- `docker compose run --rm --no-deps backend python -m compileall app` passed.
- `docker compose run --rm --no-deps backend pytest tests/test_relationships_planning_growth_retention.py -q` passed: 4 tests.
- `docker compose run --rm --no-deps backend pytest -q` passed: 80 tests.
- `docker compose run --rm --no-deps frontend npm test -- RelationshipsPlanningGrowthRetention.test.tsx` passed: 1 test.
- `docker compose run --rm --no-deps frontend npm test` passed: 21 test files, 47 tests.
- `docker compose run --rm --no-deps frontend npm run build` passed with the existing large bundle warning.
