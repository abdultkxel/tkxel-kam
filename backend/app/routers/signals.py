from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_signals_service
from app.models import User
from app.schemas import (
    PlaybookExecutionRead,
    RecommendedPlaybookRead,
    SignalAIExplanationRead,
    SignalConvertRequest,
    SignalEvaluationRead,
    SignalEvaluationRequest,
    SignalEvidenceRead,
    SignalPageRead,
    SignalRead,
    SignalRuleCreateRequest,
    SignalRulePageRead,
    SignalRuleRead,
    SignalRuleUpdateRequest,
    SignalStatusUpdateRequest,
    TaskRead,
)
from app.services.signals import SignalsService

Direction = Literal["asc", "desc"]
SignalSort = Literal["created_at", "updated_at", "due_at", "severity", "status", "owner_name", "confidence"]
SignalRuleSort = Literal["name", "signal_type", "severity", "updated_at", "created_at"]
ActiveState = Literal["all", "active", "inactive"]

router = APIRouter(prefix="/api", tags=["Signals and Attention Center"])


@router.get("/admin/signal-rules", response_model=SignalRulePageRead, summary="List signal rules", description="Admin deterministic signal rule list with search, type/severity/active filters, sorting, and pagination.")
def list_signal_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SignalsService, Depends(get_signals_service)],
    search: str | None = None,
    signal_type: str | None = None,
    severity: Literal["info", "warning", "critical"] | None = None,
    active_state: ActiveState = "active",
    sort: SignalRuleSort = "updated_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> SignalRulePageRead:
    return service.list_rules(current_user, search=search, signal_type=signal_type, severity=severity, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/admin/signal-rules", response_model=SignalRuleRead, status_code=201, summary="Create signal rule", description="Creates a configurable deterministic signal rule after RBAC and schema validation.")
def create_signal_rule(payload: SignalRuleCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalRuleRead:
    return service.create_rule(payload, current_user)


@router.patch("/admin/signal-rules/{rule_id}", response_model=SignalRuleRead, summary="Update signal rule", description="Updates a deterministic signal rule and increments its version when evaluation-impacting fields change.")
def update_signal_rule(rule_id: str, payload: SignalRuleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalRuleRead:
    return service.update_rule(rule_id, payload, current_user)


@router.get("/signals", response_model=SignalPageRead, summary="List signals", description="Paginated signal list with account, engagement, status, severity, owner, search, date, sort, and pagination support.")
def list_signals(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SignalsService, Depends(get_signals_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    signal_type: str | None = None,
    severity: Literal["info", "warning", "critical"] | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    owner_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    active_only: bool = False,
    sort: SignalSort = "created_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> SignalPageRead:
    return service.list_signals(
        current_user,
        account_id=account_id,
        engagement_id=engagement_id,
        search=search,
        signal_type=signal_type,
        severity=severity,
        status_filter=status_filter,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
        active_only=active_only,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.get("/attention-center", response_model=SignalPageRead, summary="Read attention center", description="Urgent active signals sorted by due date with severity/owner filters and pagination.")
def attention_center(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SignalsService, Depends(get_signals_service)],
    account_id: str | None = None,
    search: str | None = None,
    signal_type: str | None = None,
    severity: Literal["info", "warning", "critical"] | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    owner_id: str | None = None,
    sort: SignalSort = "due_at",
    direction: Direction = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> SignalPageRead:
    return service.attention_center(
        current_user,
        account_id=account_id,
        search=search,
        signal_type=signal_type,
        severity=severity,
        status_filter=status_filter,
        owner_id=owner_id,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post("/signals/evaluate", response_model=SignalEvaluationRead, summary="Evaluate signal rules", description="Runs deterministic rule evaluation for one account/engagement or authorized portfolio scope.")
def evaluate_signals(payload: SignalEvaluationRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalEvaluationRead:
    return service.evaluate(current_user, account_id=payload.account_id, engagement_id=payload.engagement_id, trigger_source=payload.trigger_source)


@router.patch("/signals/{signal_id}/status", response_model=SignalRead, summary="Update signal status", description="Moves a signal through reviewed, accepted, dismissed, converted, and resolved lifecycle states with audit history.")
def update_signal_status(signal_id: str, payload: SignalStatusUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalRead:
    return service.update_status(signal_id, payload, current_user)


@router.post("/signals/{signal_id}/convert", response_model=TaskRead | PlaybookExecutionRead, summary="Convert signal", description="Converts a signal into a task or executes a mapped playbook only after explicit user selection.")
def convert_signal(signal_id: str, payload: SignalConvertRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> TaskRead | PlaybookExecutionRead:
    return service.convert(signal_id, payload, current_user)


@router.get("/signals/{signal_id}/evidence", response_model=SignalEvidenceRead, summary="Read signal evidence", description="Returns source evidence and citations that caused a deterministic signal to fire.")
def signal_evidence(signal_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalEvidenceRead:
    return service.evidence(signal_id, current_user)


@router.post("/signals/{signal_id}/ai-explanation", response_model=SignalAIExplanationRead, summary="Generate advisory signal explanation", description="Returns advisory AI/LLM Gateway explanation text without mutating signal status or task lifecycle.")
def signal_ai_explanation(signal_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> SignalAIExplanationRead:
    return service.ai_explanation(signal_id, current_user)


@router.get("/signals/{signal_id}/recommended-playbooks", response_model=list[RecommendedPlaybookRead], summary="List recommended playbooks", description="Lists active playbook templates mapped to the signal type or weak metric reasons.")
def recommended_playbooks(signal_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[SignalsService, Depends(get_signals_service)]) -> list[RecommendedPlaybookRead]:
    return service.recommended_playbooks(signal_id, current_user)
