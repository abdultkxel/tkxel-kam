from datetime import datetime, timezone
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, AccountPlan, AccountPlanAction, AccountPlanVersion, User
from app.repositories.account_planning import AccountPlanningRepository
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    AccountPlanActionRead,
    AccountPlanRead,
    AccountPlanUpsertRequest,
    AccountPlanVersionPageRead,
    AccountPlanVersionRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

ACCOUNT_PLANNING_MODULE = "account_planning"


@dataclass(frozen=True)
class AccountPlanActionFilters:
    search: str | None = None
    owner_id: str | None = None
    status: str | None = None
    priority: str | None = None
    due_from: datetime | None = None
    due_to: datetime | None = None
    sort: str = "due_at"
    direction: str = "asc"


def field_error(field: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]})


class AccountPlanningService:
    def __init__(self, db: Session) -> None:
        self.repository = AccountPlanningRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def get_plan(self, account_id: str, current_user: User, action_filters: AccountPlanActionFilters | None = None) -> AccountPlanRead | None:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        plan = self.repository.get_plan_for_account(account_id)
        return self._plan_read(plan, action_filters=action_filters) if plan else None

    def upsert_plan(self, account_id: str, payload: AccountPlanUpsertRequest, current_user: User) -> AccountPlanRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        plan = self.repository.get_plan_for_account(account_id)
        before = self._plan_snapshot(plan) if plan else None
        if plan is None:
            plan = AccountPlan(
                account_id=account_id,
                created_by_id=current_user.id,
                created_by_name=current_user.full_name,
            )
            self.repository.save_plan(plan)

        plan.retention_focus = payload.retention_focus
        plan.growth_focus = payload.growth_focus
        plan.risks = payload.risks
        plan.opportunities = payload.opportunities
        plan.commitments = payload.commitments
        plan.service_gaps = payload.service_gaps
        plan.review_cadence = payload.review_cadence
        plan.next_review_at = payload.next_review_at
        plan.status = payload.status
        plan.updated_by_id = current_user.id
        plan.updated_by_name = current_user.full_name

        self.repository.delete_actions_for_plan(plan.id)
        for action_payload in payload.actions:
            owner = self._get_active_user(action_payload.owner_id, "actions.owner_id")
            self.repository.add_action(
                AccountPlanAction(
                    account_plan_id=plan.id,
                    account_id=account_id,
                    title=action_payload.title,
                    owner_id=owner.id,
                    owner_name=owner.full_name,
                    owner_email=owner.email,
                    due_at=action_payload.due_at,
                    status=action_payload.status,
                    priority=action_payload.priority,
                    success_criteria=action_payload.success_criteria,
                    created_by_id=current_user.id,
                    created_by_name=current_user.full_name,
                    updated_by_id=current_user.id,
                )
            )

        self.repository.flush()
        after = self._plan_snapshot(plan)
        version = AccountPlanVersion(
            account_plan_id=plan.id,
            account_id=account_id,
            version=self.repository.next_version(plan.id),
            snapshot_json=after,
            change_summary=payload.change_summary,
            actor_id=current_user.id,
            actor_name=current_user.full_name,
        )
        self.repository.add_version(version)
        self.audit.log(module=ACCOUNT_PLANNING_MODULE, action="upsert", entity_type="account_plan", entity_id=plan.id, actor=current_user, before_value=before, after_value=after, reason=payload.change_summary)
        self.timeline.add_account_event(
            account_id=account_id,
            event_type="account_plan_updated",
            module=ACCOUNT_PLANNING_MODULE,
            title="Account plan updated",
            description=payload.change_summary or f"{current_user.full_name} updated the account plan.",
            actor=current_user,
            source_record_id=plan.id,
            source_record_type="account_plan",
            source_record_route=f"/accounts/{account_id}?tab=planning",
            before_value=before,
            after_value=after,
        )
        self.repository.commit()
        return self._plan_read(plan)

    def list_history(self, account_id: str, current_user: User, page: int, page_size: int) -> AccountPlanVersionPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=ACCOUNT_PLANNING_MODULE)
        items, total = self.repository.list_versions(account_id, page, page_size)
        return AccountPlanVersionPageRead(items=[self._version_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_active_user(self, user_id: str, field: str) -> User:
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise field_error(field, "Owner is required.")
        return user

    def _plan_read(self, plan: AccountPlan, action_filters: AccountPlanActionFilters | None = None) -> AccountPlanRead:
        actions = self._filter_actions(list(plan.actions), action_filters)
        return AccountPlanRead(
            id=plan.id,
            account_id=plan.account_id,
            retention_focus=plan.retention_focus,
            growth_focus=plan.growth_focus,
            risks=list(plan.risks or []),
            opportunities=plan.opportunities,
            commitments=list(plan.commitments or []),
            service_gaps=list(plan.service_gaps or []),
            review_cadence=plan.review_cadence,
            next_review_at=plan.next_review_at,
            status=plan.status,
            created_by_id=plan.created_by_id,
            created_by_name=plan.created_by_name,
            updated_by_id=plan.updated_by_id,
            updated_by_name=plan.updated_by_name,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
            actions=[self._action_read(action) for action in actions],
        )

    def _filter_actions(self, actions: list[AccountPlanAction], filters: AccountPlanActionFilters | None = None) -> list[AccountPlanAction]:
        if filters is None or (
            not filters.search
            and not filters.owner_id
            and not filters.status
            and not filters.priority
            and filters.due_from is None
            and filters.due_to is None
            and filters.sort == "due_at"
            and filters.direction == "asc"
        ):
            return sorted(actions, key=lambda item: (item.status == "completed", item.due_at, item.created_at))

        filtered = actions
        if filters.search and filters.search.strip():
            term = filters.search.strip().lower()
            filtered = [
                action
                for action in filtered
                if term
                in " ".join(
                    [
                        action.title,
                        action.owner_name,
                        action.owner_email or "",
                        action.status,
                        action.priority,
                        " ".join(action.success_criteria or []),
                    ]
                ).lower()
            ]
        if filters.owner_id:
            filtered = [action for action in filtered if action.owner_id == filters.owner_id]
        if filters.status:
            filtered = [action for action in filtered if action.status == filters.status]
        if filters.priority:
            filtered = [action for action in filtered if action.priority == filters.priority]
        if filters.due_from:
            filtered = [action for action in filtered if action.due_at >= filters.due_from]
        if filters.due_to:
            filtered = [action for action in filtered if action.due_at <= filters.due_to]

        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorters = {
            "due_at": lambda item: item.due_at,
            "priority": lambda item: priority_order.get(item.priority, 99),
            "status": lambda item: item.status,
            "owner": lambda item: item.owner_name.lower(),
            "created_at": lambda item: item.created_at,
        }
        sorter = sorters.get(filters.sort, sorters["due_at"])
        reverse = filters.direction == "desc"
        return sorted(filtered, key=lambda item: (sorter(item), item.due_at, item.title.lower()), reverse=reverse)

    @staticmethod
    def _action_read(action: AccountPlanAction) -> AccountPlanActionRead:
        return AccountPlanActionRead(
            id=action.id,
            account_plan_id=action.account_plan_id,
            account_id=action.account_id,
            title=action.title,
            owner_id=action.owner_id,
            owner_name=action.owner_name,
            owner_email=action.owner_email,
            due_at=action.due_at,
            status=action.status,
            priority=action.priority,
            success_criteria=list(action.success_criteria or []),
            completed_at=action.completed_at,
            completed_by_id=action.completed_by_id,
            created_by_id=action.created_by_id,
            created_by_name=action.created_by_name,
            created_at=action.created_at,
            updated_at=action.updated_at,
        )

    @staticmethod
    def _version_read(version: AccountPlanVersion) -> AccountPlanVersionRead:
        return AccountPlanVersionRead(
            id=version.id,
            account_plan_id=version.account_plan_id,
            account_id=version.account_id,
            version=version.version,
            snapshot_json=version.snapshot_json,
            change_summary=version.change_summary,
            actor_id=version.actor_id,
            actor_name=version.actor_name,
            created_at=version.created_at,
        )

    def _plan_snapshot(self, plan: AccountPlan | None) -> dict | None:
        if plan is None:
            return None
        return {
            "id": plan.id,
            "account_id": plan.account_id,
            "retention_focus": plan.retention_focus,
            "growth_focus": plan.growth_focus,
            "risks": list(plan.risks or []),
            "opportunities": plan.opportunities,
            "commitments": list(plan.commitments or []),
            "service_gaps": list(plan.service_gaps or []),
            "review_cadence": plan.review_cadence,
            "next_review_at": plan.next_review_at.isoformat() if plan.next_review_at else None,
            "status": plan.status,
            "actions": [
                {
                    "title": action.title,
                    "owner_id": action.owner_id,
                    "due_at": action.due_at.isoformat(),
                    "status": action.status,
                    "priority": action.priority,
                    "success_criteria": list(action.success_criteria or []),
                }
                for action in sorted(plan.actions, key=lambda item: (item.due_at, item.title))
            ],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
