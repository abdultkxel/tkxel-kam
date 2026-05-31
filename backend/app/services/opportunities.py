from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Opportunity,
    OpportunityActionItem,
    OpportunityDecision,
    OpportunityStageHistory,
    OpportunityType,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.opportunities import OpportunityRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    MessageResponse,
    OpportunityActionItemCreateRequest,
    OpportunityActionItemPageRead,
    OpportunityActionItemRead,
    OpportunityActionItemUpdateRequest,
    OpportunityCreateRequest,
    OpportunityDecisionCreateRequest,
    OpportunityDecisionPageRead,
    OpportunityDecisionRead,
    OpportunityPageRead,
    OpportunityPipelineTotalsRead,
    OpportunityRead,
    OpportunityStageDefinitionRead,
    OpportunityStageHistoryRead,
    OpportunityStageTransitionRead,
    OpportunityStageTransitionRequest,
    OpportunityTypeCreateRequest,
    OpportunityTypePageRead,
    OpportunityTypeRead,
    OpportunityTypeUpdateRequest,
    OpportunityUpdateRequest,
)
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

OPPORTUNITY_MODULE = "opportunity_management"
OPPORTUNITY_STAGES = ("Identified", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost")
TERMINAL_STAGES = {"Won", "Lost"}


def field_error(field: str, message: str, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]})


class OpportunityService:
    def __init__(self, db: Session) -> None:
        self.repository = OpportunityRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_opportunities(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
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
    ) -> OpportunityPageRead:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "view")
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        if stage and stage not in OPPORTUNITY_STAGES:
            raise field_error("stage", "Target stage is not valid.")
        items, total = self.repository.list_opportunities(
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
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        totals = self.repository.pipeline_totals(
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
        return OpportunityPageRead(
            items=[self._opportunity_read(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
            totals=OpportunityPipelineTotalsRead(**totals),
        )

    def get_opportunity(self, opportunity_id: str, current_user: User) -> OpportunityRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_view(current_user, opportunity)
        return self._opportunity_read(opportunity)

    def create_opportunity(self, payload: OpportunityCreateRequest, current_user: User) -> OpportunityRead:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "create")
        account = self._get_account_or_404(payload.account_id)
        self.access.require_account_view(current_user, account, module=OPPORTUNITY_MODULE)
        engagement = self._validate_engagement(payload.engagement_id, payload.account_id)
        opportunity_type = self._get_active_type_or_404(payload.type_id)
        owner = self._get_active_user(payload.owner_id, "owner_id")
        self._ensure_active_stage(payload.stage)

        opportunity = Opportunity(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            type_id=opportunity_type.id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            owner_email=owner.email,
            name=payload.name,
            service_line=payload.service_line,
            value=payload.value,
            currency=payload.currency,
            stage=payload.stage,
            next_step=payload.next_step,
            target_date=payload.target_date,
            source_context=payload.source_context,
            source_record_id=payload.source_record_id,
            source_record_type=payload.source_record_type,
            source_record_route=payload.source_record_route,
            outcome_reason=payload.outcome_reason,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            updated_by_id=current_user.id,
            updated_by_name=current_user.full_name,
        )
        self.repository.save_opportunity(opportunity)
        for action_payload in payload.action_items:
            self.repository.add_action_item(self._action_item_from_payload(opportunity, action_payload, current_user))

        timeline_entry = self._write_opportunity_timeline(
            opportunity,
            current_user,
            title=f"Opportunity created: {opportunity.name}",
            description=f"{opportunity.name} created in {opportunity.stage} for {opportunity.account.name}.",
            before_value=None,
            after_value=self._opportunity_snapshot(opportunity),
        )
        history = self.repository.add_stage_history(
            OpportunityStageHistory(
                opportunity_id=opportunity.id,
                account_id=opportunity.account_id,
                engagement_id=opportunity.engagement_id,
                before_stage=None,
                after_stage=opportunity.stage,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                reason="Opportunity created",
                timeline_entry_id=timeline_entry.id if timeline_entry else None,
            )
        )
        self.audit.log(module=OPPORTUNITY_MODULE, action="create", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, after_value=self._opportunity_snapshot(opportunity))
        self.repository.commit()
        return self._opportunity_read(opportunity)

    def update_opportunity(self, opportunity_id: str, payload: OpportunityUpdateRequest, current_user: User) -> OpportunityRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_update(current_user, opportunity)
        if opportunity.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived opportunities must be restored before update")
        before = self._opportunity_snapshot(opportunity)
        updates = payload.model_dump(exclude_unset=True)
        next_stage = updates.pop("stage", None)
        if "engagement_id" in updates:
            engagement = self._validate_engagement(updates["engagement_id"], opportunity.account_id)
            opportunity.engagement_id = engagement.id if engagement else None
            updates.pop("engagement_id")
        if "type_id" in updates and updates["type_id"]:
            opportunity.type_id = self._get_active_type_or_404(updates["type_id"]).id
            updates.pop("type_id")
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"], "owner_id")
            opportunity.owner_id = owner.id
            opportunity.owner_name = owner.full_name
            opportunity.owner_email = owner.email
            updates.pop("owner_id")
        for field, value in updates.items():
            setattr(opportunity, field, value)
        opportunity.updated_by_id = current_user.id
        opportunity.updated_by_name = current_user.full_name
        if next_stage and next_stage != opportunity.stage:
            self._transition_stage(opportunity, next_stage, current_user, reason=None, outcome_reason=opportunity.outcome_reason)
        self.audit.log(module=OPPORTUNITY_MODULE, action="update", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, before_value=before, after_value=self._opportunity_snapshot(opportunity))
        self.repository.commit()
        return self._opportunity_read(opportunity)

    def archive_opportunity(self, opportunity_id: str, current_user: User, reason: str | None = None) -> MessageResponse:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_archive(current_user, opportunity)
        if opportunity.archived_at is not None:
            return MessageResponse(message="Opportunity is already archived")
        before = self._opportunity_snapshot(opportunity)
        opportunity.archived_at = datetime.now(timezone.utc)
        opportunity.archived_by_id = current_user.id
        opportunity.archived_by_name = current_user.full_name
        opportunity.archive_reason = reason or "Opportunity archived"
        opportunity.updated_by_id = current_user.id
        opportunity.updated_by_name = current_user.full_name
        self._write_opportunity_timeline(
            opportunity,
            current_user,
            title=f"Opportunity archived: {opportunity.name}",
            description=opportunity.archive_reason,
            before_value=before,
            after_value=self._opportunity_snapshot(opportunity),
        )
        self.audit.log(module=OPPORTUNITY_MODULE, action="archive", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, before_value=before, after_value=self._opportunity_snapshot(opportunity), reason=opportunity.archive_reason)
        self.repository.commit()
        return MessageResponse(message="Opportunity archived successfully")

    def restore_opportunity(self, opportunity_id: str, current_user: User, reason: str | None = None) -> OpportunityRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_archive(current_user, opportunity)
        if opportunity.archived_at is None:
            return self._opportunity_read(opportunity)
        before = self._opportunity_snapshot(opportunity)
        opportunity.archived_at = None
        opportunity.archived_by_id = None
        opportunity.archived_by_name = None
        opportunity.archive_reason = None
        opportunity.updated_by_id = current_user.id
        opportunity.updated_by_name = current_user.full_name
        restore_reason = reason or "Opportunity restored to active pipeline"
        self._write_opportunity_timeline(
            opportunity,
            current_user,
            title=f"Opportunity restored: {opportunity.name}",
            description=restore_reason,
            before_value=before,
            after_value=self._opportunity_snapshot(opportunity),
        )
        self.audit.log(module=OPPORTUNITY_MODULE, action="restore", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, before_value=before, after_value=self._opportunity_snapshot(opportunity), reason=restore_reason)
        self.repository.commit()
        return self._opportunity_read(opportunity)

    def transition_stage(self, opportunity_id: str, payload: OpportunityStageTransitionRequest, current_user: User) -> OpportunityStageTransitionRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_update(current_user, opportunity)
        if opportunity.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived opportunities must be restored before moving stages")
        history = self._transition_stage(opportunity, payload.stage, current_user, payload.reason, payload.outcome_reason)
        self.repository.commit()
        return OpportunityStageTransitionRead(opportunity=self._opportunity_read(opportunity), history=self._stage_history_read(history))

    def list_stages(self, current_user: User) -> list[OpportunityStageDefinitionRead]:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "view")
        return [OpportunityStageDefinitionRead(id=item.id, slug=item.slug, name=item.name, is_terminal=item.is_terminal, is_active=item.is_active, display_order=item.display_order) for item in self.repository.list_stage_definitions()]

    def list_types(self, current_user: User, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50, require_configure: bool = False) -> OpportunityTypePageRead:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "configure" if require_configure else "view")
        items, total = self.repository.list_types(active_state=active_state, search=search, page=page, page_size=page_size)
        return OpportunityTypePageRead(items=[self._type_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_type(self, payload: OpportunityTypeCreateRequest, current_user: User) -> OpportunityTypeRead:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "configure")
        if self.repository.get_type_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An opportunity type with this slug already exists")
        opportunity_type = OpportunityType(
            slug=payload.slug,
            name=payload.name,
            description=payload.description,
            display_order=payload.display_order,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_type(opportunity_type)
        self.audit.log(module=OPPORTUNITY_MODULE, action="configure_type", entity_type="opportunity_type", entity_id=opportunity_type.id, actor=current_user, after_value=self._type_snapshot(opportunity_type))
        self.repository.commit()
        return self._type_read(opportunity_type)

    def update_type(self, type_id: str, payload: OpportunityTypeUpdateRequest, current_user: User) -> OpportunityTypeRead:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "configure")
        opportunity_type = self._get_type_or_404(type_id)
        before = self._type_snapshot(opportunity_type)
        updates = payload.model_dump(exclude_unset=True)
        if "slug" in updates and updates["slug"] != opportunity_type.slug and self.repository.get_type_by_slug(updates["slug"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An opportunity type with this slug already exists")
        for field, value in updates.items():
            setattr(opportunity_type, field, value)
        opportunity_type.updated_by_id = current_user.id
        self.audit.log(module=OPPORTUNITY_MODULE, action="configure_type", entity_type="opportunity_type", entity_id=opportunity_type.id, actor=current_user, before_value=before, after_value=self._type_snapshot(opportunity_type))
        self.repository.commit()
        return self._type_read(opportunity_type)

    def delete_type(self, type_id: str, current_user: User) -> MessageResponse:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "configure")
        opportunity_type = self._get_type_or_404(type_id)
        if not opportunity_type.is_active:
            return MessageResponse(message="Opportunity type is already inactive")
        before = self._type_snapshot(opportunity_type)
        opportunity_type.is_active = False
        opportunity_type.updated_by_id = current_user.id
        self.audit.log(module=OPPORTUNITY_MODULE, action="deactivate_type", entity_type="opportunity_type", entity_id=opportunity_type.id, actor=current_user, before_value=before, after_value=self._type_snapshot(opportunity_type))
        self.repository.commit()
        return MessageResponse(message="Opportunity type deactivated successfully")

    def list_decisions(self, opportunity_id: str, current_user: User, page: int, page_size: int) -> OpportunityDecisionPageRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_view(current_user, opportunity)
        items, total = self.repository.list_decisions_page(opportunity_id, page, page_size)
        return OpportunityDecisionPageRead(items=[self._decision_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def add_decision(self, opportunity_id: str, payload: OpportunityDecisionCreateRequest, current_user: User) -> OpportunityDecisionRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_update(current_user, opportunity)
        decision = OpportunityDecision(
            opportunity_id=opportunity.id,
            decision_text=payload.decision_text,
            owner_id=payload.owner_id,
            owner_name=payload.owner_name,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        if payload.owner_id:
            owner = self._get_active_user(payload.owner_id, "owner_id")
            decision.owner_id = owner.id
            decision.owner_name = owner.full_name
        self.repository.add_decision(decision)
        timeline_entry = self._write_opportunity_timeline(
            opportunity,
            current_user,
            title=f"Opportunity decision: {opportunity.name}",
            description=decision.decision_text,
            before_value=None,
            after_value={"decision_text": decision.decision_text, "owner_name": decision.owner_name},
            source_record_id=decision.id,
            source_record_type="opportunity_decision",
        )
        decision.timeline_entry_id = timeline_entry.id if timeline_entry else None
        self.audit.log(module=OPPORTUNITY_MODULE, action="decision", entity_type="opportunity_decision", entity_id=decision.id, actor=current_user, after_value={"decision_text": decision.decision_text})
        self.repository.commit()
        return self._decision_read(decision)

    def list_action_items(self, opportunity_id: str, current_user: User, page: int, page_size: int) -> OpportunityActionItemPageRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_view(current_user, opportunity)
        items, total = self.repository.list_action_items_page(opportunity_id, page, page_size)
        return OpportunityActionItemPageRead(items=[self._action_item_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def add_action_item(self, opportunity_id: str, payload: OpportunityActionItemCreateRequest, current_user: User) -> OpportunityActionItemRead:
        opportunity = self._get_opportunity_or_404(opportunity_id)
        self._require_opportunity_update(current_user, opportunity)
        action_item = self.repository.add_action_item(self._action_item_from_payload(opportunity, payload, current_user))
        self.audit.log(module=OPPORTUNITY_MODULE, action="action_item_create", entity_type="opportunity_action_item", entity_id=action_item.id, actor=current_user, after_value={"title": action_item.title, "due_at": action_item.due_at.isoformat()})
        self.repository.commit()
        return self._action_item_read(action_item)

    def update_action_item(self, action_item_id: str, payload: OpportunityActionItemUpdateRequest, current_user: User) -> OpportunityActionItemRead:
        action_item = self.repository.get_action_item(action_item_id)
        if action_item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item was not found")
        self._require_opportunity_update(current_user, action_item.opportunity)
        before = self._action_item_snapshot(action_item)
        updates = payload.model_dump(exclude_unset=True)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"], "owner_id")
            action_item.owner_id = owner.id
            action_item.owner_name = owner.full_name
            action_item.owner_email = owner.email
            updates.pop("owner_id")
        due_at = updates.pop("due_at", None) or updates.pop("due_date", None)
        if due_at:
            action_item.due_at = due_at
        for field, value in updates.items():
            setattr(action_item, field, value)
        if action_item.status == "completed" and action_item.completed_at is None:
            action_item.completed_at = datetime.now(timezone.utc)
            action_item.completed_by_id = current_user.id
        if action_item.status != "completed":
            action_item.completed_at = None
            action_item.completed_by_id = None
        self.audit.log(module=OPPORTUNITY_MODULE, action="action_item_update", entity_type="opportunity_action_item", entity_id=action_item.id, actor=current_user, before_value=before, after_value=self._action_item_snapshot(action_item))
        self.repository.commit()
        return self._action_item_read(action_item)

    def _transition_stage(self, opportunity: Opportunity, stage: str, current_user: User, reason: str | None, outcome_reason: str | None) -> OpportunityStageHistory:
        self._ensure_active_stage(stage)
        if stage == opportunity.stage:
            raise field_error("stage", "Opportunity is already in this stage.")
        before = self._opportunity_snapshot(opportunity)
        before_stage = opportunity.stage
        opportunity.stage = stage
        opportunity.updated_by_id = current_user.id
        opportunity.updated_by_name = current_user.full_name
        if stage in TERMINAL_STAGES:
            opportunity.outcome_reason = outcome_reason or opportunity.outcome_reason
        timeline_entry = self._write_opportunity_timeline(
            opportunity,
            current_user,
            title=f"Opportunity moved: {before_stage} -> {stage}",
            description=reason or f"{opportunity.name} moved from {before_stage} to {stage}.",
            before_value=before,
            after_value=self._opportunity_snapshot(opportunity),
        )
        history = self.repository.add_stage_history(
            OpportunityStageHistory(
                opportunity_id=opportunity.id,
                account_id=opportunity.account_id,
                engagement_id=opportunity.engagement_id,
                before_stage=before_stage,
                after_stage=stage,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                reason=reason or opportunity.outcome_reason,
                timeline_entry_id=timeline_entry.id if timeline_entry else None,
            )
        )
        self.audit.log(module=OPPORTUNITY_MODULE, action="stage_change", entity_type="opportunity", entity_id=opportunity.id, actor=current_user, before_value=before, after_value=self._opportunity_snapshot(opportunity), reason=reason)
        return history

    def _get_opportunity_or_404(self, opportunity_id: str) -> Opportunity:
        opportunity = self.repository.get_opportunity(opportunity_id)
        if opportunity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity was not found")
        return opportunity

    def _get_account_or_404(self, account_id: str):
        account = self.repository.get_account(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _validate_engagement(self, engagement_id: str | None, account_id: str):
        if not engagement_id:
            return None
        engagement = self.repository.get_engagement(engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        if engagement.account_id != account_id:
            raise field_error("engagement_id", "Engagement must belong to the selected account.")
        return engagement

    def _get_active_type_or_404(self, type_id: str) -> OpportunityType:
        opportunity_type = self.repository.get_type(type_id)
        if opportunity_type is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity type was not found")
        if not opportunity_type.is_active:
            raise field_error("type_id", "Opportunity type is inactive.")
        return opportunity_type

    def _get_type_or_404(self, type_id: str) -> OpportunityType:
        opportunity_type = self.repository.get_type(type_id)
        if opportunity_type is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity type was not found")
        return opportunity_type

    def _get_active_user(self, user_id: str, field: str) -> User:
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise field_error(field, "Owner is required.")
        return user

    def _ensure_active_stage(self, stage: str) -> None:
        if stage not in OPPORTUNITY_STAGES:
            raise field_error("stage", "Target stage is not valid.")
        stage_definition = self.repository.get_stage_by_name(stage)
        if stage_definition is None or not stage_definition.is_active:
            raise field_error("stage", "Target stage is not valid.")

    def _require_opportunity_view(self, current_user: User, opportunity: Opportunity) -> None:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "view")
        self.access.require_account_view(current_user, opportunity.account, module=OPPORTUNITY_MODULE)

    def _require_opportunity_update(self, current_user: User, opportunity: Opportunity) -> None:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "update")
        self.access.require_account_view(current_user, opportunity.account, module=OPPORTUNITY_MODULE)

    def _require_opportunity_archive(self, current_user: User, opportunity: Opportunity) -> None:
        self.access.require_module_permission(current_user, OPPORTUNITY_MODULE, "delete")
        self.access.require_account_view(current_user, opportunity.account, module=OPPORTUNITY_MODULE)

    def _action_item_from_payload(self, opportunity: Opportunity, payload: OpportunityActionItemCreateRequest, current_user: User) -> OpportunityActionItem:
        owner_id = payload.owner_id
        owner_name = payload.owner_name
        owner_email = str(payload.owner_email) if payload.owner_email else None
        if owner_id:
            owner = self._get_active_user(owner_id, "owner_id")
            owner_id = owner.id
            owner_name = owner.full_name
            owner_email = owner.email
        if not (owner_name or owner_email):
            owner_id = current_user.id
            owner_name = current_user.full_name
            owner_email = current_user.email
        due_at = payload.due_at or payload.due_date
        if due_at is None:
            raise field_error("due_date", "Action item due date is required.")
        completed_at = datetime.now(timezone.utc) if payload.status == "completed" else None
        return OpportunityActionItem(
            opportunity_id=opportunity.id,
            title=payload.title,
            owner_id=owner_id,
            owner_name=owner_name,
            owner_email=owner_email,
            due_at=due_at,
            status=payload.status,
            priority=payload.priority,
            notes=payload.notes,
            completed_at=completed_at,
            completed_by_id=current_user.id if completed_at else None,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )

    def _write_opportunity_timeline(
        self,
        opportunity: Opportunity,
        actor: User,
        *,
        title: str,
        description: str,
        before_value: dict | None,
        after_value: dict | None,
        source_record_id: str | None = None,
        source_record_type: str | None = None,
    ):
        return self.timeline.add_account_event(
            account_id=opportunity.account_id,
            engagement_id=opportunity.engagement_id,
            event_type="opportunity_event",
            module="opportunity",
            title=title,
            description=description,
            actor=actor,
            source_record_id=source_record_id or opportunity.id,
            source_record_type=source_record_type or "opportunity",
            source_record_route=f"/opportunities?opportunity={opportunity.id}",
            before_value=before_value,
            after_value=after_value,
            metadata={"opportunity_id": opportunity.id, "stage": opportunity.stage, "value": float(opportunity.value)},
        )

    def _opportunity_read(self, opportunity: Opportunity) -> OpportunityRead:
        stage_history = sorted(opportunity.stage_history, key=lambda item: item.created_at, reverse=True)
        decisions = sorted(opportunity.decisions, key=lambda item: item.created_at, reverse=True)
        action_items = sorted(opportunity.action_items, key=lambda item: (item.status == "completed", item.due_at, item.created_at))
        return OpportunityRead(
            id=opportunity.id,
            account_id=opportunity.account_id,
            account_name=opportunity.account.name if opportunity.account else "",
            engagement_id=opportunity.engagement_id,
            engagement_name=opportunity.engagement.name if opportunity.engagement else None,
            type_id=opportunity.type_id,
            type_name=opportunity.type.name if opportunity.type else "",
            type_slug=opportunity.type.slug if opportunity.type else "",
            service_line=opportunity.service_line,
            owner_id=opportunity.owner_id,
            owner_name=opportunity.owner_name,
            owner_email=opportunity.owner_email,
            name=opportunity.name,
            value=float(opportunity.value),
            estimated_value=float(opportunity.value),
            currency=opportunity.currency,
            stage=opportunity.stage,
            next_step=opportunity.next_step,
            target_date=opportunity.target_date,
            close_date=opportunity.target_date,
            source_context=opportunity.source_context,
            source_record_id=opportunity.source_record_id,
            source_record_type=opportunity.source_record_type,
            source_record_route=opportunity.source_record_route,
            outcome_reason=opportunity.outcome_reason,
            archived_at=opportunity.archived_at,
            archived_by_id=opportunity.archived_by_id,
            archived_by_name=opportunity.archived_by_name,
            archive_reason=opportunity.archive_reason,
            created_by_id=opportunity.created_by_id,
            created_by_name=opportunity.created_by_name,
            updated_by_id=opportunity.updated_by_id,
            updated_by_name=opportunity.updated_by_name,
            created_at=opportunity.created_at,
            updated_at=opportunity.updated_at,
            stage_history=[self._stage_history_read(item) for item in stage_history],
            decisions=[self._decision_read(item) for item in decisions],
            action_items=[self._action_item_read(item) for item in action_items],
        )

    @staticmethod
    def _stage_history_read(history: OpportunityStageHistory) -> OpportunityStageHistoryRead:
        return OpportunityStageHistoryRead(
            id=history.id,
            opportunity_id=history.opportunity_id,
            account_id=history.account_id,
            engagement_id=history.engagement_id,
            before_stage=history.before_stage,
            after_stage=history.after_stage,
            actor_id=history.actor_id,
            actor_name=history.actor_name,
            reason=history.reason,
            timeline_entry_id=history.timeline_entry_id,
            created_at=history.created_at,
        )

    @staticmethod
    def _decision_read(decision: OpportunityDecision) -> OpportunityDecisionRead:
        return OpportunityDecisionRead(
            id=decision.id,
            opportunity_id=decision.opportunity_id,
            decision_text=decision.decision_text,
            owner_id=decision.owner_id,
            owner_name=decision.owner_name,
            timeline_entry_id=decision.timeline_entry_id,
            created_by_id=decision.created_by_id,
            created_by_name=decision.created_by_name,
            created_at=decision.created_at,
        )

    @staticmethod
    def _action_item_read(action_item: OpportunityActionItem) -> OpportunityActionItemRead:
        return OpportunityActionItemRead(
            id=action_item.id,
            opportunity_id=action_item.opportunity_id,
            title=action_item.title,
            owner_id=action_item.owner_id,
            owner_name=action_item.owner_name,
            owner_email=action_item.owner_email,
            due_at=action_item.due_at,
            due_date=action_item.due_at,
            status=action_item.status,
            priority=action_item.priority,
            notes=action_item.notes,
            future_task_id=action_item.future_task_id,
            completed_at=action_item.completed_at,
            completed_by_id=action_item.completed_by_id,
            created_by_id=action_item.created_by_id,
            created_by_name=action_item.created_by_name,
            created_at=action_item.created_at,
            updated_at=action_item.updated_at,
        )

    def _type_read(self, opportunity_type: OpportunityType) -> OpportunityTypeRead:
        return OpportunityTypeRead(
            id=opportunity_type.id,
            slug=opportunity_type.slug,
            name=opportunity_type.name,
            description=opportunity_type.description,
            is_active=opportunity_type.is_active,
            display_order=opportunity_type.display_order,
            created_at=opportunity_type.created_at,
            updated_at=opportunity_type.updated_at,
            in_use_count=self.repository.count_opportunities_for_type(opportunity_type.id),
        )

    @staticmethod
    def _opportunity_snapshot(opportunity: Opportunity) -> dict:
        return {
            "id": opportunity.id,
            "account_id": opportunity.account_id,
            "engagement_id": opportunity.engagement_id,
            "type_id": opportunity.type_id,
            "name": opportunity.name,
            "service_line": opportunity.service_line,
            "owner_id": opportunity.owner_id,
            "owner_name": opportunity.owner_name,
            "value": float(opportunity.value),
            "currency": opportunity.currency,
            "stage": opportunity.stage,
            "next_step": opportunity.next_step,
            "target_date": opportunity.target_date.isoformat(),
            "outcome_reason": opportunity.outcome_reason,
            "archived_at": opportunity.archived_at.isoformat() if opportunity.archived_at else None,
        }

    @staticmethod
    def _type_snapshot(opportunity_type: OpportunityType) -> dict:
        return {
            "id": opportunity_type.id,
            "slug": opportunity_type.slug,
            "name": opportunity_type.name,
            "description": opportunity_type.description,
            "is_active": opportunity_type.is_active,
            "display_order": opportunity_type.display_order,
        }

    @staticmethod
    def _action_item_snapshot(action_item: OpportunityActionItem) -> dict:
        return {
            "id": action_item.id,
            "opportunity_id": action_item.opportunity_id,
            "title": action_item.title,
            "owner_id": action_item.owner_id,
            "owner_name": action_item.owner_name,
            "owner_email": action_item.owner_email,
            "due_at": action_item.due_at.isoformat(),
            "status": action_item.status,
            "priority": action_item.priority,
            "notes": action_item.notes,
        }
