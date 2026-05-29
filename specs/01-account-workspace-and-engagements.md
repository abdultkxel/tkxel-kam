# Feature Specification: Account Workspace And Engagements

## Feature Overview

Create the account foundation for the KAM platform: charter/SOW-led onboarding, draft approval, lifecycle status, evidence attachments, ownership, Account Overview, Engagement/SOW management, Engagement 360, and engagement health rollup.

## Business Goal

Replace fragmented onboarding and account context with a governed, source-backed workspace that becomes authoritative only after review and approval.

## User Roles

- KAM Head / VP
- Admin
- Account Manager / KAM
- Leadership Viewer / Executive
- Platform

## User Stories Covered

- Story 1.1 - Charter/SOW-led account onboarding
- Story 1.2 - Primary and matrix ownership assignment
- Story 1.3 - Lifecycle status and source attachments
- Story 2.1 - Engagement/SOW record management
- Story 2.2 - Engagement health rollup
- Story 3.1 - Unified account workspace

## Functional Requirements

- Support upload/link of charters, SOWs, attachments, and source references.
- Generate draft accounts and draft engagements from approved source material.
- Allow KAM Head/Admin review, edit, approve, reject, and link-to-existing account decisions.
- Create official account workspace only after approval.
- Maintain account lifecycle statuses: Onboarding, Active, At Risk, Renewal Focus, Expansion Focus, Dormant, Archived.
- Assign one active primary AM and optional matrix owners.
- Preserve ownership history and rationale.
- Maintain multiple engagements per account and multiple charters/SOWs per engagement.
- Provide Account Overview as the unified workspace with profile, engagements, KYC, stakeholders, plans, scores, signals, activities, opportunities, education, escalations, governance, attachments, timeline, and AI brief entry points.
- Provide Engagement 360 with profile, evidence, delivery health, dependencies, commercial context, renewal posture, activities, risks, escalations, attachments, and timeline.
- Roll engagement health into Account Health using published metric rules.

## Non-Functional Requirements

- Account Overview standard views must load within 3 seconds.
- Draft approval must be transactional when creating account, engagement, KYC, renewal, and timeline records.
- Source evidence must remain traceable after approval.
- AI extraction failure must not block manual onboarding.
- Attachment handling must support configured file limits and secure access.

## Permissions & Authorization

- KAM Head/Admin can create, review, approve, reject, and link onboarding drafts.
- KAM Head/Admin can assign ownership and manage lifecycle status.
- Authorized KAM can view and maintain assigned account and engagement records according to role policy.
- Leadership Viewer receives read-only Account Overview and Engagement 360 where authorized.
- Sensitive attachments and fields require field-level permission.

## Validation Rules

- Onboarding draft requires at least one source file/link.
- Approval requires account name, lifecycle status, segment, region, source citation, and required engagement fields.
- Rejection requires reason.
- Primary ownership changes require rationale.
- Exactly one active primary AM is required for active accounts.
- Engagement requires account, name, owner, start date, delivery status, and service line.
- Engagement end date must be after start date.
- Renewal date and notice deadline must be consistent with SOW terms.
- Value fields must be non-negative and use configured currency.
- Archived accounts are read-only except for authorized Admin/KAM Head actions.

## Search Requirements

- Search onboarding drafts by account name and source document name.
- Search account selector by account name.
- Search engagement list by engagement name, SOW title, and service line.
- Search attachments by title, file name, and source type.
- Search user owner picker by name, email, and role.

## Filter Requirements

- Draft filters: status, lifecycle status, segment, region, uploader, owner, created date.
- Account filters: lifecycle status, primary AM, supporting AM, Ops Lead, leadership sponsor.
- Engagement filters: status, owner, service line, renewal window, risk status.
- Attachment filters: source type, uploaded date, sensitivity where permitted.
- Health filters: stale, dirty, RAG status.

## Sort Requirements

- Draft sorting: newest, oldest, account name, extraction status.
- Owner history sorting: newest first.
- Engagement sorting: renewal date, end date, value, delivery status, updated date.
- Attachment sorting: uploaded date, source type, name.
- Engagement contribution sorting: score, risk, freshness, value.

## Pagination Requirements

- Draft list is paginated.
- Engagement list is paginated when count grows.
- Attachment list is paginated.
- Ownership history is paginated.
- Health snapshot/history list is paginated newest first.

## API Requirements

- `POST /api/onboarding/drafts`
- `GET /api/onboarding/drafts`
- `GET /api/onboarding/drafts/{draft_id}`
- `PATCH /api/onboarding/drafts/{draft_id}`
- `POST /api/onboarding/drafts/{draft_id}/approve`
- `POST /api/onboarding/drafts/{draft_id}/reject`
- `POST /api/onboarding/drafts/{draft_id}/link-account`
- `GET /api/accounts/{account_id}/owners`
- `POST /api/accounts/{account_id}/owners`
- `PATCH /api/accounts/{account_id}/owners/{owner_id}`
- `DELETE /api/accounts/{account_id}/owners/{owner_id}`
- `GET /api/accounts/{account_id}/ownership-history`
- `PATCH /api/accounts/{account_id}/status`
- `GET /api/accounts/{account_id}/attachments`
- `POST /api/accounts/{account_id}/attachments`
- `DELETE /api/accounts/{account_id}/attachments/{attachment_id}`
- `GET /api/accounts/{account_id}/engagements`
- `POST /api/accounts/{account_id}/engagements`
- `GET /api/engagements/{engagement_id}`
- `PATCH /api/engagements/{engagement_id}`
- `DELETE /api/engagements/{engagement_id}`
- `GET /api/accounts/{account_id}/overview`
- `GET /api/accounts/{account_id}/summary-cards`
- `GET /api/engagements/{engagement_id}/health`
- `POST /api/engagements/{engagement_id}/health/recalculate`
- `GET /api/accounts/{account_id}/health/rollup`

## UI Requirements

- Onboarding upload page with drag/drop, link entry, source list, extraction status, and draft preview.
- Draft review page with editable fields and source citations.
- Account Overview with summary cards, section tabs, quick actions, and read-only behavior for leadership.
- Ownership editor with matrix owner roles and history drawer.
- Lifecycle badge and status-change control.
- Attachment/evidence panel with source links and preview.
- Engagement list and Engagement 360 detail page with operational tabs.
- Engagement health panel with RAG status, drivers, freshness, and account contribution.

## Loading States

- Document extraction states: queued, running, completed, failed.
- Skeletons for Account Overview cards and module sections.
- Loading state for owner picker, ownership history, attachments, Engagement 360, and health recalculation.

## Empty States

- No uploaded sources yet.
- No onboarding drafts.
- Primary owner only/no matrix owners.
- No attachments.
- No engagements.
- No metric configuration for engagement health.
- Leadership has no visible accounts.

## Error States

- Unsupported file type or file size exceeded.
- Extraction failed with retry available.
- Duplicate account match requires user decision.
- Selected owner inactive or unauthorized.
- Engagement not found or no longer accessible.
- Invalid date/value validation errors.
- Source preview unavailable.

## Edge Cases

- Partial extraction may be approved only after required fields are manually completed.
- Draft approval must not create partial official records.
- Attachment deletion with citations requires warning or restriction.
- Removing an owner never removes ownership history.
- Engagement events appear in both Account Timeline and Engagement 360.
- Formula changes do not mutate historical health snapshots.

## Missing Requirements

- Exact file size/type limits are not specified.
- Account duplicate matching algorithm and confidence threshold are not specified.
- Required account segments, regions, lifecycle defaults, and currency catalog are not specified.
- Archive/unarchive workflow is not fully specified.

## Ambiguous Requirements

- Which roles besides KAM Head/Admin can approve drafts is described as "authorized owner" elsewhere but not defined here.
- Whether KAM can change lifecycle status directly is configuration-dependent but not explicitly scoped.
- Engagement delete vs archive behavior is not fully defined.

## Conflicting Requirements

- The PRD says draft approval is KAM Head/Admin-led, while KYC sections also mention authorized owner approval. This needs a single approval authority model.

## Unspecified Edge Cases

- What happens when source documents are replaced after approval.
- How to resolve two simultaneous draft approvals for same matched account.
- How ownership behaves when a user is deactivated.
- How attachment virus scanning or malware rejection should surface to users.

## Audit/Logging Requirements

- Audit draft creation, edit, approval, rejection, and link-to-existing decisions.
- Audit lifecycle status changes with before/after values and reason.
- Audit ownership changes with previous owner, new owner, actor, timestamp, rationale, and source.
- Log attachment upload/delete and source citation usage.
- Create timeline entries for account setup, source upload, status change, engagement creation, and material health changes.

## Test Scenarios

- Create draft from uploaded charter/SOW and approve into official account.
- Reject draft with required reason.
- Link draft to existing account and verify no duplicate account is created.
- Assign/change primary AM and verify ownership history/audit.
- Add/remove matrix owner and verify filters and access.
- Change lifecycle status and verify timeline entry.
- Create engagement with valid renewal terms.
- Reject engagement with invalid date sequence.
- Load Account Overview as KAM vs Leadership Viewer and verify action visibility.
- Recalculate engagement health and verify snapshot preservation.
- Attempt to view sensitive attachment without permission.

## Acceptance Criteria

- All covered stories can be completed through UI and API.
- Official account records are only created after approval.
- Every source-backed field can expose citation where available.
- Account Overview gives a complete authorized current-state view.
- Engagement 360 gives a complete authorized engagement-state view.
- Ownership, status, source, and health changes are auditable and timeline-linked.

