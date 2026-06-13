from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, AccountWhitespaceItem, Opportunity, OpportunityStageHistory, ServiceAdjacencyRule, ServiceCatalogItem, ServiceGrowthBundle, ServiceGrowthRule, ServiceRecommendation, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.opportunities import OpportunityRepository
from app.repositories.rbac import RbacRepository
from app.repositories.service_catalog import ServiceCatalogRepository
from app.repositories.timeline import TimelineRepository
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
    ServiceRecommendationRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.opportunities import OpportunityService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

ACCOUNT_PLANNING_MODULE = "account_planning"
OPPORTUNITY_MODULE = "opportunity_management"
SELECTOR_TYPES = {"service", "category", "tag", "bundle"}


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

    def list_taxonomy(self, current_user: User) -> ServiceGrowthTaxonomyRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "view")
        return ServiceGrowthTaxonomyRead(
            categories=self.repository.list_categories(),
            tags=self.repository.list_tags(),
            bundles=[self._bundle_read(item) for item in self.repository.list_bundles(active_only=True)],
        )

    def list_bundles(self, current_user: User) -> list[ServiceGrowthBundleRead]:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "view")
        return [self._bundle_read(item) for item in self.repository.list_bundles()]

    def create_bundle(self, payload: ServiceGrowthBundleCreateRequest, current_user: User) -> ServiceGrowthBundleRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        if self.repository.get_bundle_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A bundle with this slug already exists")
        service_ids = self._validate_bundle_services(payload.service_ids, "service_ids")
        bundle = ServiceGrowthBundle(
            slug=payload.slug,
            name=payload.name,
            description=payload.description,
            is_active=payload.is_active,
            display_order=payload.display_order,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_bundle(bundle)
        self.repository.replace_bundle_items(bundle, service_ids)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_service_bundle", entity_type="service_growth_bundle", entity_id=bundle.id, actor=current_user, after_value=self._bundle_snapshot(bundle))
        self.repository.commit()
        return self._bundle_read(self._get_bundle_or_404(bundle.id))

    def update_bundle(self, bundle_id: str, payload: ServiceGrowthBundleUpdateRequest, current_user: User) -> ServiceGrowthBundleRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        bundle = self._get_bundle_or_404(bundle_id)
        before = self._bundle_snapshot(bundle)
        updates = payload.model_dump(exclude_unset=True)
        service_ids = updates.pop("service_ids", None)
        if "slug" in updates and updates["slug"] != bundle.slug and self.repository.get_bundle_by_slug(updates["slug"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A bundle with this slug already exists")
        for field, value in updates.items():
            setattr(bundle, field, value)
        if service_ids is not None:
            self.repository.replace_bundle_items(bundle, self._validate_bundle_services(service_ids, "service_ids"))
        bundle.updated_by_id = current_user.id
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_service_bundle", entity_type="service_growth_bundle", entity_id=bundle.id, actor=current_user, before_value=before, after_value=self._bundle_snapshot(bundle))
        self.repository.commit()
        return self._bundle_read(self._get_bundle_or_404(bundle.id))

    def list_growth_rules(self, current_user: User) -> list[ServiceGrowthRuleRead]:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "view")
        return [self._growth_rule_read(item) for item in self.repository.list_growth_rules()]

    def create_growth_rule(self, payload: ServiceGrowthRuleRequest, current_user: User) -> ServiceGrowthRuleRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        normalized = self._normalized_rule_payload(payload)
        if self.repository.matching_growth_rule(normalized["source_selector_type"], normalized["source_selector_value"], normalized["target_selector_type"], normalized["target_selector_value"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A growth rule with these selectors already exists")
        self._ensure_growth_rule_has_no_effective_overlap(normalized)
        rule = ServiceGrowthRule(**normalized, created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.save_growth_rule(rule)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_growth_rule", entity_type="service_growth_rule", entity_id=rule.id, actor=current_user, after_value=self._growth_rule_snapshot(rule))
        self.repository.commit()
        return self._growth_rule_read(rule)

    def update_growth_rule(self, rule_id: str, payload: ServiceGrowthRuleRequest, current_user: User) -> ServiceGrowthRuleRead:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        rule = self._get_growth_rule_or_404(rule_id)
        before = self._growth_rule_snapshot(rule)
        normalized = self._normalized_rule_payload(payload)
        duplicate = self.repository.matching_growth_rule(normalized["source_selector_type"], normalized["source_selector_value"], normalized["target_selector_type"], normalized["target_selector_value"])
        if duplicate is not None and duplicate.id != rule.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A growth rule with these selectors already exists")
        self._ensure_growth_rule_has_no_effective_overlap(normalized, exclude_rule_id=rule.id)
        for field, value in normalized.items():
            setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="configure_growth_rule", entity_type="service_growth_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=self._growth_rule_snapshot(rule))
        self.repository.commit()
        return self._growth_rule_read(rule)

    def replace_adjacencies(self, payload: ServiceAdjacencyUpdateRequest, current_user: User) -> list[ServiceAdjacencyRuleRead]:
        self.access.require_module_permission(current_user, ACCOUNT_PLANNING_MODULE, "configure")
        rules: list[ServiceAdjacencyRule] = []
        growth_rules: list[ServiceGrowthRule] = []
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
            growth_rules.append(
                ServiceGrowthRule(
                    source_selector_type="service",
                    source_selector_value=source.id,
                    target_selector_type="service",
                    target_selector_value=target.id,
                    base_fit_score=item.relevance_score,
                    priority=0,
                    rationale_template=item.rationale,
                    is_active=item.is_active,
                    created_by_id=current_user.id,
                    updated_by_id=current_user.id,
                )
            )
        before = [self._adjacency_snapshot(item) for item in self.repository.list_adjacencies()]
        self.repository.replace_adjacencies(rules)
        self.repository.replace_service_pair_growth_rules(growth_rules)
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

    def patch_whitespace(self, account_id: str, payload: AccountWhitespacePatchRequest, current_user: User, engagement_id: str | None = None) -> list[AccountWhitespaceItemRead]:
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
        self.repository.upsert_whitespace(account_id, items)
        self._generate_recommendations(account_id)
        after_items = self.repository.list_whitespace(account_id, engagement_id=engagement_id)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="patch_whitespace", entity_type="account_whitespace", entity_id=account_id, actor=current_user, before_value={"items": before}, after_value={"items": [self._whitespace_snapshot(item) for item in after_items]})
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
        active_stages = self.opportunities.list_stage_definitions(active_only=True)
        if not active_stages:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active opportunity stages are configured")
        stage = active_stages[0]
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
        account = self._get_account_or_404(account_id)
        whitespace = self.repository.list_whitespace(account_id)
        active_service_ids = {item.service_id for item in whitespace if item.coverage_status == "active"}
        blocked_target_ids = {item.service_id for item in whitespace if item.coverage_status in {"active", "not_relevant"}}
        potential_target_ids = {item.service_id for item in whitespace if item.coverage_status == "potential"}
        kept: set[str] = set()
        if not active_service_ids:
            self.repository.clear_stale_recommendations(account_id, kept)
            return
        active_services = self.repository.list_active_services()
        active_service_by_id = {service.id: service for service in active_services}
        open_service_lines = self.repository.open_opportunity_service_lines(account_id)
        candidates: dict[str, dict] = {}

        for rule in self.repository.list_growth_rules(active_only=True):
            source_services = [service for service in self._services_for_selector(rule.source_selector_type, rule.source_selector_value, active_services) if service.id in active_service_ids]
            if not source_services:
                continue
            target_services = self._services_for_selector(rule.target_selector_type, rule.target_selector_value, active_services)
            for source in source_services:
                for target in target_services:
                    if target.id == source.id or target.id in blocked_target_ids or target.name.strip().lower() in open_service_lines:
                        continue
                    score, factors = self._score_account_fit(account, rule.base_fit_score, target.id, potential_target_ids)
                    candidate = {
                        "source_service_id": source.id,
                        "target_service_id": target.id,
                        "growth_rule_id": rule.id,
                        "base_fit_score": rule.base_fit_score,
                        "relevance_score": score,
                        "score_factors": factors,
                        "rationale": self._render_rationale(rule.rationale_template, account, source, target),
                        "source_context": "growth_rule",
                        "priority": rule.priority,
                    }
                    self._keep_best_candidate(candidates, candidate)

        for rule in self.repository.list_adjacencies(active_only=True):
            source = active_service_by_id.get(rule.source_service_id)
            target = active_service_by_id.get(rule.target_service_id)
            if source is None or target is None or source.id not in active_service_ids or target.id in blocked_target_ids or target.name.strip().lower() in open_service_lines:
                continue
            score, factors = self._score_account_fit(account, rule.relevance_score, target.id, potential_target_ids)
            candidate = {
                "source_service_id": source.id,
                "target_service_id": target.id,
                "growth_rule_id": None,
                "base_fit_score": rule.relevance_score,
                "relevance_score": score,
                "score_factors": factors,
                "rationale": self._render_rationale(rule.rationale, account, source, target),
                "source_context": "adjacency",
                "priority": 0,
            }
            self._keep_best_candidate(candidates, candidate)

        for candidate in candidates.values():
            recommendation = self.repository.recommendation_exists(account_id, candidate["target_service_id"], candidate["source_service_id"])
            if recommendation is None:
                recommendation = ServiceRecommendation(
                    account_id=account_id,
                    source_service_id=candidate["source_service_id"],
                    target_service_id=candidate["target_service_id"],
                    growth_rule_id=candidate["growth_rule_id"],
                    base_fit_score=candidate["base_fit_score"],
                    relevance_score=candidate["relevance_score"],
                    score_factors=candidate["score_factors"],
                    rationale=candidate["rationale"],
                    status="recommended",
                    source_context=candidate["source_context"],
                )
                self.repository.save_recommendation(recommendation)
            else:
                recommendation.growth_rule_id = candidate["growth_rule_id"]
                recommendation.base_fit_score = candidate["base_fit_score"]
                recommendation.relevance_score = candidate["relevance_score"]
                recommendation.score_factors = candidate["score_factors"]
                recommendation.rationale = candidate["rationale"]
                recommendation.source_context = candidate["source_context"]
                if recommendation.status == "stale":
                    recommendation.status = "recommended"
            kept.add(recommendation.id)
        self.repository.clear_stale_recommendations(account_id, kept)
        self.repository.flush()

    @staticmethod
    def _keep_best_candidate(candidates: dict[str, dict], candidate: dict) -> None:
        existing = candidates.get(candidate["target_service_id"])
        if existing is None:
            candidates[candidate["target_service_id"]] = candidate
            return
        candidate_rank = (candidate["relevance_score"], candidate["priority"], candidate["base_fit_score"])
        existing_rank = (existing["relevance_score"], existing["priority"], existing["base_fit_score"])
        if candidate_rank > existing_rank:
            candidates[candidate["target_service_id"]] = candidate

    @staticmethod
    def _score_account_fit(account: Account, base_score: int, target_service_id: str, potential_target_ids: set[str]) -> tuple[int, list[dict]]:
        factors: list[dict] = []

        def add(label: str, value: int, reason: str) -> None:
            if value:
                factors.append({"label": label, "value": value, "reason": reason})

        add("Potential coverage", 8 if target_service_id in potential_target_ids else 0, "Target service is already marked as potential whitespace.")
        if account.lifecycle_status == "Expansion Focus":
            add("Expansion stage", 6, "Account is already in an expansion posture.")
        elif account.lifecycle_status == "Active":
            add("Active account", 3, "Account is active and stable enough for discovery.")
        elif account.lifecycle_status in {"At Risk", "Renewal Focus"}:
            add("Cautious stage", -6, f"Account is in {account.lifecycle_status}.")
        if account.health_overall >= 70 and account.health_delivery >= 70:
            add("Healthy delivery", 5, "Overall and delivery health are both at least 70.")
        if account.health_delivery < 50 or account.health_commercial < 50 or account.risk_status == "critical":
            add("Risk drag", -10, "Delivery/commercial health is weak or account risk is critical.")
        score = max(0, min(100, base_score + sum(int(item["value"]) for item in factors)))
        return score, factors

    @staticmethod
    def _render_rationale(template: str, account: Account, source: ServiceCatalogItem, target: ServiceCatalogItem) -> str:
        return (
            template.replace("{account_name}", account.name)
            .replace("{source_service}", source.name)
            .replace("{target_service}", target.name)
        )

    def _validate_bundle_services(self, service_ids: list[str], field: str) -> list[str]:
        valid: list[str] = []
        for index, service_id in enumerate(service_ids):
            service = self._get_active_service_or_404(service_id, f"{field}.{index}")
            valid.append(service.id)
        return valid

    def _normalized_rule_payload(self, payload: ServiceGrowthRuleRequest) -> dict:
        source_value = self._validate_selector(payload.source_selector_type, payload.source_selector_value, "source_selector_value")
        target_value = self._validate_selector(payload.target_selector_type, payload.target_selector_value, "target_selector_value")
        if payload.source_selector_type == payload.target_selector_type and source_value == target_value:
            raise field_error("target_selector_value", "Source and target selectors must be different.")
        return {
            "source_selector_type": payload.source_selector_type,
            "source_selector_value": source_value,
            "target_selector_type": payload.target_selector_type,
            "target_selector_value": target_value,
            "base_fit_score": payload.base_fit_score,
            "priority": payload.priority,
            "rationale_template": payload.rationale_template,
            "is_active": payload.is_active,
        }

    def _ensure_growth_rule_has_no_effective_overlap(self, normalized: dict, exclude_rule_id: str | None = None) -> None:
        if not normalized["is_active"]:
            return
        active_services = self.repository.list_active_services()
        service_by_id = {service.id: service for service in active_services}
        candidate_pairs = self._effective_growth_pairs(normalized, active_services)
        if not candidate_pairs:
            raise field_error("target_selector_value", "Source and target selectors must create at least one valid service pair.")
        for existing in self.repository.list_growth_rules(active_only=True):
            if existing.id == exclude_rule_id:
                continue
            existing_pairs = self._effective_growth_pairs(
                {
                    "source_selector_type": existing.source_selector_type,
                    "source_selector_value": existing.source_selector_value,
                    "target_selector_type": existing.target_selector_type,
                    "target_selector_value": existing.target_selector_value,
                },
                active_services,
            )
            overlap = candidate_pairs & existing_pairs
            if not overlap:
                continue
            source_id, target_id = sorted(overlap)[0]
            source_name = service_by_id.get(source_id).name if source_id in service_by_id else "source service"
            target_name = service_by_id.get(target_id).name if target_id in service_by_id else "target service"
            raise field_error(
                "target_selector_value",
                f"This rule overlaps active rule {self._selector_label(existing.source_selector_type, existing.source_selector_value)} -> {self._selector_label(existing.target_selector_type, existing.target_selector_value)} for {source_name} -> {target_name}. Disable or update the existing rule first.",
            )

    def _effective_growth_pairs(self, rule: dict, active_services: list[ServiceCatalogItem]) -> set[tuple[str, str]]:
        source_services = self._services_for_selector(rule["source_selector_type"], rule["source_selector_value"], active_services)
        target_services = self._services_for_selector(rule["target_selector_type"], rule["target_selector_value"], active_services)
        return {(source.id, target.id) for source in source_services for target in target_services if source.id != target.id}

    def _validate_selector(self, selector_type: str, selector_value: str, field: str) -> str:
        if selector_type not in SELECTOR_TYPES:
            raise field_error(field, "Selector type must be service, category, tag, or bundle.")
        value = selector_value.strip()
        if selector_type == "service":
            return self._get_active_service_or_404(value, field).id
        if selector_type == "bundle":
            bundle = self._get_bundle_or_404(value)
            if not bundle.is_active:
                raise field_error(field, "Bundle is inactive.")
            return bundle.id
        active_services = self.repository.list_active_services()
        if selector_type == "category":
            match = next((service.category for service in active_services if service.category and service.category.strip().lower() == value.lower()), None)
            if not match:
                raise field_error(field, "Category must match at least one active service.")
            return match
        match = next((tag for service in active_services for tag in (service.tags or []) if str(tag).strip().lower() == value.lower()), None)
        if not match:
            raise field_error(field, "Tag must match at least one active service.")
        return str(match)

    def _services_for_selector(self, selector_type: str, selector_value: str, active_services: list[ServiceCatalogItem]) -> list[ServiceCatalogItem]:
        value = selector_value.strip().lower()
        if selector_type == "service":
            return [service for service in active_services if service.id == selector_value]
        if selector_type == "category":
            return [service for service in active_services if (service.category or "").strip().lower() == value]
        if selector_type == "tag":
            return [service for service in active_services if any(str(tag).strip().lower() == value for tag in (service.tags or []))]
        if selector_type == "bundle":
            bundle = self.repository.get_bundle(selector_value)
            if bundle is None or not bundle.is_active:
                return []
            bundle_service_ids = {item.service_id for item in bundle.items if item.service and item.service.is_active}
            return [service for service in active_services if service.id in bundle_service_ids]
        return []

    def _selector_label(self, selector_type: str, selector_value: str) -> str:
        if selector_type == "service":
            service = self.repository.get_service(selector_value)
            return service.name if service else "Unknown service"
        if selector_type == "bundle":
            bundle = self.repository.get_bundle(selector_value)
            return bundle.name if bundle else "Unknown bundle"
        if selector_type == "category":
            return f"Category: {selector_value}"
        if selector_type == "tag":
            return f"Tag: {selector_value}"
        return selector_value

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

    def _get_bundle_or_404(self, bundle_id: str) -> ServiceGrowthBundle:
        bundle = self.repository.get_bundle(bundle_id)
        if bundle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle was not found")
        return bundle

    def _get_growth_rule_or_404(self, rule_id: str) -> ServiceGrowthRule:
        rule = self.repository.get_growth_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Growth rule was not found")
        return rule

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

    def _bundle_read(self, bundle: ServiceGrowthBundle) -> ServiceGrowthBundleRead:
        items = sorted((item for item in bundle.items if item.service), key=lambda item: (item.service.display_order, item.service.name))
        return ServiceGrowthBundleRead(
            id=bundle.id,
            slug=bundle.slug,
            name=bundle.name,
            description=bundle.description,
            service_ids=[item.service_id for item in items],
            service_names=[item.service.name for item in items],
            is_active=bundle.is_active,
            display_order=bundle.display_order,
            created_at=bundle.created_at,
            updated_at=bundle.updated_at,
        )

    def _bundle_snapshot(self, bundle: ServiceGrowthBundle) -> dict:
        return {
            "id": bundle.id,
            "slug": bundle.slug,
            "name": bundle.name,
            "description": bundle.description,
            "service_ids": [item.service_id for item in bundle.items],
            "is_active": bundle.is_active,
            "display_order": bundle.display_order,
        }

    def _growth_rule_read(self, rule: ServiceGrowthRule) -> ServiceGrowthRuleRead:
        return ServiceGrowthRuleRead(
            id=rule.id,
            source_selector_type=rule.source_selector_type,
            source_selector_value=rule.source_selector_value,
            source_selector_label=self._selector_label(rule.source_selector_type, rule.source_selector_value),
            target_selector_type=rule.target_selector_type,
            target_selector_value=rule.target_selector_value,
            target_selector_label=self._selector_label(rule.target_selector_type, rule.target_selector_value),
            base_fit_score=rule.base_fit_score,
            priority=rule.priority,
            rationale_template=rule.rationale_template,
            is_active=rule.is_active,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )

    @staticmethod
    def _growth_rule_snapshot(rule: ServiceGrowthRule) -> dict:
        return {
            "id": rule.id,
            "source_selector_type": rule.source_selector_type,
            "source_selector_value": rule.source_selector_value,
            "target_selector_type": rule.target_selector_type,
            "target_selector_value": rule.target_selector_value,
            "base_fit_score": rule.base_fit_score,
            "priority": rule.priority,
            "rationale_template": rule.rationale_template,
            "is_active": rule.is_active,
        }

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
            growth_rule_id=item.growth_rule_id,
            base_fit_score=item.base_fit_score,
            relevance_score=item.relevance_score,
            account_fit_score=item.relevance_score,
            score_factors=list(item.score_factors or []),
            rationale=item.rationale,
            status=item.status,
            source_context=item.source_context,
            created_opportunity_id=item.created_opportunity_id,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
