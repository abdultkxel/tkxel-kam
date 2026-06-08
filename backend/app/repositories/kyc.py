from datetime import datetime, timedelta, timezone

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import KycAgentRun, KycConfiguration, KycDraft, KycSnapshot, KycWorkstreamOutput


class KycRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_configuration(self) -> KycConfiguration | None:
        return self.db.scalar(select(KycConfiguration).where(KycConfiguration.name == "default"))

    def save_configuration(self, configuration: KycConfiguration) -> KycConfiguration:
        self.db.add(configuration)
        self.db.flush()
        return configuration

    def list_drafts(
        self,
        account_id: str,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        confidence_level: str | None = None,
        missing_fields: bool | None = None,
        stale_status: str | None = None,
        reviewer: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
        freshness_threshold_days: int = 90,
    ) -> tuple[list[KycDraft], int]:
        conditions = self._draft_conditions(
            account_id,
            search=search,
            status_filter=status_filter,
            confidence_level=confidence_level,
            missing_fields=missing_fields,
            stale_status=stale_status,
            reviewer=reviewer,
            created_from=created_from,
            created_to=created_to,
            freshness_threshold_days=freshness_threshold_days,
        )
        total = self.db.scalar(select(func.count(KycDraft.id)).where(*conditions)) or 0
        order_column = {
            "created_at": KycDraft.created_at,
            "updated_at": KycDraft.updated_at,
            "confidence": KycDraft.confidence,
            "completeness": KycDraft.completeness,
        }.get(sort, KycDraft.created_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(KycDraft)
                .where(*conditions)
                .options(selectinload(KycDraft.agent_run).selectinload(KycAgentRun.workstreams))
                .order_by(order_column, KycDraft.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_draft(self, draft_id: str) -> KycDraft | None:
        return self.db.scalar(
            select(KycDraft)
            .where(KycDraft.id == draft_id)
            .options(selectinload(KycDraft.agent_run).selectinload(KycAgentRun.workstreams))
        )

    def latest_ready_draft(self, account_id: str) -> KycDraft | None:
        return self.db.scalar(
            select(KycDraft)
            .where(KycDraft.account_id == account_id, KycDraft.status == "ready_for_review")
            .options(selectinload(KycDraft.agent_run).selectinload(KycAgentRun.workstreams))
            .order_by(KycDraft.updated_at.desc(), KycDraft.created_at.desc())
            .limit(1)
        )

    def save_draft(self, draft: KycDraft) -> KycDraft:
        self.db.add(draft)
        self.db.flush()
        return draft

    def latest_snapshot(self, account_id: str) -> KycSnapshot | None:
        return self.db.scalar(
            select(KycSnapshot)
            .where(KycSnapshot.account_id == account_id)
            .order_by(KycSnapshot.version.desc())
            .limit(1)
        )

    def list_snapshots(
        self,
        account_id: str,
        *,
        search: str | None = None,
        approver: str | None = None,
        source: str | None = None,
        confidence_level: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "approved_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[KycSnapshot], int]:
        conditions = self._snapshot_conditions(
            account_id,
            search=search,
            approver=approver,
            source=source,
            confidence_level=confidence_level,
            date_from=date_from,
            date_to=date_to,
        )
        total = self.db.scalar(select(func.count(KycSnapshot.id)).where(*conditions)) or 0
        order_column = {
            "approved_at": KycSnapshot.approved_at,
            "version": KycSnapshot.version,
            "confidence": KycSnapshot.confidence,
            "completeness": KycSnapshot.completeness,
        }.get(sort, KycSnapshot.approved_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(KycSnapshot)
                .where(*conditions)
                .order_by(order_column, KycSnapshot.version.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_snapshot(self, snapshot_id: str) -> KycSnapshot | None:
        return self.db.get(KycSnapshot, snapshot_id)

    def save_snapshot(self, snapshot: KycSnapshot) -> KycSnapshot:
        self.db.add(snapshot)
        self.db.flush()
        return snapshot

    def list_agent_runs(
        self,
        account_id: str,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        workstream: str | None = None,
        triggered_by: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[KycAgentRun], int]:
        conditions = self._agent_run_conditions(
            account_id,
            search=search,
            status_filter=status_filter,
            workstream=workstream,
            triggered_by=triggered_by,
            date_from=date_from,
            date_to=date_to,
        )
        total = self.db.scalar(select(func.count(KycAgentRun.id)).where(*conditions)) or 0
        order_column = KycAgentRun.created_at if sort == "created_at" else KycAgentRun.updated_at
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(KycAgentRun)
                .where(*conditions)
                .options(selectinload(KycAgentRun.workstreams))
                .order_by(order_column, KycAgentRun.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_agent_run(self, run_id: str) -> KycAgentRun | None:
        return self.db.scalar(
            select(KycAgentRun)
            .where(KycAgentRun.id == run_id)
            .options(selectinload(KycAgentRun.workstreams))
        )

    def latest_agent_run(self, account_id: str) -> KycAgentRun | None:
        return self.db.scalar(
            select(KycAgentRun)
            .where(KycAgentRun.account_id == account_id)
            .options(selectinload(KycAgentRun.workstreams))
            .order_by(KycAgentRun.created_at.desc())
            .limit(1)
        )

    def active_agent_run(self, account_id: str) -> KycAgentRun | None:
        return self.db.scalar(
            select(KycAgentRun)
            .where(KycAgentRun.account_id == account_id, KycAgentRun.status.in_(("pending", "running")))
            .options(selectinload(KycAgentRun.workstreams))
            .order_by(KycAgentRun.created_at.desc())
            .limit(1)
        )

    def due_agent_runs(self, *, limit: int = 1) -> list[KycAgentRun]:
        now = datetime.now(timezone.utc)
        return list(
            self.db.scalars(
                select(KycAgentRun)
                .where(
                    or_(
                        KycAgentRun.status == "pending",
                        and_(KycAgentRun.status == "failed", KycAgentRun.retry_count < KycAgentRun.max_retries),
                    ),
                    or_(KycAgentRun.next_retry_at.is_(None), KycAgentRun.next_retry_at <= now),
                )
                .options(selectinload(KycAgentRun.workstreams))
                .order_by(KycAgentRun.queued_at.asc().nulls_last(), KycAgentRun.created_at.asc())
                .limit(limit)
            )
        )

    def save_agent_run(self, run: KycAgentRun) -> KycAgentRun:
        self.db.add(run)
        self.db.flush()
        return run

    def save_workstream(self, output: KycWorkstreamOutput) -> KycWorkstreamOutput:
        self.db.add(output)
        self.db.flush()
        return output

    def drafts_for_run(self, run_id: str) -> list[KycDraft]:
        return list(
            self.db.scalars(
                select(KycDraft)
                .where(KycDraft.agent_run_id == run_id)
                .options(selectinload(KycDraft.agent_run).selectinload(KycAgentRun.workstreams))
            )
        )

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _confidence_condition(model, confidence_level: str | None):
        if confidence_level == "low":
            return model.confidence < 70
        if confidence_level == "medium":
            return model.confidence >= 70, model.confidence < 85
        if confidence_level == "high":
            return model.confidence >= 85
        return None

    @classmethod
    def _add_confidence_condition(cls, conditions: list, model, confidence_level: str | None) -> None:
        condition = cls._confidence_condition(model, confidence_level)
        if condition is None:
            return
        if isinstance(condition, tuple):
            conditions.extend(condition)
            return
        conditions.append(condition)

    @classmethod
    def _draft_conditions(
        cls,
        account_id: str,
        *,
        search: str | None,
        status_filter: str | None,
        confidence_level: str | None,
        missing_fields: bool | None,
        stale_status: str | None,
        reviewer: str | None,
        created_from: datetime | None,
        created_to: datetime | None,
        freshness_threshold_days: int,
    ) -> list:
        conditions = [KycDraft.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    cast(KycDraft.fields_json, String).ilike(term),
                    cast(KycDraft.citations_json, String).ilike(term),
                    cast(KycDraft.missing_fields, String).ilike(term),
                    cast(KycDraft.conflicts, String).ilike(term),
                    cast(KycDraft.difference_summary, String).ilike(term),
                    KycDraft.detailed_description.ilike(term),
                )
            )
        if status_filter:
            conditions.append(KycDraft.status == status_filter)
        cls._add_confidence_condition(conditions, KycDraft, confidence_level)
        if missing_fields is True:
            conditions.append(cast(KycDraft.missing_fields, String) != "[]")
        if missing_fields is False:
            conditions.append(cast(KycDraft.missing_fields, String) == "[]")
        if stale_status == "stale":
            conditions.append(KycDraft.created_at <= datetime.now(timezone.utc) - timedelta(days=freshness_threshold_days))
        if stale_status == "fresh":
            conditions.append(KycDraft.created_at > datetime.now(timezone.utc) - timedelta(days=freshness_threshold_days))
        if reviewer:
            conditions.append(or_(KycDraft.reviewed_by_id == reviewer, KycDraft.created_by_id == reviewer, KycDraft.approved_by_id == reviewer, KycDraft.rejected_by_id == reviewer))
        if created_from:
            conditions.append(KycDraft.created_at >= created_from)
        if created_to:
            conditions.append(KycDraft.created_at <= created_to)
        return conditions

    @classmethod
    def _snapshot_conditions(
        cls,
        account_id: str,
        *,
        search: str | None,
        approver: str | None,
        source: str | None,
        confidence_level: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list:
        conditions = [KycSnapshot.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    cast(KycSnapshot.fields_json, String).ilike(term),
                    cast(KycSnapshot.citations_json, String).ilike(term),
                    cast(KycSnapshot.missing_fields, String).ilike(term),
                    cast(KycSnapshot.conflicts, String).ilike(term),
                    cast(KycSnapshot.change_summary, String).ilike(term),
                    KycSnapshot.detailed_description.ilike(term),
                )
            )
        if approver:
            conditions.append(KycSnapshot.approved_by_id == approver)
        if source and source.strip():
            term = f"%{source.strip()}%"
            conditions.append(or_(cast(KycSnapshot.source_context, String).ilike(term), cast(KycSnapshot.research_sources, String).ilike(term)))
        cls._add_confidence_condition(conditions, KycSnapshot, confidence_level)
        if date_from:
            conditions.append(KycSnapshot.approved_at >= date_from)
        if date_to:
            conditions.append(KycSnapshot.approved_at <= date_to)
        return conditions

    @staticmethod
    def _agent_run_conditions(
        account_id: str,
        *,
        search: str | None,
        status_filter: str | None,
        workstream: str | None,
        triggered_by: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list:
        conditions = [KycAgentRun.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                KycAgentRun.workstreams.any(
                    or_(
                        cast(KycWorkstreamOutput.output_json, String).ilike(term),
                        cast(KycWorkstreamOutput.citations_json, String).ilike(term),
                        cast(KycWorkstreamOutput.missing_fields, String).ilike(term),
                    )
                )
            )
        if status_filter:
            conditions.append(KycAgentRun.status == status_filter)
        if workstream:
            conditions.append(KycAgentRun.workstreams.any(KycWorkstreamOutput.workstream_key == workstream))
        if triggered_by:
            conditions.append(KycAgentRun.triggered_by_id == triggered_by)
        if date_from:
            conditions.append(KycAgentRun.created_at >= date_from)
        if date_to:
            conditions.append(KycAgentRun.created_at <= date_to)
        return conditions
