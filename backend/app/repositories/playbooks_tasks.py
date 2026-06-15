from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Account,
    Engagement,
    GovernanceActionItem,
    GovernanceEvent,
    PlaybookExecution,
    PlaybookTemplate,
    PlaybookTemplateActivity,
    Task,
    TaskEvidence,
    TaskHistory,
    User,
)


OPEN_TASK_STATUSES = ("open", "todo")
CANCELLED_TASK_STATUSES = ("cancelled", "skipped")


class PlaybooksTasksRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_templates(
        self,
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
    ) -> tuple[list[PlaybookTemplate], int]:
        conditions = self._template_conditions(search=search, active_state=active_state, signal_type=signal_type, weak_metric=weak_metric, owner_rule=owner_rule)
        total = self.db.scalar(select(func.count(PlaybookTemplate.id)).where(*conditions)) or 0
        order_column = {
            "name": PlaybookTemplate.name,
            "version": PlaybookTemplate.version,
            "active_state": PlaybookTemplate.is_active,
            "updated_at": PlaybookTemplate.updated_at,
            "created_at": PlaybookTemplate.created_at,
        }.get(sort, PlaybookTemplate.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(PlaybookTemplate)
                .where(*conditions)
                .options(selectinload(PlaybookTemplate.activities))
                .order_by(order_column, PlaybookTemplate.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_template(self, template_id: str) -> PlaybookTemplate | None:
        return self.db.scalar(
            select(PlaybookTemplate)
            .where(PlaybookTemplate.id == template_id)
            .options(selectinload(PlaybookTemplate.activities))
        )

    def get_template_by_slug(self, slug: str) -> PlaybookTemplate | None:
        return self.db.scalar(select(PlaybookTemplate).where(PlaybookTemplate.slug == slug))

    def save_template(self, template: PlaybookTemplate) -> PlaybookTemplate:
        self.db.add(template)
        self.db.flush()
        return template

    def replace_template_activities(self, template: PlaybookTemplate, activities: list[PlaybookTemplateActivity]) -> None:
        template.activities.clear()
        self.db.flush()
        for activity in activities:
            template.activities.append(activity)
        self.db.flush()

    def save_execution(self, execution: PlaybookExecution) -> PlaybookExecution:
        self.db.add(execution)
        self.db.flush()
        return execution

    def get_execution(self, execution_id: str) -> PlaybookExecution | None:
        return self.db.scalar(
            select(PlaybookExecution)
            .where(PlaybookExecution.id == execution_id)
            .options(selectinload(PlaybookExecution.tasks).selectinload(Task.evidence))
        )

    def list_tasks(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
        engagement_id: str | None = None,
        owner_id: str | None = None,
        status_filter: str | None = None,
        priority: str | None = None,
        source_type: str | None = None,
        due_from: datetime | None = None,
        due_to: datetime | None = None,
        search: str | None = None,
        my_items: bool = False,
        current_user_id: str | None = None,
        sort: str = "due_at",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Task], int]:
        conditions = self._task_conditions(
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
            current_user_id=current_user_id,
        )
        total = self.db.scalar(select(func.count(Task.id)).where(*conditions)) or 0
        priority_order = {"critical": 0, "urgent": 0, "high": 1, "medium": 2, "low": 3}
        order_column = {
            "due_at": Task.due_at,
            "status": Task.status,
            "updated_at": Task.updated_at,
            "created_at": Task.created_at,
            "priority": Task.priority,
        }.get(sort, Task.due_at)
        if direction == "desc":
            order_column = order_column.desc()
        tasks = list(
            self.db.scalars(
                select(Task)
                .where(*conditions)
                .options(selectinload(Task.evidence))
                .order_by(order_column, Task.due_at, Task.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        if sort == "priority":
            tasks.sort(key=lambda item: priority_order.get(item.priority, 99), reverse=direction == "desc")
        return tasks, total

    def list_tasks_for_calendar(
        self,
        *,
        account_ids: list[str] | None,
        date_from: datetime | None,
        date_to: datetime | None,
        owner_id: str | None = None,
    ) -> list[Task]:
        conditions = []
        if account_ids is not None:
            conditions.append(Task.account_id.in_(account_ids) if account_ids else False)
        if owner_id:
            conditions.append(Task.owner_id == owner_id)
        if date_from:
            conditions.append(Task.due_at >= date_from)
        if date_to:
            conditions.append(Task.due_at <= date_to)
        return list(
            self.db.scalars(
                select(Task)
                .where(*conditions)
                .options(selectinload(Task.evidence), selectinload(Task.account), selectinload(Task.engagement))
                .order_by(Task.due_at)
                .limit(1000)
            )
        )

    def get_task(self, task_id: str) -> Task | None:
        return self.db.scalar(select(Task).where(Task.id == task_id).options(selectinload(Task.evidence), selectinload(Task.history), selectinload(Task.account), selectinload(Task.engagement)))

    def save_task(self, task: Task) -> Task:
        self.db.add(task)
        self.db.flush()
        return task

    def delete_task(self, task: Task) -> None:
        self.db.delete(task)
        self.db.flush()

    def add_evidence(self, evidence: TaskEvidence) -> TaskEvidence:
        self.db.add(evidence)
        self.db.flush()
        return evidence

    def add_history(self, history: TaskHistory) -> TaskHistory:
        self.db.add(history)
        self.db.flush()
        return history

    def list_task_history(self, task_id: str, *, page: int = 1, page_size: int = 50) -> tuple[list[TaskHistory], int]:
        total = self.db.scalar(select(func.count(TaskHistory.id)).where(TaskHistory.task_id == task_id)) or 0
        items = list(
            self.db.scalars(
                select(TaskHistory)
                .where(TaskHistory.task_id == task_id)
                .order_by(TaskHistory.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_governance_events_for_calendar(self, *, account_ids: list[str] | None, date_from: datetime | None, date_to: datetime | None) -> list[GovernanceEvent]:
        conditions = []
        if account_ids is not None:
            conditions.append(GovernanceEvent.account_id.in_(account_ids) if account_ids else False)
        if date_from:
            conditions.append(GovernanceEvent.scheduled_at >= date_from)
        if date_to:
            conditions.append(GovernanceEvent.scheduled_at <= date_to)
        return list(
            self.db.scalars(
                select(GovernanceEvent)
                .where(*conditions)
                .options(selectinload(GovernanceEvent.account), selectinload(GovernanceEvent.action_items))
                .order_by(GovernanceEvent.scheduled_at)
                .limit(1000)
            )
        )

    def list_governance_actions_for_calendar(self, *, account_ids: list[str] | None, date_from: datetime | None, date_to: datetime | None) -> list[GovernanceActionItem]:
        conditions = []
        if date_from:
            conditions.append(GovernanceActionItem.due_at >= date_from)
        if date_to:
            conditions.append(GovernanceActionItem.due_at <= date_to)
        query = select(GovernanceActionItem).options(selectinload(GovernanceActionItem.event).selectinload(GovernanceEvent.account)).order_by(GovernanceActionItem.due_at).limit(1000)
        if account_ids is not None:
            query = query.join(GovernanceEvent).where(GovernanceEvent.account_id.in_(account_ids) if account_ids else False)
        if conditions:
            query = query.where(*conditions)
        return list(self.db.scalars(query))

    def list_engagements_for_calendar(self, *, account_ids: list[str] | None, date_from: datetime | None, date_to: datetime | None) -> list[Engagement]:
        conditions = [Engagement.archived_at.is_(None)]
        if account_ids is not None:
            conditions.append(Engagement.account_id.in_(account_ids) if account_ids else False)
        if date_from or date_to:
            conditions.append(
                or_(
                    self._date_in_range(Engagement.end_date, date_from, date_to),
                    self._date_in_range(Engagement.renewal_date, date_from, date_to),
                    self._date_in_range(Engagement.notice_deadline, date_from, date_to),
                )
            )
        return list(
            self.db.scalars(
                select(Engagement)
                .where(*conditions)
                .options(selectinload(Engagement.account))
                .order_by(Engagement.renewal_date, Engagement.end_date)
                .limit(1000)
            )
        )

    def get_user(self, user_id: str | None) -> User | None:
        return self.db.get(User, user_id) if user_id else None

    def get_account(self, account_id: str) -> Account | None:
        return self.db.scalar(select(Account).where(Account.id == account_id).options(selectinload(Account.owners), selectinload(Account.engagements)))

    def get_engagement(self, engagement_id: str | None) -> Engagement | None:
        return self.db.get(Engagement, engagement_id) if engagement_id else None

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _template_conditions(*, search: str | None, active_state: str, signal_type: str | None, weak_metric: str | None, owner_rule: str | None) -> list:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    PlaybookTemplate.name.ilike(term),
                    PlaybookTemplate.slug.ilike(term),
                    PlaybookTemplate.objective.ilike(term),
                    PlaybookTemplate.description.ilike(term),
                    PlaybookTemplate.activities.any(PlaybookTemplateActivity.title.ilike(term)),
                )
            )
        if active_state == "active":
            conditions.append(PlaybookTemplate.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(PlaybookTemplate.is_active.is_(False))
        if signal_type:
            conditions.append(cast(PlaybookTemplate.signal_types, String).ilike(f"%{signal_type}%"))
        if weak_metric:
            conditions.append(cast(PlaybookTemplate.weak_metrics, String).ilike(f"%{weak_metric}%"))
        if owner_rule:
            conditions.append(PlaybookTemplate.default_owner_rule == owner_rule)
        return conditions

    @staticmethod
    def _task_conditions(
        *,
        account_id: str | None,
        account_ids: list[str] | None,
        engagement_id: str | None,
        owner_id: str | None,
        status_filter: str | None,
        priority: str | None,
        source_type: str | None,
        due_from: datetime | None,
        due_to: datetime | None,
        search: str | None,
        my_items: bool,
        current_user_id: str | None,
    ) -> list:
        conditions = []
        if account_id:
            conditions.append(Task.account_id == account_id)
        if account_ids is not None:
            conditions.append(Task.account_id.in_(account_ids) if account_ids else False)
        if engagement_id:
            conditions.append(Task.engagement_id == engagement_id)
        if owner_id:
            conditions.append(Task.owner_id == owner_id)
        if my_items and current_user_id:
            conditions.append(Task.owner_id == current_user_id)
        if status_filter:
            normalized_status = status_filter.strip()
            if normalized_status == "open":
                conditions.append(Task.status.in_(OPEN_TASK_STATUSES))
            elif normalized_status == "cancelled":
                conditions.append(Task.status.in_(CANCELLED_TASK_STATUSES))
            else:
                conditions.append(Task.status == normalized_status)
        if priority:
            conditions.append(Task.priority == priority)
        if source_type:
            conditions.append(Task.source_type == source_type)
        if due_from:
            conditions.append(Task.due_at >= due_from)
        if due_to:
            conditions.append(Task.due_at <= due_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Task.title.ilike(term),
                    Task.description.ilike(term),
                    Task.notes.ilike(term),
                    Task.outcome.ilike(term),
                    Task.owner_name.ilike(term),
                    Task.account.has(Account.name.ilike(term)),
                    Task.evidence.any(TaskEvidence.body.ilike(term)),
                    Task.evidence.any(TaskEvidence.title.ilike(term)),
                    Task.evidence.any(TaskEvidence.url.ilike(term)),
                    Task.evidence.any(TaskEvidence.file_name.ilike(term)),
                )
            )
        return conditions

    @staticmethod
    def _date_in_range(column, date_from: datetime | None, date_to: datetime | None):
        conditions = [column.is_not(None)]
        if date_from:
            conditions.append(column >= date_from)
        if date_to:
            conditions.append(column <= date_to)
        from sqlalchemy import and_

        return and_(*conditions)
