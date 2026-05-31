# Retention And Account Stability Requirements Coverage Report

Generated after implementation on 2026-05-31.

## Coverage Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Track account retention readiness and renewal risk | Complete | `backend/app/models.py`, `backend/app/services/retention.py`, `backend/app/routers/retention.py`, `frontend/src/components/account/RetentionPanel.tsx` |
| Track SOW start/end, renewal date, notice deadline, notice period, auto-renewal, exposure, owner, confidence, source citation | Complete | `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services/retention.py`, `frontend/src/components/account/EngagementsPanel.tsx` |
| Validate notice deadline before renewal and SOW end date | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Require confidence/citation for SOW-backed or extracted renewal fields | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Require manual override reason for explicit manual renewal terms | Complete | `backend/app/services/retention.py`, `frontend/src/components/account/EngagementsPanel.tsx`, `backend/tests/test_retention_stability.py` |
| Account retention read/update APIs | Complete | `backend/app/routers/retention.py`, `backend/tests/test_retention_stability.py` |
| Engagement renewal read/update APIs | Complete | `backend/app/routers/retention.py`, `backend/tests/test_retention_stability.py` |
| Portfolio renewal list with search/filter/sort/pagination | Complete | `backend/app/repositories/retention.py`, `backend/app/services/retention.py`, `frontend/src/pages/Retention.tsx`, `frontend/src/pages/Retention.test.tsx` |
| Account 360 retention surface | Complete | `frontend/src/components/account/Account360.tsx`, `frontend/src/components/account/RetentionPanel.tsx` |
| Engagement 360 editable renewal surface | Complete | `frontend/src/components/account/EngagementsPanel.tsx` |
| Retention, renewal, and stabilization plan persistence | Complete | `backend/app/models.py`, `backend/app/services/retention.py`, `backend/migrations/20260531_retention_stability.sql` |
| Plan create/update APIs | Complete | `backend/app/routers/retention.py`, `backend/tests/test_retention_stability.py` |
| Plans include actions, owners, due dates, success criteria, renewal milestones, timeline history | Complete | `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/services/retention.py`, `frontend/src/components/account/RetentionPanel.tsx` |
| Recommendation panel with rationale | Complete | `backend/app/services/retention.py`, `frontend/src/components/account/RetentionPanel.tsx` |
| Recommendation-to-task/action creation requires user confirmation | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Due dates cannot be after renewal milestone where configured | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Leadership Viewer read-only behavior | Complete | `backend/app/services/retention.py`, `frontend/src/components/account/RetentionPanel.tsx`, `frontend/src/components/account/EngagementsPanel.tsx`, `backend/tests/test_retention_stability.py` |
| Commercial Stakeholder limited renewal-field update | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Audit and timeline for renewal and plan/action lifecycle | Complete | `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Field Builder support for `retention_stability` | Complete | `frontend/src/components/account/RetentionPanel.tsx`, `backend/app/services/retention.py`, `backend/tests/test_retention_stability.py` |
| Loading, empty, and error states | Complete | `frontend/src/pages/Retention.tsx`, `frontend/src/components/account/RetentionPanel.tsx`, `frontend/src/components/account/EngagementsPanel.tsx`, `frontend/src/pages/Retention.test.tsx` |
| Responsive UI behavior | Complete | `frontend/src/pages/Retention.tsx`, `frontend/src/components/account/RetentionPanel.tsx`, `frontend/src/components/account/EngagementsPanel.tsx`, `npm run build` |
| Renewal risks, SOW expiry, and notice deadlines appear in dashboard | Complete | `frontend/src/pages/Dashboard.tsx` |
| Renewal risks, SOW expiry, notice deadlines appear in signals/tasks/calendar/reports | Complete | `backend/app/services/retention.py`, `backend/app/routers/retention.py`, `frontend/src/pages/Retention.tsx`, `backend/tests/test_retention_stability.py`, `frontend/src/pages/Retention.test.tsx`; retention-scoped generated context is used instead of separate global module records |
| Recommendations use weak metrics, signals, account stage, engagement posture, SOW end, notice window | Complete | `backend/app/services/retention.py`; deterministic v1 uses weak health metrics, generated renewal signals, account lifecycle stage, engagement renewal posture, SOW/renewal dates, notice window, confidence, and citation gaps |
| Scheduled daily recalculation for stale data and renewal proximity | Missing | Not implemented |
| Approved SOW terms auto-create renewal signals, notice-window tasks, and calendar items | Complete | Engagement create/update syncs renewal records in `backend/app/services/engagements.py`; `backend/app/services/retention.py` generates renewal signals, notice-window tasks, and calendar items from synchronized renewal terms |

## Field Builder Impact

- `retention_stability` runtime custom fields are active for retention plan creation and persisted as `custom_field_values`.
- Existing Field Builder modules are not structurally impacted.
- Required custom fields are enforced when a retention plan is created through the backend service.
- No schema changes were needed in the Field Builder tables.

## Missing Or Partial Requirements

- Retention signals/tasks/calendar/report context is generated within the retention module, not persisted into separate global Signals, Tasks, Calendar, or Reports modules.
- Governance agenda/AI brief inclusion of retention deadlines and plan actions is documented but not implemented.
- Scheduled daily recalculation is not implemented.
- Recommendation input set is deterministic v1 and does not yet cover optional future PRD sources such as stakeholder map, CSAT, Ops updates, and full historical signal streams.
- Deep field-level redaction for sensitive custom fields is limited by existing platform primitives.

## Missing Tests

- No browser-level responsive screenshot test was added.
- No governance AI brief test exists for retention context inclusion because that runtime inclusion is not implemented.
- No scheduled recalculation test exists because there is no scheduler implementation.
- Frontend Account 360 RetentionPanel create-action flow is covered indirectly by backend tests and build, but not by a dedicated Vitest interaction test.

## Potential Bugs And Edge Cases

- Existing engagement records without dedicated renewal rows are synthesized at read time; the first renewal update persists the dedicated row.
- Manual imported commercial terms are accepted through the manual/source workflow but do not yet have CSV-specific provenance screens.
- Plan owner input currently uses owner ID in the Account 360 plan builder; a user picker would improve ergonomics.
- Recommendation-created retention actions are scoped to retention plans only and will not appear in a global task system unless a future task module maps them.

## Security Concerns

- Account authorization and module RBAC are enforced for all retention routes.
- Commercial Stakeholder update scope is restricted to commercial renewal fields.
- Leadership Viewer edit requests are rejected by backend and edit controls are hidden in frontend.
- Source citations are stored and surfaced, but deeper permission-aware citation opening in governance contexts remains future work.

## Verification

- `backend\.venv\Scripts\python -m pytest backend/tests -q`: passed, 33 tests.
- `npm test -- --run`: passed, 28 tests.
- `npm run build`: passed, with existing Vite chunk-size warning.
