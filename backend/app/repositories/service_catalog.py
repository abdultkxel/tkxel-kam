from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AccountWhitespaceItem,
    Opportunity,
    ServiceAdjacencyRule,
    ServiceCatalogItem,
    ServiceGrowthBundle,
    ServiceGrowthBundleItem,
    ServiceGrowthRule,
    ServiceRecommendation,
)


class ServiceCatalogRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_services(
        self,
        *,
        search: str | None = None,
        category: str | None = None,
        active_state: str = "active",
        sort: str = "display_order",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ServiceCatalogItem], int]:
        conditions = []
        if active_state == "active":
            conditions.append(ServiceCatalogItem.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(ServiceCatalogItem.is_active.is_(False))
        if category:
            conditions.append(ServiceCatalogItem.category == category)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(ServiceCatalogItem.name.ilike(term), ServiceCatalogItem.slug.ilike(term), ServiceCatalogItem.category.ilike(term), ServiceCatalogItem.description.ilike(term)))
        total = self.db.scalar(select(func.count(ServiceCatalogItem.id)).where(*conditions)) or 0
        order_column = {
            "name": ServiceCatalogItem.name,
            "category": ServiceCatalogItem.category,
            "updated_at": ServiceCatalogItem.updated_at,
            "display_order": ServiceCatalogItem.display_order,
        }.get(sort, ServiceCatalogItem.display_order)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(ServiceCatalogItem)
                .where(*conditions)
                .order_by(order_column, ServiceCatalogItem.name.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_active_services(self) -> list[ServiceCatalogItem]:
        return list(self.db.scalars(select(ServiceCatalogItem).where(ServiceCatalogItem.is_active.is_(True)).order_by(ServiceCatalogItem.display_order, ServiceCatalogItem.name)))

    def list_categories(self) -> list[str]:
        rows = self.db.scalars(select(ServiceCatalogItem.category).where(ServiceCatalogItem.is_active.is_(True), ServiceCatalogItem.category.is_not(None)).distinct().order_by(ServiceCatalogItem.category.asc()))
        return [str(item) for item in rows if item]

    def list_tags(self) -> list[str]:
        tags: set[str] = set()
        for service in self.list_active_services():
            tags.update(str(tag) for tag in (service.tags or []) if str(tag).strip())
        return sorted(tags, key=str.lower)

    def get_service(self, service_id: str) -> ServiceCatalogItem | None:
        return self.db.get(ServiceCatalogItem, service_id)

    def get_service_by_slug(self, slug: str) -> ServiceCatalogItem | None:
        return self.db.scalar(select(ServiceCatalogItem).where(ServiceCatalogItem.slug == slug))

    def save_service(self, service: ServiceCatalogItem) -> ServiceCatalogItem:
        self.db.add(service)
        self.db.flush()
        return service

    def count_service_usage(self, service_id: str) -> int:
        whitespace = self.db.scalar(select(func.count(AccountWhitespaceItem.id)).where(AccountWhitespaceItem.service_id == service_id)) or 0
        recommendations = self.db.scalar(select(func.count(ServiceRecommendation.id)).where(ServiceRecommendation.target_service_id == service_id)) or 0
        return int(whitespace + recommendations)

    def list_adjacencies(self, active_only: bool = False) -> list[ServiceAdjacencyRule]:
        conditions = [ServiceAdjacencyRule.is_active.is_(True)] if active_only else []
        return list(
            self.db.scalars(
                select(ServiceAdjacencyRule)
                .where(*conditions)
                .options(selectinload(ServiceAdjacencyRule.source_service), selectinload(ServiceAdjacencyRule.target_service))
                .order_by(ServiceAdjacencyRule.relevance_score.desc(), ServiceAdjacencyRule.created_at.desc())
            )
        )

    def list_bundles(self, active_only: bool = False) -> list[ServiceGrowthBundle]:
        conditions = [ServiceGrowthBundle.is_active.is_(True)] if active_only else []
        return list(
            self.db.scalars(
                select(ServiceGrowthBundle)
                .where(*conditions)
                .options(selectinload(ServiceGrowthBundle.items).selectinload(ServiceGrowthBundleItem.service))
                .order_by(ServiceGrowthBundle.display_order, ServiceGrowthBundle.name)
            )
        )

    def get_bundle(self, bundle_id: str) -> ServiceGrowthBundle | None:
        return self.db.scalar(
            select(ServiceGrowthBundle)
            .where(ServiceGrowthBundle.id == bundle_id)
            .options(selectinload(ServiceGrowthBundle.items).selectinload(ServiceGrowthBundleItem.service))
        )

    def get_bundle_by_slug(self, slug: str) -> ServiceGrowthBundle | None:
        return self.db.scalar(select(ServiceGrowthBundle).where(ServiceGrowthBundle.slug == slug))

    def save_bundle(self, bundle: ServiceGrowthBundle) -> ServiceGrowthBundle:
        self.db.add(bundle)
        self.db.flush()
        return bundle

    def replace_bundle_items(self, bundle: ServiceGrowthBundle, service_ids: list[str]) -> None:
        for existing in list(bundle.items):
            self.db.delete(existing)
        self.db.flush()
        for service_id in service_ids:
            self.db.add(ServiceGrowthBundleItem(bundle_id=bundle.id, service_id=service_id))
        self.db.flush()

    def list_growth_rules(self, active_only: bool = False) -> list[ServiceGrowthRule]:
        conditions = [ServiceGrowthRule.is_active.is_(True)] if active_only else []
        return list(
            self.db.scalars(
                select(ServiceGrowthRule)
                .where(*conditions)
                .order_by(ServiceGrowthRule.priority.desc(), ServiceGrowthRule.base_fit_score.desc(), ServiceGrowthRule.created_at.desc())
            )
        )

    def get_growth_rule(self, rule_id: str) -> ServiceGrowthRule | None:
        return self.db.get(ServiceGrowthRule, rule_id)

    def matching_growth_rule(
        self,
        source_selector_type: str,
        source_selector_value: str,
        target_selector_type: str,
        target_selector_value: str,
    ) -> ServiceGrowthRule | None:
        return self.db.scalar(
            select(ServiceGrowthRule).where(
                ServiceGrowthRule.source_selector_type == source_selector_type,
                ServiceGrowthRule.source_selector_value == source_selector_value,
                ServiceGrowthRule.target_selector_type == target_selector_type,
                ServiceGrowthRule.target_selector_value == target_selector_value,
            )
        )

    def save_growth_rule(self, rule: ServiceGrowthRule) -> ServiceGrowthRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def replace_service_pair_growth_rules(self, rules: list[ServiceGrowthRule]) -> None:
        for existing in self.db.scalars(select(ServiceGrowthRule).where(ServiceGrowthRule.source_selector_type == "service", ServiceGrowthRule.target_selector_type == "service")):
            self.db.delete(existing)
        self.db.flush()
        for rule in rules:
            self.db.add(rule)
        self.db.flush()

    def replace_adjacencies(self, rules: list[ServiceAdjacencyRule]) -> None:
        for existing in self.db.scalars(select(ServiceAdjacencyRule)):
            self.db.delete(existing)
        self.db.flush()
        for rule in rules:
            self.db.add(rule)
        self.db.flush()

    def list_whitespace(self, account_id: str, *, engagement_id: str | None = None) -> list[AccountWhitespaceItem]:
        conditions = [AccountWhitespaceItem.account_id == account_id]
        if engagement_id:
            conditions.append(AccountWhitespaceItem.engagement_id == engagement_id)
        return list(
            self.db.scalars(
                select(AccountWhitespaceItem)
                .where(*conditions)
                .options(selectinload(AccountWhitespaceItem.service), selectinload(AccountWhitespaceItem.engagement))
                .order_by(AccountWhitespaceItem.updated_at.desc())
            )
        )

    def replace_whitespace(self, account_id: str, items: list[AccountWhitespaceItem], *, engagement_id: str | None = None) -> None:
        conditions = [AccountWhitespaceItem.account_id == account_id]
        if engagement_id is not None:
            conditions.append(AccountWhitespaceItem.engagement_id == engagement_id)
        for existing in self.db.scalars(select(AccountWhitespaceItem).where(*conditions)):
            self.db.delete(existing)
        self.db.flush()
        for item in items:
            self.db.add(item)
        self.db.flush()

    def upsert_whitespace(self, account_id: str, items: list[AccountWhitespaceItem]) -> None:
        for item in items:
            existing = self.db.scalar(
                select(AccountWhitespaceItem).where(
                    AccountWhitespaceItem.account_id == account_id,
                    AccountWhitespaceItem.engagement_id == item.engagement_id,
                    AccountWhitespaceItem.service_id == item.service_id,
                )
            )
            if existing is None:
                self.db.add(item)
            else:
                existing.coverage_status = item.coverage_status
                existing.notes = item.notes
                existing.source = item.source
                existing.service_name_snapshot = item.service_name_snapshot
                existing.updated_by_id = item.updated_by_id
        self.db.flush()

    def list_recommendations(
        self,
        *,
        account_id: str,
        search: str | None = None,
        service_line: str | None = None,
        status: str | None = None,
        sort: str = "relevance_score",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ServiceRecommendation], int]:
        conditions = [ServiceRecommendation.account_id == account_id]
        if status:
            conditions.append(ServiceRecommendation.status == status)
        else:
            conditions.append(ServiceRecommendation.status != "stale")
        if service_line:
            conditions.append(ServiceRecommendation.target_service_id == service_line)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(ServiceRecommendation.rationale.ilike(term), ServiceCatalogItem.name.ilike(term)))
        order_column = {
            "relevance_score": ServiceRecommendation.relevance_score,
            "updated_at": ServiceRecommendation.updated_at,
            "status": ServiceRecommendation.status,
        }.get(sort, ServiceRecommendation.relevance_score)
        if direction == "desc":
            order_column = order_column.desc()
        query = select(ServiceRecommendation).join(ServiceCatalogItem, ServiceCatalogItem.id == ServiceRecommendation.target_service_id).where(*conditions)
        total = self.db.scalar(select(func.count(ServiceRecommendation.id)).join(ServiceCatalogItem, ServiceCatalogItem.id == ServiceRecommendation.target_service_id).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                query.options(selectinload(ServiceRecommendation.source_service), selectinload(ServiceRecommendation.target_service))
                .order_by(order_column, ServiceRecommendation.updated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_recommendation(self, recommendation_id: str) -> ServiceRecommendation | None:
        return self.db.scalar(
            select(ServiceRecommendation)
            .where(ServiceRecommendation.id == recommendation_id)
            .options(selectinload(ServiceRecommendation.account), selectinload(ServiceRecommendation.source_service), selectinload(ServiceRecommendation.target_service))
        )

    def save_recommendation(self, recommendation: ServiceRecommendation) -> ServiceRecommendation:
        self.db.add(recommendation)
        self.db.flush()
        return recommendation

    def recommendation_exists(self, account_id: str, target_service_id: str, source_service_id: str | None) -> ServiceRecommendation | None:
        source_condition = ServiceRecommendation.source_service_id == source_service_id if source_service_id else ServiceRecommendation.source_service_id.is_(None)
        return self.db.scalar(
            select(ServiceRecommendation).where(
                ServiceRecommendation.account_id == account_id,
                ServiceRecommendation.target_service_id == target_service_id,
                source_condition,
            )
        )

    def open_opportunity_service_lines(self, account_id: str) -> set[str]:
        rows = self.db.scalars(
            select(Opportunity.service_line).where(
                Opportunity.account_id == account_id,
                Opportunity.archived_at.is_(None),
                Opportunity.stage.notin_(("Won", "Lost")),
            )
        )
        return {str(row).strip().lower() for row in rows if str(row).strip()}

    def clear_stale_recommendations(self, account_id: str, keep_ids: set[str]) -> None:
        conditions = [ServiceRecommendation.account_id == account_id]
        if keep_ids:
            conditions.append(ServiceRecommendation.id.notin_(keep_ids))
        else:
            conditions.append(ServiceRecommendation.id.is_not(None))
        for recommendation in self.db.scalars(select(ServiceRecommendation).where(*conditions)):
            if recommendation.status == "recommended":
                recommendation.status = "stale"
        self.db.flush()

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
