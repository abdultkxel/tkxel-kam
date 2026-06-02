from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AccessLog,
    AiGatewayRun,
    AuditLog,
    ConfigurationChange,
    FieldPermission,
    IntegrationSyncLog,
    IntegrationSyncRun,
    NotificationRecord,
    ReportRun,
    ScheduledWorkerRun,
)


class AdminSecurityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_audit_logs(
        self,
        *,
        search: str | None = None,
        module: str | None = None,
        action: str | None = None,
        actor_id: str | None = None,
        entity_type: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[AuditLog], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(AuditLog.action.ilike(term), AuditLog.actor_name.ilike(term), AuditLog.entity_type.ilike(term), AuditLog.entity_id.ilike(term)))
        if module:
            conditions.append(AuditLog.module == module)
        if action:
            conditions.append(AuditLog.action == action)
        if actor_id:
            conditions.append(AuditLog.actor_id == actor_id)
        if entity_type:
            conditions.append(AuditLog.entity_type == entity_type)
        if date_from:
            conditions.append(AuditLog.created_at >= date_from)
        if date_to:
            conditions.append(AuditLog.created_at <= date_to)
        total = self.db.scalar(select(func.count(AuditLog.id)).where(*conditions)) or 0
        items = list(self.db.scalars(select(AuditLog).where(*conditions).order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        return items, total

    def get_audit_log(self, log_id: str) -> AuditLog | None:
        return self.db.get(AuditLog, log_id)

    def list_access_logs(
        self,
        *,
        search: str | None = None,
        module: str | None = None,
        decision: str | None = None,
        actor_id: str | None = None,
        account_id: str | None = None,
        field_key: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[AccessLog], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(AccessLog.actor_name.ilike(term), AccessLog.entity_type.ilike(term), AccessLog.reason.ilike(term), cast(AccessLog.metadata_json, String).ilike(term)))
        if module:
            conditions.append(AccessLog.module == module)
        if decision:
            conditions.append(AccessLog.decision == decision)
        if actor_id:
            conditions.append(AccessLog.actor_id == actor_id)
        if account_id:
            conditions.append(AccessLog.account_id == account_id)
        if field_key:
            conditions.append(AccessLog.field_key == field_key)
        if date_from:
            conditions.append(AccessLog.created_at >= date_from)
        if date_to:
            conditions.append(AccessLog.created_at <= date_to)
        total = self.db.scalar(select(func.count(AccessLog.id)).where(*conditions)) or 0
        items = list(self.db.scalars(select(AccessLog).where(*conditions).order_by(AccessLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        return items, total

    def get_access_log(self, log_id: str) -> AccessLog | None:
        return self.db.get(AccessLog, log_id)

    def list_field_permissions(self, *, search: str | None, module: str | None, role: str | None, page: int, page_size: int) -> tuple[list[FieldPermission], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(FieldPermission.field_key.ilike(term), FieldPermission.role.ilike(term), FieldPermission.module.ilike(term)))
        if module:
            conditions.append(FieldPermission.module == module)
        if role:
            conditions.append(FieldPermission.role == role)
        total = self.db.scalar(select(func.count(FieldPermission.id)).where(*conditions)) or 0
        items = list(self.db.scalars(select(FieldPermission).where(*conditions).order_by(FieldPermission.module, FieldPermission.field_key, FieldPermission.role).offset((page - 1) * page_size).limit(page_size)))
        return items, total

    def get_field_permission(self, permission_id: str) -> FieldPermission | None:
        return self.db.get(FieldPermission, permission_id)

    def get_field_permission_by_key(self, *, module: str, field_key: str, role: str) -> FieldPermission | None:
        return self.db.scalar(select(FieldPermission).where(FieldPermission.module == module, FieldPermission.field_key == field_key, FieldPermission.role == role))

    def save_field_permission(self, permission: FieldPermission) -> FieldPermission:
        self.db.add(permission)
        self.db.flush()
        return permission

    def delete_field_permission(self, permission: FieldPermission) -> None:
        self.db.delete(permission)
        self.db.flush()

    def list_configuration_changes(self, *, search: str | None, module: str | None, status: str | None, page: int, page_size: int) -> tuple[list[ConfigurationChange], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(ConfigurationChange.title.ilike(term), ConfigurationChange.description.ilike(term), ConfigurationChange.change_type.ilike(term), ConfigurationChange.created_by_name.ilike(term)))
        if module:
            conditions.append(ConfigurationChange.module == module)
        if status:
            conditions.append(ConfigurationChange.status == status)
        total = self.db.scalar(select(func.count(ConfigurationChange.id)).where(*conditions)) or 0
        items = list(self.db.scalars(select(ConfigurationChange).where(*conditions).order_by(ConfigurationChange.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        return items, total

    def get_configuration_change(self, change_id: str) -> ConfigurationChange | None:
        return self.db.get(ConfigurationChange, change_id)

    def save_configuration_change(self, change: ConfigurationChange) -> ConfigurationChange:
        self.db.add(change)
        self.db.flush()
        return change

    def list_worker_runs(self, *, job_type: str | None, status: str | None, page: int, page_size: int) -> tuple[list[ScheduledWorkerRun], int]:
        conditions = []
        if job_type:
            conditions.append(ScheduledWorkerRun.job_type == job_type)
        if status:
            conditions.append(ScheduledWorkerRun.status == status)
        total = self.db.scalar(select(func.count(ScheduledWorkerRun.id)).where(*conditions)) or 0
        items = list(self.db.scalars(select(ScheduledWorkerRun).where(*conditions).order_by(ScheduledWorkerRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        return items, total

    def list_error_sources(self, *, source: str | None, page: int, page_size: int) -> tuple[list[dict], int]:
        rows: list[dict] = []
        if source in (None, "", "worker"):
            rows.extend(
                {
                    "id": item.id,
                    "source": "worker",
                    "severity": "high" if item.status == "failed" else "medium",
                    "message": item.error_message or f"{item.job_type} {item.status}",
                    "status": item.status,
                    "actor_name": item.actor_name,
                    "metadata_json": item.metadata_json or {},
                    "created_at": item.created_at,
                }
                for item in self.db.scalars(select(ScheduledWorkerRun).where(ScheduledWorkerRun.status == "failed").order_by(ScheduledWorkerRun.created_at.desc()).limit(500))
            )
        if source in (None, "", "integration"):
            rows.extend(
                {
                    "id": item.id,
                    "source": "integration",
                    "severity": "high" if item.error_count else "medium",
                    "message": item.message or f"{item.provider} {item.status}",
                    "status": item.status,
                    "actor_name": item.actor_name,
                    "metadata_json": item.metadata_json or {},
                    "created_at": item.started_at,
                }
                for item in self.db.scalars(select(IntegrationSyncRun).where(IntegrationSyncRun.status == "failed").order_by(IntegrationSyncRun.started_at.desc()).limit(500))
            )
            rows.extend(
                {
                    "id": item.id,
                    "source": "integration_log",
                    "severity": "medium" if item.status == "warning" else "high",
                    "message": item.message or item.action,
                    "status": item.status,
                    "actor_name": None,
                    "metadata_json": item.payload or {},
                    "created_at": item.created_at,
                }
                for item in self.db.scalars(select(IntegrationSyncLog).where(IntegrationSyncLog.status.in_(["failed", "warning", "error"])).order_by(IntegrationSyncLog.created_at.desc()).limit(500))
            )
        if source in (None, "", "notification"):
            rows.extend(
                {
                    "id": item.id,
                    "source": "notification",
                    "severity": "medium",
                    "message": item.error_message or item.title,
                    "status": item.delivery_status,
                    "actor_name": item.recipient_name,
                    "metadata_json": item.delivery_metadata_json or {},
                    "created_at": item.created_at,
                }
                for item in self.db.scalars(select(NotificationRecord).where(NotificationRecord.delivery_status == "failed").order_by(NotificationRecord.created_at.desc()).limit(500))
            )
        if source in (None, "", "report"):
            rows.extend(
                {
                    "id": item.id,
                    "source": "report",
                    "severity": "medium",
                    "message": item.error_message or f"Report run {item.status}",
                    "status": item.status,
                    "actor_name": item.generated_by_name,
                    "metadata_json": item.storage_metadata_json or {},
                    "created_at": item.generated_at,
                }
                for item in self.db.scalars(select(ReportRun).where(ReportRun.status == "failed").order_by(ReportRun.generated_at.desc()).limit(500))
            )
        if source in (None, "", "ai"):
            rows.extend(
                {
                    "id": item.id,
                    "source": "ai",
                    "severity": "medium",
                    "message": item.error_message or f"AI run {item.status}",
                    "status": item.status,
                    "actor_name": item.actor_name,
                    "metadata_json": item.usage_json or {},
                    "created_at": item.created_at,
                }
                for item in self.db.scalars(select(AiGatewayRun).where(AiGatewayRun.status == "failed").order_by(AiGatewayRun.created_at.desc()).limit(500))
            )
        rows.sort(key=lambda item: item["created_at"], reverse=True)
        total = len(rows)
        return rows[(page - 1) * page_size : page * page_size], total

    def commit(self) -> None:
        self.db.commit()
