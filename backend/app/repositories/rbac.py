from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Permission, Role, RolePermission, User
from app.permission_resolver import permission_key_candidates
from app.rbac_catalog import permission_key


ROLE_PERMISSION_ALIASES = {
    "delivery_stakeholder": "delivery_lead",
}
HIDDEN_MANAGEABLE_ROLE_SLUGS = {"super_admin"}


class RbacRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_roles(self) -> list[Role]:
        return list(self.db.scalars(select(Role).options(selectinload(Role.permissions).selectinload(RolePermission.permission)).order_by(Role.name)))

    def list_manageable_roles(
        self,
        search: str | None = None,
        role_type: str = "all",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Role], int]:
        conditions = self._manageable_role_conditions(search, role_type)
        total = self.db.scalar(select(func.count(Role.id)).where(*conditions)) or 0
        roles = list(
            self.db.scalars(
                select(Role)
                .where(*conditions)
                .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
                .order_by(Role.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return roles, total

    def get_role_by_slug(self, slug: str) -> Role | None:
        return self.db.scalar(
            select(Role)
            .where(Role.slug == slug)
            .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        )

    def list_permissions(self) -> list[Permission]:
        return list(
            self.db.scalars(
                select(Permission).order_by(
                    Permission.display_order,
                    Permission.section_name,
                    Permission.module,
                    Permission.action,
                )
            )
        )

    def get_permission(self, module: str, action: str) -> Permission | None:
        return self.db.scalar(select(Permission).where(Permission.module == module, Permission.action == action))

    def get_permission_by_id(self, permission_id: str) -> Permission | None:
        return self.db.get(Permission, permission_id)

    def upsert_role(self, slug: str, name: str, description: str | None, is_system: bool = True) -> Role:
        role = self.get_role_by_slug(slug)
        if role is None:
            role = Role(slug=slug, name=name, description=description, is_system=is_system)
            self.db.add(role)
            self.db.flush()
            return role

        role.name = name
        role.description = description
        role.is_system = is_system
        return role

    def upsert_permission(
        self,
        module: str,
        action: str,
        description: str | None = None,
        *,
        section_name: str | None = None,
        section_purpose: str | None = None,
        action_label: str | None = None,
        risk_level: str = "medium",
        dependencies: tuple[str, ...] | list[str] = (),
        tags: tuple[str, ...] | list[str] = (),
        display_order: int = 0,
    ) -> Permission:
        permission = self.get_permission(module, action)
        if permission is None:
            permission = Permission(module=module, action=action)
            self.db.add(permission)
            self.db.flush()

        permission.description = description
        permission.section_name = section_name
        permission.section_purpose = section_purpose
        permission.action_label = action_label
        permission.risk_level = risk_level
        permission.dependencies_json = list(dependencies)
        permission.tags_json = list(tags)
        permission.display_order = display_order
        permission.is_deprecated = False
        return permission

    def set_role_permission(self, role: Role, permission: Permission, allowed: bool) -> RolePermission:
        role_permission = next((item for item in role.permissions if item.permission_id == permission.id), None)
        if role_permission is None:
            role_permission = RolePermission(role_id=role.id, permission_id=permission.id, allowed=allowed)
            self.db.add(role_permission)
            role.permissions.append(role_permission)
            return role_permission

        role_permission.allowed = allowed
        return role_permission

    def role_has_permission(self, role_slug: str, module: str, action: str) -> bool:
        return any(
            self._role_has_exact_permission(candidate_role, candidate)
            for candidate_role in self._permission_lookup_roles(role_slug)
            for candidate in permission_key_candidates(module, action)
        )

    def list_role_permission_keys(self, role_slug: str) -> set[str]:
        conditions = [Role.slug.in_(self._permission_lookup_roles(role_slug)), RolePermission.allowed.is_(True)]
        return {
            permission_key(module, action)
            for module, action in self.db.execute(
                select(Permission.module, Permission.action)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .join(Role, Role.id == RolePermission.role_id)
                .where(*conditions)
            )
        }

    def delete_permissions_not_in(self, allowed_keys: set[str]) -> int:
        permissions = list(self.db.scalars(select(Permission).options(selectinload(Permission.roles))))
        removed = 0
        for permission in permissions:
            if permission_key(permission.module, permission.action) in allowed_keys:
                continue
            for grant in list(permission.roles):
                self.db.delete(grant)
            self.db.delete(permission)
            removed += 1
        return removed

    def delete_system_roles_not_in(self, allowed_slugs: set[str]) -> int:
        roles = list(self.db.scalars(select(Role).where(Role.is_system.is_(True), ~Role.slug.in_(allowed_slugs))))
        for role in roles:
            self.db.delete(role)
        return len(roles)

    def _role_has_exact_permission(self, role_slug: str, key: str) -> bool:
        module, action = key.split(":", 1)
        return bool(
            self.db.scalar(
                select(RolePermission.id)
                .join(Role, Role.id == RolePermission.role_id)
                .join(Permission, Permission.id == RolePermission.permission_id)
                .where(
                    Role.slug == role_slug,
                    Permission.module == module,
                    Permission.action == action,
                    RolePermission.allowed.is_(True),
                )
            )
        )

    @staticmethod
    def _permission_lookup_roles(role_slug: str) -> tuple[str, ...]:
        alias = ROLE_PERMISSION_ALIASES.get(role_slug)
        if alias is None:
            return (role_slug,)
        return (role_slug, alias)

    def count_users_for_role(self, role_slug: str) -> int:
        return self.db.scalar(select(func.count(User.id)).where(User.role == role_slug)) or 0

    def delete_role(self, role: Role) -> None:
        self.db.delete(role)
        self.db.commit()

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _manageable_role_conditions(search: str | None, role_type: str) -> list:
        conditions = [~Role.slug.in_(HIDDEN_MANAGEABLE_ROLE_SLUGS)]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Role.slug.ilike(term), Role.name.ilike(term), Role.description.ilike(term)))
        if role_type == "system":
            conditions.append(Role.is_system.is_(True))
        if role_type == "custom":
            conditions.append(Role.is_system.is_(False))
        return conditions
