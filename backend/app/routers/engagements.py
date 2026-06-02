from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_engagement_service
from app.models import User
from app.schemas import (
    EngagementHealthPageRead,
    EngagementHealthRead,
    EngagementRead,
    EngagementUpdateRequest,
    MessageResponse,
    TimelineEventPageRead,
)
from app.services.engagements import EngagementService

router = APIRouter(prefix="/api/engagements", tags=["Engagement 360"])


@router.get(
    "/{engagement_id}",
    response_model=EngagementRead,
    summary="Read engagement",
    description="Returns Engagement 360 profile, commercial, renewal, risk, ownership, and source evidence fields.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this engagement."},
        404: {"description": "Engagement was not found."},
    },
)
def read_engagement(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementRead:
    return service.get_engagement(engagement_id, current_user)


@router.get(
    "/{engagement_id}/summary",
    response_model=dict[str, Any],
    summary="Read engagement summary",
    description="Returns Engagement/SOW summary fields used by Account Overview and Engagement 360.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this engagement summary."},
        404: {"description": "Engagement was not found."},
    },
)
def read_engagement_summary(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> dict[str, Any]:
    return service.get_engagement_summary(engagement_id, current_user)


@router.patch(
    "/{engagement_id}",
    response_model=EngagementRead,
    summary="Update engagement",
    description="Updates Engagement/SOW fields with date, value, owner, service line, risk, and delivery-health validation.",
    responses={
        400: {"description": "Selected owner is inactive or ineligible."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this engagement."},
        404: {"description": "Engagement was not found."},
        422: {"description": "Field-level validation errors or invalid SOW date sequence."},
    },
)
def update_engagement(
    engagement_id: str,
    payload: EngagementUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementRead:
    return service.update_engagement(engagement_id, payload, current_user)


@router.delete(
    "/{engagement_id}",
    response_model=MessageResponse,
    summary="Archive engagement",
    description="Archives an engagement instead of hard-deleting it, preserving audit and historical health snapshots.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot archive this engagement."},
        404: {"description": "Engagement was not found."},
    },
)
def archive_engagement(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> MessageResponse:
    return service.archive_engagement(engagement_id, current_user)


@router.get(
    "/{engagement_id}/timeline",
    response_model=TimelineEventPageRead,
    summary="List engagement timeline",
    description="Returns source-linked Engagement/SOW timeline events newest-first.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this engagement timeline."},
        404: {"description": "Engagement was not found."},
    },
)
def list_timeline(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    show_sensitive: Annotated[bool, Query(description="Request sensitive entries where caller is authorized.")] = False,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of timeline events per page.")] = 100,
) -> TimelineEventPageRead:
    return service.get_engagement_timeline(engagement_id, current_user, page=page, page_size=page_size, show_sensitive=show_sensitive)


@router.get(
    "/{engagement_id}/health",
    response_model=EngagementHealthPageRead,
    summary="List engagement health history",
    description="Returns health snapshots newest-first with pagination, preserving historical formula output.",
)
def list_health(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    rag_status: Annotated[str | None, Query(description="Filter by RAG status: healthy, warning, or critical.")] = None,
    freshness_status: Annotated[str | None, Query(description="Filter by health freshness status.")] = None,
    is_dirty: Annotated[bool | None, Query(description="Filter snapshots marked dirty by metric changes.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of health snapshots per page.")] = 10,
) -> EngagementHealthPageRead:
    return service.list_health(
        engagement_id,
        current_user,
        page,
        page_size,
        rag_status=rag_status,
        freshness_status=freshness_status,
        is_dirty=is_dirty,
    )


@router.post(
    "/{engagement_id}/health/recalculate",
    response_model=EngagementHealthRead,
    summary="Recalculate engagement health",
    description="Creates a new engagement health snapshot and notifies the account health rollup adapter without mutating older snapshots.",
)
def recalculate_health(
    engagement_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementHealthRead:
    return service.recalculate_health(engagement_id, current_user)
