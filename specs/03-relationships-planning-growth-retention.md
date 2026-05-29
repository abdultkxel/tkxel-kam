# Feature Specification: Relationships Planning Growth And Retention

## Feature Overview

Manage stakeholder relationships, account plans, whitespace, service catalog adjacency, opportunities, renewal intelligence, and retention/stabilization plans.

## Business Goal

Protect retention and grow strategic accounts by making relationships, whitespace, opportunities, renewal risk, and owned action plans visible and measurable.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Leadership Viewer / Executive
- Admin
- Commercial Stakeholder
- Platform

## User Stories Covered

- Story 5.1 - Stakeholder map and relationship attributes
- Story 5.2 - Stakeholder coverage gaps and org chart
- Story 6.1 - Basic Account Plan
- Story 6.2 - Service catalog, whitespace, and adjacency recommendations
- Story 7.1 - Opportunity CRUD, board, and list
- Story 7.2 - Opportunity type configuration
- Story 8.1 - Renewal intelligence and notice windows
- Story 8.2 - Retention and stabilization plans

## Functional Requirements

- Maintain stakeholder maps at account and engagement levels.
- Track stakeholder roles, influence, relationship strength, sentiment, political risk, and engagement history.
- Generate stakeholder coverage gaps through configurable rules.
- Provide org-chart visualization.
- Maintain account plan with retention focus, growth focus, risks, opportunities, commitments, service gaps, and next actions.
- Configure service catalog and adjacency rules.
- Capture whitespace inputs and generate adjacency recommendations.
- Manage account-level and engagement-level opportunities in board and list views.
- Configure opportunity types.
- Track renewal readiness, renewal risk, SOW dates, notice deadlines, commercial exposure, owner, confidence, and source citation.
- Create retention, renewal, and stabilization plans with actions, owners, due dates, success criteria, milestones, and timeline history.

## Non-Functional Requirements

- Recommendations must show rationale and require user action before creating opportunities or tasks.
- Sensitive stakeholder and commercial data must obey field-level permissions.
- Portfolio renewal and opportunity lists should remain responsive through pagination.

## Permissions & Authorization

- KAM/KAM Head manage stakeholders, account plans, opportunities, and retention plans for authorized accounts.
- Leadership Viewer can view authorized strategic relationship, opportunity, renewal, and plan data without operational edit controls.
- Admin/KAM Head configure stakeholder roles, gap rules, service catalog, adjacency rules, opportunity types, and renewal/retention taxonomies.
- Commercial Stakeholder can view/manage configured commercial opportunity and renewal fields where authorized.

## Validation Rules

- Stakeholder requires name and role; email/phone validated when present.
- Stakeholder role must be active for new records.
- Relationship scores must fit configured ranges.
- Account plan next actions require owner and due date.
- Service names/slugs are unique; in-use services/types cannot be hard deleted.
- Opportunity requires account, type, service line, owner, stage, next step, and target date.
- Opportunity value must be non-negative.
- Stage transition must be allowed by configuration.
- Renewal dates must align with approved SOW terms or manual override reason.
- Notice deadline must be before renewal/end date.
- Retention plan requires type, owner, due dates, and success criteria.

## Search Requirements

- Search stakeholders by name, title, company, email.
- Search account plans and next actions.
- Search services by name/tag/category.
- Search opportunities by name, next step, source context.
- Search renewal source/SOW title.
- Search retention plan actions and success criteria.

## Filter Requirements

- Stakeholders: role, influence, sentiment, strength, active/inactive, engagement.
- Org chart: role, engagement, sentiment, influence.
- Account plan actions: owner, due date, status, priority.
- Services: active state, category, tag.
- Recommendations: service line and relevance/rationale type.
- Opportunities: account, engagement, type, service line, owner, stage, target date, value range, source.
- Renewals: renewal window, notice deadline window, risk, owner, confidence, auto-renewal.
- Retention plans: type, status, owner, due date, renewal milestone.

## Sort Requirements

- Stakeholders: influence, relationship strength, last interaction, name.
- Gaps: severity, age, status.
- Account actions: due date, priority, status.
- Services: name, category, updated date.
- Recommendations: relevance/score.
- Opportunities: target date, value, updated date, stage, owner.
- Renewals: nearest notice deadline, nearest renewal date, risk, commercial exposure.
- Plans/actions: due date, risk, updated date.

## Pagination Requirements

- Stakeholder list is paginated.
- Opportunity list is paginated; board columns may lazy-load.
- Service catalog list is paginated.
- Sent plan/action history is paginated where applicable.
- Portfolio renewal lists are paginated.
- Retention plan and action lists are paginated.

## API Requirements

- `GET /api/accounts/{account_id}/stakeholders`
- `POST /api/accounts/{account_id}/stakeholders`
- `GET /api/stakeholders/{stakeholder_id}`
- `PATCH /api/stakeholders/{stakeholder_id}`
- `DELETE /api/stakeholders/{stakeholder_id}`
- `GET /api/accounts/{account_id}/stakeholders/org-chart`
- `GET /api/accounts/{account_id}/stakeholders/coverage-gaps`
- `GET /api/accounts/{account_id}/plan`
- `PUT /api/accounts/{account_id}/plan`
- `GET /api/accounts/{account_id}/plan/history`
- `GET /api/admin/service-catalog`
- `POST /api/admin/service-catalog`
- `PATCH /api/admin/service-catalog/{service_id}`
- `PUT /api/admin/service-adjacencies`
- `GET /api/accounts/{account_id}/whitespace`
- `PUT /api/accounts/{account_id}/whitespace`
- `GET /api/accounts/{account_id}/service-recommendations`
- `GET /api/opportunities`
- `POST /api/opportunities`
- `GET /api/opportunities/{opportunity_id}`
- `PATCH /api/opportunities/{opportunity_id}`
- `DELETE /api/opportunities/{opportunity_id}`
- `POST /api/opportunities/{opportunity_id}/stage`
- `GET /api/admin/opportunity-types`
- `POST /api/admin/opportunity-types`
- `PATCH /api/admin/opportunity-types/{type_id}`
- `DELETE /api/admin/opportunity-types/{type_id}`
- `GET /api/accounts/{account_id}/retention`
- `PATCH /api/accounts/{account_id}/retention`
- `GET /api/engagements/{engagement_id}/renewal`
- `PATCH /api/engagements/{engagement_id}/renewal`
- `GET /api/accounts/{account_id}/retention-plans`
- `POST /api/accounts/{account_id}/retention-plans`
- `PATCH /api/retention-plans/{plan_id}`
- `POST /api/retention-plans/{plan_id}/tasks`
- `GET /api/accounts/{account_id}/retention-recommendations`

## UI Requirements

- Stakeholder map/list, profile drawer, relationship editor, interaction history, org chart, and coverage gap panel.
- Account Plan tab with editable sections and next actions.
- Admin service catalog and adjacency matrix screens.
- Whitespace capture section and recommendation cards.
- Opportunity board and list, create/edit modal, detail drawer, and pipeline totals.
- Renewal panel with notice badges, date fields, risk indicators, and source links.
- Retention plan builder with milestones, task creation, and recommendation rationale.

## Loading States

- Stakeholder list/profile loading.
- Org chart graph loading.
- Recommendation generation loading.
- Opportunity board/list loading.
- Renewal extraction/citation loading.
- Retention plan and recommendations loading.

## Empty States

- No stakeholders.
- No coverage gaps.
- No account plan.
- No services configured.
- No whitespace inputs.
- No opportunities.
- No renewal data.
- No retention plan.

## Error States

- Restricted stakeholder/commercial data.
- Invalid relationship graph.
- Archived account edit blocked.
- Invalid adjacency configuration.
- Invalid opportunity stage transition.
- Conflicting SOW renewal terms.
- Retention recommendation inputs missing.

## Edge Cases

- Inactive stakeholder remains in history but is excluded from active coverage metrics.
- Mentions or stakeholder links do not grant access to restricted fields.
- Inactive services/types remain on historical records but hidden from new selection.
- Deferred/lost opportunities remain in reporting.
- Manual renewal terms must be flagged as manual.
- Task completion from retention plan does not automatically improve health unless source data changes.

## Missing Requirements

- Exact stakeholder score scales are not specified.
- Account plan required fields and review cadence are not specified.
- Service catalog taxonomy and adjacency scoring formula are not specified.
- Opportunity stage names and allowed transitions are not specified.
- Renewal risk formula and confidence scale are not specified.

## Ambiguous Requirements

- The boundary between Commercial Stakeholder and KAM permissions for opportunity changes is not fully defined.
- Whether org chart relationships are hierarchical or network-based is unclear.
- Whether retention plan recommendations are deterministic, AI-assisted, or hybrid is not specified.

## Conflicting Requirements

- None explicit, but recommendations must not auto-create records while some workflows expect tasks/calendar items from approved SOW terms. The trigger point should be clarified.

## Unspecified Edge Cases

- Duplicate stakeholder detection.
- Opportunity merge/split behavior.
- Renewal term conflict between manual input and approved SOW extraction.
- Service catalog changes that affect existing whitespace recommendations.

## Audit/Logging Requirements

- Audit stakeholder create/update/delete and major relationship changes.
- Timeline stakeholder additions, interactions, and material relationship changes.
- Audit account plan changes and next-action changes.
- Audit service catalog, adjacency, and opportunity type configuration changes.
- Timeline opportunity creation, stage changes, wins, losses, deferrals, and source-linked decisions.
- Timeline renewal field changes and retention plan creation/completion.

## Test Scenarios

- Add stakeholder and verify timeline entry.
- Generate coverage gap for missing executive sponsor.
- Create account plan with required next action.
- Configure service adjacency and verify recommendation rationale.
- Create opportunity and move through valid stage.
- Reject invalid stage transition.
- Configure inactive opportunity type and verify hidden from new forms but retained historically.
- Extract renewal dates and create notice-window items.
- Create retention plan from recommendation without auto-task until user confirms.
- Verify Leadership Viewer cannot edit operational records.

## Acceptance Criteria

- Relationship, planning, growth, renewal, and retention data can be managed in account context.
- Recommendations are explainable and require user confirmation.
- Filters/search/sort/pagination work for operational lists.
- Sensitive and commercial data remain permission-aware.
- Material changes are audited and timeline-linked.

