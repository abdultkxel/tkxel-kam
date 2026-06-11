from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_notifications_service
from app.models import User
from app.schemas import (
    DigestPreviewRequest,
    DigestRunPageRead,
    DigestRunRead,
    DigestSchedulePageRead,
    DigestScheduleRead,
    DigestScheduleRequest,
    DigestScheduleUpdateRequest,
    NotificationDefaultsRead,
    NotificationDefaultsUpdateRequest,
    NotificationPageRead,
    NotificationPreferenceRead,
    NotificationPreferenceUpdateRequest,
    NotificationRecordRead,
    NotificationSchedulerDryRunRead,
    NotificationSummaryRead,
    NotificationTriggerConfigRead,
    NotificationTriggerTestRequest,
    NotificationTriggerUpdateRequest,
    ScheduledWorkerRunPageRead,
    SlaEscalatedItemPageRead,
    SlaEvaluationRead,
    SlaRuleCreateRequest,
    SlaRulePageRead,
    SlaRuleRead,
    SlaRuleUpdateRequest,
)
from app.services.notifications import NotificationsService

Direction = Literal["asc", "desc"]

router = APIRouter(prefix="/api", tags=["Notifications, SLA Escalation, and Executive Digests"])


@router.get("/notifications", response_model=NotificationPageRead, summary="List notifications", description="Lists current user's notifications with search, read-state, trigger, account, channel, date filters, sort, and pagination.")
def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
    search: str | None = None,
    read_state: Annotated[str | None, Query(pattern="^(read|unread|archived)$")] = None,
    trigger: str | None = None,
    workflow: str | None = None,
    priority: Literal["low", "medium", "high", "critical"] | None = None,
    account_id: str | None = None,
    channel: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: Literal["created_at", "priority", "trigger", "unread_first"] = "created_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> NotificationPageRead:
    return service.list_notifications(current_user, search=search, read_state=read_state, trigger=trigger, workflow=workflow, priority=priority, account_id=account_id, channel=channel, date_from=date_from, date_to=date_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.get("/notifications/summary", response_model=NotificationSummaryRead, summary="Notification bell summary", description="Returns unread count and latest persisted notifications for the navbar bell.")
def notification_summary(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationSummaryRead:
    return service.notification_summary(current_user)


@router.patch("/notifications/read-all", response_model=dict[str, int], summary="Mark all notifications read", description="Marks every unread notification for the current user as read.")
def mark_all_notifications_read(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> dict[str, int]:
    return service.mark_all_notifications_read(current_user)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationRecordRead, summary="Mark notification read", description="Marks a single notification read if it belongs to the current user.")
def mark_notification_read(notification_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationRecordRead:
    return service.mark_notification_read(notification_id, current_user)


@router.patch("/notifications/{notification_id}/archive", response_model=NotificationRecordRead, summary="Archive notification", description="Archives a single notification so it is hidden from the navbar bell and default notification center view.")
def archive_notification(notification_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationRecordRead:
    return service.archive_notification(notification_id, current_user)


@router.get("/notifications/triggers", response_model=NotificationDefaultsRead, summary="List notification triggers", description="Returns active and inactive notification trigger metadata used by admin defaults and preference screens.")
def list_notification_triggers(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationDefaultsRead:
    return service.list_trigger_configs(current_user)


@router.get("/users/me/notification-preferences", response_model=list[NotificationPreferenceRead], summary="Get notification preferences", description="Returns effective notification preferences merged with trigger defaults for the current user.")
def get_notification_preferences(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> list[NotificationPreferenceRead]:
    return service.get_preferences(current_user)


@router.put("/users/me/notification-preferences", response_model=list[NotificationPreferenceRead], summary="Update notification preferences", description="Updates current user's preferences and blocks disabling mandatory triggers.")
def update_notification_preferences(payload: NotificationPreferenceUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> list[NotificationPreferenceRead]:
    return service.update_preferences(payload, current_user)


@router.get("/admin/notification-defaults", response_model=NotificationDefaultsRead, summary="Get notification defaults", description="Admin/KAM Head view of notification trigger defaults, mandatory policy, and supported delivery channels.")
def get_notification_defaults(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationDefaultsRead:
    return service.get_defaults(current_user)


@router.put("/admin/notification-defaults", response_model=NotificationDefaultsRead, summary="Update notification defaults", description="Updates notification trigger defaults and mandatory policies for future delivery.")
def update_notification_defaults(payload: NotificationDefaultsUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationDefaultsRead:
    return service.update_defaults(payload, current_user)


@router.patch("/admin/notification-triggers/{trigger}", response_model=NotificationTriggerConfigRead, summary="Update one notification trigger", description="Updates admin workflow, channel, timing, reminder, and escalation settings for one notification trigger.")
def update_notification_trigger(trigger: str, payload: NotificationTriggerUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationTriggerConfigRead:
    return service.update_trigger_config(trigger, payload, current_user)


@router.post("/admin/notification-triggers/{trigger}/reset-defaults", response_model=NotificationTriggerConfigRead, summary="Reset notification trigger", description="Restores one notification trigger to the workflow catalog defaults.")
def reset_notification_trigger(trigger: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationTriggerConfigRead:
    return service.reset_trigger_config(trigger, current_user)


@router.post("/admin/notification-triggers/{trigger}/test", response_model=NotificationRecordRead, summary="Send test notification", description="Creates a persisted test notification for the selected trigger and recipient.")
def test_notification_trigger(trigger: str, payload: NotificationTriggerTestRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationRecordRead:
    return service.test_trigger(trigger, payload, current_user)


@router.post("/admin/notification-scheduler/dry-run", response_model=NotificationSchedulerDryRunRead, summary="Dry-run notification scheduler", description="Evaluates active timed triggers without creating recipient notifications.")
def dry_run_notification_scheduler(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> NotificationSchedulerDryRunRead:
    return service.dry_run_scheduler(current_user)


@router.get("/admin/notification-scheduler/runs", response_model=ScheduledWorkerRunPageRead, summary="List notification scheduler runs", description="Paginated scheduler run history for notification dry runs and future scheduled notification workers.")
def list_notification_scheduler_runs(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)], job_type: str | None = "notification_scheduler", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> ScheduledWorkerRunPageRead:
    return service.list_scheduler_runs(current_user, job_type=job_type, page=page, page_size=page_size)


@router.get("/admin/sla-rules", response_model=SlaRulePageRead, summary="List SLA rules", description="Paginated SLA rule list with search, item type, active state, and RBAC.")
def list_sla_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
    search: str | None = None,
    item_type: str | None = None,
    active_state: Literal["all", "active", "inactive"] = "all",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> SlaRulePageRead:
    return service.list_sla_rules(current_user, search=search, item_type=item_type, active_state=active_state, page=page, page_size=page_size)


@router.post("/admin/sla-rules", response_model=SlaRuleRead, status_code=status.HTTP_201_CREATED, summary="Create SLA rule", description="Creates an inactivity SLA rule for signals, tasks, stale KYC, or formal escalations.")
def create_sla_rule(payload: SlaRuleCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> SlaRuleRead:
    return service.create_sla_rule(payload, current_user)


@router.patch("/admin/sla-rules/{rule_id}", response_model=SlaRuleRead, summary="Update SLA rule", description="Updates an SLA rule, including window, qualifying activities, recipient policy, and active state.")
def update_sla_rule(rule_id: str, payload: SlaRuleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> SlaRuleRead:
    return service.update_sla_rule(rule_id, payload, current_user)


@router.get("/escalated-items", response_model=SlaEscalatedItemPageRead, summary="List escalated SLA items", description="Paginated SLA escalated-item list with search, source type, owner, account, severity, state, date filters, sorting, and pagination.")
def list_escalated_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
    search: str | None = None,
    item_type: str | None = None,
    owner_id: str | None = None,
    account_id: str | None = None,
    severity: str | None = None,
    state: str | None = None,
    escalated_from: datetime | None = None,
    escalated_to: datetime | None = None,
    sort: Literal["escalated_at", "severity", "title", "last_activity_at"] = "escalated_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> SlaEscalatedItemPageRead:
    return service.list_escalated_items(current_user, search=search, item_type=item_type, owner_id=owner_id, account_id=account_id, severity=severity, state=state, escalated_from=escalated_from, escalated_to=escalated_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/sla/jobs/evaluate", response_model=SlaEvaluationRead, summary="Run SLA evaluation", description="Runs the inactivity SLA evaluator immediately and creates deduplicated escalated items/notifications.")
def evaluate_sla(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> SlaEvaluationRead:
    return service.evaluate_sla(current_user, mode="manual")


@router.get("/digests", response_model=DigestRunPageRead, summary="List digest history", description="Paginated executive digest run history with search, recipient, status, and date filters.")
def list_digests(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationsService, Depends(get_notifications_service)],
    search: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    recipient: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> DigestRunPageRead:
    return service.list_digest_runs(current_user, search=search, status_filter=status_filter, recipient=recipient, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.get("/digests/schedules", response_model=DigestSchedulePageRead, summary="List digest schedules", description="Paginated executive digest schedules.")
def list_digest_schedules(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)], search: str | None = None, status_filter: Annotated[str, Query(alias="status")] = "all", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> DigestSchedulePageRead:
    return service.list_digest_schedules(current_user, search=search, status_filter=status_filter, page=page, page_size=page_size)


@router.post("/digests/schedules", response_model=DigestScheduleRead, status_code=status.HTTP_201_CREATED, summary="Create digest schedule", description="Creates a permission-scoped executive digest schedule.")
def create_digest_schedule(payload: DigestScheduleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> DigestScheduleRead:
    return service.create_digest_schedule(payload, current_user)


@router.patch("/digests/schedules/{schedule_id}", response_model=DigestScheduleRead, summary="Update digest schedule", description="Updates cadence, timezone, recipients, sections, channels, and active state.")
def update_digest_schedule(schedule_id: str, payload: DigestScheduleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> DigestScheduleRead:
    return service.update_digest_schedule(schedule_id, payload, current_user)


@router.post("/digests/preview", response_model=DigestRunRead, summary="Preview digest", description="Generates a permission-scoped digest preview and logs the preview run.")
def preview_digest(payload: DigestPreviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> DigestRunRead:
    return service.preview_digest(payload, current_user)


@router.get("/digests/{digest_id}", response_model=DigestRunRead, summary="Read digest", description="Reads a generated digest run if the user can view notifications and digests.")
def get_digest(digest_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> DigestRunRead:
    return service.get_digest_run(digest_id, current_user)


@router.post("/digests/{digest_id}/send", response_model=DigestRunRead, summary="Send digest", description="Queues in-app notifications for digest recipients and logs delivery attempts.")
def send_digest(digest_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[NotificationsService, Depends(get_notifications_service)]) -> DigestRunRead:
    return service.send_digest(digest_id, current_user)
