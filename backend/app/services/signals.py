import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountOwner, Engagement, Escalation, KycSnapshot, ScoreSnapshot, Signal, SignalEvent, SignalRule, User
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
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
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
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
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
        search: str | None = None,
        signal_type: str | None = None,
        severity: str | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        sort: str = "due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 25,
    ) -> SignalPageRead:
        return self.list_signals(
            current_user,
            account_id=account_id,
            search=search,
            signal_type=signal_type,
            severity=severity,
            status_filter=status_filter,
            owner_id=owner_id,
            active_only=True,
            sort=sort,
            direction=direction,
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
                    status="todo",
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
        engagements = [item for item in account.engagements if item.archived_at is None and (engagement_id is None or item.id == engagement_id)]
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
        if current_user.role in GLOBAL_VIEW_ROLES:
            return list(self.db.scalars(select(Account).where(Account.archived_at.is_(None)).order_by(Account.name)))
        account_ids = self.accounts.list_account_ids_for_user(current_user.id)
        if not account_ids:
            return []
        return list(self.db.scalars(select(Account).where(Account.id.in_(account_ids), Account.archived_at.is_(None)).order_by(Account.name)))

    def _latest_score(self, account_id: str) -> ScoreSnapshot | None:
        return self.db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account").order_by(ScoreSnapshot.calculated_at.desc()).limit(1))

    def _is_kyc_stale(self, account_id: str) -> bool:
        latest = self.db.scalar(select(KycSnapshot).where(KycSnapshot.account_id == account_id).order_by(KycSnapshot.approved_at.desc()).limit(1))
        if latest is None or latest.freshness_status != "fresh":
            return True
        approved_at = latest.approved_at if latest.approved_at.tzinfo else latest.approved_at.replace(tzinfo=timezone.utc)
        return approved_at < datetime.now(timezone.utc) - timedelta(days=180)

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
            for metric in (
                "relationship",
                "resource",
                "service_line",
                "contract",
                "account_risk",
                "csat",
                "usage",
                "delivery",
                "commercial",
                "renewal",
                "stakeholder",
                "stale_kyc",
            ):
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
