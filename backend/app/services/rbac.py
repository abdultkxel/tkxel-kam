from itertools import product

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Permission, Role, User
from app.rbac import ACTIONS, DEFAULT_ROLES, MODULES, default_permission_keys_for, permission_key
from app.repositories.rbac import RbacRepository
from app.schemas import MessageResponse, RoleCreateRequest, RolePageRead, RolePermissionsUpdateRequest, RoleUpdateRequest
from app.services.user_management import page_count


def permission_description(module_name: str, action: str) -> str:
    return f"Allows {action.replace('_', ' ')} access for {module_name}."


def role_not_found(slug: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Role '{slug}' was not found")


class RbacService:
    def __init__(self, db: Session, repository: RbacRepository | None = None) -> None:
        self.repository = repository or RbacRepository(db)

    def seed_defaults(self) -> dict[str, int]:
        permissions_by_key = self._seed_permissions()
        roles_seeded = 0

        for default_role in DEFAULT_ROLES:
            existing_role = self.repository.get_role_by_slug(default_role.slug)
            role = self.repository.upsert_role(
                slug=default_role.slug,
                name=default_role.name,
                description=default_role.description,
                is_system=True,
            )
            allowed_keys = default_permission_keys_for(default_role)
            for key in allowed_keys:
                if existing_role is None or not self._role_has_permission_row(role, key):
                    self.repository.set_role_permission(role, permissions_by_key[key], True)
            roles_seeded += 1

        self.repository.commit()
        return {"roles": roles_seeded, "permissions": len(permissions_by_key)}

    def list_roles(
        self,
        search: str | None = None,
        role_type: str = "all",
        page: int = 1,
        page_size: int = 10,
    ) -> RolePageRead:
        roles, total = self.repository.list_manageable_roles(search, role_type, page, page_size)
        return RolePageRead(items=roles, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_role(self, slug: str) -> Role:
        role = self.repository.get_role_by_slug(slug)
        if role is None:
            raise role_not_found(slug)
        return role

    def list_permissions(self) -> list[Permission]:
        return self.repository.list_permissions()

    def create_role(self, payload: RoleCreateRequest) -> Role:
        existing_role = self.repository.get_role_by_slug(payload.slug)
        if existing_role is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A role with this slug already exists")

        role = self.repository.upsert_role(payload.slug, payload.name, payload.description, is_system=False)
        self.repository.commit()
        return self.get_role(role.slug)

    def update_role(self, slug: str, payload: RoleUpdateRequest) -> Role:
        role = self.get_role(slug)
        updates = payload.model_dump(exclude_unset=True)
        if "name" in updates and updates["name"] is not None:
            role.name = updates["name"]
        if "description" in updates:
            role.description = updates["description"]

        self.repository.commit()
        return self.get_role(slug)

    def update_role_permissions(self, slug: str, payload: RolePermissionsUpdateRequest) -> Role:
        role = self.get_role(slug)
        for grant in payload.permissions:
            permission = self.repository.get_permission(grant.module, grant.action)
            if permission is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Permission '{grant.module}:{grant.action}' is not defined in the PRD module catalog",
                )
            self.repository.set_role_permission(role, permission, grant.allowed)

        self.repository.commit()
        return self.get_role(slug)

    def delete_role(self, slug: str) -> MessageResponse:
        role = self.get_role(slug)
        if role.is_system:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System roles cannot be deleted")
        if self.repository.count_users_for_role(role.slug):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role is assigned to users and cannot be deleted")

        self.repository.delete_role(role)
        return MessageResponse(message="Role deleted successfully")

    def user_has_permission(self, user: User, module: str, action: str) -> bool:
        return self.repository.role_has_permission(user.role, module, action)

    def role_exists(self, slug: str) -> bool:
        return self.repository.get_role_by_slug(slug) is not None

    def _seed_permissions(self) -> dict[str, Permission]:
        permissions_by_key: dict[str, Permission] = {}
        for (module, module_name), action in product(MODULES, ACTIONS):
            permission = self.repository.upsert_permission(module, action, permission_description(module_name, action))
            permissions_by_key[permission_key(module, action)] = permission
        return permissions_by_key

    @staticmethod
    def _role_has_permission_row(role: Role, key: str) -> bool:
        return any(permission_key(item.permission.module, item.permission.action) == key for item in role.permissions)
