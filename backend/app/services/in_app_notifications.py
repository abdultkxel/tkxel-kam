from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountOwner, User
from app.services.notifications import ADMIN_NOTIFICATION_PERMISSIONS, NotificationsService

logger = logging.getLogger(__name__)


class InAppNotificationService:
    """Best-effort persisted in-app notifications for domain workflow hooks."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.notifications = NotificationsService(db)

    def queue(
        self,
        *,
        recipient: User | None,
        trigger: str,
        title: str,
        body: str,
        account: Account | None = None,
        source_record_type: str | None = None,
        source_record_id: str | None = None,
        source_record_route: str | None = None,
        priority: str = "medium",
        delivery_metadata: dict[str, Any] | None = None,
        dedupe_scope: str | None = None,
    ) -> None:
        if recipient is None or not recipient.is_active:
            return
        deduplication_key = None
        if dedupe_scope:
            source = f"{source_record_type or 'none'}:{source_record_id or 'none'}:{dedupe_scope}"
            deduplication_key = f"{recipient.id}:{trigger}:{source}"
        try:
            self.notifications.queue_notification(
                recipient=recipient,
                trigger=trigger,
                title=title,
                body=body,
                account=account,
                source_record_type=source_record_type,
                source_record_id=source_record_id,
                source_record_route=source_record_route,
                priority=priority,
                delivery_metadata={"channel_scope": "in_app", **(delivery_metadata or {})},
                deduplication_key=deduplication_key,
                in_app_only=True,
            )
        except HTTPException as exc:
            logger.info("Skipped in-app notification trigger=%s recipient=%s detail=%s", trigger, recipient.id, exc.detail)
        except Exception:
            logger.exception("Failed to queue in-app notification trigger=%s recipient=%s", trigger, recipient.id)

    def queue_many(
        self,
        recipients: Iterable[User | None],
        *,
        trigger: str,
        title: str,
        body: str,
        account: Account | None = None,
        source_record_type: str | None = None,
        source_record_id: str | None = None,
        source_record_route: str | None = None,
        priority: str = "medium",
        delivery_metadata: dict[str, Any] | None = None,
        dedupe_scope: str | None = None,
        exclude_user_ids: set[str] | None = None,
    ) -> None:
        exclude = exclude_user_ids or set()
        seen: set[str] = set()
        for recipient in recipients:
            if recipient is None or recipient.id in exclude or recipient.id in seen:
                continue
            seen.add(recipient.id)
            self.queue(
                recipient=recipient,
                trigger=trigger,
                title=title,
                body=body,
                account=account,
                source_record_type=source_record_type,
                source_record_id=source_record_id,
                source_record_route=source_record_route,
                priority=priority,
                delivery_metadata=delivery_metadata,
                dedupe_scope=dedupe_scope,
            )

    def active_user(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        user = self.db.get(User, user_id)
        return user if user and user.is_active else None

    def users_by_roles(self, roles: Iterable[str]) -> list[User]:
        role_list = [role for role in roles if role]
        if not role_list:
            return []
        return list(self.db.scalars(select(User).where(User.role.in_(role_list), User.is_active.is_(True)).order_by(User.full_name, User.email)))

    def users_with_any_permission(self, permission_keys: set[str]) -> list[User]:
        return self.notifications.active_users_with_any_permission(permission_keys)

    def admins(self) -> list[User]:
        return self.users_with_any_permission(ADMIN_NOTIFICATION_PERMISSIONS)

    def users_by_emails(self, emails: Iterable[str | None]) -> list[User]:
        normalized = [str(email).strip().lower() for email in emails if str(email or "").strip()]
        if not normalized:
            return []
        return list(self.db.scalars(select(User).where(User.email.in_(normalized), User.is_active.is_(True)).order_by(User.full_name, User.email)))

    def account_owners(self, account: Account | None) -> list[User]:
        if account is None:
            return []
        owner_rows = list(
            self.db.scalars(
                select(AccountOwner)
                .where(AccountOwner.account_id == account.id, AccountOwner.is_active.is_(True), AccountOwner.user_id.is_not(None))
                .order_by(AccountOwner.is_primary.desc(), AccountOwner.created_at.asc())
            )
        )
        users = [self.active_user(owner.user_id) for owner in owner_rows]
        return [user for user in users if user is not None]

    def account_owners_and_admins(self, account: Account | None) -> list[User]:
        return [*self.account_owners(account), *self.admins()]
