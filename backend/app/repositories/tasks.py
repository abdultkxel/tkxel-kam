from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import PlaybookExecution, PlaybookTemplate, PlaybookTemplateVersion, Task, TaskEvidence, TaskHistory


class TasksRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_templates(
        self,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        signal_type: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[PlaybookTemplate], int]:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(PlaybookTemplate.name.ilike(term), PlaybookTemplate.slug.ilike(term), PlaybookTemplate.objective.ilike(term)))
        if status_filter:
            conditions.append(PlaybookTemplate.status == status_filter)
        if signal_type:
            conditions.append(PlaybookTemplate.signal_types.contains([signal_type]))
        if active_state == "active":
            conditions.append(PlaybookTemplate.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(PlaybookTemplate.is_active.is_(False))

        total = self.db.scalar(select(func.count(PlaybookTemplate.id)).where(*conditions)) or 0
        order_column = {
            "name": PlaybookTemplate.name,
            "status": PlaybookTemplate.status,
            "updated_at": PlaybookTemplate.updated_at,
            "created_at": PlaybookTemplate.created_at,
        }.get(sort, PlaybookTemplate.updated_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(PlaybookTemplate)
                .where(*conditions)
                .order_by(order_column, PlaybookTemplate.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_template(self, template_id: str) -> PlaybookTemplate | None:
        return self.db.get(PlaybookTemplate, template_id)

    def get_template_by_slug(self, slug: str) -> PlaybookTemplate | None:
        return self.db.scalar(select(PlaybookTemplate).where(PlaybookTemplate.slug == slug))

    def save_template(self, template: PlaybookTemplate) -> PlaybookTemplate:
        self.db.add(template)
        self.db.flush()
        return template

    def add_template_version(self, version: PlaybookTemplateVersion) -> PlaybookTemplateVersion:
        self.db.add(version)
        self.db.flush()
        return version

    def add_execution(self, execution: PlaybookExecution) -> PlaybookExecution:
        self.db.add(execution)
        self.db.flush()
        return execution

    def get_execution(self, execution_id: str) -> PlaybookExecution | None:
        return self.db.scalar(select(PlaybookExecution).where(PlaybookExecution.id == execution_id).options(selectinload(PlaybookExecution.tasks)))

    def save_task(self, task: Task) -> Task:
        self.db.add(task)
        self.db.flush()
        return task

    def get_task(self, task_id: str) -> Task | None:
        return self.db.get(Task, task_id)

    def list_tasks(
        self,
        *,
        account_id: str | None = None,
        account_ids: list[str] | None = None,
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
        page_size: int = 10,
    ) -> tuple[list[Task], int]:
        conditions = []
        if account_id:
            conditions.append(Task.account_id == account_id)
        if account_ids is not None:
            conditions.append(Task.account_id.in_(account_ids) if account_ids else Task.account_id == "__no_access__")
        if engagement_id:
            conditions.append(Task.engagement_id == engagement_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Task.title.ilike(term), Task.description.ilike(term), Task.owner_name.ilike(term), Task.notes.ilike(term)))
        if status_filter:
            conditions.append(Task.status == status_filter)
        if priority:
            conditions.append(Task.priority == priority)
        if owner_id:
            conditions.append(Task.owner_id == owner_id)
        if source_type:
            conditions.append(Task.source_type == source_type)
        if active_only:
            conditions.append(Task.status.in_(("open", "in_progress", "blocked")))
        if due_from:
            conditions.append(Task.due_at >= due_from)
        if due_to:
            conditions.append(Task.due_at <= due_to)

        total = self.db.scalar(select(func.count(Task.id)).where(*conditions)) or 0
        order_column = {
            "due_at": Task.due_at,
            "priority": Task.priority,
            "status": Task.status,
            "owner_name": Task.owner_name,
            "updated_at": Task.updated_at,
            "created_at": Task.created_at,
        }.get(sort, Task.due_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(Task)
                .where(*conditions)
                .order_by(order_column, Task.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_evidence(self, evidence: TaskEvidence) -> TaskEvidence:
        self.db.add(evidence)
        self.db.flush()
        return evidence

    def add_history(self, history: TaskHistory) -> TaskHistory:
        self.db.add(history)
        self.db.flush()
        return history

    def commit(self) -> None:
        self.db.commit()

    def flush(self) -> None:
        self.db.flush()
