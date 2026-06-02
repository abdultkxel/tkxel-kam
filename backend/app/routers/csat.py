from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_csat_service, get_current_user
from app.models import User
from app.schemas import CsatScoreCreateRequest, CsatScorePageRead, CsatScoreRead, CsatScoreUpdateRequest, IntegrationItemMapRequest
from app.services.csat import CsatService

router = APIRouter(prefix="/api/csat", tags=["Approved Integrations"])
integration_router = APIRouter(prefix="/api/integrations/csat", tags=["Approved Integrations"])

Direction = Literal["asc", "desc"]
CsatSort = Literal["source_recorded_at", "normalized_score", "customer_name", "created_at", "updated_at"]


@integration_router.get("/scores", response_model=CsatScorePageRead, summary="List CSAT scores", description="Lists manually captured CSAT scores with account authorization, search, filters, sorting, and pagination.")
@router.get("/scores", response_model=CsatScorePageRead, summary="List CSAT scores", description="Lists manually captured CSAT scores with account authorization, search, filters, sorting, and pagination.")
def list_csat_scores(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CsatService, Depends(get_csat_service)],
    account_id: str | None = None,
    engagement_id: str | None = None,
    search: str | None = None,
    score_min: int | None = Query(default=None, ge=0, le=100),
    score_max: int | None = Query(default=None, ge=0, le=100),
    source: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: CsatSort = "source_recorded_at",
    direction: Direction = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> CsatScorePageRead:
    return service.list_scores(current_user, account_id=account_id, engagement_id=engagement_id, search=search, score_min=score_min, score_max=score_max, source=source, date_from=date_from, date_to=date_to, sort=sort, direction=direction, page=page, page_size=page_size)


@router.post("/scores", response_model=CsatScoreRead, status_code=status.HTTP_201_CREATED, summary="Create CSAT score", description="Creates a manual CSAT score, normalizes it, writes timeline/scoring evidence, and stores source metadata for future integration mapping.")
def create_csat_score(payload: CsatScoreCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[CsatService, Depends(get_csat_service)]) -> CsatScoreRead:
    return service.create_score(payload, current_user)


@router.get("/scores/{score_id}", response_model=CsatScoreRead, summary="Read CSAT score", description="Reads a single CSAT score with account authorization.")
def get_csat_score(score_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[CsatService, Depends(get_csat_service)]) -> CsatScoreRead:
    return service.get_score(score_id, current_user)


@router.patch("/scores/{score_id}", response_model=CsatScoreRead, summary="Update CSAT score", description="Updates a manual CSAT score and recalculates normalized score, trend, timeline, and scoring evidence.")
def update_csat_score(score_id: str, payload: CsatScoreUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[CsatService, Depends(get_csat_service)]) -> CsatScoreRead:
    return service.update_score(score_id, payload, current_user)


@integration_router.post("/scores/{score_id}/map", response_model=CsatScoreRead, summary="Map CSAT score", description="Maps a CSAT score to an account and optional engagement, refreshing timeline and scoring evidence.")
def map_csat_score(score_id: str, payload: IntegrationItemMapRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[CsatService, Depends(get_csat_service)]) -> CsatScoreRead:
    return service.map_score(score_id, payload, current_user)
