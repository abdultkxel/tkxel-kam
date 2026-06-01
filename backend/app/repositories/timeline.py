from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import TimelineEntry


class TimelineRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(
        self,
        *,
        account_id: str,
        event_type: str,
        module: str,
        title: str,
        description: str,
        performed_by: str,
        performed_by_name: str,
        engagement_id: str | None = None,
        source_record_id: str | None = None,
        source_record_type: str | None = None,
        source_record_route: str | None = None,
        before_value: dict | None = None,
        after_value: dict | None = None,
        metadata: dict | None = None,
        is_sensitive: bool = False,
        is_system_generated: bool = True,
        is_immutable: bool = True,
    ) -> TimelineEntry:
        entry = TimelineEntry(
            account_id=account_id,
            engagement_id=engagement_id,
            event_type=event_type,
            module=module,
            title=title,
            description=description,
            performed_by=performed_by,
            performed_by_name=performed_by_name,
            source_record_id=source_record_id,
            source_record_type=source_record_type,
            source_record_route=source_record_route,
            before_value=before_value,
            after_value=after_value,
            metadata_json=metadata,
            is_sensitive=is_sensitive,
            is_system_generated=is_system_generated,
            is_immutable=is_immutable,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def list_for_engagement(self, engagement_id: str, page: int = 1, page_size: int = 100) -> tuple[list[TimelineEntry], int]:
        conditions = [TimelineEntry.engagement_id == engagement_id]
        total = self.db.scalar(select(func.count(TimelineEntry.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineEntry)
                .where(*conditions)
                .order_by(TimelineEntry.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total
