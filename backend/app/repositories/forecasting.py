from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CsatScore, Engagement, EngagementRenewalProfile, Escalation, KycSnapshot, Opportunity, ScoreSnapshot, Signal


class ForecastRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_active_engagements(self, account_ids: list[str]) -> list[Engagement]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(Engagement)
                .where(
                    Engagement.account_id.in_(account_ids),
                    Engagement.archived_at.is_(None),
                    func.lower(Engagement.status) == "active",
                    Engagement.value > 0,
                )
                .order_by(Engagement.start_date.asc(), Engagement.updated_at.desc())
            )
        )

    def list_historical_engagements(self, account_ids: list[str], *, limit: int = 500) -> list[Engagement]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(Engagement)
                .where(
                    Engagement.account_id.in_(account_ids),
                    Engagement.archived_at.is_(None),
                    Engagement.value > 0,
                )
                .order_by(Engagement.end_date.desc().nullslast(), Engagement.updated_at.desc())
                .limit(limit)
            )
        )

    def list_window_opportunities(self, account_ids: list[str], *, window_start: datetime, window_end: datetime, limit: int = 1000) -> list[Opportunity]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(Opportunity)
                .where(
                    Opportunity.account_id.in_(account_ids),
                    Opportunity.archived_at.is_(None),
                    Opportunity.value > 0,
                    Opportunity.target_date >= window_start,
                    Opportunity.target_date < window_end,
                    func.lower(Opportunity.stage).notin_(("won", "lost")),
                )
                .order_by(Opportunity.target_date.asc(), Opportunity.updated_at.desc())
                .limit(limit)
            )
        )

    def latest_scores(self, account_ids: list[str]) -> dict[str, ScoreSnapshot]:
        if not account_ids:
            return {}
        snapshots = self.db.scalars(
            select(ScoreSnapshot)
            .where(ScoreSnapshot.account_id.in_(account_ids), ScoreSnapshot.scope == "account")
            .order_by(ScoreSnapshot.account_id.asc(), ScoreSnapshot.calculated_at.desc(), ScoreSnapshot.created_at.desc())
        )
        latest: dict[str, ScoreSnapshot] = {}
        for snapshot in snapshots:
            latest.setdefault(snapshot.account_id, snapshot)
        return latest

    def latest_kyc_snapshots(self, account_ids: list[str]) -> dict[str, KycSnapshot]:
        if not account_ids:
            return {}
        snapshots = self.db.scalars(
            select(KycSnapshot)
            .where(KycSnapshot.account_id.in_(account_ids))
            .order_by(KycSnapshot.account_id.asc(), KycSnapshot.approved_at.desc(), KycSnapshot.version.desc())
        )
        latest: dict[str, KycSnapshot] = {}
        for snapshot in snapshots:
            latest.setdefault(snapshot.account_id, snapshot)
        return latest

    def list_active_signals(self, account_ids: list[str], *, limit: int = 1000) -> list[Signal]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(Signal)
                .where(Signal.account_id.in_(account_ids), Signal.status.in_(("new", "reviewed", "accepted", "converted")))
                .order_by(Signal.severity.desc(), Signal.updated_at.desc(), Signal.created_at.desc())
                .limit(limit)
            )
        )

    def list_open_escalations(self, account_ids: list[str], *, limit: int = 1000) -> list[Escalation]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(Escalation)
                .where(Escalation.account_id.in_(account_ids), Escalation.status.in_(("open", "watchlist", "reopened")))
                .order_by(Escalation.severity.desc(), Escalation.sla_due_at.asc())
                .limit(limit)
            )
        )

    def list_renewal_profiles(self, account_ids: list[str]) -> list[EngagementRenewalProfile]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(EngagementRenewalProfile)
                .where(EngagementRenewalProfile.account_id.in_(account_ids))
                .order_by(EngagementRenewalProfile.updated_at.desc())
            )
        )

    def latest_csat_scores(self, account_ids: list[str]) -> dict[str, CsatScore]:
        if not account_ids:
            return {}
        scores = self.db.scalars(
            select(CsatScore)
            .where(CsatScore.account_id.in_(account_ids))
            .order_by(CsatScore.account_id.asc(), CsatScore.source_recorded_at.desc(), CsatScore.created_at.desc())
        )
        latest: dict[str, CsatScore] = {}
        for score in scores:
            latest.setdefault(score.account_id, score)
        return latest
