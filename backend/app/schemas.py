from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.validation import (
    optional_text,
    validate_avatar_initials,
    validate_existing_password,
    validate_password,
    validate_phone,
    validate_reset_token,
    validate_slug,
)

UserRole = str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    title: str | None = None
    phone: str | None = None
    avatar_initials: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    action: str
    description: str | None = None


class RolePermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    permission: PermissionRead
    allowed: bool


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    description: str | None = None
    is_system: bool
    permissions: list[RolePermissionRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class UserPageRead(BaseModel):
    items: list[UserRead]
    total: int
    page: int
    page_size: int
    pages: int


class RolePageRead(BaseModel):
    items: list[RoleRead]
    total: int
    page: int
    page_size: int
    pages: int


class RoleCreateRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"slug": "regional_director", "name": "Regional Director", "description": "Regional portfolio visibility and governance."}]})

    slug: str = Field(..., description="Role slug in snake_case.")
    name: str = Field(..., description="Human-readable role name.")
    description: str | None = Field(default=None, description="Role purpose and scope.")

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Role slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return optional_text(value, "Role name", max_length=120, min_length=2) or value

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Role description", max_length=500)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, description="Human-readable role name.")
    description: str | None = Field(default=None, description="Role purpose and scope.")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Role name", max_length=120, min_length=2)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Role description", max_length=500)


class PermissionGrantRequest(BaseModel):
    module: str = Field(..., description="Module slug from the PRD module catalog.")
    action: str = Field(..., description="Permission action such as view, create, update, delete, approve, configure, assign, or export.")
    allowed: bool = Field(default=True, description="Whether this role is allowed to perform the action.")

    @field_validator("module")
    @classmethod
    def module_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Module")

    @field_validator("action")
    @classmethod
    def action_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Action")


class RolePermissionsUpdateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "permissions": [
                        {"module": "account_overview", "action": "view", "allowed": True},
                        {"module": "account_overview", "action": "update", "allowed": True},
                    ]
                }
            ]
        }
    )

    permissions: list[PermissionGrantRequest] = Field(..., min_length=1, description="Role permission grants to upsert.")


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "new.user@tkxel.com",
                    "password": "User@12345",
                    "full_name": "New User",
                    "role": "account_manager",
                    "title": "Account Manager",
                    "phone": "+1 555 0100",
                    "avatar_initials": "NU",
                    "is_active": True,
                }
            ]
        }
    )

    email: EmailStr
    password: str
    full_name: str
    role: str = Field(default="account_manager", description="Role slug assigned to the user.")
    title: str | None = None
    phone: str | None = None
    avatar_initials: str | None = None
    is_active: bool = True

    @field_validator("password")
    @classmethod
    def password_is_valid(cls, value: str) -> str:
        return validate_password(value)

    @field_validator("full_name")
    @classmethod
    def full_name_is_valid(cls, value: str) -> str:
        return optional_text(value, "Full name", max_length=160, min_length=2) or value

    @field_validator("role")
    @classmethod
    def role_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Role")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Title", max_length=120)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value)

    @field_validator("avatar_initials")
    @classmethod
    def avatar_initials_are_valid(cls, value: str | None) -> str | None:
        return validate_avatar_initials(value)


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    role: str | None = Field(default=None, description="Role slug assigned to the user.")
    title: str | None = None
    phone: str | None = None
    avatar_initials: str | None = None
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def full_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Full name", max_length=160, min_length=2)

    @field_validator("role")
    @classmethod
    def role_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Role") if value is not None else None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Title", max_length=120)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value)

    @field_validator("avatar_initials")
    @classmethod
    def avatar_initials_are_valid(cls, value: str | None) -> str | None:
        return validate_avatar_initials(value)


class LoginRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "admin@tkxelkam.com", "password": "Admin@12345"}]})

    email: EmailStr = Field(..., description="Registered user email address.", examples=["admin@tkxelkam.com"])
    password: str = Field(..., description="Password with at least 8 characters, mixed case, number, and symbol.")

    @field_validator("password")
    @classmethod
    def password_is_valid(cls, value: str) -> str:
        return validate_password(value)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class MessageResponse(BaseModel):
    message: str


ConfiguredCurrency = Literal["USD"]
EngagementStatus = Literal["draft", "active", "renewal_watch", "at_risk", "completed"]
DeliveryStatus = Literal["on_track", "watch", "at_risk", "blocked", "complete"]
HealthRagStatus = Literal["green", "amber", "red", "dirty"]
RiskStatus = Literal["healthy", "warning", "critical"]


class SourceDocumentLink(BaseModel):
    title: str = Field(..., min_length=1, max_length=180, description="Source document title, such as the SOW or project charter.")
    url: str = Field(..., min_length=1, max_length=500, description="Document URL or repository path.")
    type: str | None = Field(default=None, max_length=80, description="Document type such as sow, charter, amendment, or evidence.")

    @field_validator("title", "url", "type")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Source document field", max_length=500) if value is not None else None


class EngagementAttachment(BaseModel):
    name: str = Field(..., min_length=1, max_length=180)
    url: str = Field(..., min_length=1, max_length=500)
    uploaded_by_name: str | None = Field(default=None, max_length=160)
    uploaded_at: datetime | None = None

    @field_validator("name", "url", "uploaded_by_name")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Attachment field", max_length=500) if value is not None else None


class EngagementActivityNote(BaseModel):
    title: str = Field(..., min_length=1, max_length=180)
    detail: str | None = Field(default=None, max_length=1000)
    occurred_at: datetime | None = None

    @field_validator("title", "detail")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Activity note field", max_length=1000) if value is not None else None


class EngagementEscalationNote(BaseModel):
    title: str = Field(..., min_length=1, max_length=180)
    status: Literal["open", "watchlist", "closed"] = "open"
    severity: Literal["amber", "red"] = "amber"
    detail: str | None = Field(default=None, max_length=1000)

    @field_validator("title", "detail")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Escalation note field", max_length=1000) if value is not None else None


class EngagementBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=180)
    status: EngagementStatus = "active"
    source_document_links: list[SourceDocumentLink] = Field(default_factory=list)
    start_date: date
    end_date: date
    renewal_date: date | None = None
    notice_deadline: date | None = None
    notice_period_days: int = Field(default=0, ge=0, le=730)
    owner_id: str = Field(..., min_length=1, max_length=80)
    owner_name: str = Field(..., min_length=2, max_length=160)
    ops_lead_id: str | None = Field(default=None, max_length=80)
    ops_lead_name: str | None = Field(default=None, max_length=160)
    service_lines: list[str] = Field(..., min_length=1)
    value: float = Field(default=0, ge=0)
    currency: ConfiguredCurrency = "USD"
    delivery_status: DeliveryStatus
    delivery_health: int = Field(default=70, ge=0, le=100)
    resource_dependency: str | None = Field(default=None, max_length=1200)
    commercial_context: str | None = Field(default=None, max_length=1200)
    risks: list[str] = Field(default_factory=list)
    attachments: list[EngagementAttachment] = Field(default_factory=list)
    activity_notes: list[EngagementActivityNote] = Field(default_factory=list)
    escalation_notes: list[EngagementEscalationNote] = Field(default_factory=list)

    @field_validator("name", "owner_id", "owner_name", "ops_lead_id", "ops_lead_name", "resource_dependency", "commercial_context")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Engagement field", max_length=1200) if value is not None else None

    @field_validator("service_lines", "risks")
    @classmethod
    def list_items_are_valid(cls, value: list[str]) -> list[str]:
        cleaned = [optional_text(item, "List item", max_length=240) for item in value]
        return [item for item in cleaned if item]

    @model_validator(mode="after")
    def dates_are_consistent(self) -> "EngagementBase":
        validate_engagement_dates(self.start_date, self.end_date, self.renewal_date, self.notice_deadline, self.notice_period_days)
        if not self.service_lines:
            raise ValueError("At least one service line is required.")
        return self


class EngagementCreateRequest(EngagementBase):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Cloud Governance Managed Services",
                    "status": "active",
                    "source_document_links": [{"title": "Cloud Governance SOW FY26.pdf", "url": "https://docs.example.com/sow", "type": "sow"}],
                    "start_date": "2026-01-01",
                    "end_date": "2026-12-31",
                    "renewal_date": "2027-01-01",
                    "notice_deadline": "2026-10-03",
                    "notice_period_days": 90,
                    "owner_id": "usr-002",
                    "owner_name": "Ali Khan",
                    "service_lines": ["Cloud", "FinOps"],
                    "value": 860000,
                    "currency": "USD",
                    "delivery_status": "watch",
                    "delivery_health": 88,
                    "resource_dependency": "Two named architects require backup coverage.",
                    "commercial_context": "Auto-renewal with uplift clause pending confirmation.",
                    "risks": ["Notice deadline falls before QBR"],
                }
            ]
        }
    )


class EngagementUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    status: EngagementStatus | None = None
    source_document_links: list[SourceDocumentLink] | None = None
    start_date: date | None = None
    end_date: date | None = None
    renewal_date: date | None = None
    notice_deadline: date | None = None
    notice_period_days: int | None = Field(default=None, ge=0, le=730)
    owner_id: str | None = Field(default=None, min_length=1, max_length=80)
    owner_name: str | None = Field(default=None, min_length=2, max_length=160)
    ops_lead_id: str | None = Field(default=None, max_length=80)
    ops_lead_name: str | None = Field(default=None, max_length=160)
    service_lines: list[str] | None = Field(default=None, min_length=1)
    value: float | None = Field(default=None, ge=0)
    currency: ConfiguredCurrency | None = None
    delivery_status: DeliveryStatus | None = None
    delivery_health: int | None = Field(default=None, ge=0, le=100)
    resource_dependency: str | None = Field(default=None, max_length=1200)
    commercial_context: str | None = Field(default=None, max_length=1200)
    risks: list[str] | None = None
    attachments: list[EngagementAttachment] | None = None
    activity_notes: list[EngagementActivityNote] | None = None
    escalation_notes: list[EngagementEscalationNote] | None = None

    @field_validator("name", "owner_id", "owner_name", "ops_lead_id", "ops_lead_name", "resource_dependency", "commercial_context")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Engagement field", max_length=1200) if value is not None else None

    @field_validator("service_lines", "risks")
    @classmethod
    def list_items_are_valid(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [optional_text(item, "List item", max_length=240) for item in value]
        return [item for item in cleaned if item]


class EngagementRead(EngagementBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    account_name: str | None = None
    health_score: int | None = None
    health_rag_status: HealthRagStatus | None = None
    health_drivers: list[str] = Field(default_factory=list)
    health_freshness: str
    health_dirty: bool
    health_contribution: float
    formula_version: str | None = None
    created_at: datetime
    updated_at: datetime


class EngagementPageRead(BaseModel):
    items: list[EngagementRead]
    total: int
    page: int
    page_size: int
    pages: int


class EngagementHealthRead(BaseModel):
    engagement_id: str
    account_id: str
    score: int
    rag_status: HealthRagStatus
    drivers: list[str]
    freshness: str
    contribution_to_account_health: float
    formula_version: str
    dirty: bool
    metric_inputs: dict
    calculated_at: datetime | None = None


class EngagementContributionRead(BaseModel):
    engagement_id: str
    engagement_name: str
    status: EngagementStatus
    value: float
    score: int | None
    rag_status: HealthRagStatus
    dirty: bool
    contribution_to_account_health: float
    freshness: str
    drivers: list[str]


class AccountHealthSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    rollup_score: int
    formula_version: str
    contributions: list[dict]
    dirty_count: int
    created_at: datetime


class AccountHealthRollupRead(BaseModel):
    account_id: str
    rollup_score: int
    formula_version: str
    contributions: list[EngagementContributionRead]
    dirty_count: int
    snapshots: list[AccountHealthSnapshotRead]
    total: int
    page: int
    page_size: int
    pages: int


def validate_engagement_dates(
    start_date: date,
    end_date: date,
    renewal_date: date | None,
    notice_deadline: date | None,
    notice_period_days: int | None,
) -> None:
    if end_date <= start_date:
        raise ValueError("End date must be after start date.")
    if renewal_date and renewal_date < end_date:
        raise ValueError("Renewal date must be on or after end date.")
    if notice_deadline and renewal_date and notice_deadline > renewal_date:
        raise ValueError("Notice deadline must be on or before renewal date.")
    if notice_deadline and renewal_date and notice_period_days:
        expected_notice = renewal_date - timedelta(days=notice_period_days)
        if notice_deadline != expected_notice:
            raise ValueError("Notice deadline must match the renewal date minus the notice period.")


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "admin@tkxelkam.com"}]})

    email: EmailStr = Field(..., description="Email address for the account requesting password reset.", examples=["admin@tkxelkam.com"])


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = Field(
        default=None,
        description="Returned only when EXPOSE_RESET_TOKENS=true for local development.",
    )


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"token": "paste-reset-token-here", "new_password": "NewAdmin@12345"}]})

    token: str = Field(..., description="Time-limited reset token generated by forgot-password.")
    new_password: str = Field(..., description="New password with at least 8 characters, mixed case, number, and symbol.")

    @field_validator("token")
    @classmethod
    def token_is_valid(cls, value: str) -> str:
        return validate_reset_token(value)

    @field_validator("new_password")
    @classmethod
    def new_password_is_valid(cls, value: str) -> str:
        return validate_password(value, "New password")


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"current_password": "Admin@12345", "new_password": "NewAdmin@12345"}]})

    current_password: str = Field(..., description="Current password for the authenticated user.")
    new_password: str = Field(..., description="Replacement password with at least 8 characters, mixed case, number, and symbol.")

    @field_validator("current_password")
    @classmethod
    def current_password_is_valid(cls, value: str) -> str:
        return validate_existing_password(value)

    @field_validator("new_password")
    @classmethod
    def replacement_password_is_valid(cls, value: str) -> str:
        return validate_password(value, "New password")

    @model_validator(mode="after")
    def passwords_are_different(self) -> "ChangePasswordRequest":
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current password.")
        return self


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "full_name": "KAM Super Admin",
                    "title": "Platform Owner",
                    "phone": "+1 555 0100",
                    "avatar_initials": "KS",
                }
            ]
        }
    )

    full_name: str | None = Field(default=None, description="Display name for the user profile.")
    title: str | None = Field(default=None, description="Job title or platform responsibility.")
    phone: str | None = Field(default=None, description="Optional phone number.")
    avatar_initials: str | None = Field(default=None, description="One to eight alphanumeric initials shown in the UI.")

    @field_validator("full_name")
    @classmethod
    def full_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Full name", max_length=160, min_length=2)

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Title", max_length=120)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value)

    @field_validator("avatar_initials")
    @classmethod
    def avatar_initials_are_valid(cls, value: str | None) -> str | None:
        return validate_avatar_initials(value)
