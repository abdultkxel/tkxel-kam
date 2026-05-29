from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User
from app.repositories.rbac import RbacRepository
from app.repositories.users import UserRepository
from app.schemas import MessageResponse, UserCreateRequest, UserPageRead, UserUpdateRequest
from app.security import hash_password
from app.services.users import initials_for_name, normalize_email


class UserManagementService:
    def __init__(
        self,
        db: Session,
        user_repository: UserRepository | None = None,
        rbac_repository: RbacRepository | None = None,
    ) -> None:
        self.users = user_repository or UserRepository(db)
        self.rbac = rbac_repository or RbacRepository(db)

    def list_users(
        self,
        search: str | None = None,
        status_filter: str = "all",
        role: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> UserPageRead:
        users, total = self.users.list_manageable_users(search, status_filter, role, page, page_size)
        return UserPageRead(items=users, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_user(self, user_id: str) -> User:
        user = self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User was not found")
        return user

    def create_user(self, payload: UserCreateRequest) -> User:
        self._ensure_role_exists(payload.role)
        email = normalize_email(payload.email)
        if self.users.get_by_email(email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

        user = User(
            email=email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role=payload.role,
            title=payload.title,
            phone=payload.phone,
            avatar_initials=payload.avatar_initials or initials_for_name(payload.full_name),
            is_active=payload.is_active,
        )
        return self.users.create_user(user)

    def update_user(self, user_id: str, payload: UserUpdateRequest) -> User:
        user = self.get_user(user_id)
        updates = payload.model_dump(exclude_unset=True)
        if "role" in updates and updates["role"] is not None:
            self._ensure_role_exists(updates["role"])

        self._apply_updates(user, updates)
        return self.users.save_user(user, refresh=True)

    def delete_user(self, user_id: str, current_user: User) -> MessageResponse:
        user = self.get_user(user_id)
        if user.id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

        self.users.delete_user(user)
        return MessageResponse(message="User deleted successfully")

    def _ensure_role_exists(self, slug: str) -> None:
        if self.rbac.get_role_by_slug(slug) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Role '{slug}' does not exist")

    @staticmethod
    def _apply_updates(user: User, updates: dict) -> None:
        required_text_fields = ("full_name", "role", "avatar_initials")
        for field in required_text_fields:
            if field in updates and updates[field] is not None:
                setattr(user, field, updates[field].strip())
        for field in ("title", "phone"):
            if field in updates:
                value = updates[field]
                setattr(user, field, value.strip() if isinstance(value, str) else value)
        if "is_active" in updates and updates["is_active"] is not None:
            user.is_active = updates["is_active"]


def page_count(total: int, page_size: int) -> int:
    return (total + page_size - 1) // page_size if total else 0
