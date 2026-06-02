from datetime import datetime, timezone

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    HandoverShare,
    HandoverSummary,
    TimelineAiSearchAudit,
    TimelineComment,
    TimelineEntry,
    TimelineEventTypeConfig,
    TimelineRetentionAction,
    TimelineRetentionPolicy,
    TimelineTombstone,
)


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
        sensitivity_level: str | None = None,
        event_at: datetime | None = None,
        tags: list | None = None,
        mentions: list | None = None,
        attachments: list | None = None,
        source_hash: str | None = None,
        idempotency_key: str | None = None,
        event_type_config_id: str | None = None,
        is_system_generated: bool = True,
        is_immutable: bool = True,
    ) -> TimelineEntry:
        existing = self.get_by_dedup_key(account_id=account_id, source_hash=source_hash, idempotency_key=idempotency_key)
        if existing is not None:
            return existing

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
            sensitivity_level=sensitivity_level,
            event_at=event_at,
            tags=tags or [],
            mentions=mentions or [],
            attachments=attachments or [],
            source_hash=source_hash,
            idempotency_key=idempotency_key,
            event_type_config_id=event_type_config_id,
            is_system_generated=is_system_generated,
            is_immutable=is_immutable,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def get_by_dedup_key(self, *, account_id: str, source_hash: str | None, idempotency_key: str | None) -> TimelineEntry | None:
        if not source_hash and not idempotency_key:
            return None
        conditions = [TimelineEntry.account_id == account_id]
        dedup_conditions = []
        if source_hash:
            dedup_conditions.append(TimelineEntry.source_hash == source_hash)
        if idempotency_key:
            dedup_conditions.append(TimelineEntry.idempotency_key == idempotency_key)
        return self.db.scalar(select(TimelineEntry).where(*conditions, or_(*dedup_conditions)))

    def get_event(self, event_id: str) -> TimelineEntry | None:
        return self.db.get(TimelineEntry, event_id)

    def get_account_event(self, account_id: str, event_id: str) -> TimelineEntry | None:
        return self.db.scalar(select(TimelineEntry).where(TimelineEntry.id == event_id, TimelineEntry.account_id == account_id))

    def list_for_account(
        self,
        account_id: str,
        *,
        search: str | None = None,
        event_types: list[str] | None = None,
        modules: list[str] | None = None,
        owner_id: str | None = None,
        source_record_type: str | None = None,
        source_record_id: str | None = None,
        status_filter: str | None = None,
        sensitivity_level: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        include_sensitive: bool = False,
        include_restricted: bool = False,
        sort: str = "event_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> tuple[list[TimelineEntry], int]:
        conditions = self._timeline_conditions(
            account_id=account_id,
            search=search,
            event_types=event_types,
            modules=modules,
            owner_id=owner_id,
            source_record_type=source_record_type,
            source_record_id=source_record_id,
            status_filter=status_filter,
            sensitivity_level=sensitivity_level,
            date_from=date_from,
            date_to=date_to,
            include_sensitive=include_sensitive,
            include_restricted=include_restricted,
        )
        total = self.db.scalar(select(func.count(TimelineEntry.id)).where(*conditions)) or 0
        order_column = TimelineEntry.event_at if sort == "event_at" else TimelineEntry.created_at
        order_column = order_column.desc() if direction == "desc" else order_column.asc()
        items = list(
            self.db.scalars(
                select(TimelineEntry)
                .where(*conditions)
                .order_by(order_column, TimelineEntry.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_for_engagement(
        self,
        engagement_id: str,
        page: int = 1,
        page_size: int = 100,
        *,
        include_sensitive: bool = False,
        include_restricted: bool = False,
    ) -> tuple[list[TimelineEntry], int]:
        conditions = [TimelineEntry.engagement_id == engagement_id, TimelineEntry.status != "deleted"]
        if not include_restricted:
            conditions.append(TimelineEntry.status != "restricted")
        if not include_sensitive:
            conditions.append(TimelineEntry.is_sensitive.is_(False))
        total = self.db.scalar(select(func.count(TimelineEntry.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineEntry)
                .where(*conditions)
                .order_by(TimelineEntry.event_at.desc(), TimelineEntry.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_retention_candidates(self, policy: TimelineRetentionPolicy, *, limit: int = 500) -> list[TimelineEntry]:
        cutoff = datetime.now(timezone.utc) - policy_duration(policy)
        conditions = [
            TimelineEntry.status == "active",
            TimelineEntry.event_at <= cutoff,
        ]
        return list(
            self.db.scalars(
                select(TimelineEntry)
                .where(*conditions)
                .order_by(TimelineEntry.event_at.asc())
                .limit(limit)
            )
        )

    def save_event(self, entry: TimelineEntry) -> TimelineEntry:
        self.db.add(entry)
        self.db.flush()
        return entry

    def add_comment(self, comment: TimelineComment) -> TimelineComment:
        self.db.add(comment)
        self.db.flush()
        return comment

    def get_comment(self, comment_id: str) -> TimelineComment | None:
        return self.db.get(TimelineComment, comment_id)

    def list_comments(self, event_id: str, page: int = 1, page_size: int = 25) -> tuple[list[TimelineComment], int]:
        conditions = [TimelineComment.timeline_entry_id == event_id, TimelineComment.deleted_at.is_(None)]
        total = self.db.scalar(select(func.count(TimelineComment.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineComment)
                .where(*conditions)
                .order_by(TimelineComment.created_at.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_event_types(
        self,
        *,
        search: str | None = None,
        active_state: str = "all",
        category: str | None = None,
        module: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[TimelineEventTypeConfig], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(TimelineEventTypeConfig.name.ilike(term), TimelineEventTypeConfig.slug.ilike(term)))
        if active_state == "active":
            conditions.append(TimelineEventTypeConfig.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(TimelineEventTypeConfig.is_active.is_(False))
        if category:
            conditions.append(TimelineEventTypeConfig.category == category)
        if module:
            conditions.append(TimelineEventTypeConfig.module == module)
        total = self.db.scalar(select(func.count(TimelineEventTypeConfig.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineEventTypeConfig)
                .where(*conditions)
                .order_by(TimelineEventTypeConfig.display_order.asc(), TimelineEventTypeConfig.name.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_event_type(self, type_id: str) -> TimelineEventTypeConfig | None:
        return self.db.get(TimelineEventTypeConfig, type_id)

    def get_event_type_by_slug(self, slug: str) -> TimelineEventTypeConfig | None:
        return self.db.scalar(select(TimelineEventTypeConfig).where(TimelineEventTypeConfig.slug == slug))

    def add_event_type(self, event_type: TimelineEventTypeConfig) -> TimelineEventTypeConfig:
        self.db.add(event_type)
        self.db.flush()
        return event_type

    def list_retention_policies(
        self,
        *,
        search: str | None = None,
        active_state: str = "all",
        entity_type: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[TimelineRetentionPolicy], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(TimelineRetentionPolicy.name.ilike(term), TimelineRetentionPolicy.reason_template.ilike(term)))
        if active_state == "active":
            conditions.append(TimelineRetentionPolicy.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(TimelineRetentionPolicy.is_active.is_(False))
        if entity_type:
            conditions.append(TimelineRetentionPolicy.entity_type == entity_type)
        total = self.db.scalar(select(func.count(TimelineRetentionPolicy.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineRetentionPolicy)
                .where(*conditions)
                .order_by(TimelineRetentionPolicy.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_retention_policy(self, policy_id: str) -> TimelineRetentionPolicy | None:
        return self.db.get(TimelineRetentionPolicy, policy_id)

    def add_retention_policy(self, policy: TimelineRetentionPolicy) -> TimelineRetentionPolicy:
        self.db.add(policy)
        self.db.flush()
        return policy

    def add_retention_action(self, action: TimelineRetentionAction) -> TimelineRetentionAction:
        self.db.add(action)
        self.db.flush()
        return action

    def add_tombstone(self, tombstone: TimelineTombstone) -> TimelineTombstone:
        self.db.add(tombstone)
        self.db.flush()
        return tombstone

    def list_retention_actions(
        self,
        *,
        search: str | None = None,
        action: str | None = None,
        mode: str | None = None,
        actor_id: str | None = None,
        entity_type: str | None = None,
        status_filter: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[TimelineRetentionAction], int]:
        conditions = []
        if action:
            conditions.append(TimelineRetentionAction.action == action)
        if mode:
            conditions.append(TimelineRetentionAction.mode == mode)
        if actor_id:
            conditions.append(TimelineRetentionAction.actor_id == actor_id)
        if entity_type:
            conditions.append(TimelineRetentionAction.entity_type == entity_type)
        if status_filter:
            conditions.append(TimelineRetentionAction.status == status_filter)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(TimelineRetentionAction.reason.ilike(term), TimelineRetentionAction.actor_name.ilike(term)))
        total = self.db.scalar(select(func.count(TimelineRetentionAction.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(TimelineRetentionAction)
                .where(*conditions)
                .order_by(TimelineRetentionAction.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def due_retention_policies(self, now: datetime) -> list[TimelineRetentionPolicy]:
        return list(
            self.db.scalars(
                select(TimelineRetentionPolicy).where(
                    TimelineRetentionPolicy.is_active.is_(True),
                    TimelineRetentionPolicy.schedule_enabled.is_(True),
                    or_(TimelineRetentionPolicy.next_run_at.is_(None), TimelineRetentionPolicy.next_run_at <= now),
                )
            )
        )

    def add_handover_summary(self, summary: HandoverSummary) -> HandoverSummary:
        self.db.add(summary)
        self.db.flush()
        return summary

    def get_handover_summary(self, summary_id: str) -> HandoverSummary | None:
        return self.db.get(HandoverSummary, summary_id)

    def list_handover_summaries(
        self,
        account_id: str,
        page: int = 1,
        page_size: int = 25,
        *,
        search: str | None = None,
        generated_by_id: str | None = None,
        ownership_change_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[HandoverSummary], int]:
        conditions = [HandoverSummary.account_id == account_id]
        if generated_by_id:
            conditions.append(HandoverSummary.generated_by_id == generated_by_id)
        if ownership_change_id:
            conditions.append(HandoverSummary.ownership_change_id == ownership_change_id)
        if date_from:
            conditions.append(HandoverSummary.created_at >= date_from)
        if date_to:
            conditions.append(HandoverSummary.created_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    HandoverSummary.generated_by_name.ilike(term),
                    cast(HandoverSummary.selected_sections, String).ilike(term),
                    cast(HandoverSummary.citations_json, String).ilike(term),
                    cast(HandoverSummary.content_json, String).ilike(term),
                )
            )
        total = self.db.scalar(select(func.count(HandoverSummary.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(HandoverSummary)
                .where(*conditions)
                .order_by(HandoverSummary.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_handover_share(self, share: HandoverShare) -> HandoverShare:
        self.db.add(share)
        self.db.flush()
        return share

    def add_ai_search_audit(self, audit: TimelineAiSearchAudit) -> TimelineAiSearchAudit:
        self.db.add(audit)
        self.db.flush()
        return audit

    @staticmethod
    def _timeline_conditions(
        *,
        account_id: str,
        search: str | None,
        event_types: list[str] | None,
        modules: list[str] | None,
        owner_id: str | None,
        source_record_type: str | None,
        source_record_id: str | None,
        status_filter: str | None,
        sensitivity_level: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        include_sensitive: bool,
        include_restricted: bool,
    ) -> list:
        conditions = [TimelineEntry.account_id == account_id, TimelineEntry.status != "deleted"]
        if status_filter:
            conditions.append(TimelineEntry.status == status_filter)
        if not include_restricted:
            conditions.append(TimelineEntry.status != "restricted")
        if not include_sensitive:
            conditions.append(TimelineEntry.is_sensitive.is_(False))
        if sensitivity_level:
            conditions.append(TimelineEntry.sensitivity_level == sensitivity_level)
        if event_types:
            conditions.append(TimelineEntry.event_type.in_(event_types))
        if modules:
            conditions.append(TimelineEntry.module.in_(modules))
        if owner_id:
            conditions.append(TimelineEntry.performed_by == owner_id)
        if source_record_type:
            conditions.append(TimelineEntry.source_record_type == source_record_type)
        if source_record_id:
            conditions.append(TimelineEntry.source_record_id == source_record_id)
        if date_from:
            conditions.append(TimelineEntry.event_at >= date_from)
        if date_to:
            conditions.append(TimelineEntry.event_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    TimelineEntry.title.ilike(term),
                    TimelineEntry.description.ilike(term),
                    TimelineEntry.performed_by_name.ilike(term),
                    TimelineEntry.event_type.ilike(term),
                    TimelineEntry.module.ilike(term),
                    cast(TimelineEntry.tags, String).ilike(term),
                    cast(TimelineEntry.mentions, String).ilike(term),
                )
            )
        return conditions

    def commit(self) -> None:
        self.db.commit()


def policy_duration(policy: TimelineRetentionPolicy):
    from datetime import timedelta

    return timedelta(days=policy.duration_days)
