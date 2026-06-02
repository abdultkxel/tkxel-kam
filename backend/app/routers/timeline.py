from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.dependencies import get_current_user, get_timeline_service
from app.models import User
from app.schemas import (
    HandoverShareRead,
    HandoverSummaryCreateRequest,
    HandoverSummaryPageRead,
    HandoverSummaryRead,
    MessageResponse,
    TimelineAiSearchRequest,
    TimelineAiSearchResponse,
    TimelineCommentCreateRequest,
    TimelineCommentPageRead,
    TimelineCommentRead,
    TimelineCommentUpdateRequest,
    TimelineEventPageRead,
    TimelineEventRead,
    TimelineEventTypeCreateRequest,
    TimelineEventTypePageRead,
    TimelineEventTypeRead,
    TimelineEventTypeUpdateRequest,
    TimelineEventUpdateRequest,
    TimelineNoteCreateRequest,
    TimelineRetentionActionPageRead,
    TimelineRetentionPolicyCreateRequest,
    TimelineRetentionPolicyPageRead,
    TimelineRetentionPolicyRead,
    TimelineRetentionPolicyUpdateRequest,
    TimelineRetentionResultRead,
    TimelineRetentionRunRequest,
)
from app.services.timeline import TimelineService

router = APIRouter(tags=["Account History and Timeline"])


@router.get(
    "/api/accounts/{account_id}/timeline",
    response_model=TimelineEventPageRead,
    summary="List account timeline",
    description="Returns source-linked account timeline entries with RBAC, sensitivity filtering, search, filters, sorting, and pagination.",
    responses={401: {"description": "Missing, invalid, or expired token."}, 403: {"description": "User cannot view this account timeline."}, 404: {"description": "Account was not found."}},
)
def list_account_timeline(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    search: Annotated[str | None, Query(description="Keyword search across authorized timeline text.")] = None,
    event_type: Annotated[str | None, Query(description="Filter by event type slug.")] = None,
    module: Annotated[str | None, Query(description="Filter by source module.")] = None,
    owner_id: Annotated[str | None, Query(description="Filter by actor/owner user ID.")] = None,
    source_record_type: Annotated[str | None, Query(description="Filter by linked source record type.")] = None,
    source_record_id: Annotated[str | None, Query(description="Filter by linked source record ID.")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by timeline status: active, archived, or restricted.")] = None,
    sensitivity_level: Annotated[str | None, Query(description="Filter by sensitivity level where caller can view sensitive entries.")] = None,
    account_stage: Annotated[str | None, Query(description="Filter by current account stage/lifecycle status.")] = None,
    risk_status: Annotated[str | None, Query(description="Filter by current account risk status.")] = None,
    date_from: Annotated[datetime | None, Query(description="Filter events at or after this timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Filter events at or before this timestamp.")] = None,
    show_sensitive: Annotated[bool, Query(description="Request sensitive entries where caller is authorized.")] = False,
    sort: Annotated[str, Query(description="Sort field: event_at or created_at.")] = "event_at",
    direction: Annotated[str, Query(pattern="^(asc|desc)$", description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 100,
) -> TimelineEventPageRead:
    return service.list_account_events(
        account_id,
        current_user,
        search=search,
        event_type=event_type,
        module=module,
        owner_id=owner_id,
        source_record_type=source_record_type,
        source_record_id=source_record_id,
        status_filter=status_filter,
        sensitivity_level=sensitivity_level,
        account_stage=account_stage,
        risk_status=risk_status,
        date_from=date_from,
        date_to=date_to,
        show_sensitive=show_sensitive,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.get("/api/timeline-events/{event_id}", response_model=TimelineEventRead, summary="Read timeline event")
def read_timeline_event(
    event_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> TimelineEventRead:
    return service.get_event(event_id, current_user)


@router.post(
    "/api/accounts/{account_id}/timeline-notes",
    response_model=TimelineEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create manual timeline note",
    description="Creates a persisted manual timeline note with active event type validation, mentions, attachments, sensitivity, and audit logging.",
)
def create_timeline_note(
    account_id: str,
    payload: TimelineNoteCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> TimelineEventRead:
    return service.create_note(account_id, payload, current_user)


@router.patch("/api/timeline-events/{event_id}", response_model=TimelineEventRead, summary="Update mutable manual timeline event")
def update_timeline_event(
    event_id: str,
    payload: TimelineEventUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> TimelineEventRead:
    return service.update_event(event_id, payload, current_user)


@router.post("/api/timeline-events/{event_id}/archive", response_model=TimelineEventRead, summary="Archive timeline event")
def archive_timeline_event(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineEventRead:
    return service.archive_event(event_id, current_user)


@router.post("/api/timeline-events/{event_id}/restrict", response_model=TimelineEventRead, summary="Restrict timeline event")
def restrict_timeline_event(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineEventRead:
    return service.restrict_event(event_id, current_user)


@router.delete("/api/timeline-events/{event_id}", response_model=MessageResponse, summary="Delete timeline event with tombstone")
def delete_timeline_event(event_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> dict[str, str]:
    return service.delete_event(event_id, current_user)


@router.get("/api/timeline-events/{event_id}/comments", response_model=TimelineCommentPageRead, summary="List timeline comments")
def list_timeline_comments(
    event_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> TimelineCommentPageRead:
    return service.list_comments(event_id, current_user, page=page, page_size=page_size)


@router.post("/api/timeline-events/{event_id}/comments", response_model=TimelineCommentRead, status_code=status.HTTP_201_CREATED, summary="Create timeline comment")
def create_timeline_comment(
    event_id: str,
    payload: TimelineCommentCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> TimelineCommentRead:
    return service.create_comment(event_id, payload, current_user)


@router.patch("/api/timeline-events/{event_id}/comments/{comment_id}", response_model=TimelineCommentRead, summary="Update timeline comment")
def update_timeline_comment(
    event_id: str,
    comment_id: str,
    payload: TimelineCommentUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> TimelineCommentRead:
    return service.update_comment(event_id, comment_id, payload, current_user)


@router.delete("/api/timeline-events/{event_id}/comments/{comment_id}", response_model=MessageResponse, summary="Delete timeline comment")
def delete_timeline_comment(
    event_id: str,
    comment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
) -> dict[str, str]:
    return service.delete_comment(event_id, comment_id, current_user)


@router.get("/api/admin/timeline-event-types", response_model=TimelineEventTypePageRead, summary="List timeline event type configuration")
def list_event_types(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    search: str | None = None,
    active_state: str = "all",
    category: str | None = None,
    module: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> TimelineEventTypePageRead:
    return service.list_event_types(current_user, search=search, active_state=active_state, category=category, module=module, page=page, page_size=page_size)


@router.post("/api/admin/timeline-event-types", response_model=TimelineEventTypeRead, status_code=status.HTTP_201_CREATED, summary="Create timeline event type")
def create_event_type(payload: TimelineEventTypeCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineEventTypeRead:
    return service.create_event_type(payload, current_user)


@router.patch("/api/admin/timeline-event-types/{type_id}", response_model=TimelineEventTypeRead, summary="Update timeline event type")
def update_event_type(type_id: str, payload: TimelineEventTypeUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineEventTypeRead:
    return service.update_event_type(type_id, payload, current_user)


@router.get("/api/admin/retention-policies", response_model=TimelineRetentionPolicyPageRead, summary="List timeline retention policies")
def list_retention_policies(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    search: str | None = None,
    active_state: str = "all",
    entity_type: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> TimelineRetentionPolicyPageRead:
    return service.list_retention_policies(current_user, search=search, active_state=active_state, entity_type=entity_type, page=page, page_size=page_size)


@router.post("/api/admin/retention-policies", response_model=TimelineRetentionPolicyRead, status_code=status.HTTP_201_CREATED, summary="Create timeline retention policy")
def create_retention_policy(payload: TimelineRetentionPolicyCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineRetentionPolicyRead:
    return service.create_retention_policy(payload, current_user)


@router.patch("/api/admin/retention-policies/{policy_id}", response_model=TimelineRetentionPolicyRead, summary="Update timeline retention policy")
def update_retention_policy(policy_id: str, payload: TimelineRetentionPolicyUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineRetentionPolicyRead:
    return service.update_retention_policy(policy_id, payload, current_user)


@router.post("/api/admin/retention-policies/{policy_id}/simulate", response_model=TimelineRetentionResultRead, summary="Simulate timeline retention policy")
def simulate_retention_policy(policy_id: str, payload: TimelineRetentionRunRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineRetentionResultRead:
    return service.simulate_retention_policy(policy_id, payload, current_user)


@router.post("/api/admin/retention-policies/{policy_id}/run", response_model=TimelineRetentionResultRead, summary="Run timeline retention policy manually")
def run_retention_policy(policy_id: str, payload: TimelineRetentionRunRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineRetentionResultRead:
    return service.run_retention_policy(policy_id, payload, current_user)


@router.get("/api/admin/retention-actions", response_model=TimelineRetentionActionPageRead, summary="List timeline retention action history")
def list_retention_actions(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    search: str | None = None,
    action: str | None = None,
    mode: str | None = None,
    actor_id: str | None = None,
    entity_type: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> TimelineRetentionActionPageRead:
    return service.list_retention_actions(current_user, search=search, action=action, mode=mode, actor_id=actor_id, entity_type=entity_type, status_filter=status_filter, page=page, page_size=page_size)


@router.post("/api/accounts/{account_id}/handover-summary", response_model=HandoverSummaryRead, status_code=status.HTTP_201_CREATED, summary="Generate handover summary")
def generate_handover_summary(account_id: str, payload: HandoverSummaryCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> HandoverSummaryRead:
    return service.generate_handover_summary(account_id, payload, current_user)


@router.get("/api/accounts/{account_id}/handover-summaries", response_model=HandoverSummaryPageRead, summary="List handover summaries")
def list_handover_summaries(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimelineService, Depends(get_timeline_service)],
    search: Annotated[str | None, Query(description="Search generated-by name, sections, citations, and summary content.")] = None,
    generated_by_id: Annotated[str | None, Query(description="Filter by generator user ID.")] = None,
    ownership_change_id: Annotated[str | None, Query(description="Filter by ownership-change context.")] = None,
    date_from: Annotated[datetime | None, Query(description="Filter summaries created at or after this timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Filter summaries created at or before this timestamp.")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> HandoverSummaryPageRead:
    return service.list_handover_summaries(
        account_id,
        current_user,
        page=page,
        page_size=page_size,
        search=search,
        generated_by_id=generated_by_id,
        ownership_change_id=ownership_change_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/api/handover-summaries/{summary_id}", response_model=HandoverSummaryRead, summary="Read handover summary")
def read_handover_summary(summary_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> HandoverSummaryRead:
    return service.get_handover_summary(summary_id, current_user)


@router.post("/api/handover-summaries/{summary_id}/export", summary="Export handover summary as PDF")
def export_handover_summary(summary_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> Response:
    content = service.export_handover_pdf(summary_id, current_user)
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=handover-{summary_id}.pdf"})


@router.post("/api/handover-summaries/{summary_id}/share", response_model=HandoverShareRead, summary="Create internal handover share link")
def share_handover_summary(summary_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> HandoverShareRead:
    return service.share_handover(summary_id, current_user)


@router.post("/api/accounts/{account_id}/timeline/ai-search", response_model=TimelineAiSearchResponse, summary="Run AI Timeline Search")
def ai_timeline_search(account_id: str, payload: TimelineAiSearchRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TimelineService, Depends(get_timeline_service)]) -> TimelineAiSearchResponse:
    return service.ai_timeline_search(account_id, payload, current_user)
