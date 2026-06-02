from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_account_planning_service, get_current_user
from app.models import User
from app.schemas import AccountPlanRead, AccountPlanUpsertRequest, AccountPlanVersionPageRead
from app.services.account_planning import AccountPlanActionFilters, AccountPlanningService

router = APIRouter(prefix="/api/accounts/{account_id}", tags=["Account Planning, Whitespace, and Service Catalog"])
Direction = Literal["asc", "desc"]
ActionSort = Literal["due_at", "priority", "status", "owner", "created_at"]
ACCOUNT_PLAN_RESPONSES = {
    401: {"description": "Authentication is required."},
    403: {"description": "The user does not have account planning access for this account."},
    404: {"description": "The account or related record was not found."},
    422: {"description": "Validation errors keyed by field."},
}


@router.get(
    "/plan",
    response_model=AccountPlanRead | None,
    summary="Read account plan",
    description="Returns the account plan with actions and account-scoped authorization applied.",
    response_description="The account plan, including filtered/sorted next actions, or null when no plan exists.",
    responses=ACCOUNT_PLAN_RESPONSES,
)
def read_account_plan(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountPlanningService, Depends(get_account_planning_service)],
    action_search: str | None = None,
    action_owner_id: str | None = None,
    action_status: str | None = None,
    action_priority: str | None = None,
    action_due_from: datetime | None = None,
    action_due_to: datetime | None = None,
    action_sort: ActionSort = "due_at",
    action_direction: Direction = "asc",
) -> AccountPlanRead | None:
    return service.get_plan(
        account_id,
        current_user,
        action_filters=AccountPlanActionFilters(
            search=action_search,
            owner_id=action_owner_id,
            status=action_status,
            priority=action_priority,
            due_from=action_due_from,
            due_to=action_due_to,
            sort=action_sort,
            direction=action_direction,
        ),
    )


@router.put(
    "/plan",
    response_model=AccountPlanRead,
    summary="Upsert account plan",
    description="Creates or updates the account plan, replaces next actions, preserves a version snapshot, and writes audit/timeline entries.",
    response_description="The saved account plan with current next actions.",
    responses=ACCOUNT_PLAN_RESPONSES | {400: {"description": "Archived accounts are read-only."}},
)
def upsert_account_plan(account_id: str, payload: AccountPlanUpsertRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AccountPlanningService, Depends(get_account_planning_service)]) -> AccountPlanRead:
    return service.upsert_plan(account_id, payload, current_user)


@router.get(
    "/plan/history",
    response_model=AccountPlanVersionPageRead,
    summary="List account plan history",
    description="Returns paginated immutable account plan version snapshots with actor and change summary.",
    response_description="A paginated list of account plan version snapshots.",
    responses=ACCOUNT_PLAN_RESPONSES,
)
def list_account_plan_history(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountPlanningService, Depends(get_account_planning_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AccountPlanVersionPageRead:
    return service.list_history(account_id, current_user, page, page_size)
