from fastapi import HTTPException, status

from app.models import Account, User
from app.repositories.accounts import AM_OWNERSHIP_ROLES, AccountRepository
from app.repositories.rbac import RbacRepository


ASSIGNED_SCOPE_ONLY_ROLES = {"account_manager"}
PORTFOLIO_VIEW_PERMISSIONS = {
    "accounts:view_portfolio",
    "dashboards:view_portfolio",
    "reports:view_portfolio",
    "analytics:view_portfolio",
}
PORTFOLIO_EDIT_PERMISSIONS = {"accounts:update_profile_portfolio", "accounts:update_lifecycle"}
ASSIGNED_ACCOUNT_UPDATE_PERMISSIONS = {"accounts:update_profile_assigned"}
ACCOUNT_ASSIGN_PERMISSIONS = {"account_ownership:assign_owner", "onboarding:assign_owner"}
ONBOARDING_APPROVAL_PERMISSIONS = {"onboarding:approve_draft", "onboarding:reject_draft", "onboarding:link_existing_account"}
SENSITIVE_SOURCE_PERMISSIONS = {"accounts:view_sensitive_sources", "source_documents:view_sensitive", "kyc:view_sensitive", "timeline:view_sensitive"}


class AccountAccessService:
    def __init__(self, accounts: AccountRepository, rbac: RbacRepository) -> None:
        self.accounts = accounts
        self.rbac = rbac

    def require_module_permission(self, user: User, module: str, action: str) -> None:
        if not self.rbac.role_has_permission(user.role, module, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")

    def has_any_permission(self, user: User, permission_keys: set[str]) -> bool:
        return any(self.rbac.role_has_permission(user.role, *permission_key.split(":", 1)) for permission_key in permission_keys)

    def can_view_portfolio(self, user: User) -> bool:
        if user.role in ASSIGNED_SCOPE_ONLY_ROLES:
            return False
        return self.has_any_permission(user, PORTFOLIO_VIEW_PERMISSIONS)

    def can_update_portfolio_accounts(self, user: User) -> bool:
        if user.role in ASSIGNED_SCOPE_ONLY_ROLES:
            return False
        return self.has_any_permission(user, PORTFOLIO_EDIT_PERMISSIONS)

    def can_update_assigned_accounts(self, user: User) -> bool:
        return self.has_any_permission(user, ASSIGNED_ACCOUNT_UPDATE_PERMISSIONS)

    def can_assign_account_owners(self, user: User) -> bool:
        return self.has_any_permission(user, ACCOUNT_ASSIGN_PERMISSIONS)

    def can_approve_onboarding(self, user: User) -> bool:
        return self.has_any_permission(user, ONBOARDING_APPROVAL_PERMISSIONS)

    def can_view_sensitive_sources(self, user: User) -> bool:
        return self.has_any_permission(user, SENSITIVE_SOURCE_PERMISSIONS)

    def can_view_account(self, user: User, account: Account) -> bool:
        if self.can_view_portfolio(user):
            return True
        ownership_roles = self.assigned_account_view_roles(user)
        return any(
            owner.user_id == user.id
            and owner.is_active
            and (ownership_roles is None or owner.ownership_role in ownership_roles)
            for owner in account.owners
        )

    def assigned_account_view_roles(self, user: User) -> set[str] | None:
        if user.role == "account_manager":
            return AM_OWNERSHIP_ROLES
        return None

    def visible_account_ids(self, user: User) -> list[str] | None:
        if self.can_view_portfolio(user):
            return None
        return self.accounts.list_account_ids_for_user(user.id, ownership_roles=self.assigned_account_view_roles(user))

    def can_update_account(self, user: User, account: Account) -> bool:
        if self.can_update_portfolio_accounts(user):
            return True
        if not self.can_update_assigned_accounts(user):
            return False
        return any(owner.user_id == user.id and owner.is_active and owner.ownership_role in {"primary_am", "supporting_am"} for owner in account.owners)

    def require_account_view(self, user: User, account: Account, module: str = "account_overview") -> None:
        self.require_module_permission(user, module, "view")
        if not self.can_view_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this account")

    def require_account_update(self, user: User, account: Account, module: str = "account_overview") -> None:
        self.require_module_permission(user, module, "update")
        if account.lifecycle_status == "Archived" and not self.can_update_portfolio_accounts(user):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived accounts are read-only")
        if not self.can_update_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this account")

    def require_account_assign(self, user: User, account: Account) -> None:
        if not self.can_assign_account_owners(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to manage account ownership")
        if not self.can_view_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this account")

    def require_account_approve(self, user: User) -> None:
        if not self.can_approve_onboarding(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to approve onboarding drafts")
