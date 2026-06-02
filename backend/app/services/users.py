from app.models import User


def initials_for_name(name: str) -> str:
    parts = [part for part in name.strip().split() if part]
    if not parts:
        return "KA"
    return "".join(part[0].upper() for part in parts[:2])


def normalize_email(email: str) -> str:
    return email.strip().lower()


def apply_profile_updates(user: User, updates: dict) -> User:
    for field, value in updates.items():
        if value is not None:
            setattr(user, field, value.strip() if isinstance(value, str) else value)
    return user
