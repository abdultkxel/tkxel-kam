from fastapi import HTTPException, status

from app.models import Account, User
from app.repositories.accounts import AccountRepository
from app.repositories.rbac import RbacRepository


GLOBAL_VIEW_ROLES = {"super_admin", "admin", "kam_head", "leadership", "leadership_viewer"}
GLOBAL_EDIT_ROLES = {"super_admin", "admin", "kam_head"}


class AccountAccessService:
    def __init__(self, accounts: AccountRepository, rbac: RbacRepository) -> None:
        self.accounts = accounts
        self.rbac = rbac

    def require_module_permission(self, user: User, module: str, action: str) -> None:
        if not self.rbac.role_has_permission(user.role, module, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")

    def can_view_account(self, user: User, account: Account) -> bool:
        if user.role in GLOBAL_VIEW_ROLES:
            return True
        return any(owner.user_id == user.id and owner.is_active for owner in account.owners)

    def can_update_account(self, user: User, account: Account) -> bool:
        if user.role in GLOBAL_EDIT_ROLES:
            return True
        return any(owner.user_id == user.id and owner.is_active and owner.ownership_role in {"primary_am", "supporting_am"} for owner in account.owners)

    def require_account_view(self, user: User, account: Account, module: str = "account_overview") -> None:
        self.require_module_permission(user, module, "view")
        if not self.can_view_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this account")

    def require_account_update(self, user: User, account: Account, module: str = "account_overview") -> None:
        self.require_module_permission(user, module, "update")
        if account.lifecycle_status == "Archived" and user.role not in GLOBAL_EDIT_ROLES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived accounts are read-only")
        if not self.can_update_account(user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this account")

    def require_account_assign(self, user: User, account: Account) -> None:
        self.require_module_permission(user, "account_onboarding_workspace", "assign")
        if user.role not in GLOBAL_EDIT_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin or KAM Head can manage ownership")

    def require_account_approve(self, user: User) -> None:
        self.require_module_permission(user, "account_onboarding_workspace", "approve")
        if user.role not in GLOBAL_EDIT_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin or KAM Head can approve onboarding drafts")
