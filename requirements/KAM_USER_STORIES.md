# KAM Intelligence Platform User Stories

Source: `requirements/KAM PRD.pdf`

This backlog converts the PRD into implementation-oriented user stories. API paths are proposed REST surfaces derived from the PRD and should be adjusted only if the backend routing standard changes.

## Global Product Rules

- Authentication: all non-public APIs require JWT bearer authentication.
- Authorization: enforce least-privilege RBAC at API, data-query, and field-serialization layers.
- Auditability: critical business and configuration actions record actor, timestamp, entity, previous value, new value, source, and reason where required.
- AI governance: AI output is advisory unless explicitly approved by a human; every factual claim must cite a source or state insufficient data.
- Draft governance: AI-created account, engagement, KYC, renewal, and stage values remain draft until approved.
- Sensitive data: protected records and fields must never be returned to unauthorized users, including hidden-entry hints.
- Performance: standard dashboards and Account Overview load within 3 seconds; AI/keyword search returns standard results within 5 seconds where services are healthy.
- Timeline scale: latest 100 timeline entries load within 3 seconds and account timelines support 10,000+ entries.
- Empty/loading/error states: every screen shows a non-blocking loading state, clear empty state, retryable error state, and field-level validation errors where forms exist.
- Pagination: use paginated list APIs for operational lists even where PRD only explicitly calls out timeline pagination/performance.

## 1. Account Onboarding And Workspace

### Story 1.1 - Charter/SOW-led account onboarding

As a KAM Head, I want to start account onboarding from one or more uploaded project charters and SOWs, so that a nominated client can become an official account workspace only after review.

- Acceptance criteria:
  - AI prepares a draft account with account name, lifecycle status, segment, region, service context, commercial summary, initial notes, and source citations.
  - KAM Head/Admin can review, edit, approve, or reject the draft.
  - Only approved drafts become official Account Overview workspaces visible in dashboards.
  - If a matching account exists, the system suggests linking instead of creating a duplicate.
- UI requirements:
  - Onboarding upload screen with drag/drop file upload, linked URL entry, source list, extraction status, and draft preview.
  - Draft review screen with side-by-side source citations and editable draft fields.
  - Approve, reject, edit, and link-to-existing controls.
- API requirements:
  - `POST /api/onboarding/drafts`
  - `GET /api/onboarding/drafts`
  - `GET /api/onboarding/drafts/{draft_id}`
  - `PATCH /api/onboarding/drafts/{draft_id}`
  - `POST /api/onboarding/drafts/{draft_id}/approve`
  - `POST /api/onboarding/drafts/{draft_id}/reject`
  - `POST /api/onboarding/drafts/{draft_id}/link-account`
- Validation rules:
  - Require at least one charter, SOW, attachment, or source link.
  - Require account name, lifecycle status, segment, region, and source citation before approval.
  - Reject unsupported file types and files above configured limits.
  - Require rejection reason when rejecting a draft.
- Permissions:
  - Create/review/approve/reject: KAM Head, Admin.
  - Read drafts: KAM Head, Admin, assigned KAM where authorized.
  - Official account visibility follows account-level RBAC after approval.
- Empty/loading/error states:
  - Empty upload state explains that charter/SOW evidence is needed.
  - Extraction loading state shows queued, running, completed, and failed document statuses.
  - Error state allows retrying failed extraction without losing uploaded files.
- Filters/sorting/pagination/search:
  - Draft list filters: status, lifecycle status, segment, region, uploader, owner, created date.
  - Search: account name, source document name.
  - Sorting: newest, oldest, account name, extraction status.
  - Pagination: required for draft list.
- Edge cases:
  - Duplicate account match requires explicit user decision.
  - AI failure must not block manual draft creation.
  - Partial extraction can be approved only when required fields are manually completed.
  - Draft approval creates account, engagement, KYC, renewal, and timeline records atomically.

### Story 1.2 - Primary and matrix ownership assignment

As a KAM Head, I want to assign a primary Account Manager and optional matrix owners, so that account responsibilities, notifications, and access are clear.

- Acceptance criteria:
  - Primary AM is assigned during onboarding.
  - Assignment record includes previous owner, new owner, actor, timestamp, rationale, and related source.
  - Matrix owners can include supporting AMs, Ops Lead, and leadership sponsor.
  - Ownership is usable for filters, notifications, tasks, and engagement access.
- UI requirements:
  - Owner assignment panel on onboarding and Account Overview.
  - Matrix ownership editor with role-specific owner selectors.
  - Ownership history drawer.
- API requirements:
  - `GET /api/accounts/{account_id}/owners`
  - `POST /api/accounts/{account_id}/owners`
  - `PATCH /api/accounts/{account_id}/owners/{owner_id}`
  - `DELETE /api/accounts/{account_id}/owners/{owner_id}`
  - `GET /api/accounts/{account_id}/ownership-history`
- Validation rules:
  - Require one active primary AM.
  - Require assignment rationale for primary AM changes.
  - Prevent duplicate active owner assignment for the same ownership role.
  - User must be active and eligible for selected ownership role.
- Permissions:
  - Manage ownership: KAM Head, Admin.
  - View ownership: authorized account users and Leadership Viewer.
- Empty/loading/error states:
  - Empty matrix owners state shows primary owner only.
  - Loading state for user picker and ownership history.
  - Error state when selected owner is inactive or unauthorized.
- Filters/sorting/pagination/search:
  - User picker search by name, email, role.
  - Owner history sorted newest first and paginated.
  - Account filters by primary AM, supporting AM, Ops Lead, leadership sponsor.
- Edge cases:
  - Removing a matrix owner does not remove historical audit records.
  - Changing primary AM triggers handover workflow where configured.
  - Archived accounts keep owner history read-only.

### Story 1.3 - Lifecycle status and source attachments

As a KAM, I want lifecycle status and source attachments maintained on accounts and engagements, so that account context and evidence remain traceable.

- Acceptance criteria:
  - Supported lifecycle statuses: Onboarding, Active, At Risk, Renewal Focus, Expansion Focus, Dormant, Archived.
  - Status is visible on Account Overview and filterable in dashboards.
  - Status changes create timeline events.
  - Charters, SOWs, files, links, and source references can attach to account and engagement records.
- UI requirements:
  - Lifecycle status badge and status-change control.
  - Attachment/source evidence panel with record links and citation usage.
  - Status history display.
- API requirements:
  - `PATCH /api/accounts/{account_id}/status`
  - `GET /api/accounts/{account_id}/attachments`
  - `POST /api/accounts/{account_id}/attachments`
  - `DELETE /api/accounts/{account_id}/attachments/{attachment_id}`
  - `POST /api/engagements/{engagement_id}/attachments`
- Validation rules:
  - Require reason for status change where configured.
  - Archived accounts cannot be edited except by Admin/KAM Head.
  - Attachment must have file or URL and source type.
- Permissions:
  - Manage status: KAM Head, Admin, authorized KAM where configured.
  - Manage attachments: authorized KAM/Admin.
  - View sensitive attachments only when field-level permission allows.
- Empty/loading/error states:
  - Empty attachment state prompts upload or link.
  - Loading state for attachment preview and citation retrieval.
  - Error state for failed upload, unsupported type, or permission denial.
- Filters/sorting/pagination/search:
  - Account filters by lifecycle status.
  - Attachment search by title, file name, source type.
  - Attachment sorting by uploaded date, source type, name.
  - Attachment list paginated.
- Edge cases:
  - Deleting attachment with existing citations requires warning or restriction.
  - Archived status should disable most operational actions.
  - Source references remain available even if a file cannot be previewed.

## 2. Engagement/SOW Management And Engagement 360

### Story 2.1 - Engagement/SOW record management

As a KAM, I want to create and maintain one or more Engagement/SOW records under an account, so that each engagement has its own operational, commercial, and renewal context.

- Acceptance criteria:
  - Engagement can be created from approved drafts or manual entry.
  - Each engagement includes name, source document links, start date, end date, renewal date, notice period, owner, service lines, value, delivery status, and risks.
  - Engagement 360 shows profile, evidence, delivery health, resource dependency, commercial health, renewal posture, activities, escalations, attachments, and timeline.
- UI requirements:
  - Engagement list on Account Overview.
  - Engagement create/edit form.
  - Engagement 360 detail page with tabs for profile, renewal, risks, activities, escalations, attachments, and timeline.
- API requirements:
  - `GET /api/accounts/{account_id}/engagements`
  - `POST /api/accounts/{account_id}/engagements`
  - `GET /api/engagements/{engagement_id}`
  - `PATCH /api/engagements/{engagement_id}`
  - `DELETE /api/engagements/{engagement_id}`
- Validation rules:
  - Require account, engagement name, owner, start date, delivery status, and service line.
  - End date must be after start date.
  - Renewal date and notice deadline must be consistent with SOW terms.
  - Value must be non-negative and use configured currency.
- Permissions:
  - Create/update: authorized KAM, KAM Head, Admin.
  - View: authorized account/engagement users and Leadership Viewer.
  - Delete/archive: KAM Head/Admin or configured role.
- Empty/loading/error states:
  - Empty engagement state prompts creating from SOW or manual entry.
  - Loading state for Engagement 360 sections.
  - Error state for missing engagement, stale permissions, or failed source loading.
- Filters/sorting/pagination/search:
  - Engagement filters: status, owner, service line, renewal window, risk status.
  - Search: engagement name, SOW title, service line.
  - Sorting: renewal date, end date, value, delivery status, updated date.
  - Pagination: required for account engagement list when count grows.
- Edge cases:
  - One account can have multiple engagements and each engagement can have multiple charters/SOWs.
  - Draft engagement data cannot affect health until approved.
  - Engagement events appear in both Engagement 360 and Account Timeline.

### Story 2.2 - Engagement health rollup

As a KAM Head, I want engagement health to roll into Account Health using configurable metric rules, so that account-level health reflects engagement-level reality.

- Acceptance criteria:
  - Engagement scores contribute to Account Health according to configured rules.
  - Rollup shows engagement contribution.
  - Historical snapshots preserve values when formulas change.
- UI requirements:
  - Engagement health panel with score, RAG status, drivers, freshness, and contribution to Account Health.
  - Account Health breakdown showing engagement contributions.
- API requirements:
  - `GET /api/engagements/{engagement_id}/health`
  - `POST /api/engagements/{engagement_id}/health/recalculate`
  - `GET /api/accounts/{account_id}/health/rollup`
- Validation rules:
  - Recalculation requires published metric configuration.
  - Invalid or stale source data marks score dirty instead of silently calculating.
- Permissions:
  - View health: authorized account users and Leadership Viewer.
  - Recalculate: KAM, KAM Head, Admin.
  - Configure formulas: KAM Head, Admin.
- Empty/loading/error states:
  - Empty state when no metrics are configured.
  - Loading state during recalculation.
  - Error state for invalid formula or missing required inputs.
- Filters/sorting/pagination/search:
  - Sort engagement contribution by score, risk, freshness, or value.
  - Filter by stale, dirty, RAG status.
  - Historical snapshots paginated and sorted newest first.
- Edge cases:
  - Formula changes do not rewrite historical snapshots.
  - Manual refresh before reviews should not block other Engagement 360 data.

## 3. Account Overview

### Story 3.1 - Unified account workspace

As a KAM, I want Account Overview to be the primary workspace for account intelligence, so that I can understand current state and history without jumping between disconnected modules.

- Acceptance criteria:
  - Account Overview includes profile, engagements, KYC, stakeholders, plan, scores, signals, activities, opportunities, education, escalations, governance, attachments, timeline, and AI brief.
  - Summary cards show ARR/commercial value, stage, health, open signals, overdue activities, next governance event, open opportunities, and active escalations.
  - Cards link to source sections.
- UI requirements:
  - Account Overview page with summary cards, section tabs, quick actions, and embedded timeline.
  - Source-linked navigation from summary cards.
  - Responsive layout for desktop, laptop, and tablet.
- API requirements:
  - `GET /api/accounts/{account_id}/overview`
  - `GET /api/accounts/{account_id}/summary-cards`
  - `GET /api/accounts/{account_id}/permissions`
- Validation rules:
  - Account must exist and user must have access.
  - Summary cards must not include fields user is not allowed to see.
- Permissions:
  - KAM/KAM Head see operational controls where authorized.
  - Leadership Viewer receives read-only account intelligence and no restricted edit controls.
  - Admin can view where policy allows.
- Empty/loading/error states:
  - Skeleton loading for summary cards and sections.
  - Empty section states for no opportunities, no escalations, no governance, etc.
  - Error state per section so one failed module does not break entire page.
- Filters/sorting/pagination/search:
  - Section-level filters inherit from each module.
  - Account quick search by account name on account selector.
  - Timeline and activity sections paginated.
- Edge cases:
  - Read-only roles should never receive hidden edit controls from API-driven action metadata.
  - Missing downstream module data should not block Account Overview.

## 4. KYC And AI-Assisted KYC

### Story 4.1 - AI KYC draft generation and review

As a KAM, I want AI-assisted KYC drafts generated from approved sources, so that I can review and approve account intelligence faster.

- Acceptance criteria:
  - Authorized users can trigger AI KYC from Account Overview, onboarding draft, or selected charter/SOW documents.
  - Draft includes citations, confidence, conflicts, missing fields, and differences from previous snapshot.
  - Users can review, edit, enrich, approve, or reject draft content.
  - Only approved KYC becomes official platform intelligence.
- UI requirements:
  - KYC screen with draft/current comparison, field-level citations, confidence badges, conflict indicators, missing-field list, and approval controls.
  - Review queue for pending KYC drafts.
- API requirements:
  - `POST /api/accounts/{account_id}/kyc/drafts`
  - `GET /api/accounts/{account_id}/kyc/drafts/{draft_id}`
  - `PATCH /api/accounts/{account_id}/kyc/drafts/{draft_id}`
  - `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/approve`
  - `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/reject`
- Validation rules:
  - Require approved account/engagement/source records before official approval.
  - Require approver and timestamp.
  - Reject approval when required KYC fields are empty unless an authorized override reason is captured.
  - Low-confidence/conflicting fields require explicit review acknowledgment.
- Permissions:
  - Trigger/review: KAM, KAM Head where account access exists.
  - Approve/reject: KAM Head or authorized owner.
  - View: authorized users; sensitive fields follow field-level security.
- Empty/loading/error states:
  - Empty KYC state offers AI draft trigger and manual entry.
  - Loading state for AI extraction and research enrichment.
  - Error state allows retry and manual fallback when AI fails.
- Filters/sorting/pagination/search:
  - Draft list filters: status, confidence level, missing fields, stale status, reviewer, created date.
  - Search KYC fields and citations.
  - Sorting by created date, confidence, completeness.
  - Snapshot history paginated.
- Edge cases:
  - Unapproved drafts have no effect on metrics, signals, renewal posture, or stage.
  - Previous approved snapshots are immutable and viewable.
  - AI failure must not block manual KYC.

### Story 4.2 - KYC snapshots, freshness, and completion

As a KAM Head, I want immutable KYC snapshots with freshness and completeness indicators, so that I can trust whether account intelligence is current.

- Acceptance criteria:
  - Approved snapshots store approver, timestamp, source context, extraction run, and change summary.
  - Account Overview and dashboards show KYC freshness, completeness, stale status, source coverage, and confidence.
  - KYC completion percentage is based on populated required fields.
- UI requirements:
  - Snapshot history timeline.
  - KYC header with completeness percentage, stale indicator, confidence summary, and last approved date.
  - Diff view between snapshots.
- API requirements:
  - `GET /api/accounts/{account_id}/kyc/snapshots`
  - `GET /api/accounts/{account_id}/kyc/snapshots/{snapshot_id}`
  - `GET /api/accounts/{account_id}/kyc/freshness`
- Validation rules:
  - Snapshots are immutable after approval.
  - Completion percentage uses configured required fields only.
  - Stale status uses configured freshness threshold.
- Permissions:
  - View snapshots: authorized account users.
  - Configure required fields/freshness: Admin, KAM Head.
- Empty/loading/error states:
  - Empty state when no approved snapshot exists.
  - Loading state for snapshot diff.
  - Error state for unavailable source documents.
- Filters/sorting/pagination/search:
  - Snapshot history sorted newest first and paginated.
  - Search snapshot fields and change summaries.
  - Filter snapshots by approver, source, confidence.
- Edge cases:
  - Deleting source files must not remove snapshot facts or audit trail.
  - Snapshot diff must handle fields added after older snapshot versions.

### Story 4.3 - AI KYC agent workstreams

As a KAM, I want AI KYC workstreams to run with separate statuses, so that I can see which parts of KYC are complete or failed.

- Acceptance criteria:
  - Workstreams: Market Research, Client Research, Stakeholder Details, Tkxel Engagement with Client, Financial Landscape.
  - Each workstream shows pending, running, complete, or failed status.
  - Outputs include confidence, citations, and missing-field indicators.
  - Refresh AI Data reruns all workstreams and creates timeline entries.
- UI requirements:
  - Workstream progress panel on KYC screen.
  - Refresh AI Data button with running indicator and last run timestamp.
  - Workstream result cards.
- API requirements:
  - `POST /api/accounts/{account_id}/kyc/agent-runs`
  - `GET /api/accounts/{account_id}/kyc/agent-runs/{run_id}`
  - `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/refresh`
- Validation rules:
  - Refresh allowed only for authorized users.
  - Previous run output remains visible until new run completes.
  - Failed workstream can be retried without rerunning all where supported.
- Permissions:
  - Trigger/refresh: KAM, KAM Head.
  - View: authorized account users.
- Empty/loading/error states:
  - Empty workstream state before first run.
  - Per-workstream loading and error state.
  - Partial failure state preserves completed workstreams.
- Filters/sorting/pagination/search:
  - Agent run history sorted newest first and paginated.
  - Filter runs by status, workstream, triggered by.
  - Search output and citations.
- Edge cases:
  - Parallel or sequential execution depends on configuration.
  - AI research source outage marks impacted workstream failed, not entire KYC page.

## 5. Stakeholder And Relationship Management

### Story 5.1 - Stakeholder map and relationship attributes

As a KAM, I want to maintain stakeholder maps at account and engagement levels, so that relationship coverage and influence are visible.

- Acceptance criteria:
  - Stakeholders can be tagged by configurable role such as executive sponsor, economic buyer, technical decision maker, operational POC, commercial owner, or influencer.
  - Profiles track influence, relationship strength, sentiment, political risk, and engagement history.
  - Timeline entries are created for stakeholder additions, major relationship changes, and important interactions.
- UI requirements:
  - Stakeholder map screen with cards/list and profile drawer.
  - Relationship attributes editor.
  - Interaction history and timeline linkage.
- API requirements:
  - `GET /api/accounts/{account_id}/stakeholders`
  - `POST /api/accounts/{account_id}/stakeholders`
  - `GET /api/stakeholders/{stakeholder_id}`
  - `PATCH /api/stakeholders/{stakeholder_id}`
  - `DELETE /api/stakeholders/{stakeholder_id}`
- Validation rules:
  - Require stakeholder name and role.
  - Validate email/phone where provided.
  - Configured stakeholder role must be active.
  - Relationship scores must be within configured range.
- Permissions:
  - Manage: authorized KAM, KAM Head.
  - View: Leadership Viewer and authorized account users.
  - Sensitive stakeholder fields require field-level permission.
- Empty/loading/error states:
  - Empty state prompts adding first stakeholder.
  - Loading state for profile and history.
  - Error state for restricted stakeholder data.
- Filters/sorting/pagination/search:
  - Filters: stakeholder role, influence, sentiment, relationship strength, active/inactive, engagement.
  - Search: name, title, company, email.
  - Sorting: influence, relationship strength, last interaction, name.
  - Pagination for stakeholder list.
- Edge cases:
  - Inactive stakeholder remains in history but is excluded from active coverage metrics.
  - Restricted stakeholder notes are not returned to unauthorized users.

### Story 5.2 - Stakeholder coverage gaps and org chart

As a Leadership Viewer, I want org-chart and coverage-gap visualization, so that I can see relationship risks at a glance.

- Acceptance criteria:
  - Coverage gap signals can detect missing executive sponsor, missing commercial owner, or only one active stakeholder.
  - Org chart visualizes influence and relationship coverage.
  - Gap signals use configurable rules.
- UI requirements:
  - Org-chart view with role, influence, and sentiment indicators.
  - Coverage gap panel with recommended actions.
- API requirements:
  - `GET /api/accounts/{account_id}/stakeholders/org-chart`
  - `GET /api/accounts/{account_id}/stakeholders/coverage-gaps`
  - `POST /api/admin/stakeholder-gap-rules`
- Validation rules:
  - Gap rules require target role, condition, severity, and active state.
  - Org-chart relationships cannot create circular manager links unless configured as non-hierarchical.
- Permissions:
  - View org chart: authorized users and Leadership Viewer.
  - Configure gap rules: Admin, KAM Head.
- Empty/loading/error states:
  - Empty org chart state when no stakeholders exist.
  - Loading state for graph layout.
  - Error state for invalid relationship data.
- Filters/sorting/pagination/search:
  - Filter org chart by role, engagement, sentiment, influence.
  - Search stakeholder nodes.
  - Sort gap list by severity, age, status.
- Edge cases:
  - Gap signal should not duplicate active unresolved gap for same condition.
  - Stakeholder sensitivity rules apply to graph nodes and edges.

## 6. Account Planning, Whitespace, And Service Catalog

### Story 6.1 - Basic Account Plan

As a KAM, I want to maintain a Basic Account Plan, so that retention and growth actions are organized for each active account.

- Acceptance criteria:
  - Plan includes retention focus, growth focus, risks, opportunities, commitments, service gaps, and next actions.
  - Plan is available for active accounts.
  - Plan updates create timeline entries where configured.
- UI requirements:
  - Account Plan tab with editable sections and next-action list.
  - Inline save and change history.
- API requirements:
  - `GET /api/accounts/{account_id}/plan`
  - `PUT /api/accounts/{account_id}/plan`
  - `GET /api/accounts/{account_id}/plan/history`
- Validation rules:
  - Require account status to allow editing unless override permission exists.
  - Next actions require owner and due date.
  - Text fields enforce configured length limits.
- Permissions:
  - Manage: assigned KAM, KAM Head.
  - View: authorized users and Leadership Viewer.
- Empty/loading/error states:
  - Empty plan state prompts creating plan.
  - Loading state for plan sections.
  - Error state if account is archived or user lacks access.
- Filters/sorting/pagination/search:
  - Next-action filters: owner, due date, status, priority.
  - Search plan text and actions.
  - Sort actions by due date, priority, status.
- Edge cases:
  - Archived accounts are read-only.
  - Plan history preserves previous values.

### Story 6.2 - Service catalog, whitespace, and adjacency recommendations

As a KAM Head, I want service catalog and adjacency rules configured, so that whitespace and adjacent-service opportunities can be identified consistently.

- Acceptance criteria:
  - Admin/KAM Head can maintain service catalog and adjacency configuration.
  - KAM can capture whitespace inputs at account and engagement levels.
  - Recommendations show rationale and do not automatically convert to opportunities.
- UI requirements:
  - Admin service catalog and adjacency matrix screens.
  - Whitespace capture section on Account Plan.
  - Recommendation cards with create-opportunity action.
- API requirements:
  - `GET /api/admin/service-catalog`
  - `POST /api/admin/service-catalog`
  - `PATCH /api/admin/service-catalog/{service_id}`
  - `PUT /api/admin/service-adjacencies`
  - `GET /api/accounts/{account_id}/whitespace`
  - `PUT /api/accounts/{account_id}/whitespace`
  - `GET /api/accounts/{account_id}/service-recommendations`
- Validation rules:
  - Service names must be unique and active before use.
  - Adjacency rules require source service, target service, rationale, and active state.
  - Whitespace input must reference active service catalog items.
- Permissions:
  - Configure catalog: Admin, KAM Head.
  - Manage whitespace: authorized KAM/KAM Head.
  - View recommendations: authorized account users.
- Empty/loading/error states:
  - Empty catalog state prompts service creation.
  - Loading state for recommendation generation.
  - Error state for invalid adjacency configuration.
- Filters/sorting/pagination/search:
  - Service search by name/tag/category.
  - Filter services by active state and category.
  - Sort services by name, category, updated date.
  - Recommendations sorted by relevance/score and filterable by service line.
- Edge cases:
  - Inactive services remain on historical records but hidden from new selection.
  - Recommendation does not create opportunity until user confirms.

## 7. Growth And Opportunity Management

### Story 7.1 - Opportunity CRUD, board, and list

As a KAM, I want to manage account-level and engagement-level opportunities, so that growth and renewal work is visible and actionable.

- Acceptance criteria:
  - Opportunity includes type, service line, value, owner, stage, next step, target date, and source context.
  - Users can move opportunities through stages in board and list views.
  - Pipeline totals are visible.
  - Creation, stage changes, wins, losses, deferrals, and decisions create timeline events with before/after values.
- UI requirements:
  - Opportunity board grouped by stage.
  - Opportunity list with inline filters.
  - Create/edit opportunity modal and detail drawer.
  - Pipeline totals by stage and value.
- API requirements:
  - `GET /api/opportunities`
  - `POST /api/opportunities`
  - `GET /api/opportunities/{opportunity_id}`
  - `PATCH /api/opportunities/{opportunity_id}`
  - `DELETE /api/opportunities/{opportunity_id}`
  - `POST /api/opportunities/{opportunity_id}/stage`
- Validation rules:
  - Require account, type, service line, owner, stage, next step, and target date.
  - Value must be non-negative.
  - Stage transition must be allowed by configuration.
  - Win/loss requires outcome reason where configured.
- Permissions:
  - Manage: authorized KAM, KAM Head, Commercial Stakeholder where configured.
  - View: Leadership Viewer and authorized account users.
  - Configure types/stages: Admin, KAM Head.
- Empty/loading/error states:
  - Empty board/list state prompts creating opportunity.
  - Loading state for board columns and totals.
  - Error state for invalid stage move or missing permissions.
- Filters/sorting/pagination/search:
  - Filters: account, engagement, type, service line, owner, stage, target date, value range, source.
  - Search: opportunity name, next step, source context.
  - Sorting: target date, value, updated date, stage, owner.
  - Pagination for list view; board columns can lazy-load.
- Edge cases:
  - Deferred/lost opportunities remain in history and reporting.
  - Moving cards must be optimistic only if API confirms.
  - Source-linked decisions must remain reachable from timeline.

### Story 7.2 - Opportunity type configuration

As an Admin, I want configurable opportunity types, so that forms, filters, reports, and analytics match business terminology.

- Acceptance criteria:
  - Types include cross-sell, upsell, renewal, expansion, rescue/recovery, and other.
  - Types appear consistently in forms, filters, reports, and analytics.
- UI requirements:
  - Admin taxonomy screen for opportunity types.
  - Active/inactive toggle and sort order control.
- API requirements:
  - `GET /api/admin/opportunity-types`
  - `POST /api/admin/opportunity-types`
  - `PATCH /api/admin/opportunity-types/{type_id}`
  - `DELETE /api/admin/opportunity-types/{type_id}`
- Validation rules:
  - Type name and slug are required and unique.
  - In-use types cannot be hard deleted; deactivate instead.
- Permissions:
  - Configure: Admin, KAM Head.
  - Read active types: authenticated users with opportunity access.
- Empty/loading/error states:
  - Empty taxonomy state prompts creating first type.
  - Loading state for type list.
  - Error state for duplicate slug or in-use delete attempt.
- Filters/sorting/pagination/search:
  - Search by name/slug.
  - Filter active/inactive.
  - Sort by display order/name.
- Edge cases:
  - Inactive type remains on historical opportunities.
  - Renaming type updates display label without changing historical meaning.

## 8. Retention And Account Stability

### Story 8.1 - Renewal intelligence and notice windows

As a KAM, I want renewal readiness and SOW notice-window intelligence, so that renewal risk is visible before deadlines pass.

- Acceptance criteria:
  - Track renewal readiness, renewal risk, SOW start/end date, renewal date, notice deadline, auto-renewal terms, commercial exposure, days to expiry, owner, confidence, and citation.
  - Renewal risks, SOW expiry, and notice deadlines appear in Account Overview, Engagement 360, dashboards, signals, tasks, calendar, and reports.
- UI requirements:
  - Renewal panel on Account Overview and Engagement 360.
  - Notice deadline and days-to-expiry badges.
  - Source citation links.
- API requirements:
  - `GET /api/accounts/{account_id}/retention`
  - `PATCH /api/accounts/{account_id}/retention`
  - `GET /api/engagements/{engagement_id}/renewal`
  - `PATCH /api/engagements/{engagement_id}/renewal`
- Validation rules:
  - Renewal dates must align with approved SOW terms or manual override reason.
  - Notice deadline must be before renewal/end date.
  - Confidence required when extracted from documents.
- Permissions:
  - Manage: KAM, KAM Head, Commercial Stakeholder where configured.
  - View: Leadership Viewer and authorized users.
- Empty/loading/error states:
  - Empty renewal state prompts extracting from SOW or manual entry.
  - Loading state for date extraction and citation preview.
  - Error state for conflicting SOW terms.
- Filters/sorting/pagination/search:
  - Filters: renewal window, notice deadline window, risk, owner, confidence, auto-renewal.
  - Sorting: nearest notice deadline, nearest renewal date, risk, commercial exposure.
  - Search by SOW/source title.
  - Pagination for portfolio renewal lists.
- Edge cases:
  - Missing SOW terms can be manually entered but flagged as manual.
  - Approved terms create renewal signals, notice-window tasks, and calendar items.

### Story 8.2 - Retention and stabilization plans

As a KAM, I want to create retention, renewal, and stabilization plans, so that weak metrics and renewal risks have owned actions.

- Acceptance criteria:
  - Plans include actions, owners, due dates, success criteria, renewal milestones, and timeline history.
  - Stability and renewal recommendations are based on weak metrics, signals, account stage, engagement posture, SOW end date, and notice window.
  - Recommendations require user selection before tasks are created.
- UI requirements:
  - Retention plan builder.
  - Recommendation panel with rationale.
  - Milestone and task list.
- API requirements:
  - `GET /api/accounts/{account_id}/retention-plans`
  - `POST /api/accounts/{account_id}/retention-plans`
  - `PATCH /api/retention-plans/{plan_id}`
  - `POST /api/retention-plans/{plan_id}/tasks`
  - `GET /api/accounts/{account_id}/retention-recommendations`
- Validation rules:
  - Require plan type, owner, due dates, and success criteria.
  - Task creation from recommendation requires user confirmation.
  - Due dates cannot be after renewal milestone where configured.
- Permissions:
  - Manage: KAM, KAM Head.
  - View: authorized account users and Leadership Viewer.
- Empty/loading/error states:
  - Empty plan state prompts creating a plan.
  - Loading state for recommendations.
  - Error state if recommendation inputs are missing.
- Filters/sorting/pagination/search:
  - Filters: plan type, status, owner, due date, renewal milestone.
  - Search: action text, success criteria.
  - Sorting: due date, risk, updated date.
  - Pagination for plan and action lists.
- Edge cases:
  - Completing a task does not automatically improve health unless underlying data changes.
  - Plans remain visible after renewal cycle for history.

## 9. Configurable Scoring And Metric Engine

### Story 9.1 - Metric definition configuration

As an Admin, I want configurable metric definitions, so that health scoring can evolve without engineering support.

- Acceptance criteria:
  - Admin/KAM Head can create, edit, activate, deactivate, validate, and version metrics.
  - Metric includes name, scope, weight, thresholds, freshness rule, owner, source, and effective date.
  - Invalid configuration is blocked before publish.
- UI requirements:
  - Metric builder screen with formula editor, thresholds, weights, source selection, freshness rules, test/validate action, and version history.
- API requirements:
  - `GET /api/admin/metrics`
  - `POST /api/admin/metrics`
  - `PATCH /api/admin/metrics/{metric_id}`
  - `POST /api/admin/metrics/{metric_id}/validate`
  - `POST /api/admin/metrics/{metric_id}/publish`
  - `GET /api/admin/metrics/{metric_id}/versions`
- Validation rules:
  - Block invalid formulas, missing weights, conflicting thresholds, circular dependencies, invalid freshness rules, and invalid effective dates.
  - Weight totals must follow configured rules.
  - Deactivated metrics cannot be selected for new formulas.
- Permissions:
  - Configure: Admin, KAM Head.
  - View published definitions: authorized users where relevant.
- Empty/loading/error states:
  - Empty metric state prompts creating first metric.
  - Loading state for validation.
  - Error state highlights exact invalid formula/threshold fields.
- Filters/sorting/pagination/search:
  - Filters: scope, active state, source, owner, effective date.
  - Search: metric name/slug.
  - Sorting: name, updated date, scope, effective date.
  - Pagination for metric list and version history.
- Edge cases:
  - Published versions remain available for historical snapshots.
  - Editing a published metric creates a new draft/version rather than mutating history.

### Story 9.2 - Score calculation, refresh, and snapshots

As a KAM, I want account and engagement scores to calculate with drivers and freshness, so that health status is explainable.

- Acceptance criteria:
  - Scores calculate at Account and Engagement levels.
  - Inputs include approved KYC, opportunities, stakeholders, activities, escalations, governance, CSAT, manual commercial fields, and Ops updates.
  - Event-driven and scheduled recalculation are supported.
  - Manual/on-demand recalculation is available before reviews.
  - Every score shows freshness, last calculated timestamp, trend, status, drivers, and reason codes.
  - Score history is retained as snapshots.
- UI requirements:
  - Score detail panel with RAG status, driver breakdown, freshness, trend, reason codes, and manual refresh button.
  - Score history chart/table.
- API requirements:
  - `GET /api/accounts/{account_id}/scores`
  - `POST /api/accounts/{account_id}/scores/recalculate`
  - `GET /api/accounts/{account_id}/score-snapshots`
  - `GET /api/engagements/{engagement_id}/scores`
  - `POST /api/scoring/jobs`
- Validation rules:
  - Use only approved authoritative records.
  - If required inputs are missing, mark score incomplete/dirty and show reason.
  - Recalculate only against published metric versions.
- Permissions:
  - View: authorized users.
  - Manual refresh: KAM, KAM Head.
  - Configure jobs: Admin.
- Empty/loading/error states:
  - Empty score state when metric config is missing.
  - Loading state during recalculation.
  - Error state for calculation failure with job log reference.
- Filters/sorting/pagination/search:
  - Snapshot filters: date range, metric, RAG status, stale/dirty.
  - Sorting: calculated date, score, trend.
  - Pagination for snapshot history.
- Edge cases:
  - Formula changes do not rewrite historical snapshots.
  - Scheduled runs create job logs and stale indicators.
  - AI does not create authoritative scores.

## 10. Rule-Based Signals And Attention Center

### Story 10.1 - Deterministic signal generation and detail

As a KAM, I want deterministic signals with evidence and reason codes, so that I know why an item needs attention.

- Acceptance criteria:
  - Signals are generated from configured rules, including SOW expiry, renewal date, notice deadline, stale KYC, and weak metrics.
  - Signal detail shows reason codes, evidence, severity, source records, created date, owner, age, confidence where document-derived, and citation.
  - AI is not authoritative for signals in MVP.
- UI requirements:
  - Signal detail drawer with evidence, reason codes, lifecycle controls, source links, and optional AI explanation action.
- API requirements:
  - `GET /api/signals`
  - `GET /api/signals/{signal_id}`
  - `POST /api/signals/evaluate`
  - `GET /api/signals/{signal_id}/evidence`
  - `POST /api/signals/{signal_id}/ai-explanation`
- Validation rules:
  - Signal must have account or engagement, severity, rule, source evidence, owner, and status.
  - Duplicate active signal for same account/rule/source should be suppressed or merged.
- Permissions:
  - View/manage: assigned KAM and KAM Head.
  - Configure rules: Admin, KAM Head.
  - Leadership Viewer can view permitted strategic signals.
- Empty/loading/error states:
  - Empty state: no active signals.
  - Loading state for evidence and AI explanation.
  - Error state if source record is unavailable or restricted.
- Filters/sorting/pagination/search:
  - Filters: severity, age, lifecycle status, owner, account, engagement, signal type, SLA status, renewal window.
  - Search: signal title, reason code, source.
  - Sorting: severity, age, due/SLA date, created date.
  - Pagination for signal list.
- Edge cases:
  - AI explanation is advisory, source-backed, labeled, and never changes status automatically.
  - Restricted source evidence is hidden if user lacks access.

### Story 10.2 - Attention Center and signal lifecycle

As a KAM, I want an Attention Center for signals and SLA-driven actions, so that I can decide what needs attention today.

- Acceptance criteria:
  - Attention Center shows signals, severity, age, review status, recommended playbooks, SLA reminders, ownership, SOW expiry, and notice-window tasks.
  - Lifecycle statuses: New, Reviewed, Accepted, Dismissed, Converted, Resolved.
  - Lifecycle changes are audited and can emit timeline entries.
- UI requirements:
  - Attention Center list with saved/default views and bulk review where permitted.
  - Signal lifecycle controls.
  - Recommended playbook panel.
- API requirements:
  - `GET /api/attention-center`
  - `PATCH /api/signals/{signal_id}/status`
  - `POST /api/signals/{signal_id}/convert`
  - `GET /api/signals/{signal_id}/recommended-playbooks`
- Validation rules:
  - Dismiss requires reason where configured.
  - Convert requires target object type such as task/playbook.
  - Resolved requires completion evidence or source condition no longer active.
- Permissions:
  - Manage lifecycle: assigned KAM, KAM Head.
  - View portfolio: KAM Head.
  - Configure mapping: Admin, KAM Head.
- Empty/loading/error states:
  - Empty state indicates no attention items today.
  - Loading state for default view and counts.
  - Error state for failed status transition.
- Filters/sorting/pagination/search:
  - Filters: severity, owner, account, status, age, SLA, playbook available, renewal/notice window, signal type.
  - Search: account, signal, reason.
  - Sorting: priority/severity, SLA due, age, account.
  - Pagination required.
- Edge cases:
  - Status updates must be idempotent.
  - Timer resets on qualifying activity where SLA applies.

## 11. Playbooks, Activities, Tasks, And Calendar

### Story 11.1 - Playbook template configuration and execution

As a KAM Head, I want configurable playbook templates, so that recommended actions can be selected and executed consistently.

- Acceptance criteria:
  - Templates include objective, signal types, weak metrics, activities, default owners, due dates, success criteria, and skip rules.
  - Templates can be created, edited, versioned, activated, and deactivated.
  - AM selects a recommended playbook; the system does not auto-execute playbooks.
- UI requirements:
  - Admin playbook builder.
  - Recommended playbook chooser from signal/detail pages.
  - Version history and activation toggle.
- API requirements:
  - `GET /api/admin/playbook-templates`
  - `POST /api/admin/playbook-templates`
  - `PATCH /api/admin/playbook-templates/{template_id}`
  - `POST /api/playbooks/{template_id}/execute`
- Validation rules:
  - Template requires objective, at least one activity, owner rule, and due-date rule.
  - Deactivated templates cannot be newly executed.
  - Skip rules require skip reason.
- Permissions:
  - Configure: Admin, KAM Head.
  - Execute: assigned KAM.
  - View recommendations: authorized users.
- Empty/loading/error states:
  - Empty template state prompts creation.
  - Loading state while creating tasks from playbook.
  - Error state if template version is inactive or invalid.
- Filters/sorting/pagination/search:
  - Filters: active state, signal type, weak metric, owner rule.
  - Search: template name/objective.
  - Sorting: name, updated date, active state.
  - Pagination for template list.
- Edge cases:
  - Existing executed playbooks keep original version.
  - Playbook recommendation does not create tasks until AM confirms.

### Story 11.2 - Tasks, activities, and unified calendar

As a KAM, I want tasks and calendar items from playbooks, renewal dates, governance, and scoring activities, so that I can manage execution in one place.

- Acceptance criteria:
  - Tasks include owner, due date, status, priority, notes, evidence, outcome, and source signal/metric.
  - Ops Lead can contribute to assigned operational activities.
  - Completion affects metrics only through underlying data changes.
  - Calendar displays activities, SOW end dates, renewal dates, notice deadlines, due dates, and governance events.
- UI requirements:
  - Task list, task detail, activity history, evidence upload, and calendar view.
  - Calendar filters and "my items" view.
- API requirements:
  - `GET /api/tasks`
  - `POST /api/tasks`
  - `PATCH /api/tasks/{task_id}`
  - `POST /api/tasks/{task_id}/evidence`
  - `GET /api/calendar/items`
- Validation rules:
  - Task requires account, owner, due date, status, priority, and title.
  - Completion requires outcome where configured.
  - Evidence file/link must pass attachment validation.
- Permissions:
  - Manage owned tasks: assigned owner.
  - Contribute Ops updates: assigned Ops Lead.
  - View: authorized account users.
- Empty/loading/error states:
  - Empty task state for no tasks.
  - Loading calendar state.
  - Error state for unavailable calendar integration or failed evidence upload.
- Filters/sorting/pagination/search:
  - Filters: account, engagement, owner, due date, status, priority, source, my items, governance, score activities, renewal items.
  - Search: task title, notes, outcome.
  - Sorting: due date, priority, status, updated date.
  - Pagination for task list; calendar supports date navigation.
- Edge cases:
  - Overdue tasks trigger notifications/SLA where configured.
  - Source-linked task remains if original signal is resolved.

## 12. Client Education And Content

### Story 12.1 - Content catalog and recommendations

As a KAM, I want a lightweight client education content catalog and recommendations, so that I can share relevant material based on account needs.

- Acceptance criteria:
  - Content catalog supports manual entries, uploaded files, and linked URLs.
  - Recommendations are based on account stage, opportunity, service gap, signal, or weak metric.
  - Recommendations show rationale and require user action before sharing is recorded.
- UI requirements:
  - Content catalog list and content detail.
  - Content picker on account/opportunity/signal contexts.
  - Recommendation cards with rationale and send/share action.
- API requirements:
  - `GET /api/content`
  - `POST /api/content`
  - `PATCH /api/content/{content_id}`
  - `DELETE /api/content/{content_id}`
  - `GET /api/accounts/{account_id}/content-recommendations`
- Validation rules:
  - Content requires title, type, tag/category, and file or URL.
  - URL must be valid.
  - Uploaded file must pass file validation.
- Permissions:
  - Manage catalog: Content Specialist, Admin.
  - Select/share: KAM.
  - View shared history: authorized account users.
- Empty/loading/error states:
  - Empty catalog state prompts adding content.
  - Loading state for recommendation generation.
  - Error state if content source is unavailable.
- Filters/sorting/pagination/search:
  - Filters: tag, service line, account stage, type, active state.
  - Search: title, description, tag.
  - Sorting: name, updated date, popularity/relevance.
  - Pagination for content list.
- Edge cases:
  - Inactive content remains in sent history but hidden from new selection.
  - Recommendation does not imply content was sent.

### Story 12.2 - Sent-content history

As a KAM, I want to track content shared with clients, so that client education activity is visible in account history.

- Acceptance criteria:
  - History includes content name, date, sender, recipient, account, engagement, follow-up status, and timeline link.
  - Shared content creates timeline history.
- UI requirements:
  - Sent-content history table on Account Overview.
  - Share content form with recipients and follow-up status.
- API requirements:
  - `GET /api/accounts/{account_id}/sent-content`
  - `POST /api/accounts/{account_id}/sent-content`
  - `PATCH /api/sent-content/{sent_content_id}`
- Validation rules:
  - Require content, sender, date, recipient, and account.
  - Recipient email must be valid where email is captured.
- Permissions:
  - Create/update: authorized KAM.
  - View: authorized account users and Leadership Viewer.
- Empty/loading/error states:
  - Empty history state shows no shared content.
  - Loading state for history.
  - Error state if content record was archived.
- Filters/sorting/pagination/search:
  - Filters: date range, sender, recipient, content tag, follow-up status, engagement.
  - Search: content name, recipient.
  - Sorting: shared date, follow-up status.
  - Pagination required.
- Edge cases:
  - Deleted/inactive content still displays historical name.
  - Follow-up overdue can create tasks/notifications where configured.

## 13. Escalation Management

### Story 13.1 - Manual escalation workflow

As a KAM, I want to manually create and manage formal escalations, so that serious account issues are tracked with ownership and closure evidence.

- Acceptance criteria:
  - Escalation creation requires account/engagement, severity, owner, impact, SLA, and summary.
  - Severity and priority use configurable rules while preserving human ownership.
  - Escalation tracks mitigation plan, recovery actions, client communication cadence, Watchlist status, and resolution summary.
  - Escalation cannot close without required closure evidence or authorized override.
  - Major escalations require RCA.
- UI requirements:
  - Escalation create/edit form.
  - Escalation detail with status, SLA, updates, mitigation, Watchlist, RCA, and closure controls.
  - Operations update panel for Ops Lead.
- API requirements:
  - `GET /api/escalations`
  - `POST /api/escalations`
  - `GET /api/escalations/{escalation_id}`
  - `PATCH /api/escalations/{escalation_id}`
  - `POST /api/escalations/{escalation_id}/updates`
  - `POST /api/escalations/{escalation_id}/close`
- Validation rules:
  - Require account/engagement, severity, owner, impact, SLA, summary.
  - Closure requires resolution summary and evidence.
  - Major escalation closure requires RCA.
  - Override requires authorized role and reason.
- Permissions:
  - Create/manage: KAM, KAM Head.
  - Add Ops updates: Ops Lead.
  - View: Leadership Viewer and authorized account users.
  - Configure severity/SLA: Admin, KAM Head.
- Empty/loading/error states:
  - Empty escalation state indicates no active escalations.
  - Loading state for escalation detail and updates.
  - Error state for invalid closure or missing evidence.
- Filters/sorting/pagination/search:
  - Filters: account, engagement, severity, priority, owner, status, SLA, Watchlist, created date.
  - Search: summary, impact, RCA, update text.
  - Sorting: severity, SLA due, created date, updated date.
  - Pagination required.
- Edge cases:
  - Formal escalations are never auto-created by AI.
  - Closure is blocked if mandatory evidence is missing.
  - Severity recommendation does not override manual decision.

### Story 13.2 - Escalation notifications and deduplication

As a KAM Head, I want escalation notifications with structured metadata, so that I can act on stale or high-severity escalations without duplicate noise.

- Acceptance criteria:
  - Notification records capture recipient, channel, timestamp, related escalation ID, and escalation reason.
  - Duplicate notifications for same escalation within same SLA window are suppressed.
  - Notification log is accessible to Admin and KAM Head.
- UI requirements:
  - Escalation notification history panel.
  - Admin notification log filters.
- API requirements:
  - `GET /api/escalations/{escalation_id}/notifications`
  - `GET /api/admin/notification-log`
  - `POST /api/escalations/{escalation_id}/notifications/test`
- Validation rules:
  - Notification must link to source escalation.
  - Duplicate key must include escalation, trigger, recipient, and SLA window.
- Permissions:
  - View notification log: Admin, KAM Head.
  - Receive notifications: configured owners and KAM Head.
- Empty/loading/error states:
  - Empty notification log state.
  - Loading state for delivery status.
  - Error state for failed delivery with retry metadata.
- Filters/sorting/pagination/search:
  - Filters: recipient, channel, trigger, escalation, delivery status, date range.
  - Sorting: timestamp newest first.
  - Pagination required.
- Edge cases:
  - Delivery failure is logged and retried according to notification settings.
  - Preference settings apply except where mandatory escalation policy overrides.

## 14. Governance And Reviews

### Story 14.1 - Governance event management

As a KAM, I want to schedule and track QBRs, SteerCos, monthly reviews, and executive reviews, so that governance commitments and decisions are captured.

- Acceptance criteria:
  - Events include account, engagement if applicable, date, attendees, agenda, notes, decisions, action items, and status.
  - Notes and decisions create timeline entries and can feed handover summary.
  - Google Calendar and Fathom integrations can create or enrich events where configured.
- UI requirements:
  - Governance list/calendar and detail page.
  - Event create/edit form.
  - Attendee, agenda, notes, decisions, and action-item sections.
- API requirements:
  - `GET /api/governance-events`
  - `POST /api/governance-events`
  - `GET /api/governance-events/{event_id}`
  - `PATCH /api/governance-events/{event_id}`
  - `POST /api/governance-events/{event_id}/complete`
- Validation rules:
  - Require account, governance type, date, status, and owner.
  - Completion requires notes/decisions where configured.
  - Action items require owner and due date.
- Permissions:
  - Manage: KAM, KAM Head.
  - View: Leadership Viewer and authorized account users.
  - Configure governance types: Admin.
- Empty/loading/error states:
  - Empty governance state prompts scheduling review.
  - Loading state for event detail.
  - Error state for sync conflicts or invalid completion.
- Filters/sorting/pagination/search:
  - Filters: account, engagement, governance type, status, date range, owner, attendee.
  - Search: agenda, notes, decisions.
  - Sorting: event date, status, updated date.
  - Pagination/list date navigation.
- Edge cases:
  - Synced events require deduplication.
  - Fathom notes require review or configured approval before timeline write.

### Story 14.2 - Source-backed agenda and governance AI brief

As a KAM Head, I want source-backed agenda drafts and AI governance briefs, so that review preparation is faster and explainable.

- Acceptance criteria:
  - Agenda drafts are generated from health, signals, opportunities, activities, escalations, and recent timeline.
  - Draft is editable and source-backed.
  - Governance AI Brief includes health snapshot, recent changes since last event, open signals/escalations, talking points, pending decisions, and action items.
  - AI brief uses inline source citations.
- UI requirements:
  - Generate agenda action on governance detail.
  - AI Brief button with cited output and disclaimer.
  - Editable agenda draft area.
- API requirements:
  - `POST /api/governance-events/{event_id}/agenda-draft`
  - `PATCH /api/governance-events/{event_id}/agenda`
  - `POST /api/governance-events/{event_id}/ai-brief`
- Validation rules:
  - AI brief requires account context and authorized source retrieval.
  - Agenda acceptance stores edited content and source links.
- Permissions:
  - Generate/edit: KAM, KAM Head.
  - View: authorized users.
- Empty/loading/error states:
  - Empty agenda state prompts generation or manual entry.
  - Loading state during AI generation.
  - Error state if source context is insufficient or AI gateway fails.
- Filters/sorting/pagination/search:
  - Source records can be filtered by module and date range before generation where supported.
  - Brief citations searchable within output.
- Edge cases:
  - AI brief cannot create decisions or action items automatically.
  - AI failure must not block manual agenda editing.

## 15. Account History And Timeline

### Story 15.1 - Source-linked chronological timeline

As a KAM, I want a chronological account and engagement timeline, so that every important account event is traceable.

- Acceptance criteria:
  - Timeline includes account setup, charter upload, SOW upload, AI extraction, KYC, scores, stages, signals, tasks, opportunities, content, escalations, governance, approvals, executive decisions, integrations, and AI usage.
  - Events are shown in date/time order.
  - Entries link to source records.
  - Before/after values are shown for key changes.
- UI requirements:
  - Timeline tab with event cards, source links, before/after diff display, and event detail drawer.
  - Engagement 360 timeline subset.
- API requirements:
  - `GET /api/accounts/{account_id}/timeline`
  - `GET /api/engagements/{engagement_id}/timeline`
  - `GET /api/timeline-events/{event_id}`
- Validation rules:
  - Every system event requires event type, source module, source record, actor/system actor, and timestamp.
  - Before/after values required for configured key changes.
- Permissions:
  - View only authorized events.
  - Sensitive entries require explicit field/record permission.
- Empty/loading/error states:
  - Empty timeline state when account has no events.
  - Loading state for latest events.
  - Error state if source record is missing/restricted.
- Filters/sorting/pagination/search:
  - Filters: event type, date range, owner, module, account stage, risk status, opportunity, escalation, governance activity, signal, sensitivity.
  - Search: keyword across event text and allowed metadata.
  - Sorting: date/time newest first by default, oldest first optional.
  - Pagination: latest 100 entries load within 3 seconds; support paginated access for 10,000+ entries.
- Edge cases:
  - Unauthorized users receive no hidden-entry hints.
  - Source links respect current permissions.
  - Integration duplicates should be deduplicated before timeline write.

### Story 15.2 - Manual timeline notes and event type configuration

As a KAM, I want to manually add timeline notes with configured event types, so that important account context not captured elsewhere is preserved.

- Acceptance criteria:
  - Manual notes include event type, date, owner, description, mentions, attachments, and sensitivity.
  - Mentioned users can be notified.
  - Admin can configure event types, categories, visibility, retention, active state, and source module.
  - Inactive event types remain preserved historically but hidden from new-entry selection.
- UI requirements:
  - Add note modal with event type picker, mentions, attachments, sensitivity toggle.
  - Admin event-type configuration screen.
- API requirements:
  - `POST /api/accounts/{account_id}/timeline-notes`
  - `PATCH /api/timeline-events/{event_id}`
  - `GET /api/admin/timeline-event-types`
  - `POST /api/admin/timeline-event-types`
  - `PATCH /api/admin/timeline-event-types/{type_id}`
- Validation rules:
  - Manual note requires event type, date, owner, and description.
  - Sensitive flag requires permitted sensitivity level.
  - Event type must be active for new notes.
- Permissions:
  - Add notes: authorized KAM/KAM Head.
  - Configure event types: Admin.
  - View sensitive notes: authorized users only.
- Empty/loading/error states:
  - Empty event-type state prompts Admin setup.
  - Loading state for mention suggestions.
  - Error state for inactive event type or restricted sensitivity.
- Filters/sorting/pagination/search:
  - Event type list filters by active state/category/module.
  - Search event types and notes.
  - Sort event types by display order/name.
  - Timeline notes follow timeline pagination.
- Edge cases:
  - Attachments inherit note sensitivity unless overridden by stricter policy.
  - Mentions do not grant access to restricted timeline content.

### Story 15.3 - Timeline retention and deletion policy

As an Admin, I want retention rules for timeline entries, so that compliance actions preserve traceability.

- Acceptance criteria:
  - Timeline entries can be retained, archived, restricted, or deleted according to configured policy.
  - Critical entries cannot be silently deleted.
  - Deletion uses audit-preserving tombstones.
- UI requirements:
  - Admin retention policy screen.
  - Timeline tombstone display for authorized users.
  - Restricted/archive status indicators.
- API requirements:
  - `GET /api/admin/retention-policies`
  - `POST /api/admin/retention-policies`
  - `POST /api/timeline-events/{event_id}/archive`
  - `POST /api/timeline-events/{event_id}/restrict`
  - `DELETE /api/timeline-events/{event_id}`
- Validation rules:
  - Critical event types cannot be hard deleted.
  - Retention action requires reason and policy reference.
  - Tombstone stores deleted metadata without sensitive content where required.
- Permissions:
  - Configure/apply retention: Admin.
  - View retention actions: Admin, auditors where configured.
- Empty/loading/error states:
  - Empty policy state prompts policy creation.
  - Loading state for policy simulation.
  - Error state when attempting prohibited deletion.
- Filters/sorting/pagination/search:
  - Policy filters: entity type, retention action, active state.
  - Retention log search by entity, actor, reason.
  - Logs paginated and sorted newest first.
- Edge cases:
  - Retention must preserve audit logs even after content restriction.
  - AI retrieval must exclude deleted/restricted entries.

## 16. Handover Summary

### Story 16.1 - Source-backed handover summary

As a KAM Head, I want generated handover summaries, so that account ownership changes include reliable context.

- Acceptance criteria:
  - Summary includes account, engagements, stage, health, score history, risks, signals, escalations, opportunities, governance, stakeholders, content, decisions, and recent timeline.
  - Summary cites source records and timeline entries where possible.
  - Users can open cited sources from the handover view.
- UI requirements:
  - Generate handover summary action from Account Overview and ownership change flow.
  - Handover summary page with sections, citations, export/share controls where permitted.
- API requirements:
  - `POST /api/accounts/{account_id}/handover-summary`
  - `GET /api/accounts/{account_id}/handover-summaries`
  - `GET /api/handover-summaries/{summary_id}`
- Validation rules:
  - Generate only for authorized account.
  - Cite sources for each section where available.
  - Missing data must be explicitly marked.
- Permissions:
  - Generate: KAM Head, Leadership Viewer where configured.
  - View: authorized account users and new owner.
  - Sensitive sections follow field-level access.
- Empty/loading/error states:
  - Empty summary state prompts generation.
  - Loading state during assembly.
  - Error state if required source modules are unavailable, with partial summary option.
- Filters/sorting/pagination/search:
  - Summary history sorted newest first and paginated.
  - Search summaries by account, generated by, section text.
  - Filter by generated date and ownership change.
- Edge cases:
  - If user lacks permission for a cited source, section is redacted rather than hinted.
  - Ownership change should require handover where configured.

## 17. Notifications, SLA Escalation, And Executive Digests

### Story 17.1 - Notifications and user preferences

As a user, I want notification preferences per trigger and digest cadence, so that I receive useful alerts through the right channel.

- Acceptance criteria:
  - Notify AM for new signals, overdue activities, stale KYC, upcoming renewals, unresolved escalations, mentions, comments, and governance reminders.
  - Preferences support in-app only, in-app plus email, or off where permitted.
- UI requirements:
  - Notification center.
  - Preferences screen with trigger/channel/cadence controls.
  - Unread/read states.
- API requirements:
  - `GET /api/notifications`
  - `PATCH /api/notifications/{notification_id}/read`
  - `GET /api/users/me/notification-preferences`
  - `PUT /api/users/me/notification-preferences`
- Validation rules:
  - Mandatory triggers cannot be disabled if policy prohibits.
  - Email channel requires verified email.
  - Cadence must be a configured value.
- Permissions:
  - Users manage own preferences.
  - Admin can configure system defaults.
- Empty/loading/error states:
  - Empty notifications state.
  - Loading state for notification center.
  - Error state for delivery/preference save failure.
- Filters/sorting/pagination/search:
  - Filters: unread/read, trigger, account, date range, channel.
  - Search notification title/body.
  - Sorting: newest first, priority.
  - Pagination required.
- Edge cases:
  - Mention notification does not grant access to restricted record.
  - Preference updates affect future notifications only.

### Story 17.2 - SLA escalation to KAM Head

As a KAM Head, I want unresolved or inactive items escalated after configurable windows, so that critical risks do not stall.

- Acceptance criteria:
  - Applies to open signals, critical activities, stale KYC, and formal escalations.
  - Each item type has independently configurable inactivity window.
  - Timer resets on qualifying activity.
  - KAM Head receives in-app and email notification per preference.
- UI requirements:
  - SLA configuration screen.
  - SLA status badges on items.
  - Escalated items view for KAM Head.
- API requirements:
  - `GET /api/admin/sla-rules`
  - `POST /api/admin/sla-rules`
  - `PATCH /api/admin/sla-rules/{rule_id}`
  - `GET /api/escalated-items`
  - `POST /api/sla/jobs/evaluate`
- Validation rules:
  - SLA window must be positive duration.
  - Qualifying activity types must be configured.
  - Escalation cannot duplicate within same window.
- Permissions:
  - Configure: Admin, KAM Head.
  - View escalated items: KAM Head, Admin.
- Empty/loading/error states:
  - Empty escalated-items state.
  - Loading state for SLA evaluation.
  - Error state for invalid SLA rule.
- Filters/sorting/pagination/search:
  - Filters: item type, owner, account, severity, SLA state, escalated date.
  - Sorting: SLA overdue age, severity, account.
  - Pagination required.
- Edge cases:
  - Timer reset should be auditable.
  - Paused/archived records should follow configured SLA exclusion rules.

### Story 17.3 - Scheduled executive digests

As a Leadership Viewer, I want scheduled executive digests, so that strategic risks and decisions are delivered without manual report assembly.

- Acceptance criteria:
  - Digest includes strategic risks, retention outlook, growth opportunities, major escalations, and required decisions.
  - Delivery is logged and available to authorized recipients.
- UI requirements:
  - Digest schedule/preferences screen.
  - Digest preview.
  - Delivered digest history.
- API requirements:
  - `GET /api/digests`
  - `POST /api/digests/schedules`
  - `PATCH /api/digests/schedules/{schedule_id}`
  - `POST /api/digests/{digest_id}/send`
  - `GET /api/digests/{digest_id}`
- Validation rules:
  - Digest sections must respect recipient permissions.
  - Schedule requires cadence, recipients, and section selection.
- Permissions:
  - Create schedules: Leadership Viewer, KAM Head where configured.
  - Admin can manage defaults.
  - Recipients only see authorized data.
- Empty/loading/error states:
  - Empty digest state prompts creating schedule.
  - Loading state for preview generation.
  - Error state for failed delivery.
- Filters/sorting/pagination/search:
  - Filters: cadence, recipient, date range, status.
  - Search digest title/content.
  - Sorting: sent date newest first.
  - Pagination for digest history.
- Edge cases:
  - Redacted sections should not expose hidden-record counts.
  - Digest generation failure should not block normal dashboards.

## 18. Dashboards And Reporting

### Story 18.1 - AM Home dashboard

As an Account Manager, I want an AM Home dashboard, so that I can see assigned account work and attention items for today.

- Acceptance criteria:
  - Includes assigned accounts, signals, overdue activities, stale KYC, renewals, open escalations, opportunities, and tasks.
  - Dashboard prioritizes operational attention.
- UI requirements:
  - AM Home with attention summary, assigned accounts, tasks, signals, renewals, escalations, and opportunities.
  - Deep links to source modules.
- API requirements:
  - `GET /api/dashboards/am-home`
- Validation rules:
  - Dashboard data scoped to authenticated user's account assignments.
  - Restricted fields redacted.
- Permissions:
  - Account Manager/KAM only sees authorized assignments.
- Empty/loading/error states:
  - Empty assigned accounts state.
  - Skeleton loading for dashboard cards.
  - Partial error per widget.
- Filters/sorting/pagination/search:
  - Filters: account, date range, item type, priority, due date.
  - Search assigned accounts.
  - Sorting: urgency, due date, health risk.
  - Paginate embedded lists.
- Edge cases:
  - A widget failure should not break the full dashboard.
  - If user has no assigned accounts, show onboarding/helpful empty state.

### Story 18.2 - KAM Head Portfolio dashboard

As a KAM Head, I want a portfolio dashboard, so that I can monitor portfolio health, workload, and governance cadence.

- Acceptance criteria:
  - Includes health distribution, high-risk accounts, stale KYC, escalations, renewal focus, AM workload, overdue actions, and governance cadence.
- UI requirements:
  - Portfolio dashboard with charts, tables, portfolio filters, and drilldowns.
- API requirements:
  - `GET /api/dashboards/kam-head-portfolio`
- Validation rules:
  - Respect portfolio access and field-level permissions.
  - Metrics use current published scoring config.
- Permissions:
  - KAM Head, Admin where configured.
- Empty/loading/error states:
  - Empty portfolio state if no accounts.
  - Loading charts and table sections independently.
  - Error widget when data source fails.
- Filters/sorting/pagination/search:
  - Filters: AM, segment, region, industry, lifecycle status, risk, date range.
  - Search account/AM.
  - Sorting: risk, health, overdue count, renewal date.
  - Paginated high-risk and workload lists.
- Edge cases:
  - Accounts with incomplete scoring should appear with stale/incomplete indicator.

### Story 18.3 - Leadership dashboard

As a Leadership Viewer, I want an executive dashboard, so that I can review strategic health, risk, growth, and decisions without operational controls.

- Acceptance criteria:
  - Includes strategic health, retention, growth, revenue risk, major escalations, executive summaries, and decision queue.
  - Read-only and permission-aware.
- UI requirements:
  - Executive dashboard with summary cards, charts, decision queue, and read-only account drilldowns.
- API requirements:
  - `GET /api/dashboards/leadership`
- Validation rules:
  - No edit action metadata returned for read-only role.
  - Sensitive commercial/executive fields require explicit permission.
- Permissions:
  - Leadership Viewer, KAM Head where configured.
- Empty/loading/error states:
  - Empty dashboard state if no visible accounts.
  - Loading state for executive widgets.
  - Error state for partial widget failure.
- Filters/sorting/pagination/search:
  - Filters: date range, segment, industry, region, stage, risk.
  - Search account/decision.
  - Sorting: revenue risk, health, escalation severity.
  - Paginate decision queue and account lists.
- Edge cases:
  - Redaction must not reveal hidden details.

### Story 18.4 - Configurable report builder

As a KAM Head, I want a configurable report builder, so that I can produce portfolio and account reports within my permissions.

- Acceptance criteria:
  - Users can choose fields, filters, date ranges, grouping, output layout, and export format within permissions.
  - Reports can include dashboards, metrics, signals, opportunities, escalations, and summaries.
- UI requirements:
  - Report builder wizard with data source, fields, filters, grouping, layout, preview, export.
- API requirements:
  - `GET /api/reports/fields`
  - `POST /api/reports/preview`
  - `POST /api/reports`
  - `GET /api/reports/{report_id}`
  - `POST /api/reports/{report_id}/export`
- Validation rules:
  - Selected fields must be allowed for user role.
  - Date range and grouping must be valid for selected data source.
  - Export format must be configured.
- Permissions:
  - KAM Head, Leadership Viewer, Admin where configured.
- Empty/loading/error states:
  - Empty report state prompts selecting fields.
  - Loading preview/export states.
  - Error state for forbidden fields or invalid grouping.
- Filters/sorting/pagination/search:
  - Report data filters configurable by source.
  - Search fields and saved reports.
  - Sort saved reports by name, owner, updated date.
  - Paginate preview rows and saved reports.
- Edge cases:
  - Export must omit restricted fields even if saved report owner later loses access.

## 19. AI Assistance, AI Search, And Semantic Search

### Story 19.1 - Global KAM AI Query Dashboard

As an All Users role, I want a persistent KAM AI launcher across all screens, so that I can ask context-aware questions without leaving my workflow.

- Acceptance criteria:
  - Fixed bottom-right launcher is visible across primary views.
  - Account selector only shows authorized accounts.
  - Scope toggles include Timeline, Opportunities, Governance, Notes, KYC, and optional Document Search off by default.
  - Suggested prompts update by account context.
  - Recent query history persists per account and authenticated user.
  - Answer cards show detected intent, confidence, disclaimer, and citations.
- UI requirements:
  - Global launcher, slide-over/panel dashboard, account selector, scope toggles, prompt suggestions, query history, structured answer cards.
- API requirements:
  - `GET /api/ai/accounts`
  - `GET /api/ai/query-history`
  - `POST /api/ai/query`
  - `POST /api/ai/query-history/{history_id}/rerun`
- Validation rules:
  - Query text required.
  - Document Search requires explicit per-session enablement.
  - Retrieval context must be RBAC-filtered before AI call.
- Permissions:
  - All authenticated users can use AI over authorized records.
  - Admin can configure AI vocabulary and searchable fields.
- Empty/loading/error states:
  - Empty history state and suggested prompts.
  - Streaming/loading answer state.
  - Error state for AI gateway failure, insufficient data, or no authorized results.
- Filters/sorting/pagination/search:
  - Account selector search.
  - Scope toggles act as filters.
  - Query history sorted newest first and paginated.
  - Semantic ranking when structured intent does not match.
- Edge cases:
  - Switching account resets active scope and loads selected account history.
  - AI must state limitations instead of fabricating.
  - Cited source links must enforce permissions when opened.

### Story 19.2 - AI Timeline Search

As a KAM, I want AI Timeline Search with structured intents and semantic fallback, so that I can quickly find relevant account history.

- Acceptance criteria:
  - Recognized intents: escalation history, stage changes, score changes, last 90 days activity, approval events, content sent, activity since last QBR, open opportunities.
  - Structured matches return filtered timeline results.
  - Semantic fallback ranks results by query relevance.
  - "Try in KAM AI" handoff sends exact query and account context to global AI panel with Timeline scope enabled.
- UI requirements:
  - Timeline AI search answer cards with detected intent, result list, citations, semantic/structured labels, and handoff action.
- API requirements:
  - `POST /api/accounts/{account_id}/timeline/ai-search`
  - `POST /api/ai/handoff`
- Validation rules:
  - Account context and query required.
  - Structured intent must be displayed so user can verify interpretation.
- Permissions:
  - Authorized account users only.
  - Results filtered by timeline RBAC and sensitivity.
- Empty/loading/error states:
  - Empty result state with suggested timeline prompts.
  - Loading search state.
  - Error state for unsupported query or AI/search service failure.
- Filters/sorting/pagination/search:
  - Uses timeline filters plus AI-recognized intents.
  - Semantic ranking for unmatched queries.
  - Results paginated.
- Edge cases:
  - If intent is wrong, user can switch to normal timeline filters or KAM AI.
  - Restricted events are omitted without hints.

### Story 19.3 - AI Account Briefs

As a KAM Head, I want selectable AI Account Briefs, so that I can generate cited summaries for account reviews.

- Acceptance criteria:
  - Brief types: Account Brief, Period Summary, Pre-Meeting Brief, Risk Narrative.
  - One-hour cache per account and brief type.
  - Manual refresh forces regeneration.
  - Thumbs-up/down feedback stored with run, output version, and user.
  - Authorized users can edit generated brief; saved edit becomes manually authored timeline note preserving original AI draft.
  - Non-dismissible disclaimer appears on every brief output.
- UI requirements:
  - AI Account Brief card with brief type selector, date range for period summary, cache timestamp, refresh, feedback controls, edit/save-to-timeline flow.
- API requirements:
  - `POST /api/accounts/{account_id}/ai-briefs`
  - `GET /api/accounts/{account_id}/ai-briefs`
  - `POST /api/ai-briefs/{brief_id}/refresh`
  - `POST /api/ai-briefs/{brief_id}/feedback`
  - `POST /api/ai-briefs/{brief_id}/timeline-note`
- Validation rules:
  - Period Summary requires date range.
  - Edited timeline note requires editor, timestamp, original draft link, and edited content.
  - Disclaimer must be present before rendering.
- Permissions:
  - Generate: KAM, KAM Head, Leadership Viewer where authorized.
  - Edit/save to timeline: Leadership Viewer/Admin where configured, KAM Head where authorized.
  - Admin can review feedback.
- Empty/loading/error states:
  - Empty brief state prompts generation.
  - Loading generation state.
  - Error state for insufficient data or AI gateway failure.
- Filters/sorting/pagination/search:
  - Brief history filters: type, date range, generated by, feedback.
  - Search brief text.
  - Sort by generated date.
  - Pagination for history.
- Edge cases:
  - Cached output must clearly show generated timestamp.
  - Edited note must distinguish original AI output and human-edited version.

### Story 19.4 - AI Stage Prediction and predictive forecast charts

As a KAM, I want AI stage prediction and directional forecast charts, so that I can anticipate account trajectory while keeping final decisions human-owned.

- Acceptance criteria:
  - Stage prediction includes predicted next stage, confidence, basis, contributing factors, citations, and recommended next actions.
  - Inputs include KYC, SOW terms, last 90 days timeline, opportunities, health/RAG, funding/commercial context, risks, and signals.
  - Human review/approval is required before any stage change.
  - Forecast charts support six-month ARR projection, health score trend, and remaining modeled pipeline.
  - Forecasts list inputs and missing/low-confidence gaps.
  - Forecast charts stay in KAM AI panel unless user explicitly confirms reuse.
- UI requirements:
  - Account Overview Stage tab prediction card.
  - KAM AI chart response cards with baseline, projection, trend line, confidence/gaps, and disclaimer.
  - Recommended action button that starts standard stage-change workflow.
- API requirements:
  - `POST /api/accounts/{account_id}/ai-stage-prediction`
  - `POST /api/accounts/{account_id}/stage-change-from-prediction`
  - `POST /api/ai/forecast`
- Validation rules:
  - Stage prediction cannot mutate account stage directly.
  - Missing/low-confidence inputs must be flagged.
  - Stage change uses standard stage validation and timeline events.
- Permissions:
  - Generate: KAM, KAM Head, Leadership Viewer where authorized.
  - Approve stage change: KAM Head.
- Empty/loading/error states:
  - Empty prediction state before generation.
  - Loading prediction/forecast state.
  - Error state for insufficient input data or AI gateway failure.
- Filters/sorting/pagination/search:
  - Forecast query uses account context and optional date horizon.
  - Prediction history sorted newest first and paginated.
- Edge cases:
  - Forecasts are directional and not authoritative metrics.
  - Forecasts must not appear in reports/dashboards/exports without explicit user action.

### Story 19.5 - AI Task Summary

As an Account Manager, I want an AI Task Summary card on AM Home, so that I can quickly understand task load and urgent attention items.

- Acceptance criteria:
  - Summary displays count of open tasks, urgent tasks, due today, due within 7 days, highest-load accounts, overdue score-linked tasks, and critical attention signals.
  - Disclaimer is non-dismissible and visible.
  - Refreshes on AM Home load and manual refresh.
  - Stale indicator displays when summary is more than one hour old.
- UI requirements:
  - AM Home card with counts, account links, refresh timestamp, manual refresh, stale indicator, and disclaimer.
- API requirements:
  - `GET /api/dashboards/am-home/ai-task-summary`
  - `POST /api/dashboards/am-home/ai-task-summary/refresh`
- Validation rules:
  - Summary uses only authenticated user's assigned account data.
  - Disclaimer must not obscure task data or actions.
- Permissions:
  - Account Manager/KAM only over assigned accounts.
- Empty/loading/error states:
  - Empty summary if no tasks/signals.
  - Loading refresh state.
  - Error state if AI summary fails while base dashboard remains usable.
- Filters/sorting/pagination/search:
  - Uses AM Home filters where available.
  - Accounts in card sorted by current task load/urgency.
- Edge cases:
  - AI summary failure must not block task list.
  - Stale summary still visible with stale indicator until refresh succeeds.

## 20. Approved Integrations

### Story 20.1 - Integration adapter configuration

As an Admin, I want approved integration adapters for Google Calendar, Fathom, CSAT, and AI/LLM Gateway only, so that integrations stay governed and auditable.

- Acceptance criteria:
  - Only Google Calendar, Fathom, CSAT, and AI/LLM Gateway appear as MVP integration targets.
  - Each supports test connection, sync status, last synced timestamp, retry, deduplication, error logging, and Admin notification on repeated failures.
- UI requirements:
  - Integrations admin screen with adapter cards, status, configure, test, retry, logs.
- API requirements:
  - `GET /api/admin/integrations`
  - `PATCH /api/admin/integrations/{integration_id}`
  - `POST /api/admin/integrations/{integration_id}/test`
  - `POST /api/admin/integrations/{integration_id}/sync`
  - `GET /api/admin/integrations/{integration_id}/logs`
- Validation rules:
  - Adapter type must be in approved list.
  - Required credentials/config fields vary by adapter.
  - Failed critical syncs are logged and surfaced.
- Permissions:
  - Configure/view logs: Admin.
  - Integration-created business records still respect module permissions.
- Empty/loading/error states:
  - Empty/no-config state per adapter.
  - Loading state for test/sync.
  - Error state with retry and log detail.
- Filters/sorting/pagination/search:
  - Log filters: adapter, status, severity, date range.
  - Search log messages/source IDs.
  - Sort logs newest first.
  - Pagination required.
- Edge cases:
  - No other MVP integration can be enabled.
  - Repeated failures notify Admin without spamming duplicates.

### Story 20.2 - Google Calendar, Fathom, CSAT, and AI/LLM flows

As a KAM, I want approved integrations to enrich governance, CSAT, timeline, and AI capabilities, so that external context becomes useful only after mapping and review.

- Acceptance criteria:
  - Google Calendar maps governance events, tagged meetings, reminders, and timeline events with deduplication.
  - Fathom imports summaries/transcripts for tagged governance/account meetings after review or configured approval.
  - CSAT imports score, trend, source, timestamp, account/engagement mapping, and score impact.
  - AI/LLM Gateway supports governed extraction, enrichment, summaries, search, explanations, semantic retrieval, logs, and guardrails.
- UI requirements:
  - Mapping rules screen.
  - Unmapped imported items review queue.
  - CSAT trend display.
  - AI gateway run logs.
- API requirements:
  - `GET /api/integrations/calendar/events`
  - `POST /api/integrations/calendar/events/{event_id}/map`
  - `GET /api/integrations/fathom/items`
  - `POST /api/integrations/fathom/items/{item_id}/approve`
  - `GET /api/integrations/csat/scores`
  - `GET /api/admin/ai-gateway/runs`
- Validation rules:
  - Calendar/Fathom events require account tagging or configured mapping before timeline write.
  - CSAT score requires account or engagement mapping.
  - AI gateway requests include role permissions and source context.
- Permissions:
  - Configure mapping: Admin.
  - Review mapped business items: KAM/Admin depending on module.
  - View CSAT: KAM, KAM Head, Leadership Viewer where authorized.
- Empty/loading/error states:
  - Empty import queue state.
  - Loading state for sync/review.
  - Error state for mapping conflict or duplicate event.
- Filters/sorting/pagination/search:
  - Filters: adapter, mapped/unmapped, account, date, status.
  - Search external title/source ID.
  - Sorting: event date, imported date, status.
  - Pagination required.
- Edge cases:
  - Deduplication windows prevent duplicate timeline events.
  - Travoly, ZoomInfo, and CrunchBase are AI research sources through AI/LLM Gateway, not standalone adapters.

## 21. Admin, Audit, Retention, Security, And RBAC

### Story 21.1 - User, role, access, and restricted permissions management

As an Admin, I want to manage users, roles, role inheritance, account access, engagement access, matrix ownership, and restricted permissions, so that access follows least privilege.

- Acceptance criteria:
  - Admin can configure access for AM/KAM, Ops Lead, KAM Head/VP, Leadership Viewer, Admin, Content Specialist, Commercial Stakeholder, and Delivery Stakeholder where applicable.
  - Protected records and fields are never returned to unauthorized users.
- UI requirements:
  - Separate Users Management and Roles Management screens.
  - Role permission matrix by module/action.
  - Account/engagement access assignment screens.
  - Confirmation dialogs for destructive actions.
- API requirements:
  - Existing: `/api/admin/users`, `/api/admin/roles`, `/api/admin/permissions`
  - Proposed: `GET/POST/PATCH/DELETE /api/admin/account-access`
  - Proposed: `GET/POST/PATCH/DELETE /api/admin/engagement-access`
  - Proposed: `GET/POST/PATCH/DELETE /api/admin/field-permissions`
- Validation rules:
  - Email must be valid and unique.
  - Role slug must be snake_case.
  - At least one super/admin setup user must remain active.
  - Field permission must map to known entity/field.
- Permissions:
  - Manage: Admin with RBAC configure permission.
  - Super admin hidden from normal user/role listings where configured.
- Empty/loading/error states:
  - Empty users/roles/access states.
  - Loading state for permission matrix.
  - Field-level backend validation displayed at form fields.
- Filters/sorting/pagination/search:
  - Users: search email/name, filter status/role, sort name/email/created, paginate.
  - Roles: search slug/name/description, filter system/custom, sort name/updated, paginate.
  - Access: filter account, engagement, user, role, access level, paginate.
- Edge cases:
  - System roles cannot be deleted.
  - Assigned roles cannot be deleted.
  - Permission changes affect future authorization immediately.

### Story 21.2 - Reference data and controlled taxonomies

As an Admin, I want configurable reference data, so that forms, filters, reports, and analytics use controlled terms.

- Acceptance criteria:
  - Reference data includes account statuses, stages, segments, industries, regions, opportunity types, stakeholder roles, signal types, escalation severities, governance types, and content tags.
  - Inactive terms remain on historical records but hidden from new selection.
- UI requirements:
  - Admin reference data screen with taxonomy tabs and active/inactive controls.
- API requirements:
  - `GET /api/admin/reference-data/{taxonomy}`
  - `POST /api/admin/reference-data/{taxonomy}`
  - `PATCH /api/admin/reference-data/{taxonomy}/{item_id}`
  - `DELETE /api/admin/reference-data/{taxonomy}/{item_id}`
- Validation rules:
  - Slug/name unique within taxonomy.
  - In-use item cannot be hard deleted.
  - Required default values cannot be deactivated without replacement.
- Permissions:
  - Configure: Admin.
  - Read active values: authenticated users by module.
- Empty/loading/error states:
  - Empty taxonomy state.
  - Loading state for taxonomy tab.
  - Error state for duplicate or in-use delete.
- Filters/sorting/pagination/search:
  - Search by name/slug.
  - Filter active/inactive.
  - Sort by display order/name/updated date.
  - Pagination for large taxonomies.
- Edge cases:
  - Changing display label should not break historical reports.

### Story 21.3 - Configuration, audit logs, and retention policies

As an Admin, I want configuration changes, audit logs, and retention policies governed, so that business-critical changes are traceable.

- Acceptance criteria:
  - Configure scoring, signal, playbook, timeline event, retention, notification, SLA, and dashboard rules.
  - Configuration changes are validated, versioned, and audited.
  - Audit logs include actor, timestamp, entity, previous value, new value, source, and reason where required.
  - Retention rules cover timeline entries, AI outputs, KYC snapshots, score snapshots, audit logs, attachments, and reports.
- UI requirements:
  - Admin configuration screens with version history.
  - Audit log screen with filters and detail drawer.
  - Retention policy screen with simulation/test action.
- API requirements:
  - `GET /api/admin/audit-logs`
  - `GET /api/admin/configuration-changes`
  - `GET/POST/PATCH /api/admin/retention-policies`
  - `POST /api/admin/retention-policies/{policy_id}/simulate`
- Validation rules:
  - Configuration publish requires validation success.
  - Retention action requires reason and target entity type.
  - Audit logs are append-only.
- Permissions:
  - Admin only, with possible read-only auditor role later.
- Empty/loading/error states:
  - Empty audit log state.
  - Loading state for simulation.
  - Error state for invalid or unsafe configuration.
- Filters/sorting/pagination/search:
  - Audit filters: actor, entity, action, source, date range, reason.
  - Search entity ID/name and reason.
  - Sort newest first.
  - Pagination required.
- Edge cases:
  - Audit records cannot be edited without traceability.
  - Retention cannot silently delete critical events.

## 22. Analytics, Benchmarking, And Portfolio Intelligence

### Story 22.1 - Portfolio analytics and benchmarking

As a KAM Head, I want portfolio analytics and benchmarking, so that account performance can be compared across cohorts.

- Acceptance criteria:
  - Analytics cover health trends, score drivers, escalation intelligence, opportunity intelligence, content effectiveness, and KAM performance.
  - Analytics are filterable by date range, AM, segment, industry, stage, and engagement type.
  - Benchmarking compares accounts across segments, industries, and engagement types.
- UI requirements:
  - Analytics dashboard with charts, cohort selector, filters, and drilldowns.
  - Benchmark comparison cards/tables.
- API requirements:
  - `GET /api/analytics/portfolio`
  - `GET /api/analytics/benchmarks`
  - `GET /api/analytics/kam-performance`
- Validation rules:
  - Date range required for trend views.
  - Cohort must have enough records to avoid misleading benchmark where configured.
  - Results respect RBAC and field-level access.
- Permissions:
  - KAM Head, Leadership Viewer, Admin where configured.
- Empty/loading/error states:
  - Empty analytics state for insufficient data.
  - Loading chart state.
  - Error state for invalid filter combination.
- Filters/sorting/pagination/search:
  - Filters: date range, AM, segment, industry, stage, engagement type.
  - Search accounts/cohorts.
  - Sorting: health trend, risk, opportunity value, escalation count.
  - Paginate account benchmark rows.
- Edge cases:
  - Small cohorts should be suppressed or flagged depending on policy.
  - Historical metrics should use snapshot versions.

### Story 22.2 - Proactive account-change alerts

As a KAM Head, I want proactive account-change alerts, so that meaningful portfolio changes do not get missed.

- Acceptance criteria:
  - Alerts identify score drops, stale KYC, opportunity stagnation, escalation aging, renewal risk, stakeholder gaps, and governance overdue.
- UI requirements:
  - Alerts list/card in analytics and KAM Head dashboard.
  - Alert detail with reason and source evidence.
- API requirements:
  - `GET /api/analytics/account-change-alerts`
  - `PATCH /api/analytics/account-change-alerts/{alert_id}/status`
- Validation rules:
  - Alert rule requires condition, severity, source, and active state.
  - Duplicate active alerts are suppressed or grouped.
- Permissions:
  - View: KAM Head, Leadership Viewer where configured.
  - Configure rules: Admin/KAM Head.
- Empty/loading/error states:
  - Empty alert state.
  - Loading alert list.
  - Error state for failed rule evaluation.
- Filters/sorting/pagination/search:
  - Filters: alert type, severity, account, AM, date range, status.
  - Search account/reason.
  - Sort by severity, age, created date.
  - Pagination required.
- Edge cases:
  - Alerts are separate from deterministic operational signals unless configured to create signal.

## 23. Multi-owner And Multi-tenant Readiness

### Story 23.1 - Multi-owner and tenant-ready architecture

As an Admin, I want architecture readiness for matrix ownership and multi-tenant deployment, so that future organizational models can be supported without rework.

- Acceptance criteria:
  - Tenant boundaries, configuration isolation, role scopes, audit separation, and data partitioning are accounted for in design.
  - Initial deployment can remain single-organization.
  - Matrix ownership works at account and engagement levels.
- UI requirements:
  - No tenant switcher required for single-organization deployment.
  - Internal admin metadata should support tenant/config scopes when enabled.
- API requirements:
  - All tenant-ready APIs include server-side tenant scoping internally.
  - Proposed future: `GET /api/admin/tenants`, `POST /api/admin/tenants`, `PATCH /api/admin/tenants/{tenant_id}`.
- Validation rules:
  - Tenant-scoped records cannot reference entities from another tenant.
  - Global vs tenant configuration scope must be explicit.
- Permissions:
  - Tenant administration: Admin/Super Admin where enabled.
  - Tenant data access constrained by tenant membership and RBAC.
- Empty/loading/error states:
  - Single-tenant mode hides tenant-management UI.
  - Error state for cross-tenant reference attempts.
- Filters/sorting/pagination/search:
  - Future tenant lists search by name/domain/status and paginate.
  - Matrix ownership filters already covered in account ownership.
- Edge cases:
  - Existing single-tenant data must be migratable into a tenant scope.
  - Audit logs must remain separated by tenant when enabled.

## 24. Non-functional And Out-of-scope Stories

### Story 24.1 - Platform reliability, observability, and accessibility

As a Platform/Admin user, I want reliable, observable, and accessible workflows, so that core KAM operations continue even when AI or integrations fail.

- Acceptance criteria:
  - Core workflows continue when AI or integrations are unavailable.
  - Background jobs, integration failures, AI runs, scoring errors, notification delivery, and configuration errors are logged.
  - UI targets WCAG 2.1 AA across desktop, laptop, and tablet breakpoints.
- UI requirements:
  - Accessible keyboard/focus states, semantic controls, visible errors, responsive layouts.
  - Admin logs for operational failures.
- API requirements:
  - `GET /api/admin/system-health`
  - `GET /api/admin/job-logs`
  - `GET /api/admin/error-logs`
- Validation rules:
  - Background jobs must record status and failure reason.
  - External failures must not corrupt authoritative data.
- Permissions:
  - System health/logs: Admin.
- Empty/loading/error states:
  - Empty logs state.
  - Loading system-health state.
  - Error state when health checks fail.
- Filters/sorting/pagination/search:
  - Logs filter by job type, severity, status, date range.
  - Search message/entity/source ID.
  - Sort newest first.
  - Pagination required.
- Edge cases:
  - AI outage should show fallback/manual workflow.
  - Integration sync failures should be retryable and auditable.

### Story 24.2 - Explicitly out-of-scope guardrails

As a Product Owner, I want out-of-scope capabilities blocked from MVP assumptions, so that the team does not build unsupported workflows.

- Acceptance criteria:
  - MVP does not replace sales pipeline/pre-sales, project management, HR/payroll/attendance, autonomous AI decisions, unsupported integrations, native mobile, untraceable audit edits, informal email/chat capture, or all delivery logs.
- UI requirements:
  - Hide or avoid navigation/actions implying out-of-scope modules.
- API requirements:
  - No endpoints for unsupported integrations or autonomous AI decisions in MVP.
- Validation rules:
  - AI cannot directly create authoritative scores, signals, escalations, playbooks, approvals, or business decisions.
  - Unsupported integration adapter type is rejected.
- Permissions:
  - Not applicable beyond Admin guardrails.
- Empty/loading/error states:
  - Unsupported action error should be explicit and non-technical.
- Filters/sorting/pagination/search:
  - Not applicable.
- Edge cases:
  - Manual upload/link can capture evidence from outside systems without becoming a full integration.
