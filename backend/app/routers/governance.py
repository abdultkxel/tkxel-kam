from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_governance_service, require_permission
from app.models import User
from app.schemas import (
    GovernanceCalendarPageRead,
    GovernanceEventAgendaUpdateRequest,
    GovernanceEventCompleteRequest,
    GovernanceEventCreateRequest,
    GovernanceEventPageRead,
    GovernanceEventRead,
    GovernanceEventUpdateRequest,
    GovernanceGeneratedOutputRead,
    GovernanceGeneratedOutputRequest,
)
from app.services.governance import GovernanceService

Direction = Literal["asc", "desc"]
GovernanceSort = Literal["event_date", "status", "updated_at"]
GovernanceStatus = Literal["upcoming", "overdue", "completed", "cancelled"]
GovernanceTypeFilter = Literal["QBR", "SteerCo", "Monthly Review", "Executive Review"]

router = APIRouter(prefix="/api/governance-events", tags=["Governance Reviews"])
GovernanceViewAccess = Annotated[User, Depends(require_permission("governance_reviews", "view"))]
GovernanceCreateAccess = Annotated[User, Depends(require_permission("governance_reviews", "create"))]
GovernanceUpdateAccess = Annotated[User, Depends(require_permission("governance_reviews", "update"))]


@router.get(
    "",
    response_model=GovernanceEventPageRead,
    summary="List governance events",
    description="Lists governance records with account, engagement, type, status, date, owner, attendee, source, search, sort, and pagination filters.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view governance records."},
        422: {"description": "Invalid governance event filters or pagination parameters."},
    },
)
def list_governance_events(
    _: GovernanceViewAccess,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
    account_id: Annotated[str | None, Query(description="Account ID filter.")] = None,
    engagement_id: Annotated[str | None, Query(description="Engagement ID filter.")] = None,
    governance_type: Annotated[GovernanceTypeFilter | None, Query(description="Governance event type filter.")] = None,
    status_filter: Annotated[GovernanceStatus | None, Query(alias="status", description="Effective status filter.")] = None,
    owner_id: Annotated[str | None, Query(description="Owner user ID filter.")] = None,
    attendee: Annotated[str | None, Query(description="Attendee email filter.")] = None,
    date_from: Annotated[datetime | None, Query(description="Events scheduled on or after this ISO timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Events scheduled on or before this ISO timestamp.")] = None,
    source: Annotated[str | None, Query(description="Source filter, for example manual or future integration source.")] = None,
    search: Annotated[str | None, Query(description="Search agenda, notes, decisions, and action items.")] = None,
    sort: Annotated[GovernanceSort, Query(description="Sort column.")] = "event_date",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "asc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of governance events per page.")] = 10,
) -> GovernanceEventPageRead:
    return service.list_events(
        current_user,
        account_id=account_id,
        engagement_id=engagement_id,
        governance_type=governance_type,
        event_status=status_filter,
        owner_id=owner_id,
        attendee=attendee,
        date_from=date_from,
        date_to=date_to,
        source=source,
        search=search,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/calendar",
    response_model=GovernanceCalendarPageRead,
    summary="List governance calendar items",
    description="Returns governance events as calendar-item projections. Calendar surfaces can merge this with renewal, score activity, task, or integration calendar items.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}, 403: {"description": "Authenticated user cannot view governance calendar items."}},
)
def list_governance_calendar_items(
    _: GovernanceViewAccess,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
    date_from: Annotated[datetime | None, Query(description="Items scheduled on or after this ISO timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Items scheduled on or before this ISO timestamp.")] = None,
    account_id: Annotated[str | None, Query(description="Account ID filter.")] = None,
    owner_id: Annotated[str | None, Query(description="Owner user ID filter.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of calendar items per page.")] = 100,
) -> GovernanceCalendarPageRead:
    return service.calendar_items(current_user, date_from=date_from, date_to=date_to, account_id=account_id, owner_id=owner_id, page=page, page_size=page_size)


@router.post(
    "",
    response_model=GovernanceEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create governance event",
    description="Creates a governance domain record with account, optional engagement, owner, date, agenda, and attendee emails. Calendar surfaces receive this through projections.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create governance events for this account."},
        404: {"description": "Account or engagement was not found."},
        422: {"description": "Governance event validation failed."},
    },
)
def create_governance_event(
    _: GovernanceCreateAccess,
    payload: GovernanceEventCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceEventRead:
    return service.create_event(payload, current_user)


@router.get(
    "/{event_id}",
    response_model=GovernanceEventRead,
    summary="Read governance event",
    description="Returns governance details, attendee emails, notes, decisions, governance-local action items, generated outputs, and effective status.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this governance event."},
        404: {"description": "Governance event was not found."},
    },
)
def read_governance_event(
    event_id: str,
    _: GovernanceViewAccess,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceEventRead:
    return service.get_event(event_id, current_user)


@router.patch(
    "/{event_id}",
    response_model=GovernanceEventRead,
    summary="Update governance event",
    description="Updates governance event details, owner, schedule, agenda, status, and attendee emails with field-level backend validation.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this governance event."},
        404: {"description": "Governance event was not found."},
        422: {"description": "Governance event validation failed."},
    },
)
def update_governance_event(
    event_id: str,
    _: GovernanceUpdateAccess,
    payload: GovernanceEventUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceEventRead:
    return service.update_event(event_id, payload, current_user)


@router.post(
    "/{event_id}/complete",
    response_model=GovernanceEventRead,
    summary="Complete governance event",
    description="Completes a governance event. Notes are required; decisions and governance-local action items are optional.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot complete this governance event."},
        404: {"description": "Governance event was not found."},
        422: {"description": "Completion validation failed."},
    },
)
def complete_governance_event(
    event_id: str,
    _: GovernanceUpdateAccess,
    payload: GovernanceEventCompleteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceEventRead:
    return service.complete_event(event_id, payload, current_user)


@router.post(
    "/{event_id}/agenda-draft",
    response_model=GovernanceGeneratedOutputRead,
    summary="Generate agenda draft",
    description="Generates a deterministic source-backed agenda draft without calling an AI provider. Future agents can plug into the same service port.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot generate an agenda draft for this governance event."},
        404: {"description": "Governance event was not found."},
    },
)
def generate_agenda_draft(
    event_id: str,
    _: GovernanceUpdateAccess,
    payload: GovernanceGeneratedOutputRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceGeneratedOutputRead:
    return service.generate_agenda_draft(event_id, payload, current_user)


@router.patch(
    "/{event_id}/agenda",
    response_model=GovernanceEventRead,
    summary="Update governance agenda",
    description="Stores the edited/accepted agenda content. A source output ID can link the accepted agenda back to a generated draft.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this governance agenda."},
        404: {"description": "Governance event was not found."},
        422: {"description": "Agenda validation failed."},
    },
)
def update_governance_agenda(
    event_id: str,
    _: GovernanceUpdateAccess,
    payload: GovernanceEventAgendaUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceEventRead:
    return service.update_agenda(event_id, payload, current_user)


@router.post(
    "/{event_id}/ai-brief",
    response_model=GovernanceGeneratedOutputRead,
    summary="Generate governance brief",
    description="Generates a deterministic source-backed governance brief with disclaimer and citations. The route name follows the PRD/spec and remains future AI-agent compatible.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot generate a brief for this governance event."},
        404: {"description": "Governance event was not found."},
    },
)
def generate_governance_brief(
    event_id: str,
    _: GovernanceUpdateAccess,
    payload: GovernanceGeneratedOutputRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
) -> GovernanceGeneratedOutputRead:
    return service.generate_brief(event_id, payload, current_user)
