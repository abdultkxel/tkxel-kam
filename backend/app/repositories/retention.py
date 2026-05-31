from datetime import datetime, timedelta, timezone

from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    AccountRetentionProfile,
    Engagement,
    EngagementRenewal,
    RetentionPlan,
    RetentionPlanAction,
    RetentionPlanMilestone,
)


class RetentionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_profile(self, account_id: str) -> AccountRetentionProfile | None:
        return self.db.scalar(select(AccountRetentionProfile).where(AccountRetentionProfile.account_id == account_id))

    def save_profile(self, profile: AccountRetentionProfile) -> AccountRetentionProfile:
        self.db.add(profile)
        self.db.flush()
        return profile

    def get_renewal_by_engagement(self, engagement_id: str) -> EngagementRenewal | None:
        return self.db.scalar(select(EngagementRenewal).where(EngagementRenewal.engagement_id == engagement_id))

    def save_renewal(self, renewal: EngagementRenewal) -> EngagementRenewal:
        self.db.add(renewal)
        self.db.flush()
        return renewal

    def list_account_renewal_tuples(self, account_id: str) -> list[tuple[Engagement, Account, EngagementRenewal | None]]:
        rows = self.db.execute(
            select(Engagement, Account, EngagementRenewal)
            .join(Account, Account.id == Engagement.account_id)
            .outerjoin(EngagementRenewal, EngagementRenewal.engagement_id == Engagement.id)
            .where(Engagement.account_id == account_id, Engagement.archived_at.is_(None))
            .order_by(func.coalesce(EngagementRenewal.notice_deadline, Engagement.notice_deadline), Engagement.name)
        )
        return [(engagement, account, renewal) for engagement, account, renewal in rows]

    def list_portfolio_renewal_tuples(
        self,
        *,
        account_ids: list[str] | None = None,
        search: str | None = None,
        renewal_window: str | None = None,
        notice_window: str | None = None,
        renewal_risk: str | None = None,
        owner_id: str | None = None,
        confidence_min: int | None = None,
        confidence_max: int | None = None,
        auto_renewal: bool | None = None,
        source_kind: str | None = None,
        exposure_min: float | None = None,
        exposure_max: float | None = None,
        sort: str = "nearest_notice",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[tuple[Engagement, Account, EngagementRenewal | None]], int]:
        conditions = [Engagement.archived_at.is_(None), Account.archived_at.is_(None)]
        if account_ids is not None:
            conditions.append(Engagement.account_id.in_(account_ids) if account_ids else Engagement.account_id == "__none__")
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Account.name.ilike(term),
                    Engagement.name.ilike(term),
                    Engagement.source_citation.ilike(term),
                    EngagementRenewal.source_title.ilike(term),
                    EngagementRenewal.source_citation.ilike(term),
                )
            )
        self._window_condition(conditions, func.coalesce(EngagementRenewal.renewal_date, Engagement.renewal_date), renewal_window)
        self._window_condition(conditions, func.coalesce(EngagementRenewal.notice_deadline, Engagement.notice_deadline), notice_window)
        if renewal_risk:
            conditions.append(func.coalesce(EngagementRenewal.renewal_risk, Account.risk_status) == renewal_risk)
        if owner_id:
            conditions.append(func.coalesce(EngagementRenewal.owner_id, Engagement.owner_id) == owner_id)
        if confidence_min is not None:
            conditions.append(EngagementRenewal.confidence >= confidence_min)
        if confidence_max is not None:
            conditions.append(EngagementRenewal.confidence <= confidence_max)
        if auto_renewal is not None:
            conditions.append(func.coalesce(EngagementRenewal.auto_renewal, Engagement.auto_renewal).is_(auto_renewal))
        source_kind_column = func.coalesce(
            EngagementRenewal.source_kind,
            case((Engagement.source_citation.is_not(None), "sow"), else_="manual"),
        )
        if source_kind:
            conditions.append(source_kind_column == source_kind)
        exposure = func.coalesce(EngagementRenewal.commercial_exposure, Engagement.value)
        if exposure_min is not None:
            conditions.append(exposure >= exposure_min)
        if exposure_max is not None:
            conditions.append(exposure <= exposure_max)

        total = self.db.scalar(
            select(func.count(Engagement.id))
            .join(Account, Account.id == Engagement.account_id)
            .outerjoin(EngagementRenewal, EngagementRenewal.engagement_id == Engagement.id)
            .where(*conditions)
        ) or 0

        order_column = {
            "nearest_notice": func.coalesce(EngagementRenewal.notice_deadline, Engagement.notice_deadline),
            "nearest_renewal": func.coalesce(EngagementRenewal.renewal_date, Engagement.renewal_date),
            "risk": func.coalesce(EngagementRenewal.renewal_risk, Account.risk_status),
            "commercial_exposure": exposure,
            "updated": func.coalesce(EngagementRenewal.updated_at, Engagement.updated_at),
        }.get(sort, func.coalesce(EngagementRenewal.notice_deadline, Engagement.notice_deadline))
        if direction == "desc":
            order_column = order_column.desc()

        rows = self.db.execute(
            select(Engagement, Account, EngagementRenewal)
            .join(Account, Account.id == Engagement.account_id)
            .outerjoin(EngagementRenewal, EngagementRenewal.engagement_id == Engagement.id)
            .where(*conditions)
            .order_by(order_column, Account.name, Engagement.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [(engagement, account, renewal) for engagement, account, renewal in rows], total

    def list_plans(
        self,
        *,
        account_id: str,
        search: str | None = None,
        plan_type: str | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        milestone_from: datetime | None = None,
        milestone_to: datetime | None = None,
        sort: str = "updated",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[RetentionPlan], int]:
        conditions = [RetentionPlan.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    RetentionPlan.title.ilike(term),
                    cast(RetentionPlan.success_criteria, String).ilike(term),
                    RetentionPlan.actions.any(RetentionPlanAction.title.ilike(term)),
                    RetentionPlan.actions.any(RetentionPlanAction.success_criteria.ilike(term)),
                )
            )
        if plan_type:
            conditions.append(RetentionPlan.plan_type == plan_type)
        if status_filter:
            conditions.append(RetentionPlan.status == status_filter)
        if owner_id:
            conditions.append(RetentionPlan.owner_id == owner_id)
        if due_from:
            conditions.append(RetentionPlan.due_at >= due_from)
        if due_to:
            conditions.append(RetentionPlan.due_at <= due_to)
        if milestone_from:
            conditions.append(or_(RetentionPlan.renewal_milestone_at >= milestone_from, RetentionPlan.milestones.any(RetentionPlanMilestone.due_at >= milestone_from)))
        if milestone_to:
            conditions.append(or_(RetentionPlan.renewal_milestone_at <= milestone_to, RetentionPlan.milestones.any(RetentionPlanMilestone.due_at <= milestone_to)))

        total = self.db.scalar(select(func.count(RetentionPlan.id)).where(*conditions)) or 0
        order_column = {
            "due_date": RetentionPlan.due_at,
            "risk": RetentionPlan.risk_level,
            "updated": RetentionPlan.updated_at,
        }.get(sort, RetentionPlan.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(RetentionPlan)
                .where(*conditions)
                .options(selectinload(RetentionPlan.milestones), selectinload(RetentionPlan.actions))
                .order_by(order_column, RetentionPlan.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_plan(self, plan_id: str) -> RetentionPlan | None:
        return self.db.scalar(
            select(RetentionPlan)
            .where(RetentionPlan.id == plan_id)
            .options(selectinload(RetentionPlan.milestones), selectinload(RetentionPlan.actions))
        )

    def save_plan(self, plan: RetentionPlan) -> RetentionPlan:
        self.db.add(plan)
        self.db.flush()
        return plan

    def add_milestone(self, milestone: RetentionPlanMilestone) -> RetentionPlanMilestone:
        self.db.add(milestone)
        self.db.flush()
        return milestone

    def add_action(self, action: RetentionPlanAction) -> RetentionPlanAction:
        self.db.add(action)
        self.db.flush()
        return action

    def get_action(self, action_id: str) -> RetentionPlanAction | None:
        return self.db.get(RetentionPlanAction, action_id)

    def list_actions_page(self, plan_id: str, page: int, page_size: int) -> tuple[list[RetentionPlanAction], int]:
        conditions = [RetentionPlanAction.plan_id == plan_id]
        total = self.db.scalar(select(func.count(RetentionPlanAction.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(RetentionPlanAction)
                .where(*conditions)
                .order_by(RetentionPlanAction.due_at, RetentionPlanAction.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_portfolio_plans(self, account_ids: list[str] | None = None, page: int = 1, page_size: int = 500) -> tuple[list[RetentionPlan], int]:
        conditions = []
        if account_ids is not None:
            conditions.append(RetentionPlan.account_id.in_(account_ids) if account_ids else RetentionPlan.account_id == "__none__")
        total = self.db.scalar(select(func.count(RetentionPlan.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(RetentionPlan)
                .where(*conditions)
                .options(selectinload(RetentionPlan.milestones), selectinload(RetentionPlan.actions), selectinload(RetentionPlan.account))
                .order_by(RetentionPlan.due_at, RetentionPlan.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_portfolio_actions(
        self,
        *,
        account_ids: list[str] | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[tuple[RetentionPlanAction, RetentionPlan]], int]:
        conditions = []
        if account_ids is not None:
            conditions.append(RetentionPlan.account_id.in_(account_ids) if account_ids else RetentionPlan.account_id == "__none__")
        if status_filter:
            conditions.append(RetentionPlanAction.status == status_filter)
        if owner_id:
            conditions.append(RetentionPlanAction.owner_id == owner_id)
        total = self.db.scalar(
            select(func.count(RetentionPlanAction.id))
            .join(RetentionPlan, RetentionPlan.id == RetentionPlanAction.plan_id)
            .where(*conditions)
        ) or 0
        rows = self.db.execute(
            select(RetentionPlanAction, RetentionPlan)
            .join(RetentionPlan, RetentionPlan.id == RetentionPlanAction.plan_id)
            .options(selectinload(RetentionPlan.account))
            .where(*conditions)
            .order_by(RetentionPlanAction.due_at, RetentionPlanAction.title)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [(action, plan) for action, plan in rows], total

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _window_condition(conditions: list, column, window: str | None) -> None:
        if not window:
            return
        now = datetime.now(timezone.utc)
        if window == "next_30":
            conditions.append(column >= now)
            conditions.append(column <= now + timedelta(days=30))
        elif window == "next_60":
            conditions.append(column >= now)
            conditions.append(column <= now + timedelta(days=60))
        elif window == "next_90":
            conditions.append(column >= now)
            conditions.append(column <= now + timedelta(days=90))
        elif window == "expired":
            conditions.append(column < now)
        elif window == "missing":
            conditions.append(column.is_(None))
