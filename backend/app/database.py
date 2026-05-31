from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


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
    sync_legacy_governance_schema()


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
