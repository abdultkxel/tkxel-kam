from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AccountWhitespaceItem,
    ServiceAdjacencyRule,
    ServiceCatalogItem,
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
            conditions.append(or_(ServiceCatalogItem.name.ilike(term), ServiceCatalogItem.slug.ilike(term), ServiceCatalogItem.category.ilike(term), ServiceCatalogItem.description.ilike(term), cast(ServiceCatalogItem.tags, String).ilike(term)))
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

    def get_service(self, service_id: str) -> ServiceCatalogItem | None:
        return self.db.get(ServiceCatalogItem, service_id)

    def get_service_by_slug(self, slug: str) -> ServiceCatalogItem | None:
        return self.db.scalar(select(ServiceCatalogItem).where(ServiceCatalogItem.slug == slug))

    def get_service_by_name(self, name: str) -> ServiceCatalogItem | None:
        return self.db.scalar(select(ServiceCatalogItem).where(func.lower(ServiceCatalogItem.name) == name.strip().lower()))

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

    def list_recommendations(
        self,
        *,
        account_id: str,
        engagement_id: str | None = None,
        search: str | None = None,
        service_line: str | None = None,
        status: str | None = None,
        sort: str = "relevance_score",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ServiceRecommendation], int]:
        conditions = [ServiceRecommendation.account_id == account_id]
        if engagement_id is not None:
            conditions.append(ServiceRecommendation.engagement_id == engagement_id)
        if status:
            conditions.append(ServiceRecommendation.status == status)
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

    def recommendation_exists(self, account_id: str, target_service_id: str, source_service_id: str | None, engagement_id: str | None = None) -> ServiceRecommendation | None:
        source_condition = ServiceRecommendation.source_service_id == source_service_id if source_service_id else ServiceRecommendation.source_service_id.is_(None)
        engagement_condition = ServiceRecommendation.engagement_id == engagement_id if engagement_id else ServiceRecommendation.engagement_id.is_(None)
        return self.db.scalar(
            select(ServiceRecommendation).where(
                ServiceRecommendation.account_id == account_id,
                engagement_condition,
                ServiceRecommendation.target_service_id == target_service_id,
                source_condition,
            )
        )

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
