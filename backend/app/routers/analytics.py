from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_analytics_service, get_current_user
from app.models import User
from app.schemas import (
    AccountChangeAlertPageRead,
    AccountChangeAlertRead,
    AccountChangeAlertUpdateRequest,
    AnalyticsBenchmarkPageRead,
    AnalyticsPortfolioRead,
    KamPerformancePageRead,
)
from app.services.analytics import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["Analytics, Benchmarking, and Alerts"])


@router.get(
    "/portfolio",
    response_model=AnalyticsPortfolioRead,
    summary="Read portfolio analytics",
    description="Returns role-scoped portfolio analytics calculated from persisted accounts, score snapshots, tasks, escalations, opportunities, and signals.",
    responses={401: {"description": "Missing or invalid token."}, 403: {"description": "User lacks analytics view permission."}},
)
def portfolio_analytics(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    search: str | None = None,
    am_id: str | None = None,
    segment: str | None = None,
    region: str | None = None,
    lifecycle_status: str | None = None,
    risk: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> AnalyticsPortfolioRead:
    return service.portfolio(current_user, search=search, am_id=am_id, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk, date_from=date_from, date_to=date_to)


@router.get(
    "/benchmarks",
    response_model=AnalyticsBenchmarkPageRead,
    summary="Read benchmark cohorts",
    description="Returns role-scoped benchmark cohorts with small-cohort suppression.",
)
def benchmarks(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    cohort_by: Literal["segment", "region", "lifecycle_status", "risk_status"] = "segment",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AnalyticsBenchmarkPageRead:
    return service.benchmarks(current_user, cohort_by=cohort_by, page=page, page_size=page_size)


@router.get(
    "/kam-performance",
    response_model=KamPerformancePageRead,
    summary="Read KAM performance analytics",
    description="Returns configured KAM performance metrics including health, overdue action rate, governance cadence, renewal readiness, pipeline, and escalations.",
)
def kam_performance(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> KamPerformancePageRead:
    return service.kam_performance(current_user, page=page, page_size=page_size)


@router.get(
    "/account-change-alerts",
    response_model=AccountChangeAlertPageRead,
    summary="List account-change alerts",
    description="Returns persisted proactive account-change alerts and refreshes deterministic alerts from current score/account evidence.",
)
def account_change_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    search: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    severity: str | None = None,
    owner_id: str | None = None,
    refresh: bool = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AccountChangeAlertPageRead:
    return service.list_change_alerts(current_user, search=search, status_filter=status_filter, severity=severity, owner_id=owner_id, refresh=refresh, page=page, page_size=page_size)


@router.patch(
    "/account-change-alerts/{alert_id}/status",
    response_model=AccountChangeAlertRead,
    summary="Update account-change alert status",
    description="Updates a proactive account-change alert lifecycle status with audit logging.",
    responses={404: {"description": "Alert was not found."}, 403: {"description": "User lacks analytics update permission."}},
)
def update_account_change_alert_status(
    alert_id: str,
    payload: AccountChangeAlertUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> AccountChangeAlertRead:
    return service.update_change_alert(alert_id, payload, current_user)
