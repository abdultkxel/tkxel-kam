from collections.abc import Generator
from itertools import chain
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import PlatformSetting, User
from app.security import hash_password

SNAKE_CASE = re.compile(r"^[a-z][a-z0-9_]*$")


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
        session.add(
            User(
                email="admin@tkxel.com",
                hashed_password=hash_password("Admin@12345"),
                full_name="Test Admin",
                role="super_admin",
                title="Platform Owner",
                avatar_initials="TA",
                is_active=True,
            )
        )
        session.add(PlatformSetting(key="allowed_email_domains", value_json=["tkxel.com"], updated_by_id=None))
        session.commit()
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


def login(client: TestClient, password: str = "Admin@12345") -> str:
    response = client.post("/api/auth/login", json={"email": "admin@tkxel.com", "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_login_me_and_logout_flow(client: TestClient) -> None:
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "admin@tkxel.com"

    logout_response = client.post("/api/auth/logout", headers=headers)
    assert logout_response.status_code == 200
    assert logout_response.json()["message"] == "Logged out successfully"


def test_profile_update_flow(client: TestClient) -> None:
    token = login(client)
    response = client.patch(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Updated Admin", "title": "Customer Success Lead", "phone": "+1 555 0100", "avatar_initials": "UA"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Updated Admin"
    assert body["title"] == "Customer Success Lead"
    assert body["phone"] == "+1 555 0100"
    assert body["avatar_initials"] == "UA"


def test_forgot_and_reset_password_flow(client: TestClient) -> None:
    forgot_response = client.post("/api/auth/forgot-password", json={"email": "admin@tkxel.com"})
    assert forgot_response.status_code == 200
    reset_token = forgot_response.json()["reset_token"]
    assert reset_token

    reset_response = client.post("/api/auth/reset-password", json={"token": reset_token, "new_password": "NewAdmin@12345"})
    assert reset_response.status_code == 200

    old_login = client.post("/api/auth/login", json={"email": "admin@tkxel.com", "password": "Admin@12345"})
    assert old_login.status_code == 401

    assert login(client, "NewAdmin@12345")


def test_change_password_flow(client: TestClient) -> None:
    token = login(client)
    response = client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "Admin@12345", "new_password": "Changed@12345"},
    )

    assert response.status_code == 200
    assert login(client, "Changed@12345")


def test_login_validation_returns_meaningful_field_errors(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "not-an-email", "password": "short"})

    assert response.status_code == 422
    body = response.json()
    assert body["message"] == "Validation failed"
    assert {"field": "password", "message": "Password must be at least 8 characters."} in body["errors"]
    email_error = next(error for error in body["errors"] if error["field"] == "email")
    assert email_error["message"].startswith("Value is not a valid email address")


def test_profile_validation_returns_meaningful_field_errors(client: TestClient) -> None:
    token = login(client)
    response = client.patch(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "A", "phone": "555-INVALID"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["message"] == "Validation failed"
    assert {"field": "full_name", "message": "Full name must be at least 2 characters."} in body["errors"]
    assert {
        "field": "phone",
        "message": "Phone can contain only numbers, spaces, plus signs, dashes, periods, and parentheses.",
    } in body["errors"]


def test_openapi_documents_auth_and_profile_apis(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert paths["/api/auth/login"]["post"]["summary"] == "Log in with email and password"
    assert "422" in paths["/api/auth/login"]["post"]["responses"]
    assert paths["/api/auth/reset-password"]["post"]["summary"] == "Reset password with token"
    assert paths["/api/auth/change-password"]["post"]["summary"] == "Change password while authenticated"
    assert paths["/api/users/me"]["patch"]["summary"] == "Update my profile"


def test_database_schema_uses_snake_case_names() -> None:
    table_names = [table.name for table in Base.metadata.sorted_tables]
    column_names = [column.name for column in chain.from_iterable(table.columns for table in Base.metadata.sorted_tables)]

    assert all(SNAKE_CASE.fullmatch(name) for name in table_names)
    assert all(SNAKE_CASE.fullmatch(name) for name in column_names)
