from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Engagement, Stakeholder, StakeholderInteraction


class StakeholderRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_account(
        self,
        *,
        account_id: str,
        engagement_id: str | None = None,
        role: str | None = None,
        sentiment: str | None = None,
        political_risk: str | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Stakeholder], int]:
        conditions = [Stakeholder.account_id == account_id, Stakeholder.archived_at.is_(None)]
        if engagement_id:
            conditions.append(Stakeholder.engagement_id == engagement_id)
        if role:
            conditions.append(Stakeholder.role == role)
        if sentiment:
            conditions.append(Stakeholder.sentiment == sentiment)
        if political_risk:
            conditions.append(Stakeholder.political_risk == political_risk)
        if status_filter:
            conditions.append(Stakeholder.status == status_filter)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Stakeholder.name.ilike(term),
                    Stakeholder.title.ilike(term),
                    Stakeholder.company.ilike(term),
                    Stakeholder.email.ilike(term),
                )
            )

        total = self.db.scalar(select(func.count(Stakeholder.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(Stakeholder)
                .where(*conditions)
                .options(selectinload(Stakeholder.engagement), selectinload(Stakeholder.reports_to))
                .order_by(Stakeholder.name.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get(self, stakeholder_id: str, *, include_archived: bool = False) -> Stakeholder | None:
        conditions = [Stakeholder.id == stakeholder_id]
        if not include_archived:
            conditions.append(Stakeholder.archived_at.is_(None))
        return self.db.scalar(
            select(Stakeholder)
            .where(*conditions)
            .options(
                selectinload(Stakeholder.account),
                selectinload(Stakeholder.engagement),
                selectinload(Stakeholder.reports_to),
                selectinload(Stakeholder.direct_reports),
            )
        )

    def list_interactions(self, stakeholder_id: str, *, page: int = 1, page_size: int = 10) -> tuple[list[StakeholderInteraction], int]:
        conditions = [
            StakeholderInteraction.stakeholder_id == stakeholder_id,
            StakeholderInteraction.archived_at.is_(None),
        ]
        total = self.db.scalar(select(func.count(StakeholderInteraction.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(StakeholderInteraction)
                .where(*conditions)
                .order_by(StakeholderInteraction.interaction_at.desc(), StakeholderInteraction.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_org_chart_stakeholders(self, account_id: str) -> list[Stakeholder]:
        return list(
            self.db.scalars(
                select(Stakeholder)
                .where(Stakeholder.account_id == account_id, Stakeholder.archived_at.is_(None))
                .order_by(Stakeholder.name.asc())
            )
        )

    def get_engagement(self, engagement_id: str) -> Engagement | None:
        return self.db.get(Engagement, engagement_id)

    def save(self, stakeholder: Stakeholder) -> Stakeholder:
        self.db.add(stakeholder)
        self.db.flush()
        return stakeholder

    def save_interaction(self, interaction: StakeholderInteraction) -> StakeholderInteraction:
        self.db.add(interaction)
        self.db.flush()
        return interaction

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
