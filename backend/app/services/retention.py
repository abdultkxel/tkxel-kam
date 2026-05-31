import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountRetentionProfile,
    Engagement,
    EngagementRenewal,
    RetentionPlan,
    RetentionPlanAction,
    RetentionPlanMilestone,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.rbac import RbacRepository
from app.repositories.retention import RetentionRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    AccountRetentionRead,
    AccountRetentionUpdateRequest,
    EngagementRenewalRead,
    EngagementRenewalUpdateRequest,
    PortfolioRenewalPageRead,
    RetentionCalendarItemRead,
    RetentionPortfolioReportRead,
    RetentionPortfolioTaskPageRead,
    RetentionPortfolioTaskRead,
    RetentionPlanActionCreateRequest,
    RetentionPlanActionPageRead,
    RetentionPlanActionRead,
    RetentionPlanActionUpdateRequest,
    RetentionPlanCreateRequest,
    RetentionPlanPageRead,
    RetentionPlanRead,
    RetentionPlanUpdateRequest,
    RetentionRecommendationRead,
    RetentionRecommendationResponse,
    RetentionSignalPageRead,
    RetentionSignalRead,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

RETENTION_MODULE = "retention_stability"
PLAN_MANAGER_ROLES = {"super_admin", "admin", "kam_head", "account_manager", "am"}
COMMERCIAL_UPDATE_FIELDS = {
    "commercial_exposure",
    "currency",
    "confidence",
    "source_kind",
    "source_title",
    "source_document_id",
    "source_citation",
    "manual_override_reason",
}


class RetentionService:
    def __init__(self, db: Session) -> None:
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
        self.retention = RetentionRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))

    def get_account_retention(self, account_id: str, current_user: User) -> AccountRetentionRead:
        account = self._get_account_or_404(account_id)
        self._require_view(current_user, account)
        renewals = [self._renewal_read(engagement, account, renewal) for engagement, _, renewal in self.retention.list_account_renewal_tuples(account.id)]
        profile = self.retention.get_profile(account.id)
        return self._account_retention_read(account, profile, renewals)

    def update_account_retention(self, account_id: str, payload: AccountRetentionUpdateRequest, current_user: User) -> AccountRetentionRead:
        account = self._get_account_or_404(account_id)
        updates = payload.model_dump(exclude_unset=True)
        self._require_update(current_user, account, set(updates))
        profile = self.retention.get_profile(account.id)
        if profile is None:
            profile = AccountRetentionProfile(
                account_id=account.id,
                commercial_exposure=float(account.commercial_value),
                currency=account.currency,
                source_kind="manual",
                created_by_id=current_user.id,
            )
        before = self._profile_snapshot(profile)

        owner = self._get_active_user(updates["owner_id"]) if updates.get("owner_id") else None
        for field, value in updates.items():
            if field == "owner_id":
                profile.owner_id = owner.id if owner else None
                profile.owner_name = owner.full_name if owner else None
            else:
                setattr(profile, field, value)
        profile.updated_by_id = current_user.id
        if updates.get("source_kind") == "manual" and not profile.manual_override_reason:
            raise HTTPException(status_code=422, detail="Manual renewal terms require a manual override reason")
        self._validate_profile(profile)

        self.retention.save_profile(profile)
        after = self._profile_snapshot(profile)
        self._log_change(
            account=account,
            actor=current_user,
            action="retention_profile_update",
            entity_type="account_retention_profile",
            entity_id=profile.id,
            title="Retention profile updated",
            description=f"Retention context changed for {account.name}.",
            before=before,
            after=after,
        )
        self.retention.commit()
        return self.get_account_retention(account.id, current_user)

    def get_engagement_renewal(self, engagement_id: str, current_user: User) -> EngagementRenewalRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self._require_view(current_user, account)
        return self._renewal_read(engagement, account, self.retention.get_renewal_by_engagement(engagement.id))

    def update_engagement_renewal(self, engagement_id: str, payload: EngagementRenewalUpdateRequest, current_user: User) -> EngagementRenewalRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        updates = payload.model_dump(exclude_unset=True)
        self._require_update(current_user, account, set(updates))
        renewal = self.retention.get_renewal_by_engagement(engagement.id)
        if renewal is None:
            renewal = self._default_renewal(account, engagement, current_user)
        before = self._renewal_snapshot(engagement, renewal)

        owner = self._get_active_user(updates["owner_id"]) if updates.get("owner_id") else None
        for field, value in updates.items():
            if field == "owner_id":
                renewal.owner_id = owner.id if owner else None
                renewal.owner_name = owner.full_name if owner else None
                engagement.owner_id = owner.id if owner else None
                engagement.owner_name = owner.full_name if owner else current_user.full_name
            else:
                setattr(renewal, field, value)
                if field in {"sow_start_date", "sow_end_date", "renewal_date", "notice_deadline", "notice_period_days", "auto_renewal", "currency", "source_citation"}:
                    self._sync_engagement_field(engagement, field, value)
                if field == "commercial_exposure":
                    engagement.value = value
        renewal.updated_by_id = current_user.id
        if updates.get("source_kind") == "manual" and not renewal.manual_override_reason:
            raise HTTPException(status_code=422, detail="Manual renewal terms require a manual override reason")
        self._validate_renewal(renewal)
        self._refresh_renewal_status(account, engagement, renewal)

        self.retention.save_renewal(renewal)
        self.engagements.save(engagement)
        after = self._renewal_snapshot(engagement, renewal)
        self._log_change(
            account=account,
            actor=current_user,
            action="engagement_renewal_update",
            entity_type="engagement_renewal",
            entity_id=renewal.id,
            title="Renewal intelligence updated",
            description=f"Renewal terms changed for {engagement.name}.",
            before=before,
            after=after,
            engagement_id=engagement.id,
            route=f"/accounts/{account.id}?tab=engagements&engagement={engagement.id}",
        )
        self.retention.commit()
        return self._renewal_read(engagement, account, renewal)

    def list_portfolio_renewals(
        self,
        current_user: User,
        *,
        search: str | None = None,
        renewal_window: str | None = None,
        notice_window: str | None = None,
        renewal_risk: str | None = None,
        owner_id: str | None = None,
        confidence_min: int | None = None,
        confidence_max: int | None = None,
        auto_renewal: bool | None = None,
        source_kind: str | None = None,
        exposure_min: float | None = None,
        exposure_max: float | None = None,
        sort: str = "nearest_notice",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> PortfolioRenewalPageRead:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        account_ids = None if current_user.role in GLOBAL_EDIT_ROLES | {"leadership", "leadership_viewer"} else self.accounts.list_account_ids_for_user(current_user.id)
        rows, total = self.retention.list_portfolio_renewal_tuples(
            account_ids=account_ids,
            search=search,
            renewal_window=renewal_window,
            notice_window=notice_window,
            renewal_risk=renewal_risk,
            owner_id=owner_id,
            confidence_min=confidence_min,
            confidence_max=confidence_max,
            auto_renewal=auto_renewal,
            source_kind=source_kind,
            exposure_min=exposure_min,
            exposure_max=exposure_max,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return PortfolioRenewalPageRead(
            items=[self._renewal_read(engagement, account, renewal) for engagement, account, renewal in rows],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def list_portfolio_tasks(
        self,
        current_user: User,
        *,
        status_filter: str | None = None,
        owner_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> RetentionPortfolioTaskPageRead:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        account_ids = self._portfolio_account_ids(current_user)
        action_rows, _ = self.retention.list_portfolio_actions(
            account_ids=account_ids,
            status_filter=status_filter,
            owner_id=owner_id,
            page=1,
            page_size=500,
        )
        tasks = [self._portfolio_task_read(action, plan) for action, plan in action_rows]
        renewal_rows, _ = self.retention.list_portfolio_renewal_tuples(account_ids=account_ids, sort="nearest_notice", direction="asc", page=1, page_size=500)
        for engagement, account, renewal in renewal_rows:
            read = self._renewal_read(engagement, account, renewal)
            if read.notice_deadline is None or read.days_to_notice is None or read.days_to_notice > 60:
                continue
            if status_filter and status_filter != "todo":
                continue
            if owner_id and read.owner_id != owner_id:
                continue
            tasks.append(
                RetentionPortfolioTaskRead(
                    id=f"notice-task-{read.engagement_id}",
                    account_id=account.id,
                    account_name=account.name,
                    plan_id=f"renewal-{read.engagement_id}",
                    plan_title="Renewal notice follow-up",
                    title=f"Validate notice path for {read.engagement_name}",
                    owner_id=read.owner_id,
                    owner_name=read.owner_name or "Unassigned",
                    due_at=read.notice_deadline,
                    status="todo",
                    source_recommendation_id=f"notice-{read.engagement_id}",
                )
            )
        tasks.sort(key=lambda task: self._aware(task.due_at))
        start = (page - 1) * page_size
        items = tasks[start:start + page_size]
        return RetentionPortfolioTaskPageRead(
            items=items,
            total=len(tasks),
            page=page,
            page_size=page_size,
            pages=page_count(len(tasks), page_size),
        )

    def list_retention_signals(self, current_user: User, *, page: int = 1, page_size: int = 10) -> RetentionSignalPageRead:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        rows, _ = self.retention.list_portfolio_renewal_tuples(
            account_ids=self._portfolio_account_ids(current_user),
            sort="nearest_notice",
            direction="asc",
            page=1,
            page_size=500,
        )
        signals = [signal for engagement, account, renewal in rows for signal in self._signals_for_renewal(self._renewal_read(engagement, account, renewal))]
        start = (page - 1) * page_size
        items = signals[start:start + page_size]
        return RetentionSignalPageRead(items=items, total=len(signals), page=page, page_size=page_size, pages=page_count(len(signals), page_size))

    def list_calendar_items(
        self,
        current_user: User,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[RetentionCalendarItemRead]:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        account_ids = self._portfolio_account_ids(current_user)
        rows, _ = self.retention.list_portfolio_renewal_tuples(account_ids=account_ids, sort="nearest_notice", direction="asc", page=1, page_size=500)
        plans, _ = self.retention.list_portfolio_plans(account_ids=account_ids, page=1, page_size=500)
        items: list[RetentionCalendarItemRead] = []
        for engagement, account, renewal in rows:
            read = self._renewal_read(engagement, account, renewal)
            for date_value, item_type, title in (
                (read.notice_deadline, "notice_deadline", f"Notice deadline: {read.engagement_name}"),
                (read.renewal_date or read.sow_end_date, "renewal_date", f"Renewal: {read.engagement_name}"),
            ):
                if date_value and self._within_range(date_value, date_from, date_to):
                    items.append(
                        RetentionCalendarItemRead(
                            id=f"{item_type}-{read.engagement_id}",
                            account_id=read.account_id,
                            account_name=read.account_name or read.account_id,
                            title=title,
                            starts_at=date_value,
                            item_type=item_type,
                            source_record_route=f"/accounts/{read.account_id}?tab=retention",
                            owner_name=read.owner_name,
                            severity=read.renewal_risk,
                        )
                    )
        for plan in plans:
            if self._within_range(plan.due_at, date_from, date_to):
                items.append(self._calendar_item_for_plan(plan, "retention_plan_due", plan.due_at, f"Plan due: {plan.title}"))
            for milestone in plan.milestones:
                if self._within_range(milestone.due_at, date_from, date_to):
                    items.append(self._calendar_item_for_plan(plan, "retention_milestone", milestone.due_at, f"Milestone: {milestone.title}"))
            for action in plan.actions:
                if self._within_range(action.due_at, date_from, date_to):
                    items.append(self._calendar_item_for_plan(plan, "retention_action", action.due_at, f"Action: {action.title}", owner_name=action.owner_name))
        return sorted(items, key=lambda item: item.starts_at)

    def portfolio_report(self, current_user: User) -> RetentionPortfolioReportRead:
        self.access.require_module_permission(current_user, RETENTION_MODULE, "view")
        rows, _ = self.retention.list_portfolio_renewal_tuples(account_ids=self._portfolio_account_ids(current_user), page=1, page_size=1000)
        renewals = [self._renewal_read(engagement, account, renewal) for engagement, account, renewal in rows]
        plans, _ = self.retention.list_portfolio_plans(account_ids=self._portfolio_account_ids(current_user), page=1, page_size=1000)
        open_actions = [action for plan in plans for action in plan.actions if action.status not in {"done", "cancelled"}]
        now = datetime.now(timezone.utc)
        signals = [signal for renewal in renewals for signal in self._signals_for_renewal(renewal)]
        return RetentionPortfolioReportRead(
            total_renewals=len(renewals),
            critical_renewals=sum(1 for renewal in renewals if renewal.renewal_risk == "critical"),
            warning_renewals=sum(1 for renewal in renewals if renewal.renewal_risk == "warning"),
            healthy_renewals=sum(1 for renewal in renewals if renewal.renewal_risk == "healthy"),
            upcoming_notice_30=sum(1 for renewal in renewals if renewal.days_to_notice is not None and 0 <= renewal.days_to_notice <= 30),
            upcoming_renewal_90=sum(1 for renewal in renewals if renewal.days_to_expiry is not None and 0 <= renewal.days_to_expiry <= 90),
            total_commercial_exposure=sum(float(renewal.commercial_exposure) for renewal in renewals),
            open_retention_actions=len(open_actions),
            overdue_retention_actions=sum(1 for action in open_actions if self._aware(action.due_at) < now),
            signal_count=len(signals),
        )

    def list_plans(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        plan_type: str | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        milestone_from: datetime | None = None,
        milestone_to: datetime | None = None,
        sort: str = "due_date",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> RetentionPlanPageRead:
        account = self._get_account_or_404(account_id)
        self._require_view(current_user, account)
        plans, total = self.retention.list_plans(
            account_id=account.id,
            search=search,
            plan_type=plan_type,
            status_filter=status_filter,
            owner_id=owner_id,
            due_from=due_from,
            due_to=due_to,
            milestone_from=milestone_from,
            milestone_to=milestone_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return RetentionPlanPageRead(items=[self._plan_read(plan) for plan in plans], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_plan(self, account_id: str, payload: RetentionPlanCreateRequest, current_user: User) -> RetentionPlanRead:
        account = self._get_account_or_404(account_id)
        self._require_plan_manage(current_user, account)
        engagement = self._validate_plan_engagement(account, payload.engagement_id)
        owner = self._get_active_user(payload.owner_id)
        self._validate_plan_dates(payload.due_at, payload.renewal_milestone_at, payload.milestones)
        plan = RetentionPlan(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            title=payload.title,
            plan_type=payload.plan_type,
            status=payload.status,
            risk_level=payload.risk_level,
            owner_id=owner.id,
            owner_name=owner.full_name,
            due_at=payload.due_at,
            renewal_milestone_at=payload.renewal_milestone_at,
            success_criteria=payload.success_criteria,
            recommendation_context=payload.recommendation_context,
            timeline_history=[{"event": "created", "actor": current_user.full_name, "at": self._now_iso()}],
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.retention.save_plan(plan)
        for milestone_payload in payload.milestones:
            self.retention.add_milestone(
                RetentionPlanMilestone(
                    plan_id=plan.id,
                    title=milestone_payload.title,
                    milestone_type=milestone_payload.milestone_type,
                    due_at=milestone_payload.due_at,
                )
            )
        if payload.custom_field_values:
            self.custom_fields.save_record_values(RETENTION_MODULE, plan.id, payload.custom_field_values, current_user, audit_module=RETENTION_MODULE)
        self._log_change(
            account=account,
            actor=current_user,
            action="retention_plan_create",
            entity_type="retention_plan",
            entity_id=plan.id,
            title="Retention plan created",
            description=f"{plan.title} was created.",
            before=None,
            after=self._plan_snapshot(plan),
            engagement_id=plan.engagement_id,
            route=f"/accounts/{account.id}?tab=retention",
        )
        self.retention.commit()
        return self._plan_read(self._get_plan_or_404(plan.id))

    def update_plan(self, plan_id: str, payload: RetentionPlanUpdateRequest, current_user: User) -> RetentionPlanRead:
        plan = self._get_plan_or_404(plan_id)
        account = self._get_account_or_404(plan.account_id)
        self._require_plan_manage(current_user, account)
        updates = payload.model_dump(exclude_unset=True)
        before = self._plan_snapshot(plan)
        if "engagement_id" in updates:
            engagement = self._validate_plan_engagement(account, updates["engagement_id"])
            plan.engagement_id = engagement.id if engagement else None
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"])
            plan.owner_id = owner.id
            plan.owner_name = owner.full_name
        for field, value in updates.items():
            if field in {"engagement_id", "owner_id", "custom_field_values"}:
                continue
            setattr(plan, field, value)
        self._validate_plan_dates(plan.due_at, plan.renewal_milestone_at, [])
        if updates.get("custom_field_values") is not None:
            self.custom_fields.replace_record_values(RETENTION_MODULE, plan.id, updates["custom_field_values"], current_user, audit_module=RETENTION_MODULE)
        plan.updated_by_id = current_user.id
        plan.timeline_history = [*plan.timeline_history, {"event": "updated", "actor": current_user.full_name, "at": self._now_iso()}]
        self.retention.save_plan(plan)
        self._log_change(
            account=account,
            actor=current_user,
            action="retention_plan_update",
            entity_type="retention_plan",
            entity_id=plan.id,
            title="Retention plan updated",
            description=f"{plan.title} was updated.",
            before=before,
            after=self._plan_snapshot(plan),
            engagement_id=plan.engagement_id,
            route=f"/accounts/{account.id}?tab=retention",
        )
        self.retention.commit()
        return self._plan_read(self._get_plan_or_404(plan.id))

    def create_plan_task(self, plan_id: str, payload: RetentionPlanActionCreateRequest, current_user: User) -> RetentionPlanActionRead:
        plan = self._get_plan_or_404(plan_id)
        account = self._get_account_or_404(plan.account_id)
        self._require_plan_manage(current_user, account)
        if not payload.confirmed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recommendation actions require explicit confirmation")
        owner = self._get_active_user(payload.owner_id)
        self._validate_action_due_date(plan, payload.due_at)
        action = RetentionPlanAction(
            plan_id=plan.id,
            title=payload.title,
            owner_id=owner.id,
            owner_name=owner.full_name,
            due_at=payload.due_at,
            success_criteria=payload.success_criteria,
            source_recommendation_id=payload.source_recommendation_id,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.retention.add_action(action)
        plan.timeline_history = [*plan.timeline_history, {"event": "action_created", "action_id": action.id, "actor": current_user.full_name, "at": self._now_iso()}]
        self._log_change(
            account=account,
            actor=current_user,
            action="retention_plan_action_create",
            entity_type="retention_plan_action",
            entity_id=action.id,
            title="Retention action created",
            description=f"{action.title} was added to {plan.title}.",
            before=None,
            after=self._action_snapshot(action),
            engagement_id=plan.engagement_id,
            route=f"/accounts/{account.id}?tab=retention",
        )
        self.retention.commit()
        return RetentionPlanActionRead.model_validate(action)

    def update_plan_action(self, action_id: str, payload: RetentionPlanActionUpdateRequest, current_user: User) -> RetentionPlanActionRead:
        action = self.retention.get_action(action_id)
        if action is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retention action was not found")
        plan = self._get_plan_or_404(action.plan_id)
        account = self._get_account_or_404(plan.account_id)
        self._require_plan_manage(current_user, account)
        updates = payload.model_dump(exclude_unset=True)
        before = self._action_snapshot(action)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"])
            action.owner_id = owner.id
            action.owner_name = owner.full_name
        for field, value in updates.items():
            if field == "owner_id":
                continue
            setattr(action, field, value)
        if updates.get("due_at") is not None:
            self._validate_action_due_date(plan, action.due_at)
        if updates.get("status") == "done" and action.completed_at is None:
            action.completed_at = datetime.now(timezone.utc)
            action.completed_by_id = current_user.id
        if updates.get("status") and updates["status"] != "done":
            action.completed_at = None
            action.completed_by_id = None
        action.updated_by_id = current_user.id
        plan.timeline_history = [*plan.timeline_history, {"event": f"action_{action.status}", "action_id": action.id, "actor": current_user.full_name, "at": self._now_iso()}]
        self._log_change(
            account=account,
            actor=current_user,
            action="retention_plan_action_update",
            entity_type="retention_plan_action",
            entity_id=action.id,
            title="Retention action updated",
            description=f"{action.title} is now {action.status}.",
            before=before,
            after=self._action_snapshot(action),
            engagement_id=plan.engagement_id,
            route=f"/accounts/{account.id}?tab=retention",
        )
        self.retention.commit()
        return RetentionPlanActionRead.model_validate(action)

    def list_plan_actions(self, plan_id: str, current_user: User, *, page: int = 1, page_size: int = 10) -> RetentionPlanActionPageRead:
        plan = self._get_plan_or_404(plan_id)
        account = self._get_account_or_404(plan.account_id)
        self._require_view(current_user, account)
        actions, total = self.retention.list_actions_page(plan.id, page, page_size)
        return RetentionPlanActionPageRead(
            items=[RetentionPlanActionRead.model_validate(action) for action in actions],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def recommendations(self, account_id: str, current_user: User) -> RetentionRecommendationResponse:
        account = self._get_account_or_404(account_id)
        self._require_view(current_user, account)
        try:
            renewals = [self._renewal_read(engagement, account, renewal) for engagement, _, renewal in self.retention.list_account_renewal_tuples(account.id)]
            profile = self.retention.get_profile(account.id)
            missing = self._recommendation_missing_inputs(account, profile, renewals)
            if missing:
                logger.warning("Retention recommendation inputs are incomplete", extra={"account_id": account.id, "missing": missing})
            recommendations = self._build_recommendations(account, profile, renewals, missing)
            return RetentionRecommendationResponse(
                account_id=account.id,
                inputs_available=not missing,
                missing_inputs=missing,
                recommendations=recommendations,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Retention recommendation generation failed", extra={"account_id": account.id})
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Retention recommendations could not be generated")

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_or_404(self, engagement_id: str) -> Engagement:
        engagement = self.engagements.get_by_id(engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement

    def _get_plan_or_404(self, plan_id: str) -> RetentionPlan:
        plan = self.retention.get_plan(plan_id)
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retention plan was not found")
        return plan

    def _get_active_user(self, user_id: str) -> User:
        user = self.accounts.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is inactive or unauthorized")
        return user

    def _require_view(self, user: User, account: Account) -> None:
        self.access.require_account_view(user, account, module=RETENTION_MODULE)

    def _portfolio_account_ids(self, user: User) -> list[str] | None:
        return None if user.role in GLOBAL_EDIT_ROLES | {"leadership", "leadership_viewer"} else self.accounts.list_account_ids_for_user(user.id)

    def _require_update(self, user: User, account: Account, fields: set[str]) -> None:
        self.access.require_module_permission(user, RETENTION_MODULE, "update")
        if account.lifecycle_status == "Archived" and user.role not in GLOBAL_EDIT_ROLES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived accounts are read-only")
        if user.role == "commercial_stakeholder":
            if not self.access.can_view_account(user, account):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this account")
            if not fields or not fields <= COMMERCIAL_UPDATE_FIELDS:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Commercial stakeholders can update commercial renewal fields only")
            return
        if user.role in {"super_admin", "admin", "kam_head"}:
            return
        if user.role in {"account_manager", "am"} and self.access.can_update_account(user, account):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update retention context for this account")

    def _require_plan_manage(self, user: User, account: Account) -> None:
        self.access.require_module_permission(user, RETENTION_MODULE, "update")
        if user.role not in PLAN_MANAGER_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage retention plans")
        if account.lifecycle_status == "Archived" and user.role not in GLOBAL_EDIT_ROLES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived accounts are read-only")
        if user.role in GLOBAL_EDIT_ROLES:
            return
        if not self.access.can_update_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage retention plans for this account")

    def _default_renewal(self, account: Account, engagement: Engagement, actor: User) -> EngagementRenewal:
        renewal = EngagementRenewal(
            account_id=account.id,
            engagement_id=engagement.id,
            owner_id=engagement.owner_id,
            owner_name=engagement.owner_name,
            sow_start_date=engagement.start_date,
            sow_end_date=engagement.end_date,
            renewal_date=engagement.renewal_date,
            notice_deadline=engagement.notice_deadline,
            notice_period_days=engagement.notice_period_days,
            auto_renewal=engagement.auto_renewal,
            commercial_exposure=float(engagement.value),
            currency=engagement.currency,
            confidence=max(0, min(100, engagement.delivery_health)),
            source_kind="sow" if engagement.source_citation else "manual",
            source_citation=engagement.source_citation,
            source_title=engagement.name,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        self._refresh_renewal_status(account, engagement, renewal)
        return renewal

    def _renewal_read(self, engagement: Engagement, account: Account, renewal: EngagementRenewal | None) -> EngagementRenewalRead:
        effective = renewal or self._default_renewal(account, engagement, self._system_actor(account))
        risk = effective.renewal_risk or self._computed_risk(account, engagement, effective.notice_deadline, effective.renewal_date, effective.confidence)
        readiness = effective.readiness_status or self._computed_readiness(effective)
        return EngagementRenewalRead(
            id=renewal.id if renewal else None,
            account_id=account.id,
            account_name=account.name,
            engagement_id=engagement.id,
            engagement_name=engagement.name,
            owner_id=effective.owner_id,
            owner_name=effective.owner_name,
            readiness_status=readiness,
            renewal_risk=risk,
            sow_start_date=effective.sow_start_date,
            sow_end_date=effective.sow_end_date,
            renewal_date=effective.renewal_date,
            notice_deadline=effective.notice_deadline,
            notice_period_days=effective.notice_period_days,
            auto_renewal=effective.auto_renewal,
            commercial_exposure=float(effective.commercial_exposure),
            currency=effective.currency,
            confidence=effective.confidence,
            source_kind=effective.source_kind,
            source_title=effective.source_title,
            source_document_id=effective.source_document_id,
            source_citation=effective.source_citation,
            manual_override_reason=effective.manual_override_reason,
            days_to_expiry=self._days_until(effective.renewal_date or effective.sow_end_date),
            days_to_notice=self._days_until(effective.notice_deadline),
            created_at=renewal.created_at if renewal else None,
            updated_at=renewal.updated_at if renewal else engagement.updated_at,
        )

    def _account_retention_read(self, account: Account, profile: AccountRetentionProfile | None, renewals: list[EngagementRenewalRead]) -> AccountRetentionRead:
        nearest_notice = self._nearest_days([item.days_to_notice for item in renewals])
        nearest_renewal = self._nearest_days([item.days_to_expiry for item in renewals])
        high_risk = sum(1 for item in renewals if item.renewal_risk in {"warning", "critical"})
        primary_owner = next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)
        return AccountRetentionRead(
            id=profile.id if profile else None,
            account_id=account.id,
            readiness_status=profile.readiness_status if profile else self._rollup_readiness(renewals),
            renewal_risk=profile.renewal_risk if profile else self._rollup_risk(renewals),
            owner_id=profile.owner_id if profile else (primary_owner.user_id if primary_owner else None),
            owner_name=profile.owner_name if profile else (primary_owner.user_name if primary_owner else None),
            commercial_exposure=float(profile.commercial_exposure) if profile else sum(float(item.commercial_exposure) for item in renewals),
            currency=profile.currency if profile else account.currency,
            confidence=profile.confidence if profile else self._average_confidence(renewals),
            source_kind=profile.source_kind if profile else "manual",
            source_title=profile.source_title if profile else None,
            source_citation=profile.source_citation if profile else account.source_citation,
            manual_override_reason=profile.manual_override_reason if profile else None,
            notes=profile.notes if profile else None,
            days_to_nearest_notice=nearest_notice,
            days_to_nearest_renewal=nearest_renewal,
            renewal_count=len(renewals),
            high_risk_count=high_risk,
            renewals=renewals,
            updated_at=profile.updated_at if profile else account.updated_at,
        )

    def _plan_read(self, plan: RetentionPlan) -> RetentionPlanRead:
        read = RetentionPlanRead.model_validate(plan)
        return read.model_copy(update={"custom_field_values": self.custom_fields.record_values(RETENTION_MODULE, plan.id)})

    @staticmethod
    def _portfolio_task_read(action: RetentionPlanAction, plan: RetentionPlan) -> RetentionPortfolioTaskRead:
        return RetentionPortfolioTaskRead(
            id=action.id,
            account_id=plan.account_id,
            account_name=plan.account.name if plan.account else plan.account_id,
            plan_id=plan.id,
            plan_title=plan.title,
            title=action.title,
            owner_id=action.owner_id,
            owner_name=action.owner_name,
            due_at=action.due_at,
            status=action.status,
            source_recommendation_id=action.source_recommendation_id,
        )

    def _signals_for_renewal(self, renewal: EngagementRenewalRead) -> list[RetentionSignalRead]:
        signals: list[RetentionSignalRead] = []
        route = f"/accounts/{renewal.account_id}?tab=retention"
        if renewal.days_to_notice is not None and renewal.days_to_notice <= 60:
            severity = "critical" if renewal.days_to_notice <= 30 else "warning"
            signals.append(
                RetentionSignalRead(
                    id=f"notice-{renewal.engagement_id}",
                    account_id=renewal.account_id,
                    account_name=renewal.account_name or renewal.account_id,
                    engagement_id=renewal.engagement_id,
                    engagement_name=renewal.engagement_name,
                    signal_type="notice_window",
                    severity=severity,
                    headline=f"Notice deadline is {abs(renewal.days_to_notice)} day{'s' if abs(renewal.days_to_notice) != 1 else ''} {'overdue' if renewal.days_to_notice < 0 else 'away'}",
                    detail="SOW notice timing requires owner review before renewal decisions are missed.",
                    reason_codes=["SOW_NOTICE_WITHIN_60_DAYS" if renewal.days_to_notice > 30 else "SOW_NOTICE_WITHIN_30_DAYS"],
                    evidence=[item for item in [renewal.source_citation, f"Confidence: {renewal.confidence}%"] if item],
                    due_at=renewal.notice_deadline,
                    source_record_route=route,
                )
            )
        if renewal.days_to_expiry is not None and renewal.days_to_expiry <= 90:
            severity = "critical" if renewal.days_to_expiry < 0 or renewal.renewal_risk == "critical" else "warning"
            signals.append(
                RetentionSignalRead(
                    id=f"renewal-{renewal.engagement_id}",
                    account_id=renewal.account_id,
                    account_name=renewal.account_name or renewal.account_id,
                    engagement_id=renewal.engagement_id,
                    engagement_name=renewal.engagement_name,
                    signal_type="sow_expiry",
                    severity=severity,
                    headline=f"Renewal window for {renewal.engagement_name}",
                    detail="Renewal/SOW end date is inside the attention window.",
                    reason_codes=["RENEWAL_WITHIN_90_DAYS", f"RENEWAL_RISK_{renewal.renewal_risk.upper()}"],
                    evidence=[item for item in [renewal.source_citation, f"Commercial exposure: {renewal.currency} {renewal.commercial_exposure:,.0f}"] if item],
                    due_at=renewal.renewal_date or renewal.sow_end_date,
                    source_record_route=route,
                )
            )
        return signals

    @staticmethod
    def _within_range(value: datetime, date_from: datetime | None, date_to: datetime | None) -> bool:
        aware = RetentionService._aware(value)
        if date_from and aware < RetentionService._aware(date_from):
            return False
        if date_to and aware > RetentionService._aware(date_to):
            return False
        return True

    @staticmethod
    def _calendar_item_for_plan(plan: RetentionPlan, item_type: str, starts_at: datetime, title: str, owner_name: str | None = None) -> RetentionCalendarItemRead:
        return RetentionCalendarItemRead(
            id=f"{item_type}-{plan.id}-{starts_at.isoformat()}",
            account_id=plan.account_id,
            account_name=plan.account.name if plan.account else plan.account_id,
            title=title,
            starts_at=starts_at,
            item_type=item_type,
            source_record_route=f"/accounts/{plan.account_id}?tab=retention",
            owner_name=owner_name or plan.owner_name,
            severity=plan.risk_level,
        )

    def _validate_profile(self, profile: AccountRetentionProfile) -> None:
        self._validate_source_fields(profile.source_kind, profile.confidence, profile.source_citation, profile.manual_override_reason)

    def _validate_renewal(self, renewal: EngagementRenewal) -> None:
        if renewal.notice_deadline and renewal.renewal_date and self._aware(renewal.notice_deadline) >= self._aware(renewal.renewal_date):
            raise HTTPException(status_code=422, detail="Notice deadline must be before renewal date")
        if renewal.notice_deadline and renewal.sow_end_date and self._aware(renewal.notice_deadline) >= self._aware(renewal.sow_end_date):
            raise HTTPException(status_code=422, detail="Notice deadline must be before SOW end date")
        self._validate_source_fields(renewal.source_kind, renewal.confidence, renewal.source_citation, renewal.manual_override_reason)

    def _validate_source_fields(self, source_kind: str, confidence: int | None, citation: str | None, manual_reason: str | None) -> None:
        if source_kind in {"sow", "extracted"} and (confidence is None or not citation):
            raise HTTPException(status_code=422, detail="SOW-backed or extracted renewal fields require confidence and citation")

    def _validate_plan_engagement(self, account: Account, engagement_id: str | None) -> Engagement | None:
        if not engagement_id:
            return None
        engagement = self._get_engagement_or_404(engagement_id)
        if engagement.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Engagement does not belong to this account")
        return engagement

    def _validate_plan_dates(self, due_at: datetime, renewal_milestone_at: datetime | None, milestones: list[Any]) -> None:
        if renewal_milestone_at and self._aware(due_at) > self._aware(renewal_milestone_at):
            raise HTTPException(status_code=422, detail="Plan due date cannot be after the renewal milestone")
        for milestone in milestones:
            if getattr(milestone, "milestone_type", None) == "renewal" and self._aware(due_at) > self._aware(milestone.due_at):
                raise HTTPException(status_code=422, detail="Plan due date cannot be after the renewal milestone")

    def _validate_action_due_date(self, plan: RetentionPlan, due_at: datetime) -> None:
        renewal_milestone = plan.renewal_milestone_at
        if renewal_milestone is None:
            renewal_dates = [milestone.due_at for milestone in plan.milestones if milestone.milestone_type == "renewal"]
            renewal_milestone = min(renewal_dates) if renewal_dates else None
        if renewal_milestone and self._aware(due_at) > self._aware(renewal_milestone):
            raise HTTPException(status_code=422, detail="Plan action due date cannot be after the renewal milestone")

    def _build_recommendations(
        self,
        account: Account,
        profile: AccountRetentionProfile | None,
        renewals: list[EngagementRenewalRead],
        missing: list[str],
    ) -> list[RetentionRecommendationRead]:
        recommendations: list[RetentionRecommendationRead] = []
        nearest_notice = min((item for item in renewals if item.days_to_notice is not None), key=lambda item: item.days_to_notice, default=None)
        critical = [item for item in renewals if item.renewal_risk == "critical"]
        weak_confidence = [item for item in renewals if item.confidence is None or item.confidence < 70]
        weak_metrics = [
            f"{label} {value}"
            for label, value in [
                ("overall health", account.health_overall),
                ("relationship health", account.health_relationship),
                ("usage health", account.health_usage),
                ("delivery health", account.health_delivery),
                ("commercial health", account.health_commercial),
            ]
            if value < 60
        ]
        renewal_signals = [signal for renewal in renewals for signal in self._signals_for_renewal(renewal)]
        signal_context = "; ".join(signal.headline for signal in renewal_signals[:3]) or "No near-term renewal signal"
        engagement_posture = "; ".join(f"{item.engagement_name or item.engagement_id}: {item.renewal_risk}" for item in renewals[:3]) or "No engagement renewal posture"
        account_stage = account.lifecycle_status or account.segment
        decision_context = (
            f"Stage: {account_stage}; weak metrics: {', '.join(weak_metrics) or 'none'}; "
            f"engagement posture: {engagement_posture}; signals: {signal_context}"
        )
        owner_id = profile.owner_id if profile else (renewals[0].owner_id if renewals else None)
        owner_name = profile.owner_name if profile else (renewals[0].owner_name if renewals else None)

        if nearest_notice and nearest_notice.days_to_notice is not None and nearest_notice.days_to_notice <= 45:
            signal_items = [signal.id for signal in renewal_signals if signal.engagement_id == nearest_notice.engagement_id][:2]
            recommendations.append(
                RetentionRecommendationRead(
                    id=f"notice-{nearest_notice.engagement_id}",
                    recommendation_type="notice_deadline",
                    title="Confirm renewal notice path",
                    rationale=f"{nearest_notice.engagement_name} has a notice deadline in {nearest_notice.days_to_notice} days and should be reviewed against current account posture.",
                    priority="critical" if nearest_notice.days_to_notice <= 14 else "high",
                    source_context=f"{nearest_notice.source_citation or nearest_notice.source_title or 'Renewal metadata'} | {decision_context}",
                    suggested_action="Validate notice requirements, decision owner, and client communication date.",
                    owner_id=nearest_notice.owner_id or owner_id,
                    owner_name=nearest_notice.owner_name or owner_name,
                    due_at=self._bounded_due_date(nearest_notice.notice_deadline, days_before=7),
                    confidence=nearest_notice.confidence or 60,
                    source_items=[nearest_notice.engagement_id, *signal_items],
                    required_inputs_missing=[],
                )
            )
        if critical:
            target = critical[0]
            signal_items = [signal.id for signal in renewal_signals if signal.engagement_id == target.engagement_id][:2]
            recommendations.append(
                RetentionRecommendationRead(
                    id=f"stabilize-{target.engagement_id}",
                    recommendation_type="stabilization",
                    title="Start stabilization plan",
                    rationale=f"{target.engagement_name} is marked critical for renewal risk with stage, weak metric, and signal context attached.",
                    priority="critical",
                    source_context=f"{target.source_citation or 'Computed renewal risk'} | {decision_context}",
                    suggested_action="Create a stabilization plan with success criteria tied to the next renewal milestone.",
                    owner_id=target.owner_id or owner_id,
                    owner_name=target.owner_name or owner_name,
                    due_at=self._bounded_due_date(target.notice_deadline or target.renewal_date, days_before=14),
                    confidence=target.confidence or 65,
                    source_items=[target.engagement_id, *signal_items],
                )
            )
        if weak_metrics:
            target = critical[0] if critical else (nearest_notice or (renewals[0] if renewals else None))
            recommendations.append(
                RetentionRecommendationRead(
                    id=f"weak-metrics-{account.id}",
                    recommendation_type="weak_metrics",
                    title="Stabilize weak account metrics",
                    rationale=f"{account.name} has weak retention metrics that can affect renewal confidence: {', '.join(weak_metrics)}.",
                    priority="high" if critical or account.risk_status == "critical" else "medium",
                    source_context=decision_context,
                    suggested_action="Open a retention plan action that names the weakest metric, owner, and success threshold before the renewal milestone.",
                    owner_id=owner_id,
                    owner_name=owner_name,
                    due_at=self._bounded_due_date((target.notice_deadline or target.renewal_date) if target else None, days_before=14),
                    confidence=75,
                    source_items=[account.id, *([target.engagement_id] if target else [])],
                )
            )
        if weak_confidence:
            target = weak_confidence[0]
            recommendations.append(
                RetentionRecommendationRead(
                    id=f"evidence-{target.engagement_id}",
                    recommendation_type="source_evidence",
                    title="Refresh renewal evidence",
                    rationale=f"{target.engagement_name} has weak or missing confidence for renewal terms.",
                    priority="medium",
                    source_context=f"{target.source_title or 'Renewal evidence'} | {decision_context}",
                    suggested_action="Attach the current SOW or cite the approved commercial source before plan approval.",
                    owner_id=target.owner_id or owner_id,
                    owner_name=target.owner_name or owner_name,
                    due_at=datetime.now(timezone.utc) + timedelta(days=7),
                    confidence=70,
                    source_items=[target.engagement_id],
                    required_inputs_missing=missing,
                )
            )
        if not recommendations:
            recommendations.append(
                RetentionRecommendationRead(
                    id=f"monitor-{account.id}",
                    recommendation_type="monitor",
                    title="Maintain retention readiness",
                    rationale="Renewal data is outside near-term risk windows.",
                    priority="low",
                    source_context="Account retention profile",
                    suggested_action="Review retention readiness during the next governance cadence.",
                    owner_id=owner_id,
                    owner_name=owner_name,
                    due_at=datetime.now(timezone.utc) + timedelta(days=30),
                    confidence=85,
                    source_items=[account.id],
                    required_inputs_missing=missing,
                )
            )
        return recommendations[:5]

    @staticmethod
    def _recommendation_missing_inputs(account: Account, profile: AccountRetentionProfile | None, renewals: list[EngagementRenewalRead]) -> list[str]:
        missing: list[str] = []
        if not renewals:
            missing.append("engagement renewals")
        if not any(item.renewal_date for item in renewals):
            missing.append("renewal date")
        if not any(item.notice_deadline for item in renewals):
            missing.append("notice deadline")
        if not any(item.source_citation for item in renewals) and not (profile and profile.source_citation) and not account.source_citation:
            missing.append("source citation")
        if profile is None and not any(item.confidence is not None for item in renewals):
            missing.append("confidence")
        return missing

    def _refresh_renewal_status(self, account: Account, engagement: Engagement, renewal: EngagementRenewal) -> None:
        renewal.renewal_risk = self._computed_risk(account, engagement, renewal.notice_deadline, renewal.renewal_date, renewal.confidence)
        renewal.readiness_status = self._computed_readiness(renewal)

    def _computed_risk(self, account: Account, engagement: Engagement, notice_deadline: datetime | None, renewal_date: datetime | None, confidence: int | None) -> str:
        notice_days = self._days_until(notice_deadline)
        renewal_days = self._days_until(renewal_date or engagement.end_date)
        if account.risk_status == "critical" or engagement.delivery_health < 60:
            return "critical"
        if renewal_days is not None and renewal_days < 0:
            return "critical"
        if notice_days is not None and notice_days <= 14:
            return "critical"
        if notice_days is not None and notice_days <= 60:
            return "warning"
        if renewal_days is not None and renewal_days <= 90:
            return "warning"
        if confidence is None or confidence < 65 or account.risk_status == "warning" or engagement.delivery_health < 75:
            return "warning"
        return "healthy"

    @staticmethod
    def _computed_readiness(renewal: EngagementRenewal) -> str:
        has_terms = bool(renewal.renewal_date and renewal.notice_deadline and renewal.owner_id)
        has_source = bool(renewal.confidence is not None and (renewal.source_citation or renewal.manual_override_reason))
        if not renewal.renewal_date and not renewal.notice_deadline:
            return "not_started"
        if renewal.renewal_risk == "critical":
            return "blocked"
        if has_terms and has_source and (renewal.confidence or 0) >= 75:
            return "ready"
        return "in_review"

    @staticmethod
    def _rollup_risk(renewals: list[EngagementRenewalRead]) -> str:
        risks = {item.renewal_risk for item in renewals}
        if "critical" in risks:
            return "critical"
        if "warning" in risks:
            return "warning"
        return "healthy"

    @staticmethod
    def _rollup_readiness(renewals: list[EngagementRenewalRead]) -> str:
        statuses = {item.readiness_status for item in renewals}
        if not statuses:
            return "not_started"
        if "blocked" in statuses:
            return "blocked"
        if statuses == {"ready"}:
            return "ready"
        if "not_started" in statuses and len(statuses) == 1:
            return "not_started"
        return "in_review"

    @staticmethod
    def _average_confidence(renewals: list[EngagementRenewalRead]) -> int | None:
        values = [item.confidence for item in renewals if item.confidence is not None]
        return round(sum(values) / len(values)) if values else None

    @staticmethod
    def _nearest_days(values: list[int | None]) -> int | None:
        present = [value for value in values if value is not None]
        if not present:
            return None
        future = [value for value in present if value >= 0]
        return min(future) if future else max(present)

    @staticmethod
    def _bounded_due_date(target: datetime | None, *, days_before: int) -> datetime:
        now = datetime.now(timezone.utc)
        if target is None:
            return now + timedelta(days=7)
        due_at = RetentionService._aware(target) - timedelta(days=days_before)
        return due_at if due_at > now else now + timedelta(days=1)

    @staticmethod
    def _days_until(value: datetime | None) -> int | None:
        if value is None:
            return None
        delta = RetentionService._aware(value) - datetime.now(timezone.utc)
        return delta.days

    @staticmethod
    def _aware(value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

    @staticmethod
    def _system_actor(account: Account) -> User:
        return User(id="system", email="system@local", full_name="System", role="super_admin", avatar_initials="SY")

    @staticmethod
    def _sync_engagement_field(engagement: Engagement, field: str, value: Any) -> None:
        field_map = {"sow_start_date": "start_date", "sow_end_date": "end_date"}
        setattr(engagement, field_map.get(field, field), value)

    def _log_change(
        self,
        *,
        account: Account,
        actor: User,
        action: str,
        entity_type: str,
        entity_id: str,
        title: str,
        description: str,
        before: dict | None,
        after: dict | None,
        engagement_id: str | None = None,
        route: str | None = None,
    ) -> None:
        self.audit.log(
            module=RETENTION_MODULE,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor=actor,
            before_value=before,
            after_value=after,
        )
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement_id,
            event_type="retention",
            module=RETENTION_MODULE,
            title=title,
            description=description,
            actor=actor,
            source_record_id=entity_id,
            source_record_type=entity_type,
            source_record_route=route or f"/accounts/{account.id}?tab=retention",
            before_value=before,
            after_value=after,
        )

    @staticmethod
    def _profile_snapshot(profile: AccountRetentionProfile) -> dict[str, Any]:
        return RetentionService._snapshot(
            profile,
            [
                "readiness_status",
                "renewal_risk",
                "owner_id",
                "owner_name",
                "commercial_exposure",
                "currency",
                "confidence",
                "source_kind",
                "source_title",
                "source_citation",
                "manual_override_reason",
                "notes",
            ],
        )

    @staticmethod
    def _renewal_snapshot(engagement: Engagement, renewal: EngagementRenewal) -> dict[str, Any]:
        snapshot = RetentionService._snapshot(
            renewal,
            [
                "owner_id",
                "owner_name",
                "readiness_status",
                "renewal_risk",
                "sow_start_date",
                "sow_end_date",
                "renewal_date",
                "notice_deadline",
                "notice_period_days",
                "auto_renewal",
                "commercial_exposure",
                "currency",
                "confidence",
                "source_kind",
                "source_title",
                "source_document_id",
                "source_citation",
                "manual_override_reason",
            ],
        )
        snapshot["engagement_name"] = engagement.name
        return snapshot

    @staticmethod
    def _plan_snapshot(plan: RetentionPlan) -> dict[str, Any]:
        return RetentionService._snapshot(
            plan,
            [
                "title",
                "plan_type",
                "status",
                "risk_level",
                "owner_id",
                "owner_name",
                "due_at",
                "renewal_milestone_at",
                "success_criteria",
                "recommendation_context",
            ],
        )

    @staticmethod
    def _action_snapshot(action: RetentionPlanAction) -> dict[str, Any]:
        return RetentionService._snapshot(
            action,
            ["title", "owner_id", "owner_name", "due_at", "status", "success_criteria", "source_recommendation_id", "completed_at", "completed_by_id"],
        )

    @staticmethod
    def _snapshot(model: Any, fields: list[str]) -> dict[str, Any]:
        return {field: RetentionService._json_value(getattr(model, field)) for field in fields}

    @staticmethod
    def _json_value(value: Any) -> Any:
        if isinstance(value, datetime):
            return RetentionService._aware(value).isoformat()
        if hasattr(value, "__float__") and value.__class__.__module__ == "decimal":
            return float(value)
        return value

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
