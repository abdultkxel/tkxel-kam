from __future__ import annotations

import base64
import hashlib
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

ENCRYPTED_MARKER = "__encrypted__"
SECRET_KEY_FRAGMENTS = ("token", "secret", "password", "api_key", "bearer")


def _fernet() -> Fernet:
    settings = get_settings()
    seed = settings.integration_credential_encryption_key or settings.jwt_secret_key
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def is_secret_key(key: str) -> bool:
    normalized = key.lower()
    return any(fragment in normalized for fragment in SECRET_KEY_FRAGMENTS)


def encrypt_secret(value: Any) -> Any:
    if value in (None, ""):
        return value
    if isinstance(value, dict) and ENCRYPTED_MARKER in value:
        return value
    token = _fernet().encrypt(str(value).encode("utf-8")).decode("utf-8")
    return {ENCRYPTED_MARKER: token}


def decrypt_secret(value: Any) -> Any:
    if not isinstance(value, dict) or ENCRYPTED_MARKER not in value:
        return value
    token = str(value.get(ENCRYPTED_MARKER) or "")
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return value


def encrypt_credentials(credentials: dict[str, Any] | None) -> dict[str, Any] | None:
    if credentials is None:
        return None
    encrypted: dict[str, Any] = {}
    for key, value in credentials.items():
        if is_secret_key(key):
            encrypted[key] = encrypt_secret(value)
        elif isinstance(value, dict):
            encrypted[key] = encrypt_credentials(value)
        else:
            encrypted[key] = value
    return encrypted


def decrypt_credentials(credentials: dict[str, Any] | None) -> dict[str, Any]:
    if not credentials:
        return {}
    decrypted: dict[str, Any] = {}
    for key, value in credentials.items():
        if is_secret_key(key):
            decrypted[key] = decrypt_secret(value)
        elif isinstance(value, dict):
            decrypted[key] = decrypt_credentials(value)
        else:
            decrypted[key] = value
    return decrypted
