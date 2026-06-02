from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User
from app.repositories.rbac import RbacRepository
from app.repositories.users import UserRepository
from app.schemas import MessageResponse, UserCreateRequest, UserPageRead, UserUpdateRequest
from app.security import hash_password
from app.services.email_domains import EmailDomainPolicyService
from app.services.email_delivery import EmailDeliveryService
from app.services.users import initials_for_name, normalize_email


class UserManagementService:
    def __init__(
        self,
        db: Session,
        user_repository: UserRepository | None = None,
        rbac_repository: RbacRepository | None = None,
        email_delivery: EmailDeliveryService | None = None,
    ) -> None:
        self.users = user_repository or UserRepository(db)
        self.rbac = rbac_repository or RbacRepository(db)
        self.domain_policy = EmailDomainPolicyService(db)
        self.email_delivery = email_delivery or EmailDeliveryService()

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

    def create_user(self, payload: UserCreateRequest, actor: User | None = None) -> User:
        self._ensure_role_exists(payload.role)
        email = normalize_email(payload.email)
        self.domain_policy.require_allowed_email_for_user_form(email)
        if self.users.get_by_email(email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

        user = User(
            email=email,
            primary_google_calendar_id=payload.primary_google_calendar_id or email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role=payload.role,
            title=payload.title,
            phone=payload.phone,
            avatar_initials=payload.avatar_initials or initials_for_name(payload.full_name),
            is_active=payload.is_active,
        )
        created = self.users.create_user(user)
        self.email_delivery.send_template(
            "user_created",
            recipient_email=created.email,
            recipient_name=created.full_name,
            context={
                "recipient_name": created.full_name,
                "email": created.email,
                "temporary_password": payload.password,
                "login_url": self.email_delivery.absolute_url("/login"),
            },
        )
        return created

    def update_user(self, user_id: str, payload: UserUpdateRequest, actor: User | None = None) -> User:
        user = self.get_user(user_id)
        updates = payload.model_dump(exclude_unset=True)
        if "role" in updates and updates["role"] is not None:
            self._ensure_role_exists(updates["role"])
        self._validate_email_update(user, updates)

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

    def _validate_email_update(self, user: User, updates: dict) -> None:
        target_email = user.email
        email_changed = False
        if "email" in updates and updates["email"] is not None:
            target_email = normalize_email(updates["email"])
            updates["email"] = target_email
            email_changed = target_email != user.email

        reactivating = updates.get("is_active") is True and not user.is_active
        if email_changed or reactivating:
            self.domain_policy.require_allowed_email_for_user_form(target_email)

        if email_changed:
            existing_user = self.users.get_by_email(target_email)
            if existing_user is not None and existing_user.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")
            if not updates.get("primary_google_calendar_id") and (not user.primary_google_calendar_id or user.primary_google_calendar_id == user.email):
                updates["primary_google_calendar_id"] = target_email

    @staticmethod
    def _apply_updates(user: User, updates: dict) -> None:
        if "email" in updates and updates["email"] is not None:
            user.email = updates["email"]
        required_text_fields = ("full_name", "role", "avatar_initials")
        for field in required_text_fields:
            if field in updates and updates[field] is not None:
                setattr(user, field, updates[field].strip())
        for field in ("title", "phone"):
            if field in updates:
                value = updates[field]
                setattr(user, field, value.strip() if isinstance(value, str) else value)
        if "primary_google_calendar_id" in updates:
            value = updates["primary_google_calendar_id"]
            user.primary_google_calendar_id = value.strip() if isinstance(value, str) and value.strip() else None
        if "is_active" in updates and updates["is_active"] is not None:
            user.is_active = updates["is_active"]


def page_count(total: int, page_size: int) -> int:
    return (total + page_size - 1) // page_size if total else 0
