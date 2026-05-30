from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    GovernanceRecurrenceRule,
    GovernanceSourceCitation,
    IntegrationConnection,
    IntegrationSyncLog,
    User,
)


class GovernanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_events(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        visible_user_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        governance_type: str | None = None,
        status: str | None = None,
        owner_id: str | None = None,
        attendee: str | None = None,
        source: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "scheduled_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[GovernanceEvent], int]:
        conditions = self._event_conditions(
            account_id=account_id,
            account_ids=account_ids,
            visible_user_id=visible_user_id,
            engagement_id=engagement_id,
            search=search,
            governance_type=governance_type,
            status=status,
            owner_id=owner_id,
            attendee=attendee,
            source=source,
            date_from=date_from,
            date_to=date_to,
        )
        total = self.db.scalar(select(func.count(GovernanceEvent.id)).where(*conditions)) or 0
        order_column = {
            "scheduled_at": GovernanceEvent.scheduled_at,
            "status": GovernanceEvent.status,
            "updated_at": GovernanceEvent.updated_at,
            "created_at": GovernanceEvent.created_at,
        }.get(sort, GovernanceEvent.scheduled_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(GovernanceEvent)
                .where(*conditions)
                .options(
                    selectinload(GovernanceEvent.decisions),
                    selectinload(GovernanceEvent.action_items),
                    selectinload(GovernanceEvent.source_citations),
                )
                .order_by(order_column, GovernanceEvent.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_event(self, event_id: str) -> GovernanceEvent | None:
        return self.db.scalar(
            select(GovernanceEvent)
            .where(GovernanceEvent.id == event_id)
            .options(
                selectinload(GovernanceEvent.decisions),
                selectinload(GovernanceEvent.action_items),
                selectinload(GovernanceEvent.source_citations),
            )
        )

    def get_event_by_deduplication_key(self, key: str) -> GovernanceEvent | None:
        return self.db.scalar(select(GovernanceEvent).where(GovernanceEvent.deduplication_key == key))

    def save_event(self, event: GovernanceEvent) -> GovernanceEvent:
        self.db.add(event)
        self.db.flush()
        return event

    def add_decision(self, decision: GovernanceDecision) -> GovernanceDecision:
        self.db.add(decision)
        self.db.flush()
        return decision

    def list_decisions(self, event_id: str) -> list[GovernanceDecision]:
        return list(self.db.scalars(select(GovernanceDecision).where(GovernanceDecision.governance_event_id == event_id).order_by(GovernanceDecision.created_at.desc())))

    def list_decisions_page(self, event_id: str, page: int, page_size: int) -> tuple[list[GovernanceDecision], int]:
        conditions = [GovernanceDecision.governance_event_id == event_id]
        total = self.db.scalar(select(func.count(GovernanceDecision.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(GovernanceDecision)
                .where(*conditions)
                .order_by(GovernanceDecision.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_action_item(self, action_item: GovernanceActionItem) -> GovernanceActionItem:
        self.db.add(action_item)
        self.db.flush()
        return action_item

    def get_action_item(self, action_item_id: str) -> GovernanceActionItem | None:
        return self.db.get(GovernanceActionItem, action_item_id)

    def list_action_items(self, event_id: str) -> list[GovernanceActionItem]:
        return list(self.db.scalars(select(GovernanceActionItem).where(GovernanceActionItem.governance_event_id == event_id).order_by(GovernanceActionItem.due_at)))

    def list_action_items_page(self, event_id: str, page: int, page_size: int) -> tuple[list[GovernanceActionItem], int]:
        conditions = [GovernanceActionItem.governance_event_id == event_id]
        total = self.db.scalar(select(func.count(GovernanceActionItem.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(GovernanceActionItem)
                .where(*conditions)
                .order_by(GovernanceActionItem.due_at, GovernanceActionItem.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_citation(self, citation: GovernanceSourceCitation) -> GovernanceSourceCitation:
        self.db.add(citation)
        self.db.flush()
        return citation

    def list_recurrence_rules(
        self,
        *,
        search: str | None = None,
        cadence: str | None = None,
        governance_type: str | None = None,
        active_state: str = "active",
        owner_id: str | None = None,
        account_id: str | None = None,
        segment: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[GovernanceRecurrenceRule], int]:
        conditions = []
        if search and search.strip():
            conditions.append(GovernanceRecurrenceRule.name.ilike(f"%{search.strip()}%"))
        if cadence:
            conditions.append(GovernanceRecurrenceRule.cadence == cadence)
        if governance_type:
            conditions.append(GovernanceRecurrenceRule.governance_type == governance_type)
        if active_state == "active":
            conditions.append(GovernanceRecurrenceRule.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(GovernanceRecurrenceRule.is_active.is_(False))
        if owner_id:
            conditions.append(GovernanceRecurrenceRule.owner_id == owner_id)
        if account_id:
            conditions.append(GovernanceRecurrenceRule.account_id == account_id)
        if segment:
            conditions.append(GovernanceRecurrenceRule.segment == segment)
        total = self.db.scalar(select(func.count(GovernanceRecurrenceRule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(GovernanceRecurrenceRule)
                .where(*conditions)
                .order_by(GovernanceRecurrenceRule.updated_at.desc(), GovernanceRecurrenceRule.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_recurrence_rule(self, rule_id: str) -> GovernanceRecurrenceRule | None:
        return self.db.get(GovernanceRecurrenceRule, rule_id)

    def save_recurrence_rule(self, rule: GovernanceRecurrenceRule) -> GovernanceRecurrenceRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def delete_recurrence_rule(self, rule: GovernanceRecurrenceRule) -> None:
        self.db.delete(rule)
        self.db.flush()

    def get_connection(self, provider: str) -> IntegrationConnection | None:
        return self.db.scalar(select(IntegrationConnection).where(IntegrationConnection.provider == provider))

    def list_connections(self) -> list[IntegrationConnection]:
        return list(self.db.scalars(select(IntegrationConnection).order_by(IntegrationConnection.provider)))

    def save_connection(self, connection: IntegrationConnection) -> IntegrationConnection:
        self.db.add(connection)
        self.db.flush()
        return connection

    def add_sync_log(self, log: IntegrationSyncLog) -> IntegrationSyncLog:
        self.db.add(log)
        self.db.flush()
        return log

    def list_sync_logs(
        self,
        *,
        provider: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[IntegrationSyncLog], int]:
        conditions = []
        if provider:
            conditions.append(IntegrationSyncLog.provider == provider)
        if status:
            conditions.append(IntegrationSyncLog.status == status)
        total = self.db.scalar(select(func.count(IntegrationSyncLog.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(IntegrationSyncLog)
                .where(*conditions)
                .order_by(IntegrationSyncLog.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def find_account_by_name_fragment(self, text: str) -> tuple[Account | None, int]:
        clean = text.lower()
        accounts = list(self.db.scalars(select(Account).where(Account.archived_at.is_(None)).order_by(Account.name)))
        matches = [account for account in accounts if account.name.lower() in clean]
        if not matches:
            return None, 0
        account = max(matches, key=lambda item: len(item.name))
        return account, 100 if account.name.lower() == clean.strip() else 80

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_account(self, account_id: str) -> Account | None:
        return self.db.get(Account, account_id)

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _event_conditions(
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        visible_user_id: str | None,
        engagement_id: str | None,
        search: str | None,
        governance_type: str | None,
        status: str | None,
        owner_id: str | None,
        attendee: str | None,
        source: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list:
        conditions = []
        if account_id:
            conditions.append(GovernanceEvent.account_id == account_id)
        if account_ids is not None:
            account_condition = GovernanceEvent.account_id.in_(account_ids) if account_ids else None
            owner_condition = GovernanceEvent.owner_id == visible_user_id if visible_user_id else None
            visibility_conditions = [condition for condition in (account_condition, owner_condition) if condition is not None]
            conditions.append(or_(*visibility_conditions) if visibility_conditions else False)
        if engagement_id:
            conditions.append(GovernanceEvent.engagement_id == engagement_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    GovernanceEvent.agenda.ilike(term),
                    GovernanceEvent.notes.ilike(term),
                    GovernanceEvent.owner_name.ilike(term),
                    GovernanceEvent.decisions.any(GovernanceDecision.decision_text.ilike(term)),
                    GovernanceEvent.action_items.any(GovernanceActionItem.title.ilike(term)),
                )
            )
        if governance_type:
            conditions.append(GovernanceEvent.governance_type == governance_type)
        if status:
            conditions.append(GovernanceEvent.status == status)
        if owner_id:
            conditions.append(GovernanceEvent.owner_id == owner_id)
        if attendee:
            conditions.append(cast(GovernanceEvent.attendees, String).ilike(f"%{attendee}%"))
        if source:
            conditions.append(GovernanceEvent.source == source)
        if date_from:
            conditions.append(GovernanceEvent.scheduled_at >= date_from)
        if date_to:
            conditions.append(GovernanceEvent.scheduled_at <= date_to)
        return conditions
