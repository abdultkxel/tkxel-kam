import re
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AdminSetting, User
from app.repositories.admin_settings import AdminSettingsRepository
from app.repositories.audit import AuditRepository
from app.repositories.users import UserRepository
from app.schemas import EmailDomainSettingsRead, EmailDomainSettingsUpdateRequest
from app.services.audit import AuditService

EMAIL_DOMAIN_POLICY_KEY = "email_domain_policy"
DEFAULT_ALLOWED_DOMAINS = ["tkxel.com", "tkxel.io"]
DOMAIN_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$")


def field_validation_error(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]},
    )


def normalize_allowed_domains(raw_input: str) -> list[str]:
    seen: set[str] = set()
    domains: list[str] = []
    invalid_entries: list[str] = []
    for entry in raw_input.split(","):
        domain = entry.strip().lower()
        if not domain:
            continue
        if domain.startswith("@"):
            domain = domain[1:]
        if (
            "@" in domain
            or "://" in domain
            or "/" in domain
            or "?" in domain
            or "*" in domain
            or not DOMAIN_PATTERN.fullmatch(domain)
        ):
            invalid_entries.append(entry.strip())
            continue
        if domain not in seen:
            seen.add(domain)
            domains.append(domain)
    if invalid_entries:
        raise field_validation_error("raw_input", f"Invalid domain entries: {', '.join(invalid_entries)}.")
    return sorted(domains)


def email_domain(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1]


def domain_is_allowed(email: str, allowed_domains: list[str]) -> bool:
    domain = email_domain(email)
    return any(domain == allowed or domain.endswith(f".{allowed}") for allowed in allowed_domains)


@dataclass(frozen=True)
class EmailDomainPolicy:
    raw_input: str
    allowed_domains: list[str]
    active: bool

    def allows_email(self, email: str) -> bool:
        return not self.active or not self.allowed_domains or domain_is_allowed(email, self.allowed_domains)


class AdminSettingsService:
    def __init__(
        self,
        db: Session,
        repository: AdminSettingsRepository | None = None,
        users: UserRepository | None = None,
    ) -> None:
        self.repository = repository or AdminSettingsRepository(db)
        self.users = users or UserRepository(db)
        self.audit = AuditService(AuditRepository(db))

    def get_email_domain_settings(self) -> EmailDomainSettingsRead:
        setting = self._get_or_create_email_domain_setting()
        return self._read(setting)

    def update_email_domain_settings(self, payload: EmailDomainSettingsUpdateRequest, actor: User) -> EmailDomainSettingsRead:
        setting = self._get_or_create_email_domain_setting()
        before_value = self._setting_value(setting)
        allowed_domains = normalize_allowed_domains(payload.raw_input)
        setting.value_json = {
            "raw_input": payload.raw_input,
            "allowed_domains": allowed_domains,
            "active": payload.active,
        }
        setting.updated_by_id = actor.id
        saved = self.repository.save(setting)
        after_value = self._setting_value(saved)
        self.audit.log(
            module="admin_audit_security_rbac",
            action="update_email_domain_policy",
            entity_type="admin_setting",
            entity_id=saved.id,
            actor=actor,
            source="admin_settings",
            before_value=before_value,
            after_value=after_value,
            reason=payload.reason,
        )
        return self._read(saved)

    def get_email_domain_policy(self) -> EmailDomainPolicy:
        setting = self._get_or_create_email_domain_setting()
        value = self._setting_value(setting)
        return EmailDomainPolicy(raw_input=value["raw_input"], allowed_domains=value["allowed_domains"], active=value["active"])

    def validate_email_domain(self, email: str, field: str = "email") -> None:
        policy = self.get_email_domain_policy()
        if not policy.allows_email(email):
            raise field_validation_error(field, "Email domain is not allowed. Use a Tkxel email domain.")

    def _get_or_create_email_domain_setting(self) -> AdminSetting:
        setting = self.repository.get_by_key(EMAIL_DOMAIN_POLICY_KEY)
        if setting is not None:
            return setting
        return self.repository.save(
            AdminSetting(
                key=EMAIL_DOMAIN_POLICY_KEY,
                value_json={
                    "raw_input": ", ".join(DEFAULT_ALLOWED_DOMAINS),
                    "allowed_domains": DEFAULT_ALLOWED_DOMAINS,
                    "active": True,
                },
            )
        )

    def _read(self, setting: AdminSetting) -> EmailDomainSettingsRead:
        value = self._setting_value(setting)
        updated_by = None
        if setting.updated_by_id:
            user = self.users.get_by_id(setting.updated_by_id)
            updated_by = user.full_name if user else None
        return EmailDomainSettingsRead(
            allowed_domains=value["allowed_domains"],
            raw_input=value["raw_input"],
            active=value["active"],
            updated_by=updated_by,
            updated_at=setting.updated_at,
        )

    @staticmethod
    def _setting_value(setting: AdminSetting) -> dict:
        value = setting.value_json or {}
        raw_input = str(value.get("raw_input") or ", ".join(DEFAULT_ALLOWED_DOMAINS))
        allowed_domains = value.get("allowed_domains")
        if not isinstance(allowed_domains, list):
            allowed_domains = normalize_allowed_domains(raw_input)
        active = bool(value.get("active", True))
        return {"raw_input": raw_input, "allowed_domains": sorted(str(item) for item in allowed_domains), "active": active}
