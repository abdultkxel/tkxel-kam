from datetime import datetime

from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Account, Engagement, Opportunity, OpportunityActionItem, OpportunityDecision, OpportunityStageDefinition, OpportunityStageHistory, OpportunityStageTransition, OpportunityType, User


class OpportunityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_opportunities(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        type_id: str | None = None,
        type_slug: str | None = None,
        stage: str | None = None,
        owner_id: str | None = None,
        service_line: str | None = None,
        source_context: str | None = None,
        target_from: datetime | None = None,
        target_to: datetime | None = None,
        min_value: float | None = None,
        max_value: float | None = None,
        include_archived: bool = False,
        sort: str = "target_date",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[Opportunity], int]:
        conditions = self._opportunity_conditions(
            account_id=account_id,
            account_ids=account_ids,
            engagement_id=engagement_id,
            search=search,
            type_id=type_id,
            type_slug=type_slug,
            stage=stage,
            owner_id=owner_id,
            service_line=service_line,
            source_context=source_context,
            target_from=target_from,
            target_to=target_to,
            min_value=min_value,
            max_value=max_value,
            include_archived=include_archived,
        )
        total = self.db.scalar(
            select(func.count(Opportunity.id)).join(Account).join(OpportunityType).where(*conditions)
        ) or 0
        order_column = {
            "name": Opportunity.name,
            "account_name": Account.name,
            "stage": Opportunity.stage,
            "value": Opportunity.value,
            "target_date": Opportunity.target_date,
            "updated_at": Opportunity.updated_at,
            "created_at": Opportunity.created_at,
        }.get(sort, Opportunity.target_date)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(Opportunity)
                .join(Account)
                .join(OpportunityType)
                .where(*conditions)
                .options(
                    selectinload(Opportunity.account),
                    selectinload(Opportunity.engagement),
                    selectinload(Opportunity.type),
                    selectinload(Opportunity.stage_history),
                    selectinload(Opportunity.decisions),
                    selectinload(Opportunity.action_items),
                )
                .order_by(order_column, Opportunity.updated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def pipeline_totals(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        type_id: str | None = None,
        type_slug: str | None = None,
        stage: str | None = None,
        owner_id: str | None = None,
        service_line: str | None = None,
        source_context: str | None = None,
        target_from: datetime | None = None,
        target_to: datetime | None = None,
        min_value: float | None = None,
        max_value: float | None = None,
        include_archived: bool = False,
    ) -> dict[str, float | int | dict[str, float | int]]:
        conditions = self._opportunity_conditions(
            account_id=account_id,
            account_ids=account_ids,
            engagement_id=engagement_id,
            search=search,
            type_id=type_id,
            type_slug=type_slug,
            stage=stage,
            owner_id=owner_id,
            service_line=service_line,
            source_context=source_context,
            target_from=target_from,
            target_to=target_to,
            min_value=min_value,
            max_value=max_value,
            include_archived=include_archived,
        )
        rows = self.db.execute(
            select(Opportunity.stage, func.count(Opportunity.id), func.coalesce(func.sum(Opportunity.value), 0))
            .join(Account)
            .join(OpportunityType)
            .where(*conditions)
            .group_by(Opportunity.stage)
        )
        stage_counts: dict[str, int] = {}
        stage_values: dict[str, float] = {}
        open_count = 0
        open_value = 0.0
        won_value = 0.0
        total_count = 0
        total_value = 0.0
        for row in rows:
            row_stage = str(row[0])
            count = int(row[1] or 0)
            value = float(row[2] or 0)
            stage_counts[row_stage] = count
            stage_values[row_stage] = value
            total_count += count
            total_value += value
            if row_stage == "Won":
                won_value += value
            if row_stage not in {"Won", "Lost"}:
                open_count += count
                open_value += value
        return {
            "open_count": open_count,
            "open_value": open_value,
            "won_value": won_value,
            "total_count": total_count,
            "total_value": total_value,
            "stage_counts": stage_counts,
            "stage_values": stage_values,
            "average_value": total_value / total_count if total_count else 0,
        }

    def get_opportunity(self, opportunity_id: str) -> Opportunity | None:
        return self.db.scalar(
            select(Opportunity)
            .where(Opportunity.id == opportunity_id)
            .options(
                selectinload(Opportunity.account),
                selectinload(Opportunity.engagement),
                selectinload(Opportunity.type),
                selectinload(Opportunity.stage_history),
                selectinload(Opportunity.decisions),
                selectinload(Opportunity.action_items),
            )
        )

    def save_opportunity(self, opportunity: Opportunity) -> Opportunity:
        self.db.add(opportunity)
        self.db.flush()
        return opportunity

    def list_stage_definitions(self, active_only: bool = True) -> list[OpportunityStageDefinition]:
        conditions = [OpportunityStageDefinition.is_active.is_(True)] if active_only else []
        return list(
            self.db.scalars(
                select(OpportunityStageDefinition)
                .where(*conditions)
                .order_by(OpportunityStageDefinition.display_order, OpportunityStageDefinition.name)
            )
        )

    def get_stage_by_name(self, name: str) -> OpportunityStageDefinition | None:
        return self.db.scalar(select(OpportunityStageDefinition).where(OpportunityStageDefinition.name == name))

    def get_stage_by_id(self, stage_id: str) -> OpportunityStageDefinition | None:
        return self.db.get(OpportunityStageDefinition, stage_id)

    def get_stage_by_slug(self, slug: str) -> OpportunityStageDefinition | None:
        return self.db.scalar(select(OpportunityStageDefinition).where(OpportunityStageDefinition.slug == slug))

    def save_stage(self, stage: OpportunityStageDefinition) -> OpportunityStageDefinition:
        self.db.add(stage)
        self.db.flush()
        return stage

    def get_stage_transition(self, from_stage: str, to_stage: str) -> OpportunityStageTransition | None:
        return self.db.scalar(
            select(OpportunityStageTransition).where(
                OpportunityStageTransition.from_stage == from_stage,
                OpportunityStageTransition.to_stage == to_stage,
            )
        )

    def list_stage_transitions(self, active_only: bool = False) -> list[OpportunityStageTransition]:
        conditions = [OpportunityStageTransition.is_active.is_(True)] if active_only else []
        return list(self.db.scalars(select(OpportunityStageTransition).where(*conditions).order_by(OpportunityStageTransition.from_stage, OpportunityStageTransition.to_stage)))

    def replace_stage_transitions(self, transitions: list[OpportunityStageTransition]) -> None:
        for transition in self.db.scalars(select(OpportunityStageTransition)):
            self.db.delete(transition)
        self.db.flush()
        for transition in transitions:
            self.db.add(transition)
        self.db.flush()

    def list_types(self, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50) -> tuple[list[OpportunityType], int]:
        conditions = []
        if active_state == "active":
            conditions.append(OpportunityType.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(OpportunityType.is_active.is_(False))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(OpportunityType.name.ilike(term), OpportunityType.slug.ilike(term), OpportunityType.description.ilike(term)))
        total = self.db.scalar(select(func.count(OpportunityType.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(OpportunityType)
                .where(*conditions)
                .order_by(OpportunityType.display_order, OpportunityType.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_type(self, type_id: str) -> OpportunityType | None:
        return self.db.get(OpportunityType, type_id)

    def get_type_by_slug(self, slug: str) -> OpportunityType | None:
        return self.db.scalar(select(OpportunityType).where(OpportunityType.slug == slug))

    def save_type(self, opportunity_type: OpportunityType) -> OpportunityType:
        self.db.add(opportunity_type)
        self.db.flush()
        return opportunity_type

    def count_opportunities_for_type(self, type_id: str) -> int:
        return self.db.scalar(select(func.count(Opportunity.id)).where(Opportunity.type_id == type_id)) or 0

    def add_stage_history(self, history: OpportunityStageHistory) -> OpportunityStageHistory:
        self.db.add(history)
        self.db.flush()
        return history

    def add_decision(self, decision: OpportunityDecision) -> OpportunityDecision:
        self.db.add(decision)
        self.db.flush()
        return decision

    def list_decisions_page(self, opportunity_id: str, page: int, page_size: int) -> tuple[list[OpportunityDecision], int]:
        conditions = [OpportunityDecision.opportunity_id == opportunity_id]
        total = self.db.scalar(select(func.count(OpportunityDecision.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(OpportunityDecision)
                .where(*conditions)
                .order_by(OpportunityDecision.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_action_item(self, action_item: OpportunityActionItem) -> OpportunityActionItem:
        self.db.add(action_item)
        self.db.flush()
        return action_item

    def get_action_item(self, action_item_id: str) -> OpportunityActionItem | None:
        return self.db.scalar(
            select(OpportunityActionItem)
            .where(OpportunityActionItem.id == action_item_id)
            .options(selectinload(OpportunityActionItem.opportunity).selectinload(Opportunity.account))
        )

    def list_action_items_page(self, opportunity_id: str, page: int, page_size: int) -> tuple[list[OpportunityActionItem], int]:
        conditions = [OpportunityActionItem.opportunity_id == opportunity_id]
        total = self.db.scalar(select(func.count(OpportunityActionItem.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(OpportunityActionItem)
                .where(*conditions)
                .order_by(OpportunityActionItem.due_at, OpportunityActionItem.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_account(self, account_id: str) -> Account | None:
        return self.db.get(Account, account_id)

    def get_engagement(self, engagement_id: str) -> Engagement | None:
        return self.db.get(Engagement, engagement_id)

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def count_open_for_account(self, account_id: str) -> int:
        return self.db.scalar(
            select(func.count(Opportunity.id)).where(
                Opportunity.account_id == account_id,
                Opportunity.archived_at.is_(None),
                Opportunity.stage.notin_(("Won", "Lost")),
            )
        ) or 0

    def count_opportunities(self) -> int:
        return self.db.scalar(select(func.count(Opportunity.id))) or 0

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _opportunity_conditions(
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        engagement_id: str | None,
        search: str | None,
        type_id: str | None,
        type_slug: str | None,
        stage: str | None,
        owner_id: str | None,
        service_line: str | None,
        source_context: str | None,
        target_from: datetime | None,
        target_to: datetime | None,
        min_value: float | None,
        max_value: float | None,
        include_archived: bool,
    ) -> list:
        conditions = []
        if account_id:
            conditions.append(Opportunity.account_id == account_id)
        if account_ids is not None:
            conditions.append(Opportunity.account_id.in_(account_ids) if account_ids else false())
        if engagement_id:
            conditions.append(Opportunity.engagement_id == engagement_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Opportunity.name.ilike(term), Account.name.ilike(term), Opportunity.service_line.ilike(term), Opportunity.next_step.ilike(term)))
        if type_id:
            conditions.append(Opportunity.type_id == type_id)
        if type_slug:
            conditions.append(OpportunityType.slug == type_slug)
        if stage:
            conditions.append(Opportunity.stage == stage)
        if owner_id:
            conditions.append(Opportunity.owner_id == owner_id)
        if service_line:
            conditions.append(Opportunity.service_line == service_line)
        if source_context:
            conditions.append(Opportunity.source_context == source_context)
        if target_from:
            conditions.append(Opportunity.target_date >= target_from)
        if target_to:
            conditions.append(Opportunity.target_date <= target_to)
        if min_value is not None:
            conditions.append(Opportunity.value >= min_value)
        if max_value is not None:
            conditions.append(Opportunity.value <= max_value)
        if not include_archived:
            conditions.append(Opportunity.archived_at.is_(None))
        return conditions
