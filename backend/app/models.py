from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
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


class Engagement(Base):
    __tablename__ = "engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    account_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    name: Mapped[str] = mapped_column(String(180), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="active")
    source_document_links: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notice_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    ops_lead_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ops_lead_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_lines: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    delivery_status: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    delivery_health: Mapped[int] = mapped_column(Integer, nullable=False, default=70)
    resource_dependency: Mapped[str | None] = mapped_column(Text, nullable=True)
    commercial_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    attachments: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    activity_notes: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    escalation_notes: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    health_rag_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    health_drivers: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    health_freshness: Mapped[str] = mapped_column(String(40), nullable=False, default="not_calculated")
    health_dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    health_contribution: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.0000"))
    formula_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    health_snapshots: Mapped[list["EngagementHealthSnapshot"]] = relationship(back_populates="engagement", cascade="all, delete-orphan")


class EngagementHealthSnapshot(Base):
    __tablename__ = "engagement_health_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    engagement_id: Mapped[str] = mapped_column(ForeignKey("engagements.id", ondelete="CASCADE"), index=True, nullable=False)
    account_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    rag_status: Mapped[str] = mapped_column(String(20), nullable=False)
    drivers: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    freshness: Mapped[str] = mapped_column(String(40), nullable=False)
    contribution_to_account_health: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.0000"))
    formula_version: Mapped[str] = mapped_column(String(80), nullable=False)
    dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metric_inputs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    engagement: Mapped[Engagement] = relationship(back_populates="health_snapshots")


class AccountHealthSnapshot(Base):
    __tablename__ = "account_health_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    account_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    rollup_score: Mapped[int] = mapped_column(Integer, nullable=False)
    formula_version: Mapped[str] = mapped_column(String(80), nullable=False)
    contributions: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    dirty_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
