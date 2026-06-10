import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountOwner,
    Engagement,
    GovernanceActionItem,
    OpportunityActionItem,
    PlaybookExecution,
    PlaybookTemplate,
    PlaybookTemplateActivity,
    Task,
    TaskEvidence,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.playbooks_tasks import PlaybooksTasksRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    CalendarItemPageRead,
    CalendarItemRead,
    MessageResponse,
    PlaybookExecutionRead,
    PlaybookExecutionRequest,
    PlaybookTemplateActivityInput,
    PlaybookTemplateActivityRead,
    PlaybookTemplateCreateRequest,
    PlaybookTemplatePageRead,
    PlaybookTemplateRead,
    PlaybookTemplateUpdateRequest,
    RecommendedPlaybookRead,
    TaskCreateRequest,
    TaskEvidenceRead,
    TaskPageRead,
    TaskRead,
    TaskUpdateRequest,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.notifications import NotificationsService
from app.services.storage import ContentStorageService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

MODULE = "playbooks_tasks_calendar"
LOGGER = logging.getLogger(__name__)


class PlaybooksTasksService:
    def __init__(self, db: Session) -> None:
        self.repository = PlaybooksTasksRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))
        self.storage = ContentStorageService()
        self.notifications = NotificationsService(db)

    def list_templates(
        self,
        current_user: User,
        *,
        search: str | None = None,
        active_state: str = "active",
        signal_type: str | None = None,
        weak_metric: str | None = None,
        owner_rule: str | None = None,
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> PlaybookTemplatePageRead:
        self.access.require_module_permission(current_user, MODULE, "view")
        items, total = self.repository.list_templates(
            search=search,
            active_state=active_state,
            signal_type=signal_type,
            weak_metric=weak_metric,
            owner_rule=owner_rule,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return PlaybookTemplatePageRead(items=[self._template_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_template(self, payload: PlaybookTemplateCreateRequest, current_user: User) -> PlaybookTemplateRead:
        self._require_configure(current_user)
        slug = payload.slug or self._slug_from_name(payload.name)
        if self.repository.get_template_by_slug(slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Playbook template slug already exists")
        template = PlaybookTemplate(
            slug=slug,
            name=payload.name,
            objective=payload.objective,
            description=payload.description,
            signal_types=payload.signal_types,
            weak_metrics=payload.weak_metrics,
            activities_json=[item.model_dump() for item in payload.activities],
            default_owner_rule=payload.default_owner_rule,
            due_date_rule=payload.due_date_rule,
            success_criteria=payload.success_criteria,
            skip_rules=payload.skip_rules,
            status="active" if payload.is_active else "draft",
            current_version=1,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        template.activities = [self._activity_model(item) for item in payload.activities]
        self.repository.save_template(template)
        self.custom_fields.save_record_values(MODULE, template.id, payload.custom_field_values, current_user, audit_module=MODULE)
        self.audit.log(module=MODULE, action="create_template", entity_type="playbook_template", entity_id=template.id, actor=current_user, after_value=self._template_snapshot(template))
        self.repository.commit()
        return self._template_read(template)

    def update_template(self, template_id: str, payload: PlaybookTemplateUpdateRequest, current_user: User) -> PlaybookTemplateRead:
        self._require_configure(current_user)
        template = self._get_template_or_404(template_id)
        before = self._template_snapshot(template)
        updates = payload.model_dump(exclude_unset=True)
        custom_values = updates.pop("custom_field_values", None)
        activities = updates.pop("activities", None)
        if "slug" in updates and updates["slug"] != template.slug and self.repository.get_template_by_slug(updates["slug"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Playbook template slug already exists")
        for field, value in updates.items():
            setattr(template, field, value)
        if activities is not None:
            if not activities:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one activity is required")
            self.repository.replace_template_activities(template, [self._activity_model(item) for item in activities])
            template.activities_json = [item.model_dump() for item in activities]
        if any(field in updates for field in {"slug", "name", "objective", "description", "signal_types", "weak_metrics", "default_owner_rule", "due_date_rule", "success_criteria", "skip_rules"}) or activities is not None:
            template.version += 1
            template.current_version = template.version
        if "is_active" in updates:
            template.status = "active" if template.is_active else "draft"
        template.updated_by_id = current_user.id
        if custom_values is not None:
            self.custom_fields.replace_record_values(MODULE, template.id, custom_values, current_user, audit_module=MODULE)
        self.audit.log(module=MODULE, action="update_template", entity_type="playbook_template", entity_id=template.id, actor=current_user, before_value=before, after_value=self._template_snapshot(template))
        self.repository.commit()
        return self._template_read(template)

    def recommended_playbooks(
        self,
        signal_id: str,
        current_user: User,
        *,
        signal_type: str | None = None,
        weak_metric: str | None = None,
        account_id: str | None = None,
        engagement_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> list[RecommendedPlaybookRead]:
        self.access.require_module_permission(current_user, MODULE, "view")
        if account_id:
            account = self._get_account_or_404(account_id)
            self.access.require_account_view(current_user, account, module=MODULE)
        elif current_user.role not in GLOBAL_VIEW_ROLES:
            LOGGER.info("Recommended playbooks requested without account context for non-global user", extra={"signal_id": signal_id, "actor_id": current_user.id})
        templates, _ = self.repository.list_templates(active_state="active", page=page, page_size=page_size)
        recommendations: list[RecommendedPlaybookRead] = []
        for template in templates:
            signal_matches = self._matches_list(template.signal_types, signal_type)
            metric_matches = self._matches_list(template.weak_metrics, weak_metric)
            if signal_type and not signal_matches and template.signal_types:
                continue
            if weak_metric and not metric_matches and template.weak_metrics:
                continue
            score = 50 + (25 if signal_matches else 0) + (25 if metric_matches else 0)
            rationale = "Recommended from configured playbook rules"
            if signal_type or weak_metric:
                rationale = f"Matched {', '.join(item for item in (signal_type, weak_metric) if item)} against active playbook configuration."
            recommendations.append(
                RecommendedPlaybookRead(
                    template=self._template_read(template),
                    rationale=rationale,
                    match_score=min(score, 100),
                    matched_signal_types=[signal_type] if signal_matches and signal_type else [],
                    matched_metrics=[weak_metric] if metric_matches and weak_metric else [],
                )
            )
        if not recommendations:
            LOGGER.info("No recommended playbooks matched signal context", extra={"signal_id": signal_id, "signal_type": signal_type, "weak_metric": weak_metric})
        return sorted(recommendations, key=lambda item: item.match_score, reverse=True)

    def execute_playbook(self, template_id: str, payload: PlaybookExecutionRequest, current_user: User) -> PlaybookExecutionRead:
        self.access.require_module_permission(current_user, MODULE, "create")
        if not payload.confirmed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Playbook execution requires explicit confirmation")
        template = self._get_template_or_404(template_id)
        if not template.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive playbook templates cannot be executed")
        account = self._get_account_or_404(payload.account_id)
        self._require_account_work(current_user, account, action="create")
        engagement = self._get_engagement_for_account(payload.engagement_id, account.id) if payload.engagement_id else None
        activities_by_id = {activity.id: activity for activity in template.activities}
        for skipped_id in payload.skipped_activity_ids:
            activity = activities_by_id.get(skipped_id)
            if activity is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skipped activity was not found on the template")
            if not activity.skip_allowed:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This activity cannot be skipped")
            if not payload.skip_reasons.get(skipped_id):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skipped activities require a reason")

        execution = PlaybookExecution(
            template_id=template.id,
            template_name_snapshot=template.name,
            template_version_snapshot=template.version,
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            source_signal_id=payload.source_signal_id,
            source_signal_type=payload.source_signal_type,
            source_metric=payload.source_metric,
            skipped_activity_ids=payload.skipped_activity_ids,
            skip_reasons=payload.skip_reasons,
            template_snapshot=self._template_snapshot(template),
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.save_execution(execution)
        now = datetime.now(timezone.utc)
        generated_count = 0
        for activity in sorted(template.activities, key=lambda item: item.sort_order):
            if activity.id in payload.skipped_activity_ids:
                continue
            owner = self._resolve_owner(activity.owner_rule or template.default_owner_rule, account, current_user, template)
            task = Task(
                account_id=account.id,
                engagement_id=engagement.id if engagement else None,
                playbook_execution_id=execution.id,
                template_activity_id=activity.id,
                source_type="playbook",
                source_record_id=payload.source_signal_id or execution.id,
                source_metric=payload.source_metric,
                title=activity.title,
                description=activity.description,
                owner_id=owner.id,
                owner_name=owner.full_name,
                due_at=now + timedelta(days=activity.due_offset_days),
                status="open",
                priority=activity.priority,
                success_criteria=activity.success_criteria or template.success_criteria,
                requires_evidence=activity.requires_evidence,
                created_by_id=current_user.id,
                updated_by_id=current_user.id,
            )
            self.repository.save_task(task)
            generated_count += 1
        self._write_timeline(account.id, engagement.id if engagement else None, current_user, "playbook_executed", f"Playbook executed: {template.name}", f"{generated_count} task(s) generated from template version {template.version}.", execution.id, "playbook_execution")
        self.audit.log(module=MODULE, action="execute_playbook", entity_type="playbook_execution", entity_id=execution.id, actor=current_user, after_value=self._execution_snapshot(execution))
        self.repository.commit()
        persisted = self.repository.get_execution(execution.id) or execution
        return self._execution_read(persisted)

    def list_tasks(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        owner_id: str | None = None,
        status_filter: str | None = None,
        priority: str | None = None,
        source_type: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        search: str | None = None,
        my_items: bool = False,
        sort: str = "due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> TaskPageRead:
        self.access.require_module_permission(current_user, MODULE, "view")
        if account_id:
            self.access.require_account_view(current_user, self._get_account_or_404(account_id), module=MODULE)
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        items, total = self.repository.list_tasks(
            account_id=account_id,
            account_ids=account_ids,
            engagement_id=engagement_id,
            owner_id=owner_id,
            status_filter=status_filter,
            priority=priority,
            source_type=source_type,
            due_from=due_from,
            due_to=due_to,
            search=search,
            my_items=my_items,
            current_user_id=current_user.id,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return TaskPageRead(items=[self._task_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_task(self, payload: TaskCreateRequest, current_user: User) -> TaskRead:
        self.access.require_module_permission(current_user, MODULE, "create")
        account = self._get_account_or_404(payload.account_id)
        self._require_account_work(current_user, account, action="create")
        self._get_engagement_for_account(payload.engagement_id, account.id) if payload.engagement_id else None
        owner = self._get_user_or_404(payload.owner_id)
        task = Task(
            account_id=account.id,
            engagement_id=payload.engagement_id,
            source_type=payload.source_type,
            source_record_id=payload.source_record_id,
            source_metric=payload.source_metric,
            title=payload.title,
            description=payload.description,
            owner_id=owner.id,
            owner_name=owner.full_name,
            due_at=payload.due_at,
            status=payload.status,
            priority=payload.priority,
            notes=payload.notes,
            outcome=payload.outcome,
            success_criteria=payload.success_criteria,
            requires_evidence=payload.requires_evidence,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_task(task)
        self.custom_fields.save_record_values(MODULE, task.id, payload.custom_field_values, current_user, audit_module=MODULE)
        self._write_timeline(account.id, task.engagement_id, current_user, "task_created", f"Task created: {task.title}", task.description or "Task created.", task.id, "task")
        self.audit.log(module=MODULE, action="create_task", entity_type="task", entity_id=task.id, actor=current_user, after_value=self._task_snapshot(task))
        self._notify_task_created(task, account, current_user)
        self.repository.commit()
        return self._task_read(task)

    def update_task(self, task_id: str, payload: TaskUpdateRequest, current_user: User) -> TaskRead:
        task = self._get_task_or_404(task_id)
        self._require_task_update(current_user, task)
        before = self._task_snapshot(task)
        updates = payload.model_dump(exclude_unset=True)
        custom_values = updates.pop("custom_field_values", None)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_user_or_404(updates.pop("owner_id"))
            task.owner_id = owner.id
            task.owner_name = owner.full_name
        if updates.get("status") == "done":
            if task.requires_evidence and not task.evidence and not updates.get("outcome"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Completion requires evidence or an outcome")
            task.completed_at = task.completed_at or datetime.now(timezone.utc)
            task.completed_by_id = current_user.id
        if updates.get("status") == "cancelled" and not (updates.get("skipped_reason") or task.skipped_reason):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled tasks require a cancellation reason")
        for field, value in updates.items():
            setattr(task, field, value)
        task.updated_by_id = current_user.id
        if updates.get("status") == "done":
            self._sync_source_action_item_from_task(task, current_user)
        if custom_values is not None:
            self.custom_fields.replace_record_values(MODULE, task.id, custom_values, current_user, audit_module=MODULE)
        if task.status in {"done", "cancelled"}:
            action = "task_completed" if task.status == "done" else "task_cancelled"
            self._write_timeline(task.account_id, task.engagement_id, current_user, action, f"Task {task.status}: {task.title}", task.outcome or task.skipped_reason or task.notes or "Task status changed.", task.id, "task", before=before, after=self._task_snapshot(task))
        if task.owner_id != before.get("owner_id"):
            account = self._get_account_or_404(task.account_id)
            self._notify_task_assigned(task, account, current_user, previous_owner_id=before.get("owner_id"))
        self.audit.log(module=MODULE, action="update_task", entity_type="task", entity_id=task.id, actor=current_user, before_value=before, after_value=self._task_snapshot(task))
        self.repository.commit()
        return self._task_read(task)

    def _sync_source_action_item_from_task(self, task: Task, current_user: User) -> None:
        if task.status != "done" or not task.source_record_id:
            return
        if task.source_type == "governance_action_item":
            action_item = self.repository.db.get(GovernanceActionItem, task.source_record_id)
        elif task.source_type == "opportunity_action_item":
            action_item = self.repository.db.get(OpportunityActionItem, task.source_record_id)
        else:
            action_item = None
        if action_item is None or action_item.status == "completed":
            return
        action_item.status = "completed"
        action_item.completed_at = task.completed_at or datetime.now(timezone.utc)
        action_item.completed_by_id = current_user.id

    async def add_task_evidence(
        self,
        task_id: str,
        current_user: User,
        *,
        evidence_type: str,
        title: str | None = None,
        body: str | None = None,
        url: str | None = None,
        file: UploadFile | None = None,
    ) -> TaskEvidenceRead:
        task = self._get_task_or_404(task_id)
        self._require_task_update(current_user, task)
        evidence_type = evidence_type.strip().lower()
        if evidence_type not in {"note", "link", "file"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Evidence type must be note, link, or file")
        if evidence_type == "note" and not (body and body.strip()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note evidence requires body text")
        if evidence_type == "link":
            from app.schemas import validate_http_url

            try:
                url = validate_http_url(url, "Evidence URL")
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        stored = None
        if evidence_type == "file":
            if file is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File evidence requires an upload")
            stored = await self.storage.save_upload(file)
        evidence = TaskEvidence(
            task_id=task.id,
            evidence_type=evidence_type,
            title=title,
            body=body,
            url=url,
            file_name=stored.file_name if stored else None,
            file_path=stored.file_path if stored else None,
            file_storage_backend=stored.storage_backend if stored else None,
            file_mime_type=stored.mime_type if stored else None,
            file_size_bytes=stored.size_bytes if stored else None,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.repository.add_evidence(evidence)
        self._write_timeline(task.account_id, task.engagement_id, current_user, "task_evidence", f"Evidence added: {task.title}", body or title or evidence.file_name or "Task evidence added.", task.id, "task")
        self.audit.log(module=MODULE, action="add_evidence", entity_type="task_evidence", entity_id=evidence.id, actor=current_user, after_value={"task_id": task.id, "evidence_type": evidence_type})
        self.repository.commit()
        return TaskEvidenceRead.model_validate(evidence)

    def calendar_items(
        self,
        current_user: User,
        *,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        account_id: str | None = None,
        engagement_id: str | None = None,
        owner_id: str | None = None,
        my_items: bool = False,
        include_governance: bool = True,
        include_tasks: bool = True,
        include_renewals: bool = True,
        search: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> CalendarItemPageRead:
        self.access.require_module_permission(current_user, MODULE, "view")
        if account_id:
            self.access.require_account_view(current_user, self._get_account_or_404(account_id), module=MODULE)
        account_ids = None if current_user.role in GLOBAL_VIEW_ROLES else self.accounts.list_account_ids_for_user(current_user.id)
        if account_id:
            account_ids = [account_id]
        items: list[CalendarItemRead] = []
        if include_tasks:
            tasks = self.repository.list_tasks_for_calendar(account_ids=account_ids, date_from=date_from, date_to=date_to)
            items.extend(self._task_calendar_item(task) for task in tasks)
        if include_governance:
            events = self.repository.list_governance_events_for_calendar(account_ids=account_ids, date_from=date_from, date_to=date_to)
            items.extend(self._governance_calendar_item(event) for event in events)
            actions = self.repository.list_governance_actions_for_calendar(account_ids=account_ids, date_from=date_from, date_to=date_to)
            items.extend(self._governance_action_calendar_item(action) for action in actions)
        if include_renewals:
            engagements = self.repository.list_engagements_for_calendar(account_ids=account_ids, date_from=date_from, date_to=date_to)
            for engagement in engagements:
                items.extend(self._engagement_calendar_items(engagement))
        if engagement_id:
            items = [item for item in items if item.engagement_id == engagement_id]
        if owner_id:
            items = [item for item in items if item.owner_id == owner_id]
        if my_items:
            items = [item for item in items if item.owner_id == current_user.id]
        if search and search.strip():
            needle = search.strip().lower()
            items = [item for item in items if needle in " ".join([item.title, item.detail, item.account_name, item.owner_name or ""]).lower()]
        items.sort(key=lambda item: item.date)
        total = len(items)
        start = (page - 1) * page_size
        return CalendarItemPageRead(items=items[start:start + page_size], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def _require_configure(self, user: User) -> None:
        self.access.require_module_permission(user, MODULE, "configure")
        if user.role not in {"super_admin", "admin", "kam_head"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin or KAM Head can configure playbooks")

    def _require_account_work(self, user: User, account: Account, *, action: str) -> None:
        self.access.require_module_permission(user, MODULE, action)
        if user.role in GLOBAL_EDIT_ROLES:
            return
        if self.access.can_update_account(user, account):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage playbook work for this account")

    def _require_task_update(self, user: User, task: Task) -> None:
        self.access.require_module_permission(user, MODULE, "update")
        if user.role in GLOBAL_EDIT_ROLES or task.owner_id == user.id:
            return
        account = self._get_account_or_404(task.account_id)
        if self.access.can_update_account(user, account):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this task")

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

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.repository.get_account(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_for_account(self, engagement_id: str | None, account_id: str) -> Engagement:
        engagement = self.repository.get_engagement(engagement_id)
        if engagement is None or engagement.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found for this account")
        return engagement

    def _get_user_or_404(self, user_id: str | None) -> User:
        user = self.repository.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User was not found")
        return user

    def _activity_model(self, item: PlaybookTemplateActivityInput) -> PlaybookTemplateActivity:
        return PlaybookTemplateActivity(**item.model_dump())

    def _resolve_owner(self, rule: str, account: Account, actor: User, template: PlaybookTemplate) -> User:
        if rule == "task_creator":
            return actor
        if rule == "template_owner":
            return self.repository.get_user(template.updated_by_id or template.created_by_id) or actor
        role = "ops_lead" if rule == "ops_lead" else "primary_am"
        owner = self._active_account_owner(account, role) or self._active_account_owner(account, "primary_am")
        if owner and owner.user_id:
            user = self.repository.get_user(owner.user_id)
            if user and user.is_active:
                return user
        return actor

    @staticmethod
    def _active_account_owner(account: Account, ownership_role: str) -> AccountOwner | None:
        return next((owner for owner in account.owners if owner.is_active and owner.ownership_role == ownership_role and owner.user_id), None)

    @staticmethod
    def _matches_list(values: list[str], target: str | None) -> bool:
        if not target:
            return False
        return target.lower() in {str(item).lower() for item in values}

    def _template_read(self, template: PlaybookTemplate) -> PlaybookTemplateRead:
        sorted_activities = sorted(template.activities, key=lambda item: item.sort_order)
        return PlaybookTemplateRead.model_validate(template).model_copy(
            update={
                "activities": [PlaybookTemplateActivityRead.model_validate(item) for item in sorted_activities],
                "custom_field_values": self.custom_fields.record_values(MODULE, template.id),
            }
        )

    def _task_read(self, task: Task) -> TaskRead:
        return TaskRead.model_validate(task).model_copy(update={"custom_field_values": self.custom_fields.record_values(MODULE, task.id)})

    @staticmethod
    def _slug_from_name(name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
        return slug or "playbook_template"

    def _execution_read(self, execution: PlaybookExecution) -> PlaybookExecutionRead:
        return PlaybookExecutionRead.model_validate(execution).model_copy(update={"tasks": [self._task_read(task) for task in execution.tasks]})

    @staticmethod
    def _template_snapshot(template: PlaybookTemplate) -> dict[str, Any]:
        return {
            "id": template.id,
            "name": template.name,
            "objective": template.objective,
            "version": template.version,
            "is_active": template.is_active,
            "signal_types": template.signal_types,
            "weak_metrics": template.weak_metrics,
            "default_owner_rule": template.default_owner_rule,
            "due_date_rule": template.due_date_rule,
            "success_criteria": template.success_criteria,
            "skip_rules": template.skip_rules,
            "activities": [
                {
                    "id": activity.id,
                    "title": activity.title,
                    "owner_rule": activity.owner_rule,
                    "due_offset_days": activity.due_offset_days,
                    "priority": activity.priority,
                    "success_criteria": activity.success_criteria,
                    "skip_allowed": activity.skip_allowed,
                    "requires_evidence": activity.requires_evidence,
                    "sort_order": activity.sort_order,
                }
                for activity in sorted(template.activities, key=lambda item: item.sort_order)
            ],
        }

    @staticmethod
    def _execution_snapshot(execution: PlaybookExecution) -> dict[str, Any]:
        return {
            "template_id": execution.template_id,
            "account_id": execution.account_id,
            "engagement_id": execution.engagement_id,
            "source_signal_id": execution.source_signal_id,
            "source_metric": execution.source_metric,
            "tasks": [task.id for task in execution.tasks],
        }

    @staticmethod
    def _task_snapshot(task: Task) -> dict[str, Any]:
        return {
            "account_id": task.account_id,
            "engagement_id": task.engagement_id,
            "title": task.title,
            "owner_id": task.owner_id,
            "due_at": task.due_at.isoformat() if task.due_at else None,
            "status": task.status,
            "priority": task.priority,
            "outcome": task.outcome,
        }

    def _notify_task_created(self, task: Task, account: Account, current_user: User) -> None:
        owner = self._notification_user(task.owner_id)
        if owner is None or owner.id == current_user.id:
            return
        self.notifications.queue_notification(
            recipient=owner,
            trigger="task_created",
            title=f"New task assigned: {task.title}",
            body=f"{current_user.full_name} created a task for {account.name}.",
            account=account,
            source_record_type="task",
            source_record_id=task.id,
            source_record_route=f"/tasks?selected={task.id}",
            priority=task.priority,
            delivery_metadata={"task_id": task.id, "created_by_id": current_user.id},
            deduplication_key=f"task_created:{task.id}:{owner.id}",
            in_app_only=True,
        )

    def _notify_task_assigned(self, task: Task, account: Account, current_user: User, *, previous_owner_id: str | None) -> None:
        owner = self._notification_user(task.owner_id)
        previous_owner = self._notification_user(previous_owner_id)
        if owner is not None and owner.id != current_user.id:
            self.notifications.queue_notification(
                recipient=owner,
                trigger="task_reassigned" if previous_owner_id else "task_assigned",
                title=f"Task assigned: {task.title}",
                body=f"{current_user.full_name} assigned you a task for {account.name}.",
                account=account,
                source_record_type="task",
                source_record_id=task.id,
                source_record_route=f"/tasks?selected={task.id}",
                priority=task.priority,
                delivery_metadata={"task_id": task.id, "previous_owner_id": previous_owner_id},
                deduplication_key=f"task_assigned:{task.id}:{owner.id}:{task.updated_at.isoformat()}",
                in_app_only=True,
            )
        if previous_owner is not None and previous_owner.id not in {current_user.id, owner.id if owner else None}:
            self.notifications.queue_notification(
                recipient=previous_owner,
                trigger="task_reassigned",
                title=f"Task reassigned: {task.title}",
                body=f"{current_user.full_name} reassigned your task for {account.name}.",
                account=account,
                source_record_type="task",
                source_record_id=task.id,
                source_record_route=f"/tasks?selected={task.id}",
                priority=task.priority,
                delivery_metadata={"task_id": task.id, "new_owner_id": task.owner_id},
                deduplication_key=f"task_reassigned:{task.id}:{previous_owner.id}:{task.updated_at.isoformat()}",
                in_app_only=True,
            )

    def _notification_user(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        user = self.accounts.get_user(user_id)
        return user if user and user.is_active else None

    def _write_timeline(
        self,
        account_id: str,
        engagement_id: str | None,
        actor: User,
        action: str,
        title: str,
        description: str,
        source_id: str,
        source_type: str,
        *,
        before: dict | None = None,
        after: dict | None = None,
    ):
        return self.timeline.add_account_event(
            account_id=account_id,
            engagement_id=engagement_id,
            event_type=action,
            module=MODULE,
            title=title,
            description=description,
            actor=actor,
            source_record_id=source_id,
            source_record_type=source_type,
            source_record_route="/tasks" if source_type == "task" else "/playbook",
            before_value=before,
            after_value=after,
            metadata={"action": action},
        )

    @staticmethod
    def _task_calendar_item(task: Task) -> CalendarItemRead:
        account_name = task.account.name if task.account else "Account"
        return CalendarItemRead(
            id=f"task:{task.id}",
            kind="task",
            title=task.title,
            detail=task.description or task.notes or "Task due date.",
            account_id=task.account_id,
            account_name=account_name,
            engagement_id=task.engagement_id,
            owner_id=task.owner_id,
            owner_name=task.owner_name,
            date=task.due_at,
            status=task.status,
            priority=task.priority,
            source_route="/tasks",
            source_record_id=task.id,
            source_record_type="task",
        )

    @staticmethod
    def _governance_calendar_item(event) -> CalendarItemRead:
        return CalendarItemRead(
            id=f"governance:{event.id}",
            kind="governance",
            title=event.governance_type,
            detail=event.agenda or event.notes or "Governance event.",
            account_id=event.account_id,
            account_name=event.account.name if event.account else "Unmapped account",
            engagement_id=event.engagement_id,
            owner_id=event.owner_id,
            owner_name=event.owner_name,
            date=event.scheduled_at,
            status=event.status,
            priority=None,
            source_route=f"/governance?selected={event.id}",
            source_record_id=event.id,
            source_record_type="governance_event",
        )

    @staticmethod
    def _governance_action_calendar_item(action) -> CalendarItemRead:
        event = action.event
        return CalendarItemRead(
            id=f"governance-action:{action.id}",
            kind="governance_action",
            title=action.title,
            detail=f"Action item from {event.governance_type}.",
            account_id=event.account_id,
            account_name=event.account.name if event and event.account else "Unmapped account",
            engagement_id=event.engagement_id if event else None,
            owner_id=action.owner_id,
            owner_name=action.owner_name,
            date=action.due_at,
            status=action.status,
            priority=action.priority,
            source_route=f"/governance?selected={event.id}" if event else "/governance",
            source_record_id=action.id,
            source_record_type="governance_action_item",
        )

    @staticmethod
    def _engagement_calendar_items(engagement: Engagement) -> list[CalendarItemRead]:
        account_name = engagement.account.name if engagement.account else "Account"
        rows: list[tuple[str, datetime | None, str]] = [
            ("sow_expiry", engagement.end_date, "SOW expiry"),
            ("renewal_date", engagement.renewal_date, "Renewal date"),
            ("notice_deadline", engagement.notice_deadline, "Notice deadline"),
        ]
        return [
            CalendarItemRead(
                id=f"{kind}:{engagement.id}",
                kind=kind,
                title=f"{label}: {engagement.name}",
                detail=engagement.commercial_context or engagement.source_citation or label,
                account_id=engagement.account_id,
                account_name=account_name,
                engagement_id=engagement.id,
                owner_id=engagement.owner_id,
                owner_name=engagement.owner_name,
                date=date_value,
                status=engagement.status,
                priority="high" if kind == "notice_deadline" else "medium",
                source_route=f"/accounts/{engagement.account_id}?tab=engagements",
                source_record_id=engagement.id,
                source_record_type="engagement",
            )
            for kind, date_value, label in rows
            if date_value is not None
        ]
