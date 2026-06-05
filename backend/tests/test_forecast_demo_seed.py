from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.database import Base
from app.models import Account, Engagement, Opportunity, ScoreSnapshot, Signal
from app.services.forecasting import ForecastingService
from app.services.seed import (
    FORECAST_DEMO_ACCOUNT_ID,
    FORECAST_DEMO_ENGAGEMENT_ID,
    FORECAST_DEMO_OPPORTUNITY_IDS,
    FORECAST_DEMO_SCORE_ID,
    FORECAST_DEMO_SIGNAL_ID,
    clear_forecast_demo_data,
    seed_forecast_demo_data,
)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def test_forecast_demo_seed_is_idempotent_forecast_ready_and_clearable(db_session: Session) -> None:
    now = datetime(2026, 6, 5, tzinfo=timezone.utc)
    first = seed_forecast_demo_data(db_session, now=now)
    second = seed_forecast_demo_data(db_session, now=now)

    assert first == second
    assert _count(db_session, Account, Account.id == FORECAST_DEMO_ACCOUNT_ID) == 1
    assert _count(db_session, Engagement, Engagement.id == FORECAST_DEMO_ENGAGEMENT_ID) == 1
    assert _count(db_session, Opportunity, Opportunity.id.in_(FORECAST_DEMO_OPPORTUNITY_IDS)) == 3
    assert _count(db_session, ScoreSnapshot, ScoreSnapshot.id == FORECAST_DEMO_SCORE_ID) == 1
    assert _count(db_session, Signal, Signal.id == FORECAST_DEMO_SIGNAL_ID) == 1

    account = db_session.get(Account, FORECAST_DEMO_ACCOUNT_ID)
    assert account is not None
    forecast = ForecastingService(db_session).generate([account], months=6, now=now)
    assert forecast.totals.baseline_revenue > 0
    assert forecast.totals.weighted_opportunity > 0
    assert forecast.totals.forecast_revenue > forecast.totals.baseline_revenue
    assert forecast.confidence in {"high", "medium"}
    assert len(forecast.points) == 6

    assert clear_forecast_demo_data(db_session) == 1
    assert db_session.get(Account, FORECAST_DEMO_ACCOUNT_ID) is None
    assert clear_forecast_demo_data(db_session) == 0


def _count(session: Session, model: type, condition) -> int:
    return int(session.scalar(select(func.count()).select_from(model).where(condition)) or 0)
