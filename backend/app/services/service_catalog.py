from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, AccountWhitespaceItem, Opportunity, OpportunityStageHistory, ServiceAdjacencyRule, ServiceCatalogItem, ServiceRecommendation, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.opportunities import OpportunityRepository
from app.repositories.rbac import RbacRepository
from app.repositories.service_catalog import ServiceCatalogRepository
from app.repositories.timeline import TimelineRepository
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
    ServiceRecommendationRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.opportunities import OpportunityService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

ACCOUNT_PLANNING_MODULE = "account_planning"
OPPORTUNITY_MODULE = "opportunity_management"


def field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]})


class ServiceCatalogService:
    def __init__(self, db: Session) -> None:
        self.repository = ServiceCatalogRepository(db)
        self.opportunities = OpportunityRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.opportunity_reader = OpportunityService(db)

    def list_services(self, current_user: User, *, search: str | None = None, category: str | None = None, active_state: str = "active", sort: str = "display_order", direction: str = "asc", page: int = 1, page_size: int = 25, require_configure: bool = False) -> ServiceCatalogPageRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure" if require_configure else "view")
        items, total = self.repository.list_services(search=search, category=category, active_state=active_state, sort=sort, direction=direction, page=page, page_size=page_size)
        return ServiceCatalogPageRead(items=[self._service_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_service(self, payload: ServiceCatalogItemCreateRequest, current_user: User) -> ServiceCatalogItemRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        if self.repository.get_service_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A service with this slug already exists")
        item = ServiceCatalogItem(
            slug=payload.slug,
            name=payload.name,
            category=payload.category,
            description=payload.description,
            tags=payload.tags,
            is_active=payload.is_active,
            display_order=payload.display_order,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_service(item)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_service", entity_type="service_catalog_item", entity_id=item.id, actor=current_user, after_value=self._service_snapshot(item))
        self.repository.commit()
        return self._service_read(item)

    def update_service(self, service_id: str, payload: ServiceCatalogItemUpdateRequest, current_user: User) -> ServiceCatalogItemRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        item = self._get_service_or_404(service_id)
        before = self._service_snapshot(item)
        updates = payload.model_dump(exclude_unset=True)
        if "slug" in updates and updates["slug"] != item.slug and self.repository.get_service_by_slug(updates["slug"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A service with this slug already exists")
        for field, value in updates.items():
            setattr(item, field, value)
        item.updated_by_id = current_user.id
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_service", entity_type="service_catalog_item", entity_id=item.id, actor=current_user, before_value=before, after_value=self._service_snapshot(item))
        self.repository.commit()
        return self._service_read(item)

    def list_adjacencies(self, current_user: User) -> list[ServiceAdjacencyRuleRead]:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "view")
        return [self._adjacency_read(item) for item in self.repository.list_adjacencies()]

    def replace_adjacencies(self, payload: ServiceAdjacencyUpdateRequest, current_user: User) -> list[ServiceAdjacencyRuleRead]:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        rules: list[ServiceAdjacencyRule] = []
        seen: set[tuple[str, str]] = set()
        for index, item in enumerate(payload.rules):
            if item.source_service_id == item.target_service_id:
                raise field_error(f"rules.{index}.target_service_id", "Adjacent service must be different from source service.")
            source = self._get_active_service_or_404(item.source_service_id, f"rules.{index}.source_service_id")
            target = self._get_active_service_or_404(item.target_service_id, f"rules.{index}.target_service_id")
            key = (source.id, target.id)
            if key in seen:
                raise field_error(f"rules.{index}.target_service_id", "Duplicate adjacency rule.")
            seen.add(key)
            rules.append(ServiceAdjacencyRule(source_service_id=source.id, target_service_id=target.id, relevance_score=item.relevance_score, rationale=item.rationale, is_active=item.is_active, created_by_id=current_user.id, updated_by_id=current_user.id))
        before = [self._adjacency_snapshot(item) for item in self.repository.list_adjacencies()]
        self.repository.replace_adjacencies(rules)
        after = [self._adjacency_snapshot(item) for item in self.repository.list_adjacencies()]
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_adjacency", entity_type="service_adjacency_rules", entity_id="bulk", actor=current_user, before_value={"rules": before}, after_value={"rules": after})
        self.repository.commit()
        return [self._adjacency_read(item) for item in self.repository.list_adjacencies()]

    def list_whitespace(self, account_id: str, current_user: User, engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        if engagement_id:
            self._ensure_engagement(account_id, engagement_id)
        return [self._whitespace_read(item) for item in self.repository.list_whitespace(account_id, engagement_id=engagement_id)]

    def update_whitespace(self, account_id: str, payload: AccountWhitespaceUpdateRequest, current_user: User, engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        items: list[AccountWhitespaceItem] = []
        seen: set[tuple[str | None, str]] = set()
        for index, item in enumerate(payload.items):
            item_engagement_id = item.engagement_id or engagement_id
            if item_engagement_id:
                self._ensure_engagement(account_id, item_engagement_id)
            service = self._get_active_service_or_404(item.service_id, f"items.{index}.service_id")
            key = (item_engagement_id, service.id)
            if key in seen:
                raise field_error(f"items.{index}.service_id", "Duplicate whitespace service for this scope.")
            seen.add(key)
            items.append(
                AccountWhitespaceItem(
                    account_id=account_id,
                    engagement_id=item_engagement_id,
                    service_id=service.id,
                    service_name_snapshot=service.name,
                    coverage_status=item.coverage_status,
                    notes=item.notes,
                    source=item.source,
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                )
            )
        before = [self._whitespace_snapshot(item) for item in self.repository.list_whitespace(account_id, engagement_id=engagement_id)]
        self.repository.replace_whitespace(account_id, items, engagement_id=engagement_id)
        self._generate_recommendations(account_id)
        after_items = self.repository.list_whitespace(account_id, engagement_id=engagement_id)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="update_whitespace", entity_type="account_whitespace", entity_id=account_id, actor=current_user, before_value={"items": before}, after_value={"items": [self._whitespace_snapshot(item) for item in after_items]})
        self.timeline.add_account_event(
            account_id=account_id,
            event_type="whitespace_updated",
            module=ACCOUNT_PLANNING_MODULE,
            title="Whitespace updated",
            description=f"{current_user.full_name} updated service coverage and whitespace inputs.",
            actor=current_user,
            source_record_id=account_id,
            source_record_type="account_whitespace",
            source_record_route=f"/accounts/{account_id}?tab=growth",
            before_value={"items": before},
            after_value={"items": [self._whitespace_snapshot(item) for item in after_items]},
        )
        self.repository.commit()
        return [self._whitespace_read(item) for item in after_items]

    def list_recommendations(self, account_id: str, current_user: User, *, search: str | None = None, service_line: str | None = None, status_filter: str | None = None, sort: str = "relevance_score", direction: str = "desc", page: int = 1, page_size: int = 25) -> tuple[list[ServiceRecommendationRead], int, int]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        self._generate_recommendations(account_id)
        items, total = self.repository.list_recommendations(account_id=account_id, search=search, service_line=service_line, status=status_filter, sort=sort, direction=direction, page=page, page_size=page_size)
        return [self._recommendation_read(item) for item in items], total, page_count(total, page_size)

    def create_opportunity_from_recommendation(self, account_id: str, recommendation_id: str, payload: RecommendationOpportunityCreateRequest, current_user: User) -> OpportunityRead:
        if not payload.confirm:
            raise field_error("confirm", "You must confirm before creating an opportunity from a recommendation.")
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        self.access.require_account_update(current_user, account, module=OPPORTUNITY_MODULE)
        recommendation = self.repository.get_recommendation(recommendation_id)
        if recommendation is None or recommendation.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation was not found")
        if recommendation.created_opportunity_id:
            existing = self.opportunities.get_opportunity(recommendation.created_opportunity_id)
            if existing is not None:
                return self.opportunity_reader._opportunity_read(existing)
        owner = self.opportunities.get_user(payload.owner_id)
        if owner is None or not owner.is_active:
            raise field_error("owner_id", "Owner is required.")
        opportunity_type = self.opportunities.get_type_by_slug("cross_sell") or self.opportunities.get_type_by_slug("expansion")
        if opportunity_type is None:
            types, _ = self.opportunities.list_types(active_state="active", page=1, page_size=1)
            opportunity_type = types[0] if types else None
        if opportunity_type is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active opportunity type is configured")
        stage = self.opportunities.get_stage_by_name("Identified")
        if stage is None or not stage.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active Identified stage is configured")
        opportunity = Opportunity(
            account_id=account_id,
            type_id=opportunity_type.id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            owner_email=owner.email,
            name=f"{recommendation.target_service.name} opportunity",
            service_line=recommendation.target_service.name,
            value=payload.value,
            currency=payload.currency,
            stage=stage.name,
            next_step=payload.next_step,
            target_date=payload.target_date,
            source_context="service_recommendation",
            source_record_id=recommendation.id,
            source_record_type="service_recommendation",
            source_record_route=f"/accounts/{account_id}?tab=growth&recommendation={recommendation.id}",
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            updated_by_id=current_user.id,
            updated_by_name=current_user.full_name,
        )
        self.opportunities.save_opportunity(opportunity)
        recommendation.created_opportunity_id = opportunity.id
        recommendation.status = "converted"
        self.audit.log(module=OPPORTUNITY_MODULE, action="create_from_recommendation", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, after_value={"recommendation_id": recommendation.id, "service_line": recommendation.target_service.name})
        timeline_entry = self.timeline.add_account_event(
            account_id=account_id,
            event_type="opportunity_event",
            module=OPPORTUNITY_MODULE,
            title=f"Opportunity created from service recommendation: {recommendation.target_service.name}",
            description=recommendation.rationale,
            actor=current_user,
            source_record_id=opportunity.id,
            source_record_type="opportunity",
            source_record_route=f"/opportunities?opportunity={opportunity.id}",
            after_value={"opportunity_id": opportunity.id, "recommendation_id": recommendation.id},
        )
        self.opportunities.add_stage_history(
            OpportunityStageHistory(
                opportunity_id=opportunity.id,
                account_id=account_id,
                engagement_id=opportunity.engagement_id,
                before_stage=None,
                after_stage=opportunity.stage,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                reason="Created from service recommendation.",
                timeline_entry_id=timeline_entry.id,
            )
        )
        self.repository.commit()
        return self.opportunity_reader._opportunity_read(opportunity)

    def _generate_recommendations(self, account_id: str) -> None:
        whitespace = self.repository.list_whitespace(account_id)
        active_service_ids = {item.service_id for item in whitespace if item.coverage_status == "active"}
        blocked_target_ids = {item.service_id for item in whitespace if item.coverage_status in {"active", "not_relevant"}}
        kept: set[str] = set()
        if not active_service_ids:
            self.repository.clear_stale_recommendations(account_id, kept)
            return
        for rule in self.repository.list_adjacencies(active_only=True):
            if rule.source_service_id not in active_service_ids or rule.target_service_id in blocked_target_ids:
                continue
            recommendation = self.repository.recommendation_exists(account_id, rule.target_service_id, rule.source_service_id)
            if recommendation is None:
                recommendation = ServiceRecommendation(
                    account_id=account_id,
                    source_service_id=rule.source_service_id,
                    target_service_id=rule.target_service_id,
                    relevance_score=rule.relevance_score,
                    rationale=rule.rationale,
                    status="recommended",
                    source_context="adjacency",
                )
                self.repository.save_recommendation(recommendation)
            else:
                recommendation.relevance_score = rule.relevance_score
                recommendation.rationale = rule.rationale
                if recommendation.status == "stale":
                    recommendation.status = "recommended"
            kept.add(recommendation.id)
        self.repository.clear_stale_recommendations(account_id, kept)
        self.repository.flush()

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _ensure_engagement(self, account_id: str, engagement_id: str) -> None:
        engagement = self.opportunities.get_engagement(engagement_id)
        if engagement is None or engagement.account_id != account_id:
            raise field_error("engagement_id", "Engagement must belong to the selected account.")

    def _get_service_or_404(self, service_id: str) -> ServiceCatalogItem:
        service = self.repository.get_service(service_id)
        if service is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service was not found")
        return service

    def _get_active_service_or_404(self, service_id: str, field: str) -> ServiceCatalogItem:
        service = self._get_service_or_404(service_id)
        if not service.is_active:
            raise field_error(field, "Service is inactive.")
        return service

    def _service_read(self, item: ServiceCatalogItem) -> ServiceCatalogItemRead:
        return ServiceCatalogItemRead(
            id=item.id,
            slug=item.slug,
            name=item.name,
            category=item.category,
            description=item.description,
            tags=list(item.tags or []),
            is_active=item.is_active,
            display_order=item.display_order,
            created_at=item.created_at,
            updated_at=item.updated_at,
            in_use_count=self.repository.count_service_usage(item.id),
        )

    @staticmethod
    def _service_snapshot(item: ServiceCatalogItem) -> dict:
        return {"id": item.id, "slug": item.slug, "name": item.name, "category": item.category, "description": item.description, "tags": list(item.tags or []), "is_active": item.is_active, "display_order": item.display_order}

    @staticmethod
    def _adjacency_read(rule: ServiceAdjacencyRule) -> ServiceAdjacencyRuleRead:
        return ServiceAdjacencyRuleRead(
            id=rule.id,
            source_service_id=rule.source_service_id,
            source_service_name=rule.source_service.name if rule.source_service else "",
            target_service_id=rule.target_service_id,
            target_service_name=rule.target_service.name if rule.target_service else "",
            relevance_score=rule.relevance_score,
            rationale=rule.rationale,
            is_active=rule.is_active,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )

    @staticmethod
    def _adjacency_snapshot(rule: ServiceAdjacencyRule) -> dict:
        return {"source_service_id": rule.source_service_id, "target_service_id": rule.target_service_id, "relevance_score": rule.relevance_score, "rationale": rule.rationale, "is_active": rule.is_active}

    @staticmethod
    def _whitespace_read(item: AccountWhitespaceItem) -> AccountWhitespaceItemRead:
        return AccountWhitespaceItemRead(
            id=item.id,
            account_id=item.account_id,
            engagement_id=item.engagement_id,
            service_id=item.service_id,
            service_name=item.service.name if item.service else item.service_name_snapshot,
            coverage_status=item.coverage_status,
            notes=item.notes,
            source=item.source,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _whitespace_snapshot(item: AccountWhitespaceItem) -> dict:
        return {"service_id": item.service_id, "engagement_id": item.engagement_id, "coverage_status": item.coverage_status, "notes": item.notes, "source": item.source}

    @staticmethod
    def _recommendation_read(item: ServiceRecommendation) -> ServiceRecommendationRead:
        return ServiceRecommendationRead(
            id=item.id,
            account_id=item.account_id,
            source_service_id=item.source_service_id,
            source_service_name=item.source_service.name if item.source_service else None,
            target_service_id=item.target_service_id,
            target_service_name=item.target_service.name if item.target_service else "",
            relevance_score=item.relevance_score,
            rationale=item.rationale,
            status=item.status,
            source_context=item.source_context,
            created_opportunity_id=item.created_opportunity_id,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
