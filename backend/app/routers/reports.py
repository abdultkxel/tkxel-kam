from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_reports_service
from app.models import User
from app.schemas import (
    ReportCreateRequest,
    ReportDefinitionPageRead,
    ReportDefinitionRead,
    ReportExportRequest,
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
from app.services.reports import ReportsService

router = APIRouter(prefix="/api/reports", tags=["Dashboards and Reporting"])


@router.get("/fields", response_model=ReportFieldsRead, summary="List report fields", description="Returns permission-scoped report field metadata, including non-sensitive Field Builder fields.")
def report_fields(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)], data_source: str | None = None) -> ReportFieldsRead:
    return service.fields(current_user, data_source=data_source)


@router.post("/preview", response_model=ReportPreviewRead, summary="Preview report", description="Previews a permission-scoped report with selected fields, filters, grouping, sorting, and pagination.")
def preview_report(payload: ReportPreviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportPreviewRead:
    return service.preview(payload, current_user)


@router.get("", response_model=ReportDefinitionPageRead, summary="List reports", description="Lists saved private/shared reports visible to the current user.")
def list_reports(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ReportsService, Depends(get_reports_service)],
    search: str | None = None,
    data_source: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> ReportDefinitionPageRead:
    return service.list_reports(current_user, search=search, data_source=data_source, page=page, page_size=page_size)


@router.post("", response_model=ReportDefinitionRead, status_code=status.HTTP_201_CREATED, summary="Create report", description="Creates a saved report. Shared reports require configure permission.")
def create_report(payload: ReportCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportDefinitionRead:
    return service.create_report(payload, current_user)


@router.get("/schedules", response_model=ReportSchedulePageRead, summary="List report schedules", description="Lists report schedules visible to the current user without leaking hidden counts.")
def list_report_schedules(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)], report_id: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> ReportSchedulePageRead:
    return service.list_schedules(current_user, report_id=report_id, page=page, page_size=page_size)


@router.patch("/schedules/{schedule_id}", response_model=ReportScheduleRead, summary="Update report schedule", description="Updates cadence, timezone, recipients, delivery channels, and active state for a report schedule.")
def update_report_schedule(schedule_id: str, payload: ReportScheduleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportScheduleRead:
    return service.update_schedule(schedule_id, payload, current_user)


@router.post("/schedules/{schedule_id}/run", response_model=ReportRunRead, summary="Run report schedule", description="Runs a report schedule immediately for authorized admin/KAM Head users.")
def run_report_schedule(schedule_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportRunRead:
    return service.run_schedule(schedule_id, current_user)


@router.get("/{report_id}", response_model=ReportDefinitionRead, summary="Read report", description="Reads a saved report if the user owns it, it is shared, or the user has report configuration scope.")
def get_report(report_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportDefinitionRead:
    return service.get_report(report_id, current_user)


@router.patch("/{report_id}", response_model=ReportDefinitionRead, summary="Update report", description="Updates report metadata, fields, filters, grouping, layout, or default export format.")
def update_report(report_id: str, payload: ReportUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportDefinitionRead:
    return service.update_report(report_id, payload, current_user)


@router.delete("/{report_id}", response_model=dict[str, str], summary="Delete report", description="Deletes a report owned by the user or configurable by the user's RBAC permissions.")
def delete_report(report_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> dict[str, str]:
    return service.delete_report(report_id, current_user)


@router.post("/{report_id}/export", response_model=ReportRunRead, summary="Export report", description="Generates a permission-scoped CSV or PDF report export and logs the run.")
def export_report(report_id: str, payload: ReportExportRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportRunRead:
    return service.export_report(report_id, payload, current_user)


@router.get("/{report_id}/runs", response_model=ReportRunPageRead, summary="List report runs", description="Lists export/run history for one saved report.")
def list_report_runs(report_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)], page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> ReportRunPageRead:
    return service.list_runs(report_id, current_user, page=page, page_size=page_size)


@router.post("/{report_id}/schedules", response_model=ReportScheduleRead, status_code=status.HTTP_201_CREATED, summary="Create report schedule", description="Creates a schedule for a saved report. Report scheduling requires configure permission.")
def create_report_schedule(report_id: str, payload: ReportScheduleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ReportsService, Depends(get_reports_service)]) -> ReportScheduleRead:
    return service.create_schedule(report_id, payload, current_user)
