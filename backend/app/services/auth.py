import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PasswordResetToken, User, utc_now
from app.repositories.users import UserRepository
from app.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleLoginRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    UserRead,
)
from app.security import create_access_token, create_reset_token, hash_password, hash_reset_token, verify_password
from app.services.admin_settings import AdminSettingsService

logger = logging.getLogger(__name__)


def token_is_expired(expires_at: datetime) -> bool:
    aware_expires_at = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    return aware_expires_at < utc_now()


def credentials_are_valid(user: User | None, password: str) -> bool:
    return bool(user and user.is_active and verify_password(password, user.hashed_password))


def verify_google_credential(credential: str, client_id: str) -> dict:
    try:
        from google.auth.transport import requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Sign-In is not configured") from exc

    try:
        return id_token.verify_oauth2_token(credential, requests.Request(), client_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In failed") from exc


class AuthService:
    generic_reset_message = "If the account exists, a reset token has been generated."

    def __init__(self, db: Session, repository: UserRepository | None = None) -> None:
        self.db = db
        self.repository = repository or UserRepository(db)
        self.settings = get_settings()
        self.admin_settings = AdminSettingsService(db)

    def login(self, payload: LoginRequest) -> AuthResponse:
        user = self.repository.get_by_email(payload.email)
        if not credentials_are_valid(user, payload.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        return AuthResponse(access_token=create_access_token(user.id), user=UserRead.model_validate(user))

    def google_login(self, payload: GoogleLoginRequest) -> AuthResponse:
        if not self.settings.google_sign_in_client_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Sign-In is not configured")

        claims = verify_google_credential(payload.credential, self.settings.google_sign_in_client_id)
        email = str(claims.get("email") or "").strip().lower()
        if not email or not claims.get("email_verified"):
            logger.info("Google Sign-In rejected because the email claim is missing or unverified.")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In failed")

        if not self.admin_settings.get_email_domain_policy().allows_email(email):
            logger.info("Google Sign-In rejected by domain policy for email domain '%s'.", email.rsplit("@", 1)[-1])
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In is not available for this account")

        user = self.repository.get_by_email(email)
        if user is None or not user.is_active:
            logger.info("Google Sign-In rejected because no active platform user matched the verified Google email.")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In is not available for this account")

        google_sub = claims.get("sub")
        if google_sub:
            normalized_sub = str(google_sub)
            linked_user = self.repository.get_by_google_sub(normalized_sub)
            if linked_user is not None and linked_user.id != user.id:
                logger.warning("Google Sign-In rejected because the Google subject is already linked to another platform user.")
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In is not available for this account")
            user.google_sub = normalized_sub
        user.auth_provider = "google"
        user.last_login_at = utc_now()
        self.repository.save_user(user, refresh=True)
        return AuthResponse(access_token=create_access_token(user.id), user=UserRead.model_validate(user))

    def logout(self) -> MessageResponse:
        return MessageResponse(message="Logged out successfully")

    def request_password_reset(self, payload: ForgotPasswordRequest) -> ForgotPasswordResponse:
        user = self.repository.get_by_email(payload.email)
        token = self._issue_reset_token(user) if user and user.is_active else None
        return ForgotPasswordResponse(
            message=self.generic_reset_message,
            reset_token=token if self.settings.expose_reset_tokens else None,
        )

    def reset_password(self, payload: ResetPasswordRequest) -> MessageResponse:
        reset_token = self.repository.get_unused_reset_token(payload.token)
        if reset_token is None or token_is_expired(reset_token.expires_at):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

        reset_token.user.hashed_password = hash_password(payload.new_password)
        reset_token.used_at = utc_now()
        self.db.commit()
        return MessageResponse(message="Password has been reset successfully")

    def change_password(self, payload: ChangePasswordRequest, user: User) -> MessageResponse:
        if not verify_password(payload.current_password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

        user.hashed_password = hash_password(payload.new_password)
        self.repository.save_user(user)
        return MessageResponse(message="Password updated successfully")

    def _issue_reset_token(self, user: User) -> str:
        raw_token = create_reset_token()
        self.repository.add_reset_token(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_reset_token(raw_token),
                expires_at=utc_now() + timedelta(minutes=self.settings.reset_token_expire_minutes),
            )
        )
        return raw_token
