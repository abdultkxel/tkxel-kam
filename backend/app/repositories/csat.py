from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import CsatScore


class CsatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_score(self, score_id: str) -> CsatScore | None:
        return self.db.get(CsatScore, score_id)

    def get_by_source(self, source_label: str, source_id: str) -> CsatScore | None:
        return self.db.scalar(select(CsatScore).where(CsatScore.source_label == source_label, CsatScore.source_id == source_id))

    def save_score(self, score: CsatScore) -> CsatScore:
        self.db.add(score)
        self.db.flush()
        return score

    def list_scores(
        self,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        score_min: int | None = None,
        score_max: int | None = None,
        source: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "source_recorded_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[CsatScore], int]:
        conditions = []
        if account_id:
            conditions.append(CsatScore.account_id == account_id)
        if engagement_id:
            conditions.append(CsatScore.engagement_id == engagement_id)
        if score_min is not None:
            conditions.append(CsatScore.normalized_score >= score_min)
        if score_max is not None:
            conditions.append(CsatScore.normalized_score <= score_max)
        if source:
            conditions.append(CsatScore.source_label == source)
        if date_from:
            conditions.append(CsatScore.source_recorded_at >= date_from)
        if date_to:
            conditions.append(CsatScore.source_recorded_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(CsatScore.customer_name.ilike(term), CsatScore.customer_email.ilike(term), CsatScore.feedback.ilike(term), CsatScore.source_id.ilike(term)))

        total = self.db.scalar(select(func.count(CsatScore.id)).where(*conditions)) or 0
        order_column = {
            "source_recorded_at": CsatScore.source_recorded_at,
            "normalized_score": CsatScore.normalized_score,
            "customer_name": CsatScore.customer_name,
            "created_at": CsatScore.created_at,
            "updated_at": CsatScore.updated_at,
        }.get(sort, CsatScore.source_recorded_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(CsatScore)
                .where(*conditions)
                .order_by(order_column, CsatScore.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def commit(self) -> None:
        self.db.commit()
