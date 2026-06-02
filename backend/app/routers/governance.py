from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query, status

from app.dependencies import get_current_user, get_governance_service, get_integration_service
from app.models import User
from app.schemas import (
    GovernanceAIBriefRead,
    GovernanceActionItemCreateRequest,
    GovernanceActionItemPageRead,
    GovernanceActionItemRead,
    GovernanceActionItemUpdateRequest,
    GovernanceDecisionCreateRequest,
    GovernanceDecisionPageRead,
    GovernanceDecisionRead,
    GovernanceCalendarPageRead,
    GovernanceEventAgendaUpdateRequest,
    GovernanceEventCompleteRequest,
    GovernanceEventCreateRequest,
    GovernanceEventPageRead,
    GovernanceEventRead,
    GovernanceEventUpdateRequest,
    GovernanceGeneratedOutputRead,
    GovernanceGeneratedOutputRequest,
    GovernanceRecurrenceRuleCreateRequest,
    GovernanceRecurrenceRulePageRead,
    GovernanceRecurrenceRuleRead,
    GovernanceRecurrenceRuleUpdateRequest,
    IntegrationConnectionRead,
    IntegrationConnectionUpdateRequest,
    IntegrationProvider,
    IntegrationSyncLogPageRead,
    IntegrationSyncResponse,
    MessageResponse,
)
from app.services.governance import GovernanceService
from app.services.integrations import IntegrationService

Direction = Literal["asc", "desc"]
GovernanceSort = Literal["event_date", "scheduled_at", "status", "updated_at", "created_at"]
ActiveState = Literal["all", "active", "inactive"]

router = APIRouter(prefix="/api", tags=["Governance Reviews"])


@router.get("/governance-events", response_model=GovernanceEventPageRead, summary="List governance events", description="Paginated governance events with calendar date navigation, search, filters, sorting, source filters, and account authorization.")
def list_events(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    governance_type: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    owner_id: str | None = None,
    attendee: str | None = None,
    source: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: GovernanceSort = "scheduled_at",
    direction: Direction = "asc",
    page: int = 1,
    page_size: int = 25,
) -> GovernanceEventPageRead:
    return service.list_events(current_user, account_id=account_id, engagement_id=engagement_id, search=search, governance_type=governance_type, status_filter=status_filter, owner_id=owner_id, attendee=attendee, source=source, date_from=date_from, date_to=date_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.get("/governance-events/calendar", response_model=GovernanceCalendarPageRead, summary="List governance calendar items", description="Returns governance events as calendar-item projections for unified calendar surfaces.")
def list_governance_calendar_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
    account_id: str | None = None,
    owner_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    page_size: int = 100,
) -> GovernanceCalendarPageRead:
    return service.calendar_items(current_user, account_id=account_id, owner_id=owner_id, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.post("/governance-events", response_model=GovernanceEventRead, status_code=status.HTTP_201_CREATED, summary="Create governance event", description="Creates a manual QBR, SteerCo, monthly review, or executive review with audit and timeline entries.")
def create_event(payload: GovernanceEventCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceEventRead:
    return service.create_event(payload, current_user)


@router.get("/governance-events/{event_id}", response_model=GovernanceEventRead, summary="Read governance event", description="Reads governance detail with account authorization.")
def get_event(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceEventRead:
    return service.get_event(event_id, current_user)


@router.patch("/governance-events/{event_id}", response_model=GovernanceEventRead, summary="Update governance event", description="Updates governance metadata, attendees, notes, agenda, owner, status, or schedule.")
def update_event(event_id: str, payload: GovernanceEventUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceEventRead:
    return service.update_event(event_id, payload, current_user)


@router.post("/governance-events/{event_id}/complete", response_model=GovernanceEventRead, summary="Complete governance event", description="Marks governance event complete after notes or decisions exist and writes timeline/audit entries.")
def complete_event(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)], payload: Annotated[GovernanceEventCompleteRequest | None, Body()] = None) -> GovernanceEventRead:
    return service.complete_event(event_id, current_user, payload)


@router.post("/governance-events/{event_id}/agenda-draft", response_model=GovernanceGeneratedOutputRead, summary="Generate governance agenda draft", description="Generates a source-backed editable agenda draft and records citations.")
def agenda_draft(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)], payload: Annotated[GovernanceGeneratedOutputRequest | None, Body()] = None) -> GovernanceGeneratedOutputRead:
    return service.agenda_draft(event_id, current_user, payload)


@router.patch("/governance-events/{event_id}/agenda", response_model=GovernanceEventRead, summary="Update governance agenda", description="Updates an editable governance agenda.")
def update_agenda(event_id: str, payload: GovernanceEventAgendaUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceEventRead:
    return service.update_agenda(event_id, payload, current_user)


@router.post("/governance-events/{event_id}/ai-brief", response_model=GovernanceAIBriefRead, summary="Generate governance brief", description="Generates a pre-meeting brief with inline openable citations and a non-dismissible disclaimer.")
def ai_brief(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)], payload: Annotated[GovernanceGeneratedOutputRequest | None, Body()] = None) -> GovernanceAIBriefRead:
    return service.ai_brief(event_id, current_user, payload)


@router.get("/governance-events/{event_id}/decisions", response_model=GovernanceDecisionPageRead, summary="List governance decisions", description="Paginated decisions captured during a governance event.")
def list_decisions(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)], page: int = 1, page_size: int = 10) -> GovernanceDecisionPageRead:
    return service.list_decisions(event_id, current_user, page, page_size)


@router.post("/governance-events/{event_id}/decisions", response_model=GovernanceDecisionRead, status_code=status.HTTP_201_CREATED, summary="Add governance decision", description="Adds a decision, writes timeline, and logs audit metadata.")
def add_decision(event_id: str, payload: GovernanceDecisionCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceDecisionRead:
    return service.add_decision(event_id, payload, current_user)


@router.get("/governance-events/{event_id}/action-items", response_model=GovernanceActionItemPageRead, summary="List governance action items", description="Paginated governance action items for an event.")
def list_action_items(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)], page: int = 1, page_size: int = 10) -> GovernanceActionItemPageRead:
    return service.list_action_items(event_id, current_user, page, page_size)


@router.post("/governance-events/{event_id}/action-items", response_model=GovernanceActionItemRead, status_code=status.HTTP_201_CREATED, summary="Add governance action item", description="Adds an owner/due-date-backed governance action item.")
def add_action_item(event_id: str, payload: GovernanceActionItemCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceActionItemRead:
    return service.add_action_item(event_id, payload, current_user)


@router.patch("/governance-action-items/{action_item_id}", response_model=GovernanceActionItemRead, summary="Update governance action item", description="Updates action item title, owner, due date, priority, or completion status.")
def update_action_item(action_item_id: str, payload: GovernanceActionItemUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceActionItemRead:
    return service.update_action_item(action_item_id, payload, current_user)


@router.get("/admin/governance-recurrence-rules", response_model=GovernanceRecurrenceRulePageRead, summary="List governance recurrence rules", description="Admin-configurable recurrence rules with search, cadence/type/status/owner/account/segment filters, and pagination.")
def list_recurrence_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GovernanceService, Depends(get_governance_service)],
    search: str | None = None,
    cadence: str | None = None,
    governance_type: str | None = None,
    active_state: ActiveState = "active",
    owner_id: str | None = None,
    account_id: str | None = None,
    segment: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> GovernanceRecurrenceRulePageRead:
    return service.list_recurrence_rules(current_user, search=search, cadence=cadence, governance_type=governance_type, active_state=active_state, owner_id=owner_id, account_id=account_id, segment=segment, page=page, page_size=page_size)


@router.post("/admin/governance-recurrence-rules", response_model=GovernanceRecurrenceRuleRead, status_code=status.HTTP_201_CREATED, summary="Create governance recurrence rule", description="Creates a configurable recurrence rule and generates deduplicated upcoming governance events.")
def create_recurrence_rule(payload: GovernanceRecurrenceRuleCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceRecurrenceRuleRead:
    return service.create_recurrence_rule(payload, current_user)


@router.patch("/admin/governance-recurrence-rules/{rule_id}", response_model=GovernanceRecurrenceRuleRead, summary="Update governance recurrence rule", description="Updates a recurrence rule and generates any missing deduplicated future events.")
def update_recurrence_rule(rule_id: str, payload: GovernanceRecurrenceRuleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> GovernanceRecurrenceRuleRead:
    return service.update_recurrence_rule(rule_id, payload, current_user)


@router.delete("/admin/governance-recurrence-rules/{rule_id}", response_model=MessageResponse, summary="Delete governance recurrence rule", description="Deletes recurrence configuration without deleting already-generated governance events.")
def delete_recurrence_rule(rule_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[GovernanceService, Depends(get_governance_service)]) -> MessageResponse:
    return service.delete_recurrence_rule(rule_id, current_user)


@router.get("/admin/integrations", response_model=list[IntegrationConnectionRead], summary="List integration connections", description="Lists approved integration connection status with provider/status/error/last-sync filters.")
def list_integrations(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    provider: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    error_state: Literal["with_errors", "without_errors"] | None = None,
    last_synced_from: datetime | None = None,
    last_synced_to: datetime | None = None,
) -> list[IntegrationConnectionRead]:
    return service.list_integrations(current_user, provider=provider, status_filter=status_filter, error_state=error_state, last_synced_from=last_synced_from, last_synced_to=last_synced_to)


@router.patch("/admin/integrations/{provider}", response_model=IntegrationConnectionRead, summary="Update integration connection", description="Updates approved provider credentials/settings. Secret values are masked in responses.")
def update_integration(provider: IntegrationProvider, payload: IntegrationConnectionUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationConnectionRead:
    return service.update_integration(provider, payload, current_user)


@router.post("/admin/integrations/{provider}/sync", response_model=IntegrationSyncResponse, summary="Sync integration", description="Runs an approved provider sync. Requires credentials where applicable and logs configuration-required or error states.")
def sync_integration(provider: IntegrationProvider, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationSyncResponse:
    return service.sync_integration(provider, current_user)


@router.get("/admin/integrations/sync-logs", response_model=IntegrationSyncLogPageRead, summary="List integration sync logs", description="Paginated integration sync log with provider, status, severity, search, and date filters.")
def list_sync_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    provider: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    severity: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> IntegrationSyncLogPageRead:
    return service.list_logs(current_user, provider=provider, status_filter=status_filter, severity=severity, date_from=date_from, date_to=date_to, search=search, page=page, page_size=page_size)
