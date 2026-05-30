from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.validation import (
    optional_text,
    require_text,
    validate_avatar_initials,
    validate_existing_password,
    validate_password,
    validate_phone,
    validate_reset_token,
    validate_slug,
)

UserRole = str
LifecycleStatus = Literal["Onboarding", "Active", "At Risk", "Renewal Focus", "Expansion Focus", "Dormant", "Archived"]
RiskStatus = Literal["healthy", "warning", "critical"]
DraftStatus = Literal["ready_for_review", "approved", "rejected", "linked"]
ExtractionStatus = Literal["queued", "running", "completed", "failed", "needs_review", "parsed"]
OwnershipRole = Literal["primary_am", "supporting_am", "ops_lead", "leadership_sponsor"]
EngagementStatus = Literal["draft", "active", "renewal_watch", "at_risk", "completed", "archived"]
DeliveryStatus = Literal["planned", "active", "watch", "blocked", "completed"]
SourceType = Literal["project_charter", "sow", "attachment", "source_link", "commercial_note", "research", "manual_import"]


def validate_short_text(value: str, field_label: str, max_length: int = 180) -> str:
    text = require_text(value, field_label)
    if len(text) > max_length:
        raise ValueError(f"{field_label} must be {max_length} characters or fewer.")
    return text


def validate_optional_long_text(value: str | None, field_label: str, max_length: int = 2000) -> str | None:
    return optional_text(value, field_label, max_length=max_length)


def validate_currency(value: str) -> str:
    currency = require_text(value, "Currency").upper()
    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("Currency must be a 3-letter code such as USD.")
    return currency


def validate_non_negative(value: float | int, field_label: str) -> float:
    number = float(value)
    if number < 0:
        raise ValueError(f"{field_label} must be zero or greater.")
    return number


def validate_percent(value: int, field_label: str) -> int:
    if value < 0 or value > 100:
        raise ValueError(f"{field_label} must be between 0 and 100.")
    return value


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


class HealthScoreRead(BaseModel):
    overall: int
    relationship: int
    usage: int
    delivery: int
    commercial: int


class SourceCitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_document_id: str
    label: str
    page_number: int | None = None
    excerpt: str
    field_key: str | None = None


class SourceCitationCreateRequest(BaseModel):
    label: str
    page_number: int | None = None
    excerpt: str
    field_key: str | None = None

    @field_validator("label")
    @classmethod
    def label_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Citation label", 160)

    @field_validator("excerpt")
    @classmethod
    def excerpt_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Citation excerpt", 1000)

    @field_validator("field_key")
    @classmethod
    def field_key_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Citation field", max_length=120)


class SourceDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str | None = None
    engagement_id: str | None = None
    draft_id: str | None = None
    title: str
    source_type: SourceType
    file_name: str | None = None
    file_url: str | None = None
    link_url: str | None = None
    uploaded_by_name: str
    extraction_status: str
    confidence: int
    pages: int
    is_sensitive: bool
    created_at: datetime
    updated_at: datetime
    citations: list[SourceCitationRead] = Field(default_factory=list)


class SourceDocumentCreateRequest(BaseModel):
    title: str
    source_type: SourceType
    file_name: str | None = None
    file_url: str | None = None
    link_url: str | None = None
    extraction_status: ExtractionStatus = "completed"
    confidence: int = 75
    pages: int = 0
    is_sensitive: bool = False
    citations: list[SourceCitationCreateRequest] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Source title", 220)

    @field_validator("file_name", "file_url", "link_url")
    @classmethod
    def optional_source_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Source value", max_length=1000)

    @field_validator("confidence")
    @classmethod
    def confidence_is_valid(cls, value: int) -> int:
        return validate_percent(value, "Confidence")

    @field_validator("pages")
    @classmethod
    def pages_are_valid(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Pages must be zero or greater.")
        return value

    @model_validator(mode="after")
    def has_file_or_url(self) -> "SourceDocumentCreateRequest":
        if not self.file_name and not self.file_url and not self.link_url:
            raise ValueError("Source document requires a file name, file URL, or link URL.")
        return self


class SourceDocumentPageRead(BaseModel):
    items: list[SourceDocumentRead]
    total: int
    page: int
    page_size: int
    pages: int


class EngagementDraftRequest(BaseModel):
    name: str
    owner_id: str | None = None
    owner_name: str | None = None
    ops_lead_id: str | None = None
    ops_lead_name: str | None = None
    service_lines: list[str] = Field(default_factory=list)
    value: float = 0
    currency: str = "USD"
    delivery_status: DeliveryStatus = "active"
    start_date: datetime | None = None
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool = False
    commercial_context: str | None = None
    resource_dependency: str | None = None
    risks: list[str] = Field(default_factory=list)
    source_citation: str | None = None
    confidence: int = 75

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Engagement name")

    @field_validator("owner_name", "ops_lead_name")
    @classmethod
    def person_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Owner name", max_length=160)

    @field_validator("service_lines")
    @classmethod
    def service_lines_are_valid(cls, value: list[str]) -> list[str]:
        return [validate_short_text(item, "Service line", 120) for item in value]

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: float) -> float:
        return validate_non_negative(value, "Engagement value")

    @field_validator("currency")
    @classmethod
    def currency_is_valid(cls, value: str) -> str:
        return validate_currency(value)

    @field_validator("commercial_context", "resource_dependency", "source_citation")
    @classmethod
    def optional_long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Engagement text")

    @field_validator("risks")
    @classmethod
    def risks_are_valid(cls, value: list[str]) -> list[str]:
        return [validate_short_text(item, "Risk", 500) for item in value]

    @field_validator("confidence")
    @classmethod
    def draft_confidence_is_valid(cls, value: int) -> int:
        return validate_percent(value, "Confidence")

    @field_validator("notice_period_days")
    @classmethod
    def notice_period_is_valid(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("Notice period must be zero or greater.")
        return value

    @model_validator(mode="after")
    def dates_are_consistent(self) -> "EngagementDraftRequest":
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("Engagement end date must be after start date.")
        if self.notice_deadline and self.renewal_date and self.notice_deadline >= self.renewal_date:
            raise ValueError("Notice deadline must be before renewal date.")
        if self.notice_deadline and self.end_date and self.notice_deadline >= self.end_date:
            raise ValueError("Notice deadline must be before SOW end date.")
        return self


class EngagementDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    draft_id: str
    name: str
    owner_id: str | None = None
    owner_name: str | None = None
    ops_lead_id: str | None = None
    ops_lead_name: str | None = None
    service_lines: list[str]
    value: float
    currency: str
    delivery_status: str
    start_date: datetime | None = None
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool
    commercial_context: str | None = None
    resource_dependency: str | None = None
    risks: list[str]
    source_citation: str | None = None
    confidence: int


class OnboardingDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    extraction_status: str
    account_name: str
    project_name: str | None = None
    company_url: str | None = None
    lifecycle_status: str
    segment: str
    region: str | None = None
    service_context: str | None = None
    commercial_summary: str | None = None
    initial_notes: str | None = None
    commercial_value: float
    currency: str
    primary_owner_id: str | None = None
    primary_owner_name: str | None = None
    primary_owner_email: str | None = None
    confidence: int
    missing_fields: list[str]
    conflicts: list[str]
    duplicate_account_id: str | None = None
    source_citation: str | None = None
    created_by_name: str
    rejection_reason: str | None = None
    approved_account_id: str | None = None
    created_at: datetime
    updated_at: datetime
    decided_at: datetime | None = None
    source_documents: list[SourceDocumentRead] = Field(default_factory=list)
    engagement_drafts: list[EngagementDraftRead] = Field(default_factory=list)


class OnboardingDraftPageRead(BaseModel):
    items: list[OnboardingDraftRead]
    total: int
    page: int
    page_size: int
    pages: int


class OnboardingDraftCreateRequest(BaseModel):
    account_name: str
    project_name: str | None = None
    company_url: str | None = None
    lifecycle_status: LifecycleStatus = "Onboarding"
    segment: str = "Growth"
    region: str | None = None
    service_context: str | None = None
    commercial_summary: str | None = None
    initial_notes: str | None = None
    commercial_value: float = 0
    currency: str = "USD"
    primary_owner_id: str | None = None
    primary_owner_name: str | None = None
    primary_owner_email: EmailStr | None = None
    confidence: int = 75
    missing_fields: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    source_citation: str | None = None
    source_documents: list[SourceDocumentCreateRequest] = Field(..., min_length=1)
    engagement_drafts: list[EngagementDraftRequest] = Field(default_factory=list)

    @field_validator("account_name")
    @classmethod
    def account_name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Account name")

    @field_validator("project_name", "region", "primary_owner_name")
    @classmethod
    def optional_short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Field", max_length=180)

    @field_validator("company_url")
    @classmethod
    def company_url_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Company URL", max_length=500)

    @field_validator("segment")
    @classmethod
    def segment_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Segment", 80)

    @field_validator("service_context", "commercial_summary", "initial_notes", "source_citation")
    @classmethod
    def long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Draft text")

    @field_validator("commercial_value")
    @classmethod
    def commercial_value_is_valid(cls, value: float) -> float:
        return validate_non_negative(value, "Commercial value")

    @field_validator("currency")
    @classmethod
    def draft_currency_is_valid(cls, value: str) -> str:
        return validate_currency(value)

    @field_validator("confidence")
    @classmethod
    def confidence_is_valid(cls, value: int) -> int:
        return validate_percent(value, "Confidence")

    @field_validator("missing_fields", "conflicts")
    @classmethod
    def notes_are_valid(cls, value: list[str]) -> list[str]:
        return [validate_short_text(item, "Draft note", 500) for item in value]


class OnboardingDraftUpdateRequest(BaseModel):
    account_name: str | None = None
    project_name: str | None = None
    company_url: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    segment: str | None = None
    region: str | None = None
    service_context: str | None = None
    commercial_summary: str | None = None
    initial_notes: str | None = None
    commercial_value: float | None = None
    currency: str | None = None
    primary_owner_id: str | None = None
    primary_owner_name: str | None = None
    primary_owner_email: EmailStr | None = None
    confidence: int | None = None
    missing_fields: list[str] | None = None
    conflicts: list[str] | None = None
    source_citation: str | None = None

    @field_validator("account_name", "segment")
    @classmethod
    def optional_required_text_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Field", 180) if value is not None else None

    @field_validator("project_name", "region", "primary_owner_name", "company_url")
    @classmethod
    def optional_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Field", max_length=500)

    @field_validator("service_context", "commercial_summary", "initial_notes", "source_citation")
    @classmethod
    def optional_long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Draft text")

    @field_validator("commercial_value")
    @classmethod
    def optional_commercial_value_is_valid(cls, value: float | None) -> float | None:
        return validate_non_negative(value, "Commercial value") if value is not None else None

    @field_validator("currency")
    @classmethod
    def optional_currency_is_valid(cls, value: str | None) -> str | None:
        return validate_currency(value) if value is not None else None

    @field_validator("confidence")
    @classmethod
    def optional_confidence_is_valid(cls, value: int | None) -> int | None:
        return validate_percent(value, "Confidence") if value is not None else None


class OnboardingDraftRejectRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Rejection reason", 1000)


class OnboardingDraftLinkRequest(BaseModel):
    account_id: str
    reason: str

    @field_validator("account_id")
    @classmethod
    def account_id_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Account", 36)

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Link reason", 1000)


class AccountOwnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    user_id: str | None = None
    user_name: str
    user_email: str | None = None
    ownership_role: str
    is_primary: bool
    is_active: bool
    rationale: str | None = None
    created_at: datetime
    updated_at: datetime
    ended_at: datetime | None = None


class AccountOwnerCreateRequest(BaseModel):
    user_id: str
    ownership_role: OwnershipRole
    rationale: str
    source_document_id: str | None = None

    @field_validator("rationale")
    @classmethod
    def rationale_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Ownership rationale", 1000)


class AccountOwnerUpdateRequest(BaseModel):
    user_id: str | None = None
    ownership_role: OwnershipRole | None = None
    is_active: bool | None = None
    rationale: str

    @field_validator("rationale")
    @classmethod
    def rationale_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Ownership rationale", 1000)


class AccountOwnershipHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    owner_record_id: str | None = None
    ownership_role: str
    previous_user_id: str | None = None
    previous_user_name: str | None = None
    new_user_id: str | None = None
    new_user_name: str | None = None
    actor_id: str
    actor_name: str
    rationale: str
    source: str | None = None
    created_at: datetime


class AccountOwnershipHistoryPageRead(BaseModel):
    items: list[AccountOwnershipHistoryRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountStatusUpdateRequest(BaseModel):
    lifecycle_status: LifecycleStatus
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Status change reason", 1000)


class AccountRead(BaseModel):
    id: str
    name: str
    project_name: str | None = None
    company_url: str | None = None
    segment: str
    region: str | None = None
    lifecycle_status: str
    risk_status: str
    commercial_value: float
    currency: str
    service_context: str | None = None
    commercial_summary: str | None = None
    initial_notes: str | None = None
    source_citation: str | None = None
    health: HealthScoreRead
    next_governance_at: datetime | None = None
    created_from_draft_id: str | None = None
    created_at: datetime
    updated_at: datetime
    primary_owner: AccountOwnerRead | None = None
    owners: list[AccountOwnerRead] = Field(default_factory=list)
    governance_completeness: dict[str, bool] = Field(default_factory=dict)


class AccountPageRead(BaseModel):
    items: list[AccountRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountSummaryCardsRead(BaseModel):
    commercial_value: float
    currency: str
    lifecycle_status: str
    risk_status: str
    health_overall: int
    open_signals: int = 0
    overdue_activities: int = 0
    next_governance_at: datetime | None = None
    open_opportunities: int = 0
    active_escalations: int = 0


class AccountPermissionsRead(BaseModel):
    can_view: bool
    can_update: bool
    can_delete: bool
    can_approve: bool
    can_assign: bool
    can_manage_attachments: bool
    read_only: bool


class EngagementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    name: str
    status: str
    owner_id: str | None = None
    owner_name: str
    ops_lead_id: str | None = None
    ops_lead_name: str | None = None
    service_lines: list[str]
    value: float
    currency: str
    delivery_status: str
    delivery_health: int
    start_date: datetime
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool
    commercial_context: str | None = None
    resource_dependency: str | None = None
    risks: list[str]
    source_citation: str | None = None
    created_at: datetime
    updated_at: datetime
    source_documents: list[SourceDocumentRead] = Field(default_factory=list)


class EngagementPageRead(BaseModel):
    items: list[EngagementRead]
    total: int
    page: int
    page_size: int
    pages: int


class EngagementCreateRequest(EngagementDraftRequest):
    owner_id: str
    service_lines: list[str] = Field(..., min_length=1)
    start_date: datetime


class EngagementUpdateRequest(BaseModel):
    name: str | None = None
    status: EngagementStatus | None = None
    owner_id: str | None = None
    ops_lead_id: str | None = None
    service_lines: list[str] | None = None
    value: float | None = None
    currency: str | None = None
    delivery_status: DeliveryStatus | None = None
    delivery_health: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool | None = None
    commercial_context: str | None = None
    resource_dependency: str | None = None
    risks: list[str] | None = None
    source_citation: str | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Engagement name") if value is not None else None

    @field_validator("service_lines")
    @classmethod
    def service_lines_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return [validate_short_text(item, "Service line", 120) for item in value] if value is not None else None

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: float | None) -> float | None:
        return validate_non_negative(value, "Engagement value") if value is not None else None

    @field_validator("currency")
    @classmethod
    def currency_is_valid(cls, value: str | None) -> str | None:
        return validate_currency(value) if value is not None else None

    @field_validator("delivery_health")
    @classmethod
    def delivery_health_is_valid(cls, value: int | None) -> int | None:
        return validate_percent(value, "Delivery health") if value is not None else None

    @field_validator("commercial_context", "resource_dependency", "source_citation")
    @classmethod
    def optional_long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Engagement text")


class EngagementHealthRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    engagement_id: str
    account_id: str
    overall: int
    rag_status: str
    drivers: list[str]
    freshness_status: str
    is_dirty: bool
    contribution: float
    metric_version: str
    created_by_name: str
    created_at: datetime


class EngagementHealthPageRead(BaseModel):
    items: list[EngagementHealthRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountHealthRollupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    overall: int
    rag_status: str
    contributions: list[dict]
    metric_version: str
    created_at: datetime


class AccountOverviewRead(BaseModel):
    account: AccountRead
    summary_cards: AccountSummaryCardsRead
    permissions: AccountPermissionsRead
    engagements: EngagementPageRead
    attachments: SourceDocumentPageRead
