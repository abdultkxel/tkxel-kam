from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_escalation_service
from app.models import User
from app.schemas import (
    EscalationAddUpdateRequest,
    EscalationCloseRequest,
    EscalationCreateRequest,
    EscalationNotificationPageRead,
    EscalationNotificationRead,
    EscalationPageRead,
    EscalationRead,
    EscalationUpdatePageRead,
    EscalationUpdateRead,
    EscalationUpdateRequest,
)
from app.services.escalations import EscalationService

Direction = Literal["asc", "desc"]
EscalationSort = Literal["severity", "sla_due_at", "created_at", "updated_at"]

router = APIRouter(prefix="/api", tags=["Escalation Management"])


@router.get("/escalations", response_model=EscalationPageRead, summary="List escalations", description="Paginated escalation list with search, severity/priority/status/owner/SLA filters, sorting, and account authorization.")
def list_escalations(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EscalationService, Depends(get_escalation_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    severity: str | None = None,
    priority: str | None = None,
    owner_id: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    watchlist: bool | None = None,
    sla_from: datetime | None = None,
    sla_to: datetime | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    sort: EscalationSort = "sla_due_at",
    direction: Direction = "asc",
    page: int = 1,
    page_size: int = 10,
) -> EscalationPageRead:
    return service.list_escalations(current_user, account_id=account_id, engagement_id=engagement_id, search=search, severity=severity, priority=priority, owner_id=owner_id, status_filter=status_filter, watchlist=watchlist, sla_from=sla_from, sla_to=sla_to, created_from=created_from, created_to=created_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/escalations", response_model=EscalationRead, status_code=status.HTTP_201_CREATED, summary="Create escalation", description="Creates a human-owned formal escalation with default SLA calculation, audit logging, timeline entry, and RBAC.")
def create_escalation(payload: EscalationCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationRead:
    return service.create_escalation(payload, current_user)


@router.get("/escalations/{escalation_id}", response_model=EscalationRead, summary="Read escalation", description="Returns a formal escalation if the user can view the account or owns the escalation.")
def get_escalation(escalation_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationRead:
    return service.get_escalation(escalation_id, current_user)


@router.patch("/escalations/{escalation_id}", response_model=EscalationRead, summary="Update escalation", description="Updates escalation severity, priority, status, owner, SLA, Watchlist, mitigation, or recovery fields.")
def update_escalation(escalation_id: str, payload: EscalationUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationRead:
    return service.update_escalation(escalation_id, payload, current_user)


@router.post("/escalations/{escalation_id}/updates", response_model=EscalationUpdateRead, status_code=status.HTTP_201_CREATED, summary="Add escalation update", description="Adds an operations, client communication, mitigation, recovery, evidence, or status update and resets activity freshness.")
def add_update(escalation_id: str, payload: EscalationAddUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationUpdateRead:
    return service.add_update(escalation_id, payload, current_user)


@router.get("/escalations/{escalation_id}/updates", response_model=EscalationUpdatePageRead, summary="List escalation updates", description="Paginated escalation update history.")
def list_updates(escalation_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)], page: int = 1, page_size: int = 10) -> EscalationUpdatePageRead:
    return service.list_updates(escalation_id, current_user, page, page_size)


@router.post("/escalations/{escalation_id}/close", response_model=EscalationRead, summary="Close escalation", description="Closes escalation only when resolution evidence is provided, or an authorized override reason is supplied. Critical escalations require RCA.")
def close_escalation(escalation_id: str, payload: EscalationCloseRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationRead:
    return service.close_escalation(escalation_id, payload, current_user)


@router.post("/escalations/{escalation_id}/reopen", response_model=EscalationRead, summary="Reopen escalation", description="Reopens a closed escalation while preserving previous closure evidence, RCA, and timeline history.")
def reopen_escalation(escalation_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationRead:
    return service.reopen_escalation(escalation_id, current_user)


@router.get("/escalations/{escalation_id}/notifications", response_model=EscalationNotificationPageRead, summary="List escalation notifications", description="Paginated notification metadata for one escalation.")
def list_notifications(escalation_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)], page: int = 1, page_size: int = 10) -> EscalationNotificationPageRead:
    return service.list_notifications(escalation_id, current_user, page, page_size)


@router.post("/escalations/{escalation_id}/notifications/test", response_model=EscalationNotificationRead, summary="Queue test escalation notification", description="Queues a deduplicated test notification for escalation delivery verification.")
def test_notification(escalation_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[EscalationService, Depends(get_escalation_service)]) -> EscalationNotificationRead:
    return service.test_notification(escalation_id, current_user)


@router.get("/admin/notification-log", response_model=EscalationNotificationPageRead, summary="List notification log", description="Admin/KAM Head notification log with recipient, channel, trigger, escalation, delivery status, date filters, and pagination.")
def notification_log(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EscalationService, Depends(get_escalation_service)],
    search: str | None = None,
    recipient: str | None = None,
    channel: str | None = None,
    trigger: str | None = None,
    escalation_id: str | None = None,
    delivery_status: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    page: int = 1,
    page_size: int = 10,
) -> EscalationNotificationPageRead:
    return service.list_notification_log(current_user, search=search, recipient=recipient, channel=channel, trigger=trigger, escalation_id=escalation_id, delivery_status=delivery_status, created_from=created_from, created_to=created_to, page=page, page_size=page_size)
