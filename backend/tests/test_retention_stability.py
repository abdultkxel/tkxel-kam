from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AuditLog, CustomFieldDefinition, Engagement, TimelineEntry, User
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        seed_default_data(session)
        seed_retention_account(session)
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


def seeded_user(session: Session, role: str) -> User:
    user = session.scalar(select(User).where(User.role == role))
    assert user is not None
    return user


def seed_retention_account(session: Session) -> None:
    owner = seeded_user(session, "account_manager")
    commercial = seeded_user(session, "commercial_stakeholder")
    account = Account(
        id="account-retention",
        name="Cafe Retention",
        segment="Enterprise",
        lifecycle_status="Renewal Focus",
        risk_status="warning",
        commercial_value=750000,
        currency="USD",
        source_citation="Project Charter p1: renewal ownership context.",
        created_by_id=owner.id,
    )
    session.add(account)
    session.flush()
    for user, role in ((owner, "primary_am"), (commercial, "leadership_sponsor")):
        session.add(
            AccountOwner(
                account_id=account.id,
                user_id=user.id,
                user_name=user.full_name,
                user_email=user.email,
                ownership_role=role,
                is_primary=role == "primary_am",
                created_by_id=owner.id,
            )
        )
    now = datetime.now(timezone.utc)
    session.add(
        Engagement(
            id="eng-renewal",
            account_id=account.id,
            name="Regional support SOW",
            status="active",
            owner_id=owner.id,
            owner_name=owner.full_name,
            service_lines=["Customer Success"],
            value=750000,
            currency="USD",
            delivery_status="watch",
            delivery_health=68,
            start_date=now - timedelta(days=120),
            end_date=now + timedelta(days=75),
            renewal_date=now + timedelta(days=75),
            notice_deadline=now + timedelta(days=35),
            notice_period_days=40,
            auto_renewal=True,
            commercial_context="Renewal needs executive confirmation.",
            resource_dependency="Named architect coverage pending.",
            risks=["Notice path unclear"],
            source_citation="SOW p4: renewal date and notice period.",
        )
    )
    session.commit()


def seed_custom_field(session: Session) -> None:
    admin = seeded_user(session, "admin")
    session.add(
        CustomFieldDefinition(
            module="retention_stability",
            field_key="exec_sponsor",
            label="Executive Sponsor",
            field_type="text",
            options=[],
            is_required=True,
            show_in_detail=True,
            created_by_id=admin.id,
            updated_by_id=admin.id,
        )
    )
    session.commit()


def test_retention_lifecycle_recommendations_actions_filters_and_audit(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    seed_custom_field(db_session)

    account_retention = client.get("/api/accounts/account-retention/retention", headers=headers)
    assert account_retention.status_code == 200
    assert account_retention.json()["renewal_count"] == 1

    renewal = client.patch(
        "/api/engagements/eng-renewal/renewal",
        headers=headers,
        json={
            "source_kind": "sow",
            "confidence": 88,
            "source_title": "Regional support SOW",
            "source_citation": "SOW p4: renewal date, notice period, and auto renewal.",
            "renewal_date": (datetime.now(timezone.utc) + timedelta(days=80)).isoformat(),
            "notice_deadline": (datetime.now(timezone.utc) + timedelta(days=35)).isoformat(),
            "commercial_exposure": 800000,
            "currency": "USD",
        },
    )
    assert renewal.status_code == 200
    assert renewal.json()["confidence"] == 88

    portfolio = client.get(
        "/api/retention/renewals",
        headers=headers,
        params={"search": "Cafe", "renewal_window": "next_90", "renewal_risk": "warning", "sort": "nearest_notice", "page": 1, "page_size": 1},
    )
    assert portfolio.status_code == 200
    assert portfolio.json()["total"] == 1
    assert portfolio.json()["items"][0]["account_name"] == "Cafe Retention"

    plan_due = datetime.now(timezone.utc) + timedelta(days=10)
    milestone = datetime.now(timezone.utc) + timedelta(days=60)
    created_plan = client.post(
        "/api/accounts/account-retention/retention-plans",
        headers=headers,
        json={
            "engagement_id": "eng-renewal",
            "title": "Renewal stabilization plan",
            "plan_type": "retention",
            "status": "active",
            "risk_level": "warning",
            "owner_id": owner.id,
            "due_at": plan_due.isoformat(),
            "renewal_milestone_at": milestone.isoformat(),
            "success_criteria": ["Notice path confirmed", "Executive sponsor aligned"],
            "custom_field_values": {"exec_sponsor": "Dana Patel"},
            "milestones": [{"title": "Renewal decision", "milestone_type": "renewal", "due_at": milestone.isoformat()}],
        },
    )
    assert created_plan.status_code == 201
    plan = created_plan.json()
    assert plan["custom_field_values"]["exec_sponsor"] == "Dana Patel"

    plans = client.get("/api/accounts/account-retention/retention-plans", headers=headers, params={"search": "stabilization", "page": 1, "page_size": 5})
    assert plans.status_code == 200
    assert plans.json()["total"] == 1

    recommendations = client.get("/api/accounts/account-retention/retention-recommendations", headers=headers)
    assert recommendations.status_code == 200
    assert recommendations.json()["recommendations"]
    recommendation = recommendations.json()["recommendations"][0]

    unconfirmed = client.post(
        f"/api/retention-plans/{plan['id']}/tasks",
        headers=headers,
        json={"title": "Hidden action", "owner_id": owner.id, "due_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(), "confirmed": False},
    )
    assert unconfirmed.status_code == 400

    action = client.post(
        f"/api/retention-plans/{plan['id']}/tasks",
        headers=headers,
        json={
            "title": recommendation["suggested_action"],
            "owner_id": owner.id,
            "due_at": (datetime.now(timezone.utc) + timedelta(days=12)).isoformat(),
            "success_criteria": recommendation["rationale"],
            "source_recommendation_id": recommendation["id"],
            "confirmed": True,
        },
    )
    assert action.status_code == 201

    completed = client.patch(f"/api/retention-plan-actions/{action.json()['id']}", headers=headers, json={"status": "done"})
    assert completed.status_code == 200
    assert completed.json()["completed_at"] is not None

    signals = client.get("/api/retention/signals", headers=headers, params={"page": 1, "page_size": 10})
    assert signals.status_code == 200
    assert any(item["signal_type"] == "notice_window" for item in signals.json()["items"])

    tasks = client.get("/api/retention/tasks", headers=headers, params={"page": 1, "page_size": 10})
    assert tasks.status_code == 200
    assert any(item["title"] == recommendation["suggested_action"] for item in tasks.json()["items"])
    assert any(item["title"].startswith("Validate notice path") for item in tasks.json()["items"])

    calendar = client.get("/api/retention/calendar-items", headers=headers)
    assert calendar.status_code == 200
    assert any(item["item_type"] in {"notice_deadline", "retention_action"} for item in calendar.json())

    report = client.get("/api/retention/reports/portfolio", headers=headers)
    assert report.status_code == 200
    assert report.json()["total_renewals"] == 1
    assert report.json()["signal_count"] >= 1

    assert db_session.scalar(select(AuditLog).where(AuditLog.module == "retention_stability", AuditLog.action == "engagement_renewal_update")) is not None
    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.module == "retention_stability", TimelineEntry.source_record_id == action.json()["id"])) is not None


def test_retention_validation_errors(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    now = datetime.now(timezone.utc)

    bad_dates = client.patch(
        "/api/engagements/eng-renewal/renewal",
        headers=headers,
        json={
            "source_kind": "sow",
            "confidence": 80,
            "source_citation": "SOW p4.",
            "renewal_date": (now + timedelta(days=20)).isoformat(),
            "notice_deadline": (now + timedelta(days=30)).isoformat(),
        },
    )
    assert bad_dates.status_code == 422

    missing_citation = client.patch("/api/engagements/eng-renewal/renewal", headers=headers, json={"source_kind": "extracted", "confidence": 90})
    assert missing_citation.status_code == 422

    missing_manual_reason = client.patch("/api/engagements/eng-renewal/renewal", headers=headers, json={"source_kind": "manual"})
    assert missing_manual_reason.status_code == 422

    plan = client.post(
        "/api/accounts/account-retention/retention-plans",
        headers=headers,
        json={
            "title": "Validation plan",
            "plan_type": "renewal",
            "owner_id": owner.id,
            "due_at": (now + timedelta(days=5)).isoformat(),
            "renewal_milestone_at": (now + timedelta(days=10)).isoformat(),
            "success_criteria": ["Valid plan"],
        },
    )
    assert plan.status_code == 201

    late_action = client.post(
        f"/api/retention-plans/{plan.json()['id']}/tasks",
        headers=headers,
        json={"title": "Late action", "owner_id": owner.id, "due_at": (now + timedelta(days=20)).isoformat(), "confirmed": True},
    )
    assert late_action.status_code == 422


def test_retention_authorization_and_commercial_limited_update(client: TestClient, db_session: Session) -> None:
    leadership_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
    denied = client.patch("/api/engagements/eng-renewal/renewal", headers=leadership_headers, json={"confidence": 90})
    assert denied.status_code == 403

    commercial_headers = auth_headers(client, "commercial.stakeholder.user@tkxel.com", "User@12345")
    allowed = client.patch(
        "/api/engagements/eng-renewal/renewal",
        headers=commercial_headers,
        json={"commercial_exposure": 880000, "currency": "USD", "confidence": 82, "source_kind": "sow", "source_citation": "Commercial addendum p2."},
    )
    assert allowed.status_code == 200
    assert allowed.json()["commercial_exposure"] == 880000

    forbidden = client.patch("/api/engagements/eng-renewal/renewal", headers=commercial_headers, json={"readiness_status": "ready"})
    assert forbidden.status_code == 403
