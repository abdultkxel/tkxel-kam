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
    """Relax columns that earlier local schemas created as required."""
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)
    nullable_columns = {
        "governance_action_items": ("owner_name", "governance_event_id", "due_at", "priority"),
        "governance_decisions": ("owner_name", "governance_event_id"),
        "governance_events": (
            "attendees",
            "created_by_name",
            "deduplication_key",
            "mapping_confidence",
            "review_required",
        ),
    }

    with engine.begin() as connection:
        for table_name, column_names in nullable_columns.items():
            if not inspector.has_table(table_name):
                continue
            columns = {column["name"]: column for column in inspector.get_columns(table_name)}
            for column_name in column_names:
                if column_name in columns and not columns[column_name].get("nullable", True):
                    connection.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} DROP NOT NULL"))
