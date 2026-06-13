from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_service_catalog_service
from app.models import User
from app.schemas import (
    AccountWhitespaceItemRead,
    AccountWhitespacePatchRequest,
    AccountWhitespaceUpdateRequest,
    OpportunityRead,
    RecommendationOpportunityCreateRequest,
    ServiceAdjacencyRuleRead,
    ServiceAdjacencyUpdateRequest,
    ServiceCatalogItemCreateRequest,
    ServiceCatalogItemRead,
    ServiceCatalogItemUpdateRequest,
    ServiceCatalogPageRead,
    ServiceGrowthBundleCreateRequest,
    ServiceGrowthBundleRead,
    ServiceGrowthBundleUpdateRequest,
    ServiceGrowthRuleRead,
    ServiceGrowthRuleRequest,
    ServiceGrowthTaxonomyRead,
    ServiceRecommendationPageRead,
)
from app.services.service_catalog import ServiceCatalogService

Direction = Literal["asc", "desc"]
ActiveState = Literal["all", "active", "inactive"]
ServiceSort = Literal["display_order", "name", "category", "updated_at"]
RecommendationSort = Literal["relevance_score", "updated_at", "status"]

router = APIRouter(prefix="/api", tags=["Account Planning, Whitespace, and Service Catalog"])


@router.get(
    "/service-catalog",
    response_model=ServiceCatalogPageRead,
    summary="List service catalog",
    description="Returns active service catalog items for account whitespace capture with search, filter, sort, and pagination.",
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
)
def create_service_catalog_item(payload: ServiceCatalogItemCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceCatalogItemRead:
    return service.create_service(payload, current_user)


@router.patch(
    "/admin/service-catalog/{service_id}",
    response_model=ServiceCatalogItemRead,
    summary="Update service catalog item",
    description="Updates service catalog metadata or active state while preserving historical whitespace records.",
)
def update_service_catalog_item(service_id: str, payload: ServiceCatalogItemUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceCatalogItemRead:
    return service.update_service(service_id, payload, current_user)


@router.get(
    "/admin/service-growth-taxonomy",
    response_model=ServiceGrowthTaxonomyRead,
    summary="List service growth taxonomy",
    description="Returns active service categories, tags, and bundles available for scalable growth recommendation rules.",
)
def list_service_growth_taxonomy(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceGrowthTaxonomyRead:
    return service.list_taxonomy(current_user)


@router.get(
    "/admin/service-growth-bundles",
    response_model=list[ServiceGrowthBundleRead],
    summary="List service growth bundles",
    description="Returns service bundles used as reusable source or target selectors in growth recommendation rules.",
)
def list_service_growth_bundles(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceGrowthBundleRead]:
    return service.list_bundles(current_user)


@router.post(
    "/admin/service-growth-bundles",
    response_model=ServiceGrowthBundleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create service growth bundle",
    description="Creates a reusable service bundle for scalable growth recommendation rules.",
)
def create_service_growth_bundle(payload: ServiceGrowthBundleCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceGrowthBundleRead:
    return service.create_bundle(payload, current_user)


@router.patch(
    "/admin/service-growth-bundles/{bundle_id}",
    response_model=ServiceGrowthBundleRead,
    summary="Update service growth bundle",
    description="Updates a service bundle, including selected active services and active state.",
)
def update_service_growth_bundle(bundle_id: str, payload: ServiceGrowthBundleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceGrowthBundleRead:
    return service.update_bundle(bundle_id, payload, current_user)


@router.get(
    "/admin/service-growth-rules",
    response_model=list[ServiceGrowthRuleRead],
    summary="List service growth rules",
    description="Returns taxonomy-based service growth recommendation rules with selector labels and base fit scores.",
)
def list_service_growth_rules(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceGrowthRuleRead]:
    return service.list_growth_rules(current_user)


@router.post(
    "/admin/service-growth-rules",
    response_model=ServiceGrowthRuleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create service growth rule",
    description="Creates a taxonomy-based recommendation rule using service, category, tag, or bundle selectors.",
)
def create_service_growth_rule(payload: ServiceGrowthRuleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceGrowthRuleRead:
    return service.create_growth_rule(payload, current_user)


@router.patch(
    "/admin/service-growth-rules/{rule_id}",
    response_model=ServiceGrowthRuleRead,
    summary="Update service growth rule",
    description="Updates a taxonomy-based recommendation rule and its base fit scoring policy.",
)
def update_service_growth_rule(rule_id: str, payload: ServiceGrowthRuleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> ServiceGrowthRuleRead:
    return service.update_growth_rule(rule_id, payload, current_user)


@router.get(
    "/admin/service-adjacencies",
    response_model=list[ServiceAdjacencyRuleRead],
    summary="List service adjacency rules",
    description="Returns configured service adjacency rules used to generate explainable whitespace recommendations.",
)
def list_service_adjacencies(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceAdjacencyRuleRead]:
    return service.list_adjacencies(current_user)


@router.put(
    "/admin/service-adjacencies",
    response_model=list[ServiceAdjacencyRuleRead],
    summary="Replace service adjacency rules",
    description="Replaces adjacency rules after validating services, duplicate pairs, relevance score, and rationale.",
)
def replace_service_adjacencies(payload: ServiceAdjacencyUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> list[ServiceAdjacencyRuleRead]:
    return service.replace_adjacencies(payload, current_user)


@router.get(
    "/accounts/{account_id}/whitespace",
    response_model=list[AccountWhitespaceItemRead],
    summary="List account whitespace inputs",
    description="Returns account or engagement-scoped service coverage inputs with account authorization applied.",
)
def list_account_whitespace(account_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)], engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
    return service.list_whitespace(account_id, current_user, engagement_id=engagement_id)


@router.put(
    "/accounts/{account_id}/whitespace",
    response_model=list[AccountWhitespaceItemRead],
    summary="Replace account whitespace inputs",
    description="Replaces whitespace inputs, validates active service references, writes audit/timeline entries, and refreshes adjacency recommendations.",
)
def update_account_whitespace(account_id: str, payload: AccountWhitespaceUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)], engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
    return service.update_whitespace(account_id, payload, current_user, engagement_id=engagement_id)


@router.patch(
    "/accounts/{account_id}/whitespace",
    response_model=list[AccountWhitespaceItemRead],
    summary="Patch account whitespace inputs",
    description="Updates selected whitespace inputs without replacing unseen paginated service coverage rows, then refreshes growth recommendations.",
)
def patch_account_whitespace(account_id: str, payload: AccountWhitespacePatchRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)], engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
    return service.patch_whitespace(account_id, payload, current_user, engagement_id=engagement_id)


@router.get(
    "/accounts/{account_id}/service-recommendations",
    response_model=ServiceRecommendationPageRead,
    summary="List account service recommendations",
    description="Returns paginated explainable adjacent-service recommendations generated from whitespace and catalog adjacency rules.",
)
def list_service_recommendations(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)],
    search: str | None = None,
    service_line: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    sort: RecommendationSort = "relevance_score",
    direction: Direction = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ServiceRecommendationPageRead:
    items, total, pages = service.list_recommendations(account_id, current_user, search=search, service_line=service_line, status_filter=status_filter, sort=sort, direction=direction, page=page, page_size=page_size)
    return ServiceRecommendationPageRead(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post(
    "/accounts/{account_id}/service-recommendations/{recommendation_id}/opportunity",
    response_model=OpportunityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create opportunity from service recommendation",
    description="Creates an opportunity only after explicit confirmation and preserves recommendation source context.",
)
def create_opportunity_from_recommendation(account_id: str, recommendation_id: str, payload: RecommendationOpportunityCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[ServiceCatalogService, Depends(get_service_catalog_service)]) -> OpportunityRead:
    return service.create_opportunity_from_recommendation(account_id, recommendation_id, payload, current_user)
