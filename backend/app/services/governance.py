from datetime import datetime, timedelta, timezone
from urllib import error, request
import json
import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    GovernanceRecurrenceRule,
    GovernanceSourceCitation,
    IntegrationConnection,
    IntegrationSyncLog,
    MeetingArtifact,
    Task,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.governance import GovernanceRepository
from app.repositories.meeting_capture import MeetingCaptureRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    GovernanceAIBriefRead,
    GovernanceActionItemCreateRequest,
    GovernanceActionItemPageRead,
    GovernanceActionItemRead,
    GovernanceActionItemUpdateRequest,
    GovernanceCalendarItemRead,
    GovernanceCalendarPageRead,
    GovernanceDecisionCreateRequest,
    GovernanceDecisionPageRead,
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
    GovernanceRecurrenceRuleCreateRequest,
    GovernanceRecurrenceRulePageRead,
    GovernanceRecurrenceRuleRead,
    GovernanceRecurrenceRuleUpdateRequest,
    IntegrationConnectionRead,
    IntegrationConnectionUpdateRequest,
    IntegrationSyncLogPageRead,
    IntegrationSyncLogRead,
    IntegrationSyncResponse,
    MessageResponse,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.email_domains import field_validation_error
from app.services.in_app_notifications import InAppNotificationService
from app.services.integrations import IntegrationService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)
GOVERNANCE_REMINDER_TASK_SOURCE = "governance_event"
GOVERNANCE_ACTION_TASK_SOURCE = "governance_action_item"
GOVERNANCE_PREP_LEAD_BUSINESS_DAYS = 3
GOVERNANCE_REMINDER_LOOKAHEAD_DAYS = 7
TERMINAL_TASK_STATUSES = {"done", "cancelled"}


class GovernanceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = GovernanceRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.settings = get_settings()
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))
        self.meeting_capture = MeetingCaptureRepository(db)
        self.in_app_notifications = InAppNotificationService(db)

    def list_events(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        governance_type: str | None = None,
        status_filter: str | None = None,
        owner_id: str | None = None,
        attendee: str | None = None,
        source: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "scheduled_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> GovernanceEventPageRead:
        self.access.require_module_permission(current_user, "governance_reviews", "view")
        account_ids = None if self.access.can_view_portfolio(current_user) else self.accounts.list_account_ids_for_user(current_user.id)
        items, total = self.repository.list_events(
            account_id=account_id,
            account_ids=account_ids,
            visible_user_id=current_user.id if account_ids is not None else None,
            engagement_id=engagement_id,
            search=search,
            governance_type=governance_type,
            status=status_filter,
            owner_id=owner_id,
            attendee=attendee,
            source=source,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return GovernanceEventPageRead(items=[self._event_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def calendar_items(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        owner_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> GovernanceCalendarPageRead:
        events = self.list_events(
            current_user,
            account_id=account_id,
            owner_id=owner_id,
            date_from=date_from,
            date_to=date_to,
            sort="scheduled_at",
            direction="asc",
            page=page,
            page_size=page_size,
        )
        return GovernanceCalendarPageRead(
            items=[self._calendar_item(item) for item in events.items],
            total=events.total,
            page=events.page,
            page_size=events.page_size,
            pages=events.pages,
        )

    def create_event(self, payload: GovernanceEventCreateRequest, current_user: User) -> GovernanceEventRead:
        self.access.require_module_permission(current_user, "governance_reviews", "create")
        account = self.accounts.get_by_id(payload.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="governance_reviews")
        owner = self._get_user_or_404(payload.owner_id)
        attendees = self._event_attendees(payload.attendees, payload.attendee_emails)
        source = self._provider_event_source(payload.source) if payload.source != "manual" else "manual"
        deduplication_key = self._event_deduplication_key(source, payload.account_id, payload.governance_type, payload.scheduled_at)
        if self.repository.get_event_by_deduplication_key(deduplication_key):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A governance event already exists for this account, governance type, and scheduled time.",
            )
        event = GovernanceEvent(
            account_id=payload.account_id,
            engagement_id=payload.engagement_id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            governance_type=payload.governance_type,
            source=source,
            deduplication_key=deduplication_key,
            scheduled_at=payload.scheduled_at,
            end_at=payload.end_at,
            status=payload.status,
            agenda=payload.agenda,
            notes=payload.notes,
            attendees=attendees,
            recurrence_rule_id=payload.recurrence_rule_id,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        try:
            self.repository.save_event(event)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A governance event already exists for this account, governance type, and scheduled time.",
            ) from exc
        self.custom_fields.save_record_values("governance_reviews", event.id, payload.custom_field_values, current_user, audit_module="governance_reviews")
        self._sync_governance_reminder_task(event, current_user)
        self._write_governance_timeline(event, current_user, "scheduled")
        self._mirror_calendar_event(event, current_user)
        self.audit.log(module="governance_reviews", action="create", entity_type="governance_event", entity_id=event.id, actor=current_user, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        self._notify_governance_event(event, "governance_scheduled", "Governance scheduled", current_user)
        self.repository.commit()
        self._evaluate_alerts_for_account(event.account_id)
        return self._event_read(event)

    def get_event(self, event_id: str, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self._require_event_view(current_user, event)
        return self._event_read(event)

    def update_event(self, event_id: str, payload: GovernanceEventUpdateRequest, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        before = self._event_snapshot(event)
        updates = payload.model_dump(exclude_unset=True)
        custom_values = updates.pop("custom_field_values", None)
        attendee_emails = updates.pop("attendee_emails", None)
        self._refresh_event_deduplication_key(event, updates)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_user_or_404(updates["owner_id"])
            event.owner_id = owner.id
            event.owner_name = owner.full_name
            updates.pop("owner_id")
        if attendee_emails is not None:
            updates["attendees"] = self._event_attendees([], attendee_emails)
        for field, value in updates.items():
            setattr(event, field, value)
        if custom_values is not None:
            self.custom_fields.replace_record_values("governance_reviews", event.id, custom_values, current_user, audit_module="governance_reviews")
        self._sync_governance_reminder_task(event, current_user)
        if event.source == "manual":
            self._mirror_calendar_event(event, current_user)
        self.audit.log(module="governance_reviews", action="update", entity_type="governance_event", entity_id=event.id, actor=current_user, before_value=before, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        if str(before.get("status", "")).lower() != "cancelled" and str(event.status).lower() == "cancelled":
            self._notify_governance_event(event, "governance_cancelled", "Governance cancelled", current_user)
        elif before.get("scheduled_at") != (event.scheduled_at.isoformat() if event.scheduled_at else None):
            self._notify_governance_event(event, "governance_rescheduled", "Governance rescheduled", current_user)
        if before.get("account_id") and before.get("governance_type") and (before.get("account_id") != event.account_id or before.get("governance_type") != event.governance_type):
            self._sync_next_governance_prep_task(str(before["account_id"]), str(before["governance_type"]), current_user)
        self.repository.commit()
        self._evaluate_alerts_for_account(event.account_id)
        return self._event_read(event)

    def delete_event(self, event_id: str, current_user: User) -> MessageResponse:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        before = self._event_snapshot(event)
        account = event.account
        event.status = "cancelled"
        self._sync_governance_reminder_task(event, current_user, reason="Governance event was deleted.")
        self._cancel_governance_action_tasks(event, current_user, "Governance event was deleted.")
        if event.source == "manual":
            self._mirror_calendar_event(event, current_user)
        self._write_governance_timeline(event, current_user, "deleted", "Governance event deleted from the account workspace.")
        self.custom_fields.replace_record_values("governance_reviews", event.id, {}, current_user, audit_module="governance_reviews")
        self.audit.log(
            module="governance_reviews",
            action="delete",
            entity_type="governance_event",
            entity_id=event.id,
            actor=current_user,
            before_value=before,
            after_value={"deleted": True},
        )
        self.repository.delete_event(event)
        self._update_next_governance(account)
        if before.get("account_id") and before.get("governance_type"):
            self._sync_next_governance_prep_task(str(before["account_id"]), str(before["governance_type"]), current_user)
        self.repository.commit()
        return MessageResponse(message="Governance event deleted successfully")

    def complete_event(self, event_id: str, current_user: User, payload: GovernanceEventCompleteRequest | None = None) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        if event.status == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled governance events must be reopened or rescheduled before completion")
        before = self._event_snapshot(event)
        meeting_artifact: MeetingArtifact | None = None
        if payload is not None:
            meeting_artifact = self._meeting_artifact_for_completion(payload.meeting_artifact_id, event, current_user)
            event.notes = payload.notes
            for decision_payload in payload.decisions:
                decision = self._decision_from_payload(event, decision_payload, current_user)
                self.repository.add_decision(decision)
                timeline_entry = self._write_governance_timeline(
                    event,
                    current_user,
                    "decision",
                    decision.decision_text,
                    source_record_id=decision.id,
                    source_record_type="governance_decision",
                )
                decision.timeline_entry_id = timeline_entry.id if timeline_entry else None
                self._notify_governance_decision(event, decision, current_user)
            for action_payload in payload.action_items:
                action_item = self.repository.add_action_item(self._action_item_from_payload(event, action_payload, current_user))
                if action_payload.create_task:
                    self._sync_governance_action_task(event, action_item, current_user)
                self._notify_governance_action_assigned(event, action_item, current_user)
            if meeting_artifact:
                self._attach_meeting_artifact(event, meeting_artifact)
        if not event.notes and not event.decisions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Governance completion requires notes or at least one decision")
        event.status = "completed"
        event.completed_at = datetime.now(timezone.utc)
        self._sync_governance_reminder_task(event, current_user)
        self._write_governance_timeline(event, current_user, "completed")
        self.audit.log(module="governance_reviews", action="complete", entity_type="governance_event", entity_id=event.id, actor=current_user, before_value=before, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        if event.account_id:
            self._sync_next_governance_prep_task(event.account_id, event.governance_type, current_user)
        self.repository.commit()
        self._evaluate_alerts_for_account(event.account_id)
        return self._event_read(event)

    def agenda_draft(self, event_id: str, current_user: User, payload: GovernanceGeneratedOutputRequest | None = None) -> GovernanceGeneratedOutputRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        account = self.repository.get_account(event.account_id) if event.account_id else None
        account_name = account.name if account else "the account"
        content = "\n".join(
            [
                "Account health and risk review",
                f"1. Review current health and governance posture for {account_name}.",
                "2. Confirm open risks, escalations, and recovery actions.",
                "3. Review active opportunities, renewal posture, and client stakeholder changes.",
                "4. Confirm decisions, owners, due dates, and follow-up communication cadence.",
            ]
        )
        self._ensure_citation(event, "account_overview", "account", event.account_id, f"/accounts/{event.account_id}", "Account overview", f"Agenda draft generated from account profile and recent governance context for {account_name}.")
        self.audit.log(module="governance_reviews", action="agenda_draft", entity_type="governance_event", entity_id=event.id, actor=current_user)
        self.repository.commit()
        return self._generated_output_read(event, current_user, "agenda_draft", content, payload.source_modules if payload else [])

    def update_agenda(self, event_id: str, payload: GovernanceEventAgendaUpdateRequest, current_user: User) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        if payload.agenda is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agenda is required")
        event.agenda = payload.agenda
        self.audit.log(module="governance_reviews", action="agenda_update", entity_type="governance_event", entity_id=event.id, actor=current_user)
        self.repository.commit()
        return self._event_read(event)

    def ai_brief(self, event_id: str, current_user: User, payload: GovernanceGeneratedOutputRequest | None = None) -> GovernanceAIBriefRead:
        event = self._get_event_or_404(event_id)
        self._require_event_view(current_user, event)
        citations = event.source_citations or [
            self._ensure_citation(event, "governance", "governance_event", event.id, f"/governance?selected={event.id}", "Governance event", event.agenda or "Governance record has no agenda yet.")
        ]
        decisions = [item.decision_text for item in event.decisions]
        actions = [item.title for item in event.action_items if item.status != "completed"]
        summary = f"Pre-meeting brief for {event.governance_type}. Review health posture, recent risks, open commitments, and escalation context before the session."
        talking_points = [
            "Confirm executive outcomes and decision owners.",
            "Review overdue actions and renewal or expansion impact.",
            "Validate escalation recovery progress and client communication cadence.",
        ]
        open_risks = ["No source-backed open risk data was available in this module yet."]
        pending_decisions = decisions or ["No decisions recorded yet."]
        action_items = actions or ["No open action items recorded yet."]
        content = "\n".join(
            [
                f"Health snapshot: {summary}",
                "Talking points:",
                *[f"- {item}" for item in talking_points],
                "Pending decisions:",
                *[f"- {item}" for item in pending_decisions],
                "Action items:",
                *[f"- {item}" for item in action_items],
            ]
        )
        self.audit.log(module="governance_reviews", action="ai_brief", entity_type="governance_event", entity_id=event.id, actor=current_user)
        self.repository.commit()
        output = self._generated_output_read(event, current_user, "governance_brief", content, payload.source_modules if payload else [], citations=citations)
        output_data = output.model_dump()
        output_data.update(
            summary=summary,
            talking_points=talking_points,
            open_risks=open_risks,
            pending_decisions=pending_decisions,
            action_items=action_items,
            disclaimer="AI-generated advisory brief. Verify cited sources before client or executive use.",
        )
        return GovernanceAIBriefRead(**output_data)

    def add_decision(self, event_id: str, payload: GovernanceDecisionCreateRequest, current_user: User) -> GovernanceDecisionRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        decision = self._decision_from_payload(event, payload, current_user)
        self.repository.add_decision(decision)
        timeline_entry = self._write_governance_timeline(
            event,
            current_user,
            "decision",
            payload.decision_text,
            source_record_id=decision.id,
            source_record_type="governance_decision",
        )
        decision.timeline_entry_id = timeline_entry.id if timeline_entry else None
        self.audit.log(module="governance_reviews", action="add_decision", entity_type="governance_decision", entity_id=decision.id, actor=current_user)
        self._notify_governance_decision(event, decision, current_user)
        self.repository.commit()
        return self._decision_read(decision)

    def list_decisions(self, event_id: str, current_user: User, page: int, page_size: int) -> GovernanceDecisionPageRead:
        event = self._get_event_or_404(event_id)
        self._require_event_view(current_user, event)
        items, total = self.repository.list_decisions_page(event.id, page, page_size)
        return GovernanceDecisionPageRead(items=[self._decision_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def add_action_item(self, event_id: str, payload: GovernanceActionItemCreateRequest, current_user: User) -> GovernanceActionItemRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        action_item = self._action_item_from_payload(event, payload, current_user)
        self.repository.add_action_item(action_item)
        self.audit.log(module="governance_reviews", action="add_action_item", entity_type="governance_action_item", entity_id=action_item.id, actor=current_user)
        self._notify_governance_action_assigned(event, action_item, current_user)
        self.repository.commit()
        self._evaluate_alerts_for_account(event.account_id)
        return self._action_item_read(action_item)

    def list_action_items(self, event_id: str, current_user: User, page: int, page_size: int) -> GovernanceActionItemPageRead:
        event = self._get_event_or_404(event_id)
        self._require_event_view(current_user, event)
        items, total = self.repository.list_action_items_page(event.id, page, page_size)
        return GovernanceActionItemPageRead(items=[self._action_item_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def update_action_item(self, action_item_id: str, payload: GovernanceActionItemUpdateRequest, current_user: User) -> GovernanceActionItemRead:
        item = self.repository.get_action_item(action_item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Governance action item was not found")
        event = self._get_event_or_404(item.governance_event_id)
        self._require_event_update(current_user, event)
        if payload.owner_id:
            owner = self._get_user_or_404(payload.owner_id)
            item.owner_id = owner.id
            item.owner_name = owner.full_name
        for field, value in payload.model_dump(exclude_unset=True, exclude={"owner_id"}).items():
            setattr(item, field, value)
        if payload.status == "completed":
            item.completed_at = datetime.now(timezone.utc)
            item.completed_by_id = current_user.id
        self.audit.log(module="governance_reviews", action="update_action_item", entity_type="governance_action_item", entity_id=item.id, actor=current_user)
        self.repository.commit()
        self._evaluate_alerts_for_account(event.account_id)
        return self._action_item_read(item)

    def list_recurrence_rules(self, current_user: User, *, search: str | None = None, cadence: str | None = None, governance_type: str | None = None, active_state: str = "active", owner_id: str | None = None, account_id: str | None = None, segment: str | None = None, page: int = 1, page_size: int = 10) -> GovernanceRecurrenceRulePageRead:
        self.access.require_module_permission(current_user, "governance_reviews", "configure")
        items, total = self.repository.list_recurrence_rules(search=search, cadence=cadence, governance_type=governance_type, active_state=active_state, owner_id=owner_id, account_id=account_id, segment=segment, page=page, page_size=page_size)
        return GovernanceRecurrenceRulePageRead(items=[GovernanceRecurrenceRuleRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_recurrence_rule(self, payload: GovernanceRecurrenceRuleCreateRequest, current_user: User) -> GovernanceRecurrenceRuleRead:
        self.access.require_module_permission(current_user, "governance_reviews", "configure")
        owner = self._get_user_or_404(payload.owner_id)
        rule = GovernanceRecurrenceRule(
            name=payload.name,
            governance_type=payload.governance_type,
            cadence=payload.cadence,
            interval=payload.interval,
            start_at=payload.start_at,
            day_of_week=payload.day_of_week,
            day_of_month=payload.day_of_month,
            end_policy=payload.end_policy,
            occurrences=payload.occurrences,
            end_at=payload.end_at,
            account_id=payload.account_id,
            segment=payload.segment,
            owner_id=owner.id,
            owner_name=owner.full_name,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_recurrence_rule(rule)
        self._generate_recurrence_events(rule, current_user)
        if rule.account_id:
            self._sync_next_governance_prep_task(rule.account_id, rule.governance_type, current_user)
        self.audit.log(module="governance_reviews", action="create_recurrence_rule", entity_type="governance_recurrence_rule", entity_id=rule.id, actor=current_user)
        self.repository.commit()
        return GovernanceRecurrenceRuleRead.model_validate(rule)

    def update_recurrence_rule(self, rule_id: str, payload: GovernanceRecurrenceRuleUpdateRequest, current_user: User) -> GovernanceRecurrenceRuleRead:
        self.access.require_module_permission(current_user, "governance_reviews", "configure")
        rule = self._get_rule_or_404(rule_id)
        if payload.owner_id:
            owner = self._get_user_or_404(payload.owner_id)
            rule.owner_id = owner.id
            rule.owner_name = owner.full_name
        for field, value in payload.model_dump(exclude_unset=True, exclude={"owner_id"}).items():
            setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        if rule.is_active:
            self._generate_recurrence_events(rule, current_user)
        if rule.account_id:
            self._sync_next_governance_prep_task(rule.account_id, rule.governance_type, current_user)
        self.audit.log(module="governance_reviews", action="update_recurrence_rule", entity_type="governance_recurrence_rule", entity_id=rule.id, actor=current_user)
        self.repository.commit()
        return GovernanceRecurrenceRuleRead.model_validate(rule)

    def delete_recurrence_rule(self, rule_id: str, current_user: User) -> MessageResponse:
        self.access.require_module_permission(current_user, "governance_reviews", "configure")
        rule = self._get_rule_or_404(rule_id)
        self.repository.delete_recurrence_rule(rule)
        self.audit.log(module="governance_reviews", action="delete_recurrence_rule", entity_type="governance_recurrence_rule", entity_id=rule_id, actor=current_user)
        self.repository.commit()
        return MessageResponse(message="Governance recurrence rule deleted successfully")

    def list_integrations(
        self,
        current_user: User,
        *,
        provider: str | None = None,
        status_filter: str | None = None,
        error_state: str | None = None,
        last_synced_from: datetime | None = None,
        last_synced_to: datetime | None = None,
    ) -> list[IntegrationConnectionRead]:
        self.access.require_module_permission(current_user, "integrations", "view")
        self._ensure_default_connections()
        self.repository.commit()
        connections = self.repository.list_connections()
        if provider:
            connections = [item for item in connections if item.provider == provider]
        if status_filter:
            connections = [item for item in connections if item.status == status_filter]
        if error_state == "with_errors":
            connections = [item for item in connections if item.last_error]
        if error_state == "without_errors":
            connections = [item for item in connections if not item.last_error]
        if last_synced_from:
            connections = [item for item in connections if item.last_synced_at and item.last_synced_at >= last_synced_from]
        if last_synced_to:
            connections = [item for item in connections if item.last_synced_at and item.last_synced_at <= last_synced_to]
        return [IntegrationConnectionRead.model_validate(item) for item in connections]

    def update_integration(self, provider: str, payload: IntegrationConnectionUpdateRequest, current_user: User) -> IntegrationConnectionRead:
        self.access.require_module_permission(current_user, "integrations", "configure")
        connection = self._get_or_create_connection(provider)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(connection, field, value)
        if connection.enabled and connection.status == "configuration_required" and connection.credentials_json:
            connection.status = "connected"
        self.audit.log(module="integrations", action="update", entity_type="integration_connection", entity_id=connection.id, actor=current_user, after_value={"provider": provider, "enabled": connection.enabled, "status": connection.status})
        self.repository.commit()
        return IntegrationConnectionRead.model_validate(connection)

    def sync_integration(self, provider: str, current_user: User) -> IntegrationSyncResponse:
        self.access.require_module_permission(current_user, "integrations", "configure")
        connection = self._get_or_create_connection(provider)
        if not connection.enabled or not connection.credentials_json:
            connection.status = "configuration_required"
            connection.last_error = f"{provider} credentials are required before sync."
            self._sync_log(provider, "sync", "configuration_required", connection.last_error)
            self.repository.commit()
            return IntegrationSyncResponse(provider=provider, status=connection.status, errors=1, message=connection.last_error)
        try:
            raw_records = self._fetch_provider_records(provider, connection)
            created, skipped = self._upsert_provider_events(provider, raw_records, current_user)
            connection.status = "connected"
            connection.last_error = None
            connection.last_synced_at = datetime.now(timezone.utc)
            self._sync_log(provider, "sync", "success", f"Synced {created} governance events; skipped {skipped}.")
            self.repository.commit()
            return IntegrationSyncResponse(provider=provider, status="connected", created=created, skipped=skipped, message=f"Synced {created} governance events; skipped {skipped}.")
        except Exception as exc:  # external adapter boundary
            connection.status = "error"
            connection.last_error = str(exc)
            self._sync_log(provider, "sync", "error", str(exc))
            self.repository.commit()
            return IntegrationSyncResponse(provider=provider, status="error", errors=1, message=str(exc))

    def list_sync_logs(self, current_user: User, provider: str | None = None, status_filter: str | None = None, page: int = 1, page_size: int = 10) -> IntegrationSyncLogPageRead:
        self.access.require_module_permission(current_user, "integrations", "view")
        items, total = self.repository.list_sync_logs(provider=provider, status=status_filter, page=page, page_size=page_size)
        return IntegrationSyncLogPageRead(items=[IntegrationSyncLogRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def run_due_governance_reminders(self, current_user: User | None = None, *, mode: str = "scheduled") -> int:
        now = datetime.now(timezone.utc)
        date_to = now + timedelta(days=GOVERNANCE_REMINDER_LOOKAHEAD_DAYS)
        processed_scopes: set[tuple[str, str]] = set()
        reminders_processed = 0
        for event in self.repository.list_upcoming_governance_events(now=now, date_to=date_to):
            if not event.account_id:
                continue
            scope = (event.account_id, event.governance_type)
            if scope in processed_scopes:
                continue
            processed_scopes.add(scope)
            next_event = self.repository.next_governance_event(account_id=event.account_id, governance_type=event.governance_type, now=now)
            if next_event is None or next_event.id != event.id:
                continue
            if self._governance_prep_due_at(event.scheduled_at) > now:
                continue
            self._sync_next_governance_prep_task(event.account_id, event.governance_type, current_user, now=now, send_due_reminder=True)
            reminders_processed += 1
        self.repository.commit()
        logger.info("Governance reminder run completed mode=%s processed=%s", mode, reminders_processed)
        return reminders_processed

    def _governance_recipients(self, event: GovernanceEvent) -> list[User]:
        return [
            self.in_app_notifications.active_user(event.owner_id),
            *self.in_app_notifications.users_by_emails(event.attendees or []),
        ]

    def _notify_governance_event(self, event: GovernanceEvent, trigger: str, label: str, current_user: User | None, *, dedupe_scope: str | None = None) -> None:
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        scheduled = event.scheduled_at.strftime("%Y-%m-%d %H:%M") if event.scheduled_at else "unscheduled"
        self.in_app_notifications.queue_many(
            self._governance_recipients(event),
            trigger=trigger,
            title=f"{label}: {account.name if account else event.governance_type}",
            body=f"{event.governance_type} is scheduled for {scheduled}.",
            account=account,
            source_record_type="governance_event",
            source_record_id=event.id,
            source_record_route=f"/accounts/{event.account_id}?tab=governance" if event.account_id else f"/governance?selected={event.id}",
            priority="medium",
            dedupe_scope=dedupe_scope or f"{trigger}:{event.updated_at.isoformat() if event.updated_at else event.id}",
            exclude_user_ids={current_user.id} if current_user else set(),
        )

    def _notify_governance_reminder(self, event: GovernanceEvent, current_user: User | None = None) -> None:
        self._notify_governance_event(
            event,
            "governance_reminder",
            "Governance reminder",
            current_user,
            dedupe_scope=f"governance_reminder:{event.id}:{event.scheduled_at.isoformat() if event.scheduled_at else event.id}",
        )

    def _notify_governance_decision(self, event: GovernanceEvent, decision: GovernanceDecision, current_user: User) -> None:
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        self.in_app_notifications.queue_many(
            self.in_app_notifications.account_owners(account),
            trigger="governance_decision_recorded",
            title=f"Governance decision recorded: {account.name if account else event.governance_type}",
            body=decision.decision_text,
            account=account,
            source_record_type="governance_decision",
            source_record_id=decision.id,
            source_record_route=f"/accounts/{event.account_id}?tab=governance" if event.account_id else f"/governance?selected={event.id}",
            priority="low",
            exclude_user_ids={current_user.id},
        )

    def _notify_governance_action_assigned(self, event: GovernanceEvent, action_item: GovernanceActionItem, current_user: User) -> None:
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        self.in_app_notifications.queue(
            recipient=self.in_app_notifications.active_user(action_item.owner_id),
            trigger="governance_action_assigned",
            title=f"Governance action assigned: {action_item.title}",
            body=f"You have a governance action for {account.name if account else event.governance_type}.",
            account=account,
            source_record_type="governance_action_item",
            source_record_id=action_item.id,
            source_record_route=f"/accounts/{event.account_id}?tab=governance" if event.account_id else f"/governance?selected={event.id}",
            priority=action_item.priority or "medium",
            dedupe_scope="assigned",
        )

    def _sync_governance_reminder_task(self, event: GovernanceEvent, actor: User | None, reason: str = "Governance event was cancelled.") -> None:
        if not event.account_id or event.review_required:
            return
        task = self.repository.get_task_by_source(GOVERNANCE_REMINDER_TASK_SOURCE, event.id)
        if event.status == "cancelled":
            if task:
                task.status = "cancelled"
                task.skipped_reason = task.skipped_reason or reason
                task.updated_by_id = actor.id if actor else None
            self._sync_next_governance_prep_task(event.account_id, event.governance_type, actor)
            return
        if event.status == "completed":
            if task:
                task.status = "done"
                task.outcome = task.outcome or "Governance event completed."
                task.completed_at = task.completed_at or datetime.now(timezone.utc)
                task.completed_by_id = actor.id if actor else None
                task.updated_by_id = actor.id if actor else None
            self._sync_next_governance_prep_task(event.account_id, event.governance_type, actor)
            return
        self._sync_next_governance_prep_task(event.account_id, event.governance_type, actor)

    def _sync_next_governance_prep_task(self, account_id: str, governance_type: str, actor: User | None, *, now: datetime | None = None, send_due_reminder: bool = False) -> Task | None:
        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        self.repository.db.flush()
        next_event = self.repository.next_governance_event(account_id=account_id, governance_type=governance_type, now=current_time)
        active_tasks = self.repository.list_governance_reminder_tasks_for_scope(account_id=account_id, governance_type=governance_type)
        for task in active_tasks:
            if next_event is None or task.source_record_id != next_event.id:
                task.status = "cancelled"
                task.skipped_reason = task.skipped_reason or "Superseded by a newer governance prep task."
                task.updated_by_id = actor.id if actor else None
        if next_event is None:
            return None
        task = self.repository.get_task_by_source(GOVERNANCE_REMINDER_TASK_SOURCE, next_event.id)
        due_at = self._governance_prep_due_at(next_event.scheduled_at)
        if task is None:
            task = Task(
                account_id=next_event.account_id,
                engagement_id=next_event.engagement_id,
                source_type=GOVERNANCE_REMINDER_TASK_SOURCE,
                source_record_id=next_event.id,
                title=self._governance_task_title(next_event),
                description=self._governance_task_description(next_event),
                owner_id=next_event.owner_id,
                owner_name=next_event.owner_name,
                due_at=due_at,
                status="open",
                priority="medium",
                success_criteria=[],
                requires_evidence=False,
                created_by_id=actor.id if actor else None,
                updated_by_id=actor.id if actor else None,
            )
            self.repository.save_task(task)
        task.account_id = next_event.account_id
        task.engagement_id = next_event.engagement_id
        task.title = self._governance_task_title(next_event)
        task.description = self._governance_task_description(next_event)
        task.owner_id = next_event.owner_id
        task.owner_name = next_event.owner_name
        task.due_at = due_at
        if task.status in TERMINAL_TASK_STATUSES:
            task.status = "open"
            task.completed_at = None
            task.completed_by_id = None
            task.skipped_reason = None
            task.outcome = None
        task.updated_by_id = actor.id if actor else None
        if send_due_reminder and due_at <= current_time:
            self._notify_governance_reminder(next_event, actor)
        return task

    def _sync_governance_action_task(self, event: GovernanceEvent, action_item: GovernanceActionItem, actor: User) -> None:
        if not event.account_id:
            return
        existing = self.repository.get_task_by_source(GOVERNANCE_ACTION_TASK_SOURCE, action_item.id)
        owner = self.repository.get_user(event.owner_id) if event.owner_id else None
        owner_id = owner.id if owner else event.owner_id or actor.id
        owner_name = owner.full_name if owner else event.owner_name or actor.full_name
        if existing is None:
            existing = Task(
                account_id=event.account_id,
                engagement_id=event.engagement_id,
                source_type=GOVERNANCE_ACTION_TASK_SOURCE,
                source_record_id=action_item.id,
                title=action_item.title,
                description=f"{event.governance_type} follow-up for {event.account.name if event.account else 'governance event'}.",
                owner_id=owner_id,
                owner_name=owner_name,
                due_at=action_item.due_at,
                status="open",
                priority=action_item.priority,
                success_criteria=[],
                requires_evidence=False,
                created_by_id=actor.id,
                updated_by_id=actor.id,
            )
            self.repository.save_task(existing)
            return
        existing.account_id = event.account_id
        existing.engagement_id = event.engagement_id
        existing.title = action_item.title
        existing.owner_id = owner_id
        existing.owner_name = owner_name
        existing.due_at = action_item.due_at
        existing.priority = action_item.priority
        existing.updated_by_id = actor.id

    def _cancel_governance_action_tasks(self, event: GovernanceEvent, actor: User, reason: str) -> None:
        for action_item in event.action_items:
            task = self.repository.get_task_by_source(GOVERNANCE_ACTION_TASK_SOURCE, action_item.id)
            if task is None:
                continue
            task.status = "cancelled"
            task.skipped_reason = task.skipped_reason or reason
            task.updated_by_id = actor.id

    def _meeting_artifact_for_completion(self, meeting_artifact_id: str | None, event: GovernanceEvent, current_user: User) -> MeetingArtifact | None:
        if not meeting_artifact_id:
            return None
        artifact = self.meeting_capture.get_meeting_artifact(meeting_artifact_id)
        if artifact is None or artifact.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting capture was not found")
        if artifact.account_id and artifact.account_id != event.account_id:
            raise field_validation_error("meeting_artifact_id", "Meeting capture belongs to a different account.")
        return artifact

    def _attach_meeting_artifact(self, event: GovernanceEvent, artifact: MeetingArtifact) -> None:
        if not artifact.account_id:
            artifact.account_id = event.account_id
            artifact.engagement_id = event.engagement_id
        artifact.linked_object_type = "governance_event"
        artifact.linked_object_id = event.id
        artifact.status = "attached"
        self.meeting_capture.save_meeting_artifact(artifact)
        self._ensure_citation(
            event,
            "meeting_capture",
            "meeting_artifact",
            artifact.id,
            artifact.source_link[:500] if artifact.source_link else None,
            "Fathom meeting notes",
            artifact.summary or artifact.title,
        )

    @staticmethod
    def _governance_task_title(event: GovernanceEvent) -> str:
        if event.account:
            return f"Prepare for {event.governance_type}: {event.account.name}"[:220]
        return f"Prepare for {event.governance_type} governance event"[:220]

    @staticmethod
    def _governance_task_description(event: GovernanceEvent) -> str:
        lead_time = f"{GOVERNANCE_PREP_LEAD_BUSINESS_DAYS} business day{'s' if GOVERNANCE_PREP_LEAD_BUSINESS_DAYS != 1 else ''}"
        context = f"Prep is due {lead_time} before this governance event."
        if event.agenda:
            return f"{context} Agenda: {event.agenda}"
        if event.notes:
            return f"{context} Notes: {event.notes}"
        return context

    @staticmethod
    def _governance_prep_due_at(scheduled_at: datetime) -> datetime:
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        due_at = scheduled_at
        business_days = 0
        while business_days < GOVERNANCE_PREP_LEAD_BUSINESS_DAYS:
            due_at -= timedelta(days=1)
            if due_at.weekday() < 5:
                business_days += 1
        return due_at

    def _generate_recurrence_events(self, rule: GovernanceRecurrenceRule, actor: User) -> None:
        if not rule.account_id:
            return
        account = self.accounts.get_by_id(rule.account_id)
        if account is None:
            return
        max_occurrences = rule.occurrences if rule.end_policy == "after_occurrences" and rule.occurrences else 6
        for index in range(max_occurrences):
            scheduled_at = self._add_cadence(rule.start_at, rule.cadence, rule.interval * index)
            if rule.end_policy == "on_date" and rule.end_at and scheduled_at > rule.end_at:
                continue
            key = f"recurrence:{rule.id}:{account.id}:{scheduled_at.date().isoformat()}"
            if self.repository.get_event_by_deduplication_key(key):
                continue
            self.repository.save_event(
                GovernanceEvent(
                    account_id=account.id,
                    owner_id=rule.owner_id,
                    owner_name=rule.owner_name,
                    governance_type=rule.governance_type,
                    source="manual",
                    deduplication_key=key,
                    scheduled_at=scheduled_at,
                    status="scheduled",
                    agenda=f"{rule.governance_type} generated from recurrence rule {rule.name}.",
                    attendees=[],
                    recurrence_rule_id=rule.id,
                    created_by_id=actor.id,
                    created_by_name=actor.full_name,
                )
            )

    def _fetch_provider_records(self, provider: str, connection: IntegrationConnection) -> list[dict]:
        if provider == "google-calendar":
            token = (connection.credentials_json or {}).get("access_token")
            calendar_id = (connection.settings_json or {}).get("calendar_id", self.settings.google_calendar_default_calendar_id)
            if not token:
                raise ValueError("Google Calendar access_token is required.")
            url = f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events?singleEvents=true&orderBy=startTime"
            return self._json_get(url, {"Authorization": f"Bearer {token}"}).get("items", [])
        if provider == "fathom":
            api_key = (connection.credentials_json or {}).get("api_key") or self.settings.fathom_api_key
            if not api_key:
                raise ValueError("Fathom API key is required.")
            url = f"{self.settings.fathom_base_url.rstrip('/')}{self.settings.fathom_recordings_path}"
            payload = self._json_get(url, {"Authorization": f"Bearer {api_key}"})
            return payload.get("recordings", payload.get("items", [])) if isinstance(payload, dict) else []
        raise ValueError("Unsupported integration provider")

    def _upsert_provider_events(self, provider: str, records: list[dict], actor: User) -> tuple[int, int]:
        created = 0
        skipped = 0
        for record in records:
            title = str(record.get("summary") or record.get("title") or record.get("name") or "")
            start_value = record.get("start", {}).get("dateTime") if isinstance(record.get("start"), dict) else record.get("started_at") or record.get("date")
            external_id = str(record.get("id") or record.get("recording_id") or f"{provider}:{title}:{start_value}")
            key = f"{provider}:{external_id}"
            if not title or not start_value:
                skipped += 1
                self._sync_log(provider, "skip", "skipped", "Record did not include title and start date.", source_record_id=external_id, deduplication_key=key, payload=record)
                continue
            account, confidence = self.repository.find_account_by_name_fragment(title)
            scheduled_at = datetime.fromisoformat(str(start_value).replace("Z", "+00:00"))
            if self.repository.get_event_by_deduplication_key(key):
                skipped += 1
                self._sync_log(provider, "skip", "duplicate", "Governance event already exists for this source record.", source_record_id=external_id, deduplication_key=key, payload=record)
                continue
            review_required = account is None or confidence < 80
            event = GovernanceEvent(
                account_id=account.id if account else None,
                owner_id=actor.id,
                owner_name=actor.full_name,
                governance_type="QBR" if "qbr" in title.lower() else "Executive Review",
                source="review_required" if review_required else self._provider_event_source(provider),
                external_provider=provider,
                external_event_id=external_id,
                deduplication_key=key,
                mapping_confidence=confidence,
                review_required=review_required,
                scheduled_at=scheduled_at,
                status="review_required" if review_required else "scheduled",
                agenda=record.get("description") or record.get("summary") or title,
                notes=record.get("transcript") or record.get("notes"),
                attendees=[],
                created_by_id=actor.id,
                created_by_name=actor.full_name,
            )
            self.repository.save_event(event)
            self._sync_log(provider, "create", "created", "Governance event created from integration source.", source_record_id=external_id, deduplication_key=key, payload={"title": title, "mapping_confidence": confidence})
            created += 1
        return created, skipped

    @staticmethod
    def _json_get(url: str, headers: dict[str, str]) -> dict:
        req = request.Request(url, headers=headers)
        try:
            with request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise ValueError(f"External API returned {exc.code}") from exc

    def _sync_log(
        self,
        provider: str,
        action: str,
        sync_status: str,
        message: str,
        *,
        source_record_id: str | None = None,
        deduplication_key: str | None = None,
        payload: dict | None = None,
    ) -> None:
        self.repository.add_sync_log(
            IntegrationSyncLog(provider=provider, source_record_id=source_record_id, action=action, status=sync_status, deduplication_key=deduplication_key, message=message, payload=payload)
        )

    def _ensure_default_connections(self) -> None:
        for provider in ("google-calendar", "fathom"):
            self._get_or_create_connection(provider)

    def _get_or_create_connection(self, provider: str) -> IntegrationConnection:
        if provider not in {"google-calendar", "fathom"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported integration provider")
        connection = self.repository.get_connection(provider)
        if connection:
            return connection
        connection = IntegrationConnection(provider=provider, auth_type="oauth2" if provider == "google-calendar" else "api_key", scopes=["calendar.events.readonly"] if provider == "google-calendar" else ["recordings.read"], settings_json={})
        self.repository.save_connection(connection)
        return connection

    @staticmethod
    def _provider_event_source(provider: str) -> str:
        if provider in {"google-calendar", "google_calendar"}:
            return "google_calendar"
        if provider in {"fathom", "fathom_enriched"}:
            return "fathom_enriched"
        return provider

    def _mirror_calendar_event(self, event: GovernanceEvent, current_user: User) -> None:
        if event.source == "google_calendar":
            return
        try:
            IntegrationService(self.repository.db).write_governance_event_to_calendar(event, current_user)
        except Exception:
            logger.exception("Google Calendar outbound write failed for governance event %s", event.id)

    def _get_event_or_404(self, event_id: str) -> GovernanceEvent:
        event = self.repository.get_event(event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Governance event was not found")
        return event

    def _event_read(self, event: GovernanceEvent) -> GovernanceEventRead:
        account_name = event.account.name if event.account else ""
        engagement_name = event.engagement.name if event.engagement else None
        attendee_emails = self._attendee_emails(event.attendees)
        return GovernanceEventRead(
            id=event.id,
            account_id=event.account_id,
            account_name=account_name,
            engagement_id=event.engagement_id,
            engagement_name=engagement_name,
            owner_id=event.owner_id,
            owner_name=event.owner_name,
            owner_email=None,
            governance_type=event.governance_type,
            source=event.source,
            external_provider=event.external_provider,
            external_event_id=event.external_event_id,
            deduplication_key=event.deduplication_key,
            mapping_confidence=event.mapping_confidence,
            review_required=event.review_required,
            scheduled_at=event.scheduled_at,
            end_at=event.end_at,
            status=self._status_for_read(event),
            agenda=event.agenda,
            note_text=event.notes,
            notes=self._note_reads(event),
            attendees=event.attendees or [],
            attendee_emails=attendee_emails,
            recurrence_rule_id=event.recurrence_rule_id,
            created_by_id=event.created_by_id,
            created_by_name=event.created_by_name,
            completed_at=event.completed_at,
            created_at=event.created_at,
            updated_at=event.updated_at,
            custom_field_values=self.custom_fields.record_values("governance_reviews", event.id),
            decisions=[self._decision_read(item) for item in event.decisions],
            action_items=[self._action_item_read(item) for item in event.action_items],
            generated_outputs=[],
        )

    def _calendar_item(self, event: GovernanceEventRead) -> GovernanceCalendarItemRead:
        return GovernanceCalendarItemRead(
            id=f"governance:{event.id}",
            kind="governance",
            source_record_id=event.id,
            source_record_type="governance_event",
            account_id=event.account_id or "",
            account_name=event.account_name,
            owner_id=event.owner_id,
            date=event.scheduled_at,
            title=f"{event.governance_type} - {event.account_name}",
            detail=event.agenda or event.note_text or "Governance event",
            status=event.status,
            route=f"/accounts/{event.account_id}?tab=governance" if event.account_id else f"/governance?selected={event.id}",
        )

    def _decision_read(self, decision: GovernanceDecision) -> GovernanceDecisionRead:
        return GovernanceDecisionRead(
            id=decision.id,
            governance_event_id=decision.governance_event_id,
            event_id=decision.governance_event_id,
            decision_text=decision.decision_text,
            owner_id=decision.owner_id,
            owner_name=decision.owner_name,
            source="manual",
            timeline_entry_id=decision.timeline_entry_id,
            created_at=decision.created_at,
        )

    def _action_item_read(self, item: GovernanceActionItem) -> GovernanceActionItemRead:
        return GovernanceActionItemRead(
            id=item.id,
            governance_event_id=item.governance_event_id,
            event_id=item.governance_event_id,
            title=item.title,
            owner_id=item.owner_id,
            owner_name=item.owner_name,
            owner_email=item.owner_email,
            due_at=item.due_at,
            due_date=item.due_at,
            status=item.status,
            priority=item.priority,
            source="manual",
            completed_at=item.completed_at,
            completed_by_id=item.completed_by_id,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    def _note_reads(self, event: GovernanceEvent) -> list:
        if not event.notes:
            return []
        return [
            {
                "id": f"{event.id}:note",
                "event_id": event.id,
                "body": event.notes,
                "author_id": event.created_by_id,
                "author_name": event.created_by_name,
                "source": "manual",
                "created_at": event.completed_at or event.updated_at,
                "updated_at": event.updated_at,
            }
        ]

    def _generated_output_read(
        self,
        event: GovernanceEvent,
        actor: User,
        output_type: str,
        content: str,
        source_modules: list[str],
        *,
        citations: list[GovernanceSourceCitation] | None = None,
    ) -> GovernanceGeneratedOutputRead:
        output_id = f"{event.id}:{output_type}:{int(datetime.now(timezone.utc).timestamp())}"
        source_citations = citations if citations is not None else event.source_citations
        return GovernanceGeneratedOutputRead(
            id=output_id,
            event_id=event.id,
            output_type=output_type,
            generation_method="deterministic",
            status="generated",
            content=content,
            disclaimer="Generated governance preparation is advisory, source-backed where possible, and must be reviewed by a human before use.",
            source_filter_metadata={"source_modules": source_modules},
            provider_metadata=None,
            created_by_id=actor.id,
            created_by_name=actor.full_name,
            created_at=datetime.now(timezone.utc),
            citations=[self._generated_citation_read(item, output_id) for item in source_citations],
        )

    @staticmethod
    def _generated_citation_read(citation: GovernanceSourceCitation, output_id: str) -> GovernanceGeneratedOutputCitationRead:
        return GovernanceGeneratedOutputCitationRead(
            id=citation.id,
            output_id=output_id,
            source_type=citation.source_module,
            source_id=citation.source_entity_id or citation.governance_event_id,
            source_title=citation.label,
            source_url=citation.source_route,
            snippet=citation.excerpt,
            label=citation.label,
            excerpt=citation.excerpt,
            source_route=citation.source_route,
            source_timestamp=citation.created_at,
            created_at=citation.created_at,
        )

    def _decision_from_payload(self, event: GovernanceEvent, payload: GovernanceDecisionCreateRequest, current_user: User) -> GovernanceDecision:
        owner = self.repository.get_user(payload.owner_id) if payload.owner_id else None
        owner_name = owner.full_name if owner else payload.owner_name or current_user.full_name
        return GovernanceDecision(governance_event_id=event.id, decision_text=payload.decision_text, owner_id=owner.id if owner else payload.owner_id, owner_name=owner_name)

    def _action_item_from_payload(self, event: GovernanceEvent, payload: GovernanceActionItemCreateRequest, current_user: User) -> GovernanceActionItem:
        owner = self.repository.get_user(payload.owner_id) if payload.owner_id else None
        owner_email = str(payload.owner_email).lower() if payload.owner_email else None
        owner_name = owner.full_name if owner else payload.owner_name or owner_email or current_user.full_name
        return GovernanceActionItem(
            governance_event_id=event.id,
            title=payload.title,
            owner_id=owner.id if owner else payload.owner_id,
            owner_name=owner_name,
            owner_email=owner_email,
            due_at=payload.due_at or payload.due_date,
            priority=payload.priority,
        )

    @staticmethod
    def _event_attendees(attendees: list[str], attendee_emails: list) -> list[str]:
        emails = [str(email).strip().lower() for email in attendee_emails if str(email).strip()]
        if emails:
            return list(dict.fromkeys(emails))
        return attendees or []

    @staticmethod
    def _event_deduplication_key(source: str, account_id: str, governance_type: str, scheduled_at: datetime) -> str:
        return f"{source}:{account_id}:{governance_type}:{scheduled_at.isoformat()}"

    def _refresh_event_deduplication_key(self, event: GovernanceEvent, updates: dict) -> None:
        if not {"account_id", "governance_type", "scheduled_at"}.intersection(updates):
            return
        account_id = updates.get("account_id", event.account_id)
        governance_type = updates.get("governance_type", event.governance_type)
        scheduled_at = updates.get("scheduled_at", event.scheduled_at)
        if not account_id or not governance_type or not scheduled_at:
            return
        next_key = self._event_deduplication_key(event.source, account_id, governance_type, scheduled_at)
        existing = self.repository.get_event_by_deduplication_key(next_key)
        if existing is not None and existing.id != event.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A governance event already exists for this account, governance type, and scheduled time.",
            )
        event.deduplication_key = next_key

    @staticmethod
    def _attendee_emails(attendees: list[str] | None) -> list[str]:
        return [item for item in (attendees or []) if "@" in item]

    @staticmethod
    def _status_for_read(event: GovernanceEvent) -> str:
        if event.status in {"completed", "cancelled", "review_required"}:
            return event.status
        scheduled_at = event.scheduled_at
        if scheduled_at and scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        if scheduled_at and scheduled_at < datetime.now(timezone.utc):
            return "overdue"
        return "upcoming" if event.status == "scheduled" else event.status

    def _update_next_governance(self, account) -> None:
        if not account:
            return
        account.next_governance_at = self.repository.next_governance_date(account.id, datetime.now(timezone.utc))

    def _get_rule_or_404(self, rule_id: str) -> GovernanceRecurrenceRule:
        rule = self.repository.get_recurrence_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Governance recurrence rule was not found")
        return rule

    def _get_user_or_404(self, user_id: str | None) -> User:
        if not user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User was not found")
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User was not found")
        return user

    def _require_event_view(self, user: User, event: GovernanceEvent) -> None:
        self.access.require_module_permission(user, "governance_reviews", "view")
        if not self._can_view_event(user, event):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this governance event")

    def _require_event_update(self, user: User, event: GovernanceEvent) -> None:
        self.access.require_module_permission(user, "governance_reviews", "update")
        if self.access.can_update_portfolio_accounts(user) or event.owner_id == user.id:
            return
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        if account and self.access.can_update_account(user, account):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this governance event")

    def _can_view_event(self, user: User, event: GovernanceEvent) -> bool:
        if self.access.can_view_portfolio(user):
            return True
        if event.owner_id == user.id:
            return True
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        return bool(account and self.access.can_view_account(user, account))

    def _write_governance_timeline(
        self,
        event: GovernanceEvent,
        actor: User,
        action: str,
        description: str | None = None,
        *,
        source_record_id: str | None = None,
        source_record_type: str = "governance",
    ):
        if not event.account_id:
            return None
        return self.timeline.add_account_event(
            account_id=event.account_id,
            engagement_id=event.engagement_id,
            event_type="governance_event",
            module="governance",
            title=f"{event.governance_type} {action}",
            description=description or event.agenda or f"Governance event {action}.",
            actor=actor,
            source_record_id=source_record_id or event.id,
            source_record_type=source_record_type,
            source_record_route=f"/governance?selected={event.id}",
        )

    def _ensure_citation(self, event: GovernanceEvent, source_module: str, source_entity_type: str, source_entity_id: str | None, source_route: str | None, label: str, excerpt: str) -> GovernanceSourceCitation:
        citation = GovernanceSourceCitation(governance_event_id=event.id, source_module=source_module, source_entity_type=source_entity_type, source_entity_id=source_entity_id, source_route=source_route, label=label, excerpt=excerpt)
        self.repository.add_citation(citation)
        return citation

    @staticmethod
    def _event_snapshot(event: GovernanceEvent) -> dict:
        return {
            "account_id": event.account_id,
            "governance_type": event.governance_type,
            "status": event.status,
            "scheduled_at": event.scheduled_at.isoformat() if event.scheduled_at else None,
            "owner_id": event.owner_id,
        }

    def _evaluate_alerts_for_account(self, account_id: str | None) -> None:
        if not account_id:
            return
        from app.services.alerts import AlertsService

        AlertsService(self.db).evaluate_for_account(account_id)

    @staticmethod
    def _add_cadence(start: datetime, cadence: str, step: int) -> datetime:
        if cadence == "weekly":
            from datetime import timedelta
            return start + timedelta(weeks=step)
        if cadence == "monthly":
            return GovernanceService._add_months(start, step)
        if cadence == "quarterly":
            return GovernanceService._add_months(start, step * 3)
        return GovernanceService._add_months(start, step * 12)

    @staticmethod
    def _add_months(value: datetime, months: int) -> datetime:
        month = value.month - 1 + months
        year = value.year + month // 12
        month = month % 12 + 1
        day = min(value.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return value.replace(year=year, month=month, day=day)
