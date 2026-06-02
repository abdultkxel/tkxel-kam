from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Signal, SignalEvent, SignalRule


class SignalsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_rules(self, *, active_only: bool = False) -> list[SignalRule]:
        conditions = []
        if active_only:
            conditions.append(SignalRule.is_active.is_(True))
        return list(self.db.scalars(select(SignalRule).where(*conditions).order_by(SignalRule.signal_type, SignalRule.name)))

    def list_rules_page(
        self,
        *,
        search: str | None = None,
        signal_type: str | None = None,
        severity: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[SignalRule], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(SignalRule.name.ilike(term), SignalRule.slug.ilike(term), SignalRule.description.ilike(term), SignalRule.signal_type.ilike(term)))
        if signal_type:
            conditions.append(SignalRule.signal_type == signal_type)
        if severity:
            conditions.append(SignalRule.severity == severity)
        if active_state == "active":
            conditions.append(SignalRule.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(SignalRule.is_active.is_(False))

        total = self.db.scalar(select(func.count(SignalRule.id)).where(*conditions)) or 0
        order_column = {
            "name": SignalRule.name,
            "signal_type": SignalRule.signal_type,
            "severity": SignalRule.severity,
            "updated_at": SignalRule.updated_at,
            "created_at": SignalRule.created_at,
        }.get(sort, SignalRule.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(SignalRule)
                .where(*conditions)
                .order_by(order_column, SignalRule.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_rule(self, rule_id: str) -> SignalRule | None:
        return self.db.get(SignalRule, rule_id)

    def get_rule_by_slug(self, slug: str) -> SignalRule | None:
        return self.db.scalar(select(SignalRule).where(SignalRule.slug == slug))

    def save_rule(self, rule: SignalRule) -> SignalRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def get_signal(self, signal_id: str) -> Signal | None:
        return self.db.get(Signal, signal_id)

    def find_signal(
        self,
        *,
        account_id: str,
        engagement_id: str | None,
        rule_id: str | None,
        source_record_id: str | None,
        condition_key: str | None,
    ) -> Signal | None:
        conditions = [
            Signal.account_id == account_id,
            Signal.rule_id == rule_id,
            Signal.source_record_id == source_record_id,
            Signal.condition_key == condition_key,
        ]
        if engagement_id:
            conditions.append(Signal.engagement_id == engagement_id)
        else:
            conditions.append(Signal.engagement_id.is_(None))
        return self.db.scalar(select(Signal).where(*conditions).order_by(Signal.created_at.desc()).limit(1))

    def save_signal(self, signal: Signal) -> Signal:
        self.db.add(signal)
        self.db.flush()
        return signal

    def add_event(self, event: SignalEvent) -> SignalEvent:
        self.db.add(event)
        self.db.flush()
        return event

    def list_signals(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        signal_type: str | None = None,
        severity: str | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        active_only: bool = False,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Signal], int]:
        conditions = []
        if account_id:
            conditions.append(Signal.account_id == account_id)
        if account_ids is not None:
            conditions.append(Signal.account_id.in_(account_ids) if account_ids else Signal.account_id == "__no_access__")
        if engagement_id:
            conditions.append(Signal.engagement_id == engagement_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Signal.title.ilike(term), Signal.detail.ilike(term), Signal.signal_type.ilike(term), Signal.owner_name.ilike(term)))
        if signal_type:
            conditions.append(Signal.signal_type == signal_type)
        if severity:
            conditions.append(Signal.severity == severity)
        if status_filter:
            conditions.append(Signal.status == status_filter)
        if owner_id:
            conditions.append(Signal.owner_id == owner_id)
        if active_only:
            conditions.append(Signal.status.in_(("new", "reviewed", "accepted", "converted")))
        if date_from:
            conditions.append(Signal.created_at >= date_from)
        if date_to:
            conditions.append(Signal.created_at <= date_to)

        total = self.db.scalar(select(func.count(Signal.id)).where(*conditions)) or 0
        order_column = {
            "created_at": Signal.created_at,
            "updated_at": Signal.updated_at,
            "due_at": Signal.due_at,
            "severity": Signal.severity,
            "status": Signal.status,
            "owner_name": Signal.owner_name,
            "confidence": Signal.confidence,
        }.get(sort, Signal.created_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(Signal)
                .where(*conditions)
                .order_by(order_column, Signal.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def commit(self) -> None:
        self.db.commit()

    def flush(self) -> None:
        self.db.flush()
