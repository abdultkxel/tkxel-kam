from dataclasses import dataclass
import logging
import re
from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User
from app.rbac import ADMIN_MODULE
from app.repositories.audit import AuditRepository
from app.repositories.platform_settings import PlatformSettingRepository
from app.repositories.users import UserRepository
from app.schemas import AllowedEmailDomainsRead, AllowedEmailDomainsUpdateRequest
from app.services.audit import AuditService
from app.services.users import normalize_email

ALLOWED_EMAIL_DOMAINS_KEY = "allowed_email_domains"
DEFAULT_ALLOWED_EMAIL_DOMAINS = ("tkxel.com", "tkxel.io", "camp1.tkxel.com")
DOMAIN_LABEL_PATTERN = re.compile(r"^[a-z0-9-]+$")

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DomainParseResult:
    domains: list[str]
    duplicates_removed: bool = False


class EmailDomainPolicyService:
    def __init__(
        self,
        db: Session,
        setting_repository: PlatformSettingRepository | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        self.db = db
        self.settings = setting_repository or PlatformSettingRepository(db)
        self.users = user_repository or UserRepository(db)
        self.audit = AuditService(AuditRepository(db))

    def read_allowed_domains(self) -> AllowedEmailDomainsRead:
        setting = self.settings.get_by_key(ALLOWED_EMAIL_DOMAINS_KEY)
        domains = self._stored_domains(setting.value_json if setting else None)
        updated_by = self.users.get_by_id(setting.updated_by_id) if setting and setting.updated_by_id else None
        return AllowedEmailDomainsRead(
            domains=domains,
            domains_input=", ".join(domains),
            updated_by_id=setting.updated_by_id if setting else None,
            updated_by_name=updated_by.full_name if updated_by else None,
            updated_at=setting.updated_at if setting else None,
        )

    def update_allowed_domains(self, payload: AllowedEmailDomainsUpdateRequest, actor: User) -> AllowedEmailDomainsRead:
        before = self.read_allowed_domains().domains
        parsed = self.parse_domains(payload.domains if payload.domains is not None else payload.domains_input)
        setting = self.settings.set_value(ALLOWED_EMAIL_DOMAINS_KEY, parsed.domains, updated_by_id=actor.id)
        self.audit.log(
            module=ADMIN_MODULE,
            action="configure",
            entity_type="platform_setting",
            entity_id=setting.id,
            actor=actor,
            before_value={"allowed_email_domains": before},
            after_value={"allowed_email_domains": parsed.domains},
            reason="Allowed email domains updated",
        )
        self.db.commit()
        self.db.refresh(setting)
        response = self.read_allowed_domains()
        response.duplicates_removed = parsed.duplicates_removed
        return response

    def seed_allowed_domains(self, domains: str | Sequence[str], actor: User | None = None) -> AllowedEmailDomainsRead:
        if self.settings.get_by_key(ALLOWED_EMAIL_DOMAINS_KEY) is not None:
            return self.read_allowed_domains()
        parsed = self.parse_domains(domains)
        setting = self.settings.set_value(ALLOWED_EMAIL_DOMAINS_KEY, parsed.domains, updated_by_id=actor.id if actor else None)
        self.db.commit()
        self.db.refresh(setting)
        return self.read_allowed_domains()

    def is_email_allowed(self, email: str) -> bool:
        domain = self.email_domain(email)
        if not domain:
            return False
        return domain in set(self.read_allowed_domains().domains)

    def require_allowed_email_for_user_form(self, email: str) -> None:
        if self.is_email_allowed(email):
            return
        raise field_validation_error("email", "Email domain is not allowed. Use an approved company email domain.")

    def require_allowed_email_for_auth(self, email: str, *, message: str, status_code: int = status.HTTP_403_FORBIDDEN) -> None:
        if self.is_email_allowed(email):
            return
        self.log_domain_block(email, "authentication")
        raise HTTPException(status_code=status_code, detail=message)

    def require_current_user_allowed(self, user: User) -> None:
        if self.is_email_allowed(user.email):
            return
        self.log_domain_block(user.email, "active_session")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This email domain is not allowed. Contact your administrator.")

    def log_domain_block(self, email: str, context: str) -> None:
        logger.warning(
            "Domain policy blocked access",
            extra={"email_domain": self.email_domain(email), "context": context},
        )

    @classmethod
    def parse_domains(cls, values: str | Sequence[str] | None) -> DomainParseResult:
        tokens = cls._domain_tokens(values)
        domains: list[str] = []
        invalid: list[str] = []
        seen: set[str] = set()
        duplicates_removed = False

        for token in tokens:
            raw = token.strip()
            if not raw:
                continue
            domain = raw.lower()
            if not cls.valid_domain(domain):
                invalid.append(raw)
                continue
            if domain in seen:
                duplicates_removed = True
                continue
            seen.add(domain)
            domains.append(domain)

        if invalid:
            errors = [
                {"field": "domains_input", "message": f"Invalid email domain: {domain}. Enter domains like tkxel.com or camp1.tkxel.com."}
                for domain in invalid
            ]
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"message": "Validation failed", "errors": errors})

        if not domains:
            raise field_validation_error("domains_input", "At least one allowed email domain is required.")

        return DomainParseResult(domains=domains, duplicates_removed=duplicates_removed)

    @staticmethod
    def valid_domain(domain: str) -> bool:
        if not domain or not domain.isascii() or len(domain) > 253:
            return False
        if any(marker in domain for marker in ("@", "://", "/", "\\", "?", "#", ":", "*", " ")):
            return False
        if domain.startswith(".") or domain.endswith(".") or ".." in domain:
            return False
        labels = domain.split(".")
        if len(labels) < 2:
            return False
        return all(0 < len(label) <= 63 and not label.startswith("-") and not label.endswith("-") and DOMAIN_LABEL_PATTERN.match(label) for label in labels)

    @staticmethod
    def email_domain(email: str) -> str | None:
        normalized = normalize_email(email)
        if "@" not in normalized:
            return None
        return normalized.rsplit("@", 1)[1]

    @staticmethod
    def _domain_tokens(values: str | Sequence[str] | None) -> list[str]:
        if values is None:
            return []
        if isinstance(values, str):
            return values.split(",")
        tokens: list[str] = []
        for value in values:
            tokens.extend(str(value).split(","))
        return tokens

    @classmethod
    def _stored_domains(cls, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        domains: list[str] = []
        for item in value:
            domain = str(item).strip().lower()
            if cls.valid_domain(domain) and domain not in domains:
                domains.append(domain)
        return domains


def field_validation_error(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]},
    )
