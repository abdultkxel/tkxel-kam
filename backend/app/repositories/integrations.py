from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AiGatewayRun,
    FathomTaskSuggestion,
    IntegrationConnection,
    IntegrationImportedItem,
    IntegrationMappingRule,
    IntegrationSyncLog,
    IntegrationSyncRun,
)


class IntegrationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_connection(self, provider: str) -> IntegrationConnection | None:
        return self.db.scalar(select(IntegrationConnection).where(IntegrationConnection.provider == provider))

    def list_connections(self) -> list[IntegrationConnection]:
        return list(self.db.scalars(select(IntegrationConnection).order_by(IntegrationConnection.provider)))

    def save_connection(self, connection: IntegrationConnection) -> IntegrationConnection:
        self.db.add(connection)
        self.db.flush()
        return connection

    def add_sync_run(self, run: IntegrationSyncRun) -> IntegrationSyncRun:
        self.db.add(run)
        self.db.flush()
        return run

    def get_sync_run(self, run_id: str) -> IntegrationSyncRun | None:
        return self.db.get(IntegrationSyncRun, run_id)

    def list_sync_runs(
        self,
        *,
        provider: str | None = None,
        status: str | None = None,
        failure_type: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[IntegrationSyncRun], int]:
        conditions = []
        if provider:
            conditions.append(IntegrationSyncRun.provider == provider)
        if status:
            conditions.append(IntegrationSyncRun.status == status)
        if failure_type:
            conditions.append(IntegrationSyncRun.failure_type == failure_type)
        if date_from:
            conditions.append(IntegrationSyncRun.started_at >= date_from)
        if date_to:
            conditions.append(IntegrationSyncRun.started_at <= date_to)
        total = self.db.scalar(select(func.count(IntegrationSyncRun.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(IntegrationSyncRun)
                .where(*conditions)
                .order_by(IntegrationSyncRun.started_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def add_sync_log(self, log: IntegrationSyncLog) -> IntegrationSyncLog:
        self.db.add(log)
        self.db.flush()
        return log

    def list_sync_logs(
        self,
        *,
        provider: str | None = None,
        status: str | None = None,
        severity: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[IntegrationSyncLog], int]:
        conditions = []
        if provider:
            conditions.append(IntegrationSyncLog.provider == provider)
        if status:
            conditions.append(IntegrationSyncLog.status == status)
        if severity and severity.strip():
            term = f"%{severity.strip()}%"
            conditions.append(or_(IntegrationSyncLog.status == severity.strip(), IntegrationSyncLog.message.ilike(term), cast(IntegrationSyncLog.payload, String).ilike(term)))
        if date_from:
            conditions.append(IntegrationSyncLog.created_at >= date_from)
        if date_to:
            conditions.append(IntegrationSyncLog.created_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(IntegrationSyncLog.message.ilike(term), IntegrationSyncLog.source_record_id.ilike(term), cast(IntegrationSyncLog.payload, String).ilike(term)))
        total = self.db.scalar(select(func.count(IntegrationSyncLog.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(IntegrationSyncLog)
                .where(*conditions)
                .order_by(IntegrationSyncLog.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_sync_log_by_source(self, *, provider: str, action: str, source_record_id: str) -> IntegrationSyncLog | None:
        return self.db.scalar(
            select(IntegrationSyncLog).where(
                IntegrationSyncLog.provider == provider,
                IntegrationSyncLog.action == action,
                IntegrationSyncLog.source_record_id == source_record_id,
            )
        )

    def get_mapping_rule(self, rule_id: str) -> IntegrationMappingRule | None:
        return self.db.get(IntegrationMappingRule, rule_id)

    def list_mapping_rules(
        self,
        *,
        provider: str,
        search: str | None = None,
        active_state: str = "all",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[IntegrationMappingRule], int]:
        conditions = [IntegrationMappingRule.provider == provider]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(IntegrationMappingRule.name.ilike(term), IntegrationMappingRule.pattern.ilike(term)))
        if active_state == "active":
            conditions.append(IntegrationMappingRule.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(IntegrationMappingRule.is_active.is_(False))
        total = self.db.scalar(select(func.count(IntegrationMappingRule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(IntegrationMappingRule)
                .where(*conditions)
                .order_by(IntegrationMappingRule.priority, IntegrationMappingRule.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_mapping_rule(self, rule: IntegrationMappingRule) -> IntegrationMappingRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def delete_mapping_rule(self, rule: IntegrationMappingRule) -> None:
        self.db.delete(rule)
        self.db.flush()

    def get_imported_item(self, item_id: str) -> IntegrationImportedItem | None:
        return self.db.get(IntegrationImportedItem, item_id)

    def get_imported_item_by_external_id(self, provider: str, external_id: str) -> IntegrationImportedItem | None:
        return self.db.scalar(select(IntegrationImportedItem).where(IntegrationImportedItem.provider == provider, IntegrationImportedItem.external_id == external_id))

    def list_imported_items(
        self,
        *,
        provider: str | None = None,
        search: str | None = None,
        account_id: str | None = None,
        mapping_status: str | None = None,
        review_status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[IntegrationImportedItem], int]:
        conditions = []
        if provider:
            conditions.append(IntegrationImportedItem.provider == provider)
        if account_id:
            conditions.append(IntegrationImportedItem.account_id == account_id)
        if mapping_status:
            conditions.append(IntegrationImportedItem.mapping_status == mapping_status)
        if review_status:
            conditions.append(IntegrationImportedItem.review_status == review_status)
        if date_from:
            conditions.append(IntegrationImportedItem.occurred_at >= date_from)
        if date_to:
            conditions.append(IntegrationImportedItem.occurred_at <= date_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    IntegrationImportedItem.title.ilike(term),
                    IntegrationImportedItem.external_id.ilike(term),
                    IntegrationImportedItem.description.ilike(term),
                    cast(IntegrationImportedItem.sanitized_payload_json, String).ilike(term),
                )
            )
        total = self.db.scalar(select(func.count(IntegrationImportedItem.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(IntegrationImportedItem)
                .where(*conditions)
                .order_by(IntegrationImportedItem.occurred_at.desc(), IntegrationImportedItem.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_imported_item(self, item: IntegrationImportedItem) -> IntegrationImportedItem:
        self.db.add(item)
        self.db.flush()
        return item

    def get_fathom_suggestion(self, suggestion_id: str) -> FathomTaskSuggestion | None:
        return self.db.get(FathomTaskSuggestion, suggestion_id)

    def list_fathom_suggestions(
        self,
        *,
        status: str | None = None,
        account_id: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[FathomTaskSuggestion], int]:
        conditions = []
        if status:
            conditions.append(FathomTaskSuggestion.status == status)
        if account_id:
            conditions.append(FathomTaskSuggestion.account_id == account_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(FathomTaskSuggestion.title.ilike(term), FathomTaskSuggestion.description.ilike(term)))
        total = self.db.scalar(select(func.count(FathomTaskSuggestion.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(FathomTaskSuggestion)
                .where(*conditions)
                .order_by(FathomTaskSuggestion.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def save_fathom_suggestion(self, suggestion: FathomTaskSuggestion) -> FathomTaskSuggestion:
        self.db.add(suggestion)
        self.db.flush()
        return suggestion

    def list_ai_runs(
        self,
        *,
        request_type: str | None = None,
        status: str | None = None,
        account_id: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[AiGatewayRun], int]:
        conditions = []
        if request_type:
            conditions.append(AiGatewayRun.request_type == request_type)
        if status:
            conditions.append(AiGatewayRun.status == status)
        if account_id:
            conditions.append(AiGatewayRun.account_id == account_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(AiGatewayRun.request_type.ilike(term), AiGatewayRun.actor_name.ilike(term), AiGatewayRun.error_message.ilike(term)))
        total = self.db.scalar(select(func.count(AiGatewayRun.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(AiGatewayRun)
                .where(*conditions)
                .order_by(AiGatewayRun.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_ai_run(self, run_id: str) -> AiGatewayRun | None:
        return self.db.get(AiGatewayRun, run_id)

    def save_ai_run(self, run: AiGatewayRun) -> AiGatewayRun:
        self.db.add(run)
        self.db.flush()
        return run

    def commit(self) -> None:
        self.db.commit()
