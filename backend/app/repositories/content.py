from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import ContentItem, SentContentRecord


class ContentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_content(
        self,
        *,
        search: str | None = None,
        content_type: str | None = None,
        category: str | None = None,
        tag: str | None = None,
        service_line: str | None = None,
        account_stage: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[ContentItem], int]:
        conditions = self._content_conditions(
            search=search,
            content_type=content_type,
            category=category,
            tag=tag,
            service_line=service_line,
            account_stage=account_stage,
            active_state=active_state,
        )
        total = self.db.scalar(select(func.count(ContentItem.id)).where(*conditions)) or 0
        order_column = {
            "name": ContentItem.title,
            "updated_at": ContentItem.updated_at,
            "popularity": ContentItem.popularity_count,
            "created_at": ContentItem.created_at,
        }.get(sort, ContentItem.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(ContentItem)
                .where(*conditions)
                .order_by(order_column, ContentItem.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_content(self, content_id: str) -> ContentItem | None:
        return self.db.get(ContentItem, content_id)

    def save_content(self, item: ContentItem) -> ContentItem:
        self.db.add(item)
        self.db.flush()
        return item

    def sent_count_for_content(self, content_id: str) -> int:
        return self.db.scalar(select(func.count(SentContentRecord.id)).where(SentContentRecord.content_item_id == content_id)) or 0

    def delete_content(self, item: ContentItem) -> None:
        self.db.delete(item)
        self.db.flush()

    def list_sent_content(
        self,
        *,
        account_id: str,
        search: str | None = None,
        engagement_id: str | None = None,
        sender_id: str | None = None,
        recipient: str | None = None,
        follow_up_status: str | None = None,
        content_tag: str | None = None,
        shared_from: datetime | None = None,
        shared_to: datetime | None = None,
        sort: str = "shared_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[SentContentRecord], int]:
        conditions = [SentContentRecord.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(SentContentRecord.content_title_snapshot.ilike(term), SentContentRecord.recipient_name.ilike(term), SentContentRecord.recipient_email.ilike(term)))
        if engagement_id:
            conditions.append(SentContentRecord.engagement_id == engagement_id)
        if sender_id:
            conditions.append(SentContentRecord.sender_id == sender_id)
        if recipient:
            term = f"%{recipient.strip()}%"
            conditions.append(or_(SentContentRecord.recipient_name.ilike(term), SentContentRecord.recipient_email.ilike(term)))
        if follow_up_status:
            conditions.append(SentContentRecord.follow_up_status == follow_up_status)
        if content_tag:
            conditions.append(SentContentRecord.content_item.has(cast(ContentItem.tags, String).ilike(f"%{content_tag.strip()}%")))
        if shared_from:
            conditions.append(SentContentRecord.shared_at >= shared_from)
        if shared_to:
            conditions.append(SentContentRecord.shared_at <= shared_to)

        total = self.db.scalar(select(func.count(SentContentRecord.id)).where(*conditions)) or 0
        order_column = {"shared_at": SentContentRecord.shared_at, "follow_up_status": SentContentRecord.follow_up_status}.get(sort, SentContentRecord.shared_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(SentContentRecord)
                .where(*conditions)
                .order_by(order_column, SentContentRecord.content_title_snapshot)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_sent_content(self, sent_content_id: str) -> SentContentRecord | None:
        return self.db.get(SentContentRecord, sent_content_id)

    def save_sent_content(self, record: SentContentRecord) -> SentContentRecord:
        self.db.add(record)
        self.db.flush()
        return record

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _content_conditions(
        *,
        search: str | None,
        content_type: str | None,
        category: str | None,
        tag: str | None,
        service_line: str | None,
        account_stage: str | None,
        active_state: str,
    ) -> list:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    ContentItem.title.ilike(term),
                    ContentItem.description.ilike(term),
                    ContentItem.category.ilike(term),
                    cast(ContentItem.tags, String).ilike(term),
                )
            )
        if content_type:
            conditions.append(ContentItem.content_type == content_type)
        if category:
            conditions.append(ContentItem.category == category)
        if tag:
            conditions.append(cast(ContentItem.tags, String).ilike(f"%{tag}%"))
        if service_line:
            conditions.append(cast(ContentItem.service_lines, String).ilike(f"%{service_line}%"))
        if account_stage:
            conditions.append(cast(ContentItem.account_stages, String).ilike(f"%{account_stage}%"))
        if active_state == "active":
            conditions.append(ContentItem.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(ContentItem.is_active.is_(False))
        return conditions
