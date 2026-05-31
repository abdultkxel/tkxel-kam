from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Engagement,
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    GovernanceGeneratedOutput,
    GovernanceGeneratedOutputCitation,
    GovernanceNote,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.governance import GovernanceRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    GovernanceActionItemCreateRequest,
    GovernanceActionItemRead,
    GovernanceCalendarItemRead,
    GovernanceCalendarPageRead,
    GovernanceDecisionCreateRequest,
    GovernanceDecisionRead,
    GovernanceEventAgendaUpdateRequest,
    GovernanceEventCompleteRequest,
    GovernanceEventCreateRequest,
    GovernanceEventPageRead,
    GovernanceEventRead,
    GovernanceEventUpdateRequest,
    GovernanceGeneratedOutputCitationRead,
    GovernanceGeneratedOutputRead,
    GovernanceGeneratedOutputRequest,
    GovernanceNoteRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count


GOVERNANCE_MODULE = "governance_reviews"
GENERATED_OUTPUT_DISCLAIMER = "Generated governance preparation is advisory, source-backed where possible, and must be reviewed by a human before use."


class GovernanceService:
    def __init__(self, db: Session) -> None:
        self.repository = GovernanceRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_events(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        governance_type: str | None = None,
        event_status: str | None = None,
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
    ) -> GovernanceEventPageRead:
        self.access.require_module_permission(current_user, GOVERNANCE_MODULE, "view")
        owner_filter = current_user.id if current_user.role in {"account_manager", "am"} else owner_id
        events, total = self.repository.list_events(
            account_id=account_id,
            engagement_id=engagement_id,
            governance_type=governance_type,
            status=event_status,
            owner_id=owner_filter,
            attendee=attendee,
            date_from=date_from,
            date_to=date_to,
            source=source,
            search=search,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
            now=self._now(),
        )
        visible = [event for event in events if self.access.can_view_account(current_user, event.account)]
        return GovernanceEventPageRead(
            items=[self._event_read(event) for event in visible],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def calendar_items(
        self,
        current_user: User,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        account_id: str | None = None,
        owner_id: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> GovernanceCalendarPageRead:
        page_read = self.list_events(
            current_user,
            account_id=account_id,
            owner_id=owner_id,
            date_from=date_from,
            date_to=date_to,
            sort="event_date",
            direction="asc",
            page=page,
            page_size=page_size,
        )
        return GovernanceCalendarPageRead(
            items=[self._calendar_item(event) for event in page_read.items],
            total=page_read.total,
            page=page_read.page,
            page_size=page_read.page_size,
            pages=page_read.pages,
        )

    def get_event(self, event_id: str, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_view(current_user, event.account, module=GOVERNANCE_MODULE)
        return self._event_read(event)

    def create_event(self, payload: GovernanceEventCreateRequest, current_user: User) -> GovernanceEventRead:
        account = self._get_account_or_404(payload.account_id)
        self.access.require_module_permission(current_user, GOVERNANCE_MODULE, "create")
        self.access.require_account_update(current_user, account, module=GOVERNANCE_MODULE)
        engagement = self._get_engagement_for_account(payload.engagement_id, account.id) if payload.engagement_id else None
        owner = self._get_active_user(payload.owner_id)
        event = GovernanceEvent(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            owner_id=owner.id,
            owner_name=owner.full_name,
            owner_email=owner.email,
            governance_type=payload.governance_type,
            scheduled_at=payload.scheduled_at,
            agenda=payload.agenda,
            status="upcoming",
            source=payload.source,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_event(event)
        self.repository.replace_attendees(event, self._normalize_emails(payload.attendee_emails))
        self._audit_event("create", event, current_user, after={"governance_type": event.governance_type, "scheduled_at": event.scheduled_at.isoformat()})
        self._timeline_event(event, current_user, title=f"{event.governance_type} scheduled", description=event.agenda)
        self._update_next_governance(account)
        self.repository.commit()
        return self.get_event(event.id, current_user)

    def update_event(self, event_id: str, payload: GovernanceEventUpdateRequest, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_update(current_user, event.account, module=GOVERNANCE_MODULE)
        before = self._event_snapshot(event)
        if payload.engagement_id is not None:
            engagement = self._get_engagement_for_account(payload.engagement_id, event.account_id)
            event.engagement_id = engagement.id
        if payload.governance_type is not None:
            event.governance_type = payload.governance_type
        if payload.scheduled_at is not None:
            event.scheduled_at = payload.scheduled_at
        if payload.agenda is not None:
            event.agenda = payload.agenda
        if payload.owner_id is not None:
            owner = self._get_active_user(payload.owner_id)
            event.owner_id = owner.id
            event.owner_name = owner.full_name
            event.owner_email = owner.email
        if payload.status is not None:
            event.status = payload.status
        if payload.attendee_emails is not None:
            self.repository.replace_attendees(event, self._normalize_emails(payload.attendee_emails))
        event.updated_by_id = current_user.id
        self._audit_event("update", event, current_user, before=before, after=self._event_snapshot(event))
        self._timeline_event(event, current_user, title=f"{event.governance_type} updated", description="Governance event details were updated.")
        self._update_next_governance(event.account)
        self.repository.commit()
        return self.get_event(event.id, current_user)

    def update_agenda(self, event_id: str, payload: GovernanceEventAgendaUpdateRequest, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_update(current_user, event.account, module=GOVERNANCE_MODULE)
        before = {"agenda": event.agenda, "accepted_agenda_output_id": event.accepted_agenda_output_id}
        event.agenda = payload.agenda
        event.accepted_agenda_output_id = payload.source_output_id
        event.updated_by_id = current_user.id
        self._audit_event("agenda_update", event, current_user, before=before, after={"agenda": event.agenda, "accepted_agenda_output_id": event.accepted_agenda_output_id})
        self.repository.commit()
        return self.get_event(event.id, current_user)

    def complete_event(self, event_id: str, payload: GovernanceEventCompleteRequest, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_update(current_user, event.account, module=GOVERNANCE_MODULE)
        note = GovernanceNote(
            event_id=event.id,
            body=payload.notes,
            author_id=current_user.id,
            author_name=current_user.full_name,
        )
        self.repository.add_note(note)
        decisions = []
        action_items = []
        for decision_payload in payload.decisions:
            decisions.append(self.repository.add_decision(self._decision_from_payload(event.id, decision_payload)))
        for action_payload in payload.action_items:
            action_items.append(self.repository.add_action_item(self._action_item_from_payload(event.id, action_payload)))
        event.status = "completed"
        event.completed_at = self._now()
        event.updated_by_id = current_user.id
        self._audit_event(
            "complete",
            event,
            current_user,
            after={
                "status": "completed",
                "notes": payload.notes,
                "decisions": [decision.decision_text for decision in decisions],
                "action_items": [action_item.title for action_item in action_items],
            },
        )
        self._timeline_event(event, current_user, title=f"{event.governance_type} completed", description=payload.notes)
        for decision in decisions:
            self._timeline_event(
                event,
                current_user,
                title=f"{event.governance_type} decision logged",
                description=decision.decision_text,
                source_record_id=decision.id,
                source_record_type="governance_decision",
            )
        self._update_next_governance(event.account)
        self.repository.commit()
        return self.get_event(event.id, current_user)

    def generate_agenda_draft(self, event_id: str, payload: GovernanceGeneratedOutputRequest, current_user: User) -> GovernanceGeneratedOutputRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_update(current_user, event.account, module=GOVERNANCE_MODULE)
        content, citations = self._build_agenda_content(event)
        return self._persist_generated_output(event, current_user, "agenda_draft", content, citations, payload.source_modules)

    def generate_brief(self, event_id: str, payload: GovernanceGeneratedOutputRequest, current_user: User) -> GovernanceGeneratedOutputRead:
        event = self._get_event_or_404(event_id)
        self.access.require_account_update(current_user, event.account, module=GOVERNANCE_MODULE)
        content, citations = self._build_brief_content(event)
        return self._persist_generated_output(event, current_user, "governance_brief", content, citations, payload.source_modules)

    def _persist_generated_output(
        self,
        event: GovernanceEvent,
        current_user: User,
        output_type: str,
        content: str,
        citations: list[dict],
        source_modules: list[str],
    ) -> GovernanceGeneratedOutputRead:
        output = GovernanceGeneratedOutput(
            event_id=event.id,
            output_type=output_type,
            generation_method="deterministic",
            status="generated",
            content=content,
            disclaimer=GENERATED_OUTPUT_DISCLAIMER,
            source_filter_metadata={"source_modules": source_modules},
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.add_generated_output(output)
        for citation_payload in citations:
            self.repository.add_generated_output_citation(
                GovernanceGeneratedOutputCitation(output_id=output.id, **citation_payload)
            )
        self._audit_event(f"{output_type}_generate", event, current_user, after={"output_id": output.id, "generation_method": "deterministic"})
        self.repository.commit()
        output = self.repository.get_event(event.id).generated_outputs[-1]
        return self._generated_output_read(output)

    def _build_agenda_content(self, event: GovernanceEvent) -> tuple[str, list[dict]]:
        account = event.account
        citations = [self._account_citation(account)]
        engagement_line = self._engagement_line(event.engagement, citations)
        prior = self.repository.prior_events(event, limit=1)
        prior_line = "No prior governance event is recorded for this account."
        if prior:
            prior_event = prior[0]
            prior_line = f"Review follow-ups from {prior_event.governance_type} on {self._to_utc(prior_event.scheduled_at).date().isoformat()}."
            citations.append(self._governance_citation(prior_event))
        sections = [
            "# Source-backed agenda draft",
            f"## Account health and risk review\nReview {account.name} health score {account.health_overall}/100 and current risk status {account.risk_status}.",
            f"## Engagement and renewal milestones\n{engagement_line}",
            "## Open opportunities and expansion discussion\nConfirm opportunity movement, expansion blockers, and owner next steps. Source data may be incomplete if opportunities are not backend-backed yet.",
            "## Escalations, blockers, and client impact\nReview any active escalations or explicitly confirm there are no known active escalations in the available source context.",
            f"## Pending decisions from prior governance\n{prior_line}",
            "## Open action items and overdue follow-ups\nReview open governance-local action items and assign due dates before completion.",
            "## Next-step ownership and due dates\nConfirm owners, due dates, and next governance cadence.",
        ]
        return "\n\n".join(sections), citations

    def _build_brief_content(self, event: GovernanceEvent) -> tuple[str, list[dict]]:
        account = event.account
        citations = [self._account_citation(account)]
        health = self.repository.latest_health_rollup(account.id)
        health_line = f"Account health is {account.health_overall}/100 with {account.risk_status} risk status."
        if health:
            health_line = f"Latest rollup is {health.overall}/100 ({health.rag_status})."
            citations.append(self._health_citation(health))
        prior = self.repository.prior_events(event, limit=3)
        recent_line = "No prior governance event is recorded in the available source context."
        if prior:
            recent_line = "; ".join(f"{item.governance_type} on {self._to_utc(item.scheduled_at).date().isoformat()}" for item in prior)
            citations.extend(self._governance_citation(item) for item in prior)
        action_items = [item for prior_event in prior for item in prior_event.action_items if item.status == "open"]
        action_line = "No open governance-local action items found in prior events." if not action_items else "; ".join(item.title for item in action_items[:5])
        sections = [
            "# Governance prep brief",
            f"## Health snapshot\n{health_line}",
            f"## Recent changes since last event\n{recent_line}",
            "## Open signals/escalations\nNo backend-backed escalation or signal source was available for this deterministic pass; verify manually before the meeting.",
            f"## Talking points\nDiscuss {event.governance_type} agenda, account health, renewal context, delivery milestones, and client decision blockers.",
            "## Pending decisions\nReview decisions captured in prior governance records and confirm any new executive decisions manually.",
            f"## Action items\n{action_line}",
            "## Source gaps\nOpportunities, escalations, signals, and task data are included only when backend-backed sources exist.",
        ]
        return "\n\n".join(sections), citations

    def _update_next_governance(self, account: Account) -> None:
        account.next_governance_at = self.repository.next_upcoming_event_at(account.id, self._now())

    def _get_event_or_404(self, event_id: str) -> GovernanceEvent:
        event = self.repository.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Governance event was not found")
        return event

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.repository.get_account(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_for_account(self, engagement_id: str, account_id: str) -> Engagement:
        engagement = self.repository.get_engagement(engagement_id)
        if engagement is None or engagement.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found for this account")
        return engagement

    def _get_active_user(self, user_id: str) -> User:
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is inactive or unauthorized")
        return user

    def _decision_from_payload(self, event_id: str, payload: GovernanceDecisionCreateRequest) -> GovernanceDecision:
        owner = self.repository.get_user(payload.owner_id) if payload.owner_id else None
        return GovernanceDecision(
            event_id=event_id,
            decision_text=payload.decision_text,
            owner_id=owner.id if owner else payload.owner_id,
            owner_name=owner.full_name if owner else payload.owner_name,
        )

    def _action_item_from_payload(self, event_id: str, payload: GovernanceActionItemCreateRequest) -> GovernanceActionItem:
        owner = self.repository.get_user(payload.owner_id) if payload.owner_id else None
        owner_email = str(payload.owner_email).lower() if payload.owner_email else None
        return GovernanceActionItem(
            event_id=event_id,
            title=payload.title,
            owner_id=owner.id if owner else payload.owner_id,
            owner_name=owner.full_name if owner else payload.owner_name or owner_email,
            owner_email=owner_email,
            due_date=payload.due_date,
            status="open",
        )

    def _timeline_event(
        self,
        event: GovernanceEvent,
        actor: User,
        *,
        title: str,
        description: str,
        source_record_id: str | None = None,
        source_record_type: str = "governance_event",
    ) -> None:
        self.timeline.add_account_event(
            account_id=event.account_id,
            engagement_id=event.engagement_id,
            event_type="governance_event",
            module="governance",
            title=title,
            description=description,
            actor=actor,
            source_record_id=source_record_id or event.id,
            source_record_type=source_record_type,
            source_record_route=f"/accounts/{event.account_id}?tab=governance",
        )

    def _audit_event(
        self,
        action: str,
        event: GovernanceEvent,
        actor: User,
        *,
        before: dict | None = None,
        after: dict | None = None,
    ) -> None:
        self.audit.log(
            module=GOVERNANCE_MODULE,
            action=action,
            entity_type="governance_event",
            entity_id=event.id,
            actor=actor,
            before_value=before,
            after_value=after,
        )

    def _event_snapshot(self, event: GovernanceEvent) -> dict:
        return {
            "governance_type": event.governance_type,
            "scheduled_at": self._to_utc(event.scheduled_at).isoformat(),
            "agenda": event.agenda,
            "status": event.status,
            "owner_id": event.owner_id,
            "attendee_emails": [attendee.email for attendee in event.attendees],
        }

    def _event_read(self, event: GovernanceEvent) -> GovernanceEventRead:
        return GovernanceEventRead(
            id=event.id,
            account_id=event.account_id,
            account_name=event.account.name,
            engagement_id=event.engagement_id,
            engagement_name=event.engagement.name if event.engagement else None,
            owner_id=event.owner_id,
            owner_name=event.owner_name,
            owner_email=event.owner_email,
            governance_type=event.governance_type,
            scheduled_at=event.scheduled_at,
            agenda=event.agenda,
            status=self._effective_status(event),
            source=event.source,
            attendee_emails=[attendee.email for attendee in sorted(event.attendees, key=lambda item: item.email)],
            notes=[GovernanceNoteRead.model_validate(note) for note in sorted(event.notes, key=lambda item: item.created_at)],
            decisions=[GovernanceDecisionRead.model_validate(decision) for decision in sorted(event.decisions, key=lambda item: item.created_at)],
            action_items=[GovernanceActionItemRead.model_validate(item) for item in sorted(event.action_items, key=lambda item: item.created_at)],
            generated_outputs=[self._generated_output_read(output) for output in sorted(event.generated_outputs, key=lambda item: item.created_at)],
            completed_at=event.completed_at,
            created_at=event.created_at,
            updated_at=event.updated_at,
        )

    def _generated_output_read(self, output: GovernanceGeneratedOutput) -> GovernanceGeneratedOutputRead:
        return GovernanceGeneratedOutputRead(
            id=output.id,
            event_id=output.event_id,
            output_type=output.output_type,
            generation_method=output.generation_method,
            status=output.status,
            content=output.content,
            disclaimer=output.disclaimer,
            source_filter_metadata=output.source_filter_metadata,
            provider_metadata=output.provider_metadata,
            error_code=output.error_code,
            error_message=output.error_message,
            created_by_id=output.created_by_id,
            created_by_name=output.created_by_name,
            created_at=output.created_at,
            citations=[GovernanceGeneratedOutputCitationRead.model_validate(citation) for citation in output.citations],
        )

    @staticmethod
    def _calendar_item(event: GovernanceEventRead) -> GovernanceCalendarItemRead:
        return GovernanceCalendarItemRead(
            id=f"governance:{event.id}",
            kind="governance",
            source_record_id=event.id,
            source_record_type="governance_event",
            account_id=event.account_id,
            account_name=event.account_name,
            owner_id=event.owner_id,
            date=event.scheduled_at,
            title=event.governance_type,
            detail=event.agenda,
            status=event.status,
            route=f"/accounts/{event.account_id}?tab=governance",
        )

    @staticmethod
    def _normalize_emails(emails: list[str]) -> list[str]:
        return sorted({str(email).strip().lower() for email in emails if str(email).strip()})

    @staticmethod
    def _effective_status(event: GovernanceEvent) -> str:
        if event.status in {"completed", "cancelled"}:
            return event.status
        return "overdue" if GovernanceService._to_utc(event.scheduled_at) < GovernanceService._now() else "upcoming"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _to_utc(value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    @staticmethod
    def _account_citation(account: Account) -> dict:
        return {
            "source_type": "account",
            "source_id": account.id,
            "source_title": account.name,
            "source_url": f"/accounts/{account.id}",
            "snippet": f"Account {account.name}; lifecycle {account.lifecycle_status}; risk {account.risk_status}; health {account.health_overall}/100.",
            "source_timestamp": account.updated_at,
        }

    @staticmethod
    def _engagement_line(engagement: Engagement | None, citations: list[dict]) -> str:
        if engagement is None:
            return "No engagement is linked to this governance event."
        citations.append(
            {
                "source_type": "engagement",
                "source_id": engagement.id,
                "source_title": engagement.name,
                "source_url": f"/accounts/{engagement.account_id}?tab=engagements",
                "snippet": f"Engagement {engagement.name}; delivery status {engagement.delivery_status}; renewal {engagement.renewal_date}.",
                "source_timestamp": engagement.updated_at,
            }
        )
        renewal = engagement.renewal_date.date().isoformat() if engagement.renewal_date else "not set"
        return f"Review {engagement.name}, delivery status {engagement.delivery_status}, and renewal date {renewal}."

    @staticmethod
    def _governance_citation(event: GovernanceEvent) -> dict:
        return {
            "source_type": "governance_event",
            "source_id": event.id,
            "source_title": f"{event.governance_type} on {GovernanceService._to_utc(event.scheduled_at).date().isoformat()}",
            "source_url": f"/accounts/{event.account_id}?tab=governance",
            "snippet": event.agenda[:500],
            "source_timestamp": event.scheduled_at,
        }

    @staticmethod
    def _health_citation(health) -> dict:
        return {
            "source_type": "account_health_rollup",
            "source_id": health.id,
            "source_title": "Account health rollup",
            "source_url": f"/accounts/{health.account_id}?tab=health",
            "snippet": f"Latest rollup {health.overall}/100 with {health.rag_status} status.",
            "source_timestamp": health.created_at,
        }
