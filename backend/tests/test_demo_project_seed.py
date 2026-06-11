from collections.abc import Generator

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.database import Base
from app.models import Account, Engagement, KycDraft, KycSnapshot, NotificationRecord, Signal, Task
from app.services.seed import DEMO_PROJECT_SLUGS, seed_demo_project_data


def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def test_demo_project_seed_creates_idempotent_end_to_end_records() -> None:
    for session in db_session():
        first = seed_demo_project_data(session)
        second = seed_demo_project_data(session)

        assert first["count"] == 4
        assert second["count"] == 4

        account_ids = [f"demo-project-{slug}" for slug in DEMO_PROJECT_SLUGS]
        accounts = list(session.scalars(select(Account).where(Account.id.in_(account_ids)).order_by(Account.id)))
        assert len(accounts) == 4
        assert {account.name for account in accounts} == {"Cafe Zupas", "Fintua", "CANVS", "Signals"}
        assert all(account.account_number for account in accounts)
        assert session.query(Engagement).filter(Engagement.account_id.in_(account_ids)).count() == 4
        assert session.query(KycDraft).filter(KycDraft.account_id.in_(account_ids)).count() == 4
        assert session.query(KycSnapshot).filter(KycSnapshot.account_id.in_(account_ids)).count() == 4
        assert session.query(Signal).filter(Signal.account_id.in_(account_ids)).count() == 4
        assert session.query(Task).filter(Task.account_id.in_(account_ids)).count() == 12
        assert session.query(NotificationRecord).filter(NotificationRecord.account_id.in_(account_ids)).count() == 20
