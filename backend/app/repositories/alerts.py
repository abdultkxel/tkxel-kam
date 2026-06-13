from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Alert, AlertRule, AlertStatusHistory, ScheduledWorkerRun


class AlertRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_rules(self) -> list[AlertRule]:
        return list(self.db.scalars(select(AlertRule).order_by(AlertRule.sort_order, AlertRule.name)))

    def list_active_rules(self, *, rule_id: str | None = None) -> list[AlertRule]:
        conditions = [AlertRule.is_active.is_(True)]
        if rule_id:
            conditions.append(AlertRule.id == rule_id)
        return list(self.db.scalars(select(AlertRule).where(*conditions).order_by(AlertRule.sort_order, AlertRule.name)))

    def get_rule(self, rule_id: str) -> AlertRule | None:
        return self.db.get(AlertRule, rule_id)

    def get_rule_by_key(self, rule_key: str) -> AlertRule | None:
        return self.db.scalar(select(AlertRule).where(AlertRule.rule_key == rule_key))

    def save_rule(self, rule: AlertRule) -> AlertRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def get_alert(self, alert_id: str) -> Alert | None:
        return self.db.scalar(
            select(Alert)
            .where(Alert.id == alert_id)
            .options(selectinload(Alert.status_history), selectinload(Alert.account), selectinload(Alert.owner))
        )

    def find_active_alert_by_deduplication_key(self, deduplication_key: str) -> Alert | None:
        return self.db.scalar(
            select(Alert)
            .where(Alert.deduplication_key == deduplication_key, Alert.status.in_(("open", "acknowledged", "snoozed")))
            .order_by(Alert.created_at.desc())
            .limit(1)
        )

    def list_current_alerts_for_scope(self, *, rule_ids: list[str], account_id: str | None = None) -> list[Alert]:
        conditions = [Alert.rule_id.in_(rule_ids) if rule_ids else False, Alert.status.in_(("open", "acknowledged", "snoozed"))]
        if account_id:
            conditions.append(Alert.account_id == account_id)
        return list(self.db.scalars(select(Alert).where(*conditions)))

    def list_alerts(
        self,
        *,
        account_ids: list[str] | None = None,
        status_filter: str | None = None,
        severity: str | None = None,
        alert_type: str | None = None,
        account_id: str | None = None,
        owner_id: str | None = None,
        source_type: str | None = None,
        search: str | None = None,
        now: datetime | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[Alert], int]:
        conditions = []
        if account_ids is not None:
            conditions.append(Alert.account_id.in_(account_ids) if account_ids else False)
        if status_filter == "active":
            conditions.append(Alert.status.in_(("open", "acknowledged", "snoozed")))
            if now is not None:
                conditions.append(or_(Alert.status != "snoozed", Alert.snoozed_until.is_(None), Alert.snoozed_until <= now))
        elif status_filter:
            conditions.append(Alert.status == status_filter)
        if severity:
            conditions.append(Alert.severity == severity)
        if alert_type:
            conditions.append(Alert.alert_type == alert_type)
        if account_id:
            conditions.append(Alert.account_id == account_id)
        if owner_id:
            conditions.append(Alert.owner_id == owner_id)
        if source_type:
            conditions.append(Alert.source_record_type == source_type)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Alert.title.ilike(term),
                    Alert.detail.ilike(term),
                    Alert.rule_key.ilike(term),
                    Alert.account_name.ilike(term),
                    Alert.owner_name.ilike(term),
                    Alert.recommended_action.ilike(term),
                    cast(Alert.source_evidence_json, String).ilike(term),
                )
            )
        total = self.db.scalar(select(func.count(Alert.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(Alert)
                .where(*conditions)
                .options(selectinload(Alert.status_history), selectinload(Alert.account), selectinload(Alert.owner))
                .order_by(
                    Alert.status.asc(),
                    case(
                        (Alert.severity == "critical", 4),
                        (Alert.severity == "high", 3),
                        (Alert.severity == "medium", 2),
                        (Alert.severity == "low", 1),
                        else_=0,
                    ).desc(),
                    Alert.last_triggered_at.desc(),
                    Alert.created_at.desc(),
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_alert(self, alert: Alert) -> Alert:
        self.db.add(alert)
        self.db.flush()
        return alert

    def save_status_history(self, history: AlertStatusHistory) -> AlertStatusHistory:
        self.db.add(history)
        self.db.flush()
        return history

    def save_worker_run(self, run: ScheduledWorkerRun) -> ScheduledWorkerRun:
        self.db.add(run)
        self.db.flush()
        return run

    def commit(self) -> None:
        self.db.commit()
