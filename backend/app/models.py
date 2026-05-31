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

    account: Mapped[Account | None] = relationship()
    engagement: Mapped[Engagement | None] = relationship()
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
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    objective: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    signal_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    weak_metrics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    default_owner_rule: Mapped[str] = mapped_column(String(80), nullable=False, default="account_primary_am")
    due_date_rule: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    success_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    skip_rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
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
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="todo")
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
