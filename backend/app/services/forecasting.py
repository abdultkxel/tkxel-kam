import logging
from calendar import month_abbr
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Account, CsatScore, Engagement, EngagementRenewalProfile, Escalation, KycSnapshot, Opportunity, ScoreSnapshot, Signal
from app.repositories.forecasting import ForecastRepository
from app.schemas import AiForecastPointRead, AiForecastResponse, AiForecastTotalsRead, AiForecastWaterfallItemRead

logger = logging.getLogger(__name__)

STAGE_PROBABILITIES = {
    "identified": 0.20,
    "qualified": 0.35,
    "proposal sent": 0.50,
    "proposal_sent": 0.50,
    "proposal": 0.50,
    "negotiation": 0.70,
}
GROWTH_MULTIPLIERS = {
    "none": 1.00,
    "moderate": 1.10,
    "strong": 1.25,
    "very_strong": 1.50,
}
RISK_RATES = {
    "low": 0.00,
    "medium": 0.075,
    "high": 0.20,
    "critical": 0.30,
}
RISK_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
GROWTH_TERMS = (
    "growth",
    "expansion",
    "upsell",
    "cross sell",
    "cross-sell",
    "new service",
    "new market",
    "launch",
    "hiring",
)
FINANCIAL_GROWTH_TERMS = ("funding", "budget", "revenue", "capex", "investment", "approved spend")
RISK_TERMS = (
    "competitor",
    "payment",
    "budget",
    "roadmap",
    "resource",
    "contract",
    "renewal",
    "contraction",
    "churn",
)


@dataclass(frozen=True)
class ForecastMonth:
    label: str
    start: datetime
    end: datetime


class ForecastingService:
    def __init__(self, db: Session) -> None:
        self.repository = ForecastRepository(db)

    def generate(self, accounts: list[Account], *, months: int = 6, now: datetime | None = None) -> AiForecastResponse:
        months = max(1, min(months, 12))
        calculated_at = self._aware(now or datetime.now(timezone.utc))
        buckets = self._month_buckets(calculated_at, months)
        account_ids = [account.id for account in accounts]
        if not account_ids:
            return self._empty_response(months=months, buckets=buckets, reason="No authorized accounts are available in the forecast scope.")

        window_start = buckets[0].start
        window_end = buckets[-1].end
        active_engagements = self.repository.list_active_engagements(account_ids)
        historical_engagements = self.repository.list_historical_engagements(account_ids)
        opportunities = self.repository.list_window_opportunities(account_ids, window_start=window_start, window_end=window_end)
        scores = self.repository.latest_scores(account_ids)
        kyc_snapshots = self.repository.latest_kyc_snapshots(account_ids)
        signals = self.repository.list_active_signals(account_ids)
        escalations = self.repository.list_open_escalations(account_ids)
        renewal_profiles = self.repository.list_renewal_profiles(account_ids)
        csat_scores = self.repository.latest_csat_scores(account_ids)

        engagements_by_account = self._group_by_account(active_engagements)
        historical_by_account = self._group_by_account(historical_engagements)
        signals_by_account = self._group_by_account(signals)
        escalations_by_account = self._group_by_account(escalations)
        renewals_by_account = self._group_by_account(renewal_profiles)

        missing_data: list[str] = []
        assumptions = [
            "Month 1 starts on the first day of the next calendar month.",
            "Monthly points are expected monthly revenue, not cumulative ARR.",
            "Historical spend is only used when no active contracted baseline is available.",
        ]
        basis = [
            "Active SOWs/engagements provide the contracted baseline.",
            "Open opportunities are stage-weighted and spread from target month through the forecast window.",
            "Growth is an incremental adjustment on weighted opportunities only.",
            "Renewal and contraction risk reduces baseline revenue only.",
        ]

        baseline_by_account: dict[str, list[float]] = {account.id: [0.0 for _ in buckets] for account in accounts}
        active_sow_count = 0
        contracted_baseline = 0.0
        for account in accounts:
            usable_engagements = [
                engagement
                for engagement in engagements_by_account.get(account.id, [])
                if self._engagement_overlaps_window(engagement, window_start, window_end)
            ]
            if usable_engagements:
                for engagement in usable_engagements:
                    active_sow_count += 1
                    contracted_baseline += self._money(engagement.value)
                    allocated = self._allocate_engagement(engagement, buckets)
                    for index, amount in enumerate(allocated):
                        baseline_by_account[account.id][index] += amount
                    if engagement.end_date is None:
                        self._append_unique(missing_data, f"{account.name}: active SOW {engagement.name} has no end date, so value is spread across the forecast window.")
                continue

            commercial_value = self._money(account.commercial_value)
            if commercial_value > 0:
                share = commercial_value / months
                baseline_by_account[account.id] = [share for _ in buckets]
                self._append_unique(missing_data, f"{account.name}: no active SOW baseline found; account commercial value is used as fallback.")
                continue

            fallback, note = self._historical_baseline(account, historical_by_account.get(account.id, []), buckets, calculated_at)
            baseline_by_account[account.id] = fallback
            if note:
                self._append_unique(missing_data, note)

        baseline_months = [sum(values[index] for values in baseline_by_account.values()) for index in range(months)]
        opportunity_months, pipeline_value, weighted_opportunity_total, stage_notes = self._opportunity_months(opportunities, buckets)
        for note in stage_notes:
            self._append_unique(missing_data, note)

        growth_level, growth_multiplier, growth_notes = self._growth_profile(signals, kyc_snapshots, opportunities, calculated_at)
        for note in growth_notes:
            self._append_unique(missing_data, note)
        growth_months = [amount * (growth_multiplier - 1) for amount in opportunity_months]

        risk_months = [0.0 for _ in buckets]
        at_risk_accounts = 0
        for account in accounts:
            severity = self._risk_severity(
                account,
                engagements_by_account.get(account.id, []),
                renewals_by_account.get(account.id, []),
                scores.get(account.id),
                signals_by_account.get(account.id, []),
                escalations_by_account.get(account.id, []),
                csat_scores.get(account.id),
                calculated_at,
            )
            if severity in {"high", "critical"} or account.risk_status in {"warning", "critical"}:
                at_risk_accounts += 1
            rate = RISK_RATES[severity]
            for index, baseline in enumerate(baseline_by_account[account.id]):
                risk_months[index] += baseline * rate

        avg_health = round(sum(account.health_overall for account in accounts) / len(accounts)) if accounts else 0
        points: list[AiForecastPointRead] = []
        for index, bucket in enumerate(buckets):
            forecast_revenue = max(0.0, baseline_months[index] + opportunity_months[index] + growth_months[index] - risk_months[index])
            points.append(
                AiForecastPointRead(
                    month=bucket.label,
                    baseline_revenue=self._round_money(baseline_months[index]),
                    weighted_opportunity=self._round_money(opportunity_months[index]),
                    growth_adjustment=self._round_money(growth_months[index]),
                    risk_adjustment=self._round_money(risk_months[index]),
                    forecast_revenue=self._round_money(forecast_revenue),
                    commercial_value=self._round_money(forecast_revenue),
                    health=avg_health,
                    open_opportunities=len(opportunities),
                )
            )

        totals = AiForecastTotalsRead(
            account_count=len(accounts),
            active_sow_count=active_sow_count,
            open_opportunities=len(opportunities),
            at_risk_accounts=at_risk_accounts,
            contracted_baseline=self._round_money(contracted_baseline),
            baseline_revenue=self._round_money(sum(baseline_months)),
            pipeline_value=self._round_money(pipeline_value),
            weighted_opportunity=self._round_money(weighted_opportunity_total),
            growth_adjustment=self._round_money(sum(growth_months)),
            risk_adjustment=self._round_money(sum(risk_months)),
            forecast_revenue=self._round_money(sum(point.forecast_revenue for point in points)),
        )
        confidence = self._confidence(totals, active_sow_count=active_sow_count, missing_data=missing_data, score_count=len(scores))
        trend_label = self._trend_label(points, totals)
        waterfall = [
            AiForecastWaterfallItemRead(label="Contracted baseline", value=totals.baseline_revenue, kind="baseline"),
            AiForecastWaterfallItemRead(label="Weighted opportunities", value=totals.weighted_opportunity, kind="opportunity"),
            AiForecastWaterfallItemRead(label="Growth adjustment", value=totals.growth_adjustment, kind="growth"),
            AiForecastWaterfallItemRead(label="Risk adjustment", value=-totals.risk_adjustment, kind="risk"),
            AiForecastWaterfallItemRead(label="Forecast revenue", value=totals.forecast_revenue, kind="forecast"),
        ]
        highlights = [
            f"Baseline: {self._format_money(totals.baseline_revenue)} across {totals.active_sow_count} active SOW(s).",
            f"Weighted opportunity contribution: {self._format_money(totals.weighted_opportunity)} from {totals.open_opportunities} open opportunity/opportunities.",
            f"Risk adjustment: -{self._format_money(totals.risk_adjustment)} across {totals.at_risk_accounts} at-risk account(s).",
        ]
        if growth_level != "none":
            highlights.append(f"Growth signal strength is {growth_level.replace('_', ' ')}; incremental growth adjustment is {self._format_money(totals.growth_adjustment)}.")

        citations = self._citations(accounts, active_engagements, opportunities, scores, signals, escalations, csat_scores, kyc_snapshots)
        summary = self._summary(totals, confidence, trend_label)
        recommended_actions = self._recommended_actions(totals, confidence, trend_label)
        logger.info(
            "Generated KAM forecast accounts=%s months=%s active_sows=%s opportunities=%s confidence=%s",
            len(accounts),
            months,
            active_sow_count,
            len(opportunities),
            confidence,
        )
        return AiForecastResponse(
            title="6-Month Revenue Forecast" if months == 6 else f"{months}-Month Revenue Forecast",
            summary=summary,
            points=points,
            months=months,
            scope="account" if len(accounts) == 1 else "portfolio",
            confidence=confidence,
            trend_label=trend_label,
            totals=totals,
            waterfall=waterfall,
            basis=basis,
            assumptions=assumptions,
            missing_data=missing_data[:12],
            recommended_actions=recommended_actions,
            highlights=highlights,
            citations=citations,
            disclaimer="AI-assisted output is advisory and based only on source records you are authorized to view.",
        )

    def _empty_response(self, *, months: int, buckets: list[ForecastMonth], reason: str) -> AiForecastResponse:
        points = [
            AiForecastPointRead(month=bucket.label, baseline_revenue=0, weighted_opportunity=0, growth_adjustment=0, risk_adjustment=0, forecast_revenue=0, commercial_value=0)
            for bucket in buckets
        ]
        totals = AiForecastTotalsRead()
        return AiForecastResponse(
            title="6-Month Revenue Forecast" if months == 6 else f"{months}-Month Revenue Forecast",
            summary="No reliable forecast can be produced because no authorized revenue source records are available.",
            points=points,
            months=months,
            scope="empty",
            confidence="not_available",
            trend_label="insufficient_data",
            totals=totals,
            waterfall=[
                AiForecastWaterfallItemRead(label="Contracted baseline", value=0, kind="baseline"),
                AiForecastWaterfallItemRead(label="Weighted opportunities", value=0, kind="opportunity"),
                AiForecastWaterfallItemRead(label="Growth adjustment", value=0, kind="growth"),
                AiForecastWaterfallItemRead(label="Risk adjustment", value=0, kind="risk"),
                AiForecastWaterfallItemRead(label="Forecast revenue", value=0, kind="forecast"),
            ],
            basis=["No authorized accounts were available for the requested forecast scope."],
            assumptions=[],
            missing_data=[reason],
            recommended_actions=["Confirm account assignment and source data access before using the forecast."],
            highlights=[reason],
            citations=[],
            disclaimer="AI-assisted output is advisory and based only on source records you are authorized to view.",
        )

    def _allocate_engagement(self, engagement: Engagement, buckets: list[ForecastMonth]) -> list[float]:
        value = self._money(engagement.value)
        if value <= 0:
            return [0.0 for _ in buckets]
        if engagement.end_date is None:
            share = value / len(buckets)
            return [share for _ in buckets]
        start_date = self._aware(engagement.start_date).date()
        end_date = self._aware(engagement.end_date).date()
        duration_days = max(1, (end_date - start_date).days + 1)
        daily_value = value / duration_days
        allocated: list[float] = []
        for bucket in buckets:
            overlap_start = max(start_date, bucket.start.date())
            overlap_end = min(end_date + timedelta(days=1), bucket.end.date())
            overlap_days = max(0, (overlap_end - overlap_start).days)
            allocated.append(daily_value * overlap_days)
        return allocated

    def _engagement_overlaps_window(self, engagement: Engagement, window_start: datetime, window_end: datetime) -> bool:
        start = self._aware(engagement.start_date)
        end = self._aware(engagement.end_date) if engagement.end_date else window_end
        return start < window_end and end >= window_start

    def _historical_baseline(self, account: Account, engagements: list[Engagement], buckets: list[ForecastMonth], now: datetime) -> tuple[list[float], str | None]:
        completed = [engagement for engagement in engagements if engagement.end_date and self._aware(engagement.end_date) < now]
        if not completed:
            return [0.0 for _ in buckets], f"{account.name}: no active SOW, commercial value, or historical SOW spend is available."
        two_years_ago = now - timedelta(days=730)
        recent = [engagement for engagement in completed if self._aware(engagement.end_date) >= two_years_ago]
        coverage = self._coverage_months(recent)
        if len(coverage) >= 12:
            monthly_average = sum(self._money(engagement.value) for engagement in recent) / len(coverage)
            return [monthly_average for _ in buckets], f"{account.name}: active baseline missing; 24-month historical monthly average is used."
        latest = sorted(completed, key=lambda item: self._aware(item.end_date), reverse=True)[:3]
        monthly_average = sum(self._money(engagement.value) for engagement in latest) / max(1, len(latest)) / len(buckets)
        return [monthly_average for _ in buckets], f"{account.name}: active baseline missing; average of last {len(latest)} completed SOW(s) is used."

    def _opportunity_months(self, opportunities: list[Opportunity], buckets: list[ForecastMonth]) -> tuple[list[float], float, float, list[str]]:
        monthly = [0.0 for _ in buckets]
        pipeline_value = 0.0
        weighted_total = 0.0
        notes: list[str] = []
        for opportunity in opportunities:
            value = self._money(opportunity.value)
            pipeline_value += value
            stage_key = self._stage_key(opportunity.stage)
            probability = STAGE_PROBABILITIES.get(stage_key)
            if probability is None:
                probability = 0.25
                self._append_unique(notes, f"{opportunity.name}: stage '{opportunity.stage}' has no configured probability; default 25% probability is used.")
            weighted = value * probability
            bucket_index = self._bucket_index(self._aware(opportunity.target_date), buckets)
            if bucket_index is None:
                continue
            share = weighted / max(1, len(buckets) - bucket_index)
            for index in range(bucket_index, len(buckets)):
                monthly[index] += share
            weighted_total += weighted
        return monthly, pipeline_value, weighted_total, notes

    def _growth_profile(
        self,
        signals: list[Signal],
        kyc_snapshots: dict[str, KycSnapshot],
        opportunities: list[Opportunity],
        now: datetime,
    ) -> tuple[str, float, list[str]]:
        if not opportunities:
            return "none", 1.0, ["Growth adjustment is not applied because there are no open opportunities in the forecast window."]
        cutoff = now - timedelta(days=180)
        growth_signal_count = 0
        has_financial_signal = False
        for signal in signals:
            if self._aware(signal.created_at) < cutoff and self._aware(signal.updated_at) < cutoff:
                continue
            text = self._searchable_text(signal.signal_type, signal.title, signal.detail, signal.reason_codes, signal.evidence_json)
            if self._contains_any(text, GROWTH_TERMS) or self._contains_any(text, FINANCIAL_GROWTH_TERMS):
                growth_signal_count += 1
            if self._contains_any(text, FINANCIAL_GROWTH_TERMS):
                has_financial_signal = True
        for snapshot in kyc_snapshots.values():
            if self._aware(snapshot.approved_at) < cutoff:
                continue
            text = self._searchable_text(snapshot.fields_json, snapshot.research_sources, snapshot.change_summary)
            if self._contains_any(text, GROWTH_TERMS) or self._contains_any(text, FINANCIAL_GROWTH_TERMS):
                growth_signal_count += 1
            if self._contains_any(text, FINANCIAL_GROWTH_TERMS):
                has_financial_signal = True

        if growth_signal_count >= 3 or has_financial_signal:
            return "very_strong" if has_financial_signal else "strong", GROWTH_MULTIPLIERS["very_strong" if has_financial_signal else "strong"], []
        if growth_signal_count >= 2:
            return "strong", GROWTH_MULTIPLIERS["strong"], []
        if growth_signal_count == 1:
            return "moderate", GROWTH_MULTIPLIERS["moderate"], []
        return "none", GROWTH_MULTIPLIERS["none"], ["No current growth signal was found; opportunity values are not uplifted."]

    def _risk_severity(
        self,
        account: Account,
        engagements: list[Engagement],
        renewal_profiles: list[EngagementRenewalProfile],
        score: ScoreSnapshot | None,
        signals: list[Signal],
        escalations: list[Escalation],
        csat: CsatScore | None,
        now: datetime,
    ) -> str:
        severity = "low"
        severity = self._max_risk(severity, "critical" if account.risk_status == "critical" else "medium" if account.risk_status == "warning" else "low")
        if score:
            rag = str(score.rag_status or "").lower()
            if rag in {"red", "critical"}:
                severity = self._max_risk(severity, "critical")
            elif rag == "amber":
                severity = self._max_risk(severity, "medium")
            if score.overall < 60:
                severity = self._max_risk(severity, "high")
        for escalation in escalations:
            escalation_severity = str(escalation.severity or "").lower()
            if escalation_severity == "critical":
                severity = self._max_risk(severity, "critical")
            elif escalation_severity == "high":
                severity = self._max_risk(severity, "high")
        for engagement in engagements:
            if engagement.delivery_health < 60:
                severity = self._max_risk(severity, "high")
            if str(engagement.renewal_risk).lower() == "high":
                severity = self._max_risk(severity, "high")
            elif str(engagement.renewal_risk).lower() == "medium":
                severity = self._max_risk(severity, "medium")
            if self._date_within(engagement.notice_deadline, now, 30) or self._date_within(engagement.renewal_date, now, 30):
                severity = self._max_risk(severity, "critical" if account.risk_status == "critical" else "medium")
            elif self._date_within(engagement.notice_deadline, now, 90) or self._date_within(engagement.renewal_date, now, 90):
                severity = self._max_risk(severity, "medium")
            if self._contains_any(self._searchable_text(engagement.risks, engagement.commercial_context, engagement.resource_dependency), RISK_TERMS):
                severity = self._max_risk(severity, "high")
        for profile in renewal_profiles:
            if str(profile.renewal_risk).lower() == "high":
                severity = self._max_risk(severity, "high")
            elif str(profile.renewal_risk).lower() == "medium":
                severity = self._max_risk(severity, "medium")
        if csat:
            if csat.normalized_score < 60:
                severity = self._max_risk(severity, "high")
            elif csat.normalized_score < 75:
                severity = self._max_risk(severity, "medium")
        for signal in signals:
            text = self._searchable_text(signal.signal_type, signal.title, signal.detail, signal.reason_codes, signal.evidence_json)
            if not self._contains_any(text, RISK_TERMS):
                continue
            if signal.severity == "critical":
                severity = self._max_risk(severity, "critical")
            elif signal.severity == "warning":
                severity = self._max_risk(severity, "medium")
        return severity

    def _confidence(self, totals: AiForecastTotalsRead, *, active_sow_count: int, missing_data: list[str], score_count: int) -> str:
        if totals.forecast_revenue <= 0:
            return "not_available"
        if active_sow_count > 0 and score_count > 0 and len(missing_data) <= 2:
            return "high"
        if active_sow_count > 0 or totals.baseline_revenue > 0:
            return "medium"
        return "low"

    def _trend_label(self, points: list[AiForecastPointRead], totals: AiForecastTotalsRead) -> str:
        if totals.forecast_revenue <= 0 or len(points) < 2:
            return "insufficient_data"
        first = points[0].forecast_revenue
        last = points[-1].forecast_revenue
        if first <= 0:
            return "positive" if last > 0 else "insufficient_data"
        change = (last - first) / first
        if change > 0.05:
            return "positive"
        if change < -0.05:
            return "declining"
        return "stable"

    def _summary(self, totals: AiForecastTotalsRead, confidence: str, trend_label: str) -> str:
        if confidence == "not_available":
            return "No reliable revenue forecast can be produced from the authorized records in scope."
        return (
            f"The shared six-month forecast projects {self._format_money(totals.forecast_revenue)} in expected monthly revenue across the window. "
            f"It combines {self._format_money(totals.baseline_revenue)} baseline revenue, "
            f"{self._format_money(totals.weighted_opportunity)} weighted opportunity contribution, "
            f"{self._format_money(totals.growth_adjustment)} growth adjustment, and "
            f"-{self._format_money(totals.risk_adjustment)} renewal/contraction risk adjustment. "
            f"Trend is {trend_label} with {confidence} confidence."
        )

    def _recommended_actions(self, totals: AiForecastTotalsRead, confidence: str, trend_label: str) -> list[str]:
        actions = []
        if confidence in {"low", "not_available"}:
            actions.append("Update active SOW dates and values before using the chart for planning.")
        if totals.open_opportunities:
            actions.append("Review opportunity target dates and stages because they directly control monthly weighting.")
        if totals.at_risk_accounts:
            actions.append("Review high-risk renewals and active escalations that reduce the contracted baseline.")
        if trend_label == "declining":
            actions.append("Prioritize retention actions before expansion assumptions.")
        return actions or ["Validate forecast assumptions during QBR and renewal planning."]

    def _citations(
        self,
        accounts: list[Account],
        engagements: list[Engagement],
        opportunities: list[Opportunity],
        scores: dict[str, ScoreSnapshot],
        signals: list[Signal],
        escalations: list[Escalation],
        csats: dict[str, CsatScore],
        kyc_snapshots: dict[str, KycSnapshot],
    ) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        citations.extend({"type": "account", "id": account.id, "label": account.name} for account in accounts[:20])
        citations.extend({"type": "engagement", "id": item.id, "label": item.name} for item in engagements[:20])
        citations.extend({"type": "opportunity", "id": item.id, "label": item.name} for item in opportunities[:20])
        citations.extend({"type": "score_snapshot", "id": item.id, "label": f"Score {item.overall}"} for item in list(scores.values())[:20])
        citations.extend({"type": "signal", "id": item.id, "label": item.title} for item in signals[:20])
        citations.extend({"type": "escalation", "id": item.id, "label": item.summary} for item in escalations[:20])
        citations.extend({"type": "csat_score", "id": item.id, "label": f"CSAT {item.normalized_score}"} for item in list(csats.values())[:20])
        citations.extend({"type": "kyc_snapshot", "id": item.id, "label": f"KYC v{item.version}"} for item in list(kyc_snapshots.values())[:20])
        deduped: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for citation in citations:
            key = (str(citation["type"]), str(citation["id"]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(citation)
        return deduped[:50]

    def _coverage_months(self, engagements: list[Engagement]) -> set[tuple[int, int]]:
        coverage: set[tuple[int, int]] = set()
        for engagement in engagements:
            if not engagement.end_date:
                continue
            start = self._aware(engagement.start_date).date()
            end = self._aware(engagement.end_date).date()
            cursor = date(start.year, start.month, 1)
            end_month = date(end.year, end.month, 1)
            while cursor <= end_month:
                coverage.add((cursor.year, cursor.month))
                cursor = self._add_months_date(cursor, 1)
        return coverage

    def _bucket_index(self, value: datetime, buckets: list[ForecastMonth]) -> int | None:
        for index, bucket in enumerate(buckets):
            if bucket.start <= value < bucket.end:
                return index
        return None

    def _month_buckets(self, now: datetime, months: int) -> list[ForecastMonth]:
        first = self._first_day_next_month(now)
        buckets: list[ForecastMonth] = []
        for offset in range(months):
            start = self._add_months(first, offset)
            end = self._add_months(first, offset + 1)
            buckets.append(ForecastMonth(label=f"{month_abbr[start.month]} {start.year}", start=start, end=end))
        return buckets

    def _first_day_next_month(self, value: datetime) -> datetime:
        month = value.month + 1
        year = value.year
        if month == 13:
            month = 1
            year += 1
        return datetime(year, month, 1, tzinfo=timezone.utc)

    def _add_months(self, value: datetime, months: int) -> datetime:
        month_index = value.month - 1 + months
        year = value.year + month_index // 12
        month = month_index % 12 + 1
        return datetime(year, month, 1, tzinfo=timezone.utc)

    def _add_months_date(self, value: date, months: int) -> date:
        month_index = value.month - 1 + months
        year = value.year + month_index // 12
        month = month_index % 12 + 1
        return date(year, month, 1)

    def _date_within(self, value: datetime | None, now: datetime, days: int) -> bool:
        if value is None:
            return False
        target = self._aware(value)
        return now <= target <= now + timedelta(days=days)

    def _group_by_account(self, items: list[Any]) -> dict[str, list[Any]]:
        grouped: dict[str, list[Any]] = {}
        for item in items:
            grouped.setdefault(item.account_id, []).append(item)
        return grouped

    def _max_risk(self, current: str, candidate: str) -> str:
        return candidate if RISK_RANK[candidate] > RISK_RANK[current] else current

    def _stage_key(self, stage: str | None) -> str:
        return str(stage or "").strip().lower().replace("_", " ")

    def _searchable_text(self, *values: Any) -> str:
        parts: list[str] = []
        for value in values:
            if value is None:
                continue
            if isinstance(value, dict):
                parts.append(self._searchable_text(*value.values()))
            elif isinstance(value, list):
                parts.append(self._searchable_text(*value))
            else:
                parts.append(str(value))
        return " ".join(parts).lower()

    def _contains_any(self, text: str, terms: tuple[str, ...]) -> bool:
        return any(term in text for term in terms)

    def _aware(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _money(self, value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    def _round_money(self, value: float) -> float:
        return round(float(value), 2)

    def _format_money(self, value: float) -> str:
        return f"${value:,.0f}"

    def _append_unique(self, values: list[str], item: str) -> None:
        if item not in values:
            values.append(item)
