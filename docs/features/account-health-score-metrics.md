# Account Health Score Metrics

## Summary

Account score metrics live inside an account's Health section. The score experience should be account-specific, surfaced from Account Detail -> Health, with engagement-level scores rolling into the account health view where configured.

This context comes from `C:\Users\TK-LPT-1026\Desktop\KAM_Module_Logic_and_Developer_Flows.pdf`, especially pages 13-23.

## Scope

- In scope:
  - Account Detail -> Health tab score cards, drivers, snapshots, and recalculation controls.
  - Category-level metric definitions for Relationship, Resource Health, Service Line, Contract Health, Account Risk, and CSAT.
  - Configurable composite Account Health calculation using Admin-managed weights.
  - Deterministic signal generation from score movement and weak metrics.
  - Playbook recommendations from signals and weak metrics.
- Out of scope:
  - Standalone platform-level scoring page as the primary user workflow.
  - Hardcoded final Account Health category weights.
  - Delivery Score implementation until business provides its criteria, weights, formula, thresholds, triggers, and source ownership.

## Requirement Links

- Related user stories:
  - `requirements/KAM_USER_STORIES.md` Story 9.1 - Metric definition configuration.
  - `requirements/KAM_USER_STORIES.md` Story 9.2 - Score calculation, refresh, and snapshots.
  - `requirements/KAM_USER_STORIES.md` Story 10.1 - Deterministic signal generation and detail.
  - `requirements/KAM_USER_STORIES.md` Story 10.2 - Attention Center and signal lifecycle.
- Related spec:
  - `specs/04-scoring-signals-playbooks-and-tasks.md`.
- Current implementation references:
  - `backend/app/services/engagement_health_rollup.py` has a temporary `pending_scoring_engine` adapter.
  - `backend/app/models.py` has `EngagementHealthSnapshot` and `AccountHealthRollup`.
  - `frontend/src/components/account/Account360.tsx` renders Health tab score UI.
  - `frontend/src/components/account/ScoreCalculators.tsx` has a prototype/manual calculator.
  - `frontend/src/components/account/ScoreHistoryPanel.tsx` has snapshot comparison UI.

## User Flow

1. User opens an account.
2. User selects the account's Health tab.
3. Health tab shows current Account Health, category scores, RAG status, freshness, trend, drivers, and reason codes.
4. User can inspect score details and source evidence.
5. Authorized KAM/KAM Head can trigger manual recalculation.
6. Recalculation creates a versioned snapshot and timeline event.
7. Weak scores or threshold changes create deterministic signals.
8. Signals can recommend playbooks, but playbooks only launch after user confirmation.

## Global Scoring Rules

- Scores must be explainable.
- Store raw metric score, metric weight, weighted score, final category score, RAG/status, calculation date, and scoring version id.
- Use approved account, KYC, engagement, stakeholder, contract, risk, and CSAT data only.
- Weights must be configurable in Admin where the framework uses weights.
- Formula/version changes must not rewrite historical snapshots.
- AI can explain scores/signals, but cannot create authoritative scores or change signal lifecycle.

## Metric Categories

### Relationship Score

Formula:

```text
Relationship Score = SUM(each metric score * metric weight)
```

Weights:

- CEO: 20%
- KAM: 30%
- Delivery Leadership / PMO / Director: 25%
- Finance: 5%
- In-Person Meeting: 20%

Thresholds:

- Green: `>= 2`
- Yellow: `> 1.5 and < 2`
- Red: `< 1.5`

Signals:

- Yellow creates relationship-strengthening signal and recommends relationship recovery playbook.
- Red creates high-priority relationship risk signal, notifies AM, and appears in Attention Center.
- CEO score `0` creates executive-sponsor coverage gap signal.
- KAM score `0` creates commercial relationship gap signal.
- Delivery Leadership score `0` creates delivery relationship gap signal.
- In-Person Meeting score `0` creates relationship depth gap and recommends executive/client visit action where applicable.

### Resource Health Score

Formula:

```text
Resource Health Score = SUM(each metric score * metric weight)
```

Weights:

- Number of Key Resources on Account: 50%
- Key Resource Alignment with Tkxel: 25%
- Backup: 25%

Thresholds:

- Green: `>= 2`
- Yellow: `> 1.5 and < 2`
- Red: `< 1.5`

Signals:

- Yellow creates resource health signal and recommends backup/continuity actions.
- Red creates high-priority resource risk signal and notifies AM/KAM Head per SLA rules.
- Number of Key Resources score `0` creates key-resource dependency/coverage signal.
- Backup score `0` creates backup coverage gap signal and task to identify backup resource.
- Alignment score `1` creates continuity risk indicator.

### Service Line Score

Formula:

```text
Service Line Score = COUNT(Yes) / (COUNT(Yes) + COUNT(No)) * 100
```

Rules:

- `Yes`: adopted/currently provided, counted in numerator and denominator.
- `No`: applicable but not currently provided, counted in denominator only.
- `N/A`: not applicable, excluded from denominator.

Signals:

- Low Service Line Score creates whitespace/growth opportunity signal.
- Many `No` services recommend service-adjacency review.
- Strategic service marked `No` recommends opportunity creation.
- Service status changes from `Yes` to `No` create adoption decline signal and timeline event.

### Contract Health Score

Formula:

```text
Contract Health Score = AVERAGE(Contract Length score, Notice Period score, Renewal Terms score)
```

The source framework does not assign weights for Contract Health. If needed later, Admin should be able to convert this from simple average to weighted average.

Thresholds:

- Green: `>= 2`
- Yellow: `> 1.5 and < 2`
- Red: `< 1.5`

Signals:

- Yellow creates contract review signal.
- Red creates contract risk signal and notifies AM/KAM Head where configured.
- Notice Period score `1` creates notice-period risk signal.
- Renewal Terms score `0` creates renewal-risk signal.
- Contract Length score `1` creates short-contract risk indicator.

### Account Risk Score

Formula:

```text
Account Risk Score = SUM(each metric score * metric weight)
```

Important: this behaves as a health/stability score, where higher score means lower account risk.

Weights:

- Competitors: 30%
- Current Leadership Tenure: 15%
- Funding and Revenue Changes: 15%
- Payment Behavior: 15%
- Roadmap Alignment: 20%
- Geopolitical Situation: 5%

Thresholds from source:

- Green: `>= 2`
- Yellow: `> 1.6 and < 1.9`
- Red: `< 1.5`

Open threshold issue:

- Source has gaps around `1.5-1.6` and `1.9-2.0`.
- Product configuration should either preserve those gaps intentionally or define clean non-overlapping ranges before implementation.

Signals:

- Yellow creates medium account-risk signal.
- Red creates high account-risk signal and appears in Attention Center.
- Competitors score `0` creates competitor-risk signal.
- Leadership Tenure score `0` creates leadership-change risk signal.
- Funding/Revenue score `0` creates financial-visibility risk signal.
- Payment Behavior score `0` creates payment-risk signal.
- Roadmap Alignment score `0` creates strategic-misalignment signal.
- Geopolitical Situation score `0` creates geopolitical-risk signal.

### CSAT Score

Formula:

```text
CSAT Score = SUM(category score * category weight)
```

Weights:

- Delivery Excellence: 30%
- Communication: 20%
- Proactiveness: 15%
- Trust: 20%
- Value for Money: 15%

Rating scale:

- 1: Very Poor
- 2: Poor
- 3: Average
- 4: Good
- 5: Excellent

Signals and recommendations:

- Overall CSAT drops below configured threshold creates CSAT risk signal.
- Any category score `1` or `2` creates category-specific improvement task recommendation.
- Delivery Excellence score `1` or `2` recommends delivery recovery action.
- Communication score `1` or `2` recommends communication cadence action.
- Proactiveness score `1` or `2` recommends proactive improvement plan.
- Trust score `1` or `2` recommends executive relationship action.
- Value for Money score `1` or `2` recommends value realization or commercial review.
- CSAT improvement from prior survey adds positive CSAT trend event to timeline.

### Delivery Score Placeholder

Delivery Score is referenced in the source summary, but no worksheet or rules were provided.

Do not implement Delivery Score until these inputs exist:

- Criteria.
- Metric weights.
- Scoring options.
- Formula.
- RAG thresholds.
- Signal triggers.
- Source data ownership.

## Composite Account Health

Recommended configurable model:

```text
Account Health = SUM(category score * category weight) / SUM(category weights)
```

Category behavior:

- Delivery Score: inactive until framework is provided.
- Contract Health: configurable.
- Relationship Score: configurable.
- Service Line Score: configurable.
- Resource Health: configurable.
- Account Risk Score: configurable.
- CSAT Score: configurable.

Developer rule:

- Do not hardcode final Account Health category weights unless business provides them.
- Store category weights in Admin configuration.
- Preserve score snapshot history when weights change.

## Signals And Attention Center

Signals are deterministic and rule-based in MVP. AI may explain a signal but cannot create the authoritative signal or change its status.

Signal examples:

- SOW expiry approaching.
- Notice deadline approaching or missed.
- Stale KYC.
- Health score drop.
- Health dimension drops by configured threshold, such as `>= 0.5`.
- Red account health.
- CSAT decline.
- Opportunity stalled beyond configured days.
- Governance overdue.
- Escalation inactive beyond SLA.
- Stakeholder coverage gap.
- Payment overdue or commercial risk where data exists.

Signal fields:

- Signal type.
- Account / engagement.
- Severity.
- Reason code.
- Evidence/source records.
- Created date.
- Owner.
- Age.
- Confidence level if derived from document extraction.
- Recommended playbook.

Lifecycle:

```text
New -> Reviewed -> Accepted -> Converted -> Resolved
New -> Reviewed -> Dismissed
```

Attention Center behavior:

- Default view answers: "What needs attention today?"
- Sort by severity, SLA age, renewal proximity, and due date.
- AM can accept, dismiss, convert to task/playbook, resolve, or request AI explanation.

## Backend Plan

- Routers:
  - Add account-scoped score endpoints under `/api/accounts/{account_id}/...`.
  - Keep score consumption account-specific rather than platform-first.
  - Add metric Admin endpoints only for configuration workflows.
- Services:
  - Metric definition/version service.
  - Score calculation service.
  - Signal generation service.
  - Snapshot service.
- Repositories:
  - Metric definitions and versions.
  - Metric snapshots / score snapshots.
  - Signals and lifecycle history.
- Schemas/validation:
  - Validate formulas, weights, threshold ranges, effective dates, active/inactive state, and source mappings.
  - Prevent final category weight hardcoding.

## API Documentation

Account Health APIs should be documented as Account Health tab APIs.

Expected account-facing APIs from the current spec:

- `GET /api/accounts/{account_id}/scores`
- `POST /api/accounts/{account_id}/scores/recalculate`
- `GET /api/accounts/{account_id}/score-snapshots`
- `GET /api/engagements/{engagement_id}/scores`

Admin/config APIs:

- `GET /api/admin/metrics`
- `POST /api/admin/metrics`
- `PATCH /api/admin/metrics/{metric_id}`
- `POST /api/admin/metrics/{metric_id}/validate`
- `POST /api/admin/metrics/{metric_id}/publish`
- `GET /api/admin/metrics/{metric_id}/versions`

Signal APIs:

- `GET /api/signals`
- `GET /api/signals/{signal_id}`
- `POST /api/signals/evaluate`
- `GET /api/signals/{signal_id}/evidence`
- `POST /api/signals/{signal_id}/ai-explanation`
- `GET /api/attention-center`
- `PATCH /api/signals/{signal_id}/status`
- `POST /api/signals/{signal_id}/convert`
- `GET /api/signals/{signal_id}/recommended-playbooks`

## Database Plan

Candidate entities from the PDF:

- `MetricDefinition`
- `MetricVersion`
- `MetricSnapshot`
- `ScoreSnapshot`
- `Signal`
- `SignalLifecycleEvent`
- `PlaybookTemplate`
- `Task`

Snapshot fields should preserve:

- Account id and optional engagement id.
- Category and metric ids.
- Raw metric score.
- Metric weight.
- Weighted score.
- Final category score.
- Composite account health score.
- RAG/status.
- Drivers and reason codes.
- Freshness status.
- Calculation date.
- Scoring version id.
- Source/evidence records.

## Frontend Plan

- Pages/components:
  - Account Detail -> Health tab is the primary score surface.
  - Health tab should show current score, category cards, RAG, freshness, drivers, reason codes, and recalculation.
  - Snapshot comparison stays in account Health.
  - Signal drawer/Attention Center can deep-link back to Account Detail -> Health.
- Stores/hooks/services:
  - Replace mock score store with backend account score APIs.
  - Add account score service and signal service.
- Form behavior:
  - Admin metric builder handles formulas, weights, thresholds, source mapping, freshness, validation, publish, and version history.

## Validation And Errors

- Block invalid formulas.
- Block missing weights where weights are required.
- Block conflicting or overlapping thresholds unless gaps are explicitly configured.
- Block circular dependencies.
- Block invalid freshness rules.
- Block invalid effective dates.
- Deactivated metrics cannot be selected for new formulas.
- Required missing score inputs should mark score incomplete/dirty, not silently calculate.

## Tests

- Backend:
  - Metric create/edit/validate/publish/version.
  - Reject invalid formula/threshold/weight configurations.
  - Account score calculation creates snapshot with drivers and version id.
  - Engagement score calculation rolls up to account health according to configured rule.
  - Formula/weight change preserves old snapshots.
  - Score threshold crossing creates deterministic signal.
  - Signal lifecycle transitions are audited.
  - Playbook recommendation comes from weak metric/signal and does not auto-create tasks.
- Frontend:
  - Account Health tab renders score categories and drivers.
  - Manual recalculation calls account-scoped API.
  - Snapshot comparison renders prior versions.
  - Admin metric builder displays validation errors by field.
  - Signal drawer links evidence and account Health source.

## Open Questions

- What final Account Health category weights should ship first?
- Should Account Risk threshold gaps be preserved as source-faithful or normalized into clean ranges?
- What is the Delivery Score framework?
- Which source records are authoritative for each metric?
- Which score drops should create signals by default?
- Which signal dismissals require a reason?
- Should score snapshots store both category score scale and normalized 0-100 value?
