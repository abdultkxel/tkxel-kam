# KYC And AI Extraction Requirements Coverage Report

Self-review date: 2026-06-01

## Summary

The KYC feature is implemented across backend models/repositories/services/routers, frontend review/agent/intake surfaces, RBAC, account freshness indicators, and automated tests. The implementation uses an explicit AI/LLM gateway adapter contract with a deterministic local adapter for MVP/test execution.

Remaining partials are product/integration scope rather than unimplemented local workflow: a real AI/LLM provider payload/auth/retry/cost policy is not defined, workstream execution is synchronous in the local adapter, and Field Builder does not dynamically drive the KYC field catalog.

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Trigger AI KYC from Account Overview, onboarding drafts, or selected charter/SOW documents. | Complete | `frontend/src/components/account/Account360.tsx`, `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCIntakeFlow.tsx`, `backend/app/routers/kyc.py` |
| Generate draft KYC from charters/SOWs, approved account and engagement records, prior snapshots, attachments, user notes, and approved research sources. | Partial | `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py`; local account/source/prior/note contexts are included, real external enrichment awaits gateway integration details. |
| Approved research sources are Travoly/Trivoly, ZoomInfo, CrunchBase through the AI/LLM Gateway, not standalone adapters. | Complete | `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Display citations, confidence, conflicts, missing fields, and differences from previous approved snapshot. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx`, `backend/app/services/kyc.py` |
| Allow review, edit, enrich, approve, or reject draft content. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx`, `backend/app/services/kyc.py`, `backend/app/routers/kyc.py` |
| Store approved KYC snapshots as immutable versions. | Complete | `backend/app/models.py`, `backend/app/services/kyc.py`, `backend/app/repositories/kyc.py` |
| Track approver, timestamp, source context, extraction run, and change summary. | Complete | `backend/app/models.py`, `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Show freshness, completeness, stale status, source coverage, and confidence. | Complete | `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/pages/Dashboard.tsx` |
| Run five named workstreams. | Complete | `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| Display independent workstream status: pending, running, complete, failed. | Complete | `backend/app/models.py`, `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| Refresh AI Data reruns all workstreams while preserving previous output until the new run completes. | Partial | `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAgentOverview.tsx`; previous runs remain linked/viewable, but local execution is synchronous rather than truly async. |
| Charter/SOW intake creates a reviewable KYC draft and follow-up activity task. | Partial | `frontend/src/components/account/KYCIntakeFlow.tsx`, `backend/app/services/kyc.py`; backend draft is persisted, follow-up task is created in the existing frontend activity store. |
| Uploaded file names alone are not authoritative source evidence until source documents/citations are persisted. | Complete | `frontend/src/components/account/KYCIntakeFlow.tsx`, `backend/app/services/kyc.py` |
| Sensitive commercial/financial KYC values are masked without sensitive permission. | Complete | `backend/app/services/kyc.py`, `frontend/src/types/kyc.ts`, `backend/tests/test_kyc_ai_extraction.py` |
| Default required field catalog grouped by five PRD workstreams. | Complete | `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| Default sensitive fields: payment behaviour, gross margins, billing models. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Low/medium/high confidence thresholds and 180-day stale threshold. | Complete | `backend/app/services/kyc.py`, `backend/app/schemas.py` |
| AI failure must not block manual KYC entry. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| AI output labeled as AI-assisted and source-backed with non-dismissible disclaimer. | Complete | `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| AI must not fabricate unsupported values. | Partial | `backend/app/services/kyc_gateway.py`; local adapter uses source/account context and missing fields, but real anti-fabrication guarantees require gateway policy. |
| KYC indicators load on Account Overview, KYC page, and KAM Head Portfolio without blocking other sections. | Complete | `frontend/src/components/account/Account360.tsx`, `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/pages/Dashboard.tsx` |
| Trigger/review permission for KAM and KAM Head with account access. | Complete | `backend/app/services/kyc.py`, `backend/app/rbac.py` |
| Approve/reject permission for KAM Head/Admin/authorized owner. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Configure required fields/freshness for Admin and KAM Head. | Complete | `backend/app/routers/kyc.py`, `backend/app/services/kyc.py`, `backend/app/rbac.py` |
| RBAC actions: `kyc:view`, `create`, `update`, `approve`, `configure`, `export`. | Complete | `backend/app/rbac.py` |
| `kyc:export` or equivalent required for sensitive financial fields and restricted citations. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Account ownership rules apply beyond global role permission. | Complete | `backend/app/services/kyc.py`, `backend/app/services/account_access.py` |
| Approval requires required fields unless override reason captured. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Low-confidence or conflicting fields require acknowledgement. | Complete | `backend/app/services/kyc.py`, `frontend/src/components/account/KYCAssistedReview.tsx` |
| Draft fields can be cleared and completion recalculates. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Approved snapshots cannot be patched; corrections require new draft/version. | Complete | `backend/app/routers/kyc.py`, `backend/app/services/kyc.py` |
| Agent runs may be partial when workstreams fail. | Complete | `backend/app/services/kyc_gateway.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Data models: KycDraft, KycSnapshot, KycAgentRun, KycWorkstreamOutput, KycConfiguration. | Complete | `backend/app/models.py`, `backend/migrations/20260601_kyc_ai_extraction.sql` |
| Search KYC fields, citations, conflicts, missing labels, snapshot summaries, agent output/citations. | Complete | `backend/app/repositories/kyc.py`, `frontend/src/services/kyc.ts` |
| Draft filters: status, confidence, missing fields, stale, reviewer, created date. | Complete | `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py` |
| Snapshot filters: approver, source, confidence, date range. | Complete | `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py` |
| Agent run filters: status, workstream, triggered by, date range. | Complete | `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py` |
| Sort requirements for drafts, snapshots, agent runs, workstream order. | Complete | `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| Pagination for draft queue, snapshot history, agent run history. | Complete | `backend/app/repositories/kyc.py`, `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| AI/LLM Gateway is only KYC AI integration boundary and supports adapter contract. | Complete | `backend/app/services/kyc_gateway.py`, `backend/app/services/kyc.py` |
| Gateway request includes account context, selected docs, prior snapshot, research config, requester, RBAC-safe visibility. | Complete | `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py` |
| Gateway response includes workstream status, output, confidence, citations, missing fields, conflicts/errors. | Complete | `backend/app/services/kyc_gateway.py`, `backend/app/services/kyc.py` |
| Gateway failures are logged, surfaced, and do not block manual entry/review. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py`, `frontend/src/components/account/KYCAgentOverview.tsx` |
| KYC API endpoints listed in the spec. | Complete | `backend/app/routers/kyc.py`, `frontend/src/services/kyc.ts` |
| API list endpoints accept page/page_size and relevant search/filter/sort params. | Complete | `backend/app/routers/kyc.py`, `backend/app/repositories/kyc.py` |
| KYC page with current approved state, draft state, diff view, citations, confidence, conflicts. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx` |
| Missing-field panel and approval/rejection controls. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx` |
| Snapshot history view and snapshot diff. | Partial | `frontend/src/components/account/KYCAssistedReview.tsx`; history and draft-vs-previous diff are present, dedicated snapshot-to-snapshot diff viewer is not. |
| Workstream progress panel with status/result cards. | Complete | `frontend/src/components/account/KYCAgentOverview.tsx` |
| Refresh AI Data control with timestamp and running indicator. | Complete | `frontend/src/components/account/KYCAgentOverview.tsx` |
| Draft queue with search/status/sort/selected draft/pagination. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx` |
| Review gates for acknowledgements, override, notes, rejection reason. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx` |
| Agent run history with search/status/pagination/latest timestamp/outputs/failed partial display. | Complete | `frontend/src/components/account/KYCAgentOverview.tsx` |
| Empty, loading, and error states for KYC workflows. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCAgentOverview.tsx`, `frontend/src/components/account/KYCIntakeFlow.tsx` |
| Draft KYC cannot affect official metrics/signals/renewal posture/stage before approval. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Previous snapshots remain viewable after new approval. | Complete | `backend/app/repositories/kyc.py`, `frontend/src/components/account/KYCAssistedReview.tsx` |
| Deleted/unavailable source files do not remove approved snapshot data. | Complete | `backend/app/models.py`, `backend/app/services/kyc.py` |
| Workstream refresh may be partial; completed workstreams remain usable. | Complete | `backend/app/services/kyc.py`, `backend/app/services/kyc_gateway.py` |
| Audit logs and timeline events for extraction, draft create/update, approval/rejection, snapshot create, refresh. | Complete | `backend/app/services/kyc.py`, `backend/tests/test_kyc_ai_extraction.py` |
| Acceptance: drafted, reviewed, approved, rejected, versioned, refreshed. | Complete | `backend/tests/test_kyc_ai_extraction.py`, `frontend/src/components/account/KYCAssistedReview.test.tsx`, `frontend/src/components/account/KYCAgentOverview.test.tsx` |
| Acceptance: official intelligence uses only approved KYC. | Complete | `backend/app/services/accounts.py`, `backend/app/repositories/accounts.py` |
| Acceptance: every approved KYC fact is source-backed where available. | Complete | `backend/app/services/kyc.py`, `backend/app/models.py` |
| Acceptance: freshness/completeness/confidence indicators visible in required surfaces. | Complete | `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/pages/Dashboard.tsx` |

## Field Builder Impact

- Current impact: no blocking impact on KYC modules.
- KYC uses a fixed `FIELD_CATALOG` plus `KycConfiguration` for required fields, freshness, confidence threshold, and research sources.
- Admin Field Builder remains a generic custom-field system (`frontend/src/components/admin/AdminFieldBuilderPanel.tsx`, `backend/app/services/custom_fields.py`) and does not dynamically alter the KYC field catalog.
- If product expects Field Builder to manage KYC fields, that is a new integration requirement. It would need mapping from custom field definitions to KYC workstreams, sensitivity, required status, and snapshot version behavior.

## Gaps Fixed During Self-Review

- Added explicit AI gateway adapter contract and deterministic local adapter.
- Added gateway failure fallback so manual KYC draft/review is still available.
- Added KYC configuration API, RBAC checks, research-source allowlist, and frontend service types.
- Added KAM Head `kyc:configure` permission.
- Added sensitive field update protection and restricted source/citation masking.
- Added KYC stale/current signal to KAM Head portfolio and account completeness filtering.
- Fixed backend workstream object rendering in frontend so values no longer display as `[object Object]`.
- Added visible previous-snapshot differences in the KYC review UI.
- Fixed CSV onboarding account read regression caused by account KYC freshness becoming config-aware.
- Added PostgreSQL migration artifact for persistent environments.

## Remaining Product/Architecture Partials

- Real AI/LLM Gateway payload, authentication, retry/timeout, rate limit, and cost policy remain undefined in the spec.
- Per-source reliability weighting for Trivoly, ZoomInfo, and CrunchBase remains undefined.
- Local adapter execution is synchronous; true background workstream execution would require a job runner or queue.
- Dedicated snapshot-to-snapshot visual diff remains a future UI enhancement; draft-vs-previous diff is present.
- Charter/SOW follow-up task is created through the existing frontend activity store; backend task persistence is outside this KYC spec unless the task module API is extended.

## Missing Or Recommended Tests

- Real gateway contract tests once provider payload/auth/error policy is defined.
- Browser-level responsive and visual regression tests for KYC review and agent panels.
- Queue/background execution tests if workstreams become asynchronous.
- Snapshot-to-snapshot diff tests if that dedicated view is added.
- Load/concurrency tests for simultaneous draft approvals on the same account.

## Security Concerns Reviewed

- Sensitive financial values and restricted citations are masked unless the user has `kyc:export` or global sensitive authority.
- Sensitive fields cannot be patched by users without sensitive-view authority.
- Account access checks are enforced in addition to module-level RBAC.
- Research sources are allowlisted and Travoly is normalized to Trivoly.
- Real gateway secret handling, token rotation, egress controls, and rate limiting still need definition before connecting an external provider.

## Verification

- `DATABASE_URL=sqlite:///./backend/.pytest-startup.db backend/.venv/bin/python -m pytest backend/tests/test_kyc_ai_extraction.py -q` - passed, 6 tests.
- `DATABASE_URL=sqlite:///./backend/.pytest-startup.db backend/.venv/bin/python -m pytest backend/tests/test_account_workspace.py backend/tests/test_rbac.py -q` - passed, 19 tests.
- `npm run test -- KYCAssistedReview.test.tsx KYCAgentOverview.test.tsx` - passed, 4 tests.
- `npm run build` from `frontend/` - passed with the existing Vite large chunk warning.
