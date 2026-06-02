from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_admin_security_service, get_current_user
from app.models import User
from app.schemas import (
    AccessLogPageRead,
    AccessLogRead,
    AuditLogPageRead,
    AuditLogRead,
    ConfigurationChangeCreateRequest,
    ConfigurationChangePageRead,
    ConfigurationChangeRead,
    ErrorLogPageRead,
    FieldPermissionPageRead,
    FieldPermissionRead,
    FieldPermissionRequest,
    JobLogPageRead,
    MessageResponse,
    SystemHealthRead,
)
from app.services.admin_security import AdminSecurityService

router = APIRouter(prefix="/api/admin", tags=["Admin Security, Audit, and Platform Readiness"])


@router.get("/audit-logs", response_model=AuditLogPageRead, summary="List audit logs", description="Lists audit logs with search, filters, and pagination.")
def list_audit_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AdminSecurityService, Depends(get_admin_security_service)],
    search: str | None = None,
    module: str | None = None,
    action: str | None = None,
    actor_id: str | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AuditLogPageRead:
    return service.list_audit_logs(current_user, search=search, module=module, action=action, actor_id=actor_id, entity_type=entity_type, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.get("/audit-logs/export", response_model=dict, summary="Export audit logs", description="Exports up to 500 filtered audit log rows and records a separate export audit event.")
def export_audit_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AdminSecurityService, Depends(get_admin_security_service)],
    search: str | None = None,
    module: str | None = None,
    action: str | None = None,
    actor_id: str | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict:
    return service.export_audit_logs(current_user, search=search, module=module, action=action, actor_id=actor_id, entity_type=entity_type, date_from=date_from, date_to=date_to, page=1, page_size=500)


@router.get("/audit-logs/{log_id}", response_model=AuditLogRead, summary="Read audit log", description="Reads one audit log entry.")
def get_audit_log(log_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> AuditLogRead:
    return service.get_audit_log(log_id, current_user)


@router.get("/access-logs", response_model=AccessLogPageRead, summary="List access logs", description="Lists field/entity access decisions with filters and pagination.")
def list_access_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AdminSecurityService, Depends(get_admin_security_service)],
    search: str | None = None,
    module: str | None = None,
    decision: str | None = None,
    actor_id: str | None = None,
    account_id: str | None = None,
    field_key: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AccessLogPageRead:
    return service.list_access_logs(current_user, search=search, module=module, decision=decision, actor_id=actor_id, account_id=account_id, field_key=field_key, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.get("/access-logs/export", response_model=dict, summary="Export access logs", description="Exports up to 500 filtered access log rows and records a separate export audit event.")
def export_access_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AdminSecurityService, Depends(get_admin_security_service)],
    search: str | None = None,
    module: str | None = None,
    decision: str | None = None,
    actor_id: str | None = None,
    account_id: str | None = None,
    field_key: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict:
    return service.export_access_logs(current_user, search=search, module=module, decision=decision, actor_id=actor_id, account_id=account_id, field_key=field_key, date_from=date_from, date_to=date_to, page=1, page_size=500)


@router.get("/access-logs/{log_id}", response_model=AccessLogRead, summary="Read access log", description="Reads one access log entry.")
def get_access_log(log_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> AccessLogRead:
    return service.get_access_log(log_id, current_user)


@router.get("/field-permissions", response_model=FieldPermissionPageRead, summary="List field permissions", description="Lists field-level role permissions with pagination.")
def list_field_permissions(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)], search: str | None = None, module: str | None = None, role: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25) -> FieldPermissionPageRead:
    return service.list_field_permissions(current_user, search=search, module=module, role=role, page=page, page_size=page_size)


@router.post("/field-permissions", response_model=FieldPermissionRead, status_code=status.HTTP_201_CREATED, summary="Create field permission", description="Creates a field-level role permission rule.")
def create_field_permission(payload: FieldPermissionRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> FieldPermissionRead:
    return service.create_field_permission(payload, current_user)


@router.patch("/field-permissions/{permission_id}", response_model=FieldPermissionRead, summary="Update field permission", description="Updates a field-level role permission rule.")
def update_field_permission(permission_id: str, payload: FieldPermissionRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> FieldPermissionRead:
    return service.update_field_permission(permission_id, payload, current_user)


@router.delete("/field-permissions/{permission_id}", response_model=MessageResponse, summary="Delete field permission", description="Deletes a field-level role permission rule.")
def delete_field_permission(permission_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> MessageResponse:
    return MessageResponse(**service.delete_field_permission(permission_id, current_user))


@router.get("/configuration-changes", response_model=ConfigurationChangePageRead, summary="List configuration changes", description="Lists staged, validated, published, and rolled-back configuration changes.")
def list_configuration_changes(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)], search: str | None = None, module: str | None = None, status_filter: Annotated[str | None, Query(alias="status")] = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25) -> ConfigurationChangePageRead:
    return service.list_configuration_changes(current_user, search=search, module=module, status_filter=status_filter, page=page, page_size=page_size)


@router.post("/configuration-changes", response_model=ConfigurationChangeRead, status_code=status.HTTP_201_CREATED, summary="Create configuration change", description="Stages a configuration change for validation and publishing.")
def create_configuration_change(payload: ConfigurationChangeCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> ConfigurationChangeRead:
    return service.create_configuration_change(payload, current_user)


@router.get("/configuration-changes/{change_id}", response_model=ConfigurationChangeRead, summary="Read configuration change", description="Reads one configuration change.")
def get_configuration_change(change_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> ConfigurationChangeRead:
    return service.get_configuration_change(change_id, current_user)


@router.post("/configuration-changes/{change_id}/validate", response_model=ConfigurationChangeRead, summary="Validate configuration change", description="Validates a staged configuration change before publishing.")
def validate_configuration_change(change_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> ConfigurationChangeRead:
    return service.validate_configuration_change(change_id, current_user)


@router.post("/configuration-changes/{change_id}/publish", response_model=ConfigurationChangeRead, summary="Publish configuration change", description="Publishes a validated configuration change.")
def publish_configuration_change(change_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> ConfigurationChangeRead:
    return service.publish_configuration_change(change_id, current_user)


@router.post("/configuration-changes/{change_id}/rollback", response_model=ConfigurationChangeRead, summary="Rollback configuration change", description="Marks a published configuration change as rolled back.")
def rollback_configuration_change(change_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> ConfigurationChangeRead:
    return service.rollback_configuration_change(change_id, current_user)


@router.get("/system-health", response_model=SystemHealthRead, summary="Read system health", description="Returns platform health checks for database, email, workers, notifications, and integrations.")
def system_health(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)]) -> SystemHealthRead:
    return service.system_health(current_user)


@router.get("/job-logs", response_model=JobLogPageRead, summary="List job logs", description="Lists scheduled/background worker run logs with pagination.")
def job_logs(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)], job_type: str | None = None, status_filter: Annotated[str | None, Query(alias="status")] = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25) -> JobLogPageRead:
    return service.job_logs(current_user, job_type=job_type, status_filter=status_filter, page=page, page_size=page_size)


@router.get("/error-logs", response_model=ErrorLogPageRead, summary="List error logs", description="Lists failed worker, integration, notification, report, and AI run errors with pagination.")
def error_logs(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AdminSecurityService, Depends(get_admin_security_service)], source: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25) -> ErrorLogPageRead:
    return service.error_logs(current_user, source=source, page=page, page_size=page_size)
