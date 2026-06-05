from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_ai_assistance_service, get_current_user
from app.models import User
from app.schemas import (
    AiAccountBriefResponse,
    AiAssistanceSearchRequest,
    AiAssistanceSearchResponse,
    AiBriefFeedbackRequest,
    AiBriefPageRead,
    AiForecastRequest,
    AiForecastResponse,
    AiGatewayRunRead,
    AiHandoffRequest,
    AiHandoffResponse,
    AiQueryHistoryPageRead,
    AiSearchFieldsRead,
    AiSearchFieldsUpdateRequest,
    AiStagePredictionResponse,
    AiStageChangeRead,
    AiTimelineNoteRequest,
    AiVocabularyTermRead,
    AiVocabularyTermRequest,
)
from app.services.ai_assistance import AiAssistanceService

router = APIRouter(prefix="/api", tags=["AI Assistance"])


@router.post(
    "/ai/search",
    response_model=AiAssistanceSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search with KAM AI",
    description="Runs source-backed advisory KAM AI search across authorized accounts, timeline records, opportunities, governance, KYC, and signals.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "User lacks AI Assistance or account access."},
        422: {"description": "Invalid search query, scopes, or limit."},
    },
)
def search_ai(
    payload: AiAssistanceSearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAssistanceSearchResponse:
    return service.search(payload, current_user)


@router.post(
    "/ai/query",
    response_model=AiAssistanceSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Run KAM AI query",
    description="Runs the same persisted source-backed AI search using the Technical Logic document's query endpoint name.",
)
def query_ai(
    payload: AiAssistanceSearchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAssistanceSearchResponse:
    return service.search(payload, current_user)


@router.get(
    "/ai/accounts",
    response_model=list[dict],
    summary="List AI-searchable accounts",
    description="Lists the accounts the current user may include in AI assistance queries.",
)
def list_ai_accounts(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> list[dict]:
    return service.list_accounts(current_user)


@router.get(
    "/ai/query-history",
    response_model=AiQueryHistoryPageRead,
    summary="List AI query history",
    description="Lists persisted AI assistance run history for the current user with optional account and text filters.",
)
def list_ai_query_history(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
    search: str | None = None,
    account_id: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AiQueryHistoryPageRead:
    return service.query_history(current_user, search=search, account_id=account_id, page=page, page_size=page_size)


@router.post(
    "/ai/query-history/{history_id}/rerun",
    response_model=AiAssistanceSearchResponse,
    summary="Rerun AI query",
    description="Reruns a persisted AI search history item using its stored prompt and permissions.",
)
def rerun_ai_query(
    history_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAssistanceSearchResponse:
    return service.rerun_query(history_id, current_user)


@router.post(
    "/accounts/{account_id}/ai/brief",
    response_model=AiAccountBriefResponse,
    summary="Generate account AI brief",
    description="Generates an advisory account brief from authorized score, KYC, signal, opportunity, and governance source records.",
)
def account_ai_brief(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAccountBriefResponse:
    return service.account_brief(account_id, current_user)


@router.post(
    "/accounts/{account_id}/ai-briefs",
    response_model=AiAccountBriefResponse,
    summary="Generate account AI brief",
    description="Generates and persists a reviewed account brief run for the Technical Logic document route.",
)
def create_account_ai_brief(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAccountBriefResponse:
    return service.account_brief(account_id, current_user)


@router.get(
    "/accounts/{account_id}/ai-briefs",
    response_model=AiBriefPageRead,
    summary="List account AI briefs",
    description="Lists persisted AI brief runs for an account.",
)
def list_account_ai_briefs(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> AiBriefPageRead:
    return service.account_brief_history(account_id, current_user, page=page, page_size=page_size)


@router.post(
    "/ai-briefs/{brief_id}/refresh",
    response_model=AiAccountBriefResponse,
    summary="Refresh account AI brief",
    description="Regenerates an account brief from the current source records while retaining the previous run.",
)
def refresh_account_ai_brief(
    brief_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiAccountBriefResponse:
    return service.refresh_brief(brief_id, current_user)


@router.post(
    "/ai-briefs/{brief_id}/feedback",
    response_model=AiGatewayRunRead,
    summary="Record AI brief feedback",
    description="Stores human feedback against an AI brief run for audit and model-governance review.",
)
def record_account_ai_brief_feedback(
    brief_id: str,
    payload: AiBriefFeedbackRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiGatewayRunRead:
    return AiGatewayRunRead.model_validate(service.record_brief_feedback(brief_id, payload, current_user))


@router.post(
    "/ai-briefs/{brief_id}/timeline-note",
    response_model=dict,
    summary="Create timeline note from AI brief",
    description="Creates a persisted account timeline note from a reviewed AI brief.",
)
def create_account_ai_brief_timeline_note(
    brief_id: str,
    payload: AiTimelineNoteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> dict[str, str]:
    return service.create_brief_timeline_note(brief_id, payload, current_user)


@router.post(
    "/accounts/{account_id}/ai/stage-prediction",
    response_model=AiStagePredictionResponse,
    summary="Generate advisory stage prediction",
    description="Returns source-backed stage recommendation evidence without mutating the official account lifecycle.",
)
def account_stage_prediction(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiStagePredictionResponse:
    return service.stage_prediction(account_id, current_user)


@router.post(
    "/accounts/{account_id}/ai-stage-prediction",
    response_model=AiStagePredictionResponse,
    summary="Generate advisory stage prediction",
    description="Technical Logic document alias for source-backed stage prediction.",
)
def account_stage_prediction_alias(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiStagePredictionResponse:
    return service.stage_prediction(account_id, current_user)


@router.post(
    "/accounts/{account_id}/stage-change-from-prediction",
    response_model=AiStageChangeRead,
    summary="Confirm AI-assisted account stage change",
    description="Applies a human-confirmed AI stage recommendation, writes audit history, timeline activity, and notifications.",
)
def apply_account_stage_prediction(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiStageChangeRead:
    return service.apply_stage_prediction(account_id, current_user)


@router.post(
    "/ai/forecast",
    response_model=AiForecastResponse,
    summary="Generate directional AI forecast",
    description="Creates an advisory account or portfolio forecast from commercial value, open opportunities, and health records.",
)
def ai_forecast(
    payload: AiForecastRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiForecastResponse:
    return service.forecast(payload, current_user)


@router.post(
    "/accounts/{account_id}/ai/handoff",
    response_model=AiHandoffResponse,
    summary="Generate account handoff brief",
    description="Creates an advisory source-cited handoff summary for authorized account transition and continuity workflows.",
)
def account_handoff(
    account_id: str,
    payload: AiHandoffRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiHandoffResponse:
    return service.handoff(account_id, payload, current_user)


@router.get(
    "/admin/ai-vocabulary",
    response_model=list[AiVocabularyTermRead],
    summary="List AI vocabulary",
    description="Lists admin-configured AI vocabulary terms used to standardize AI assistance behavior.",
)
def list_ai_vocabulary(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> list[AiVocabularyTermRead]:
    return service.list_vocabulary(current_user)


@router.post(
    "/admin/ai-vocabulary",
    response_model=AiVocabularyTermRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create AI vocabulary term",
    description="Creates an admin-configured AI vocabulary term.",
)
def create_ai_vocabulary_term(
    payload: AiVocabularyTermRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiVocabularyTermRead:
    return service.create_vocabulary_term(payload, current_user)


@router.patch(
    "/admin/ai-vocabulary/{term_id}",
    response_model=AiVocabularyTermRead,
    summary="Update AI vocabulary term",
    description="Updates an admin-configured AI vocabulary term.",
)
def update_ai_vocabulary_term(
    term_id: str,
    payload: AiVocabularyTermRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiVocabularyTermRead:
    return service.update_vocabulary_term(term_id, payload, current_user)


@router.get(
    "/admin/ai-search-fields",
    response_model=AiSearchFieldsRead,
    summary="Read AI search-field settings",
    description="Reads admin-configured fields/scopes that AI assistance may search.",
)
def read_ai_search_fields(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiSearchFieldsRead:
    return service.get_search_fields(current_user)


@router.put(
    "/admin/ai-search-fields",
    response_model=AiSearchFieldsRead,
    summary="Update AI search-field settings",
    description="Updates admin-configured fields/scopes that AI assistance may search.",
)
def update_ai_search_fields(
    payload: AiSearchFieldsUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AiAssistanceService, Depends(get_ai_assistance_service)],
) -> AiSearchFieldsRead:
    return service.update_search_fields(payload, current_user)
