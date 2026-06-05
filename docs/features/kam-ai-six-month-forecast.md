# KAM AI Six-Month Forecast

## Summary

This feature defines the source-backed six-month forecast chart used by KAM AI and the dashboard. The chart must be calculated from account commercial evidence and deterministic business rules, not from generic AI assumptions or frontend-only prototype math.

The same backend forecast result must power:

- KAM AI "Forecast next 6 months" responses.
- Dashboard `forecast_chart` widgets.
- Any future report/export that displays the same forecast.

## Scope

- In scope:
  - Define the authoritative data sources for six-month revenue forecast.
  - Define the exact calculation model, month-bucket logic, confidence rules, missing-data behavior, and chart payload.
  - Replace separate chatbot/dashboard formulas with one shared backend forecast service in implementation.
  - Preserve source citations and explain the calculation in user-facing business language.
- Out of scope for this pre-implementation spec:
  - Implementing code changes.
  - Adding new database columns unless implementation confirms they are required.
  - Using an LLM to invent revenue values.

## Requirement Links

- Source requirement: `C:\Users\TK-LPT-1026\Downloads\forcast.pdf`
- Current KAM AI prototype: `frontend/src/components/ai/KAMAIPanel.tsx`
- Current backend AI forecast endpoint: `backend/app/services/ai_assistance.py`
- Current dashboard forecast widget: `backend/app/services/dashboards.py`
- Current dashboard forecast feature note: `docs/features/role-based-dashboards.md`

## Current Implementation Gap

The current app has three different forecast paths:

- KAM AI panel builds a frontend-only prototype forecast from local account ARR, open pipeline, and health.
- Backend `/api/ai/forecast` builds another deterministic forecast from `accounts.commercial_value`, open opportunity pipeline conversion, and health trend.
- Dashboard `forecast_chart` uses only stage-weighted opportunity totals.

These paths can disagree. Implementation must move forecast calculation into one backend service and make both chatbot and dashboard consume that same service result.

## User Flow

When a user clicks `Forecast next 6 months` in KAM AI:

1. Frontend sends a backend forecast request for the current scope:
   - Specific `account_id` when the chatbot is opened inside an account context.
   - Assigned-book scope when no account is selected.
2. Backend resolves accounts the current user is allowed to view.
3. Backend gathers source records for those accounts.
4. Backend calculates forecast points, chart breakdown, confidence, missing data, and citations.
5. KAM AI displays a forecast answer card with:
   - Short written summary.
   - Primary six-month revenue forecast chart.
   - Optional supporting waterfall chart when component data is available.
   - Forecast basis bullets.
   - Confidence level.
   - Missing data / forecast gaps.
   - Source references.

When the dashboard renders `forecast_chart`, it must request or internally call the same backend forecast service for its dashboard scope. It must display the same values after role-based redaction is applied.

## Data Sources

Forecast source priority:

1. Current active SOW / contracted revenue.
2. Historical spend from last 3 SOWs or last 24 months.
3. Open opportunities and probabilities.
4. Client growth signals from approved KYC or account research.
5. Risk factors from scores, signals, escalations, CSAT, renewals, and contract health.

Implementation source mapping:

| Forecast input | Primary tables/models | Fields |
| --- | --- | --- |
| Authorized scope | `accounts`, `account_owners`, account access service | account ids current user can view |
| Current active SOW / contracted revenue | `engagements` | `value`, `currency`, `status`, `delivery_status`, `commercial_status`, `start_date`, `end_date`, `renewal_date`, `notice_deadline`, `archived_at` |
| Account-level contracted fallback | `accounts` | `commercial_value`, `currency`, `lifecycle_status`, `risk_status` |
| Historical spend fallback | `engagements` | last completed/active SOW values and contract date ranges |
| Open opportunity upside | `opportunities`, `opportunity_stage_definitions` | `value`, `currency`, `stage`, `target_date`, `archived_at` |
| Stage probability fallback | shared stage probability map | Identified 20%, Qualified 35%, Proposal Sent 50%, Negotiation 70%, Won 100%, Lost 0%, Unstaged 25% |
| Growth signals | `kyc_snapshots`, `signals`, `account_plans`, account research fields | approved KYC fields/research, positive growth signal titles/details/reason codes, `growth_focus` |
| Risk/contraction | `engagements`, `engagement_renewal_profiles`, `score_snapshots`, `signals`, `escalations`, `csat_scores`, `accounts` | renewal risk, notice window, RAG score, open risks, critical escalations, CSAT freshness/score, `risk_status` |
| Citations | all contributing records | record type, id, label, route where available |

If engagement-level SOW data exists, it is the strongest contracted revenue source. If it does not exist but `accounts.commercial_value` is populated, the system can use `accounts.commercial_value` as an account-level contracted value fallback and must add a missing-data note that engagement/SOW detail is missing.

## Calculation Logic

The normalized six-month formula is:

```text
6-month forecast =
  expected revenue from active SOWs / contracted baseline
  + weighted open opportunities
  + growth adjustment
  - renewal / contraction risk adjustment
```

Historical spend is a fallback baseline, not an extra additive layer when current contracted revenue exists. This resolves the conflict between the simple additive formula and the source-priority rule in the source PDF.

### Forecast Window

- Default window is 6 months.
- `months` remains configurable up to 12 through `AiForecastRequest.months`.
- Month 1 starts at the first day of the next calendar month.
- Each point represents expected revenue for that month, not cumulative ARR.
- The sum of all month points equals the displayed projected forecast total.

### Baseline Revenue

For each scoped account:

1. Find active engagement/SOW records:
   - `archived_at is null`
   - `status == "active"`
   - `value > 0`
   - not expired before the forecast window
2. For each active engagement:
   - If `start_date` and `end_date` are known, allocate revenue by overlap days:

```text
daily_contract_value = engagement.value / contract_duration_days
month_baseline = daily_contract_value * days_overlapping_forecast_month
```

   - If `end_date` is missing, spread `engagement.value` evenly across the forecast window and add a missing-data note.
3. If no active engagement/SOW value exists, use `accounts.commercial_value` as account-level contracted fallback when present.
   - Spread it evenly across the forecast window.
   - Add a missing-data note that engagement-level SOW dates/details are missing.
4. If neither active contracted revenue nor account commercial value exists, use historical spend fallback.

Historical fallback:

- Prefer average monthly spend from the last 24 months when at least 12 months of usable contract coverage exists.
- Otherwise use average value of the last 3 completed or active SOWs, spread over the forecast window.
- If both current and historical revenue are missing, do not generate a reliable revenue chart.

### Weighted Opportunity Pipeline

Only include opportunities that are:

- `archived_at is null`
- stage is not `Won` or `Lost`
- `value > 0`
- `target_date` falls inside the forecast window

Weighted opportunity value:

```text
weighted_opportunity_value = opportunity.value * opportunity_probability
```

Probability source:

1. Use an explicit opportunity probability if implementation adds one later.
2. Otherwise use the stage probability map:
   - Identified: 0.20
   - Qualified: 0.35
   - Proposal Sent / Proposal: 0.50
   - Negotiation: 0.70
   - Won: 1.00, but terminal won opportunities should not be counted as open opportunity upside.
   - Lost: 0.00
   - Unknown/unstaged: 0.25

When a default stage probability is used, add a missing-data note:

```text
No opportunity probability was entered, so default stage probability was used.
```

Monthly allocation:

- Bucket each opportunity by `target_date`.
- Spread the weighted value evenly from the target month through the end of the forecast window.
- This produces a revenue trend rather than a one-month spike.

Example:

```text
Forecast window: Month 1 through Month 6
Opportunity target date: Month 3
Weighted value: 60,000
Allocation: 15,000 each in Months 3, 4, 5, and 6
```

### Growth Adjustment

Growth indicators should increase upside/confidence only when opportunity or planned expansion exists. They must not create revenue by themselves.

Growth multiplier tiers:

| Growth evidence | Multiplier |
| --- | ---: |
| No growth signal | 1.00 |
| Moderate growth signal | 1.10 |
| Strong growth signal | 1.25 |
| Very strong growth signal | 1.50 |

Growth evidence examples:

- Client received funding.
- Client revenue increased.
- Client opened a new region.
- Client increased hiring.
- Client launched a new product.
- Client leadership shared expansion roadmap.
- Client budget increased.

Growth adjustment is the incremental uplift over weighted opportunity value:

```text
adjusted_opportunity_upside = weighted_opportunity_pipeline * growth_multiplier
growth_adjustment = adjusted_opportunity_upside - weighted_opportunity_pipeline
```

If weighted opportunity pipeline is `0`, growth adjustment is `0` even when growth signals exist. In that case, show the growth signal in assumptions/confidence, not as revenue.

V1 signal classification:

- Very strong: three or more current growth signals, or funding/revenue growth plus an attached open opportunity.
- Strong: two current growth signals, or one funding/revenue/budget signal.
- Moderate: one current non-financial growth signal.
- None: no current growth signal.

Current means the signal or source evidence is not stale according to its source freshness status, or was created/approved within the last 180 days when freshness is not available.

### Risk / Contraction Adjustment

Risk adjustment reduces baseline revenue, not opportunity upside.

Risk inputs:

- Contract ending soon.
- Notice period approaching.
- Low relationship/account score.
- Poor CSAT.
- Open critical escalation.
- Competitor present.
- Payment delays.
- Client budget constraint.
- Low roadmap alignment.
- Resource instability.
- High renewal risk.
- Stale risk data.

Risk severity should be determined from the strongest current risk signal:

| Risk severity | Deduction rate |
| --- | ---: |
| Low | 0.00 |
| Medium | 0.075 |
| High | 0.20 |
| Critical | 0.30 |

Severity mapping:

- Critical when account risk is critical, an open critical escalation exists, score RAG is red/critical, or renewal/notice risk is critical within 30 days.
- High when renewal risk is high, delivery health is below 60, latest CSAT normalized score is below 60, or a high-severity signal exists for competitor, payment, budget, roadmap, resource, or contract risk.
- Medium when account risk is warning, CSAT is 60-74, renewal/notice date is within 90 days, or a warning signal exists.
- Low when none of the above is present and risk data is fresh enough.

Risk adjustment:

```text
risk_adjustment_total = baseline_revenue_total * risk_deduction_rate
risk_adjustment_month = baseline_revenue_month * risk_deduction_rate
```

If risk data is stale, keep the computed rate if evidence exists but lower confidence and add a missing-data note.

### Monthly Forecast Point

For each month:

```text
month_forecast =
  baseline_revenue_month
  + weighted_opportunity_month
  + growth_adjustment_month
  - risk_adjustment_month
```

Clamp negative monthly results to `0`.

Each point must include enough component values for chart tooltips and explanation:

```text
{
  month,
  baseline_revenue,
  weighted_opportunity,
  growth_adjustment,
  risk_adjustment,
  forecast_revenue
}
```

### Forecast Total And Trend Label

```text
forecast_total = sum(forecast_revenue for all months)
baseline_total = sum(baseline_revenue for all months)
delta = forecast_total - baseline_total
delta_percent = delta / baseline_total when baseline_total > 0
```

Trend label:

- `Positive / Growth Expected` when `delta_percent > 0.05`.
- `Stable / Flat` when `-0.05 <= delta_percent <= 0.05`.
- `Declining / Risk of Contraction` when `delta_percent < -0.05`.
- `Low Confidence / Insufficient Data` when no reliable baseline exists.

## Confidence Logic

Supported levels:

- High
- Medium
- Low
- Not Available

High confidence:

- Current active SOW/contracted baseline exists.
- Historical spend exists.
- Opportunities have values and usable probabilities.
- Growth/risk signals are available and fresh.

Medium confidence:

- Current active SOW/contracted baseline exists.
- Some opportunity or risk data exists.
- Some optional data is missing, or default stage probabilities are used.

Low confidence:

- Historical or current revenue data is incomplete.
- Opportunities or growth data are missing.
- Risk data is stale.
- Account-level commercial fallback is used because engagement-level SOW details are missing.

Not Available:

- No current SOW/contracted value.
- No historical spend.
- No opportunity value.

When confidence is `Not Available`, KAM AI must not render a reliable revenue chart. It can render a qualitative forecast if enough opportunity/risk context exists.

## Missing Data Rules

Always show missing data / forecast gaps. Examples:

- Renewal status is not confirmed.
- Client budget for next 6 months is unknown.
- No opportunity probability is entered, so default stage probability was used.
- Engagement/SOW end date is missing, so contracted value was spread evenly across the forecast window.
- Current SOW value and historical spend are missing.
- Risk data is stale.

If too much data is missing, KAM AI should say:

```text
I cannot generate a reliable 6-month revenue forecast because current SOW value and historical spend are missing.
```

## Chart Generation Logic

### Primary Chart

Primary chart:

- Title: `6-Month Revenue Forecast`
- Chart type: line chart by default; bar chart is acceptable for compact dashboard panels.
- X-axis: Month 1 through Month 6 labels.
- Y-axis: projected revenue for each month.
- Series:
  - `forecast_revenue` is required.
  - Component values are available in tooltips.

This chart helps the user see whether the account or portfolio is expected to grow, stay flat, or decline.

### Supporting Chart

Default supporting chart is a waterfall breakdown when component data exists:

```text
Baseline contracted revenue
+ Weighted opportunity upside
+ Growth adjustment
- Risk deduction
= Projected forecast
```

Only render the waterfall when at least baseline and one adjustment component are available. Otherwise show one chart and list missing data.

Optional fallback supporting charts:

- Forecast vs historical spend bar chart, when historical spend data is strong.
- Health/risk trend line chart, only when the user asks for risk outlook in addition to commercial forecast.

## API And Shared Service Plan

Create a shared backend forecast service, for example:

```text
backend/app/services/forecasting.py
```

Responsibilities:

- Resolve scoped source data.
- Calculate forecast components.
- Produce the chart-ready response.
- Produce citations, assumptions, missing-data notes, and confidence.
- Avoid logging an AI run unless the caller is KAM AI.

Consumers:

- `AiAssistanceService.forecast()` delegates to the shared service and logs an AI Gateway run.
- `DashboardsService._forecast_widget()` delegates to the shared service and applies dashboard role redaction.
- Frontend KAM AI panel calls the backend endpoint instead of `buildAssignedBookForecastResult`.
- Dashboard frontend displays the backend widget value instead of local/static chart bars.

Suggested response shape:

```text
{
  title,
  scope,
  months,
  forecast_type: "Directional",
  confidence,
  trend_label,
  summary,
  totals: {
    baseline_revenue,
    weighted_opportunity,
    growth_adjustment,
    risk_adjustment,
    forecast_revenue,
    delta,
    delta_percent
  },
  points: [
    {
      month,
      baseline_revenue,
      weighted_opportunity,
      growth_adjustment,
      risk_adjustment,
      forecast_revenue
    }
  ],
  waterfall: [
    { label: "Baseline contracted revenue", value },
    { label: "Weighted opportunity upside", value },
    { label: "Growth adjustment", value },
    { label: "Risk deduction", value: -value },
    { label: "Projected forecast", value }
  ],
  basis: [],
  assumptions: [],
  missing_data: [],
  recommended_actions: [],
  citations: []
}
```

Dashboard redaction:

- If the role cannot view commercial forecast values, replace numeric values with `Restricted`.
- Preserve non-sensitive metadata such as trend label, confidence, missing-data count, and source count only when it does not disclose restricted commercial values.

## API Documentation

Update Swagger for `/api/ai/forecast`:

- Summary: `Generate source-backed six-month commercial forecast`
- Description must state the forecast is deterministic, advisory, source-backed, and shared with dashboard forecast widgets.
- Response description must mention monthly points, waterfall breakdown, confidence, assumptions, missing data, and citations.
- Error responses:
  - `401`: missing/invalid token.
  - `403`: no AI or account access.
  - `422`: invalid `months` or inaccessible/invalid account input.

If a dashboard-specific endpoint is added later, document that it returns the same forecast schema with role-based redaction.

## Database Plan

No mandatory table changes for the first implementation if stage probabilities remain hard-coded/configured. Potential future changes:

- Add `probability` to `opportunities`, or add `default_probability` to `opportunity_stage_definitions`.
- Add explicit revenue cadence/duration fields if SOW values need clearer monthly allocation.
- Add normalized growth-signal taxonomy if KYC/account research fields are too free-form.

All new columns must be snake_case.

## Frontend Plan

- `frontend/src/components/ai/KAMAIPanel.tsx`
  - Remove frontend-only forecast builders for real forecast responses.
  - Keep chart rendering, but bind it to backend forecast response.
  - Show the forecast card sections defined above.
  - Show missing-data notes and citations.
- `frontend/src/services/aiAssistance.ts`
  - Add/use `forecast()` API call if not already present.
- Dashboard forecast component
  - Render the same `points` and `waterfall` structure.
  - Respect restricted values.

Do not use HTML `required` for any new controls.

## Tests

Backend tests:

- Account forecast with active SOW only.
- Historical fallback when no active SOW exists.
- Open opportunities weighted by stage probability.
- Explicit/default probability missing-data note.
- Growth signal multiplier changes only opportunity upside, not standalone revenue.
- Risk deduction from renewal risk, poor CSAT, open escalation, critical account risk.
- No reliable chart when current/historical/opportunity values are missing.
- Portfolio forecast only includes authorized accounts.
- Dashboard and `/api/ai/forecast` return the same unmasked values for the same scope.
- Restricted dashboard roles receive masked commercial values.
- AI forecast writes AI Gateway run; dashboard forecast does not create a chatbot run.

Frontend tests:

- KAM AI "Forecast next 6 months" calls backend forecast endpoint.
- Forecast card renders summary, chart, confidence, missing data, citations.
- Dashboard forecast renders the same chart structure.
- Restricted dashboard values render as `Restricted`.

## Linting And Quality

Run before handoff after implementation:

```text
make test
npm run build
```

If Docker remains unavailable, run the equivalent local backend pytest subset and frontend tests, and document the reason.

## Implementation Status

Status date: 2026-06-05

Completed items:

- Added shared backend forecast data access in `backend/app/repositories/forecasting.py`.
- Added shared deterministic forecast calculation in `backend/app/services/forecasting.py`.
- Expanded `AiForecastResponse` in `backend/app/schemas.py` with monthly component points, totals, waterfall, confidence, trend, assumptions, missing data, recommended actions, and citations.
- Updated `/api/ai/forecast` Swagger metadata in `backend/app/routers/ai.py`.
- Updated `AiAssistanceService.forecast()` to delegate to `ForecastingService` while preserving AI Gateway run logging and audit logging.
- Updated `DashboardsService._forecast_widget()` to delegate to `ForecastingService`, emit the same chart payload, and apply commercial-value redaction for masked roles.
- Updated KAM AI frontend service and panel to call `/api/ai/forecast`, render the shared chart payload, show loading/error/no-data states, display missing-data notes, and include forecast citations as source cards.
- Fixed the KAM AI quick prompt no-op when the local assigned-account store is empty but the user is authenticated; the prompt now calls the backend forecast endpoint and renders the shared no-data/error/forecast response.
- Updated dashboard forecast UI to render shared monthly points and keep a legacy stage-series fallback.
- Added backend service and route/dashboard tests for calculation branches, validation, authorization, redaction, and no-data behavior.
- Added frontend service/dashboard/KAM AI panel tests for forecast API mapping, redacted dashboard render, loading state, empty state, error state, and authenticated quick-prompt execution with no locally loaded accounts.
- Strengthened frontend graph coverage so KAM AI and dashboard tests assert six monthly forecast points render as accessible forecast charts.
- Added the forecast chart to AM Home and KAM Head Portfolio login dashboards so account owners and portfolio owners see the next-six-month outlook without opening KAM AI first.
- Moved the dashboard forecast chart near the top of the dashboard, directly after summary metrics, so users can quickly assess whether the book or portfolio is trending positively.
- Added opt-in forecast demo data commands so local/testing environments can show a populated forecast graph without putting fake values in production forecast logic or automatic startup seed data.
- Moved the dashboard forecast panel beside the opportunities/pipeline panel and reduced its chart and metric density so it fits the first dashboard screen more comfortably.
- Updated dashboard no-data behavior so an unavailable forecast renders a compact `Forecast outlook` heading, next-six-month context, an insufficient-data pill, and only the `Forecast notes` warning with `No authorized accounts are available in the forecast scope.`, without chart chrome, totals, or summary copy.

Remaining items:

- Browser visual QA could not be completed because the in-app browser backend list was empty in this session. Automated frontend tests, typecheck, and production build passed.
- Docker checks could not be run on 2026-06-05 because Docker Desktop's Linux engine pipe was unavailable; equivalent local frontend checks passed.
- Browser visual QA for the dashboard placement could not be completed on 2026-06-05 because the in-app Browser backend `iab` was unavailable. Live API verification and automated tests passed.
- Future explicit opportunity probability fields are still not implemented because no database field exists yet; stage probability remains the implemented source of truth.

Technical notes:

- No database migration was required. The implementation uses existing `accounts`, `engagements`, `opportunities`, `kyc_snapshots`, `signals`, `escalations`, `csat_scores`, `score_snapshots`, and `engagement_renewal_profiles`.
- Forecast points are monthly expected revenue for the next calendar-month window, not cumulative ARR.
- Dashboard commercial redaction masks numeric forecast fields, waterfall values, series display values, and the commercial summary text while preserving non-sensitive counts, trend, confidence, and notes.
- Field Builder does not impact this feature. No custom field definitions, dynamic field schemas, or field-builder-driven module changes were added or required.
- Forecast demo data is namespaced under `forecast-demo-account`, is idempotent, and is only created by running `python -m app.cli seed-forecast-demo`.
- Forecast demo data can be removed with `python -m app.cli clear-forecast-demo`.

## Requirements Coverage Report

| Requirement | Status | Evidence |
| --- | --- | --- |
| Shared backend forecast logic for chatbot and dashboard | Complete | `backend/app/services/forecasting.py`, `backend/app/services/ai_assistance.py`, `backend/app/services/dashboards.py` |
| Source data comes from active SOWs, historical engagements, opportunities, KYC/signals, risk records, scores, escalations, CSAT, renewals | Complete | `backend/app/repositories/forecasting.py`, `backend/app/services/forecasting.py` |
| Active SOW baseline with overlap-day allocation and missing end-date fallback | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py` |
| Account commercial value and historical spend fallback | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py` |
| Stage-weighted opportunity pipeline and default probability note | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py` |
| Growth adjustment applies only to weighted opportunity upside | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py` |
| Risk deduction applies only to baseline revenue | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py` |
| No reliable chart / no-data behavior | Complete | `backend/app/services/forecasting.py`, `backend/tests/test_forecasting_service.py`, `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/components/dashboard/RoleDashboard.tsx` |
| Response includes chart points, totals, waterfall, confidence, assumptions, missing data, recommended actions, and citations | Complete | `backend/app/schemas.py`, `backend/app/services/forecasting.py` |
| KAM AI "Forecast next 6 months" uses backend forecast endpoint | Complete | `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/components/ai/KAMAIPanel.test.tsx`, `frontend/src/services/aiAssistance.ts`, `frontend/src/services/aiAssistance.test.ts` |
| Dashboard forecast displays same logic with RBAC redaction | Complete | `backend/app/services/dashboards.py`, `frontend/src/components/dashboard/RoleDashboard.tsx`, `backend/tests/test_notifications_dashboards_reporting.py`, `frontend/src/pages/Dashboard.test.tsx` |
| AM and KAM Head login dashboards show the six-month graph | Complete | `backend/app/services/dashboards.py`, `frontend/src/components/dashboard/RoleDashboard.tsx`, `backend/tests/test_notifications_dashboards_reporting.py` |
| Forecast sits beside opportunities and uses warning-only no-data copy | Complete | `frontend/src/components/dashboard/RoleDashboard.tsx`, `frontend/src/pages/Dashboard.test.tsx` |
| Opt-in dummy forecast data for local graph QA | Complete | `backend/app/services/seed.py`, `backend/app/cli.py`, `backend/tests/test_forecast_demo_seed.py` |
| Validation for forecast months | Complete | `backend/app/schemas.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py` |
| Authorization and Role Based Access | Complete | `backend/app/services/ai_assistance.py`, `backend/app/services/dashboards.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py`, `backend/tests/test_notifications_dashboards_reporting.py` |
| Search/filter/sort/pagination where required | Complete / N/A | Forecast chart is a fixed month series. Dashboard scope still uses existing dashboard search/filter and paginated widgets in `backend/app/services/dashboards.py`. |
| Loading, empty, and error states | Complete | `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/components/dashboard/RoleDashboard.tsx`, `frontend/src/pages/Dashboard.test.tsx` |
| Responsive UI behavior | Complete | Responsive chart containers and grids in `frontend/src/components/ai/KAMAIPanel.tsx`, `frontend/src/components/dashboard/RoleDashboard.tsx`; `npm run build` passed |
| Logging | Complete | `backend/app/services/forecasting.py`, `backend/app/services/ai_assistance.py` |
| Automated tests | Complete | `backend/tests/test_forecasting_service.py`, `backend/tests/test_scoring_signals_playbooks_tasks.py`, `backend/tests/test_notifications_dashboards_reporting.py`, `frontend/src/services/aiAssistance.test.ts`, `frontend/src/pages/Dashboard.test.tsx` |
| Swagger/OpenAPI docs for API change | Complete | `backend/app/routers/ai.py`, `backend/app/schemas.py` |
| Database migrations if needed | Complete | No schema change required; no migration added |

## Self Review Findings

Missing requirements:

- None remaining in the implemented scope.

Field Builder impact:

- No impact. The feature reads existing domain models and does not add or alter field-builder modules, custom fields, or dynamic validation behavior.

Missing tests:

- No missing tests identified for the implemented scope after adding focused forecast service tests and frontend forecast service/dashboard tests.

Potential bugs reviewed and addressed:

- Previous KAM AI source drawer did not include backend forecast citations. Fixed by mapping forecast citations into KAM AI source cards in `frontend/src/components/ai/KAMAIPanel.tsx`.
- The KAM AI forecast quick prompt previously returned before calling the backend when `assignedAccounts.length` was `0`, producing no visible action in the panel. Fixed by allowing authenticated forecast requests without locally loaded accounts and covered by `frontend/src/components/ai/KAMAIPanel.test.tsx`.
- Dashboard leadership masking could have leaked numeric values in nested forecast fields. Fixed by recursive commercial-field masking and redacted summary text in `backend/app/services/dashboards.py`.

Security concerns:

- Account-specific KAM AI forecasts are still gated by existing account access checks.
- Dashboard forecast remains gated by `analytics_portfolio` widget filtering and commercial values are masked for restricted dashboard roles.
- Forecast responses are advisory and retain the existing AI disclaimer.

Edge cases handled:

- Empty authorized scope.
- No active SOW, account commercial fallback, historical fallback, and complete no-data behavior.
- Missing engagement end date.
- Unknown opportunity stage default probability.
- Target-month opportunity spreading.
- Growth signals without opportunity value.
- Critical escalation, poor CSAT, delivery health, renewal dates, and account risk affecting baseline risk deduction.

Verification log:

- `backend\.venv\Scripts\python.exe -m pytest tests/test_forecasting_service.py tests/test_scoring_signals_playbooks_tasks.py::test_expanded_signal_triggers_and_server_backed_ai_assistance tests/test_notifications_dashboards_reporting.py::test_role_based_dashboard_profiles_and_reduced_direct_endpoints -q` - passed, 4 tests.
- `npm run typecheck` - passed.
- `npm test -- Dashboard.test.tsx aiAssistance.test.ts` - passed, 5 tests.
- `npm test -- KAMAIPanel.test.tsx Dashboard.test.tsx aiAssistance.test.ts` - passed, 6 tests.
- `npm run build` - passed with existing Vite large chunk warning.
- Live backend check against `http://127.0.0.1:8002/api/ai/forecast` returned the new shared payload shape with six monthly points.
- `docker compose run --rm --no-deps frontend npm test -- KAMAIPanel.test.tsx Dashboard.test.tsx aiAssistance.test.ts` - skipped because Docker Desktop's Linux engine was not reachable.
- `npm test -- KAMAIPanel.test.tsx Dashboard.test.tsx aiAssistance.test.ts` - passed, 7 tests.
- `npm run typecheck` - passed.
- `backend\.venv\Scripts\python.exe -m pytest tests/test_notifications_dashboards_reporting.py::test_role_based_dashboard_profiles_and_reduced_direct_endpoints tests/test_notifications_dashboards_reporting.py::test_dashboard_digest_and_report_workflows -q` - passed, 2 tests.
- `npm test -- Dashboard.test.tsx` - passed, 5 tests.
- `npm run typecheck` - passed.
- Live backend check against `http://127.0.0.1:8002/api/dashboards/me` as `account.manager.user@tkxel.com` returned `forecast_chart` on `am_home` with 6 monthly points and unmasked dashboard metadata.
- `backend\.venv\Scripts\python.exe -m pytest tests/test_forecast_demo_seed.py tests/test_notifications_dashboards_reporting.py::test_role_based_dashboard_profiles_and_reduced_direct_endpoints -q` - passed, 2 tests.
- `backend\.venv\Scripts\python.exe -m app.cli seed-forecast-demo` - seeded local forecast demo data for `account.manager.user@tkxel.com`.
- Live backend check against `http://127.0.0.1:8002/api/dashboards/me` as `account.manager.user@tkxel.com` returned a positive, high-confidence six-month `forecast_chart` from Jul 2026 through Dec 2026.
- `npm test -- Dashboard.test.tsx` - passed, 6 tests.
- `npm run typecheck` - passed.
- `Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:5173 -TimeoutSec 5` - returned HTTP 200.
- Browser visual QA for the compact side-by-side dashboard placement could not be completed because the in-app Browser backend `iab` was unavailable, and the frontend package does not have `@playwright/test` installed as a local fallback.

## Open Questions

- Should opportunity probability become a first-class field, or should default stage probability remain the source of truth?
- Should account-level `commercial_value` be treated as current contracted revenue or only as a fallback when engagement-level SOWs are missing?
- Should opportunity values represent total expected contract value, ARR, or revenue over the forecast window? The monthly allocation rule above assumes forecast-window impact unless richer duration data is added.

## Handoff Notes

- Implementation is complete for the scoped first version.
- The forecast is deterministic and source-backed.
- The dashboard and chatbot now delegate to the same backend forecast service.
