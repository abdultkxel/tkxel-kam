from __future__ import annotations

import secrets
import textwrap
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    HandoverShare,
    HandoverSummary,
    SourceDocument,
    TimelineAiSearchAudit,
    TimelineComment,
    TimelineEntry,
    TimelineEventTypeConfig,
    TimelineRetentionAction,
    TimelineRetentionPolicy,
    TimelineTombstone,
    User,
    utc_now,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.repositories.users import UserRepository
from app.schemas import (
    HandoverShareRead,
    HandoverSummaryCreateRequest,
    HandoverSummaryPageRead,
    HandoverSummaryRead,
    TimelineAiDocumentResultRead,
    TimelineAiSearchRequest,
    TimelineAiSearchResponse,
    TimelineAiSearchResultRead,
    TimelineCommentCreateRequest,
    TimelineCommentPageRead,
    TimelineCommentRead,
    TimelineCommentUpdateRequest,
    TimelineEventPageRead,
    TimelineEventRead,
    TimelineEventTypeCreateRequest,
    TimelineEventTypePageRead,
    TimelineEventTypeRead,
    TimelineEventTypeUpdateRequest,
    TimelineEventUpdateRequest,
    TimelineNoteCreateRequest,
    TimelineRetentionActionPageRead,
    TimelineRetentionActionRead,
    TimelineRetentionPolicyCreateRequest,
    TimelineRetentionPolicyPageRead,
    TimelineRetentionPolicyRead,
    TimelineRetentionPolicyUpdateRequest,
    TimelineRetentionResultRead,
    TimelineRetentionRunRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.user_management import page_count


TIMELINE_MODULE = "account_timeline"
HANDOVER_MODULE = "handover_summary"
AI_MODULE = "ai_assistance_search"
ADMIN_MODULE = "admin_audit_security_rbac"
SENSITIVE_ROLES = {"super_admin", "admin", "kam_head", "leadership_viewer", "leadership"}
LEGAL_SENSITIVE_ROLES = {"super_admin", "admin"}
TIMELINE_MODERATOR_ROLES = {"super_admin", "admin", "kam_head"}
DEFAULT_HANDOVER_SECTIONS = [
    "account",
    "engagements",
    "health",
    "risks",
    "signals",
    "escalations",
    "opportunities",
    "governance",
    "stakeholders",
    "content",
    "decisions",
    "recent_timeline",
]


def field_error(field: str, message: str, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"message": message, "errors": [{"field": field, "message": message}]})


class SystemActor:
    id = "system"
    full_name = "System"
    role = "super_admin"
    is_active = True


class TimelineService:
    def __init__(self, repository: TimelineRepository | Session) -> None:
        if isinstance(repository, TimelineRepository):
            self.repository = repository
            self.db = repository.db
        else:
            self.db = repository
            self.repository = TimelineRepository(repository)
        self.accounts = AccountRepository(self.db)
        self.users = UserRepository(self.db)
        self.rbac = RbacRepository(self.db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(self.db))

    def add_account_event(
        self,
        *,
        account_id: str,
        title: str,
        description: str,
        actor: User,
        event_type: str = "account_setup",
        module: str = "manual",
        engagement_id: str | None = None,
        source_record_id: str | None = None,
        source_record_type: str | None = None,
        source_record_route: str | None = None,
        before_value: dict | None = None,
        after_value: dict | None = None,
        metadata: dict | None = None,
        is_sensitive: bool = False,
        sensitivity_level: str | None = None,
        event_at: datetime | None = None,
        tags: list[str] | None = None,
        mentions: list[str] | None = None,
        attachments: list[dict[str, Any]] | None = None,
        source_hash: str | None = None,
        idempotency_key: str | None = None,
    ) -> TimelineEntry:
        event_type_config = self.repository.get_event_type_by_slug(event_type)
        metadata = metadata or {}
        return self.repository.add(
            account_id=account_id,
            engagement_id=engagement_id,
            event_type=event_type,
            module=module,
            title=title,
            description=description,
            performed_by=actor.id,
            performed_by_name=actor.full_name,
            source_record_id=source_record_id,
            source_record_type=source_record_type,
            source_record_route=source_record_route,
            before_value=before_value,
            after_value=after_value,
            metadata=metadata,
            is_sensitive=is_sensitive,
            sensitivity_level=sensitivity_level,
            event_at=event_at or utc_now(),
            tags=tags,
            mentions=mentions,
            attachments=attachments,
            source_hash=source_hash or metadata.get("source_hash"),
            idempotency_key=idempotency_key or metadata.get("idempotency_key"),
            event_type_config_id=event_type_config.id if event_type_config else None,
            is_system_generated=True,
            is_immutable=True,
        )

    def add_engagement_event(
        self,
        *,
        account_id: str,
        engagement_id: str,
        event_type: str,
        title: str,
        description: str,
        actor: User,
        previous_value: dict | None = None,
        new_value: dict | None = None,
        metadata: dict | None = None,
        source_record_id: str | None = None,
        source_record_type: str = "engagement",
        source_record_route: str | None = None,
        is_sensitive: bool = False,
    ) -> None:
        self.add_account_event(
            account_id=account_id,
            engagement_id=engagement_id,
            event_type=event_type,
            module="engagements",
            title=title,
            description=description,
            actor=actor,
            before_value=previous_value,
            after_value=new_value,
            source_record_id=source_record_id or engagement_id,
            source_record_type=source_record_type,
            source_record_route=source_record_route,
            metadata=metadata,
            is_sensitive=is_sensitive,
        )

    def list_engagement_events(
        self,
        engagement_id: str,
        page: int = 1,
        page_size: int = 100,
        *,
        include_sensitive: bool = False,
        include_restricted: bool = False,
    ) -> tuple[list[TimelineEntry], int]:
        return self.repository.list_for_engagement(engagement_id, page=page, page_size=page_size, include_sensitive=include_sensitive, include_restricted=include_restricted)

    def list_account_events(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        event_type: str | None = None,
        module: str | None = None,
        owner_id: str | None = None,
        source_record_type: str | None = None,
        source_record_id: str | None = None,
        status_filter: str | None = None,
        sensitivity_level: str | None = None,
        account_stage: str | None = None,
        risk_status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        show_sensitive: bool = False,
        sort: str = "event_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> TimelineEventPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        if account_stage and account.lifecycle_status != account_stage:
            return TimelineEventPageRead(items=[], total=0, page=page, page_size=page_size, pages=0)
        if risk_status and account.risk_status != risk_status:
            return TimelineEventPageRead(items=[], total=0, page=page, page_size=page_size, pages=0)
        include_sensitive = show_sensitive and self._can_view_sensitive(current_user)
        include_restricted = self._can_view_restricted(current_user)
        items, total = self.repository.list_for_account(
            account_id,
            search=search,
            event_types=[event_type] if event_type else None,
            modules=[module] if module else None,
            owner_id=owner_id,
            source_record_type=source_record_type,
            source_record_id=source_record_id,
            status_filter=status_filter,
            sensitivity_level=sensitivity_level,
            date_from=date_from,
            date_to=date_to,
            include_sensitive=include_sensitive,
            include_restricted=include_restricted,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return TimelineEventPageRead(items=[self._event_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_event(self, event_id: str, current_user: User) -> TimelineEventRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self._require_entry_visible(entry, current_user)
        return self._event_read(entry)

    def create_note(self, account_id: str, payload: TimelineNoteCreateRequest, current_user: User) -> TimelineEventRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self.access.require_module_permission(current_user, TIMELINE_MODULE, "create")
        event_type = self.repository.get_event_type_by_slug(payload.event_type)
        if event_type is None or not event_type.is_active:
            raise field_error("event_type", "Event type is inactive or was not found.")
        owner = self._validate_owner(payload.owner_id, current_user, account)
        self._validate_mentions(payload.mentions)
        self._validate_attachments(payload.attachments)
        is_sensitive = payload.is_sensitive and self._can_view_sensitive(current_user)
        entry = self.repository.add(
            account_id=account_id,
            engagement_id=None,
            event_type=payload.event_type,
            module=event_type.module,
            title=payload.title or event_type.name,
            description=self._clean_text(payload.description),
            performed_by=owner.id,
            performed_by_name=owner.full_name,
            metadata={"notification_redacted": bool(payload.mentions)},
            is_sensitive=is_sensitive,
            sensitivity_level=payload.sensitivity_level if is_sensitive else None,
            event_at=payload.event_at or utc_now(),
            tags=payload.tags or ["manual"],
            mentions=payload.mentions,
            attachments=payload.attachments,
            event_type_config_id=event_type.id,
            is_system_generated=False,
            is_immutable=False,
        )
        self.audit.log(module=TIMELINE_MODULE, action="timeline_note_create", entity_type="timeline_entry", entity_id=entry.id, actor=current_user, after_value=self._audit_event(entry))
        self.repository.commit()
        return self._event_read(entry)

    def update_event(self, event_id: str, payload: TimelineEventUpdateRequest, current_user: User) -> TimelineEventRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        if entry.is_immutable or entry.is_system_generated:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System-generated timeline entries are immutable")
        if entry.performed_by != current_user.id and current_user.role not in TIMELINE_MODERATOR_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author or a timeline moderator can edit this entry")
        before = self._audit_event(entry)
        for field_name in ("title", "event_at", "tags", "mentions", "attachments"):
            value = getattr(payload, field_name)
            if value is not None:
                setattr(entry, field_name, value)
        if payload.description is not None:
            entry.description = self._clean_text(payload.description)
        if payload.is_sensitive is not None:
            if payload.is_sensitive and not self._can_view_sensitive(current_user):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot mark timeline entries sensitive")
            entry.is_sensitive = payload.is_sensitive
        if payload.sensitivity_level is not None:
            entry.sensitivity_level = payload.sensitivity_level if entry.is_sensitive else None
        self._validate_mentions(entry.mentions or [])
        self._validate_attachments(entry.attachments or [])
        entry.updated_at = utc_now()
        self.repository.save_event(entry)
        self.audit.log(module=TIMELINE_MODULE, action="timeline_event_update", entity_type="timeline_entry", entity_id=entry.id, actor=current_user, before_value=before, after_value=self._audit_event(entry))
        self.repository.commit()
        return self._event_read(entry)

    def archive_event(self, event_id: str, current_user: User) -> TimelineEventRead:
        return self._set_event_status(event_id, current_user, "archived")

    def restrict_event(self, event_id: str, current_user: User) -> TimelineEventRead:
        return self._set_event_status(event_id, current_user, "restricted")

    def delete_event(self, event_id: str, current_user: User) -> dict[str, str]:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self.access.require_module_permission(current_user, TIMELINE_MODULE, "delete")
        before = self._audit_event(entry)
        entry.status = "deleted"
        entry.deleted_at = utc_now()
        entry.deleted_by_id = current_user.id
        self._create_tombstone(entry, current_user, policy_id=None)
        self.audit.log(module=TIMELINE_MODULE, action="timeline_event_delete", entity_type="timeline_entry", entity_id=entry.id, actor=current_user, before_value=before, after_value={"status": "deleted"})
        self.repository.commit()
        return {"message": "Timeline entry deleted with audit tombstone"}

    def list_comments(self, event_id: str, current_user: User, page: int = 1, page_size: int = 25) -> TimelineCommentPageRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self._require_entry_visible(entry, current_user)
        items, total = self.repository.list_comments(event_id, page=page, page_size=page_size)
        return TimelineCommentPageRead(items=[self._comment_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_comment(self, event_id: str, payload: TimelineCommentCreateRequest, current_user: User) -> TimelineCommentRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self.access.require_module_permission(current_user, TIMELINE_MODULE, "create")
        self._require_entry_visible(entry, current_user)
        self._validate_mentions(payload.mentions)
        comment = TimelineComment(
            timeline_entry_id=entry.id,
            author_id=current_user.id,
            author_name=current_user.full_name,
            body=self._clean_text(payload.body),
            mentions=payload.mentions,
            is_sensitive=entry.is_sensitive,
            sensitivity_level=entry.sensitivity_level,
        )
        self.repository.add_comment(comment)
        self.audit.log(module=TIMELINE_MODULE, action="timeline_comment_create", entity_type="timeline_comment", entity_id=comment.id, actor=current_user, after_value={"timeline_entry_id": entry.id, "mentions": payload.mentions})
        self.repository.commit()
        return self._comment_read(comment)

    def update_comment(self, event_id: str, comment_id: str, payload: TimelineCommentUpdateRequest, current_user: User) -> TimelineCommentRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self._require_entry_visible(entry, current_user)
        comment = self._get_comment_or_404(comment_id, event_id)
        self._require_comment_mutation(comment, current_user)
        self._validate_mentions(payload.mentions)
        before = {"body": comment.body, "mentions": comment.mentions}
        comment.body = self._clean_text(payload.body)
        comment.mentions = payload.mentions
        comment.edited_at = utc_now()
        comment.updated_at = utc_now()
        self.audit.log(module=TIMELINE_MODULE, action="timeline_comment_update", entity_type="timeline_comment", entity_id=comment.id, actor=current_user, before_value=before, after_value={"body": comment.body, "mentions": comment.mentions})
        self.repository.commit()
        return self._comment_read(comment)

    def delete_comment(self, event_id: str, comment_id: str, current_user: User) -> dict[str, str]:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self._require_entry_visible(entry, current_user)
        comment = self._get_comment_or_404(comment_id, event_id)
        self._require_comment_mutation(comment, current_user)
        comment.deleted_at = utc_now()
        comment.updated_at = utc_now()
        self.audit.log(module=TIMELINE_MODULE, action="timeline_comment_delete", entity_type="timeline_comment", entity_id=comment.id, actor=current_user, before_value={"body": comment.body}, after_value={"deleted_at": comment.deleted_at.isoformat()})
        self.repository.commit()
        return {"message": "Timeline comment deleted"}

    def list_event_types(self, current_user: User, *, search: str | None, active_state: str, category: str | None, module: str | None, page: int, page_size: int) -> TimelineEventTypePageRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        items, total = self.repository.list_event_types(search=search, active_state=active_state, category=category, module=module, page=page, page_size=page_size)
        return TimelineEventTypePageRead(items=[self._event_type_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_event_type(self, payload: TimelineEventTypeCreateRequest, current_user: User) -> TimelineEventTypeRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        if self.repository.get_event_type_by_slug(payload.slug):
            raise field_error("slug", "Event type slug already exists.")
        event_type = TimelineEventTypeConfig(**payload.model_dump(), created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.add_event_type(event_type)
        self.audit.log(module=TIMELINE_MODULE, action="timeline_event_type_create", entity_type="timeline_event_type", entity_id=event_type.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return self._event_type_read(event_type)

    def update_event_type(self, type_id: str, payload: TimelineEventTypeUpdateRequest, current_user: User) -> TimelineEventTypeRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        event_type = self._get_event_type_or_404(type_id)
        before = self._event_type_read(event_type).model_dump(mode="json")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(event_type, key, value)
        event_type.updated_by_id = current_user.id
        event_type.updated_at = utc_now()
        self.audit.log(module=TIMELINE_MODULE, action="timeline_event_type_update", entity_type="timeline_event_type", entity_id=event_type.id, actor=current_user, before_value=before, after_value=payload.model_dump(exclude_unset=True))
        self.repository.commit()
        return self._event_type_read(event_type)

    def list_retention_policies(self, current_user: User, *, search: str | None, active_state: str, entity_type: str | None, page: int, page_size: int) -> TimelineRetentionPolicyPageRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        items, total = self.repository.list_retention_policies(search=search, active_state=active_state, entity_type=entity_type, page=page, page_size=page_size)
        return TimelineRetentionPolicyPageRead(items=[self._retention_policy_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_retention_policy(self, payload: TimelineRetentionPolicyCreateRequest, current_user: User) -> TimelineRetentionPolicyRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        next_run_at = utc_now() + timedelta(hours=payload.schedule_interval_hours) if payload.schedule_enabled else None
        policy = TimelineRetentionPolicy(**payload.model_dump(), next_run_at=next_run_at, created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.add_retention_policy(policy)
        self.audit.log(module=TIMELINE_MODULE, action="retention_policy_create", entity_type="timeline_retention_policy", entity_id=policy.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return self._retention_policy_read(policy)

    def update_retention_policy(self, policy_id: str, payload: TimelineRetentionPolicyUpdateRequest, current_user: User) -> TimelineRetentionPolicyRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        policy = self._get_retention_policy_or_404(policy_id)
        before = self._retention_policy_read(policy).model_dump(mode="json")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(policy, key, value)
        if payload.schedule_enabled is not None or payload.schedule_interval_hours is not None:
            policy.next_run_at = utc_now() + timedelta(hours=policy.schedule_interval_hours) if policy.schedule_enabled else None
        policy.updated_by_id = current_user.id
        policy.updated_at = utc_now()
        self.audit.log(module=TIMELINE_MODULE, action="retention_policy_update", entity_type="timeline_retention_policy", entity_id=policy.id, actor=current_user, before_value=before, after_value=payload.model_dump(exclude_unset=True))
        self.repository.commit()
        return self._retention_policy_read(policy)

    def simulate_retention_policy(self, policy_id: str, payload: TimelineRetentionRunRequest, current_user: User) -> TimelineRetentionResultRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        policy = self._get_retention_policy_or_404(policy_id)
        candidates = self.repository.list_retention_candidates(policy, limit=payload.limit)
        return TimelineRetentionResultRead(policy_id=policy.id, action=policy.action, mode="simulation", matched_count=len(candidates), affected_count=0, sample_event_ids=[item.id for item in candidates[:10]])

    def run_retention_policy(self, policy_id: str, payload: TimelineRetentionRunRequest, current_user: User) -> TimelineRetentionResultRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        policy = self._get_retention_policy_or_404(policy_id)
        result = self._apply_retention_policy(policy, actor=current_user, mode="manual", reason=payload.reason, limit=payload.limit)
        self.repository.commit()
        return result

    def run_due_retention_policies(self, *, limit: int = 500) -> list[TimelineRetentionResultRead]:
        actor = SystemActor()
        now = utc_now()
        results: list[TimelineRetentionResultRead] = []
        for policy in self.repository.due_retention_policies(now):
            results.append(self._apply_retention_policy(policy, actor=actor, mode="scheduled", reason=policy.reason_template, limit=limit))
        self.repository.commit()
        return results

    def list_retention_actions(self, current_user: User, *, search: str | None, action: str | None, mode: str | None, actor_id: str | None, entity_type: str | None, status_filter: str | None, page: int, page_size: int) -> TimelineRetentionActionPageRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        items, total = self.repository.list_retention_actions(search=search, action=action, mode=mode, actor_id=actor_id, entity_type=entity_type, status_filter=status_filter, page=page, page_size=page_size)
        return TimelineRetentionActionPageRead(items=[self._retention_action_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def generate_handover_summary(self, account_id: str, payload: HandoverSummaryCreateRequest, current_user: User) -> HandoverSummaryRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=HANDOVER_MODULE)
        self.access.require_module_permission(current_user, HANDOVER_MODULE, "create")
        sections = payload.selected_sections or DEFAULT_HANDOVER_SECTIONS
        timeline_page = self.list_account_events(
            account_id,
            current_user,
            date_from=payload.date_from,
            date_to=payload.date_to,
            page=1,
            page_size=50,
        )
        timeline_items = timeline_page.items
        content = self._build_handover_content(account, timeline_items, sections)
        citations = self._handover_citations(timeline_items)
        source_set = [{"type": "timeline_entry", "id": item.id} for item in timeline_items[:25]]
        summary = HandoverSummary(
            account_id=account_id,
            generated_by_id=current_user.id,
            generated_by_name=current_user.full_name,
            ownership_change_id=payload.ownership_change_id,
            selected_sections=sections,
            source_set_json=source_set,
            redaction_summary={"restricted_sources_omitted": "not_disclosed", "authorized_sources_included": len(timeline_items)},
            citations_json=citations,
            content_json=content,
            status="complete",
        )
        self.repository.add_handover_summary(summary)
        self.audit.log(module=HANDOVER_MODULE, action="handover_generate", entity_type="handover_summary", entity_id=summary.id, actor=current_user, after_value={"sections": sections, "source_count": len(source_set)})
        self.repository.commit()
        return self._handover_read(summary)

    def list_handover_summaries(
        self,
        account_id: str,
        current_user: User,
        page: int = 1,
        page_size: int = 25,
        *,
        search: str | None = None,
        generated_by_id: str | None = None,
        ownership_change_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> HandoverSummaryPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=HANDOVER_MODULE)
        items, total = self.repository.list_handover_summaries(
            account_id,
            page=page,
            page_size=page_size,
            search=search,
            generated_by_id=generated_by_id,
            ownership_change_id=ownership_change_id,
            date_from=date_from,
            date_to=date_to,
        )
        return HandoverSummaryPageRead(items=[self._handover_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_handover_summary(self, summary_id: str, current_user: User) -> HandoverSummaryRead:
        summary = self._get_handover_or_404(summary_id)
        account = self._get_account_or_404(summary.account_id)
        self.access.require_account_view(current_user, account, module=HANDOVER_MODULE)
        return self._handover_read(summary)

    def export_handover_pdf(self, summary_id: str, current_user: User) -> bytes:
        summary = self._get_handover_or_404(summary_id)
        account = self._get_account_or_404(summary.account_id)
        self.access.require_account_view(current_user, account, module=HANDOVER_MODULE)
        self.access.require_module_permission(current_user, HANDOVER_MODULE, "export")
        summary.export_metadata_json = {**(summary.export_metadata_json or {}), "last_pdf_exported_at": utc_now().isoformat(), "last_exported_by": current_user.id}
        self.audit.log(module=HANDOVER_MODULE, action="handover_pdf_export", entity_type="handover_summary", entity_id=summary.id, actor=current_user)
        self.repository.commit()
        return self._handover_pdf_bytes(summary)

    def share_handover(self, summary_id: str, current_user: User) -> HandoverShareRead:
        summary = self._get_handover_or_404(summary_id)
        account = self._get_account_or_404(summary.account_id)
        self.access.require_account_view(current_user, account, module=HANDOVER_MODULE)
        self.access.require_module_permission(current_user, HANDOVER_MODULE, "export")
        share = HandoverShare(
            handover_summary_id=summary.id,
            account_id=summary.account_id,
            share_token=secrets.token_urlsafe(24),
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.add_handover_share(share)
        internal_url = f"/accounts/{summary.account_id}?tab=timeline&handover={summary.id}&share={share.id}"
        summary.share_metadata_json = {"last_share_id": share.id, "internal_share_url": internal_url, "shared_at": utc_now().isoformat()}
        self.audit.log(module=HANDOVER_MODULE, action="handover_internal_share", entity_type="handover_summary", entity_id=summary.id, actor=current_user, after_value={"share_id": share.id})
        self.repository.commit()
        return HandoverShareRead(summary_id=summary.id, share_id=share.id, internal_share_url=internal_url, created_at=share.created_at, expires_at=share.expires_at)

    def ai_timeline_search(self, account_id: str, payload: TimelineAiSearchRequest, current_user: User) -> TimelineAiSearchResponse:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        intent = self._interpret_intent(payload.query)
        page = self.list_account_events(
            account_id,
            current_user,
            search=self._structured_keyword(payload.query, intent),
            module=payload.source_module,
            source_record_type=payload.source_type,
            date_from=payload.date_from,
            date_to=payload.date_to,
            page=1,
            page_size=max(payload.limit, 10),
        )
        scored = self._score_search_results(page.items, payload.query, intent)[: payload.limit]
        document_results = self._search_documents(account_id, payload.query, current_user, limit=payload.limit) if payload.document_search else []
        answer = self._search_answer(payload.query, intent, scored, document_results)
        audit = TimelineAiSearchAudit(
            account_id=account_id,
            user_id=current_user.id,
            query=payload.query,
            interpreted_intent=intent,
            scopes=payload.scopes,
            source_ids=[item.id for item in scored],
            redactions={"restricted_sources_omitted": "not_disclosed"},
        )
        self.repository.add_ai_search_audit(audit)
        self.audit.log(module=AI_MODULE, action="timeline_ai_search", entity_type="timeline_ai_search", entity_id=audit.id, actor=current_user, after_value={"intent": intent, "source_count": len(scored), "document_count": len(document_results)})
        self.repository.commit()
        return TimelineAiSearchResponse(
            query=payload.query,
            interpreted_intent=intent,
            mode="structured" if intent != "semantic_timeline_search" else "semantic",
            confidence="high" if scored else "low",
            answer=answer,
            disclaimer="Results are limited to timeline and document sources you are authorized to view.",
            results=[
                TimelineAiSearchResultRead(
                    id=item.id,
                    title=item.title,
                    excerpt=item.description[:260],
                    event_type=item.event_type,
                    source_module=item.source_module,
                    source_route=item.source_record_route,
                    event_at=item.event_at or item.created_at,
                    relevance=float(index + 1),
                    mode="structured" if intent != "semantic_timeline_search" else "semantic",
                )
                for index, item in enumerate(scored)
            ],
            document_results=document_results,
            audit_id=audit.id,
            can_try_in_kam_ai=True,
        )

    def _set_event_status(self, event_id: str, current_user: User, next_status: str) -> TimelineEventRead:
        entry = self._get_event_or_404(event_id)
        account = self._get_account_or_404(entry.account_id)
        self.access.require_account_view(current_user, account, module=TIMELINE_MODULE)
        self.access.require_module_permission(current_user, TIMELINE_MODULE, "update")
        before = self._audit_event(entry)
        entry.status = next_status
        if next_status == "archived":
            entry.archived_at = utc_now()
        if next_status == "restricted":
            entry.restricted_at = utc_now()
            entry.is_sensitive = True
            entry.sensitivity_level = entry.sensitivity_level or "commercial"
        self.audit.log(module=TIMELINE_MODULE, action=f"timeline_event_{next_status}", entity_type="timeline_entry", entity_id=entry.id, actor=current_user, before_value=before, after_value=self._audit_event(entry))
        self.repository.commit()
        return self._event_read(entry)

    def _apply_retention_policy(self, policy: TimelineRetentionPolicy, *, actor: User | SystemActor, mode: str, reason: str | None, limit: int) -> TimelineRetentionResultRead:
        candidates = self.repository.list_retention_candidates(policy, limit=limit)
        affected = 0
        for entry in candidates:
            if policy.action == "archive":
                entry.status = "archived"
                entry.archived_at = utc_now()
            elif policy.action == "restrict":
                entry.status = "restricted"
                entry.restricted_at = utc_now()
                entry.is_sensitive = True
                entry.sensitivity_level = entry.sensitivity_level or "commercial"
            elif policy.action == "delete":
                entry.status = "deleted"
                entry.deleted_at = utc_now()
                entry.deleted_by_id = actor.id
                self._create_tombstone(entry, actor, policy_id=policy.id)
            entry.retention_policy_id = policy.id
            affected += 1
        policy.last_run_at = utc_now()
        policy.next_run_at = policy.last_run_at + timedelta(hours=policy.schedule_interval_hours) if policy.schedule_enabled else None
        action = TimelineRetentionAction(
            policy_id=policy.id,
            entity_type=policy.entity_type,
            action=policy.action,
            mode=mode,
            status="complete",
            matched_count=len(candidates),
            affected_count=affected,
            reason=reason or policy.reason_template,
            actor_id=actor.id,
            actor_name=actor.full_name,
            metadata_json={"sample_event_ids": [item.id for item in candidates[:10]]},
        )
        self.repository.add_retention_action(action)
        self.audit.log(module=TIMELINE_MODULE, action="retention_policy_run", entity_type="timeline_retention_policy", entity_id=policy.id, actor=actor, after_value={"mode": mode, "matched": len(candidates), "affected": affected})
        return TimelineRetentionResultRead(policy_id=policy.id, action=policy.action, mode=mode, matched_count=len(candidates), affected_count=affected, sample_event_ids=[item.id for item in candidates[:10]])

    def _create_tombstone(self, entry: TimelineEntry, actor: User | SystemActor, policy_id: str | None) -> None:
        tombstone = TimelineTombstone(
            original_event_id=entry.id,
            account_id=entry.account_id,
            retention_policy_id=policy_id,
            deleted_by_id=actor.id,
            deleted_by_name=actor.full_name,
            redacted_metadata_json={
                "event_type": entry.event_type,
                "module": entry.module,
                "source_record_type": entry.source_record_type,
                "redacted": bool(entry.is_sensitive),
            },
        )
        self.repository.add_tombstone(tombstone)
        self.add_account_event(
            account_id=entry.account_id,
            title="Timeline entry deleted by retention policy",
            description=f"Timeline entry {entry.id} was deleted with audit-preserving tombstone.",
            actor=actor,
            event_type="retention_event",
            module="manual",
            source_record_id=entry.id,
            source_record_type="timeline_entry",
            metadata={"tombstone_id": tombstone.id, "policy_id": policy_id},
        )

    def _build_handover_content(self, account: Account, timeline_items: list[TimelineEventRead], sections: list[str]) -> dict[str, Any]:
        latest = timeline_items[:10]
        return {
            "account": {"name": account.name, "stage": account.lifecycle_status, "risk_status": account.risk_status, "segment": account.segment, "region": account.region},
            "health": {"overall": account.health_overall, "relationship": account.health_relationship, "usage": account.health_usage, "delivery": account.health_delivery, "commercial": account.health_commercial},
            "risks": {"status": account.risk_status, "commercial_summary": account.commercial_summary},
            "recent_timeline": [item.model_dump(mode="json") for item in latest],
            "decisions": [item.model_dump(mode="json") for item in timeline_items if item.event_type in {"approval_event", "executive_event", "governance_event"}][:10],
            "selected_sections": sections,
        }

    @staticmethod
    def _handover_citations(timeline_items: list[TimelineEventRead]) -> list[dict[str, Any]]:
        return [
            {
                "id": item.id,
                "label": item.title,
                "source_type": item.source_record_type or "timeline_entry",
                "source_route": item.source_record_route,
                "excerpt": item.description[:180],
            }
            for item in timeline_items[:25]
        ]

    def _search_documents(self, account_id: str, query: str, current_user: User, *, limit: int) -> list[TimelineAiDocumentResultRead]:
        normalized = query.lower()
        documents = self.db.query(SourceDocument).filter(SourceDocument.account_id == account_id).limit(100).all()
        results: list[TimelineAiDocumentResultRead] = []
        for document in documents:
            citation_text = " ".join(citation.excerpt for citation in document.citations)
            haystack = " ".join([document.title or "", document.file_name or "", document.source_type or "", citation_text]).lower()
            if normalized not in haystack:
                continue
            excerpt = citation_text or document.title or document.file_name or "Authorized document source"
            results.append(
                TimelineAiDocumentResultRead(
                    id=document.id,
                    source_label=document.title or document.file_name or "Document",
                    excerpt=excerpt[:260],
                    source_route=f"/accounts/{account_id}?tab=documents",
                )
            )
            if len(results) >= limit:
                break
        return results

    @staticmethod
    def _interpret_intent(query: str) -> str:
        normalized = query.lower()
        if "escalation" in normalized:
            return "escalation_history"
        if "stage" in normalized:
            return "stage_changes"
        if "score" in normalized or "health" in normalized:
            return "score_changes"
        if "approval" in normalized:
            return "approval_events"
        if "content" in normalized or "education" in normalized:
            return "content_sent"
        if "qbr" in normalized or "governance" in normalized:
            return "activity_since_last_qbr"
        if "risk" in normalized:
            return "open_timeline_linked_risks"
        if "90" in normalized or "recent" in normalized:
            return "last_90_days_activity"
        return "semantic_timeline_search"

    @staticmethod
    def _structured_keyword(query: str, intent: str) -> str:
        return {
            "escalation_history": "escalation",
            "stage_changes": "stage",
            "score_changes": "score",
            "approval_events": "approval",
            "content_sent": "content",
            "activity_since_last_qbr": "governance",
            "open_timeline_linked_risks": "risk",
            "last_90_days_activity": "",
        }.get(intent, query)

    @staticmethod
    def _score_search_results(items: list[TimelineEventRead], query: str, intent: str) -> list[TimelineEventRead]:
        if intent == "last_90_days_activity":
            cutoff = utc_now() - timedelta(days=90)
            return [item for item in items if (item.event_at or item.created_at) >= cutoff]
        return items

    @staticmethod
    def _search_answer(query: str, intent: str, results: list[TimelineEventRead], document_results: list[TimelineAiDocumentResultRead]) -> str:
        if not results and not document_results:
            return f"No authorized timeline or document sources matched '{query}'."
        return f"Found {len(results)} authorized timeline result(s) for {intent.replace('_', ' ')} and {len(document_results)} authorized document result(s)."

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_event_or_404(self, event_id: str) -> TimelineEntry:
        entry = self.repository.get_event(event_id)
        if entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline entry was not found")
        return entry

    def _get_comment_or_404(self, comment_id: str, event_id: str) -> TimelineComment:
        comment = self.repository.get_comment(comment_id)
        if comment is None or comment.timeline_entry_id != event_id or comment.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline comment was not found")
        return comment

    def _get_event_type_or_404(self, type_id: str) -> TimelineEventTypeConfig:
        event_type = self.repository.get_event_type(type_id)
        if event_type is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline event type was not found")
        return event_type

    def _get_retention_policy_or_404(self, policy_id: str) -> TimelineRetentionPolicy:
        policy = self.repository.get_retention_policy(policy_id)
        if policy is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retention policy was not found")
        return policy

    def _get_handover_or_404(self, summary_id: str) -> HandoverSummary:
        summary = self.repository.get_handover_summary(summary_id)
        if summary is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handover summary was not found")
        return summary

    def _validate_owner(self, owner_id: str | None, fallback: User, account: Account) -> User:
        if owner_id is None:
            return fallback
        owner = self.users.get_by_id(owner_id)
        if owner is None or not owner.is_active:
            raise field_error("owner_id", "Owner must be an active user.")
        if not self.access.can_view_account(owner, account):
            raise field_error("owner_id", "Owner must be authorized for this account.")
        return owner

    def _validate_mentions(self, mentions: list[str]) -> None:
        for mention_id in mentions:
            user = self.users.get_by_id(mention_id)
            if user is None or not user.is_active:
                raise field_error("mentions", "Mentions must reference active users.")

    @staticmethod
    def _validate_attachments(attachments: list[dict[str, Any]]) -> None:
        for index, attachment in enumerate(attachments):
            url = str(attachment.get("url", "")).strip()
            if url and not url.startswith(("http://", "https://")):
                raise field_error(f"attachments.{index}.url", "Attachment URL must be http or https.")

    @staticmethod
    def _clean_text(value: str) -> str:
        return value.strip().replace("\x00", "")

    def _require_entry_visible(self, entry: TimelineEntry, current_user: User) -> None:
        if entry.status == "deleted":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline entry was not found")
        if entry.status == "restricted" and not self._can_view_restricted(current_user):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline entry was not found")
        if entry.is_sensitive and not self._can_view_entry_sensitive(entry, current_user):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline entry was not found")

    @staticmethod
    def _can_view_sensitive(user: User) -> bool:
        return user.role in SENSITIVE_ROLES

    @staticmethod
    def _can_view_restricted(user: User) -> bool:
        return user.role in TIMELINE_MODERATOR_ROLES

    @staticmethod
    def _can_view_entry_sensitive(entry: TimelineEntry, user: User) -> bool:
        if not entry.is_sensitive:
            return True
        if entry.sensitivity_level in {"legal", "executive"}:
            return user.role in LEGAL_SENSITIVE_ROLES
        if entry.event_type == "manual_note" and entry.performed_by == user.id:
            return True
        return user.role in SENSITIVE_ROLES

    def _require_comment_mutation(self, comment: TimelineComment, current_user: User) -> None:
        if comment.author_id == current_user.id:
            return
        if current_user.role in TIMELINE_MODERATOR_ROLES:
            return
        if self.rbac.role_has_permission(current_user.role, TIMELINE_MODULE, "delete"):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author or a timeline moderator can change this comment")

    @staticmethod
    def _audit_event(entry: TimelineEntry) -> dict[str, Any]:
        return {
            "id": entry.id,
            "event_type": entry.event_type,
            "title": entry.title,
            "status": entry.status,
            "is_sensitive": entry.is_sensitive,
            "sensitivity_level": entry.sensitivity_level,
            "event_at": entry.event_at.isoformat() if entry.event_at else None,
        }

    @staticmethod
    def _event_read(entry: TimelineEntry) -> TimelineEventRead:
        return TimelineEventRead(
            id=entry.id,
            account_id=entry.account_id,
            engagement_id=entry.engagement_id,
            event_type=entry.event_type,
            module=entry.module,
            title=entry.title,
            description=entry.description,
            previous_value=entry.before_value,
            new_value=entry.after_value,
            before_value=entry.before_value,
            after_value=entry.after_value,
            actor_id=entry.performed_by,
            actor_name=entry.performed_by_name,
            performed_by=entry.performed_by,
            performed_by_name=entry.performed_by_name,
            source_module=entry.module,
            source_record_id=entry.source_record_id,
            source_record_type=entry.source_record_type,
            source_record_route=entry.source_record_route,
            metadata=entry.metadata_json,
            event_at=entry.event_at,
            timestamp=entry.event_at,
            is_sensitive=entry.is_sensitive,
            sensitivity_level=entry.sensitivity_level,
            tags=list(entry.tags or []),
            mentions=list(entry.mentions or []),
            attachments=list(entry.attachments or []),
            status=entry.status,
            is_system_generated=entry.is_system_generated,
            is_immutable=entry.is_immutable,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )

    @staticmethod
    def _comment_read(comment: TimelineComment) -> TimelineCommentRead:
        return TimelineCommentRead(
            id=comment.id,
            timeline_entry_id=comment.timeline_entry_id,
            author_id=comment.author_id,
            author_name=comment.author_name,
            body=comment.body,
            mentions=list(comment.mentions or []),
            is_sensitive=comment.is_sensitive,
            sensitivity_level=comment.sensitivity_level,
            edited_at=comment.edited_at,
            deleted_at=comment.deleted_at,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
        )

    @staticmethod
    def _event_type_read(item: TimelineEventTypeConfig) -> TimelineEventTypeRead:
        return TimelineEventTypeRead(
            id=item.id,
            slug=item.slug,
            name=item.name,
            category=item.category,
            module=item.module,
            color_token=item.color_token,
            display_order=item.display_order,
            default_visibility=item.default_visibility,
            retention_policy_id=item.retention_policy_id,
            is_active=item.is_active,
            is_critical=item.is_critical,
            critical_rule_json=dict(item.critical_rule_json or {}),
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _retention_policy_read(item: TimelineRetentionPolicy) -> TimelineRetentionPolicyRead:
        return TimelineRetentionPolicyRead(
            id=item.id,
            name=item.name,
            entity_type=item.entity_type,
            action=item.action,
            duration_days=item.duration_days,
            reason_template=item.reason_template,
            critical_behavior=item.critical_behavior,
            schedule_enabled=item.schedule_enabled,
            schedule_interval_hours=item.schedule_interval_hours,
            last_run_at=item.last_run_at,
            next_run_at=item.next_run_at,
            is_active=item.is_active,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _retention_action_read(item: TimelineRetentionAction) -> TimelineRetentionActionRead:
        return TimelineRetentionActionRead(
            id=item.id,
            policy_id=item.policy_id,
            entity_type=item.entity_type,
            action=item.action,
            mode=item.mode,
            status=item.status,
            matched_count=item.matched_count,
            affected_count=item.affected_count,
            reason=item.reason,
            actor_id=item.actor_id,
            actor_name=item.actor_name,
            error_message=item.error_message,
            metadata=dict(item.metadata_json or {}),
            created_at=item.created_at,
        )

    @staticmethod
    def _handover_read(item: HandoverSummary) -> HandoverSummaryRead:
        return HandoverSummaryRead(
            id=item.id,
            account_id=item.account_id,
            generated_by_id=item.generated_by_id,
            generated_by_name=item.generated_by_name,
            ownership_change_id=item.ownership_change_id,
            selected_sections=list(item.selected_sections or []),
            source_set=list(item.source_set_json or []),
            redaction_summary=dict(item.redaction_summary or {}),
            citations=list(item.citations_json or []),
            content=dict(item.content_json or {}),
            status=item.status,
            export_metadata=dict(item.export_metadata_json or {}),
            share_metadata=dict(item.share_metadata_json or {}),
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _pdf_text(summary: HandoverSummary) -> str:
        account = summary.content_json.get("account", {}) if summary.content_json else {}
        name = account.get("name", "Account")
        return f"Handover summary {summary.id} for {name}"

    def _handover_pdf_bytes(self, summary: HandoverSummary) -> bytes:
        text = self._pdf_text(summary)
        sections = ", ".join(summary.selected_sections or []) or "selected account sections"
        citation_count = len(summary.citations_json or [])
        redaction_count = (summary.redaction_summary or {}).get("sensitive_omitted", 0)
        lines = [
            "KAM Handover Summary",
            text,
            f"Generated by: {summary.generated_by_name}",
            f"Generated at: {summary.created_at.isoformat()}",
            f"Sections: {sections}",
            f"Citations: {citation_count}",
            f"Sensitive sources omitted: {redaction_count}",
        ]
        return self._simple_pdf(lines)

    @staticmethod
    def _simple_pdf(lines: list[str]) -> bytes:
        escaped_lines: list[str] = []
        for line in lines:
            ascii_line = line.encode("latin-1", "replace").decode("latin-1")
            for wrapped in textwrap.wrap(ascii_line, width=88) or [""]:
                escaped_lines.append(wrapped.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)"))
        content = "BT\n/F1 12 Tf\n72 750 Td\n16 TL\n" + "".join(f"({line}) Tj\nT*\n" for line in escaped_lines[:42]) + "ET\n"
        content_bytes = content.encode("latin-1", "replace")
        objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            b"<< /Length " + str(len(content_bytes)).encode("ascii") + b" >>\nstream\n" + content_bytes + b"endstream",
        ]
        pdf = b"%PDF-1.4\n"
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(pdf))
            pdf += f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
        xref_offset = len(pdf)
        pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
        pdf += b"0000000000 65535 f \n"
        for offset in offsets[1:]:
            pdf += f"{offset:010d} 00000 n \n".encode("ascii")
        pdf += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
        return pdf
