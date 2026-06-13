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
from app.models import Account, AccountOwner, Engagement, Opportunity, OpportunityStageHistory, OpportunityType, ServiceRecommendation, Task, TimelineEntry, User
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


def seeded_user(db_session: Session, role: str) -> User:
    user = db_session.scalar(select(User).where(User.role == role, User.is_active.is_(True)).order_by(User.email))
    assert user is not None
    return user


def create_account(db_session: Session, owner: User, account_id: str = "relationships-account") -> Account:
    account = Account(
        id=account_id,
        name="Relationships Planning Account",
        lifecycle_status="Active",
        segment="Strategic",
        risk_status="warning",
        commercial_value=750000,
        currency="USD",
        health_overall=66,
        health_relationship=62,
        health_usage=72,
        health_delivery=58,
        health_commercial=64,
        created_by_id=owner.id,
    )
    db_session.add(account)
    db_session.add(
        AccountOwner(
            account_id=account.id,
            user_id=owner.id,
            user_name=owner.full_name,
            user_email=owner.email,
            ownership_role="primary_am",
            is_primary=True,
            is_active=True,
            rationale="Relationships planning test owner.",
            created_by_id=owner.id,
        )
    )
    db_session.commit()
    return account


def create_engagement(db_session: Session, account: Account, owner: User) -> Engagement:
    now = datetime.now(timezone.utc)
    engagement = Engagement(
        account_id=account.id,
        name="Renewal Modernization SOW",
        owner_id=owner.id,
        owner_name=owner.full_name,
        service_lines=["Engineering"],
        value=420000,
        currency="USD",
        delivery_health=52,
        renewal_risk="high",
        start_date=now - timedelta(days=250),
        end_date=now + timedelta(days=45),
        renewal_date=now + timedelta(days=40),
        notice_deadline=now + timedelta(days=12),
        notice_period_days=30,
        auto_renewal=True,
        source_citation="SOW-2026 Section 7",
        created_by_id=owner.id,
    )
    db_session.add(engagement)
    db_session.commit()
    return engagement


def create_service(client: TestClient, headers: dict[str, str], slug: str, name: str) -> dict:
    response = client.post(
        "/api/admin/service-catalog",
        headers=headers,
        json={"slug": slug, "name": name, "category": "QA", "tags": ["relationship-test"], "display_order": 99},
    )
    assert response.status_code == 201
    return response.json()


def test_admin_configuration_catalog_and_stage_endpoints(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)

    roles = client.get("/api/admin/stakeholder-roles", headers=headers, params={"active_state": "all", "page": 1, "page_size": 5})
    assert roles.status_code == 200
    assert roles.json()["total"] >= 1

    role = client.post(
        "/api/admin/stakeholder-roles",
        headers=headers,
        json={"slug": "innovation_sponsor", "name": "Innovation Sponsor", "display_order": 50},
    )
    assert role.status_code == 201
    assert role.json()["slug"] == "innovation_sponsor"

    duplicate_role = client.post(
        "/api/admin/stakeholder-roles",
        headers=headers,
        json={"slug": "innovation_sponsor", "name": "Duplicate"},
    )
    assert duplicate_role.status_code == 409

    rule = client.post(
        "/api/admin/stakeholder-gap-rules",
        headers=headers,
        json={
            "rule_key": "missing_innovation_sponsor",
            "title": "Missing innovation sponsor",
            "description": "Account needs an innovation sponsor for growth planning.",
            "severity": "warning",
            "condition_json": {"type": "missing_role", "role": "innovation_sponsor"},
        },
    )
    assert rule.status_code == 201

    blocked_rule_delete = client.delete(f"/api/admin/stakeholder-roles/{role.json()['id']}", headers=headers)
    assert blocked_rule_delete.status_code == 409
    assert blocked_rule_delete.json()["detail"]["gap_rule_usage_count"] == 1

    unused_role = client.post(
        "/api/admin/stakeholder-roles",
        headers=headers,
        json={"slug": "obsolete_contact", "name": "Obsolete Contact", "display_order": 55},
    )
    assert unused_role.status_code == 201
    delete_unused_role = client.delete(f"/api/admin/stakeholder-roles/{unused_role.json()['id']}", headers=headers)
    assert delete_unused_role.status_code == 200

    owner = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner, account_id="relationships-role-delete-account")
    stakeholder_role = client.post(
        "/api/admin/stakeholder-roles",
        headers=headers,
        json={"slug": "client_champion", "name": "Client Champion", "display_order": 60},
    )
    assert stakeholder_role.status_code == 201
    stakeholder = client.post(
        f"/api/accounts/{account.id}/stakeholders",
        headers=headers,
        json={"name": "Client Champion User", "role": "client_champion"},
    )
    assert stakeholder.status_code == 201
    blocked_stakeholder_delete = client.delete(f"/api/admin/stakeholder-roles/{stakeholder_role.json()['id']}", headers=headers)
    assert blocked_stakeholder_delete.status_code == 409
    assert blocked_stakeholder_delete.json()["detail"]["stakeholder_count"] == 1

    active_roles = client.get("/api/stakeholder-roles", headers=headers, params={"page": 1, "page_size": 100})
    assert active_roles.status_code == 200
    assert any(item["slug"] == "client_champion" for item in active_roles.json()["items"])

    invalid_service = client.post("/api/admin/service-catalog", headers=headers, json={"slug": "bad slug", "name": ""})
    assert invalid_service.status_code == 422

    source = create_service(client, headers, "relationship_qa_source", "Relationship QA Source")
    target = create_service(client, headers, "relationship_qa_target", "Relationship QA Target")
    duplicate_service = client.post("/api/admin/service-catalog", headers=headers, json={"slug": source["slug"], "name": "Duplicate"})
    assert duplicate_service.status_code == 409

    adjacency = client.put(
        "/api/admin/service-adjacencies",
        headers=headers,
        json={"rules": [{"source_service_id": source["id"], "target_service_id": target["id"], "relevance_score": 82, "rationale": "QA services commonly uncover automation needs."}]},
    )
    assert adjacency.status_code == 200
    assert adjacency.json()[0]["relevance_score"] == 82

    stages = client.get("/api/admin/opportunity-stages", headers=headers)
    assert stages.status_code == 200
    assert any(item["name"] == "Identified" for item in stages.json())

    transitions = client.get("/api/admin/opportunity-stage-transitions", headers=headers)
    assert transitions.status_code == 200
    assert any(item["from_stage"] == "Negotiation" and item["to_stage"] == "Won" for item in transitions.json())

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/accounts/{account_id}/plan" in paths
    assert "/api/accounts/{account_id}/whitespace" in paths
    assert "/api/accounts/{account_id}/retention-plans" in paths


def test_account_plan_whitespace_recommendation_and_opportunity_flow(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner)
    source = create_service(client, headers, "active_platform_engineering", "Active Platform Engineering")
    target = create_service(client, headers, "adjacent_quality_acceleration", "Adjacent Quality Acceleration")
    adjacency_response = client.put(
        "/api/admin/service-adjacencies",
        headers=headers,
        json={"rules": [{"source_service_id": source["id"], "target_service_id": target["id"], "relevance_score": 91, "rationale": "Active engineering work often benefits from quality acceleration."}]},
    )
    assert adjacency_response.status_code == 200

    empty_plan = client.get(f"/api/accounts/{account.id}/plan", headers=headers)
    assert empty_plan.status_code == 200
    assert empty_plan.json() is None

    plan_response = client.put(
        f"/api/accounts/{account.id}/plan",
        headers=headers,
        json={
            "retention_focus": "Protect renewal through executive coverage.",
            "growth_focus": "Expand platform engineering into QA automation.",
            "risks": ["Sponsor coverage is thin"],
            "commitments": ["Monthly steering review"],
            "service_gaps": ["QA automation"],
            "status": "active",
            "change_summary": "Initial relationship plan.",
            "actions": [
                {
                    "title": "Confirm executive sponsor",
                    "owner_id": owner.id,
                    "due_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                    "priority": "high",
                    "success_criteria": ["Sponsor confirmed"],
                }
            ],
        },
    )
    assert plan_response.status_code == 200
    assert plan_response.json()["actions"][0]["title"] == "Confirm executive sponsor"

    history = client.get(f"/api/accounts/{account.id}/plan/history", headers=headers, params={"page": 1, "page_size": 10})
    assert history.status_code == 200
    assert history.json()["total"] == 1

    public_catalog = client.get("/api/service-catalog", headers=headers, params={"page": 1, "page_size": 100})
    assert public_catalog.status_code == 200
    assert any(item["id"] == source["id"] for item in public_catalog.json()["items"])

    whitespace = client.put(
        f"/api/accounts/{account.id}/whitespace",
        headers=headers,
        json={"items": [{"service_id": source["id"], "coverage_status": "active", "source": "manual"}]},
    )
    assert whitespace.status_code == 200
    assert whitespace.json()[0]["service_id"] == source["id"]

    recommendations = client.get(f"/api/accounts/{account.id}/service-recommendations", headers=headers, params={"page": 1, "page_size": 10})
    assert recommendations.status_code == 200
    recommendation = recommendations.json()["items"][0]
    assert recommendation["target_service_id"] == target["id"]
    assert recommendation["base_fit_score"] == 91
    assert recommendation["relevance_score"] == 94
    assert recommendation["account_fit_score"] == 94
    assert any(factor["label"] == "Active account" for factor in recommendation["score_factors"])

    unconfirmed = client.post(
        f"/api/accounts/{account.id}/service-recommendations/{recommendation['id']}/opportunity",
        headers=headers,
        json={"owner_id": owner.id, "target_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "confirm": False},
    )
    assert unconfirmed.status_code == 422

    kickoff_stage = client.post(
        "/api/admin/opportunity-stages",
        headers=headers,
        json={"slug": "kickoff_review", "name": "Kickoff Review", "display_order": 0},
    )
    assert kickoff_stage.status_code == 201

    converted = client.post(
        f"/api/accounts/{account.id}/service-recommendations/{recommendation['id']}/opportunity",
        headers=headers,
        json={"owner_id": owner.id, "target_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "value": 120000, "currency": "USD", "confirm": True},
    )
    assert converted.status_code == 201
    opportunity = converted.json()
    assert opportunity["source_context"] == "service_recommendation"
    assert opportunity["stage_history"][0]["after_stage"] == "Kickoff Review"

    stored_recommendation = db_session.get(ServiceRecommendation, recommendation["id"])
    assert stored_recommendation is not None
    assert stored_recommendation.status == "converted"
    assert stored_recommendation.created_opportunity_id == opportunity["id"]
    assert db_session.scalar(select(Opportunity).where(Opportunity.id == opportunity["id"])) is not None
    assert db_session.scalar(select(OpportunityStageHistory).where(OpportunityStageHistory.opportunity_id == opportunity["id"])) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.source_record_id == opportunity["id"])) is not None


def test_taxonomy_growth_rules_partial_whitespace_and_open_opportunity_suppression(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner, account_id="growth-taxonomy-account")
    account.lifecycle_status = "Expansion Focus"
    account.risk_status = "healthy"
    account.health_overall = 76
    account.health_delivery = 74
    account.health_commercial = 70
    db_session.commit()

    source = client.post(
        "/api/admin/service-catalog",
        headers=headers,
        json={"slug": "taxonomy_source", "name": "Taxonomy Source", "category": "Innovation Engineering", "tags": ["platform"], "display_order": 101},
    )
    assert source.status_code == 201
    target = client.post(
        "/api/admin/service-catalog",
        headers=headers,
        json={"slug": "taxonomy_target", "name": "Taxonomy Target", "category": "Innovation Quality", "tags": ["automation"], "display_order": 102},
    )
    assert target.status_code == 201

    bundle = client.post(
        "/api/admin/service-growth-bundles",
        headers=headers,
        json={"slug": "quality_bundle", "name": "Quality Bundle", "service_ids": [target.json()["id"]], "display_order": 1},
    )
    assert bundle.status_code == 201
    assert bundle.json()["service_names"] == ["Taxonomy Target"]

    rule = client.post(
        "/api/admin/service-growth-rules",
        headers=headers,
        json={
            "source_selector_type": "category",
            "source_selector_value": "Innovation Engineering",
            "target_selector_type": "bundle",
            "target_selector_value": bundle.json()["id"],
            "base_fit_score": 75,
            "priority": 25,
            "rationale_template": "{source_service} creates a path into {target_service} for {account_name}.",
        },
    )
    assert rule.status_code == 201
    assert rule.json()["source_selector_label"] == "Category: Innovation Engineering"
    assert rule.json()["target_selector_label"] == "Quality Bundle"

    duplicate_pair_rule = client.post(
        "/api/admin/service-growth-rules",
        headers=headers,
        json={
            "source_selector_type": "service",
            "source_selector_value": source.json()["id"],
            "target_selector_type": "service",
            "target_selector_value": target.json()["id"],
            "base_fit_score": 82,
            "priority": 50,
            "rationale_template": "Direct service pair duplicate.",
        },
    )
    assert duplicate_pair_rule.status_code == 422
    duplicate_error = duplicate_pair_rule.json()["detail"]["errors"][0]
    assert duplicate_error["field"] == "target_selector_value"
    assert "overlaps active rule" in duplicate_error["message"]
    assert "Taxonomy Source -> Taxonomy Target" in duplicate_error["message"]

    first_save = client.put(
        f"/api/accounts/{account.id}/whitespace",
        headers=headers,
        json={"items": [{"service_id": source.json()["id"], "coverage_status": "active", "source": "manual"}]},
    )
    assert first_save.status_code == 200

    patch_save = client.patch(
        f"/api/accounts/{account.id}/whitespace",
        headers=headers,
        json={"items": [{"service_id": target.json()["id"], "coverage_status": "potential", "source": "manual"}]},
    )
    assert patch_save.status_code == 200
    statuses = {item["service_id"]: item["coverage_status"] for item in patch_save.json()}
    assert statuses[source.json()["id"]] == "active"
    assert statuses[target.json()["id"]] == "potential"

    recommendations = client.get(f"/api/accounts/{account.id}/service-recommendations", headers=headers, params={"page": 1, "page_size": 10})
    assert recommendations.status_code == 200
    recommendation = recommendations.json()["items"][0]
    assert recommendation["target_service_id"] == target.json()["id"]
    assert recommendation["base_fit_score"] == 75
    assert recommendation["relevance_score"] == 94
    assert {factor["label"] for factor in recommendation["score_factors"]} >= {"Potential coverage", "Expansion stage", "Healthy delivery"}

    opportunity_type = db_session.scalar(select(OpportunityType).where(OpportunityType.slug == "cross_sell"))
    assert opportunity_type is not None
    db_session.add(
        Opportunity(
            account_id=account.id,
            type_id=opportunity_type.id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            owner_email=owner.email,
            name="Existing Taxonomy Target opportunity",
            service_line=target.json()["name"],
            value=1000,
            currency="USD",
            stage="Identified",
            next_step="Already in pipeline.",
            target_date=datetime.now(timezone.utc) + timedelta(days=30),
            created_by_id=owner.id,
            created_by_name=owner.full_name,
            updated_by_id=owner.id,
            updated_by_name=owner.full_name,
        )
    )
    db_session.commit()

    suppressed = client.get(f"/api/accounts/{account.id}/service-recommendations", headers=headers, params={"page": 1, "page_size": 10})
    assert suppressed.status_code == 200
    assert suppressed.json()["items"] == []


def test_renewal_retention_plan_and_task_flow(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner, account_id="retention-account")
    engagement = create_engagement(db_session, account, owner)

    renewals = client.get(f"/api/accounts/{account.id}/retention", headers=headers)
    assert renewals.status_code == 200
    renewal_page = renewals.json()
    assert renewal_page["total"] == 1
    assert renewal_page["items"][0]["source_type"] == "sow"
    assert renewal_page["items"][0]["commercial_exposure"] == 420000

    invalid_renewal = client.patch(
        f"/api/engagements/{engagement.id}/renewal",
        headers=headers,
        json={
            "renewal_date": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
            "notice_deadline": (datetime.now(timezone.utc) + timedelta(days=25)).isoformat(),
            "manual_override_reason": "Testing invalid dates.",
        },
    )
    assert invalid_renewal.status_code == 422

    recommendations = client.get(f"/api/accounts/{account.id}/retention-recommendations", headers=headers)
    assert recommendations.status_code == 200
    recommendation_items = recommendations.json()
    assert {item["title"] for item in recommendation_items} >= {"High renewal risk", "Notice window approaching"}

    invalid_plan = client.post(
        f"/api/accounts/{account.id}/retention-plans",
        headers=headers,
        json={
            "engagement_id": engagement.id,
            "plan_type": "retention",
            "title": "Invalid milestone plan",
            "owner_id": owner.id,
            "renewal_milestone_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "success_criteria": ["Renewal path confirmed"],
            "actions": [
                {
                    "title": "Late action",
                    "owner_id": owner.id,
                    "due_at": (datetime.now(timezone.utc) + timedelta(days=15)).isoformat(),
                    "priority": "high",
                }
            ],
        },
    )
    assert invalid_plan.status_code == 422

    plan_response = client.post(
        f"/api/accounts/{account.id}/retention-plans",
        headers=headers,
        json={
            "engagement_id": engagement.id,
            "plan_type": "retention",
            "title": "Renewal stabilization plan",
            "summary": "Reduce renewal risk before notice deadline.",
            "owner_id": owner.id,
            "renewal_milestone_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "success_criteria": ["Sponsor aligned", "Commercial owner confirmed"],
            "milestones": [{"title": "Sponsor review", "due_at": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()}],
            "actions": [
                {
                    "title": "Prepare renewal risk brief",
                    "owner_id": owner.id,
                    "due_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                    "priority": "high",
                    "success_criteria": ["Brief shared"],
                }
            ],
        },
    )
    assert plan_response.status_code == 201
    plan = plan_response.json()
    assert plan["actions"][0]["title"] == "Prepare renewal risk brief"

    plans = client.get(f"/api/accounts/{account.id}/retention-plans", headers=headers, params={"page": 1, "page_size": 1})
    assert plans.status_code == 200
    assert plans.json()["total"] == 1
    assert plans.json()["pages"] == 1

    unconfirmed_tasks = client.post(
        f"/api/retention-plans/{plan['id']}/tasks",
        headers=headers,
        json={"recommendation_ids": [recommendation_items[0]["id"]], "owner_id": owner.id, "due_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(), "confirm": False},
    )
    assert unconfirmed_tasks.status_code == 422

    tasks = client.post(
        f"/api/retention-plans/{plan['id']}/tasks",
        headers=headers,
        json={"recommendation_ids": [recommendation_items[0]["id"]], "owner_id": owner.id, "due_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(), "confirm": True},
    )
    assert tasks.status_code == 201
    task_items = tasks.json()
    assert task_items[0]["source_type"] == "retention_recommendation"
    assert db_session.scalar(select(Task).where(Task.id == task_items[0]["id"])) is not None


def test_non_admin_cannot_configure_relationship_reference_data(client: TestClient) -> None:
    headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    blocked = client.post(
        "/api/admin/service-catalog",
        headers=headers,
        json={"slug": "blocked_service", "name": "Blocked Service"},
    )
    assert blocked.status_code == 403

    readable = client.get("/api/service-catalog", headers=headers)
    assert readable.status_code == 200
