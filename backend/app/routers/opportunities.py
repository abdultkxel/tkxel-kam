from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status

from app.dependencies import get_current_user, get_opportunity_service
from app.models import User
from app.schemas import (
    MessageResponse,
    OpportunityActionItemCreateRequest,
    OpportunityActionItemPageRead,
    OpportunityActionItemRead,
    OpportunityActionItemUpdateRequest,
    OpportunityCreateRequest,
    OpportunityDecisionCreateRequest,
    OpportunityDecisionPageRead,
    OpportunityDecisionRead,
    OpportunityPageRead,
    OpportunityStageDefinitionCreateRequest,
    OpportunityRead,
    OpportunityStageDefinitionRead,
    OpportunityStageDefinitionUpdateRequest,
    OpportunityStageTransitionConfigRead,
    OpportunityStageTransitionRead,
    OpportunityStageTransitionRequest,
    OpportunityStageTransitionsUpdateRequest,
    OpportunityTypeCreateRequest,
    OpportunityTypePageRead,
    OpportunityTypeRead,
    OpportunityTypeUpdateRequest,
    OpportunityUpdateRequest,
)
from app.services.opportunities import OpportunityService

Direction = Literal["asc", "desc"]
OpportunitySort = Literal["name", "account_name", "stage", "value", "target_date", "updated_at", "created_at"]
ActiveState = Literal["all", "active", "inactive"]

router = APIRouter(prefix="/api", tags=["Growth & Opportunity Management"])


@router.get(
    "/opportunities",
    response_model=OpportunityPageRead,
    summary="List opportunities",
    description="Paginated opportunity pipeline list with account authorization, board/list filters, sorting, archive filtering, and pipeline totals.",
)
def list_opportunities(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OpportunityService, Depends(get_opportunity_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    type_id: str | None = None,
    type_slug: str | None = None,
    stage: str | None = None,
    owner_id: str | None = None,
    service_line: str | None = None,
    source_context: str | None = None,
    target_from: datetime | None = None,
    target_to: datetime | None = None,
    min_value: float | None = None,
    max_value: float | None = None,
    include_archived: bool = False,
    sort: OpportunitySort = "target_date",
    direction: Direction = "asc",
    page: int = 1,
    page_size: int = 25,
) -> OpportunityPageRead:
    return service.list_opportunities(
        current_user,
        account_id=account_id,
        engagement_id=engagement_id,
        search=search,
        type_id=type_id,
        type_slug=type_slug,
        stage=stage,
        owner_id=owner_id,
        service_line=service_line,
        source_context=source_context,
        target_from=target_from,
        target_to=target_to,
        min_value=min_value,
        max_value=max_value,
        include_archived=include_archived,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/opportunities",
    response_model=OpportunityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create opportunity",
    description="Creates an opportunity with owner, type, value, target date, next step, optional local action items, audit entry, and account timeline entry.",
)
def create_opportunity(payload: OpportunityCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityRead:
    return service.create_opportunity(payload, current_user)


@router.get(
    "/opportunities/{opportunity_id}",
    response_model=OpportunityRead,
    summary="Read opportunity",
    description="Reads opportunity detail with stage history, decisions, local action items, account/engagement labels, and source-link metadata.",
)
def get_opportunity(opportunity_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityRead:
    return service.get_opportunity(opportunity_id, current_user)


@router.patch(
    "/opportunities/{opportunity_id}",
    response_model=OpportunityRead,
    summary="Update opportunity",
    description="Updates opportunity fields, validates owner/type/stage/account context, and writes audit/stage history where applicable.",
)
def update_opportunity(opportunity_id: str, payload: OpportunityUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityRead:
    return service.update_opportunity(opportunity_id, payload, current_user)


@router.delete(
    "/opportunities/{opportunity_id}",
    response_model=MessageResponse,
    summary="Archive opportunity",
    description="Soft archives an opportunity so it leaves active pipeline views while preserving timeline, reporting, and source-link history.",
)
def archive_opportunity(opportunity_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)], reason: str | None = None) -> MessageResponse:
    return service.archive_opportunity(opportunity_id, current_user, reason)


@router.post(
    "/opportunities/{opportunity_id}/restore",
    response_model=OpportunityRead,
    summary="Restore opportunity",
    description="Restores a soft-archived opportunity to active pipeline views while preserving archive and restore timeline history.",
)
def restore_opportunity(opportunity_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)], reason: str | None = None) -> OpportunityRead:
    return service.restore_opportunity(opportunity_id, current_user, reason)


@router.post(
    "/opportunities/{opportunity_id}/stage",
    response_model=OpportunityStageTransitionRead,
    summary="Move opportunity stage",
    description="Moves an opportunity to any valid current UI stage, stores before/after history, and writes account timeline/audit entries.",
)
def move_opportunity_stage(opportunity_id: str, payload: OpportunityStageTransitionRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityStageTransitionRead:
    return service.transition_stage(opportunity_id, payload, current_user)


@router.get(
    "/opportunity-stages",
    response_model=list[OpportunityStageDefinitionRead],
    summary="List opportunity stages",
    description="Returns the active seeded opportunity pipeline stages used by board and list controls.",
)
def list_opportunity_stages(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> list[OpportunityStageDefinitionRead]:
    return service.list_stages(current_user)


@router.get(
    "/opportunity-types",
    response_model=OpportunityTypePageRead,
    summary="List active opportunity types",
    description="Returns active opportunity types for create/edit forms and filters.",
)
def list_active_opportunity_types(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OpportunityService, Depends(get_opportunity_service)],
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> OpportunityTypePageRead:
    return service.list_types(current_user, active_state="active", search=search, page=page, page_size=page_size)


@router.get(
    "/opportunities/{opportunity_id}/decisions",
    response_model=OpportunityDecisionPageRead,
    summary="List opportunity decisions",
    description="Paginated standalone decision history for an opportunity detail dialog.",
)
def list_opportunity_decisions(opportunity_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)], page: int = 1, page_size: int = 10) -> OpportunityDecisionPageRead:
    return service.list_decisions(opportunity_id, current_user, page, page_size)


@router.post(
    "/opportunities/{opportunity_id}/decisions",
    response_model=OpportunityDecisionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add opportunity decision",
    description="Adds a source-linked decision record and writes an opportunity timeline entry.",
)
def add_opportunity_decision(opportunity_id: str, payload: OpportunityDecisionCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityDecisionRead:
    return service.add_decision(opportunity_id, payload, current_user)


@router.get(
    "/opportunities/{opportunity_id}/action-items",
    response_model=OpportunityActionItemPageRead,
    summary="List opportunity action items",
    description="Paginated opportunity-local action items that are future-ready for conversion to first-class Tasks.",
)
def list_opportunity_action_items(opportunity_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)], page: int = 1, page_size: int = 10) -> OpportunityActionItemPageRead:
    return service.list_action_items(opportunity_id, current_user, page, page_size)


@router.post(
    "/opportunities/{opportunity_id}/action-items",
    response_model=OpportunityActionItemRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add opportunity action item",
    description="Adds an opportunity-local owner/due-date-backed action item without creating a first-class Task.",
)
def add_opportunity_action_item(opportunity_id: str, payload: OpportunityActionItemCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityActionItemRead:
    return service.add_action_item(opportunity_id, payload, current_user)


@router.patch(
    "/opportunity-action-items/{action_item_id}",
    response_model=OpportunityActionItemRead,
    summary="Update opportunity action item",
    description="Updates an opportunity-local action item title, owner, due date, priority, notes, or completion status.",
)
def update_opportunity_action_item(action_item_id: str, payload: OpportunityActionItemUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityActionItemRead:
    return service.update_action_item(action_item_id, payload, current_user)


@router.get(
    "/admin/opportunity-types",
    response_model=OpportunityTypePageRead,
    summary="List admin opportunity types",
    description="Admin/KAM Head taxonomy list for active and inactive opportunity types with in-use counts.",
)
def list_admin_opportunity_types(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OpportunityService, Depends(get_opportunity_service)],
    search: str | None = None,
    active_state: ActiveState = "active",
    page: int = 1,
    page_size: int = 50,
) -> OpportunityTypePageRead:
    return service.list_types(current_user, active_state=active_state, search=search, page=page, page_size=page_size, require_configure=True)


@router.post(
    "/admin/opportunity-types",
    response_model=OpportunityTypeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create opportunity type",
    description="Creates an admin-configurable opportunity type used by opportunity forms, filters, reports, and analytics.",
)
def create_opportunity_type(payload: OpportunityTypeCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityTypeRead:
    return service.create_type(payload, current_user)


@router.patch(
    "/admin/opportunity-types/{type_id}",
    response_model=OpportunityTypeRead,
    summary="Update opportunity type",
    description="Updates an opportunity type label, slug, description, ordering, or active state.",
)
def update_opportunity_type(type_id: str, payload: OpportunityTypeUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityTypeRead:
    return service.update_type(type_id, payload, current_user)


@router.delete(
    "/admin/opportunity-types/{type_id}",
    response_model=MessageResponse,
    summary="Deactivate opportunity type",
    description="Deactivates an opportunity type so historical opportunity records keep resolving without hard deletion.",
)
def delete_opportunity_type(type_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> MessageResponse:
    return service.delete_type(type_id, current_user)


@router.get(
    "/admin/opportunity-stages",
    response_model=list[OpportunityStageDefinitionRead],
    summary="List admin opportunity stages",
    description="Admin/KAM Head stage taxonomy with terminal-state and outcome-reason configuration.",
)
def list_admin_opportunity_stages(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> list[OpportunityStageDefinitionRead]:
    return service.list_admin_stages(current_user)


@router.post(
    "/admin/opportunity-stages",
    response_model=OpportunityStageDefinitionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create opportunity stage",
    description="Creates an opportunity stage for board/list controls and configured transition validation.",
)
def create_opportunity_stage(payload: OpportunityStageDefinitionCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityStageDefinitionRead:
    return service.create_stage(payload, current_user)


@router.patch(
    "/admin/opportunity-stages/{stage_id}",
    response_model=OpportunityStageDefinitionRead,
    summary="Update opportunity stage",
    description="Updates an opportunity stage, including active state, terminal marker, and outcome-reason requirement.",
)
def update_opportunity_stage(stage_id: str, payload: OpportunityStageDefinitionUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> OpportunityStageDefinitionRead:
    return service.update_stage(stage_id, payload, current_user)


@router.get(
    "/admin/opportunity-stage-transitions",
    response_model=list[OpportunityStageTransitionConfigRead],
    summary="List opportunity stage transitions",
    description="Returns configured allowed stage transitions used by opportunity board/list movement validation.",
)
def list_opportunity_stage_transitions(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> list[OpportunityStageTransitionConfigRead]:
    return service.list_stage_transitions(current_user)


@router.put(
    "/admin/opportunity-stage-transitions",
    response_model=list[OpportunityStageTransitionConfigRead],
    summary="Replace opportunity stage transitions",
    description="Replaces configured allowed opportunity stage transitions after validating source and target stages.",
)
def replace_opportunity_stage_transitions(payload: OpportunityStageTransitionsUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[OpportunityService, Depends(get_opportunity_service)]) -> list[OpportunityStageTransitionConfigRead]:
    return service.replace_stage_transitions(payload, current_user)
