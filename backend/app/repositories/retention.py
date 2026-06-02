from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    Engagement,
    EngagementRenewalProfile,
    RetentionPlan,
    RetentionPlanAction,
    RetentionPlanMilestone,
    RetentionRecommendation,
    Task,
    User,
)


class RetentionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_account(self, account_id: str) -> Account | None:
        return self.db.get(Account, account_id)

    def get_engagement(self, engagement_id: str) -> Engagement | None:
        return self.db.scalar(select(Engagement).where(Engagement.id == engagement_id).options(selectinload(Engagement.renewal_profile), selectinload(Engagement.account)))

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_renewal_profile(self, engagement_id: str) -> EngagementRenewalProfile | None:
        return self.db.scalar(select(EngagementRenewalProfile).where(EngagementRenewalProfile.engagement_id == engagement_id).options(selectinload(EngagementRenewalProfile.engagement), selectinload(EngagementRenewalProfile.account)))

    def save_renewal_profile(self, profile: EngagementRenewalProfile) -> EngagementRenewalProfile:
        self.db.add(profile)
        self.db.flush()
        return profile

    def list_renewals(
        self,
        *,
        account_ids: list[str] | None = None,
        account_id: str | None = None,
        risk: str | None = None,
        owner_id: str | None = None,
        confidence_min: int | None = None,
        auto_renewal: bool | None = None,
        notice_from: datetime | None = None,
        notice_to: datetime | None = None,
        renewal_from: datetime | None = None,
        renewal_to: datetime | None = None,
        search: str | None = None,
        sort: str = "notice_deadline",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[Engagement], int]:
        conditions = [Engagement.archived_at.is_(None)]
        if account_id:
            conditions.append(Engagement.account_id == account_id)
        if account_ids is not None:
            conditions.append(Engagement.account_id.in_(account_ids) if account_ids else Engagement.id.is_(None))
        if risk:
            conditions.append(Engagement.renewal_risk == risk)
        if owner_id:
            conditions.append(Engagement.owner_id == owner_id)
        if confidence_min is not None:
            conditions.append(or_(EngagementRenewalProfile.confidence >= confidence_min, EngagementRenewalProfile.id.is_(None)))
        if auto_renewal is not None:
            conditions.append(Engagement.auto_renewal.is_(auto_renewal))
        if notice_from:
            conditions.append(Engagement.notice_deadline >= notice_from)
        if notice_to:
            conditions.append(Engagement.notice_deadline <= notice_to)
        if renewal_from:
            conditions.append(Engagement.renewal_date >= renewal_from)
        if renewal_to:
            conditions.append(Engagement.renewal_date <= renewal_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Engagement.name.ilike(term), Account.name.ilike(term), Engagement.source_citation.ilike(term)))
        order_column = {
            "notice_deadline": Engagement.notice_deadline,
            "renewal_date": Engagement.renewal_date,
            "risk": Engagement.renewal_risk,
            "commercial_exposure": EngagementRenewalProfile.commercial_exposure,
        }.get(sort, Engagement.notice_deadline)
        if direction == "desc":
            order_column = order_column.desc()
        total = self.db.scalar(select(func.count(Engagement.id)).join(Account).outerjoin(EngagementRenewalProfile).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(Engagement)
                .join(Account)
                .outerjoin(EngagementRenewalProfile)
                .where(*conditions)
                .options(selectinload(Engagement.account), selectinload(Engagement.renewal_profile))
                .order_by(order_column, Engagement.end_date.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_plans(
        self,
        *,
        account_id: str,
        plan_type: str | None = None,
        status: str | None = None,
        owner_id: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        search: str | None = None,
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[RetentionPlan], int]:
        conditions = [RetentionPlan.account_id == account_id]
        if plan_type:
            conditions.append(RetentionPlan.plan_type == plan_type)
        if status:
            conditions.append(RetentionPlan.status == status)
        if owner_id:
            conditions.append(RetentionPlan.owner_id == owner_id)
        if due_from:
            conditions.append(RetentionPlan.renewal_milestone_at >= due_from)
        if due_to:
            conditions.append(RetentionPlan.renewal_milestone_at <= due_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(RetentionPlan.title.ilike(term), RetentionPlan.summary.ilike(term)))
        total = self.db.scalar(select(func.count(RetentionPlan.id)).where(*conditions)) or 0
        order_column = {
            "due_date": RetentionPlan.renewal_milestone_at,
            "status": RetentionPlan.status,
            "updated_at": RetentionPlan.updated_at,
        }.get(sort, RetentionPlan.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(RetentionPlan)
                .where(*conditions)
                .options(selectinload(RetentionPlan.milestones), selectinload(RetentionPlan.actions), selectinload(RetentionPlan.account), selectinload(RetentionPlan.engagement))
                .order_by(order_column, RetentionPlan.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_plan(self, plan_id: str) -> RetentionPlan | None:
        return self.db.scalar(
            select(RetentionPlan)
            .where(RetentionPlan.id == plan_id)
            .options(selectinload(RetentionPlan.account), selectinload(RetentionPlan.engagement), selectinload(RetentionPlan.milestones), selectinload(RetentionPlan.actions))
        )

    def save_plan(self, plan: RetentionPlan) -> RetentionPlan:
        self.db.add(plan)
        self.db.flush()
        return plan

    def replace_plan_children(self, plan: RetentionPlan, milestones: list[RetentionPlanMilestone], actions: list[RetentionPlanAction]) -> None:
        for action in list(plan.actions):
            self.db.delete(action)
        for milestone in list(plan.milestones):
            self.db.delete(milestone)
        self.db.flush()
        for milestone in milestones:
            self.db.add(milestone)
        self.db.flush()
        for action in actions:
            self.db.add(action)
        self.db.flush()

    def list_recommendations(self, account_id: str) -> list[RetentionRecommendation]:
        return list(
            self.db.scalars(
                select(RetentionRecommendation)
                .where(RetentionRecommendation.account_id == account_id)
                .options(selectinload(RetentionRecommendation.engagement))
                .order_by(RetentionRecommendation.created_at.desc())
            )
        )

    def get_recommendation(self, recommendation_id: str) -> RetentionRecommendation | None:
        return self.db.scalar(select(RetentionRecommendation).where(RetentionRecommendation.id == recommendation_id).options(selectinload(RetentionRecommendation.account), selectinload(RetentionRecommendation.engagement)))

    def save_recommendation(self, recommendation: RetentionRecommendation) -> RetentionRecommendation:
        self.db.add(recommendation)
        self.db.flush()
        return recommendation

    def add_task(self, task: Task) -> Task:
        self.db.add(task)
        self.db.flush()
        return task

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()
