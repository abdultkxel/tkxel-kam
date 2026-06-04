from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Account,
    AccountPlan,
    ContentItem,
    CustomFieldDefinition,
    Engagement,
    GovernanceEvent,
    KycSnapshot,
    NotificationRecord,
    Opportunity,
    ScoreSnapshot,
    Signal,
    Task,
)
from app.services.seed import seed_demo_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def count_records(db_session: Session, model: type) -> int:
    return db_session.scalar(select(func.count()).select_from(model)) or 0


def test_demo_seed_populates_major_modules_and_is_idempotent(db_session: Session) -> None:
    first_summary = seed_demo_data(db_session)
    second_summary = seed_demo_data(db_session)

    assert first_summary == second_summary
    assert db_session.get(Account, "demo-acme-retail") is not None
    assert count_records(db_session, Account) >= 3
    assert count_records(db_session, Engagement) >= 3
    assert count_records(db_session, KycSnapshot) >= 3
    assert count_records(db_session, Opportunity) >= 3
    assert count_records(db_session, AccountPlan) >= 3
    assert count_records(db_session, ScoreSnapshot) >= 3
    assert count_records(db_session, Signal) >= 3
    assert count_records(db_session, Task) >= 3
    assert count_records(db_session, GovernanceEvent) >= 3
    assert count_records(db_session, NotificationRecord) >= 9
    assert db_session.get(ContentItem, "demo-content-qbr") is not None
    assert db_session.scalar(
        select(CustomFieldDefinition).where(
            CustomFieldDefinition.module == "account_overview",
            CustomFieldDefinition.field_key == "demo_customer_tier",
        )
    )
