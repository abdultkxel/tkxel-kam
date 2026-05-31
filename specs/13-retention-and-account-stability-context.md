# Retention And Account Stability Context

## Source Map

This dossier consolidates the available product, requirements, feature-spec, current UI, and backend context for the Retention And Account Stability feature.

Primary sources:

- Product context: [`../README.md`](../README.md)
- Feature index and traceability: [`./README.md`](./README.md)
- User-story backlog: [`../requirements/KAM_USER_STORIES.md`](../requirements/KAM_USER_STORIES.md)
- Parent feature specification: [`./03-relationships-planning-growth-retention.md`](./03-relationships-planning-growth-retention.md)
- Current web design and frontend implementation:
  - [`../frontend/src/components/account/EngagementsPanel.tsx`](../frontend/src/components/account/EngagementsPanel.tsx)
  - [`../frontend/src/components/account/Account360.tsx`](../frontend/src/components/account/Account360.tsx)
  - [`../frontend/src/pages/Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx)
  - [`../frontend/src/types/v3.ts`](../frontend/src/types/v3.ts)
  - [`../frontend/src/data/v3Mock.ts`](../frontend/src/data/v3Mock.ts)
  - [`../frontend/src/stores/v3Store.ts`](../frontend/src/stores/v3Store.ts)
- Current backend/API evidence:
  - [`../backend/app/models.py`](../backend/app/models.py)
  - [`../backend/app/schemas.py`](../backend/app/schemas.py)
  - [`../backend/app/routers/accounts.py`](../backend/app/routers/accounts.py)
  - [`../backend/app/routers/engagements.py`](../backend/app/routers/engagements.py)
  - [`../backend/app/repositories/engagements.py`](../backend/app/repositories/engagements.py)
  - [`../backend/app/services/engagements.py`](../backend/app/services/engagements.py)

No separate Figma, mockup, wireframe, or web-design markdown artifact was found in the repository. The current web-design reference is the implemented React frontend under `frontend/src`.

## Product And Platform Context

The KAM Intelligence Platform is an enterprise SaaS / customer success platform for strategic account management, governance, renewals, stakeholder intelligence, escalations, and AI-assisted account operations.

Stack:

- Frontend: React, Vite, TypeScript.
- Backend: FastAPI, SQLAlchemy, PostgreSQL.
- Database: PostgreSQL through Docker Compose.

Standard workflow:

- Docker is the standard development path.
- `make dev-run` builds and runs PostgreSQL, FastAPI, and the React frontend with live reload.
- Useful runtime URLs:
  - Frontend: `http://127.0.0.1:5173/`
  - Login: `http://127.0.0.1:5173/login`
  - Backend: `http://127.0.0.1:8001/`
  - Health: `http://127.0.0.1:8001/health`
  - Swagger: `http://127.0.0.1:8001/docs`
  - OpenAPI: `http://127.0.0.1:8001/openapi.json`

Seeded setup:

- Hidden super admin: `admin@tkxelkam.com` / `Admin@12345`.
- Seeded visible role users use `User@12345`.
- Relevant seeded roles include `account_manager`, `kam_head`, `leadership_viewer`, `commercial_stakeholder`, and `delivery_stakeholder`.

## Traceability

`specs/README.md` maps Retention And Account Stability story coverage into the broader Relationships Planning Growth And Retention feature specification.

| User Story | Story Title | Feature Specification |
| --- | --- | --- |
| 8.1 | Renewal intelligence and notice windows | `03-relationships-planning-growth-retention.md` |
| 8.2 | Retention and stabilization plans | `03-relationships-planning-growth-retention.md` |

The feature is not currently represented by a dedicated numbered spec file. The canonical product wording lives in the user-story backlog, while the broader feature specification includes it alongside stakeholders, account planning, whitespace, opportunities, and growth.

## User-Story Context

Source: `requirements/KAM_USER_STORIES.md`, section `8. Retention And Account Stability`.

### Story 8.1 - Renewal Intelligence And Notice Windows

User intent:

- As a KAM, I want renewal readiness and SOW notice-window intelligence, so that renewal risk is visible before deadlines pass.

Acceptance criteria:

- Track renewal readiness, renewal risk, SOW start/end date, renewal date, notice deadline, auto-renewal terms, commercial exposure, days to expiry, owner, confidence, and citation.
- Renewal risks, SOW expiry, and notice deadlines appear in Account Overview, Engagement 360, dashboards, signals, tasks, calendar, and reports.

UI requirements:

- Renewal panel on Account Overview and Engagement 360.
- Notice deadline and days-to-expiry badges.
- Source citation links.

API requirements:

- `GET /api/accounts/{account_id}/retention`
- `PATCH /api/accounts/{account_id}/retention`
- `GET /api/engagements/{engagement_id}/renewal`
- `PATCH /api/engagements/{engagement_id}/renewal`

Validation rules:

- Renewal dates must align with approved SOW terms or manual override reason.
- Notice deadline must be before renewal/end date.
- Confidence is required when extracted from documents.

Permissions:

- Manage: KAM, KAM Head, Commercial Stakeholder where configured.
- View: Leadership Viewer and authorized users.

States:

- Empty renewal state prompts extracting from SOW or manual entry.
- Loading state for date extraction and citation preview.
- Error state for conflicting SOW terms.

Operational lists:

- Filters: renewal window, notice deadline window, risk, owner, confidence, auto-renewal.
- Sorting: nearest notice deadline, nearest renewal date, risk, commercial exposure.
- Search by SOW/source title.
- Pagination for portfolio renewal lists.

Edge cases:

- Missing SOW terms can be manually entered but must be flagged as manual.
- Approved terms create renewal signals, notice-window tasks, and calendar items.

### Story 8.2 - Retention And Stabilization Plans

User intent:

- As a KAM, I want to create retention, renewal, and stabilization plans, so that weak metrics and renewal risks have owned actions.

Acceptance criteria:

- Plans include actions, owners, due dates, success criteria, renewal milestones, and timeline history.
- Stability and renewal recommendations are based on weak metrics, signals, account stage, engagement posture, SOW end date, and notice window.
- Recommendations require user selection before tasks are created.

UI requirements:

- Retention plan builder.
- Recommendation panel with rationale.
- Milestone and task list.

API requirements:

- `GET /api/accounts/{account_id}/retention-plans`
- `POST /api/accounts/{account_id}/retention-plans`
- `PATCH /api/retention-plans/{plan_id}`
- `POST /api/retention-plans/{plan_id}/tasks`
- `GET /api/accounts/{account_id}/retention-recommendations`

Validation rules:

- Require plan type, owner, due dates, and success criteria.
- Task creation from recommendation requires user confirmation.
- Due dates cannot be after renewal milestone where configured.

Permissions:

- Manage: KAM, KAM Head.
- View: authorized account users and Leadership Viewer.

States:

- Empty plan state prompts creating a plan.
- Loading state for recommendations.
- Error state if recommendation inputs are missing.

Operational lists:

- Filters: plan type, status, owner, due date, renewal milestone.
- Search: action text, success criteria.
- Sorting: due date, risk, updated date.
- Pagination for plan and action lists.

Edge cases:

- Completing a task does not automatically improve health unless underlying data changes.
- Plans remain visible after renewal cycle for history.

## Parent Feature Specification Context

Source: `specs/03-relationships-planning-growth-retention.md`.

Feature overview:

- Manage stakeholder relationships, account plans, whitespace, service catalog adjacency, opportunities, renewal intelligence, and retention/stabilization plans.

Business goal:

- Protect retention and grow strategic accounts by making relationships, whitespace, opportunities, renewal risk, and owned action plans visible and measurable.

Roles:

- Account Manager / KAM
- KAM Head / VP
- Leadership Viewer / Executive
- Admin
- Commercial Stakeholder
- Platform

Story coverage:

- Story 5.1 - Stakeholder map and relationship attributes.
- Story 5.2 - Stakeholder coverage gaps and org chart.
- Story 6.1 - Basic Account Plan.
- Story 6.2 - Service catalog, whitespace, and adjacency recommendations.
- Story 7.1 - Opportunity CRUD, board, and list.
- Story 7.2 - Opportunity type configuration.
- Story 8.1 - Renewal intelligence and notice windows.
- Story 8.2 - Retention and stabilization plans.

Functional requirements relevant to retention and stability:

- Maintain account plan with retention focus, growth focus, risks, opportunities, commitments, service gaps, and next actions.
- Manage account-level and engagement-level opportunities in board and list views.
- Track renewal readiness, renewal risk, SOW dates, notice deadlines, commercial exposure, owner, confidence, and source citation.
- Support manually entered and CSV/manual-imported commercial fields where approved integrations do not provide a source.
- Create renewal signals, notice-window tasks, and calendar items from approved SOW terms.
- Create retention, renewal, and stabilization plans with actions, owners, due dates, success criteria, milestones, and timeline history.

Non-functional requirements:

- Recommendations must show rationale and require user action before creating opportunities or tasks.
- Sensitive stakeholder and commercial data must obey field-level permissions.
- Portfolio renewal and opportunity lists should remain responsive through pagination.

Permissions and authorization:

- KAM/KAM Head manage stakeholders, account plans, opportunities, and retention plans for authorized accounts.
- Leadership Viewer can view authorized strategic relationship, opportunity, renewal, and plan data without operational edit controls.
- Admin/KAM Head configure stakeholder roles, gap rules, service catalog, adjacency rules, opportunity types, and renewal/retention taxonomies.
- Commercial Stakeholder can view/manage configured commercial opportunity and renewal fields where authorized.

Validation rules relevant to retention and stability:

- Account plan next actions require owner and due date.
- Opportunity value must be non-negative.
- Renewal dates must align with approved SOW terms or manual override reason.
- Notice deadline must be before renewal/end date.
- CSV/manual commercial imports must validate required columns, numeric values, currency, duplicate rows, and source provenance.
- Retention plan requires type, owner, due dates, and success criteria.

Search, filter, sort, and pagination:

- Search renewal source/SOW title.
- Search retention plan actions and success criteria.
- Filter renewals by renewal window, notice deadline window, risk, owner, confidence, and auto-renewal.
- Filter renewals/commercial fields by extracted/manual source, source confidence, and commercial exposure range.
- Filter retention plans by type, status, owner, due date, and renewal milestone.
- Sort renewals by nearest notice deadline, nearest renewal date, risk, and commercial exposure.
- Sort plans/actions by due date, risk, and updated date.
- Portfolio renewal lists and retention plan/action lists are paginated.

UI requirements:

- Add missing Account 360 sections or clearly linked pages for stakeholder map, account plan, whitespace/service catalog recommendations, renewal intelligence, and retention plans.
- Renewal panel with notice badges, date fields, risk indicators, and source links.
- Retention plan builder with milestones, task creation, and recommendation rationale.

Loading, empty, and error states:

- Renewal extraction/citation loading.
- Retention plan and recommendations loading.
- No renewal data.
- No retention plan.
- Conflicting SOW renewal terms.
- Retention recommendation inputs missing.

Audit and timeline:

- Timeline renewal field changes and retention plan creation/completion.
- Audit account plan changes and next-action changes.
- Recommendations require confirmation and should not silently create tasks.

Feature acceptance criteria:

- Relationship, planning, growth, renewal, and retention data can be managed in account context.
- Recommendations are explainable and require user confirmation.
- Filters/search/sort/pagination work for operational lists.
- Sensitive and commercial data remain permission-aware.
- Material changes are audited and timeline-linked.

Known missing or ambiguous requirements from the parent spec:

- Renewal risk formula and confidence scale are not specified.
- CSV/manual commercial import schema and ownership of imported commercial values are not specified.
- Whether retention plan recommendations are deterministic, AI-assisted, or hybrid is not specified.
- The trigger point for auto-created renewal tasks/calendar items versus user-confirmed recommendation tasks needs clarification.
- Renewal term conflict behavior between manual input and approved SOW extraction is unspecified.

## Current Frontend And Web-Design Evidence

### Engagement 360 Renewal Intelligence

`frontend/src/components/account/EngagementsPanel.tsx` contains the strongest current UI evidence for Story 8.1.

Observed design and behavior:

- Engagement cards show SOW end date.
- Selected engagement details show metrics for SOW expiry and confidence.
- A `Renewal intelligence` panel displays:
  - Start date.
  - End date.
  - Renewal date.
  - Notice deadline.
  - Notice period.
  - Auto-renewal.
  - Source citation in an orange emphasis panel.
- Engagement status styling differentiates at-risk, renewal-watch, and healthy states with RAG-style color treatment.

Implication:

- The current design partially satisfies the renewal panel, date fields, notice deadline, confidence, and citation portions of Story 8.1.
- It does not yet appear to provide a full editable renewal workflow, conflict handling UI, manual override reason capture, or portfolio-level renewal management from this panel.

### Account 360 Renewal Posture And Stage Prediction

`frontend/src/components/account/Account360.tsx` derives account-level SOW posture from engagement renewal terms.

Observed design and behavior:

- Computes the soonest renewal from engagement notice deadlines and SOW end dates.
- Produces SOW posture summary values such as days until notice.
- Produces SOW renewal detail text with notice and expiry day counts.
- Uses notice-window proximity to influence predicted account stage:
  - Within 30 days can move toward `Renewal Focus`.
  - Within 60 days can move toward `Renewal`.
- Recommends confirming renewal owner, notice deadline, and commercial exposure when the notice window is close.
- Emits or references `retention_event` as a timeline event type in account-stage context.

Implication:

- The current Account 360 design partially satisfies the account overview renewal posture requirement.
- It frames renewal posture as a driver of account stage and account stability.
- It does not yet expose a dedicated retention plan builder or recommendation-to-task workflow.

### Dashboard Growth Vs Retention Design

`frontend/src/pages/Dashboard.tsx` contains a portfolio-level Growth vs Retention surface.

Observed design and behavior:

- Splits accounts into growth and retention rows.
- Shows a `Growth vs Retention` panel.
- Shows retention percentage, account count, and revenue detail.
- Computes renewal days from an engagement renewal date or account governance date fallback.
- Portfolio table includes renewal-day display and renewal/retention motion classification.

Implication:

- The dashboard communicates retention posture at portfolio level.
- It is a summary and prioritization surface, not a retention plan execution surface.

### Current Frontend Types And Mock Data

`frontend/src/types/v3.ts` defines the frontend concept model for renewal and retention.

`RenewalTerms` includes:

- `startDate`
- `endDate`
- `renewalDate`
- `noticeDeadline`
- `noticePeriodDays`
- `autoRenewal`
- `commercialExposure`
- `daysToExpiry`
- `riskStatus`
- `confidence`
- `sourceDocumentId`
- `sourceCitation`

`EngagementRecord` includes `renewalTerms`.

`SignalRecord` supports retention-relevant signal types:

- `sow_expiry`
- `notice_window`
- `weak_metric`
- `stakeholder_gap`
- `escalation_sla`

`RetentionPlan` includes:

- `id`
- `accountId`
- optional `engagementId`
- `title`
- `ownerName`
- `status`: `draft`, `active`, `complete`
- `successCriteria`
- `actions` with id, title, owner, due date, and status.

`frontend/src/data/v3Mock.ts` contains mock renewal terms, renewal/notice signals, and one active retention plan:

- `Regional rollout renewal recovery`
- Success criteria include confirming regional owners, resetting sponsor cadence, and closing notice-window decisions before deadline.
- Actions include confirming commercial owner and running sponsor reset call.

`frontend/src/stores/v3Store.ts` exposes `retentionPlans`, creates onboarding/AI extraction renewal drafts, and marks draft engagement status as at risk when renewal risk is critical.

Implication:

- The frontend data model has enough primitives for a retention/stabilization planning UI.
- The current model is not yet as complete as the spec requires because it lacks explicit plan type, milestones, recommendation rationale, task-confirmation records, and timeline history fields.

### Account Notes Surface

`frontend/src/components/account/AccountWorkspacePanel.tsx` imports `RetentionPlan` and reads `retentionPlans` for the account.

Observed behavior:

- Retention plans are converted into note-like entries in the `NotesPanel`.
- The panel is labeled as account notes and planning context.

Implication:

- Retention plan data is currently visible only indirectly in notes/planning context.
- This is not equivalent to the required retention plan builder, recommendation panel, milestone list, or task list.

### Admin Retention Is Timeline Retention, Not Account Stability

`frontend/src/pages/Admin.tsx`, `frontend/src/components/admin/RetentionJobHistory.tsx`, `frontend/src/services/timelineRetention.ts`, and timeline stores/types implement a separate retention concept.

Observed design and behavior:

- Admin navigation has a `Retention` section.
- Retention job history and retention enforcement refer to timeline/event retention policies.
- Timeline event types have retention policies such as keep, archive, and delete.

Important distinction:

- Admin Retention is compliance/data-retention policy for timeline records.
- Retention And Account Stability is account/engagement renewal risk, stabilization planning, and owned action execution.
- These should remain clearly separated in product wording and implementation.

## Current Backend And API Evidence

### Implemented Renewal Fields

Backend models and schemas already carry renewal-related engagement fields.

Observed fields:

- `renewal_date`
- `notice_deadline`
- `notice_period_days`
- `auto_renewal`
- `commercial_context`
- `source_citation`
- `confidence` in onboarding/engagement draft flow.

These appear in:

- Onboarding draft engagement models.
- Engagement models.
- Engagement create/update/read schemas.
- Engagement service create/update flows.

### Implemented Renewal Validation

Current backend validation already enforces important date rules:

- Engagement end date must be after start date.
- Notice deadline must be before renewal date.
- Notice deadline must be before SOW end date.
- Notice period must be zero or greater.

The user-story rule "Notice deadline must be before renewal/end date" is therefore partially implemented for engagement dates.

### Implemented Renewal Filtering And Sorting

`backend/app/routers/accounts.py` exposes account engagement listing with `renewal_window`.

Current `renewal_window` values:

- `next_30`
- `next_60`
- `next_90`
- `expired`
- `notice_due`
- `missing`

`backend/app/repositories/engagements.py` filters:

- Upcoming renewal windows by `renewal_date`.
- Expired renewals by past `renewal_date`.
- Notice due by `notice_deadline` within the next 30 days.
- Missing renewals by absent `renewal_date`.

Supported engagement sort values include:

- `renewal_date`
- `end_date`
- `value`
- `delivery_status`
- `updated_date`

### Existing Engagement 360 API Context

`backend/app/routers/engagements.py` describes Engagement 360 as returning profile, commercial, renewal, risk, ownership, and source evidence fields.

Implication:

- Renewal intelligence exists as part of engagement data today.
- The dedicated feature APIs listed in the specification are not all present as standalone endpoints.

### Specified But Not Fully Implemented Dedicated APIs

The following endpoints are required by user stories and the feature spec, but were not found as implemented dedicated backend routes during this dossier review:

- `GET /api/accounts/{account_id}/retention`
- `PATCH /api/accounts/{account_id}/retention`
- `GET /api/engagements/{engagement_id}/renewal`
- `PATCH /api/engagements/{engagement_id}/renewal`
- `GET /api/accounts/{account_id}/retention-plans`
- `POST /api/accounts/{account_id}/retention-plans`
- `PATCH /api/retention-plans/{plan_id}`
- `POST /api/retention-plans/{plan_id}/tasks`
- `GET /api/accounts/{account_id}/retention-recommendations`

Related functionality exists through broader engagement/account APIs and frontend mock state, but a dedicated retention/renewal planning API surface appears incomplete.

## Gap Analysis

### Partially Covered

- Renewal dates, notice deadlines, notice periods, auto-renewal, and source citation are represented in frontend and backend engagement data.
- Engagement 360 has a visible renewal intelligence panel.
- Account 360 computes renewal posture and uses notice-window proximity for stage prediction.
- Dashboard shows Growth vs Retention and renewal-day portfolio information.
- Frontend mock/type layers contain `RetentionPlan` and retention-relevant signal records.
- Backend validates core renewal and notice-date consistency.
- Backend supports renewal-window filtering and renewal-date sorting for engagement lists.

### Missing Or Incomplete

- Dedicated Account Retention page/section is not visible as a full workflow.
- Retention plan builder is not yet a dedicated UI.
- Recommendation panel with rationale is not yet a full dedicated UI.
- Milestone and task list for retention plans is not yet a full dedicated UI.
- User-confirmed task creation from recommendations is not yet represented end to end.
- Retention plan APIs are specified but not clearly implemented.
- Renewal endpoints are specified as dedicated endpoints but current implementation appears to expose renewal fields through engagement APIs.
- Account-level retention readiness API is specified but not clearly implemented.
- Renewal readiness/risk formulas are not specified.
- Confidence scale and extraction/manual source provenance rules need tighter definition.
- Manual override reason capture is not visible in current UI or backend schema.
- Timeline history for retention plan creation/completion is specified but not clearly implemented as a full retention-plan workflow.

### Separate Concern: Timeline Retention Policy

Admin retention policy screens and retention job history relate to data/timeline retention, not account retention/stability. Future implementation should avoid reusing that UI label without disambiguation. Good naming options include:

- Account Stability
- Renewal Readiness
- Retention Plans
- Stabilization Plans
- Timeline Retention Policy, for the admin/compliance concept only.

## Acceptance Criteria Synthesis

The Retention And Account Stability feature is ready when:

- KAMs can view renewal readiness, SOW dates, notice deadlines, auto-renewal status, commercial exposure, confidence, owner, and citation in Account Overview and Engagement 360.
- KAMs can create and manage retention, renewal, and stabilization plans from account context.
- Plans include type, owner, actions, due dates, success criteria, renewal milestones, status, and timeline history.
- Recommendations are based on weak metrics, signals, account stage, engagement posture, SOW end date, and notice window.
- Recommendations show rationale and require user confirmation before tasks are created.
- Approved SOW terms can create renewal signals, notice-window tasks, and calendar items at the correct trigger point.
- Portfolio lists support renewal filters, notice-deadline filters, risk filters, owner filters, confidence filters, auto-renewal filters, search, sorting, and pagination.
- Leadership Viewer can view authorized retention/renewal data without operational edits.
- Commercial Stakeholder can view/manage configured commercial renewal fields where authorized.
- Sensitive commercial and stakeholder data obey field-level permissions.
- Renewal changes and retention plan lifecycle events are audited and timeline-linked.
- Task completion does not automatically improve account health unless underlying source data changes.
- Historical retention plans remain visible after a renewal cycle.

## Implementation Readiness Checklist

Documentation:

- [x] User stories 8.1 and 8.2 are identified.
- [x] Parent feature specification is identified.
- [x] Current frontend surfaces are mapped.
- [x] Current backend renewal fields and filters are mapped.
- [x] Account retention/stability is distinguished from timeline retention policy.

Backend:

- [ ] Decide whether to add dedicated retention/renewal endpoints exactly as specified or extend existing engagement/account endpoints with compatible routes.
- [ ] Add account-level retention readiness model/serializer if the dedicated account retention endpoint is implemented.
- [ ] Add retention plan persistence model with plan type, owner, milestones, actions, success criteria, status, and timeline history.
- [ ] Add recommendation service with rationale and explicit task-creation confirmation.
- [ ] Add audit/timeline emission for renewal field changes and retention plan lifecycle events.
- [ ] Define renewal risk formula, confidence scale, manual override reason, and source provenance.

Frontend:

- [ ] Add or expose a dedicated Account 360 surface for Account Stability / Retention Plans.
- [ ] Keep the Engagement 360 renewal intelligence panel and wire it to backend APIs.
- [ ] Add retention plan builder with plan type, owner, milestones, actions, due dates, status, and success criteria.
- [ ] Add recommendation panel with rationale and explicit task-create confirmation.
- [ ] Add empty, loading, and error states for renewal data, recommendation generation, missing inputs, and conflicting SOW terms.
- [ ] Preserve Growth vs Retention dashboard summary while adding drill-down behavior to the retention plan workflow.

Testing:

- [ ] Validate notice deadline before renewal/end date.
- [ ] Validate missing SOW terms can be manually entered and flagged as manual.
- [ ] Verify extracted renewal fields require confidence and source citation.
- [ ] Verify renewal window filters: next 30/60/90, expired, notice due, missing.
- [ ] Verify retention plan creation requires plan type, owner, due dates, and success criteria.
- [ ] Verify recommendation-to-task creation requires user confirmation.
- [ ] Verify Leadership Viewer cannot edit operational records.
- [ ] Verify Commercial Stakeholder access follows configured commercial field permissions.
- [ ] Verify timeline/audit entries for renewal changes and retention plan creation/completion.
- [ ] Verify task completion does not automatically update health scores.

## Recommended Next Product Decisions

Before implementing the full feature, decide:

- Whether the primary UI label should be `Retention And Account Stability`, `Account Stability`, `Renewal Readiness`, or `Retention Plans`.
- Whether account-level retention data should be a first-class backend resource or derived from engagements, signals, tasks, and plans.
- Whether recommendations are deterministic, AI-assisted, or hybrid.
- Whether approved SOW renewal terms should auto-create tasks/calendar events immediately or queue user-confirmed recommendations.
- What fields define commercial exposure and who owns manual commercial imports.
- How manual renewal terms and approved SOW-extracted terms resolve conflicts.

## Implementation Status

### Completed Items

- Backend persistence is implemented for account retention profiles, engagement renewals, retention plans, retention plan milestones, and retention plan actions in `backend/app/models.py`.
- A documented SQL migration artifact exists at `backend/migrations/20260531_retention_stability.sql`; runtime table creation remains aligned with the existing SQLAlchemy `create_all` startup pattern.
- Dedicated retention APIs are implemented in `backend/app/routers/retention.py` for account retention, engagement renewal, portfolio renewals, account retention plans, plan updates, plan action/task creation, action updates, paginated plan actions, and deterministic retention recommendations.
- Retention-scoped portfolio tasks, renewal signals, calendar items, and portfolio report APIs are implemented in `backend/app/routers/retention.py`; notice-window tasks, SOW expiry signals, notice deadlines, renewal dates, and plan actions are generated from authorized renewal/plan context.
- Retention API Swagger documentation is updated with endpoint descriptions and common 400/403/404/422 response descriptions in `backend/app/routers/retention.py`.
- Backend service/repository layers are implemented in `backend/app/services/retention.py` and `backend/app/repositories/retention.py`.
- Engagement create/update now syncs renewal intelligence into the dedicated retention renewal table in `backend/app/services/engagements.py`.
- Validation is implemented for notice deadline date conflicts, confidence bounds, non-negative exposure, SOW/extracted source confidence/citation, manual source override reason on explicit manual source selection, required plan fields, plan due dates against renewal milestones, action due dates against renewal milestones, and confirmed recommendation-to-task creation.
- Authorization is implemented through `retention_stability` RBAC plus account access checks. Leadership Viewer remains read-only, plan management is limited to KAM/KAM Head/Admin/Super Admin or authorized KAM owners, and Commercial Stakeholder updates are limited to configured commercial renewal fields where account-authorized.
- Portfolio renewals support search, filters, sorting, and pagination for account/engagement/source search, renewal/notice windows, risk, owner, confidence range, auto-renewal, source kind, exposure range, nearest notice/renewal, risk, exposure, and updated date.
- Account retention plans support account-scoped search/filter/sort/pagination, including title/action/success criteria search and filters for type, status, owner, due date, and renewal milestone range.
- Audit and timeline writes are implemented for renewal updates, retention profile updates, plan create/update, action create/update, and action completion.
- Runtime Field Builder support is implemented for `retention_stability` custom values on retention plans.
- Frontend API client is implemented in `frontend/src/services/retention.ts`.
- `/retention` is implemented as a first-class operational page with renewal list search/filter/sort/pagination, loading/empty/error states, account selection, portfolio report metrics, retention-scoped tasks, renewal signals, calendar context, and account plan preview.
- Sidebar navigation and dashboard drill-down now expose the Retention worklist.
- Account 360 now includes a `Retention` tab with retention readiness, renewal summary, recommendations, plan builder, runtime Field Builder fields, plan milestones/actions, read-only handling, loading/empty/error states, and recommendation-confirmed action creation.
- Engagement 360 renewal intelligence now includes an editable renewal form with validation/error state, loading/saving state, manual override capture, citation/confidence fields, and Leadership Viewer read-only behavior.
- Automated backend coverage exists in `backend/tests/test_retention_stability.py` for happy path, validation errors, authorization, commercial limited update, pagination/search/filter/sort, recommendations, Field Builder persistence, and audit/timeline writes.
- Automated frontend coverage exists in `frontend/src/pages/Retention.test.tsx` for loading, empty, error, search/filter/sort query behavior, and rendering retention tasks/signals/calendar context.
- Test environment defaults are stabilized in `backend/tests/conftest.py` so the full backend suite uses SQLite during app lifespan startup and exposes reset tokens for existing auth tests.

### Remaining Items

- Retention signals, notice-window tasks, calendar context, and portfolio report rows are generated inside the retention module from synchronized renewal/plan context. They are not yet persisted as records in separate global Signals, Tasks, Calendar, or Reports modules.
- Governance agenda/AI brief runtime inclusion of retention deadlines, milestones, and actions is documented in `specs/05-content-escalations-and-governance.md` but not fully implemented in governance services/UI.
- Scheduled daily recalculation for stale data, overdue actions, and renewal proximity is not implemented.
- Recommendation logic is deterministic v1 and uses weak health metrics, generated renewal signals, account stage, engagement renewal posture, SOW end/renewal dates, notice windows, and confidence/citation gaps. It does not yet incorporate every possible future PRD input source such as stakeholder map, CSAT, Ops updates, and full signal history.
- Field-level security is enforced at module/account/role level with commercial-field restrictions, but deeper per-field redaction rules for sensitive custom fields remain limited by current platform primitives.
- Retention plan action completion intentionally does not update account or engagement health automatically.
- Historical retention plans remain visible through account plan listing, but there is no dedicated archived-cycle timeline view beyond timeline entries and plan status.

### Technical Notes

- The implementation keeps Admin timeline-retention policy separate from account retention/account stability workflows.
- `POST /api/retention-plans/{plan_id}/tasks` creates `retention_plan_actions`, not global task records.
- Recommendation-created actions require `confirmed: true`; the backend rejects silent creation.
- Deterministic risk defaults prioritize overdue/near notice windows, expired renewals, critical account/engagement posture, confidence gaps, and weak delivery health.
- Verified commands after implementation: `backend\.venv\Scripts\python -m pytest backend/tests -q` passed with 33 tests, `npm test -- --run` passed with 28 frontend tests, and `npm run build` passed with the existing Vite chunk-size warning.
