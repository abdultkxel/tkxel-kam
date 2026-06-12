from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, AuditLog, CustomFieldDefinition, Engagement, Task, TimelineEntry, User
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        seed_default_data(session)
        seed_account_and_engagement(session)
        yield session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    yield test_client
    test_client.close()
    app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seeded_user(session: Session, role: str) -> User:
    user = session.scalar(select(User).where(User.role == role))
    assert user is not None
    return user


def seed_account_and_engagement(session: Session) -> None:
    owner = seeded_user(session, "account_manager")
    ops = seeded_user(session, "delivery_lead")
    account = Account(
        id="account-playbook",
        name="Playbook Customer",
        segment="Enterprise",
        lifecycle_status="Renewal Focus",
        risk_status="warning",
        commercial_value=500000,
        currency="USD",
        created_by_id=owner.id,
    )
    session.add(account)
    session.flush()
    session.add_all(
        [
            AccountOwner(account_id=account.id, user_id=owner.id, user_name=owner.full_name, user_email=owner.email, ownership_role="primary_am", is_primary=True, created_by_id=owner.id),
            AccountOwner(account_id=account.id, user_id=ops.id, user_name=ops.full_name, user_email=ops.email, ownership_role="ops_lead", is_primary=False, created_by_id=owner.id),
        ]
    )
    session.add(
        Engagement(
            id="eng-playbook",
            account_id=account.id,
            name="Renewal Platform",
            owner_id=owner.id,
            owner_name=owner.full_name,
            ops_lead_id=ops.id,
            ops_lead_name=ops.full_name,
            service_lines=["Engineering"],
            value=500000,
            currency="USD",
            delivery_status="active",
            delivery_health=62,
            start_date=datetime.now(timezone.utc) - timedelta(days=90),
            end_date=datetime.now(timezone.utc) + timedelta(days=90),
            renewal_date=datetime.now(timezone.utc) + timedelta(days=88),
            notice_deadline=datetime.now(timezone.utc) + timedelta(days=30),
            notice_period_days=60,
            source_citation="SOW p4 renewal terms",
        )
    )
    session.commit()


def seed_custom_field(session: Session) -> None:
    admin = seeded_user(session, "admin")
    session.add(
        CustomFieldDefinition(
            module="playbooks_tasks_calendar",
            field_key="risk_theme",
            label="Risk Theme",
            field_type="single_select",
            options=["Renewal", "Delivery"],
            is_required=True,
            show_in_detail=True,
            created_by_id=admin.id,
            updated_by_id=admin.id,
        )
    )
    session.commit()


def template_payload(owner_id: str) -> dict:
    return {
        "name": "Renewal readiness recovery",
        "objective": "Recover renewal confidence before notice deadline.",
        "description": "Coordinate executive, delivery, and commercial renewal readiness.",
        "signal_types": ["notice_window", "weak_metric"],
        "weak_metrics": ["commercial", "relationship"],
        "default_owner_rule": "account_primary_am",
        "due_date_rule": {"basis": "execution_date", "offset_days": 7},
        "success_criteria": ["Renewal owner confirmed", "Executive checkpoint scheduled"],
        "skip_rules": ["Client already renewed"],
        "custom_field_values": {"risk_theme": "Renewal"},
        "activities": [
            {
                "title": "Confirm renewal owner",
                "description": "Identify client-side renewal owner and procurement path.",
                "owner_rule": "account_primary_am",
                "due_offset_days": 3,
                "priority": "high",
                "success_criteria": ["Owner identified"],
                "requires_evidence": True,
                "sort_order": 0,
            },
            {
                "title": "Run delivery risk review",
                "description": "Ops lead validates delivery blockers before renewal.",
                "owner_rule": "ops_lead",
                "due_offset_days": 5,
                "priority": "medium",
                "success_criteria": ["Risk review complete"],
                "skip_allowed": True,
                "sort_order": 1,
            },
        ],
    }


def test_playbook_template_recommendation_execution_task_evidence_and_calendar(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    seed_custom_field(db_session)
    owner = seeded_user(db_session, "account_manager")

    invalid = client.post("/api/admin/playbook-templates", headers=headers, json={"name": "Broken", "objective": "Missing activities"})
    assert invalid.status_code == 422

    created = client.post("/api/admin/playbook-templates", headers=headers, json=template_payload(owner.id))
    assert created.status_code == 201
    template = created.json()
    assert template["custom_field_values"]["risk_theme"] == "Renewal"
    assert len(template["activities"]) == 2

    listed = client.get("/api/admin/playbook-templates", headers=headers, params={"search": "renewal", "signal_type": "notice_window", "page": 1, "page_size": 1})
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    updated = client.patch(
        f"/api/admin/playbook-templates/{template['id']}",
        headers=headers,
        json={"objective": "Recover renewal confidence with evidence.", "custom_field_values": {"risk_theme": "Delivery"}},
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2
    assert updated.json()["custom_field_values"]["risk_theme"] == "Delivery"

    recommendations = client.get(
        "/api/signals/signal-1/recommended-playbooks",
        headers=headers,
        params={"account_id": "account-playbook", "signal_type": "notice_window", "weak_metric": "commercial"},
    )
    assert recommendations.status_code == 200
    assert recommendations.json()[0]["template"]["id"] == template["id"]
    assert recommendations.json()[0]["match_score"] == 100

    unconfirmed = client.post(
        f"/api/playbooks/{template['id']}/execute",
        headers=headers,
        json={"account_id": "account-playbook", "engagement_id": "eng-playbook", "confirmed": False},
    )
    assert unconfirmed.status_code == 400

    executed = client.post(
        f"/api/playbooks/{template['id']}/execute",
        headers=headers,
        json={"account_id": "account-playbook", "engagement_id": "eng-playbook", "source_signal_id": "signal-1", "source_signal_type": "notice_window", "source_metric": "commercial", "confirmed": True},
    )
    assert executed.status_code == 201
    execution = executed.json()
    assert len(execution["tasks"]) == 2
    task = execution["tasks"][0]

    note_evidence = client.post(f"/api/tasks/{task['id']}/evidence", headers=headers, data={"evidence_type": "note", "body": "Client procurement owner confirmed."})
    assert note_evidence.status_code == 201

    file_evidence = client.post(
        f"/api/tasks/{task['id']}/evidence",
        headers=headers,
        data={"evidence_type": "file", "title": "Renewal proof"},
        files={"file": ("renewal.txt", b"renewal evidence", "text/plain")},
    )
    assert file_evidence.status_code == 201
    assert file_evidence.json()["file_name"] == "renewal.txt"

    completed = client.patch(f"/api/tasks/{task['id']}", headers=headers, json={"status": "done", "outcome": "Renewal owner confirmed."})
    assert completed.status_code == 200
    assert completed.json()["status"] == "done"

    task_list = client.get("/api/tasks", headers=headers, params={"search": "procurement", "source_type": "playbook", "sort": "priority", "page": 1, "page_size": 1})
    assert task_list.status_code == 200
    assert task_list.json()["total"] >= 1

    calendar = client.get(
        "/api/calendar/items",
        headers=headers,
        params={
            "account_id": "account-playbook",
            "date_from": datetime.now(timezone.utc).isoformat(),
            "date_to": (datetime.now(timezone.utc) + timedelta(days=120)).isoformat(),
            "include_tasks": True,
            "include_governance": True,
            "include_renewals": True,
        },
    )
    assert calendar.status_code == 200
    kinds = {item["kind"] for item in calendar.json()["items"]}
    assert "task" in kinds
    assert {"sow_expiry", "renewal_date", "notice_deadline"}.issubset(kinds)

    assert db_session.scalar(select(TimelineEntry).where(TimelineEntry.source_record_id == execution["id"])) is not None
    assert db_session.scalar(select(AuditLog).where(AuditLog.entity_id == task["id"])) is not None


def test_playbooks_tasks_authorization_and_validation(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    created = client.post("/api/admin/playbook-templates", headers=headers, json={**template_payload(owner.id), "custom_field_values": {}})
    assert created.status_code == 201
    template = created.json()

    inactive = client.patch(f"/api/admin/playbook-templates/{template['id']}", headers=headers, json={"is_active": False})
    assert inactive.status_code == 200
    blocked = client.post(f"/api/playbooks/{template['id']}/execute", headers=headers, json={"account_id": "account-playbook", "confirmed": True})
    assert blocked.status_code == 400

    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
    viewer_list = client.get("/api/tasks", headers=viewer_headers)
    assert viewer_list.status_code == 200
    viewer_create = client.post(
        "/api/tasks",
        headers=viewer_headers,
        json={"account_id": "account-playbook", "owner_id": owner.id, "title": "No edit", "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "priority": "medium", "status": "open"},
    )
    assert viewer_create.status_code == 403

    bad_task = client.post(
        "/api/tasks",
        headers=headers,
        json={"account_id": "account-playbook", "owner_id": owner.id, "title": "", "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "priority": "medium", "status": "open"},
    )
    assert bad_task.status_code == 422

    task = client.post(
        "/api/tasks",
        headers=headers,
        json={"account_id": "account-playbook", "owner_id": owner.id, "title": "Manual renewal follow-up", "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "priority": "medium", "status": "open"},
    )
    assert task.status_code == 201

    skipped_without_reason = client.patch(f"/api/tasks/{task.json()['id']}", headers=headers, json={"status": "cancelled"})
    assert skipped_without_reason.status_code == 400

    bad_link = client.post(f"/api/tasks/{task.json()['id']}/evidence", headers=headers, data={"evidence_type": "link", "url": "ftp://bad.example"})
    assert bad_link.status_code == 422 or bad_link.status_code == 400


def test_open_task_filter_includes_legacy_todo_tasks(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(db_session, "account_manager")
    db_session.add(
        Task(
            account_id="account-playbook",
            title="Legacy todo dashboard task",
            owner_id=owner.id,
            owner_name=owner.full_name,
            due_at=datetime.now(timezone.utc) + timedelta(days=1),
            status="todo",
            priority="critical",
            created_by_id=owner.id,
        )
    )
    db_session.commit()

    response = client.get("/api/tasks", headers=headers, params={"status": "open", "search": "Legacy todo", "page": 1, "page_size": 10})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["title"] == "Legacy todo dashboard task"
    assert response.json()["items"][0]["status"] == "todo"


def test_playbook_operations_follow_granular_permissions(client: TestClient, db_session: Session) -> None:
    super_admin_headers = auth_headers(client)
    admin_headers = auth_headers(client, "admin.user@tkxel.com", "User@12345")
    kam_head_headers = auth_headers(client, "kam.head.user@tkxel.com", "User@12345")
    owner_headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")
    viewer_headers = auth_headers(client, "leadership.viewer.user@tkxel.com", "User@12345")
    owner = seeded_user(db_session, "account_manager")

    admin_create = client.post("/api/admin/playbook-templates", headers=admin_headers, json={**template_payload(owner.id), "custom_field_values": {}})
    assert admin_create.status_code == 201

    kam_head_create = client.post("/api/admin/playbook-templates", headers=kam_head_headers, json={**template_payload(owner.id), "name": "KAM Head blocked", "custom_field_values": {}})
    assert kam_head_create.status_code == 201

    viewer_create = client.post("/api/admin/playbook-templates", headers=viewer_headers, json={**template_payload(owner.id), "name": "Viewer cannot configure", "custom_field_values": {}})
    assert viewer_create.status_code == 403

    created = client.post("/api/admin/playbook-templates", headers=super_admin_headers, json={**template_payload(owner.id), "name": "Super Admin Capability Template", "custom_field_values": {}})
    assert created.status_code == 201
    template_id = created.json()["id"]

    admin_update = client.patch(f"/api/admin/playbook-templates/{template_id}", headers=admin_headers, json={"objective": "Admin can update by capability"})
    assert admin_update.status_code == 200

    viewer_execute = client.post(f"/api/playbooks/{template_id}/execute", headers=viewer_headers, json={"account_id": "account-playbook", "confirmed": True})
    assert viewer_execute.status_code == 403

    owner_execute = client.post(f"/api/playbooks/{template_id}/execute", headers=owner_headers, json={"account_id": "account-playbook", "confirmed": True})
    assert owner_execute.status_code == 201
