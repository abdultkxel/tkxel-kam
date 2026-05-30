# Feature Specification: KYC And AI Extraction

## Feature Overview

Provide AI-assisted KYC drafting, review, approval, immutable snapshots, freshness/completeness indicators, and named AI KYC agent workstreams.

## Business Goal

Improve speed and quality of account intelligence while keeping human review as the gate before KYC affects official platform records, metrics, signals, or stage.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Admin
- Platform
- AI

## User Stories Covered

- Story 4.1 - AI KYC draft generation and review
- Story 4.2 - KYC snapshots, freshness, and completion
- Story 4.3 - AI KYC agent workstreams

## Functional Requirements

- Trigger AI KYC from Account Overview, onboarding drafts, or selected charter/SOW documents.
- Generate draft KYC from charters/SOWs, approved account and engagement records, prior snapshots, attachments, user notes, and approved research sources.
- Approved AI research sources include Travoly/Trivoly, ZoomInfo, and CrunchBase through the AI/LLM Gateway; they are not standalone integration adapters.
- Display citations, confidence, conflicts, missing fields, and differences from previous approved snapshot.
- Allow review, edit, enrich, approve, or reject draft content.
- Store approved KYC snapshots as immutable versions.
- Track approver, timestamp, source context, extraction run, and change summary.
- Show freshness, completeness, stale status, source coverage, and confidence.
- Run five named workstreams: Market Research, Client Research, Stakeholder Details, Tkxel Engagement with Client, Financial Landscape.
- Display workstream status independently: pending, running, complete, failed.
- Refresh AI Data reruns all workstreams while preserving previous output until the new run completes.

## Non-Functional Requirements

- AI failure must not block manual KYC entry.
- AI output must be labeled as AI-assisted and source-backed.
- KYC drafts and agent outputs must display the platform-level non-dismissible AI disclaimer.
- AI must not fabricate unsupported values.
- KYC indicators must load on Account Overview, KYC page, and KAM Head Portfolio without blocking other page sections.

## Permissions & Authorization

- Trigger and review: KAM and KAM Head with account access.
- Approve/reject: KAM Head or explicitly authorized owner.
- Configure required fields/freshness: Admin and KAM Head.
- View sensitive KYC fields only when field-level permission allows.

## Validation Rules

- Approval requires required KYC fields unless authorized override reason is captured.
- Low-confidence or conflicting fields require explicit review acknowledgement.
- Snapshots are immutable after approval.
- Completion percentage uses configured required fields.
- Completion percentage updates when required fields are approved, edited, or cleared.
- Stale status uses configured freshness threshold.
- Refresh AI Data is available only to authorized users.

## Search Requirements

- Search KYC fields, citations, conflicts, missing-field labels, and snapshot change summaries.
- Search agent run output and citations.

## Filter Requirements

- Draft filters: status, confidence level, missing fields, stale status, reviewer, created date.
- Snapshot filters: approver, source, confidence, date range.
- Agent run filters: run status, workstream, triggered by, date range.

## Sort Requirements

- Drafts sorted by created date, confidence, completeness.
- Snapshots sorted newest first.
- Agent runs sorted newest first.
- Workstream cards retain configured order unless user chooses status-based grouping.

## Pagination Requirements

- Draft review queues are paginated.
- Snapshot history is paginated.
- Agent run history is paginated.

## API Requirements

- `POST /api/accounts/{account_id}/kyc/drafts`
- `GET /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `PATCH /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/approve`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/reject`
- `GET /api/accounts/{account_id}/kyc/snapshots`
- `GET /api/accounts/{account_id}/kyc/snapshots/{snapshot_id}`
- `GET /api/accounts/{account_id}/kyc/freshness`
- `POST /api/accounts/{account_id}/kyc/agent-runs`
- `GET /api/accounts/{account_id}/kyc/agent-runs/{run_id}`
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/refresh`

## UI Requirements

- KYC page with current approved state, draft state, diff view, citations, confidence badges, and conflict indicators.
- Missing-field panel and approval/rejection controls.
- Snapshot history view and snapshot diff.
- Workstream progress panel with per-workstream status and result cards.
- Refresh AI Data control with last run timestamp and running indicator.

## Loading States

- AI draft generation loading state.
- Per-workstream pending/running indicators.
- Snapshot diff loading state.
- Refresh state that keeps previous output visible.

## Empty States

- No approved KYC snapshot.
- No AI KYC draft yet.
- No agent runs.
- No missing fields.
- No conflicts detected.

## Error States

- AI gateway failure with retry/manual fallback.
- Insufficient source data.
- Approval blocked by missing required fields.
- Restricted citation or source record.
- Workstream failed while others completed.

## Edge Cases

- Draft KYC cannot affect metrics, signals, renewal posture, or stage.
- Previous snapshots remain viewable after new approval.
- Deleted/unavailable source files must not remove approved snapshot data.
- Workstream refresh may be partial; completed workstreams should remain usable.

## Missing Requirements

- Required KYC field catalog is not specified.
- Freshness threshold and stale rules are not defined.
- KYC confidence scale and approval thresholds are not specified.
- Exact research sources and per-source reliability policy are not defined.
- The PRD uses both "Travoly" and "Trivoly"; the canonical research-source spelling is not resolved.

## Ambiguous Requirements

- "Authorized owner" approval is mentioned but not mapped to concrete roles.
- It is unclear whether KAM can approve their own edited AI draft.
- MVP scope mentions "AM approval" while functional requirements mention "KAM Head or authorized owner"; approval authority needs product confirmation.
- Workstreams may run sequentially or in parallel "as configured"; default behavior is unspecified.

## Conflicting Requirements

- None explicit, but approval authority overlaps with onboarding approval and should be unified.

## Unspecified Edge Cases

- Handling conflicting source citations with equal confidence.
- Reopening or superseding a rejected KYC draft.
- Snapshot rollback behavior.
- What happens when required field definitions change after old snapshots exist.

## Audit/Logging Requirements

- Log AI draft creation, source context, research sources, conflicts, reviewer actions, approval/rejection, and failure states.
- Audit every approved snapshot with approver, timestamp, source context, extraction run, and change summary.
- Create timeline events for AI extraction, draft creation, research enrichment, approval, rejection, version creation, refresh, and score impacts.

## Test Scenarios

- Trigger AI KYC from Account Overview and verify draft status.
- Approve a complete draft and verify immutable snapshot creation.
- Reject a draft and verify rejection reason/audit.
- Attempt approval with missing required fields.
- Display low-confidence and conflicting field indicators.
- Run Refresh AI Data and verify previous output remains visible.
- Simulate one failed workstream and verify partial results.
- Verify draft data does not affect official metrics before approval.
- Verify unauthorized user cannot see sensitive KYC fields or citations.

## Acceptance Criteria

- KYC can be drafted, reviewed, approved, rejected, versioned, and refreshed.
- Official metrics and platform intelligence use only approved KYC.
- Every approved KYC fact is source-backed where available.
- Freshness, completeness, and confidence indicators are visible in required surfaces.
