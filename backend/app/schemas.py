from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, ValidationInfo, field_validator, model_validator

from app.rbac import ALL_MODULE_SLUGS, MODULES
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
EngagementStatus = Literal["draft", "active", "on_hold", "renewal_watch", "at_risk", "completed", "archived"]
DeliveryStatus = Literal["not_started", "planned", "active", "watch", "blocked", "at_risk", "completed"]
CommercialStatus = Literal["healthy", "watch", "risk"]
EngagementHealthStatus = Literal["green", "amber", "red", "unknown"]
RenewalRisk = Literal["low", "medium", "high", "unknown"]
RenewalStatus = Literal["expired", "renewal_due", "notice_due", "upcoming_notice_window", "not_due", "unknown"]
SourceType = Literal["project_charter", "sow", "attachment", "source_link", "commercial_note", "research", "manual_import"]
KycDraftStatus = Literal["ready_for_review", "approved", "rejected"]
KycRunStatus = Literal["pending", "running", "complete", "failed", "partial"]
KycWorkstreamStatus = Literal["pending", "running", "complete", "failed"]
KycConfidenceLevel = Literal["low", "medium", "high"]
KycTriggerSource = Literal["account_overview", "onboarding_draft", "source_documents", "kyc_page", "manual"]
CustomFieldType = Literal["text", "textarea", "number", "currency", "date", "datetime", "boolean", "single_select", "multi_select", "email", "url", "phone"]
CustomFieldStatus = Literal["all", "active", "inactive"]
CustomFieldSort = Literal["label", "module", "field_type", "sort_order", "updated_at"]
ContentSourceKind = Literal["manual", "url", "file"]
ContentFollowUpStatus = Literal["not_required", "pending", "completed", "overdue"]
EscalationSeverity = Literal["low", "medium", "high", "critical"]
EscalationPriority = Literal["low", "medium", "high", "urgent"]
EscalationStatus = Literal["open", "watchlist", "mitigated", "resolved", "closed", "reopened", "cancelled"]
EscalationUpdateType = Literal["operations_update", "client_communication", "mitigation", "recovery", "status_change", "owner_change", "evidence", "closure", "reopen"]
GovernanceEventType = Literal["QBR", "SteerCo", "Monthly Review", "Executive Review"]
GovernanceEventStatus = Literal["draft", "scheduled", "upcoming", "completed", "overdue", "cancelled", "review_required"]
GovernanceEventSource = Literal["manual", "google_calendar", "fathom", "fathom_enriched", "review_required", "system"]
GovernanceGeneratedOutputType = Literal["agenda_draft", "governance_brief"]
GovernanceGenerationMethod = Literal["deterministic", "ai_agent"]
GovernanceCadence = Literal["weekly", "monthly", "quarterly", "yearly"]
GovernanceEndPolicy = Literal["never", "after_occurrences", "on_date"]
IntegrationProvider = Literal["google-calendar", "fathom"]
IntegrationStatus = Literal["configuration_required", "connected", "syncing", "error", "disabled"]

SELECT_FIELD_TYPES = {"single_select", "multi_select"}


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


def validate_positive_int(value: int, field_label: str, max_value: int = 10000) -> int:
    if value < 1 or value > max_value:
        raise ValueError(f"{field_label} must be between 1 and {max_value}.")
    return value


def validate_string_list(value: list[str], field_label: str, max_items: int = 30) -> list[str]:
    if len(value) > max_items:
        raise ValueError(f"{field_label} can include at most {max_items} items.")
    seen: set[str] = set()
    items: list[str] = []
    for item in value:
        text = validate_short_text(item, field_label, 120)
        key = text.lower()
        if key in seen:
            raise ValueError(f"{field_label} must not contain duplicates.")
        seen.add(key)
        items.append(text)
    return items


def validate_research_source_list(value: list[str], field_label: str = "Research sources", max_items: int = 10) -> list[str]:
    if len(value) > max_items:
        raise ValueError(f"{field_label} can include at most {max_items} items.")
    return [validate_short_text(item, field_label, 120) for item in value]


def validate_http_url(value: str | None, field_label: str = "URL") -> str | None:
    if value is None:
        return None
    url = optional_text(value, field_label, max_length=1000)
    if url is None:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_label} must be a valid http or https URL.")
    return url


def validate_percent(value: int, field_label: str) -> int:
    if value < 0 or value > 100:
        raise ValueError(f"{field_label} must be between 0 and 100.")
    return value


def validate_module_slug(value: str) -> str:
    module = validate_slug(value, "Module")
    if module not in ALL_MODULE_SLUGS:
        raise ValueError("Module must be one of the configured PRD module slugs.")
    return module


def validate_custom_field_options(value: list[str]) -> list[str]:
    seen_options: set[str] = set()
    options = []
    for item in value:
        option = validate_short_text(item, "Option", 120)
        option_key = option.lower()
        if option_key in seen_options:
            raise ValueError("Options must be unique.")
        seen_options.add(option_key)
        options.append(option)
    return options


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


class CustomFieldModuleRead(BaseModel):
    slug: str
    name: str


class CustomFieldDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    field_key: str
    label: str
    description: str | None = None
    field_type: str
    placeholder: str | None = None
    help_text: str | None = None
    options: list[str] = Field(default_factory=list)
    validation_rules: dict[str, Any] = Field(default_factory=dict)
    default_value: Any | None = None
    is_required: bool
    is_sensitive: bool
    is_active: bool
    show_in_list: bool
    show_in_detail: bool
    sort_order: int
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class CustomFieldDefinitionPageRead(BaseModel):
    items: list[CustomFieldDefinitionRead]
    total: int
    page: int
    page_size: int
    pages: int


class CustomFieldDefinitionCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "module": "account_overview",
                    "field_key": "customer_tier",
                    "label": "Customer Tier",
                    "description": "Commercial segmentation used by account teams.",
                    "field_type": "single_select",
                    "options": ["Platinum", "Gold", "Silver"],
                    "is_required": True,
                    "is_sensitive": False,
                    "is_active": True,
                    "show_in_list": True,
                    "show_in_detail": True,
                    "sort_order": 10,
                }
            ]
        }
    )

    module: str = Field(..., description="PRD module slug that will receive this custom field.")
    field_key: str = Field(..., description="Unique snake_case key within the selected module.")
    label: str = Field(..., description="User-facing field label.")
    description: str | None = Field(default=None, description="Admin-facing purpose or usage note.")
    field_type: CustomFieldType = Field(..., description="Control type used to render and validate the field.")
    placeholder: str | None = Field(default=None, description="Optional input placeholder.")
    help_text: str | None = Field(default=None, description="Optional helper text for users completing the field.")
    options: list[str] = Field(default_factory=list, description="Required for single_select and multi_select fields.")
    validation_rules: dict[str, Any] = Field(default_factory=dict, description="Reserved JSON validation metadata for future renderers.")
    default_value: Any | None = Field(default=None, description="Optional JSON-compatible default value.")
    is_required: bool = Field(default=False, description="Whether users must complete this field.")
    is_sensitive: bool = Field(default=False, description="Whether field access should be treated as sensitive.")
    is_active: bool = Field(default=True, description="Inactive fields remain configured but are not rendered.")
    show_in_list: bool = Field(default=False, description="Whether the field can appear in list/card summaries.")
    show_in_detail: bool = Field(default=True, description="Whether the field appears on detail pages.")
    sort_order: int = Field(default=0, ge=0, le=10000, description="Display order within the target module.")

    @field_validator("module")
    @classmethod
    def module_is_valid(cls, value: str) -> str:
        return validate_module_slug(value)

    @field_validator("field_key")
    @classmethod
    def field_key_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Field key")

    @field_validator("label")
    @classmethod
    def label_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Field label", 160)

    @field_validator("description", "placeholder")
    @classmethod
    def optional_short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Field text", max_length=500)

    @field_validator("help_text")
    @classmethod
    def help_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Help text", max_length=1000)

    @field_validator("options")
    @classmethod
    def options_are_valid(cls, value: list[str], info: ValidationInfo) -> list[str]:
        options = validate_custom_field_options(value)
        field_type = info.data.get("field_type")
        if field_type in SELECT_FIELD_TYPES and not options:
            raise ValueError("Options are required for select fields.")
        if field_type not in SELECT_FIELD_TYPES and options:
            raise ValueError("Options can only be configured for select fields.")
        return options


class CustomFieldDefinitionUpdateRequest(BaseModel):
    module: str | None = Field(default=None, description="PRD module slug that will receive this custom field.")
    field_key: str | None = Field(default=None, description="Unique snake_case key within the selected module.")
    label: str | None = Field(default=None, description="User-facing field label.")
    description: str | None = Field(default=None, description="Admin-facing purpose or usage note.")
    field_type: CustomFieldType | None = Field(default=None, description="Control type used to render and validate the field.")
    placeholder: str | None = Field(default=None, description="Optional input placeholder.")
    help_text: str | None = Field(default=None, description="Optional helper text for users completing the field.")
    options: list[str] | None = Field(default=None, description="Required for single_select and multi_select fields.")
    validation_rules: dict[str, Any] | None = Field(default=None, description="Reserved JSON validation metadata for future renderers.")
    default_value: Any | None = Field(default=None, description="Optional JSON-compatible default value.")
    is_required: bool | None = None
    is_sensitive: bool | None = None
    is_active: bool | None = None
    show_in_list: bool | None = None
    show_in_detail: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10000, description="Display order within the target module.")

    @field_validator("module")
    @classmethod
    def optional_module_is_valid(cls, value: str | None) -> str | None:
        return validate_module_slug(value) if value is not None else None

    @field_validator("field_key")
    @classmethod
    def optional_field_key_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Field key") if value is not None else None

    @field_validator("label")
    @classmethod
    def optional_label_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Field label", 160) if value is not None else None

    @field_validator("description", "placeholder")
    @classmethod
    def optional_short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Field text", max_length=500)

    @field_validator("help_text")
    @classmethod
    def optional_help_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Help text", max_length=1000)

    @field_validator("options")
    @classmethod
    def optional_options_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_custom_field_options(value) if value is not None else None


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


class SourceLinkRead(BaseModel):
    title: str | None = None
    url: str


class SourceLinkRequest(BaseModel):
    title: str | None = None
    url: str

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Source link title", max_length=220)

    @field_validator("url")
    @classmethod
    def url_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Source link URL", 1000)


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


class KycCitationRead(BaseModel):
    source_document_id: str | None = None
    label: str
    page_number: int | None = None
    excerpt: str
    field_key: str | None = None
    restricted: bool = False


class KycFieldRead(BaseModel):
    key: str
    label: str
    workstream_key: str
    workstream_title: str
    value: str | None = None
    confidence: int
    is_required: bool = True
    is_sensitive: bool = False
    reviewed: bool = False
    missing: bool = False
    conflict: bool = False
    previous_value: str | None = None
    citations: list[KycCitationRead] = Field(default_factory=list)


class KycWorkstreamRead(BaseModel):
    id: str | None = None
    workstream_key: str
    title: str
    status: str
    sort_order: int
    confidence: int
    output: dict[str, Any] = Field(default_factory=dict)
    citations: list[KycCitationRead] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class KycDraftRead(BaseModel):
    id: str
    account_id: str
    status: str
    trigger_source: str
    agent_run_id: str | None = None
    previous_snapshot_id: str | None = None
    approved_snapshot_id: str | None = None
    source_document_ids: list[str] = Field(default_factory=list)
    research_sources: list[str] = Field(default_factory=list)
    fields: list[KycFieldRead] = Field(default_factory=list)
    citations: list[KycCitationRead] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    difference_summary: list[str] = Field(default_factory=list)
    source_context: dict[str, Any] = Field(default_factory=dict)
    confidence: int
    completeness: int
    source_coverage: int
    freshness_status: str
    low_confidence_acknowledged: bool
    conflicts_acknowledged: bool
    override_reason: str | None = None
    review_notes: str | None = None
    created_by_name: str
    reviewed_by_name: str | None = None
    approved_by_name: str | None = None
    rejected_by_name: str | None = None
    rejection_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    decided_at: datetime | None = None
    ai_disclaimer: str


class KycDraftPageRead(BaseModel):
    items: list[KycDraftRead]
    total: int
    page: int
    page_size: int
    pages: int


class KycDraftCreateRequest(BaseModel):
    trigger_source: KycTriggerSource = "account_overview"
    source_document_ids: list[str] = Field(default_factory=list)
    research_sources: list[str] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("source_document_ids")
    @classmethod
    def source_document_ids_are_valid(cls, value: list[str]) -> list[str]:
        if len(value) > 50:
            raise ValueError("At most 50 source documents can be selected for one KYC draft.")
        return [validate_short_text(item, "Source document", 36) for item in value]

    @field_validator("research_sources")
    @classmethod
    def research_sources_are_valid(cls, value: list[str]) -> list[str]:
        return validate_research_source_list(value)

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "KYC notes")


class KycFieldUpdateRequest(BaseModel):
    key: str
    value: str | None = None
    reviewed: bool | None = None

    @field_validator("key")
    @classmethod
    def key_is_valid(cls, value: str) -> str:
        return validate_slug(value, "KYC field key")

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "KYC field value", max_length=8000)


class KycDraftUpdateRequest(BaseModel):
    fields: list[KycFieldUpdateRequest] | None = None
    low_confidence_acknowledged: bool | None = None
    conflicts_acknowledged: bool | None = None
    override_reason: str | None = None
    review_notes: str | None = None

    @field_validator("fields")
    @classmethod
    def fields_are_valid(cls, value: list[KycFieldUpdateRequest] | None) -> list[KycFieldUpdateRequest] | None:
        if value is not None and len(value) > 100:
            raise ValueError("At most 100 KYC fields can be updated at once.")
        return value

    @field_validator("override_reason", "review_notes")
    @classmethod
    def review_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "KYC review text")


class KycDraftApproveRequest(BaseModel):
    low_confidence_acknowledged: bool = False
    conflicts_acknowledged: bool = False
    override_reason: str | None = None
    change_summary: list[str] = Field(default_factory=list)

    @field_validator("override_reason")
    @classmethod
    def override_reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Override reason", 1000)

    @field_validator("change_summary")
    @classmethod
    def change_summary_is_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Change summary", max_items=20)


class KycDraftRejectRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Rejection reason", 1000)


class KycSnapshotRead(BaseModel):
    id: str
    account_id: str
    version: int
    source_draft_id: str | None = None
    extraction_run_id: str | None = None
    approved_by_name: str
    approved_at: datetime
    fields: list[KycFieldRead] = Field(default_factory=list)
    citations: list[KycCitationRead] = Field(default_factory=list)
    source_context: dict[str, Any] = Field(default_factory=dict)
    source_document_ids: list[str] = Field(default_factory=list)
    research_sources: list[str] = Field(default_factory=list)
    confidence: int
    completeness: int
    source_coverage: int
    freshness_status: str
    missing_fields: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    change_summary: list[str] = Field(default_factory=list)
    created_at: datetime
    ai_disclaimer: str


class KycSnapshotPageRead(BaseModel):
    items: list[KycSnapshotRead]
    total: int
    page: int
    page_size: int
    pages: int


class KycFreshnessRead(BaseModel):
    account_id: str
    has_approved_snapshot: bool
    snapshot_id: str | None = None
    snapshot_version: int | None = None
    completeness: int
    confidence: int
    source_coverage: int
    freshness_status: str
    stale: bool
    freshness_threshold_days: int
    last_approved_at: datetime | None = None
    stale_after: datetime | None = None
    missing_fields: list[str] = Field(default_factory=list)
    required_fields_total: int
    required_fields_completed: int


class KycConfigurationFieldRead(BaseModel):
    key: str
    label: str
    workstream_key: str
    required: bool = True
    sensitive: bool = False


class KycConfigurationRead(BaseModel):
    id: str
    name: str
    required_field_keys: list[str] = Field(default_factory=list)
    freshness_threshold_days: int
    low_confidence_threshold: int
    research_sources: list[str] = Field(default_factory=list)
    field_catalog: list[KycConfigurationFieldRead] = Field(default_factory=list)
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class KycConfigurationUpdateRequest(BaseModel):
    required_field_keys: list[str] | None = None
    freshness_threshold_days: int | None = Field(default=None, ge=1, le=730)
    low_confidence_threshold: int | None = Field(default=None, ge=1, le=100)
    research_sources: list[str] | None = None

    @field_validator("required_field_keys")
    @classmethod
    def required_field_keys_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return [validate_slug(item, "Required KYC field key") for item in value] if value is not None else None

    @field_validator("research_sources")
    @classmethod
    def research_sources_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_research_source_list(value) if value is not None else None


class KycAgentRunRead(BaseModel):
    id: str
    account_id: str
    status: str
    trigger_source: str
    previous_run_id: str | None = None
    source_document_ids: list[str] = Field(default_factory=list)
    research_sources: list[str] = Field(default_factory=list)
    triggered_by_name: str
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    workstreams: list[KycWorkstreamRead] = Field(default_factory=list)
    ai_disclaimer: str


class KycAgentRunPageRead(BaseModel):
    items: list[KycAgentRunRead]
    total: int
    page: int
    page_size: int
    pages: int


class KycAgentRunCreateRequest(BaseModel):
    trigger_source: KycTriggerSource = "kyc_page"
    source_document_ids: list[str] = Field(default_factory=list)
    research_sources: list[str] = Field(default_factory=list)

    @field_validator("source_document_ids")
    @classmethod
    def source_document_ids_are_valid(cls, value: list[str]) -> list[str]:
        if len(value) > 50:
            raise ValueError("At most 50 source documents can be selected for one KYC agent run.")
        return [validate_short_text(item, "Source document", 36) for item in value]

    @field_validator("research_sources")
    @classmethod
    def research_sources_are_valid(cls, value: list[str]) -> list[str]:
        return validate_research_source_list(value)


class EngagementDraftRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    ops_lead_id: str | None = None
    ops_lead_name: str | None = None
    service_lines: list[str] = Field(default_factory=list)
    source_links: list[SourceLinkRequest] = Field(default_factory=list)
    value: float = Field(default=0, validation_alias=AliasChoices("value", "contract_value"))
    currency: str = "USD"
    delivery_status: DeliveryStatus = "active"
    commercial_status: CommercialStatus = "watch"
    delivery_health: int = Field(default=70, validation_alias=AliasChoices("delivery_health", "health_score"))
    health_status: EngagementHealthStatus = "unknown"
    renewal_risk: RenewalRisk = "unknown"
    start_date: datetime | None = None
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool = False
    commercial_context: str | None = None
    resource_dependency: str | None = Field(default=None, validation_alias=AliasChoices("resource_dependency", "resource_dependency_notes"))
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

    @field_validator("description", "commercial_context", "resource_dependency", "source_citation")
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

    @field_validator("delivery_health")
    @classmethod
    def delivery_health_is_valid(cls, value: int) -> int:
        return validate_percent(value, "Health score")

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
        if "notice_deadline" in self.model_fields_set:
            self.notice_deadline = None
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
    days_to_expiry: int | None = None
    renewal_status: RenewalStatus = "unknown"
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
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Custom account field values keyed by field_key.")

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

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}


class AccountCsvImportRow(BaseModel):
    account_name: str | None = Field(default=None, description="Account name from the CSV row.")
    project_name: str | None = Field(default=None, description="Optional project or engagement name.")
    company_url: str | None = Field(default=None, description="Optional company website.")
    industry: str | None = Field(default=None, description="Optional industry value stored as account context.")
    arr: Any = Field(default=None, description="Annual recurring revenue from the CSV row.")
    commercial_value: Any = Field(default=None, description="Commercial value alias for ARR.")
    currency: str | None = Field(default=None, description="Three-letter currency code.")
    stage: str | None = Field(default=None, description="Lifecycle stage alias from CSV.")
    lifecycle_status: str | None = Field(default=None, description="Lifecycle status from CSV.")
    owner_email: str | None = Field(default=None, description="Primary Account Manager email.")
    owner_name: str | None = Field(default=None, description="Primary Account Manager name.")
    segment: str | None = Field(default=None, description="Account segment.")
    region: str | None = Field(default=None, description="Account region.")
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")


class AccountCsvImportRequest(BaseModel):
    duplicate_mode: Literal["skip", "overwrite", "create"] = Field(default="skip", description="How duplicate account names should be handled.")
    source_file_name: str | None = Field(default=None, description="Original CSV file name used for source document lineage.")
    rows: list[AccountCsvImportRow] = Field(..., min_length=1, max_length=500, description="Mapped CSV rows to import.")

    @field_validator("source_file_name")
    @classmethod
    def source_file_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Source file name", max_length=220)


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


class AccountCsvImportResult(BaseModel):
    row_number: int
    status: Literal["created", "updated", "skipped", "failed"]
    account_name: str | None = None
    message: str
    account_id: str | None = None
    draft_id: str | None = None
    errors: list[dict[str, str]] = Field(default_factory=list)
    account: AccountRead | None = None


class AccountCsvImportResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    failed: int
    total_rows: int
    results: list[AccountCsvImportResult]


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
    description: str | None = None
    status: str
    owner_id: str | None = None
    owner_name: str
    ops_lead_id: str | None = None
    ops_lead_name: str | None = None
    service_lines: list[str]
    source_document_ids: list[str] = Field(default_factory=list)
    source_links: list[SourceLinkRead] = Field(default_factory=list)
    value: float
    contract_value: float
    currency: str
    delivery_status: str
    commercial_status: str
    delivery_health: int
    health_score: int
    health_status: str
    renewal_risk: str
    start_date: datetime
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    days_to_expiry: int | None = None
    renewal_status: RenewalStatus = "unknown"
    auto_renewal: bool
    commercial_context: str | None = None
    resource_dependency: str | None = None
    resource_dependency_notes: str | None = None
    risks: list[str]
    source_citation: str | None = None
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_by: str | None = None
    updated_by: str | None = None
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
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    description: str | None = None
    status: EngagementStatus | None = None
    owner_id: str | None = None
    ops_lead_id: str | None = None
    service_lines: list[str] | None = None
    source_links: list[SourceLinkRequest] | None = None
    value: float | None = Field(default=None, validation_alias=AliasChoices("value", "contract_value"))
    currency: str | None = None
    delivery_status: DeliveryStatus | None = None
    commercial_status: CommercialStatus | None = None
    delivery_health: int | None = Field(default=None, validation_alias=AliasChoices("delivery_health", "health_score"))
    health_status: EngagementHealthStatus | None = None
    renewal_risk: RenewalRisk | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool | None = None
    commercial_context: str | None = None
    resource_dependency: str | None = Field(default=None, validation_alias=AliasChoices("resource_dependency", "resource_dependency_notes"))
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

    @field_validator("description", "commercial_context", "resource_dependency", "source_citation")
    @classmethod
    def optional_long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Engagement text")

    @field_validator("notice_period_days")
    @classmethod
    def notice_period_is_valid(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("Notice period must be zero or greater.")
        return value

    @model_validator(mode="after")
    def dates_are_consistent(self) -> "EngagementUpdateRequest":
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("Engagement end date must be after start date.")
        if "notice_deadline" in self.model_fields_set:
            self.notice_deadline = None
        return self


class TimelineEventRead(BaseModel):
    id: str
    account_id: str
    engagement_id: str | None = None
    event_type: str
    title: str
    description: str
    previous_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    actor_id: str
    actor_name: str
    source_module: str
    source_record_id: str | None = None
    source_record_type: str | None = None
    source_record_route: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class TimelineEventPageRead(BaseModel):
    items: list[TimelineEventRead]
    total: int
    page: int
    page_size: int
    pages: int


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


class ContentItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None = None
    content_type: str
    category: str
    tags: list[str] = Field(default_factory=list)
    service_lines: list[str] = Field(default_factory=list)
    account_stages: list[str] = Field(default_factory=list)
    source_kind: str
    url: str | None = None
    body_content: str | None = None
    file_name: str | None = None
    file_path: str | None = None
    file_storage_backend: str | None = None
    file_mime_type: str | None = None
    file_size_bytes: int | None = None
    is_active: bool
    popularity_count: int
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    custom_field_values: dict[str, Any] = Field(default_factory=dict)


class ContentItemPageRead(BaseModel):
    items: list[ContentItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class ContentItemCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Executive guide to FinOps governance",
                    "description": "Client education asset for executive stakeholders.",
                    "content_type": "Guide",
                    "category": "Cloud",
                    "tags": ["FinOps", "Executive"],
                    "service_lines": ["Cloud", "Customer Success"],
                    "account_stages": ["Expansion Focus"],
                    "source_kind": "url",
                    "url": "https://example.com/finops-guide",
                }
            ]
        }
    )

    title: str
    description: str | None = None
    content_type: str
    category: str
    tags: list[str] = Field(default_factory=list)
    service_lines: list[str] = Field(default_factory=list)
    account_stages: list[str] = Field(default_factory=list)
    source_kind: ContentSourceKind = "manual"
    url: str | None = None
    body_content: str | None = None
    is_active: bool = True
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Content title", 220)

    @field_validator("description", "body_content")
    @classmethod
    def optional_content_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Content text", 8000)

    @field_validator("content_type", "category")
    @classmethod
    def content_taxonomy_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Content taxonomy", 120)

    @field_validator("tags", "service_lines", "account_stages")
    @classmethod
    def lists_are_valid(cls, value: list[str], info: ValidationInfo) -> list[str]:
        return validate_string_list(value, info.field_name.replace("_", " ").title())

    @field_validator("url")
    @classmethod
    def url_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Content URL")

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}

    @model_validator(mode="after")
    def source_has_payload(self) -> "ContentItemCreateRequest":
        if self.source_kind == "url" and not self.url:
            raise ValueError("Content URL is required when source kind is URL.")
        if self.source_kind == "file":
            raise ValueError("Use the content upload endpoint when source kind is file.")
        if self.source_kind == "manual" and not self.body_content and not self.url:
            raise ValueError("Manual content requires body content or a source URL.")
        return self


class ContentItemUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    content_type: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    service_lines: list[str] | None = None
    account_stages: list[str] | None = None
    source_kind: ContentSourceKind | None = None
    url: str | None = None
    body_content: str | None = None
    is_active: bool | None = None
    custom_field_values: dict[str, Any] | None = Field(default=None, description="Full replacement Field Builder values keyed by field_key.")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Content title", 220) if value is not None else None

    @field_validator("description", "body_content")
    @classmethod
    def optional_content_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Content text", 8000)

    @field_validator("content_type", "category")
    @classmethod
    def content_taxonomy_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Content taxonomy", 120) if value is not None else None

    @field_validator("tags", "service_lines", "account_stages")
    @classmethod
    def lists_are_valid(cls, value: list[str] | None, info: ValidationInfo) -> list[str] | None:
        return validate_string_list(value, info.field_name.replace("_", " ").title()) if value is not None else None

    @field_validator("url")
    @classmethod
    def url_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Content URL")

    @field_validator("custom_field_values")
    @classmethod
    def optional_custom_field_keys_are_valid(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()} if value is not None else None


class ContentRecommendationRead(BaseModel):
    content: ContentItemRead
    rationale: str
    source_context: str
    relevance_score: int
    stale: bool = False


class SentContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    content_item_id: str | None = None
    content_title_snapshot: str
    content_type_snapshot: str
    sender_id: str | None = None
    sender_name: str
    recipient_name: str
    recipient_email: EmailStr | None = None
    shared_at: datetime
    follow_up_status: str
    follow_up_due_at: datetime | None = None
    notes: str | None = None
    timeline_entry_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SentContentPageRead(BaseModel):
    items: list[SentContentRead]
    total: int
    page: int
    page_size: int
    pages: int


class SentContentCreateRequest(BaseModel):
    content_item_id: str
    engagement_id: str | None = None
    recipient_name: str
    recipient_email: EmailStr | None = None
    shared_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    follow_up_status: ContentFollowUpStatus = "not_required"
    follow_up_due_at: datetime | None = None
    notes: str | None = None

    @field_validator("recipient_name")
    @classmethod
    def recipient_name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Recipient name", 160)

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Share notes")


class SentContentUpdateRequest(BaseModel):
    follow_up_status: ContentFollowUpStatus | None = None
    follow_up_due_at: datetime | None = None
    notes: str | None = None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Share notes")


class EscalationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    summary: str
    impact: str
    severity: str
    priority: str
    status: str
    owner_id: str | None = None
    owner_name: str
    sla_due_at: datetime
    watchlist: bool
    mitigation: str | None = None
    recovery_actions: str | None = None
    communication_cadence: str | None = None
    resolution_summary: str | None = None
    rca: str | None = None
    closure_evidence: str | None = None
    closure_override_reason: str | None = None
    closed_by_id: str | None = None
    closed_at: datetime | None = None
    reopened_at: datetime | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    custom_field_values: dict[str, Any] = Field(default_factory=dict)


class EscalationPageRead(BaseModel):
    items: list[EscalationRead]
    total: int
    page: int
    page_size: int
    pages: int


class EscalationCreateRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    summary: str
    impact: str
    severity: EscalationSeverity
    priority: EscalationPriority = "medium"
    owner_id: str
    sla_due_at: datetime | None = None
    watchlist: bool = False
    mitigation: str | None = None
    recovery_actions: str | None = None
    communication_cadence: str | None = None
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Escalation summary", 260)

    @field_validator("impact")
    @classmethod
    def impact_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Escalation impact", 2000)

    @field_validator("mitigation", "recovery_actions")
    @classmethod
    def long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Escalation text")

    @field_validator("communication_cadence")
    @classmethod
    def cadence_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Communication cadence", max_length=120)

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}


class EscalationUpdateRequest(BaseModel):
    summary: str | None = None
    impact: str | None = None
    severity: EscalationSeverity | None = None
    priority: EscalationPriority | None = None
    status: EscalationStatus | None = None
    owner_id: str | None = None
    sla_due_at: datetime | None = None
    watchlist: bool | None = None
    mitigation: str | None = None
    recovery_actions: str | None = None
    communication_cadence: str | None = None
    custom_field_values: dict[str, Any] | None = Field(default=None, description="Full replacement Field Builder values keyed by field_key.")

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Escalation summary", 260) if value is not None else None

    @field_validator("impact", "mitigation", "recovery_actions")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Escalation text")

    @field_validator("communication_cadence")
    @classmethod
    def cadence_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Communication cadence", max_length=120)

    @field_validator("custom_field_values")
    @classmethod
    def optional_custom_field_keys_are_valid(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()} if value is not None else None


class EscalationUpdateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    escalation_id: str
    update_type: str
    body: str
    actor_id: str | None = None
    actor_name: str
    metadata_json: dict | None = None
    created_at: datetime


class EscalationUpdatePageRead(BaseModel):
    items: list[EscalationUpdateRead]
    total: int
    page: int
    page_size: int
    pages: int


class EscalationAddUpdateRequest(BaseModel):
    update_type: EscalationUpdateType = "operations_update"
    body: str

    @field_validator("body")
    @classmethod
    def body_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Escalation update", 4000)


class EscalationCloseRequest(BaseModel):
    resolution_summary: str
    closure_evidence: str | None = None
    rca: str | None = None
    override_reason: str | None = None

    @field_validator("resolution_summary")
    @classmethod
    def resolution_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Resolution summary", 4000)

    @field_validator("closure_evidence", "rca", "override_reason")
    @classmethod
    def closure_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Closure text", 4000)


class EscalationNotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    escalation_id: str
    recipient_user_id: str | None = None
    recipient_name: str
    recipient_email: EmailStr | None = None
    channel: str
    trigger: str
    reason: str
    sla_window_key: str
    delivery_status: str
    deduplication_key: str
    retry_count: int
    delivered_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime


class EscalationNotificationPageRead(BaseModel):
    items: list[EscalationNotificationRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceRecurrenceRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    governance_type: str
    cadence: str
    interval: int
    start_at: datetime
    day_of_week: int | None = None
    day_of_month: int | None = None
    end_policy: str
    occurrences: int | None = None
    end_at: datetime | None = None
    account_id: str | None = None
    segment: str | None = None
    owner_id: str | None = None
    owner_name: str
    is_active: bool
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class GovernanceRecurrenceRulePageRead(BaseModel):
    items: list[GovernanceRecurrenceRuleRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceRecurrenceRuleCreateRequest(BaseModel):
    name: str
    governance_type: GovernanceEventType
    cadence: GovernanceCadence
    interval: int = 1
    start_at: datetime
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    end_policy: GovernanceEndPolicy = "never"
    occurrences: int | None = None
    end_at: datetime | None = None
    account_id: str | None = None
    segment: str | None = None
    owner_id: str
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Recurrence rule name", 180)

    @field_validator("interval")
    @classmethod
    def interval_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Recurrence interval", 24)

    @field_validator("occurrences")
    @classmethod
    def occurrences_are_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Occurrences", 120) if value is not None else None

    @field_validator("segment")
    @classmethod
    def segment_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Segment", max_length=80)

    @model_validator(mode="after")
    def end_policy_is_complete(self) -> "GovernanceRecurrenceRuleCreateRequest":
        if self.end_policy == "after_occurrences" and not self.occurrences:
            raise ValueError("Occurrences are required when end policy is after occurrences.")
        if self.end_policy == "on_date" and not self.end_at:
            raise ValueError("End date is required when end policy is on date.")
        if not self.account_id and not self.segment:
            raise ValueError("Recurrence rule requires either account scope or segment scope.")
        return self


class GovernanceRecurrenceRuleUpdateRequest(BaseModel):
    name: str | None = None
    governance_type: GovernanceEventType | None = None
    cadence: GovernanceCadence | None = None
    interval: int | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    end_policy: GovernanceEndPolicy | None = None
    occurrences: int | None = None
    end_at: datetime | None = None
    account_id: str | None = None
    segment: str | None = None
    owner_id: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Recurrence rule name", 180) if value is not None else None

    @field_validator("interval")
    @classmethod
    def interval_is_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Recurrence interval", 24) if value is not None else None

    @field_validator("occurrences")
    @classmethod
    def occurrences_are_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Occurrences", 120) if value is not None else None


class GovernanceNoteRead(BaseModel):
    id: str
    event_id: str
    body: str
    author_id: str | None = None
    author_name: str
    source: str = "manual"
    created_at: datetime
    updated_at: datetime


class GovernanceGeneratedOutputCitationRead(BaseModel):
    id: str
    output_id: str
    source_type: str
    source_id: str
    source_title: str
    source_url: str | None = None
    snippet: str
    label: str | None = None
    excerpt: str | None = None
    source_route: str | None = None
    source_timestamp: datetime | None = None
    created_at: datetime


class GovernanceGeneratedOutputRead(BaseModel):
    id: str
    event_id: str
    output_type: GovernanceGeneratedOutputType
    generation_method: GovernanceGenerationMethod = "deterministic"
    status: str = "generated"
    content: str
    disclaimer: str
    source_filter_metadata: dict[str, Any] = Field(default_factory=dict)
    provider_metadata: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    citations: list[GovernanceGeneratedOutputCitationRead] = Field(default_factory=list)
    summary: str | None = None
    talking_points: list[str] = Field(default_factory=list)
    open_risks: list[str] = Field(default_factory=list)
    pending_decisions: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)


class GovernanceEventRead(BaseModel):
    id: str
    account_id: str | None = None
    account_name: str = ""
    engagement_id: str | None = None
    engagement_name: str | None = None
    owner_id: str | None = None
    owner_name: str
    owner_email: EmailStr | None = None
    governance_type: str
    source: str
    external_provider: str | None = None
    external_event_id: str | None = None
    deduplication_key: str | None = None
    mapping_confidence: int = 100
    review_required: bool = False
    scheduled_at: datetime
    end_at: datetime | None = None
    status: str
    agenda: str | None = None
    note_text: str | None = None
    notes: list[GovernanceNoteRead] = Field(default_factory=list)
    attendees: list[str] = Field(default_factory=list)
    attendee_emails: list[str] = Field(default_factory=list)
    recurrence_rule_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    custom_field_values: dict[str, Any] = Field(default_factory=dict)
    decisions: list["GovernanceDecisionRead"] = Field(default_factory=list)
    action_items: list["GovernanceActionItemRead"] = Field(default_factory=list)
    generated_outputs: list[GovernanceGeneratedOutputRead] = Field(default_factory=list)


class GovernanceEventPageRead(BaseModel):
    items: list[GovernanceEventRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceEventCreateRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    owner_id: str
    governance_type: GovernanceEventType
    scheduled_at: datetime
    end_at: datetime | None = None
    status: GovernanceEventStatus = "upcoming"
    agenda: str | None = None
    notes: str | None = None
    attendees: list[str] = Field(default_factory=list)
    attendee_emails: list[EmailStr] = Field(default_factory=list)
    source: GovernanceEventSource = "manual"
    recurrence_rule_id: str | None = None
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")

    @field_validator("agenda", "notes")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Governance text", 8000)

    @field_validator("attendees")
    @classmethod
    def attendees_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Attendees", max_items=100)

    @field_validator("attendee_emails")
    @classmethod
    def attendee_emails_are_unique(cls, value: list[EmailStr]) -> list[EmailStr]:
        normalized = [str(email).strip().lower() for email in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("Attendee emails must be unique.")
        return value

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}


class GovernanceEventUpdateRequest(BaseModel):
    account_id: str | None = None
    engagement_id: str | None = None
    owner_id: str | None = None
    governance_type: GovernanceEventType | None = None
    scheduled_at: datetime | None = None
    end_at: datetime | None = None
    status: GovernanceEventStatus | None = None
    agenda: str | None = None
    notes: str | None = None
    attendees: list[str] | None = None
    attendee_emails: list[EmailStr] | None = None
    custom_field_values: dict[str, Any] | None = Field(default=None, description="Full replacement Field Builder values keyed by field_key.")

    @field_validator("agenda", "notes")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Governance text", 8000)

    @field_validator("attendees")
    @classmethod
    def attendees_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Attendees", max_items=100) if value is not None else None

    @field_validator("attendee_emails")
    @classmethod
    def attendee_emails_are_unique(cls, value: list[EmailStr] | None) -> list[EmailStr] | None:
        if value is None:
            return None
        normalized = [str(email).strip().lower() for email in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("Attendee emails must be unique.")
        return value

    @field_validator("custom_field_values")
    @classmethod
    def optional_custom_field_keys_are_valid(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()} if value is not None else None


class GovernanceDecisionRead(BaseModel):
    id: str
    governance_event_id: str
    event_id: str
    decision_text: str
    owner_id: str | None = None
    owner_name: str | None = None
    source: str = "manual"
    timeline_entry_id: str | None = None
    created_at: datetime


class GovernanceDecisionPageRead(BaseModel):
    items: list[GovernanceDecisionRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceDecisionCreateRequest(BaseModel):
    decision_text: str
    owner_id: str | None = None
    owner_name: str | None = None

    @field_validator("decision_text")
    @classmethod
    def decision_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Decision", 4000)

    @field_validator("owner_name")
    @classmethod
    def owner_name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Decision owner", 160) if value is not None else None


class GovernanceActionItemRead(BaseModel):
    id: str
    governance_event_id: str
    event_id: str
    title: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: EmailStr | None = None
    due_at: datetime
    due_date: datetime
    status: str
    priority: str
    source: str = "manual"
    completed_at: datetime | None = None
    completed_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class GovernanceActionItemPageRead(BaseModel):
    items: list[GovernanceActionItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceActionItemCreateRequest(BaseModel):
    title: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: EmailStr | None = None
    due_at: datetime | None = None
    due_date: datetime | None = None
    priority: EscalationPriority = "medium"

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Action item", 220)

    @field_validator("owner_name")
    @classmethod
    def action_owner_name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Action owner", 160) if value is not None else None

    @model_validator(mode="after")
    def action_item_is_complete(self) -> "GovernanceActionItemCreateRequest":
        if not (self.owner_id or self.owner_name or self.owner_email):
            raise ValueError("Action item owner is required.")
        if not (self.due_at or self.due_date):
            raise ValueError("Action item due date is required.")
        return self


class GovernanceActionItemUpdateRequest(BaseModel):
    title: str | None = None
    owner_id: str | None = None
    due_at: datetime | None = None
    status: Literal["open", "in_progress", "completed", "cancelled"] | None = None
    priority: EscalationPriority | None = None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Action item", 220) if value is not None else None


class GovernanceEventAgendaUpdateRequest(BaseModel):
    agenda: str
    source_output_id: str | None = None

    @field_validator("agenda")
    @classmethod
    def agenda_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Agenda", 4000)


class GovernanceEventCompleteRequest(BaseModel):
    notes: str
    decisions: list[GovernanceDecisionCreateRequest] = Field(default_factory=list)
    action_items: list[GovernanceActionItemCreateRequest] = Field(default_factory=list)

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str) -> str:
        return validate_short_text(value, "Notes", 5000)


class GovernanceGeneratedOutputRequest(BaseModel):
    source_modules: list[str] = Field(default_factory=list)

    @field_validator("source_modules")
    @classmethod
    def source_modules_are_valid(cls, value: list[str]) -> list[str]:
        return [validate_short_text(item, "Source module", 80) for item in value]


class GovernanceSourceCitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    governance_event_id: str
    source_module: str
    source_entity_type: str
    source_entity_id: str | None = None
    source_route: str | None = None
    label: str
    excerpt: str
    created_at: datetime


class GovernanceCalendarItemRead(BaseModel):
    id: str
    kind: str
    source_record_id: str
    source_record_type: str
    account_id: str
    account_name: str
    owner_id: str | None = None
    date: datetime
    title: str
    detail: str
    status: str
    route: str


class GovernanceCalendarPageRead(BaseModel):
    items: list[GovernanceCalendarItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class GovernanceAIBriefRead(GovernanceGeneratedOutputRead):
    summary: str
    talking_points: list[str]
    open_risks: list[str]
    pending_decisions: list[str]
    action_items: list[str]
    citations: list[GovernanceGeneratedOutputCitationRead]


class IntegrationConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    enabled: bool
    status: str
    auth_type: str
    settings_json: dict = Field(default_factory=dict)
    scopes: list[str] = Field(default_factory=list)
    last_synced_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class IntegrationConnectionUpdateRequest(BaseModel):
    enabled: bool | None = None
    auth_type: str | None = None
    credentials_json: dict | None = None
    settings_json: dict | None = None
    scopes: list[str] | None = None
    status: IntegrationStatus | None = None

    @field_validator("auth_type")
    @classmethod
    def auth_type_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Auth type", 60) if value is not None else None


class IntegrationSyncLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    source_record_id: str | None = None
    action: str
    status: str
    deduplication_key: str | None = None
    message: str | None = None
    payload: dict | None = None
    created_at: datetime


class IntegrationSyncLogPageRead(BaseModel):
    items: list[IntegrationSyncLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class IntegrationSyncResponse(BaseModel):
    provider: str
    status: str
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    message: str
