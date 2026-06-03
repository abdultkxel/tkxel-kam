from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import AccountOwner, User
from app.repositories.accounts import AccountRepository
from app.repositories.dashboards import DashboardRepository
from app.repositories.rbac import RbacRepository
from app.schemas import DashboardRead, DashboardWidgetRead, TaskSummaryRefreshRead
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES


ADMIN_ROLES = {"super_admin", "admin"}
KAM_HEAD_ROLES = {"kam_head"}
AM_ROLES = {"account_manager", "am", "kam"}
LEADERSHIP_ROLES = {"leadership_viewer", "leadership", "executive", "executive_viewer"}
OPS_ROLES = {"ops_lead"}
DELIVERY_ROLES = {"delivery_lead", "delivery_stakeholder"}

STAGE_WEIGHTS = {
    "identified": 0.2,
    "qualified": 0.35,
    "proposal sent": 0.5,
    "proposal_sent": 0.5,
    "proposal": 0.5,
    "negotiation": 0.7,
    "won": 1.0,
    "lost": 0.0,
}


class DashboardsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DashboardRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)

    def for_current_user(
        self,
        current_user: User,
        *,
        search: str | None = None,
        risk: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        return self._dashboard_for_current_user(current_user, search=search, risk=risk, page=page, page_size=page_size)

    def am_home(self, current_user: User, *, search: str | None = None, account_id: str | None = None, priority: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if not self._can_access_requested_dashboard(current_user, "am_home"):
            return self._reduced_dashboard(current_user, "am_home", search=search, risk=None, page=page, page_size=page_size)
        return self._build_am_home(current_user, search=search, account_id=account_id, priority=priority, page=page, page_size=page_size)

    def refresh_task_summary(self, current_user: User) -> TaskSummaryRefreshRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        profile = self._profile_for_user(current_user)
        if profile["dashboard"] not in {"am_home", "operations", "delivery"} and current_user.role not in ADMIN_ROLES:
            return TaskSummaryRefreshRead(widget=self._widget("ai_task_summary", "AI Task Summary", {"headline": "No refreshable work queue is available for this role.", "narrative": "This dashboard is read-only or portfolio-scoped.", "top_blockers": [], "recommended_focus": "Review the visible dashboard widgets.", "source_counts": {"tasks": 0, "signals": 0}, "refreshed_at": self.repository.now().isoformat()}, [], "authorized_scope", {"manual_refresh": False}, primary_route="/tasks"))

        account_ids = self._account_scope(current_user)
        tasks = self.repository.list_open_tasks(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        signals = self.repository.list_open_signals(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        return TaskSummaryRefreshRead(widget=self._task_summary_widget(tasks, signals, data_scope="assigned_accounts"))

    def kam_head_portfolio(
        self,
        current_user: User,
        *,
        search: str | None = None,
        am_id: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        lifecycle_status: str | None = None,
        risk: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if not self._can_access_requested_dashboard(current_user, "kam_head_portfolio"):
            return self._reduced_dashboard(current_user, "kam_head_portfolio", search=search, risk=risk, page=page, page_size=page_size)
        return self._build_kam_head_portfolio(
            current_user,
            search=search,
            am_id=am_id,
            segment=segment,
            region=region,
            lifecycle_status=lifecycle_status,
            risk=risk,
            page=page,
            page_size=page_size,
            include_admin=current_user.role in ADMIN_ROLES,
        )

    def leadership(self, current_user: User, *, search: str | None = None, segment: str | None = None, region: str | None = None, risk: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if not self._can_access_requested_dashboard(current_user, "leadership"):
            return self._reduced_dashboard(current_user, "leadership", search=search, risk=risk, page=page, page_size=page_size)
        return self._build_leadership(current_user, search=search, segment=segment, region=region, risk=risk, page=page, page_size=page_size)

    def _dashboard_for_current_user(self, current_user: User, *, search: str | None, risk: str | None, page: int, page_size: int) -> DashboardRead:
        profile = self._profile_for_user(current_user)
        dashboard = profile["dashboard"]
        if dashboard == "kam_head_portfolio":
            return self._build_kam_head_portfolio(current_user, search=search, risk=risk, page=page, page_size=page_size, include_admin=current_user.role in ADMIN_ROLES)
        if dashboard == "am_home":
            return self._build_am_home(current_user, search=search, priority=None, page=page, page_size=page_size)
        if dashboard == "leadership":
            return self._build_leadership(current_user, search=search, risk=risk, page=page, page_size=page_size)
        if dashboard == "operations":
            return self._build_operational_dashboard(current_user, role_group="ops_lead", display_name="Ops Lead Dashboard", dashboard="operations", search=search, risk=risk, page=page, page_size=page_size)
        if dashboard == "delivery":
            return self._build_operational_dashboard(current_user, role_group="delivery_lead", display_name="Delivery Lead Dashboard", dashboard="delivery", search=search, risk=risk, page=page, page_size=page_size)
        return self._build_rbac_dashboard(current_user, search=search, risk=risk, page=page, page_size=page_size)

    def _profile_for_user(self, user: User) -> dict[str, Any]:
        role = user.role
        if role in ADMIN_ROLES:
            return {"dashboard": "kam_head_portfolio", "display_name": "Admin Portfolio Dashboard", "role_group": "admin", "read_only": False}
        if role in KAM_HEAD_ROLES:
            return {"dashboard": "kam_head_portfolio", "display_name": "KAM Head Portfolio", "role_group": "kam_head", "read_only": False}
        if role in AM_ROLES:
            return {"dashboard": "am_home", "display_name": "AM Home", "role_group": "account_manager", "read_only": False}
        if role in LEADERSHIP_ROLES:
            return {"dashboard": "leadership", "display_name": "Leadership Dashboard", "role_group": "leadership", "read_only": True}
        if role in OPS_ROLES:
            return {"dashboard": "operations", "display_name": "Ops Lead Dashboard", "role_group": "ops_lead", "read_only": False}
        if role in DELIVERY_ROLES:
            return {"dashboard": "delivery", "display_name": "Delivery Lead Dashboard", "role_group": "delivery_lead", "read_only": False}
        return {"dashboard": "rbac_widgets", "display_name": "My Dashboard", "role_group": "rbac", "read_only": not self._can(user, "dashboards_reporting", "update")}

    def _can_access_requested_dashboard(self, user: User, requested_dashboard: str) -> bool:
        if user.role in ADMIN_ROLES:
            return True
        return self._profile_for_user(user)["dashboard"] == requested_dashboard

    def _reduced_dashboard(self, current_user: User, requested_dashboard: str, *, search: str | None, risk: str | None, page: int, page_size: int) -> DashboardRead:
        dashboard = self._dashboard_for_current_user(current_user, search=search, risk=risk, page=page, page_size=page_size)
        dashboard.metadata["requested_dashboard"] = requested_dashboard
        dashboard.metadata["reduced_scope"] = True
        return dashboard

    def _build_am_home(self, current_user: User, *, search: str | None = None, account_id: str | None = None, priority: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, limit=100)
        scoped_ids = [account.id for account in accounts]
        owner_id = None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id
        tasks = self.repository.list_open_tasks(account_ids=scoped_ids, owner_id=owner_id, limit=100)
        if priority:
            tasks = [task for task in tasks if task.priority == priority]
        signals = self.repository.list_open_signals(account_ids=scoped_ids, owner_id=owner_id, limit=100)
        escalations = self.repository.list_open_escalations(account_ids=scoped_ids, owner_id=owner_id, limit=100)
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, owner_id=owner_id, limit=100)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=100)
        now = self.repository.now()
        stale_kyc = self._stale_kyc_items(accounts)
        widgets = [
            self._widget("summary", "Attention summary", {"assigned_accounts": len(accounts), "at_risk_accounts": len([item for item in accounts if item.risk_status in {"warning", "critical"}]), "open_signals": len(signals), "open_tasks": len(tasks), "stale_kyc": len(stale_kyc), "open_escalations": len(escalations), "open_opportunities": len(opportunities)}, [], "assigned_accounts", primary_route="/dashboard"),
            self._task_summary_widget(tasks, signals, data_scope="assigned_accounts"),
            self._widget("accounts", "My accounts", None, [self._account_item(account) for account in self._slice(accounts, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts"),
            self._widget("tasks", "Overdue and active tasks", None, [self._task_item(task, now) for task in self._slice(tasks, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(tasks)}, primary_route="/tasks"),
            self._widget("signals", "Signals / critical tasks", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(signals)}, primary_route="/tasks"),
            self._widget("stale_kyc", "Stale KYC", None, stale_kyc[:page_size], "assigned_accounts", {"total": len(stale_kyc)}, primary_route="/accounts"),
            self._widget("renewal_focus", "Renewal focus", None, [self._opportunity_item(item) for item in opportunities if item.stage.lower() != "won"][:page_size], "assigned_accounts", {"total": len(opportunities)}, primary_route="/opportunities"),
            self._widget("escalations", "Open escalations", None, [self._escalation_item(item) for item in self._slice(escalations, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(escalations)}, primary_route="/escalations"),
            self._widget("opportunities", "Opportunities / pipeline", None, [self._opportunity_item(item) for item in self._slice(opportunities, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(opportunities)}, primary_route="/opportunities"),
            self._forecast_widget(opportunities, accounts, data_scope="assigned_accounts", masked=False),
            self._widget("governance", "Upcoming governance", None, [self._governance_item(item) for item in self._slice(governance, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(governance)}, primary_route="/governance"),
        ]
        return self._dashboard_read(current_user, "am_home", "AM Home", "account_manager", "assigned_accounts", widgets, read_only=False, filters=["search", "risk", "priority"])

    def _build_kam_head_portfolio(
        self,
        current_user: User,
        *,
        search: str | None = None,
        am_id: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        lifecycle_status: str | None = None,
        risk: str | None = None,
        page: int = 1,
        page_size: int = 10,
        include_admin: bool = False,
    ) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        if am_id:
            owned_ids = self.repository.account_ids_for_user(am_id)
            account_ids = owned_ids if account_ids is None else [item for item in owned_ids if item in account_ids]
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk, limit=200)
        scoped_ids = [account.id for account in accounts]
        signals = self.repository.list_open_signals(account_ids=scoped_ids, limit=200)
        tasks = self.repository.list_open_tasks(account_ids=scoped_ids, limit=200)
        escalations = self.repository.list_open_escalations(account_ids=scoped_ids, limit=200)
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, limit=200)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=200)
        now = self.repository.now()
        workload = self._workload(scoped_ids)
        widgets = [
            self._widget("health_distribution", "Health distribution", self._health_distribution(accounts), [], "portfolio", primary_route="/accounts"),
            self._widget("high_risk_accounts", "At-risk accounts", None, [self._account_item(account) for account in self._slice([account for account in accounts if account.risk_status in {"warning", "critical"}], page, page_size)], "portfolio", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts?risk=critical"),
            self._widget("stale_kyc", "Stale KYC", None, self._stale_kyc_items(accounts), "portfolio", primary_route="/accounts"),
            self._widget("account_portfolio", "Account portfolio table", None, [self._account_item(account) for account in self._slice(accounts, page, page_size)], "portfolio", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts"),
            self._widget("signals", "Signals / critical tasks", None, [self._signal_item(item) for item in self._slice(signals, page, page_size)], "portfolio", {"total": len(signals)}, primary_route="/tasks"),
            self._widget("escalations", "Open escalations", None, [self._escalation_item(item) for item in self._slice(escalations, page, page_size)], "portfolio", {"total": len(escalations)}, primary_route="/escalations"),
            self._widget("renewal_focus", "Renewal focus", None, [self._opportunity_item(item) for item in opportunities if item.stage.lower() != "won"][:page_size], "portfolio", {"total": len(opportunities)}, primary_route="/opportunities"),
            self._forecast_widget(opportunities, accounts, data_scope="portfolio", masked=False),
            self._widget("am_workload", "AM workload", None, workload, "portfolio", primary_route="/accounts"),
            self._widget("overdue_actions", "Overdue actions", None, [self._task_item(task, now) for task in tasks if self._is_before(task.due_at, now)][:page_size], "portfolio", primary_route="/tasks"),
            self._widget("governance_cadence", "Upcoming governance / calendar", None, [self._governance_item(item) for item in governance[:page_size]], "portfolio", primary_route="/governance"),
            self._widget("sla_compliance", "SLA compliance", {"critical_signals": len([item for item in signals if item.severity == "critical"]), "open_escalations": len(escalations), "overdue_tasks": len([item for item in tasks if self._is_before(item.due_at, now)])}, [], "portfolio", primary_route="/reports"),
            self._widget("decision_queue", "Decision queue", None, [self._signal_item(item) for item in signals[:page_size]], "portfolio", primary_route="/tasks"),
        ]
        if include_admin:
            widgets.append(self._widget("admin_system", "Admin system health", {"system_roles_protected": True, "dashboard_rules": "role_based_static", "direct_endpoint_mode": "permission_scoped"}, [], "platform", primary_route="/admin"))
        display = "Admin Portfolio Dashboard" if include_admin else "KAM Head Portfolio"
        role_group = "admin" if include_admin else "kam_head"
        return self._dashboard_read(current_user, "kam_head_portfolio", display, role_group, "portfolio", widgets, read_only=False, filters=["search", "risk", "segment", "region", "lifecycle_status", "am_id"])

    def _build_leadership(self, current_user: User, *, search: str | None = None, segment: str | None = None, region: str | None = None, risk: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, segment=segment, region=region, risk=risk, limit=200)
        scoped_ids = [account.id for account in accounts]
        escalations = self.repository.list_open_escalations(account_ids=scoped_ids, limit=200)
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, limit=200)
        signals = self.repository.list_open_signals(account_ids=scoped_ids, limit=200)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=200)
        masked = current_user.role in LEADERSHIP_ROLES
        growth_value: dict[str, Any] = {"open_opportunities": len(opportunities)}
        growth_value["pipeline_value"] = "Restricted" if masked else sum(float(item.value) for item in opportunities)
        risk_value: dict[str, Any] = {"at_risk_accounts": len([account for account in accounts if account.risk_status == "critical"])}
        risk_value["at_risk_value"] = "Restricted" if masked else sum(float(account.commercial_value) for account in accounts if account.risk_status == "critical")
        widgets = [
            self._widget("strategic_health", "Strategic health", self._health_distribution(accounts), [], "executive", primary_route="/accounts"),
            self._widget("retention", "Retention outlook", None, [self._account_item(account) for account in accounts if account.lifecycle_status in {"Renewal Focus", "At Risk"}][:page_size], "executive", primary_route="/accounts"),
            self._widget("growth", "Growth pipeline", growth_value, [self._opportunity_item(item, mask_value=masked) for item in opportunities[:page_size]], "executive", {"masked": masked}, primary_route="/opportunities"),
            self._forecast_widget(opportunities, accounts, data_scope="executive", masked=masked),
            self._widget("revenue_risk", "Revenue risk", risk_value, [self._account_item(account) for account in accounts if account.risk_status == "critical"][:page_size], "executive", {"masked": masked}, primary_route="/accounts?risk=critical"),
            self._widget("major_escalations", "Major escalations", None, [self._escalation_item(item) for item in escalations[:page_size]], "executive", primary_route="/escalations"),
            self._widget("executive_summaries", "Executive summaries", None, [{"account": account.name, "summary": f"{account.name} is {account.risk_status} with health {account.health_overall}.", "account_id": account.id, "route": f"/accounts/{account.id}"} for account in accounts[:page_size]], "executive", primary_route="/accounts"),
            self._widget("decision_queue", "Decision queue", None, [self._signal_item(item) for item in signals[:page_size]], "executive", primary_route="/tasks"),
            self._widget("governance", "Governance calendar summary", None, [self._governance_item(item) for item in governance[:page_size]], "executive", primary_route="/governance"),
        ]
        return self._dashboard_read(current_user, "leadership", "Leadership Dashboard", "leadership", "executive", widgets, read_only=True, filters=["search", "risk", "segment", "region"], metadata={"commercial_values_masked": masked})

    def _build_operational_dashboard(self, current_user: User, *, role_group: str, display_name: str, dashboard: str, search: str | None, risk: str | None, page: int, page_size: int) -> DashboardRead:
        scoped_ids = self._delivery_operations_scope(current_user)
        accounts = self.repository.list_accounts(account_ids=scoped_ids, search=search, risk=risk, limit=100)
        account_ids = [account.id for account in accounts]
        direct_tasks = self.repository.list_open_tasks(owner_id=current_user.id, limit=100)
        account_tasks = self.repository.list_open_tasks(account_ids=account_ids, limit=100)
        tasks = self._dedupe_by_id([*direct_tasks, *account_tasks])
        signals = self.repository.list_open_signals(account_ids=account_ids, limit=100)
        escalations = self.repository.list_open_escalations(account_ids=account_ids, limit=100)
        governance = self.repository.list_governance_events(account_ids=account_ids, limit=100)
        opportunities = self.repository.list_open_opportunities(account_ids=account_ids, limit=100)
        now = self.repository.now()
        widgets = [
            self._widget("summary", f"{display_name} summary", {"authorized_accounts": len(accounts), "open_tasks": len(tasks), "critical_signals": len([item for item in signals if item.severity == "critical"]), "open_escalations": len(escalations), "upcoming_governance": len(governance)}, [], role_group, primary_route="/dashboard"),
            self._task_summary_widget(tasks, signals, data_scope=role_group),
            self._widget("tasks", "Operational tasks", None, [self._task_item(task, now) for task in self._slice(tasks, page, page_size)], role_group, {"page": page, "page_size": page_size, "total": len(tasks)}, primary_route="/tasks"),
            self._widget("signals", "Delivery risk signals", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], role_group, {"page": page, "page_size": page_size, "total": len(signals)}, primary_route="/tasks"),
            self._widget("escalations", "Open delivery escalations", None, [self._escalation_item(item) for item in self._slice(escalations, page, page_size)], role_group, {"page": page, "page_size": page_size, "total": len(escalations)}, primary_route="/escalations"),
            self._widget("high_risk_accounts", "At-risk accounts", None, [self._account_item(account) for account in accounts if account.risk_status in {"warning", "critical"}][:page_size], role_group, {"total": len(accounts)}, primary_route="/accounts?risk=critical"),
            self._forecast_widget(opportunities, accounts, data_scope=role_group, masked=True),
            self._widget("governance", "Upcoming delivery reviews", None, [self._governance_item(item) for item in governance[:page_size]], role_group, {"total": len(governance)}, primary_route="/governance"),
            self._widget("decision_queue", "Operational blockers", None, [self._signal_item(item) for item in signals[:page_size]], role_group, primary_route="/tasks"),
        ]
        return self._dashboard_read(current_user, dashboard, display_name, role_group, role_group, widgets, read_only=False, filters=["search", "risk"])

    def _build_rbac_dashboard(self, current_user: User, *, search: str | None, risk: str | None, page: int, page_size: int) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, risk=risk, limit=100) if self._can(current_user, "account_overview", "view") else []
        scoped_ids = [account.id for account in accounts]
        widgets: list[DashboardWidgetRead] = []
        if accounts:
            widgets.append(self._widget("accounts", "Authorized accounts", None, [self._account_item(account) for account in self._slice(accounts, page, page_size)], "rbac", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts"))
            widgets.append(self._widget("health_distribution", "Health distribution", self._health_distribution(accounts), [], "rbac", primary_route="/accounts"))
        if self._can(current_user, "playbooks_tasks_calendar", "view"):
            tasks = self.repository.list_open_tasks(account_ids=scoped_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
            widgets.append(self._widget("tasks", "Tasks summary", None, [self._task_item(task, self.repository.now()) for task in self._slice(tasks, page, page_size)], "rbac", {"total": len(tasks)}, primary_route="/tasks"))
        if self._can(current_user, "signals_attention", "view"):
            signals = self.repository.list_open_signals(account_ids=scoped_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
            widgets.append(self._widget("signals", "Signals", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], "rbac", {"total": len(signals)}, primary_route="/tasks"))
        if self._can(current_user, "governance_reviews", "view"):
            governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=100)
            widgets.append(self._widget("governance", "Upcoming governance", None, [self._governance_item(item) for item in self._slice(governance, page, page_size)], "rbac", {"total": len(governance)}, primary_route="/governance"))
        if self._can(current_user, "opportunity_management", "view"):
            opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
            widgets.append(self._widget("opportunities", "Opportunities", None, [self._opportunity_item(item, mask_value=not self._can(current_user, "analytics_portfolio", "view")) for item in self._slice(opportunities, page, page_size)], "rbac", {"total": len(opportunities)}, primary_route="/opportunities"))
        return self._dashboard_read(current_user, "rbac_widgets", "My Dashboard", "rbac", "authorized_scope", widgets, read_only=not self._can(current_user, "dashboards_reporting", "update"), filters=["search", "risk"])

    def _account_scope(self, user: User) -> list[str] | None:
        if user.role in GLOBAL_VIEW_ROLES:
            return None
        return self.repository.account_ids_for_user(user.id)

    def _delivery_operations_scope(self, user: User) -> list[str]:
        ids = set(self.repository.account_ids_for_user_by_ownership_roles(user.id, ["ops_lead"]))
        ids.update(self.repository.account_ids_for_engagement_assignment(user.id))
        ids.update(self.repository.account_ids_for_task_owner(user.id))
        return sorted(ids)

    def _can(self, user: User, module: str, action: str = "view") -> bool:
        return self.rbac.role_has_permission(user.role, module, action)

    def _dashboard_read(
        self,
        current_user: User,
        dashboard: str,
        display_name: str,
        role_group: str,
        data_scope: str,
        widgets: list[DashboardWidgetRead],
        *,
        read_only: bool,
        filters: list[str],
        metadata: dict[str, Any] | None = None,
    ) -> DashboardRead:
        return DashboardRead(
            dashboard=dashboard,
            display_name=display_name,
            role_group=role_group,
            read_only=read_only,
            allowed_filters=filters,
            generated_at=self.repository.now(),
            data_scope=data_scope,
            widgets=self._filter_widgets(current_user, widgets),
            metadata=metadata or {},
        )

    def _filter_widgets(self, user: User, widgets: list[DashboardWidgetRead]) -> list[DashboardWidgetRead]:
        module_by_key = {
            "accounts": "account_overview",
            "account_portfolio": "account_overview",
            "high_risk_accounts": "account_overview",
            "health_distribution": "account_overview",
            "stale_kyc": "kyc",
            "tasks": "playbooks_tasks_calendar",
            "ai_task_summary": "playbooks_tasks_calendar",
            "signals": "signals_attention",
            "decision_queue": "signals_attention",
            "governance": "governance_reviews",
            "governance_cadence": "governance_reviews",
            "escalations": "escalation_management",
            "major_escalations": "escalation_management",
            "opportunities": "opportunity_management",
            "renewal_focus": "retention_stability",
            "growth": "opportunity_management",
            "forecast_chart": "dashboards_reporting",
            "revenue_risk": "analytics_portfolio",
            "retention": "retention_stability",
            "strategic_health": "account_overview",
            "executive_summaries": "account_overview",
            "am_workload": "account_overview",
            "sla_compliance": "dashboards_reporting",
            "admin_system": "admin_audit_security_rbac",
            "summary": "dashboards_reporting",
        }
        filtered: list[DashboardWidgetRead] = []
        for widget in widgets:
            module = module_by_key.get(widget.key, "dashboards_reporting")
            if self._can(user, module, "view"):
                filtered.append(widget)
        return filtered

    def _task_summary_widget(self, tasks: list, signals: list, *, data_scope: str) -> DashboardWidgetRead:
        now = self.repository.now()
        overdue = [task for task in tasks if self._is_before(task.due_at, now)]
        critical_signals = [signal for signal in signals if signal.severity == "critical"]
        headline = "Focus on overdue delivery actions" if overdue else "Review active account signals" if signals else "No urgent work queued"
        blockers = [task.title for task in overdue[:3]] + [signal.title for signal in critical_signals[:3]]
        focus = blockers[0] if blockers else "Maintain governance cadence and monitor score movement."
        return self._widget(
            "ai_task_summary",
            "AI Task Summary",
            {
                "headline": headline,
                "narrative": f"{len(tasks)} active tasks and {len(signals)} open signals were reviewed across your authorized accounts.",
                "top_blockers": blockers[:5],
                "recommended_focus": focus,
                "source_counts": {"tasks": len(tasks), "signals": len(signals)},
                "refreshed_at": now.isoformat(),
            },
            [],
            data_scope,
            {"manual_refresh": True},
            primary_route="/tasks",
        )

    def _forecast_widget(self, opportunities: list, accounts: list, *, data_scope: str, masked: bool) -> DashboardWidgetRead:
        stage_totals: dict[str, dict[str, Any]] = {}
        weighted = 0.0
        pipeline = 0.0
        for item in opportunities:
            stage = item.stage or "Unstaged"
            value = float(item.value)
            weight = STAGE_WEIGHTS.get(stage.lower(), 0.25)
            pipeline += value
            weighted += value * weight
            row = stage_totals.setdefault(stage, {"stage": stage, "count": 0, "value": 0.0})
            row["count"] += 1
            row["value"] += value
        series = [
            {
                "label": row["stage"],
                "value": row["count"] if masked else round(row["value"], 2),
                "display_value": "Restricted" if masked else round(row["value"], 2),
            }
            for row in stage_totals.values()
        ]
        value: dict[str, Any] = {
            "open_opportunities": len(opportunities),
            "at_risk_accounts": len([account for account in accounts if account.risk_status in {"warning", "critical"}]),
            "pipeline_value": "Restricted" if masked else round(pipeline, 2),
            "weighted_forecast": "Restricted" if masked else round(weighted, 2),
            "series": series,
        }
        return self._widget("forecast_chart", "Forecast chart", value, [], data_scope, {"masked": masked, "chart_type": "bar"}, primary_route="/dashboard")

    def _widget(self, key: str, title: str, value: Any | None, items: list[dict[str, Any]], data_scope: str, metadata: dict[str, Any] | None = None, *, primary_route: str | None = None) -> DashboardWidgetRead:
        return DashboardWidgetRead(key=key, title=title, status="empty" if value in (None, {}, []) and not items else "complete", generated_at=self.repository.now(), data_scope=data_scope, primary_route=primary_route, value=value, items=items, metadata=metadata or {})

    @staticmethod
    def _slice(items: list, page: int, page_size: int) -> list:
        start = (page - 1) * page_size
        return items[start : start + page_size]

    @staticmethod
    def _dedupe_by_id(items: list) -> list:
        seen: set[str] = set()
        result = []
        for item in items:
            if item.id in seen:
                continue
            seen.add(item.id)
            result.append(item)
        return result

    @staticmethod
    def _account_item(account) -> dict[str, Any]:
        primary = next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)
        return {"id": account.id, "name": account.name, "risk_status": account.risk_status, "health": account.health_overall, "segment": account.segment, "region": account.region, "owner": primary.user_name if primary else None, "next_governance_at": account.next_governance_at.isoformat() if account.next_governance_at else None, "route": f"/accounts/{account.id}"}

    @staticmethod
    def _task_item(task, now: datetime) -> dict[str, Any]:
        return {"id": task.id, "title": task.title, "account_id": task.account_id, "owner": task.owner_name, "priority": task.priority, "status": task.status, "due_at": task.due_at.isoformat(), "overdue": DashboardsService._is_before(task.due_at, now), "route": f"/tasks?account_id={task.account_id}"}

    @staticmethod
    def _is_before(value: datetime, reference: datetime) -> bool:
        if value.tzinfo is None and reference.tzinfo is not None:
            reference = reference.replace(tzinfo=None)
        elif value.tzinfo is not None and reference.tzinfo is None:
            value = value.replace(tzinfo=None)
        return value < reference

    @staticmethod
    def _signal_item(signal) -> dict[str, Any]:
        return {"id": signal.id, "title": signal.title, "account_id": signal.account_id, "severity": signal.severity, "status": signal.status, "owner": signal.owner_name, "route": signal.source_record_route or f"/accounts/{signal.account_id}?tab=health"}

    @staticmethod
    def _escalation_item(escalation) -> dict[str, Any]:
        return {"id": escalation.id, "summary": escalation.summary, "account_id": escalation.account_id, "severity": escalation.severity, "priority": escalation.priority, "status": escalation.status, "sla_due_at": escalation.sla_due_at.isoformat(), "owner": escalation.owner_name, "route": f"/accounts/{escalation.account_id}?tab=timeline"}

    @staticmethod
    def _opportunity_item(opportunity, *, mask_value: bool = False) -> dict[str, Any]:
        return {"id": opportunity.id, "name": opportunity.name, "account_id": opportunity.account_id, "stage": opportunity.stage, "service_line": opportunity.service_line, "value": "Restricted" if mask_value else float(opportunity.value), "target_date": opportunity.target_date.isoformat(), "owner": opportunity.owner_name, "route": f"/accounts/{opportunity.account_id}?tab=opportunities"}

    @staticmethod
    def _governance_item(event) -> dict[str, Any]:
        return {"id": event.id, "account_id": event.account_id, "type": event.governance_type, "status": event.status, "scheduled_at": event.scheduled_at.isoformat(), "owner": event.owner_name, "route": f"/governance?account_id={event.account_id}" if event.account_id else "/governance"}

    def _stale_kyc_items(self, accounts: list) -> list[dict[str, Any]]:
        items = []
        for account in accounts:
            snapshot = self.repository.latest_kyc_snapshot(account.id)
            if snapshot and snapshot.freshness_status == "fresh":
                continue
            items.append({"account_id": account.id, "account": account.name, "freshness_status": snapshot.freshness_status if snapshot else "missing", "approved_at": snapshot.approved_at.isoformat() if snapshot else None, "route": f"/accounts/{account.id}?tab=kyc"})
        return items[:20]

    @staticmethod
    def _health_distribution(accounts: list) -> dict[str, int]:
        result = {"healthy": 0, "warning": 0, "critical": 0}
        for account in accounts:
            result[account.risk_status] = result.get(account.risk_status, 0) + 1
        return result

    def _workload(self, account_ids: list[str]) -> list[dict[str, Any]]:
        rows = self.db.query(AccountOwner).filter(AccountOwner.account_id.in_(account_ids), AccountOwner.is_active.is_(True), AccountOwner.ownership_role == "primary_am").all() if account_ids else []
        counts: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = row.user_id or row.user_name
            counts.setdefault(key, {"owner_id": row.user_id, "owner": row.user_name, "accounts": 0, "route": f"/accounts?owner={row.user_id}" if row.user_id else "/accounts"})
            counts[key]["accounts"] += 1
        return sorted(counts.values(), key=lambda item: item["accounts"], reverse=True)
