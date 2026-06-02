from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import User
from app.schemas import DigestPreviewRequest, ForgotPasswordRequest, ReportCreateRequest, ReportExportRequest, UserCreateRequest
from app.services.auth import AuthService
from app.services.email_delivery import EmailDeliveryResult, EmailDeliveryService, RenderedEmail
from app.services.notifications import NotificationsService
from app.services.reports import ReportsService
from app.services.seed import seed_default_data
from app.services.user_management import UserManagementService


class RecordingAdapter:
    def __init__(self) -> None:
        self.messages: list[RenderedEmail] = []

    def send(self, *, recipient_email: str, recipient_name: str | None, rendered: RenderedEmail) -> None:
        self.messages.append(rendered)


class RecordingEmailDelivery:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    def absolute_url(self, route: str | None) -> str:
        route = route or "/"
        return f"http://127.0.0.1:5173/{route.lstrip('/')}"

    def send_template(self, template_key: str, *, recipient_email: str | None, recipient_name: str | None = None, context: dict | None = None) -> EmailDeliveryResult:
        self.messages.append({"template_key": template_key, "recipient_email": recipient_email, "recipient_name": recipient_name, "context": context or {}})
        return EmailDeliveryResult(status="sent", template_key=template_key, recipient_email=recipient_email, sent_at="2026-06-02T00:00:00+00:00")


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    try:
        with TestingSessionLocal() as session:
            seed_default_data(session)
            yield session
    finally:
        Base.metadata.drop_all(bind=engine)


def test_email_delivery_service_renders_and_sends_template() -> None:
    adapter = RecordingAdapter()
    service = EmailDeliveryService(adapter=adapter)
    service.settings.mail_enabled = True
    service.settings.mail_host = "smtp.test.local"
    service.settings.mail_send_during_tests = True

    result = service.send_template(
        "password_reset",
        recipient_email="admin@tkxel.com",
        recipient_name="Admin",
        context={"recipient_name": "Admin", "reset_url": "http://127.0.0.1:5173/reset-password?token=test", "expires_minutes": 30},
    )

    assert result.status == "sent"
    assert adapter.messages
    assert "Reset your" in adapter.messages[0].subject
    assert "reset-password" in adapter.messages[0].text_body


def test_auth_password_reset_sends_email(db_session: Session) -> None:
    recorder = RecordingEmailDelivery()
    service = AuthService(db_session, email_delivery=recorder)  # type: ignore[arg-type]

    response = service.request_password_reset(ForgotPasswordRequest(email="admin@tkxel.com"))

    assert response.message == service.generic_reset_message
    assert recorder.messages[0]["template_key"] == "password_reset"
    assert "reset-password?token=" in recorder.messages[0]["context"]["reset_url"]


def test_admin_user_creation_sends_welcome_email(db_session: Session) -> None:
    recorder = RecordingEmailDelivery()
    service = UserManagementService(db_session, email_delivery=recorder)  # type: ignore[arg-type]
    admin = db_session.scalar(select(User).where(User.email == "admin@tkxel.com"))

    created = service.create_user(
        UserCreateRequest(email="mailtrap.user@tkxel.com", password="User@12345", full_name="Mailtrap User", role="account_manager"),
        actor=admin,
    )

    assert created.email == "mailtrap.user@tkxel.com"
    assert recorder.messages[0]["template_key"] == "user_created"
    assert recorder.messages[0]["context"]["temporary_password"] == "User@12345"


def test_notification_digest_and_report_hooks_send_email(db_session: Session) -> None:
    recorder = RecordingEmailDelivery()
    admin = db_session.scalar(select(User).where(User.email == "admin@tkxel.com"))
    assert admin is not None

    notifications = NotificationsService(db_session, email_delivery=recorder)  # type: ignore[arg-type]
    result = notifications.queue_notification(
        recipient=admin,
        trigger="sla_escalation",
        title="Critical signal inactivity",
        body="A critical signal breached the SLA window.",
        priority="critical",
        source_record_route="/tasks",
        deduplication_key="email-test-sla",
    )
    assert result.notification.delivery_metadata_json["email_delivery"]["status"] == "sent"
    assert recorder.messages[-1]["template_key"] == "sla_escalation"

    digest = notifications.preview_digest(DigestPreviewRequest(sections=["strategic_risks"], filters={}), admin)
    sent_digest = notifications.send_digest(digest.id, admin)
    assert any(item["channel"] == "email" and item["status"] == "sent" for item in sent_digest.delivery_attempts_json)
    assert any(message["template_key"] == "digest_ready" for message in recorder.messages)

    reports = ReportsService(db_session, email_delivery=recorder)  # type: ignore[arg-type]
    report = reports.create_report(
        ReportCreateRequest(name="Mailtrap Report", visibility="private", data_source="accounts", fields=["name"], filters={}, grouping=[], layout={"type": "table"}, export_format="csv"),
        admin,
    )
    run = reports.export_report(report.id, ReportExportRequest(export_format="csv"), admin)
    assert run.storage_metadata_json["delivery_attempts"][-1]["status"] == "sent"
    assert recorder.messages[-1]["template_key"] == "report_ready"
