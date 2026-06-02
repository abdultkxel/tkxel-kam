from datetime import datetime, timezone

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    DigestRun,
    DigestSchedule,
    NotificationPreference,
    NotificationRecord,
    NotificationTriggerConfig,
    ScheduledWorkerRun,
    SlaEscalatedItem,
    SlaRule,
    User,
)


class NotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_trigger_configs(self, *, active_only: bool = False) -> list[NotificationTriggerConfig]:
        conditions = [NotificationTriggerConfig.is_active.is_(True)] if active_only else []
        return list(self.db.scalars(select(NotificationTriggerConfig).where(*conditions).order_by(NotificationTriggerConfig.label)))

    def get_trigger_config(self, trigger: str) -> NotificationTriggerConfig | None:
        return self.db.scalar(select(NotificationTriggerConfig).where(NotificationTriggerConfig.trigger == trigger))

    def save_trigger_config(self, config: NotificationTriggerConfig) -> NotificationTriggerConfig:
        self.db.add(config)
        self.db.flush()
        return config

    def list_preferences(self, user_id: str) -> list[NotificationPreference]:
        return list(self.db.scalars(select(NotificationPreference).where(NotificationPreference.user_id == user_id).order_by(NotificationPreference.trigger)))

    def get_preference(self, user_id: str, trigger: str) -> NotificationPreference | None:
        return self.db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id, NotificationPreference.trigger == trigger))

    def save_preference(self, preference: NotificationPreference) -> NotificationPreference:
        self.db.add(preference)
        self.db.flush()
        return preference

    def get_notification_by_deduplication_key(self, key: str) -> NotificationRecord | None:
        return self.db.scalar(select(NotificationRecord).where(NotificationRecord.deduplication_key == key))

    def save_notification(self, notification: NotificationRecord) -> NotificationRecord:
        self.db.add(notification)
        self.db.flush()
        return notification

    def get_notification(self, notification_id: str) -> NotificationRecord | None:
        return self.db.get(NotificationRecord, notification_id)

    def list_notifications(
        self,
        *,
        recipient_user_id: str,
        search: str | None = None,
        read_state: str | None = None,
        trigger: str | None = None,
        account_id: str | None = None,
        channel: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[NotificationRecord], int, int]:
        conditions = self._notification_conditions(
            recipient_user_id=recipient_user_id,
            search=search,
            read_state=read_state,
            trigger=trigger,
            account_id=account_id,
            channel=channel,
            date_from=date_from,
            date_to=date_to,
        )
        unread_conditions = [NotificationRecord.recipient_user_id == recipient_user_id, NotificationRecord.read_at.is_(None)]
        total = self.db.scalar(select(func.count(NotificationRecord.id)).where(*conditions)) or 0
        unread_count = self.db.scalar(select(func.count(NotificationRecord.id)).where(*unread_conditions)) or 0
        order_column = {
            "created_at": NotificationRecord.created_at,
            "priority": NotificationRecord.priority,
            "trigger": NotificationRecord.trigger,
        }.get(sort, NotificationRecord.created_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(NotificationRecord)
                .where(*conditions)
                .order_by(order_column, NotificationRecord.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total, unread_count

    def mark_all_notifications_read(self, user_id: str) -> int:
        now = datetime.now(timezone.utc)
        items = list(self.db.scalars(select(NotificationRecord).where(NotificationRecord.recipient_user_id == user_id, NotificationRecord.read_at.is_(None))))
        for item in items:
            item.read_at = now
        self.db.flush()
        return len(items)

    def list_sla_rules(self, *, search: str | None = None, item_type: str | None = None, active_state: str = "all", page: int = 1, page_size: int = 25) -> tuple[list[SlaRule], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(SlaRule.name.ilike(term), SlaRule.item_type.ilike(term), SlaRule.recipient_policy.ilike(term)))
        if item_type:
            conditions.append(SlaRule.item_type == item_type)
        if active_state == "active":
            conditions.append(SlaRule.is_active.is_(True))
        elif active_state == "inactive":
            conditions.append(SlaRule.is_active.is_(False))
        total = self.db.scalar(select(func.count(SlaRule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(SlaRule)
                .where(*conditions)
                .order_by(SlaRule.item_type, SlaRule.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_active_sla_rules(self) -> list[SlaRule]:
        return list(self.db.scalars(select(SlaRule).where(SlaRule.is_active.is_(True)).order_by(SlaRule.item_type, SlaRule.name)))

    def get_sla_rule(self, rule_id: str) -> SlaRule | None:
        return self.db.get(SlaRule, rule_id)

    def save_sla_rule(self, rule: SlaRule) -> SlaRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def get_escalated_item_by_deduplication_key(self, key: str) -> SlaEscalatedItem | None:
        return self.db.scalar(select(SlaEscalatedItem).where(SlaEscalatedItem.deduplication_key == key))

    def save_escalated_item(self, item: SlaEscalatedItem) -> SlaEscalatedItem:
        self.db.add(item)
        self.db.flush()
        return item

    def list_escalated_items(
        self,
        *,
        account_ids: list[str] | None = None,
        search: str | None = None,
        item_type: str | None = None,
        owner_id: str | None = None,
        account_id: str | None = None,
        severity: str | None = None,
        state: str | None = None,
        escalated_from: datetime | None = None,
        escalated_to: datetime | None = None,
        sort: str = "escalated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[SlaEscalatedItem], int]:
        conditions = []
        if account_ids is not None:
            conditions.append(SlaEscalatedItem.account_id.in_(account_ids) if account_ids else False)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(SlaEscalatedItem.title.ilike(term), SlaEscalatedItem.owner_name.ilike(term), SlaEscalatedItem.recipient_name.ilike(term)))
        if item_type:
            conditions.append(SlaEscalatedItem.source_type == item_type)
        if owner_id:
            conditions.append(SlaEscalatedItem.owner_id == owner_id)
        if account_id:
            conditions.append(SlaEscalatedItem.account_id == account_id)
        if severity:
            conditions.append(SlaEscalatedItem.severity == severity)
        if state:
            conditions.append(SlaEscalatedItem.state == state)
        if escalated_from:
            conditions.append(SlaEscalatedItem.escalated_at >= escalated_from)
        if escalated_to:
            conditions.append(SlaEscalatedItem.escalated_at <= escalated_to)
        total = self.db.scalar(select(func.count(SlaEscalatedItem.id)).where(*conditions)) or 0
        order_column = {
            "escalated_at": SlaEscalatedItem.escalated_at,
            "severity": SlaEscalatedItem.severity,
            "title": SlaEscalatedItem.title,
            "last_activity_at": SlaEscalatedItem.last_activity_at,
        }.get(sort, SlaEscalatedItem.escalated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(SlaEscalatedItem)
                .where(*conditions)
                .order_by(order_column, SlaEscalatedItem.escalated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_digest_schedules(
        self,
        *,
        viewer_user_id: str | None = None,
        include_all: bool = False,
        search: str | None = None,
        status_filter: str = "all",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[DigestSchedule], int]:
        conditions = []
        if viewer_user_id and not include_all:
            conditions.append(or_(DigestSchedule.owner_id == viewer_user_id, cast(DigestSchedule.recipients_json, String).ilike(f'%"{viewer_user_id}"%')))
        if search and search.strip():
            conditions.append(DigestSchedule.name.ilike(f"%{search.strip()}%"))
        if status_filter == "active":
            conditions.append(DigestSchedule.is_active.is_(True))
        elif status_filter == "inactive":
            conditions.append(DigestSchedule.is_active.is_(False))
        total = self.db.scalar(select(func.count(DigestSchedule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(DigestSchedule)
                .where(*conditions)
                .order_by(DigestSchedule.updated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_due_digest_schedules(self, now: datetime) -> list[DigestSchedule]:
        return list(self.db.scalars(select(DigestSchedule).where(DigestSchedule.is_active.is_(True), DigestSchedule.next_run_at <= now).order_by(DigestSchedule.next_run_at).limit(25)))

    def get_digest_schedule(self, schedule_id: str) -> DigestSchedule | None:
        return self.db.get(DigestSchedule, schedule_id)

    def save_digest_schedule(self, schedule: DigestSchedule) -> DigestSchedule:
        self.db.add(schedule)
        self.db.flush()
        return schedule

    def save_digest_run(self, run: DigestRun) -> DigestRun:
        self.db.add(run)
        self.db.flush()
        return run

    def get_digest_run(self, run_id: str) -> DigestRun | None:
        return self.db.get(DigestRun, run_id)

    def list_digest_runs(
        self,
        *,
        viewer_user_id: str | None = None,
        include_all: bool = False,
        search: str | None = None,
        status_filter: str | None = None,
        recipient: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[DigestRun], int]:
        conditions = []
        if viewer_user_id and not include_all:
            conditions.append(or_(DigestRun.generated_by_id == viewer_user_id, cast(DigestRun.recipients_json, String).ilike(f'%"{viewer_user_id}"%')))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(DigestRun.title.ilike(term), DigestRun.generated_by_name.ilike(term)))
        if status_filter:
            conditions.append(DigestRun.status == status_filter)
        if recipient and recipient.strip():
            conditions.append(cast(DigestRun.recipients_json, String).ilike(f"%{recipient.strip()}%"))
        if date_from:
            conditions.append(DigestRun.generated_at >= date_from)
        if date_to:
            conditions.append(DigestRun.generated_at <= date_to)
        total = self.db.scalar(select(func.count(DigestRun.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(DigestRun)
                .where(*conditions)
                .order_by(DigestRun.generated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_active_users_by_ids(self, user_ids: list[str]) -> list[User]:
        if not user_ids:
            return []
        return list(self.db.scalars(select(User).where(User.id.in_(user_ids), User.is_active.is_(True)).order_by(User.full_name)))

    def first_active_user_by_role(self, roles: list[str]) -> User | None:
        return self.db.scalar(select(User).where(User.role.in_(roles), User.is_active.is_(True)).order_by(User.role, User.email).limit(1))

    def save_worker_run(self, run: ScheduledWorkerRun) -> ScheduledWorkerRun:
        self.db.add(run)
        self.db.flush()
        return run

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _notification_conditions(
        *,
        recipient_user_id: str,
        search: str | None,
        read_state: str | None,
        trigger: str | None,
        account_id: str | None,
        channel: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list:
        conditions = [NotificationRecord.recipient_user_id == recipient_user_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(NotificationRecord.title.ilike(term), NotificationRecord.body.ilike(term), NotificationRecord.account_name_snapshot.ilike(term)))
        if read_state == "read":
            conditions.append(NotificationRecord.read_at.is_not(None))
        elif read_state == "unread":
            conditions.append(NotificationRecord.read_at.is_(None))
        if trigger:
            conditions.append(NotificationRecord.trigger == trigger)
        if account_id:
            conditions.append(NotificationRecord.account_id == account_id)
        if channel:
            conditions.append(NotificationRecord.channel == channel)
        if date_from:
            conditions.append(NotificationRecord.created_at >= date_from)
        if date_to:
            conditions.append(NotificationRecord.created_at <= date_to)
        return conditions
