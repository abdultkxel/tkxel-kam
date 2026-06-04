from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_meeting_capture_service
from app.models import User
from app.schemas import (
    IntegrationSyncResponse,
    MeetingArtifactCreateRequest,
    MeetingArtifactPageRead,
    MeetingArtifactRead,
    MeetingArtifactUpdateRequest,
    UserFathomConnectionRead,
    UserFathomConnectionUpdateRequest,
)
from app.services.meeting_capture import MeetingCaptureService

router = APIRouter(prefix="/api/meeting-capture", tags=["Meeting Capture"])


@router.get(
    "/fathom/connection",
    response_model=UserFathomConnectionRead,
    summary="Read personal Fathom connection",
    description="Returns the logged-in user's personal Fathom connection status without exposing stored credentials.",
    response_description="Personal Fathom connection status.",
    responses={401: {"description": "Authentication is required."}},
)
def read_fathom_connection(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
) -> UserFathomConnectionRead:
    return service.read_fathom_connection(current_user)


@router.patch(
    "/fathom/connection",
    response_model=UserFathomConnectionRead,
    summary="Update personal Fathom connection",
    description="Stores or updates the logged-in user's personal Fathom API key and connection settings.",
    response_description="Updated personal Fathom connection status.",
    responses={401: {"description": "Authentication is required."}, 422: {"description": "Field-level validation errors."}},
)
def update_fathom_connection(
    payload: UserFathomConnectionUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
) -> UserFathomConnectionRead:
    return service.update_fathom_connection(payload, current_user)


@router.post(
    "/fathom/sync",
    response_model=IntegrationSyncResponse,
    summary="Sync personal Fathom meetings",
    description="Fetches Fathom summaries and action items for the logged-in user's personal Fathom API key and stores them as private meeting artifacts.",
    response_description="Counts for created and updated meeting artifacts.",
    responses={
        400: {"description": "Personal Fathom credentials are missing."},
        401: {"description": "Authentication is required."},
        502: {"description": "Fathom API request failed."},
    },
)
def sync_fathom_meetings(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
) -> IntegrationSyncResponse:
    return service.sync_fathom_meetings(current_user)


@router.get(
    "/meetings",
    response_model=MeetingArtifactPageRead,
    summary="List personal meeting artifacts",
    description="Lists the logged-in user's Fathom or manually captured meeting notes with optional account, status, linked-object, date, and search filters.",
    response_description="Paginated personal meeting artifacts.",
    responses={401: {"description": "Authentication is required."}, 403: {"description": "Linked account access is denied."}},
)
def list_meetings(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
    provider: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    account_id: str | None = None,
    linked_object_type: str | None = None,
    linked_object_id: str | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> MeetingArtifactPageRead:
    return service.list_meetings(
        current_user,
        provider=provider,
        status_filter=status_filter,
        account_id=account_id,
        linked_object_type=linked_object_type,
        linked_object_id=linked_object_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/meetings",
    response_model=MeetingArtifactRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create personal meeting artifact",
    description="Creates a user-owned meeting note or Fathom reference that can later be used by governance completion.",
    response_description="Created meeting artifact.",
    responses={401: {"description": "Authentication is required."}, 403: {"description": "Linked account access is denied."}, 422: {"description": "Field-level validation errors."}},
)
def create_meeting(
    payload: MeetingArtifactCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
) -> MeetingArtifactRead:
    return service.create_meeting(payload, current_user)


@router.patch(
    "/meetings/{meeting_id}",
    response_model=MeetingArtifactRead,
    summary="Update personal meeting artifact",
    description="Updates a user-owned meeting artifact's notes, action items, links, account linkage, or status.",
    response_description="Updated meeting artifact.",
    responses={
        401: {"description": "Authentication is required."},
        403: {"description": "Linked account access is denied."},
        404: {"description": "Meeting artifact was not found."},
        422: {"description": "Field-level validation errors."},
    },
)
def update_meeting(
    meeting_id: str,
    payload: MeetingArtifactUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[MeetingCaptureService, Depends(get_meeting_capture_service)],
) -> MeetingArtifactRead:
    return service.update_meeting(meeting_id, payload, current_user)
