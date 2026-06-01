from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_stakeholder_gap_service, get_stakeholder_service
from app.models import User
from app.schemas import (
    MessageResponse,
    StakeholderCoverageGapRead,
    StakeholderCreateRequest,
    StakeholderInteractionCreateRequest,
    StakeholderInteractionPageRead,
    StakeholderInteractionRead,
    StakeholderOrgChartRead,
    StakeholderPageRead,
    StakeholderPoliticalRisk,
    StakeholderRead,
    StakeholderRole,
    StakeholderSentiment,
    StakeholderStatus,
    StakeholderUpdateRequest,
)
from app.services.stakeholder_gap_service import StakeholderGapService
from app.services.stakeholders import StakeholderService

router = APIRouter(prefix="/api", tags=["Stakeholder Relationships"])


@router.get(
    "/accounts/{account_id}/stakeholders",
    response_model=StakeholderPageRead,
    summary="List account stakeholders",
    description="Returns account-scoped stakeholder records with engagement, role, sentiment, political-risk, status, and search filters.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
        422: {"description": "Invalid pagination or filter query parameters."},
    },
)
def list_stakeholders(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
    engagement_id: Annotated[str | None, Query(description="Filter by linked engagement ID.")] = None,
    role: Annotated[StakeholderRole | None, Query(description="Filter by stakeholder role.")] = None,
    sentiment: Annotated[StakeholderSentiment | None, Query(description="Filter by sentiment.")] = None,
    political_risk: Annotated[StakeholderPoliticalRisk | None, Query(description="Filter by political risk.")] = None,
    status_filter: Annotated[StakeholderStatus | None, Query(alias="status", description="Filter by stakeholder status.")] = None,
    search: Annotated[str | None, Query(description="Search name, title, company, or email.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> StakeholderPageRead:
    return service.list_for_account(
        account_id,
        current_user,
        engagement_id=engagement_id,
        role=role,
        sentiment=sentiment,
        political_risk=political_risk,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/accounts/{account_id}/stakeholders",
    response_model=StakeholderRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create account stakeholder",
    description="Creates an account-scoped stakeholder, validates optional engagement and reporting hierarchy links, and emits stakeholder timeline/audit events.",
    responses={
        400: {"description": "Linked engagement or reporting stakeholder is invalid for this account."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account or module."},
        404: {"description": "Account, engagement, or reporting stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_stakeholder(
    account_id: str,
    payload: StakeholderCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.create(account_id, payload, current_user)


@router.get(
    "/accounts/{account_id}/stakeholders/coverage-gaps",
    response_model=list[StakeholderCoverageGapRead],
    summary="List stakeholder coverage gaps",
    description="Returns deterministic stakeholder coverage gaps for an account with account-level RBAC applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
    },
)
def list_stakeholder_coverage_gaps(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderGapService, Depends(get_stakeholder_gap_service)],
) -> list[StakeholderCoverageGapRead]:
    return service.list_for_account(account_id, current_user)


@router.post(
    "/accounts/{account_id}/stakeholders/recalculate-coverage-gaps",
    response_model=list[StakeholderCoverageGapRead],
    summary="Recalculate stakeholder coverage gaps",
    description="Runs deterministic stakeholder coverage rules, resolves stale gaps, and returns the current gap state.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account or module."},
        404: {"description": "Account was not found."},
    },
)
def recalculate_stakeholder_coverage_gaps(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderGapService, Depends(get_stakeholder_gap_service)],
) -> list[StakeholderCoverageGapRead]:
    return service.recalculate(account_id, current_user)


@router.get(
    "/accounts/{account_id}/stakeholders/org-chart",
    response_model=StakeholderOrgChartRead,
    summary="Read stakeholder org chart",
    description="Returns graph-friendly stakeholder nodes and hierarchy edges using reports_to links, with unmapped stakeholders grouped under a synthetic root node.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
    },
)
def read_stakeholder_org_chart(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderOrgChartRead:
    return service.org_chart(account_id, current_user)


@router.get(
    "/stakeholders/{stakeholder_id}",
    response_model=StakeholderRead,
    summary="Read stakeholder",
    description="Returns a single stakeholder with account-level RBAC and sensitive-field redaction applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this stakeholder."},
        404: {"description": "Stakeholder was not found."},
    },
)
def read_stakeholder(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.get(stakeholder_id, current_user)


@router.get(
    "/stakeholders/{stakeholder_id}/interactions",
    response_model=StakeholderInteractionPageRead,
    summary="List stakeholder interactions",
    description="Returns interaction history for a stakeholder with account-level RBAC and sensitive-field redaction applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this stakeholder."},
        404: {"description": "Stakeholder was not found."},
        422: {"description": "Invalid pagination query parameters."},
    },
)
def list_stakeholder_interactions(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> StakeholderInteractionPageRead:
    return service.list_interactions(stakeholder_id, current_user, page=page, page_size=page_size)


@router.post(
    "/stakeholders/{stakeholder_id}/interactions",
    response_model=StakeholderInteractionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create stakeholder interaction",
    description="Logs a stakeholder interaction, updates last interaction and optional relationship fields, and emits a stakeholder_interaction_added timeline event.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this stakeholder."},
        404: {"description": "Stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_stakeholder_interaction(
    stakeholder_id: str,
    payload: StakeholderInteractionCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderInteractionRead:
    return service.create_interaction(stakeholder_id, payload, current_user)


@router.patch(
    "/stakeholders/{stakeholder_id}",
    response_model=StakeholderRead,
    summary="Update stakeholder",
    description="Updates stakeholder profile and relationship attributes. Material relationship updates emit an additional relationship_changed timeline event.",
    responses={
        400: {"description": "Linked engagement or reporting hierarchy is invalid."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this stakeholder."},
        404: {"description": "Stakeholder, engagement, or reporting stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_stakeholder(
    stakeholder_id: str,
    payload: StakeholderUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.update(stakeholder_id, payload, current_user)


@router.delete(
    "/stakeholders/{stakeholder_id}",
    response_model=MessageResponse,
    summary="Archive stakeholder",
    description="Soft-archives a stakeholder and emits stakeholder_archived timeline/audit events. Historical timeline/audit records remain intact.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot archive this stakeholder."},
        404: {"description": "Stakeholder was not found."},
    },
)
def delete_stakeholder(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> MessageResponse:
    return service.delete(stakeholder_id, current_user)
