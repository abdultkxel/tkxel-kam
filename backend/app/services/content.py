from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models import ContentItem, SentContentRecord, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.content import ContentRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    ContentItemCreateRequest,
    ContentItemPageRead,
    ContentItemRead,
    ContentItemUpdateRequest,
    ContentRecommendationRead,
    MessageResponse,
    SentContentCreateRequest,
    SentContentPageRead,
    SentContentRead,
    SentContentUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.storage import ContentStorageService, StoredFile
from app.services.timeline import TimelineService
from app.services.user_management import page_count


class ContentService:
    def __init__(self, db: Session) -> None:
        self.repository = ContentRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.storage = ContentStorageService()
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))

    def list_content(
        self,
        current_user: User,
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
    ) -> ContentItemPageRead:
        self.access.require_module_permission(current_user, "client_education_content", "view")
        items, total = self.repository.list_content(
            search=search,
            content_type=content_type,
            category=category,
            tag=tag,
            service_line=service_line,
            account_stage=account_stage,
            active_state=active_state,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return ContentItemPageRead(items=[self._content_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_content(self, payload: ContentItemCreateRequest, current_user: User) -> ContentItemRead:
        self.access.require_module_permission(current_user, "client_education_content", "create")
        item = ContentItem(
            title=payload.title,
            description=payload.description,
            content_type=payload.content_type,
            category=payload.category,
            tags=payload.tags,
            service_lines=payload.service_lines,
            account_stages=payload.account_stages,
            source_kind=payload.source_kind,
            url=payload.url,
            body_content=payload.body_content,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_content(item)
        self.custom_fields.save_record_values("client_education_content", item.id, payload.custom_field_values, current_user, audit_module="client_education_content")
        self.audit.log(module="client_education_content", action="create", entity_type="content_item", entity_id=item.id, actor=current_user, after_value=self._content_snapshot(item))
        self.repository.commit()
        return self._content_read(item)

    async def upload_content_file(
        self,
        current_user: User,
        *,
        title: str,
        content_type: str,
        category: str,
        file: UploadFile,
        description: str | None = None,
        tags: list[str] | None = None,
        service_lines: list[str] | None = None,
        account_stages: list[str] | None = None,
        custom_field_values: dict | None = None,
    ) -> ContentItemRead:
        self.access.require_module_permission(current_user, "client_education_content", "create")
        stored = await self.storage.save_upload(file)
        item = self._content_from_file(
            title=title,
            description=description,
            content_type=content_type,
            category=category,
            tags=tags or [],
            service_lines=service_lines or [],
            account_stages=account_stages or [],
            stored=stored,
            current_user=current_user,
        )
        self.repository.save_content(item)
        self.custom_fields.save_record_values("client_education_content", item.id, custom_field_values or {}, current_user, audit_module="client_education_content")
        self.audit.log(module="client_education_content", action="upload", entity_type="content_item", entity_id=item.id, actor=current_user, after_value=self._content_snapshot(item))
        self.repository.commit()
        return self._content_read(item)

    def update_content(self, content_id: str, payload: ContentItemUpdateRequest, current_user: User) -> ContentItemRead:
        self.access.require_module_permission(current_user, "client_education_content", "update")
        item = self._get_content_or_404(content_id)
        before = self._content_snapshot(item)
        updates = payload.model_dump(exclude_unset=True)
        custom_values = updates.pop("custom_field_values", None)
        for field, value in updates.items():
            setattr(item, field, value)
        if custom_values is not None:
            self.custom_fields.replace_record_values("client_education_content", item.id, custom_values, current_user, audit_module="client_education_content")
        item.updated_by_id = current_user.id
        if item.is_active:
            item.archived_at = None
        elif item.archived_at is None:
            item.archived_at = datetime.now(timezone.utc)
        self.audit.log(module="client_education_content", action="update", entity_type="content_item", entity_id=item.id, actor=current_user, before_value=before, after_value=self._content_snapshot(item))
        self.repository.commit()
        return self._content_read(item)

    def delete_content(self, content_id: str, current_user: User) -> MessageResponse:
        self.access.require_module_permission(current_user, "client_education_content", "delete")
        item = self._get_content_or_404(content_id)
        before = self._content_snapshot(item)
        if self.repository.sent_count_for_content(content_id):
            item.is_active = False
            item.archived_at = datetime.now(timezone.utc)
            item.updated_by_id = current_user.id
            action = "archive"
            message = "Content archived because sent history exists"
        else:
            self.repository.delete_content(item)
            action = "delete"
            message = "Content deleted successfully"
        self.audit.log(module="client_education_content", action=action, entity_type="content_item", entity_id=content_id, actor=current_user, before_value=before)
        self.repository.commit()
        return MessageResponse(message=message)

    def recommendations(self, account_id: str, current_user: User) -> list[ContentRecommendationRead]:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="client_education_content")
        items, _ = self.repository.list_content(
            search=None,
            account_stage=account.lifecycle_status,
            active_state="active",
            sort="popularity",
            direction="desc",
            page=1,
            page_size=6,
        )
        if not items:
            items, _ = self.repository.list_content(search=None, active_state="active", sort="updated_at", direction="desc", page=1, page_size=6)
        return [
            ContentRecommendationRead(
                content=self._content_read(item),
                rationale=f"Matches {account.lifecycle_status} account context or recent catalog activity.",
                source_context=f"Account stage: {account.lifecycle_status}; segment: {account.segment}.",
                relevance_score=max(60, 92 - index * 6),
                stale=False,
            )
            for index, item in enumerate(items)
        ]

    def list_sent_content(
        self,
        account_id: str,
        current_user: User,
        *,
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
    ) -> SentContentPageRead:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="client_education_content")
        items, total = self.repository.list_sent_content(
            account_id=account_id,
            search=search,
            engagement_id=engagement_id,
            sender_id=sender_id,
            recipient=recipient,
            follow_up_status=follow_up_status,
            content_tag=content_tag,
            shared_from=shared_from,
            shared_to=shared_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return SentContentPageRead(items=[SentContentRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_sent_content(self, account_id: str, payload: SentContentCreateRequest, current_user: User) -> SentContentRead:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="client_education_content")
        self.access.require_module_permission(current_user, "client_education_content", "create")
        content = self._get_content_or_404(payload.content_item_id)
        if not content.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive content cannot be shared")
        record = SentContentRecord(
            account_id=account_id,
            engagement_id=payload.engagement_id,
            content_item_id=content.id,
            content_title_snapshot=content.title,
            content_type_snapshot=content.content_type,
            sender_id=current_user.id,
            sender_name=current_user.full_name,
            recipient_name=payload.recipient_name,
            recipient_email=str(payload.recipient_email) if payload.recipient_email else None,
            shared_at=payload.shared_at,
            follow_up_status=payload.follow_up_status,
            follow_up_due_at=payload.follow_up_due_at,
            notes=payload.notes,
        )
        self.repository.save_sent_content(record)
        content.popularity_count += 1
        timeline_entry = self.timeline.add_account_event(
            account_id=account_id,
            engagement_id=payload.engagement_id,
            event_type="client_education",
            module="education",
            title=f"Content shared: {content.title}",
            description=f"{current_user.full_name} shared {content.title} with {payload.recipient_name}.",
            actor=current_user,
            source_record_id=record.id,
            source_record_type="sent_content",
            source_record_route=f"/accounts/{account_id}?tab=education",
            metadata={"recipient_email": record.recipient_email, "follow_up_status": record.follow_up_status},
        )
        record.timeline_entry_id = timeline_entry.id
        self.audit.log(module="client_education_content", action="share", entity_type="sent_content", entity_id=record.id, actor=current_user, after_value={"account_id": account_id, "content_item_id": content.id})
        self.repository.commit()
        return SentContentRead.model_validate(record)

    def update_sent_content(self, sent_content_id: str, payload: SentContentUpdateRequest, current_user: User) -> SentContentRead:
        record = self.repository.get_sent_content(sent_content_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sent content record was not found")
        account = self.accounts.get_by_id(record.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="client_education_content")
        self.access.require_module_permission(current_user, "client_education_content", "update")
        before = {"follow_up_status": record.follow_up_status, "notes": record.notes}
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(record, field, value)
        self.audit.log(module="client_education_content", action="update_sent_content", entity_type="sent_content", entity_id=record.id, actor=current_user, before_value=before, after_value=updates)
        self.repository.commit()
        return SentContentRead.model_validate(record)

    def _get_content_or_404(self, content_id: str) -> ContentItem:
        item = self.repository.get_content(content_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item was not found")
        return item

    def _content_read(self, item: ContentItem) -> ContentItemRead:
        return ContentItemRead.model_validate(item).model_copy(
            update={"custom_field_values": self.custom_fields.record_values("client_education_content", item.id)}
        )

    @staticmethod
    def _content_from_file(
        *,
        title: str,
        description: str | None,
        content_type: str,
        category: str,
        tags: list[str],
        service_lines: list[str],
        account_stages: list[str],
        stored: StoredFile,
        current_user: User,
    ) -> ContentItem:
        return ContentItem(
            title=title.strip(),
            description=description.strip() if description else None,
            content_type=content_type.strip(),
            category=category.strip(),
            tags=tags,
            service_lines=service_lines,
            account_stages=account_stages,
            source_kind="file",
            file_name=stored.file_name,
            file_path=stored.file_path,
            file_storage_backend=stored.storage_backend,
            file_mime_type=stored.mime_type,
            file_size_bytes=stored.size_bytes,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )

    @staticmethod
    def _content_snapshot(item: ContentItem) -> dict:
        return {
            "title": item.title,
            "content_type": item.content_type,
            "category": item.category,
            "source_kind": item.source_kind,
            "is_active": item.is_active,
        }
