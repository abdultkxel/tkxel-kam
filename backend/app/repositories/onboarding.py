from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import OnboardingDraft, OnboardingDraftEngagement, SourceDocument


class OnboardingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_drafts(
        self,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        lifecycle_status: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        uploader: str | None = None,
        owner: str | None = None,
        visible_to_user_id: str | None = None,
        visible_to_user_email: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "newest",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[OnboardingDraft], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    OnboardingDraft.account_name.ilike(term),
                    OnboardingDraft.source_documents.any(SourceDocument.title.ilike(term)),
                    OnboardingDraft.source_documents.any(SourceDocument.file_name.ilike(term)),
                )
            )
        if status_filter:
            conditions.append(OnboardingDraft.status == status_filter)
        if lifecycle_status:
            conditions.append(OnboardingDraft.lifecycle_status == lifecycle_status)
        if segment:
            conditions.append(OnboardingDraft.segment == segment)
        if region:
            conditions.append(OnboardingDraft.region == region)
        if uploader:
            conditions.append(OnboardingDraft.created_by_id == uploader)
        if owner:
            conditions.append(OnboardingDraft.primary_owner_id == owner)
        if visible_to_user_id:
            visibility_conditions = [
                OnboardingDraft.created_by_id == visible_to_user_id,
                OnboardingDraft.primary_owner_id == visible_to_user_id,
            ]
            if visible_to_user_email:
                visibility_conditions.append(func.lower(OnboardingDraft.primary_owner_email) == visible_to_user_email.strip().lower())
            conditions.append(or_(*visibility_conditions))
        if created_from:
            conditions.append(OnboardingDraft.created_at >= created_from)
        if created_to:
            conditions.append(OnboardingDraft.created_at <= created_to)

        total = self.db.scalar(select(func.count(OnboardingDraft.id)).where(*conditions)) or 0
        order_column = {
            "newest": OnboardingDraft.created_at.desc(),
            "oldest": OnboardingDraft.created_at,
            "account_name": OnboardingDraft.account_name,
            "extraction_status": OnboardingDraft.extraction_status,
        }.get(sort, OnboardingDraft.created_at.desc())
        drafts = list(
            self.db.scalars(
                select(OnboardingDraft)
                .where(*conditions)
                .options(
                    selectinload(OnboardingDraft.source_documents).selectinload(SourceDocument.citations),
                    selectinload(OnboardingDraft.engagement_drafts),
                )
                .order_by(order_column, OnboardingDraft.account_name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return drafts, total

    def get_by_id(self, draft_id: str) -> OnboardingDraft | None:
        return self.db.scalar(
            select(OnboardingDraft)
            .where(OnboardingDraft.id == draft_id)
            .options(
                selectinload(OnboardingDraft.source_documents).selectinload(SourceDocument.citations),
                selectinload(OnboardingDraft.engagement_drafts),
            )
        )

    def add_draft(self, draft: OnboardingDraft) -> OnboardingDraft:
        self.db.add(draft)
        self.db.flush()
        return draft

    def add_engagement_draft(self, engagement: OnboardingDraftEngagement) -> OnboardingDraftEngagement:
        self.db.add(engagement)
        self.db.flush()
        return engagement

    def commit(self) -> None:
        self.db.commit()
