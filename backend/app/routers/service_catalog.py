from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_service_catalog_service
from app.models import User
from app.schemas import (
    AccountWhitespaceItemRead,
    AccountWhitespaceUpdateRequest,
    OpportunityRead,
    RecommendationOpportunityCreateRequest,
    ServiceAdjacencyRuleRead,
    ServiceAdjacencyUpdateRequest,
    ServiceCatalogItemCreateRequest,
    ServiceCatalogItemRead,
    ServiceCatalogItemUpdateRequest,
    ServiceCatalogPageRead,
    ServiceRecommendationPageRead,
)
from app.services.service_catalog import ServiceCatalogService

Direction = Literal["asc", "desc"]
ActiveState = Literal["all", "active", "inactive"]
ServiceSort = Literal["display_order", "name", "category", "updated_at"]
RecommendationSort = Literal["relevance_score", "updated_at", "status"]

router = APIRouter(prefix="/api", tags=["Account Planning, Whitespace, and Service Catalog"])
CATALOG_RESPONSES = {
    401: {"description": "Authentication is required."},
    403: {"description": "The user does not have permission for this account planning operation."},
    404: {"description": "The account, engagement, service, or recommendation was not found."},
    422: {"description": "Validation errors keyed by field."},
}


@router.get(
    "/service-catalog",
    response_model=ServiceCatalogPageRead,
    summary="List service catalog",
    description="Returns active service catalog items for account whitespace capture with search, filter, sort, and pagination.",
    response_description="A paginated page of active service catalog items.",
    responses=CATALOG_RESPONSES,
)
def list_service_catalog(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)],
    search: str | None = None,
    category: str | None = None,
    sort: ServiceSort = "display_order",
    direction: Direction = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ServiceCatalogPageRead:
    return service.list_services(current_user, search=search, category=category, active_state="active", sort=sort, direction=direction, page=page, page_size=page_size)


@router.get(
    "/admin/service-catalog",
    response_model=ServiceCatalogPageRead,
    summary="List admin service catalog",
    description="Admin/KAM Head service taxonomy list with search, filter, sort, pagination, active state, and in-use counts.",
    response_description="A paginated page of service catalog items, including inactive records when requested.",
    responses=CATALOG_RESPONSES,
)
def list_admin_service_catalog(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)],
    search: str | None = None,
    category: str | None = None,
    active_state: ActiveState = "active",
    sort: ServiceSort = "display_order",
    direction: Direction = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ServiceCatalogPageRead:
    return service.list_services(current_user, search=search, category=category, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size, require_configure=True)


@router.post(
    "/admin/service-catalog",
    response_model=ServiceCatalogItemRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create service catalog item",
    description="Creates a service catalog item used by whitespace capture and adjacency recommendations.",
    response_description="The created service catalog item.",
    responses=CATALOG_RESPONSES | {409: {"description": "A service slug or name already exists."}},
)
def create_service_catalog_item(payload: ServiceCatalogItemCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceCatalogItemRead:
    return service.create_service(payload, current_user)


@router.patch(
    "/admin/service-catalog/{service_id}",
    response_model=ServiceCatalogItemRead,
    summary="Update service catalog item",
    description="Updates service catalog metadata or active state while preserving historical whitespace records.",
    response_description="The updated service catalog item.",
    responses=CATALOG_RESPONSES | {409: {"description": "A service slug or name already exists."}},
)
def update_service_catalog_item(service_id: str, payload: ServiceCatalogItemUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceCatalogItemRead:
    return service.update_service(service_id, payload, current_user)


@router.get(
    "/admin/service-adjacencies",
    response_model=list[ServiceAdjacencyRuleRead],
    summary="List service adjacency rules",
    description="Returns configured service adjacency rules used to generate explainable whitespace recommendations.",
    response_description="The configured service adjacency rules.",
    responses=CATALOG_RESPONSES,
)
def list_service_adjacencies(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceAdjacencyRuleRead]:
    return service.list_adjacencies(current_user)


@router.put(
    "/admin/service-adjacencies",
    response_model=list[ServiceAdjacencyRuleRead],
    summary="Replace service adjacency rules",
    description="Replaces adjacency rules after validating services, duplicate pairs, relevance score, and rationale.",
    response_description="The replacement service adjacency rule set.",
    responses=CATALOG_RESPONSES,
)
def replace_service_adjacencies(payload: ServiceAdjacencyUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceAdjacencyRuleRead]:
    return service.replace_adjacencies(payload, current_user)


@router.get(
    "/accounts/{account_id}/whitespace",
    response_model=list[AccountWhitespaceItemRead],
    summary="List account whitespace inputs",
    description="Returns account or engagement-scoped service coverage inputs with account authorization applied.",
    response_description="Whitespace coverage inputs for the requested account or engagement scope.",
    responses=CATALOG_RESPONSES,
)
def list_account_whitespace(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)], engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
    return service.list_whitespace(account_id, current_user, engagement_id=engagement_id)


@router.put(
    "/accounts/{account_id}/whitespace",
    response_model=list[AccountWhitespaceItemRead],
    summary="Replace account whitespace inputs",
    description="Replaces whitespace inputs, validates active service references, writes audit/timeline entries, and refreshes adjacency recommendations.",
    response_description="The saved whitespace coverage inputs for the requested scope.",
    responses=CATALOG_RESPONSES | {400: {"description": "Archived accounts are read-only."}},
)
def update_account_whitespace(account_id: str, payload: AccountWhitespaceUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)], engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
    return service.update_whitespace(account_id, payload, current_user, engagement_id=engagement_id)


@router.get(
    "/accounts/{account_id}/service-recommendations",
    response_model=ServiceRecommendationPageRead,
    summary="List account service recommendations",
    description="Returns paginated explainable adjacent-service recommendations generated from whitespace and catalog adjacency rules.",
    response_description="A paginated page of explainable service recommendations.",
    responses=CATALOG_RESPONSES,
)
def list_service_recommendations(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)],
    engagement_id: str | None = None,
    search: str | None = None,
    service_line: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    sort: RecommendationSort = "relevance_score",
    direction: Direction = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ServiceRecommendationPageRead:
    items, total, pages = service.list_recommendations(account_id, current_user, engagement_id=engagement_id, search=search, service_line=service_line, status_filter=status_filter, sort=sort, direction=direction, page=page, page_size=page_size)
    return ServiceRecommendationPageRead(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post(
    "/accounts/{account_id}/service-recommendations/{recommendation_id}/opportunity",
    response_model=OpportunityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create opportunity from service recommendation",
    description="Creates an opportunity only after explicit confirmation and preserves recommendation source context.",
    response_description="The created opportunity linked to the service recommendation.",
    responses=CATALOG_RESPONSES | {400: {"description": "Opportunity configuration is missing."}},
)
def create_opportunity_from_recommendation(account_id: str, recommendation_id: str, payload: RecommendationOpportunityCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> OpportunityRead:
    return service.create_opportunity_from_recommendation(account_id, recommendation_id, payload, current_user)
