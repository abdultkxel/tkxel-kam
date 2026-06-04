from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    DigestRun,
    DigestSchedule,
    Escalation,
    KycSnapshot,
    NotificationPreference,
    NotificationRecord,
    NotificationTriggerConfig,
    ScheduledWorkerRun,
    Signal,
    SlaEscalatedItem,
    SlaRule,
    Task,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.dashboards import DashboardRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    DigestPreviewRequest,
    DigestRunPageRead,
    DigestRunRead,
    DigestSchedulePageRead,
    DigestScheduleRead,
    DigestScheduleRequest,
    DigestScheduleUpdateRequest,
    NotificationDefaultsRead,
    NotificationDefaultsUpdateRequest,
    NotificationPageRead,
    NotificationPreferenceRead,
    NotificationPreferenceUpdateRequest,
    NotificationRecordRead,
    NotificationSchedulerDryRunRead,
    NotificationSummaryRead,
    NotificationTriggerUpdateRequest,
    NotificationTriggerConfigRead,
    NotificationTriggerTestRequest,
    SlaEscalatedItemPageRead,
    SlaEscalatedItemRead,
    SlaEvaluationRead,
    ScheduledWorkerRunPageRead,
    ScheduledWorkerRunRead,
    SlaRuleCreateRequest,
    SlaRulePageRead,
    SlaRuleRead,
    SlaRuleUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.email_delivery import EmailDeliveryService
from app.services.notification_catalog import (
    MANDATORY_TRIGGERS,
    NOTIFICATION_TRIGGER_DEFINITIONS,
    OPTIONAL_TRIGGERS,
    REMINDER_DEFAULTS,
)
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

DEFAULT_SLA_RULES = (
    ("Critical signal inactivity", "signal", "critical", None, 240, ["status_change", "comment", "convert"], "kam_head"),
    ("Critical task inactivity", "task", None, "critical", 1440, ["status_change", "evidence", "comment"], "kam_head"),
    ("Stale KYC inactivity", "kyc", None, None, 43200, ["kyc_approval", "kyc_refresh"], "kam_head"),
    ("Formal escalation inactivity", "escalation", "critical", None, 240, ["escalation_update", "closure"], "kam_head"),
)

TERMINAL_TASK_STATUSES = {"done", "cancelled"}
TERMINAL_SIGNAL_STATUSES = {"dismissed", "converted", "resolved"}
TERMINAL_ESCALATION_STATUSES = {"mitigated", "resolved", "closed", "cancelled"}


@dataclass(frozen=True)
class QueueNotificationResult:
    notification: NotificationRecord
    created: bool


class NotificationsService:
    def __init__(self, db: Session, email_delivery: EmailDeliveryService | None = None) -> None:
        self.db = db
        self.repository = NotificationRepository(db)
        self.accounts = AccountRepository(db)
        self.dashboard_repository = DashboardRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(db))
        self.email_delivery = email_delivery or EmailDeliveryService()

    def seed_defaults(self, actor: User | None = None) -> None:
        for definition in NOTIFICATION_TRIGGER_DEFINITIONS:
            timing_mode, timing_value, timing_unit = REMINDER_DEFAULTS.get(definition.trigger, ("immediate", None, "business_days"))
            mandatory = definition.trigger in MANDATORY_TRIGGERS or definition.priority == "critical"
            default_mode = "in_app_email" if mandatory or definition.trigger in {"sla_escalation", "unresolved_escalation", "integration_failure"} else "in_app"
            is_active = definition.trigger not in OPTIONAL_TRIGGERS
            config = self.repository.get_trigger_config(definition.trigger)
            if config is None:
                self.repository.save_trigger_config(
                    NotificationTriggerConfig(
                        trigger=definition.trigger,
                        label=definition.label,
                        description=definition.description,
                        workflow=definition.workflow,
                        priority=definition.priority,
                        recipient_policy=definition.recipients,
                        action_label=definition.action_label,
                        default_mode=default_mode,
                        default_digest_cadence="daily",
                        supported_channels=["in_app", "email"],
                        mandatory=mandatory,
                        timing_mode=timing_mode,
                        timing_unit=timing_unit,
                        lead_time_value=timing_value if timing_mode == "before_due" else None,
                        lead_time_direction="before" if timing_mode == "before_due" else None,
                        pending_threshold_value=timing_value if timing_mode == "after_pending" else None,
                        escalation_enabled=definition.priority in {"high", "critical"} and timing_mode != "immediate",
                        escalation_after_value=timing_value if definition.priority in {"high", "critical"} and timing_mode != "immediate" else None,
                        escalation_recipient_policy="kam_head_admin" if definition.priority in {"high", "critical"} else None,
                        template_json={
                            "title": definition.label,
                            "body": definition.description,
                            "action_label": definition.action_label,
                        },
                        is_active=is_active,
                    )
                )
                continue
            config.label = definition.label
            config.description = definition.description
            config.workflow = definition.workflow
            config.priority = definition.priority
            config.recipient_policy = config.recipient_policy or definition.recipients
            config.action_label = config.action_label or definition.action_label
            config.supported_channels = config.supported_channels or ["in_app", "email"]
            config.default_mode = config.default_mode or default_mode
            if mandatory and config.default_mode == "in_app":
                config.default_mode = "in_app_email"
            config.default_digest_cadence = config.default_digest_cadence or "daily"
            config.mandatory = mandatory
            config.timing_mode = config.timing_mode or timing_mode
            config.timing_unit = config.timing_unit or timing_unit
            if timing_value and config.timing_mode == "before_due" and config.lead_time_value is None:
                config.lead_time_value = timing_value
                config.lead_time_direction = "before"
            if timing_value and config.timing_mode == "after_pending" and config.pending_threshold_value is None:
                config.pending_threshold_value = timing_value
            config.template_json = config.template_json or {"title": definition.label, "body": definition.description, "action_label": definition.action_label}

        for name, item_type, severity, priority, minutes, activities, policy in DEFAULT_SLA_RULES:
            existing = next((rule for rule in self.repository.list_active_sla_rules() if rule.name == name), None)
            if existing:
                continue
            self.repository.save_sla_rule(
                SlaRule(
                    name=name,
                    item_type=item_type,
                    severity=severity,
                    priority=priority,
                    inactivity_minutes=minutes,
                    qualifying_activities=activities,
                    recipient_policy=policy,
                    is_active=True,
                    created_by_id=actor.id if actor else None,
                )
            )
        self.repository.commit()

    def list_trigger_configs(self, current_user: User) -> NotificationDefaultsRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        return NotificationDefaultsRead(items=[NotificationTriggerConfigRead.model_validate(item) for item in self.repository.list_trigger_configs()])

    def get_defaults(self, current_user: User) -> NotificationDefaultsRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        return NotificationDefaultsRead(items=[NotificationTriggerConfigRead.model_validate(item) for item in self.repository.list_trigger_configs()])

    def update_defaults(self, payload: NotificationDefaultsUpdateRequest, current_user: User) -> NotificationDefaultsRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        before = [NotificationTriggerConfigRead.model_validate(item).model_dump(mode="json") for item in self.repository.list_trigger_configs()]
        for item in payload.items:
            if item.trigger in MANDATORY_TRIGGERS and (not item.is_active or item.default_mode == "off"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{item.label} is mandatory and cannot be disabled")
        for item in payload.items:
            config = self.repository.get_trigger_config(item.trigger) or NotificationTriggerConfig(trigger=item.trigger, label=item.label)
            config.label = item.label
            config.description = item.description
            config.workflow = item.workflow
            config.priority = item.priority
            config.recipient_policy = item.recipient_policy
            config.action_label = item.action_label
            config.default_mode = item.default_mode
            config.default_digest_cadence = item.default_digest_cadence
            config.supported_channels = list(item.supported_channels)
            config.mandatory = item.mandatory
            config.timing_mode = item.timing_mode
            config.timing_unit = item.timing_unit
            config.lead_time_value = item.lead_time_value
            config.lead_time_direction = item.lead_time_direction
            config.pending_threshold_value = item.pending_threshold_value
            config.repeat_enabled = item.repeat_enabled
            config.repeat_every_value = item.repeat_every_value
            config.repeat_limit = item.repeat_limit
            config.escalation_enabled = item.escalation_enabled
            config.escalation_after_value = item.escalation_after_value
            config.escalation_recipient_policy = item.escalation_recipient_policy
            config.quiet_hours_start = item.quiet_hours_start
            config.quiet_hours_end = item.quiet_hours_end
            config.template_json = item.template_json
            if config.trigger in MANDATORY_TRIGGERS:
                config.mandatory = True
            if config.mandatory and (config.default_mode == "off" or not item.is_active):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{config.label} is mandatory and cannot be disabled")
            config.is_active = item.is_active
            self.repository.save_trigger_config(config)
        self.audit.log(module="notifications_digests", action="configure", entity_type="notification_defaults", entity_id="defaults", actor=current_user, before_value={"items": before}, after_value={"items": [item.model_dump() for item in payload.items]})
        self.repository.commit()
        return self.get_defaults(current_user)

    def update_trigger_config(self, trigger: str, payload: NotificationTriggerUpdateRequest, current_user: User) -> NotificationTriggerConfigRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        config = self.repository.get_trigger_config(trigger)
        if config is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification trigger was not found")
        if config.trigger in MANDATORY_TRIGGERS and (payload.is_active is False or payload.default_mode == "off"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mandatory notifications cannot be disabled")
        before = NotificationTriggerConfigRead.model_validate(config).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        if "supported_channels" in updates and updates["supported_channels"] is not None:
            updates["supported_channels"] = list(updates["supported_channels"])
        for field, value in updates.items():
            setattr(config, field, value)
        if config.trigger in MANDATORY_TRIGGERS:
            config.mandatory = True
        if config.mandatory and config.default_mode == "off":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mandatory notifications cannot default to off")
        if config.mandatory and not config.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mandatory notifications cannot be deactivated")
        if config.mandatory and config.default_mode == "in_app":
            config.default_mode = "in_app_email"
        self.audit.log(module="notifications_digests", action="update_trigger", entity_type="notification_trigger", entity_id=config.trigger, actor=current_user, before_value=before, after_value=updates)
        self.repository.commit()
        return NotificationTriggerConfigRead.model_validate(config)

    def reset_trigger_config(self, trigger: str, current_user: User) -> NotificationTriggerConfigRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        definition = next((item for item in NOTIFICATION_TRIGGER_DEFINITIONS if item.trigger == trigger), None)
        config = self.repository.get_trigger_config(trigger)
        if definition is None or config is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification trigger was not found")
        timing_mode, timing_value, timing_unit = REMINDER_DEFAULTS.get(trigger, ("immediate", None, "business_days"))
        mandatory = trigger in MANDATORY_TRIGGERS or definition.priority == "critical"
        config.label = definition.label
        config.description = definition.description
        config.workflow = definition.workflow
        config.priority = definition.priority
        config.recipient_policy = definition.recipients
        config.action_label = definition.action_label
        config.default_mode = "in_app_email" if mandatory else "in_app"
        config.default_digest_cadence = "daily"
        config.supported_channels = ["in_app", "email"]
        config.mandatory = mandatory
        config.timing_mode = timing_mode
        config.timing_unit = timing_unit
        config.lead_time_value = timing_value if timing_mode == "before_due" else None
        config.lead_time_direction = "before" if timing_mode == "before_due" else None
        config.pending_threshold_value = timing_value if timing_mode == "after_pending" else None
        config.repeat_enabled = False
        config.repeat_every_value = None
        config.repeat_limit = None
        config.escalation_enabled = definition.priority in {"high", "critical"} and timing_mode != "immediate"
        config.escalation_after_value = timing_value if config.escalation_enabled else None
        config.escalation_recipient_policy = "kam_head_admin" if config.escalation_enabled else None
        config.quiet_hours_start = None
        config.quiet_hours_end = None
        config.template_json = {"title": definition.label, "body": definition.description, "action_label": definition.action_label}
        config.is_active = trigger not in OPTIONAL_TRIGGERS
        self.audit.log(module="notifications_digests", action="reset_trigger", entity_type="notification_trigger", entity_id=config.trigger, actor=current_user)
        self.repository.commit()
        return NotificationTriggerConfigRead.model_validate(config)

    def get_preferences(self, current_user: User) -> list[NotificationPreferenceRead]:
        configs = self.repository.list_trigger_configs(active_only=True)
        preferences = {item.trigger: item for item in self.repository.list_preferences(current_user.id)}
        return [self._preference_read(config, preferences.get(config.trigger)) for config in configs]

    def update_preferences(self, payload: NotificationPreferenceUpdateRequest, current_user: User) -> list[NotificationPreferenceRead]:
        configs = {item.trigger: item for item in self.repository.list_trigger_configs(active_only=True)}
        before = [item.model_dump(mode="json") for item in self.get_preferences(current_user)]
        for item in payload.items:
            config = configs.get(item.trigger)
            if config is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Notification trigger '{item.trigger}' is not active")
            if config.mandatory and item.mode == "off":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{config.label} is mandatory and cannot be turned off")
            if item.mode == "in_app_email" and not current_user.email:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email channel requires a verified email address")
            preference = self.repository.get_preference(current_user.id, item.trigger) or NotificationPreference(user_id=current_user.id, trigger=item.trigger)
            preference.mode = item.mode
            preference.digest_cadence = item.digest_cadence
            preference.policy_override = False
            self.repository.save_preference(preference)
        after = [item.model_dump(mode="json") for item in self.get_preferences(current_user)]
        self.audit.log(module="notifications_digests", action="update_preferences", entity_type="user", entity_id=current_user.id, actor=current_user, before_value={"items": before}, after_value={"items": after})
        self.repository.commit()
        return self.get_preferences(current_user)

    def list_notifications(
        self,
        current_user: User,
        *,
        search: str | None = None,
        read_state: str | None = None,
        trigger: str | None = None,
        workflow: str | None = None,
        priority: str | None = None,
        account_id: str | None = None,
        channel: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> NotificationPageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        if trigger and self.repository.get_trigger_config(trigger) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Notification trigger '{trigger}' was not found")
        if workflow:
            workflows = {item.workflow for item in self.repository.list_trigger_configs()}
            if workflow not in workflows:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Notification workflow '{workflow}' was not found")
        items, total, unread_count = self.repository.list_notifications(
            recipient_user_id=current_user.id,
            search=search,
            read_state=read_state,
            trigger=trigger,
            workflow=workflow,
            priority=priority,
            account_id=account_id,
            channel=channel,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return NotificationPageRead(items=[self._notification_read(item, current_user) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size), unread_count=unread_count)

    def notification_summary(self, current_user: User) -> NotificationSummaryRead:
        page = self.list_notifications(current_user, read_state=None, page=1, page_size=8)
        return NotificationSummaryRead(unread_count=page.unread_count, total_count=page.total, latest=page.items)

    def mark_notification_read(self, notification_id: str, current_user: User) -> NotificationRecordRead:
        notification = self.repository.get_notification(notification_id)
        if notification is None or notification.recipient_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification was not found")
        notification.read_at = notification.read_at or datetime.now(timezone.utc)
        self.repository.commit()
        return self._notification_read(notification, current_user)

    def archive_notification(self, notification_id: str, current_user: User) -> NotificationRecordRead:
        notification = self.repository.get_notification(notification_id)
        if notification is None or notification.recipient_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification was not found")
        self.repository.archive_notification(notification)
        self.repository.commit()
        return self._notification_read(notification, current_user)

    def mark_all_notifications_read(self, current_user: User) -> dict[str, int]:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        count = self.repository.mark_all_notifications_read(current_user.id)
        self.repository.commit()
        return {"updated": count}

    def test_trigger(self, trigger: str, payload: NotificationTriggerTestRequest, current_user: User) -> NotificationRecordRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        config = self.repository.get_trigger_config(trigger)
        if config is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification trigger was not found")
        recipient = self.db.get(User, payload.recipient_user_id) if payload.recipient_user_id else current_user
        if recipient is None or not recipient.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recipient must be an active user")
        title = payload.title or f"Test: {config.label}"
        body = payload.body or "This is a test notification from Admin notification settings."
        result = self.queue_notification(
            recipient=recipient,
            trigger=trigger,
            title=title,
            body=body,
            source_record_type="notification_trigger_config",
            source_record_id=config.id,
            source_record_route="/admin?section=notifications",
            priority=config.priority,
            delivery_metadata={"test": True, "trigger_config_id": config.id},
            deduplication_key=f"notification-test:{trigger}:{recipient.id}:{datetime.now(timezone.utc).timestamp()}",
        )
        self.repository.commit()
        return self._notification_read(result.notification, recipient)

    def dry_run_scheduler(self, current_user: User) -> NotificationSchedulerDryRunRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        configs = self.repository.list_trigger_configs(active_only=True)
        due = [item for item in configs if item.timing_mode in {"before_due", "after_pending", "scheduled"}]
        self.repository.save_worker_run(
            ScheduledWorkerRun(
                job_type="notification_scheduler",
                mode="dry_run",
                status="complete",
                matched_count=len(configs),
                affected_count=len(due),
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                finished_at=datetime.now(timezone.utc),
                metadata_json={"due_trigger_keys": [item.trigger for item in due]},
            )
        )
        self.repository.commit()
        return NotificationSchedulerDryRunRead(evaluated_triggers=len(configs), due_triggers=len(due), message="Dry run completed without creating notifications.")

    def list_scheduler_runs(self, current_user: User, *, job_type: str | None = "notification_scheduler", page: int = 1, page_size: int = 25) -> ScheduledWorkerRunPageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        items, total = self.repository.list_worker_runs(job_type=job_type, page=page, page_size=page_size)
        return ScheduledWorkerRunPageRead(items=[ScheduledWorkerRunRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def queue_notification(
        self,
        *,
        recipient: User,
        trigger: str,
        title: str,
        body: str,
        account: Account | None = None,
        source_record_type: str | None = None,
        source_record_id: str | None = None,
        source_record_route: str | None = None,
        priority: str = "medium",
        delivery_metadata: dict[str, Any] | None = None,
        deduplication_key: str | None = None,
    ) -> QueueNotificationResult:
        config = self.repository.get_trigger_config(trigger)
        if config is None or not config.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Notification trigger '{trigger}' is not active")
        preference = self.repository.get_preference(recipient.id, trigger)
        mode = preference.mode if preference else config.default_mode
        if config.mandatory and "email" in (config.supported_channels or []):
            mode = "in_app_email"
        key = deduplication_key or self._dedup_key(recipient.id, trigger, source_record_type, source_record_id)
        if mode == "off" and not config.mandatory:
            existing = self.repository.get_notification_by_deduplication_key(key)
            if existing:
                return QueueNotificationResult(existing, False)
            notification = NotificationRecord(
                recipient_user_id=recipient.id,
                recipient_name=recipient.full_name,
                recipient_email=recipient.email,
                trigger=trigger,
                workflow=config.workflow,
                title=title,
                body=body,
                account_id=account.id if account else None,
                account_name_snapshot=account.name if account else None,
                source_record_type=source_record_type,
                source_record_id=source_record_id,
                source_record_route=source_record_route,
                priority=priority,
                action_label=config.action_label,
                delivery_status="skipped",
                delivery_metadata_json={"reason": "preference_off", **(delivery_metadata or {})},
                deduplication_key=key,
            )
            self.repository.save_notification(notification)
            logger.info("Skipped notification %s for user %s trigger=%s reason=preference_off", notification.id, recipient.id, trigger)
            return QueueNotificationResult(notification, False)
        existing = self.repository.get_notification_by_deduplication_key(key)
        if existing:
            return QueueNotificationResult(existing, False)
        notification = NotificationRecord(
            recipient_user_id=recipient.id,
            recipient_name=recipient.full_name,
            recipient_email=recipient.email,
            trigger=trigger,
            workflow=config.workflow,
            title=title,
            body=body,
            account_id=account.id if account else None,
            account_name_snapshot=account.name if account else None,
            source_record_type=source_record_type,
            source_record_id=source_record_id,
            source_record_route=source_record_route,
            priority=priority,
            action_label=config.action_label,
            channel="in_app",
            delivery_status="delivered",
            delivery_metadata_json=delivery_metadata or {},
            deduplication_key=key,
            email_queued=mode == "in_app_email",
            delivered_at=datetime.now(timezone.utc),
        )
        self.repository.save_notification(notification)
        if mode == "in_app_email":
            email_result = self._send_notification_email(notification, recipient, trigger=trigger, title=title, body=body, priority=priority, source_route=source_record_route)
            notification.delivery_metadata_json = {**(notification.delivery_metadata_json or {}), "email_delivery": email_result.as_metadata()}
            if email_result.status == "failed":
                notification.delivery_status = "failed"
                notification.retry_count += 1
                notification.error_message = email_result.error_message
        logger.info("Queued notification %s for user %s trigger=%s", notification.id, recipient.id, trigger)
        return QueueNotificationResult(notification, True)

    def list_sla_rules(self, current_user: User, *, search: str | None = None, item_type: str | None = None, active_state: str = "all", page: int = 1, page_size: int = 25) -> SlaRulePageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        items, total = self.repository.list_sla_rules(search=search, item_type=item_type, active_state=active_state, page=page, page_size=page_size)
        return SlaRulePageRead(items=[SlaRuleRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_sla_rule(self, payload: SlaRuleCreateRequest, current_user: User) -> SlaRuleRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        rule = SlaRule(
            name=payload.name,
            item_type=payload.item_type,
            severity=payload.severity,
            priority=payload.priority,
            inactivity_minutes=payload.inactivity_minutes,
            qualifying_activities=payload.qualifying_activities,
            recipient_policy=payload.recipient_policy,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_sla_rule(rule)
        self.audit.log(module="notifications_digests", action="create_sla_rule", entity_type="sla_rule", entity_id=rule.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return SlaRuleRead.model_validate(rule)

    def update_sla_rule(self, rule_id: str, payload: SlaRuleUpdateRequest, current_user: User) -> SlaRuleRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        rule = self.repository.get_sla_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SLA rule was not found")
        before = SlaRuleRead.model_validate(rule).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        self.audit.log(module="notifications_digests", action="update_sla_rule", entity_type="sla_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=updates)
        self.repository.commit()
        return SlaRuleRead.model_validate(rule)

    def list_escalated_items(
        self,
        current_user: User,
        *,
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
    ) -> SlaEscalatedItemPageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        account_ids = self._account_scope(current_user)
        if account_id and account_ids is not None:
            account_ids = [account_id] if account_id in account_ids else []
        items, total = self.repository.list_escalated_items(account_ids=account_ids, search=search, item_type=item_type, owner_id=owner_id, account_id=account_id, severity=severity, state=state, escalated_from=escalated_from, escalated_to=escalated_to, sort=sort, direction=direction, page=page, page_size=page_size)
        return SlaEscalatedItemPageRead(items=[SlaEscalatedItemRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def evaluate_sla(self, current_user: User | None = None, *, mode: str = "manual") -> SlaEvaluationRead:
        if current_user:
            self.access.require_module_permission(current_user, "notifications_digests", "configure")
        started_at = datetime.now(timezone.utc)
        worker_run = ScheduledWorkerRun(job_type="sla_evaluation", mode=mode, status="running", actor_id=current_user.id if current_user else None, actor_name=current_user.full_name if current_user else "System", started_at=started_at)
        self.repository.save_worker_run(worker_run)
        evaluated_rules = matched_items = escalated_items = notifications_created = duplicate_notifications = 0
        try:
            for rule in self.repository.list_active_sla_rules():
                evaluated_rules += 1
                for candidate in self._sla_candidates(rule):
                    matched_items += 1
                    recipient = self._recipient_for(rule, candidate)
                    if recipient is None or not recipient.is_active:
                        continue
                    key = self._sla_dedup_key(rule, candidate, recipient)
                    existing = self.repository.get_escalated_item_by_deduplication_key(key)
                    if existing:
                        duplicate_notifications += 1
                        continue
                    account = self.db.get(Account, candidate["account_id"]) if candidate.get("account_id") else None
                    escalated = SlaEscalatedItem(
                        rule_id=rule.id,
                        source_type=rule.item_type,
                        source_record_id=candidate["source_record_id"],
                        account_id=candidate.get("account_id"),
                        title=candidate["title"],
                        severity=candidate.get("severity"),
                        owner_id=candidate.get("owner_id"),
                        owner_name=candidate.get("owner_name"),
                        recipient_user_id=recipient.id,
                        recipient_name=recipient.full_name,
                        last_activity_at=candidate.get("last_activity_at"),
                        sla_window_key=self._sla_window_key(rule),
                        deduplication_key=key,
                    )
                    self.repository.save_escalated_item(escalated)
                    notification_result = self.queue_notification(
                        recipient=recipient,
                        trigger="sla_escalation",
                        title=f"SLA attention: {candidate['title']}",
                        body=f"{rule.name} breached the inactivity window of {rule.inactivity_minutes} minutes.",
                        account=account,
                        source_record_type=rule.item_type,
                        source_record_id=candidate["source_record_id"],
                        source_record_route=candidate.get("source_record_route"),
                        priority="critical" if candidate.get("severity") == "critical" else "high",
                        delivery_metadata={"sla_rule_id": rule.id, "sla_window_key": escalated.sla_window_key, "reason": rule.name},
                        deduplication_key=f"notification:{key}",
                    )
                    escalated_items += 1
                    notifications_created += 1 if notification_result.created else 0
                    duplicate_notifications += 0 if notification_result.created else 1
            worker_run.status = "complete"
            worker_run.matched_count = matched_items
            worker_run.affected_count = escalated_items
            worker_run.finished_at = datetime.now(timezone.utc)
            worker_run.metadata_json = {"evaluated_rules": evaluated_rules, "notifications_created": notifications_created}
            self.repository.commit()
            logger.info("SLA evaluation completed rules=%s matched=%s escalated=%s", evaluated_rules, matched_items, escalated_items)
            return SlaEvaluationRead(evaluated_rules=evaluated_rules, matched_items=matched_items, escalated_items=escalated_items, notifications_created=notifications_created, duplicate_notifications=duplicate_notifications, worker_run_id=worker_run.id)
        except Exception as exc:
            worker_run.status = "failed"
            worker_run.error_message = str(exc)
            worker_run.finished_at = datetime.now(timezone.utc)
            self.repository.commit()
            logger.exception("SLA evaluation failed")
            raise

    def list_digest_schedules(self, current_user: User, *, search: str | None = None, status_filter: str = "all", page: int = 1, page_size: int = 25) -> DigestSchedulePageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        items, total = self.repository.list_digest_schedules(viewer_user_id=current_user.id, include_all=self._can_configure_notifications(current_user), search=search, status_filter=status_filter, page=page, page_size=page_size)
        return DigestSchedulePageRead(items=[DigestScheduleRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_digest_schedule(self, payload: DigestScheduleRequest, current_user: User) -> DigestScheduleRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        recipients = self._authorized_recipient_ids(payload.recipient_user_ids)
        schedule = DigestSchedule(
            name=payload.name,
            owner_id=current_user.id,
            owner_name=current_user.full_name,
            cadence=payload.cadence,
            timezone=payload.timezone,
            recipients_json=recipients,
            sections_json=payload.sections,
            filters_json=payload.filters,
            delivery_channels=list(payload.delivery_channels),
            is_active=payload.is_active,
            next_run_at=self._next_run_at(payload.cadence),
        )
        self.repository.save_digest_schedule(schedule)
        self.audit.log(module="notifications_digests", action="create_digest_schedule", entity_type="digest_schedule", entity_id=schedule.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return DigestScheduleRead.model_validate(schedule)

    def update_digest_schedule(self, schedule_id: str, payload: DigestScheduleUpdateRequest, current_user: User) -> DigestScheduleRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        schedule = self.repository.get_digest_schedule(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Digest schedule was not found")
        before = DigestScheduleRead.model_validate(schedule).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        if "recipient_user_ids" in updates:
            schedule.recipients_json = self._authorized_recipient_ids(updates.pop("recipient_user_ids"))
        if "sections" in updates:
            schedule.sections_json = updates.pop("sections")
        if "filters" in updates:
            schedule.filters_json = updates.pop("filters")
        for field, value in updates.items():
            if field == "delivery_channels":
                schedule.delivery_channels = value
            else:
                setattr(schedule, field, value)
        if "cadence" in updates:
            schedule.next_run_at = self._next_run_at(schedule.cadence)
        self.audit.log(module="notifications_digests", action="update_digest_schedule", entity_type="digest_schedule", entity_id=schedule.id, actor=current_user, before_value=before, after_value=payload.model_dump(exclude_unset=True))
        self.repository.commit()
        return DigestScheduleRead.model_validate(schedule)

    def preview_digest(self, payload: DigestPreviewRequest, current_user: User) -> DigestRunRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        content, redactions = self._digest_content(payload.sections, payload.filters, current_user)
        run = DigestRun(
            title="Digest preview",
            status="preview",
            recipients_json=[current_user.id],
            sections_json=payload.sections,
            content_json=content,
            redactions_json=redactions,
            delivery_attempts_json=[],
            generated_by_id=current_user.id,
            generated_by_name=current_user.full_name,
        )
        self.repository.save_digest_run(run)
        self.repository.commit()
        return DigestRunRead.model_validate(run)

    def list_digest_runs(self, current_user: User, *, search: str | None = None, status_filter: str | None = None, recipient: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, page: int = 1, page_size: int = 25) -> DigestRunPageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        items, total = self.repository.list_digest_runs(viewer_user_id=current_user.id, include_all=self._can_configure_notifications(current_user), search=search, status_filter=status_filter, recipient=recipient, date_from=date_from, date_to=date_to, page=page, page_size=page_size)
        return DigestRunPageRead(items=[DigestRunRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_digest_run(self, run_id: str, current_user: User) -> DigestRunRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        run = self.repository.get_digest_run(run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Digest was not found")
        if not self._can_view_digest_run(run, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this digest")
        return DigestRunRead.model_validate(run)

    def send_digest(self, run_id: str, current_user: User) -> DigestRunRead:
        self.access.require_module_permission(current_user, "notifications_digests", "configure")
        run = self.repository.get_digest_run(run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Digest was not found")
        recipients = self.repository.list_active_users_by_ids(run.recipients_json or [current_user.id])
        attempts = []
        for recipient in recipients:
            attempts.append({"recipient_user_id": recipient.id, "channel": "in_app", "status": "queued", "timestamp": datetime.now(timezone.utc).isoformat()})
            self.queue_notification(recipient=recipient, trigger="governance_reminder", title=run.title, body="Executive digest is ready.", priority="medium", delivery_metadata={"digest_run_id": run.id}, deduplication_key=f"digest:{run.id}:{recipient.id}")
            email_result = self.email_delivery.send_template(
                "digest_ready",
                recipient_email=recipient.email,
                recipient_name=recipient.full_name,
                context={"recipient_name": recipient.full_name, "title": run.title, "source_url": self.email_delivery.absolute_url(f"/reports?digest={run.id}")},
            )
            attempts.append({"recipient_user_id": recipient.id, **email_result.as_metadata(), "timestamp": datetime.now(timezone.utc).isoformat()})
        run.status = "sent"
        run.delivery_attempts_json = attempts
        self.audit.log(module="notifications_digests", action="send_digest", entity_type="digest_run", entity_id=run.id, actor=current_user, after_value={"recipients": run.recipients_json})
        self.repository.commit()
        return DigestRunRead.model_validate(run)

    def run_due_digest_schedules(self) -> int:
        now = datetime.now(timezone.utc)
        count = 0
        for schedule in self.repository.list_due_digest_schedules(now):
            recipients = self._active_authorized_digest_recipients(schedule.recipients_json)
            for recipient in recipients:
                content, redactions = self._digest_content(schedule.sections_json, schedule.filters_json, recipient)
                attempts = []
                if "email" in (schedule.delivery_channels or []):
                    email_result = self.email_delivery.send_template(
                        "digest_ready",
                        recipient_email=recipient.email,
                        recipient_name=recipient.full_name,
                        context={"recipient_name": recipient.full_name, "title": schedule.name, "source_url": self.email_delivery.absolute_url("/reports")},
                    )
                    attempts.append({"recipient_user_id": recipient.id, **email_result.as_metadata(), "timestamp": datetime.now(timezone.utc).isoformat()})
                run = DigestRun(
                    schedule_id=schedule.id,
                    title=schedule.name,
                    status="sent" if attempts and all(item.get("status") == "sent" for item in attempts) else "generated",
                    recipients_json=[recipient.id],
                    sections_json=schedule.sections_json,
                    content_json=content,
                    redactions_json=redactions,
                    delivery_attempts_json=attempts,
                    generated_by_id=recipient.id,
                    generated_by_name=recipient.full_name,
                )
                self.repository.save_digest_run(run)
                count += 1
            schedule.last_run_at = now
            schedule.next_run_at = self._next_run_at(schedule.cadence, from_time=now)
        if count:
            self.repository.save_worker_run(ScheduledWorkerRun(job_type="digest_generation", mode="scheduled", status="complete", matched_count=count, affected_count=count, finished_at=datetime.now(timezone.utc), metadata_json={"generated": count}))
            self.repository.commit()
        return count

    def _send_notification_email(self, notification: NotificationRecord, recipient: User, *, trigger: str, title: str, body: str, priority: str, source_route: str | None) -> Any:
        template_key = "sla_escalation" if trigger == "sla_escalation" else "mention" if trigger in {"timeline_mention", "timeline_comment"} else "notification"
        return self.email_delivery.send_template(
            template_key,
            recipient_email=recipient.email,
            recipient_name=recipient.full_name,
            context={
                "recipient_name": recipient.full_name,
                "title": title,
                "body": body,
                "priority_label": priority.upper(),
                "source_url": self.email_delivery.absolute_url(source_route or f"/notifications?selected={notification.id}"),
            },
        )

    def _notification_read(self, notification: NotificationRecord, current_user: User) -> NotificationRecordRead:
        data = NotificationRecordRead.model_validate(notification)
        if not notification.account_id:
            return data
        account = self.db.get(Account, notification.account_id)
        if account is not None and self.access.can_view_account(current_user, account):
            return data
        metadata = dict(data.delivery_metadata_json or {})
        metadata["source_access"] = "restricted"
        return data.model_copy(
            update={
                "title": "Restricted notification source",
                "body": "The source record is no longer visible to you.",
                "account_id": None,
                "account_name_snapshot": None,
                "source_record_type": None,
                "source_record_id": None,
                "source_record_route": None,
                "delivery_metadata_json": metadata,
            }
        )

    def _preference_read(self, config: NotificationTriggerConfig, preference: NotificationPreference | None) -> NotificationPreferenceRead:
        return NotificationPreferenceRead(
            trigger=config.trigger,
            label=config.label,
            mode=preference.mode if preference else config.default_mode,
            digest_cadence=preference.digest_cadence if preference else config.default_digest_cadence,
            mandatory=config.mandatory,
            supported_channels=config.supported_channels,
            policy_override=preference.policy_override if preference else False,
        )

    def _sla_candidates(self, rule: SlaRule) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=rule.inactivity_minutes)
        if rule.item_type == "signal":
            query = self.db.query(Signal).filter(Signal.status.notin_(TERMINAL_SIGNAL_STATUSES), Signal.updated_at <= cutoff)
            if rule.severity:
                query = query.filter(Signal.severity == rule.severity)
            return [
                {
                    "source_record_id": item.id,
                    "account_id": item.account_id,
                    "title": item.title,
                    "severity": item.severity,
                    "owner_id": item.owner_id,
                    "owner_name": item.owner_name,
                    "last_activity_at": item.updated_at,
                    "source_record_route": item.source_record_route or f"/tasks?signal={item.id}",
                }
                for item in query.limit(200).all()
            ]
        if rule.item_type == "task":
            query = self.db.query(Task).filter(Task.status.notin_(TERMINAL_TASK_STATUSES), Task.updated_at <= cutoff)
            if rule.priority:
                query = query.filter(Task.priority == rule.priority)
            return [
                {
                    "source_record_id": item.id,
                    "account_id": item.account_id,
                    "title": item.title,
                    "severity": item.priority,
                    "owner_id": item.owner_id,
                    "owner_name": item.owner_name,
                    "last_activity_at": item.updated_at,
                    "source_record_route": f"/tasks?selected={item.id}",
                }
                for item in query.limit(200).all()
            ]
        if rule.item_type == "escalation":
            query = self.db.query(Escalation).filter(Escalation.status.notin_(TERMINAL_ESCALATION_STATUSES), Escalation.updated_at <= cutoff)
            if rule.severity:
                query = query.filter(Escalation.severity == rule.severity)
            return [
                {
                    "source_record_id": item.id,
                    "account_id": item.account_id,
                    "title": item.summary,
                    "severity": item.severity,
                    "owner_id": item.owner_id,
                    "owner_name": item.owner_name,
                    "last_activity_at": item.updated_at,
                    "source_record_route": f"/escalations?selected={item.id}",
                }
                for item in query.limit(200).all()
            ]
        if rule.item_type == "kyc":
            accounts = self.db.query(Account).filter(Account.archived_at.is_(None)).limit(200).all()
            candidates = []
            for account in accounts:
                snapshot = self.db.query(KycSnapshot).filter(KycSnapshot.account_id == account.id).order_by(KycSnapshot.approved_at.desc()).first()
                last_activity = self._as_aware(snapshot.approved_at if snapshot else account.created_at)
                if last_activity and last_activity > cutoff:
                    continue
                owner = self.accounts.get_active_primary_owner(account.id)
                candidates.append(
                    {
                        "source_record_id": snapshot.id if snapshot else account.id,
                        "account_id": account.id,
                        "title": f"Stale KYC for {account.name}",
                        "severity": "warning",
                        "owner_id": owner.user_id if owner else None,
                        "owner_name": owner.user_name if owner else None,
                        "last_activity_at": last_activity,
                        "source_record_route": f"/accounts/{account.id}",
                    }
                )
            return candidates
        return []

    def _recipient_for(self, rule: SlaRule, candidate: dict[str, Any]) -> User | None:
        if rule.recipient_policy == "account_owner" and candidate.get("owner_id"):
            return self.db.get(User, candidate["owner_id"])
        if rule.recipient_policy == "admin":
            return self.repository.first_active_user_by_role(["admin", "super_admin"])
        return self.repository.first_active_user_by_role(["kam_head", "admin", "super_admin"])

    def _authorized_recipient_ids(self, user_ids: list[str]) -> list[str]:
        users = self.repository.list_active_users_by_ids(user_ids)
        found = {user.id for user in users}
        missing = [user_id for user_id in user_ids if user_id not in found]
        if missing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All recipients must be active users")
        unauthorized = [user.full_name or user.email for user in users if not self.rbac.role_has_permission(user.role, "notifications_digests", "view")]
        if unauthorized:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All digest recipients must be authorized to view notifications and digests")
        return [user.id for user in users]

    def _active_authorized_digest_recipients(self, user_ids: list[str]) -> list[User]:
        users = self.repository.list_active_users_by_ids(user_ids)
        return [user for user in users if self.rbac.role_has_permission(user.role, "notifications_digests", "view")]

    def _can_configure_notifications(self, user: User) -> bool:
        return self.rbac.role_has_permission(user.role, "notifications_digests", "configure")

    def _can_view_digest_run(self, run: DigestRun, user: User) -> bool:
        if self._can_configure_notifications(user):
            return True
        return run.generated_by_id == user.id or user.id in (run.recipients_json or [])

    def _account_scope(self, user: User) -> list[str] | None:
        if user.role in {"super_admin", "admin", "kam_head", "leadership", "leadership_viewer"}:
            return None
        return self.dashboard_repository.account_ids_for_user(user.id)

    def _digest_content(self, sections: list[str], filters: dict[str, Any], actor: User | None) -> tuple[dict[str, Any], dict[str, Any]]:
        account_ids = None
        if actor and actor.role not in {"super_admin", "admin", "kam_head", "leadership_viewer"}:
            account_ids = self.dashboard_repository.account_ids_for_user(actor.id)
        accounts = self.dashboard_repository.list_accounts(account_ids=account_ids, segment=filters.get("segment"), region=filters.get("region"), risk=filters.get("risk"), limit=50)
        signals = self.dashboard_repository.list_open_signals(account_ids=account_ids, limit=50)
        escalations = self.dashboard_repository.list_open_escalations(account_ids=account_ids, limit=50)
        opportunities = self.dashboard_repository.list_open_opportunities(account_ids=account_ids, limit=50)
        content = {
            "strategic_risks": [{"account": account.name, "risk": account.risk_status, "health": account.health_overall} for account in accounts if account.risk_status in {"warning", "critical"}][:10],
            "retention_outlook": [{"account": account.name, "next_governance_at": account.next_governance_at.isoformat() if account.next_governance_at else None} for account in accounts[:10]],
            "growth_opportunities": [{"name": item.name, "stage": item.stage, "value": float(item.value), "account_id": item.account_id} for item in opportunities[:10]],
            "major_escalations": [{"summary": item.summary, "severity": item.severity, "status": item.status, "account_id": item.account_id} for item in escalations[:10]],
            "required_decisions": [{"title": item.title, "severity": item.severity, "account_id": item.account_id} for item in signals[:10]],
        }
        filtered = {section: content.get(section, []) for section in sections}
        return filtered, {"hidden_record_counts": 0, "scope": "permission_scoped"}

    @staticmethod
    def _dedup_key(recipient_id: str, trigger: str, source_record_type: str | None, source_record_id: str | None) -> str:
        source = f"{source_record_type or 'none'}:{source_record_id or datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        return f"{recipient_id}:{trigger}:{source}"

    @staticmethod
    def _sla_window_key(rule: SlaRule) -> str:
        return f"{rule.id}:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"

    def _sla_dedup_key(self, rule: SlaRule, candidate: dict[str, Any], recipient: User) -> str:
        return f"{rule.id}:{candidate['source_record_id']}:{recipient.id}:{self._sla_window_key(rule)}"

    @staticmethod
    def _next_run_at(cadence: str, from_time: datetime | None = None) -> datetime:
        base = from_time or datetime.now(timezone.utc)
        if cadence == "daily":
            return base + timedelta(days=1)
        if cadence == "monthly":
            return base + timedelta(days=30)
        return base + timedelta(days=7)

    @staticmethod
    def _as_aware(value: datetime | None) -> datetime | None:
        if value is None or value.tzinfo is not None:
            return value
        return value.replace(tzinfo=timezone.utc)
