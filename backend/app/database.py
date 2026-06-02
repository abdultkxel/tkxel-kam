import json
from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.schema import CreateColumn, CreateIndex

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


_MISSING = object()
_TABLE_BACKFILL_DEFAULTS: dict[str, dict[str, Any]] = {
    "engagements": {
        "status": "active",
        "service_lines": [],
        "source_links": [],
        "value": 0,
        "currency": "USD",
        "delivery_status": "active",
        "commercial_status": "watch",
        "delivery_health": 70,
        "health_status": "unknown",
        "renewal_risk": "unknown",
        "auto_renewal": False,
        "risks": [],
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "engagement_health_snapshots": {
        "overall": 0,
        "rag_status": "warning",
        "drivers": [],
        "freshness_status": "fresh",
        "is_dirty": False,
        "contribution": 0,
        "metric_version": "engagement-v1",
        "created_by_name": "System",
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "account_health_rollups": {
        "overall": 0,
        "rag_status": "warning",
        "contributions": [],
        "metric_version": "account-rollup-v1",
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "timeline_entries": {
        "is_sensitive": False,
        "is_system_generated": True,
        "is_immutable": True,
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "scoring_metric_definitions": {
        "weight": 20,
        "thresholds": {},
        "formula": {},
        "freshness_rule": {},
        "source": "manual",
        "status": "draft",
        "is_active": True,
        "current_version": 0,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "scoring_metric_versions": {
        "config_json": {},
        "published_by_name": "System",
        "published_at": lambda: datetime.now(timezone.utc),
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "manual_score_submissions": {
        "scope": "account",
        "values_json": {},
        "evidence_json": [],
        "validation_status": "validated",
        "submitted_by_name": "System",
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "score_snapshots": {
        "scope": "account",
        "overall": 0,
        "rag_status": "amber",
        "drivers": [],
        "reason_codes": [],
        "metric_version": "scoring-v1",
        "freshness_status": "fresh",
        "is_dirty": False,
        "trend": 0,
        "status": "complete",
        "source_context": {},
        "calculated_at": lambda: datetime.now(timezone.utc),
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "scoring_jobs": {
        "job_type": "manual",
        "scope": "account",
        "status": "queued",
        "trigger_source": "manual",
        "result_json": {},
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "signal_rules": {
        "severity": "warning",
        "condition_json": {},
        "owner_rule_json": {},
        "sla_rule_json": {},
        "is_active": True,
        "current_version": 1,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "signals": {
        "severity": "warning",
        "status": "new",
        "detail": "",
        "reason_codes": [],
        "evidence_json": [],
        "citations_json": [],
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "signal_events": {
        "event_type": "status_change",
        "metadata_json": {},
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "playbook_templates": {
        "objective": "",
        "description": "",
        "signal_types": [],
        "weak_metrics": [],
        "default_owner_rule": "account_primary_am",
        "due_date_rule": {},
        "success_criteria": [],
        "skip_rules": [],
        "version": 1,
        "is_active": True,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "playbook_template_activities": {
        "title": "Playbook activity",
        "owner_rule": "account_primary_am",
        "due_offset_days": 7,
        "priority": "medium",
        "success_criteria": [],
        "skip_allowed": True,
        "requires_evidence": False,
        "sort_order": 0,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "playbook_executions": {
        "template_name_snapshot": "Playbook",
        "template_version_snapshot": 1,
        "status": "active",
        "skipped_activity_ids": [],
        "skip_reasons": {},
        "template_snapshot": {},
        "created_by_name": "System",
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "tasks": {
        "source_type": "manual",
        "due_at": lambda: datetime.now(timezone.utc),
        "status": "todo",
        "priority": "medium",
        "owner_name": "System",
        "success_criteria": [],
        "requires_evidence": False,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "task_evidence": {
        "evidence_type": "note",
        "created_by_name": "System",
        "created_at": lambda: datetime.now(timezone.utc),
    },
    "stakeholders": {
        "role": "operational_poc",
        "influence": "medium",
        "relationship_strength": "unknown",
        "sentiment": "neutral",
        "political_risk": "unknown",
        "status": "active",
        "is_sensitive": False,
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "stakeholder_interactions": {
        "interaction_type": "note",
        "subject": "Stakeholder interaction",
        "interaction_at": lambda: datetime.now(timezone.utc),
        "is_sensitive": False,
        "created_by_name": "System",
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
    "stakeholder_coverage_gaps": {
        "severity": "medium",
        "title": "Stakeholder coverage gap",
        "description": "Stakeholder coverage gap detected by deterministic rules.",
        "evidence": {},
        "status": "open",
        "created_at": lambda: datetime.now(timezone.utc),
        "updated_at": lambda: datetime.now(timezone.utc),
    },
}
_JSON_BACKFILL_COLUMNS = {
    "service_lines",
    "source_links",
    "risks",
    "drivers",
    "contributions",
    "thresholds",
    "formula",
    "freshness_rule",
    "config_json",
    "values_json",
    "evidence_json",
    "reason_codes",
    "source_context",
    "result_json",
    "condition_json",
    "owner_rule_json",
    "sla_rule_json",
    "metadata_json",
    "signal_types",
    "weak_metrics",
    "activities_json",
    "due_date_rule",
    "success_criteria",
    "skip_rules",
    "skipped_activity_ids",
    "skip_reasons",
    "template_snapshot",
    "citations_json",
    "evidence",
}
_LEGACY_TABLE_BACKFILL_DEFAULTS: dict[str, dict[str, Any]] = {
    "engagements": {
        "source_document_links": [],
        "attachments": [],
        "activity_notes": [],
        "escalation_notes": [],
        "health_drivers": [],
        "health_freshness": "fresh",
        "health_dirty": False,
        "health_contribution": 0,
    },
    "engagement_health_snapshots": {
        "score": 0,
        "freshness": "fresh",
        "contribution_to_account_health": 0,
        "formula_version": "engagement-v1",
        "dirty": False,
        "metric_inputs": [],
    },
}
_LEGACY_JSON_COLUMNS = {
    "source_document_links",
    "attachments",
    "activity_notes",
    "escalation_notes",
    "health_drivers",
    "metric_inputs",
}


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    apply_additive_migrations()
    sync_playbooks_tasks_schema()
    sync_legacy_governance_schema()


def sync_playbooks_tasks_schema() -> None:
    """Convert older local playbook/task columns that auto-migration cannot type-change."""
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)
    if not inspector.has_table("playbook_templates"):
        return

    columns = {column["name"]: column for column in inspector.get_columns("playbook_templates")}
    owner_rule_column = columns.get("default_owner_rule")
    if owner_rule_column is None or "json" not in str(owner_rule_column.get("type", "")).lower():
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE playbook_templates
                ALTER COLUMN default_owner_rule DROP DEFAULT,
                ALTER COLUMN default_owner_rule TYPE VARCHAR(80)
                USING CASE
                    WHEN default_owner_rule IS NULL THEN 'account_primary_am'
                    WHEN jsonb_typeof(default_owner_rule::jsonb) = 'string' THEN trim(both '"' from default_owner_rule::text)
                    WHEN default_owner_rule::jsonb ? 'default' THEN
                        CASE
                            WHEN default_owner_rule::jsonb ->> 'default' = 'primary_am' THEN 'account_primary_am'
                            ELSE default_owner_rule::jsonb ->> 'default'
                        END
                    ELSE 'account_primary_am'
                END,
                ALTER COLUMN default_owner_rule SET DEFAULT 'account_primary_am'
                """
            )
        )


def sync_legacy_governance_schema() -> None:
    """Nudge older local governance tables toward the merged development shape."""
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)
    additive_columns = {
        "governance_events": {
            "end_at": "TIMESTAMP WITH TIME ZONE",
            "notes": "TEXT",
            "attendees": "JSONB",
            "external_provider": "VARCHAR(80)",
            "external_event_id": "VARCHAR(255)",
            "deduplication_key": "VARCHAR(255)",
            "mapping_confidence": "INTEGER",
            "review_required": "BOOLEAN",
            "recurrence_rule_id": "VARCHAR(36)",
            "created_by_name": "VARCHAR(160)",
        },
        "governance_decisions": {
            "governance_event_id": "VARCHAR(36)",
            "timeline_entry_id": "VARCHAR(36)",
        },
        "governance_action_items": {
            "governance_event_id": "VARCHAR(36)",
            "owner_email": "VARCHAR(255)",
            "due_at": "TIMESTAMP WITH TIME ZONE",
            "priority": "VARCHAR(40)",
            "completed_at": "TIMESTAMP WITH TIME ZONE",
            "completed_by_id": "VARCHAR(36)",
        },
    }
    nullable_columns = {
        "governance_action_items": (
            "event_id",
            "owner_name",
            "due_date",
            "source",
            "governance_event_id",
            "due_at",
            "priority",
            "completed_by_id",
        ),
        "governance_decisions": ("event_id", "owner_name", "source", "governance_event_id"),
        "governance_events": (
            "attendees",
            "created_by_name",
            "deduplication_key",
            "mapping_confidence",
            "review_required",
        ),
    }

    with engine.begin() as connection:
        for table_name, columns_to_add in additive_columns.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns_to_add.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))

        for table_name, column_names in nullable_columns.items():
            if not inspector.has_table(table_name):
                continue
            columns = {column["name"]: column for column in inspector.get_columns(table_name)}
            for column_name in column_names:
                if column_name in columns and not columns[column_name].get("nullable", True):
                    connection.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} DROP NOT NULL"))


def apply_additive_migrations() -> None:
    from app.models import (
        AccountHealthRollup,
        Engagement,
        EngagementHealthSnapshot,
        ManualScoreSubmission,
        PlaybookExecution,
        PlaybookTemplate,
        PlaybookTemplateActivity,
        ScoreSnapshot,
        ScoringJob,
        ScoringMetricDefinition,
        ScoringMetricVersion,
        Signal,
        SignalEvent,
        SignalRule,
        Task,
        TaskEvidence,
        Stakeholder,
        StakeholderCoverageGap,
        StakeholderInteraction,
        TimelineEntry,
    )

    migrate_missing_columns(
        [
            Engagement.__table__,
            EngagementHealthSnapshot.__table__,
            AccountHealthRollup.__table__,
            TimelineEntry.__table__,
            ScoringMetricDefinition.__table__,
            ScoringMetricVersion.__table__,
            ManualScoreSubmission.__table__,
            ScoreSnapshot.__table__,
            ScoringJob.__table__,
            SignalRule.__table__,
            Signal.__table__,
            SignalEvent.__table__,
            PlaybookTemplate.__table__,
            PlaybookTemplateActivity.__table__,
            PlaybookExecution.__table__,
            Task.__table__,
            TaskEvidence.__table__,
            Stakeholder.__table__,
            StakeholderInteraction.__table__,
            StakeholderCoverageGap.__table__,
        ]
    )


def migrate_missing_columns(tables: list) -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())
        for table in tables:
            if table.name not in existing_tables:
                continue
            existing_column_info = {column["name"]: column for column in inspector.get_columns(table.name)}
            existing_columns = set(existing_column_info)
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                column_definition = nullable_column_definition(column)
                table_name = quote_identifier(connection, table.name)
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_definition}"))
                backfill_missing_column(connection, table.name, column)
                enforce_not_null_if_safe(connection, table.name, column)
                existing_columns.add(column.name)
            relax_nullable_columns(connection, table, existing_columns, existing_column_info)
            normalize_legacy_columns(connection, table.name, existing_columns, existing_column_info)
            existing_indexes = {index["name"] for index in inspector.get_indexes(table.name)}
            for index in table.indexes:
                if index.name in existing_indexes:
                    continue
                index_columns = {column.name for column in index.columns}
                if not index_columns.issubset(existing_columns):
                    continue
                connection.execute(CreateIndex(index))


def relax_nullable_columns(connection: Any, table: Any, existing_columns: set[str], existing_column_info: dict[str, Any]) -> None:
    if connection.dialect.name != "postgresql":
        return

    quoted_table_name = quote_identifier(connection, table.name)
    for column in table.columns:
        if column.name not in existing_columns or not column.nullable:
            continue
        if existing_column_info.get(column.name, {}).get("nullable") is not False:
            continue
        quoted_column_name = quote_identifier(connection, column.name)
        connection.execute(text(f"ALTER TABLE {quoted_table_name} ALTER COLUMN {quoted_column_name} DROP NOT NULL"))


def normalize_legacy_columns(
    connection: Any,
    table_name: str,
    existing_columns: set[str],
    existing_column_info: dict[str, Any],
) -> None:
    for column_name, default in _LEGACY_TABLE_BACKFILL_DEFAULTS.get(table_name, {}).items():
        if column_name not in existing_columns:
            continue
        backfill_legacy_column(connection, table_name, column_name, existing_column_info.get(column_name), default)

    if table_name == "engagements" and "source_document_links" in existing_columns and "source_links" in existing_columns:
        copy_legacy_source_links(connection, table_name)
    if table_name == "engagement_health_snapshots":
        copy_legacy_health_snapshot_values(connection, table_name, existing_columns)


def backfill_legacy_column(connection: Any, table_name: str, column_name: str, column_info: Any, default: Any) -> None:
    quoted_table_name = quote_identifier(connection, table_name)
    quoted_column_name = quote_identifier(connection, column_name)

    if connection.dialect.name == "postgresql":
        default_literal = default_literal_for_column(column_info, default, as_json=column_name in _LEGACY_JSON_COLUMNS)
        connection.execute(text(f"UPDATE {quoted_table_name} SET {quoted_column_name} = {default_literal} WHERE {quoted_column_name} IS NULL"))
        connection.execute(text(f"ALTER TABLE {quoted_table_name} ALTER COLUMN {quoted_column_name} SET DEFAULT {default_literal}"))
        connection.execute(text(f"ALTER TABLE {quoted_table_name} ALTER COLUMN {quoted_column_name} DROP NOT NULL"))
        return

    connection.execute(
        text(
            f"UPDATE {quoted_table_name} "
            f"SET {quoted_column_name} = :value "
            f"WHERE {quoted_column_name} IS NULL"
        ),
        {"value": json.dumps(default)},
    )


def copy_legacy_health_snapshot_values(connection: Any, table_name: str, existing_columns: set[str]) -> None:
    copy_legacy_column_value(connection, table_name, existing_columns, target="overall", source="score", fallback=0)
    copy_legacy_column_value(connection, table_name, existing_columns, target="freshness_status", source="freshness", fallback="fresh")
    copy_legacy_column_value(connection, table_name, existing_columns, target="is_dirty", source="dirty", fallback=False)
    copy_legacy_column_value(connection, table_name, existing_columns, target="contribution", source="contribution_to_account_health", fallback=0)
    copy_legacy_column_value(connection, table_name, existing_columns, target="metric_version", source="formula_version", fallback="engagement-v1")


def copy_legacy_column_value(connection: Any, table_name: str, existing_columns: set[str], *, target: str, source: str, fallback: Any) -> None:
    if connection.dialect.name != "postgresql" or target not in existing_columns or source not in existing_columns:
        return
    quoted_table_name = quote_identifier(connection, table_name)
    target_column = quote_identifier(connection, target)
    source_column = quote_identifier(connection, source)
    condition = fallback_condition_for_column(target_column, source_column, fallback)
    connection.execute(text(f"UPDATE {quoted_table_name} SET {target_column} = {source_column} WHERE {source_column} IS NOT NULL AND {condition}"))


def fallback_condition_for_column(target_column: str, source_column: str, fallback: Any) -> str:
    if isinstance(fallback, bool):
        return f"{target_column} IS NULL OR ({target_column} IS false AND {source_column} IS true)"
    if isinstance(fallback, (int, float)):
        return f"{target_column} IS NULL OR ({target_column} = {fallback} AND {source_column} <> {fallback})"
    value = str(fallback).replace("'", "''")
    return f"{target_column} IS NULL OR ({target_column} = '{value}' AND {source_column} <> '{value}')"


def copy_legacy_source_links(connection: Any, table_name: str) -> None:
    quoted_table_name = quote_identifier(connection, table_name)
    source_links = quote_identifier(connection, "source_links")
    legacy_links = quote_identifier(connection, "source_document_links")
    empty_source_links = (
        f"({source_links} IS NULL OR {source_links}::text IN ('[]', 'null'))"
        if connection.dialect.name == "postgresql"
        else f"({source_links} IS NULL OR {source_links} IN ('[]', 'null'))"
    )
    connection.execute(
        text(
            f"UPDATE {quoted_table_name} "
            f"SET {source_links} = {legacy_links} "
            f"WHERE {legacy_links} IS NOT NULL AND {empty_source_links}"
        )
    )


def default_literal_for_column(column_info: Any, default: Any, *, as_json: bool = False) -> str:
    type_name = str((column_info or {}).get("type", "")).lower()
    value = json.dumps(default).replace("'", "''") if as_json else str(default).replace("'", "''")
    if "jsonb" in type_name:
        return f"'{value}'::jsonb"
    if "json" in type_name:
        return f"'{value}'::json"
    if "bool" in type_name or type_name == "boolean":
        return "true" if bool(default) else "false"
    if any(numeric_type in type_name for numeric_type in ("integer", "numeric", "double", "real")):
        return str(default)
    return f"'{value}'"


def nullable_column_definition(column: Any) -> str:
    column_copy = column._copy()
    column_copy.nullable = True
    column_copy.primary_key = False
    return str(CreateColumn(column_copy).compile(dialect=engine.dialect))


def backfill_missing_column(connection: Any, table_name: str, column: Any) -> None:
    default = _TABLE_BACKFILL_DEFAULTS.get(table_name, {}).get(column.name, _MISSING)
    if default is _MISSING:
        return

    value = default() if callable(default) else default
    quoted_table_name = quote_identifier(connection, table_name)
    quoted_column_name = quote_identifier(connection, column.name)

    if column.name in _JSON_BACKFILL_COLUMNS:
        value = json.dumps(value)
        if connection.dialect.name == "postgresql":
            connection.execute(
                text(
                    f"UPDATE {quoted_table_name} "
                    f"SET {quoted_column_name} = CAST(:value AS JSON) "
                    f"WHERE {quoted_column_name} IS NULL"
                ),
                {"value": value},
            )
            return

    connection.execute(
        text(
            f"UPDATE {quoted_table_name} "
            f"SET {quoted_column_name} = :value "
            f"WHERE {quoted_column_name} IS NULL"
        ),
        {"value": value},
    )


def enforce_not_null_if_safe(connection: Any, table_name: str, column: Any) -> None:
    if column.nullable or connection.dialect.name != "postgresql":
        return
    if column.name not in _TABLE_BACKFILL_DEFAULTS.get(table_name, {}) and not table_is_empty(connection, table_name):
        return

    quoted_table_name = quote_identifier(connection, table_name)
    quoted_column_name = quote_identifier(connection, column.name)
    connection.execute(
        text(f"ALTER TABLE {quoted_table_name} ALTER COLUMN {quoted_column_name} SET NOT NULL")
    )


def table_is_empty(connection: Any, table_name: str) -> bool:
    quoted_table_name = quote_identifier(connection, table_name)
    result = connection.execute(text(f"SELECT 1 FROM {quoted_table_name} LIMIT 1"))
    return result.first() is None


def quote_identifier(connection: Any, identifier: str) -> str:
    return connection.dialect.identifier_preparer.quote(identifier)
