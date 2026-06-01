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
- Charter/SOW intake must create a reviewable KYC draft and a follow-up activity task, but uploaded file names alone are not authoritative source evidence until source documents/citations are persisted.
- Sensitive commercial/financial KYC values must be masked unless the user has explicit KYC export/sensitive-view permission.

## KYC Field Catalog

Default required fields are grouped by the five PRD workstreams:

- Market Research: industry overview, market landscape and trends, competitor analysis, regulatory and compliance factors.
- Client Research: company snapshot, vision/mission/strategy, company history and evolution, stakeholder map, technical landscape.
- Stakeholder Details: client-side stakeholders, Tkxel-side stakeholder mapping.
- Tkxel Engagement with Client: project charters, engagement models, contractual obligations and SLAs, past engagement summary.
- Financial Landscape: renewal cycle, payment behaviour, gross margins, billing models.

Default sensitive fields:

- payment behaviour
- gross margins
- billing models

Default thresholds:

- Low confidence: below 70.
- Medium confidence: 70-84.
- High confidence: 85 and above.
- Default stale threshold: 180 days after latest approved snapshot.

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
- RBAC action names: `kyc:view`, `kyc:create`, `kyc:update`, `kyc:approve`, `kyc:configure`, and `kyc:export`.
- `kyc:export` or equivalent sensitive-view authority is required to view unmasked sensitive financial KYC fields and restricted citations.
- Account ownership rules still apply; global role permission alone does not grant access to unrelated account records.

## Validation Rules

- Approval requires required KYC fields unless authorized override reason is captured.
- Low-confidence or conflicting fields require explicit review acknowledgement.
- Snapshots are immutable after approval.
- Completion percentage uses configured required fields.
- Completion percentage updates when required fields are approved, edited, or cleared.
- Stale status uses configured freshness threshold.
- Refresh AI Data is available only to authorized users.
- Rejection requires a human-entered rejection reason.
- Draft fields may be cleared during review, and clearing a required field recalculates missing fields and completion immediately.
- Approved snapshots cannot be patched; corrections require a new draft and a new snapshot version.
- Agent runs may be `partial` when one or more workstreams fail; successful workstreams remain available.

## Data Model Requirements

- `KycDraft`: account, status, trigger source, agent run, previous snapshot, selected source documents, research sources, field JSON, citation JSON, missing fields, conflicts, diff summary, confidence, completeness, source coverage, review gates, reviewer/approver/rejecter metadata, and timestamps.
- `KycSnapshot`: immutable account/version record with source draft, extraction run, approver, approved timestamp, fields, citations, source context, source documents, research sources, confidence/completeness/source coverage, missing fields, conflicts, and change summary.
- `KycAgentRun`: account-level AI run with trigger source, previous run id, source documents, research sources, triggered-by metadata, status, errors, started/completed timestamps, and workstream children.
- `KycWorkstreamOutput`: one row per run/workstream with status, sort order, output JSON, citations, missing fields, confidence, error message, and timestamps.
- `KycConfiguration`: required field keys, freshness threshold, low-confidence threshold, configured research sources, and updater metadata.

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

## External Integration Requirements

- AI/LLM Gateway is the only approved AI integration boundary for KYC extraction and enrichment.
- Travoly/Trivoly, ZoomInfo, and CrunchBase are configurable research sources passed through the AI/LLM Gateway, not standalone MVP adapters.
- The implementation must support a gateway/adapter contract even when a deterministic local adapter is used for MVP or tests.
- Gateway requests must include account context, selected source document ids, prior approved snapshot context, research source configuration, requester/user id, and RBAC-safe field visibility context.
- Gateway responses must return workstream-level status, field outputs, confidence scores, citation references/excerpts, missing fields, conflicts, and error metadata.
- Gateway failures must be logged, surfaced in the UI, and must not block manual KYC entry or review.

## API Requirements

- `GET /api/accounts/{account_id}/kyc/drafts`
- `POST /api/accounts/{account_id}/kyc/drafts`
- `GET /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `PATCH /api/accounts/{account_id}/kyc/drafts/{draft_id}`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/approve`
- `POST /api/accounts/{account_id}/kyc/drafts/{draft_id}/reject`
- `GET /api/accounts/{account_id}/kyc/snapshots`
- `GET /api/accounts/{account_id}/kyc/snapshots/{snapshot_id}`
- `GET /api/accounts/{account_id}/kyc/freshness`
- `GET /api/accounts/{account_id}/kyc/agent-runs`
- `POST /api/accounts/{account_id}/kyc/agent-runs`
- `GET /api/accounts/{account_id}/kyc/agent-runs/{run_id}`
- `POST /api/accounts/{account_id}/kyc/agent-runs/{run_id}/refresh`

API list endpoints must accept page/page_size and relevant search/filter/sort query params described in the Search, Filter, Sort, and Pagination sections.

## UI Requirements

- KYC page with current approved state, draft state, diff view, citations, confidence badges, and conflict indicators.
- Missing-field panel and approval/rejection controls.
- Snapshot history view and snapshot diff.
- Workstream progress panel with per-workstream status and result cards.
- Refresh AI Data control with last run timestamp and running indicator.
- Draft queue with search, status filter, sorting, selected draft state, and pagination.
- Review gates for low-confidence acknowledgement, conflict acknowledgement, override reason, review notes, and rejection reason.
- Agent run history with search, status filter, pagination, latest run timestamp, per-workstream expandable outputs, and failed/partial status display.
- Empty, loading, and error states must be present for draft list, snapshot history, agent runs, save/approve/reject, refresh, and create-draft actions.

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

- Per-source reliability policy and weighting for Travoly/Trivoly, ZoomInfo, and CrunchBase are not defined.
- The PRD uses both "Travoly" and "Trivoly"; implementation should treat `Trivoly` as the canonical display value and `Travoly` as an alias until product confirms.
- The real AI/LLM Gateway payload, authentication, timeout, retry, rate-limit, and cost-control policy are not defined.
- File upload/storage for new charter/SOW documents is outside this spec unless source documents are already persisted by the account workspace.

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
- Verify draft queue search/filter/sort and pagination.
- Verify snapshot history pagination.
- Verify agent run search/filter and pagination.
- Verify loading, empty, and error states for draft creation, refresh, save, approval, rejection, and failed workstreams.

## Acceptance Criteria

- KYC can be drafted, reviewed, approved, rejected, versioned, and refreshed.
- Official metrics and platform intelligence use only approved KYC.
- Every approved KYC fact is source-backed where available.
- Freshness, completeness, and confidence indicators are visible in required surfaces.

## Implementation Status

### Completed Items

The following items are implemented and covered by automated tests:

- KYC backend data model, repository, service, and API surface for drafts, snapshots, freshness, agent runs, workstream outputs, and configuration.
- PostgreSQL schema artifact for persistent environments: `backend/migrations/20260601_kyc_ai_extraction.sql`.
- AI/LLM Gateway adapter contract with deterministic local MVP adapter and gateway failure fallback.
- AI KYC draft creation from account context, existing source documents, approved engagement/account records, prior snapshot context, research-source configuration, and user notes.
- Reviewable draft workflow: edit fields, clear required fields, recalculate missing fields/completeness, save review notes, approve, or reject.
- Immutable snapshot creation with version, approver, approval timestamp, extraction run id, source context, source documents, research sources, and change summary.
- KYC freshness, completeness, confidence, source coverage, stale/missing status, and account current-KYC indicators.
- Five named KYC workstreams with persisted per-workstream status, output, citations, missing fields, confidence, error message, and configured display order.
- Partial/failed workstream behavior, including failed workstream surfacing and continued availability of completed workstream outputs.
- Search, filter, sort, and pagination for draft review queues, snapshot history, and agent run history.
- RBAC and account-access checks for view/create/update/approve/configure/export actions.
- Sensitive financial KYC masking for payment behaviour, gross margins, billing models, restricted citations, and sensitive source context.
- Sensitive field update protection for users without `kyc:export` or equivalent sensitive-view authority.
- KYC configuration API for required fields, freshness threshold, low-confidence threshold, and approved research-source configuration.
- Travoly/Trivoly alias normalization with `Trivoly` as canonical display value, and allowlisting for Trivoly, ZoomInfo, and CrunchBase.
- KYC review UI with draft queue, field editor, citations, confidence badges, missing/conflict indicators, review gates, previous approved value display, change summary, snapshot history, loading, empty, and error states.
- AI agent overview UI with refresh action, latest timestamp, workstream cards, search/status filter, run history, pagination, loading, empty, and error states.
- Charter/SOW intake UI creates a backend KYC draft when authenticated and creates a follow-up activity task in the existing frontend activity store.
- KAM Head portfolio KYC current/stale indicator.
- Audit logs and timeline events for AI extraction, draft creation/update, approval, rejection, snapshot creation, and refresh.

Automated verification completed:

- `DATABASE_URL=sqlite:///./backend/.pytest-startup.db backend/.venv/bin/python -m pytest backend/tests/test_kyc_ai_extraction.py -q` - passed, 6 tests.
- `DATABASE_URL=sqlite:///./backend/.pytest-startup.db backend/.venv/bin/python -m pytest backend/tests/test_account_workspace.py backend/tests/test_rbac.py -q` - passed, 19 tests.
- `npm run test -- KYCAssistedReview.test.tsx KYCAgentOverview.test.tsx` - passed, 4 tests.
- `npm run build` from `frontend/` - passed with the existing Vite large chunk warning.

### Remaining Items

The following items are not marked complete because they are partial, product-dependent, or not fully tested:

- Real AI/LLM Gateway integration is not implemented because payload shape, authentication, timeout, retry, rate-limit, and cost-control policy are undefined.
- Per-source reliability weighting for Trivoly, ZoomInfo, and CrunchBase is not defined or implemented.
- AI anti-fabrication enforcement beyond source/context-aware deterministic MVP behavior requires the real gateway policy and contract tests.
- Refresh AI Data preserves previous runs/output in history, but the local adapter executes synchronously; true "previous output remains visible until new run completes" needs asynchronous job execution or a queue.
- Dedicated snapshot-to-snapshot visual diff is not implemented; current UI supports draft-vs-previous approved snapshot differences and snapshot history.
- Charter/SOW follow-up activity task is created through the existing frontend activity store; backend task persistence is outside this KYC spec unless the task module exposes a persistence API.
- Dynamic Field Builder integration with the KYC field catalog is not implemented. KYC currently uses a fixed `FIELD_CATALOG` plus `KycConfiguration`.
- Browser-level responsive/visual regression testing for KYC review and AI agent panels has not been added.
- Concurrency/load tests for simultaneous draft approvals on the same account have not been added.

### Technical Notes

- The implementation boundary for AI extraction is `backend/app/services/kyc_gateway.py`; no Travoly/Trivoly, ZoomInfo, or CrunchBase standalone adapter exists.
- The deterministic local adapter is intentionally used for MVP and tests until the real AI/LLM Gateway is specified.
- KYC configuration is global/default-scoped through `KycConfiguration`; tenant/account-specific KYC configuration is not part of this implementation.
- Account ownership rules are enforced in addition to module RBAC; global role permissions do not grant access to unrelated account records.
- Approved snapshots are immutable by API design; corrections require creating and approving a new draft version.
- Deleted or unavailable source files do not remove approved snapshot JSON data, citations, source context, or source document ids stored on the snapshot.
- Field Builder does not currently impact KYC modules. If product wants Field Builder-managed KYC fields, a mapping layer is needed for workstream grouping, required status, sensitivity, and snapshot version behavior.
- Coverage details are tracked in `specs/02-kyc-and-ai-extraction-coverage-report.md`.
