from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_task_service
from app.models import User
from app.schemas import (
    PlaybookExecutionRead,
    PlaybookExecutionRequest,
    PlaybookTemplateCreateRequest,
    PlaybookTemplatePageRead,
    PlaybookTemplateRead,
    PlaybookTemplateUpdateRequest,
    TaskCreateRequest,
    TaskEvidenceCreateRequest,
    TaskEvidenceRead,
    TaskPageRead,
    TaskRead,
    TaskUpdateRequest,
    UnifiedCalendarPageRead,
)
from app.services.tasks import TaskService

Direction = Literal["asc", "desc"]
TaskSort = Literal["due_at", "priority", "status", "owner_name", "updated_at", "created_at"]
TemplateSort = Literal["name", "status", "updated_at", "created_at"]
ActiveState = Literal["all", "active", "inactive"]

router = APIRouter(prefix="/api", tags=["Playbooks, Tasks, and Calendar"])


@router.get("/admin/playbook-templates", response_model=PlaybookTemplatePageRead, summary="List playbook templates", description="Admin playbook template list with search, status, signal type, active-state filters, sorting, and pagination.")
def list_templates(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TaskService, Depends(get_task_service)],
    search: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    signal_type: str | None = None,
    active_state: ActiveState = "active",
    sort: TemplateSort = "updated_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> PlaybookTemplatePageRead:
    return service.list_templates(current_user, search=search, status_filter=status_filter, signal_type=signal_type, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/admin/playbook-templates", response_model=PlaybookTemplateRead, status_code=status.HTTP_201_CREATED, summary="Create playbook template", description="Creates a configurable playbook template with activities, owner rules, due-date rules, success criteria, and skip rules.")
def create_template(payload: PlaybookTemplateCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> PlaybookTemplateRead:
    return service.create_template(payload, current_user)


@router.patch("/admin/playbook-templates/{template_id}", response_model=PlaybookTemplateRead, summary="Update playbook template", description="Updates a playbook template and versions it when active execution-impacting configuration changes.")
def update_template(template_id: str, payload: PlaybookTemplateUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> PlaybookTemplateRead:
    return service.update_template(template_id, payload, current_user)


@router.post("/playbooks/{template_id}/execute", response_model=PlaybookExecutionRead, status_code=status.HTTP_201_CREATED, summary="Execute playbook", description="Executes an active playbook after user selection and creates tasks for each configured activity.")
def execute_playbook(template_id: str, payload: PlaybookExecutionRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> PlaybookExecutionRead:
    return service.execute_playbook(template_id, account_id=payload.account_id, engagement_id=payload.engagement_id, signal_id=payload.signal_id, current_user=current_user, customization=payload.customization_json)


@router.get("/tasks", response_model=TaskPageRead, summary="List tasks", description="Paginated task list with account, engagement, search, status, priority, owner, source, due-date, sort, and pagination support.")
def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TaskService, Depends(get_task_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    priority: Literal["low", "medium", "high", "critical"] | None = None,
    owner_id: str | None = None,
    source_type: str | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    active_only: bool = False,
    sort: TaskSort = "due_at",
    direction: Direction = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> TaskPageRead:
    return service.list_tasks(
        current_user,
        account_id=account_id,
        engagement_id=engagement_id,
        search=search,
        status_filter=status_filter,
        priority=priority,
        owner_id=owner_id,
        source_type=source_type,
        due_from=due_from,
        due_to=due_to,
        active_only=active_only,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED, summary="Create task", description="Creates a manual task with owner, due date, priority, source links, notes, evidence, and audit history.")
def create_task(payload: TaskCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> TaskRead:
    return service.create_task(payload, current_user)


@router.patch("/tasks/{task_id}", response_model=TaskRead, summary="Update task", description="Updates task details or lifecycle status with validation, owner authorization, and audit history.")
def update_task(task_id: str, payload: TaskUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> TaskRead:
    return service.update_task(task_id, payload, current_user)


@router.post("/tasks/{task_id}/evidence", response_model=TaskEvidenceRead, status_code=status.HTTP_201_CREATED, summary="Add task evidence", description="Adds note, URL, or file-style evidence to a task and appends immutable task history.")
def add_task_evidence(task_id: str, payload: TaskEvidenceCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[TaskService, Depends(get_task_service)]) -> TaskEvidenceRead:
    return service.add_evidence(task_id, payload, current_user)


@router.get("/calendar/items", response_model=UnifiedCalendarPageRead, summary="List unified calendar items", description="Returns task due dates, governance events, SOW expiry, renewal dates, and notice windows with date/owner/account filters and pagination.")
def calendar_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TaskService, Depends(get_task_service)],
    account_id: str | None = None,
    owner_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> UnifiedCalendarPageRead:
    return service.calendar_items(current_user, account_id=account_id, owner_id=owner_id, date_from=date_from, date_to=date_to, page=page, page_size=page_size)
