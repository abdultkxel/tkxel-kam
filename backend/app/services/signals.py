import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountOwner, CsatScore, Engagement, Escalation, GovernanceEvent, KycConfiguration, KycSnapshot, Opportunity, ScoreSnapshot, Signal, SignalEvent, SignalRule, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.signals import SignalsRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    PlaybookExecutionRequest,
    RecommendedPlaybookRead,
    SignalAIExplanationRead,
    SignalConvertRequest,
    SignalEvaluationRead,
    SignalEvidenceRead,
    SignalPageRead,
    SignalRead,
    SignalRuleCreateRequest,
    SignalRulePageRead,
    SignalRuleRead,
    SignalRuleUpdateRequest,
    SignalStatusUpdateRequest,
    TaskCreateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

SIGNALS_MODULE = "signals_attention"
ACTIVE_SIGNAL_STATUSES = {"new", "reviewed", "accepted", "converted"}
TERMINAL_SIGNAL_STATUSES = {"dismissed", "resolved"}
SIGNAL_TRANSITIONS = {
    "new": {"reviewed", "accepted", "dismissed", "converted", "resolved"},
    "reviewed": {"accepted", "dismissed", "converted", "resolved"},
    "accepted": {"converted", "resolved", "dismissed"},
    "converted": {"resolved"},
    "dismissed": {"reviewed"},
    "resolved": set(),
}


class SignalsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = SignalsRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_rules(
        self,
        current_user: User,
        *,
        search: str | None = None,
        signal_type: str | None = None,
        severity: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> SignalRulePageRead:
        self.access.require_module_permission(current_user, SIGNALS_MODULE, "view")
        items, total = self.repository.list_rules_page(
            search=search,
            signal_type=signal_type,
            severity=severity,
            active_state=active_state,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return SignalRulePageRead(items=[SignalRuleRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_rule(self, payload: SignalRuleCreateRequest, current_user: User) -> SignalRuleRead:
        self.access.require_module_permission(current_user, SIGNALS_MODULE, "configure")
        if self.repository.get_rule_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Signal rule slug already exists")
        rule = SignalRule(
            slug=payload.slug,
            name=payload.name,
            signal_type=payload.signal_type,
            description=payload.description,
            severity=payload.severity,
            condition_json=payload.condition_json,
            owner_rule_json=payload.owner_rule_json,
            sla_rule_json=payload.sla_rule_json,
            is_active=payload.is_active,
            current_version=1,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_rule(rule)
        self.audit.log(module=SIGNALS_MODULE, action="create_rule", entity_type="signal_rule", entity_id=rule.id, actor=current_user, after_value=self._rule_snapshot(rule))
        self.repository.commit()
        return SignalRuleRead.model_validate(rule)

    def update_rule(self, rule_id: str, payload: SignalRuleUpdateRequest, current_user: User) -> SignalRuleRead:
        self.access.require_module_permission(current_user, SIGNALS_MODULE, "configure")
        rule = self._get_rule_or_404(rule_id)
        before = self._rule_snapshot(rule)
        updates = payload.model_dump(exclude_unset=True)
        versioned_fields = {"signal_type", "severity", "condition_json", "owner_rule_json", "sla_rule_json", "is_active"}
        for field, value in updates.items():
            setattr(rule, field, value)
        if versioned_fields.intersection(updates):
            rule.current_version += 1
        rule.updated_by_id = current_user.id
        self.audit.log(module=SIGNALS_MODULE, action="update_rule", entity_type="signal_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=self._rule_snapshot(rule))
        self.repository.commit()
        return SignalRuleRead.model_validate(rule)

    def list_signals(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
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
        page_size: int = 25,
    ) -> SignalPageRead:
        self.access.require_module_permission(current_user, SIGNALS_MODULE, "view")
        account_ids = None if self.access.can_view_portfolio(current_user) else self.accounts.list_account_ids_for_user(current_user.id)
        items, total = self.repository.list_signals(
            account_id=account_id,
            account_ids=account_ids,
            engagement_id=engagement_id,
            search=search,
            signal_type=signal_type,
            severity=severity,
            status_filter=status_filter,
            owner_id=owner_id,
            date_from=date_from,
            date_to=date_to,
            active_only=active_only,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return SignalPageRead(items=[SignalRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def attention_center(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        severity: str | None = None,
        owner_id: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> SignalPageRead:
        return self.list_signals(
            current_user,
            account_id=account_id,
            severity=severity,
            owner_id=owner_id,
            active_only=True,
            sort="due_at",
            direction="asc",
            page=page,
            page_size=page_size,
        )

    def evaluate(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        trigger_source: str = "manual",
        commit: bool = True,
    ) -> SignalEvaluationRead:
        self.access.require_module_permission(current_user, SIGNALS_MODULE, "update")
        accounts = self._accounts_for_evaluation(current_user, account_id)
        created = 0
        updated = 0
        resolved = 0
        output: list[Signal] = []
        rules = {rule.slug: rule for rule in self.repository.list_rules(active_only=True)}
        for account in accounts:
            self.access.require_account_view(current_user, account, module=SIGNALS_MODULE)
            generated: list[SignalSeed] = []
            generated.extend(self._account_signal_seeds(account, rules))
            generated.extend(self._engagement_signal_seeds(account, engagement_id, rules))
            generated.extend(self._escalation_signal_seeds(account, rules))
            generated.extend(self._csat_signal_seeds(account, rules))
            generated.extend(self._opportunity_signal_seeds(account, rules))
            generated.extend(self._governance_signal_seeds(account, rules))
            generated.extend(self._score_drop_signal_seeds(account, rules))
            generated.extend(self._payment_risk_signal_seeds(account, rules))
            active_keys = set()
            for seed in generated:
                active_keys.add(seed.condition_key)
                signal, was_created = self._upsert_signal(seed, current_user, trigger_source)
                created += 1 if was_created else 0
                updated += 0 if was_created else 1
                output.append(signal)
            resolved += self._resolve_cleared_signals(account.id, active_keys, current_user, trigger_source)
        if commit:
            self.repository.commit()
        logger.info("Evaluated signals from %s: accounts=%s created=%s updated=%s resolved=%s", trigger_source, len(accounts), created, updated, resolved)
        return SignalEvaluationRead(evaluated_accounts=len(accounts), created=created, updated=updated, resolved=resolved, signals=[SignalRead.model_validate(item) for item in output])

    def update_status(self, signal_id: str, payload: SignalStatusUpdateRequest, current_user: User) -> SignalRead:
        signal = self._get_signal_or_404(signal_id)
        account = self._get_account_or_404(signal.account_id)
        self.access.require_account_update(current_user, account, module=SIGNALS_MODULE)
        previous = signal.status
        if payload.status == previous:
            return SignalRead.model_validate(signal)
        if payload.status not in SIGNAL_TRANSITIONS.get(previous, set()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Signal cannot transition from {previous} to {payload.status}")
        if payload.status == "dismissed" and not payload.reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dismissed signals require a reason")
        signal.status = payload.status
        if payload.status == "resolved":
            signal.resolved_at = datetime.now(timezone.utc)
        if payload.status == "dismissed":
            signal.dismissed_at = datetime.now(timezone.utc)
        self.repository.add_event(
            SignalEvent(
                signal_id=signal.id,
                event_type="status_change",
                previous_status=previous,
                new_status=signal.status,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                reason=payload.reason,
                metadata_json={},
            )
        )
        self.audit.log(module=SIGNALS_MODULE, action="update_status", entity_type="signal", entity_id=signal.id, actor=current_user, before_value={"status": previous}, after_value={"status": signal.status}, reason=payload.reason)
        self.repository.commit()
        return SignalRead.model_validate(signal)

    def convert(self, signal_id: str, payload: SignalConvertRequest, current_user: User):
        signal = self._get_signal_or_404(signal_id)
        account = self._get_account_or_404(signal.account_id)
        self.access.require_account_update(current_user, account, module=SIGNALS_MODULE)
        if signal.status in TERMINAL_SIGNAL_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dismissed or resolved signals cannot be converted")
        from app.services.playbooks_tasks import PlaybooksTasksService

        playbooks_tasks = PlaybooksTasksService(self.db)
        if payload.target_type == "playbook":
            template_id = payload.playbook_template_id or self._first_recommended_template_id(signal)
            if not template_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active playbook template is mapped to this signal")
            result = playbooks_tasks.execute_playbook(
                template_id,
                PlaybookExecutionRequest(
                    account_id=signal.account_id,
                    engagement_id=signal.engagement_id,
                    source_signal_id=signal.id,
                    source_signal_type=signal.signal_type,
                    source_metric=self._first_weak_metric(signal),
                    confirmed=True,
                ),
                current_user,
            )
        else:
            due_at = payload.due_at or datetime.now(timezone.utc) + timedelta(days=7)
            result = playbooks_tasks.create_task(
                TaskCreateRequest(
                    account_id=signal.account_id,
                    engagement_id=signal.engagement_id,
                    title=signal.title,
                    description=signal.detail,
                    owner_id=payload.owner_id or signal.owner_id or current_user.id,
                    due_at=due_at,
                    status="open",
                    priority=self._task_priority_for_signal(signal),
                    notes=payload.note,
                    source_type="signal",
                    source_record_id=signal.id,
                    source_metric=self._first_weak_metric(signal),
                    success_criteria=["Signal reviewed and resolved"],
                ),
                current_user,
            )
        previous = signal.status
        signal.status = "converted"
        self.repository.add_event(
            SignalEvent(
                signal_id=signal.id,
                event_type="converted",
                previous_status=previous,
                new_status="converted",
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                reason=payload.note,
                metadata_json={"target_type": payload.target_type},
            )
        )
        self.audit.log(module=SIGNALS_MODULE, action="convert", entity_type="signal", entity_id=signal.id, actor=current_user, before_value={"status": previous}, after_value={"status": "converted", "target_type": payload.target_type}, reason=payload.note)
        self.repository.commit()
        return result

    def evidence(self, signal_id: str, current_user: User) -> SignalEvidenceRead:
        signal = self._get_signal_or_404(signal_id)
        account = self._get_account_or_404(signal.account_id)
        self.access.require_account_view(current_user, account, module=SIGNALS_MODULE)
        return SignalEvidenceRead(signal_id=signal.id, evidence=signal.evidence_json, citations=signal.citations_json)

    def ai_explanation(self, signal_id: str, current_user: User) -> SignalAIExplanationRead:
        signal = self._get_signal_or_404(signal_id)
        account = self._get_account_or_404(signal.account_id)
        self.access.require_account_view(current_user, account, module=SIGNALS_MODULE)
        explanation = (
            f"{signal.title}: this advisory explanation is generated from deterministic signal evidence. "
            f"The rule fired because {', '.join(item.get('label', item.get('code', 'a configured condition')) for item in signal.reason_codes) or 'configured evidence matched'}. "
            "AI output is advisory only; the signal status remains controlled by reviewers."
        )
        try:
            from app.services.integrations import IntegrationService

            IntegrationService(self.db).log_ai_gateway_run(
                request_type="signal_explanation",
                status_value="complete",
                actor=current_user,
                account_id=signal.account_id,
                engagement_id=signal.engagement_id,
                permission_scope={"module": SIGNALS_MODULE, "account_id": signal.account_id, "actor_role": current_user.role},
                source_context=[{"type": "signal", "id": signal.id}, {"type": "signal_rule", "id": signal.rule_id}],
                response_labels=["AI-assisted", "Advisory"],
                affected_records=[{"type": "signal", "id": signal.id}],
                commit=False,
            )
        except Exception:
            logger.exception("Failed to write AI Gateway run for signal explanation %s", signal.id)
        self.audit.log(module=SIGNALS_MODULE, action="ai_explanation", entity_type="signal", entity_id=signal.id, actor=current_user, after_value={"provider": "ai_llm_gateway_local_adapter", "advisory_only": True})
        self.repository.commit()
        return SignalAIExplanationRead(signal_id=signal.id, provider="ai_llm_gateway_local_adapter", advisory_only=True, explanation=explanation, citations=signal.citations_json)

    def recommended_playbooks(self, signal_id: str, current_user: User) -> list[RecommendedPlaybookRead]:
        signal = self._get_signal_or_404(signal_id)
        account = self._get_account_or_404(signal.account_id)
        self.access.require_account_view(current_user, account, module=SIGNALS_MODULE)
        from app.services.playbooks_tasks import PlaybooksTasksService

        return PlaybooksTasksService(self.db).recommended_playbooks(
            signal.id,
            current_user,
            signal_type=signal.signal_type,
            weak_metric=self._first_weak_metric(signal),
            account_id=signal.account_id,
            engagement_id=signal.engagement_id,
            page=1,
            page_size=100,
        )

    def _account_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        seeds: list[SignalSeed] = []
        owner = self._primary_owner(account)
        latest_score = self._latest_score(account.id)
        if self._is_kyc_stale(account.id):
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=None,
                    rule=rules.get("stale_kyc"),
                    signal_type="stale_kyc",
                    severity="warning",
                    owner_id=owner.user_id if owner else None,
                    owner_name=owner.user_name if owner else None,
                    title=f"{account.name} KYC is stale",
                    detail="Approved KYC snapshot is missing, stale, or older than the configured freshness window.",
                    reason_codes=[{"code": "stale_kyc", "label": "Approved KYC snapshot is missing or stale"}],
                    evidence=[{"type": "kyc_snapshot", "label": "KYC freshness check", "value": "stale"}],
                    citations=[],
                    source_record_type="account",
                    source_record_id=account.id,
                    source_record_route=f"/accounts/{account.id}?tab=kyc",
                    confidence=100,
                    condition_key=f"{account.id}:stale_kyc",
                    due_at=datetime.now(timezone.utc) + timedelta(days=3),
                )
            )
        if latest_score and latest_score.rag_status == "red":
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=None,
                    rule=rules.get("red_account_health"),
                    signal_type="red_account_health",
                    severity="critical",
                    owner_id=owner.user_id if owner else None,
                    owner_name=owner.user_name if owner else None,
                    title=f"{account.name} is in red health",
                    detail="Latest account score is red and requires recovery ownership.",
                    reason_codes=latest_score.reason_codes or [{"code": "red_account_health", "label": "Latest account score is red"}],
                    evidence=[{"type": "score_snapshot", "label": "Latest health score", "value": latest_score.overall, "rag_status": latest_score.rag_status}],
                    citations=[],
                    source_record_type="score_snapshot",
                    source_record_id=latest_score.id,
                    source_record_route=f"/accounts/{account.id}?tab=health",
                    confidence=100,
                    condition_key=f"{account.id}:red_account_health",
                    due_at=datetime.now(timezone.utc) + timedelta(days=1),
                )
            )
        if (latest_score and latest_score.rag_status in {"red", "amber"}) or account.health_overall < 75:
            rag = latest_score.rag_status if latest_score else "amber"
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=None,
                    rule=rules.get("weak_metric"),
                    signal_type="weak_metric",
                    severity="critical" if rag == "red" else "warning",
                    owner_id=owner.user_id if owner else None,
                    owner_name=owner.user_name if owner else None,
                    title=f"{account.name} health score requires attention",
                    detail="Account health is below green threshold.",
                    reason_codes=latest_score.reason_codes if latest_score else [{"code": "weak_health", "label": "Account health is below green threshold"}],
                    evidence=[{"type": "score_snapshot", "label": "Latest health score", "value": latest_score.overall if latest_score else account.health_overall}],
                    citations=[],
                    source_record_type="score_snapshot" if latest_score else "account",
                    source_record_id=latest_score.id if latest_score else account.id,
                    source_record_route=f"/accounts/{account.id}?tab=health",
                    confidence=100,
                    condition_key=f"{account.id}:weak_metric",
                    due_at=datetime.now(timezone.utc) + timedelta(days=2),
                )
            )
        if owner is None:
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=None,
                    rule=rules.get("stakeholder_gap"),
                    signal_type="stakeholder_gap",
                    severity="critical",
                    owner_id=None,
                    owner_name=None,
                    title=f"{account.name} has no active primary AM",
                    detail="Account ownership is incomplete and should be assigned.",
                    reason_codes=[{"code": "missing_primary_am", "label": "No active primary AM"}],
                    evidence=[{"type": "account_owner", "label": "Primary AM", "value": "missing"}],
                    citations=[],
                    source_record_type="account",
                    source_record_id=account.id,
                    source_record_route=f"/accounts/{account.id}?tab=owners",
                    confidence=100,
                    condition_key=f"{account.id}:stakeholder_gap:primary_am",
                    due_at=datetime.now(timezone.utc) + timedelta(days=1),
                )
            )
        return seeds

    def _engagement_signal_seeds(self, account: Account, engagement_id: str | None, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        now = datetime.now(timezone.utc)
        seeds: list[SignalSeed] = []
        engagements = [item for item in account.engagements if item.archived_at is None and item.status == "active" and (engagement_id is None or item.id == engagement_id)]
        primary_owner = self._primary_owner(account)
        for engagement in engagements:
            owner_id = engagement.owner_id or (primary_owner.user_id if primary_owner else None)
            owner_name = engagement.owner_name or (primary_owner.user_name if primary_owner else None)
            if engagement.end_date:
                end_at = engagement.end_date if engagement.end_date.tzinfo else engagement.end_date.replace(tzinfo=timezone.utc)
                days = (end_at.date() - now.date()).days
                if days <= 45:
                    seeds.append(
                        SignalSeed(
                            account_id=account.id,
                            engagement_id=engagement.id,
                            rule=rules.get("sow_expiry"),
                            signal_type="sow_expiry",
                            severity="critical" if days < 0 else "warning",
                            owner_id=owner_id,
                            owner_name=owner_name,
                            title=f"{engagement.name} SOW expiry window",
                            detail=f"SOW end date is {days} day(s) away.",
                            reason_codes=[{"code": "sow_expiry", "label": f"SOW end date is {days} day(s) away"}],
                            evidence=[{"type": "engagement", "label": "End date", "value": end_at.isoformat()}],
                            citations=[],
                            source_record_type="engagement",
                            source_record_id=engagement.id,
                            source_record_route=f"/accounts/{account.id}/engagements/{engagement.id}",
                            confidence=100,
                            condition_key=f"{account.id}:{engagement.id}:sow_expiry",
                            due_at=now + timedelta(days=max(min(days, 7), 0)),
                        )
                    )
            if engagement.notice_deadline:
                notice_at = engagement.notice_deadline if engagement.notice_deadline.tzinfo else engagement.notice_deadline.replace(tzinfo=timezone.utc)
                days = (notice_at.date() - now.date()).days
                if days <= 30:
                    seeds.append(
                        SignalSeed(
                            account_id=account.id,
                            engagement_id=engagement.id,
                            rule=rules.get("notice_window"),
                            signal_type="notice_window",
                            severity="critical" if days < 0 else "warning",
                            owner_id=owner_id,
                            owner_name=owner_name,
                            title=f"{engagement.name} notice window",
                            detail=f"Notice deadline is {days} day(s) away.",
                            reason_codes=[{"code": "notice_window", "label": f"Notice deadline is {days} day(s) away"}],
                            evidence=[{"type": "engagement", "label": "Notice deadline", "value": notice_at.isoformat()}],
                            citations=[],
                            source_record_type="engagement",
                            source_record_id=engagement.id,
                            source_record_route=f"/accounts/{account.id}/engagements/{engagement.id}",
                            confidence=100,
                            condition_key=f"{account.id}:{engagement.id}:notice_window",
                            due_at=now + timedelta(days=max(min(days, 7), 0)),
                        )
                    )
            if engagement.renewal_date:
                renewal_at = engagement.renewal_date if engagement.renewal_date.tzinfo else engagement.renewal_date.replace(tzinfo=timezone.utc)
                days = (renewal_at.date() - now.date()).days
                if days <= 45:
                    seeds.append(
                        SignalSeed(
                            account_id=account.id,
                            engagement_id=engagement.id,
                            rule=rules.get("renewal_date"),
                            signal_type="renewal_date",
                            severity="critical" if days < 0 else "warning",
                            owner_id=owner_id,
                            owner_name=owner_name,
                            title=f"{engagement.name} renewal date approaching",
                            detail=f"Renewal date is {days} day(s) away.",
                            reason_codes=[{"code": "renewal_date", "label": f"Renewal date is {days} day(s) away"}],
                            evidence=[{"type": "engagement", "label": "Renewal date", "value": renewal_at.isoformat()}],
                            citations=[],
                            source_record_type="engagement",
                            source_record_id=engagement.id,
                            source_record_route=f"/accounts/{account.id}/engagements/{engagement.id}",
                            confidence=100,
                            condition_key=f"{account.id}:{engagement.id}:renewal_date",
                            due_at=now + timedelta(days=max(min(days, 7), 0)),
                        )
                    )
        return seeds

    def _escalation_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        now = datetime.now(timezone.utc)
        seeds = []
        escalations = list(
            self.db.scalars(
                select(Escalation).where(Escalation.account_id == account.id, Escalation.status.notin_(("resolved", "closed", "cancelled")))
            )
        )
        for escalation in escalations:
            due_at = escalation.sla_due_at if escalation.sla_due_at.tzinfo else escalation.sla_due_at.replace(tzinfo=timezone.utc)
            if escalation.severity == "critical" or due_at <= now:
                seeds.append(
                    SignalSeed(
                        account_id=account.id,
                        engagement_id=escalation.engagement_id,
                        rule=rules.get("escalation_sla"),
                        signal_type="escalation_sla",
                        severity="critical" if due_at <= now or escalation.severity == "critical" else "warning",
                        owner_id=escalation.owner_id,
                        owner_name=escalation.owner_name,
                        title=f"Escalation SLA attention: {escalation.summary}",
                        detail="Open escalation is critical or past SLA due date.",
                        reason_codes=[{"code": "escalation_sla", "label": "Critical or overdue escalation"}],
                        evidence=[{"type": "escalation", "label": escalation.summary, "value": escalation.status}],
                        citations=[],
                        source_record_type="escalation",
                        source_record_id=escalation.id,
                        source_record_route=f"/escalations?escalation={escalation.id}",
                        confidence=100,
                        condition_key=f"{account.id}:escalation_sla:{escalation.id}",
                        due_at=due_at,
                    )
                )
        return seeds

    def _csat_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        owner = self._primary_owner(account)
        scores = list(
            self.db.scalars(
                select(CsatScore)
                .where(CsatScore.account_id == account.id)
                .order_by(CsatScore.source_recorded_at.desc(), CsatScore.created_at.desc())
                .limit(2)
            )
        )
        if not scores:
            return []
        latest = scores[0]
        seeds: list[SignalSeed] = []
        low_categories = [
            {"category": key, "score": value}
            for key, value in (latest.category_scores_json or {}).items()
            if isinstance(value, (int, float)) and float(value) <= 2.5
        ]
        if float(latest.weighted_score or latest.score) <= 3.0 or low_categories:
            severity = "critical" if float(latest.weighted_score or latest.score) <= 2.5 or any(float(item["score"]) <= 2 for item in low_categories) else "warning"
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=latest.engagement_id,
                    rule=rules.get("csat_low"),
                    signal_type="csat_low",
                    severity=severity,
                    owner_id=owner.user_id if owner else None,
                    owner_name=owner.user_name if owner else None,
                    title=f"{account.name} CSAT needs attention",
                    detail="Latest CSAT score or category score is below the healthy threshold.",
                    reason_codes=[{"code": "csat_low", "label": "Latest CSAT score is low"}] + [{"code": f"csat_low_{item['category']}", "label": f"{item['category']} scored {item['score']}"} for item in low_categories],
                    evidence=[{"type": "csat_score", "label": "Latest CSAT", "value": latest.weighted_score or latest.score, "normalized_score": latest.normalized_score, "low_categories": low_categories}],
                    citations=[],
                    source_record_type="csat_score",
                    source_record_id=latest.id,
                    source_record_route=f"/accounts/{account.id}?tab=health",
                    confidence=95,
                    condition_key=f"{account.id}:csat_low:{latest.id}",
                    due_at=datetime.now(timezone.utc) + timedelta(days=3),
                )
            )
        if len(scores) > 1:
            previous = scores[1]
            decline = float(previous.weighted_score or previous.score) - float(latest.weighted_score or latest.score)
            if decline >= 0.5:
                seeds.append(
                    SignalSeed(
                        account_id=account.id,
                        engagement_id=latest.engagement_id,
                        rule=rules.get("csat_decline"),
                        signal_type="csat_decline",
                        severity="critical" if decline >= 1.0 else "warning",
                        owner_id=owner.user_id if owner else None,
                        owner_name=owner.user_name if owner else None,
                        title=f"{account.name} CSAT declined",
                        detail=f"Latest CSAT declined by {round(decline, 2)} point(s) compared with the previous score.",
                        reason_codes=[{"code": "csat_decline", "label": f"CSAT declined by {round(decline, 2)}"}],
                        evidence=[{"type": "csat_score", "label": "CSAT trend", "previous": previous.weighted_score or previous.score, "latest": latest.weighted_score or latest.score}],
                        citations=[],
                        source_record_type="csat_score",
                        source_record_id=latest.id,
                        source_record_route=f"/accounts/{account.id}?tab=health",
                        confidence=95,
                        condition_key=f"{account.id}:csat_decline:{latest.id}",
                        due_at=datetime.now(timezone.utc) + timedelta(days=3),
                    )
                )
        return seeds

    def _opportunity_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        owner = self._primary_owner(account)
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(days=30)
        opportunities = list(
            self.db.scalars(
                select(Opportunity).where(
                    Opportunity.account_id == account.id,
                    Opportunity.archived_at.is_(None),
                    Opportunity.stage.notin_(("Won", "Lost")),
                    Opportunity.updated_at <= stale_cutoff,
                )
            )
        )
        seeds = []
        for opportunity in opportunities:
            target_at = opportunity.target_date if opportunity.target_date.tzinfo else opportunity.target_date.replace(tzinfo=timezone.utc)
            overdue = target_at < now
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=opportunity.engagement_id,
                    rule=rules.get("opportunity_stalled"),
                    signal_type="opportunity_stalled",
                    severity="critical" if overdue else "warning",
                    owner_id=opportunity.owner_id or (owner.user_id if owner else None),
                    owner_name=opportunity.owner_name or (owner.user_name if owner else None),
                    title=f"Opportunity stalled: {opportunity.name}",
                    detail="Open opportunity has not been updated in 30 days or is past its target date.",
                    reason_codes=[{"code": "opportunity_stalled", "label": "Open opportunity has stale next-step activity"}],
                    evidence=[{"type": "opportunity", "label": opportunity.name, "stage": opportunity.stage, "updated_at": opportunity.updated_at.isoformat(), "target_date": target_at.isoformat()}],
                    citations=[],
                    source_record_type="opportunity",
                    source_record_id=opportunity.id,
                    source_record_route="/opportunities",
                    confidence=90,
                    condition_key=f"{account.id}:opportunity_stalled:{opportunity.id}",
                    due_at=now + timedelta(days=2),
                )
            )
        return seeds

    def _governance_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        now = datetime.now(timezone.utc)
        owner = self._primary_owner(account)
        events = list(
            self.db.scalars(
                select(GovernanceEvent).where(
                    GovernanceEvent.account_id == account.id,
                    GovernanceEvent.status.notin_(("completed", "cancelled")),
                    GovernanceEvent.scheduled_at < now,
                )
            )
        )
        seeds = []
        for event in events:
            scheduled_at = event.scheduled_at if event.scheduled_at.tzinfo else event.scheduled_at.replace(tzinfo=timezone.utc)
            seeds.append(
                SignalSeed(
                    account_id=account.id,
                    engagement_id=event.engagement_id,
                    rule=rules.get("governance_overdue"),
                    signal_type="governance_overdue",
                    severity="critical",
                    owner_id=event.owner_id or (owner.user_id if owner else None),
                    owner_name=event.owner_name or (owner.user_name if owner else None),
                    title=f"Governance overdue: {event.governance_type}",
                    detail="Scheduled governance review is overdue and not completed.",
                    reason_codes=[{"code": "governance_overdue", "label": "Governance review is overdue"}],
                    evidence=[{"type": "governance_event", "label": event.governance_type, "scheduled_at": scheduled_at.isoformat(), "status": event.status}],
                    citations=[],
                    source_record_type="governance_event",
                    source_record_id=event.id,
                    source_record_route=f"/governance?event={event.id}",
                    confidence=100,
                    condition_key=f"{account.id}:governance_overdue:{event.id}",
                    due_at=now + timedelta(days=1),
                )
            )
        return seeds

    def _score_drop_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        owner = self._primary_owner(account)
        scores = self._latest_scores(account.id, limit=2)
        if len(scores) < 2:
            return []
        latest, previous = scores[0], scores[1]
        previous_drivers = {driver["key"]: driver for driver in self._score_driver_records(previous.drivers)}
        drops = []
        for driver in self._score_driver_records(latest.drivers):
            key = driver.get("key")
            previous_driver = previous_drivers.get(key)
            if not previous_driver:
                continue
            drop = self._score_driver_value(previous_driver) - self._score_driver_value(driver)
            if drop >= 10:
                drops.append({"key": key, "label": driver.get("label", key), "previous": previous_driver.get("score"), "latest": driver.get("score"), "drop": round(drop, 2)})
        overall_drop = previous.overall - latest.overall
        if overall_drop < 10 and not drops:
            return []
        return [
            SignalSeed(
                account_id=account.id,
                engagement_id=None,
                rule=rules.get("score_dimension_drop"),
                signal_type="score_dimension_drop",
                severity="critical" if overall_drop >= 15 or any(float(item["drop"]) >= 20 for item in drops) else "warning",
                owner_id=owner.user_id if owner else None,
                owner_name=owner.user_name if owner else None,
                title=f"{account.name} score declined",
                detail="Latest account score or a score dimension dropped materially compared with the previous snapshot.",
                reason_codes=[{"code": "score_dimension_drop", "label": "Score dimension dropped by at least 10 points"}],
                evidence=[{"type": "score_snapshot", "label": "Score drop", "overall_drop": overall_drop, "dimension_drops": drops}],
                citations=[],
                source_record_type="score_snapshot",
                source_record_id=latest.id,
                source_record_route=f"/accounts/{account.id}?tab=health",
                confidence=95,
                condition_key=f"{account.id}:score_dimension_drop:{latest.id}",
                due_at=datetime.now(timezone.utc) + timedelta(days=2),
            )
        ]

    def _score_driver_records(self, drivers: Any) -> list[dict[str, Any]]:
        if isinstance(drivers, str):
            try:
                drivers = json.loads(drivers)
            except ValueError:
                return []
        if isinstance(drivers, dict):
            drivers = [drivers]
        if not isinstance(drivers, list):
            return []
        return [driver for driver in drivers if isinstance(driver, dict) and driver.get("key")]

    def _score_driver_value(self, driver: dict[str, Any]) -> float:
        try:
            return float(driver.get("score") or 0)
        except (TypeError, ValueError):
            return 0.0

    def _payment_risk_signal_seeds(self, account: Account, rules: dict[str, SignalRule]) -> list["SignalSeed"]:
        text = " ".join(filter(None, [account.commercial_summary, account.initial_notes, account.service_context])).lower()
        keywords = ("late payment", "payment overdue", "overdue invoice", "invoice dispute", "payment risk", "budget cut", "procurement blocked")
        if not any(keyword in text for keyword in keywords):
            return []
        owner = self._primary_owner(account)
        return [
            SignalSeed(
                account_id=account.id,
                engagement_id=None,
                rule=rules.get("payment_risk"),
                signal_type="payment_risk",
                severity="warning",
                owner_id=owner.user_id if owner else None,
                owner_name=owner.user_name if owner else None,
                title=f"{account.name} commercial payment risk",
                detail="Commercial notes include payment, invoice, procurement, or budget risk language.",
                reason_codes=[{"code": "payment_risk", "label": "Commercial context indicates payment risk"}],
                evidence=[{"type": "account", "label": "Commercial context", "value": account.commercial_summary or account.initial_notes or account.service_context}],
                citations=[],
                source_record_type="account",
                source_record_id=account.id,
                source_record_route=f"/accounts/{account.id}",
                confidence=75,
                condition_key=f"{account.id}:payment_risk",
                due_at=datetime.now(timezone.utc) + timedelta(days=5),
            )
        ]

    def _upsert_signal(self, seed: "SignalSeed", current_user: User, trigger_source: str) -> tuple[Signal, bool]:
        existing = self.repository.find_signal(
            account_id=seed.account_id,
            engagement_id=seed.engagement_id,
            rule_id=seed.rule.id if seed.rule else None,
            source_record_id=seed.source_record_id,
            condition_key=seed.condition_key,
        )
        if existing:
            before = {"severity": existing.severity, "status": existing.status, "evidence": existing.evidence_json}
            existing.severity = seed.severity
            existing.owner_id = seed.owner_id
            existing.owner_name = seed.owner_name
            existing.title = seed.title
            existing.detail = seed.detail
            existing.reason_codes = seed.reason_codes
            existing.evidence_json = seed.evidence
            existing.citations_json = seed.citations
            existing.confidence = seed.confidence
            existing.due_at = seed.due_at
            self.repository.add_event(
                SignalEvent(
                    signal_id=existing.id,
                    event_type="refreshed",
                    previous_status=existing.status,
                    new_status=existing.status,
                    actor_id=current_user.id,
                    actor_name=current_user.full_name,
                    metadata_json={"trigger_source": trigger_source},
                )
            )
            self.audit.log(module=SIGNALS_MODULE, action="refresh", entity_type="signal", entity_id=existing.id, actor=current_user, before_value=before, after_value={"severity": existing.severity, "status": existing.status, "evidence": existing.evidence_json})
            return existing, False
        signal = Signal(
            account_id=seed.account_id,
            engagement_id=seed.engagement_id,
            rule_id=seed.rule.id if seed.rule else None,
            signal_type=seed.signal_type,
            severity=seed.severity,
            status="new",
            owner_id=seed.owner_id,
            owner_name=seed.owner_name,
            title=seed.title,
            detail=seed.detail,
            reason_codes=seed.reason_codes,
            evidence_json=seed.evidence,
            citations_json=seed.citations,
            source_record_type=seed.source_record_type,
            source_record_id=seed.source_record_id,
            source_record_route=seed.source_record_route,
            confidence=seed.confidence,
            condition_key=seed.condition_key,
            due_at=seed.due_at,
        )
        self.repository.save_signal(signal)
        self.repository.add_event(
            SignalEvent(
                signal_id=signal.id,
                event_type="created",
                previous_status=None,
                new_status="new",
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                metadata_json={"trigger_source": trigger_source},
            )
        )
        self.audit.log(module=SIGNALS_MODULE, action="create", entity_type="signal", entity_id=signal.id, actor=current_user, after_value={"severity": signal.severity, "status": signal.status})
        self.timeline.add_account_event(
            account_id=signal.account_id,
            engagement_id=signal.engagement_id,
            title=f"Signal created: {signal.title}",
            description=signal.detail,
            actor=current_user,
            event_type="signal_created",
            module=SIGNALS_MODULE,
            source_record_id=signal.id,
            source_record_type="signal",
            source_record_route="/attention-center",
            after_value={"severity": signal.severity, "status": signal.status},
        )
        return signal, True

    def _resolve_cleared_signals(self, account_id: str, active_keys: set[str], current_user: User, trigger_source: str) -> int:
        signals, _ = self.repository.list_signals(account_id=account_id, active_only=True, page=1, page_size=1000)
        count = 0
        for signal in signals:
            if signal.condition_key in active_keys or not signal.condition_key:
                continue
            previous = signal.status
            signal.status = "resolved"
            signal.resolved_at = datetime.now(timezone.utc)
            self.repository.add_event(
                SignalEvent(
                    signal_id=signal.id,
                    event_type="auto_resolved",
                    previous_status=previous,
                    new_status="resolved",
                    actor_id=current_user.id,
                    actor_name=current_user.full_name,
                    reason="Signal condition no longer matches.",
                    metadata_json={"trigger_source": trigger_source},
                )
            )
            count += 1
        return count

    def _accounts_for_evaluation(self, current_user: User, account_id: str | None) -> list[Account]:
        if account_id:
            account = self._get_account_or_404(account_id)
            self.access.require_account_view(current_user, account, module=SIGNALS_MODULE)
            return [account]
        if self.access.can_view_portfolio(current_user):
            return list(self.db.scalars(select(Account).where(Account.archived_at.is_(None)).order_by(Account.name)))
        account_ids = self.accounts.list_account_ids_for_user(current_user.id)
        if not account_ids:
            return []
        return list(self.db.scalars(select(Account).where(Account.id.in_(account_ids), Account.archived_at.is_(None)).order_by(Account.name)))

    def _latest_score(self, account_id: str) -> ScoreSnapshot | None:
        return self.db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account").order_by(ScoreSnapshot.calculated_at.desc()).limit(1))

    def _latest_scores(self, account_id: str, *, limit: int) -> list[ScoreSnapshot]:
        return list(
            self.db.scalars(
                select(ScoreSnapshot)
                .where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account")
                .order_by(ScoreSnapshot.calculated_at.desc(), ScoreSnapshot.created_at.desc())
                .limit(limit)
            )
        )

    def _is_kyc_stale(self, account_id: str) -> bool:
        latest = self.db.scalar(select(KycSnapshot).where(KycSnapshot.account_id == account_id).order_by(KycSnapshot.approved_at.desc()).limit(1))
        if latest is None or latest.freshness_status != "fresh":
            return True
        approved_at = latest.approved_at if latest.approved_at.tzinfo else latest.approved_at.replace(tzinfo=timezone.utc)
        config = self.db.scalar(select(KycConfiguration).where(KycConfiguration.name == "default"))
        threshold_days = config.freshness_threshold_days if config else 90
        return approved_at < datetime.now(timezone.utc) - timedelta(days=threshold_days)

    def _primary_owner(self, account: Account) -> AccountOwner | None:
        for owner in account.owners:
            if owner.ownership_role == "primary_am" and owner.is_active:
                return owner
        return None

    def _first_recommended_template_id(self, signal: Signal) -> str | None:
        from app.repositories.playbooks_tasks import PlaybooksTasksRepository

        templates, _ = PlaybooksTasksRepository(self.db).list_templates(active_state="active", page=1, page_size=100)
        for template in templates:
            if signal.signal_type in template.signal_types:
                return template.id
        return None

    @staticmethod
    def _first_weak_metric(signal: Signal) -> str | None:
        for reason in signal.reason_codes:
            code = str(reason.get("code", "")).lower()
            for metric in ("relationship", "usage", "delivery", "commercial", "renewal", "stakeholder", "stale_kyc"):
                if metric in code:
                    return metric
        return None

    @staticmethod
    def _task_priority_for_signal(signal: Signal) -> str:
        if signal.severity == "critical":
            return "urgent"
        if signal.severity == "warning":
            return "high"
        return "medium"

    def _rule_snapshot(self, rule: SignalRule) -> dict:
        return {
            "id": rule.id,
            "slug": rule.slug,
            "name": rule.name,
            "signal_type": rule.signal_type,
            "severity": rule.severity,
            "condition_json": rule.condition_json,
            "owner_rule_json": rule.owner_rule_json,
            "sla_rule_json": rule.sla_rule_json,
            "is_active": rule.is_active,
            "current_version": rule.current_version,
        }

    def _get_rule_or_404(self, rule_id: str) -> SignalRule:
        rule = self.repository.get_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal rule was not found")
        return rule

    def _get_signal_or_404(self, signal_id: str) -> Signal:
        signal = self.repository.get_signal(signal_id)
        if signal is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal was not found")
        return signal

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account


class SignalSeed:
    def __init__(
        self,
        *,
        account_id: str,
        engagement_id: str | None,
        rule: SignalRule | None,
        signal_type: str,
        severity: str,
        owner_id: str | None,
        owner_name: str | None,
        title: str,
        detail: str,
        reason_codes: list[dict],
        evidence: list[dict],
        citations: list[dict],
        source_record_type: str | None,
        source_record_id: str | None,
        source_record_route: str | None,
        confidence: int,
        condition_key: str,
        due_at: datetime | None,
    ) -> None:
        self.account_id = account_id
        self.engagement_id = engagement_id
        self.rule = rule
        self.signal_type = signal_type
        self.severity = severity
        self.owner_id = owner_id
        self.owner_name = owner_name
        self.title = title
        self.detail = detail
        self.reason_codes = reason_codes
        self.evidence = evidence
        self.citations = citations
        self.source_record_type = source_record_type
        self.source_record_id = source_record_id
        self.source_record_route = source_record_route
        self.confidence = confidence
        self.condition_key = condition_key
        self.due_at = due_at
