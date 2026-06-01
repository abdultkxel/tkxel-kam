from collections.abc import Generator

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models import AuditLog, User
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


def auth_headers(client: TestClient, email: str = "admin@tkxelkam.com", password: str = "Admin@12345") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_admin_can_load_update_and_audit_email_domain_policy(client: TestClient, db_session: Session) -> None:
    headers = auth_headers(client)

    read_response = client.get("/api/admin/settings/email-domains", headers=headers)
    assert read_response.status_code == 200
    assert read_response.json()["allowed_domains"] == ["tkxel.com", "tkxel.io"]
    assert read_response.json()["active"] is True

    update_response = client.patch(
        "/api/admin/settings/email-domains",
        headers=headers,
        json={"raw_input": "tkxel.com, tkxel.io, @TKXEL.com,,", "active": True, "reason": "Restrict sign-in"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["allowed_domains"] == ["tkxel.com", "tkxel.io"]
    audit = db_session.scalar(select(AuditLog).where(AuditLog.action == "update_email_domain_policy"))
    assert audit is not None
    assert audit.reason == "Restrict sign-in"
    assert audit.source == "admin_settings"
    assert audit.before_value == {"raw_input": "tkxel.com, tkxel.io", "allowed_domains": ["tkxel.com", "tkxel.io"], "active": True}
    assert audit.after_value == {"raw_input": "tkxel.com, tkxel.io, @TKXEL.com,,", "allowed_domains": ["tkxel.com", "tkxel.io"], "active": True}


def test_non_admin_cannot_manage_email_domain_policy(client: TestClient) -> None:
    headers = auth_headers(client, "account.manager.user@tkxelkam.com", "User@12345")

    read_response = client.get("/api/admin/settings/email-domains", headers=headers)
    update_response = client.patch("/api/admin/settings/email-domains", headers=headers, json={"raw_input": "tkxel.com", "active": True})

    assert read_response.status_code == 403
    assert update_response.status_code == 403


def test_email_domain_policy_validates_admin_user_creation(client: TestClient) -> None:
    headers = auth_headers(client)

    allowed = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "new.user@corp.tkxel.com",
            "password": "User@12345",
            "full_name": "New User",
            "role": "account_manager",
        },
    )
    assert allowed.status_code == 201

    disallowed = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "external@example.com",
            "password": "User@12345",
            "full_name": "External User",
            "role": "account_manager",
        },
    )
    assert disallowed.status_code == 422
    assert {"field": "email", "message": "Email domain is not allowed. Use a Tkxel email domain."} in disallowed.json()["detail"]["errors"]

    lookalike = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "fake@tkxel.com.evil.com",
            "password": "User@12345",
            "full_name": "Fake User",
            "role": "account_manager",
        },
    )
    assert lookalike.status_code == 422


def test_empty_policy_keeps_normal_email_validation_without_domain_restriction(client: TestClient) -> None:
    headers = auth_headers(client)
    policy_response = client.patch("/api/admin/settings/email-domains", headers=headers, json={"raw_input": "", "active": True})
    assert policy_response.status_code == 200
    assert policy_response.json()["allowed_domains"] == []

    create_response = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "external@example.com",
            "password": "User@12345",
            "full_name": "External User",
            "role": "account_manager",
        },
    )
    assert create_response.status_code == 201


def test_invalid_domain_entries_return_field_errors(client: TestClient) -> None:
    headers = auth_headers(client)

    response = client.patch(
        "/api/admin/settings/email-domains",
        headers=headers,
        json={"raw_input": "https://tkxel.com, user@tkxel.com, *.tkxel.com, tkxel", "active": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["field"] == "raw_input"


def test_google_sign_in_is_existing_user_only_and_respects_domain_policy(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    settings.google_sign_in_client_id = "google-client"
    headers = auth_headers(client)
    created = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "google.user@camp1.tkxel.com",
            "password": "User@12345",
            "full_name": "Google User",
            "role": "account_manager",
        },
    )
    assert created.status_code == 201

    def verified_claims(_: str, client_id: str) -> dict:
        assert client_id == "google-client"
        return {"email": "google.user@camp1.tkxel.com", "email_verified": True, "sub": "google-sub-1"}

    monkeypatch.setattr("app.services.auth.verify_google_credential", verified_claims)

    response = client.post("/api/auth/google", json={"credential": "valid-google-credential"})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "google.user@camp1.tkxel.com"
    assert response.json()["access_token"]
    users = db_session.scalars(select(User).where(User.email == "google.user@camp1.tkxel.com")).all()
    assert len(users) == 1
    assert users[0].google_sub == "google-sub-1"


def test_google_sign_in_rejects_google_subject_linked_to_another_user(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings().google_sign_in_client_id = "google-client"
    headers = auth_headers(client)
    first = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "first.user@tkxel.com",
            "password": "User@12345",
            "full_name": "First User",
            "role": "account_manager",
        },
    )
    second = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "second.user@tkxel.com",
            "password": "User@12345",
            "full_name": "Second User",
            "role": "account_manager",
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201

    first_user = db_session.scalar(select(User).where(User.email == "first.user@tkxel.com"))
    assert first_user is not None
    first_user.google_sub = "shared-google-sub"
    db_session.commit()

    monkeypatch.setattr(
        "app.services.auth.verify_google_credential",
        lambda *_: {"email": "second.user@tkxel.com", "email_verified": True, "sub": "shared-google-sub"},
    )

    response = client.post("/api/auth/google", json={"credential": "valid-google-credential"})

    assert response.status_code == 401


def test_google_sign_in_rejects_missing_user_unverified_and_disallowed_domain(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings().google_sign_in_client_id = "google-client"

    monkeypatch.setattr(
        "app.services.auth.verify_google_credential",
        lambda *_: {"email": "missing@tkxel.com", "email_verified": True, "sub": "missing"},
    )
    missing = client.post("/api/auth/google", json={"credential": "valid-google-credential"})
    assert missing.status_code == 401

    monkeypatch.setattr(
        "app.services.auth.verify_google_credential",
        lambda *_: {"email": "unverified@tkxel.com", "email_verified": False, "sub": "unverified"},
    )
    unverified = client.post("/api/auth/google", json={"credential": "valid-google-credential"})
    assert unverified.status_code == 401

    monkeypatch.setattr(
        "app.services.auth.verify_google_credential",
        lambda *_: {"email": "external@example.com", "email_verified": True, "sub": "external"},
    )
    disallowed = client.post("/api/auth/google", json={"credential": "valid-google-credential"})
    assert disallowed.status_code == 401


def test_google_sign_in_rejects_invalid_credentials_and_docs_include_new_endpoints(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings().google_sign_in_client_id = "google-client"

    def invalid_credential(_: str, __: str) -> dict:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In failed")

    monkeypatch.setattr("app.services.auth.verify_google_credential", invalid_credential)
    response = client.post("/api/auth/google", json={"credential": "invalid-google-credential"})
    docs = client.get("/openapi.json")

    assert response.status_code == 401
    assert "/api/auth/google" in docs.json()["paths"]
    assert "/api/admin/settings/email-domains" in docs.json()["paths"]
