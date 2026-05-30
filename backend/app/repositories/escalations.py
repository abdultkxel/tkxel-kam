from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Escalation, EscalationNotification, EscalationUpdate


class EscalationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_escalations(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        visible_user_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        severity: str | None = None,
        priority: str | None = None,
        owner_id: str | None = None,
        status: str | None = None,
        watchlist: bool | None = None,
        sla_from: datetime | None = None,
        sla_to: datetime | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "sla_due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Escalation], int]:
        conditions = self._conditions(
            account_id=account_id,
            account_ids=account_ids,
            visible_user_id=visible_user_id,
            engagement_id=engagement_id,
            search=search,
            severity=severity,
            priority=priority,
            owner_id=owner_id,
            status=status,
            watchlist=watchlist,
            sla_from=sla_from,
            sla_to=sla_to,
            created_from=created_from,
            created_to=created_to,
        )
        total = self.db.scalar(select(func.count(Escalation.id)).where(*conditions)) or 0
        order_column = {
            "severity": Escalation.severity,
            "sla_due_at": Escalation.sla_due_at,
            "created_at": Escalation.created_at,
            "updated_at": Escalation.updated_at,
        }.get(sort, Escalation.sla_due_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(Escalation)
                .where(*conditions)
                .options(selectinload(Escalation.updates), selectinload(Escalation.notifications))
                .order_by(order_column, Escalation.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get(self, escalation_id: str) -> Escalation | None:
        return self.db.scalar(
            select(Escalation)
            .where(Escalation.id == escalation_id)
            .options(selectinload(Escalation.updates), selectinload(Escalation.notifications))
        )

    def save(self, escalation: Escalation) -> Escalation:
        self.db.add(escalation)
        self.db.flush()
        return escalation

    def add_update(self, update: EscalationUpdate) -> EscalationUpdate:
        self.db.add(update)
        self.db.flush()
        return update

    def list_updates(self, escalation_id: str, page: int, page_size: int) -> tuple[list[EscalationUpdate], int]:
        conditions = [EscalationUpdate.escalation_id == escalation_id]
        total = self.db.scalar(select(func.count(EscalationUpdate.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(EscalationUpdate)
                .where(*conditions)
                .order_by(EscalationUpdate.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_notification_by_deduplication_key(self, key: str) -> EscalationNotification | None:
        return self.db.scalar(select(EscalationNotification).where(EscalationNotification.deduplication_key == key))

    def add_notification(self, notification: EscalationNotification) -> EscalationNotification:
        self.db.add(notification)
        self.db.flush()
        return notification

    def list_notifications(
        self,
        *,
        escalation_id: str | None = None,
        search: str | None = None,
        recipient: str | None = None,
        channel: str | None = None,
        trigger: str | None = None,
        delivery_status: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[EscalationNotification], int]:
        conditions = []
        if escalation_id:
            conditions.append(EscalationNotification.escalation_id == escalation_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    EscalationNotification.escalation_id.ilike(term),
                    EscalationNotification.reason.ilike(term),
                    EscalationNotification.deduplication_key.ilike(term),
                )
            )
        if recipient:
            term = f"%{recipient.strip()}%"
            conditions.append(or_(EscalationNotification.recipient_name.ilike(term), EscalationNotification.recipient_email.ilike(term)))
        if channel:
            conditions.append(EscalationNotification.channel == channel)
        if trigger:
            conditions.append(EscalationNotification.trigger == trigger)
        if delivery_status:
            conditions.append(EscalationNotification.delivery_status == delivery_status)
        if created_from:
            conditions.append(EscalationNotification.created_at >= created_from)
        if created_to:
            conditions.append(EscalationNotification.created_at <= created_to)

        total = self.db.scalar(select(func.count(EscalationNotification.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(EscalationNotification)
                .where(*conditions)
                .order_by(EscalationNotification.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _conditions(
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        visible_user_id: str | None,
        engagement_id: str | None,
        search: str | None,
        severity: str | None,
        priority: str | None,
        owner_id: str | None,
        status: str | None,
        watchlist: bool | None,
        sla_from: datetime | None,
        sla_to: datetime | None,
        created_from: datetime | None,
        created_to: datetime | None,
    ) -> list:
        conditions = []
        if account_id:
            conditions.append(Escalation.account_id == account_id)
        if account_ids is not None:
            account_condition = Escalation.account_id.in_(account_ids) if account_ids else None
            owner_condition = Escalation.owner_id == visible_user_id if visible_user_id else None
            visibility_conditions = [condition for condition in (account_condition, owner_condition) if condition is not None]
            conditions.append(or_(*visibility_conditions) if visibility_conditions else False)
        if engagement_id:
            conditions.append(Escalation.engagement_id == engagement_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Escalation.summary.ilike(term),
                    Escalation.impact.ilike(term),
                    Escalation.rca.ilike(term),
                    Escalation.mitigation.ilike(term),
                    Escalation.updates.any(EscalationUpdate.body.ilike(term)),
                )
            )
        if severity:
            conditions.append(Escalation.severity == severity)
        if priority:
            conditions.append(Escalation.priority == priority)
        if owner_id:
            conditions.append(Escalation.owner_id == owner_id)
        if status:
            conditions.append(Escalation.status == status)
        if watchlist is not None:
            conditions.append(Escalation.watchlist.is_(watchlist))
        if sla_from:
            conditions.append(Escalation.sla_due_at >= sla_from)
        if sla_to:
            conditions.append(Escalation.sla_due_at <= sla_to)
        if created_from:
            conditions.append(Escalation.created_at >= created_from)
        if created_to:
            conditions.append(Escalation.created_at <= created_to)
        return conditions
