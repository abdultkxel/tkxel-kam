from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import CustomFieldDefinition, ReportDefinition, ReportRun, ReportSchedule, ScheduledWorkerRun, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.dashboards import DashboardRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.rbac import RbacRepository
from app.repositories.reports import ReportRepository
from app.schemas import (
    ReportCreateRequest,
    ReportDefinitionPageRead,
    ReportDefinitionRead,
    ReportExportRequest,
    ReportFieldRead,
    ReportFieldsRead,
    ReportPreviewRead,
    ReportPreviewRequest,
    ReportRunPageRead,
    ReportRunRead,
    ReportSchedulePageRead,
    ReportScheduleRead,
    ReportScheduleRequest,
    ReportScheduleUpdateRequest,
    ReportUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.email_delivery import EmailDeliveryService
from app.services.user_management import page_count


BASE_REPORT_FIELDS: dict[str, list[dict[str, Any]]] = {
    "accounts": [
        {"field": "id", "label": "Account ID"},
        {"field": "name", "label": "Account"},
        {"field": "segment", "label": "Segment"},
        {"field": "region", "label": "Region"},
        {"field": "lifecycle_status", "label": "Lifecycle"},
        {"field": "risk_status", "label": "Risk"},
        {"field": "commercial_value", "label": "Commercial value", "field_type": "currency"},
        {"field": "health_overall", "label": "Health", "field_type": "number"},
        {"field": "next_governance_at", "label": "Next governance", "field_type": "datetime"},
    ],
    "tasks": [
        {"field": "id", "label": "Task ID"},
        {"field": "title", "label": "Task"},
        {"field": "status", "label": "Status"},
        {"field": "priority", "label": "Priority"},
        {"field": "owner_name", "label": "Owner"},
        {"field": "due_at", "label": "Due", "field_type": "datetime"},
        {"field": "account_id", "label": "Account ID"},
    ],
    "signals": [
        {"field": "id", "label": "Signal ID"},
        {"field": "title", "label": "Signal"},
        {"field": "signal_type", "label": "Type"},
        {"field": "severity", "label": "Severity"},
        {"field": "status", "label": "Status"},
        {"field": "owner_name", "label": "Owner"},
        {"field": "due_at", "label": "Due", "field_type": "datetime"},
        {"field": "account_id", "label": "Account ID"},
    ],
    "escalations": [
        {"field": "id", "label": "Escalation ID"},
        {"field": "summary", "label": "Summary"},
        {"field": "severity", "label": "Severity"},
        {"field": "priority", "label": "Priority"},
        {"field": "status", "label": "Status"},
        {"field": "owner_name", "label": "Owner"},
        {"field": "sla_due_at", "label": "SLA due", "field_type": "datetime"},
        {"field": "account_id", "label": "Account ID"},
    ],
    "opportunities": [
        {"field": "id", "label": "Opportunity ID"},
        {"field": "name", "label": "Opportunity"},
        {"field": "service_line", "label": "Service line"},
        {"field": "stage", "label": "Stage"},
        {"field": "value", "label": "Value", "field_type": "currency"},
        {"field": "currency", "label": "Currency"},
        {"field": "owner_name", "label": "Owner"},
        {"field": "target_date", "label": "Target date", "field_type": "datetime"},
        {"field": "account_id", "label": "Account ID"},
    ],
}

CUSTOM_FIELD_MODULES = {
    "accounts": "account_overview",
    "tasks": "playbooks_tasks_calendar",
    "signals": "signals_attention",
    "escalations": "escalation_management",
    "opportunities": "opportunity_management",
}


class ReportsService:
    def __init__(self, db: Session, email_delivery: EmailDeliveryService | None = None) -> None:
        self.db = db
        self.repository = ReportRepository(db)
        self.notifications = NotificationRepository(db)
        self.dashboard_repository = DashboardRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(db))
        self.email_delivery = email_delivery or EmailDeliveryService()

    def fields(self, current_user: User, *, data_source: str | None = None) -> ReportFieldsRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        sources = [data_source] if data_source else list(BASE_REPORT_FIELDS)
        fields: list[ReportFieldRead] = []
        for source in sources:
            if source not in BASE_REPORT_FIELDS:
                continue
            fields.extend(self._fields_for_source(source))
        return ReportFieldsRead(data_sources=list(BASE_REPORT_FIELDS), fields=fields)

    def preview(self, payload: ReportPreviewRequest, current_user: User) -> ReportPreviewRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        self._validate_fields(payload.data_source, payload.fields)
        account_ids = self._account_scope(current_user)
        rows, total = self.repository.list_source_records(data_source=payload.data_source, account_ids=account_ids, filters=payload.filters, sort=payload.sort, direction=payload.direction, page=payload.page, page_size=payload.page_size)
        columns = [field for field in self._fields_for_source(payload.data_source) if field.field in payload.fields]
        return ReportPreviewRead(
            rows=[self._row(payload.data_source, row, payload.fields) for row in rows],
            columns=columns,
            total=total,
            page=payload.page,
            page_size=payload.page_size,
            pages=page_count(total, payload.page_size),
            generated_at=datetime.now(timezone.utc),
        )

    def list_reports(self, current_user: User, *, search: str | None = None, data_source: str | None = None, page: int = 1, page_size: int = 25) -> ReportDefinitionPageRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        include_all = self.access.has_any_permission(current_user, {"reports:view_portfolio", "reports:configure_all"})
        items, total = self.repository.list_reports(owner_id=current_user.id, include_shared=True, include_all=include_all, search=search, data_source=data_source, page=page, page_size=page_size)
        return ReportDefinitionPageRead(items=[ReportDefinitionRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_report(self, payload: ReportCreateRequest, current_user: User) -> ReportDefinitionRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if payload.visibility == "shared":
            self.access.require_module_permission(current_user, "dashboards_reporting", "configure")
        self._validate_fields(payload.data_source, payload.fields)
        self._validate_export_compatibility(payload.fields, payload.layout, payload.export_format)
        report = ReportDefinition(
            owner_id=current_user.id,
            owner_name=current_user.full_name,
            name=payload.name,
            description=payload.description,
            visibility=payload.visibility,
            data_source=payload.data_source,
            fields_json=payload.fields,
            filters_json=payload.filters,
            grouping_json=payload.grouping,
            layout_json=payload.layout,
            export_format=payload.export_format,
        )
        self.repository.save_report(report)
        self.audit.log(module="dashboards_reporting", action="create_report", entity_type="report", entity_id=report.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return ReportDefinitionRead.model_validate(report)

    def get_report(self, report_id: str, current_user: User) -> ReportDefinitionRead:
        report = self._report_or_404(report_id)
        self._require_report_view(report, current_user)
        return ReportDefinitionRead.model_validate(report)

    def update_report(self, report_id: str, payload: ReportUpdateRequest, current_user: User) -> ReportDefinitionRead:
        report = self._report_or_404(report_id)
        self._require_report_update(report, current_user)
        before = ReportDefinitionRead.model_validate(report).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        if "fields" in updates:
            self._validate_fields(report.data_source, updates["fields"])
            report.fields_json = updates.pop("fields")
        if "filters" in updates:
            report.filters_json = updates.pop("filters")
        if "grouping" in updates:
            report.grouping_json = updates.pop("grouping")
        if "layout" in updates:
            report.layout_json = updates.pop("layout")
        next_format = updates.get("export_format", report.export_format)
        self._validate_export_compatibility(report.fields_json, report.layout_json, next_format)
        for field, value in updates.items():
            setattr(report, field, value)
        self.audit.log(module="dashboards_reporting", action="update_report", entity_type="report", entity_id=report.id, actor=current_user, before_value=before, after_value=payload.model_dump(exclude_unset=True))
        self.repository.commit()
        return ReportDefinitionRead.model_validate(report)

    def delete_report(self, report_id: str, current_user: User) -> dict[str, str]:
        report = self._report_or_404(report_id)
        self._require_report_update(report, current_user)
        self.repository.delete_report(report)
        self.audit.log(module="dashboards_reporting", action="delete_report", entity_type="report", entity_id=report_id, actor=current_user)
        self.repository.commit()
        return {"message": "Report deleted"}

    def export_report(self, report_id: str, payload: ReportExportRequest, current_user: User) -> ReportRunRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "export")
        report = self._report_or_404(report_id)
        self._require_report_view(report, current_user)
        export_format = payload.export_format or report.export_format
        self._validate_export_compatibility(report.fields_json, report.layout_json, export_format)
        run = self._generate_report_run(report, current_user, export_format=export_format)
        self._send_report_ready_email(report, run, current_user)
        self.audit.log(module="dashboards_reporting", action="export_report", entity_type="report", entity_id=report.id, actor=current_user, after_value={"run_id": run.id, "format": export_format})
        self.repository.commit()
        return ReportRunRead.model_validate(run)

    def list_runs(self, report_id: str, current_user: User, page: int = 1, page_size: int = 25) -> ReportRunPageRead:
        report = self._report_or_404(report_id)
        self._require_report_view(report, current_user)
        items, total = self.repository.list_runs(report_id, page, page_size, viewer_user_id=current_user.id, include_all=self._can_configure_reports(current_user))
        return ReportRunPageRead(items=[ReportRunRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def list_schedules(self, current_user: User, *, report_id: str | None = None, page: int = 1, page_size: int = 25) -> ReportSchedulePageRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        items, total = self.repository.list_schedules(report_id=report_id, viewer_user_id=current_user.id, include_all=self._can_configure_reports(current_user), page=page, page_size=page_size)
        visible = [item for item in items if self._can_view_report(self._report_or_404(item.report_id), current_user)]
        visible_total = len(visible)
        return ReportSchedulePageRead(items=[ReportScheduleRead.model_validate(item) for item in visible], total=visible_total, page=page, page_size=page_size, pages=page_count(visible_total, page_size))

    def create_schedule(self, report_id: str, payload: ReportScheduleRequest, current_user: User) -> ReportScheduleRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "configure")
        report = self._report_or_404(report_id)
        self._require_report_view(report, current_user)
        recipients = self._authorized_recipient_ids(payload.recipient_user_ids, report)
        schedule = ReportSchedule(
            report_id=report.id,
            owner_id=current_user.id,
            owner_name=current_user.full_name,
            cadence=payload.cadence,
            timezone=payload.timezone,
            recipients_json=recipients,
            delivery_channels=list(payload.delivery_channels),
            is_active=payload.is_active,
            next_run_at=self._next_run_at(payload.cadence),
        )
        self.repository.save_schedule(schedule)
        self.audit.log(module="dashboards_reporting", action="create_report_schedule", entity_type="report_schedule", entity_id=schedule.id, actor=current_user, after_value=payload.model_dump())
        self.repository.commit()
        return ReportScheduleRead.model_validate(schedule)

    def update_schedule(self, schedule_id: str, payload: ReportScheduleUpdateRequest, current_user: User) -> ReportScheduleRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "configure")
        schedule = self.repository.get_schedule(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report schedule was not found")
        report = self._report_or_404(schedule.report_id)
        self._require_report_view(report, current_user)
        updates = payload.model_dump(exclude_unset=True)
        if "recipient_user_ids" in updates:
            schedule.recipients_json = self._authorized_recipient_ids(updates.pop("recipient_user_ids"), report)
        for field, value in updates.items():
            if field == "delivery_channels":
                schedule.delivery_channels = value
            else:
                setattr(schedule, field, value)
        if "cadence" in updates:
            schedule.next_run_at = self._next_run_at(schedule.cadence)
        self.audit.log(module="dashboards_reporting", action="update_report_schedule", entity_type="report_schedule", entity_id=schedule.id, actor=current_user, after_value=payload.model_dump(exclude_unset=True))
        self.repository.commit()
        return ReportScheduleRead.model_validate(schedule)

    def run_schedule(self, schedule_id: str, current_user: User) -> ReportRunRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "configure")
        schedule = self.repository.get_schedule(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report schedule was not found")
        report = self._report_or_404(schedule.report_id)
        self._require_report_view(report, current_user)
        self._validate_export_compatibility(report.fields_json, report.layout_json, report.export_format)
        recipients = self._active_authorized_report_recipients(schedule.recipients_json, report)
        if not recipients:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Report schedule has no active authorized recipients")
        runs = []
        for recipient in recipients:
            run = self._generate_report_run(report, recipient, export_format=report.export_format, schedule=schedule, recipient_ids=[recipient.id])
            self._send_report_ready_email(report, run, recipient)
            runs.append(run)
        schedule.last_run_at = datetime.now(timezone.utc)
        schedule.next_run_at = self._next_run_at(schedule.cadence)
        self.repository.commit()
        return ReportRunRead.model_validate(runs[0])

    def run_due_schedules(self) -> int:
        now = datetime.now(timezone.utc)
        count = 0
        for schedule in self.repository.list_due_schedules(now):
            actor = self.db.get(User, schedule.owner_id) if schedule.owner_id else None
            if actor is None or not actor.is_active:
                continue
            report = self.repository.get_report(schedule.report_id)
            if report is None:
                continue
            try:
                self._validate_export_compatibility(report.fields_json, report.layout_json, report.export_format)
            except HTTPException:
                continue
            recipients = self._active_authorized_report_recipients(schedule.recipients_json, report)
            for recipient in recipients:
                run = self._generate_report_run(report, recipient, export_format=report.export_format, schedule=schedule, recipient_ids=[recipient.id])
                self._send_report_ready_email(report, run, recipient)
                count += 1
            schedule.last_run_at = now
            schedule.next_run_at = self._next_run_at(schedule.cadence, from_time=now)
        if count:
            self.db.add(ScheduledWorkerRun(job_type="report_generation", mode="scheduled", status="complete", matched_count=count, affected_count=count, finished_at=datetime.now(timezone.utc), metadata_json={"generated": count}))
            self.repository.commit()
        return count

    def _generate_report_run(self, report: ReportDefinition, actor: User, *, export_format: str, schedule: ReportSchedule | None = None, recipient_ids: list[str] | None = None) -> ReportRun:
        preview = self.preview(
            ReportPreviewRequest(data_source=report.data_source, fields=report.fields_json, filters=report.filters_json, grouping=report.grouping_json, page=1, page_size=500),
            actor,
        )
        content = self._export_content(report, preview.rows, export_format)
        run = ReportRun(
            report_id=report.id,
            schedule_id=schedule.id if schedule else None,
            status="generated",
            export_format=export_format,
            content_json=content,
            storage_metadata_json={"file_name": f"{self._slug(report.name)}.{export_format}", "mime_type": "text/csv" if export_format == "csv" else "application/pdf"},
            permission_scope_json={"generated_for_user_id": actor.id, "data_source": report.data_source, "row_count": len(preview.rows)},
            recipients_json=recipient_ids or [actor.id],
            generated_by_id=actor.id,
            generated_by_name=actor.full_name,
        )
        self.repository.save_run(run)
        return run

    def _send_report_ready_email(self, report: ReportDefinition, run: ReportRun, recipient: User) -> None:
        email_result = self.email_delivery.send_template(
            "report_ready",
            recipient_email=recipient.email,
            recipient_name=recipient.full_name,
            context={
                "recipient_name": recipient.full_name,
                "title": report.name,
                "source_url": self.email_delivery.absolute_url(f"/reports?report={report.id}&run={run.id}"),
            },
        )
        attempts = list(run.storage_metadata_json.get("delivery_attempts", [])) if isinstance(run.storage_metadata_json, dict) else []
        attempts.append(email_result.as_metadata())
        run.storage_metadata_json = {**(run.storage_metadata_json or {}), "delivery_attempts": attempts}
        if email_result.status == "failed":
            run.status = "failed"
            run.error_message = email_result.error_message

    def _export_content(self, report: ReportDefinition, rows: list[dict[str, Any]], export_format: str) -> dict[str, Any]:
        if export_format == "pdf":
            return {"title": report.name, "format": "pdf", "pages": [{"heading": report.name, "rows": rows[:100]}], "download_content": f"PDF report: {report.name}\nRows: {len(rows)}"}
        header = report.fields_json
        lines = [",".join(header)]
        for row in rows:
            values = [str(row.get(field, "")).replace(",", " ") for field in header]
            lines.append(",".join(values))
        return {"title": report.name, "format": "csv", "download_content": "\n".join(lines)}

    def _fields_for_source(self, source: str) -> list[ReportFieldRead]:
        fields = [
            ReportFieldRead(data_source=source, field=item["field"], label=item["label"], field_type=item.get("field_type", "text"), sortable=True, filterable=True)
            for item in BASE_REPORT_FIELDS[source]
        ]
        module = CUSTOM_FIELD_MODULES[source]
        custom_fields = (
            self.db.query(CustomFieldDefinition)
            .filter(CustomFieldDefinition.module == module, CustomFieldDefinition.is_active.is_(True), CustomFieldDefinition.is_sensitive.is_(False))
            .order_by(CustomFieldDefinition.sort_order, CustomFieldDefinition.label)
            .all()
        )
        for field in custom_fields:
            fields.append(ReportFieldRead(data_source=source, field=f"custom:{field.field_key}", label=field.label, field_type=field.field_type, sortable=False, filterable=False, sensitive=field.is_sensitive, custom_field=True))
        return fields

    def _validate_fields(self, source: str, fields: list[str]) -> None:
        allowed = {field.field for field in self._fields_for_source(source)}
        forbidden = [field for field in fields if field not in allowed]
        if forbidden:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Forbidden or unknown report field: {', '.join(forbidden)}")

    @staticmethod
    def _validate_export_compatibility(fields: list[str], layout: dict[str, Any], export_format: str) -> None:
        if export_format == "csv" and not fields:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV exports require tabular fields.")
        if export_format == "pdf" and (not layout or layout.get("type") == "table_only"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF exports require a report layout.")

    def _row(self, source: str, record, fields: list[str]) -> dict[str, Any]:
        row = {}
        for field in fields:
            if field.startswith("custom:"):
                row[field] = None
                continue
            value = getattr(record, field, None)
            if isinstance(value, datetime):
                value = value.isoformat()
            row[field] = float(value) if field in {"commercial_value", "value"} and value is not None else value
        return row

    def _account_scope(self, user: User) -> list[str] | None:
        if self.access.can_view_portfolio(user):
            return None
        return self.dashboard_repository.account_ids_for_user(user.id)

    def _require_report_view(self, report: ReportDefinition, user: User) -> None:
        if not self._can_view_report(report, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this report")

    def _can_view_report(self, report: ReportDefinition, user: User) -> bool:
        if self.access.has_any_permission(user, {"reports:view_portfolio", "reports:configure_all"}):
            return True
        return report.visibility == "shared" or report.owner_id == user.id

    def _require_report_update(self, report: ReportDefinition, user: User) -> None:
        if report.owner_id == user.id:
            return
        self.access.require_module_permission(user, "dashboards_reporting", "configure")

    def _report_or_404(self, report_id: str) -> ReportDefinition:
        report = self.repository.get_report(report_id)
        if report is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report was not found")
        return report

    def _authorized_recipient_ids(self, user_ids: list[str], report: ReportDefinition) -> list[str]:
        users = self.notifications.list_active_users_by_ids(user_ids)
        found = {user.id for user in users}
        missing = [user_id for user_id in user_ids if user_id not in found]
        if missing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All recipients must be active users")
        unauthorized = [user.full_name or user.email for user in users if not self.access.has_any_permission(user, {"reports:view_own", "reports:view_portfolio"}) or not self._can_view_report(report, user)]
        if unauthorized:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All report recipients must be authorized to view the report")
        return [user.id for user in users]

    def _active_authorized_report_recipients(self, user_ids: list[str], report: ReportDefinition) -> list[User]:
        users = self.notifications.list_active_users_by_ids(user_ids)
        return [user for user in users if self.access.has_any_permission(user, {"reports:view_own", "reports:view_portfolio"}) and self._can_view_report(report, user)]

    def _can_configure_reports(self, user: User) -> bool:
        return self.access.has_any_permission(user, {"reports:configure_all"})

    @staticmethod
    def _next_run_at(cadence: str, from_time: datetime | None = None) -> datetime:
        base = from_time or datetime.now(timezone.utc)
        if cadence == "daily":
            return base + timedelta(days=1)
        if cadence == "monthly":
            return base + timedelta(days=30)
        return base + timedelta(days=7)

    @staticmethod
    def _slug(value: str) -> str:
        slug = "".join(character.lower() if character.isalnum() else "-" for character in value).strip("-")
        return slug or "report"
