from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.rbac import ACTIONS, DEFAULT_ROLES, MODULES
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
    expected_roles = {role.slug for role in DEFAULT_ROLES if role.slug != "super_admin"}
    listed_roles = {role["slug"] for role in roles_response.json()["items"]}
    assert expected_roles.issubset(listed_roles)
    assert "super_admin" not in listed_roles
    assert len(permissions_response.json()) == len(MODULES) * len(ACTIONS)


def test_seed_creates_manageable_user_for_each_default_role_and_hides_super_admin(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.get("/api/admin/users", headers=headers)

    assert response.status_code == 200
    body = response.json()
    users = body["items"]
    expected_roles = {role.slug for role in DEFAULT_ROLES if role.slug != "super_admin"}
    assert body["total"] >= len(expected_roles)
    listed_roles = {user["role"] for user in users}
    assert expected_roles.issubset(listed_roles)
    assert all(user["role"] != "super_admin" for user in users)
    assert all(not user["email"].startswith("admin@") for user in users)


def test_super_admin_can_create_update_and_delete_managed_users(client: TestClient) -> None:
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
        json={"permissions": [{"module": "admin_audit_security_rbac", "action": "configure", "allowed": True}]},
    )

    assert response.status_code == 200
    assert permission_is_allowed(response.json(), "admin_audit_security_rbac", "configure")


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
        json={"permissions": [{"module": "account_overview", "action": "view", "allowed": True}]},
    )
    assert permission_response.status_code == 200
    assert permission_is_allowed(permission_response.json(), "account_overview", "view")

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
    assert any(module["slug"] == "account_overview" for module in modules_response.json())

    invalid_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "account_overview",
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
            "module": "account_overview",
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

    duplicate_response = client.post(
        "/api/admin/custom-fields",
        headers=headers,
        json={
            "module": "account_overview",
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
            "module": "account_overview",
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
