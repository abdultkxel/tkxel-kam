from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, AccountOwner, CustomFieldDefinition, CustomFieldValue, Opportunity, OpportunityActionItem, Task, TimelineEntry
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


def create_account(db_session: Session, owner: dict, account_id: str = "opportunity-account") -> str:
    account = Account(
        id=account_id,
        name="Opportunity Workspace",
        lifecycle_status="Active",
        segment="Growth",
        risk_status="healthy",
        commercial_value=250000,
        currency="USD",
        health_overall=82,
        health_relationship=80,
        health_usage=78,
        health_delivery=84,
        health_commercial=86,
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
            rationale="Opportunity test owner.",
            created_by_id=owner["id"],
        )
    )
    db_session.commit()
    return account.id


def first_opportunity_type(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.get("/api/opportunity-types", headers=headers)
    assert response.status_code == 200
    page = response.json()
    assert page["total"] >= 1
    return page["items"][0]


def seed_custom_field(session: Session, field_key: str = "expansion_theme", label: str = "Expansion Theme") -> None:
    admin = session.scalar(select(AccountOwner).where(AccountOwner.user_id.is_not(None)))
    created_by_id = admin.user_id if admin else None
    session.add(
        CustomFieldDefinition(
            module="opportunities",
            field_key=field_key,
            label=label,
            field_type="single_select",
            options=["Growth", "Retention"],
            is_required=True,
            show_in_detail=True,
            created_by_id=created_by_id,
            updated_by_id=created_by_id,
        )
    )
    session.commit()


def opportunity_payload(account_id: str, owner_id: str, type_id: str, **overrides: object) -> dict:
    payload = {
        "account_id": account_id,
        "type_id": type_id,
        "owner_id": owner_id,
        "name": "AI support expansion",
        "service_line": "Data Analytics",
        "value": 175000,
        "currency": "USD",
        "stage": "Identified",
        "next_step": "Confirm sponsor priority and success criteria.",
        "target_date": "2026-06-30T12:00:00Z",
        "source_context": "manual",
        "action_items": [
            {
                "title": "Send discovery summary",
                "owner_id": owner_id,
                "due_date": "2026-06-07T12:00:00Z",
                "priority": "medium",
            }
        ],
    }
    payload.update(overrides)
    return payload


def test_opportunity_create_list_stage_decision_action_archive_flow(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    account_id = create_account(db_session, owner)
    opportunity_type = first_opportunity_type(client, headers)

    invalid_response = client.post(
        "/api/opportunities",
        headers=headers,
        json=opportunity_payload(account_id, owner["id"], opportunity_type["id"], value=-1),
    )
    assert invalid_response.status_code == 422
    assert invalid_response.json()["errors"][0]["field"] == "value"

    seed_custom_field(db_session)

    missing_custom_response = client.post(
        "/api/opportunities",
        headers=headers,
        json=opportunity_payload(account_id, owner["id"], opportunity_type["id"], action_items=[]),
    )
    assert missing_custom_response.status_code == 422
    assert missing_custom_response.json()["detail"]["errors"][0]["field"] == "custom_field_values.expansion_theme"

    create_response = client.post(
        "/api/opportunities",
        headers=headers,
        json=opportunity_payload(account_id, owner["id"], opportunity_type["id"], custom_field_values={"expansion_theme": "Growth"}),
    )
    assert create_response.status_code == 201
    opportunity = create_response.json()
    assert opportunity["account_name"] == "Opportunity Workspace"
    assert opportunity["type_id"] == opportunity_type["id"]
    assert opportunity["estimated_value"] == 175000
    assert opportunity["custom_field_values"]["expansion_theme"] == "Growth"
    assert opportunity["action_items"][0]["title"] == "Send discovery summary"
    assert opportunity["action_items"][0]["future_task_id"]
    initial_task = db_session.get(Task, opportunity["action_items"][0]["future_task_id"])
    assert initial_task is not None
    assert initial_task.source_type == "opportunity_action_item"
    assert initial_task.source_record_id == opportunity["action_items"][0]["id"]
    custom_values = db_session.query(CustomFieldValue).filter(CustomFieldValue.record_id == opportunity["id"]).all()
    assert custom_values
    assert custom_values[0].module == "opportunities"

    summary_response = client.get(f"/api/accounts/{account_id}/summary-cards", headers=headers)
    assert summary_response.status_code == 200
    assert summary_response.json()["open_opportunities"] == 1

    list_response = client.get(
        "/api/opportunities",
        headers=headers,
        params={"account_id": account_id, "search": "support", "page": 1, "page_size": 10},
    )
    assert list_response.status_code == 200
    page = list_response.json()
    assert page["total"] == 1
    assert page["totals"]["open_count"] == 1
    assert page["totals"]["stage_counts"]["Identified"] == 1

    stalled_record = db_session.get(Opportunity, opportunity["id"])
    assert stalled_record is not None
    stalled_record.updated_at = datetime.now(timezone.utc) - timedelta(days=100)
    db_session.commit()
    stalled_list = client.get(
        "/api/opportunities",
        headers=headers,
        params={"account_id": account_id, "stalled": True, "stalled_after_days": 90},
    )
    assert stalled_list.status_code == 200
    assert stalled_list.json()["total"] == 1

    qualified_response = client.post(
        f"/api/opportunities/{opportunity['id']}/stage",
        headers=headers,
        json={"stage": "Qualified", "reason": "Discovery qualified."},
    )
    assert qualified_response.status_code == 200
    assert qualified_response.json()["opportunity"]["stage"] == "Qualified"

    backward_response = client.post(
        f"/api/opportunities/{opportunity['id']}/stage",
        headers=headers,
        json={"stage": "Identified", "reason": "Qualification needs more discovery."},
    )
    assert backward_response.status_code == 200
    assert backward_response.json()["opportunity"]["stage"] == "Identified"

    stage_response = client.post(
        f"/api/opportunities/{opportunity['id']}/stage",
        headers=headers,
        json={"stage": "Won", "reason": "Client approved the pilot.", "outcome_reason": "Budget approved by sponsor."},
    )
    assert stage_response.status_code == 200
    stage_payload = stage_response.json()
    assert stage_payload["opportunity"]["stage"] == "Won"
    assert stage_payload["history"]["before_stage"] == "Identified"
    assert stage_payload["history"]["after_stage"] == "Won"

    open_only_list = client.get("/api/opportunities", headers=headers, params={"account_id": account_id, "open_only": True})
    assert open_only_list.status_code == 200
    assert open_only_list.json()["total"] == 0

    same_stage_response = client.post(
        f"/api/opportunities/{opportunity['id']}/stage",
        headers=headers,
        json={"stage": "Won"},
    )
    assert same_stage_response.status_code == 422
    same_stage_body = same_stage_response.json()
    assert same_stage_body["detail"]["errors"][0]["field"] == "stage"

    decision_response = client.post(
        f"/api/opportunities/{opportunity['id']}/decisions",
        headers=headers,
        json={"decision_text": "Proceed with pilot scope.", "owner_name": "Client Sponsor"},
    )
    assert decision_response.status_code == 201
    assert decision_response.json()["timeline_entry_id"]

    action_response = client.post(
        f"/api/opportunities/{opportunity['id']}/action-items",
        headers=headers,
        json={"title": "Prepare kickoff brief", "owner_email": "owner@example.com", "due_date": "2026-06-10T12:00:00Z"},
    )
    assert action_response.status_code == 201
    action_body = action_response.json()
    action_item_id = action_body["id"]
    assert action_body["future_task_id"]
    action_task = db_session.get(Task, action_body["future_task_id"])
    assert action_task is not None
    assert action_task.source_type == "opportunity_action_item"
    assert action_task.source_record_id == action_item_id

    complete_task = client.patch(
        f"/api/tasks/{action_task.id}",
        headers=headers,
        json={"status": "done", "outcome": "Kickoff brief sent to sponsor."},
    )
    assert complete_task.status_code == 200
    db_session.expire_all()
    synced_action = db_session.get(OpportunityActionItem, action_item_id)
    assert synced_action is not None
    assert synced_action.status == "completed"
    assert synced_action.completed_at is not None

    reopen_action = client.patch(
        f"/api/opportunity-action-items/{action_item_id}",
        headers=headers,
        json={"status": "open"},
    )
    assert reopen_action.status_code == 200
    assert reopen_action.json()["completed_at"] is None
    db_session.expire_all()
    reopened_task = db_session.get(Task, action_task.id)
    assert reopened_task is not None
    assert reopened_task.status == "open"
    assert reopened_task.completed_at is None

    no_task_response = client.post(
        f"/api/opportunities/{opportunity['id']}/action-items",
        headers=headers,
        json={"title": "Document no-task action", "owner_email": "owner@example.com", "due_date": "2026-06-12T12:00:00Z", "create_task": False},
    )
    assert no_task_response.status_code == 201
    assert no_task_response.json()["future_task_id"] is None

    archive_response = client.delete(f"/api/opportunities/{opportunity['id']}", headers=headers, params={"reason": "Historical test archive"})
    assert archive_response.status_code == 200

    default_list = client.get("/api/opportunities", headers=headers, params={"account_id": account_id})
    assert default_list.status_code == 200
    assert default_list.json()["total"] == 0

    archived_list = client.get("/api/opportunities", headers=headers, params={"account_id": account_id, "include_archived": True})
    assert archived_list.status_code == 200
    assert archived_list.json()["total"] == 1
    assert archived_list.json()["items"][0]["archived_at"]

    blocked_update = client.patch(
        f"/api/opportunities/{opportunity['id']}",
        headers=headers,
        json={"next_step": "Follow up after archive."},
    )
    assert blocked_update.status_code == 400

    restore_response = client.post(f"/api/opportunities/{opportunity['id']}/restore", headers=headers, params={"reason": "QA restore"})
    assert restore_response.status_code == 200
    assert restore_response.json()["archived_at"] is None
    assert restore_response.json()["archive_reason"] is None

    restored_list = client.get("/api/opportunities", headers=headers, params={"account_id": account_id})
    assert restored_list.status_code == 200
    assert restored_list.json()["total"] == 1

    stored = db_session.get(Opportunity, opportunity["id"])
    assert stored is not None
    assert stored.archived_at is None
    timeline_events = list(db_session.scalars(select(TimelineEntry).where(TimelineEntry.source_record_id == opportunity["id"])))
    assert len(timeline_events) >= 4


def test_opportunity_type_admin_lifecycle_and_openapi(client: TestClient) -> None:
    headers = auth_headers(client)

    create_response = client.post(
        "/api/admin/opportunity-types",
        headers=headers,
        json={"slug": "innovation_lab", "name": "Innovation Lab", "description": "Experimental opportunity type.", "display_order": 20},
    )
    assert create_response.status_code == 201
    opportunity_type = create_response.json()
    assert opportunity_type["slug"] == "innovation_lab"

    duplicate_response = client.post(
        "/api/admin/opportunity-types",
        headers=headers,
        json={"slug": "innovation_lab", "name": "Duplicate"},
    )
    assert duplicate_response.status_code == 409

    update_response = client.patch(
        f"/api/admin/opportunity-types/{opportunity_type['id']}",
        headers=headers,
        json={"name": "Innovation Lab Services", "display_order": 21},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Innovation Lab Services"

    delete_response = client.delete(f"/api/admin/opportunity-types/{opportunity_type['id']}", headers=headers)
    assert delete_response.status_code == 200

    inactive_response = client.get("/api/admin/opportunity-types", headers=headers, params={"active_state": "inactive"})
    assert inactive_response.status_code == 200
    assert any(item["id"] == opportunity_type["id"] for item in inactive_response.json()["items"])

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert paths["/api/opportunities"]["post"]["summary"] == "Create opportunity"
    assert paths["/api/opportunities/{opportunity_id}/stage"]["post"]["summary"] == "Move opportunity stage"
    assert paths["/api/opportunities/{opportunity_id}/restore"]["post"]["summary"] == "Restore opportunity"


def test_stage_deactivation_requires_no_existing_opportunities_and_order_controls(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    account_id = create_account(db_session, owner, account_id="stage-admin-account")
    opportunity_type = first_opportunity_type(client, headers)

    create_response = client.post(
        "/api/opportunities",
        headers=headers,
        json=opportunity_payload(account_id, owner["id"], opportunity_type["id"], action_items=[]),
    )
    assert create_response.status_code == 201

    stages = client.get("/api/admin/opportunity-stages", headers=headers)
    assert stages.status_code == 200
    identified = next(item for item in stages.json() if item["name"] == "Identified")
    assert identified["in_use_count"] == 1

    blocked_deactivation = client.patch(
        f"/api/admin/opportunity-stages/{identified['id']}",
        headers=headers,
        json={"is_active": False},
    )
    assert blocked_deactivation.status_code == 409
    assert blocked_deactivation.json()["detail"]["errors"][0]["field"] == "is_active"
    assert "1 opportunity record" in blocked_deactivation.json()["detail"]["errors"][0]["message"]

    kickoff_stage = client.post(
        "/api/admin/opportunity-stages",
        headers=headers,
        json={"slug": "kickoff_review", "name": "Kickoff Review", "display_order": 0},
    )
    assert kickoff_stage.status_code == 201
    assert kickoff_stage.json()["display_order"] == 0
    assert kickoff_stage.json()["in_use_count"] == 0

    ordered_stages = client.get("/api/opportunity-stages", headers=headers)
    assert ordered_stages.status_code == 200
    assert ordered_stages.json()[0]["name"] == "Kickoff Review"

    deactivate_unused = client.patch(
        f"/api/admin/opportunity-stages/{kickoff_stage.json()['id']}",
        headers=headers,
        json={"is_active": False},
    )
    assert deactivate_unused.status_code == 200
    assert deactivate_unused.json()["is_active"] is False


def test_opportunity_create_without_stage_uses_first_active_stage(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    owner = seeded_user(client, headers, "account_manager")
    account_id = create_account(db_session, owner, account_id="stage-default-account")
    opportunity_type = first_opportunity_type(client, headers)

    kickoff_stage = client.post(
        "/api/admin/opportunity-stages",
        headers=headers,
        json={"slug": "kickoff_review", "name": "Kickoff Review", "display_order": 0},
    )
    assert kickoff_stage.status_code == 201

    payload = opportunity_payload(account_id, owner["id"], opportunity_type["id"], action_items=[])
    payload.pop("stage")
    create_response = client.post("/api/opportunities", headers=headers, json=payload)

    assert create_response.status_code == 201
    opportunity = create_response.json()
    assert opportunity["stage"] == "Kickoff Review"
    assert opportunity["stage_history"][0]["after_stage"] == "Kickoff Review"
