from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import MeetingArtifact, UserIntegrationConnection


class MeetingCaptureRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_connection(self, *, user_id: str, provider: str) -> UserIntegrationConnection | None:
        return self.db.scalar(
            select(UserIntegrationConnection).where(
                UserIntegrationConnection.user_id == user_id,
                UserIntegrationConnection.provider == provider,
            )
        )

    def save_user_connection(self, connection: UserIntegrationConnection) -> UserIntegrationConnection:
        self.db.add(connection)
        self.db.flush()
        return connection

    def get_meeting_artifact(self, meeting_id: str) -> MeetingArtifact | None:
        return self.db.get(MeetingArtifact, meeting_id)

    def get_meeting_by_external_id(self, *, owner_id: str, provider: str, external_id: str) -> MeetingArtifact | None:
        return self.db.scalar(
            select(MeetingArtifact).where(
                MeetingArtifact.owner_id == owner_id,
                MeetingArtifact.provider == provider,
                MeetingArtifact.external_id == external_id,
            )
        )

    def get_meeting_by_source_link(self, *, owner_id: str, provider: str, source_link: str) -> MeetingArtifact | None:
        return self.db.scalar(
            select(MeetingArtifact).where(
                MeetingArtifact.owner_id == owner_id,
                MeetingArtifact.provider == provider,
                or_(MeetingArtifact.source_link == source_link, MeetingArtifact.meeting_url == source_link),
            )
        )

    def list_meeting_artifacts(
        self,
        *,
        owner_id: str,
        provider: str | None = None,
        status: str | None = None,
        account_id: str | None = None,
        linked_object_type: str | None = None,
        linked_object_id: str | None = None,
        search: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[MeetingArtifact], int]:
        conditions = [MeetingArtifact.owner_id == owner_id]
        if provider:
            conditions.append(MeetingArtifact.provider == provider)
        if status:
            conditions.append(MeetingArtifact.status == status)
        if account_id:
            conditions.append(MeetingArtifact.account_id == account_id)
        if linked_object_type:
            conditions.append(MeetingArtifact.linked_object_type == linked_object_type)
        if linked_object_id:
            conditions.append(MeetingArtifact.linked_object_id == linked_object_id)
        if date_from:
            conditions.append(MeetingArtifact.occurred_at >= date_from)
        if date_to:
            conditions.append(MeetingArtifact.occurred_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    MeetingArtifact.title.ilike(term),
                    MeetingArtifact.summary.ilike(term),
                    MeetingArtifact.source_link.ilike(term),
                    cast(MeetingArtifact.action_items, String).ilike(term),
                )
            )
        total = self.db.scalar(select(func.count(MeetingArtifact.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(MeetingArtifact)
                .where(*conditions)
                .order_by(MeetingArtifact.occurred_at.desc(), MeetingArtifact.updated_at.desc(), MeetingArtifact.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_meeting_artifact(self, artifact: MeetingArtifact) -> MeetingArtifact:
        self.db.add(artifact)
        self.db.flush()
        return artifact

    def commit(self) -> None:
        self.db.commit()
