from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.dependencies import get_auth_service
from app.main import app
from app.models import AuditLog, PasswordResetToken, User
from app.services.auth import AuthService
from app.services.google_identity import GoogleIdentity
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

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


def test_seeded_domains_are_available_to_admin(client: TestClient) -> None:
    response = client.get("/api/admin/settings/allowed-email-domains", headers=auth_headers(client))

    assert response.status_code == 200
    assert response.json()["domains"] == ["tkxel.com", "tkxel.io", "camp1.tkxel.com"]


def test_admin_can_save_normalized_domains_and_audit_change(client: TestClient, db_session: Session) -> None:
    response = client.patch(
        "/api/admin/settings/allowed-email-domains",
        headers=auth_headers(client),
        json={"domains_input": " TKXEL.COM, tkxel.io, , TKXEL.com, camp1.tkxel.com "},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["domains"] == ["tkxel.com", "tkxel.io", "camp1.tkxel.com"]
    assert body["duplicates_removed"] is True
    audit = db_session.scalar(select(AuditLog).where(AuditLog.entity_type == "platform_setting"))
    assert audit is not None
    assert audit.after_value == {"allowed_email_domains": ["tkxel.com", "tkxel.io", "camp1.tkxel.com"]}


def test_invalid_domains_are_rejected(client: TestClient) -> None:
    response = client.patch(
        "/api/admin/settings/allowed-email-domains",
        headers=auth_headers(client),
        json={"domains_input": "tkxel.com, http://tkxel.com, *.tkxel.com, tkxel..com"},
    )

    assert response.status_code == 422
    messages = [error["message"] for error in response.json()["detail"]["errors"]]
    assert any("http://tkxel.com" in message for message in messages)
    assert any("*.tkxel.com" in message for message in messages)
    assert any("tkxel..com" in message for message in messages)


def test_non_admin_cannot_view_or_update_domains(client: TestClient) -> None:
    headers = auth_headers(client, "account.manager.user@tkxel.com", "User@12345")

    read_response = client.get("/api/admin/settings/allowed-email-domains", headers=headers)
    update_response = client.patch(
        "/api/admin/settings/allowed-email-domains",
        headers=headers,
        json={"domains_input": "tkxel.com"},
    )

    assert read_response.status_code == 403
    assert update_response.status_code == 403


def test_user_create_and_update_enforce_domain_policy(client: TestClient) -> None:
    headers = auth_headers(client)

    allowed_create = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "UPPER@TKXEL.COM",
            "password": "User@12345",
            "full_name": "Upper User",
            "role": "account_manager",
            "is_active": True,
        },
    )
    assert allowed_create.status_code == 201
    user = allowed_create.json()
    assert user["email"] == "upper@tkxel.com"

    disallowed_create = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "person@team.tkxel.com",
            "password": "User@12345",
            "full_name": "Team User",
            "role": "account_manager",
            "is_active": True,
        },
    )
    assert disallowed_create.status_code == 422
    assert disallowed_create.json()["detail"]["errors"][0]["field"] == "email"

    allowed_update = client.patch(f"/api/admin/users/{user['id']}", headers=headers, json={"email": "upper@camp1.tkxel.com"})
    assert allowed_update.status_code == 200
    assert allowed_update.json()["email"] == "upper@camp1.tkxel.com"

    disallowed_update = client.patch(f"/api/admin/users/{user['id']}", headers=headers, json={"email": "upper@outside.com"})
    assert disallowed_update.status_code == 422
    assert disallowed_update.json()["detail"]["errors"][0]["field"] == "email"


def test_login_password_reset_and_active_session_fail_after_domain_removed(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)

    update_response = client.patch(
        "/api/admin/settings/allowed-email-domains",
        headers=headers,
        json={"domains_input": "tkxel.io"},
    )
    assert update_response.status_code == 200

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 401

    login_response = client.post("/api/auth/login", json={"email": "admin@tkxel.com", "password": "Admin@12345"})
    assert login_response.status_code == 403

    forgot_response = client.post("/api/auth/forgot-password", json={"email": "admin@tkxel.com"})
    assert forgot_response.status_code == 200
    assert forgot_response.json()["reset_token"] is None
    assert db_session.scalar(select(PasswordResetToken)) is None


class FakeGoogleIdentityService:
    def __init__(self, email: str, verified: bool = True) -> None:
        self.identity = GoogleIdentity(email=email, email_verified=verified)

    def verify_credential(self, _: str) -> GoogleIdentity:
        return self.identity


def override_google_auth(db_session: Session, email: str, verified: bool = True):
    def override() -> AuthService:
        return AuthService(db_session, google_identity=FakeGoogleIdentityService(email, verified))

    return override


def test_google_sign_in_only_allows_existing_verified_users(client: TestClient, db_session: Session) -> None:
    app.dependency_overrides[get_auth_service] = override_google_auth(db_session, "admin@tkxel.com")
    success_response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    assert success_response.status_code == 200
    assert success_response.json()["user"]["email"] == "admin@tkxel.com"

    app.dependency_overrides[get_auth_service] = override_google_auth(db_session, "missing@tkxel.com")
    missing_user_response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    assert missing_user_response.status_code == 401
    assert db_session.scalar(select(User).where(User.email == "missing@tkxel.com")) is None

    app.dependency_overrides[get_auth_service] = override_google_auth(db_session, "person@outside.com")
    disallowed_response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    assert disallowed_response.status_code == 403
    assert db_session.scalar(select(User).where(User.email == "person@outside.com")) is None

    app.dependency_overrides[get_auth_service] = override_google_auth(db_session, "admin@tkxel.com", verified=False)
    unverified_response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    assert unverified_response.status_code == 403
