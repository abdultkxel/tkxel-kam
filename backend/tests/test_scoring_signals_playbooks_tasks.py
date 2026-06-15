from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AiGatewayRun, CsatScore, Engagement, GovernanceEvent, Opportunity, OpportunityType, ScoreSnapshot, ScoringMetricDefinition, Task, TimelineEntry
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        seed_default_data(session)
        yield session

    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seeded_user(client: TestClient, headers: dict[str, str], role: str) -> dict:
    response = client.get("/api/admin/users", headers=headers, params={"role": role, "page": 1, "page_size": 1})
    assert response.status_code == 200
    return response.json()["items"][0]


def create_account_with_engagement(db_session: Session, owner: dict, account_id: str = "signals-account") -> str:
    now = datetime.now(timezone.utc)
    account = Account(
        id=account_id,
        name="Signals Workspace",
        lifecycle_status="Active",
        segment="Growth",
        risk_status="warning",
        commercial_value=250000,
        currency="USD",
        health_overall=54,
        health_relationship=48,
        health_usage=64,
        health_delivery=56,
        health_commercial=61,
        created_by_id=owner["id"],
    )
    db_session.add(account)
    db_session.add(
        AccountOwner(
            account_id=account.id,
            user_id=owner["id"],
            user_name=owner["full_name"],
            user_email=owner["email"],
            ownership_role="primary_am",
            is_primary=True,
            is_active=True,
            rationale="Scoring test owner.",
            created_by_id=owner["id"],
        )
    )
    db_session.add(
        Engagement(
            account_id=account.id,
            name="Renewal SOW",
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            service_lines=["Development"],
            value=125000,
            currency="USD",
            delivery_status="at_risk",
            delivery_health=55,
            start_date=now - timedelta(days=90),
            end_date=now + timedelta(days=10),
            renewal_date=now + timedelta(days=15),
            notice_deadline=now + timedelta(days=5),
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account.id


def test_metric_configuration_validation_publish_and_pagination(client: TestClient) -> None:
    headers = auth_headers(client)

    seeded_metrics = client.get("/api/admin/metrics", headers=headers, params={"page": 1, "page_size": 2, "active_state": "all"})
    assert seeded_metrics.status_code == 200
    assert seeded_metrics.json()["total"] >= 5
    assert seeded_metrics.json()["pages"] >= 3

    invalid = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "unsafe_metric",
            "name": "Unsafe Metric",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 80, "amber_min": 60, "green_min": 75},
            "formula": {"op": "eval", "value": "__import__('os')"},
        },
    )
    assert invalid.status_code == 422

    created = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "portfolio_momentum",
            "name": "Portfolio Momentum",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "field", "field": "health_usage"},
        },
    )
    assert created.status_code == 201
    metric = created.json()

    validation = client.post(f"/api/admin/metrics/{metric['id']}/validate", headers=headers)
    assert validation.status_code == 200
    assert validation.json()["valid"] is True

    published = client.post(f"/api/admin/metrics/{metric['id']}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["version"] == 1

    versions = client.get(f"/api/admin/metrics/{metric['id']}/versions", headers=headers)
    assert versions.status_code == 200
    assert versions.json()["total"] == 1

    rules = client.get("/api/admin/signal-rules", headers=headers, params={"page": 1, "page_size": 3, "active_state": "all"})
    assert rules.status_code == 200
    assert rules.json()["total"] >= 7
    assert rules.json()["pages"] >= 3

    created_rule = client.post(
        "/api/admin/signal-rules",
        headers=headers,
        json={
            "slug": "custom_attention_rule",
            "name": "Custom Attention Rule",
            "signal_type": "weak_metric",
            "severity": "warning",
            "condition_json": {"source": "manual_config"},
            "owner_rule_json": {"default": "primary_am"},
            "sla_rule_json": {"due_in_days": 5},
        },
    )
    assert created_rule.status_code == 201
    rule = created_rule.json()

    updated_rule = client.patch(f"/api/admin/signal-rules/{rule['id']}", headers=headers, json={"severity": "critical", "is_active": False})
    assert updated_rule.status_code == 200
    assert updated_rule.json()["severity"] == "critical"
    assert updated_rule.json()["current_version"] == rule["current_version"] + 1

    owner = seeded_user(client, headers, "account_manager")
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    denied_rule_create = client.post(
        "/api/admin/signal-rules",
        headers=owner_headers,
        json={"slug": "owner_rule", "name": "Owner Rule", "signal_type": "weak_metric", "severity": "warning"},
    )
    assert denied_rule_create.status_code == 403


def test_account_scoring_signal_lifecycle_conversion_and_authorization(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner)
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    account = db_session.get(Account, account_id)
    assert account is not None
    account.health_delivery = 88
    db_session.add(
        ScoreSnapshot(
            account_id=account_id,
            scope="account",
            overall=82,
            rag_status="green",
            drivers=["relationship_score"],
            reason_codes=["legacy driver seed"],
            metric_version="legacy-score",
            freshness_status="fresh",
            trend=0,
            status="complete",
            source_context={"source": "legacy_seed"},
            calculated_by_name=owner["full_name"],
            calculated_at=datetime.now(timezone.utc) - timedelta(days=7),
        )
    )
    db_session.commit()

    relationship_metric = client.get("/api/admin/metrics", headers=admin_headers, params={"search": "Relationship Health", "page": 1, "page_size": 1})
    assert relationship_metric.status_code == 200
    relationship_metric_id = relationship_metric.json()["items"][0]["id"]
    boosted_weight = client.patch(f"/api/admin/metrics/{relationship_metric_id}", headers=admin_headers, json={"weight": 100, "thresholds": {"red_max": 49, "amber_min": 50, "green_min": 70}})
    assert boosted_weight.status_code == 200
    assert client.post(f"/api/admin/metrics/{relationship_metric_id}/publish", headers=admin_headers).status_code == 200

    score_response = client.post(
        f"/api/accounts/{account_id}/scores/recalculate",
        headers=owner_headers,
        json={
            "trigger_source": "test",
            "include_signal_evaluation": True,
            "manual_submission": {
                "calculator_id": "account_health",
                "values": {"relationship": 50, "usage": 63, "delivery": 56, "commercial": 62},
                "evidence": [{"label": "Review note", "value": "Manual calculator submission"}],
            },
        },
    )
    assert score_response.status_code == 200
    score = score_response.json()
    assert score["overall"] < 60
    assert score["rag_status"] == "red"
    assert any(driver["key"] == "relationship_score" and driver["weight"] == 20 for driver in score["drivers"])
    assert not any(driver["key"] == "delivery" for driver in score["drivers"])
    assert score["latest_snapshot"]["source_context"]["delivery_score_active"] is False
    assert score["latest_snapshot"]["source_context"]["manual_submission_id"]
    assert score["latest_snapshot"]["source_context"]["published_metrics"]
    resource_driver = next(driver for driver in score["drivers"] if driver["key"] == "resource_score")
    db_session.refresh(account)
    assert account.health_delivery == resource_driver["score"]

    snapshots = client.get(f"/api/accounts/{account_id}/score-snapshots", headers=owner_headers, params={"page": 1, "page_size": 1, "rag_status": "red"})
    assert snapshots.status_code == 200
    assert snapshots.json()["total"] == 1

    attention = client.get("/api/attention-center", headers=owner_headers, params={"account_id": account_id, "page": 1, "page_size": 10})
    assert attention.status_code == 200
    signal_types = {item["signal_type"] for item in attention.json()["items"]}
    assert {"stale_kyc", "weak_metric", "sow_expiry", "notice_window", "renewal_date"}.issubset(signal_types)
    signal = next(item for item in attention.json()["items"] if item["signal_type"] == "weak_metric")

    evidence = client.get(f"/api/signals/{signal['id']}/evidence", headers=owner_headers)
    assert evidence.status_code == 200
    assert evidence.json()["evidence"]

    explanation = client.post(f"/api/signals/{signal['id']}/ai-explanation", headers=owner_headers)
    assert explanation.status_code == 200
    assert explanation.json()["advisory_only"] is True

    reviewed = client.patch(f"/api/signals/{signal['id']}/status", headers=owner_headers, json={"status": "reviewed"})
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "reviewed"

    converted = client.post(f"/api/signals/{signal['id']}/convert", headers=owner_headers, json={"target_type": "task", "note": "Create recovery task"})
    assert converted.status_code == 200
    assert converted.json()["source_type"] == "signal"

    list_signals = client.get("/api/signals", headers=owner_headers, params={"search": "health", "status": "converted", "page": 1, "page_size": 5})
    assert list_signals.status_code == 200
    assert list_signals.json()["total"] >= 1

    other_owner = seeded_user(client, admin_headers, "delivery_lead")
    unowned_headers = auth_headers(client, other_owner["email"], "User@12345")
    denied = client.post(f"/api/accounts/{account_id}/scores/recalculate", headers=unowned_headers, json={"trigger_source": "forbidden"})
    assert denied.status_code == 403


def test_score_snapshots_preserve_metric_weight_after_published_config_change(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="snapshot-immutability-account")
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    created_metric = client.post(
        "/api/admin/metrics",
        headers=admin_headers,
        json={
            "slug": "relationship_score",
            "name": "Relationship Score",
            "scope": "account",
            "weight": 40,
            "thresholds": {"red_max": 49, "amber_min": 50, "green_min": 75},
            "formula": {"op": "field", "field": "health_relationship"},
        },
    )
    assert created_metric.status_code == 201
    metric_id = created_metric.json()["id"]
    assert client.post(f"/api/admin/metrics/{metric_id}/publish", headers=admin_headers).status_code == 200

    first_score = client.post(
        f"/api/accounts/{account_id}/scores/recalculate",
        headers=owner_headers,
        json={"trigger_source": "initial_weight"},
    )
    assert first_score.status_code == 200
    first_snapshot_id = first_score.json()["latest_snapshot"]["id"]
    first_driver = next(driver for driver in first_score.json()["drivers"] if driver["key"] == "relationship_score")
    assert first_driver["weight"] == pytest.approx(33.33)

    updated_metric = client.patch(f"/api/admin/metrics/{metric_id}", headers=admin_headers, json={"weight": 80})
    assert updated_metric.status_code == 200
    assert client.post(f"/api/admin/metrics/{metric_id}/publish", headers=admin_headers).status_code == 200

    second_score = client.post(
        f"/api/accounts/{account_id}/scores/recalculate",
        headers=owner_headers,
        json={"trigger_source": "updated_weight"},
    )
    assert second_score.status_code == 200
    second_driver = next(driver for driver in second_score.json()["drivers"] if driver["key"] == "relationship_score")
    assert second_driver["weight"] == pytest.approx(50)

    stored_first_snapshot = db_session.get(ScoreSnapshot, first_snapshot_id)
    assert stored_first_snapshot is not None
    stored_first_driver = next(driver for driver in stored_first_snapshot.drivers if driver["key"] == "relationship_score")
    assert stored_first_driver["weight"] == pytest.approx(first_driver["weight"])
    assert db_session.get(ScoringMetricDefinition, metric_id).current_version == 2


def test_expanded_signal_triggers_and_server_backed_ai_assistance(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="p1-core-account")
    account = db_session.get(Account, account_id)
    assert account is not None
    account.commercial_summary = "Payment overdue and procurement blocked until invoice dispute is resolved."
    opportunity_type = db_session.scalar(select(OpportunityType).order_by(OpportunityType.name).limit(1))
    assert opportunity_type is not None
    now = datetime.now(timezone.utc)
    db_session.add(
        Opportunity(
            account_id=account_id,
            type_id=opportunity_type.id,
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            owner_email=owner["email"],
            name="Stalled expansion package",
            service_line="Customer Success",
            value=150000,
            currency="USD",
            stage="Qualified",
            next_step="Waiting on sponsor feedback.",
            target_date=now - timedelta(days=5),
            created_by_id=owner["id"],
            created_by_name=owner["full_name"],
            updated_by_id=owner["id"],
            updated_by_name=owner["full_name"],
            updated_at=now - timedelta(days=45),
        )
    )
    db_session.add(
        GovernanceEvent(
            account_id=account_id,
            owner_id=owner["id"],
            owner_name=owner["full_name"],
            governance_type="QBR",
            source="manual",
            deduplication_key=f"governance-overdue-{account_id}",
            scheduled_at=now - timedelta(days=2),
            status="scheduled",
            attendees=[],
            created_by_id=owner["id"],
            created_by_name=owner["full_name"],
        )
    )
    db_session.add_all(
        [
            CsatScore(
                account_id=account_id,
                score=4.4,
                normalized_score=85,
                category_scores_json={"delivery_excellence": 4.4, "communication": 4.4},
                category_weights_json={"delivery_excellence": 50, "communication": 50},
                weighted_score=4.4,
                source_label="manual",
                source_id=f"csat-prev-{account_id}",
                source_recorded_at=now - timedelta(days=20),
                score_impact_json={},
                trend_json={},
                created_by_name=owner["full_name"],
            ),
            CsatScore(
                account_id=account_id,
                score=2.2,
                normalized_score=30,
                category_scores_json={"delivery_excellence": 2.2, "communication": 2.0},
                category_weights_json={"delivery_excellence": 50, "communication": 50},
                weighted_score=2.1,
                source_label="manual",
                source_id=f"csat-latest-{account_id}",
                source_recorded_at=now - timedelta(days=1),
                score_impact_json={},
                trend_json={},
                created_by_name=owner["full_name"],
            ),
        ]
    )
    db_session.add_all(
        [
            ScoreSnapshot(
                account_id=account_id,
                scope="account",
                overall=82,
                rag_status="green",
                drivers=[{"key": "relationship_score", "label": "Relationship Score", "score": 90, "weight": 20}],
                reason_codes=[],
                metric_version="test",
                freshness_status="fresh",
                trend=0,
                status="complete",
                source_context={},
                calculated_by_name=owner["full_name"],
                calculated_at=now - timedelta(days=7),
            ),
            ScoreSnapshot(
                account_id=account_id,
                scope="account",
                overall=66,
                rag_status="amber",
                drivers=[{"key": "relationship_score", "label": "Relationship Score", "score": 68, "weight": 20}],
                reason_codes=[{"code": "watch_relationship_score", "label": "Relationship Score is in amber range"}],
                metric_version="test",
                freshness_status="fresh",
                trend=-16,
                status="complete",
                source_context={},
                calculated_by_name=owner["full_name"],
                calculated_at=now,
            ),
        ]
    )
    db_session.add(
        TimelineEntry(
            account_id=account_id,
            event_type="manual_note",
            module="manual",
            title="Sponsor risk note",
            description="Sponsor requested executive attention on renewal risk and payment blockers.",
            performed_by=owner["id"],
            performed_by_name=owner["full_name"],
            is_sensitive=False,
        )
    )
    db_session.commit()
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    evaluation = client.post("/api/signals/evaluate", headers=owner_headers, json={"account_id": account_id, "trigger_source": "p1_core_test"})
    assert evaluation.status_code == 200
    signal_types = {item["signal_type"] for item in evaluation.json()["signals"]}
    assert {"csat_low", "csat_decline", "opportunity_stalled", "governance_overdue", "score_dimension_drop", "payment_risk"}.issubset(signal_types)

    ai_search = client.post("/api/ai/search", headers=owner_headers, json={"account_id": account_id, "query": "renewal payment risk", "scopes": ["timeline", "opportunities"], "limit": 5})
    assert ai_search.status_code == 200
    assert ai_search.json()["source_entries"]
    assert ai_search.json()["run_id"]

    brief = client.post(f"/api/accounts/{account_id}/ai/brief", headers=owner_headers)
    assert brief.status_code == 200
    assert brief.json()["citations"]

    stage = client.post(f"/api/accounts/{account_id}/ai/stage-prediction", headers=owner_headers)
    assert stage.status_code == 200
    assert stage.json()["advisory_only"] is True

    forecast = client.post("/api/ai/forecast", headers=owner_headers, json={"account_id": account_id, "months": 6})
    assert forecast.status_code == 200
    forecast_body = forecast.json()
    assert forecast_body["title"] == "6-Month Revenue Forecast"
    assert len(forecast_body["points"]) == 6
    assert forecast_body["totals"]["account_count"] == 1
    assert forecast_body["totals"]["baseline_revenue"] > 0
    assert "weighted_opportunity" in forecast_body["points"][0]
    assert forecast_body["basis"]
    assert forecast_body["assumptions"]
    assert forecast_body["confidence"] in {"high", "medium", "low", "not_available"}

    invalid_forecast = client.post("/api/ai/forecast", headers=owner_headers, json={"account_id": account_id, "months": 13})
    assert invalid_forecast.status_code == 422

    outsider = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "forecast.outsider@tkxel.com",
            "password": "User@12345",
            "full_name": "Forecast Outsider",
            "role": "account_manager",
            "title": "Account Manager",
            "phone": "+1 555 0199",
            "avatar_initials": "FO",
            "is_active": True,
        },
    )
    assert outsider.status_code == 201
    outsider_headers = auth_headers(client, "forecast.outsider@tkxel.com", "User@12345")
    unauthorized_forecast = client.post("/api/ai/forecast", headers=outsider_headers, json={"account_id": account_id, "months": 6})
    assert unauthorized_forecast.status_code == 403

    handoff = client.post(f"/api/accounts/{account_id}/ai/handoff", headers=owner_headers, json={"focus": "payment risk"})
    assert handoff.status_code == 200
    assert "Health and risks" in handoff.json()["sections"]

    ai_runs = list(db_session.scalars(select(AiGatewayRun).where(AiGatewayRun.account_id == account_id)))
    assert {run.request_type for run in ai_runs}.issuperset({"kam_ai_search", "account_brief", "stage_prediction", "portfolio_forecast", "handoff_brief"})


def test_playbook_execution_tasks_calendar_and_completion_validation(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="task-account")
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    account = db_session.get(Account, account_id)
    assert account is not None
    health_before_task_completion = account.health_overall

    templates = client.get("/api/admin/playbook-templates", headers=owner_headers, params={"status": "active", "page": 1, "page_size": 10})
    assert templates.status_code == 200
    assert templates.json()["total"] >= 1
    template_id = templates.json()["items"][0]["id"]

    execution = client.post(f"/api/playbooks/{template_id}/execute", headers=owner_headers, json={"account_id": account_id})
    assert execution.status_code == 201
    execution_body = execution.json()
    assert len(execution_body["tasks"]) >= 1
    task_id = execution_body["tasks"][0]["id"]

    task_page = client.get("/api/tasks", headers=owner_headers, params={"account_id": account_id, "source_type": "playbook", "page": 1, "page_size": 1})
    assert task_page.status_code == 200
    assert task_page.json()["total"] >= 1
    assert task_page.json()["pages"] >= 1

    completion_without_evidence = client.patch(f"/api/tasks/{task_id}", headers=owner_headers, json={"status": "done"})
    assert completion_without_evidence.status_code == 400

    evidence = client.post(f"/api/tasks/{task_id}/evidence", headers=owner_headers, json={"evidence_type": "note", "note": "Client recovery plan confirmed."})
    assert evidence.status_code == 201

    completed = client.patch(f"/api/tasks/{task_id}", headers=owner_headers, json={"status": "done", "outcome": "Recovery plan completed."})
    assert completed.status_code == 200
    assert completed.json()["status"] == "done"
    assert completed.json()["completed_at"]
    db_session.refresh(account)
    assert account.health_overall == health_before_task_completion

    manual_task = client.post(
        "/api/tasks",
        headers=owner_headers,
        json={
            "account_id": account_id,
            "title": "Manual renewal follow-up",
            "description": "Validate renewal owner.",
            "owner_id": owner["id"],
            "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "priority": "critical",
        },
    )
    assert manual_task.status_code == 201

    invalid_skip = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "cancelled"})
    assert invalid_skip.status_code == 400

    skipped = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "cancelled", "skip_reason": "Duplicate renewal task."})
    assert skipped.status_code == 200
    assert skipped.json()["status"] == "cancelled"

    calendar = client.get("/api/calendar/items", headers=owner_headers, params={"account_id": account_id, "page": 1, "page_size": 20})
    assert calendar.status_code == 200
    kinds = {item["kind"] for item in calendar.json()["items"]}
    assert "task" in kinds
    assert {"notice_window", "renewal_date", "sow_expiry"}.intersection(kinds)

    assert db_session.scalar(select(Task).where(Task.account_id == account_id)) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "playbook_executed")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_created")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_cancelled")) is not None
