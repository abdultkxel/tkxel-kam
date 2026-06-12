from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import get_capability_service, get_current_user, get_profile_service
from app.models import User
from app.schemas import ProfileUpdateRequest, UserCapabilitiesRead, UserRead
from app.services.capabilities import CapabilityService
from app.services.profile import ProfileService

router = APIRouter(prefix="/api/users", tags=["Users & Profile"])


@router.get(
    "/me",
    response_model=UserRead,
    summary="Read my profile",
    description="Returns editable profile fields for the authenticated user represented by the bearer token.",
    response_description="Current authenticated user profile.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}},
)
def read_profile(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.get(
    "/me/capabilities",
    response_model=UserCapabilitiesRead,
    summary="Read my effective capabilities",
    description=(
        "Returns the authenticated user's effective permission keys plus high-level capability "
        "booleans used by the frontend for navigation, sensitive data, portfolio scope, approvals, exports, "
        "and moderation. Role-title checks should not be used for product authorization."
    ),
    response_description="Effective permission keys and derived capability flags for the authenticated user.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}},
)
def read_capabilities(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CapabilityService, Depends(get_capability_service)],
) -> UserCapabilitiesRead:
    return service.read_for_user(current_user)


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Update my profile",
    description=(
        "Validates and updates profile metadata such as name, title, phone, and avatar initials for the "
        "authenticated user."
    ),
    response_description="Updated authenticated user profile.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ProfileService, Depends(get_profile_service)],
) -> User:
    return service.update_profile(current_user, payload)
