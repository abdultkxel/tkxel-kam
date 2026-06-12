from sqlalchemy.orm import Session

from app.models import User
from app.rbac_catalog import ALL_CATALOG_KEYS, PERMISSIONS
from app.repositories.rbac import RbacRepository
from app.schemas import UserCapabilitiesRead


class CapabilityService:
    def __init__(self, db: Session, rbac: RbacRepository | None = None) -> None:
        self.rbac = rbac or RbacRepository(db)

    def permission_keys_for(self, user: User) -> set[str]:
        keys = self.rbac.list_role_permission_keys(user.role)
        return {key for key in keys if key in ALL_CATALOG_KEYS}

    def has(self, user: User, permission_key: str) -> bool:
        module, action = permission_key.split(":", 1)
        return self.rbac.role_has_permission(user.role, module, action)

    def has_any(self, user: User, permission_keys: set[str] | tuple[str, ...] | list[str]) -> bool:
        return any(self.has(user, key) for key in permission_keys)

    def read_for_user(self, user: User) -> UserCapabilitiesRead:
        keys = self.permission_keys_for(user)
        ordered_keys = [permission.key for permission in PERMISSIONS if permission.key in keys]
        return UserCapabilitiesRead(
            permission_keys=ordered_keys,
            can_access_admin=self._has_any_key(
                keys,
                {
                    "access_admin:view_users",
                    "access_admin:manage_users",
                    "access_admin:view_roles",
                    "access_admin:manage_roles",
                    "access_admin:manage_field_permissions",
                    "access_admin:manage_email_domains",
                    "field_builder:configure",
                    "field_access:configure_policies",
                    "audit:view_logs",
                    "platform_ops:view_health",
                },
            ),
            can_view_portfolio=self._has_any_key(
                keys,
                {
                    "accounts:view_portfolio",
                    "dashboards:view_portfolio",
                    "reports:view_portfolio",
                    "analytics:view_portfolio",
                    "tasks:view_portfolio",
                },
            ),
            can_update_assigned_accounts=self._has_any_key(keys, {"accounts:update_profile_assigned"}),
            can_update_portfolio_accounts=self._has_any_key(keys, {"accounts:update_profile_portfolio", "accounts:update_lifecycle"}),
            can_assign_account_owners=self._has_any_key(keys, {"account_ownership:assign_owner", "onboarding:assign_owner"}),
            can_approve_onboarding=self._has_any_key(keys, {"onboarding:approve_draft", "onboarding:reject_draft", "onboarding:link_existing_account"}),
            can_view_sensitive_sources=self._has_any_key(
                keys,
                {
                    "accounts:view_sensitive_sources",
                    "source_documents:view_sensitive",
                    "kyc:view_sensitive",
                    "timeline:view_sensitive",
                },
            ),
            can_manage_sensitive_sources=self._has_any_key(keys, {"accounts:manage_sensitive_sources", "source_documents:manage_sensitive"}),
            can_approve_kyc=self._has_any_key(keys, {"kyc:approve_draft"}),
            can_moderate_timeline=self._has_any_key(keys, {"timeline:moderate", "timeline:delete_entry"}),
            can_export_reports=self._has_any_key(keys, {"reports:export", "dashboards:export", "analytics:export", "digests:export"}),
            can_configure_playbooks=self._has_any_key(keys, {"playbooks:configure_templates", "playbooks:delete_templates"}),
            can_manage_tasks_portfolio=self._has_any_key(keys, {"tasks:update_portfolio", "tasks:delete"}),
        )

    @staticmethod
    def _has_any_key(keys: set[str], candidates: set[str]) -> bool:
        return bool(keys & candidates)
