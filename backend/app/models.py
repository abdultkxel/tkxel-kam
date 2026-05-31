from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    project_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    company_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    segment: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Growth")
    region: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Onboarding")
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
    governance_events: Mapped[list["GovernanceEvent"]] = relationship(back_populates="account", cascade="all, delete-orphan")


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
    lifecycle_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="Onboarding")
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


class SourceCitation(Base):
    __tablename__ = "source_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    field_key: Mapped[str | None] = mapped_column(String(120), nullable=True)

    source_document: Mapped[SourceDocument] = relationship(back_populates="citations")


class Engagement(Base):
    __tablename__ = "engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="active")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    ops_lead_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    ops_lead_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_lines: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    delivery_status: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="active")
    delivery_health: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notice_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    commercial_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_dependency: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source_citation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="engagements")
    source_documents: Mapped[list[SourceDocument]] = relationship(back_populates="engagement")
    health_snapshots: Mapped[list["EngagementHealthSnapshot"]] = relationship(back_populates="engagement", cascade="all, delete-orphan")
    governance_events: Mapped[list["GovernanceEvent"]] = relationship(back_populates="engagement")


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


class GovernanceEvent(Base):
    __tablename__ = "governance_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False)
    engagement_id: Mapped[str | None] = mapped_column(ForeignKey("engagements.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    governance_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    agenda: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="upcoming")
    source: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="manual")
    accepted_agenda_output_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    account: Mapped[Account] = relationship(back_populates="governance_events")
    engagement: Mapped[Engagement | None] = relationship(back_populates="governance_events")
    attendees: Mapped[list["GovernanceEventAttendee"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    notes: Mapped[list["GovernanceNote"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    decisions: Mapped[list["GovernanceDecision"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    action_items: Mapped[list["GovernanceActionItem"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    generated_outputs: Mapped[list["GovernanceGeneratedOutput"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class GovernanceEventAttendee(Base):
    __tablename__ = "governance_event_attendees"
    __table_args__ = (UniqueConstraint("event_id", "email", name="uq_governance_event_attendees_event_email"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="attendees")


class GovernanceNote(Base):
    __tablename__ = "governance_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_name: Mapped[str] = mapped_column(String(160), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="notes")


class GovernanceDecision(Base):
    __tablename__ = "governance_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    decision_text: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="decisions")


class GovernanceActionItem(Base):
    __tablename__ = "governance_action_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="open")
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="action_items")


class GovernanceGeneratedOutput(Base):
    __tablename__ = "governance_generated_outputs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("governance_events.id", ondelete="CASCADE"), index=True, nullable=False)
    output_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    generation_method: Mapped[str] = mapped_column(String(80), index=True, nullable=False, default="deterministic")
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="generated")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    disclaimer: Mapped[str] = mapped_column(Text, nullable=False)
    source_filter_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    provider_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    event: Mapped[GovernanceEvent] = relationship(back_populates="generated_outputs")
    citations: Mapped[list["GovernanceGeneratedOutputCitation"]] = relationship(back_populates="output", cascade="all, delete-orphan")


class GovernanceGeneratedOutputCitation(Base):
    __tablename__ = "governance_generated_output_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    output_id: Mapped[str] = mapped_column(ForeignKey("governance_generated_outputs.id", ondelete="CASCADE"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    source_title: Mapped[str] = mapped_column(String(220), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    snippet: Mapped[str] = mapped_column(Text, nullable=False)
    source_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    output: Mapped[GovernanceGeneratedOutput] = relationship(back_populates="citations")


class TimelineEntry(Base):
    __tablename__ = "timeline_entries"

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
