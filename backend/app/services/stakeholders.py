from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Stakeholder, StakeholderInteraction, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.stakeholders import StakeholderRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    MessageResponse,
    StakeholderCreateRequest,
    StakeholderInteractionCreateRequest,
    StakeholderInteractionPageRead,
    StakeholderInteractionRead,
    StakeholderOrgChartEdgeRead,
    StakeholderOrgChartNodeRead,
    StakeholderOrgChartRead,
    StakeholderPageRead,
    StakeholderRead,
    StakeholderUpdateRequest,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES
from app.services.audit import AuditService
from app.services.stakeholder_gap_service import StakeholderGapService
from app.services.stakeholder_config import StakeholderConfigService
from app.services.timeline import TimelineService
from app.services.user_management import page_count


STAKEHOLDER_MODULE = "stakeholder_relationship"
UNMAPPED_STAKEHOLDERS_NODE_ID = "unmapped_stakeholders"
RELATIONSHIP_CHANGE_FIELDS = {
    "reports_to_stakeholder_id",
    "role",
    "influence",
    "relationship_strength",
    "sentiment",
    "political_risk",
}


class StakeholderService:
    def __init__(self, db: Session) -> None:
        self.repository = StakeholderRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.gaps = StakeholderGapService(db)
        self.config = StakeholderConfigService(db)

    def list_for_account(
        self,
        account_id: str,
        current_user: User,
        *,
        engagement_id: str | None = None,
        role: str | None = None,
        sentiment: str | None = None,
        political_risk: str | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> StakeholderPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=STAKEHOLDER_MODULE)
        if engagement_id:
            self._ensure_engagement_belongs_to_account(engagement_id, account_id)
        items, total = self.repository.list_for_account(
            account_id=account_id,
            engagement_id=engagement_id,
            role=role,
            sentiment=sentiment,
            political_risk=political_risk,
            status_filter=status_filter,
            search=search,
            page=page,
            page_size=page_size,
        )
        return StakeholderPageRead(
            items=[self._read(item, current_user, account) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def create(self, account_id: str, payload: StakeholderCreateRequest, current_user: User) -> StakeholderRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=STAKEHOLDER_MODULE)
        if payload.engagement_id:
            self._ensure_engagement_belongs_to_account(payload.engagement_id, account_id)
        if payload.reports_to_stakeholder_id:
            self._get_report_target_or_404(payload.reports_to_stakeholder_id, account_id)
        self.config.require_active_role(payload.role)

        stakeholder = Stakeholder(
            account_id=account_id,
            engagement_id=payload.engagement_id,
            reports_to_stakeholder_id=payload.reports_to_stakeholder_id,
            name=payload.name,
            title=payload.title,
            company=payload.company,
            email=str(payload.email) if payload.email else None,
            phone=payload.phone,
            linkedin_url=payload.linkedin_url,
            role=payload.role,
            influence=payload.influence,
            relationship_strength=payload.relationship_strength,
            sentiment=payload.sentiment,
            political_risk=payload.political_risk,
            status=payload.status,
            notes=payload.notes,
            last_interaction_at=payload.last_interaction_at,
            is_sensitive=payload.is_sensitive,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save(stakeholder)
        snapshot = self._snapshot(stakeholder)
        self.audit.log(
            module=STAKEHOLDER_MODULE,
            action="create",
            entity_type="stakeholder",
            entity_id=stakeholder.id,
            actor=current_user,
            after_value=snapshot,
        )
        self._emit_timeline(
            stakeholder,
            event_type="stakeholder_added",
            title=f"Stakeholder added: {stakeholder.name}",
            description=f"{current_user.full_name} added {stakeholder.name} as {stakeholder.role}.",
            actor=current_user,
            after_value=snapshot,
        )
        self.gaps.recalculate_after_stakeholder_change(account_id)
        self.repository.commit()
        return self._read(stakeholder, current_user, account)

    def get(self, stakeholder_id: str, current_user: User) -> StakeholderRead:
        stakeholder = self._get_or_404(stakeholder_id)
        account = self._get_account_or_404(stakeholder.account_id)
        self.access.require_account_view(current_user, account, module=STAKEHOLDER_MODULE)
        return self._read(stakeholder, current_user, account)

    def org_chart(self, account_id: str, current_user: User) -> StakeholderOrgChartRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=STAKEHOLDER_MODULE)
        stakeholders = self.repository.list_org_chart_stakeholders(account_id)
        stakeholder_ids = {stakeholder.id for stakeholder in stakeholders}
        nodes: list[StakeholderOrgChartNodeRead] = []
        edges: list[StakeholderOrgChartEdgeRead] = []
        has_unmapped = False

        for stakeholder in stakeholders:
            stakeholder_redacted = stakeholder.is_sensitive and not self._can_view_sensitive_fields(current_user, account)
            parent = self.repository.get(stakeholder.reports_to_stakeholder_id) if stakeholder.reports_to_stakeholder_id else None
            parent_redacted = bool(parent and parent.is_sensitive and not self._can_view_sensitive_fields(current_user, account))
            parent_id = stakeholder.reports_to_stakeholder_id if stakeholder.reports_to_stakeholder_id in stakeholder_ids and not stakeholder_redacted and not parent_redacted else None
            if parent_id is None:
                if stakeholder_redacted:
                    parent_id = None
                else:
                    parent_id = UNMAPPED_STAKEHOLDERS_NODE_ID
                    has_unmapped = True
                    edges.append(
                        StakeholderOrgChartEdgeRead(
                            source=UNMAPPED_STAKEHOLDERS_NODE_ID,
                            target=stakeholder.id,
                            relationship_type="unmapped",
                        )
                    )
            else:
                edges.append(
                    StakeholderOrgChartEdgeRead(
                        source=parent_id,
                        target=stakeholder.id,
                        relationship_type="reports_to",
                    )
                )
            nodes.append(self._org_chart_node(stakeholder, current_user, account, parent_id=parent_id))

        if has_unmapped:
            nodes.insert(
                0,
                StakeholderOrgChartNodeRead(
                    id=UNMAPPED_STAKEHOLDERS_NODE_ID,
                    name="Unmapped Stakeholders",
                    title=None,
                    linkedin_url=None,
                    role="group",
                    influence_level=None,
                    relationship_strength=None,
                    sentiment=None,
                    political_risk=None,
                    parent_id=None,
                ),
            )

        return StakeholderOrgChartRead(nodes=nodes, edges=edges)

    def list_interactions(
        self,
        stakeholder_id: str,
        current_user: User,
        *,
        page: int = 1,
        page_size: int = 10,
    ) -> StakeholderInteractionPageRead:
        stakeholder = self._get_or_404(stakeholder_id)
        account = self._get_account_or_404(stakeholder.account_id)
        self.access.require_account_view(current_user, account, module=STAKEHOLDER_MODULE)
        items, total = self.repository.list_interactions(stakeholder.id, page=page, page_size=page_size)
        return StakeholderInteractionPageRead(
            items=[self._interaction_read(item, current_user, account) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def create_interaction(
        self,
        stakeholder_id: str,
        payload: StakeholderInteractionCreateRequest,
        current_user: User,
    ) -> StakeholderInteractionRead:
        stakeholder = self._get_or_404(stakeholder_id)
        account = self._get_account_or_404(stakeholder.account_id)
        self.access.require_account_update(current_user, account, module=STAKEHOLDER_MODULE)

        before_relationship = self._relationship_snapshot(stakeholder)
        if payload.sentiment_after is not None:
            stakeholder.sentiment = payload.sentiment_after
        if payload.relationship_strength_after is not None:
            stakeholder.relationship_strength = payload.relationship_strength_after
        stakeholder.last_interaction_at = self._latest_interaction_at(stakeholder.last_interaction_at, payload.interaction_date)
        stakeholder.updated_by_id = current_user.id
        after_relationship = self._relationship_snapshot(stakeholder)
        before_changes, after_changes = self._relationship_changes(before_relationship, after_relationship)

        interaction = StakeholderInteraction(
            stakeholder_id=stakeholder.id,
            account_id=stakeholder.account_id,
            engagement_id=stakeholder.engagement_id,
            interaction_type=payload.interaction_type,
            subject=self._summary_subject(payload.summary),
            description=payload.summary,
            outcome=payload.outcome,
            sentiment=payload.sentiment_after,
            relationship_strength=payload.relationship_strength_after,
            interaction_at=payload.interaction_date,
            is_sensitive=stakeholder.is_sensitive,
            metadata_json={
                "changed_fields": list(after_changes),
                "before": before_changes or None,
                "after": after_changes or None,
            },
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.save_interaction(interaction)

        self.audit.log(
            module=STAKEHOLDER_MODULE,
            action="add_interaction",
            entity_type="stakeholder_interaction",
            entity_id=interaction.id,
            actor=current_user,
            before_value=before_changes or None,
            after_value=self._interaction_snapshot(interaction),
        )
        self._emit_interaction_timeline(
            stakeholder,
            interaction,
            actor=current_user,
            before_value=before_changes or None,
            after_value=after_changes or None,
        )
        self.gaps.recalculate_after_stakeholder_change(stakeholder.account_id)
        self.repository.commit()
        return self._interaction_read(interaction, current_user, account)

    def update(self, stakeholder_id: str, payload: StakeholderUpdateRequest, current_user: User) -> StakeholderRead:
        stakeholder = self._get_or_404(stakeholder_id)
        account = self._get_account_or_404(stakeholder.account_id)
        self.access.require_account_update(current_user, account, module=STAKEHOLDER_MODULE)
        before = self._snapshot(stakeholder)

        updates = payload.model_dump(exclude_unset=True)
        if "engagement_id" in updates and updates["engagement_id"]:
            self._ensure_engagement_belongs_to_account(updates["engagement_id"], stakeholder.account_id)
        if "reports_to_stakeholder_id" in updates and updates["reports_to_stakeholder_id"]:
            self._ensure_valid_reports_to(stakeholder, updates["reports_to_stakeholder_id"])
        if "role" in updates and updates["role"]:
            self.config.require_active_role(updates["role"])
        for field, value in updates.items():
            if field == "email" and value is not None:
                value = str(value)
            setattr(stakeholder, field, value)
        stakeholder.updated_by_id = current_user.id
        self.repository.flush()

        after = self._snapshot(stakeholder)
        relationship_changed = any(before.get(field) != after.get(field) for field in RELATIONSHIP_CHANGE_FIELDS)
        self.audit.log(
            module=STAKEHOLDER_MODULE,
            action="update",
            entity_type="stakeholder",
            entity_id=stakeholder.id,
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        self._emit_timeline(
            stakeholder,
            event_type="stakeholder_updated",
            title=f"Stakeholder updated: {stakeholder.name}",
            description=f"{current_user.full_name} updated stakeholder details for {stakeholder.name}.",
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        if relationship_changed:
            self._emit_timeline(
                stakeholder,
                event_type="relationship_changed",
                title=f"Relationship changed: {stakeholder.name}",
                description=f"{current_user.full_name} updated relationship attributes for {stakeholder.name}.",
                actor=current_user,
                before_value={field: before.get(field) for field in RELATIONSHIP_CHANGE_FIELDS},
                after_value={field: after.get(field) for field in RELATIONSHIP_CHANGE_FIELDS},
            )
        self.gaps.recalculate_after_stakeholder_change(stakeholder.account_id)
        self.repository.commit()
        return self._read(stakeholder, current_user, account)

    def delete(self, stakeholder_id: str, current_user: User) -> MessageResponse:
        stakeholder = self._get_or_404(stakeholder_id)
        account = self._get_account_or_404(stakeholder.account_id)
        self.access.require_account_update(current_user, account, module=STAKEHOLDER_MODULE)
        before = self._snapshot(stakeholder)
        stakeholder.status = "inactive"
        stakeholder.archived_at = datetime.now(timezone.utc)
        stakeholder.updated_by_id = current_user.id
        after = self._snapshot(stakeholder)
        self.audit.log(
            module=STAKEHOLDER_MODULE,
            action="archive",
            entity_type="stakeholder",
            entity_id=stakeholder.id,
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        self._emit_timeline(
            stakeholder,
            event_type="stakeholder_archived",
            title=f"Stakeholder archived: {stakeholder.name}",
            description=f"{current_user.full_name} archived stakeholder {stakeholder.name}.",
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        self.gaps.recalculate_after_stakeholder_change(stakeholder.account_id)
        self.repository.commit()
        return MessageResponse(message="Stakeholder archived successfully")

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_or_404(self, stakeholder_id: str) -> Stakeholder:
        stakeholder = self.repository.get(stakeholder_id)
        if stakeholder is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stakeholder was not found")
        return stakeholder

    def _ensure_engagement_belongs_to_account(self, engagement_id: str, account_id: str) -> None:
        engagement = self.repository.get_engagement(engagement_id)
        if engagement is None or engagement.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        if engagement.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Engagement does not belong to this account")

    def _get_report_target_or_404(self, stakeholder_id: str, account_id: str) -> Stakeholder:
        target = self.repository.get(stakeholder_id)
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reporting stakeholder was not found")
        if target.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reporting stakeholder must belong to the same account")
        return target

    def _ensure_valid_reports_to(self, stakeholder: Stakeholder, reports_to_id: str) -> None:
        if reports_to_id == stakeholder.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stakeholder cannot report to themselves")
        target = self._get_report_target_or_404(reports_to_id, stakeholder.account_id)
        visited = {stakeholder.id}
        current: Stakeholder | None = target
        while current is not None:
            if current.id in visited:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reporting hierarchy cannot contain a cycle")
            visited.add(current.id)
            current = self.repository.get(current.reports_to_stakeholder_id) if current.reports_to_stakeholder_id else None

    def _can_view_sensitive_fields(self, user: User, account: Account) -> bool:
        if user.role in GLOBAL_EDIT_ROLES:
            return True
        return self.rbac.role_has_permission(user.role, STAKEHOLDER_MODULE, "update") and self.access.can_update_account(user, account)

    def _read(self, stakeholder: Stakeholder, user: User, account: Account) -> StakeholderRead:
        redacted = stakeholder.is_sensitive and not self._can_view_sensitive_fields(user, account)
        read = StakeholderRead.model_validate(stakeholder)
        if not redacted:
            return read.model_copy(update={"sensitive_fields_redacted": False})
        return read.model_copy(update={"email": None, "phone": None, "linkedin_url": None, "notes": None, "sensitive_fields_redacted": True})

    def _interaction_read(self, interaction: StakeholderInteraction, user: User, account: Account) -> StakeholderInteractionRead:
        redacted = interaction.is_sensitive and not self._can_view_sensitive_fields(user, account)
        return StakeholderInteractionRead(
            id=interaction.id,
            stakeholder_id=interaction.stakeholder_id,
            account_id=interaction.account_id,
            engagement_id=interaction.engagement_id,
            interaction_type=interaction.interaction_type,
            interaction_date=interaction.interaction_at,
            summary=None if redacted else interaction.description or interaction.subject,
            outcome=None if redacted else interaction.outcome,
            sentiment_after=interaction.sentiment,
            relationship_strength_after=interaction.relationship_strength,
            sensitive_fields_redacted=redacted,
            created_by_id=interaction.created_by_id,
            created_by_name=interaction.created_by_name,
            created_at=interaction.created_at,
            updated_at=interaction.updated_at,
        )

    def _org_chart_node(self, stakeholder: Stakeholder, user: User, account: Account, *, parent_id: str | None) -> StakeholderOrgChartNodeRead:
        redacted = stakeholder.is_sensitive and not self._can_view_sensitive_fields(user, account)
        return StakeholderOrgChartNodeRead(
            id=stakeholder.id,
            name="Sensitive Stakeholder" if redacted else stakeholder.name,
            title=None if redacted else stakeholder.title,
            linkedin_url=None if redacted else stakeholder.linkedin_url,
            role=stakeholder.role,
            influence_level=stakeholder.influence,
            relationship_strength=stakeholder.relationship_strength,
            sentiment=stakeholder.sentiment,
            political_risk=stakeholder.political_risk,
            parent_id=parent_id,
            sensitive_fields_redacted=redacted,
        )

    def _emit_timeline(
        self,
        stakeholder: Stakeholder,
        *,
        event_type: str,
        title: str,
        description: str,
        actor: User,
        before_value: dict | None = None,
        after_value: dict | None = None,
    ) -> None:
        self.timeline.add_account_event(
            account_id=stakeholder.account_id,
            engagement_id=stakeholder.engagement_id,
            event_type=event_type,
            module="stakeholder_relationship",
            title=title,
            description=description,
            actor=actor,
            source_record_id=stakeholder.id,
            source_record_type="stakeholder",
            source_record_route=f"/accounts/{stakeholder.account_id}?tab=stakeholders&stakeholder={stakeholder.id}",
            before_value=before_value,
            after_value=after_value,
            metadata={"stakeholder_role": stakeholder.role},
            is_sensitive=stakeholder.is_sensitive,
        )

    def _emit_interaction_timeline(
        self,
        stakeholder: Stakeholder,
        interaction: StakeholderInteraction,
        *,
        actor: User,
        before_value: dict | None = None,
        after_value: dict | None = None,
    ) -> None:
        self.timeline.add_account_event(
            account_id=stakeholder.account_id,
            engagement_id=stakeholder.engagement_id,
            event_type="stakeholder_interaction_added",
            module=STAKEHOLDER_MODULE,
            title=f"Stakeholder interaction added: {stakeholder.name}",
            description=f"{actor.full_name} logged a {interaction.interaction_type} interaction for {stakeholder.name}.",
            actor=actor,
            source_record_id=interaction.id,
            source_record_type="stakeholder_interaction",
            source_record_route=(
                f"/accounts/{stakeholder.account_id}?tab=stakeholders"
                f"&stakeholder={stakeholder.id}&interaction={interaction.id}"
            ),
            before_value=before_value,
            after_value=after_value,
            metadata={
                "stakeholder_id": stakeholder.id,
                "stakeholder_role": stakeholder.role,
                "interaction_type": interaction.interaction_type,
            },
            is_sensitive=stakeholder.is_sensitive or interaction.is_sensitive,
        )

    @staticmethod
    def _snapshot(stakeholder: Stakeholder) -> dict:
        return {
            "id": stakeholder.id,
            "account_id": stakeholder.account_id,
            "engagement_id": stakeholder.engagement_id,
            "reports_to_stakeholder_id": stakeholder.reports_to_stakeholder_id,
            "name": stakeholder.name,
            "title": stakeholder.title,
            "company": stakeholder.company,
            "linkedin_url": stakeholder.linkedin_url,
            "role": stakeholder.role,
            "influence": stakeholder.influence,
            "relationship_strength": stakeholder.relationship_strength,
            "sentiment": stakeholder.sentiment,
            "political_risk": stakeholder.political_risk,
            "status": stakeholder.status,
            "last_interaction_at": stakeholder.last_interaction_at.isoformat() if stakeholder.last_interaction_at else None,
            "is_sensitive": stakeholder.is_sensitive,
            "archived_at": stakeholder.archived_at.isoformat() if stakeholder.archived_at else None,
        }

    @staticmethod
    def _interaction_snapshot(interaction: StakeholderInteraction) -> dict:
        return {
            "id": interaction.id,
            "stakeholder_id": interaction.stakeholder_id,
            "account_id": interaction.account_id,
            "engagement_id": interaction.engagement_id,
            "interaction_type": interaction.interaction_type,
            "interaction_date": interaction.interaction_at.isoformat(),
            "summary": interaction.description or interaction.subject,
            "outcome": interaction.outcome,
            "sentiment_after": interaction.sentiment,
            "relationship_strength_after": interaction.relationship_strength,
            "metadata": interaction.metadata_json,
        }

    @staticmethod
    def _relationship_snapshot(stakeholder: Stakeholder) -> dict:
        return {
            "sentiment": stakeholder.sentiment,
            "relationship_strength": stakeholder.relationship_strength,
        }

    @staticmethod
    def _relationship_changes(before: dict, after: dict) -> tuple[dict, dict]:
        before_changes: dict = {}
        after_changes: dict = {}
        for field in ("sentiment", "relationship_strength"):
            if before.get(field) != after.get(field):
                before_changes[field] = before.get(field)
                after_changes[field] = after.get(field)
        return before_changes, after_changes

    @staticmethod
    def _latest_interaction_at(current: datetime | None, candidate: datetime) -> datetime:
        if current is None:
            return candidate
        current_comparable = current if current.tzinfo is not None else current.replace(tzinfo=timezone.utc)
        candidate_comparable = candidate if candidate.tzinfo is not None else candidate.replace(tzinfo=timezone.utc)
        return candidate if candidate_comparable >= current_comparable else current

    @staticmethod
    def _summary_subject(summary: str) -> str:
        if len(summary) <= 220:
            return summary
        return f"{summary[:217]}..."
