from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_dashboards_service
from app.models import User
from app.schemas import DashboardRead, TaskSummaryRefreshRead
from app.services.dashboards import DashboardsService

router = APIRouter(prefix="/api/dashboards", tags=["Dashboards and Reporting"])


@router.get("/me", response_model=DashboardRead, summary="Current user's role-based dashboard", description="Returns the dashboard profile and widgets allowed for the logged-in user's role, RBAC permissions, account scope, and field sensitivity rules.")
def current_user_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[DashboardsService, Depends(get_dashboards_service)],
    search: str | None = None,
    risk: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> DashboardRead:
    return service.for_current_user(current_user, search=search, risk=risk, page=page, page_size=page_size)


@router.get("/am-home", response_model=DashboardRead, summary="AM Home dashboard", description="Returns assigned-account operational widgets for accounts, signals and critical tasks, tasks, opportunities, forecasts, and the global governance calendar.")
def am_home(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[DashboardsService, Depends(get_dashboards_service)],
    search: str | None = None,
    account_id: str | None = None,
    priority: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> DashboardRead:
    return service.am_home(current_user, search=search, account_id=account_id, priority=priority, page=page, page_size=page_size)


@router.post("/am-home/task-summary/refresh", response_model=TaskSummaryRefreshRead, summary="Refresh AM Home task summary", description="Refreshes the API-backed AI Task Summary card without reloading other dashboard widgets.")
def refresh_task_summary(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[DashboardsService, Depends(get_dashboards_service)]) -> TaskSummaryRefreshRead:
    return service.refresh_task_summary(current_user)


@router.get("/kam-head-portfolio", response_model=DashboardRead, summary="KAM Head Portfolio dashboard", description="Returns portfolio widgets for health distribution, high-risk accounts, combined signals and critical tasks, escalations, workload, overdue actions, forecasts, SLA compliance, and the global governance calendar.")
def kam_head_portfolio(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[DashboardsService, Depends(get_dashboards_service)],
    search: str | None = None,
    am_id: str | None = None,
    segment: str | None = None,
    region: str | None = None,
    lifecycle_status: str | None = None,
    risk: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> DashboardRead:
    return service.kam_head_portfolio(current_user, search=search, am_id=am_id, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk, page=page, page_size=page_size)


@router.get("/leadership", response_model=DashboardRead, summary="Leadership dashboard", description="Returns read-only executive widgets for strategic health, retention, growth, revenue risk, major escalations, executive summaries, decision queue, forecasts, and the global governance calendar.")
def leadership(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[DashboardsService, Depends(get_dashboards_service)],
    search: str | None = None,
    segment: str | None = None,
    region: str | None = None,
    risk: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> DashboardRead:
    return service.leadership(current_user, search=search, segment=segment, region=region, risk=risk, page=page, page_size=page_size)
