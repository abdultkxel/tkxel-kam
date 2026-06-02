from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from html import escape
import logging
import os
import smtplib
from typing import Any, Protocol

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    text_body: str
    html_body: str


@dataclass(frozen=True)
class EmailDeliveryResult:
    status: str
    channel: str = "email"
    template_key: str | None = None
    recipient_email: str | None = None
    sent_at: str | None = None
    error_message: str | None = None

    def as_metadata(self) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "template_key": self.template_key,
            "recipient_email": self.recipient_email,
            "status": self.status,
            "sent_at": self.sent_at,
            "error_message": self.error_message,
        }


class EmailAdapter(Protocol):
    def send(self, *, recipient_email: str, recipient_name: str | None, rendered: RenderedEmail) -> None:
        ...


class SmtpEmailAdapter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def send(self, *, recipient_email: str, recipient_name: str | None, rendered: RenderedEmail) -> None:
        message = EmailMessage()
        message["Subject"] = rendered.subject
        message["From"] = f"{self.settings.mail_from_name} <{self.settings.mail_from_email}>"
        message["To"] = f"{recipient_name} <{recipient_email}>" if recipient_name else recipient_email
        message.set_content(rendered.text_body)
        message.add_alternative(rendered.html_body, subtype="html")

        with smtplib.SMTP(self.settings.mail_host, self.settings.mail_port, timeout=15) as smtp:
            if self.settings.mail_encryption == "tls":
                smtp.starttls()
            if self.settings.mail_username:
                smtp.login(self.settings.mail_username, self.settings.mail_password)
            smtp.send_message(message)


class EmailTemplateCatalog:
    def render(self, template_key: str, context: dict[str, Any]) -> RenderedEmail:
        template = EMAIL_TEMPLATES.get(template_key, EMAIL_TEMPLATES["notification"])
        text_context = _text_context(context)
        html_context = _html_context(context)
        return RenderedEmail(
            subject=template["subject"].format_map(text_context),
            text_body=template["text"].format_map(text_context),
            html_body=template["html"].format_map(html_context),
        )


class EmailDeliveryService:
    def __init__(self, adapter: EmailAdapter | None = None, templates: EmailTemplateCatalog | None = None) -> None:
        self.settings = get_settings()
        self.adapter = adapter or SmtpEmailAdapter()
        self.templates = templates or EmailTemplateCatalog()

    def send_template(
        self,
        template_key: str,
        *,
        recipient_email: str | None,
        recipient_name: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> EmailDeliveryResult:
        if not recipient_email:
            return EmailDeliveryResult(status="skipped", template_key=template_key, error_message="Recipient email is missing")
        if not self._is_enabled():
            return EmailDeliveryResult(status="skipped", template_key=template_key, recipient_email=recipient_email, error_message="Email delivery is disabled")
        try:
            rendered = self.templates.render(template_key, self._with_defaults(context or {}))
            self.adapter.send(recipient_email=recipient_email, recipient_name=recipient_name, rendered=rendered)
            logger.info("Sent email template=%s recipient=%s", template_key, recipient_email)
            return EmailDeliveryResult(status="sent", template_key=template_key, recipient_email=recipient_email, sent_at=datetime.now(timezone.utc).isoformat())
        except Exception as exc:
            logger.exception("Email delivery failed template=%s recipient=%s", template_key, recipient_email)
            return EmailDeliveryResult(status="failed", template_key=template_key, recipient_email=recipient_email, error_message=str(exc))

    def absolute_url(self, route: str | None) -> str:
        if not route:
            return self.settings.frontend_app_url
        if route.startswith("http://") or route.startswith("https://"):
            return route
        return f"{self.settings.frontend_app_url}/{route.lstrip('/')}"

    def _is_enabled(self) -> bool:
        if os.getenv("PYTEST_CURRENT_TEST") and not self.settings.mail_send_during_tests:
            return False
        return bool(self.settings.mail_enabled and self.settings.mail_mailer == "smtp" and self.settings.mail_host)

    def _with_defaults(self, context: dict[str, Any]) -> dict[str, Any]:
        values = dict(context)
        values.setdefault("app_name", "KAM Intelligence Platform")
        values.setdefault("app_url", self.settings.frontend_app_url)
        values.setdefault("login_url", self.absolute_url("/login"))
        values.setdefault("support_note", "Contact your platform administrator if this message looks unexpected.")
        return values


def _text_context(context: dict[str, Any]) -> defaultdict[str, str]:
    return defaultdict(str, {key: "" if value is None else str(value) for key, value in context.items()})


def _html_context(context: dict[str, Any]) -> defaultdict[str, str]:
    return defaultdict(str, {key: escape("" if value is None else str(value)) for key, value in context.items()})


EMAIL_TEMPLATES: dict[str, dict[str, str]] = {
    "user_created": {
        "subject": "Your {app_name} account is ready",
        "text": "Hi {recipient_name},\n\nAn account has been created for {email}.\n\nTemporary password: {temporary_password}\nLogin: {login_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>An account has been created for <strong>{email}</strong>.</p><p><strong>Temporary password:</strong> {temporary_password}</p><p><a href=\"{login_url}\">Open the platform</a></p><p>{support_note}</p>",
    },
    "password_reset": {
        "subject": "Reset your {app_name} password",
        "text": "Hi {recipient_name},\n\nUse this link to reset your password. It expires in {expires_minutes} minutes.\n\n{reset_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>Use this link to reset your password. It expires in <strong>{expires_minutes} minutes</strong>.</p><p><a href=\"{reset_url}\">Reset password</a></p><p>{support_note}</p>",
    },
    "password_changed": {
        "subject": "Your {app_name} password was changed",
        "text": "Hi {recipient_name},\n\nYour password was changed successfully.\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>Your password was changed successfully.</p><p>{support_note}</p>",
    },
    "notification": {
        "subject": "{priority_label}: {title}",
        "text": "Hi {recipient_name},\n\n{title}\n\n{body}\n\nOpen in platform: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><h2>{title}</h2><p>{body}</p><p><a href=\"{source_url}\">Open in platform</a></p><p>{support_note}</p>",
    },
    "sla_escalation": {
        "subject": "SLA attention needed: {title}",
        "text": "Hi {recipient_name},\n\n{body}\n\nOpen in platform: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><h2>SLA attention needed</h2><p>{body}</p><p><a href=\"{source_url}\">Review in platform</a></p><p>{support_note}</p>",
    },
    "digest_ready": {
        "subject": "Executive digest ready: {title}",
        "text": "Hi {recipient_name},\n\nYour executive digest is ready.\n\nOpen in platform: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>Your executive digest is ready.</p><p><a href=\"{source_url}\">Open digest</a></p><p>{support_note}</p>",
    },
    "report_ready": {
        "subject": "Report ready: {title}",
        "text": "Hi {recipient_name},\n\nYour report export is ready.\n\nOpen in platform: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>Your report export is ready.</p><p><a href=\"{source_url}\">Open report</a></p><p>{support_note}</p>",
    },
    "integration_failure_alert": {
        "subject": "{priority_label}: {title}",
        "text": "Hi {recipient_name},\n\n{title}\n\n{body}\n\nReview integration settings: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><h2>{title}</h2><p>{body}</p><p><a href=\"{source_url}\">Review integration settings</a></p><p>{support_note}</p>",
    },
    "mention": {
        "subject": "You were mentioned in {app_name}",
        "text": "Hi {recipient_name},\n\nYou were mentioned: {body}\n\nOpen in platform: {source_url}\n\n{support_note}",
        "html": "<p>Hi {recipient_name},</p><p>You were mentioned: {body}</p><p><a href=\"{source_url}\">Open mention</a></p><p>{support_note}</p>",
    },
}
