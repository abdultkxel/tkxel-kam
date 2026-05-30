from datetime import datetime
from typing import Any, Literal

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
CustomFieldType = Literal["text", "textarea", "number", "currency", "date", "datetime", "boolean", "single_select", "multi_select", "email", "url", "phone"]
CustomFieldStatus = Literal["all", "active", "inactive"]
CustomFieldSort = Literal["label", "module", "field_type", "sort_order", "updated_at"]

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
