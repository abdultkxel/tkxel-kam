from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import get_auth_service, get_current_user
from app.models import User
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
from app.services.auth import AuthService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
    description=(
        "Step 1 of authenticated use. Validates the submitted login form, verifies the active PostgreSQL user, "
        "and returns a bearer JWT plus the current user profile."
    ),
    response_description="Bearer token and authenticated user profile.",
    responses={
        401: {"description": "Invalid credentials or inactive account."},
        403: {"description": "Email domain is not allowed."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def login(payload: LoginRequest, service: Annotated[AuthService, Depends(get_auth_service)]) -> AuthResponse:
    return service.login(payload)


@router.post(
    "/google",
    response_model=AuthResponse,
    summary="Log in with Google Sign-In",
    description=(
        "Verifies a Google Identity Services ID token, requires a verified Google email, enforces the allowed-domain "
        "policy, and only signs in existing active local users."
    ),
    response_description="Bearer token and authenticated user profile.",
    responses={
        401: {"description": "Invalid Google credential or no active local user."},
        403: {"description": "Google email is unverified or domain is not allowed."},
        503: {"description": "Google Sign-In is not configured."},
    },
)
def google_sign_in(payload: GoogleSignInRequest, service: Annotated[AuthService, Depends(get_auth_service)]) -> AuthResponse:
    return service.google_sign_in(payload)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Log out the current user",
    description=(
        "Step 2 of session lifecycle. Confirms logout for stateless JWT clients. "
        "The frontend completes logout by deleting the stored token."
    ),
    response_description="Logout confirmation message.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}},
)
def logout(_: Annotated[User, Depends(get_current_user)], service: Annotated[AuthService, Depends(get_auth_service)]) -> MessageResponse:
    return service.logout()


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get the authenticated user",
    description="Step 3 of session lifecycle. Returns the user profile represented by the bearer token.",
    response_description="Current authenticated user profile.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}},
)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Start password reset",
    description=(
        "Creates a time-limited password reset token when the email exists. The response is generic to avoid account "
        "enumeration; local development can expose the token for manual testing."
    ),
    response_description="Generic reset response. A token is included only when local development exposure is enabled.",
    responses={422: {"description": "Field-level validation errors with meaningful messages."}},
)
def forgot_password(payload: ForgotPasswordRequest, service: Annotated[AuthService, Depends(get_auth_service)]) -> ForgotPasswordResponse:
    return service.request_password_reset(payload)


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password with token",
    description=(
        "Step 2 of password recovery. Validates the reset form, verifies the token, marks it as used, "
        "and stores the new password hash."
    ),
    response_description="Password reset confirmation message.",
    responses={
        400: {"description": "Invalid, expired, or already used reset token."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def reset_password(payload: ResetPasswordRequest, service: Annotated[AuthService, Depends(get_auth_service)]) -> MessageResponse:
    return service.reset_password(payload)


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change password while authenticated",
    description=(
        "Authenticated password maintenance. Validates the change-password form, checks the current password, "
        "and stores the replacement password hash."
    ),
    response_description="Password change confirmation message.",
    responses={
        400: {"description": "Current password is incorrect."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> MessageResponse:
    return service.change_password(payload, current_user)
