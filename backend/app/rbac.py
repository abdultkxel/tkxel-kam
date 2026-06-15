from dataclasses import dataclass

from app.rbac_catalog import (
    DEFAULT_ROLE_GRANTS,
    PERMISSION_SECTIONS,
    PERMISSIONS,
    permission_key,
)

MODULES: tuple[tuple[str, str], ...] = PERMISSION_SECTIONS
ACTIONS: tuple[str, ...] = tuple(dict.fromkeys(permission.action for permission in PERMISSIONS))
ADMIN_MODULE = "admin_audit_security_rbac"
ACCOUNT_CUSTOM_FIELD_MODULE = "accounts"
LEGACY_ACCOUNT_CUSTOM_FIELD_MODULES: tuple[str, ...] = ("account_onboarding_workspace", "account_overview", "onboarding")
ACCOUNT_CUSTOM_FIELD_MODULES: tuple[str, ...] = (ACCOUNT_CUSTOM_FIELD_MODULE, *LEGACY_ACCOUNT_CUSTOM_FIELD_MODULES)
FIELD_BUILDER_DOMAIN_MODULES: tuple[tuple[str, str], ...] = (
    ("account_overview", "Account Overview"),
    ("account_onboarding_workspace", "Account Onboarding Workspace"),
    ("client_education_content", "Client Education Content"),
    ("escalation_management", "Escalation Management"),
    ("governance_reviews", "Governance Reviews"),
    ("playbooks_tasks_calendar", "Legacy Playbook/Task Fields"),
)

FIELD_BUILDER_RUNTIME_MODULES: tuple[tuple[str, str], ...] = (
    (ACCOUNT_CUSTOM_FIELD_MODULE, "Accounts"),
    ("client_education_content", "Client Education Content"),
    ("escalation_management", "Escalation Management"),
    ("governance_reviews", "Governance Reviews"),
    ("playbooks", "Playbooks"),
    ("tasks", "Tasks"),
    ("opportunities", "Opportunities"),
)
FIELD_BUILDER_RUNTIME_MODULE_SLUGS: tuple[str, ...] = tuple(slug for slug, _ in FIELD_BUILDER_RUNTIME_MODULES)


@dataclass(frozen=True)
class DefaultRole:
    slug: str
    name: str
    description: str
    permission_rules: tuple[tuple[str, tuple[str, ...]], ...]


ALL_MODULE_SLUGS = tuple(dict.fromkeys([*(module for module, _ in MODULES), *(module for module, _ in FIELD_BUILDER_DOMAIN_MODULES)]))
ALL_ACTIONS = ACTIONS
OPERATIONAL_MODULES = tuple(module for module in ALL_MODULE_SLUGS if module not in {"access_admin", "audit", "change_control", "platform_ops", "integrations", "ai_admin"})
VIEW_ONLY_ACTIONS = ("view", "view_assigned", "view_portfolio", "view_own", "view_summary", "view_scores", "export")
WORK_ACTIONS = ("view", "view_assigned", "create", "update", "update_own")
LEADERSHIP_ACTIONS = ("view", "view_portfolio", "view_all", "approve_draft", "assign_owner", "export")
CONFIG_ACTIONS = ("view", "configure", "configure_rules", "configure_templates", "manage_roles")


def _permission_rules_for(keys: set[str]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    actions_by_module: dict[str, list[str]] = {}
    for permission in PERMISSIONS:
        if permission.key in keys:
            actions_by_module.setdefault(permission.module, []).append(permission.action)
    return tuple((module, tuple(actions)) for module, actions in actions_by_module.items())


DEFAULT_ROLES: tuple[DefaultRole, ...] = (
    DefaultRole(
        slug="super_admin",
        name="Super Admin",
        description="Protected break-glass administrator seeded from environment configuration with all catalog permissions.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["super_admin"]),
    ),
    DefaultRole(
        slug="admin",
        name="Admin",
        description="Visible platform administrator with all catalog permissions.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["admin"]),
    ),
    DefaultRole(
        slug="kam_head",
        name="KAM Head",
        description="Portfolio governance owner with all catalog permissions, including account/KYC approvals.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["kam_head"]),
    ),
    DefaultRole(
        slug="account_manager",
        name="Account Manager",
        description="Primary operational owner for assigned accounts. Portfolio, approval, and sensitive administration actions require explicit grants.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["account_manager"]),
    ),
    DefaultRole(
        slug="delivery_lead",
        name="Delivery Lead",
        description="Delivery owner for engagement health, governance, escalations, and delivery task operations.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["delivery_lead"]),
    ),
    DefaultRole(
        slug="leadership_viewer",
        name="Leadership Viewer",
        description="Read-only strategic viewer for portfolio, risk, retention, growth, and executive decisions.",
        permission_rules=_permission_rules_for(DEFAULT_ROLE_GRANTS["leadership_viewer"]),
    ),
)


def default_permission_keys_for(role: DefaultRole) -> set[str]:
    return {permission_key(module, action) for module, actions in role.permission_rules for action in actions}
