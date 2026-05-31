from datetime import datetime
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.dependencies import get_content_service, get_current_user
from app.models import User
from app.schemas import (
    ContentItemCreateRequest,
    ContentItemPageRead,
    ContentItemRead,
    ContentItemUpdateRequest,
    ContentRecommendationRead,
    MessageResponse,
    SentContentCreateRequest,
    SentContentPageRead,
    SentContentRead,
    SentContentUpdateRequest,
)
from app.services.content import ContentService

Direction = Literal["asc", "desc"]
ContentSort = Literal["name", "updated_at", "popularity", "created_at"]
ActiveState = Literal["all", "active", "inactive"]
SentContentSort = Literal["shared_at", "follow_up_status"]

router = APIRouter(prefix="/api", tags=["Client Education Content"])


@router.get(
    "/content",
    response_model=ContentItemPageRead,
    summary="List content catalog",
    description="Paginated content catalog with search, taxonomy filters, active-state filters, sorting, and RBAC enforcement.",
)
def list_content(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ContentService, Depends(get_content_service)],
    search: Annotated[str | None, Query(description="Search title, description, category, and tags.")] = None,
    content_type: Annotated[str | None, Query(description="Filter by content type.")] = None,
    category: Annotated[str | None, Query(description="Filter by category.")] = None,
    tag: Annotated[str | None, Query(description="Filter by tag.")] = None,
    service_line: Annotated[str | None, Query(description="Filter by service line.")] = None,
    account_stage: Annotated[str | None, Query(description="Filter by matching account stage.")] = None,
    active_state: Annotated[ActiveState, Query(description="Active-state filter.")] = "active",
    sort: Annotated[ContentSort, Query(description="Sort field.")] = "updated_at",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ContentItemPageRead:
    return service.list_content(current_user, search=search, content_type=content_type, category=category, tag=tag, service_line=service_line, account_stage=account_stage, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size)


@router.get("/admin/content", response_model=ContentItemPageRead, summary="List admin content catalog", description="Admin alias for the content catalog so the Admin Content tab can lazy-load catalog data.")
def list_admin_content(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ContentService, Depends(get_content_service)],
    search: str | None = None,
    active_state: ActiveState = "all",
    page: int = 1,
    page_size: int = 10,
) -> ContentItemPageRead:
    return service.list_content(current_user, search=search, active_state=active_state, page=page, page_size=page_size)


@router.post("/content", response_model=ContentItemRead, status_code=status.HTTP_201_CREATED, summary="Create content item", description="Creates a manual or URL-backed content item with validation, audit logging, and RBAC.")
def create_content(payload: ContentItemCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> ContentItemRead:
    return service.create_content(payload, current_user)


@router.post("/content/upload", response_model=ContentItemRead, status_code=status.HTTP_201_CREATED, summary="Upload content file", description="Stores a content file using the configured storage adapter. Local storage is supported now and S3 can be swapped in later.")
async def upload_content(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ContentService, Depends(get_content_service)],
    title: Annotated[str, Form()],
    content_type: Annotated[str, Form()],
    category: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    description: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
    service_lines: Annotated[str | None, Form()] = None,
    account_stages: Annotated[str | None, Form()] = None,
    custom_field_values: Annotated[str | None, Form()] = None,
) -> ContentItemRead:
    try:
        custom_values = json.loads(custom_field_values) if custom_field_values else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Custom field values must be valid JSON") from exc
    return await service.upload_content_file(
        current_user,
        title=title,
        content_type=content_type,
        category=category,
        description=description,
        file=file,
        tags=_split_form_list(tags),
        service_lines=_split_form_list(service_lines),
        account_stages=_split_form_list(account_stages),
        custom_field_values=custom_values,
    )


@router.patch("/content/{content_id}", response_model=ContentItemRead, summary="Update content item", description="Updates content catalog metadata and writes an audit entry.")
def update_content(content_id: str, payload: ContentItemUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> ContentItemRead:
    return service.update_content(content_id, payload, current_user)


@router.delete("/content/{content_id}", response_model=MessageResponse, summary="Delete or archive content item", description="Deletes unused content or archives content that already has sent-content history.")
def delete_content(content_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> MessageResponse:
    return service.delete_content(content_id, current_user)


@router.get("/accounts/{account_id}/content-recommendations", response_model=list[ContentRecommendationRead], summary="List account content recommendations", description="Returns recommendation cards with rationale and source context. This does not create sent-content history.")
def recommendations(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> list[ContentRecommendationRead]:
    return service.recommendations(account_id, current_user)


@router.get("/accounts/{account_id}/sent-content", response_model=SentContentPageRead, summary="List account sent-content history", description="Paginated account sent-content history with search, filters, sorting, timeline links, and RBAC.")
def list_sent_content(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ContentService, Depends(get_content_service)],
    search: str | None = None,
    engagement_id: str | None = None,
    sender_id: str | None = None,
    recipient: str | None = None,
    follow_up_status: str | None = None,
    content_tag: str | None = None,
    shared_from: datetime | None = None,
    shared_to: datetime | None = None,
    sort: SentContentSort = "shared_at",
    direction: Direction = "desc",
    page: int = 1,
    page_size: int = 10,
) -> SentContentPageRead:
    return service.list_sent_content(account_id, current_user, search=search, engagement_id=engagement_id, sender_id=sender_id, recipient=recipient, follow_up_status=follow_up_status, content_tag=content_tag, shared_from=shared_from, shared_to=shared_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/accounts/{account_id}/sent-content", response_model=SentContentRead, status_code=status.HTTP_201_CREATED, summary="Record sent content", description="Records a confirmed share/send action and writes account timeline and audit entries.")
def create_sent_content(account_id: str, payload: SentContentCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> SentContentRead:
    return service.create_sent_content(account_id, payload, current_user)


@router.patch("/sent-content/{sent_content_id}", response_model=SentContentRead, summary="Update sent-content follow-up", description="Updates follow-up status, due date, or notes for a sent-content record.")
def update_sent_content(sent_content_id: str, payload: SentContentUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ContentService, Depends(get_content_service)]) -> SentContentRead:
    return service.update_sent_content(sent_content_id, payload, current_user)


def _split_form_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]
