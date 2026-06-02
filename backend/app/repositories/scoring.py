from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ManualScoreSubmission, ScoreSnapshot, ScoringJob, ScoringMetricDefinition, ScoringMetricVersion


class ScoringRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_metrics(
        self,
        *,
        search: str | None = None,
        scope: str | None = None,
        status_filter: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[ScoringMetricDefinition], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(ScoringMetricDefinition.name.ilike(term), ScoringMetricDefinition.slug.ilike(term), ScoringMetricDefinition.description.ilike(term)))
        if scope:
            conditions.append(ScoringMetricDefinition.scope == scope)
        if status_filter:
            conditions.append(ScoringMetricDefinition.status == status_filter)
        if active_state == "active":
            conditions.append(ScoringMetricDefinition.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(ScoringMetricDefinition.is_active.is_(False))

        total = self.db.scalar(select(func.count(ScoringMetricDefinition.id)).where(*conditions)) or 0
        order_column = {
            "name": ScoringMetricDefinition.name,
            "scope": ScoringMetricDefinition.scope,
            "status": ScoringMetricDefinition.status,
            "weight": ScoringMetricDefinition.weight,
            "updated_at": ScoringMetricDefinition.updated_at,
            "created_at": ScoringMetricDefinition.created_at,
        }.get(sort, ScoringMetricDefinition.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(ScoringMetricDefinition)
                .where(*conditions)
                .order_by(order_column, ScoringMetricDefinition.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_metric(self, metric_id: str) -> ScoringMetricDefinition | None:
        return self.db.get(ScoringMetricDefinition, metric_id)

    def get_metric_by_slug(self, slug: str) -> ScoringMetricDefinition | None:
        return self.db.scalar(select(ScoringMetricDefinition).where(ScoringMetricDefinition.slug == slug))

    def save_metric(self, metric: ScoringMetricDefinition) -> ScoringMetricDefinition:
        self.db.add(metric)
        self.db.flush()
        return metric

    def add_metric_version(self, version: ScoringMetricVersion) -> ScoringMetricVersion:
        self.db.add(version)
        self.db.flush()
        return version

    def list_metric_versions(self, metric_id: str, page: int, page_size: int) -> tuple[list[ScoringMetricVersion], int]:
        conditions = [ScoringMetricVersion.metric_id == metric_id]
        total = self.db.scalar(select(func.count(ScoringMetricVersion.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(ScoringMetricVersion)
                .where(*conditions)
                .order_by(ScoringMetricVersion.version.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_manual_submission(self, submission: ManualScoreSubmission) -> ManualScoreSubmission:
        self.db.add(submission)
        self.db.flush()
        return submission

    def add_score_snapshot(self, snapshot: ScoreSnapshot) -> ScoreSnapshot:
        self.db.add(snapshot)
        self.db.flush()
        return snapshot

    def latest_score_snapshot(
        self,
        *,
        account_id: str,
        scope: str,
        engagement_id: str | None = None,
    ) -> ScoreSnapshot | None:
        conditions = [ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == scope]
        if scope == "engagement":
            conditions.append(ScoreSnapshot.engagement_id == engagement_id)
        else:
            conditions.append(ScoreSnapshot.engagement_id.is_(None))
        return self.db.scalar(select(ScoreSnapshot).where(*conditions).order_by(ScoreSnapshot.calculated_at.desc(), ScoreSnapshot.created_at.desc()).limit(1))

    def list_score_snapshots(
        self,
        *,
        account_id: str,
        scope: str | None = None,
        engagement_id: str | None = None,
        rag_status: str | None = None,
        status_filter: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "calculated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[ScoreSnapshot], int]:
        conditions = [ScoreSnapshot.account_id == account_id]
        if scope:
            conditions.append(ScoreSnapshot.scope == scope)
        if engagement_id:
            conditions.append(ScoreSnapshot.engagement_id == engagement_id)
        if rag_status:
            conditions.append(ScoreSnapshot.rag_status == rag_status)
        if status_filter:
            conditions.append(ScoreSnapshot.status == status_filter)
        if date_from:
            conditions.append(ScoreSnapshot.calculated_at >= date_from)
        if date_to:
            conditions.append(ScoreSnapshot.calculated_at <= date_to)

        total = self.db.scalar(select(func.count(ScoreSnapshot.id)).where(*conditions)) or 0
        order_column = {
            "calculated_at": ScoreSnapshot.calculated_at,
            "overall": ScoreSnapshot.overall,
            "rag_status": ScoreSnapshot.rag_status,
            "freshness_status": ScoreSnapshot.freshness_status,
            "trend": ScoreSnapshot.trend,
        }.get(sort, ScoreSnapshot.calculated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(ScoreSnapshot)
                .where(*conditions)
                .order_by(order_column, ScoreSnapshot.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_job(self, job: ScoringJob) -> ScoringJob:
        self.db.add(job)
        self.db.flush()
        return job

    def get_job(self, job_id: str) -> ScoringJob | None:
        return self.db.get(ScoringJob, job_id)

    def commit(self) -> None:
        self.db.commit()

    def flush(self) -> None:
        self.db.flush()
