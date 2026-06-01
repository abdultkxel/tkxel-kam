from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import KycConfiguration, User
from app.rbac import DEFAULT_ROLES
from app.security import hash_password
from app.services.email_domains import EmailDomainPolicyService
from app.services.rbac import RbacService
from app.services.users import initials_for_name, normalize_email

DEFAULT_ROLE_USER_EMAIL_DOMAIN = "tkxel.com"


def seed_default_data(db: Session) -> User:
    RbacService(db).seed_defaults()
    super_admin = seed_super_admin(db)
    seed_allowed_email_domains(db, super_admin)
    seed_default_role_users(db)
    seed_kyc_configuration(db)
    return super_admin


def seed_allowed_email_domains(db: Session, super_admin: User) -> None:
    settings = get_settings()
    EmailDomainPolicyService(db).seed_allowed_domains(settings.allowed_email_domains, actor=super_admin)


def seed_kyc_configuration(db: Session) -> KycConfiguration:
    from app.services.kyc import DEFAULT_RESEARCH_SOURCES, FIELD_CATALOG, FRESHNESS_THRESHOLD_DAYS, LOW_CONFIDENCE_THRESHOLD

    existing = db.scalar(select(KycConfiguration).where(KycConfiguration.name == "default"))
    required_field_keys = [field["key"] for field in FIELD_CATALOG if field.get("required", True)]
    if existing:
        existing.required_field_keys = required_field_keys
        existing.freshness_threshold_days = existing.freshness_threshold_days or FRESHNESS_THRESHOLD_DAYS
        existing.low_confidence_threshold = existing.low_confidence_threshold or LOW_CONFIDENCE_THRESHOLD
        existing.research_sources = existing.research_sources or list(DEFAULT_RESEARCH_SOURCES)
        db.commit()
        db.refresh(existing)
        return existing

    configuration = KycConfiguration(
        name="default",
        required_field_keys=required_field_keys,
        freshness_threshold_days=FRESHNESS_THRESHOLD_DAYS,
        low_confidence_threshold=LOW_CONFIDENCE_THRESHOLD,
        research_sources=list(DEFAULT_RESEARCH_SOURCES),
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return configuration


def seed_super_admin(db: Session) -> User:
    settings = get_settings()
    email = normalize_email(settings.super_admin_email)
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        return existing_user

    user = User(
        email=email,
        hashed_password=hash_password(settings.super_admin_password),
        full_name=settings.super_admin_full_name,
        role="super_admin",
        title=settings.super_admin_title,
        avatar_initials=initials_for_name(settings.super_admin_full_name),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_default_role_users(db: Session) -> list[User]:
    settings = get_settings()
    seeded_users: list[User] = []
    for role in DEFAULT_ROLES:
        if role.slug == "super_admin":
            continue
        email = normalize_email(f"{role.slug.replace('_', '.')}.user@{DEFAULT_ROLE_USER_EMAIL_DOMAIN}")
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user:
            seeded_users.append(existing_user)
            continue

        full_name = role.name.replace(" / ", " ").replace("/", " ")
        user = User(
            email=email,
            hashed_password=hash_password(settings.seed_user_password),
            full_name=full_name,
            role=role.slug,
            title=role.name,
            avatar_initials=initials_for_name(full_name),
            is_active=True,
        )
        db.add(user)
        seeded_users.append(user)

    db.commit()
    for user in seeded_users:
        db.refresh(user)
    return seeded_users
