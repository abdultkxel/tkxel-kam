from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, Engagement, Task, TimelineEntry
from app.services.seed import seed_default_data


@asynccontextmanager
async def noop_lifespan(_app):
    yield


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

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = noop_lifespan
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.router.lifespan_context = original_lifespan


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
    assert seeded_metrics.json()["total"] >= 7
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
            "formula": {
                "op": "weighted_sum",
                "scale": 3,
                "items": [
                    {"field": "relationship.ceo", "label": "CEO Engagement", "weight": 50},
                    {"field": "relationship.kam", "label": "KAM Engagement", "weight": 50},
                ],
            },
            "freshness_rule": {"stale_after_days": 45},
            "owner_role": "kam_head",
            "source": "manual",
            "effective_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert created.status_code == 201
    metric = created.json()

    filtered = client.get(
        "/api/admin/metrics",
        headers=headers,
        params={"source": "manual", "owner_role": "kam_head", "sort": "effective_date", "direction": "desc", "active_state": "all"},
    )
    assert filtered.status_code == 200
    assert any(item["slug"] == "portfolio_momentum" for item in filtered.json()["items"])

    unsupported = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "unsupported_formula",
            "name": "Unsupported Formula",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "sum", "values": [{"op": "field", "field": "health_relationship"}]},
        },
    )
    assert unsupported.status_code == 422

    stale_rule = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "bad_freshness_metric",
            "name": "Bad Freshness Metric",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "constant", "value": 80},
            "freshness_rule": {"stale_after_days": 0},
        },
    )
    assert stale_rule.status_code == 422

    self_dependency = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "self_dependency_metric",
            "name": "Self Dependency Metric",
            "scope": "account",
            "weight": 10,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "weighted_sum", "items": [{"metric_slug": "self_dependency_metric", "weight": 100}]},
        },
    )
    assert self_dependency.status_code == 422

    validation = client.post(f"/api/admin/metrics/{metric['id']}/validate", headers=headers)
    assert validation.status_code == 200
    assert validation.json()["valid"] is True

    published = client.post(f"/api/admin/metrics/{metric['id']}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["version"] == 1

    versions = client.get(f"/api/admin/metrics/{metric['id']}/versions", headers=headers)
    assert versions.status_code == 200
    assert versions.json()["total"] == 1

    dependent_metric = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "relationship_dependency_rollup",
            "name": "Relationship Dependency Rollup",
            "scope": "account",
            "weight": 5,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "weighted_sum", "items": [{"metric_slug": "relationship_health", "weight": 100}]},
        },
    )
    assert dependent_metric.status_code == 201
    dependent_publish = client.post(f"/api/admin/metrics/{dependent_metric.json()['id']}/publish", headers=headers)
    assert dependent_publish.status_code == 200

    inactive_dependency = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "inactive_dependency_metric",
            "name": "Inactive Dependency Metric",
            "scope": "account",
            "weight": 5,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "constant", "value": 50},
            "status": "inactive",
            "is_active": False,
        },
    )
    assert inactive_dependency.status_code == 201
    blocked_dependency = client.post(
        "/api/admin/metrics",
        headers=headers,
        json={
            "slug": "blocked_dependency_metric",
            "name": "Blocked Dependency Metric",
            "scope": "account",
            "weight": 5,
            "thresholds": {"red_max": 59, "amber_min": 60, "green_min": 75},
            "formula": {"op": "weighted_sum", "items": [{"metric_slug": "inactive_dependency_metric", "weight": 100}]},
        },
    )
    assert blocked_dependency.status_code == 422

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

    owner_metric_view = client.get(
        "/api/admin/metrics",
        headers=owner_headers,
        params={"status": "inactive", "active_state": "all", "page": 1, "page_size": 100},
    )
    assert owner_metric_view.status_code == 200
    assert owner_metric_view.json()["items"]
    assert all(item["status"] == "published" and item["is_active"] is True for item in owner_metric_view.json()["items"])
    assert all(item["slug"] != "inactive_dependency_metric" for item in owner_metric_view.json()["items"])

    denied_job = client.post(
        "/api/scoring/jobs",
        headers=owner_headers,
        json={"job_type": "scheduled", "scope": "portfolio", "trigger_source": "test"},
    )
    assert denied_job.status_code == 403


def test_account_scoring_signal_lifecycle_conversion_and_authorization(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner)
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    relationship_metric = client.get("/api/admin/metrics", headers=admin_headers, params={"search": "Relationship Health", "page": 1, "page_size": 1})
    assert relationship_metric.status_code == 200
    relationship_metric_id = relationship_metric.json()["items"][0]["id"]
    boosted_weight = client.patch(f"/api/admin/metrics/{relationship_metric_id}", headers=admin_headers, json={"weight": 100, "thresholds": {"red_max": 49, "amber_min": 50, "green_min": 70}})
    assert boosted_weight.status_code == 200
    assert client.post(f"/api/admin/metrics/{relationship_metric_id}/publish", headers=admin_headers).status_code == 200
    draft_edit = client.patch(f"/api/admin/metrics/{relationship_metric_id}", headers=admin_headers, json={"weight": 1})
    assert draft_edit.status_code == 200
    assert draft_edit.json()["status"] == "draft"
    published_view = client.get("/api/admin/metrics", headers=owner_headers, params={"search": "Relationship Health", "page": 1, "page_size": 10})
    assert published_view.status_code == 200
    relationship_view = next(item for item in published_view.json()["items"] if item["slug"] == "relationship_health")
    assert relationship_view["status"] == "published"
    assert relationship_view["weight"] == 100

    score_response = client.post(
        f"/api/accounts/{account_id}/scores/recalculate",
        headers=owner_headers,
        json={
            "trigger_source": "test",
            "include_signal_evaluation": True,
            "manual_submission": {
                "calculator_id": "account_health",
                "values": {
                    "relationship.ceo": 0,
                    "relationship.kam": 2,
                    "relationship.delivery": 1,
                    "relationship.finance": 0,
                    "relationship.inperson": 0,
                    "resource.keyres": 2,
                    "resource.alignment": 2,
                    "resource.backup": 1,
                    "contract.length": 1,
                    "contract.notice": 1,
                    "contract.renewal": 0,
                    "account_risk.competitors": 0,
                    "account_risk.leadership_tenure": 2,
                    "account_risk.funding_revenue": 2,
                    "account_risk.payment_behavior": 1,
                    "account_risk.roadmap_alignment": 1,
                    "account_risk.geopolitical": 3,
                    "csat.delivery_ex": 2,
                    "csat.communication": 2,
                    "csat.proactiveness": 2,
                    "csat.trust": 2,
                    "csat.value": 2,
                    "service_line.selected_count": 1,
                    "service_line.total_count": 10,
                    "service_line.coverage": 10,
                },
                "evidence": [{"label": "Review note", "value": "Manual calculator submission"}],
            },
        },
    )
    assert score_response.status_code == 200
    score = score_response.json()
    assert score["overall"] < 60
    assert score["rag_status"] == "red"
    assert any(driver["key"] == "relationship" and driver["weight"] > 40 for driver in score["drivers"])
    assert score["latest_snapshot"]["source_context"]["manual_submission_id"]
    assert score["latest_snapshot"]["source_context"]["published_metrics"]
    assert len(score["latest_snapshot"]["metric_snapshots"]) >= 6

    snapshots = client.get(f"/api/accounts/{account_id}/score-snapshots", headers=owner_headers, params={"page": 1, "page_size": 1, "rag_status": "red"})
    assert snapshots.status_code == 200
    assert snapshots.json()["total"] == 1
    filtered_snapshots = client.get(
        f"/api/accounts/{account_id}/score-snapshots",
        headers=owner_headers,
        params={"page": 1, "page_size": 5, "metric_slug": "relationship_health", "category": "relationship", "freshness_status": "stale", "dirty": False},
    )
    assert filtered_snapshots.status_code == 200
    assert filtered_snapshots.json()["total"] == 1

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

    other_owner = seeded_user(client, admin_headers, "ops_lead")
    unowned_headers = auth_headers(client, other_owner["email"], "User@12345")
    denied = client.post(f"/api/accounts/{account_id}/scores/recalculate", headers=unowned_headers, json={"trigger_source": "forbidden"})
    assert denied.status_code == 403


def test_engagement_scoring_recalculation_snapshots_jobs_and_validation(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="engagement-score-account")
    engagement_id = db_session.scalar(select(Engagement.id).where(Engagement.account_id == account_id))
    assert engagement_id
    owner_headers = auth_headers(client, owner["email"], "User@12345")

    initial = client.get(f"/api/engagements/{engagement_id}/scores", headers=owner_headers)
    assert initial.status_code == 200
    assert initial.json()["scope"] == "engagement"
    assert initial.json()["latest_snapshot"] is None

    invalid = client.post(
        f"/api/engagements/{engagement_id}/scores/recalculate",
        headers=owner_headers,
        json={
            "trigger_source": "invalid_manual",
            "manual_submission": {"calculator_id": "engagement_health", "values": {"relationship.ceo": 2}},
        },
    )
    assert invalid.status_code == 422

    recalculated = client.post(
        f"/api/engagements/{engagement_id}/scores/recalculate",
        headers=owner_headers,
        json={
            "trigger_source": "engagement_review",
            "manual_submission": {
                "calculator_id": "engagement_health",
                "values": {"delivery": 90},
                "evidence": [{"label": "Ops update", "value": "Delivery recovery confirmed"}],
            },
        },
    )
    assert recalculated.status_code == 200
    score = recalculated.json()
    assert score["scope"] == "engagement"
    assert score["engagement_id"] == engagement_id
    assert score["overall"] < 90
    assert score["latest_snapshot"]["source_context"]["manual_submission_id"]
    assert score["latest_snapshot"]["source_context"]["published_metrics"]

    latest = client.get(f"/api/engagements/{engagement_id}/scores", headers=owner_headers)
    assert latest.status_code == 200
    assert latest.json()["latest_snapshot"]["id"] == score["latest_snapshot"]["id"]

    job = client.post(
        "/api/scoring/jobs",
        headers=admin_headers,
        json={"job_type": "scheduled", "scope": "engagement", "engagement_id": engagement_id, "trigger_source": "nightly-test"},
    )
    assert job.status_code == 201
    assert job.json()["status"] == "complete"
    assert job.json()["result_json"]["snapshot_id"]

    snapshots = client.get(
        f"/api/accounts/{account_id}/score-snapshots",
        headers=owner_headers,
        params={"scope": "engagement", "engagement_id": engagement_id, "sort": "score", "direction": "asc", "page": 1, "page_size": 5},
    )
    assert snapshots.status_code == 200
    body = snapshots.json()
    assert body["total"] >= 2
    assert all(item["scope"] == "engagement" and item["engagement_id"] == engagement_id for item in body["items"])


def test_account_scoring_marks_missing_metric_configuration_incomplete(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    owner_headers = auth_headers(client, owner["email"], "User@12345")
    account_id = create_account_with_engagement(db_session, owner, account_id="missing-config-account")

    metrics = client.get("/api/admin/metrics", headers=admin_headers, params={"scope": "account", "active_state": "active", "page": 1, "page_size": 100})
    assert metrics.status_code == 200
    for metric in metrics.json()["items"]:
        response = client.patch(f"/api/admin/metrics/{metric['id']}", headers=admin_headers, json={"is_active": False, "status": "inactive"})
        assert response.status_code == 200

    score = client.post(f"/api/accounts/{account_id}/scores/recalculate", headers=owner_headers, json={"trigger_source": "missing_config_test"})
    assert score.status_code == 200
    body = score.json()
    assert body["status"] == "incomplete"
    assert body["is_dirty"] is True
    assert any(reason["code"] == "metric_config_missing" for reason in body["reason_codes"])


def test_playbook_execution_tasks_calendar_and_completion_validation(client: TestClient, db_session: Session) -> None:
    admin_headers = auth_headers(client)
    owner = seeded_user(client, admin_headers, "account_manager")
    account_id = create_account_with_engagement(db_session, owner, account_id="task-account")
    owner_headers = auth_headers(client, owner["email"], "User@12345")

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

    invalid_skip = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "skipped"})
    assert invalid_skip.status_code == 400

    skipped = client.patch(f"/api/tasks/{manual_task.json()['id']}", headers=owner_headers, json={"status": "skipped", "skip_reason": "Duplicate renewal task."})
    assert skipped.status_code == 200
    assert skipped.json()["status"] == "skipped"

    calendar = client.get("/api/calendar/items", headers=owner_headers, params={"account_id": account_id, "page": 1, "page_size": 20})
    assert calendar.status_code == 200
    kinds = {item["kind"] for item in calendar.json()["items"]}
    assert "task" in kinds
    assert {"notice_window", "renewal_date", "sow_expiry"}.intersection(kinds)

    assert db_session.scalar(select(Task).where(Task.account_id == account_id)) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "playbook_executed")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_created")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.account_id == account_id, TimelineEntry.event_type == "task_skipped")) is not None
