from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, UploadFile, status

from app.dependencies import get_current_user, get_playbooks_tasks_service
from app.models import User
from app.schemas import (
    CalendarItemPageRead,
    PlaybookExecutionRead,
    PlaybookExecutionRequest,
    PlaybookTemplateCreateRequest,
    PlaybookTemplatePageRead,
    PlaybookTemplateRead,
    PlaybookTemplateUpdateRequest,
    RecommendedPlaybookRead,
    TaskCreateRequest,
    TaskEvidenceRead,
    TaskPageRead,
    TaskRead,
    TaskUpdateRequest,
)
from app.services.playbooks_tasks import PlaybooksTasksService

Direction = Literal["asc", "desc"]
ActiveState = Literal["all", "active", "inactive"]
TemplateSort = Literal["name", "version", "active_state", "updated_at", "created_at"]
TaskSort = Literal["due_at", "priority", "status", "updated_at", "created_at"]

router = APIRouter(prefix="/api", tags=["Playbooks and Tasks"])


@router.get("/admin/playbook-templates", response_model=PlaybookTemplatePageRead, summary="List playbook templates", description="Paginated playbook template catalog with search, active-state, signal, metric, owner-rule, sort, and RBAC filters.")
def list_templates(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)],
    search: str | None = None,
    active_state: ActiveState = "active",
    signal_type: str | None = None,
    weak_metric: str | None = None,
    owner_rule: str | None = None,
    sort: TemplateSort = "updated_at",
    direction: Direction = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> PlaybookTemplatePageRead:
    return service.list_templates(current_user, search=search, active_state=active_state, signal_type=signal_type, weak_metric=weak_metric, owner_rule=owner_rule, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/admin/playbook-templates", response_model=PlaybookTemplateRead, status_code=status.HTTP_201_CREATED, summary="Create playbook template", description="Requires playbooks:configure_templates. Creates a configurable playbook template with objectives, activities, owners, due-date rules, success criteria, skip rules, audit, and Field Builder values.")
def create_template(payload: PlaybookTemplateCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)]) -> PlaybookTemplateRead:
    return service.create_template(payload, current_user)


@router.patch("/admin/playbook-templates/{template_id}", response_model=PlaybookTemplateRead, summary="Update playbook template", description="Requires playbooks:configure_templates. Updates template configuration, versions material changes, and preserves historical execution snapshots.")
def update_template(template_id: str, payload: PlaybookTemplateUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)]) -> PlaybookTemplateRead:
    return service.update_template(template_id, payload, current_user)


@router.get("/signals/{signal_id}/recommended-playbooks", response_model=list[RecommendedPlaybookRead], summary="List recommended playbooks", description="Rule-based bridge endpoint that matches active playbook templates to a signal id plus optional signal type/metric context.")
def recommended_playbooks(
    signal_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)],
    signal_type: str | None = None,
    weak_metric: str | None = None,
    account_id: str | None = None,
    engagement_id: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> list[RecommendedPlaybookRead]:
    return service.recommended_playbooks(signal_id, current_user, signal_type=signal_type, weak_metric=weak_metric, account_id=account_id, engagement_id=engagement_id, page=page, page_size=page_size)


@router.post("/playbooks/{template_id}/execute", response_model=PlaybookExecutionRead, status_code=status.HTTP_201_CREATED, summary="Execute playbook", description="Requires playbooks:execute and account work access. Executes a confirmed active playbook template and creates account-specific tasks without silently changing health metrics.")
def execute_playbook(template_id: str, payload: PlaybookExecutionRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)]) -> PlaybookExecutionRead:
    return service.execute_playbook(template_id, payload, current_user)


@router.get("/tasks", response_model=TaskPageRead, summary="List tasks", description="Paginated task list with account, engagement, owner, status, priority, source, due-window, my-items, search, and sort filters.")
def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    owner_id: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    priority: str | None = None,
    source_type: str | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    search: str | None = None,
    my_items: bool = False,
    sort: TaskSort = "due_at",
    direction: Direction = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> TaskPageRead:
    return service.list_tasks(current_user, account_id=account_id, engagement_id=engagement_id, owner_id=owner_id, status_filter=status_filter, priority=priority, source_type=source_type, due_from=due_from, due_to=due_to, search=search, my_items=my_items, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED, summary="Create task", description="Creates a manual account task/activity with owner, due date, status, priority, notes, success criteria, Field Builder values, audit, and timeline entry.")
def create_task(payload: TaskCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)]) -> TaskRead:
    return service.create_task(payload, current_user)


@router.patch("/tasks/{task_id}", response_model=TaskRead, summary="Update task", description="Updates task details, status, owner, outcome, skip reason, completion metadata, Field Builder values, audit, and timeline entries.")
def update_task(task_id: str, payload: TaskUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)]) -> TaskRead:
    return service.update_task(task_id, payload, current_user)


@router.post("/tasks/{task_id}/evidence", response_model=TaskEvidenceRead, status_code=status.HTTP_201_CREATED, summary="Add task evidence", description="Adds note, link, or file evidence to a task using the existing storage adapter and writes audit/timeline history.")
async def add_task_evidence(
    task_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)],
) -> TaskEvidenceRead:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        evidence_type = str(form.get("evidence_type") or "note")
        title = str(form.get("title")) if form.get("title") else None
        body = str(form.get("body") or form.get("note")) if form.get("body") or form.get("note") else None
        url = str(form.get("url")) if form.get("url") else None
        maybe_file = form.get("file")
        file = maybe_file if hasattr(maybe_file, "filename") else None
    else:
        payload = await request.json()
        evidence_type = str(payload.get("evidence_type") or "note")
        title = payload.get("title")
        body = payload.get("body") or payload.get("note")
        url = payload.get("url")
        file = None
    if evidence_type == "url":
        evidence_type = "link"
    return await service.add_task_evidence(task_id, current_user, evidence_type=evidence_type, title=title, body=body, url=url, file=file)


@router.get("/calendar/items", response_model=CalendarItemPageRead, summary="List unified calendar items", description="Aggregates governance events/action items, playbook tasks, SOW expiry, renewal dates, and notice deadlines with permission-aware filtering.")
def list_calendar_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PlaybooksTasksService, Depends(get_playbooks_tasks_service)],
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    account_id: str | None = None,
    engagement_id: str | None = None,
    owner_id: str | None = None,
    my_items: bool = False,
    include_governance: bool = True,
    include_tasks: bool = True,
    include_renewals: bool = True,
    search: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 100,
) -> CalendarItemPageRead:
    return service.calendar_items(current_user, date_from=date_from, date_to=date_to, account_id=account_id, engagement_id=engagement_id, owner_id=owner_id, my_items=my_items, include_governance=include_governance, include_tasks=include_tasks, include_renewals=include_renewals, search=search, page=page, page_size=page_size)
