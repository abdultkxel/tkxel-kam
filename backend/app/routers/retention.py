from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_retention_service
from app.models import User
from app.schemas import (
    RenewalProfilePageRead,
    RenewalProfileRead,
    RenewalProfileUpdateRequest,
    RetentionPlanCreateRequest,
    RetentionPlanPageRead,
    RetentionPlanRead,
    RetentionPlanUpdateRequest,
    RetentionRecommendationRead,
    RetentionRecommendationTaskCreateRequest,
    TaskRead,
)
from app.services.retention import RetentionService

Direction = Literal["asc", "desc"]
RenewalSort = Literal["notice_deadline", "renewal_date", "risk", "commercial_exposure"]
PlanSort = Literal["updated_at", "due_date", "status"]

router = APIRouter(prefix="/api", tags=["Retention and Account Stability"])


@router.get(
    "/renewals",
    response_model=RenewalProfilePageRead,
    summary="List portfolio renewals",
    description="Paginated renewal intelligence list with account authorization, search, filters, sorting, notice windows, risk, exposure, and source context.",
)
def list_renewals(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    account_id: str | None = None,
    risk: str | None = None,
    owner_id: str | None = None,
    confidence_min: Annotated[int | None, Query(ge=0, le=100)] = None,
    auto_renewal: bool | None = None,
    notice_from: datetime | None = None,
    notice_to: datetime | None = None,
    renewal_from: datetime | None = None,
    renewal_to: datetime | None = None,
    search: str | None = None,
    sort: RenewalSort = "notice_deadline",
    direction: Direction = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> RenewalProfilePageRead:
    return service.list_renewals(current_user, account_id=account_id, risk=risk, owner_id=owner_id, confidence_min=confidence_min, auto_renewal=auto_renewal, notice_from=notice_from, notice_to=notice_to, renewal_from=renewal_from, renewal_to=renewal_to, search=search, sort=sort, direction=direction, page=page, page_size=page_size)


@router.get(
    "/accounts/{account_id}/retention",
    response_model=RenewalProfilePageRead,
    summary="Read account retention summary",
    description="Returns renewal profiles for engagements under an account so Account Overview can show renewal readiness and stale/commercial context.",
)
def read_account_retention(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RenewalProfilePageRead:
    return service.list_account_retention(account_id, current_user)


@router.patch(
    "/accounts/{account_id}/retention",
    response_model=RenewalProfilePageRead,
    summary="Refresh account retention summary",
    description="Returns refreshed deterministic retention recommendations and renewal profiles for account context.",
)
def refresh_account_retention(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RenewalProfilePageRead:
    return service.list_account_retention(account_id, current_user)


@router.get(
    "/engagements/{engagement_id}/renewal",
    response_model=RenewalProfileRead,
    summary="Read engagement renewal intelligence",
    description="Returns engagement renewal readiness, risk, SOW dates, notice deadline, source citation, confidence, and manual override context.",
)
def read_engagement_renewal(engagement_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RenewalProfileRead:
    return service.get_engagement_renewal(engagement_id, current_user)


@router.patch(
    "/engagements/{engagement_id}/renewal",
    response_model=RenewalProfileRead,
    summary="Update engagement renewal intelligence",
    description="Updates renewal/commercial context with validation for notice dates, manual overrides, source provenance, audit, and timeline.",
)
def update_engagement_renewal(engagement_id: str, payload: RenewalProfileUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RenewalProfileRead:
    return service.update_engagement_renewal(engagement_id, payload, current_user)


@router.get(
    "/accounts/{account_id}/retention-plans",
    response_model=RetentionPlanPageRead,
    summary="List account retention plans",
    description="Paginated account retention, renewal, and stabilization plans with filters and sort.",
)
def list_retention_plans(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RetentionService, Depends(get_retention_service)],
    plan_type: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    owner_id: str | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    search: str | None = None,
    sort: PlanSort = "updated_at",
    direction: Direction = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> RetentionPlanPageRead:
    return service.list_plans(account_id, current_user, plan_type=plan_type, status_filter=status_filter, owner_id=owner_id, due_from=due_from, due_to=due_to, search=search, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post(
    "/accounts/{account_id}/retention-plans",
    response_model=RetentionPlanRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create retention plan",
    description="Creates a retention, renewal, or stabilization plan with milestones, actions, owners, success criteria, audit, and timeline.",
)
def create_retention_plan(account_id: str, payload: RetentionPlanCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RetentionPlanRead:
    return service.create_plan(account_id, payload, current_user)


@router.patch(
    "/retention-plans/{plan_id}",
    response_model=RetentionPlanRead,
    summary="Update retention plan",
    description="Updates retention plan metadata, milestones, actions, due-date validation, audit, and timeline.",
)
def update_retention_plan(plan_id: str, payload: RetentionPlanUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> RetentionPlanRead:
    return service.update_plan(plan_id, payload, current_user)


@router.post(
    "/retention-plans/{plan_id}/tasks",
    response_model=list[TaskRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create tasks from retention recommendations",
    description="Creates first-class tasks only after selected recommendation IDs and explicit confirmation are submitted.",
)
def create_retention_tasks(plan_id: str, payload: RetentionRecommendationTaskCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> list[TaskRead]:
    return service.create_tasks_from_recommendations(plan_id, payload, current_user)


@router.get(
    "/accounts/{account_id}/retention-recommendations",
    response_model=list[RetentionRecommendationRead],
    summary="List account retention recommendations",
    description="Returns deterministic retention recommendations with rationale from renewal windows, delivery health, risk, and account posture.",
)
def list_retention_recommendations(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[RetentionService, Depends(get_retention_service)]) -> list[RetentionRecommendationRead]:
    return service.list_recommendations(account_id, current_user)
