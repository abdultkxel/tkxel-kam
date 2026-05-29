from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, get_profile_service
from app.models import User
from app.schemas import ProfileUpdateRequest, UserRead
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
