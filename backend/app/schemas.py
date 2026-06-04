from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
LifecycleStatus = Literal["Draft", "Onboarding", "Active", "At Risk", "Renewal Focus", "Expansion Focus", "Dormant", "Archived"]
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
IntegrationProvider = Literal["google_calendar", "google-calendar", "fathom", "csat", "ai_llm_gateway"]
IntegrationStatus = Literal["configuration_required", "connected", "syncing", "error", "disabled"]
MeetingArtifactStatus = Literal["draft", "waiting_for_fathom", "ready", "attached"]
PlaybookOwnerRule = Literal["account_primary_am", "task_creator", "ops_lead", "template_owner"]
TaskStatus = Literal["open", "in_progress", "done", "blocked", "cancelled", "todo", "skipped"]
TaskPriority = Literal["low", "medium", "high", "urgent", "critical"]
TaskEvidenceType = Literal["note", "link", "file"]
StakeholderRole = str
StakeholderInfluence = Literal["low", "medium", "high", "critical"]
StakeholderRelationshipStrength = Literal["unknown", "weak", "developing", "strong", "champion"]
StakeholderSentiment = Literal["negative", "neutral", "positive", "champion"]
StakeholderPoliticalRisk = Literal["unknown", "low", "medium", "high"]
StakeholderStatus = Literal["active", "inactive", "left_company", "do_not_contact"]
OpportunityStage = str
OpportunityActionItemStatus = Literal["open", "in_progress", "completed", "cancelled"]
ScoringScope = Literal["account", "engagement", "portfolio"]
MetricStatus = Literal["draft", "published", "inactive"]
ScoreRagStatus = Literal["red", "amber", "green", "unknown"]
ScoreSnapshotStatus = Literal["complete", "incomplete", "failed"]
ScoringJobType = Literal["manual", "scheduled", "event"]
ScoringJobStatus = Literal["queued", "running", "complete", "failed"]
SignalSeverity = Literal["info", "warning", "critical"]
SignalStatus = Literal["new", "reviewed", "accepted", "dismissed", "converted", "resolved"]
SignalConvertTarget = Literal["task", "playbook"]

SELECT_FIELD_TYPES = {"single_select", "multi_select"}
CSAT_CATEGORY_KEYS = {
    "delivery_excellence": "Delivery Excellence",
    "communication": "Communication",
    "proactiveness": "Proactiveness",
    "trust": "Trust",
    "value_for_money": "Value for Money",
}


def normalize_task_status(value: str) -> str:
    aliases = {"todo": "open", "skipped": "cancelled"}
    return aliases.get(str(value), str(value))


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


def validate_meeting_action_items(value: list[str]) -> list[str]:
    if len(value) > 50:
        raise ValueError("Meeting action items can include at most 50 items.")
    seen: set[str] = set()
    items: list[str] = []
    for item in value:
        text = validate_short_text(item, "Meeting action item", 220)
        key = text.lower()
        if key in seen:
            raise ValueError("Meeting action items must not contain duplicates.")
        seen.add(key)
        items.append(text)
    return items


def validate_csat_category_scores(value: dict[str, float]) -> dict[str, float]:
    if not value:
        return {}
    unknown = sorted(set(value) - set(CSAT_CATEGORY_KEYS))
    if unknown:
        raise ValueError(f"Unsupported CSAT category key(s): {', '.join(unknown)}.")
    missing = sorted(set(CSAT_CATEGORY_KEYS) - set(value))
    if missing:
        raise ValueError(f"CSAT category score(s) missing: {', '.join(missing)}.")
    normalized: dict[str, float] = {}
    for key in CSAT_CATEGORY_KEYS:
        score = float(value[key])
        if score < 1 or score > 5:
            raise ValueError(f"{CSAT_CATEGORY_KEYS[key]} must be between 1 and 5.")
        normalized[key] = round(score, 2)
    return normalized


def validate_csat_category_weights(value: dict[str, float]) -> dict[str, float]:
    if not value:
        return {}
    unknown = sorted(set(value) - set(CSAT_CATEGORY_KEYS))
    if unknown:
        raise ValueError(f"Unsupported CSAT category weight key(s): {', '.join(unknown)}.")
    normalized = {key: round(float(value[key]), 2) for key in value}
    if any(weight < 0 for weight in normalized.values()):
        raise ValueError("CSAT category weights must be zero or greater.")
    total = round(sum(normalized.values()), 2)
    if total <= 0:
        raise ValueError("CSAT category weights must total more than zero.")
    return normalized


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


def validate_google_calendar_id(value: str | None, field_label: str = "Google Calendar ID") -> str | None:
    text = optional_text(value, field_label, max_length=255)
    if text is None:
        return None
    if any(marker in text for marker in (" ", "://", "/", "\\", "?", "#")):
        raise ValueError(f"{field_label} must be a valid Google Calendar ID.")
    return text


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    title: str | None = None
    phone: str | None = None
    avatar_initials: str
    primary_google_calendar_id: str | None = None
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
    primary_google_calendar_id: str | None = None
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

    @field_validator("primary_google_calendar_id")
    @classmethod
    def primary_google_calendar_id_is_valid(cls, value: str | None) -> str | None:
        return validate_google_calendar_id(value, "Primary Google Calendar ID")


class UserUpdateRequest(BaseModel):
    email: EmailStr | None = Field(default=None, description="Updated user email address.")
    full_name: str | None = None
    role: str | None = Field(default=None, description="Role slug assigned to the user.")
    title: str | None = None
    phone: str | None = None
    avatar_initials: str | None = None
    primary_google_calendar_id: str | None = None
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

    @field_validator("primary_google_calendar_id")
    @classmethod
    def primary_google_calendar_id_is_valid(cls, value: str | None) -> str | None:
        return validate_google_calendar_id(value, "Primary Google Calendar ID")


class LoginRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "admin@tkxel.com", "password": "Admin@12345"}]})

    email: EmailStr = Field(..., description="Registered user email address.", examples=["admin@tkxel.com"])
    password: str = Field(..., description="Password with at least 8 characters, mixed case, number, and symbol.")

    @field_validator("password")
    @classmethod
    def password_is_valid(cls, value: str) -> str:
        return validate_password(value)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class GoogleSignInRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"credential": "google-id-token"}]})

    credential: str = Field(..., min_length=1, description="Google Identity Services ID token credential.")


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "admin@tkxel.com"}]})

    email: EmailStr = Field(..., description="Email address for the account requesting password reset.", examples=["admin@tkxel.com"])


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


class AllowedEmailDomainsUpdateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"domains_input": "tkxel.com, tkxel.io, camp1.tkxel.com"},
                {"domains": ["tkxel.com", "tkxel.io", "camp1.tkxel.com"]},
            ]
        }
    )

    domains_input: str | None = Field(default=None, description="Comma-separated allowed email domains.")
    domains: list[str] | None = Field(default=None, description="Allowed email domains as a list.")

    @model_validator(mode="after")
    def has_domains_payload(self) -> "AllowedEmailDomainsUpdateRequest":
        if self.domains_input is None and self.domains is None:
            raise ValueError("Allowed email domains are required.")
        return self


class AllowedEmailDomainsRead(BaseModel):
    domains: list[str]
    domains_input: str
    updated_by_id: str | None = None
    updated_by_name: str | None = None
    updated_at: datetime | None = None
    duplicates_removed: bool = False


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
    primary_google_calendar_id: str | None = Field(default=None, description="Google Calendar ID used for outbound KAM calendar writes.")

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

    @field_validator("primary_google_calendar_id")
    @classmethod
    def primary_google_calendar_id_is_valid(cls, value: str | None) -> str | None:
        return validate_google_calendar_id(value, "Primary Google Calendar ID")


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
    storage_backend: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    checksum_sha256: str | None = None
    extracted_text_checksum: str | None = None
    extraction_started_at: datetime | None = None
    extraction_completed_at: datetime | None = None
    extraction_error: str | None = None
    ocr_status: str | None = None
    ocr_engine: str | None = None
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


class SourceDocumentExtractionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_document_id: str
    status: str
    extractor_name: str
    extractor_version: str
    mime_type: str | None = None
    page_count: int
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class SourceDocumentChunkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_document_id: str
    extraction_id: str | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    chunk_index: int
    chunk_text: str
    chunk_hash: str
    page_number: int | None = None
    section_label: str | None = None
    token_count: int
    sensitivity_level: str
    source_type: str
    trust_score: int
    embedding_provider: str | None = None
    embedding_model: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class SourceDocumentChunkPageRead(BaseModel):
    items: list[SourceDocumentChunkRead]
    total: int
    page: int
    page_size: int
    pages: int


class KycCitationRead(BaseModel):
    source_document_id: str | None = None
    source_chunk_id: str | None = None
    source_record_id: str | None = None
    label: str
    page_number: int | None = None
    section_label: str | None = None
    excerpt: str
    field_key: str | None = None
    restricted: bool = False
    confidence: int | None = None
    source_route: str | None = None


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
    missing_evidence_note: str | None = None
    conflicts: list[str] = Field(default_factory=list)
    reviewer_notes: list[str] = Field(default_factory=list)
    suggested_follow_up_questions: list[str] = Field(default_factory=list)


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
    reviewer_notes: list[str] = Field(default_factory=list)
    suggested_follow_up_questions: list[str] = Field(default_factory=list)
    retrieved_chunk_ids: list[str] = Field(default_factory=list)
    provider_response_id: str | None = None
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
    lifecycle_status: LifecycleStatus = "Draft"
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
    module: str | None = None
    title: str
    description: str
    previous_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    before_value: dict[str, Any] | None = None
    after_value: dict[str, Any] | None = None
    actor_id: str
    actor_name: str
    performed_by: str | None = None
    performed_by_name: str | None = None
    source_module: str
    source_record_id: str | None = None
    source_record_type: str | None = None
    source_record_route: str | None = None
    metadata: dict[str, Any] | None = None
    event_at: datetime | None = None
    timestamp: datetime | None = None
    is_sensitive: bool = False
    sensitivity_level: str | None = None
    tags: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "active"
    is_system_generated: bool = True
    is_immutable: bool = True
    created_at: datetime
    updated_at: datetime | None = None


class TimelineEventPageRead(BaseModel):
    items: list[TimelineEventRead]
    total: int
    page: int
    page_size: int
    pages: int


class TimelineNoteCreateRequest(BaseModel):
    event_type: str = "manual_note"
    title: str | None = None
    description: str
    event_at: datetime | None = None
    owner_id: str | None = None
    mentions: list[str] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    is_sensitive: bool = False
    sensitivity_level: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("event_type")
    @classmethod
    def event_type_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Event type")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Timeline title", max_length=220)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str) -> str:
        return optional_text(value, "Description", max_length=2000, min_length=3) or value

    @field_validator("owner_id")
    @classmethod
    def owner_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Owner", max_length=36)

    @field_validator("mentions")
    @classmethod
    def mentions_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Mentions", max_items=50)

    @field_validator("tags")
    @classmethod
    def tags_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Tags", max_items=20)


class TimelineEventUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    event_at: datetime | None = None
    is_sensitive: bool | None = None
    sensitivity_level: str | None = None
    tags: list[str] | None = None
    mentions: list[str] | None = None
    attachments: list[dict[str, Any]] | None = None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Timeline title", max_length=220)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Description", max_length=2000, min_length=3)

    @field_validator("tags", "mentions")
    @classmethod
    def string_list_is_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Timeline values", max_items=50) if value is not None else None


class TimelineCommentRead(BaseModel):
    id: str
    timeline_entry_id: str
    author_id: str
    author_name: str
    body: str
    mentions: list[str] = Field(default_factory=list)
    is_sensitive: bool = False
    sensitivity_level: str | None = None
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TimelineCommentPageRead(BaseModel):
    items: list[TimelineCommentRead]
    total: int
    page: int
    page_size: int
    pages: int


class TimelineCommentCreateRequest(BaseModel):
    body: str
    mentions: list[str] = Field(default_factory=list)

    @field_validator("body")
    @classmethod
    def body_is_valid(cls, value: str) -> str:
        return optional_text(value, "Comment", max_length=2000, min_length=1) or value

    @field_validator("mentions")
    @classmethod
    def mentions_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Mentions", max_items=50)


class TimelineCommentUpdateRequest(BaseModel):
    body: str
    mentions: list[str] = Field(default_factory=list)

    @field_validator("body")
    @classmethod
    def body_is_valid(cls, value: str) -> str:
        return optional_text(value, "Comment", max_length=2000, min_length=1) or value

    @field_validator("mentions")
    @classmethod
    def mentions_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Mentions", max_items=50)


class TimelineEventTypeRead(BaseModel):
    id: str
    slug: str
    name: str
    category: str
    module: str
    color_token: str
    display_order: int
    default_visibility: str
    retention_policy_id: str | None = None
    is_active: bool
    is_critical: bool
    critical_rule_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class TimelineEventTypePageRead(BaseModel):
    items: list[TimelineEventTypeRead]
    total: int
    page: int
    page_size: int
    pages: int


class TimelineEventTypeCreateRequest(BaseModel):
    slug: str
    name: str
    category: str = "general"
    module: str = "manual"
    color_token: str = "brand-blue"
    display_order: int = 0
    default_visibility: Literal["public", "restricted"] = "public"
    retention_policy_id: str | None = None
    is_active: bool = True
    is_critical: bool = False
    critical_rule_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Event type")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Event type name", 160)

    @field_validator("category", "module", "color_token")
    @classmethod
    def short_fields_are_valid(cls, value: str) -> str:
        return validate_short_text(value, "Event type field", 80)


class TimelineEventTypeUpdateRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    module: str | None = None
    color_token: str | None = None
    display_order: int | None = None
    default_visibility: Literal["public", "restricted"] | None = None
    retention_policy_id: str | None = None
    is_active: bool | None = None
    is_critical: bool | None = None
    critical_rule_json: dict[str, Any] | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Event type name", 160) if value is not None else None

    @field_validator("category", "module", "color_token")
    @classmethod
    def short_fields_are_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Event type field", 80) if value is not None else None


class TimelineRetentionPolicyRead(BaseModel):
    id: str
    name: str
    entity_type: str
    action: str
    duration_days: int
    reason_template: str
    critical_behavior: str
    schedule_enabled: bool
    schedule_interval_hours: int
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TimelineRetentionPolicyPageRead(BaseModel):
    items: list[TimelineRetentionPolicyRead]
    total: int
    page: int
    page_size: int
    pages: int


class TimelineRetentionPolicyCreateRequest(BaseModel):
    name: str
    entity_type: str = "timeline_entry"
    action: Literal["archive", "restrict", "delete"] = "archive"
    duration_days: int = 1095
    reason_template: str = "Retention policy applied."
    critical_behavior: Literal["tombstone"] = "tombstone"
    schedule_enabled: bool = False
    schedule_interval_hours: int = 24
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Retention policy name", 160)

    @field_validator("duration_days")
    @classmethod
    def duration_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Retention duration", max_value=3650)

    @field_validator("schedule_interval_hours")
    @classmethod
    def schedule_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Schedule interval", max_value=8760)

    @field_validator("reason_template")
    @classmethod
    def reason_is_valid(cls, value: str) -> str:
        return optional_text(value, "Retention reason", max_length=1000, min_length=3) or value


class TimelineRetentionPolicyUpdateRequest(BaseModel):
    name: str | None = None
    entity_type: str | None = None
    action: Literal["archive", "restrict", "delete"] | None = None
    duration_days: int | None = None
    reason_template: str | None = None
    schedule_enabled: bool | None = None
    schedule_interval_hours: int | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Retention policy name", 160) if value is not None else None

    @field_validator("entity_type")
    @classmethod
    def entity_type_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Retention entity type") if value is not None else None

    @field_validator("duration_days")
    @classmethod
    def duration_is_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Retention duration", max_value=3650) if value is not None else None

    @field_validator("schedule_interval_hours")
    @classmethod
    def schedule_is_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Schedule interval", max_value=8760) if value is not None else None


class TimelineRetentionRunRequest(BaseModel):
    reason: str | None = None
    limit: int = 500

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Retention reason", max_length=1000)

    @field_validator("limit")
    @classmethod
    def limit_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Retention limit", max_value=5000)


class TimelineRetentionResultRead(BaseModel):
    policy_id: str
    action: str
    mode: str
    matched_count: int
    affected_count: int
    sample_event_ids: list[str] = Field(default_factory=list)


class TimelineRetentionActionRead(BaseModel):
    id: str
    policy_id: str | None = None
    entity_type: str
    action: str
    mode: str
    status: str
    matched_count: int
    affected_count: int
    reason: str | None = None
    actor_id: str
    actor_name: str
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TimelineRetentionActionPageRead(BaseModel):
    items: list[TimelineRetentionActionRead]
    total: int
    page: int
    page_size: int
    pages: int


class HandoverSummaryCreateRequest(BaseModel):
    selected_sections: list[str] = Field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None
    ownership_change_id: str | None = None

    @field_validator("selected_sections")
    @classmethod
    def sections_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Handover sections", max_items=20)


class HandoverSummaryRead(BaseModel):
    id: str
    account_id: str
    generated_by_id: str
    generated_by_name: str
    ownership_change_id: str | None = None
    selected_sections: list[str] = Field(default_factory=list)
    source_set: list[dict[str, Any]] = Field(default_factory=list)
    redaction_summary: dict[str, Any] = Field(default_factory=dict)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    content: dict[str, Any] = Field(default_factory=dict)
    status: str
    export_metadata: dict[str, Any] = Field(default_factory=dict)
    share_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class HandoverSummaryPageRead(BaseModel):
    items: list[HandoverSummaryRead]
    total: int
    page: int
    page_size: int
    pages: int


class HandoverShareRead(BaseModel):
    summary_id: str
    share_id: str
    internal_share_url: str
    created_at: datetime
    expires_at: datetime | None = None


class TimelineAiSearchRequest(BaseModel):
    query: str
    scopes: list[str] = Field(default_factory=lambda: ["timeline"])
    document_search: bool = False
    source_module: str | None = None
    source_type: str | None = None
    mode: Literal["all", "structured", "semantic"] = "all"
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = 10

    @field_validator("query")
    @classmethod
    def query_is_valid(cls, value: str) -> str:
        return optional_text(value, "Search query", max_length=500, min_length=2) or value

    @field_validator("scopes")
    @classmethod
    def scopes_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Search scopes", max_items=10)

    @field_validator("source_module", "source_type")
    @classmethod
    def source_filters_are_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Search source filter") if value is not None else None

    @field_validator("limit")
    @classmethod
    def limit_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Search limit", max_value=50)


class TimelineAiSearchResultRead(BaseModel):
    id: str
    title: str
    excerpt: str
    event_type: str
    source_module: str
    source_route: str | None = None
    event_at: datetime
    relevance: float
    mode: str


class TimelineAiDocumentResultRead(BaseModel):
    id: str
    source_label: str
    excerpt: str
    source_route: str | None = None


class TimelineAiSearchResponse(BaseModel):
    query: str
    interpreted_intent: str
    mode: str
    confidence: str
    answer: str
    disclaimer: str
    results: list[TimelineAiSearchResultRead]
    document_results: list[TimelineAiDocumentResultRead] = Field(default_factory=list)
    audit_id: str
    can_try_in_kam_ai: bool = True


class AiAssistanceSearchRequest(BaseModel):
    query: str
    account_id: str | None = None
    scopes: list[str] = Field(default_factory=lambda: ["timeline", "opportunities", "governance", "kyc", "signals"])
    document_search: bool = False
    limit: int = 10

    @field_validator("query")
    @classmethod
    def ai_query_is_valid(cls, value: str) -> str:
        return optional_text(value, "AI search query", max_length=500, min_length=2) or value

    @field_validator("scopes")
    @classmethod
    def ai_scopes_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "AI search scopes", max_items=10)

    @field_validator("limit")
    @classmethod
    def ai_limit_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "AI search limit", max_value=50)


class AiAssistanceSourceRead(BaseModel):
    id: str
    account_id: str
    account_name: str
    source_type: str
    title: str
    excerpt: str
    source_route: str | None = None
    event_at: datetime | None = None
    relevance: float = 1


class AiAssistanceSearchResponse(BaseModel):
    query: str
    answer: str
    query_intent: str
    confidence: Literal["high", "medium", "low"]
    disclaimer: str
    source_entries: list[AiAssistanceSourceRead] = Field(default_factory=list)
    document_results: list[TimelineAiDocumentResultRead] = Field(default_factory=list)
    run_id: str | None = None


class AiAccountBriefResponse(BaseModel):
    account_id: str
    title: str
    summary: str
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"]
    disclaimer: str
    run_id: str | None = None


class AiStagePredictionResponse(BaseModel):
    account_id: str
    current_stage: str
    predicted_stage: str
    confidence: int
    factors: list[dict[str, Any]] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    advisory_only: bool = True
    disclaimer: str
    run_id: str | None = None


class AiForecastRequest(BaseModel):
    account_id: str | None = None
    months: int = 6

    @field_validator("months")
    @classmethod
    def forecast_months_are_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Forecast months", max_value=12)


class AiForecastPointRead(BaseModel):
    month: str
    commercial_value: float
    health: int
    open_opportunities: int


class AiForecastResponse(BaseModel):
    title: str
    summary: str
    points: list[AiForecastPointRead]
    highlights: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    disclaimer: str
    run_id: str | None = None


class AiHandoffRequest(BaseModel):
    include_sensitive: bool = False
    focus: str | None = None

    @field_validator("focus")
    @classmethod
    def handoff_focus_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Handoff focus", max_length=240)


class AiHandoffResponse(BaseModel):
    account_id: str
    title: str
    sections: dict[str, list[str]] = Field(default_factory=dict)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    disclaimer: str
    run_id: str | None = None


class AiQueryHistoryRead(BaseModel):
    id: str
    request_type: str
    query: str | None = None
    answer: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    confidence: str | None = None
    status: str
    created_at: datetime
    source_count: int = 0
    run_id: str


class AiQueryHistoryPageRead(BaseModel):
    items: list[AiQueryHistoryRead]
    total: int
    page: int
    page_size: int
    pages: int


class AiVocabularyTermRead(BaseModel):
    id: str
    term: str
    replacement: str | None = None
    description: str | None = None
    is_active: bool = True
    updated_at: datetime | None = None


class AiVocabularyTermRequest(BaseModel):
    term: str
    replacement: str | None = None
    description: str | None = None
    is_active: bool = True

    @field_validator("term")
    @classmethod
    def term_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "AI vocabulary term", 120)

    @field_validator("replacement", "description")
    @classmethod
    def optional_term_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "AI vocabulary text", 500)


class AiSearchFieldsRead(BaseModel):
    fields: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class AiSearchFieldsUpdateRequest(BaseModel):
    fields: list[str]

    @field_validator("fields")
    @classmethod
    def fields_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "AI search fields", max_items=40)


class AiBriefPageRead(BaseModel):
    items: list[AiAccountBriefResponse]
    total: int
    page: int
    page_size: int
    pages: int


class AiBriefFeedbackRequest(BaseModel):
    rating: Literal["helpful", "not_helpful", "neutral"]
    comment: str | None = None

    @field_validator("comment")
    @classmethod
    def feedback_comment_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Feedback comment", 1000)


class AiTimelineNoteRequest(BaseModel):
    title: str | None = None
    description: str | None = None

    @field_validator("title")
    @classmethod
    def note_title_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Timeline note title", 220)

    @field_validator("description")
    @classmethod
    def note_description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Timeline note description", 4000)


class AiStageChangeRead(BaseModel):
    account_id: str
    previous_stage: str
    new_stage: str
    prediction_run_id: str | None = None
    timeline_entry_id: str | None = None
    changed_at: datetime


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


class StakeholderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    reports_to_stakeholder_id: str | None = None
    name: str
    title: str | None = None
    company: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: str
    influence: str
    relationship_strength: str
    sentiment: str
    political_risk: str
    status: str
    notes: str | None = None
    last_interaction_at: datetime | None = None
    is_sensitive: bool
    sensitive_fields_redacted: bool = False
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None


class StakeholderPageRead(BaseModel):
    items: list[StakeholderRead]
    total: int
    page: int
    page_size: int
    pages: int


class StakeholderInteractionRead(BaseModel):
    id: str
    stakeholder_id: str
    account_id: str
    engagement_id: str | None = None
    interaction_type: str
    interaction_date: datetime
    summary: str | None = None
    outcome: str | None = None
    sentiment_after: str | None = None
    relationship_strength_after: str | None = None
    sensitive_fields_redacted: bool = False
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class StakeholderInteractionPageRead(BaseModel):
    items: list[StakeholderInteractionRead]
    total: int
    page: int
    page_size: int
    pages: int


class StakeholderInteractionCreateRequest(BaseModel):
    interaction_type: str = "note"
    interaction_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    summary: str
    outcome: str | None = None
    sentiment_after: StakeholderSentiment | None = None
    relationship_strength_after: StakeholderRelationshipStrength | None = None

    @field_validator("interaction_type")
    @classmethod
    def interaction_type_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Interaction type", max_length=80)

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str) -> str:
        text = require_text(value, "Interaction summary")
        if len(text) > 4000:
            raise ValueError("Interaction summary must be 4000 characters or fewer.")
        return text

    @field_validator("outcome")
    @classmethod
    def outcome_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Interaction outcome")


class StakeholderCoverageGapRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    rule_key: str
    severity: str
    title: str
    description: str
    evidence: dict[str, Any]
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class StakeholderOrgChartNodeRead(BaseModel):
    id: str
    name: str
    title: str | None = None
    role: str | None = None
    influence_level: str | None = None
    relationship_strength: str | None = None
    sentiment: str | None = None
    political_risk: str | None = None
    parent_id: str | None = None
    sensitive_fields_redacted: bool = False


class StakeholderOrgChartEdgeRead(BaseModel):
    source: str
    target: str
    relationship_type: str


class StakeholderOrgChartRead(BaseModel):
    nodes: list[StakeholderOrgChartNodeRead]
    edges: list[StakeholderOrgChartEdgeRead]


class StakeholderCreateRequest(BaseModel):
    engagement_id: str | None = None
    reports_to_stakeholder_id: str | None = None
    name: str
    title: str | None = None
    company: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: StakeholderRole
    influence: StakeholderInfluence = "medium"
    relationship_strength: StakeholderRelationshipStrength = "unknown"
    sentiment: StakeholderSentiment = "neutral"
    political_risk: StakeholderPoliticalRisk = "unknown"
    status: StakeholderStatus = "active"
    notes: str | None = None
    last_interaction_at: datetime | None = None
    is_sensitive: bool = False

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Stakeholder name")

    @field_validator("title", "company")
    @classmethod
    def optional_profile_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Stakeholder profile field", max_length=180)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value)

    @field_validator("role")
    @classmethod
    def role_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Stakeholder role")

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Stakeholder notes")

    @field_validator("engagement_id", "reports_to_stakeholder_id")
    @classmethod
    def optional_id_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Linked record", max_length=36)


class StakeholderUpdateRequest(BaseModel):
    engagement_id: str | None = None
    reports_to_stakeholder_id: str | None = None
    name: str | None = None
    title: str | None = None
    company: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: StakeholderRole | None = None
    influence: StakeholderInfluence | None = None
    relationship_strength: StakeholderRelationshipStrength | None = None
    sentiment: StakeholderSentiment | None = None
    political_risk: StakeholderPoliticalRisk | None = None
    status: StakeholderStatus | None = None
    notes: str | None = None
    last_interaction_at: datetime | None = None
    is_sensitive: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Stakeholder name") if value is not None else None

    @field_validator("title", "company")
    @classmethod
    def optional_profile_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Stakeholder profile field", max_length=180)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value)

    @field_validator("role")
    @classmethod
    def role_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Stakeholder role") if value is not None else None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Stakeholder notes")

    @field_validator("engagement_id", "reports_to_stakeholder_id")
    @classmethod
    def optional_id_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Linked record", max_length=36)


class StakeholderRoleConfigRead(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    in_use_count: int = 0


class StakeholderRoleConfigPageRead(BaseModel):
    items: list[StakeholderRoleConfigRead]
    total: int
    page: int
    page_size: int
    pages: int


class StakeholderRoleConfigCreateRequest(BaseModel):
    slug: str
    name: str
    description: str | None = None
    is_active: bool = True
    display_order: int = 0

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Stakeholder role slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Stakeholder role", 160)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Stakeholder role description", 1000)


class StakeholderRoleConfigUpdateRequest(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    display_order: int | None = None

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Stakeholder role slug") if value is not None else None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Stakeholder role", 160) if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Stakeholder role description", 1000)


class StakeholderGapRuleRead(BaseModel):
    id: str
    rule_key: str
    title: str
    description: str
    severity: str
    condition_json: dict[str, Any]
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class StakeholderGapRulePageRead(BaseModel):
    items: list[StakeholderGapRuleRead]
    total: int
    page: int
    page_size: int
    pages: int


class StakeholderGapRuleCreateRequest(BaseModel):
    rule_key: str
    title: str
    description: str
    severity: SignalSeverity = "warning"
    condition_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    display_order: int = 0

    @field_validator("rule_key")
    @classmethod
    def rule_key_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Gap rule key")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Gap rule title", 220)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Gap rule description", 2000)


class StakeholderGapRuleUpdateRequest(BaseModel):
    rule_key: str | None = None
    title: str | None = None
    description: str | None = None
    severity: SignalSeverity | None = None
    condition_json: dict[str, Any] | None = None
    is_active: bool | None = None
    display_order: int | None = None

    @field_validator("rule_key")
    @classmethod
    def rule_key_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Gap rule key") if value is not None else None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Gap rule title", 220) if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Gap rule description", 2000) if value is not None else None


class AccountPlanActionRead(BaseModel):
    id: str
    account_plan_id: str
    account_id: str
    title: str
    owner_id: str | None = None
    owner_name: str
    owner_email: EmailStr | None = None
    due_at: datetime
    status: str
    priority: str
    success_criteria: list[str] = Field(default_factory=list)
    completed_at: datetime | None = None
    completed_by_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class AccountPlanActionRequest(BaseModel):
    id: str | None = None
    title: str
    owner_id: str
    due_at: datetime
    status: str = "open"
    priority: TaskPriority = "medium"
    success_criteria: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Plan action", 220)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Plan action success criteria", max_items=20)


class AccountPlanRead(BaseModel):
    id: str
    account_id: str
    retention_focus: str | None = None
    growth_focus: str | None = None
    risks: list[str] = Field(default_factory=list)
    opportunities: str | None = None
    commitments: list[str] = Field(default_factory=list)
    service_gaps: list[str] = Field(default_factory=list)
    review_cadence: str | None = None
    next_review_at: datetime | None = None
    status: str
    created_by_id: str | None = None
    created_by_name: str
    updated_by_id: str | None = None
    updated_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    actions: list[AccountPlanActionRead] = Field(default_factory=list)


class AccountPlanVersionRead(BaseModel):
    id: str
    account_plan_id: str
    account_id: str
    version: int
    snapshot_json: dict[str, Any]
    change_summary: str | None = None
    actor_id: str | None = None
    actor_name: str
    created_at: datetime


class AccountPlanVersionPageRead(BaseModel):
    items: list[AccountPlanVersionRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountPlanUpsertRequest(BaseModel):
    retention_focus: str | None = None
    growth_focus: str | None = None
    risks: list[str] = Field(default_factory=list)
    opportunities: str | None = None
    commitments: list[str] = Field(default_factory=list)
    service_gaps: list[str] = Field(default_factory=list)
    review_cadence: str | None = None
    next_review_at: datetime | None = None
    status: str = "draft"
    actions: list[AccountPlanActionRequest] = Field(default_factory=list)
    change_summary: str | None = None

    @field_validator("retention_focus", "growth_focus", "opportunities")
    @classmethod
    def long_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Account plan text", 4000)

    @field_validator("review_cadence", "status")
    @classmethod
    def short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Account plan field", max_length=80) if value is not None else None

    @field_validator("risks", "commitments", "service_gaps")
    @classmethod
    def string_lists_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Account plan list", max_items=40)

    @field_validator("change_summary")
    @classmethod
    def change_summary_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Change summary", 1000)


class ServiceCatalogItemRead(BaseModel):
    id: str
    slug: str
    name: str
    category: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    in_use_count: int = 0


class ServiceCatalogPageRead(BaseModel):
    items: list[ServiceCatalogItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class ServiceCatalogItemCreateRequest(BaseModel):
    slug: str
    name: str
    category: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True
    display_order: int = 0

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Service slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Service name", 180)

    @field_validator("category")
    @classmethod
    def category_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Service category", max_length=120)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Service description", 1000)

    @field_validator("tags")
    @classmethod
    def tags_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Service tags", max_items=20)


class ServiceCatalogItemUpdateRequest(BaseModel):
    slug: str | None = None
    name: str | None = None
    category: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    is_active: bool | None = None
    display_order: int | None = None

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Service slug") if value is not None else None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Service name", 180) if value is not None else None

    @field_validator("category")
    @classmethod
    def category_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Service category", max_length=120)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Service description", 1000)

    @field_validator("tags")
    @classmethod
    def tags_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Service tags", max_items=20) if value is not None else None


class ServiceAdjacencyRuleRequest(BaseModel):
    source_service_id: str
    target_service_id: str
    relevance_score: int = 70
    rationale: str
    is_active: bool = True

    @field_validator("relevance_score")
    @classmethod
    def relevance_is_valid(cls, value: int) -> int:
        return validate_percent(value, "Relevance score")

    @field_validator("rationale")
    @classmethod
    def rationale_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Adjacency rationale", 2000)


class ServiceAdjacencyRuleRead(BaseModel):
    id: str
    source_service_id: str
    source_service_name: str
    target_service_id: str
    target_service_name: str
    relevance_score: int
    rationale: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ServiceAdjacencyUpdateRequest(BaseModel):
    rules: list[ServiceAdjacencyRuleRequest] = Field(default_factory=list)


class AccountWhitespaceItemRequest(BaseModel):
    engagement_id: str | None = None
    service_id: str
    coverage_status: str = "unknown"
    notes: str | None = None
    source: str = "manual"

    @field_validator("coverage_status")
    @classmethod
    def status_is_valid(cls, value: str) -> str:
        status_value = validate_slug(value, "Coverage status")
        if status_value not in {"active", "potential", "not_relevant", "unknown"}:
            raise ValueError("Coverage status must be active, potential, not_relevant, or unknown.")
        return status_value

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Whitespace notes", 2000)

    @field_validator("source")
    @classmethod
    def source_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Whitespace source")


class AccountWhitespaceUpdateRequest(BaseModel):
    items: list[AccountWhitespaceItemRequest] = Field(default_factory=list)


class AccountWhitespaceItemRead(BaseModel):
    id: str
    account_id: str
    engagement_id: str | None = None
    service_id: str
    service_name: str
    coverage_status: str
    notes: str | None = None
    source: str
    created_at: datetime
    updated_at: datetime


class ServiceRecommendationRead(BaseModel):
    id: str
    account_id: str
    source_service_id: str | None = None
    source_service_name: str | None = None
    target_service_id: str
    target_service_name: str
    relevance_score: int
    rationale: str
    status: str
    source_context: str
    created_opportunity_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ServiceRecommendationPageRead(BaseModel):
    items: list[ServiceRecommendationRead]
    total: int
    page: int
    page_size: int
    pages: int


class RecommendationOpportunityCreateRequest(BaseModel):
    owner_id: str
    target_date: datetime
    value: float = 0
    currency: str = "USD"
    next_step: str = "Validate adjacent service fit with client stakeholders."
    confirm: bool = False

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: float) -> float:
        return validate_non_negative(value, "Opportunity value")

    @field_validator("currency")
    @classmethod
    def currency_is_valid(cls, value: str) -> str:
        return validate_currency(value)

    @field_validator("next_step")
    @classmethod
    def next_step_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Next step", 1000)


class RenewalProfileRead(BaseModel):
    id: str
    account_id: str
    engagement_id: str
    renewal_readiness: str
    renewal_risk: str
    confidence: int
    commercial_exposure: float
    commercial_exposure_currency: str
    owner_id: str | None = None
    owner_name: str | None = None
    source_type: str
    source_citation: str | None = None
    manual_override_reason: str | None = None
    sow_start_date: datetime | None = None
    sow_end_date: datetime | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool = False
    days_to_expiry: int | None = None
    renewal_status: str = "unknown"
    updated_at: datetime


class RenewalProfilePageRead(BaseModel):
    items: list[RenewalProfileRead]
    total: int
    page: int
    page_size: int
    pages: int


class RenewalProfileUpdateRequest(BaseModel):
    renewal_readiness: str | None = None
    renewal_risk: RenewalRisk | None = None
    confidence: int | None = None
    commercial_exposure: float | None = None
    commercial_exposure_currency: str | None = None
    owner_id: str | None = None
    source_type: str | None = None
    source_citation: str | None = None
    manual_override_reason: str | None = None
    renewal_date: datetime | None = None
    notice_deadline: datetime | None = None
    notice_period_days: int | None = None
    auto_renewal: bool | None = None

    @field_validator("confidence")
    @classmethod
    def confidence_is_valid(cls, value: int | None) -> int | None:
        return validate_percent(value, "Confidence") if value is not None else None

    @field_validator("commercial_exposure")
    @classmethod
    def exposure_is_valid(cls, value: float | None) -> float | None:
        return validate_non_negative(value, "Commercial exposure") if value is not None else None

    @field_validator("commercial_exposure_currency")
    @classmethod
    def currency_is_valid(cls, value: str | None) -> str | None:
        return validate_currency(value) if value is not None else None

    @field_validator("source_type", "renewal_readiness")
    @classmethod
    def source_text_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Renewal field") if value is not None else None

    @field_validator("source_citation", "manual_override_reason")
    @classmethod
    def renewal_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Renewal text", 2000)


class RetentionPlanActionRead(BaseModel):
    id: str
    retention_plan_id: str
    milestone_id: str | None = None
    account_id: str
    engagement_id: str | None = None
    title: str
    owner_id: str | None = None
    owner_name: str
    owner_email: EmailStr | None = None
    due_at: datetime
    status: str
    priority: str
    success_criteria: list[str] = Field(default_factory=list)
    future_task_id: str | None = None
    completed_at: datetime | None = None
    completed_by_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class RetentionPlanMilestoneRead(BaseModel):
    id: str
    retention_plan_id: str
    title: str
    due_at: datetime
    status: str
    enforce_action_due_dates: bool
    created_at: datetime
    updated_at: datetime


class RetentionPlanRead(BaseModel):
    id: str
    account_id: str
    engagement_id: str | None = None
    plan_type: str
    status: str
    title: str
    summary: str | None = None
    owner_id: str | None = None
    owner_name: str
    owner_email: EmailStr | None = None
    renewal_milestone_at: datetime | None = None
    success_criteria: list[str] = Field(default_factory=list)
    source_context: str | None = None
    completed_at: datetime | None = None
    created_by_id: str | None = None
    created_by_name: str
    updated_by_id: str | None = None
    updated_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    milestones: list[RetentionPlanMilestoneRead] = Field(default_factory=list)
    actions: list[RetentionPlanActionRead] = Field(default_factory=list)


class RetentionPlanPageRead(BaseModel):
    items: list[RetentionPlanRead]
    total: int
    page: int
    page_size: int
    pages: int


class RetentionPlanMilestoneRequest(BaseModel):
    id: str | None = None
    title: str
    due_at: datetime
    status: str = "open"
    enforce_action_due_dates: bool = True

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Milestone title", 220)


class RetentionPlanActionRequest(BaseModel):
    id: str | None = None
    milestone_id: str | None = None
    title: str
    owner_id: str
    due_at: datetime
    status: str = "open"
    priority: TaskPriority = "medium"
    success_criteria: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Retention action", 220)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Retention action success criteria", max_items=20)


class RetentionPlanCreateRequest(BaseModel):
    engagement_id: str | None = None
    plan_type: str = "retention"
    title: str
    summary: str | None = None
    owner_id: str
    renewal_milestone_at: datetime | None = None
    success_criteria: list[str] = Field(default_factory=list)
    source_context: str | None = None
    milestones: list[RetentionPlanMilestoneRequest] = Field(default_factory=list)
    actions: list[RetentionPlanActionRequest] = Field(default_factory=list)

    @field_validator("plan_type", "source_context")
    @classmethod
    def slug_text_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Retention plan field") if value is not None else None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Retention plan title", 220)

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Retention plan summary", 4000)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Retention plan success criteria", max_items=30)


class RetentionPlanUpdateRequest(BaseModel):
    engagement_id: str | None = None
    plan_type: str | None = None
    status: str | None = None
    title: str | None = None
    summary: str | None = None
    owner_id: str | None = None
    renewal_milestone_at: datetime | None = None
    success_criteria: list[str] | None = None
    source_context: str | None = None
    milestones: list[RetentionPlanMilestoneRequest] | None = None
    actions: list[RetentionPlanActionRequest] | None = None

    @field_validator("plan_type", "source_context", "status")
    @classmethod
    def slug_text_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Retention plan field") if value is not None else None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Retention plan title", 220) if value is not None else None

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Retention plan summary", 4000)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Retention plan success criteria", max_items=30) if value is not None else None


class RetentionRecommendationRead(BaseModel):
    id: str
    account_id: str
    engagement_id: str | None = None
    title: str
    rationale: str
    severity: str
    recommended_action: str
    source_context: str
    status: str
    created_task_id: str | None = None
    created_at: datetime
    updated_at: datetime


class RetentionRecommendationTaskCreateRequest(BaseModel):
    recommendation_ids: list[str] = Field(default_factory=list)
    owner_id: str
    due_at: datetime
    confirm: bool = False

    @field_validator("recommendation_ids")
    @classmethod
    def recommendation_ids_are_valid(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("At least one recommendation must be selected.")
        if len(set(value)) != len(value):
            raise ValueError("Recommendation IDs must not contain duplicates.")
        return value


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
    create_task: bool = True

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
    meeting_artifact_id: str | None = None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str) -> str:
        return validate_short_text(value, "Notes", 5000)


class OpportunityTypeRead(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    in_use_count: int = 0


class OpportunityTypePageRead(BaseModel):
    items: list[OpportunityTypeRead]
    total: int
    page: int
    page_size: int
    pages: int


class OpportunityTypeCreateRequest(BaseModel):
    slug: str
    name: str
    description: str | None = None
    display_order: int = 0
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Opportunity type slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Opportunity type", 160)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Opportunity type description", 1000)


class OpportunityTypeUpdateRequest(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    display_order: int | None = None
    is_active: bool | None = None

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Opportunity type slug") if value is not None else None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Opportunity type", 160) if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Opportunity type description", 1000)


class OpportunityStageDefinitionRead(BaseModel):
    id: str
    slug: str
    name: OpportunityStage
    is_terminal: bool
    requires_outcome_reason: bool = False
    is_active: bool
    display_order: int


class OpportunityStageDefinitionCreateRequest(BaseModel):
    slug: str
    name: str
    is_terminal: bool = False
    requires_outcome_reason: bool = False
    is_active: bool = True
    display_order: int = 0

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Opportunity stage slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Opportunity stage", 120)


class OpportunityStageDefinitionUpdateRequest(BaseModel):
    slug: str | None = None
    name: str | None = None
    is_terminal: bool | None = None
    requires_outcome_reason: bool | None = None
    is_active: bool | None = None
    display_order: int | None = None

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Opportunity stage slug") if value is not None else None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Opportunity stage", 120) if value is not None else None


class OpportunityStageTransitionConfigRequest(BaseModel):
    from_stage: str
    to_stage: str
    is_active: bool = True
    requires_reason: bool = False

    @field_validator("from_stage", "to_stage")
    @classmethod
    def stage_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Opportunity stage", 120)


class OpportunityStageTransitionConfigRead(BaseModel):
    id: str
    from_stage: str
    to_stage: str
    is_active: bool
    requires_reason: bool
    created_at: datetime
    updated_at: datetime


class OpportunityStageTransitionsUpdateRequest(BaseModel):
    transitions: list[OpportunityStageTransitionConfigRequest] = Field(default_factory=list)


class OpportunityActionItemRead(BaseModel):
    id: str
    opportunity_id: str
    title: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: EmailStr | None = None
    due_at: datetime
    due_date: datetime
    status: OpportunityActionItemStatus
    priority: EscalationPriority
    notes: str | None = None
    future_task_id: str | None = None
    completed_at: datetime | None = None
    completed_by_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class OpportunityActionItemPageRead(BaseModel):
    items: list[OpportunityActionItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class OpportunityActionItemCreateRequest(BaseModel):
    title: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: EmailStr | None = None
    due_at: datetime | None = None
    due_date: datetime | None = None
    status: OpportunityActionItemStatus = "open"
    priority: EscalationPriority = "medium"
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Action item", 220)

    @field_validator("owner_name")
    @classmethod
    def owner_name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Action owner", 160) if value is not None else None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Action item notes", 2000)

    @model_validator(mode="after")
    def due_date_is_present(self) -> "OpportunityActionItemCreateRequest":
        if not (self.due_at or self.due_date):
            raise ValueError("Action item due date is required.")
        return self


class OpportunityActionItemUpdateRequest(BaseModel):
    title: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: EmailStr | None = None
    due_at: datetime | None = None
    due_date: datetime | None = None
    status: OpportunityActionItemStatus | None = None
    priority: EscalationPriority | None = None
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Action item", 220) if value is not None else None

    @field_validator("owner_name")
    @classmethod
    def owner_name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Action owner", 160) if value is not None else None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Action item notes", 2000)


class OpportunityDecisionRead(BaseModel):
    id: str
    opportunity_id: str
    decision_text: str
    owner_id: str | None = None
    owner_name: str | None = None
    timeline_entry_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime


class OpportunityDecisionPageRead(BaseModel):
    items: list[OpportunityDecisionRead]
    total: int
    page: int
    page_size: int
    pages: int


class OpportunityDecisionCreateRequest(BaseModel):
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


class OpportunityStageHistoryRead(BaseModel):
    id: str
    opportunity_id: str
    account_id: str
    engagement_id: str | None = None
    before_stage: OpportunityStage | None = None
    after_stage: OpportunityStage
    actor_id: str | None = None
    actor_name: str
    reason: str | None = None
    timeline_entry_id: str | None = None
    created_at: datetime


class OpportunityRead(BaseModel):
    id: str
    account_id: str
    account_name: str
    engagement_id: str | None = None
    engagement_name: str | None = None
    type_id: str
    type_name: str
    type_slug: str
    service_line: str
    owner_id: str | None = None
    owner_name: str
    owner_email: EmailStr | None = None
    name: str
    value: float
    estimated_value: float
    currency: str
    stage: OpportunityStage
    next_step: str
    target_date: datetime
    close_date: datetime
    source_context: str | None = None
    source_record_id: str | None = None
    source_record_type: str | None = None
    source_record_route: str | None = None
    outcome_reason: str | None = None
    archived_at: datetime | None = None
    archived_by_id: str | None = None
    archived_by_name: str | None = None
    archive_reason: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    updated_by_id: str | None = None
    updated_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    stage_history: list[OpportunityStageHistoryRead] = Field(default_factory=list)
    decisions: list[OpportunityDecisionRead] = Field(default_factory=list)
    action_items: list[OpportunityActionItemRead] = Field(default_factory=list)


class OpportunityPipelineTotalsRead(BaseModel):
    open_count: int
    open_value: float
    won_value: float
    total_count: int
    total_value: float
    average_value: float
    stage_counts: dict[str, int] = Field(default_factory=dict)
    stage_values: dict[str, float] = Field(default_factory=dict)


class OpportunityPageRead(BaseModel):
    items: list[OpportunityRead]
    total: int
    page: int
    page_size: int
    pages: int
    totals: OpportunityPipelineTotalsRead


class OpportunityCreateRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    type_id: str
    owner_id: str
    name: str
    service_line: str
    value: float
    currency: str = "USD"
    stage: OpportunityStage = "Identified"
    next_step: str
    target_date: datetime
    source_context: str | None = "manual"
    source_record_id: str | None = None
    source_record_type: str | None = None
    source_record_route: str | None = None
    outcome_reason: str | None = None
    action_items: list[OpportunityActionItemCreateRequest] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Opportunity name", 220)

    @field_validator("service_line")
    @classmethod
    def service_line_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Service line", 160)

    @field_validator("next_step")
    @classmethod
    def next_step_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Next step", 1000)

    @field_validator("currency")
    @classmethod
    def currency_is_valid(cls, value: str) -> str:
        return validate_currency(value)

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: float) -> float:
        return validate_non_negative(value, "Opportunity value")

    @field_validator("source_context", "source_record_type")
    @classmethod
    def source_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Source context", 160)

    @field_validator("source_record_route")
    @classmethod
    def route_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Source route", 500)

    @field_validator("outcome_reason")
    @classmethod
    def outcome_reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Outcome reason", 2000)


class OpportunityUpdateRequest(BaseModel):
    engagement_id: str | None = None
    type_id: str | None = None
    owner_id: str | None = None
    name: str | None = None
    service_line: str | None = None
    value: float | None = None
    currency: str | None = None
    stage: OpportunityStage | None = None
    next_step: str | None = None
    target_date: datetime | None = None
    source_context: str | None = None
    source_record_id: str | None = None
    source_record_type: str | None = None
    source_record_route: str | None = None
    outcome_reason: str | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Opportunity name", 220) if value is not None else None

    @field_validator("service_line")
    @classmethod
    def service_line_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Service line", 160) if value is not None else None

    @field_validator("next_step")
    @classmethod
    def next_step_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Next step", 1000) if value is not None else None

    @field_validator("currency")
    @classmethod
    def currency_is_valid(cls, value: str | None) -> str | None:
        return validate_currency(value) if value is not None else None

    @field_validator("value")
    @classmethod
    def value_is_valid(cls, value: float | None) -> float | None:
        return validate_non_negative(value, "Opportunity value") if value is not None else None

    @field_validator("source_context", "source_record_type")
    @classmethod
    def source_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Source context", 160)

    @field_validator("source_record_route")
    @classmethod
    def route_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Source route", 500)

    @field_validator("outcome_reason")
    @classmethod
    def outcome_reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Outcome reason", 2000)


class OpportunityStageTransitionRequest(BaseModel):
    stage: OpportunityStage
    reason: str | None = None
    outcome_reason: str | None = None

    @field_validator("reason", "outcome_reason")
    @classmethod
    def reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Stage reason", 2000)


class OpportunityStageTransitionRead(BaseModel):
    opportunity: OpportunityRead
    history: OpportunityStageHistoryRead


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


class PlaybookTemplateActivityInput(BaseModel):
    title: str
    description: str | None = None
    owner_rule: PlaybookOwnerRule = "account_primary_am"
    due_offset_days: int = Field(default=7, ge=0, le=365)
    priority: TaskPriority = "medium"
    success_criteria: list[str] = Field(default_factory=list)
    skip_allowed: bool = True
    requires_evidence: bool = False
    sort_order: int = Field(default=0, ge=0, le=10000)

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Activity title", 220)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Activity description", 4000)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Activity success criteria", max_items=20)


class PlaybookTemplateActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: str
    title: str
    description: str | None = None
    owner_rule: str
    due_offset_days: int
    priority: str
    success_criteria: list[str] = Field(default_factory=list)
    skip_allowed: bool
    requires_evidence: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PlaybookTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    objective: str
    description: str | None = None
    signal_types: list[str] = Field(default_factory=list)
    weak_metrics: list[str] = Field(default_factory=list)
    default_owner_rule: str
    due_date_rule: dict[str, Any] = Field(default_factory=dict)
    success_criteria: list[str] = Field(default_factory=list)
    skip_rules: list[str] = Field(default_factory=list)
    version: int
    is_active: bool
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
    activities: list[PlaybookTemplateActivityRead] = Field(default_factory=list)
    custom_field_values: dict[str, Any] = Field(default_factory=dict)


class PlaybookTemplatePageRead(BaseModel):
    items: list[PlaybookTemplateRead]
    total: int
    page: int
    page_size: int
    pages: int


class PlaybookTemplateCreateRequest(BaseModel):
    slug: str | None = None
    name: str
    objective: str
    description: str | None = None
    signal_types: list[str] = Field(default_factory=list)
    weak_metrics: list[str] = Field(default_factory=list)
    default_owner_rule: PlaybookOwnerRule = "account_primary_am"
    due_date_rule: dict[str, Any] = Field(default_factory=lambda: {"basis": "execution_date", "offset_days": 7})
    success_criteria: list[str] = Field(default_factory=list)
    skip_rules: list[str] = Field(default_factory=list)
    activities: list[PlaybookTemplateActivityInput] = Field(default_factory=list)
    is_active: bool = True
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Playbook name", 180)

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Playbook slug") if value is not None else None

    @field_validator("objective")
    @classmethod
    def objective_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Playbook objective", 2000)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Playbook description", 4000)

    @field_validator("signal_types", "weak_metrics", "success_criteria", "skip_rules")
    @classmethod
    def string_lists_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Playbook list", max_items=30)

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}

    @model_validator(mode="after")
    def template_is_complete(self) -> "PlaybookTemplateCreateRequest":
        if not self.activities:
            raise ValueError("At least one activity is required.")
        if not self.success_criteria:
            raise ValueError("At least one success criterion is required.")
        if not self.due_date_rule:
            raise ValueError("Due-date rule is required.")
        return self


class PlaybookTemplateUpdateRequest(BaseModel):
    slug: str | None = None
    name: str | None = None
    objective: str | None = None
    description: str | None = None
    signal_types: list[str] | None = None
    weak_metrics: list[str] | None = None
    default_owner_rule: PlaybookOwnerRule | None = None
    due_date_rule: dict[str, Any] | None = None
    success_criteria: list[str] | None = None
    skip_rules: list[str] | None = None
    activities: list[PlaybookTemplateActivityInput] | None = None
    is_active: bool | None = None
    custom_field_values: dict[str, Any] | None = Field(default=None, description="Full replacement Field Builder values keyed by field_key.")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Playbook name", 180) if value is not None else None

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Playbook slug") if value is not None else None

    @field_validator("objective")
    @classmethod
    def objective_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Playbook objective", 2000) if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Playbook description", 4000)

    @field_validator("signal_types", "weak_metrics", "success_criteria", "skip_rules")
    @classmethod
    def optional_string_lists_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Playbook list", max_items=30) if value is not None else None

    @field_validator("custom_field_values")
    @classmethod
    def optional_custom_field_keys_are_valid(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()} if value is not None else None


class PlaybookExecutionRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    source_signal_id: str | None = None
    source_signal_type: str | None = None
    source_metric: str | None = None
    confirmed: bool = True
    skipped_activity_ids: list[str] = Field(default_factory=list)
    skip_reasons: dict[str, str] = Field(default_factory=dict)

    @field_validator("source_signal_type", "source_metric")
    @classmethod
    def optional_signal_context_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Signal context", max_length=120)

    @field_validator("skip_reasons")
    @classmethod
    def skip_reasons_are_valid(cls, value: dict[str, str]) -> dict[str, str]:
        return {validate_short_text(key, "Activity id", 120): validate_short_text(reason, "Skip reason", 500) for key, reason in value.items()}


class TaskEvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    evidence_type: str
    title: str | None = None
    body: str | None = None
    url: str | None = None
    file_name: str | None = None
    file_mime_type: str | None = None
    file_size_bytes: int | None = None
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    playbook_execution_id: str | None = None
    template_activity_id: str | None = None
    source_type: str
    source_record_id: str | None = None
    source_metric: str | None = None
    title: str
    description: str | None = None
    owner_id: str | None = None
    owner_name: str
    due_at: datetime
    status: str
    priority: str
    notes: str | None = None
    outcome: str | None = None
    success_criteria: list[str] = Field(default_factory=list)
    requires_evidence: bool
    skipped_reason: str | None = Field(default=None, validation_alias=AliasChoices("skipped_reason", "skip_reason"))
    completed_at: datetime | None = None
    completed_by_id: str | None = None
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
    evidence: list[TaskEvidenceRead] = Field(default_factory=list)
    custom_field_values: dict[str, Any] = Field(default_factory=dict)


class TaskPageRead(BaseModel):
    items: list[TaskRead]
    total: int
    page: int
    page_size: int
    pages: int


class PlaybookExecutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: str | None = None
    template_name_snapshot: str
    template_version_snapshot: int
    account_id: str
    engagement_id: str | None = None
    source_signal_id: str | None = None
    source_signal_type: str | None = None
    source_metric: str | None = None
    status: str
    skipped_activity_ids: list[str] = Field(default_factory=list)
    skip_reasons: dict[str, str] = Field(default_factory=dict)
    created_by_id: str | None = None
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    tasks: list[TaskRead] = Field(default_factory=list)


class TaskCreateRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    title: str
    description: str | None = None
    owner_id: str
    due_at: datetime
    status: TaskStatus = "open"
    priority: TaskPriority = "medium"
    notes: str | None = None
    outcome: str | None = None
    source_type: str = "manual"
    source_record_id: str | None = None
    source_metric: str | None = None
    success_criteria: list[str] = Field(default_factory=list)
    requires_evidence: bool = False
    custom_field_values: dict[str, Any] = Field(default_factory=dict, description="Field Builder values keyed by field_key.")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Task title", 220)

    @field_validator("status")
    @classmethod
    def status_is_valid(cls, value: str) -> str:
        return normalize_task_status(value)

    @field_validator("description", "notes", "outcome")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Task text", 4000)

    @field_validator("source_type", "source_metric")
    @classmethod
    def optional_short_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Task source", max_length=120) if value is not None else None

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Task success criteria", max_items=20)

    @field_validator("custom_field_values")
    @classmethod
    def custom_field_keys_are_valid(cls, value: dict[str, Any]) -> dict[str, Any]:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()}


class TaskUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    description: str | None = None
    owner_id: str | None = None
    due_at: datetime | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    notes: str | None = None
    outcome: str | None = None
    skipped_reason: str | None = Field(default=None, validation_alias=AliasChoices("skipped_reason", "skip_reason"))
    success_criteria: list[str] | None = None
    requires_evidence: bool | None = None
    custom_field_values: dict[str, Any] | None = Field(default=None, description="Full replacement Field Builder values keyed by field_key.")

    @field_validator("title")
    @classmethod
    def title_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Task title", 220) if value is not None else None

    @field_validator("status")
    @classmethod
    def status_is_valid(cls, value: str | None) -> str | None:
        return normalize_task_status(value) if value is not None else None

    @field_validator("description", "notes", "outcome", "skipped_reason")
    @classmethod
    def text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Task text", 4000)

    @field_validator("success_criteria")
    @classmethod
    def success_criteria_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Task success criteria", max_items=20) if value is not None else None

    @field_validator("custom_field_values")
    @classmethod
    def optional_custom_field_keys_are_valid(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return {validate_slug(key, "Custom field key"): item for key, item in value.items()} if value is not None else None


class RecommendedPlaybookRead(BaseModel):
    template: PlaybookTemplateRead
    rationale: str
    match_score: int
    matched_signal_types: list[str] = Field(default_factory=list)
    matched_metrics: list[str] = Field(default_factory=list)


class CalendarItemRead(BaseModel):
    id: str
    kind: str
    title: str
    detail: str
    account_id: str | None = None
    account_name: str
    engagement_id: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    date: datetime
    status: str
    priority: str | None = None
    source_route: str | None = None
    source_record_id: str | None = None
    source_record_type: str | None = None


class CalendarItemPageRead(BaseModel):
    items: list[CalendarItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class IntegrationConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    name: str | None = None
    enabled: bool
    status: str
    auth_type: str
    settings_json: dict = Field(default_factory=dict)
    credential_status: dict[str, Any] = Field(default_factory=dict)
    scopes: list[str] = Field(default_factory=list)
    token_expires_at: datetime | None = None
    last_tested_at: datetime | None = None
    last_test_status: str | None = None
    failure_count: int = 0
    next_retry_at: datetime | None = None
    last_synced_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class UserFathomConnectionRead(BaseModel):
    id: str | None = None
    provider: str = "fathom"
    enabled: bool = False
    status: str = "configuration_required"
    auth_type: str = "api_key"
    credential_status: dict[str, Any] = Field(default_factory=dict)
    settings_json: dict[str, Any] = Field(default_factory=dict)
    last_synced_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UserFathomConnectionUpdateRequest(BaseModel):
    enabled: bool = True
    api_key: str | None = Field(default=None, description="Personal Fathom API key. Existing key is preserved when omitted.")
    settings_json: dict[str, Any] | None = None

    @field_validator("api_key")
    @classmethod
    def api_key_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Fathom API key", max_length=1000)


class MeetingArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    provider: str
    external_id: str | None = None
    title: str
    summary: str | None = None
    action_items: list[str] = Field(default_factory=list)
    meeting_url: str | None = None
    source_link: str | None = None
    occurred_at: datetime | None = None
    scheduled_at: datetime | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    linked_object_type: str | None = None
    linked_object_id: str | None = None
    status: str
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MeetingArtifactPageRead(BaseModel):
    items: list[MeetingArtifactRead]
    total: int
    page: int
    page_size: int
    pages: int


class MeetingArtifactCreateRequest(BaseModel):
    provider: Literal["fathom"] = "fathom"
    title: str | None = None
    meeting_url: str | None = None
    summary: str | None = None
    action_items: list[str] = Field(default_factory=list)
    occurred_at: datetime | None = None
    scheduled_at: datetime | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    linked_object_type: str | None = None
    linked_object_id: str | None = None

    @field_validator("title", "linked_object_type", "linked_object_id")
    @classmethod
    def short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Meeting field", max_length=255)

    @field_validator("meeting_url")
    @classmethod
    def meeting_url_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Meeting URL")

    @field_validator("summary")
    @classmethod
    def summary_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Meeting summary", 8000)

    @field_validator("action_items")
    @classmethod
    def action_items_are_valid(cls, value: list[str]) -> list[str]:
        return validate_meeting_action_items(value)

    @model_validator(mode="after")
    def has_meeting_reference(self) -> "MeetingArtifactCreateRequest":
        if not (self.title or self.meeting_url or self.summary):
            raise ValueError("Add a meeting title, URL, or summary.")
        return self


class MeetingArtifactUpdateRequest(BaseModel):
    title: str | None = None
    meeting_url: str | None = None
    summary: str | None = None
    action_items: list[str] | None = None
    occurred_at: datetime | None = None
    scheduled_at: datetime | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    linked_object_type: str | None = None
    linked_object_id: str | None = None
    status: MeetingArtifactStatus | None = None

    @field_validator("title", "linked_object_type", "linked_object_id")
    @classmethod
    def optional_short_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Meeting field", max_length=255) if value is not None else None

    @field_validator("meeting_url")
    @classmethod
    def optional_meeting_url_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Meeting URL") if value is not None else None

    @field_validator("summary")
    @classmethod
    def optional_summary_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Meeting summary", 8000) if value is not None else None

    @field_validator("action_items")
    @classmethod
    def optional_action_items_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_meeting_action_items(value) if value is not None else None


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


class IntegrationSyncRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    trigger_type: str
    status: str
    actor_id: str | None = None
    actor_name: str | None = None
    retry_count: int
    created_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    failure_type: str | None = None
    message: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    metadata_json: dict = Field(default_factory=dict)


class IntegrationSyncRunPageRead(BaseModel):
    items: list[IntegrationSyncRunRead]
    total: int
    page: int
    page_size: int
    pages: int


class IntegrationMappingRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    name: str
    pattern: str
    source_field: str
    target_account_id: str | None = None
    target_engagement_id: str | None = None
    target_event_type: str | None = None
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class IntegrationMappingRulePageRead(BaseModel):
    items: list[IntegrationMappingRuleRead]
    total: int
    page: int
    page_size: int
    pages: int


class IntegrationMappingRuleRequest(BaseModel):
    name: str
    pattern: str
    source_field: str = "title"
    target_account_id: str | None = None
    target_engagement_id: str | None = None
    target_event_type: str | None = None
    priority: int = 100
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def mapping_name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Mapping rule name", 180)

    @field_validator("pattern", "source_field", "target_event_type")
    @classmethod
    def mapping_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Mapping rule field", max_length=255) if value is not None else None

    @field_validator("priority")
    @classmethod
    def priority_is_valid(cls, value: int) -> int:
        if value < 1 or value > 1000:
            raise ValueError("Priority must be between 1 and 1000.")
        return value


class IntegrationImportedItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider: str
    external_id: str
    title: str
    description: str | None = None
    source_link: str | None = None
    occurred_at: datetime | None = None
    source_timestamp: datetime | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    mapping_status: str
    review_status: str
    review_required: bool
    deduplication_key: str | None = None
    sanitized_payload_json: dict = Field(default_factory=dict)
    result_record_type: str | None = None
    result_record_id: str | None = None
    reviewed_by_id: str | None = None
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IntegrationImportedItemPageRead(BaseModel):
    items: list[IntegrationImportedItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class IntegrationItemMapRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    target_event_type: str | None = None

    @field_validator("target_event_type")
    @classmethod
    def target_event_type_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Event type", max_length=80)


class IntegrationItemReviewRequest(BaseModel):
    account_id: str | None = None
    engagement_id: str | None = None
    notes: str | None = None

    @field_validator("notes")
    @classmethod
    def notes_are_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Review notes", 2000)


class FathomRedactRequest(BaseModel):
    redacted_description: str

    @field_validator("redacted_description")
    @classmethod
    def redacted_description_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Redacted description", 4000)


class FathomTaskSuggestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    imported_item_id: str
    account_id: str | None = None
    engagement_id: str | None = None
    title: str
    description: str | None = None
    suggested_due_at: datetime | None = None
    status: str
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    reviewed_at: datetime | None = None
    created_task_id: str | None = None
    created_at: datetime
    updated_at: datetime


class FathomTaskSuggestionPageRead(BaseModel):
    items: list[FathomTaskSuggestionRead]
    total: int
    page: int
    page_size: int
    pages: int


class SecurityAlertSettingsRead(BaseModel):
    administration_email: EmailStr
    updated_by_id: str | None = None
    updated_by_name: str | None = None
    updated_at: datetime | None = None


class SecurityAlertSettingsUpdateRequest(BaseModel):
    administration_email: EmailStr


class CsatScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    score: float
    scale_min: int
    scale_max: int
    normalized_score: int
    category_scores_json: dict[str, float] = Field(default_factory=dict)
    category_weights_json: dict[str, float] = Field(default_factory=dict)
    weighted_score: float = 0
    feedback: str | None = None
    source_label: str
    source_id: str
    source_link: str | None = None
    source_recorded_at: datetime
    freshness_status: str
    score_impact_json: dict = Field(default_factory=dict)
    trend_json: dict = Field(default_factory=dict)
    timeline_entry_id: str | None = None
    scoring_snapshot_id: str | None = None
    created_by_id: str | None = None
    created_by_name: str
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class CsatScorePageRead(BaseModel):
    items: list[CsatScoreRead]
    total: int
    page: int
    page_size: int
    pages: int


class CsatScoreCreateRequest(BaseModel):
    account_id: str
    engagement_id: str | None = None
    customer_name: str | None = None
    customer_email: EmailStr | None = None
    score: float | None = None
    scale_min: int = 1
    scale_max: int = 5
    category_scores_json: dict[str, float] = Field(default_factory=dict)
    category_weights_json: dict[str, float] = Field(default_factory=dict)
    feedback: str | None = None
    source_label: str = "manual"
    source_id: str | None = None
    source_link: str | None = None
    source_recorded_at: datetime | None = None

    @field_validator("customer_name")
    @classmethod
    def customer_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Customer name", max_length=180)

    @field_validator("feedback")
    @classmethod
    def feedback_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "CSAT feedback", 4000)

    @field_validator("source_label", "source_id")
    @classmethod
    def source_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "CSAT source", max_length=255) if value is not None else None

    @field_validator("source_link")
    @classmethod
    def source_link_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Source link")

    @field_validator("category_scores_json")
    @classmethod
    def category_scores_are_valid(cls, value: dict[str, float]) -> dict[str, float]:
        return validate_csat_category_scores(value)

    @field_validator("category_weights_json")
    @classmethod
    def category_weights_are_valid(cls, value: dict[str, float]) -> dict[str, float]:
        return validate_csat_category_weights(value)

    @model_validator(mode="after")
    def score_is_in_scale(self) -> "CsatScoreCreateRequest":
        if self.scale_min >= self.scale_max:
            raise ValueError("CSAT score scale minimum must be less than maximum.")
        if self.score is None and not self.category_scores_json:
            raise ValueError("CSAT category scores are required.")
        if self.score is not None and (self.score < self.scale_min or self.score > self.scale_max):
            raise ValueError("CSAT score must be within the configured score scale.")
        return self


class CsatScoreUpdateRequest(BaseModel):
    engagement_id: str | None = None
    customer_name: str | None = None
    customer_email: EmailStr | None = None
    score: float | None = None
    scale_min: int | None = None
    scale_max: int | None = None
    category_scores_json: dict[str, float] | None = None
    category_weights_json: dict[str, float] | None = None
    feedback: str | None = None
    source_label: str | None = None
    source_id: str | None = None
    source_link: str | None = None
    source_recorded_at: datetime | None = None

    @field_validator("customer_name")
    @classmethod
    def customer_name_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "Customer name", max_length=180)

    @field_validator("feedback")
    @classmethod
    def feedback_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "CSAT feedback", 4000)

    @field_validator("source_label", "source_id")
    @classmethod
    def source_text_is_valid(cls, value: str | None) -> str | None:
        return optional_text(value, "CSAT source", max_length=255) if value is not None else None

    @field_validator("source_link")
    @classmethod
    def source_link_is_valid(cls, value: str | None) -> str | None:
        return validate_http_url(value, "Source link")

    @field_validator("category_scores_json")
    @classmethod
    def category_scores_are_valid(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        return validate_csat_category_scores(value) if value is not None else None

    @field_validator("category_weights_json")
    @classmethod
    def category_weights_are_valid(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        return validate_csat_category_weights(value) if value is not None else None


class AiGatewayRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    request_type: str
    status: str
    actor_id: str | None = None
    actor_name: str | None = None
    account_id: str | None = None
    engagement_id: str | None = None
    permission_scope_json: dict = Field(default_factory=dict)
    source_context_json: list = Field(default_factory=list)
    research_sources_json: list = Field(default_factory=list)
    response_labels_json: list = Field(default_factory=list)
    prompt_json: dict = Field(default_factory=dict)
    response_json: dict = Field(default_factory=dict)
    feedback_json: dict = Field(default_factory=dict)
    latency_ms: int | None = None
    usage_json: dict = Field(default_factory=dict)
    error_message: str | None = None
    affected_records_json: list = Field(default_factory=list)
    created_at: datetime


class AiGatewayRunPageRead(BaseModel):
    items: list[AiGatewayRunRead]
    total: int
    page: int
    page_size: int
    pages: int


class AnalyticsMetricRead(BaseModel):
    label: str
    value: int | float | str
    tone: str = "default"


class AnalyticsSeriesRead(BaseModel):
    name: str
    rows: list[dict[str, Any]] = Field(default_factory=list)


class AnalyticsPortfolioRead(BaseModel):
    generated_at: datetime
    filters: dict[str, Any] = Field(default_factory=dict)
    metrics: list[AnalyticsMetricRead] = Field(default_factory=list)
    series: list[AnalyticsSeriesRead] = Field(default_factory=list)
    drilldowns: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    redactions: dict[str, Any] = Field(default_factory=dict)


class AnalyticsBenchmarkRead(BaseModel):
    cohort: str
    account_count: int
    average_health: int
    average_pipeline: float
    risk_distribution: dict[str, int] = Field(default_factory=dict)
    suppressed: bool = False
    reason: str | None = None


class AnalyticsBenchmarkPageRead(BaseModel):
    items: list[AnalyticsBenchmarkRead]
    total: int
    page: int
    page_size: int
    pages: int


class KamPerformanceRead(BaseModel):
    owner_id: str | None = None
    owner_name: str
    account_count: int
    average_health: int
    overdue_action_rate: float
    governance_cadence_rate: float
    renewal_readiness: int
    open_pipeline: float
    open_escalations: int


class KamPerformancePageRead(BaseModel):
    items: list[KamPerformanceRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountChangeAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    alert_type: str
    reason_code: str
    affected_metric: str
    previous_value_json: dict | None = None
    new_value_json: dict | None = None
    change_magnitude: float | None = None
    severity: str
    status: str
    owner_id: str | None = None
    owner_name: str | None = None
    recommended_action: str
    source_evidence_json: list = Field(default_factory=list)
    deduplication_key: str
    created_by_id: str | None = None
    updated_by_id: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AccountChangeAlertPageRead(BaseModel):
    items: list[AccountChangeAlertRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccountChangeAlertUpdateRequest(BaseModel):
    status: Literal["open", "acknowledged", "dismissed", "resolved"]
    reason: str | None = None

    @field_validator("reason")
    @classmethod
    def alert_reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Alert status reason", 1000)


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    action: str
    entity_type: str
    entity_id: str
    actor_id: str
    actor_name: str
    before_value: dict | None = None
    after_value: dict | None = None
    reason: str | None = None
    created_at: datetime


class AuditLogPageRead(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class AccessLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    entity_type: str
    entity_id: str | None = None
    account_id: str | None = None
    field_key: str | None = None
    actor_id: str
    actor_name: str
    decision: str
    reason: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime


class AccessLogPageRead(BaseModel):
    items: list[AccessLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class FieldPermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    field_key: str
    role: str
    can_view: bool
    can_edit: bool
    redaction_strategy: str
    condition_json: dict = Field(default_factory=dict)
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class FieldPermissionPageRead(BaseModel):
    items: list[FieldPermissionRead]
    total: int
    page: int
    page_size: int
    pages: int


class FieldPermissionRequest(BaseModel):
    module: str
    field_key: str
    role: str
    can_view: bool = True
    can_edit: bool = False
    redaction_strategy: Literal["mask", "hide", "hash"] = "mask"
    condition_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("module")
    @classmethod
    def field_permission_module_is_valid(cls, value: str) -> str:
        return validate_module_slug(value)

    @field_validator("field_key")
    @classmethod
    def field_permission_key_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Field key")

    @field_validator("role")
    @classmethod
    def field_permission_role_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Role")


class ConfigurationChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module: str
    change_type: str
    entity_type: str
    entity_id: str | None = None
    title: str
    description: str | None = None
    status: str
    payload_json: dict = Field(default_factory=dict)
    validation_json: dict = Field(default_factory=dict)
    created_by_id: str | None = None
    created_by_name: str
    published_by_id: str | None = None
    published_by_name: str | None = None
    rolled_back_by_id: str | None = None
    rolled_back_by_name: str | None = None
    published_at: datetime | None = None
    rolled_back_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ConfigurationChangePageRead(BaseModel):
    items: list[ConfigurationChangeRead]
    total: int
    page: int
    page_size: int
    pages: int


class ConfigurationChangeCreateRequest(BaseModel):
    module: str
    change_type: str
    entity_type: str
    entity_id: str | None = None
    title: str
    description: str | None = None
    payload_json: dict[str, Any] = Field(default_factory=dict)

    @field_validator("module")
    @classmethod
    def config_module_is_valid(cls, value: str) -> str:
        return validate_module_slug(value)

    @field_validator("change_type", "entity_type")
    @classmethod
    def config_type_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Configuration change type")

    @field_validator("title")
    @classmethod
    def config_title_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Configuration change title", 220)

    @field_validator("description")
    @classmethod
    def config_description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Configuration change description", 2000)


class SystemHealthRead(BaseModel):
    status: Literal["healthy", "degraded", "error"]
    generated_at: datetime
    checks: list[dict[str, Any]] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class JobLogRead(BaseModel):
    id: str
    job_type: str
    mode: str
    status: str
    matched_count: int = 0
    affected_count: int = 0
    actor_id: str | None = None
    actor_name: str | None = None
    error_message: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class JobLogPageRead(BaseModel):
    items: list[JobLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class ErrorLogRead(BaseModel):
    id: str
    source: str
    severity: str
    message: str
    status: str
    actor_name: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime


class ErrorLogPageRead(BaseModel):
    items: list[ErrorLogRead]
    total: int
    page: int
    page_size: int
    pages: int


class MetricValidationRead(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScoringMetricBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    scope: Literal["account", "engagement"] = "account"
    weight: int = Field(ge=0, le=100)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    formula: dict[str, Any] = Field(default_factory=dict)
    freshness_rule: dict[str, Any] = Field(default_factory=dict)
    owner_role: str | None = None
    source: str = "manual"
    effective_date: datetime | None = None
    status: MetricStatus = "draft"
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Metric slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Metric name", 180)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Metric description", 2000)

    @field_validator("owner_role", "source")
    @classmethod
    def short_value_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Metric value", 120) if value is not None else None


class ScoringMetricCreateRequest(ScoringMetricBase):
    pass


class ScoringMetricUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    scope: Literal["account", "engagement"] | None = None
    weight: int | None = Field(default=None, ge=0, le=100)
    thresholds: dict[str, Any] | None = None
    formula: dict[str, Any] | None = None
    freshness_rule: dict[str, Any] | None = None
    owner_role: str | None = None
    source: str | None = None
    effective_date: datetime | None = None
    status: MetricStatus | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Metric name", 180) if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Metric description", 2000)

    @field_validator("owner_role", "source")
    @classmethod
    def short_value_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Metric value", 120) if value is not None else None


class ScoringMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    description: str | None = None
    scope: str
    weight: int
    thresholds: dict = Field(default_factory=dict)
    formula: dict = Field(default_factory=dict)
    freshness_rule: dict = Field(default_factory=dict)
    owner_role: str | None = None
    source: str
    effective_date: datetime | None = None
    status: str
    is_active: bool
    current_version: int
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ScoringMetricPageRead(BaseModel):
    items: list[ScoringMetricRead]
    total: int
    page: int
    page_size: int
    pages: int


class ScoringMetricVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    metric_id: str
    version: int
    config_json: dict = Field(default_factory=dict)
    published_by_id: str | None = None
    published_by_name: str
    published_at: datetime
    created_at: datetime


class ScoringMetricVersionPageRead(BaseModel):
    items: list[ScoringMetricVersionRead]
    total: int
    page: int
    page_size: int
    pages: int


class ManualScoreSubmissionRequest(BaseModel):
    calculator_id: str
    values: dict[str, Any] = Field(default_factory=dict)
    evidence: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("calculator_id")
    @classmethod
    def calculator_id_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Calculator")

    @field_validator("evidence")
    @classmethod
    def evidence_is_valid(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(value) > 25:
            raise ValueError("Evidence can include at most 25 items.")
        return value


class ScoreRecalculateRequest(BaseModel):
    trigger_source: str = "manual"
    include_signal_evaluation: bool = True
    manual_submission: ManualScoreSubmissionRequest | None = None

    @field_validator("trigger_source")
    @classmethod
    def trigger_source_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Trigger source", 120)


class ScoreSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    job_id: str | None = None
    scope: str
    overall: int
    rag_status: str
    drivers: list = Field(default_factory=list)
    reason_codes: list = Field(default_factory=list)
    metric_version: str
    freshness_status: str
    is_dirty: bool
    trend: int
    status: str
    source_context: dict = Field(default_factory=dict)
    calculated_by_id: str | None = None
    calculated_by_name: str | None = None
    calculated_at: datetime
    created_at: datetime


class ScoreSnapshotPageRead(BaseModel):
    items: list[ScoreSnapshotRead]
    total: int
    page: int
    page_size: int
    pages: int


class ScoreRead(BaseModel):
    account_id: str
    engagement_id: str | None = None
    scope: str
    overall: int
    rag_status: str
    drivers: list = Field(default_factory=list)
    reason_codes: list = Field(default_factory=list)
    metric_version: str
    freshness_status: str
    is_dirty: bool
    trend: int
    status: str
    latest_snapshot: ScoreSnapshotRead | None = None


class ScoringJobCreateRequest(BaseModel):
    job_type: ScoringJobType = "manual"
    scope: ScoringScope = "account"
    account_id: str | None = None
    engagement_id: str | None = None
    trigger_source: str = "manual"

    @field_validator("trigger_source")
    @classmethod
    def trigger_source_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Trigger source", 120)


class ScoringJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_type: str
    scope: str
    account_id: str | None = None
    engagement_id: str | None = None
    status: str
    trigger_source: str
    error_message: str | None = None
    result_json: dict = Field(default_factory=dict)
    created_by_id: str | None = None
    created_by_name: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SignalRuleBase(BaseModel):
    slug: str
    name: str
    signal_type: str
    description: str | None = None
    severity: SignalSeverity = "warning"
    condition_json: dict[str, Any] = Field(default_factory=dict)
    owner_rule_json: dict[str, Any] = Field(default_factory=dict)
    sla_rule_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def slug_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Signal rule slug")

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Signal rule name", 180)

    @field_validator("signal_type")
    @classmethod
    def signal_type_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Signal type")

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Signal rule description", 2000)


class SignalRuleCreateRequest(SignalRuleBase):
    pass


class SignalRuleUpdateRequest(BaseModel):
    name: str | None = None
    signal_type: str | None = None
    description: str | None = None
    severity: SignalSeverity | None = None
    condition_json: dict[str, Any] | None = None
    owner_rule_json: dict[str, Any] | None = None
    sla_rule_json: dict[str, Any] | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_short_text(value, "Signal rule name", 180) if value is not None else None

    @field_validator("signal_type")
    @classmethod
    def signal_type_is_valid(cls, value: str | None) -> str | None:
        return validate_slug(value, "Signal type") if value is not None else None

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Signal rule description", 2000)


class SignalRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    signal_type: str
    description: str | None = None
    severity: str
    condition_json: dict = Field(default_factory=dict)
    owner_rule_json: dict = Field(default_factory=dict)
    sla_rule_json: dict = Field(default_factory=dict)
    is_active: bool
    current_version: int
    created_at: datetime
    updated_at: datetime


class SignalRulePageRead(BaseModel):
    items: list[SignalRuleRead]
    total: int
    page: int
    page_size: int
    pages: int


class SignalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    engagement_id: str | None = None
    rule_id: str | None = None
    signal_type: str
    severity: str
    status: str
    owner_id: str | None = None
    owner_name: str | None = None
    title: str
    detail: str
    reason_codes: list = Field(default_factory=list)
    evidence_json: list = Field(default_factory=list)
    citations_json: list = Field(default_factory=list)
    source_record_type: str | None = None
    source_record_id: str | None = None
    source_record_route: str | None = None
    confidence: int | None = None
    condition_key: str | None = None
    due_at: datetime | None = None
    resolved_at: datetime | None = None
    dismissed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SignalPageRead(BaseModel):
    items: list[SignalRead]
    total: int
    page: int
    page_size: int
    pages: int


class SignalEvaluationRequest(BaseModel):
    account_id: str | None = None
    engagement_id: str | None = None
    trigger_source: str = "manual"

    @field_validator("trigger_source")
    @classmethod
    def trigger_source_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Trigger source", 120)


class SignalEvaluationRead(BaseModel):
    evaluated_accounts: int
    created: int
    updated: int
    resolved: int
    signals: list[SignalRead] = Field(default_factory=list)


class SignalStatusUpdateRequest(BaseModel):
    status: SignalStatus
    reason: str | None = None

    @field_validator("reason")
    @classmethod
    def reason_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Signal reason", 2000)


class SignalConvertRequest(BaseModel):
    target_type: SignalConvertTarget = "task"
    playbook_template_id: str | None = None
    owner_id: str | None = None
    due_at: datetime | None = None
    note: str | None = None

    @field_validator("note")
    @classmethod
    def note_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Conversion note", 2000)


class SignalEvidenceRead(BaseModel):
    signal_id: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)


class SignalAIExplanationRead(BaseModel):
    signal_id: str
    provider: str
    advisory_only: bool = True
    explanation: str
    citations: list[dict[str, Any]] = Field(default_factory=list)


NotificationMode = Literal["in_app", "in_app_email", "off"]
DigestCadence = Literal["immediate", "daily", "weekly", "monthly"]
NotificationChannel = Literal["in_app", "email"]
NotificationPriority = Literal["low", "medium", "high", "critical"]
SlaItemType = Literal["signal", "task", "kyc", "escalation"]
SlaState = Literal["escalated", "resolved"]
ScheduleCadence = Literal["daily", "weekly", "monthly"]
ReportDataSource = Literal["accounts", "tasks", "signals", "escalations", "opportunities"]
ReportVisibility = Literal["private", "shared"]
ReportExportFormat = Literal["csv", "pdf"]


def validate_timezone_name(value: str) -> str:
    timezone_name = validate_short_text(value, "Timezone", 120)
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Timezone must be a valid IANA timezone such as UTC or Asia/Karachi.") from exc
    return timezone_name


def validate_recipient_ids(value: list[str], field_label: str = "Recipients") -> list[str]:
    if not value:
        raise ValueError(f"{field_label} must include at least one recipient.")
    if len(value) > 100:
        raise ValueError(f"{field_label} can include at most 100 users.")
    return validate_string_list(value, field_label, max_items=100)


def validate_channels(value: list[str]) -> list[str]:
    if not value:
        raise ValueError("Delivery channels must include at least one channel.")
    allowed = {"in_app", "email"}
    channels = validate_string_list(value, "Delivery channels", max_items=3)
    invalid = [channel for channel in channels if channel not in allowed]
    if invalid:
        raise ValueError("Delivery channels must be in_app or email.")
    return channels


class NotificationTriggerConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trigger: str
    label: str
    description: str | None = None
    default_mode: str
    default_digest_cadence: str
    supported_channels: list[str] = Field(default_factory=list)
    mandatory: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class NotificationTriggerConfigRequest(BaseModel):
    trigger: str
    label: str
    description: str | None = None
    default_mode: NotificationMode = "in_app"
    default_digest_cadence: DigestCadence = "daily"
    supported_channels: list[NotificationChannel] = Field(default_factory=lambda: ["in_app"])
    mandatory: bool = False
    is_active: bool = True

    @field_validator("trigger")
    @classmethod
    def trigger_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Trigger")

    @field_validator("label")
    @classmethod
    def label_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Trigger label", 160)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Trigger description", 1000)


class NotificationDefaultsRead(BaseModel):
    items: list[NotificationTriggerConfigRead] = Field(default_factory=list)


class NotificationDefaultsUpdateRequest(BaseModel):
    items: list[NotificationTriggerConfigRequest]

    @field_validator("items")
    @classmethod
    def items_are_valid(cls, value: list[NotificationTriggerConfigRequest]) -> list[NotificationTriggerConfigRequest]:
        if not value:
            raise ValueError("At least one notification trigger is required.")
        triggers = [item.trigger for item in value]
        if len(triggers) != len(set(triggers)):
            raise ValueError("Notification triggers must be unique.")
        return value


class NotificationPreferenceRead(BaseModel):
    trigger: str
    label: str
    mode: NotificationMode
    digest_cadence: DigestCadence
    mandatory: bool = False
    supported_channels: list[str] = Field(default_factory=list)
    policy_override: bool = False


class NotificationPreferenceUpdateItem(BaseModel):
    trigger: str
    mode: NotificationMode
    digest_cadence: DigestCadence = "daily"

    @field_validator("trigger")
    @classmethod
    def trigger_is_valid(cls, value: str) -> str:
        return validate_slug(value, "Trigger")


class NotificationPreferenceUpdateRequest(BaseModel):
    items: list[NotificationPreferenceUpdateItem]

    @field_validator("items")
    @classmethod
    def items_are_valid(cls, value: list[NotificationPreferenceUpdateItem]) -> list[NotificationPreferenceUpdateItem]:
        if not value:
            raise ValueError("At least one preference is required.")
        triggers = [item.trigger for item in value]
        if len(triggers) != len(set(triggers)):
            raise ValueError("Preference triggers must be unique.")
        return value


class NotificationRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recipient_user_id: str | None = None
    recipient_name: str
    recipient_email: str | None = None
    trigger: str
    title: str
    body: str
    account_id: str | None = None
    account_name_snapshot: str | None = None
    source_record_type: str | None = None
    source_record_id: str | None = None
    source_record_route: str | None = None
    priority: str
    channel: str
    delivery_status: str
    delivery_metadata_json: dict[str, Any] = Field(default_factory=dict)
    email_queued: bool
    retry_count: int
    error_message: str | None = None
    read_at: datetime | None = None
    delivered_at: datetime | None = None
    created_at: datetime


class NotificationPageRead(BaseModel):
    items: list[NotificationRecordRead]
    total: int
    page: int
    page_size: int
    pages: int
    unread_count: int


class SlaRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    item_type: str
    severity: str | None = None
    priority: str | None = None
    inactivity_minutes: int
    qualifying_activities: list[str] = Field(default_factory=list)
    recipient_policy: str
    is_active: bool
    created_by_id: str | None = None
    updated_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class SlaRulePageRead(BaseModel):
    items: list[SlaRuleRead]
    total: int
    page: int
    page_size: int
    pages: int


class SlaRuleCreateRequest(BaseModel):
    name: str
    item_type: SlaItemType
    severity: str | None = None
    priority: str | None = None
    inactivity_minutes: int = 1440
    qualifying_activities: list[str] = Field(default_factory=list)
    recipient_policy: str = "kam_head"
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "SLA rule name", 160)

    @field_validator("severity", "priority")
    @classmethod
    def optional_short_text_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Filter", 80)

    @field_validator("inactivity_minutes")
    @classmethod
    def inactivity_minutes_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Inactivity window", 100000)

    @field_validator("qualifying_activities")
    @classmethod
    def qualifying_activities_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Qualifying activities", max_items=20)

    @field_validator("recipient_policy")
    @classmethod
    def recipient_policy_is_valid(cls, value: str) -> str:
        policy = validate_slug(value, "Recipient policy")
        if policy not in {"kam_head", "account_owner", "admin"}:
            raise ValueError("Recipient policy must be kam_head, account_owner, or admin.")
        return policy


class SlaRuleUpdateRequest(BaseModel):
    name: str | None = None
    severity: str | None = None
    priority: str | None = None
    inactivity_minutes: int | None = None
    qualifying_activities: list[str] | None = None
    recipient_policy: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "SLA rule name", 160)

    @field_validator("inactivity_minutes")
    @classmethod
    def inactivity_minutes_is_valid(cls, value: int | None) -> int | None:
        return validate_positive_int(value, "Inactivity window", 100000) if value is not None else None

    @field_validator("qualifying_activities")
    @classmethod
    def qualifying_activities_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Qualifying activities", max_items=20) if value is not None else None

    @field_validator("recipient_policy")
    @classmethod
    def recipient_policy_is_valid(cls, value: str | None) -> str | None:
        if value is None:
            return None
        policy = validate_slug(value, "Recipient policy")
        if policy not in {"kam_head", "account_owner", "admin"}:
            raise ValueError("Recipient policy must be kam_head, account_owner, or admin.")
        return policy


class SlaEscalatedItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_id: str | None = None
    source_type: str
    source_record_id: str
    account_id: str | None = None
    title: str
    severity: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    recipient_user_id: str | None = None
    recipient_name: str | None = None
    last_activity_at: datetime | None = None
    escalated_at: datetime
    sla_window_key: str
    state: str
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SlaEscalatedItemPageRead(BaseModel):
    items: list[SlaEscalatedItemRead]
    total: int
    page: int
    page_size: int
    pages: int


class SlaEvaluationRead(BaseModel):
    evaluated_rules: int
    matched_items: int
    escalated_items: int
    notifications_created: int
    duplicate_notifications: int
    worker_run_id: str | None = None


class DigestScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    owner_id: str | None = None
    owner_name: str
    cadence: str
    timezone: str
    recipients_json: list[str] = Field(default_factory=list)
    sections_json: list[str] = Field(default_factory=list)
    filters_json: dict[str, Any] = Field(default_factory=dict)
    delivery_channels: list[str] = Field(default_factory=list)
    is_active: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DigestSchedulePageRead(BaseModel):
    items: list[DigestScheduleRead]
    total: int
    page: int
    page_size: int
    pages: int


class DigestScheduleRequest(BaseModel):
    name: str
    cadence: ScheduleCadence = "weekly"
    timezone: str = "UTC"
    recipient_user_ids: list[str]
    sections: list[str] = Field(default_factory=lambda: ["strategic_risks", "retention_outlook", "growth_opportunities", "major_escalations", "required_decisions"])
    filters: dict[str, Any] = Field(default_factory=dict)
    delivery_channels: list[NotificationChannel] = Field(default_factory=lambda: ["in_app"])
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Digest schedule name", 160)

    @field_validator("timezone")
    @classmethod
    def timezone_is_valid(cls, value: str) -> str:
        return validate_timezone_name(value)

    @field_validator("recipient_user_ids")
    @classmethod
    def recipients_are_valid(cls, value: list[str]) -> list[str]:
        return validate_recipient_ids(value)

    @field_validator("sections")
    @classmethod
    def sections_are_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Digest sections", max_items=20)

    @field_validator("delivery_channels")
    @classmethod
    def channels_are_valid(cls, value: list[str]) -> list[str]:
        return validate_channels(value)


class DigestScheduleUpdateRequest(BaseModel):
    name: str | None = None
    cadence: ScheduleCadence | None = None
    timezone: str | None = None
    recipient_user_ids: list[str] | None = None
    sections: list[str] | None = None
    filters: dict[str, Any] | None = None
    delivery_channels: list[NotificationChannel] | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Digest schedule name", 160)

    @field_validator("timezone")
    @classmethod
    def timezone_is_valid(cls, value: str | None) -> str | None:
        return validate_timezone_name(value) if value is not None else None

    @field_validator("recipient_user_ids")
    @classmethod
    def recipients_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_recipient_ids(value) if value is not None else None

    @field_validator("sections")
    @classmethod
    def sections_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Digest sections", max_items=20) if value is not None else None

    @field_validator("delivery_channels")
    @classmethod
    def channels_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_channels(value) if value is not None else None


class DigestPreviewRequest(BaseModel):
    sections: list[str] = Field(default_factory=lambda: ["strategic_risks", "retention_outlook", "growth_opportunities", "major_escalations", "required_decisions"])
    filters: dict[str, Any] = Field(default_factory=dict)


class DigestRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    schedule_id: str | None = None
    title: str
    status: str
    recipients_json: list[str] = Field(default_factory=list)
    sections_json: list[str] = Field(default_factory=list)
    content_json: dict[str, Any] = Field(default_factory=dict)
    redactions_json: dict[str, Any] = Field(default_factory=dict)
    delivery_attempts_json: list[dict[str, Any]] = Field(default_factory=list)
    error_message: str | None = None
    generated_by_id: str | None = None
    generated_by_name: str
    generated_at: datetime
    created_at: datetime


class DigestRunPageRead(BaseModel):
    items: list[DigestRunRead]
    total: int
    page: int
    page_size: int
    pages: int


class DashboardWidgetRead(BaseModel):
    key: str
    title: str
    status: Literal["complete", "empty", "failed"] = "complete"
    generated_at: datetime
    data_scope: str
    primary_route: str | None = None
    value: Any | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class DashboardRead(BaseModel):
    dashboard: str
    display_name: str | None = None
    role_group: str | None = None
    read_only: bool = False
    allowed_filters: list[str] = Field(default_factory=list)
    generated_at: datetime
    data_scope: str
    widgets: list[DashboardWidgetRead]
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskSummaryRefreshRead(BaseModel):
    widget: DashboardWidgetRead


class ReportFieldRead(BaseModel):
    data_source: str
    field: str
    label: str
    field_type: str = "text"
    sortable: bool = True
    filterable: bool = True
    sensitive: bool = False
    custom_field: bool = False


class ReportFieldsRead(BaseModel):
    data_sources: list[str]
    fields: list[ReportFieldRead]


class ReportPreviewRequest(BaseModel):
    data_source: ReportDataSource
    fields: list[str]
    filters: dict[str, Any] = Field(default_factory=dict)
    grouping: list[str] = Field(default_factory=list)
    sort: str | None = None
    direction: Literal["asc", "desc"] = "asc"
    page: int = 1
    page_size: int = 25

    @field_validator("fields")
    @classmethod
    def fields_are_valid(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("Select at least one report field.")
        return validate_string_list(value, "Report fields", max_items=30)

    @field_validator("grouping")
    @classmethod
    def grouping_is_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Report grouping", max_items=10)

    @field_validator("page")
    @classmethod
    def page_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Page", 100000)

    @field_validator("page_size")
    @classmethod
    def page_size_is_valid(cls, value: int) -> int:
        return validate_positive_int(value, "Page size", 500)


class ReportPreviewRead(BaseModel):
    rows: list[dict[str, Any]]
    columns: list[ReportFieldRead]
    total: int
    page: int
    page_size: int
    pages: int
    generated_at: datetime


class ReportDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str | None = None
    owner_name: str
    name: str
    description: str | None = None
    visibility: str
    data_source: str
    fields_json: list[str] = Field(default_factory=list)
    filters_json: dict[str, Any] = Field(default_factory=dict)
    grouping_json: list[str] = Field(default_factory=list)
    layout_json: dict[str, Any] = Field(default_factory=dict)
    export_format: str
    created_at: datetime
    updated_at: datetime


class ReportDefinitionPageRead(BaseModel):
    items: list[ReportDefinitionRead]
    total: int
    page: int
    page_size: int
    pages: int


class ReportCreateRequest(BaseModel):
    name: str
    description: str | None = None
    visibility: ReportVisibility = "private"
    data_source: ReportDataSource
    fields: list[str]
    filters: dict[str, Any] = Field(default_factory=dict)
    grouping: list[str] = Field(default_factory=list)
    layout: dict[str, Any] = Field(default_factory=dict)
    export_format: ReportExportFormat = "csv"

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str) -> str:
        return validate_short_text(value, "Report name", 160)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Report description", 1000)

    @field_validator("fields")
    @classmethod
    def fields_are_valid(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("Select at least one report field.")
        return validate_string_list(value, "Report fields", max_items=30)

    @field_validator("grouping")
    @classmethod
    def grouping_is_valid(cls, value: list[str]) -> list[str]:
        return validate_string_list(value, "Report grouping", max_items=10)

    @model_validator(mode="after")
    def export_format_is_compatible(self) -> "ReportCreateRequest":
        if self.export_format == "pdf" and self.layout.get("type") == "table_only":
            raise ValueError("PDF exports require a report layout.")
        return self


class ReportUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    visibility: ReportVisibility | None = None
    fields: list[str] | None = None
    filters: dict[str, Any] | None = None
    grouping: list[str] | None = None
    layout: dict[str, Any] | None = None
    export_format: ReportExportFormat | None = None

    @field_validator("name")
    @classmethod
    def name_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Report name", 160)

    @field_validator("description")
    @classmethod
    def description_is_valid(cls, value: str | None) -> str | None:
        return validate_optional_long_text(value, "Report description", 1000)

    @field_validator("fields")
    @classmethod
    def fields_are_valid(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if not value:
            raise ValueError("Select at least one report field.")
        return validate_string_list(value, "Report fields", max_items=30)

    @field_validator("grouping")
    @classmethod
    def grouping_is_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_string_list(value, "Report grouping", max_items=10) if value is not None else None


class ReportExportRequest(BaseModel):
    export_format: ReportExportFormat | None = None


class ReportRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    report_id: str | None = None
    schedule_id: str | None = None
    status: str
    export_format: str
    content_json: dict[str, Any] = Field(default_factory=dict)
    storage_metadata_json: dict[str, Any] = Field(default_factory=dict)
    permission_scope_json: dict[str, Any] = Field(default_factory=dict)
    recipients_json: list[str] = Field(default_factory=list)
    error_message: str | None = None
    generated_by_id: str | None = None
    generated_by_name: str
    generated_at: datetime
    created_at: datetime


class ReportRunPageRead(BaseModel):
    items: list[ReportRunRead]
    total: int
    page: int
    page_size: int
    pages: int


class ReportScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    report_id: str
    owner_id: str | None = None
    owner_name: str
    cadence: str
    timezone: str
    recipients_json: list[str] = Field(default_factory=list)
    delivery_channels: list[str] = Field(default_factory=list)
    is_active: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ReportSchedulePageRead(BaseModel):
    items: list[ReportScheduleRead]
    total: int
    page: int
    page_size: int
    pages: int


class ReportScheduleRequest(BaseModel):
    cadence: ScheduleCadence = "weekly"
    timezone: str = "UTC"
    recipient_user_ids: list[str]
    delivery_channels: list[NotificationChannel] = Field(default_factory=lambda: ["in_app"])
    is_active: bool = True

    @field_validator("timezone")
    @classmethod
    def timezone_is_valid(cls, value: str) -> str:
        return validate_timezone_name(value)

    @field_validator("recipient_user_ids")
    @classmethod
    def recipients_are_valid(cls, value: list[str]) -> list[str]:
        return validate_recipient_ids(value)

    @field_validator("delivery_channels")
    @classmethod
    def channels_are_valid(cls, value: list[str]) -> list[str]:
        return validate_channels(value)


class ReportScheduleUpdateRequest(BaseModel):
    cadence: ScheduleCadence | None = None
    timezone: str | None = None
    recipient_user_ids: list[str] | None = None
    delivery_channels: list[NotificationChannel] | None = None
    is_active: bool | None = None

    @field_validator("timezone")
    @classmethod
    def timezone_is_valid(cls, value: str | None) -> str | None:
        return validate_timezone_name(value) if value is not None else None

    @field_validator("recipient_user_ids")
    @classmethod
    def recipients_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_recipient_ids(value) if value is not None else None

    @field_validator("delivery_channels")
    @classmethod
    def channels_are_valid(cls, value: list[str] | None) -> list[str] | None:
        return validate_channels(value) if value is not None else None
