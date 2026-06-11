from datetime import datetime, timedelta, timezone
from typing import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, CsatScore, Engagement, Escalation, Opportunity, OpportunityType, ScoreSnapshot, Signal
from app.services.forecasting import ForecastingService


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def test_forecast_service_applies_active_sow_opportunity_growth_and_risk(db_session: Session) -> None:
    now = datetime(2026, 6, 4, tzinfo=timezone.utc)
    account = Account(
        id="forecast-active-account",
        name="Forecast Active Account",
        lifecycle_status="Active",
        segment="Growth",
        region="US",
        risk_status="warning",
        commercial_value=0,
        currency="USD",
        health_overall=72,
        health_relationship=70,
        health_usage=76,
        health_delivery=68,
        health_commercial=74,
        created_by_id="tester",
    )
    opportunity_type = OpportunityType(slug="expansion", name="Expansion", description="Expansion", is_active=True, created_by_id="tester")
    db_session.add_all([account, opportunity_type])
    db_session.flush()
    db_session.add(
        Engagement(
            account_id=account.id,
            name="Active Forecast SOW",
            status="active",
            owner_id="tester",
            owner_name="Tester",
            service_lines=["Engineering"],
            value=183000,
            currency="USD",
            delivery_status="active",
            delivery_health=55,
            renewal_risk="high",
            start_date=datetime(2026, 6, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 12, 31, tzinfo=timezone.utc),
            notice_deadline=datetime(2026, 7, 10, tzinfo=timezone.utc),
            renewal_date=datetime(2026, 12, 15, tzinfo=timezone.utc),
            created_by_id="tester",
        )
    )
    db_session.add(
        Opportunity(
            account_id=account.id,
            type_id=opportunity_type.id,
            owner_id="tester",
            owner_name="Tester",
            owner_email="tester@tkxel.com",
            name="Qualified expansion",
            service_line="Engineering",
            value=120000,
            currency="USD",
            stage="Qualified",
            next_step="Confirm budget.",
            target_date=datetime(2026, 8, 15, tzinfo=timezone.utc),
            created_by_id="tester",
            created_by_name="Tester",
        )
    )
    db_session.add(
        Opportunity(
            account_id=account.id,
            type_id=opportunity_type.id,
            owner_id="tester",
            owner_name="Tester",
            owner_email="tester@tkxel.com",
            name="Unknown stage expansion",
            service_line="Engineering",
            value=4000,
            currency="USD",
            stage="Discovery",
            next_step="Qualify stage.",
            target_date=datetime(2026, 7, 15, tzinfo=timezone.utc),
            created_by_id="tester",
            created_by_name="Tester",
        )
    )
    db_session.add(
        Signal(
            account_id=account.id,
            signal_type="growth_signal",
            severity="info",
            status="new",
            title="Client funding supports expansion",
            detail="Client funding and budget increased for a new product launch.",
            reason_codes=[],
            evidence_json=[],
        )
    )
    db_session.add(
        Escalation(
            account_id=account.id,
            summary="Critical delivery escalation",
            impact="Renewal confidence is affected.",
            severity="critical",
            priority="urgent",
            status="open",
            owner_id="tester",
            owner_name="Tester",
            sla_due_at=now + timedelta(days=1),
            created_by_name="Tester",
        )
    )
    db_session.add(
        CsatScore(
            account_id=account.id,
            score=2.0,
            normalized_score=45,
            category_scores_json={},
            category_weights_json={},
            weighted_score=2.0,
            source_label="manual",
            source_id="forecast-csat",
            source_recorded_at=now,
            score_impact_json={},
            trend_json={},
            created_by_name="Tester",
        )
    )
    db_session.add(
        ScoreSnapshot(
            account_id=account.id,
            scope="account",
            overall=82,
            rag_status="green",
            drivers=[],
            reason_codes=[],
            metric_version="test",
            freshness_status="fresh",
            status="complete",
            source_context={},
            calculated_by_name="Tester",
            calculated_at=now,
        )
    )
    db_session.commit()

    forecast = ForecastingService(db_session).generate([account], months=6, now=now)

    assert forecast.confidence == "high"
    assert forecast.totals.active_sow_count == 1
    assert forecast.totals.baseline_revenue > 0
    assert forecast.totals.pipeline_value == 124000
    assert forecast.totals.weighted_opportunity == 43000
    assert forecast.totals.growth_adjustment == 21500
    assert forecast.totals.risk_adjustment > 0
    assert forecast.points[1].weighted_opportunity > 0
    assert any("default 25% probability" in note for note in forecast.missing_data)
    assert forecast.citations


def test_forecast_service_uses_historical_fallback_and_reports_no_data(db_session: Session) -> None:
    now = datetime(2026, 6, 4, tzinfo=timezone.utc)
    historical_account = Account(
        id="forecast-history-account",
        name="Forecast History Account",
        lifecycle_status="Active",
        segment="Growth",
        risk_status="healthy",
        commercial_value=0,
        currency="USD",
        health_overall=75,
        health_relationship=75,
        health_usage=75,
        health_delivery=75,
        health_commercial=75,
        created_by_id="tester",
    )
    empty_account = Account(
        id="forecast-empty-account",
        name="Forecast Empty Account",
        lifecycle_status="Active",
        segment="Growth",
        risk_status="healthy",
        commercial_value=0,
        currency="USD",
        health_overall=75,
        health_relationship=75,
        health_usage=75,
        health_delivery=75,
        health_commercial=75,
        created_by_id="tester",
    )
    db_session.add_all([historical_account, empty_account])
    db_session.flush()
    db_session.add(
        Engagement(
            account_id=historical_account.id,
            name="Completed SOW",
            status="completed",
            owner_id="tester",
            owner_name="Tester",
            service_lines=["Engineering"],
            value=60000,
            currency="USD",
            delivery_status="completed",
            delivery_health=80,
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 3, 31, tzinfo=timezone.utc),
            created_by_id="tester",
        )
    )
    db_session.commit()

    historical_forecast = ForecastingService(db_session).generate([historical_account], months=6, now=now)
    empty_forecast = ForecastingService(db_session).generate([empty_account], months=6, now=now)

    assert historical_forecast.totals.baseline_revenue > 0
    assert any("average of last 1 completed SOW" in note for note in historical_forecast.missing_data)
    assert empty_forecast.confidence == "not_available"
    assert empty_forecast.totals.forecast_revenue == 0
    assert empty_forecast.trend_label == "insufficient_data"
