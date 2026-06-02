from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, AiGatewayRun, IntegrationImportedItem, NotificationRecord, Task, User
from app.services.demo_seed import DEMO_PASSWORD, seed_demo_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def test_demo_seed_creates_realistic_local_data(db_session: Session) -> None:
    counts = seed_demo_data(db_session)

    assert counts["users"] >= 9
    assert counts["accounts"] >= 24
    assert counts["engagements"] >= 48
    assert counts["tasks"] >= 72
    assert counts["signals"] >= 48
    assert counts["notifications"] >= 24
    assert counts["kyc_runs"] >= 14
    assert counts["fathom_items"] >= 10
    assert counts["ai_runs"] >= 16
    assert counts["csat_scores"] >= 24

    demo_user = db_session.scalar(select(User).where(User.email == "demo.kam.nadia@tkxel.com"))
    assert demo_user is not None
    assert demo_user.primary_google_calendar_id == demo_user.email
    assert demo_user.hashed_password != DEMO_PASSWORD

    assert db_session.scalar(select(Account).where(Account.id == "demo-acct-001")).name.startswith("[DEMO]")
    assert db_session.scalar(select(Task).where(Task.id == "demo-task-001-1")).title.startswith("[DEMO]")
    assert db_session.scalar(select(IntegrationImportedItem).where(IntegrationImportedItem.id == "demo-fathom-item-001")).provider == "fathom"
    assert db_session.scalar(select(AiGatewayRun).where(AiGatewayRun.id == "demo-ai-run-001")).request_type


def test_demo_seed_is_idempotent(db_session: Session) -> None:
    first = seed_demo_data(db_session)
    second = seed_demo_data(db_session)

    assert second == first


def test_demo_seed_does_not_queue_email_notifications(db_session: Session) -> None:
    seed_demo_data(db_session)

    notifications = db_session.scalars(select(NotificationRecord).where(NotificationRecord.id.like("demo-notif-%"))).all()
    assert notifications
    assert {item.channel for item in notifications} == {"in_app"}
    assert all(item.email_queued is False for item in notifications)


def test_demo_seed_blocks_production_environment(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(RuntimeError, match="production"):
        seed_demo_data(db_session)
