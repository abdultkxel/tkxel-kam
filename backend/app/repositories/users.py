from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PasswordResetToken, User
from app.security import hash_reset_token
from app.services.users import normalize_email


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: str) -> User | None:
        return self.db.scalar(select(User).where(User.id == user_id))

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == normalize_email(email)))

    def add_reset_token(self, reset_token: PasswordResetToken) -> PasswordResetToken:
        self.db.add(reset_token)
        self.db.commit()
        self.db.refresh(reset_token)
        return reset_token

    def get_unused_reset_token(self, token: str) -> PasswordResetToken | None:
        return self.db.scalar(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == hash_reset_token(token),
                PasswordResetToken.used_at.is_(None),
            )
        )

    def save_user(self, user: User, refresh: bool = False) -> User:
        self.db.add(user)
        self.db.commit()
        if refresh:
            self.db.refresh(user)
        return user
