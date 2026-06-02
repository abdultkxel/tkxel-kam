from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Account,
    AccountChangeAlert,
    ConfigurationChange,
    FieldPermission,
    IntegrationConnection,
    NotificationRecord,
    ScheduledWorkerRun,
    User,
    utc_now,
)
from app.repositories.admin_security import AdminSecurityRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.rbac import ADMIN_MODULE
from app.schemas import (
    AccessLogPageRead,
    AccessLogRead,
    AuditLogPageRead,
    AuditLogRead,
    ConfigurationChangeCreateRequest,
    ConfigurationChangePageRead,
    ConfigurationChangeRead,
    ErrorLogPageRead,
    ErrorLogRead,
    FieldPermissionPageRead,
    FieldPermissionRead,
    FieldPermissionRequest,
    JobLogPageRead,
    JobLogRead,
    SystemHealthRead,
)
from app.services.audit import AuditService
from app.services.user_management import page_count


class AdminSecurityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AdminSecurityRepository(db)
        self.rbac = RbacRepository(db)
        self.audit = AuditService(AuditRepository(db))

    def list_audit_logs(self, current_user: User, **filters: Any) -> AuditLogPageRead:
        self._require(current_user, "view")
        items, total = self.repository.list_audit_logs(**filters)
        self.audit.log_access(module=ADMIN_MODULE, entity_type="audit_log", entity_id=None, actor=current_user, decision="allowed", reason="Listed audit logs", metadata_json={"filters": self._safe_filters(filters)})
        return AuditLogPageRead(items=[AuditLogRead.model_validate(item) for item in items], total=total, page=filters.get("page", 1), page_size=filters.get("page_size", 25), pages=page_count(total, filters.get("page_size", 25)))

    def get_audit_log(self, log_id: str, current_user: User) -> AuditLogRead:
        self._require(current_user, "view")
        log = self.repository.get_audit_log(log_id)
        if log is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log was not found")
        self.audit.log_access(module=ADMIN_MODULE, entity_type="audit_log", entity_id=log.id, actor=current_user, decision="allowed", reason="Read audit log")
        return AuditLogRead.model_validate(log)

    def export_audit_logs(self, current_user: User, **filters: Any) -> dict[str, Any]:
        self._require(current_user, "export")
        items, total = self.repository.list_audit_logs(**{**filters, "page": 1, "page_size": 500})
        rows = [AuditLogRead.model_validate(item).model_dump(mode="json") for item in items]
        self.audit.log(module=ADMIN_MODULE, action="export_audit_logs", entity_type="audit_log", entity_id="export", actor=current_user, after_value={"rows": len(rows), "total": total})
        self.repository.commit()
        return {"filename": "audit-logs.csv", "rows": rows, "total": total}

    def list_access_logs(self, current_user: User, **filters: Any) -> AccessLogPageRead:
        self._require(current_user, "view")
        items, total = self.repository.list_access_logs(**filters)
        self.audit.log_access(module=ADMIN_MODULE, entity_type="access_log", entity_id=None, actor=current_user, decision="allowed", reason="Listed access logs", metadata_json={"filters": self._safe_filters(filters)})
        return AccessLogPageRead(items=[AccessLogRead.model_validate(item) for item in items], total=total, page=filters.get("page", 1), page_size=filters.get("page_size", 25), pages=page_count(total, filters.get("page_size", 25)))

    def get_access_log(self, log_id: str, current_user: User) -> AccessLogRead:
        self._require(current_user, "view")
        log = self.repository.get_access_log(log_id)
        if log is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access log was not found")
        self.audit.log_access(module=ADMIN_MODULE, entity_type="access_log", entity_id=log.id, actor=current_user, decision="allowed", reason="Read access log")
        return AccessLogRead.model_validate(log)

    def export_access_logs(self, current_user: User, **filters: Any) -> dict[str, Any]:
        self._require(current_user, "export")
        items, total = self.repository.list_access_logs(**{**filters, "page": 1, "page_size": 500})
        rows = [AccessLogRead.model_validate(item).model_dump(mode="json") for item in items]
        self.audit.log(module=ADMIN_MODULE, action="export_access_logs", entity_type="access_log", entity_id="export", actor=current_user, after_value={"rows": len(rows), "total": total})
        self.repository.commit()
        return {"filename": "access-logs.csv", "rows": rows, "total": total}

    def list_field_permissions(self, current_user: User, *, search: str | None, module: str | None, role: str | None, page: int, page_size: int) -> FieldPermissionPageRead:
        self._require(current_user, "configure")
        items, total = self.repository.list_field_permissions(search=search, module=module, role=role, page=page, page_size=page_size)
        return FieldPermissionPageRead(items=[FieldPermissionRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_field_permission(self, payload: FieldPermissionRequest, current_user: User) -> FieldPermissionRead:
        self._require(current_user, "configure")
        existing = self.repository.get_field_permission_by_key(module=payload.module, field_key=payload.field_key, role=payload.role)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A field permission for this module, field, and role already exists")
        permission = FieldPermission(**payload.model_dump(), created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.save_field_permission(permission)
        self.audit.log(module=ADMIN_MODULE, action="create_field_permission", entity_type="field_permission", entity_id=permission.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return FieldPermissionRead.model_validate(permission)

    def update_field_permission(self, permission_id: str, payload: FieldPermissionRequest, current_user: User) -> FieldPermissionRead:
        self._require(current_user, "configure")
        permission = self.repository.get_field_permission(permission_id)
        if permission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field permission was not found")
        duplicate = self.repository.get_field_permission_by_key(module=payload.module, field_key=payload.field_key, role=payload.role)
        if duplicate and duplicate.id != permission.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A field permission for this module, field, and role already exists")
        before = FieldPermissionRead.model_validate(permission).model_dump(mode="json")
        for key, value in payload.model_dump().items():
            setattr(permission, key, value)
        permission.updated_by_id = current_user.id
        self.audit.log(module=ADMIN_MODULE, action="update_field_permission", entity_type="field_permission", entity_id=permission.id, actor=current_user, before_value=before, after_value=payload.model_dump())
        self.repository.commit()
        return FieldPermissionRead.model_validate(permission)

    def delete_field_permission(self, permission_id: str, current_user: User) -> dict[str, str]:
        self._require(current_user, "configure")
        permission = self.repository.get_field_permission(permission_id)
        if permission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field permission was not found")
        before = FieldPermissionRead.model_validate(permission).model_dump(mode="json")
        self.repository.delete_field_permission(permission)
        self.audit.log(module=ADMIN_MODULE, action="delete_field_permission", entity_type="field_permission", entity_id=permission_id, actor=current_user, before_value=before)
        self.repository.commit()
        return {"message": "Field permission deleted"}

    def list_configuration_changes(self, current_user: User, *, search: str | None, module: str | None, status_filter: str | None, page: int, page_size: int) -> ConfigurationChangePageRead:
        self._require(current_user, "configure")
        items, total = self.repository.list_configuration_changes(search=search, module=module, status=status_filter, page=page, page_size=page_size)
        return ConfigurationChangePageRead(items=[ConfigurationChangeRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_configuration_change(self, payload: ConfigurationChangeCreateRequest, current_user: User) -> ConfigurationChangeRead:
        self._require(current_user, "configure")
        change = ConfigurationChange(**payload.model_dump(), created_by_id=current_user.id, created_by_name=current_user.full_name)
        self.repository.save_configuration_change(change)
        self.audit.log(module=ADMIN_MODULE, action="create_configuration_change", entity_type="configuration_change", entity_id=change.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return ConfigurationChangeRead.model_validate(change)

    def get_configuration_change(self, change_id: str, current_user: User) -> ConfigurationChangeRead:
        self._require(current_user, "configure")
        return ConfigurationChangeRead.model_validate(self._configuration_change_or_404(change_id))

    def validate_configuration_change(self, change_id: str, current_user: User) -> ConfigurationChangeRead:
        self._require(current_user, "configure")
        change = self._configuration_change_or_404(change_id)
        errors = []
        if not change.payload_json:
            errors.append("Payload is empty; publishing will only record the configuration decision.")
        change.validation_json = {"valid": not errors, "errors": errors, "validated_at": utc_now().isoformat(), "validated_by": current_user.full_name}
        change.status = "validated" if not errors else "draft"
        self.audit.log(module=ADMIN_MODULE, action="validate_configuration_change", entity_type="configuration_change", entity_id=change.id, actor=current_user, after_value=change.validation_json)
        self.repository.commit()
        return ConfigurationChangeRead.model_validate(change)

    def publish_configuration_change(self, change_id: str, current_user: User) -> ConfigurationChangeRead:
        self._require(current_user, "configure")
        change = self._configuration_change_or_404(change_id)
        if change.status in {"published", "rolled_back"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft or validated changes can be published")
        if not change.validation_json:
            change.validation_json = {"valid": True, "errors": [], "validated_at": utc_now().isoformat(), "validated_by": current_user.full_name}
        if change.validation_json.get("valid") is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Configuration change must pass validation before publishing")
        before = ConfigurationChangeRead.model_validate(change).model_dump(mode="json")
        change.status = "published"
        change.published_by_id = current_user.id
        change.published_by_name = current_user.full_name
        change.published_at = utc_now()
        self.audit.log(module=ADMIN_MODULE, action="publish_configuration_change", entity_type="configuration_change", entity_id=change.id, actor=current_user, before_value=before, after_value=ConfigurationChangeRead.model_validate(change).model_dump(mode="json"))
        self.repository.commit()
        return ConfigurationChangeRead.model_validate(change)

    def rollback_configuration_change(self, change_id: str, current_user: User) -> ConfigurationChangeRead:
        self._require(current_user, "configure")
        change = self._configuration_change_or_404(change_id)
        if change.status != "published":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only published changes can be rolled back")
        before = ConfigurationChangeRead.model_validate(change).model_dump(mode="json")
        change.status = "rolled_back"
        change.rolled_back_by_id = current_user.id
        change.rolled_back_by_name = current_user.full_name
        change.rolled_back_at = utc_now()
        self.audit.log(module=ADMIN_MODULE, action="rollback_configuration_change", entity_type="configuration_change", entity_id=change.id, actor=current_user, before_value=before, after_value=ConfigurationChangeRead.model_validate(change).model_dump(mode="json"))
        self.repository.commit()
        return ConfigurationChangeRead.model_validate(change)

    def system_health(self, current_user: User) -> SystemHealthRead:
        self._require(current_user, "view")
        settings = get_settings()
        checks = []
        status_value = "healthy"
        try:
            self.db.execute(text("SELECT 1"))
            checks.append({"key": "database", "status": "healthy", "detail": "Database connection succeeded."})
        except Exception as exc:
            status_value = "error"
            checks.append({"key": "database", "status": "error", "detail": str(exc)})
        failed_workers = self.db.scalar(select(func.count(ScheduledWorkerRun.id)).where(ScheduledWorkerRun.status == "failed")) or 0
        failed_notifications = self.db.scalar(select(func.count(NotificationRecord.id)).where(NotificationRecord.delivery_status == "failed")) or 0
        integration_errors = self.db.scalar(select(func.count(IntegrationConnection.id)).where(IntegrationConnection.status == "error")) or 0
        if failed_workers or failed_notifications or integration_errors:
            status_value = "degraded" if status_value == "healthy" else status_value
        checks.extend(
            [
                {"key": "email", "status": "healthy" if settings.mail_enabled and settings.mail_host else "degraded", "detail": "SMTP configured." if settings.mail_host else "SMTP host is not configured."},
                {"key": "workers", "status": "healthy" if not failed_workers else "degraded", "detail": f"{failed_workers} failed worker run(s)."},
                {"key": "notifications", "status": "healthy" if not failed_notifications else "degraded", "detail": f"{failed_notifications} failed notification delivery attempt(s)."},
                {"key": "integrations", "status": "healthy" if not integration_errors else "degraded", "detail": f"{integration_errors} integration connection(s) in error."},
            ]
        )
        return SystemHealthRead(
            status=status_value,
            generated_at=utc_now(),
            checks=checks,
            metrics={
                "accounts": self.db.scalar(select(func.count(Account.id))) or 0,
                "account_change_alerts": self.db.scalar(select(func.count(AccountChangeAlert.id))) or 0,
                "notifications": self.db.scalar(select(func.count(NotificationRecord.id))) or 0,
                "workers_failed": failed_workers,
            },
        )

    def job_logs(self, current_user: User, *, job_type: str | None, status_filter: str | None, page: int, page_size: int) -> JobLogPageRead:
        self._require(current_user, "view")
        items, total = self.repository.list_worker_runs(job_type=job_type, status=status_filter, page=page, page_size=page_size)
        reads = [
            JobLogRead(
                id=item.id,
                job_type=item.job_type,
                mode=item.mode,
                status=item.status,
                matched_count=item.matched_count,
                affected_count=item.affected_count,
                actor_id=item.actor_id,
                actor_name=item.actor_name,
                error_message=item.error_message,
                metadata_json=item.metadata_json,
                started_at=item.started_at,
                finished_at=item.finished_at,
                created_at=item.created_at,
            )
            for item in items
        ]
        return JobLogPageRead(items=reads, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def error_logs(self, current_user: User, *, source: str | None, page: int, page_size: int) -> ErrorLogPageRead:
        self._require(current_user, "view")
        items, total = self.repository.list_error_sources(source=source, page=page, page_size=page_size)
        return ErrorLogPageRead(items=[ErrorLogRead(**item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def _configuration_change_or_404(self, change_id: str) -> ConfigurationChange:
        change = self.repository.get_configuration_change(change_id)
        if change is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuration change was not found")
        return change

    def _require(self, current_user: User, action: str) -> None:
        if not self.rbac.role_has_permission(current_user.role, ADMIN_MODULE, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")

    @staticmethod
    def _safe_filters(filters: dict[str, Any]) -> dict[str, Any]:
        return {key: value.isoformat() if isinstance(value, datetime) else value for key, value in filters.items() if value not in (None, "")}
