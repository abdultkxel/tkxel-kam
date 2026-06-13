from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    AccountOwner,
    Alert,
    AlertRule,
    AlertStatusHistory,
    Engagement,
    GovernanceActionItem,
    GovernanceEvent,
    Opportunity,
    OpportunityStageDefinition,
    ScheduledWorkerRun,
    ScoreSnapshot,
    Task,
    User,
    utc_now,
)
from app.repositories.accounts import AccountRepository
from app.repositories.alerts import AlertRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    AlertEvaluationRead,
    AlertPageRead,
    AlertPreviewMatchRead,
    AlertRead,
    AlertRulePreviewRead,
    AlertRuleRead,
    AlertRuleUpdateRequest,
    AlertStatusUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.notifications import NotificationsService
from app.services.user_management import page_count

ALERTS_MODULE = "alerts"
OPEN_STATUSES = {"open", "acknowledged", "snoozed"}
TERMINAL_TASK_STATUSES = {"completed", "done", "cancelled", "skipped"}
TERMINAL_GOVERNANCE_STATUSES = {"completed", "cancelled"}
SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}

DEFAULT_ALERT_RULES: tuple[dict[str, Any], ...] = (
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "rule_key": "low_overall_health",
        "name": "Low overall health",
        "description": "Creates an alert when an account overall health score is below the configured floor.",
        "alert_type": "health_risk",
        "source_type": "account",
        "threshold_value": 60,
        "threshold_unit": "score",
        "severity": "high",
        "snooze_days": 7,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": True,
        "sort_order": 10,
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "rule_key": "overall_score_drop",
        "name": "Overall score drop",
        "description": "Creates an alert when the latest account score dropped by the configured number of points.",
        "alert_type": "score_drop",
        "source_type": "score_snapshot",
        "threshold_value": 10,
        "threshold_unit": "points",
        "severity": "high",
        "snooze_days": 7,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": True,
        "sort_order": 20,
    },
    {
        "id": "33333333-3333-4333-8333-333333333333",
        "rule_key": "engagement_renewal_window",
        "name": "Engagement/SOW renewal or notice/end window",
        "description": "Creates an alert when an active engagement renewal, notice, or end date is inside the configured day window.",
        "alert_type": "engagement_renewal_window",
        "source_type": "engagement",
        "threshold_value": 60,
        "threshold_unit": "days",
        "severity": "medium",
        "snooze_days": 14,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": False,
        "sort_order": 30,
    },
    {
        "id": "44444444-4444-4444-8444-444444444444",
        "rule_key": "opportunity_stalled",
        "name": "Opportunity stalled",
        "description": "Creates an alert when an open opportunity has not moved stages within the configured day window.",
        "alert_type": "opportunity_stalled",
        "source_type": "opportunity",
        "threshold_value": 90,
        "threshold_unit": "days",
        "severity": "medium",
        "snooze_days": 7,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": False,
        "sort_order": 40,
    },
    {
        "id": "55555555-5555-4555-8555-555555555555",
        "rule_key": "task_overdue",
        "name": "Task overdue",
        "description": "Creates an alert when a task due date has elapsed and the task is not complete or cancelled.",
        "alert_type": "task_overdue",
        "source_type": "task",
        "threshold_value": 0,
        "threshold_unit": "days",
        "severity": "medium",
        "snooze_days": 3,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": False,
        "sort_order": 50,
    },
    {
        "id": "66666666-6666-4666-8666-666666666666",
        "rule_key": "governance_event_overdue",
        "name": "Governance event overdue",
        "description": "Creates an alert when a governance event is overdue by the configured number of days.",
        "alert_type": "governance_event_overdue",
        "source_type": "governance_event",
        "threshold_value": 1,
        "threshold_unit": "days",
        "severity": "high",
        "snooze_days": 3,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": True,
        "sort_order": 60,
    },
    {
        "id": "77777777-7777-4777-8777-777777777777",
        "rule_key": "governance_action_overdue",
        "name": "Governance action overdue",
        "description": "Creates an alert when a governance action due date is overdue by the configured number of days.",
        "alert_type": "governance_action_overdue",
        "source_type": "governance_action_item",
        "threshold_value": 1,
        "threshold_unit": "days",
        "severity": "high",
        "snooze_days": 3,
        "recipient_policy": "source_owner_first",
        "escalation_enabled": True,
        "sort_order": 70,
    },
)


@dataclass
class AlertMatch:
    rule: AlertRule
    account: Account | None
    engagement: Engagement | None
    source_record_type: str
    source_record_id: str
    title: str
    detail: str
    recommended_action: str
    evidence: list[dict[str, Any]]
    previous_value: dict[str, Any] | None
    new_value: dict[str, Any]
    owner_user: User | None
    owner_snapshot: dict[str, str | None]
    condition_score: float

    @property
    def deduplication_key(self) -> str:
        return f"{self.rule.rule_key}:{self.source_record_type}:{self.source_record_id}"


@dataclass
class EvaluationCounts:
    evaluated: int = 0
    matched: int = 0
    created: int = 0
    updated: int = 0
    resolved: int = 0
    reactivated: int = 0
    notifications_created: int = 0


class AlertsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AlertRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(db))
        self.notifications = NotificationsService(db)

    def seed_default_rules(self, actor: User | None = None) -> None:
        for item in DEFAULT_ALERT_RULES:
            rule = self.repository.get_rule_by_key(item["rule_key"])
            if rule is None:
                rule = AlertRule(id=item["id"], rule_key=item["rule_key"], created_by_id=actor.id if actor else None)
            rule.name = item["name"]
            rule.description = item["description"]
            rule.alert_type = item["alert_type"]
            rule.source_type = item["source_type"]
            if rule.threshold_value is None:
                rule.threshold_value = float(item["threshold_value"])
            rule.threshold_unit = item["threshold_unit"]
            rule.severity = rule.severity or item["severity"]
            rule.snooze_days = rule.snooze_days if rule.snooze_days is not None else item["snooze_days"]
            rule.recipient_policy = rule.recipient_policy or item["recipient_policy"]
            if rule.escalation_enabled is None:
                rule.escalation_enabled = item["escalation_enabled"]
            rule.is_active = True if rule.is_active is None else rule.is_active
            rule.sort_order = item["sort_order"]
            rule.updated_by_id = actor.id if actor else rule.updated_by_id
            self.repository.save_rule(rule)
        self.repository.commit()

    def list_rules(self, current_user: User) -> list[AlertRuleRead]:
        self.access.require_module_permission(current_user, ALERTS_MODULE, "configure")
        return [AlertRuleRead.model_validate(item) for item in self.repository.list_rules()]

    def update_rule(self, rule_id: str, payload: AlertRuleUpdateRequest, current_user: User) -> AlertRuleRead:
        self.access.require_module_permission(current_user, ALERTS_MODULE, "configure")
        rule = self.repository.get_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule was not found")
        before = AlertRuleRead.model_validate(rule).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if value is not None:
                setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        self.audit.log(module=ALERTS_MODULE, action="configure_rule", entity_type="alert_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=updates)
        self.repository.commit()
        return AlertRuleRead.model_validate(rule)

    def preview_rule(self, rule_id: str, current_user: User) -> AlertRulePreviewRead:
        self.access.require_module_permission(current_user, ALERTS_MODULE, "configure")
        rule = self.repository.get_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule was not found")
        matches = self._matches_for_rule(rule, account_id=None, now=utc_now())
        sample = [
            AlertPreviewMatchRead(
                account_id=match.account.id if match.account else None,
                account_name=match.account.name if match.account else None,
                engagement_id=match.engagement.id if match.engagement else None,
                engagement_name=match.engagement.name if match.engagement else None,
                source_record_type=match.source_record_type,
                source_record_id=match.source_record_id,
                title=match.title,
                detail=match.detail,
                severity=match.rule.severity,
                evidence=match.evidence,
            )
            for match in matches[:25]
        ]
        return AlertRulePreviewRead(rule_id=rule.id, rule_key=rule.rule_key, total_matches=len(matches), sample=sample)

    def list_alerts(
        self,
        current_user: User,
        *,
        status_filter: str | None = None,
        severity: str | None = None,
        alert_type: str | None = None,
        account_id: str | None = None,
        owner_id: str | None = None,
        source_type: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> AlertPageRead:
        self.access.require_module_permission(current_user, ALERTS_MODULE, "view")
        account_ids = self._account_scope(current_user)
        if account_id:
            account = self.accounts.get_by_id(account_id)
            if account is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
            self.access.require_account_view(current_user, account, module="accounts")
        items, total = self.repository.list_alerts(
            account_ids=account_ids,
            status_filter=status_filter,
            severity=severity,
            alert_type=alert_type,
            account_id=account_id,
            owner_id=owner_id,
            source_type=source_type,
            search=search,
            now=utc_now(),
            page=page,
            page_size=page_size,
        )
        return AlertPageRead(items=[AlertRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_alert(self, alert_id: str, current_user: User) -> AlertRead:
        self.access.require_module_permission(current_user, ALERTS_MODULE, "view")
        alert = self.repository.get_alert(alert_id)
        if alert is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert was not found")
        if alert.account:
            self.access.require_account_view(current_user, alert.account, module="accounts")
        return AlertRead.model_validate(alert)

    def update_status(self, alert_id: str, payload: AlertStatusUpdateRequest, current_user: User) -> AlertRead:
        alert = self.repository.get_alert(alert_id)
        if alert is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert was not found")
        if alert.account:
            self.access.require_account_view(current_user, alert.account, module="accounts")
        if not self._can_update_alert(current_user, alert):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to update this alert")
        before = AlertRead.model_validate(alert).model_dump(mode="json")
        self._change_status(alert, payload.status, current_user, reason=payload.reason, snoozed_until=payload.snoozed_until)
        self.audit.log(module=ALERTS_MODULE, action="update_status", entity_type="alert", entity_id=alert.id, actor=current_user, before_value=before, after_value={"status": payload.status, "snoozed_until": payload.snoozed_until.isoformat() if payload.snoozed_until else None}, reason=payload.reason)
        self.repository.commit()
        return AlertRead.model_validate(alert)

    def evaluate(self, payload: Any, current_user: User | None, *, mode: str = "manual") -> AlertEvaluationRead:
        scope = payload.scope
        account_id = payload.account_id
        rule_id = payload.rule_id
        if current_user is not None:
            if scope == "all":
                self.access.require_module_permission(current_user, ALERTS_MODULE, "configure")
            else:
                self.access.require_module_permission(current_user, ALERTS_MODULE, "view")
                account = self.accounts.get_by_id(account_id)
                if account is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
                self.access.require_account_view(current_user, account, module="accounts")
        started_at = utc_now()
        counts = self._evaluate_rules(account_id=account_id if scope == "account" else None, rule_id=rule_id, actor=current_user)
        run = ScheduledWorkerRun(
            job_type="alert_evaluation",
            mode=mode,
            status="complete",
            matched_count=counts.matched,
            affected_count=counts.created + counts.updated + counts.resolved + counts.reactivated,
            actor_id=current_user.id if current_user else None,
            actor_name=current_user.full_name if current_user else "System",
            started_at=started_at,
            finished_at=utc_now(),
            metadata_json={
                "scope": scope,
                "account_id": account_id,
                "rule_id": rule_id,
                "evaluated": counts.evaluated,
                "created": counts.created,
                "updated": counts.updated,
                "resolved": counts.resolved,
                "reactivated": counts.reactivated,
                "notifications_created": counts.notifications_created,
            },
        )
        self.repository.save_worker_run(run)
        self.repository.commit()
        return AlertEvaluationRead(
            evaluated=counts.evaluated,
            matched=counts.matched,
            created=counts.created,
            updated=counts.updated,
            resolved=counts.resolved,
            reactivated=counts.reactivated,
            notifications_created=counts.notifications_created,
            worker_run_id=run.id,
        )

    def run_scheduled_evaluation(self) -> AlertEvaluationRead:
        try:
            return self.evaluate(type("Payload", (), {"scope": "all", "account_id": None, "rule_id": None})(), None, mode="scheduled")
        except Exception as exc:
            run = ScheduledWorkerRun(
                job_type="alert_evaluation",
                mode="scheduled",
                status="failed",
                error_message=str(exc),
                finished_at=utc_now(),
                metadata_json={"error_type": exc.__class__.__name__},
            )
            self.repository.save_worker_run(run)
            self.repository.commit()
            raise

    def evaluate_for_account(self, account_id: str) -> None:
        try:
            self._evaluate_rules(account_id=account_id, rule_id=None, actor=None)
            self.repository.commit()
        except Exception:
            self.db.rollback()

    def _evaluate_rules(self, *, account_id: str | None, rule_id: str | None, actor: User | None) -> EvaluationCounts:
        rules = self.repository.list_active_rules(rule_id=rule_id)
        if rule_id and not rules:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active alert rule was not found")
        now = utc_now()
        counts = EvaluationCounts(evaluated=len(rules))
        matched_keys: set[str] = set()
        for rule in rules:
            matches = self._matches_for_rule(rule, account_id=account_id, now=now)
            counts.matched += len(matches)
            for match in matches:
                matched_keys.add(match.deduplication_key)
                self._apply_match(match, actor, now, counts)
        current_alerts = self.repository.list_current_alerts_for_scope(rule_ids=[rule.id for rule in rules], account_id=account_id)
        for alert in current_alerts:
            if alert.deduplication_key in matched_keys:
                continue
            self._change_status(alert, "resolved", actor, reason="Condition cleared by evaluation.", resolved_reason="condition_cleared")
            counts.resolved += 1
        return counts

    def _apply_match(self, match: AlertMatch, actor: User | None, now: datetime, counts: EvaluationCounts) -> None:
        existing = self.repository.find_active_alert_by_deduplication_key(match.deduplication_key)
        if existing is None:
            alert = Alert(
                rule_id=match.rule.id,
                rule_key=match.rule.rule_key,
                alert_type=match.rule.alert_type,
                title=match.title,
                detail=match.detail,
                severity=match.rule.severity,
                status="open",
                owner_id=match.owner_snapshot.get("id"),
                owner_name=match.owner_snapshot.get("name"),
                owner_email=match.owner_snapshot.get("email"),
                account_id=match.account.id if match.account else None,
                account_name=match.account.name if match.account else None,
                engagement_id=match.engagement.id if match.engagement else None,
                engagement_name=match.engagement.name if match.engagement else None,
                project_name=match.account.project_name if match.account else None,
                source_record_type=match.source_record_type,
                source_record_id=match.source_record_id,
                source_record_route=self._account_route(match.account),
                source_evidence_json=match.evidence,
                previous_value_json=match.previous_value,
                new_value_json=match.new_value,
                recommended_action=match.recommended_action,
                deduplication_key=match.deduplication_key,
                first_triggered_at=now,
                last_triggered_at=now,
                created_by_id=actor.id if actor else None,
                updated_by_id=actor.id if actor else None,
            )
            self.repository.save_alert(alert)
            alert.source_record_route = self._account_route(match.account, alert.id)
            self._add_history(alert, None, "open", actor, reason="Alert created by evaluation.", metadata={"condition_score": match.condition_score})
            if actor is not None:
                self.audit.log(module=ALERTS_MODULE, action="create_alert", entity_type="alert", entity_id=alert.id, actor=actor, after_value={"rule_key": match.rule.rule_key, "account_id": alert.account_id, "source_record_type": alert.source_record_type, "source_record_id": alert.source_record_id, "severity": alert.severity})
            counts.created += 1
            counts.notifications_created += self._notify_alert(alert, match.rule, match.owner_user, event="created", now=now)
            return

        old_score = float((existing.new_value_json or {}).get("condition_score", 0) or 0)
        old_status = existing.status
        old_severity = existing.severity
        existing.title = match.title
        existing.detail = match.detail
        existing.severity = match.rule.severity
        existing.owner_id = match.owner_snapshot.get("id")
        existing.owner_name = match.owner_snapshot.get("name")
        existing.owner_email = match.owner_snapshot.get("email")
        existing.account_id = match.account.id if match.account else None
        existing.account_name = match.account.name if match.account else None
        existing.engagement_id = match.engagement.id if match.engagement else None
        existing.engagement_name = match.engagement.name if match.engagement else None
        existing.project_name = match.account.project_name if match.account else None
        existing.source_record_route = self._account_route(match.account, existing.id)
        existing.source_evidence_json = match.evidence
        existing.previous_value_json = match.previous_value
        existing.new_value_json = match.new_value
        existing.recommended_action = match.recommended_action
        existing.last_triggered_at = now
        existing.updated_by_id = actor.id if actor else existing.updated_by_id
        expired_snooze = existing.status == "snoozed" and existing.snoozed_until is not None and self._aware(existing.snoozed_until) <= now
        worsened = existing.status in {"acknowledged", "snoozed"} and (match.condition_score > old_score or SEVERITY_RANK.get(match.rule.severity, 0) > SEVERITY_RANK.get(old_severity, 0))
        if expired_snooze or worsened:
            reason = "Snooze expired and condition still matches." if expired_snooze else "Alert condition worsened after acknowledgement or snooze."
            self._change_status(existing, "open", actor, reason=reason, metadata={"previous_condition_score": old_score, "condition_score": match.condition_score})
            counts.reactivated += 1
            counts.notifications_created += self._notify_alert(existing, match.rule, match.owner_user, event="reactivated", now=now)
            return
        if old_status in OPEN_STATUSES:
            counts.updated += 1

    def _matches_for_rule(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        if rule.rule_key == "low_overall_health":
            return self._low_health_matches(rule, account_id=account_id)
        if rule.rule_key == "overall_score_drop":
            return self._score_drop_matches(rule, account_id=account_id)
        if rule.rule_key == "engagement_renewal_window":
            return self._engagement_window_matches(rule, account_id=account_id, now=now)
        if rule.rule_key == "opportunity_stalled":
            return self._opportunity_stalled_matches(rule, account_id=account_id, now=now)
        if rule.rule_key == "task_overdue":
            return self._task_overdue_matches(rule, account_id=account_id, now=now)
        if rule.rule_key == "governance_event_overdue":
            return self._governance_event_overdue_matches(rule, account_id=account_id, now=now)
        if rule.rule_key == "governance_action_overdue":
            return self._governance_action_overdue_matches(rule, account_id=account_id, now=now)
        return []

    def _low_health_matches(self, rule: AlertRule, *, account_id: str | None) -> list[AlertMatch]:
        conditions = [Account.archived_at.is_(None), Account.health_overall < int(rule.threshold_value)]
        if account_id:
            conditions.append(Account.id == account_id)
        accounts = list(self.db.scalars(select(Account).where(*conditions).options(selectinload(Account.owners)).order_by(Account.health_overall.asc())))
        matches: list[AlertMatch] = []
        for account in accounts:
            owner_user, owner_snapshot = self._owner_for_source(account, None, rule.recipient_policy)
            score = 100 - account.health_overall
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=None,
                    source_record_type="account",
                    source_record_id=account.id,
                    title=f"{account.name} is below the health floor",
                    detail=f"Overall health is {account.health_overall}/100, below the configured {int(rule.threshold_value)} threshold.",
                    recommended_action="Review score drivers, confirm owner follow-up, and document the recovery plan.",
                    evidence=[{"label": "Overall health", "value": account.health_overall}, {"label": "Threshold", "value": int(rule.threshold_value)}],
                    previous_value=None,
                    new_value={"health_overall": account.health_overall, "threshold": rule.threshold_value, "condition_score": score},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(score),
                )
            )
        return matches

    def _score_drop_matches(self, rule: AlertRule, *, account_id: str | None) -> list[AlertMatch]:
        conditions = [Account.archived_at.is_(None)]
        if account_id:
            conditions.append(Account.id == account_id)
        accounts = list(self.db.scalars(select(Account).where(*conditions).options(selectinload(Account.owners))))
        matches: list[AlertMatch] = []
        for account in accounts:
            latest = self._latest_score(account.id)
            if latest is None:
                continue
            previous = self._previous_score(account.id, latest.calculated_at)
            if previous is None:
                continue
            drop = previous.overall - latest.overall
            if drop < rule.threshold_value:
                continue
            owner_user, owner_snapshot = self._owner_for_source(account, None, rule.recipient_policy)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=None,
                    source_record_type="score_snapshot",
                    source_record_id=latest.id,
                    title=f"{account.name} score dropped by {drop} points",
                    detail=f"Overall score moved from {previous.overall} to {latest.overall}.",
                    recommended_action="Compare score drivers against the previous snapshot and assign follow-up for degraded dimensions.",
                    evidence=[{"label": "Previous score", "value": previous.overall, "id": previous.id}, {"label": "Latest score", "value": latest.overall, "id": latest.id}],
                    previous_value={"overall": previous.overall, "calculated_at": previous.calculated_at.isoformat(), "rag_status": previous.rag_status},
                    new_value={"overall": latest.overall, "calculated_at": latest.calculated_at.isoformat(), "rag_status": latest.rag_status, "drop": drop, "condition_score": drop},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(drop),
                )
            )
        return matches

    def _engagement_window_matches(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        conditions = [Engagement.archived_at.is_(None), Engagement.status.in_(("active", "renewal_watch", "at_risk", "on_hold"))]
        if account_id:
            conditions.append(Engagement.account_id == account_id)
        engagements = list(self.db.scalars(select(Engagement).where(*conditions).options(selectinload(Engagement.account).selectinload(Account.owners))))
        matches: list[AlertMatch] = []
        threshold_days = int(rule.threshold_value)
        for engagement in engagements:
            account = engagement.account
            if account is None:
                continue
            candidates = [
                ("notice deadline", engagement.notice_deadline),
                ("renewal date", engagement.renewal_date),
                ("end date", engagement.end_date),
            ]
            dated = [(label, self._aware(value)) for label, value in candidates if value is not None]
            due = [(label, value) for label, value in dated if (value.date() - now.date()).days <= threshold_days]
            if not due:
                continue
            label, target = min(due, key=lambda item: (item[1].date() - now.date()).days)
            days = (target.date() - now.date()).days
            owner_user, owner_snapshot = self._owner_for_source(account, engagement, rule.recipient_policy)
            condition_score = float(threshold_days - days)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=engagement,
                    source_record_type="engagement",
                    source_record_id=engagement.id,
                    title=f"{engagement.name} {label} needs attention",
                    detail=f"{label.capitalize()} is {target.date().isoformat()} ({days} day{'s' if days != 1 else ''} from now).",
                    recommended_action="Confirm renewal/notice owner, commercial path, and next client governance step.",
                    evidence=[{"label": label, "value": target.isoformat()}, {"label": "Window days", "value": threshold_days}],
                    previous_value=None,
                    new_value={"date_type": label, "target_at": target.isoformat(), "days_until": days, "condition_score": condition_score},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=condition_score,
                )
            )
        return matches

    def _opportunity_stalled_matches(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        terminal_stages = set(self.db.scalars(select(OpportunityStageDefinition.name).where(OpportunityStageDefinition.is_terminal.is_(True)))) | {"Won", "Lost"}
        conditions = [Opportunity.archived_at.is_(None), Opportunity.stage.notin_(terminal_stages)]
        if account_id:
            conditions.append(Opportunity.account_id == account_id)
        opportunities = list(
            self.db.scalars(
                select(Opportunity)
                .where(*conditions)
                .options(selectinload(Opportunity.account).selectinload(Account.owners), selectinload(Opportunity.engagement), selectinload(Opportunity.stage_history))
            )
        )
        matches: list[AlertMatch] = []
        threshold_days = int(rule.threshold_value)
        for opportunity in opportunities:
            account = opportunity.account
            if account is None:
                continue
            latest_movement = max((self._aware(item.created_at) for item in opportunity.stage_history), default=self._aware(opportunity.updated_at or opportunity.created_at))
            stalled_days = (now.date() - latest_movement.date()).days
            if stalled_days < threshold_days:
                continue
            owner_user, owner_snapshot = self._owner_for_source(account, opportunity, rule.recipient_policy)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=opportunity.engagement,
                    source_record_type="opportunity",
                    source_record_id=opportunity.id,
                    title=f"{opportunity.name} has stalled",
                    detail=f"Opportunity has stayed in {opportunity.stage} for {stalled_days} days.",
                    recommended_action="Review the next step, confirm stage accuracy, or move/close the opportunity.",
                    evidence=[{"label": "Current stage", "value": opportunity.stage}, {"label": "Days since stage movement", "value": stalled_days}],
                    previous_value=None,
                    new_value={"stage": opportunity.stage, "stalled_days": stalled_days, "threshold_days": threshold_days, "condition_score": stalled_days},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(stalled_days),
                )
            )
        return matches

    def _task_overdue_matches(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        conditions = [Task.status.notin_(TERMINAL_TASK_STATUSES), Task.due_at < now]
        if account_id:
            conditions.append(Task.account_id == account_id)
        tasks = list(self.db.scalars(select(Task).where(*conditions).options(selectinload(Task.account).selectinload(Account.owners), selectinload(Task.engagement))))
        matches: list[AlertMatch] = []
        for task in tasks:
            account = task.account
            if account is None:
                continue
            overdue_days = max(0, (now.date() - self._aware(task.due_at).date()).days)
            owner_user, owner_snapshot = self._owner_for_source(account, task, rule.recipient_policy)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=task.engagement,
                    source_record_type="task",
                    source_record_id=task.id,
                    title=f"Task overdue: {task.title}",
                    detail=f"Task was due {self._aware(task.due_at).date().isoformat()} and is currently {task.status}.",
                    recommended_action="Update the task owner, due date, or completion status from the task workflow.",
                    evidence=[{"label": "Due date", "value": self._aware(task.due_at).isoformat()}, {"label": "Status", "value": task.status}],
                    previous_value=None,
                    new_value={"due_at": self._aware(task.due_at).isoformat(), "status": task.status, "overdue_days": overdue_days, "condition_score": overdue_days},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(overdue_days),
                )
            )
        return matches

    def _governance_event_overdue_matches(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        due_before = now - timedelta(days=int(rule.threshold_value))
        conditions = [GovernanceEvent.status.notin_(TERMINAL_GOVERNANCE_STATUSES), GovernanceEvent.scheduled_at <= due_before]
        if account_id:
            conditions.append(GovernanceEvent.account_id == account_id)
        events = list(self.db.scalars(select(GovernanceEvent).where(*conditions).options(selectinload(GovernanceEvent.account).selectinload(Account.owners), selectinload(GovernanceEvent.engagement))))
        matches: list[AlertMatch] = []
        for event in events:
            account = event.account
            if account is None:
                continue
            overdue_days = max(0, (now.date() - self._aware(event.scheduled_at).date()).days)
            owner_user, owner_snapshot = self._owner_for_source(account, event, rule.recipient_policy)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=event.engagement,
                    source_record_type="governance_event",
                    source_record_id=event.id,
                    title=f"{event.governance_type} governance event is overdue",
                    detail=f"Scheduled for {self._aware(event.scheduled_at).date().isoformat()} and still {event.status}.",
                    recommended_action="Complete, reschedule, or cancel the governance event and document the outcome.",
                    evidence=[{"label": "Scheduled date", "value": self._aware(event.scheduled_at).isoformat()}, {"label": "Status", "value": event.status}],
                    previous_value=None,
                    new_value={"scheduled_at": self._aware(event.scheduled_at).isoformat(), "status": event.status, "overdue_days": overdue_days, "condition_score": overdue_days},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(overdue_days),
                )
            )
        return matches

    def _governance_action_overdue_matches(self, rule: AlertRule, *, account_id: str | None, now: datetime) -> list[AlertMatch]:
        due_before = now - timedelta(days=int(rule.threshold_value))
        conditions = [GovernanceActionItem.status.notin_(TERMINAL_TASK_STATUSES), GovernanceActionItem.due_at <= due_before]
        if account_id:
            conditions.append(GovernanceEvent.account_id == account_id)
        actions = list(
            self.db.scalars(
                select(GovernanceActionItem)
                .join(GovernanceEvent, GovernanceEvent.id == GovernanceActionItem.governance_event_id)
                .where(*conditions)
                .options(
                    selectinload(GovernanceActionItem.event).selectinload(GovernanceEvent.account).selectinload(Account.owners),
                    selectinload(GovernanceActionItem.event).selectinload(GovernanceEvent.engagement),
                )
            )
        )
        matches: list[AlertMatch] = []
        for action in actions:
            event = action.event
            account = event.account if event else None
            if account is None:
                continue
            overdue_days = max(0, (now.date() - self._aware(action.due_at).date()).days)
            owner_user, owner_snapshot = self._owner_for_source(account, action, rule.recipient_policy)
            matches.append(
                AlertMatch(
                    rule=rule,
                    account=account,
                    engagement=event.engagement if event else None,
                    source_record_type="governance_action_item",
                    source_record_id=action.id,
                    title=f"Governance action overdue: {action.title}",
                    detail=f"Action was due {self._aware(action.due_at).date().isoformat()} and is currently {action.status}.",
                    recommended_action="Update the action owner, due date, or completion status from the governance workflow.",
                    evidence=[{"label": "Due date", "value": self._aware(action.due_at).isoformat()}, {"label": "Status", "value": action.status}],
                    previous_value=None,
                    new_value={"due_at": self._aware(action.due_at).isoformat(), "status": action.status, "overdue_days": overdue_days, "condition_score": overdue_days},
                    owner_user=owner_user,
                    owner_snapshot=owner_snapshot,
                    condition_score=float(overdue_days),
                )
            )
        return matches

    def _latest_score(self, account_id: str) -> ScoreSnapshot | None:
        return self.db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account").order_by(ScoreSnapshot.calculated_at.desc()).limit(1))

    def _previous_score(self, account_id: str, before: datetime) -> ScoreSnapshot | None:
        return self.db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account", ScoreSnapshot.calculated_at < before).order_by(ScoreSnapshot.calculated_at.desc()).limit(1))

    def _owner_for_source(self, account: Account, source: Any | None, recipient_policy: str = "source_owner_first") -> tuple[User | None, dict[str, str | None]]:
        source_owner_id = getattr(source, "owner_id", None) if source is not None else None
        primary = self._primary_owner(account)
        primary_result = self._owner_snapshot_from_primary(primary)
        if recipient_policy == "account_owner_first":
            if primary_result[0] is not None or not source_owner_id:
                return primary_result
        if source_owner_id:
            user = self.db.get(User, source_owner_id)
            if user is not None and user.is_active:
                return user, {"id": user.id, "name": user.full_name, "email": user.email}
        if recipient_policy == "account_owner_first":
            return primary_result
        return primary_result

    def _owner_snapshot_from_primary(self, primary: AccountOwner | None) -> tuple[User | None, dict[str, str | None]]:
        if primary and primary.user_id:
            user = self.db.get(User, primary.user_id)
            if user is not None and user.is_active:
                return user, {"id": user.id, "name": user.full_name, "email": user.email}
        if primary:
            return None, {"id": primary.user_id, "name": primary.user_name, "email": primary.user_email}
        return None, {"id": None, "name": None, "email": None}

    @staticmethod
    def _primary_owner(account: Account) -> AccountOwner | None:
        return next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)

    def _notify_alert(self, alert: Alert, rule: AlertRule, owner_user: User | None, *, event: str, now: datetime) -> int:
        recipients: list[User] = []
        if owner_user is not None and owner_user.is_active:
            recipients.append(owner_user)
        if rule.escalation_enabled and alert.severity in {"high", "critical"}:
            recipients.extend(self._leadership_recipients())
        seen: set[str] = set()
        created = 0
        for recipient in recipients:
            if recipient.id in seen:
                continue
            seen.add(recipient.id)
            try:
                result = self.notifications.queue_notification(
                    recipient=recipient,
                    trigger="alert_created",
                    title=alert.title,
                    body=alert.detail,
                    account=alert.account,
                    source_record_type="alert",
                    source_record_id=alert.id,
                    source_record_route=alert.source_record_route,
                    priority=alert.severity if alert.severity in {"low", "medium", "high", "critical"} else "medium",
                    delivery_metadata={"alert_id": alert.id, "rule_key": alert.rule_key, "event": event},
                    deduplication_key=f"alert:{alert.id}:{recipient.id}:{event}:{int(now.timestamp())}",
                )
                if result.created:
                    created += 1
            except HTTPException:
                continue
        return created

    def _leadership_recipients(self) -> list[User]:
        return list(self.db.scalars(select(User).where(User.is_active.is_(True), User.role.in_(("super_admin", "admin", "kam_head"))).order_by(User.full_name, User.email)))

    def _can_update_alert(self, user: User, alert: Alert) -> bool:
        if self.access.has_any_permission(user, {"alerts:update", "accounts:update_profile_portfolio", "tasks:update_portfolio"}):
            return True
        if alert.owner_id == user.id:
            return True
        if alert.account and any(owner.user_id == user.id and owner.is_active for owner in alert.account.owners):
            return True
        return False

    def _change_status(
        self,
        alert: Alert,
        to_status: str,
        actor: User | None,
        *,
        reason: str | None = None,
        snoozed_until: datetime | None = None,
        resolved_reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        from_status = alert.status
        alert.status = to_status
        alert.updated_by_id = actor.id if actor else alert.updated_by_id
        if to_status == "snoozed":
            alert.snoozed_until = snoozed_until
            alert.resolved_at = None
            alert.resolved_reason = None
        elif to_status == "resolved":
            alert.resolved_at = utc_now()
            alert.resolved_reason = resolved_reason or reason
            alert.snoozed_until = None
        else:
            alert.snoozed_until = None
            alert.resolved_at = None
            alert.resolved_reason = None
        self._add_history(alert, from_status, to_status, actor, reason=reason, metadata=metadata or {})

    def _add_history(self, alert: Alert, from_status: str | None, to_status: str, actor: User | None, *, reason: str | None, metadata: dict[str, Any]) -> None:
        self.repository.save_status_history(
            AlertStatusHistory(
                alert_id=alert.id,
                from_status=from_status,
                to_status=to_status,
                reason=reason,
                actor_id=actor.id if actor else None,
                actor_name=actor.full_name if actor else "System",
                metadata_json=metadata,
            )
        )

    def _account_scope(self, current_user: User) -> list[str] | None:
        return None if self.access.can_view_portfolio(current_user) else self.accounts.list_account_ids_for_user(current_user.id)

    @staticmethod
    def _account_route(account: Account | None, alert_id: str | None = None) -> str | None:
        if account is None:
            return None
        route = f"/accounts/{account.id}?tab=overview"
        if alert_id:
            route += f"&alert={alert_id}"
        return route

    @staticmethod
    def _aware(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
