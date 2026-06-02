from datetime import datetime

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Account, AccountChangeAlert, AccountOwner, Escalation, Opportunity, ScoreSnapshot, Signal, Task


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def account_ids_for_user(self, user_id: str) -> list[str]:
        return list(self.db.scalars(select(AccountOwner.account_id).where(AccountOwner.user_id == user_id, AccountOwner.is_active.is_(True)).distinct()))

    def list_accounts(
        self,
        *,
        account_ids: list[str] | None = None,
        search: str | None = None,
        am_id: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        lifecycle_status: str | None = None,
        risk: str | None = None,
        limit: int = 500,
    ) -> list[Account]:
        conditions = [Account.archived_at.is_(None)]
        if account_ids is not None:
            conditions.append(Account.id.in_(account_ids) if account_ids else False)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Account.name.ilike(term), Account.project_name.ilike(term), Account.segment.ilike(term)))
        if am_id:
            conditions.append(Account.owners.any(and_(AccountOwner.user_id == am_id, AccountOwner.is_active.is_(True))))
        if segment:
            conditions.append(Account.segment == segment)
        if region:
            conditions.append(Account.region == region)
        if lifecycle_status:
            conditions.append(Account.lifecycle_status == lifecycle_status)
        if risk:
            conditions.append(Account.risk_status == risk)
        return list(
            self.db.scalars(
                select(Account)
                .where(*conditions)
                .options(selectinload(Account.owners), selectinload(Account.engagements))
                .order_by(Account.risk_status.desc(), Account.health_overall.asc(), Account.name)
                .limit(limit)
            )
        )

    def latest_score(self, account_id: str) -> ScoreSnapshot | None:
        return self.db.scalar(
            select(ScoreSnapshot)
            .where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account")
            .order_by(ScoreSnapshot.calculated_at.desc())
            .limit(1)
        )

    def previous_score(self, account_id: str, before: datetime) -> ScoreSnapshot | None:
        return self.db.scalar(
            select(ScoreSnapshot)
            .where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account", ScoreSnapshot.calculated_at < before)
            .order_by(ScoreSnapshot.calculated_at.desc())
            .limit(1)
        )

    def list_score_snapshots(self, *, account_ids: list[str], date_from: datetime | None, date_to: datetime | None, limit: int = 1000) -> list[ScoreSnapshot]:
        conditions = [ScoreSnapshot.scope == "account"]
        conditions.append(ScoreSnapshot.account_id.in_(account_ids) if account_ids else False)
        if date_from:
            conditions.append(ScoreSnapshot.calculated_at >= date_from)
        if date_to:
            conditions.append(ScoreSnapshot.calculated_at <= date_to)
        return list(self.db.scalars(select(ScoreSnapshot).where(*conditions).order_by(ScoreSnapshot.calculated_at.asc()).limit(limit)))

    def list_open_opportunities(self, account_ids: list[str]) -> list[Opportunity]:
        conditions = [Opportunity.archived_at.is_(None), Opportunity.stage.notin_(["Won", "Lost"])]
        conditions.append(Opportunity.account_id.in_(account_ids) if account_ids else False)
        return list(self.db.scalars(select(Opportunity).where(*conditions).order_by(Opportunity.updated_at.desc()).limit(1000)))

    def list_open_escalations(self, account_ids: list[str]) -> list[Escalation]:
        conditions = [Escalation.status.in_(["open", "watchlist", "reopened"])]
        conditions.append(Escalation.account_id.in_(account_ids) if account_ids else False)
        return list(self.db.scalars(select(Escalation).where(*conditions).order_by(Escalation.created_at.desc()).limit(1000)))

    def list_open_tasks(self, account_ids: list[str]) -> list[Task]:
        conditions = [Task.status.in_(["open", "in_progress", "blocked"])]
        conditions.append(Task.account_id.in_(account_ids) if account_ids else False)
        return list(self.db.scalars(select(Task).where(*conditions).order_by(Task.due_at.asc()).limit(1000)))

    def list_open_signals(self, account_ids: list[str]) -> list[Signal]:
        conditions = [Signal.status.in_(["new", "reviewed", "accepted"])]
        conditions.append(Signal.account_id.in_(account_ids) if account_ids else False)
        return list(self.db.scalars(select(Signal).where(*conditions).order_by(Signal.severity.desc(), Signal.created_at.desc()).limit(1000)))

    def get_alert_by_deduplication_key(self, deduplication_key: str) -> AccountChangeAlert | None:
        return self.db.scalar(select(AccountChangeAlert).where(AccountChangeAlert.deduplication_key == deduplication_key))

    def save_alert(self, alert: AccountChangeAlert) -> AccountChangeAlert:
        self.db.add(alert)
        self.db.flush()
        return alert

    def get_alert(self, alert_id: str) -> AccountChangeAlert | None:
        return self.db.get(AccountChangeAlert, alert_id)

    def list_alerts(
        self,
        *,
        account_ids: list[str] | None,
        search: str | None = None,
        status_filter: str | None = None,
        severity: str | None = None,
        owner_id: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[AccountChangeAlert], int]:
        conditions = []
        if account_ids is not None:
            conditions.append(AccountChangeAlert.account_id.in_(account_ids) if account_ids else False)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    AccountChangeAlert.reason_code.ilike(term),
                    AccountChangeAlert.affected_metric.ilike(term),
                    AccountChangeAlert.recommended_action.ilike(term),
                    cast(AccountChangeAlert.source_evidence_json, String).ilike(term),
                )
            )
        if status_filter:
            conditions.append(AccountChangeAlert.status == status_filter)
        if severity:
            conditions.append(AccountChangeAlert.severity == severity)
        if owner_id:
            conditions.append(AccountChangeAlert.owner_id == owner_id)
        total = self.db.scalar(select(func.count(AccountChangeAlert.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(AccountChangeAlert)
                .where(*conditions)
                .order_by(AccountChangeAlert.status.asc(), AccountChangeAlert.severity.desc(), AccountChangeAlert.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def commit(self) -> None:
        self.db.commit()
