from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    AccountHealthRollup,
    Engagement,
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    GovernanceEventAttendee,
    GovernanceGeneratedOutput,
    GovernanceGeneratedOutputCitation,
    GovernanceNote,
    User,
)


class GovernanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_events(
        self,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        governance_type: str | None = None,
        status: str | None = None,
        owner_id: str | None = None,
        attendee: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        source: str | None = None,
        search: str | None = None,
        sort: str = "event_date",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
        now: datetime | None = None,
    ) -> tuple[list[GovernanceEvent], int]:
        conditions = self._conditions(
            account_id=account_id,
            engagement_id=engagement_id,
            governance_type=governance_type,
            status=status,
            owner_id=owner_id,
            attendee=attendee,
            date_from=date_from,
            date_to=date_to,
            source=source,
            search=search,
            now=now,
        )
        total = self.db.scalar(select(func.count(GovernanceEvent.id)).where(*conditions)) or 0
        order_column = {
            "event_date": GovernanceEvent.scheduled_at,
            "status": GovernanceEvent.status,
            "updated_at": GovernanceEvent.updated_at,
        }.get(sort, GovernanceEvent.scheduled_at)
        if direction == "desc":
            order_column = order_column.desc()

        events = list(
            self.db.scalars(
                select(GovernanceEvent)
                .where(*conditions)
                .options(*self._event_load_options())
                .order_by(order_column, GovernanceEvent.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return events, total

    def get_event(self, event_id: str) -> GovernanceEvent | None:
        return self.db.scalar(
            select(GovernanceEvent)
            .where(GovernanceEvent.id == event_id)
            .options(*self._event_load_options())
        )

    def save_event(self, event: GovernanceEvent) -> GovernanceEvent:
        self.db.add(event)
        self.db.flush()
        return event

    def add_note(self, note: GovernanceNote) -> GovernanceNote:
        self.db.add(note)
        self.db.flush()
        return note

    def add_decision(self, decision: GovernanceDecision) -> GovernanceDecision:
        self.db.add(decision)
        self.db.flush()
        return decision

    def add_action_item(self, action_item: GovernanceActionItem) -> GovernanceActionItem:
        self.db.add(action_item)
        self.db.flush()
        return action_item

    def add_generated_output(self, output: GovernanceGeneratedOutput) -> GovernanceGeneratedOutput:
        self.db.add(output)
        self.db.flush()
        return output

    def add_generated_output_citation(self, citation: GovernanceGeneratedOutputCitation) -> GovernanceGeneratedOutputCitation:
        self.db.add(citation)
        self.db.flush()
        return citation

    def replace_attendees(self, event: GovernanceEvent, emails: list[str]) -> None:
        event.attendees.clear()
        self.db.flush()
        for email in emails:
            event.attendees.append(GovernanceEventAttendee(email=email))
        self.db.flush()

    def get_account(self, account_id: str) -> Account | None:
        return self.db.scalar(
            select(Account)
            .where(Account.id == account_id)
            .options(selectinload(Account.owners), selectinload(Account.engagements))
        )

    def get_engagement(self, engagement_id: str) -> Engagement | None:
        return self.db.get(Engagement, engagement_id)

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def latest_health_rollup(self, account_id: str) -> AccountHealthRollup | None:
        return self.db.scalar(
            select(AccountHealthRollup)
            .where(AccountHealthRollup.account_id == account_id)
            .order_by(AccountHealthRollup.created_at.desc())
            .limit(1)
        )

    def prior_events(self, event: GovernanceEvent, limit: int = 5) -> list[GovernanceEvent]:
        return list(
            self.db.scalars(
                select(GovernanceEvent)
                .where(
                    GovernanceEvent.account_id == event.account_id,
                    GovernanceEvent.id != event.id,
                    GovernanceEvent.scheduled_at <= event.scheduled_at,
                )
                .options(*self._event_load_options())
                .order_by(GovernanceEvent.scheduled_at.desc())
                .limit(limit)
            )
        )

    def next_upcoming_event_at(self, account_id: str, now: datetime) -> datetime | None:
        return self.db.scalar(
            select(GovernanceEvent.scheduled_at)
            .where(
                GovernanceEvent.account_id == account_id,
                GovernanceEvent.scheduled_at >= now,
                GovernanceEvent.status.not_in(["completed", "cancelled"]),
            )
            .order_by(GovernanceEvent.scheduled_at.asc())
            .limit(1)
        )

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _event_load_options():
        return (
            selectinload(GovernanceEvent.account).selectinload(Account.owners),
            selectinload(GovernanceEvent.engagement),
            selectinload(GovernanceEvent.attendees),
            selectinload(GovernanceEvent.notes),
            selectinload(GovernanceEvent.decisions),
            selectinload(GovernanceEvent.action_items),
            selectinload(GovernanceEvent.generated_outputs).selectinload(GovernanceGeneratedOutput.citations),
        )

    @staticmethod
    def _conditions(
        *,
        account_id: str | None,
        engagement_id: str | None,
        governance_type: str | None,
        status: str | None,
        owner_id: str | None,
        attendee: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        source: str | None,
        search: str | None,
        now: datetime | None,
    ) -> list:
        conditions = []
        if account_id:
            conditions.append(GovernanceEvent.account_id == account_id)
        if engagement_id:
            conditions.append(GovernanceEvent.engagement_id == engagement_id)
        if governance_type:
            conditions.append(GovernanceEvent.governance_type == governance_type)
        if owner_id:
            conditions.append(GovernanceEvent.owner_id == owner_id)
        if source:
            conditions.append(GovernanceEvent.source == source)
        if date_from:
            conditions.append(GovernanceEvent.scheduled_at >= date_from)
        if date_to:
            conditions.append(GovernanceEvent.scheduled_at <= date_to)
        if attendee and attendee.strip():
            email = attendee.strip().lower()
            conditions.append(GovernanceEvent.attendees.any(GovernanceEventAttendee.email == email))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    GovernanceEvent.agenda.ilike(term),
                    GovernanceEvent.notes.any(GovernanceNote.body.ilike(term)),
                    GovernanceEvent.decisions.any(GovernanceDecision.decision_text.ilike(term)),
                    GovernanceEvent.action_items.any(GovernanceActionItem.title.ilike(term)),
                )
            )
        if status:
            if status == "overdue" and now is not None:
                conditions.append(GovernanceEvent.scheduled_at < now)
                conditions.append(GovernanceEvent.status.not_in(["completed", "cancelled"]))
            elif status == "upcoming" and now is not None:
                conditions.append(GovernanceEvent.scheduled_at >= now)
                conditions.append(GovernanceEvent.status.not_in(["completed", "cancelled"]))
            else:
                conditions.append(GovernanceEvent.status == status)
        return conditions
