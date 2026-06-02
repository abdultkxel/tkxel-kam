from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_scoring_service
from app.models import User
from app.schemas import (
    MetricValidationRead,
    ScoreRead,
    ScoreRecalculateRequest,
    ScoreSnapshotPageRead,
    ScoringJobCreateRequest,
    ScoringJobRead,
    ScoringMetricCreateRequest,
    ScoringMetricPageRead,
    ScoringMetricRead,
    ScoringMetricUpdateRequest,
    ScoringMetricVersionPageRead,
    ScoringMetricVersionRead,
)
from app.services.scoring import ScoringService

Direction = Literal["asc", "desc"]
MetricSort = Literal["name", "scope", "status", "weight", "updated_at", "created_at"]
SnapshotSort = Literal["calculated_at", "overall", "rag_status", "freshness_status", "trend"]
ActiveState = Literal["all", "active", "inactive"]

router = APIRouter(prefix="/api", tags=["Scoring Engine"])


@router.get("/admin/metrics", response_model=ScoringMetricPageRead, summary="List scoring metrics", description="Admin/configuration metric list with search, scope/status/active filters, sorting, and pagination.")
def list_metrics(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ScoringService, Depends(get_scoring_service)],
    search: str | None = None,
    scope: Literal["account", "engagement"] | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    active_state: ActiveState = "active",
    sort: MetricSort = "updated_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> ScoringMetricPageRead:
    return service.list_metrics(current_user, search=search, scope=scope, status_filter=status_filter, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/admin/metrics", response_model=ScoringMetricRead, status_code=status.HTTP_201_CREATED, summary="Create scoring metric", description="Creates a draft or active scoring metric definition after formula and threshold validation.")
def create_metric(payload: ScoringMetricCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoringMetricRead:
    return service.create_metric(payload, current_user)


@router.patch("/admin/metrics/{metric_id}", response_model=ScoringMetricRead, summary="Update scoring metric", description="Updates scoring metric configuration and validates formula/threshold safety.")
def update_metric(metric_id: str, payload: ScoringMetricUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoringMetricRead:
    return service.update_metric(metric_id, payload, current_user)


@router.post("/admin/metrics/{metric_id}/validate", response_model=MetricValidationRead, summary="Validate scoring metric", description="Validates a metric formula and threshold configuration without publishing it.")
def validate_metric(metric_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> MetricValidationRead:
    return service.validate_metric(metric_id, current_user)


@router.post("/admin/metrics/{metric_id}/publish", response_model=ScoringMetricVersionRead, summary="Publish scoring metric", description="Publishes an immutable metric version after validation.")
def publish_metric(metric_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoringMetricVersionRead:
    return service.publish_metric(metric_id, current_user)


@router.get("/admin/metrics/{metric_id}/versions", response_model=ScoringMetricVersionPageRead, summary="List metric versions", description="Lists immutable published versions for a scoring metric.")
def list_metric_versions(metric_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)], page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)) -> ScoringMetricVersionPageRead:
    return service.list_metric_versions(metric_id, current_user, page=page, page_size=page_size)


@router.get("/accounts/{account_id}/scores", response_model=ScoreRead, summary="Read account score", description="Returns the latest account score snapshot or an incomplete current-state score if no snapshot exists.")
def get_account_score(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoreRead:
    return service.get_account_score(account_id, current_user)


@router.post("/accounts/{account_id}/scores/recalculate", response_model=ScoreRead, summary="Recalculate account score", description="Runs deterministic account scoring synchronously, records a scoring job, persists a score snapshot, and optionally refreshes signals.")
def recalculate_account_score(account_id: str, payload: ScoreRecalculateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoreRead:
    return service.recalculate_account_score(account_id, payload, current_user)


@router.get("/accounts/{account_id}/score-snapshots", response_model=ScoreSnapshotPageRead, summary="List account score snapshots", description="Paginated score snapshot history with scope, engagement, RAG, status, date, sort, and pagination support.")
def list_account_score_snapshots(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ScoringService, Depends(get_scoring_service)],
    scope: Literal["account", "engagement"] | None = None,
    engagement_id: str | None = None,
    rag_status: Literal["red", "amber", "green"] | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: SnapshotSort = "calculated_at",
    direction: Direction = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> ScoreSnapshotPageRead:
    return service.list_account_snapshots(account_id, current_user, scope=scope, engagement_id=engagement_id, rag_status=rag_status, status_filter=status_filter, date_from=date_from, date_to=date_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.get("/engagements/{engagement_id}/scores", response_model=ScoreRead, summary="Read engagement score", description="Returns the latest engagement score snapshot or current delivery-health score if no snapshot exists.")
def get_engagement_score(engagement_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoreRead:
    return service.get_engagement_score(engagement_id, current_user)


@router.post("/engagements/{engagement_id}/scores/recalculate", response_model=ScoreRead, summary="Recalculate engagement score", description="Runs deterministic engagement scoring synchronously and persists score plus engagement-health snapshots.")
def recalculate_engagement_score(engagement_id: str, payload: ScoreRecalculateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoreRead:
    return service.recalculate_engagement_score(engagement_id, payload, current_user)


@router.post("/scoring/jobs", response_model=ScoringJobRead, status_code=status.HTTP_201_CREATED, summary="Create scoring job", description="Creates and executes a manual, scheduled, or event scoring job for account, engagement, or portfolio scope in the local worker adapter.")
def create_scoring_job(payload: ScoringJobCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ScoringService, Depends(get_scoring_service)]) -> ScoringJobRead:
    return service.create_job(payload, current_user)
