from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.repositories.users import UserRepository
from app.security import decode_access_token
from app.services.auth import AuthService
from app.services.accounts import AccountService
from app.services.custom_fields import CustomFieldService
from app.services.engagements import EngagementService
from app.services.governance import GovernanceService
from app.services.onboarding import OnboardingService
from app.services.profile import ProfileService
from app.services.rbac import RbacService
from app.services.user_management import UserManagementService

bearer_scheme = HTTPBearer(
    bearerFormat="JWT",
    description="Paste the access_token returned by POST /api/auth/login.",
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive or no longer exists")

    return user


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db)


def get_profile_service(db: Annotated[Session, Depends(get_db)]) -> ProfileService:
    return ProfileService(db)


def get_rbac_service(db: Annotated[Session, Depends(get_db)]) -> RbacService:
    return RbacService(db)


def get_user_management_service(db: Annotated[Session, Depends(get_db)]) -> UserManagementService:
    return UserManagementService(db)


def get_custom_field_service(db: Annotated[Session, Depends(get_db)]) -> CustomFieldService:
    return CustomFieldService(db)


def get_account_service(db: Annotated[Session, Depends(get_db)]) -> AccountService:
    return AccountService(db)


def get_onboarding_service(db: Annotated[Session, Depends(get_db)]) -> OnboardingService:
    return OnboardingService(db)


def get_engagement_service(db: Annotated[Session, Depends(get_db)]) -> EngagementService:
    return EngagementService(db)


def get_governance_service(db: Annotated[Session, Depends(get_db)]) -> GovernanceService:
    return GovernanceService(db)


def require_permission(module: str, action: str):
    def permission_dependency(
        current_user: Annotated[User, Depends(get_current_user)],
        service: Annotated[RbacService, Depends(get_rbac_service)],
    ) -> User:
        if service.user_has_permission(current_user, module, action):
            return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")

    return permission_dependency
