from datetime import datetime, timedelta, timezone

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import AccountHealthRollup, Engagement, EngagementHealthSnapshot, SourceDocument


class EngagementRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_account(
        self,
        *,
        account_id: str,
        search: str | None = None,
        status_filter: str | None = None,
        owner: str | None = None,
        service_line: str | None = None,
        renewal_window: str | None = None,
        risk_status: str | None = None,
        sort: str = "updated_date",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Engagement], int]:
        conditions = [Engagement.account_id == account_id, Engagement.archived_at.is_(None)]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Engagement.name.ilike(term), cast(Engagement.service_lines, String).ilike(term), Engagement.source_citation.ilike(term)))
        if status_filter:
            conditions.append(Engagement.status == status_filter)
        if owner:
            conditions.append(Engagement.owner_id == owner)
        if service_line:
            conditions.append(cast(Engagement.service_lines, String).ilike(f"%{service_line}%"))
        if renewal_window:
            now = datetime.now(timezone.utc)
            if renewal_window == "next_30":
                conditions.append(Engagement.renewal_date >= now)
                conditions.append(Engagement.renewal_date <= now + timedelta(days=30))
            elif renewal_window == "next_60":
                conditions.append(Engagement.renewal_date >= now)
                conditions.append(Engagement.renewal_date <= now + timedelta(days=60))
            elif renewal_window == "next_90":
                conditions.append(Engagement.renewal_date >= now)
                conditions.append(Engagement.renewal_date <= now + timedelta(days=90))
            elif renewal_window == "expired":
                conditions.append(Engagement.renewal_date < now)
            elif renewal_window == "notice_due":
                conditions.append(Engagement.notice_deadline >= now)
                conditions.append(Engagement.notice_deadline <= now + timedelta(days=30))
            elif renewal_window == "missing":
                conditions.append(Engagement.renewal_date.is_(None))
        if risk_status:
            if risk_status == "critical":
                conditions.append(Engagement.delivery_health < 60)
            elif risk_status == "warning":
                conditions.append(Engagement.delivery_health >= 60)
                conditions.append(Engagement.delivery_health < 75)
            elif risk_status == "healthy":
                conditions.append(Engagement.delivery_health >= 75)

        total = self.db.scalar(select(func.count(Engagement.id)).where(*conditions)) or 0
        order_column = {
            "renewal_date": Engagement.renewal_date,
            "end_date": Engagement.end_date,
            "value": Engagement.value,
            "delivery_status": Engagement.delivery_status,
            "updated_date": Engagement.updated_at,
        }.get(sort, Engagement.updated_at)
        if direction == "desc":
            order_column = order_column.desc()

        items = list(
            self.db.scalars(
                select(Engagement)
                .where(*conditions)
                .options(selectinload(Engagement.source_documents).selectinload(SourceDocument.citations))
                .order_by(order_column, Engagement.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_by_id(self, engagement_id: str) -> Engagement | None:
        return self.db.scalar(
            select(Engagement)
            .where(Engagement.id == engagement_id)
            .options(selectinload(Engagement.source_documents).selectinload(SourceDocument.citations))
        )

    def save(self, engagement: Engagement, refresh: bool = False) -> Engagement:
        self.db.add(engagement)
        self.db.flush()
        if refresh:
            self.db.refresh(engagement)
        return engagement

    def list_health_snapshots(
        self,
        engagement_id: str,
        page: int,
        page_size: int,
        *,
        rag_status: str | None = None,
        freshness_status: str | None = None,
        is_dirty: bool | None = None,
    ) -> tuple[list[EngagementHealthSnapshot], int]:
        conditions = [EngagementHealthSnapshot.engagement_id == engagement_id]
        if rag_status:
            conditions.append(EngagementHealthSnapshot.rag_status == rag_status)
        if freshness_status:
            conditions.append(EngagementHealthSnapshot.freshness_status == freshness_status)
        if is_dirty is not None:
            conditions.append(EngagementHealthSnapshot.is_dirty.is_(is_dirty))
        total = self.db.scalar(select(func.count(EngagementHealthSnapshot.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(EngagementHealthSnapshot)
                .where(*conditions)
                .order_by(EngagementHealthSnapshot.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_health_snapshot(self, snapshot: EngagementHealthSnapshot) -> EngagementHealthSnapshot:
        self.db.add(snapshot)
        self.db.flush()
        return snapshot

    def latest_health_snapshot(self, engagement_id: str) -> EngagementHealthSnapshot | None:
        return self.db.scalar(
            select(EngagementHealthSnapshot)
            .where(EngagementHealthSnapshot.engagement_id == engagement_id)
            .order_by(EngagementHealthSnapshot.created_at.desc())
            .limit(1)
        )

    def add_account_rollup(self, rollup: AccountHealthRollup) -> AccountHealthRollup:
        self.db.add(rollup)
        self.db.flush()
        return rollup

    def latest_account_rollup(self, account_id: str) -> AccountHealthRollup | None:
        return self.db.scalar(
            select(AccountHealthRollup)
            .where(AccountHealthRollup.account_id == account_id)
            .order_by(AccountHealthRollup.created_at.desc())
            .limit(1)
        )

    def commit(self) -> None:
        self.db.commit()
