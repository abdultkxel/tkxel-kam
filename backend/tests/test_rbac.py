from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Permission, Role, RolePermission, User
from app.rbac import DEFAULT_ROLES
from app.rbac_catalog import PERMISSIONS
from app.services.seed import seed_default_data

SEEDED_ROLE_SLUGS = {role.slug for role in DEFAULT_ROLES}
VISIBLE_BASE_ROLE_SLUGS = {"account_manager", "admin", "kam_head", "leadership_viewer"}
VISIBLE_BASE_USERS = {
    "account.manager.user@tkxel.com": ("Account Manager", "account_manager", "Account Manager"),
    "account.manager.two@tkxel.com": ("Account Manager Two", "account_manager", "Account Manager"),
    "admin.user@tkxel.com": ("Admin", "admin", "Admin"),
    "abdul.rehman@tkxel.io": ("KAM Head", "kam_head", "KAM Head"),
    "leadership.viewer.user@tkxel.com": ("Leadership Executive", "leadership_viewer", "Leadership / Executive"),
}


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
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str = "admin@tkxel.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def permission_is_allowed(role: dict, module: str, action: str) -> bool:
    return any(
        grant["permission"]["module"] == module and grant["permission"]["action"] == action and grant["allowed"]
        for grant in role["permissions"]
    )


def test_seed_creates_required_prd_roles_and_permissions(client: TestClient) -> None:
    headers = auth_headers(client)

    roles_response = client.get("/api/admin/roles", headers=headers)
    permissions_response = client.get("/api/admin/permissions", headers=headers)

    assert roles_response.status_code == 200
    assert permissions_response.status_code == 200
    listed_roles = {role["slug"] for role in roles_response.json()["items"]}
    assert SEEDED_ROLE_SLUGS == {"super_admin", *VISIBLE_BASE_ROLE_SLUGS}
    assert listed_roles == VISIBLE_BASE_ROLE_SLUGS
    assert "delivery_lead" not in listed_roles
    permissions = permissions_response.json()
    expected_permission_keys = {permission.key for permission in PERMISSIONS}
    assert len(permissions) == len(expected_permission_keys)
    assert {permission["key"] for permission in permissions} == expected_permission_keys
    accounts_view = next(permission for permission in permissions if permission["module"] == "accounts" and permission["action"] == "view_assigned")
    assert accounts_view["section_name"] == "Accounts"
    assert accounts_view["action_label"] == "View assigned accounts"
    assert accounts_view["risk_level"] == "low"


def test_seed_removes_non_catalog_permissions_and_grants(db_session: Session) -> None:
    role = db_session.scalar(select(Role).where(Role.slug == "account_manager"))
    assert role is not None
    stale_permission = Permission(module="account_overview", action="view", description="Old generic permission")
    db_session.add(stale_permission)
    db_session.flush()
    stale_permission_id = stale_permission.id
    db_session.add(RolePermission(role_id=role.id, permission_id=stale_permission.id, allowed=True))
    db_session.commit()

    seed_default_data(db_session)

    assert db_session.scalar(select(Permission).where(Permission.module == "account_overview", Permission.action == "view")) is None
    assert db_session.scalar(select(RolePermission).where(RolePermission.permission_id == stale_permission_id)) is None


def test_seed_creates_visible_users_for_required_roles_and_break_glass_admin(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)

    response = client.get("/api/admin/users", headers=headers)

    assert response.status_code == 200
    body = response.json()
    users = body["items"]
    assert body["total"] == len(VISIBLE_BASE_USERS)
    listed_roles = {user["role"] for user in users}
    assert listed_roles == VISIBLE_BASE_ROLE_SLUGS
    assert {user["email"] for user in users} == set(VISIBLE_BASE_USERS)
    for user in users:
        expected_name, expected_role, expected_title = VISIBLE_BASE_USERS[user["email"]]
        assert user["full_name"] == expected_name
        assert user["role"] == expected_role
        assert user["title"] == expected_title
    assert sum(1 for user in users if user["role"] == "account_manager") == 2
    assert not any(user["email"] == "admin@tkxel.com" or user["role"] == "super_admin" for user in users)
    assert db_session.scalar(select(User).where(User.email == "admin@tkxel.com", User.role == "super_admin")) is not None


def test_admin_kam_head_and_account_manager_onboarding_approval_permissions(client: TestClient) -> None:
    headers = auth_headers(client)
    permissions_response = client.get("/api/admin/permissions", headers=headers)
    assert permissions_response.status_code == 200
    total_permissions = len(permissions_response.json())

    for role_slug in ("super_admin", "admin", "kam_head"):
        role_response = client.get(f"/api/admin/roles/{role_slug}", headers=headers)
        assert role_response.status_code == 200
        assert sum(1 for grant in role_response.json()["permissions"] if grant["allowed"]) == total_permissions

    account_manager_response = client.get("/api/admin/roles/account_manager", headers=headers)
    assert account_manager_response.status_code == 200
    account_manager_role = account_manager_response.json()
    assert not permission_is_allowed(account_manager_role, "kyc", "approve_draft")
    assert permission_is_allowed(account_manager_role, "onboarding", "create_draft")
    assert permission_is_allowed(account_manager_role, "onboarding", "approve_draft")
    assert permission_is_allowed(account_manager_role, "kyc", "run_assistant")


def test_break_glass_super_admin_is_hidden_from_lists_but_protected(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)
    super_admin = db_session.scalar(select(User).where(User.role == "super_admin"))
    assert super_admin is not None

    users_response = client.get("/api/admin/users", headers=headers)
    assert users_response.status_code == 200
    assert all(user["role"] != "super_admin" for user in users_response.json()["items"])
    roles_response = client.get("/api/admin/roles", headers=headers)
    assert roles_response.status_code == 200
    assert all(role["slug"] != "super_admin" for role in roles_response.json()["items"])

    role_response = client.get("/api/admin/roles/super_admin", headers=headers)
    assert role_response.status_code == 200

    read_response = client.get(f"/api/admin/users/{super_admin.id}", headers=headers)
    assert read_response.status_code == 200
    assert read_response.json()["role"] == "super_admin"

    create_response = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "another.admin@tkxel.com",
            "password": "User@12345",
            "full_name": "Another Super Admin",
            "role": "super_admin",
        },
    )
    assert create_response.status_code == 400

    downgrade_response = client.patch(
        f"/api/admin/users/{super_admin.id}",
        headers=headers,
        json={"role": "admin"},
    )
    assert downgrade_response.status_code == 400

    deactivate_response = client.patch(
        f"/api/admin/users/{super_admin.id}",
        headers=headers,
        json={"is_active": False},
    )
    assert deactivate_response.status_code == 400

    normal_user_response = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "protected-role-test@tkxel.com",
            "password": "User@12345",
            "full_name": "Protected Role Test",
            "role": "account_manager",
        },
    )
    assert normal_user_response.status_code == 201
    update_response = client.patch(
        f"/api/admin/users/{normal_user_response.json()['id']}",
        headers=headers,
        json={"role": "super_admin"},
    )
    assert update_response.status_code == 400

    admin_headers = auth_headers(client, "admin.user@tkxel.com", "User@12345")
    delete_response = client.delete(f"/api/admin/users/{super_admin.id}", headers=admin_headers)
    assert delete_response.status_code == 400


def test_admin_can_create_update_and_delete_managed_users(client: TestClient) -> None:
    headers = auth_headers(client)

    create_response = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "kam.user@tkxel.com",
            "password": "User@12345",
            "full_name": "KAM User",
            "role": "account_manager",
            "title": "Account Manager",
            "phone": "+1 555 0100",
            "avatar_initials": "KU",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    created_user = create_response.json()
    assert created_user["email"] == "kam.user@tkxel.com"
    assert created_user["role"] == "account_manager"

    update_response = client.patch(
        f"/api/admin/users/{created_user['id']}",
        headers=headers,
        json={"role": "leadership_viewer", "is_active": False},
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "leadership_viewer"
    assert update_response.json()["is_active"] is False

    list_response = client.get("/api/admin/users", headers=headers)
    assert list_response.status_code == 200
    assert any(user["email"] == "kam.user@tkxel.com" for user in list_response.json()["items"])

    delete_response = client.delete(f"/api/admin/users/{created_user['id']}", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "User deleted successfully"

    missing_response = client.get(f"/api/admin/users/{created_user['id']}", headers=headers)
    assert missing_response.status_code == 404


def test_account_manager_cannot_use_admin_rbac_without_permission(client: TestClient) -> None:
    admin_headers = auth_headers(client)
    create_response = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "am@tkxel.com",
            "password": "User@12345",
            "full_name": "Account Manager",
            "role": "account_manager",
        },
    )
    assert create_response.status_code == 201

    account_manager_headers = auth_headers(client, "am@tkxel.com", "User@12345")
    response = client.get("/api/admin/roles", headers=account_manager_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "You do not have permission to perform this action"


def test_role_permissions_can_be_updated(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.put(
        "/api/admin/roles/account_manager/permissions",
        headers=headers,
        json={"permissions": [{"module": "access_admin", "action": "manage_roles", "allowed": True}]},
    )

    assert response.status_code == 200
    assert permission_is_allowed(response.json(), "access_admin", "manage_roles")


def test_capabilities_endpoint_returns_permission_keys_and_booleans(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.get("/api/users/me/capabilities", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert "access_admin:manage_roles" in body["permission_keys"]
    assert body["can_access_admin"] is True
    assert body["can_view_portfolio"] is True
    assert body["can_approve_kyc"] is True


def test_user_list_supports_search_status_role_and_pagination(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.get(
        "/api/admin/users",
        headers=headers,
        params={"search": "account.manager", "status": "active", "role": "account_manager", "page": 1, "page_size": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert body["total"] >= 1
    assert body["items"][0]["email"] == "account.manager.user@tkxel.com"
    assert body["items"][0]["is_active"] is True
    assert body["items"][0]["role"] == "account_manager"


def test_role_list_supports_search_type_and_pagination(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.get(
        "/api/admin/roles",
        headers=headers,
        params={"search": "account", "type": "system", "page": 1, "page_size": 2},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] >= 1
    assert all(role["is_system"] for role in body["items"])
    assert all("account" in f"{role['slug']} {role['name']} {role.get('description') or ''}".lower() for role in body["items"])


def test_super_admin_can_create_update_and_delete_custom_roles(client: TestClient) -> None:
    headers = auth_headers(client)

    create_response = client.post(
        "/api/admin/roles",
        headers=headers,
        json={"slug": "regional_director", "name": "Regional Director", "description": "Regional portfolio governance."},
    )
    assert create_response.status_code == 201
    assert create_response.json()["slug"] == "regional_director"

    permission_response = client.put(
        "/api/admin/roles/regional_director/permissions",
        headers=headers,
        json={"permissions": [{"module": "accounts", "action": "view_assigned", "allowed": True}]},
    )
    assert permission_response.status_code == 200
    assert permission_is_allowed(permission_response.json(), "accounts", "view_assigned")

    update_response = client.patch(
        "/api/admin/roles/regional_director",
        headers=headers,
        json={"name": "Regional Portfolio Director"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Regional Portfolio Director"

    delete_response = client.delete("/api/admin/roles/regional_director", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Role deleted successfully"


def test_system_and_assigned_roles_are_protected_from_delete(client: TestClient) -> None:
    headers = auth_headers(client)

    system_response = client.delete("/api/admin/roles/account_manager", headers=headers)
    assert system_response.status_code == 400
    assert system_response.json()["detail"] == "System roles cannot be deleted"

    role_response = client.post(
        "/api/admin/roles",
        headers=headers,
        json={"slug": "temporary_manager", "name": "Temporary Manager"},
    )
    assert role_response.status_code == 201
    user_response = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "temporary.manager@tkxel.com",
            "password": "User@12345",
            "full_name": "Temporary Manager",
            "role": "temporary_manager",
        },
    )
    assert user_response.status_code == 201

    assigned_response = client.delete("/api/admin/roles/temporary_manager", headers=headers)
    assert assigned_response.status_code == 400
    assert assigned_response.json()["detail"] == "Role is assigned to users and cannot be deleted"


def test_field_builder_crud_filters_pagination_validation_and_docs(client: TestClient) -> None:
    headers = auth_headers(client)

    modules_response = client.get("/api/admin/custom-fields/modules", headers=headers)
    assert modules_response.status_code == 200
    module_slugs = [module["slug"] for module in modules_response.json()]
    assert module_slugs == [
        "accounts",
        "client_education_content",
        "escalation_management",
        "governance_reviews",
        "playbooks",
        "tasks",
        "opportunities",
    ]
    assert "account_onboarding_workspace" not in module_slugs
    assert "account_overview" not in module_slugs
    assert "onboarding" not in module_slugs
    assert "playbooks_tasks_calendar" not in module_slugs
    assert "content" not in module_slugs
    assert "escalations" not in module_slugs

    legacy_account_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "account_overview",
            "field_key": "legacy_account_note",
            "label": "Legacy Account Note",
            "field_type": "text",
        },
    )
    assert legacy_account_response.status_code == 422
    legacy_account_errors = legacy_account_response.json()["detail"]["errors"]
    assert legacy_account_errors[0]["field"] == "module"
    assert legacy_account_errors[0]["message"] == "Module must have runtime custom field support."

    legacy_playbook_task_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "playbooks_tasks_calendar",
            "field_key": "legacy_work_note",
            "label": "Legacy Work Note",
            "field_type": "text",
        },
    )
    assert legacy_playbook_task_response.status_code == 422
    legacy_playbook_task_errors = legacy_playbook_task_response.json()["detail"]["errors"]
    assert legacy_playbook_task_errors[0]["field"] == "module"
    assert legacy_playbook_task_errors[0]["message"] == "Module must have runtime custom field support."

    unsupported_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "content",
            "field_key": "legacy_content_note",
            "label": "Legacy Content Note",
            "field_type": "text",
        },
    )
    assert unsupported_response.status_code == 422
    unsupported_errors = unsupported_response.json()["detail"]["errors"]
    assert unsupported_errors[0]["field"] == "module"
    assert unsupported_errors[0]["message"] == "Module must have runtime custom field support."

    invalid_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "accounts",
            "field_key": "customer_tier",
            "label": "Customer Tier",
            "field_type": "single_select",
            "options": [],
        },
    )
    assert invalid_response.status_code == 422
    assert invalid_response.json()["errors"][0]["field"] == "options"
    assert invalid_response.json()["errors"][0]["message"] == "Options are required for select fields."

    create_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "accounts",
            "field_key": "customer_tier",
            "label": "Customer Tier",
            "description": "Tier configured by account leadership.",
            "field_type": "single_select",
            "options": ["Gold", "Silver"],
            "is_required": True,
            "is_sensitive": False,
            "is_active": True,
            "show_in_list": True,
            "show_in_detail": True,
            "sort_order": 5,
        },
    )
    assert create_response.status_code == 201
    field_id = create_response.json()["id"]
    assert create_response.json()["field_key"] == "customer_tier"
    assert create_response.json()["options"] == ["Gold", "Silver"]

    account_runtime_response = client.get("/api/custom-fields", headers=headers, params={"module": "accounts"})
    assert account_runtime_response.status_code == 200
    assert any(item["field_key"] == "customer_tier" for item in account_runtime_response.json())

    escalation_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "escalation_management",
            "field_key": "mitigation_owner_note",
            "label": "Mitigation Owner Note",
            "field_type": "text",
            "show_in_detail": True,
        },
    )
    assert escalation_response.status_code == 201
    escalation_field_id = escalation_response.json()["id"]

    task_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "tasks",
            "field_key": "task_theme",
            "label": "Task Theme",
            "field_type": "text",
            "show_in_detail": True,
        },
    )
    assert task_response.status_code == 201
    task_field_id = task_response.json()["id"]

    runtime_response = client.get("/api/custom-fields", headers=headers, params={"module": "escalation_management"})
    assert runtime_response.status_code == 200
    assert any(item["field_key"] == "mitigation_owner_note" for item in runtime_response.json())

    task_runtime_response = client.get("/api/custom-fields", headers=headers, params={"module": "tasks"})
    assert task_runtime_response.status_code == 200
    assert any(item["field_key"] == "task_theme" for item in task_runtime_response.json())

    duplicate_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "accounts",
            "field_key": "customer_tier",
            "label": "Customer Tier",
            "field_type": "single_select",
            "options": ["Platinum"],
        },
    )
    assert duplicate_response.status_code == 409

    list_response = client.get(
        "/api/admin/custom-fields",
        headers=headers,
        params={
            "search": "tier",
            "module": "accounts",
            "field_type": "single_select",
            "status": "active",
            "sort": "label",
            "direction": "asc",
            "page": 1,
            "page_size": 1,
        },
    )
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body["page"] == 1
    assert list_body["page_size"] == 1
    assert list_body["total"] == 1
    assert list_body["items"][0]["id"] == field_id

    update_response = client.patch(
        f"/api/admin/custom-fields/{field_id}",
        headers=headers,
        json={"label": "Customer Tier Updated", "is_active": False},
    )
    assert update_response.status_code == 200
    assert update_response.json()["label"] == "Customer Tier Updated"
    assert update_response.json()["is_active"] is False

    inactive_response = client.get(
        "/api/admin/custom-fields",
        headers=headers,
        params={"status": "inactive", "page": 1, "page_size": 10},
    )
    assert inactive_response.status_code == 200
    assert any(item["id"] == field_id for item in inactive_response.json()["items"])

    docs_response = client.get("/openapi.json")
    assert docs_response.status_code == 200
    assert "/api/admin/custom-fields" in docs_response.json()["paths"]

    delete_response = client.delete(f"/api/admin/custom-fields/{field_id}", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Custom field deleted successfully"

    missing_response = client.get(f"/api/admin/custom-fields/{field_id}", headers=headers)
    assert missing_response.status_code == 404

    cleanup_response = client.delete(f"/api/admin/custom-fields/{escalation_field_id}", headers=headers)
    assert cleanup_response.status_code == 200

    task_cleanup_response = client.delete(f"/api/admin/custom-fields/{task_field_id}", headers=headers)
    assert task_cleanup_response.status_code == 200


def test_role_validation_returns_meaningful_field_errors(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.post(
        "/api/admin/roles",
        headers=headers,
        json={"slug": "Regional Director", "name": "R", "description": "x"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["message"] == "Validation failed"
    assert {"field": "slug", "message": "Role slug must use snake_case lowercase letters, numbers, and underscores."} in body["errors"]
    assert {"field": "name", "message": "Role name must be at least 2 characters."} in body["errors"]


def test_openapi_documents_admin_rbac_apis(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    user_list_params = [param["name"] for param in paths["/api/admin/users"]["get"]["parameters"]]
    role_list_params = [param["name"] for param in paths["/api/admin/roles"]["get"]["parameters"]]
    assert paths["/api/admin/users"]["get"]["summary"] == "List managed users"
    assert {"search", "status", "role", "page", "page_size"}.issubset(user_list_params)
    assert paths["/api/admin/users"]["post"]["summary"] == "Create a managed user"
    assert paths["/api/admin/users/{user_id}"]["delete"]["summary"] == "Delete a managed user"
    assert paths["/api/admin/roles"]["get"]["summary"] == "List roles"
    assert {"search", "type", "page", "page_size"}.issubset(role_list_params)
    assert paths["/api/admin/roles/{role_slug}"]["delete"]["summary"] == "Delete a role"
    assert paths["/api/admin/roles/{role_slug}/permissions"]["put"]["summary"] == "Update role permissions"
    assert "403" in paths["/api/admin/roles"]["get"]["responses"]
