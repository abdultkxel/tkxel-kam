from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_account_planning_service, get_current_user
from app.models import User
from app.schemas import AccountPlanRead, AccountPlanUpsertRequest, AccountPlanVersionPageRead
from app.services.account_planning import AccountPlanningService

router = APIRouter(prefix="/api/accounts/{account_id}", tags=["Account Planning, Whitespace, and Service Catalog"])


@router.get(
    "/plan",
    response_model=AccountPlanRead | None,
    summary="Read account plan",
    description="Returns the account plan with actions and account-scoped authorization applied.",
)
def read_account_plan(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AccountPlanningService, Depends(get_account_planning_service)]) -> AccountPlanRead | None:
    return service.get_plan(account_id, current_user)


@router.put(
    "/plan",
    response_model=AccountPlanRead,
    summary="Upsert account plan",
    description="Creates or updates the account plan, replaces next actions, preserves a version snapshot, and writes audit/timeline entries.",
)
def upsert_account_plan(account_id: str, payload: AccountPlanUpsertRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AccountPlanningService, Depends(get_account_planning_service)]) -> AccountPlanRead:
    return service.upsert_plan(account_id, payload, current_user)


@router.get(
    "/plan/history",
    response_model=AccountPlanVersionPageRead,
    summary="List account plan history",
    description="Returns paginated immutable account plan version snapshots with actor and change summary.",
)
def list_account_plan_history(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountPlanningService, Depends(get_account_planning_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AccountPlanVersionPageRead:
    return service.list_history(account_id, current_user, page, page_size)
