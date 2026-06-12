from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_custom_field_service, get_email_domain_policy_service, get_rbac_service, get_user_management_service, require_permission
from app.models import CustomFieldDefinition, Permission, Role, User
from app.rbac import ADMIN_MODULE
from app.schemas import (
    CustomFieldDefinitionCreateRequest,
    CustomFieldDefinitionPageRead,
    CustomFieldDefinitionRead,
    CustomFieldDefinitionUpdateRequest,
    CustomFieldModuleRead,
    CustomFieldSort,
    CustomFieldStatus,
    CustomFieldType,
    AllowedEmailDomainsRead,
    AllowedEmailDomainsUpdateRequest,
    PermissionRead,
    MessageResponse,
    RoleCreateRequest,
    RolePermissionsUpdateRequest,
    RolePageRead,
    RoleRead,
    RoleUpdateRequest,
    UserCreateRequest,
    UserPageRead,
    UserRead,
    UserUpdateRequest,
)
from app.services.custom_fields import CustomFieldService
from app.services.email_domains import EmailDomainPolicyService
from app.services.rbac import RbacService
from app.services.user_management import UserManagementService

AdminAccess = Annotated[User, Depends(require_permission(ADMIN_MODULE, "configure"))]
UserStatusFilter = Literal["all", "active", "inactive"]
RoleTypeFilter = Literal["all", "system", "custom"]
Direction = Literal["asc", "desc"]

router = APIRouter(prefix="/api/admin", tags=["Admin RBAC"])


@router.get(
    "/settings/allowed-email-domains",
    response_model=AllowedEmailDomainsRead,
    summary="Read allowed email domains",
    description="Returns the normalized allowed email domain list used by login, Google Sign-In, password reset, and Admin user management.",
    response_description="Allowed email domains with update metadata.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
    },
)
def read_allowed_email_domains(
    _: AdminAccess,
    service: Annotated[EmailDomainPolicyService, Depends(get_email_domain_policy_service)],
) -> AllowedEmailDomainsRead:
    return service.read_allowed_domains()


@router.patch(
    "/settings/allowed-email-domains",
    response_model=AllowedEmailDomainsRead,
    summary="Update allowed email domains",
    description="Normalizes, validates, deduplicates, stores, and audits the configured allowed email domains.",
    response_description="Saved normalized domains with update metadata.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_allowed_email_domains(
    payload: AllowedEmailDomainsUpdateRequest,
    current_user: AdminAccess,
    service: Annotated[EmailDomainPolicyService, Depends(get_email_domain_policy_service)],
) -> AllowedEmailDomainsRead:
    return service.update_allowed_domains(payload, current_user)


@router.get(
    "/users",
    response_model=UserPageRead,
    summary="List managed users",
    description=(
        "Step 1 of user administration. Returns a paginated, searchable list of non-super-admin users for the "
        "Admin/RBAC workspace. Supports search by email/name, role filtering, active/inactive status filtering, "
        "and page/page_size pagination. Requires configure permission for the Admin, Audit, Security, and RBAC module."
    ),
    response_description="Paginated users with assigned role slugs and activation status.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        422: {"description": "Invalid pagination or filter query parameters."},
    },
)
def list_users(
    _: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
    search: Annotated[str | None, Query(description="Search users by email or full name.")] = None,
    status_filter: Annotated[UserStatusFilter, Query(alias="status", description="Filter by active/inactive status.")] = "all",
    role: Annotated[str | None, Query(description="Filter by assigned role slug.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> UserPageRead:
    return service.list_users(search, status_filter, role, page, page_size)


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
    current_user: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> User:
    return service.create_user(payload, current_user)


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
    current_user: AdminAccess,
    service: Annotated[UserManagementService, Depends(get_user_management_service)],
) -> User:
    return service.update_user(user_id, payload, current_user)


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
    response_model=RolePageRead,
    summary="List roles",
    description=(
        "Step 1 of RBAC administration. Returns a paginated, searchable list of non-super-admin roles with their "
        "granted permissions. Supports search by slug/name/description, system/custom type filtering, and "
        "page/page_size pagination."
    ),
    response_description="Paginated roles and permission grants.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        422: {"description": "Invalid pagination or filter query parameters."},
    },
)
def list_roles(
    _: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
    search: Annotated[str | None, Query(description="Search roles by slug, name, or description.")] = None,
    role_type: Annotated[RoleTypeFilter, Query(alias="type", description="Filter by system or custom role type.")] = "all",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> RolePageRead:
    return service.list_roles(search, role_type, page, page_size)


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
    current_user: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.create_role(payload, current_user)


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
    current_user: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.update_role(role_slug, payload, current_user)


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
    current_user: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> MessageResponse:
    return service.delete_role(role_slug, current_user)


@router.get(
    "/permissions",
    response_model=list[PermissionRead],
    summary="List RBAC permission catalog",
    description=(
        "Step 6 of RBAC administration. Returns the service-specific permission catalog with section purpose, "
        "action labels, descriptions, risk level, tags, dependencies, and display order."
    ),
    response_description="List of granular catalog permissions.",
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
        "from the seeded RBAC catalog."
    ),
    response_description="Role with the updated permission grants.",
    responses={
        400: {"description": "Permission module/action is not defined in the RBAC catalog."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Role was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_role_permissions(
    role_slug: str,
    payload: RolePermissionsUpdateRequest,
    current_user: AdminAccess,
    service: Annotated[RbacService, Depends(get_rbac_service)],
) -> Role:
    return service.update_role_permissions(role_slug, payload, current_user)


@router.get(
    "/custom-fields/modules",
    response_model=list[CustomFieldModuleRead],
    summary="List modules available for custom fields",
    description=(
        "Step 1 of Field Builder administration. Returns the PRD module catalog that Admins can target "
        "when adding product-managed custom fields."
    ),
    response_description="Available PRD modules for custom field configuration.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
    },
)
def list_custom_field_modules(
    _: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> list[CustomFieldModuleRead]:
    return service.list_modules()


@router.get(
    "/custom-fields",
    response_model=CustomFieldDefinitionPageRead,
    summary="List custom field definitions",
    description=(
        "Step 2 of Field Builder administration. Returns paginated custom field definitions with search, "
        "module, field type, active/inactive status, sorting, and page/page_size pagination."
    ),
    response_description="Paginated product field definitions.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        422: {"description": "Invalid search/filter/sort/pagination query parameters."},
    },
)
def list_custom_fields(
    _: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
    search: Annotated[str | None, Query(description="Search by label, field key, module, or description.")] = None,
    module: Annotated[str | None, Query(description="PRD module slug filter.")] = None,
    field_type: Annotated[CustomFieldType | None, Query(description="Field type filter.")] = None,
    status_filter: Annotated[CustomFieldStatus, Query(alias="status", description="Filter by active or inactive field definitions.")] = "all",
    sort: Annotated[CustomFieldSort, Query(description="Sort column.")] = "sort_order",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "asc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> CustomFieldDefinitionPageRead:
    return service.list_definitions(
        search=search,
        module=module,
        field_type=field_type,
        status_filter=status_filter,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/custom-fields",
    response_model=CustomFieldDefinitionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom field definition",
    description=(
        "Step 3 of Field Builder administration. Creates a module-scoped custom field using a snake_case key, "
        "validated type, optional select options, display flags, and active/sensitive settings."
    ),
    response_description="Created custom field definition.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        409: {"description": "A custom field with this module and field key already exists."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_custom_field(
    payload: CustomFieldDefinitionCreateRequest,
    current_user: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> CustomFieldDefinition:
    return service.create_definition(payload, current_user)


@router.get(
    "/custom-fields/{field_id}",
    response_model=CustomFieldDefinitionRead,
    summary="Read a custom field definition",
    description="Step 4 of Field Builder administration. Returns one custom field definition for edit or review.",
    response_description="Custom field definition.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Custom field definition was not found."},
    },
)
def read_custom_field(
    field_id: str,
    _: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> CustomFieldDefinition:
    return service.get_definition(field_id)


@router.patch(
    "/custom-fields/{field_id}",
    response_model=CustomFieldDefinitionRead,
    summary="Update a custom field definition",
    description=(
        "Step 5 of Field Builder administration. Updates the module, key, label, type, options, active state, "
        "sensitivity, and display settings while preserving uniqueness within each module."
    ),
    response_description="Updated custom field definition.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Custom field definition was not found."},
        409: {"description": "A custom field with this module and field key already exists."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_custom_field(
    field_id: str,
    payload: CustomFieldDefinitionUpdateRequest,
    current_user: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> CustomFieldDefinition:
    return service.update_definition(field_id, payload, current_user)


@router.delete(
    "/custom-fields/{field_id}",
    response_model=MessageResponse,
    summary="Delete a custom field definition",
    description=(
        "Step 6 of Field Builder administration. Deletes a custom field after frontend confirmation and writes "
        "an audit log entry for the configuration change."
    ),
    response_description="Custom field deletion confirmation message.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user does not have Admin/RBAC configure permission."},
        404: {"description": "Custom field definition was not found."},
    },
)
def delete_custom_field(
    field_id: str,
    current_user: AdminAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> MessageResponse:
    return MessageResponse(**service.delete_definition(field_id, current_user))
