from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Engagement, EngagementRenewalProfile, RetentionPlan, RetentionPlanAction, RetentionPlanMilestone, RetentionRecommendation, Task, User, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.retention import RetentionRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    RenewalProfilePageRead,
    RenewalProfileRead,
    RenewalProfileUpdateRequest,
    RetentionPlanActionRead,
    RetentionPlanCreateRequest,
    RetentionPlanMilestoneRead,
    RetentionPlanPageRead,
    RetentionPlanRead,
    RetentionPlanUpdateRequest,
    RetentionRecommendationRead,
    RetentionRecommendationTaskCreateRequest,
    TaskRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

RETENTION_MODULE = "retention_stability"


def field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]})


class RetentionService:
    def __init__(self, db: Session) -> None:
        self.repository = RetentionRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_renewals(self, current_user: User, *, account_id: str | None = None, risk: str | None = None, owner_id: str | None = None, confidence_min: int | None = None, auto_renewal: bool | None = None, notice_from: datetime | None = None, notice_to: datetime | None = None, renewal_from: datetime | None = None, renewal_to: datetime | None = None, search: str | None = None, sort: str = "notice_deadline", direction: str = "asc", page: int = 1, page_size: int = 25) -> RenewalProfilePageRead:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        account_ids = self.access.visible_account_ids(current_user)
        if account_id:
            account = self._get_account_or_404(account_id)
            self.access.require_account_view(current_user, account, module=RETENTION_MODULE)
        items, total = self.repository.list_renewals(
            account_ids=account_ids,
            account_id=account_id,
            risk=risk,
            owner_id=owner_id,
            confidence_min=confidence_min,
            auto_renewal=auto_renewal,
            notice_from=notice_from,
            notice_to=notice_to,
            renewal_from=renewal_from,
            renewal_to=renewal_to,
            search=search,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        renewal_items = [self._renewal_read(self._ensure_profile(item), item) for item in items]
        self.repository.commit()
        return RenewalProfilePageRead(items=renewal_items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_engagement_renewal(self, engagement_id: str, current_user: User) -> RenewalProfileRead:
        engagement = self._get_engagement_or_404(engagement_id)
        self.access.require_account_view(current_user, engagement.account, module=RETENTION_MODULE)
        return self._renewal_read(self._ensure_profile(engagement), engagement)

    def update_engagement_renewal(self, engagement_id: str, payload: RenewalProfileUpdateRequest, current_user: User) -> RenewalProfileRead:
        engagement = self._get_engagement_or_404(engagement_id)
        self.access.require_account_update(current_user, engagement.account, module=RETENTION_MODULE)
        profile = self._ensure_profile(engagement)
        before = self._renewal_snapshot(profile, engagement)
        updates = payload.model_dump(exclude_unset=True)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"], "owner_id")
            profile.owner_id = owner.id
            profile.owner_name = owner.full_name
            updates.pop("owner_id")
        for field in ("renewal_date", "notice_deadline", "notice_period_days", "auto_renewal"):
            if field in updates:
                setattr(engagement, field, updates.pop(field))
        if engagement.notice_deadline and engagement.renewal_date and engagement.notice_deadline >= engagement.renewal_date:
            raise field_error("notice_deadline", "Notice deadline must be before renewal date.")
        if engagement.notice_deadline and engagement.end_date and engagement.notice_deadline >= engagement.end_date:
            raise field_error("notice_deadline", "Notice deadline must be before SOW end date.")
        if "commercial_exposure_currency" not in updates and profile.commercial_exposure_currency is None:
            profile.commercial_exposure_currency = engagement.currency
        for field, value in updates.items():
            setattr(profile, field, value)
        if profile.source_type != "sow" and (payload.renewal_date or payload.notice_deadline) and not profile.manual_override_reason:
            raise field_error("manual_override_reason", "Manual renewal changes require an override reason.")
        profile.updated_by_id = current_user.id
        engagement.updated_by_id = current_user.id
        after = self._renewal_snapshot(profile, engagement)
        self.audit.log(module=RETENTION_MODULE, action="update_renewal", entity_type="engagement_renewal_profile", entity_id=profile.id, actor=current_user, before_value=before, after_value=after)
        self.timeline.add_account_event(
            account_id=engagement.account_id,
            engagement_id=engagement.id,
            event_type="retention_event",
            module=RETENTION_MODULE,
            title=f"Renewal intelligence updated: {engagement.name}",
            description=f"{current_user.full_name} updated renewal terms and risk context.",
            actor=current_user,
            source_record_id=profile.id,
            source_record_type="engagement_renewal_profile",
            source_record_route=f"/engagements/{engagement.id}",
            before_value=before,
            after_value=after,
        )
        self.repository.commit()
        return self._renewal_read(profile, engagement)

    def list_account_retention(self, account_id: str, current_user: User) -> RenewalProfilePageRead:
        return self.list_renewals(current_user, account_id=account_id, page=1, page_size=100)

    def list_plans(self, account_id: str, current_user: User, *, plan_type: str | None = None, status_filter: str | None = None, owner_id: str | None = None, due_from: datetime | None = None, due_to: datetime | None = None, search: str | None = None, sort: str = "updated_at", direction: str = "desc", page: int = 1, page_size: int = 25) -> RetentionPlanPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=RETENTION_MODULE)
        items, total = self.repository.list_plans(account_id=account_id, plan_type=plan_type, status=status_filter, owner_id=owner_id, due_from=due_from, due_to=due_to, search=search, sort=sort, direction=direction, page=page, page_size=page_size)
        return RetentionPlanPageRead(items=[self._plan_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_plan(self, account_id: str, payload: RetentionPlanCreateRequest, current_user: User) -> RetentionPlanRead:
        try:
            account = self._get_account_or_404(account_id)
            self.access.require_account_update(current_user, account, module=RETENTION_MODULE)
            engagement = self._validate_engagement(account_id, payload.engagement_id)
            owner = self._get_active_user(payload.owner_id, "owner_id")
            plan = RetentionPlan(
                account_id=account_id,
                engagement_id=engagement.id if engagement else None,
                plan_type=payload.plan_type,
                title=payload.title,
                summary=payload.summary,
                owner_id=owner.id,
                owner_name=owner.full_name,
                owner_email=owner.email,
                renewal_milestone_at=payload.renewal_milestone_at,
                success_criteria=payload.success_criteria,
                source_context=payload.source_context,
                created_by_id=current_user.id,
                created_by_name=current_user.full_name,
                updated_by_id=current_user.id,
                updated_by_name=current_user.full_name,
            )
            self.repository.save_plan(plan)
            milestones, actions = self._children_from_payload(plan, payload.milestones, payload.actions, current_user)
            self.repository.replace_plan_children(plan, milestones, actions)
            self.audit.log(module=RETENTION_MODULE, action="create_plan", entity_type="retention_plan", entity_id=plan.id, actor=current_user, after_value=self._plan_snapshot(plan))
            self.timeline.add_account_event(
                account_id=account_id,
                engagement_id=plan.engagement_id,
                event_type="retention_event",
                module=RETENTION_MODULE,
                title=f"Retention plan created: {plan.title}",
                description=plan.summary or f"{current_user.full_name} created a {plan.plan_type} plan.",
                actor=current_user,
                source_record_id=plan.id,
                source_record_type="retention_plan",
                source_record_route=f"/accounts/{account_id}?tab=retention&plan={plan.id}",
                after_value=self._plan_snapshot(plan),
            )
            self.repository.commit()
            return self._plan_read(plan)
        except Exception:
            self.repository.rollback()
            raise

    def update_plan(self, plan_id: str, payload: RetentionPlanUpdateRequest, current_user: User) -> RetentionPlanRead:
        try:
            plan = self._get_plan_or_404(plan_id)
            self.access.require_account_update(current_user, plan.account, module=RETENTION_MODULE)
            before = self._plan_snapshot(plan)
            updates = payload.model_dump(exclude_unset=True)
            milestones_payload = updates.pop("milestones", None)
            actions_payload = updates.pop("actions", None)
            if "engagement_id" in updates:
                engagement = self._validate_engagement(plan.account_id, updates["engagement_id"])
                plan.engagement_id = engagement.id if engagement else None
                updates.pop("engagement_id")
            if "owner_id" in updates and updates["owner_id"]:
                owner = self._get_active_user(updates["owner_id"], "owner_id")
                plan.owner_id = owner.id
                plan.owner_name = owner.full_name
                plan.owner_email = owner.email
                updates.pop("owner_id")
            for field, value in updates.items():
                setattr(plan, field, value)
            if plan.status in {"completed", "closed"} and plan.completed_at is None:
                plan.completed_at = utc_now()
            if plan.status not in {"completed", "closed"}:
                plan.completed_at = None
            plan.updated_by_id = current_user.id
            plan.updated_by_name = current_user.full_name
            if milestones_payload is not None or actions_payload is not None:
                milestones, actions = self._children_from_payload(plan, milestones_payload or [], actions_payload or [], current_user)
                self.repository.replace_plan_children(plan, milestones, actions)
            self.audit.log(module=RETENTION_MODULE, action="update_plan", entity_type="retention_plan", entity_id=plan.id, actor=current_user, before_value=before, after_value=self._plan_snapshot(plan))
            self.timeline.add_account_event(
                account_id=plan.account_id,
                engagement_id=plan.engagement_id,
                event_type="retention_event",
                module=RETENTION_MODULE,
                title=f"Retention plan updated: {plan.title}",
                description=f"{current_user.full_name} updated the retention plan.",
                actor=current_user,
                source_record_id=plan.id,
                source_record_type="retention_plan",
                source_record_route=f"/accounts/{plan.account_id}?tab=retention&plan={plan.id}",
                before_value=before,
                after_value=self._plan_snapshot(plan),
            )
            self.repository.commit()
            return self._plan_read(plan)
        except Exception:
            self.repository.rollback()
            raise

    def list_recommendations(self, account_id: str, current_user: User) -> list[RetentionRecommendationRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=RETENTION_MODULE)
        self._generate_recommendations(account)
        self.repository.commit()
        return [self._recommendation_read(item) for item in self.repository.list_recommendations(account_id)]

    def create_tasks_from_recommendations(self, plan_id: str, payload: RetentionRecommendationTaskCreateRequest, current_user: User) -> list[TaskRead]:
        try:
            if not payload.confirm:
                raise field_error("confirm", "You must confirm before creating tasks from recommendations.")
            plan = self._get_plan_or_404(plan_id)
            self.access.require_account_update(current_user, plan.account, module=RETENTION_MODULE)
            owner = self._get_active_user(payload.owner_id, "owner_id")
            tasks: list[Task] = []
            for recommendation_id in payload.recommendation_ids:
                recommendation = self.repository.get_recommendation(recommendation_id)
                if recommendation is None or recommendation.account_id != plan.account_id:
                    raise field_error("recommendation_ids", "Selected recommendation does not belong to this account.")
                if recommendation.created_task_id:
                    continue
                task = Task(
                    account_id=plan.account_id,
                    engagement_id=recommendation.engagement_id,
                    source_type="retention_recommendation",
                    source_record_id=recommendation.id,
                    title=recommendation.recommended_action,
                    description=recommendation.rationale,
                    owner_id=owner.id,
                    owner_name=owner.full_name,
                    due_at=payload.due_at,
                    status="open",
                    priority="high" if recommendation.severity in {"high", "critical"} else "medium",
                    success_criteria=["Recommendation reviewed", "Next client/internal action completed"],
                    requires_evidence=False,
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                )
                self.repository.add_task(task)
                recommendation.created_task_id = task.id
                recommendation.status = "converted"
                tasks.append(task)
            self.audit.log(module=RETENTION_MODULE, action="create_recommendation_tasks", entity_type="retention_plan", entity_id=plan.id, actor=current_user, after_value={"task_ids": [task.id for task in tasks], "recommendation_ids": payload.recommendation_ids})
            self.timeline.add_account_event(
                account_id=plan.account_id,
                engagement_id=plan.engagement_id,
                event_type="retention_event",
                module=RETENTION_MODULE,
                title="Retention recommendation tasks created",
                description=f"{current_user.full_name} created {len(tasks)} task(s) from selected recommendations.",
                actor=current_user,
                source_record_id=plan.id,
                source_record_type="retention_plan",
                source_record_route=f"/accounts/{plan.account_id}?tab=retention&plan={plan.id}",
                after_value={"task_ids": [task.id for task in tasks]},
            )
            self.repository.commit()
            return [TaskRead.model_validate(task) for task in tasks]
        except Exception:
            self.repository.rollback()
            raise

    def _generate_recommendations(self, account: Account) -> None:
        existing = {(item.engagement_id, item.title): item for item in self.repository.list_recommendations(account.id)}
        now = utc_now()
        for engagement in account.engagements:
            profile = self._ensure_profile(engagement)
            specs: list[tuple[str, str, str, str]] = []
            days_to_notice = self._days_until(engagement.notice_deadline)
            days_to_renewal = self._days_until(engagement.renewal_date or engagement.end_date)
            if engagement.renewal_risk == "high" or profile.renewal_risk == "high":
                specs.append(("High renewal risk", "high", f"{engagement.name} is marked high renewal risk.", "Create a renewal risk review with commercial and delivery owners."))
            if days_to_notice is not None and 0 <= days_to_notice <= 30:
                specs.append(("Notice window approaching", "critical", f"Notice deadline is in {days_to_notice} day(s).", "Confirm renewal decision process and notice-window owner."))
            if days_to_renewal is not None and 0 <= days_to_renewal <= 60:
                specs.append(("Renewal milestone approaching", "high", f"Renewal/end date is in {days_to_renewal} day(s).", "Prepare renewal plan with success criteria and client-facing next steps."))
            if engagement.delivery_health < 60:
                specs.append(("Weak delivery health before renewal", "high", f"Delivery health is {engagement.delivery_health}/100.", "Create a stabilization action plan before renewal discussions."))
            for title, severity, rationale, action in specs:
                key = (engagement.id, title)
                recommendation = existing.get(key)
                if recommendation is None:
                    recommendation = RetentionRecommendation(
                        account_id=account.id,
                        engagement_id=engagement.id,
                        title=title,
                        severity=severity,
                        rationale=rationale,
                        recommended_action=action,
                        source_context="deterministic",
                        status="recommended",
                    )
                    self.repository.save_recommendation(recommendation)
                else:
                    recommendation.severity = severity
                    recommendation.rationale = rationale
                    recommendation.recommended_action = action
                    if recommendation.status == "stale":
                        recommendation.status = "recommended"
                    recommendation.updated_at = now
        self.repository.flush()

    def _children_from_payload(self, plan: RetentionPlan, milestones_payload: list, actions_payload: list, current_user: User) -> tuple[list[RetentionPlanMilestone], list[RetentionPlanAction]]:
        milestones: list[RetentionPlanMilestone] = []
        milestone_due_by_key: dict[str, datetime] = {}
        for index, item in enumerate(milestones_payload):
            milestone = RetentionPlanMilestone(retention_plan_id=plan.id, title=item.title, due_at=item.due_at, status=item.status, enforce_action_due_dates=item.enforce_action_due_dates)
            milestones.append(milestone)
            if item.id:
                milestone_due_by_key[item.id] = item.due_at
            milestone_due_by_key[str(index)] = item.due_at
        actions: list[RetentionPlanAction] = []
        for index, item in enumerate(actions_payload):
            owner = self._get_active_user(item.owner_id, f"actions.{index}.owner_id")
            if plan.renewal_milestone_at and item.due_at > plan.renewal_milestone_at:
                raise field_error(f"actions.{index}.due_at", "Retention action due date cannot be after the renewal milestone.")
            if item.milestone_id and item.milestone_id in milestone_due_by_key and item.due_at > milestone_due_by_key[item.milestone_id]:
                raise field_error(f"actions.{index}.due_at", "Action due date cannot be after its linked milestone.")
            actions.append(
                RetentionPlanAction(
                    retention_plan_id=plan.id,
                    milestone_id=item.milestone_id,
                    account_id=plan.account_id,
                    engagement_id=plan.engagement_id,
                    title=item.title,
                    owner_id=owner.id,
                    owner_name=owner.full_name,
                    owner_email=owner.email,
                    due_at=item.due_at,
                    status=item.status,
                    priority=item.priority,
                    success_criteria=item.success_criteria,
                    created_by_id=current_user.id,
                    created_by_name=current_user.full_name,
                    updated_by_id=current_user.id,
                )
            )
        return milestones, actions

    def _ensure_profile(self, engagement: Engagement) -> EngagementRenewalProfile:
        if engagement.renewal_profile is not None:
            return engagement.renewal_profile
        profile = EngagementRenewalProfile(
            account_id=engagement.account_id,
            engagement_id=engagement.id,
            renewal_readiness=self._readiness_for(engagement),
            renewal_risk=engagement.renewal_risk,
            commercial_exposure=float(engagement.value or 0),
            commercial_exposure_currency=engagement.currency,
            owner_id=engagement.owner_id,
            owner_name=engagement.owner_name,
            source_type="sow" if engagement.source_citation else "manual",
            source_citation=engagement.source_citation,
        )
        self.repository.save_renewal_profile(profile)
        engagement.renewal_profile = profile
        return profile

    @staticmethod
    def _readiness_for(engagement: Engagement) -> str:
        if engagement.renewal_status in {"notice_due", "renewal_due", "expired"}:
            return "attention"
        if engagement.renewal_status == "upcoming_notice_window":
            return "watch"
        return "ready" if engagement.renewal_risk == "low" else "unknown"

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_or_404(self, engagement_id: str) -> Engagement:
        engagement = self.repository.get_engagement(engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement

    def _get_plan_or_404(self, plan_id: str) -> RetentionPlan:
        plan = self.repository.get_plan(plan_id)
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retention plan was not found")
        return plan

    def _validate_engagement(self, account_id: str, engagement_id: str | None) -> Engagement | None:
        if not engagement_id:
            return None
        engagement = self._get_engagement_or_404(engagement_id)
        if engagement.account_id != account_id:
            raise field_error("engagement_id", "Engagement must belong to the selected account.")
        return engagement

    def _get_active_user(self, user_id: str, field: str) -> User:
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise field_error(field, "Owner is required.")
        return user

    @staticmethod
    def _days_until(value: datetime | None) -> int | None:
        if value is None:
            return None
        now = datetime.now(value.tzinfo or timezone.utc)
        target = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return (target.date() - now.date()).days

    @staticmethod
    def _renewal_read(profile: EngagementRenewalProfile, engagement: Engagement) -> RenewalProfileRead:
        return RenewalProfileRead(
            id=profile.id,
            account_id=profile.account_id,
            engagement_id=profile.engagement_id,
            renewal_readiness=profile.renewal_readiness,
            renewal_risk=profile.renewal_risk or engagement.renewal_risk,
            confidence=profile.confidence,
            commercial_exposure=float(profile.commercial_exposure),
            commercial_exposure_currency=profile.commercial_exposure_currency,
            owner_id=profile.owner_id,
            owner_name=profile.owner_name,
            source_type=profile.source_type,
            source_citation=profile.source_citation or engagement.source_citation,
            manual_override_reason=profile.manual_override_reason,
            sow_start_date=engagement.start_date,
            sow_end_date=engagement.end_date,
            renewal_date=engagement.renewal_date,
            notice_deadline=engagement.notice_deadline,
            notice_period_days=engagement.notice_period_days,
            auto_renewal=engagement.auto_renewal,
            days_to_expiry=engagement.days_to_expiry,
            renewal_status=engagement.renewal_status,
            updated_at=profile.updated_at,
        )

    @staticmethod
    def _renewal_snapshot(profile: EngagementRenewalProfile, engagement: Engagement) -> dict:
        return {
            "engagement_id": engagement.id,
            "renewal_readiness": profile.renewal_readiness,
            "renewal_risk": profile.renewal_risk,
            "confidence": profile.confidence,
            "commercial_exposure": float(profile.commercial_exposure),
            "source_type": profile.source_type,
            "source_citation": profile.source_citation,
            "manual_override_reason": profile.manual_override_reason,
            "renewal_date": engagement.renewal_date.isoformat() if engagement.renewal_date else None,
            "notice_deadline": engagement.notice_deadline.isoformat() if engagement.notice_deadline else None,
            "notice_period_days": engagement.notice_period_days,
            "auto_renewal": engagement.auto_renewal,
        }

    def _plan_read(self, plan: RetentionPlan) -> RetentionPlanRead:
        return RetentionPlanRead(
            id=plan.id,
            account_id=plan.account_id,
            engagement_id=plan.engagement_id,
            plan_type=plan.plan_type,
            status=plan.status,
            title=plan.title,
            summary=plan.summary,
            owner_id=plan.owner_id,
            owner_name=plan.owner_name,
            owner_email=plan.owner_email,
            renewal_milestone_at=plan.renewal_milestone_at,
            success_criteria=list(plan.success_criteria or []),
            source_context=plan.source_context,
            completed_at=plan.completed_at,
            created_by_id=plan.created_by_id,
            created_by_name=plan.created_by_name,
            updated_by_id=plan.updated_by_id,
            updated_by_name=plan.updated_by_name,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
            milestones=[self._milestone_read(item) for item in sorted(plan.milestones, key=lambda milestone: milestone.due_at)],
            actions=[self._action_read(item) for item in sorted(plan.actions, key=lambda action: (action.status == "completed", action.due_at, action.created_at))],
        )

    @staticmethod
    def _milestone_read(item: RetentionPlanMilestone) -> RetentionPlanMilestoneRead:
        return RetentionPlanMilestoneRead(id=item.id, retention_plan_id=item.retention_plan_id, title=item.title, due_at=item.due_at, status=item.status, enforce_action_due_dates=item.enforce_action_due_dates, created_at=item.created_at, updated_at=item.updated_at)

    @staticmethod
    def _action_read(item: RetentionPlanAction) -> RetentionPlanActionRead:
        return RetentionPlanActionRead(
            id=item.id,
            retention_plan_id=item.retention_plan_id,
            milestone_id=item.milestone_id,
            account_id=item.account_id,
            engagement_id=item.engagement_id,
            title=item.title,
            owner_id=item.owner_id,
            owner_name=item.owner_name,
            owner_email=item.owner_email,
            due_at=item.due_at,
            status=item.status,
            priority=item.priority,
            success_criteria=list(item.success_criteria or []),
            future_task_id=item.future_task_id,
            completed_at=item.completed_at,
            completed_by_id=item.completed_by_id,
            created_by_id=item.created_by_id,
            created_by_name=item.created_by_name,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _recommendation_read(item: RetentionRecommendation) -> RetentionRecommendationRead:
        return RetentionRecommendationRead(
            id=item.id,
            account_id=item.account_id,
            engagement_id=item.engagement_id,
            title=item.title,
            rationale=item.rationale,
            severity=item.severity,
            recommended_action=item.recommended_action,
            source_context=item.source_context,
            status=item.status,
            created_task_id=item.created_task_id,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _plan_snapshot(plan: RetentionPlan) -> dict:
        return {
            "id": plan.id,
            "account_id": plan.account_id,
            "engagement_id": plan.engagement_id,
            "plan_type": plan.plan_type,
            "status": plan.status,
            "title": plan.title,
            "summary": plan.summary,
            "owner_id": plan.owner_id,
            "renewal_milestone_at": plan.renewal_milestone_at.isoformat() if plan.renewal_milestone_at else None,
            "success_criteria": list(plan.success_criteria or []),
            "source_context": plan.source_context,
        }
