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
    GoogleSignInRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    UserRead,
)
from app.security import create_access_token, create_reset_token, hash_password, hash_reset_token, verify_password
from app.services.email_domains import EmailDomainPolicyService
from app.services.google_identity import GoogleIdentityService


def token_is_expired(expires_at: datetime) -> bool:
    aware_expires_at = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    return aware_expires_at < utc_now()


def credentials_are_valid(user: User | None, password: str) -> bool:
    return bool(user and user.is_active and verify_password(password, user.hashed_password))


class AuthService:
    generic_reset_message = "If the account exists, a reset token has been generated."

    def __init__(
        self,
        db: Session,
        repository: UserRepository | None = None,
        domain_policy: EmailDomainPolicyService | None = None,
        google_identity: GoogleIdentityService | None = None,
    ) -> None:
        self.db = db
        self.repository = repository or UserRepository(db)
        self.settings = get_settings()
        self.domain_policy = domain_policy or EmailDomainPolicyService(db)
        self.google_identity = google_identity or GoogleIdentityService()

    def login(self, payload: LoginRequest) -> AuthResponse:
        self.domain_policy.require_allowed_email_for_auth(
            str(payload.email),
            message="This email domain is not allowed. Contact your administrator.",
        )
        user = self.repository.get_by_email(payload.email)
        if not credentials_are_valid(user, payload.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        return AuthResponse(access_token=create_access_token(user.id), user=UserRead.model_validate(user))

    def google_sign_in(self, payload: GoogleSignInRequest) -> AuthResponse:
        identity = self.google_identity.verify_credential(payload.credential)
        if not identity.email_verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Google Sign-In requires a verified email address.")

        self.domain_policy.require_allowed_email_for_auth(
            identity.email,
            message="Google Sign-In is not allowed for this email domain. Contact your administrator.",
        )
        user = self.repository.get_by_email(identity.email)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google Sign-In is not available for this account.")

        return AuthResponse(access_token=create_access_token(user.id), user=UserRead.model_validate(user))

    def logout(self) -> MessageResponse:
        return MessageResponse(message="Logged out successfully")

    def request_password_reset(self, payload: ForgotPasswordRequest) -> ForgotPasswordResponse:
        if not self.domain_policy.is_email_allowed(str(payload.email)):
            self.domain_policy.log_domain_block(str(payload.email), "password_reset")
            return ForgotPasswordResponse(message=self.generic_reset_message, reset_token=None)

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
