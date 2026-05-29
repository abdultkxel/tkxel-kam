from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.dependencies import get_rbac_service, get_user_management_service, require_permission
from app.models import Permission, Role, User
from app.rbac import ADMIN_MODULE
from app.schemas import (
    PermissionRead,
    MessageResponse,
    RoleCreateRequest,
    RolePermissionsUpdateRequest,
    RoleRead,
    RoleUpdateRequest,
    UserCreateRequest,
    UserRead,
    UserUpdateRequest,
)
from app.services.rbac import RbacService
from app.services.user_management import UserManagementService

AdminAccess = Annotated[User, Depends(require_permission(ADMIN_MODULE, "configure"))]

router = APIRouter(prefix="/api/admin", tags=["Admin RBAC"])


@router.get(
    "/users",
    response_model=list[UserRead],
    summary="List managed users",
    description=(
        "Step 1 of user administration. Returns all platform users for the Admin/RBAC workspace. "
        "Requires configure permission for the Admin, Audit, Security, and RBAC module."
    ),
    response_description="List of users with assigned role slugs and activation status.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
    },
)
def list_users(
    _: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> list[User]:
    return service.list_users()


@router.post(
    "/users",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a managed user",
    description=(
        "Step 2 of user administration. Validates user form data, verifies the role exists, hashes the password, "
        "and creates an active or inactive user record."
    ),
    response_description="Created user profile without password data.",
    responses={
        400: {"description": "Assigned role does not exist."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        409: {"description": "A user with this email already exists."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_user(
    payload: UserCreateRequest,
    _: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> User:
    return service.create_user(payload)


@router.get(
    "/users/{user_id}",
    response_model=UserRead,
    summary="Read a managed user",
    description="Step 3 of user administration. Returns a single user by ID for review or editing.",
    response_description="User profile with assigned role slug and activation status.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "User was not found."},
    },
)
def read_user(
    user_id: str,
    _: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> User:
    return service.get_user(user_id)


@router.patch(
    "/users/{user_id}",
    response_model=UserRead,
    summary="Update a managed user",
    description=(
        "Step 4 of user administration. Updates user identity, role assignment, profile fields, and activation state. "
        "Role updates are accepted only when the role slug exists."
    ),
    response_description="Updated user profile.",
    responses={
        400: {"description": "Assigned role does not exist."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "User was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    _: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> User:
    return service.update_user(user_id, payload)


@router.delete(
    "/users/{user_id}",
    response_model=MessageResponse,
    summary="Delete a managed user",
    description=(
        "Step 5 of user administration. Deletes a user account after frontend confirmation. "
        "The authenticated administrator cannot delete their own account."
    ),
    response_description="User deletion confirmation message.",
    responses={
        400: {"description": "Administrator attempted to delete their own account."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "User was not found."},
    },
)
def delete_user(
    user_id: str,
    current_user: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> MessageResponse:
    return service.delete_user(user_id, current_user)


@router.get(
    "/roles",
    response_model=list[RoleRead],
    summary="List roles",
    description="Step 1 of RBAC administration. Returns all seeded and custom roles with their granted permissions.",
    response_description="List of roles and permission grants.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
    },
)
def list_roles(_: AdminAccess, service: Annotated[RbacService, Depends(get_rbac_service)]) -> list[Role]:
    return service.list_roles()


@router.post(
    "/roles",
    response_model=RoleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a role",
    description=(
        "Step 2 of RBAC administration. Creates a custom role using a snake_case slug. "
        "Permissions can be granted afterward through the role permissions endpoint."
    ),
    response_description="Created role with an empty permission grant list.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        409: {"description": "A role with this slug already exists."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_role(
    payload: RoleCreateRequest,
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.create_role(payload)


@router.get(
    "/roles/{role_slug}",
    response_model=RoleRead,
    summary="Read a role",
    description="Step 3 of RBAC administration. Returns one seeded or custom role with the granted module permissions.",
    response_description="Role and permission grant details.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Role was not found."},
    },
)
def read_role(
    role_slug: str,
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.get_role(role_slug)


@router.patch(
    "/roles/{role_slug}",
    response_model=RoleRead,
    summary="Update a role",
    description="Step 4 of RBAC administration. Updates a role display name and description while keeping the slug stable.",
    response_description="Updated role and permission grant details.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Role was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_role(
    role_slug: str,
    payload: RoleUpdateRequest,
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.update_role(role_slug, payload)


@router.delete(
    "/roles/{role_slug}",
    response_model=MessageResponse,
    summary="Delete a role",
    description=(
        "Step 5 of RBAC administration. Deletes a custom role after frontend confirmation. "
        "Seeded system roles and roles assigned to users are protected from deletion."
    ),
    response_description="Role deletion confirmation message.",
    responses={
        400: {"description": "System role or assigned role cannot be deleted."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Role was not found."},
    },
)
def delete_role(
    role_slug: str,
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> MessageResponse:
    return service.delete_role(role_slug)


@router.get(
    "/permissions",
    response_model=list[PermissionRead],
    summary="List module permissions",
    description=(
        "Step 6 of RBAC administration. Returns the PRD-derived permission catalog generated from platform modules "
        "and supported actions."
    ),
    response_description="List of module/action permissions.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
    },
)
def list_permissions(_: AdminAccess, service: Annotated[RbacService, Depends(get_rbac_service)]) -> list[Permission]:
    return service.list_permissions()


@router.put(
    "/roles/{role_slug}/permissions",
    response_model=RoleRead,
    summary="Update role permissions",
    description=(
        "Step 7 of RBAC administration. Upserts allow/deny grants for an existing role using module/action pairs "
        "from the seeded PRD permission catalog."
    ),
    response_description="Role with the updated permission grants.",
    responses={
        400: {"description": "Permission module/action is not defined in the PRD catalog."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Role was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_role_permissions(
    role_slug: str,
    payload: RolePermissionsUpdateRequest,
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.update_role_permissions(role_slug, payload)
