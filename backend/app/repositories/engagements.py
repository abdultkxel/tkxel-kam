from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import AccountHealthSnapshot, Engagement, EngagementHealthSnapshot, utc_now


class EngagementRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, engagement: Engagement) -> Engagement:
        self.db.add(engagement)
        return engagement

    def get(self, engagement_id: str, include_archived: bool = False) -> Engagement | None:
        statement = (
            select(Engagement)
            .options(selectinload(Engagement.health_snapshots))
            .where(Engagement.id == engagement_id)
        )
        if not include_archived:
            statement = statement.where(Engagement.archived_at.is_(None))
        return self.db.scalar(statement)

    def list_for_account(self, account_id: str, include_archived: bool = False) -> list[Engagement]:
        statement = (
            select(Engagement)
            .options(selectinload(Engagement.health_snapshots))
            .where(Engagement.account_id == account_id)
        )
        if not include_archived:
            statement = statement.where(Engagement.archived_at.is_(None))
        return list(self.db.scalars(statement).all())

    def archive(self, engagement: Engagement) -> None:
        engagement.archived_at = utc_now()
        engagement.status = "completed"
        self.db.add(engagement)

    def add_health_snapshot(self, snapshot: EngagementHealthSnapshot) -> EngagementHealthSnapshot:
        self.db.add(snapshot)
        return snapshot

    def add_account_snapshot(self, snapshot: AccountHealthSnapshot) -> AccountHealthSnapshot:
        self.db.add(snapshot)
        return snapshot

    def list_account_snapshots(self, account_id: str, page: int, page_size: int) -> tuple[list[AccountHealthSnapshot], int]:
        total = self.db.scalar(select(func.count()).select_from(AccountHealthSnapshot).where(AccountHealthSnapshot.account_id == account_id))
        statement = (
            select(AccountHealthSnapshot)
            .where(AccountHealthSnapshot.account_id == account_id)
            .order_by(desc(AccountHealthSnapshot.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(self.db.scalars(statement).all()), total or 0

    def count_account_snapshots(self, account_id: str) -> int:
        return len(list(self.db.scalars(select(AccountHealthSnapshot.id).where(AccountHealthSnapshot.account_id == account_id)).all()))

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, entity: object) -> None:
        self.db.refresh(entity)
