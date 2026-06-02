from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import PasswordResetToken, User
from app.security import hash_reset_token
from app.services.users import normalize_email


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: str) -> User | None:
        return self.db.scalar(select(User).where(User.id == user_id))

    def list_users(self) -> list[User]:
        return list(self.db.scalars(select(User).order_by(User.full_name, User.email)))

    def list_manageable_users(
        self,
        search: str | None = None,
        status_filter: str = "all",
        role: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[User], int]:
        conditions = self._manageable_user_conditions(search, status_filter, role)
        total = self.db.scalar(select(func.count(User.id)).where(*conditions)) or 0
        users = list(
            self.db.scalars(
                select(User)
                .where(*conditions)
                .order_by(User.full_name, User.email)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return users, total

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

    def create_user(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_user(self, user: User) -> None:
        self.db.delete(user)
        self.db.commit()

    @staticmethod
    def _manageable_user_conditions(search: str | None, status_filter: str, role: str | None) -> list:
        conditions = [User.role != "super_admin"]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(User.email.ilike(term), User.full_name.ilike(term)))
        if status_filter == "active":
            conditions.append(User.is_active.is_(True))
        if status_filter == "inactive":
            conditions.append(User.is_active.is_(False))
        if role and role.strip():
            conditions.append(User.role == role.strip())
        return conditions
