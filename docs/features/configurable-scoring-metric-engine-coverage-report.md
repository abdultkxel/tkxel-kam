# Configurable Scoring And Metric Engine - Requirements Coverage Report

Review date: 2026-06-02

## Summary

Phase 3 self-review compared the implementation against `docs/features/configurable-scoring-metric-engine.md` and Story 9.1 / Story 9.2 in `requirements/KAM_USER_STORIES.md`.

The MVP is implemented for Admin metric configuration, active published metric calculation, account/engagement score APIs, snapshots, job logs, RBAC, validation, and Account Health/Admin Scoring frontend surfaces. The review fixed gaps around job permissions, non-config metric visibility, metric-to-metric dependency formulas, and draft edits to published metrics.

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Admin/KAM Head can create, edit, activate, deactivate, validate, publish, and version metrics. | Complete | `backend/app/services/scoring.py`, `backend/app/routers/scoring.py`, `frontend/src/components/admin/ScoringEngineBuilder.tsx`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Metric includes name, scope, weight, thresholds, freshness rule, owner, source, and effective date. | Complete | `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services/scoring.py`, `frontend/src/components/admin/ScoringEngineBuilder.tsx` |
| Invalid configuration is blocked before publish. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Admin Scoring metric builder exists at `/admin?section=scoring`. | Complete | `frontend/src/components/admin/ScoringEngineBuilder.tsx`, `frontend/src/App.tsx` |
| Metric list supports search, filters, sorting, pagination, active/inactive state, and status. | Complete | `backend/app/repositories/scoring.py`, `backend/app/routers/scoring.py`, `frontend/src/components/admin/ScoringEngineBuilder.tsx` |
| Metric editor includes formula JSON, thresholds, weights, source, freshness, validation, publish, activation, and version history. | Complete | `frontend/src/components/admin/ScoringEngineBuilder.tsx`, `frontend/src/services/scoringSignalsTasks.ts` |
| Empty/loading/error states for Admin Scoring. | Complete | `frontend/src/components/admin/ScoringEngineBuilder.tsx`, `frontend/src/components/admin/ScoringEngineBuilder.test.tsx` |
| Required metric APIs are present. | Complete | `backend/app/routers/scoring.py`, `frontend/src/services/scoring.ts`, `frontend/src/services/scoringSignalsTasks.ts` |
| Structured formula types only; no arbitrary expression execution. | Complete | `backend/app/services/scoring.py` |
| Block missing/non-numeric weights, conflicting thresholds, invalid freshness, invalid effective dates, inactive dependencies, unsupported formulas, and circular dependencies. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Deactivated metrics cannot be selected for new formulas. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Configure metrics is limited to Admin/KAM Head; relevant users can view published definitions. | Complete | `backend/app/rbac.py`, `backend/app/services/scoring.py`, `backend/tests/test_rbac.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Published versions remain available for historical snapshots. | Complete | `backend/app/models.py`, `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Editing a published metric creates a draft and does not affect scoring until publish. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Future-effective and inactive metrics do not affect recalculation. | Complete | `backend/app/services/scoring.py` |
| Account and engagement score endpoints are present. | Complete | `backend/app/routers/scoring.py`, `backend/app/services/scoring.py`, `frontend/src/services/scoring.ts` |
| Account Detail -> Health is the primary score experience. | Complete | `frontend/src/components/account/Account360.tsx`, `frontend/src/components/account/ScoreCalculators.tsx`, `frontend/src/components/account/ScoreHistoryPanel.tsx` |
| Scores show overall score, RAG status, freshness, last calculated timestamp, trend, drivers, reason codes, and dirty/incomplete status. | Complete | `backend/app/schemas.py`, `backend/app/services/scoring.py`, `frontend/src/components/account/Account360.tsx` |
| Score history is retained as snapshots with normalized metric lines. | Complete | `backend/app/models.py`, `backend/app/repositories/scoring.py`, `backend/app/services/scoring.py`, `backend/migrations/20260602_scoring_signals_playbooks_tasks.sql` |
| Snapshot filters, sorting, and pagination are implemented. | Complete | `backend/app/repositories/scoring.py`, `backend/app/routers/scoring.py`, `frontend/src/components/account/ScoreHistoryPanel.tsx` |
| Manual/on-demand recalculation is available before reviews. | Complete | `backend/app/routers/scoring.py`, `backend/app/services/scoring.py`, `frontend/src/components/account/Account360.tsx` |
| Job-triggered recalculation creates job logs. | Complete | `backend/app/models.py`, `backend/app/services/scoring.py`, `backend/app/routers/scoring.py` |
| Scheduled/event recalculation support. | Partial | `POST /api/scoring/jobs` supports `scheduled` and `event` job types with logs, but no production scheduler/worker is implemented yet. |
| Inputs include approved authoritative records and Health-tab fallback inputs. | Partial | `backend/app/services/scoring.py` uses KYC, opportunities, escalations, engagements, service catalog, account health fields, and manual Health-tab inputs. Stakeholders, activities/tasks, governance, CSAT, and Ops updates remain partial/manual-backed until richer source models are connected. |
| Missing required inputs mark score incomplete/dirty with reasons. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py`, `frontend/src/components/account/Account360.tsx` |
| Recalculate only against active published metric versions. | Complete | `backend/app/services/scoring.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| AI does not create authoritative scores. | Complete | `backend/app/services/scoring.py`; AI explanation remains advisory in signal flow through `backend/app/services/signals.py` |
| Error state for calculation failure with job context. | Partial | Backend stores failed jobs and returns a job id for unexpected calculation failures in `backend/app/services/scoring.py`; frontend displays API errors but does not deep-link to a job log detail screen yet. |
| Responsive Admin Scoring and Account Health behavior. | Partial | Responsive layout classes and frontend tests exist in `frontend/src/components/admin/ScoringEngineBuilder.tsx` and account components. Browser screenshot verification could not be completed because the in-app browser was unavailable in this session. |

## Field Builder Impact

Field Builder does not currently impact scoring formulas or metric criteria. Metric definitions, validation, and formula behavior are owned by Admin -> Scoring. Existing custom fields can remain module-level fields, but they are not valid scoring formula sources until explicit source-mapping validation is added.

## Missing Requirements

- No production recurring scheduler/worker exists for scheduled recalculation. The job API supports scheduled/event/manual job types and logs, but execution is synchronous through the request.
- No dedicated CSAT, stakeholder, governance, Ops-update, or task/activity source adapters are wired into scoring yet. These inputs are represented through existing records where available and Health-tab/manual evidence where not.
- No job log detail UI/deep link is present for calculation error drill-down.
- No browser-verified responsive screenshots were captured because the in-app browser was unavailable.

## Missing Tests

- Full backend `pytest -q` still needs environment cleanup for the default file-backed startup path; targeted scoring/RBAC tests pass.
- No production scheduler test exists because the scheduler is not implemented.
- No real external CSAT/source-integration tests exist because those adapters are not implemented.
- No browser screenshot tests were completed for desktop/mobile responsive verification.

## Potential Bugs And Security Concerns

- Formula execution is restricted to the structured DSL in `backend/app/services/scoring.py`; no arbitrary expression evaluation is used.
- Metric dependency traversal now blocks inactive/unpublished references and circular references, but very large dependency graphs should be monitored for validation cost.
- Editing published metrics now creates a draft row state and calculation reads the last published version. Admin list UX should make draft-vs-published state clear during future polish.
- Signals router emits a duplicate operation-id warning for recommended playbooks during test startup; this does not block scoring behavior but should be cleaned up.
- Tenant isolation is not modeled in this codebase; scoring follows existing account/RBAC access boundaries.

## Edge Cases Reviewed

- Historical snapshots preserve metric version, raw score, normalized score, weights, drivers, reason codes, evidence, and source context.
- Formula changes do not rewrite historical snapshots.
- Draft edits to published metrics do not affect score recalculation until publish.
- Inactive metrics and future-effective metrics are excluded from score recalculation.
- Missing metric configuration creates an incomplete dirty snapshot instead of silently using hidden defaults.
- Failed score calculations persist failed job metadata and return job context for unexpected failures.
