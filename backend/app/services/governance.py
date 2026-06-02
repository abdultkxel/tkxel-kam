from datetime import datetime, timezone
from urllib import error, request
import json
import logging

from fastapi import HTTPException, status
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
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.governance import GovernanceRepository
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
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.integrations import IntegrationService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)


class GovernanceService:
    def __init__(self, db: Session) -> None:
        self.repository = GovernanceRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.settings = get_settings()
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))

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
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
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
        event = GovernanceEvent(
            account_id=payload.account_id,
            engagement_id=payload.engagement_id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            governance_type=payload.governance_type,
            source=source,
            deduplication_key=f"{source}:{payload.account_id}:{payload.governance_type}:{payload.scheduled_at.isoformat()}",
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
        self.repository.save_event(event)
        self.custom_fields.save_record_values("governance_reviews", event.id, payload.custom_field_values, current_user, audit_module="governance_reviews")
        self._write_governance_timeline(event, current_user, "scheduled")
        self._mirror_calendar_event(event, current_user)
        self.audit.log(module="governance_reviews", action="create", entity_type="governance_event", entity_id=event.id, actor=current_user, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        self.repository.commit()
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
        if not event.external_event_id and event.source == "manual":
            self._mirror_calendar_event(event, current_user)
        self.audit.log(module="governance_reviews", action="update", entity_type="governance_event", entity_id=event.id, actor=current_user, before_value=before, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        self.repository.commit()
        return self._event_read(event)

    def complete_event(self, event_id: str, current_user: User, payload: GovernanceEventCompleteRequest | None = None) -> GovernanceEventRead:
        event = self._get_event_or_404(event_id)
        self._require_event_update(current_user, event)
        if event.status == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled governance events must be reopened or rescheduled before completion")
        if payload is not None:
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
            for action_payload in payload.action_items:
                self.repository.add_action_item(self._action_item_from_payload(event, action_payload, current_user))
        if not event.notes and not event.decisions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Governance completion requires notes or at least one decision")
        before = self._event_snapshot(event)
        event.status = "completed"
        event.completed_at = datetime.now(timezone.utc)
        self._write_governance_timeline(event, current_user, "completed")
        self.audit.log(module="governance_reviews", action="complete", entity_type="governance_event", entity_id=event.id, actor=current_user, before_value=before, after_value=self._event_snapshot(event))
        self._update_next_governance(event.account)
        self.repository.commit()
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
        self.repository.commit()
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
        if event.external_provider == "google_calendar":
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
        if user.role in GLOBAL_EDIT_ROLES or event.owner_id == user.id:
            return
        account = self.accounts.get_by_id(event.account_id) if event.account_id else None
        if account and self.access.can_update_account(user, account):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this governance event")

    def _can_view_event(self, user: User, event: GovernanceEvent) -> bool:
        if user.role in GLOBAL_VIEW_ROLES:
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
