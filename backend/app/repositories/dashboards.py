from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Account, AccountChangeAlert, AccountOwner, Engagement, Escalation, GovernanceEvent, IntegrationConnection, KycSnapshot, NotificationRecord, Opportunity, ScheduledWorkerRun, Signal, Task


class DashboardRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def account_ids_for_user(self, user_id: str) -> list[str]:
        return list(
            self.db.scalars(
                select(AccountOwner.account_id)
                .where(AccountOwner.user_id == user_id, AccountOwner.is_active.is_(True))
                .distinct()
            )
        )

    def account_ids_for_user_by_ownership_roles(self, user_id: str, ownership_roles: list[str]) -> list[str]:
        return list(
            self.db.scalars(
                select(AccountOwner.account_id)
                .where(AccountOwner.user_id == user_id, AccountOwner.is_active.is_(True), AccountOwner.ownership_role.in_(ownership_roles))
                .distinct()
            )
        )

    def account_ids_for_engagement_assignment(self, user_id: str) -> list[str]:
        return list(
            self.db.scalars(
                select(Engagement.account_id)
                .where(Engagement.archived_at.is_(None), or_(Engagement.owner_id == user_id, Engagement.ops_lead_id == user_id))
                .distinct()
            )
        )

    def account_ids_for_task_owner(self, user_id: str) -> list[str]:
        return list(
            self.db.scalars(
                select(Task.account_id)
                .where(Task.owner_id == user_id, Task.status.in_(["open", "in_progress", "blocked"]))
                .distinct()
            )
        )

    def list_accounts(
        self,
        *,
        account_ids: list[str] | None = None,
        search: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        lifecycle_status: str | None = None,
        risk: str | None = None,
        limit: int = 100,
    ) -> list[Account]:
        conditions = self._account_conditions(account_ids=account_ids, search=search, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk)
        return list(
            self.db.scalars(
                select(Account)
                .where(*conditions)
                .options(selectinload(Account.owners), selectinload(Account.engagements), selectinload(Account.kyc_snapshots))
                .order_by(Account.risk_status.desc(), Account.health_overall.asc(), Account.name)
                .limit(limit)
            )
        )

    def list_open_tasks(self, *, account_ids: list[str] | None = None, owner_id: str | None = None, limit: int = 100) -> list[Task]:
        conditions = [Task.status.in_(["open", "in_progress", "blocked"])]
        if account_ids is not None:
            conditions.append(Task.account_id.in_(account_ids) if account_ids else False)
        if owner_id:
            conditions.append(Task.owner_id == owner_id)
        return list(self.db.scalars(select(Task).where(*conditions).options(selectinload(Task.account)).order_by(Task.due_at.asc()).limit(limit)))

    def list_open_signals(self, *, account_ids: list[str] | None = None, owner_id: str | None = None, limit: int = 100) -> list[Signal]:
        conditions = [Signal.status.in_(["new", "reviewed", "accepted"])]
        if account_ids is not None:
            conditions.append(Signal.account_id.in_(account_ids) if account_ids else False)
        if owner_id:
            conditions.append(Signal.owner_id == owner_id)
        return list(self.db.scalars(select(Signal).where(*conditions).options(selectinload(Signal.account)).order_by(Signal.severity.desc(), Signal.created_at.desc()).limit(limit)))

    def list_open_escalations(self, *, account_ids: list[str] | None = None, owner_id: str | None = None, limit: int = 100) -> list[Escalation]:
        conditions = [Escalation.status.in_(["open", "watchlist", "reopened"])]
        if account_ids is not None:
            conditions.append(Escalation.account_id.in_(account_ids) if account_ids else False)
        if owner_id:
            conditions.append(Escalation.owner_id == owner_id)
        return list(self.db.scalars(select(Escalation).where(*conditions).options(selectinload(Escalation.account)).order_by(Escalation.severity.desc(), Escalation.sla_due_at.asc()).limit(limit)))

    def list_open_opportunities(self, *, account_ids: list[str] | None = None, owner_id: str | None = None, limit: int = 100) -> list[Opportunity]:
        conditions = [Opportunity.archived_at.is_(None), Opportunity.stage.notin_(["Won", "Lost"])]
        if account_ids is not None:
            conditions.append(Opportunity.account_id.in_(account_ids) if account_ids else False)
        if owner_id:
            conditions.append(Opportunity.owner_id == owner_id)
        return list(self.db.scalars(select(Opportunity).where(*conditions).options(selectinload(Opportunity.account)).order_by(Opportunity.target_date.asc()).limit(limit)))

    def list_governance_events(self, *, account_ids: list[str] | None = None, limit: int = 100) -> list[GovernanceEvent]:
        conditions = [GovernanceEvent.status.notin_(["cancelled"])]
        if account_ids is not None:
            conditions.append(GovernanceEvent.account_id.in_(account_ids) if account_ids else False)
        return list(self.db.scalars(select(GovernanceEvent).where(*conditions).options(selectinload(GovernanceEvent.account)).order_by(GovernanceEvent.scheduled_at.asc()).limit(limit)))

    def list_account_change_alerts(self, *, account_ids: list[str] | None = None, limit: int = 100) -> list[AccountChangeAlert]:
        conditions = [AccountChangeAlert.status.in_(["open", "acknowledged"])]
        if account_ids is not None:
            conditions.append(AccountChangeAlert.account_id.in_(account_ids) if account_ids else False)
        return list(
            self.db.scalars(
                select(AccountChangeAlert)
                .where(*conditions)
                .options(selectinload(AccountChangeAlert.account))
                .order_by(AccountChangeAlert.severity.desc(), AccountChangeAlert.created_at.desc())
                .limit(limit)
            )
        )

    def list_engagement_health_items(self, *, account_ids: list[str] | None = None, limit: int = 100) -> list[Engagement]:
        conditions = [Engagement.archived_at.is_(None)]
        if account_ids is not None:
            conditions.append(Engagement.account_id.in_(account_ids) if account_ids else False)
        return list(
            self.db.scalars(
                select(Engagement)
                .where(*conditions)
                .options(selectinload(Engagement.account))
                .order_by(Engagement.delivery_health.asc(), Engagement.updated_at.desc())
                .limit(limit)
            )
        )

    def admin_system_counts(self) -> dict[str, int]:
        return {
            "failed_workers": self.db.scalar(select(func.count(ScheduledWorkerRun.id)).where(ScheduledWorkerRun.status == "failed")) or 0,
            "failed_notifications": self.db.scalar(select(func.count(NotificationRecord.id)).where(NotificationRecord.delivery_status == "failed")) or 0,
            "integration_errors": self.db.scalar(select(func.count(IntegrationConnection.id)).where(IntegrationConnection.status == "error")) or 0,
            "open_account_change_alerts": self.db.scalar(select(func.count(AccountChangeAlert.id)).where(AccountChangeAlert.status == "open")) or 0,
        }

    def list_failed_worker_runs(self, *, limit: int = 20) -> list[ScheduledWorkerRun]:
        return list(
            self.db.scalars(
                select(ScheduledWorkerRun)
                .where(ScheduledWorkerRun.status == "failed")
                .order_by(ScheduledWorkerRun.created_at.desc())
                .limit(limit)
            )
        )

    def list_failed_notifications(self, *, limit: int = 20) -> list[NotificationRecord]:
        return list(
            self.db.scalars(
                select(NotificationRecord)
                .where(NotificationRecord.delivery_status == "failed")
                .order_by(NotificationRecord.created_at.desc())
                .limit(limit)
            )
        )

    def list_integration_errors(self, *, limit: int = 20) -> list[IntegrationConnection]:
        return list(
            self.db.scalars(
                select(IntegrationConnection)
                .where(IntegrationConnection.status == "error")
                .order_by(IntegrationConnection.updated_at.desc())
                .limit(limit)
            )
        )

    def latest_kyc_snapshot(self, account_id: str) -> KycSnapshot | None:
        return self.db.scalar(select(KycSnapshot).where(KycSnapshot.account_id == account_id).order_by(KycSnapshot.approved_at.desc()).limit(1))

    def count_accounts_by_risk(self, account_ids: list[str] | None = None) -> dict[str, int]:
        conditions = []
        if account_ids is not None:
            conditions.append(Account.id.in_(account_ids) if account_ids else False)
        rows = self.db.execute(select(Account.risk_status, func.count(Account.id)).where(*conditions).group_by(Account.risk_status)).all()
        return {str(status): int(count) for status, count in rows}

    def account_count(self, account_ids: list[str] | None = None) -> int:
        conditions = []
        if account_ids is not None:
            conditions.append(Account.id.in_(account_ids) if account_ids else False)
        return self.db.scalar(select(func.count(Account.id)).where(*conditions)) or 0

    def now(self) -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _account_conditions(
        *,
        account_ids: list[str] | None,
        search: str | None,
        segment: str | None,
        region: str | None,
        lifecycle_status: str | None,
        risk: str | None,
    ) -> list:
        conditions = [Account.archived_at.is_(None)]
        if account_ids is not None:
            conditions.append(Account.id.in_(account_ids) if account_ids else False)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Account.name.ilike(term), Account.project_name.ilike(term), Account.segment.ilike(term)))
        if segment:
            conditions.append(Account.segment == segment)
        if region:
            conditions.append(Account.region == region)
        if lifecycle_status:
            conditions.append(Account.lifecycle_status == lifecycle_status)
        if risk:
            conditions.append(Account.risk_status == risk)
        return conditions
