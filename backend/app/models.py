from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def calendar_days_until(value: date | datetime | None) -> int | None:
    if value is None:
        return None
    value_tzinfo = value.tzinfo if isinstance(value, datetime) else timezone.utc
    now = datetime.now(value_tzinfo or timezone.utc)
    if isinstance(value, datetime) and value.tzinfo is None:
        now = now.replace(tzinfo=None)
    target_date = value.date() if isinstance(value, datetime) else value
    return (target_date - now.date()).days


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False, default="account_manager")
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    avatar_initials: Mapped[str] = mapped_column(String(8), nullable=False, default="KA")
    primary_google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned_accounts: Mapped[list["AccountOwner"]] = relationship(back_populates="user", foreign_keys="AccountOwner.user_id")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    user: Mapped[User] = relationship(back_populates="reset_tokens")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    permissions: Mapped[list["RolePermission"]] = relationship(back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("module", "action", name="uq_permissions_module_action"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    roles: Mapped[list["RolePermission"]] = relationship(back_populates="permission", cascade="all, delete-orphan")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True, nullable=False)
    permission_id: Mapped[str] = mapped_column(ForeignKey("permissions.id", ondelete="CASCADE"), index=True, nullable=False)
    allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship(back_populates="roles")


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    value_json: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class FieldPermission(Base):
    __tablename__ = "field_permissions"
    __table_args__ = (UniqueConstraint("module", "field_key", "role", name="uq_field_permissions_module_field_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    field_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    redaction_strategy: Mapped[str] = mapped_column(String(40), nullable=False, default="mask")
    condition_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ConfigurationChange(Base):
    __tablename__ = "configuration_changes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    change_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="draft")
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    validation_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    published_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    rolled_back_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rolled_back_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class CustomFieldDefinition(Base):
    __tablename__ = "custom_field_definitions"
    __table_args__ = (UniqueConstraint("module", "field_key", name="uq_custom_field_definitions_module_field_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    field_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    field_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    placeholder: Mapped[str | None] = mapped_column(String(160), nullable=True)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    validation_rules: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    default_value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_in_list: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    show_in_detail: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    values: Mapped[list["CustomFieldValue"]] = relationship(back_populates="field_definition", cascade="all, delete-orphan")


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (UniqueConstraint("field_definition_id", "record_id", name="uq_custom_field_values_field_record"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    field_definition_id: Mapped[str] = mapped_column(ForeignKey("custom_field_definitions.id", ondelete="CASCADE"), index=True, nullable=False)
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    record_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    field_definition: Mapped[CustomFieldDefinition] = relationship(back_populates="values")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_number: Mapped[int | None] = mapped_column(Integer, unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    project_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    company_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    segment: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Growth")
    region: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Draft")
    risk_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="warning")
    commercial_value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    service_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    commercial_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_overall: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    health_relationship: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    health_usage: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    health_delivery: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    health_commercial: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    next_governance_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_from_draft_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owners: Mapped[list["AccountOwner"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    ownership_history: Mapped[list["AccountOwnershipHistory"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    engagements: Mapped[list["Engagement"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    source_documents: Mapped[list["SourceDocument"]] = relationship(back_populates="account")
    stakeholders: Mapped[list["Stakeholder"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    stakeholder_coverage_gaps: Mapped[list["StakeholderCoverageGap"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    governance_events: Mapped[list["GovernanceEvent"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    account_plan: Mapped["AccountPlan | None"] = relationship(back_populates="account", cascade="all, delete-orphan")
    whitespace_items: Mapped[list["AccountWhitespaceItem"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    service_recommendations: Mapped[list["ServiceRecommendation"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    renewal_profiles: Mapped[list["EngagementRenewalProfile"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    retention_plans: Mapped[list["RetentionPlan"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    retention_recommendations: Mapped[list["RetentionRecommendation"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    kyc_drafts: Mapped[list["KycDraft"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    kyc_snapshots: Mapped[list["KycSnapshot"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    kyc_agent_runs: Mapped[list["KycAgentRun"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    score_snapshots: Mapped[list["ScoreSnapshot"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    signals: Mapped[list["Signal"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    change_alerts: Mapped[list["AccountChangeAlert"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class AccountChangeAlert(Base):
    __tablename__ = "account_change_alerts"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_account_change_alerts_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    alert_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    reason_code: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    affected_metric: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    previous_value_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    change_magnitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    source_evidence_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    deduplication_key: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="change_alerts")


class AccountOwner(Base):
    __tablename__ = "account_owners"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    user_name: Mapped[str] = mapped_column(String(160), nullable=False)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ownership_role: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_document_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="owners")
    user: Mapped[User | None] = relationship(back_populates="owned_accounts", foreign_keys=[user_id])


class AccountOwnershipHistory(Base):
    __tablename__ = "account_ownership_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    owner_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ownership_role: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    previous_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    previous_user_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    new_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    new_user_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    account: Mapped[Account] = relationship(back_populates="ownership_history")


class OnboardingDraft(Base):
    __tablename__ = "onboarding_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="ready_for_review")
    extraction_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="completed")
    account_name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    project_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    company_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Draft")
    segment: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Growth")
    region: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    service_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    commercial_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    commercial_value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    primary_owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    primary_owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    primary_owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    missing_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    conflicts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    duplicate_account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    approved_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rejected_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source_documents: Mapped[list["SourceDocument"]] = relationship(back_populates="draft")
    engagement_drafts: Mapped[list["OnboardingDraftEngagement"]] = relationship(back_populates="draft", cascade="all, delete-orphan")


class OnboardingDraftEngagement(Base):
    __tablename__ = "onboarding_draft_engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    draft_id: Mapped[str] = mapped_column(ForeignKey("onboarding_drafts.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    ops_lead_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ops_lead_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_lines: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    delivery_status: Mapped[str] = mapped_column(String(80), nullable=False, default="active")
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    commercial_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_dependency: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)

    draft: Mapped[OnboardingDraft] = relationship(back_populates="engagement_drafts")


class SourceDocument(Base):
    __tablename__ = "source_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    draft_id: Mapped[str | None] = mapped_column(ForeignKey("onboarding_drafts.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    storage_backend: Mapped[str | None] = mapped_column(String(40), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(180), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    extracted_text_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    extraction_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extraction_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_status: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    ocr_engine: Mapped[str | None] = mapped_column(String(80), nullable=True)
    uploaded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    extraction_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="completed")
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account | None] = relationship(back_populates="source_documents")
    engagement: Mapped["Engagement | None"] = relationship(back_populates="source_documents")
    draft: Mapped[OnboardingDraft | None] = relationship(back_populates="source_documents")
    citations: Mapped[list["SourceCitation"]] = relationship(back_populates="source_document", cascade="all, delete-orphan")
    extractions: Mapped[list["SourceDocumentExtraction"]] = relationship(back_populates="source_document", cascade="all, delete-orphan")
    chunks: Mapped[list["SourceDocumentChunk"]] = relationship(back_populates="source_document", cascade="all, delete-orphan")

    @property
    def extracted_text(self) -> str | None:
        completed = [item for item in self.extractions if item.status == "completed" and (item.raw_text or item.normalized_text)]
        candidates = completed or [item for item in self.extractions if item.raw_text or item.normalized_text]
        if not candidates:
            return None
        latest = sorted(candidates, key=lambda item: item.completed_at or item.created_at, reverse=True)[0]
        return latest.raw_text or latest.normalized_text


class SourceCitation(Base):
    __tablename__ = "source_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    field_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)

    source_document: Mapped[SourceDocument] = relationship(back_populates="citations")


class SourceDocumentExtraction(Base):
    __tablename__ = "source_document_extractions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    extractor_name: Mapped[str] = mapped_column(String(120), nullable=False, default="local")
    extractor_version: Mapped[str] = mapped_column(String(40), nullable=False, default="v1")
    mime_type: Mapped[str | None] = mapped_column(String(180), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    source_document: Mapped[SourceDocument] = relationship(back_populates="extractions")
    chunks: Mapped[list["SourceDocumentChunk"]] = relationship(back_populates="extraction", cascade="all, delete-orphan")


class DocumentExtraction(Base):
    __tablename__ = "document_extractions"
    __table_args__ = (UniqueConstraint("document_id", "page_number", "checksum", name="uq_document_extractions_document_page_checksum"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    extraction_id: Mapped[str | None] = mapped_column(ForeignKey("source_document_extractions.id", ondelete="CASCADE"), index=True, nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False, default=1)
    source_file: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    extractor_name: Mapped[str] = mapped_column(String(120), nullable=False, default="local-document-extractor")
    extractor_version: Mapped[str] = mapped_column(String(40), nullable=False, default="v1")
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    source_document: Mapped[SourceDocument] = relationship()
    extraction: Mapped[SourceDocumentExtraction | None] = relationship()


class SourceDocumentChunk(Base):
    __tablename__ = "source_document_chunks"
    __table_args__ = (UniqueConstraint("source_document_id", "chunk_hash", name="uq_source_document_chunks_document_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    extraction_id: Mapped[str | None] = mapped_column(ForeignKey("source_document_extractions.id", ondelete="CASCADE"), index=True, nullable=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_label: Mapped[str | None] = mapped_column(String(220), nullable=True)
    start_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sensitivity_level: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="standard")
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    trust_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    embedding_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    embedding_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    embedding_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    source_document: Mapped[SourceDocument] = relationship(back_populates="chunks")
    extraction: Mapped[SourceDocumentExtraction | None] = relationship(back_populates="chunks")
    account: Mapped[Account | None] = relationship()
    engagement: Mapped["Engagement | None"] = relationship()


class KycDraft(Base):
    __tablename__ = "kyc_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="ready_for_review")
    trigger_source: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="account_overview")
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("kyc_agent_runs.id", ondelete="SET NULL"), index=True, nullable=True)
    previous_snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("kyc_snapshots.id", ondelete="SET NULL"), index=True, nullable=True)
    source_document_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    research_sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    fields_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    citations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    missing_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    conflicts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    difference_summary: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    detailed_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    completeness: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_coverage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freshness_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="fresh")
    low_confidence_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conflicts_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    reviewed_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    rejected_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rejected_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_snapshot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="kyc_drafts")
    agent_run: Mapped["KycAgentRun | None"] = relationship(back_populates="drafts")
    previous_snapshot: Mapped["KycSnapshot | None"] = relationship(foreign_keys=[previous_snapshot_id])


class KycSnapshot(Base):
    __tablename__ = "kyc_snapshots"
    __table_args__ = (UniqueConstraint("account_id", "version", name="uq_kyc_snapshots_account_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_draft_id: Mapped[str | None] = mapped_column(
        ForeignKey("kyc_drafts.id", ondelete="SET NULL", use_alter=True, name="fk_kyc_snapshots_source_draft_id"),
        index=True,
        nullable=True,
    )
    extraction_run_id: Mapped[str | None] = mapped_column(ForeignKey("kyc_agent_runs.id", ondelete="SET NULL"), index=True, nullable=True)
    approved_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    fields_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    citations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    detailed_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_document_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    research_sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    completeness: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_coverage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freshness_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="fresh")
    missing_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    conflicts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    change_summary: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    account: Mapped[Account] = relationship(back_populates="kyc_snapshots")
    source_draft: Mapped[KycDraft | None] = relationship(foreign_keys=[source_draft_id])
    extraction_run: Mapped["KycAgentRun | None"] = relationship(foreign_keys=[extraction_run_id])


class KycAgentRun(Base):
    __tablename__ = "kyc_agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    trigger_source: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="kyc_page")
    previous_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_document_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    research_sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    triggered_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    triggered_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_gateway_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    retrieval_summary_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    provider_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    usage_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    cost_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    detailed_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    provider_response_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="kyc_agent_runs")
    drafts: Mapped[list[KycDraft]] = relationship(back_populates="agent_run")
    workstreams: Mapped[list["KycWorkstreamOutput"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class KycWorkstreamOutput(Base):
    __tablename__ = "kyc_workstream_outputs"
    __table_args__ = (UniqueConstraint("run_id", "workstream_key", name="uq_kyc_workstream_outputs_run_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(ForeignKey("kyc_agent_runs.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    workstream_key: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    citations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    missing_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    reviewer_notes_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    follow_up_questions_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    retrieved_chunk_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    provider_response_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    run: Mapped[KycAgentRun] = relationship(back_populates="workstreams")
    account: Mapped[Account] = relationship()


class KycConfiguration(Base):
    __tablename__ = "kyc_configurations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False, default="default")
    required_field_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    freshness_threshold_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    low_confidence_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    research_sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class Engagement(Base):
    __tablename__ = "engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="active")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    ops_lead_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    ops_lead_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_lines: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_links: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    delivery_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="active")
    commercial_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="watch", server_default="watch")
    delivery_health: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    health_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown", server_default="unknown")
    renewal_risk: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown", server_default="unknown")
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    commercial_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_dependency: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="engagements")
    source_documents: Mapped[list[SourceDocument]] = relationship(back_populates="engagement")
    health_snapshots: Mapped[list["EngagementHealthSnapshot"]] = relationship(back_populates="engagement", cascade="all, delete-orphan")
    stakeholders: Mapped[list["Stakeholder"]] = relationship(back_populates="engagement")
    governance_events: Mapped[list["GovernanceEvent"]] = relationship(back_populates="engagement")
    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="engagement")
    whitespace_items: Mapped[list["AccountWhitespaceItem"]] = relationship(back_populates="engagement")
    renewal_profile: Mapped["EngagementRenewalProfile | None"] = relationship(back_populates="engagement", cascade="all, delete-orphan")
    retention_plans: Mapped[list["RetentionPlan"]] = relationship(back_populates="engagement")
    retention_recommendations: Mapped[list["RetentionRecommendation"]] = relationship(back_populates="engagement")
    score_snapshots: Mapped[list["ScoreSnapshot"]] = relationship(back_populates="engagement")
    signals: Mapped[list["Signal"]] = relationship(back_populates="engagement")
    tasks: Mapped[list["Task"]] = relationship(back_populates="engagement")

    @property
    def source_document_ids(self) -> list[str]:
        return [document.id for document in self.source_documents]

    @property
    def contract_value(self) -> float:
        return float(self.value)

    @contract_value.setter
    def contract_value(self, value: float) -> None:
        self.value = value

    @property
    def health_score(self) -> int:
        return self.delivery_health

    @health_score.setter
    def health_score(self, value: int) -> None:
        self.delivery_health = value

    @property
    def resource_dependency_notes(self) -> str | None:
        return self.resource_dependency

    @resource_dependency_notes.setter
    def resource_dependency_notes(self, value: str | None) -> None:
        self.resource_dependency = value

    @property
    def days_to_expiry(self) -> int | None:
        return calendar_days_until(self.end_date)

    @property
    def renewal_status(self) -> str:
        days_to_expiry = self.days_to_expiry
        if days_to_expiry is None:
            return "unknown"
        if days_to_expiry < 0:
            return "expired"

        days_to_renewal = calendar_days_until(self.renewal_date)
        if days_to_renewal is not None and days_to_renewal <= 30:
            return "renewal_due"

        days_to_notice = calendar_days_until(self.notice_deadline)
        if days_to_notice is not None and days_to_notice <= 30:
            return "notice_due"
        if days_to_notice is not None and days_to_notice <= 90:
            return "upcoming_notice_window"

        return "not_due"

    @property
    def created_by(self) -> str | None:
        return self.created_by_id

    @property
    def updated_by(self) -> str | None:
        return self.updated_by_id


class Stakeholder(Base):
    __tablename__ = "stakeholders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    reports_to_stakeholder_id: Mapped[str | None] = mapped_column(ForeignKey("stakeholders.id", ondelete="SET NULL"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    company: Mapped[str | None] = mapped_column(String(180), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    influence: Mapped[str] = mapped_column(String(40), nullable=False, default="medium")
    relationship_strength: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    sentiment: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="neutral")
    political_risk: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_interaction_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="stakeholders")
    engagement: Mapped[Engagement | None] = relationship(back_populates="stakeholders")
    reports_to: Mapped["Stakeholder | None"] = relationship(
        "Stakeholder",
        remote_side=[id],
        back_populates="direct_reports",
    )
    direct_reports: Mapped[list["Stakeholder"]] = relationship(
        "Stakeholder",
        back_populates="reports_to",
    )
    interactions: Mapped[list["StakeholderInteraction"]] = relationship(back_populates="stakeholder", cascade="all, delete-orphan")


class StakeholderInteraction(Base):
    __tablename__ = "stakeholder_interactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    stakeholder_id: Mapped[str] = mapped_column(ForeignKey("stakeholders.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    interaction_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="note")
    subject: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(40), nullable=True)
    relationship_strength: Mapped[str | None] = mapped_column(String(40), nullable=True)
    political_risk: Mapped[str | None] = mapped_column(String(40), nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    interaction_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    stakeholder: Mapped[Stakeholder] = relationship(back_populates="interactions")
    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()


class StakeholderCoverageGap(Base):
    __tablename__ = "stakeholder_coverage_gaps"
    __table_args__ = (UniqueConstraint("account_id", "rule_key", name="uq_stakeholder_coverage_gaps_account_rule"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    rule_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="stakeholder_coverage_gaps")


class StakeholderRoleConfig(Base):
    __tablename__ = "stakeholder_roles"
    __table_args__ = (UniqueConstraint("slug", name="uq_stakeholder_roles_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class StakeholderGapRule(Base):
    __tablename__ = "stakeholder_gap_rules"
    __table_args__ = (UniqueConstraint("rule_key", name="uq_stakeholder_gap_rules_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    rule_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    condition_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class OpportunityType(Base):
    __tablename__ = "opportunity_types"
    __table_args__ = (UniqueConstraint("slug", name="uq_opportunity_types_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="type")


class OpportunityStageDefinition(Base):
    __tablename__ = "opportunity_stage_definitions"
    __table_args__ = (UniqueConstraint("name", name="uq_opportunity_stage_definitions_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    is_terminal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_outcome_reason: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class OpportunityStageTransition(Base):
    __tablename__ = "opportunity_stage_transitions"
    __table_args__ = (UniqueConstraint("from_stage", "to_stage", name="uq_opportunity_stage_transitions_from_to"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    from_stage: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    to_stage: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    requires_reason: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    type_id: Mapped[str] = mapped_column(ForeignKey("opportunity_types.id", ondelete="RESTRICT"), index=True, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    service_line: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    stage: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Identified")
    next_step: Mapped[str] = mapped_column(Text, nullable=False)
    target_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    source_context: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_record_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_record_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    outcome_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    archived_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    archived_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    archive_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="opportunities")
    engagement: Mapped[Engagement | None] = relationship(back_populates="opportunities")
    type: Mapped[OpportunityType] = relationship(back_populates="opportunities")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    stage_history: Mapped[list["OpportunityStageHistory"]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    decisions: Mapped[list["OpportunityDecision"]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    action_items: Mapped[list["OpportunityActionItem"]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")


class OpportunityStageHistory(Base):
    __tablename__ = "opportunity_stage_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    before_stage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    after_stage: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeline_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    opportunity: Mapped[Opportunity] = relationship(back_populates="stage_history")


class OpportunityDecision(Base):
    __tablename__ = "opportunity_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True, nullable=False)
    decision_text: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    timeline_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    opportunity: Mapped[Opportunity] = relationship(back_populates="decisions")


class OpportunityActionItem(Base):
    __tablename__ = "opportunity_action_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    future_task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    opportunity: Mapped[Opportunity] = relationship(back_populates="action_items")


class AccountPlan(Base):
    __tablename__ = "account_plans"
    __table_args__ = (UniqueConstraint("account_id", name="uq_account_plans_account"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    retention_focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    growth_focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    opportunities: Mapped[str | None] = mapped_column(Text, nullable=True)
    commitments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    service_gaps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    review_cadence: Mapped[str | None] = mapped_column(String(80), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="draft")
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="account_plan")
    versions: Mapped[list["AccountPlanVersion"]] = relationship(back_populates="plan", cascade="all, delete-orphan")
    actions: Mapped[list["AccountPlanAction"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class AccountPlanVersion(Base):
    __tablename__ = "account_plan_versions"
    __table_args__ = (UniqueConstraint("account_plan_id", "version", name="uq_account_plan_versions_plan_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_plan_id: Mapped[str] = mapped_column(ForeignKey("account_plans.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    plan: Mapped[AccountPlan] = relationship(back_populates="versions")
    account: Mapped[Account] = relationship()


class AccountPlanAction(Base):
    __tablename__ = "account_plan_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_plan_id: Mapped[str] = mapped_column(ForeignKey("account_plans.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    plan: Mapped[AccountPlan] = relationship(back_populates="actions")
    account: Mapped[Account] = relationship()
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])


class ServiceCatalogItem(Base):
    __tablename__ = "service_catalog_items"
    __table_args__ = (UniqueConstraint("slug", name="uq_service_catalog_items_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    source_adjacencies: Mapped[list["ServiceAdjacencyRule"]] = relationship(
        back_populates="source_service",
        cascade="all, delete-orphan",
        foreign_keys="ServiceAdjacencyRule.source_service_id",
    )
    target_adjacencies: Mapped[list["ServiceAdjacencyRule"]] = relationship(
        back_populates="target_service",
        cascade="all, delete-orphan",
        foreign_keys="ServiceAdjacencyRule.target_service_id",
    )


class ServiceAdjacencyRule(Base):
    __tablename__ = "service_adjacency_rules"
    __table_args__ = (UniqueConstraint("source_service_id", "target_service_id", name="uq_service_adjacency_rules_source_target"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_service_id: Mapped[str] = mapped_column(ForeignKey("service_catalog_items.id", ondelete="CASCADE"), index=True, nullable=False)
    target_service_id: Mapped[str] = mapped_column(ForeignKey("service_catalog_items.id", ondelete="CASCADE"), index=True, nullable=False)
    relevance_score: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    source_service: Mapped[ServiceCatalogItem] = relationship(foreign_keys=[source_service_id], back_populates="source_adjacencies")
    target_service: Mapped[ServiceCatalogItem] = relationship(foreign_keys=[target_service_id], back_populates="target_adjacencies")


class AccountWhitespaceItem(Base):
    __tablename__ = "account_whitespace_items"
    __table_args__ = (UniqueConstraint("account_id", "engagement_id", "service_id", name="uq_account_whitespace_items_scope_service"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="CASCADE"), index=True, nullable=True)
    service_id: Mapped[str] = mapped_column(ForeignKey("service_catalog_items.id", ondelete="RESTRICT"), index=True, nullable=False)
    service_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    coverage_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="whitespace_items")
    engagement: Mapped[Engagement | None] = relationship(back_populates="whitespace_items")
    service: Mapped[ServiceCatalogItem] = relationship()


class ServiceRecommendation(Base):
    __tablename__ = "service_recommendations"
    __table_args__ = (UniqueConstraint("account_id", "target_service_id", "source_service_id", name="uq_service_recommendations_account_target_source"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    source_service_id: Mapped[str | None] = mapped_column(ForeignKey("service_catalog_items.id", ondelete="SET NULL"), index=True, nullable=True)
    target_service_id: Mapped[str] = mapped_column(ForeignKey("service_catalog_items.id", ondelete="CASCADE"), index=True, nullable=False)
    relevance_score: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="recommended")
    source_context: Mapped[str] = mapped_column(String(120), nullable=False, default="adjacency")
    created_opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="service_recommendations")
    source_service: Mapped[ServiceCatalogItem | None] = relationship(foreign_keys=[source_service_id])
    target_service: Mapped[ServiceCatalogItem] = relationship(foreign_keys=[target_service_id])
    created_opportunity: Mapped[Opportunity | None] = relationship()


class EngagementRenewalProfile(Base):
    __tablename__ = "engagement_renewal_profiles"
    __table_args__ = (UniqueConstraint("engagement_id", name="uq_engagement_renewal_profiles_engagement"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id", ondelete="CASCADE"), index=True, nullable=False)
    renewal_readiness: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown")
    renewal_risk: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unknown")
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    commercial_exposure: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    commercial_exposure_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    manual_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="renewal_profiles")
    engagement: Mapped[Engagement] = relationship(back_populates="renewal_profile")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])


class RetentionPlan(Base):
    __tablename__ = "retention_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    plan_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="retention")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    renewal_milestone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_context: Mapped[str | None] = mapped_column(String(160), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="retention_plans")
    engagement: Mapped[Engagement | None] = relationship(back_populates="retention_plans")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    milestones: Mapped[list["RetentionPlanMilestone"]] = relationship(back_populates="plan", cascade="all, delete-orphan")
    actions: Mapped[list["RetentionPlanAction"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class RetentionPlanMilestone(Base):
    __tablename__ = "retention_plan_milestones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    retention_plan_id: Mapped[str] = mapped_column(ForeignKey("retention_plans.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    enforce_action_due_dates: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    plan: Mapped[RetentionPlan] = relationship(back_populates="milestones")
    actions: Mapped[list["RetentionPlanAction"]] = relationship(back_populates="milestone")


class RetentionPlanAction(Base):
    __tablename__ = "retention_plan_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    retention_plan_id: Mapped[str] = mapped_column(ForeignKey("retention_plans.id", ondelete="CASCADE"), index=True, nullable=False)
    milestone_id: Mapped[str | None] = mapped_column(ForeignKey("retention_plan_milestones.id", ondelete="SET NULL"), index=True, nullable=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    future_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    plan: Mapped[RetentionPlan] = relationship(back_populates="actions")
    milestone: Mapped[RetentionPlanMilestone | None] = relationship(back_populates="actions")
    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    future_task: Mapped["Task | None"] = relationship(foreign_keys=[future_task_id])


class RetentionRecommendation(Base):
    __tablename__ = "retention_recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    source_context: Mapped[str] = mapped_column(String(160), nullable=False, default="deterministic")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="recommended")
    created_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="retention_recommendations")
    engagement: Mapped[Engagement | None] = relationship(back_populates="retention_recommendations")
    created_task: Mapped["Task | None"] = relationship(foreign_keys=[created_task_id])


class EngagementHealthSnapshot(Base):
    __tablename__ = "engagement_health_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    overall: Mapped[int] = mapped_column(Integer, nullable=False)
    rag_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    drivers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    freshness_status: Mapped[str] = mapped_column(String(40), nullable=False, default="fresh")
    is_dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    contribution: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    metric_version: Mapped[str] = mapped_column(String(40), nullable=False, default="engagement-v1")
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    engagement: Mapped[Engagement] = relationship(back_populates="health_snapshots")


class AccountHealthRollup(Base):
    __tablename__ = "account_health_rollups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    overall: Mapped[int] = mapped_column(Integer, nullable=False)
    rag_status: Mapped[str] = mapped_column(String(40), nullable=False)
    contributions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    metric_version: Mapped[str] = mapped_column(String(40), nullable=False, default="account-rollup-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ScoringMetricDefinition(Base):
    __tablename__ = "scoring_metric_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="account")
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    thresholds: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    formula: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    freshness_rule: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    owner_role: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    effective_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="draft")
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    versions: Mapped[list["ScoringMetricVersion"]] = relationship(back_populates="metric", cascade="all, delete-orphan")


class ScoringMetricVersion(Base):
    __tablename__ = "scoring_metric_versions"
    __table_args__ = (UniqueConstraint("metric_id", "version", name="uq_scoring_metric_versions_metric_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    metric_id: Mapped[str] = mapped_column(ForeignKey("scoring_metric_definitions.id", ondelete="CASCADE"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    published_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    metric: Mapped[ScoringMetricDefinition] = relationship(back_populates="versions")


class ManualScoreSubmission(Base):
    __tablename__ = "manual_score_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    scope: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="account")
    calculator_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    values_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    evidence_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    validation_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="validated")
    submitted_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ScoreSnapshot(Base):
    __tablename__ = "score_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    job_id: Mapped[str | None] = mapped_column(ForeignKey("scoring_jobs.id", ondelete="SET NULL"), index=True, nullable=True)
    scope: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="account")
    overall: Mapped[int] = mapped_column(Integer, nullable=False)
    rag_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    drivers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    reason_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    metric_version: Mapped[str] = mapped_column(String(80), nullable=False, default="scoring-v1")
    freshness_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="fresh")
    is_dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trend: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    source_context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    calculated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    calculated_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    account: Mapped[Account] = relationship(back_populates="score_snapshots")
    engagement: Mapped[Engagement | None] = relationship(back_populates="score_snapshots")
    job: Mapped["ScoringJob | None"] = relationship(back_populates="snapshots")


class ScoringJob(Base):
    __tablename__ = "scoring_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="manual")
    scope: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="account")
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="queued")
    trigger_source: Mapped[str] = mapped_column(String(120), index=True, nullable=False, default="manual")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    snapshots: Mapped[list[ScoreSnapshot]] = relationship(back_populates="job")


class SignalRule(Base):
    __tablename__ = "signal_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    signal_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="warning")
    condition_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    owner_rule_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    sla_rule_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    signals: Mapped[list["Signal"]] = relationship(back_populates="rule")


class Signal(Base):
    __tablename__ = "signals"
    __table_args__ = (
        UniqueConstraint("account_id", "engagement_id", "rule_id", "source_record_id", "condition_key", name="uq_signals_rule_source_condition"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    rule_id: Mapped[str | None] = mapped_column(ForeignKey("signal_rules.id", ondelete="SET NULL"), index=True, nullable=True)
    signal_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="new")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    reason_codes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    evidence_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    citations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_record_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_record_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    condition_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="signals")
    engagement: Mapped[Engagement | None] = relationship(back_populates="signals")
    rule: Mapped[SignalRule | None] = relationship(back_populates="signals")
    events: Mapped[list["SignalEvent"]] = relationship(back_populates="signal", cascade="all, delete-orphan")


class SignalEvent(Base):
    __tablename__ = "signal_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    signal_id: Mapped[str] = mapped_column(ForeignKey("signals.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    signal: Mapped[Signal] = relationship(back_populates="events")


class TimelineEntry(Base):
    __tablename__ = "timeline_entries"
    __table_args__ = (
        UniqueConstraint("account_id", "source_hash", name="uq_timeline_entries_account_source_hash"),
        UniqueConstraint("account_id", "idempotency_key", name="uq_timeline_entries_account_idempotency_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    performed_by: Mapped[str] = mapped_column(String(36), nullable=False)
    performed_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_record_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_record_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    before_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_immutable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    sensitivity_level: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    mentions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    attachments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    event_type_config_id: Mapped[str | None] = mapped_column(ForeignKey("timeline_event_types.id", ondelete="SET NULL"), index=True, nullable=True)
    retention_policy_id: Mapped[str | None] = mapped_column(ForeignKey("timeline_retention_policies.id", ondelete="SET NULL"), index=True, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    restricted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_hash: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    comments: Mapped[list["TimelineComment"]] = relationship(back_populates="entry", cascade="all, delete-orphan")


class TimelineEventTypeConfig(Base):
    __tablename__ = "timeline_event_types"
    __table_args__ = (UniqueConstraint("slug", name="uq_timeline_event_types_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="general")
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    color_token: Mapped[str] = mapped_column(String(80), nullable=False, default="brand-blue")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    default_visibility: Mapped[str] = mapped_column(String(40), nullable=False, default="public")
    retention_policy_id: Mapped[str | None] = mapped_column(ForeignKey("timeline_retention_policies.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    is_critical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    critical_rule_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class TimelineComment(Base):
    __tablename__ = "timeline_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    timeline_entry_id: Mapped[str] = mapped_column(ForeignKey("timeline_entries.id", ondelete="CASCADE"), index=True, nullable=False)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=False)
    author_name: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mentions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sensitivity_level: Mapped[str | None] = mapped_column(String(40), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    entry: Mapped[TimelineEntry] = relationship(back_populates="comments")


class TimelineRetentionPolicy(Base):
    __tablename__ = "timeline_retention_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="timeline_entry")
    action: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="archive")
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1095)
    reason_template: Mapped[str] = mapped_column(Text, nullable=False, default="Retention policy applied.")
    critical_behavior: Mapped[str] = mapped_column(String(40), nullable=False, default="tombstone")
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=False)
    schedule_interval_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class TimelineRetentionAction(Base):
    __tablename__ = "timeline_retention_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    policy_id: Mapped[str | None] = mapped_column(ForeignKey("timeline_retention_policies.id", ondelete="SET NULL"), index=True, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="timeline_entry")
    action: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class TimelineTombstone(Base):
    __tablename__ = "timeline_tombstones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    original_event_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    retention_policy_id: Mapped[str | None] = mapped_column(ForeignKey("timeline_retention_policies.id", ondelete="SET NULL"), index=True, nullable=True)
    deleted_by_id: Mapped[str] = mapped_column(String(36), nullable=False)
    deleted_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    redacted_metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class HandoverSummary(Base):
    __tablename__ = "handover_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    generated_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=False)
    generated_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    ownership_change_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    selected_sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_set_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    redaction_summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    citations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    content_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    export_metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    share_metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class HandoverShare(Base):
    __tablename__ = "handover_shares"
    __table_args__ = (UniqueConstraint("share_token", name="uq_handover_shares_share_token"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    handover_summary_id: Mapped[str] = mapped_column(ForeignKey("handover_summaries.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    share_token: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class TimelineAiSearchAudit(Base):
    __tablename__ = "timeline_ai_search_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    interpreted_intent: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    redactions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    before_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class AccessLog(Base):
    __tablename__ = "access_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    account_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    field_key: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    actor_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    decision: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    service_lines: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    account_stages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="manual")
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    body_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_storage_backend: Mapped[str | None] = mapped_column(String(40), nullable=True)
    file_mime_type: Mapped[str | None] = mapped_column(String(180), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    popularity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SentContentRecord(Base):
    __tablename__ = "sent_content_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    content_item_id: Mapped[str | None] = mapped_column(ForeignKey("content_items.id", ondelete="SET NULL"), index=True, nullable=True)
    content_title_snapshot: Mapped[str] = mapped_column(String(220), nullable=False)
    content_type_snapshot: Mapped[str] = mapped_column(String(80), nullable=False)
    sender_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    sender_name: Mapped[str] = mapped_column(String(160), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    follow_up_status: Mapped[str] = mapped_column(String(60), index=True, nullable=False, default="not_required")
    follow_up_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeline_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()
    content_item: Mapped[ContentItem | None] = relationship()


class Escalation(Base):
    __tablename__ = "escalations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    summary: Mapped[str] = mapped_column(String(260), index=True, nullable=False)
    impact: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    watchlist: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=False)
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recovery_actions: Mapped[str | None] = mapped_column(Text, nullable=True)
    communication_cadence: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    rca: Mapped[str | None] = mapped_column(Text, nullable=True)
    closure_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    closure_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()
    updates: Mapped[list["EscalationUpdate"]] = relationship(back_populates="escalation", cascade="all, delete-orphan")
    notifications: Mapped[list["EscalationNotification"]] = relationship(back_populates="escalation", cascade="all, delete-orphan")


class EscalationUpdate(Base):
    __tablename__ = "escalation_updates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    escalation_id: Mapped[str] = mapped_column(ForeignKey("escalations.id", ondelete="CASCADE"), index=True, nullable=False)
    update_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="operations_update")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    escalation: Mapped[Escalation] = relationship(back_populates="updates")


class EscalationNotification(Base):
    __tablename__ = "escalation_notifications"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_escalation_notifications_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    escalation_id: Mapped[str] = mapped_column(ForeignKey("escalations.id", ondelete="CASCADE"), index=True, nullable=False)
    recipient_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recipient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    channel: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="in_app")
    trigger: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    sla_window_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="queued")
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    escalation: Mapped[Escalation] = relationship(back_populates="notifications")


class NotificationTriggerConfig(Base):
    __tablename__ = "notification_trigger_configs"
    __table_args__ = (UniqueConstraint("trigger", name="uq_notification_trigger_configs_trigger"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    trigger: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    workflow: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="general")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    recipient_policy: Mapped[str] = mapped_column(String(120), nullable=False, default="explicit")
    action_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    default_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="in_app")
    default_digest_cadence: Mapped[str] = mapped_column(String(40), nullable=False, default="daily")
    supported_channels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    timing_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="immediate")
    timing_unit: Mapped[str] = mapped_column(String(40), nullable=False, default="business_days")
    lead_time_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lead_time_direction: Mapped[str | None] = mapped_column(String(40), nullable=True)
    pending_threshold_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    repeat_every_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    escalation_after_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_recipient_policy: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(10), nullable=True)
    quiet_hours_end: Mapped[str | None] = mapped_column(String(10), nullable=True)
    template_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id", "trigger", name="uq_notification_preferences_user_trigger"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    trigger: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(40), nullable=False, default="in_app")
    digest_cadence: Mapped[str] = mapped_column(String(40), nullable=False, default="daily")
    policy_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class NotificationRecord(Base):
    __tablename__ = "notification_records"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_notification_records_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    recipient_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    recipient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trigger: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    workflow: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    account_name_snapshot: Mapped[str | None] = mapped_column(String(180), nullable=True)
    source_record_type: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    source_record_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    action_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    channel: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="in_app")
    delivery_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="queued")
    delivery_metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    email_queued: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)


class SlaRule(Base):
    __tablename__ = "sla_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    item_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    severity: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    inactivity_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=1440)
    qualifying_activities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    recipient_policy: Mapped[str] = mapped_column(String(80), nullable=False, default="kam_head")
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class SlaEscalatedItem(Base):
    __tablename__ = "sla_escalated_items"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_sla_escalated_items_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    rule_id: Mapped[str | None] = mapped_column(ForeignKey("sla_rules.id", ondelete="SET NULL"), index=True, nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    recipient_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    recipient_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    escalated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    sla_window_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="escalated")
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class DigestSchedule(Base):
    __tablename__ = "digest_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    cadence: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="weekly")
    timezone: Mapped[str] = mapped_column(String(120), nullable=False, default="UTC")
    recipients_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sections_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    filters_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    delivery_channels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class DigestRun(Base):
    __tablename__ = "digest_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    schedule_id: Mapped[str | None] = mapped_column(ForeignKey("digest_schedules.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="generated")
    recipients_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sections_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    content_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    redactions_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    delivery_attempts_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    generated_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ReportDefinition(Base):
    __tablename__ = "report_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="private")
    data_source: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    fields_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    filters_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    grouping_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    layout_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    export_format: Mapped[str] = mapped_column(String(40), nullable=False, default="csv")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now, onupdate=utc_now)


class ReportSchedule(Base):
    __tablename__ = "report_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    report_id: Mapped[str] = mapped_column(ForeignKey("report_definitions.id", ondelete="CASCADE"), index=True, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    cadence: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="weekly")
    timezone: Mapped[str] = mapped_column(String(120), nullable=False, default="UTC")
    recipients_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    delivery_channels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ReportRun(Base):
    __tablename__ = "report_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    report_id: Mapped[str | None] = mapped_column(ForeignKey("report_definitions.id", ondelete="SET NULL"), index=True, nullable=True)
    schedule_id: Mapped[str | None] = mapped_column(ForeignKey("report_schedules.id", ondelete="SET NULL"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="generated")
    export_format: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="csv")
    content_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    storage_metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    permission_scope_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    recipients_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    generated_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ScheduledWorkerRun(Base):
    __tablename__ = "scheduled_worker_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="scheduled")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    matched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False, default="System")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)


class GovernanceRecurrenceRule(Base):
    __tablename__ = "governance_recurrence_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    governance_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    cadence: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    interval: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_policy: Mapped[str] = mapped_column(String(40), nullable=False, default="never")
    occurrences: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=True)
    segment: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class GovernanceEvent(Base):
    __tablename__ = "governance_events"
    __table_args__ = (UniqueConstraint("deduplication_key", name="uq_governance_events_deduplication_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    governance_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(60), index=True, nullable=False, default="manual")
    external_provider: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    external_event_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    mapping_confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    review_required: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="scheduled")
    agenda: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    attendees: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    recurrence_rule_id: Mapped[str | None] = mapped_column(ForeignKey("governance_recurrence_rules.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account | None] = relationship(back_populates="governance_events")
    engagement: Mapped[Engagement | None] = relationship(back_populates="governance_events")
    recurrence_rule: Mapped[GovernanceRecurrenceRule | None] = relationship()
    decisions: Mapped[list["GovernanceDecision"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    action_items: Mapped[list["GovernanceActionItem"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    source_citations: Mapped[list["GovernanceSourceCitation"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class GovernanceDecision(Base):
    __tablename__ = "governance_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    governance_event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    decision_text: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    timeline_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="decisions")


class GovernanceActionItem(Base):
    __tablename__ = "governance_action_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    governance_event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="action_items")


class GovernanceSourceCitation(Base):
    __tablename__ = "governance_source_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    governance_event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    source_module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    source_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    label: Mapped[str] = mapped_column(String(180), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="source_citations")


class PlaybookTemplate(Base):
    __tablename__ = "playbook_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    objective: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    signal_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    weak_metrics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    activities_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    default_owner_rule: Mapped[str] = mapped_column(String(80), nullable=False, default="account_primary_am")
    due_date_rule: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    skip_rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="active")
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now, onupdate=utc_now)

    activities: Mapped[list["PlaybookTemplateActivity"]] = relationship(back_populates="template", cascade="all, delete-orphan")
    executions: Mapped[list["PlaybookExecution"]] = relationship(back_populates="template")


class PlaybookTemplateActivity(Base):
    __tablename__ = "playbook_template_activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    template_id: Mapped[str] = mapped_column(ForeignKey("playbook_templates.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_rule: Mapped[str] = mapped_column(String(80), nullable=False, default="account_primary_am")
    due_offset_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    skip_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    requires_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    template: Mapped[PlaybookTemplate] = relationship(back_populates="activities")


class PlaybookExecution(Base):
    __tablename__ = "playbook_executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    template_id: Mapped[str | None] = mapped_column(ForeignKey("playbook_templates.id", ondelete="SET NULL"), index=True, nullable=True)
    template_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    template_version_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    source_signal_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    source_signal_type: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    source_metric: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    skipped_activity_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    skip_reasons: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    template_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    template: Mapped[PlaybookTemplate | None] = relationship(back_populates="executions")
    tasks: Mapped[list["Task"]] = relationship(back_populates="playbook_execution")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    playbook_execution_id: Mapped[str | None] = mapped_column(ForeignKey("playbook_executions.id", ondelete="SET NULL"), index=True, nullable=True)
    template_activity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    source_record_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_metric: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="medium")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    requires_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    skipped_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()
    playbook_execution: Mapped[PlaybookExecution | None] = relationship(back_populates="tasks")
    evidence: Mapped[list["TaskEvidence"]] = relationship(back_populates="task", cascade="all, delete-orphan")


class TaskEvidence(Base):
    __tablename__ = "task_evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="note")
    title: Mapped[str | None] = mapped_column(String(220), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_storage_backend: Mapped[str | None] = mapped_column(String(40), nullable=True)
    file_mime_type: Mapped[str | None] = mapped_column(String(180), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    task: Mapped[Task] = relationship(back_populates="evidence")


class UserIntegrationConnection(Base):
    __tablename__ = "user_integration_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_user_integration_connections_user_provider"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="configuration_required")
    auth_type: Mapped[str] = mapped_column(String(60), nullable=False, default="api_key")
    credentials_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    settings_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class MeetingArtifact(Base):
    __tablename__ = "meeting_artifacts"
    __table_args__ = (UniqueConstraint("owner_id", "provider", "external_id", name="uq_meeting_artifacts_owner_provider_external"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="fathom")
    external_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    meeting_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_link: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    linked_object_type: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    linked_object_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="draft")
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class IntegrationConnection(Base):
    __tablename__ = "integration_connections"
    __table_args__ = (UniqueConstraint("provider", name="uq_integration_connections_provider"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="configuration_required")
    auth_type: Mapped[str] = mapped_column(String(60), nullable=False, default="api_key")
    credentials_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    settings_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sync_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_failure_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class IntegrationSyncLog(Base):
    __tablename__ = "integration_sync_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_record_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    deduplication_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class IntegrationSyncRun(Base):
    __tablename__ = "integration_sync_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="running")
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_type: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class IntegrationMappingRule(Base):
    __tablename__ = "integration_mapping_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    pattern: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    source_field: Mapped[str] = mapped_column(String(120), nullable=False, default="title")
    target_account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    target_engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    target_event_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class IntegrationImportedItem(Base):
    __tablename__ = "integration_imported_items"
    __table_args__ = (UniqueConstraint("provider", "external_id", name="uq_integration_imported_items_provider_external"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_link: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    source_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    mapping_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="unmapped")
    review_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    review_required: Mapped[bool] = mapped_column(Boolean, index=True, nullable=False, default=True)
    deduplication_key: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    sanitized_payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    result_record_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class FathomTaskSuggestion(Base):
    __tablename__ = "fathom_task_suggestions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    imported_item_id: Mapped[str] = mapped_column(ForeignKey("integration_imported_items.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(220), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    imported_item: Mapped[IntegrationImportedItem] = relationship()
    created_task: Mapped[Task | None] = relationship()


class CsatScore(Base):
    __tablename__ = "csat_scores"
    __table_args__ = (UniqueConstraint("source_label", "source_id", name="uq_csat_scores_source"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    scale_min: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    scale_max: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    normalized_score: Mapped[int] = mapped_column(Integer, index=True, nullable=False, default=0)
    category_scores_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    category_weights_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    weighted_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_label: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    source_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    source_link: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    freshness_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="fresh")
    score_impact_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    trend_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    timeline_entry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    scoring_snapshot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship()
    engagement: Mapped[Engagement | None] = relationship()


class AiGatewayRun(Base):
    __tablename__ = "ai_gateway_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    request_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    permission_scope_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_context_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    research_sources_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    response_labels_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    prompt_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    response_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    feedback_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_records_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)


class KamAiChatSession(Base):
    __tablename__ = "kam_ai_chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False, default="New KAM AI chat")
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    scope_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    account: Mapped[Account | None] = relationship()
    messages: Mapped[list["KamAiChatMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class KamAiChatMessage(Base):
    __tablename__ = "kam_ai_chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id: Mapped[str] = mapped_column(ForeignKey("kam_ai_chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="complete")
    intent: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    token_usage_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_gateway_run_id: Mapped[str | None] = mapped_column(ForeignKey("ai_gateway_runs.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped[KamAiChatSession] = relationship(back_populates="messages")
    sources: Mapped[list["KamAiChatMessageSource"]] = relationship(back_populates="message", cascade="all, delete-orphan")
    ai_gateway_run: Mapped[AiGatewayRun | None] = relationship()


class KamAiChatMessageSource(Base):
    __tablename__ = "kam_ai_chat_message_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    message_id: Mapped[str] = mapped_column(ForeignKey("kam_ai_chat_messages.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), index=True, nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    source_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    citation_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    message: Mapped[KamAiChatMessage] = relationship(back_populates="sources")
    account: Mapped[Account | None] = relationship()


class KamAiSourceChunk(Base):
    __tablename__ = "kam_ai_source_chunks"
    __table_args__ = (UniqueConstraint("account_id", "source_type", "source_record_id", "chunk_hash", name="uq_kam_ai_source_chunks_identity"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_route: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    embedding_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    embedding_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    embedding_dimensions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sensitivity_level: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="standard")
    permission_module: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    permission_action: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_trust_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship()
