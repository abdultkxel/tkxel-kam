import re
from typing import Any

PASSWORD_UPPERCASE = re.compile(r"[A-Z]")
PASSWORD_LOWERCASE = re.compile(r"[a-z]")
PASSWORD_NUMBER = re.compile(r"\d")
PASSWORD_SPECIAL = re.compile(r"[^A-Za-z0-9]")
PHONE_PATTERN = re.compile(r"^[0-9+\-()\s.]+$")
AVATAR_PATTERN = re.compile(r"^[A-Za-z0-9]{1,8}$")


def require_text(value: Any, field_label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_label} is required.")
    return value.strip()


def validate_password(value: Any, field_label: str = "Password") -> str:
    password = require_text(value, field_label)
    checks = [
        (len(password) >= 8, f"{field_label} must be at least 8 characters."),
        (bool(PASSWORD_UPPERCASE.search(password)), f"{field_label} must include at least one uppercase letter."),
        (bool(PASSWORD_LOWERCASE.search(password)), f"{field_label} must include at least one lowercase letter."),
        (bool(PASSWORD_NUMBER.search(password)), f"{field_label} must include at least one number."),
        (bool(PASSWORD_SPECIAL.search(password)), f"{field_label} must include at least one special character."),
    ]
    failed_check = next((message for passed, message in checks if not passed), None)
    if failed_check:
        raise ValueError(failed_check)
    return password


def validate_existing_password(value: Any) -> str:
    password = require_text(value, "Current password")
    if len(password) < 8:
        raise ValueError("Current password must be at least 8 characters.")
    return password


def validate_reset_token(value: Any) -> str:
    token = require_text(value, "Reset token")
    if len(token) < 20:
        raise ValueError("Reset token must be at least 20 characters.")
    return token


def optional_text(value: Any, field_label: str, max_length: int, min_length: int = 0) -> str | None:
    if value is None:
        return None
    text = require_text(value, field_label) if min_length else str(value).strip()
    if not text:
        return None
    if len(text) < min_length:
        raise ValueError(f"{field_label} must be at least {min_length} characters.")
    if len(text) > max_length:
        raise ValueError(f"{field_label} must be {max_length} characters or fewer.")
    return text


def validate_phone(value: Any) -> str | None:
    phone = optional_text(value, "Phone", max_length=40)
    if phone is None:
        return None
    if not PHONE_PATTERN.fullmatch(phone):
        raise ValueError("Phone can contain only numbers, spaces, plus signs, dashes, periods, and parentheses.")
    return phone


def validate_avatar_initials(value: Any) -> str | None:
    initials = optional_text(value, "Avatar initials", max_length=8, min_length=1)
    if initials is None:
        return None
    if not AVATAR_PATTERN.fullmatch(initials):
        raise ValueError("Avatar initials can contain only letters and numbers.")
    return initials.upper()
