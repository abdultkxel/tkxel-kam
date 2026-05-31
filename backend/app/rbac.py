from dataclasses import dataclass

MODULES: tuple[tuple[str, str], ...] = (
    ("account_onboarding_workspace", "Account Onboarding and Workspace"),
    ("engagement_sow_management", "Engagement/SOW Management and Engagement 360"),
    ("account_overview", "Account Overview"),
    ("kyc", "KYC and AI-Assisted KYC"),
    ("stakeholder_relationship", "Stakeholder and Relationship Management"),
    ("account_planning", "Account Planning, Whitespace, and Service Catalog"),
    ("opportunity_management", "Growth and Opportunity Management"),
    ("retention_stability", "Retention and Account Stability"),
    ("scoring_engine", "Configurable Scoring and Metric Engine"),
    ("signals_attention", "Rule-Based Signals and Attention Center"),
    ("playbooks_tasks_calendar", "Playbooks, Activities, Tasks, and Calendar"),
    ("client_education_content", "Client Education and Content"),
    ("escalation_management", "Escalation Management"),
    ("governance_reviews", "Governance and Reviews"),
    ("account_timeline", "Account History and Timeline"),
    ("handover_summary", "Handover Summary"),
    ("notifications_digests", "Notifications, SLA Escalation, and Executive Digests"),
    ("dashboards_reporting", "Dashboards and Reporting"),
    ("ai_assistance_search", "AI Assistance, AI Search, and Semantic Search"),
    ("integrations", "Approved Integrations"),
    ("admin_audit_security_rbac", "Admin, Audit, Retention, Security, and RBAC"),
    ("analytics_portfolio", "Analytics, Benchmarking, and Portfolio Intelligence"),
    ("multi_owner_tenant_readiness", "Multi-owner and Multi-tenant Readiness"),
)

ACTIONS: tuple[str, ...] = ("view", "create", "update", "delete", "approve", "configure", "assign", "export")

ADMIN_MODULE = "admin_audit_security_rbac"


@dataclass(frozen=True)
class DefaultRole:
    slug: str
    name: str
    description: str
    permission_rules: tuple[tuple[str, tuple[str, ...]], ...]


ALL_MODULE_SLUGS = tuple(module for module, _ in MODULES)
ALL_ACTIONS = ACTIONS
OPERATIONAL_MODULES = tuple(module for module in ALL_MODULE_SLUGS if module not in {"admin_audit_security_rbac", "integrations", "multi_owner_tenant_readiness"})
VIEW_ONLY_ACTIONS = ("view", "export")
WORK_ACTIONS = ("view", "create", "update")
LEADERSHIP_ACTIONS = ("view", "create", "update", "approve", "assign", "export")
CONFIG_ACTIONS = ("view", "create", "update", "delete", "configure")

DEFAULT_ROLES: tuple[DefaultRole, ...] = (
    DefaultRole(
        slug="super_admin",
        name="Super Admin",
        description="Full platform owner with every seeded module permission.",
        permission_rules=tuple((module, ALL_ACTIONS) for module in ALL_MODULE_SLUGS),
    ),
    DefaultRole(
        slug="admin",
        name="Admin",
        description="Platform administration for users, roles, access, reference data, integrations, audit, and retention.",
        permission_rules=(
            ("admin_audit_security_rbac", ALL_ACTIONS),
            ("account_onboarding_workspace", LEADERSHIP_ACTIONS),
            ("account_overview", LEADERSHIP_ACTIONS),
            ("engagement_sow_management", ("view", "create", "update", "delete", "assign", "export")),
            ("retention_stability", LEADERSHIP_ACTIONS),
            ("client_education_content", CONFIG_ACTIONS),
            ("escalation_management", LEADERSHIP_ACTIONS),
            ("governance_reviews", LEADERSHIP_ACTIONS + ("configure",)),
            ("integrations", CONFIG_ACTIONS),
            ("notifications_digests", CONFIG_ACTIONS),
            ("scoring_engine", CONFIG_ACTIONS),
            ("signals_attention", CONFIG_ACTIONS),
            ("playbooks_tasks_calendar", CONFIG_ACTIONS),
            ("account_timeline", CONFIG_ACTIONS),
            ("dashboards_reporting", CONFIG_ACTIONS),
            ("analytics_portfolio", VIEW_ONLY_ACTIONS),
        ),
    ),
    DefaultRole(
        slug="account_manager",
        name="Account Manager / KAM",
        description="Primary operational owner for assigned accounts.",
        permission_rules=(
            ("account_onboarding_workspace", WORK_ACTIONS),
            ("engagement_sow_management", WORK_ACTIONS),
            ("account_overview", WORK_ACTIONS),
            ("kyc", WORK_ACTIONS),
            ("stakeholder_relationship", WORK_ACTIONS),
            ("account_planning", WORK_ACTIONS),
            ("opportunity_management", WORK_ACTIONS),
            ("retention_stability", WORK_ACTIONS),
            ("signals_attention", ("view", "update")),
            ("playbooks_tasks_calendar", WORK_ACTIONS),
            ("client_education_content", ("view", "create", "update")),
            ("escalation_management", WORK_ACTIONS),
            ("governance_reviews", WORK_ACTIONS),
            ("account_timeline", WORK_ACTIONS),
            ("handover_summary", ("view", "create")),
            ("notifications_digests", ("view", "update")),
            ("dashboards_reporting", VIEW_ONLY_ACTIONS),
            ("ai_assistance_search", ("view", "create")),
        ),
    ),
    DefaultRole(
        slug="ops_lead",
        name="Ops Lead",
        description="Operational delivery partner for engagements, escalations, governance, and delivery risks.",
        permission_rules=(
            ("engagement_sow_management", WORK_ACTIONS),
            ("account_overview", ("view", "update")),
            ("retention_stability", ("view",)),
            ("signals_attention", ("view", "update")),
            ("playbooks_tasks_calendar", WORK_ACTIONS),
            ("escalation_management", WORK_ACTIONS),
            ("governance_reviews", WORK_ACTIONS),
            ("account_timeline", ("view", "create")),
            ("notifications_digests", ("view", "update")),
            ("dashboards_reporting", VIEW_ONLY_ACTIONS),
        ),
    ),
    DefaultRole(
        slug="kam_head",
        name="KAM Head / VP",
        description="Portfolio governance and configuration owner.",
        permission_rules=tuple((module, LEADERSHIP_ACTIONS) for module in OPERATIONAL_MODULES)
        + (
            ("scoring_engine", CONFIG_ACTIONS),
            ("signals_attention", CONFIG_ACTIONS),
            ("playbooks_tasks_calendar", CONFIG_ACTIONS),
            ("notifications_digests", CONFIG_ACTIONS),
            ("dashboards_reporting", ("view", "configure", "export")),
            ("analytics_portfolio", VIEW_ONLY_ACTIONS),
            ("ai_assistance_search", ("view", "create", "export")),
        ),
    ),
    DefaultRole(
        slug="leadership_viewer",
        name="Leadership Viewer / Executive",
        description="Strategic visibility consumer for portfolio, risk, retention, growth, and decisions.",
        permission_rules=(
            ("account_overview", VIEW_ONLY_ACTIONS),
            ("engagement_sow_management", VIEW_ONLY_ACTIONS),
            ("opportunity_management", VIEW_ONLY_ACTIONS),
            ("retention_stability", VIEW_ONLY_ACTIONS),
            ("escalation_management", VIEW_ONLY_ACTIONS),
            ("governance_reviews", VIEW_ONLY_ACTIONS),
            ("handover_summary", VIEW_ONLY_ACTIONS),
            ("notifications_digests", ("view", "update")),
            ("dashboards_reporting", VIEW_ONLY_ACTIONS),
            ("analytics_portfolio", VIEW_ONLY_ACTIONS),
            ("ai_assistance_search", ("view", "export")),
        ),
    ),
    DefaultRole(
        slug="content_specialist",
        name="Content Specialist",
        description="Manages client education content and recommended education actions.",
        permission_rules=(
            ("client_education_content", ("view", "create", "update", "delete", "configure")),
            ("account_overview", ("view",)),
            ("playbooks_tasks_calendar", ("view", "create", "update")),
            ("account_timeline", ("view", "create")),
            ("dashboards_reporting", ("view",)),
        ),
    ),
    DefaultRole(
        slug="commercial_stakeholder",
        name="Commercial Stakeholder",
        description="Commercial partner for opportunities, renewals, retention, and revenue-risk visibility.",
        permission_rules=(
            ("account_overview", VIEW_ONLY_ACTIONS),
            ("opportunity_management", ("view", "create", "update", "export")),
            ("retention_stability", ("view", "update", "export")),
            ("escalation_management", ("view", "update")),
            ("governance_reviews", VIEW_ONLY_ACTIONS),
            ("dashboards_reporting", VIEW_ONLY_ACTIONS),
        ),
    ),
    DefaultRole(
        slug="delivery_stakeholder",
        name="Delivery Stakeholder",
        description="Delivery partner for engagement health, escalations, governance, and tasks.",
        permission_rules=(
            ("engagement_sow_management", ("view", "update", "export")),
            ("account_overview", ("view", "update")),
            ("signals_attention", ("view", "update")),
            ("playbooks_tasks_calendar", WORK_ACTIONS),
            ("escalation_management", WORK_ACTIONS),
            ("governance_reviews", ("view", "create", "update")),
            ("account_timeline", ("view", "create")),
            ("dashboards_reporting", ("view",)),
        ),
    ),
)


def permission_key(module: str, action: str) -> str:
    return f"{module}:{action}"


def default_permission_keys_for(role: DefaultRole) -> set[str]:
    return {permission_key(module, action) for module, actions in role.permission_rules for action in actions}
