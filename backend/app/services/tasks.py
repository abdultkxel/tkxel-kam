from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Engagement, GovernanceEvent, PlaybookExecution, PlaybookTemplate, PlaybookTemplateVersion, Signal, Task, TaskEvidence, TaskHistory, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.tasks import TasksRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    PlaybookExecutionRead,
    PlaybookTemplateCreateRequest,
    PlaybookTemplatePageRead,
    PlaybookTemplateRead,
    PlaybookTemplateUpdateRequest,
    TaskCreateRequest,
    TaskEvidenceCreateRequest,
    TaskEvidenceRead,
    TaskPageRead,
    TaskRead,
    TaskUpdateRequest,
    UnifiedCalendarItemRead,
    UnifiedCalendarPageRead,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

TASKS_MODULE = "playbooks_tasks_calendar"
TASK_STATUS_TRANSITIONS = {
    "todo": {"in_progress", "blocked", "done", "skipped"},
    "in_progress": {"todo", "blocked", "done", "skipped"},
    "blocked": {"todo", "in_progress", "done", "skipped"},
    "done": set(),
    "skipped": set(),
}


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = TasksRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_templates(
        self,
        current_user: User,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        signal_type: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> PlaybookTemplatePageRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "view")
        items, total = self.repository.list_templates(
            search=search,
            status_filter=status_filter,
            signal_type=signal_type,
            active_state=active_state,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return PlaybookTemplatePageRead(items=[PlaybookTemplateRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_template(self, payload: PlaybookTemplateCreateRequest, current_user: User) -> PlaybookTemplateRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "configure")
        if self.repository.get_template_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Playbook template slug already exists")
        template = PlaybookTemplate(
            slug=payload.slug,
            name=payload.name,
            objective=payload.objective,
            signal_types=payload.signal_types,
            weak_metrics=payload.weak_metrics,
            activities_json=payload.activities_json,
            default_owner_rule=payload.default_owner_rule,
            due_date_rule=payload.due_date_rule,
            success_criteria=payload.success_criteria,
            skip_rules=payload.skip_rules,
            status=payload.status,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_template(template)
        if template.status == "active":
            self._publish_template_version(template, current_user)
        self.audit.log(module=TASKS_MODULE, action="create", entity_type="playbook_template", entity_id=template.id, actor=current_user, after_value=self._template_snapshot(template))
        self.repository.commit()
        return PlaybookTemplateRead.model_validate(template)

    def update_template(self, template_id: str, payload: PlaybookTemplateUpdateRequest, current_user: User) -> PlaybookTemplateRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "configure")
        template = self._get_template_or_404(template_id)
        before = self._template_snapshot(template)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(template, field, value)
        template.updated_by_id = current_user.id
        if template.status == "active" and (template.current_version == 0 or any(field in updates for field in {"activities_json", "signal_types", "weak_metrics", "default_owner_rule", "due_date_rule"})):
            self._publish_template_version(template, current_user)
        self.audit.log(module=TASKS_MODULE, action="update", entity_type="playbook_template", entity_id=template.id, actor=current_user, before_value=before, after_value=self._template_snapshot(template))
        self.repository.commit()
        return PlaybookTemplateRead.model_validate(template)

    def execute_playbook(
        self,
        template_id: str,
        *,
        account_id: str,
        current_user: User,
        engagement_id: str | None = None,
        signal_id: str | None = None,
        customization: dict[str, Any] | None = None,
    ) -> PlaybookExecutionRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "create")
        template = self._get_template_or_404(template_id)
        if not template.is_active or template.status != "active":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active playbook templates can be executed")
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=TASKS_MODULE)
        engagement = self._validate_engagement(account.id, engagement_id)
        execution = PlaybookExecution(
            template_id=template.id,
            template_version=template.current_version or 1,
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            signal_id=signal_id,
            status="active",
            executed_by_id=current_user.id,
            executed_by_name=current_user.full_name,
            customization_json=customization or {},
        )
        self.repository.add_execution(execution)
        for activity in template.activities_json:
            task = self._task_from_activity(account, engagement, execution, activity, current_user, signal_id=signal_id)
            self.repository.save_task(task)
            self._add_task_history(task, "created", None, task.status, current_user, note="Created from playbook execution")
        self.audit.log(module=TASKS_MODULE, action="execute", entity_type="playbook_execution", entity_id=execution.id, actor=current_user, after_value={"template_id": template.id, "task_count": len(execution.tasks)})
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            title=f"Playbook executed: {template.name}",
            description=f"{template.name} created {len(execution.tasks)} task(s).",
            actor=current_user,
            event_type="playbook_executed",
            module=TASKS_MODULE,
            source_record_id=execution.id,
            source_record_type="playbook_execution",
            source_record_route="/tasks",
            after_value={"template_id": template.id, "task_count": len(execution.tasks)},
        )
        self.repository.commit()
        return PlaybookExecutionRead.model_validate(execution)

    def list_tasks(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        status_filter: str | None = None,
        priority: str | None = None,
        owner_id: str | None = None,
        source_type: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        active_only: bool = False,
        sort: str = "due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 25,
    ) -> TaskPageRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "view")
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        items, total = self.repository.list_tasks(
            account_id=account_id,
            account_ids=account_ids,
            engagement_id=engagement_id,
            search=search,
            status_filter=status_filter,
            priority=priority,
            owner_id=owner_id,
            source_type=source_type,
            due_from=due_from,
            due_to=due_to,
            active_only=active_only,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return TaskPageRead(items=[TaskRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_task(self, payload: TaskCreateRequest, current_user: User) -> TaskRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "create")
        account = self._get_account_or_404(payload.account_id)
        self.access.require_account_update(current_user, account, module=TASKS_MODULE)
        engagement = self._validate_engagement(account.id, payload.engagement_id)
        owner = self._get_active_user(payload.owner_id) if payload.owner_id else self._default_owner(account)
        task = Task(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            source_type=payload.source_type,
            source_record_id=payload.source_record_id,
            source_record_route=payload.source_record_route,
            title=payload.title,
            description=payload.description,
            owner_id=owner.id if owner else None,
            owner_name=owner.full_name if owner else None,
            due_at=payload.due_at,
            status=payload.status,
            priority=payload.priority,
            notes=payload.notes,
            evidence_json=payload.evidence,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.save_task(task)
        self._add_task_history(task, "created", None, task.status, current_user)
        self.audit.log(module=TASKS_MODULE, action="create", entity_type="task", entity_id=task.id, actor=current_user, after_value=self._task_snapshot(task))
        self._add_task_timeline(task, account, current_user, event_type="task_created", title=f"Task created: {task.title}", description=task.description or task.notes or "Manual task created.")
        self.repository.commit()
        return TaskRead.model_validate(task)

    def create_task_from_signal(self, signal: Signal, current_user: User, *, owner_id: str | None = None, due_at: datetime | None = None, note: str | None = None) -> TaskRead:
        account = self._get_account_or_404(signal.account_id)
        owner = self._get_active_user(owner_id) if owner_id else (self._get_active_user(signal.owner_id) if signal.owner_id else self._default_owner(account))
        task = Task(
            account_id=signal.account_id,
            engagement_id=signal.engagement_id,
            source_type="signal",
            source_record_id=signal.id,
            source_record_route="/attention-center",
            title=signal.title,
            description=signal.detail,
            owner_id=owner.id if owner else None,
            owner_name=owner.full_name if owner else signal.owner_name,
            due_at=due_at or datetime.now(timezone.utc) + timedelta(days=7),
            status="todo",
            priority="critical" if signal.severity == "critical" else "high" if signal.severity == "warning" else "medium",
            notes=note,
            evidence_json=signal.evidence_json,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.save_task(task)
        self._add_task_history(task, "created", None, task.status, current_user, note="Converted from signal")
        self.audit.log(module=TASKS_MODULE, action="create_from_signal", entity_type="task", entity_id=task.id, actor=current_user, after_value=self._task_snapshot(task))
        self._add_task_timeline(task, account, current_user, event_type="task_created", title=f"Task created from signal: {task.title}", description=task.description or "Signal converted into a task.")
        return TaskRead.model_validate(task)

    def update_task(self, task_id: str, payload: TaskUpdateRequest, current_user: User) -> TaskRead:
        task = self._get_task_or_404(task_id)
        account = self._get_account_or_404(task.account_id)
        self._require_task_update(current_user, account, task)
        before = self._task_snapshot(task)
        updates = payload.model_dump(exclude_unset=True)
        next_status = updates.pop("status", None)
        if "engagement_id" in updates:
            engagement = self._validate_engagement(account.id, updates["engagement_id"])
            task.engagement_id = engagement.id if engagement else None
            updates.pop("engagement_id")
        if "owner_id" in updates:
            owner = self._get_active_user(updates["owner_id"]) if updates["owner_id"] else None
            task.owner_id = owner.id if owner else None
            task.owner_name = owner.full_name if owner else None
            updates.pop("owner_id")
        for field, value in updates.items():
            setattr(task, field, value)
        if next_status:
            self._apply_task_status(task, next_status, current_user, note=updates.get("notes"))
        self.audit.log(module=TASKS_MODULE, action="update", entity_type="task", entity_id=task.id, actor=current_user, before_value=before, after_value=self._task_snapshot(task))
        if next_status in {"done", "skipped"}:
            self._add_task_timeline(
                task,
                account,
                current_user,
                event_type="task_completed" if next_status == "done" else "task_skipped",
                title=f"Task {'completed' if next_status == 'done' else 'skipped'}: {task.title}",
                description=task.outcome or task.skip_reason or task.notes or "",
            )
        self.repository.commit()
        return TaskRead.model_validate(task)

    def add_evidence(self, task_id: str, payload: TaskEvidenceCreateRequest, current_user: User) -> TaskEvidenceRead:
        task = self._get_task_or_404(task_id)
        account = self._get_account_or_404(task.account_id)
        self._require_task_update(current_user, account, task)
        evidence = TaskEvidence(
            task_id=task.id,
            evidence_type=payload.evidence_type,
            note=payload.note,
            url=payload.url,
            metadata_json=payload.metadata_json,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.add_evidence(evidence)
        task.evidence_json = [*task.evidence_json, {"id": evidence.id, "type": evidence.evidence_type, "note": evidence.note, "url": evidence.url}]
        self._add_task_history(task, "evidence_added", task.status, task.status, current_user, note=payload.note)
        self.audit.log(module=TASKS_MODULE, action="add_evidence", entity_type="task", entity_id=task.id, actor=current_user, after_value={"evidence_id": evidence.id, "evidence_type": evidence.evidence_type})
        self.repository.commit()
        return TaskEvidenceRead.model_validate(evidence)

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
    ) -> UnifiedCalendarPageRead:
        self.access.require_module_permission(current_user, TASKS_MODULE, "view")
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        tasks, _ = self.repository.list_tasks(
            account_id=account_id,
            account_ids=account_ids,
            owner_id=owner_id,
            due_from=date_from,
            due_to=date_to,
            page=1,
            page_size=1000,
        )
        items = [self._task_calendar_item(task) for task in tasks]
        items.extend(self._engagement_calendar_items(account_id=account_id, account_ids=account_ids, owner_id=owner_id, date_from=date_from, date_to=date_to))
        items.extend(self._governance_calendar_items(account_id=account_id, account_ids=account_ids, owner_id=owner_id, date_from=date_from, date_to=date_to))
        items.sort(key=lambda item: item.date)
        total = len(items)
        start = (page - 1) * page_size
        return UnifiedCalendarPageRead(items=items[start : start + page_size], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def _apply_task_status(self, task: Task, next_status: str, current_user: User, *, note: str | None = None) -> None:
        previous = task.status
        if next_status == previous:
            return
        if next_status not in TASK_STATUS_TRANSITIONS.get(previous, set()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task cannot transition from {previous} to {next_status}")
        if next_status == "done" and not task.outcome and not task.evidence_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Completed tasks require outcome or evidence")
        if next_status == "skipped" and not task.skip_reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skipped tasks require a skip reason")
        task.status = next_status
        if next_status == "done":
            task.completed_at = datetime.now(timezone.utc)
            task.completed_by_id = current_user.id
        self._add_task_history(task, "status_change", previous, next_status, current_user, note=note)

    def _task_from_activity(
        self,
        account: Account,
        engagement: Engagement | None,
        execution: PlaybookExecution,
        activity: dict[str, Any],
        current_user: User,
        *,
        signal_id: str | None,
    ) -> Task:
        owner = self._owner_from_activity(account, activity)
        offset_days = int(activity.get("due_offset_days", execution.customization_json.get("due_offset_days", 7)))
        return Task(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            playbook_execution_id=execution.id,
            source_type="playbook",
            source_record_id=signal_id or execution.id,
            source_record_route="/tasks",
            title=str(activity.get("title", "Playbook activity")),
            description=activity.get("description"),
            owner_id=owner.id if owner else None,
            owner_name=owner.full_name if owner else None,
            due_at=datetime.now(timezone.utc) + timedelta(days=offset_days),
            status="todo",
            priority=activity.get("priority", "medium"),
            notes=activity.get("notes"),
            evidence_json=activity.get("evidence", []),
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )

    def _owner_from_activity(self, account: Account, activity: dict[str, Any]) -> User | None:
        owner_id = activity.get("owner_id")
        if owner_id:
            return self._get_active_user(owner_id)
        return self._default_owner(account)

    def _default_owner(self, account: Account) -> User | None:
        for owner in account.owners:
            if owner.ownership_role == "primary_am" and owner.is_active and owner.user_id:
                return self._get_active_user(owner.user_id)
        return None

    def _add_task_history(self, task: Task, event_type: str, previous_status: str | None, new_status: str | None, current_user: User, *, note: str | None = None) -> None:
        self.repository.add_history(
            TaskHistory(
                task_id=task.id,
                event_type=event_type,
                previous_status=previous_status,
                new_status=new_status,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                note=note,
                metadata_json={},
            )
        )

    def _engagement_calendar_items(
        self,
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        owner_id: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list[UnifiedCalendarItemRead]:
        conditions = [Engagement.archived_at.is_(None)]
        if account_id:
            conditions.append(Engagement.account_id == account_id)
        if account_ids is not None:
            conditions.append(Engagement.account_id.in_(account_ids) if account_ids else Engagement.account_id == "__no_access__")
        if owner_id:
            conditions.append(Engagement.owner_id == owner_id)
        engagements = list(self.db.scalars(select(Engagement).where(*conditions)))
        items: list[UnifiedCalendarItemRead] = []
        for engagement in engagements:
            account = self._get_account_or_404(engagement.account_id)
            for field, kind, label in (
                ("notice_deadline", "notice_window", "Notice deadline"),
                ("renewal_date", "renewal_date", "Renewal date"),
                ("end_date", "sow_expiry", "SOW expiry"),
            ):
                value = getattr(engagement, field)
                if value is None:
                    continue
                if date_from and value < date_from:
                    continue
                if date_to and value > date_to:
                    continue
                items.append(
                    UnifiedCalendarItemRead(
                        id=f"{engagement.id}:{field}",
                        kind=kind,
                        source_record_id=engagement.id,
                        source_record_type="engagement",
                        account_id=account.id,
                        account_name=account.name,
                        engagement_id=engagement.id,
                        owner_id=engagement.owner_id,
                        date=value,
                        title=f"{label}: {engagement.name}",
                        detail=account.name,
                        status=engagement.status,
                        priority="high" if field != "end_date" else "medium",
                        route=f"/accounts/{account.id}/engagements/{engagement.id}",
                    )
                )
        return items

    def _governance_calendar_items(
        self,
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        owner_id: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list[UnifiedCalendarItemRead]:
        conditions = []
        if account_id:
            conditions.append(GovernanceEvent.account_id == account_id)
        if account_ids is not None:
            conditions.append(GovernanceEvent.account_id.in_(account_ids) if account_ids else GovernanceEvent.account_id == "__no_access__")
        if owner_id:
            conditions.append(GovernanceEvent.owner_id == owner_id)
        if date_from:
            conditions.append(GovernanceEvent.scheduled_at >= date_from)
        if date_to:
            conditions.append(GovernanceEvent.scheduled_at <= date_to)
        events = list(self.db.scalars(select(GovernanceEvent).where(*conditions).order_by(GovernanceEvent.scheduled_at)))
        items: list[UnifiedCalendarItemRead] = []
        for event in events:
            account = self._get_account_or_404(event.account_id)
            items.append(
                UnifiedCalendarItemRead(
                    id=f"governance:{event.id}",
                    kind="governance",
                    source_record_id=event.id,
                    source_record_type="governance_event",
                    account_id=account.id,
                    account_name=account.name,
                    engagement_id=event.engagement_id,
                    owner_id=event.owner_id,
                    date=event.scheduled_at,
                    title=f"{event.governance_type}: {account.name}",
                    detail=event.agenda or event.status,
                    status=event.status,
                    priority="medium",
                    route=f"/governance?event={event.id}",
                )
            )
        return items

    def _task_calendar_item(self, task: Task) -> UnifiedCalendarItemRead:
        account = self._get_account_or_404(task.account_id)
        return UnifiedCalendarItemRead(
            id=f"task:{task.id}",
            kind="task",
            source_record_id=task.id,
            source_record_type="task",
            account_id=task.account_id,
            account_name=account.name,
            engagement_id=task.engagement_id,
            owner_id=task.owner_id,
            date=task.due_at,
            title=task.title,
            detail=task.description or task.notes or "",
            status=task.status,
            priority=task.priority,
            route=f"/tasks?task={task.id}",
        )

    def _add_task_timeline(self, task: Task, account: Account, current_user: User, *, event_type: str, title: str, description: str) -> None:
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=task.engagement_id,
            title=title,
            description=description,
            actor=current_user,
            event_type=event_type,
            module=TASKS_MODULE,
            source_record_id=task.id,
            source_record_type="task",
            source_record_route=f"/tasks?task={task.id}",
            after_value=self._task_snapshot(task),
        )

    def _publish_template_version(self, template: PlaybookTemplate, current_user: User) -> None:
        template.current_version += 1
        self.repository.add_template_version(
            PlaybookTemplateVersion(
                template_id=template.id,
                version=template.current_version,
                config_json=self._template_snapshot(template),
                published_by_id=current_user.id,
                published_by_name=current_user.full_name,
            )
        )

    def _template_snapshot(self, template: PlaybookTemplate) -> dict:
        return {
            "id": template.id,
            "slug": template.slug,
            "name": template.name,
            "objective": template.objective,
            "signal_types": template.signal_types,
            "weak_metrics": template.weak_metrics,
            "activities_json": template.activities_json,
            "default_owner_rule": template.default_owner_rule,
            "due_date_rule": template.due_date_rule,
            "success_criteria": template.success_criteria,
            "skip_rules": template.skip_rules,
            "status": template.status,
            "is_active": template.is_active,
            "current_version": template.current_version,
        }

    def _task_snapshot(self, task: Task) -> dict:
        return {
            "id": task.id,
            "account_id": task.account_id,
            "engagement_id": task.engagement_id,
            "title": task.title,
            "owner_id": task.owner_id,
            "due_at": task.due_at.isoformat(),
            "status": task.status,
            "priority": task.priority,
            "source_type": task.source_type,
            "source_record_id": task.source_record_id,
        }

    def _require_task_update(self, current_user: User, account: Account, task: Task) -> None:
        self.access.require_module_permission(current_user, TASKS_MODULE, "update")
        if current_user.role in GLOBAL_EDIT_ROLES:
            return
        if task.owner_id == current_user.id:
            return
        self.access.require_account_update(current_user, account, module=TASKS_MODULE)

    def _validate_engagement(self, account_id: str, engagement_id: str | None) -> Engagement | None:
        if engagement_id is None:
            return None
        engagement = self.db.get(Engagement, engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        if engagement.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Engagement does not belong to the selected account")
        return engagement

    def _get_active_user(self, user_id: str | None) -> User | None:
        if user_id is None:
            return None
        user = self.accounts.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task owner was not found or is inactive")
        return user

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_template_or_404(self, template_id: str) -> PlaybookTemplate:
        template = self.repository.get_template(template_id)
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook template was not found")
        return template

    def _get_task_or_404(self, task_id: str) -> Task:
        task = self.repository.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task was not found")
        return task
