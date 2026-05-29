from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Permission, Role, RolePermission, User


class RbacRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_roles(self) -> list[Role]:
        return list(self.db.scalars(select(Role).options(selectinload(Role.permissions).selectinload(RolePermission.permission)).order_by(Role.name)))

    def list_manageable_roles(self) -> list[Role]:
        return list(
            self.db.scalars(
                select(Role)
                .where(Role.slug != "super_admin")
                .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
                .order_by(Role.name)
            )
        )

    def get_role_by_slug(self, slug: str) -> Role | None:
        return self.db.scalar(
            select(Role)
            .where(Role.slug == slug)
            .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        )

    def list_permissions(self) -> list[Permission]:
        return list(self.db.scalars(select(Permission).order_by(Permission.module, Permission.action)))

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

    def upsert_permission(self, module: str, action: str, description: str | None = None) -> Permission:
        permission = self.get_permission(module, action)
        if permission is None:
            permission = Permission(module=module, action=action, description=description)
            self.db.add(permission)
            self.db.flush()
            return permission

        permission.description = description
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
        if role_slug == "super_admin":
            return True

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

    def count_users_for_role(self, role_slug: str) -> int:
        return self.db.scalar(select(func.count(User.id)).where(User.role == role_slug)) or 0

    def delete_role(self, role: Role) -> None:
        self.db.delete(role)
        self.db.commit()

    def commit(self) -> None:
        self.db.commit()
