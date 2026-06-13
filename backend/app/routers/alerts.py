from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_alerts_service, get_current_user
from app.models import User
from app.schemas import (
    AlertEvaluationRead,
    AlertEvaluationRequest,
    AlertPageRead,
    AlertRead,
    AlertRulePreviewRead,
    AlertRuleRead,
    AlertRuleUpdateRequest,
    AlertStatusUpdateRequest,
)
from app.services.alerts import AlertsService

router = APIRouter(prefix="/api", tags=["Alerts"])


@router.get(
    "/alerts",
    response_model=AlertPageRead,
    summary="List alerts",
    description="Lists backend-owned alerts with lifecycle, severity, source, owner, account, search, and pagination filters. The active status filter hides snoozed alerts until their snooze expires.",
    responses={401: {"description": "Missing or invalid token."}, 403: {"description": "User lacks alerts view permission."}},
)
def list_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AlertsService, Depends(get_alerts_service)],
    status_filter: Annotated[Literal["active", "open", "acknowledged", "snoozed", "resolved"] | None, Query(alias="status")] = None,
    severity: Literal["low", "medium", "high", "critical"] | None = None,
    alert_type: str | None = None,
    account_id: str | None = None,
    owner_id: str | None = None,
    source_type: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> AlertPageRead:
    return service.list_alerts(current_user, status_filter=status_filter, severity=severity, alert_type=alert_type, account_id=account_id, owner_id=owner_id, source_type=source_type, search=search, page=page, page_size=page_size)


@router.get(
    "/alerts/{alert_id}",
    response_model=AlertRead,
    summary="Get alert details",
    description="Returns one alert, its source/account context, evidence, recommendation, timestamps, and status history.",
    responses={404: {"description": "Alert was not found."}, 403: {"description": "User lacks alert/account access."}},
)
def get_alert(alert_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> AlertRead:
    return service.get_alert(alert_id, current_user)


@router.patch(
    "/alerts/{alert_id}/status",
    response_model=AlertRead,
    summary="Update alert status",
    description="Acknowledges, snoozes, resolves, or reopens an alert and records status history plus audit context. Snooze requires snoozed_until.",
    responses={400: {"description": "Invalid status payload."}, 403: {"description": "User is not allowed to update this alert."}, 404: {"description": "Alert was not found."}},
)
def update_alert_status(alert_id: str, payload: AlertStatusUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> AlertRead:
    return service.update_status(alert_id, payload, current_user)


@router.post(
    "/alerts/evaluate",
    response_model=AlertEvaluationRead,
    summary="Evaluate alert rules",
    description="Runs alert evaluation for all accounts or one account and returns evaluated, matched, created, updated, resolved, reactivated, notification, and worker-run counts.",
    responses={403: {"description": "User lacks permission to evaluate the requested scope."}, 404: {"description": "Account or active rule was not found."}},
)
def evaluate_alerts(payload: AlertEvaluationRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> AlertEvaluationRead:
    return service.evaluate(payload, current_user, mode="manual")


@router.get(
    "/admin/alert-rules",
    response_model=list[AlertRuleRead],
    summary="List alert rules",
    description="Lists the seven editable seeded alert rules used by backend-owned alert evaluation.",
    responses={403: {"description": "User lacks alerts configure permission."}},
)
def list_alert_rules(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> list[AlertRuleRead]:
    return service.list_rules(current_user)


@router.patch(
    "/admin/alert-rules/{rule_id}",
    response_model=AlertRuleRead,
    summary="Update alert rule",
    description="Updates editable alert-rule settings: active state, threshold, severity, snooze days, recipient policy, and leadership escalation toggle.",
    responses={400: {"description": "Validation failed for one or more rule fields."}, 403: {"description": "User lacks alerts configure permission."}, 404: {"description": "Rule was not found."}},
)
def update_alert_rule(rule_id: str, payload: AlertRuleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> AlertRuleRead:
    return service.update_rule(rule_id, payload, current_user)


@router.post(
    "/admin/alert-rules/{rule_id}/preview",
    response_model=AlertRulePreviewRead,
    summary="Preview alert rule",
    description="Evaluates one rule without creating alerts or notifications and returns total matches plus a limited sample for admin review.",
    responses={403: {"description": "User lacks alerts configure permission."}, 404: {"description": "Rule was not found."}},
)
def preview_alert_rule(rule_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[AlertsService, Depends(get_alerts_service)]) -> AlertRulePreviewRead:
    return service.preview_rule(rule_id, current_user)
