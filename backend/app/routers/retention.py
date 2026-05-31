from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_retention_service
from app.models import User
from app.schemas import (
    AccountRetentionRead,
    AccountRetentionUpdateRequest,
    EngagementRenewalRead,
    EngagementRenewalUpdateRequest,
    PortfolioRenewalPageRead,
    RetentionCalendarItemRead,
    RetentionPortfolioReportRead,
    RetentionPortfolioTaskPageRead,
    RetentionPlanActionCreateRequest,
    RetentionPlanActionPageRead,
    RetentionPlanActionRead,
    RetentionPlanActionUpdateRequest,
    RetentionPlanCreateRequest,
    RetentionPlanPageRead,
    RetentionPlanRead,
    RetentionPlanUpdateRequest,
    RetentionRecommendationResponse,
    RetentionSignalPageRead,
)
from app.services.retention import RetentionService

RenewalWindow = Literal["next_30", "next_60", "next_90", "expired", "missing"]
RiskFilter = Literal["healthy", "warning", "critical"]
SourceKindFilter = Literal["manual", "sow", "extracted", "imported"]
RenewalSort = Literal["nearest_notice", "nearest_renewal", "risk", "commercial_exposure", "updated"]
PlanSort = Literal["due_date", "risk", "updated"]
SortDirection = Literal["asc", "desc"]

RETENTION_API_RESPONSES = {
    400: {"description": "Business-rule validation failed."},
    403: {"description": "The current user is not authorized for this retention action or account."},
    404: {"description": "The requested account, engagement, plan, or action was not found."},
    422: {"description": "Request validation failed."},
}

router = APIRouter(tags=["Retention And Account Stability"], responses=RETENTION_API_RESPONSES)


@router.get("/api/accounts/{account_id}/retention", response_model=AccountRetentionRead)
def get_account_retention(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> AccountRetentionRead:
    """Return account-level retention readiness, renewal rollup, risk, citations, and renewal rows."""
    return service.get_account_retention(account_id, current_user)


@router.patch("/api/accounts/{account_id}/retention", response_model=AccountRetentionRead)
def update_account_retention(
    account_id: str,
    payload: AccountRetentionUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> AccountRetentionRead:
    """Update account retention readiness fields with RBAC, account access, validation, audit, and timeline writes."""
    return service.update_account_retention(account_id, payload, current_user)


@router.get("/api/engagements/{engagement_id}/renewal", response_model=EngagementRenewalRead)
def get_engagement_renewal(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> EngagementRenewalRead:
    """Return renewal intelligence for one engagement, synthesizing current engagement terms when needed."""
    return service.get_engagement_renewal(engagement_id, current_user)


@router.patch("/api/engagements/{engagement_id}/renewal", response_model=EngagementRenewalRead)
def update_engagement_renewal(
    engagement_id: str,
    payload: EngagementRenewalUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> EngagementRenewalRead:
    """Update engagement renewal terms with source/citation validation, RBAC checks, audit, and timeline writes."""
    return service.update_engagement_renewal(engagement_id, payload, current_user)


@router.get("/api/retention/renewals", response_model=PortfolioRenewalPageRead)
def list_portfolio_renewals(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    search: str | None = Query(default=None, max_length=120),
    renewal_window: RenewalWindow | None = None,
    notice_window: RenewalWindow | None = None,
    renewal_risk: RiskFilter | None = None,
    owner_id: str | None = None,
    confidence_min: int | None = Query(default=None, ge=0, le=100),
    confidence_max: int | None = Query(default=None, ge=0, le=100),
    auto_renewal: bool | None = None,
    source_kind: SourceKindFilter | None = None,
    exposure_min: float | None = Query(default=None, ge=0),
    exposure_max: float | None = Query(default=None, ge=0),
    sort: RenewalSort = "nearest_notice",
    direction: SortDirection = "asc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> PortfolioRenewalPageRead:
    """List authorized portfolio renewals with search, filters, sorting, and pagination."""
    return service.list_portfolio_renewals(
        current_user,
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


@router.get("/api/retention/tasks", response_model=RetentionPortfolioTaskPageRead)
def list_retention_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    status_filter: Literal["todo", "in_progress", "done", "blocked", "cancelled"] | None = None,
    owner_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> RetentionPortfolioTaskPageRead:
    """List retention-scoped plan actions and generated notice-window tasks for authorized accounts."""
    return service.list_portfolio_tasks(current_user, status_filter=status_filter, owner_id=owner_id, page=page, page_size=page_size)


@router.get("/api/retention/signals", response_model=RetentionSignalPageRead)
def list_retention_signals(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> RetentionSignalPageRead:
    """List generated renewal risk, notice-window, and SOW-expiry signals for authorized accounts."""
    return service.list_retention_signals(current_user, page=page, page_size=page_size)


@router.get("/api/retention/calendar-items", response_model=list[RetentionCalendarItemRead])
def list_retention_calendar_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[RetentionCalendarItemRead]:
    """List retention calendar context including notice deadlines, renewal dates, milestones, and plan actions."""
    return service.list_calendar_items(current_user, date_from=date_from, date_to=date_to)


@router.get("/api/retention/reports/portfolio", response_model=RetentionPortfolioReportRead)
def retention_portfolio_report(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionPortfolioReportRead:
    """Return authorized portfolio retention metrics for renewals, signals, exposure, and open actions."""
    return service.portfolio_report(current_user)


@router.get("/api/accounts/{account_id}/retention-plans", response_model=RetentionPlanPageRead)
def list_retention_plans(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    search: str | None = Query(default=None, max_length=120),
    plan_type: Literal["retention", "renewal", "stabilization"] | None = None,
    status_filter: Literal["draft", "active", "completed", "archived"] | None = None,
    owner_id: str | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    milestone_from: datetime | None = None,
    milestone_to: datetime | None = None,
    sort: PlanSort = "due_date",
    direction: SortDirection = "asc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> RetentionPlanPageRead:
    """List account retention, renewal, and stabilization plans with search, filters, sorting, and pagination."""
    return service.list_plans(
        account_id,
        current_user,
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


@router.post("/api/accounts/{account_id}/retention-plans", response_model=RetentionPlanRead, status_code=201)
def create_retention_plan(
    account_id: str,
    payload: RetentionPlanCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionPlanRead:
    """Create a retention, renewal, or stabilization plan with milestones, actions, success criteria, and custom fields."""
    return service.create_plan(account_id, payload, current_user)


@router.patch("/api/retention-plans/{plan_id}", response_model=RetentionPlanRead)
def update_retention_plan(
    plan_id: str,
    payload: RetentionPlanUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionPlanRead:
    """Update a retention plan with authorization, milestone validation, audit, and timeline writes."""
    return service.update_plan(plan_id, payload, current_user)


@router.get("/api/retention-plans/{plan_id}/actions", response_model=RetentionPlanActionPageRead)
def list_retention_plan_actions(
    plan_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> RetentionPlanActionPageRead:
    """List paginated actions for a retention plan."""
    return service.list_plan_actions(plan_id, current_user, page=page, page_size=page_size)


@router.post("/api/retention-plans/{plan_id}/tasks", response_model=RetentionPlanActionRead, status_code=201)
def create_retention_plan_task(
    plan_id: str,
    payload: RetentionPlanActionCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionPlanActionRead:
    """Create a user-confirmed task-like retention plan action from a recommendation or manual action."""
    return service.create_plan_task(plan_id, payload, current_user)


@router.patch("/api/retention-plan-actions/{action_id}", response_model=RetentionPlanActionRead)
def update_retention_plan_action(
    action_id: str,
    payload: RetentionPlanActionUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionPlanActionRead:
    """Update a retention plan action and capture completion audit/timeline evidence when it is done."""
    return service.update_plan_action(action_id, payload, current_user)


@router.get("/api/accounts/{account_id}/retention-recommendations", response_model=RetentionRecommendationResponse)
def get_retention_recommendations(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
) -> RetentionRecommendationResponse:
    """Generate deterministic retention recommendations with rationale, source context, and missing-input flags."""
    return service.recommendations(account_id, current_user)
