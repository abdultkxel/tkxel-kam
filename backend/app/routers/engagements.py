from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_engagement_service, get_rbac_service, require_permission
from app.models import Engagement, User
from app.schemas import (
    AccountHealthRollupRead,
    EngagementCreateRequest,
    EngagementHealthRead,
    EngagementPageRead,
    EngagementRead,
    EngagementUpdateRequest,
    MessageResponse,
)
from app.services.engagements import EngagementService
from app.services.rbac import RbacService

ENGAGEMENT_MODULE = "engagement_sow_management"

EngagementView = Annotated[User, Depends(require_permission(ENGAGEMENT_MODULE, "view"))]
EngagementCreate = Annotated[User, Depends(require_permission(ENGAGEMENT_MODULE, "create"))]
EngagementUpdate = Annotated[User, Depends(require_permission(ENGAGEMENT_MODULE, "update"))]
SortField = Literal["renewal_date", "end_date", "value", "delivery_status", "updated_date"]
SortDirection = Literal["asc", "desc"]
RenewalWindow = Literal["all", "expired", "next_30", "next_60", "next_90"]
ContributionSortField = Literal["score", "risk", "freshness", "value"]

router = APIRouter(prefix="/api", tags=["Engagement/SOW"])


def require_engagement_delete_permission(
    current_user: Annotated[User, Depends(get_current_user)],
    rbac: Annotated[RbacService, Depends(get_rbac_service)],
) -> User:
    if current_user.role in {"kam_head", "admin", "super_admin"}:
        return current_user
    if rbac.user_has_permission(current_user, ENGAGEMENT_MODULE, "delete"):
        return current_user
    from fastapi import HTTPException

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to archive engagements")


@router.get(
    "/accounts/{account_id}/engagements",
    response_model=EngagementPageRead,
    summary="List account engagements",
    description=(
        "Returns paginated Engagement/SOW records under an account. Supports filtering by engagement status, owner, "
        "service line, renewal window, and risk status; search by engagement name, SOW title, or service line; and "
        "sorting by renewal date, end date, value, delivery status, or updated date."
    ),
    response_description="Paginated engagement records for the account.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement view permission."},
        422: {"description": "Invalid pagination, filter, or sorting query parameters."},
    },
)
def list_account_engagements(
    account_id: str,
    _: EngagementView,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by engagement status.")] = None,
    owner: Annotated[str | None, Query(description="Filter by owner id or owner name.")] = None,
    service_line: Annotated[str | None, Query(description="Filter by a service line.")] = None,
    renewal_window: Annotated[RenewalWindow, Query(description="Filter by upcoming or expired renewal window.")] = "all",
    risk_status: Annotated[str | None, Query(description="Filter by derived risk status: healthy, warning, or critical.")] = None,
    search: Annotated[str | None, Query(description="Search engagement name, SOW title, and service line.")] = None,
    sort_by: Annotated[SortField, Query(description="Sort field.")] = "updated_date",
    sort_dir: Annotated[SortDirection, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> EngagementPageRead:
    return service.list_account_engagements(account_id, status_filter, owner, service_line, renewal_window, risk_status, search, sort_by, sort_dir, page, page_size)


@router.post(
    "/accounts/{account_id}/engagements",
    response_model=EngagementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account engagement",
    description=(
        "Creates an approved or manually-entered Engagement/SOW record under the account. Required fields include "
        "account, engagement name, owner, start date, delivery status, and at least one service line. Date, notice, "
        "value, and configured-currency validation is enforced before persistence."
    ),
    response_description="Created engagement record.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement create permission."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_account_engagement(
    account_id: str,
    payload: EngagementCreateRequest,
    _: EngagementCreate,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> Engagement:
    return service.create_engagement(account_id, payload)


@router.get(
    "/engagements/{engagement_id}",
    response_model=EngagementRead,
    summary="Read an engagement",
    description="Returns one Engagement/SOW record for Engagement 360 profile, evidence, commercial, renewal, risk, and delivery sections.",
    response_description="Engagement record detail.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement view permission."},
        404: {"description": "Engagement was not found or is archived."},
    },
)
def read_engagement(
    engagement_id: str,
    _: EngagementView,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> Engagement:
    return service.get_engagement(engagement_id)


@router.patch(
    "/engagements/{engagement_id}",
    response_model=EngagementRead,
    summary="Update an engagement",
    description="Updates Engagement/SOW profile, source links, renewal terms, owner, delivery status, service lines, value, and risk context.",
    response_description="Updated engagement record.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement update permission."},
        404: {"description": "Engagement was not found or is archived."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_engagement(
    engagement_id: str,
    payload: EngagementUpdateRequest,
    _: EngagementUpdate,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> Engagement:
    return service.update_engagement(engagement_id, payload)


@router.delete(
    "/engagements/{engagement_id}",
    response_model=MessageResponse,
    summary="Archive an engagement",
    description="Archives an Engagement/SOW record. Archive/delete is limited to KAM Head, Admin, Super Admin, or a configured role with delete permission.",
    response_description="Engagement archive confirmation message.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement archive permission."},
        404: {"description": "Engagement was not found or is archived."},
    },
)
def archive_engagement(
    engagement_id: str,
    _: Annotated[User, Depends(require_engagement_delete_permission)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> MessageResponse:
    return service.archive_engagement(engagement_id)


@router.get(
    "/engagements/{engagement_id}/health",
    response_model=EngagementHealthRead,
    summary="Read engagement health",
    description="Returns the latest engagement health score, RAG status, drivers, freshness, dirty flag, formula version, and contribution to Account Health.",
    response_description="Engagement health detail.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement view permission."},
        404: {"description": "Engagement was not found or is archived."},
    },
)
def read_engagement_health(
    engagement_id: str,
    _: EngagementView,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementHealthRead:
    return service.get_health(engagement_id)


@router.post(
    "/engagements/{engagement_id}/health/recalculate",
    response_model=EngagementHealthRead,
    summary="Recalculate engagement health",
    description=(
        "Recalculates engagement health using the published metric configuration. Draft or stale-source records are "
        "marked dirty instead of silently contributing to Account Health."
    ),
    response_description="Recalculated engagement health detail.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement update permission."},
        404: {"description": "Engagement was not found or is archived."},
        422: {"description": "Published metric configuration or required source data is invalid."},
    },
)
def recalculate_engagement_health(
    engagement_id: str,
    _: EngagementUpdate,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementHealthRead:
    return service.recalculate_health(engagement_id)


@router.get(
    "/accounts/{account_id}/health/rollup",
    response_model=AccountHealthRollupRead,
    summary="Read account health rollup",
    description=(
        "Returns Account Health rollup from engagement contributions. Active, renewal-watch, and at-risk engagements "
        "with clean health scores contribute by value weighting. Historical rollup snapshots are preserved and "
        "paginated newest first so formula changes do not rewrite prior values."
    ),
    response_description="Account health rollup with engagement contributions and historical snapshots.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have engagement health view permission."},
        422: {"description": "Invalid pagination, filter, or sorting query parameters."},
    },
)
def read_account_health_rollup(
    account_id: str,
    _: EngagementView,
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    sort_by: Annotated[ContributionSortField, Query(description="Sort engagement contribution by score, risk, freshness, or value.")] = "score",
    rag_status: Annotated[str | None, Query(description="Filter contribution by RAG status.")] = None,
    dirty: Annotated[bool | None, Query(description="Filter dirty or clean contribution rows.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based snapshot page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of snapshots per page.")] = 10,
) -> AccountHealthRollupRead:
    return service.get_account_health_rollup(account_id, sort_by, rag_status, dirty, page, page_size)
