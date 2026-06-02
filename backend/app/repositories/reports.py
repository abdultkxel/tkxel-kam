from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import Account, Escalation, Opportunity, ReportDefinition, ReportRun, ReportSchedule, Signal, Task


class ReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_reports(
        self,
        *,
        owner_id: str | None,
        include_shared: bool = True,
        include_all: bool = False,
        search: str | None = None,
        data_source: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ReportDefinition], int]:
        conditions = []
        if not include_all and owner_id:
            visibility = [ReportDefinition.owner_id == owner_id]
            if include_shared:
                visibility.append(ReportDefinition.visibility == "shared")
            conditions.append(or_(*visibility))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(ReportDefinition.name.ilike(term), ReportDefinition.description.ilike(term), ReportDefinition.owner_name.ilike(term)))
        if data_source:
            conditions.append(ReportDefinition.data_source == data_source)
        total = self.db.scalar(select(func.count(ReportDefinition.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(ReportDefinition)
                .where(*conditions)
                .order_by(ReportDefinition.updated_at.desc(), ReportDefinition.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_report(self, report_id: str) -> ReportDefinition | None:
        return self.db.get(ReportDefinition, report_id)

    def save_report(self, report: ReportDefinition) -> ReportDefinition:
        self.db.add(report)
        self.db.flush()
        return report

    def delete_report(self, report: ReportDefinition) -> None:
        self.db.delete(report)
        self.db.flush()

    def save_run(self, run: ReportRun) -> ReportRun:
        self.db.add(run)
        self.db.flush()
        return run

    def list_runs(self, report_id: str, page: int = 1, page_size: int = 25, *, viewer_user_id: str | None = None, include_all: bool = False) -> tuple[list[ReportRun], int]:
        conditions = [ReportRun.report_id == report_id]
        if viewer_user_id and not include_all:
            conditions.append(or_(ReportRun.generated_by_id == viewer_user_id, cast(ReportRun.recipients_json, String).ilike(f'%"{viewer_user_id}"%')))
        total = self.db.scalar(select(func.count(ReportRun.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(ReportRun)
                .where(*conditions)
                .order_by(ReportRun.generated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_schedule(self, schedule: ReportSchedule) -> ReportSchedule:
        self.db.add(schedule)
        self.db.flush()
        return schedule

    def get_schedule(self, schedule_id: str) -> ReportSchedule | None:
        return self.db.get(ReportSchedule, schedule_id)

    def list_schedules(self, *, report_id: str | None = None, viewer_user_id: str | None = None, include_all: bool = False, page: int = 1, page_size: int = 25) -> tuple[list[ReportSchedule], int]:
        conditions = []
        if viewer_user_id and not include_all:
            conditions.append(or_(ReportSchedule.owner_id == viewer_user_id, cast(ReportSchedule.recipients_json, String).ilike(f'%"{viewer_user_id}"%')))
        if report_id:
            conditions.append(ReportSchedule.report_id == report_id)
        total = self.db.scalar(select(func.count(ReportSchedule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(ReportSchedule)
                .where(*conditions)
                .order_by(ReportSchedule.updated_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_due_schedules(self, now: datetime) -> list[ReportSchedule]:
        return list(self.db.scalars(select(ReportSchedule).where(ReportSchedule.is_active.is_(True), ReportSchedule.next_run_at <= now).order_by(ReportSchedule.next_run_at).limit(25)))

    def list_source_records(
        self,
        *,
        data_source: str,
        account_ids: list[str] | None,
        filters: dict,
        sort: str | None,
        direction: str,
        page: int,
        page_size: int,
    ) -> tuple[list, int]:
        model = {
            "accounts": Account,
            "tasks": Task,
            "signals": Signal,
            "escalations": Escalation,
            "opportunities": Opportunity,
        }[data_source]
        conditions = self._source_conditions(model, data_source=data_source, account_ids=account_ids, filters=filters)
        total = self.db.scalar(select(func.count(model.id)).where(*conditions)) or 0
        order_column = getattr(model, sort, None) if sort else None
        if order_column is None:
            order_column = getattr(model, "updated_at", None)
        if order_column is None:
            order_column = getattr(model, "created_at")
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(model)
                .where(*conditions)
                .order_by(order_column)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _source_conditions(model, *, data_source: str, account_ids: list[str] | None, filters: dict) -> list:
        conditions = []
        if account_ids is not None:
            if data_source == "accounts":
                conditions.append(model.id.in_(account_ids) if account_ids else False)
            else:
                conditions.append(model.account_id.in_(account_ids) if account_ids else False)
        search = filters.get("search")
        if search and isinstance(search, str):
            term = f"%{search.strip()}%"
            if data_source == "accounts":
                conditions.append(or_(Account.name.ilike(term), Account.project_name.ilike(term), Account.segment.ilike(term)))
            elif data_source == "tasks":
                conditions.append(or_(Task.title.ilike(term), Task.description.ilike(term), Task.owner_name.ilike(term)))
            elif data_source == "signals":
                conditions.append(or_(Signal.title.ilike(term), Signal.detail.ilike(term), Signal.owner_name.ilike(term)))
            elif data_source == "escalations":
                conditions.append(or_(Escalation.summary.ilike(term), Escalation.impact.ilike(term), Escalation.owner_name.ilike(term)))
            elif data_source == "opportunities":
                conditions.append(or_(Opportunity.name.ilike(term), Opportunity.service_line.ilike(term), Opportunity.owner_name.ilike(term)))
        for key in ("status", "risk_status", "severity", "priority", "stage", "segment", "region", "lifecycle_status", "owner_id"):
            value = filters.get(key)
            if value and hasattr(model, key):
                conditions.append(getattr(model, key) == value)
        if data_source == "accounts":
            conditions.append(Account.archived_at.is_(None))
        if data_source == "opportunities":
            conditions.append(Opportunity.archived_at.is_(None))
        return conditions
