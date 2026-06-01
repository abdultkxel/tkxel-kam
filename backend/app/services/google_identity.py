from dataclasses import dataclass

from fastapi import HTTPException, status

from app.config import get_settings


@dataclass(frozen=True)
class GoogleIdentity:
    email: str
    email_verified: bool


class GoogleIdentityService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def verify_credential(self, credential: str) -> GoogleIdentity:
        if not self.settings.google_sign_in_client_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Sign-In is not configured")

        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token
        except ImportError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Sign-In is not configured") from exc

        try:
            payload = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                self.settings.google_sign_in_client_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google Sign-In credential") from exc

        email = str(payload.get("email") or "").strip()
        email_verified = payload.get("email_verified") is True or str(payload.get("email_verified")).lower() == "true"
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google Sign-In credential")

        return GoogleIdentity(email=email, email_verified=email_verified)
