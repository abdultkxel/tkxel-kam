from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Escalation, EscalationNotification, EscalationUpdate, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.escalations import EscalationRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    EscalationAddUpdateRequest,
    EscalationCloseRequest,
    EscalationNotificationPageRead,
    EscalationNotificationRead,
    EscalationPageRead,
    EscalationRead,
    EscalationCreateRequest,
    EscalationUpdatePageRead,
    EscalationUpdateRead,
    EscalationUpdateRequest,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.in_app_notifications import InAppNotificationService
from app.services.timeline import TimelineService
from app.services.user_management import page_count


SLA_TARGETS = {
    "critical": timedelta(hours=4),
    "high": timedelta(days=1),
    "medium": timedelta(days=3),
    "low": timedelta(days=5),
}


class EscalationService:
    def __init__(self, db: Session) -> None:
        self.repository = EscalationRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))
        self.in_app_notifications = InAppNotificationService(db)

    def list_escalations(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        severity: str | None = None,
        priority: str | None = None,
        owner_id: str | None = None,
        status_filter: str | None = None,
        watchlist: bool | None = None,
        sla_from: datetime | None = None,
        sla_to: datetime | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "sla_due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> EscalationPageRead:
        self.access.require_module_permission(current_user, "escalation_management", "view")
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        items, total = self.repository.list_escalations(
            account_id=account_id,
            account_ids=account_ids,
            visible_user_id=current_user.id if account_ids is not None else None,
            engagement_id=engagement_id,
            search=search,
            severity=severity,
            priority=priority,
            owner_id=owner_id,
            status=status_filter,
            watchlist=watchlist,
            sla_from=sla_from,
            sla_to=sla_to,
            created_from=created_from,
            created_to=created_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return EscalationPageRead(items=[self._read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_escalation(self, payload: EscalationCreateRequest, current_user: User) -> EscalationRead:
        self.access.require_module_permission(current_user, "escalation_management", "create")
        account = self.accounts.get_by_id(payload.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="escalation_management")
        owner = self._get_user_or_404(payload.owner_id, "Escalation owner was not found")
        escalation = Escalation(
            account_id=payload.account_id,
            engagement_id=payload.engagement_id,
            summary=payload.summary,
            impact=payload.impact,
            severity=payload.severity,
            priority=payload.priority,
            status="watchlist" if payload.watchlist else "open",
            owner_id=owner.id,
            owner_name=owner.full_name,
            sla_due_at=payload.sla_due_at or self.default_sla_due_at(payload.severity),
            watchlist=payload.watchlist,
            mitigation=payload.mitigation,
            recovery_actions=payload.recovery_actions,
            communication_cadence=payload.communication_cadence,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.save(escalation)
        self.custom_fields.save_record_values("escalation_management", escalation.id, payload.custom_field_values, current_user, audit_module="escalation_management")
        self.repository.add_update(EscalationUpdate(escalation_id=escalation.id, update_type="status_change", body="Escalation created.", actor_id=current_user.id, actor_name=current_user.full_name))
        self.timeline.add_account_event(
            account_id=payload.account_id,
            engagement_id=payload.engagement_id,
            event_type="escalation_event",
            module="escalation",
            title=f"Escalation filed: {payload.summary}",
            description=payload.impact,
            actor=current_user,
            source_record_id=escalation.id,
            source_record_type="escalation",
            source_record_route=f"/escalations?selected={escalation.id}",
            metadata={"severity": escalation.severity, "priority": escalation.priority},
        )
        self.audit.log(module="escalation_management", action="create", entity_type="escalation", entity_id=escalation.id, actor=current_user, after_value=self._snapshot(escalation))
        self._notify_escalation(escalation, current_user, "escalation_opened", f"Escalation opened: {escalation.summary}", escalation.impact, priority="high")
        if escalation.severity == "critical":
            self._notify_escalation(escalation, current_user, "escalation_rca_required", f"RCA will be required: {escalation.summary}", "Critical escalations require RCA before closure.", priority="high")
        self.repository.commit()
        return self._read(escalation)

    def get_escalation(self, escalation_id: str, current_user: User) -> EscalationRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_view(current_user, escalation)
        return self._read(escalation)

    def update_escalation(self, escalation_id: str, payload: EscalationUpdateRequest, current_user: User) -> EscalationRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_update(current_user, escalation)
        before = self._snapshot(escalation)
        updates = payload.model_dump(exclude_unset=True)
        custom_values = updates.pop("custom_field_values", None)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_user_or_404(updates["owner_id"], "Escalation owner was not found")
            escalation.owner_id = owner.id
            escalation.owner_name = owner.full_name
            updates.pop("owner_id")
        for field, value in updates.items():
            setattr(escalation, field, value)
        if custom_values is not None:
            self.custom_fields.replace_record_values("escalation_management", escalation.id, custom_values, current_user, audit_module="escalation_management")
        if escalation.status == "watchlist":
            escalation.watchlist = True
        self.repository.add_update(EscalationUpdate(escalation_id=escalation.id, update_type="status_change", body="Escalation fields updated.", actor_id=current_user.id, actor_name=current_user.full_name, metadata_json={"before": before, "after": self._snapshot(escalation)}))
        self.audit.log(module="escalation_management", action="update", entity_type="escalation", entity_id=escalation.id, actor=current_user, before_value=before, after_value=self._snapshot(escalation))
        if before.get("owner_id") != escalation.owner_id:
            self._notify_escalation(escalation, current_user, "escalation_owner_changed", f"Escalation owner changed: {escalation.summary}", "Escalation ownership changed.", priority="high", extra_recipients=[self.in_app_notifications.active_user(before.get("owner_id"))])
        else:
            self._notify_escalation(escalation, current_user, "escalation_update_added", f"Escalation updated: {escalation.summary}", "Escalation details were updated.", priority="medium")
        self.repository.commit()
        return self._read(escalation)

    def add_update(self, escalation_id: str, payload: EscalationAddUpdateRequest, current_user: User) -> EscalationUpdateRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_update(current_user, escalation)
        update = EscalationUpdate(escalation_id=escalation.id, update_type=payload.update_type, body=payload.body, actor_id=current_user.id, actor_name=current_user.full_name)
        self.repository.add_update(update)
        escalation.updated_at = datetime.now(timezone.utc)
        self.audit.log(module="escalation_management", action="add_update", entity_type="escalation", entity_id=escalation.id, actor=current_user, after_value={"update_type": update.update_type})
        self._notify_escalation(escalation, current_user, "escalation_update_added", f"Escalation update: {escalation.summary}", payload.body, priority="medium", source_record_id=update.id)
        self.repository.commit()
        return EscalationUpdateRead.model_validate(update)

    def list_updates(self, escalation_id: str, current_user: User, page: int, page_size: int) -> EscalationUpdatePageRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_view(current_user, escalation)
        items, total = self.repository.list_updates(escalation_id, page, page_size)
        return EscalationUpdatePageRead(items=[EscalationUpdateRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def close_escalation(self, escalation_id: str, payload: EscalationCloseRequest, current_user: User) -> EscalationRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_update(current_user, escalation)
        if not payload.closure_evidence and not self._can_override_closure(current_user, payload.override_reason):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closure evidence is required unless an authorized override reason is provided")
        if escalation.severity == "critical" and not payload.rca:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Critical escalations require RCA before closure")
        before = self._snapshot(escalation)
        escalation.status = "closed"
        escalation.resolution_summary = payload.resolution_summary
        escalation.closure_evidence = payload.closure_evidence
        escalation.rca = payload.rca
        escalation.closure_override_reason = payload.override_reason
        escalation.closed_by_id = current_user.id
        escalation.closed_at = datetime.now(timezone.utc)
        self.repository.add_update(EscalationUpdate(escalation_id=escalation.id, update_type="closure", body=payload.resolution_summary, actor_id=current_user.id, actor_name=current_user.full_name))
        self.timeline.add_account_event(
            account_id=escalation.account_id,
            engagement_id=escalation.engagement_id,
            event_type="escalation_event",
            module="escalation",
            title=f"Escalation closed: {escalation.summary}",
            description=payload.resolution_summary,
            actor=current_user,
            source_record_id=escalation.id,
            source_record_type="escalation",
            source_record_route=f"/escalations?selected={escalation.id}",
        )
        self.audit.log(module="escalation_management", action="close", entity_type="escalation", entity_id=escalation.id, actor=current_user, before_value=before, after_value=self._snapshot(escalation), reason=payload.override_reason)
        self._notify_escalation(escalation, current_user, "escalation_closed", f"Escalation closed: {escalation.summary}", payload.resolution_summary, priority="low")
        self.repository.commit()
        return self._read(escalation)

    def reopen_escalation(self, escalation_id: str, current_user: User) -> EscalationRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_update(current_user, escalation)
        before = self._snapshot(escalation)
        escalation.status = "reopened"
        escalation.reopened_at = datetime.now(timezone.utc)
        escalation.closed_at = None
        escalation.closed_by_id = None
        self.repository.add_update(EscalationUpdate(escalation_id=escalation.id, update_type="reopen", body="Escalation reopened.", actor_id=current_user.id, actor_name=current_user.full_name))
        self.audit.log(module="escalation_management", action="reopen", entity_type="escalation", entity_id=escalation.id, actor=current_user, before_value=before, after_value=self._snapshot(escalation))
        self._notify_escalation(escalation, current_user, "escalation_reopened", f"Escalation reopened: {escalation.summary}", "Escalation was reopened and requires attention.", priority="high")
        self.repository.commit()
        return self._read(escalation)

    def list_notifications(self, escalation_id: str, current_user: User, page: int, page_size: int) -> EscalationNotificationPageRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_view(current_user, escalation)
        items, total = self.repository.list_notifications(escalation_id=escalation_id, page=page, page_size=page_size)
        return EscalationNotificationPageRead(items=[EscalationNotificationRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def list_notification_log(
        self,
        current_user: User,
        *,
        search: str | None = None,
        recipient: str | None = None,
        channel: str | None = None,
        trigger: str | None = None,
        escalation_id: str | None = None,
        delivery_status: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> EscalationNotificationPageRead:
        self.access.require_module_permission(current_user, "notifications_digests", "view")
        items, total = self.repository.list_notifications(
            escalation_id=escalation_id,
            search=search,
            recipient=recipient,
            channel=channel,
            trigger=trigger,
            delivery_status=delivery_status,
            created_from=created_from,
            created_to=created_to,
            page=page,
            page_size=page_size,
        )
        return EscalationNotificationPageRead(items=[EscalationNotificationRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def test_notification(self, escalation_id: str, current_user: User) -> EscalationNotificationRead:
        escalation = self._get_or_404(escalation_id)
        self._require_escalation_update(current_user, escalation)
        notification = self._queue_notification(escalation, current_user, trigger="manual_test", reason="Manual escalation notification test")
        self.repository.commit()
        return EscalationNotificationRead.model_validate(notification)

    def _queue_notification(self, escalation: Escalation, actor: User, trigger: str, reason: str) -> EscalationNotification:
        window = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        key = f"{escalation.id}:{trigger}:{window}:{escalation.owner_id or actor.id}"
        existing = self.repository.get_notification_by_deduplication_key(key)
        if existing:
            return existing
        notification = EscalationNotification(
            escalation_id=escalation.id,
            recipient_user_id=escalation.owner_id or actor.id,
            recipient_name=escalation.owner_name or actor.full_name,
            recipient_email=None,
            channel="in_app",
            trigger=trigger,
            reason=reason,
            sla_window_key=window,
            delivery_status="queued",
            deduplication_key=key,
        )
        self.repository.add_notification(notification)
        self.audit.log(module="notifications_digests", action="queue", entity_type="escalation_notification", entity_id=notification.id, actor=actor, after_value={"escalation_id": escalation.id, "trigger": trigger})
        return notification

    def _get_or_404(self, escalation_id: str) -> Escalation:
        escalation = self.repository.get(escalation_id)
        if escalation is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escalation was not found")
        return escalation

    def _escalation_recipients(self, escalation: Escalation, extra_recipients: list[User | None] | None = None) -> list[User | None]:
        return [
            self.in_app_notifications.active_user(escalation.owner_id),
            *self.in_app_notifications.account_owners(escalation.account),
            *(extra_recipients or []),
        ]

    def _notify_escalation(
        self,
        escalation: Escalation,
        current_user: User,
        trigger: str,
        title: str,
        body: str,
        *,
        priority: str,
        source_record_id: str | None = None,
        extra_recipients: list[User | None] | None = None,
    ) -> None:
        self.in_app_notifications.queue_many(
            self._escalation_recipients(escalation, extra_recipients),
            trigger=trigger,
            title=title,
            body=body,
            account=escalation.account,
            source_record_type="escalation",
            source_record_id=source_record_id or escalation.id,
            source_record_route=f"/accounts/{escalation.account_id}?tab=timeline",
            priority=priority,
            dedupe_scope=f"{trigger}:{source_record_id or escalation.id}:{datetime.now(timezone.utc).isoformat()}",
            exclude_user_ids={current_user.id},
        )

    def _read(self, escalation: Escalation) -> EscalationRead:
        return EscalationRead.model_validate(escalation).model_copy(
            update={"custom_field_values": self.custom_fields.record_values("escalation_management", escalation.id)}
        )

    def _get_user_or_404(self, user_id: str, message: str) -> User:
        user = self.accounts.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
        return user

    def _require_escalation_view(self, user: User, escalation: Escalation) -> None:
        self.access.require_module_permission(user, "escalation_management", "view")
        if not self._can_view_escalation(user, escalation):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this escalation")

    def _require_escalation_update(self, user: User, escalation: Escalation) -> None:
        self.access.require_module_permission(user, "escalation_management", "update")
        account = self.accounts.get_by_id(escalation.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        if user.role not in GLOBAL_EDIT_ROLES and not self.access.can_update_account(user, account) and escalation.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this escalation")

    def _can_view_escalation(self, user: User, escalation: Escalation) -> bool:
        if user.role in GLOBAL_VIEW_ROLES:
            return True
        if escalation.owner_id == user.id:
            return True
        account = self.accounts.get_by_id(escalation.account_id)
        return bool(account and self.access.can_view_account(user, account))

    @staticmethod
    def _can_override_closure(user: User, override_reason: str | None) -> bool:
        return bool(override_reason and user.role in GLOBAL_EDIT_ROLES | {"kam_head"})

    @staticmethod
    def default_sla_due_at(severity: str) -> datetime:
        return datetime.now(timezone.utc) + SLA_TARGETS.get(severity, SLA_TARGETS["medium"])

    @staticmethod
    def _snapshot(escalation: Escalation) -> dict:
        return {
            "summary": escalation.summary,
            "severity": escalation.severity,
            "priority": escalation.priority,
            "status": escalation.status,
            "owner_id": escalation.owner_id,
            "watchlist": escalation.watchlist,
            "sla_due_at": escalation.sla_due_at.isoformat() if escalation.sla_due_at else None,
        }
