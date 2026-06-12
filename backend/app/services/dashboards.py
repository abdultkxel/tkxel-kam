from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import User
from app.repositories.accounts import AccountRepository
from app.repositories.dashboards import DashboardRepository
from app.repositories.rbac import RbacRepository
from app.schemas import AiForecastResponse, DashboardRead, DashboardWidgetRead, TaskSummaryRefreshRead
from app.services.account_access import AccountAccessService
from app.services.forecasting import ForecastingService


ADMIN_ROLES = {"super_admin", "admin"}
KAM_HEAD_ROLES = {"kam_head"}
AM_ROLES = {"account_manager"}
LEADERSHIP_ROLES: set[str] = set()
OPS_ROLES: set[str] = set()
DELIVERY_ROLES = {"delivery_stakeholder"}
AM_OWNERSHIP_ROLES = {"primary_am", "supporting_am", "account_manager", "am", "kam"}

class DashboardsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DashboardRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)
        self.forecasting = ForecastingService(db)

    def for_current_user(
        self,
        current_user: User,
        *,
        search: str | None = None,
        risk: str | None = None,
        account_id: str | None = None,
        am_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        return self._dashboard_for_current_user(current_user, search=search, risk=risk, account_id=account_id, am_id=am_id, page=page, page_size=page_size)

    def am_home(self, current_user: User, *, search: str | None = None, account_id: str | None = None, priority: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if not self._can_access_requested_dashboard(current_user, "am_home"):
            return self._reduced_dashboard(current_user, "am_home", search=search, risk=None, page=page, page_size=page_size)
        return self._build_am_home(current_user, search=search, account_id=account_id, priority=priority, page=page, page_size=page_size)

    def refresh_task_summary(self, current_user: User) -> TaskSummaryRefreshRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        profile = self._profile_for_user(current_user)
        if profile["dashboard"] not in {"am_home", "operations", "delivery"} and not self.access.can_view_portfolio(current_user):
            return TaskSummaryRefreshRead(widget=self._widget("ai_task_summary", "AI Task Summary", {"headline": "No refreshable work queue is available for this role.", "narrative": "This dashboard is read-only or portfolio-scoped.", "top_blockers": [], "recommended_focus": "Review the visible dashboard widgets.", "source_counts": {"tasks": 0, "signals": 0}, "refreshed_at": self.repository.now().isoformat()}, [], "authorized_scope", {"manual_refresh": False}, primary_route="/tasks"))

        account_ids = self._account_scope(current_user)
        portfolio_scope = self.access.can_view_portfolio(current_user)
        tasks = self.repository.list_open_tasks(account_ids=account_ids, owner_id=None if portfolio_scope else current_user.id, limit=100)
        signals = self.repository.list_open_signals(account_ids=account_ids, owner_id=None if portfolio_scope else current_user.id, limit=100)
        return TaskSummaryRefreshRead(widget=self._task_summary_widget(tasks, signals, data_scope="assigned_accounts"))

    def kam_head_portfolio(
        self,
        current_user: User,
        *,
        search: str | None = None,
        am_id: str | None = None,
        account_id: str | None = None,
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
            account_id=account_id,
            segment=segment,
            region=region,
            lifecycle_status=lifecycle_status,
            risk=risk,
            page=page,
            page_size=page_size,
            include_admin=self._can_view_admin_dashboard(current_user),
        )

    def leadership(self, current_user: User, *, search: str | None = None, segment: str | None = None, region: str | None = None, risk: str | None = None, account_id: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        if not self._can_access_requested_dashboard(current_user, "leadership"):
            return self._reduced_dashboard(current_user, "leadership", search=search, risk=risk, page=page, page_size=page_size)
        return self._build_leadership(current_user, search=search, segment=segment, region=region, risk=risk, account_id=account_id, page=page, page_size=page_size)

    def _dashboard_for_current_user(self, current_user: User, *, search: str | None, risk: str | None, account_id: str | None, am_id: str | None, page: int, page_size: int) -> DashboardRead:
        profile = self._profile_for_user(current_user)
        dashboard = profile["dashboard"]
        if dashboard == "kam_head_portfolio":
            return self._build_kam_head_portfolio(current_user, search=search, am_id=am_id, account_id=account_id, risk=risk, page=page, page_size=page_size, include_admin=profile["role_group"] == "admin")
        if dashboard == "am_home":
            return self._build_am_home(current_user, search=search, account_id=account_id, priority=None, page=page, page_size=page_size)
        if dashboard == "leadership":
            return self._build_leadership(current_user, search=search, risk=risk, account_id=account_id, page=page, page_size=page_size)
        if dashboard == "operations":
            return self._build_operational_dashboard(current_user, role_group="ops_lead", display_name="Ops Lead Dashboard", dashboard="operations", search=search, risk=risk, account_id=account_id, page=page, page_size=page_size)
        if dashboard == "delivery":
            return self._build_operational_dashboard(current_user, role_group="delivery_stakeholder", display_name="Delivery Stakeholder Dashboard", dashboard="delivery", search=search, risk=risk, account_id=account_id, page=page, page_size=page_size)
        return self._build_rbac_dashboard(current_user, search=search, risk=risk, account_id=account_id, page=page, page_size=page_size)

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
            return {"dashboard": "delivery", "display_name": "Delivery Stakeholder Dashboard", "role_group": "delivery_stakeholder", "read_only": False}
        return {"dashboard": "rbac_widgets", "display_name": "My Dashboard", "role_group": "rbac", "read_only": not self._can(user, "dashboards_reporting", "update")}

    def _can_access_requested_dashboard(self, user: User, requested_dashboard: str) -> bool:
        if self.access.can_view_portfolio(user):
            return True
        return self._profile_for_user(user)["dashboard"] == requested_dashboard

    def _can_view_admin_dashboard(self, user: User) -> bool:
        return self.access.has_any_permission(user, {"platform_ops:view_health", "access_admin:view_users", "audit:view_logs"})

    def _reduced_dashboard(self, current_user: User, requested_dashboard: str, *, search: str | None, risk: str | None, page: int, page_size: int) -> DashboardRead:
        dashboard = self._dashboard_for_current_user(current_user, search=search, risk=risk, account_id=None, am_id=None, page=page, page_size=page_size)
        dashboard.metadata["requested_dashboard"] = requested_dashboard
        dashboard.metadata["reduced_scope"] = True
        return dashboard

    def _build_am_home(self, current_user: User, *, search: str | None = None, account_id: str | None = None, priority: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, limit=100)
        scoped_ids = [account.id for account in accounts]
        owner_id = None if self.access.can_view_portfolio(current_user) else current_user.id
        if self.access.can_view_portfolio(current_user):
            tasks = self.repository.list_open_tasks(account_ids=scoped_ids, limit=100)
        else:
            tasks = self._dedupe_by_id(
                [
                    *self.repository.list_open_tasks(owner_id=current_user.id, limit=100),
                    *self.repository.list_open_tasks(account_ids=scoped_ids, limit=100),
                ]
            )
        if priority:
            tasks = [task for task in tasks if task.priority == priority]
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, owner_id=owner_id, limit=100)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=100)
        now = self.repository.now()
        mask_commercial = self._mask_commercial_values(current_user)
        at_risk = [item for item in accounts if item.risk_status in {"warning", "critical"}]
        critical_tasks = self._critical_tasks(tasks)
        critical_task_items = [self._critical_task_item(task, now) for task in critical_tasks]
        widgets = [
            self._widget(
                "summary",
                "Manager attention summary",
                {"my_accounts": len(accounts), "at_risk": len(at_risk), "critical_tasks": len(critical_tasks), "open_tasks": len(tasks)},
                [],
                "assigned_accounts",
                {
                    "tiles": [
                        {"key": "my_accounts", "label": "My Accounts", "value": len(accounts), "route": "/accounts", "detail": "Assigned account portfolio."},
                        {"key": "at_risk", "label": "At risk", "value": len(at_risk), "route": "/accounts?risk=at_risk", "detail": "Warning and critical accounts."},
                        {"key": "critical_tasks", "label": "Critical tasks", "value": len(critical_tasks), "route": "/tasks?priority=critical", "detail": "Critical and blocked tasks only."},
                        {"key": "open_tasks", "label": "Open tasks", "value": len(tasks), "route": "/tasks", "detail": "Open operational work in scope."},
                    ]
                },
                primary_route="/dashboard",
            ),
            self._widget("account_portfolio", "Account portfolio table", None, [self._account_item(account, include_commercial=not mask_commercial) for account in self._slice(accounts, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts"),
            self._widget("critical_tasks", "Critical tasks", None, self._slice(critical_task_items, page, page_size), "assigned_accounts", {"page": page, "page_size": page_size, "total": len(critical_task_items), "source_counts": {"critical_tasks": len(critical_tasks)}}, primary_route="/tasks?priority=critical"),
            self._widget("tasks", "Tasks summary", self._task_breakdown_value(tasks, accounts, current_user.id, now), [self._task_item(task, now) for task in self._slice(tasks, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(tasks), "data_source": "Task records filtered to: owner = AM or account in assigned list"}, primary_route="/tasks"),
            self._pipeline_widget(opportunities, data_scope="assigned_accounts", masked=mask_commercial, page=page, page_size=page_size),
            self._forecast_widget(opportunities, accounts, data_scope="assigned_accounts", masked=mask_commercial),
            self._governance_calendar_widget(governance, data_scope="assigned_accounts", read_only=False),
        ]
        return self._dashboard_read(current_user, "am_home", "AM Home", "account_manager", "assigned_accounts", widgets, read_only=False, filters=["search", "risk", "priority", "account_id"])

    def _build_kam_head_portfolio(
        self,
        current_user: User,
        *,
        search: str | None = None,
        am_id: str | None = None,
        account_id: str | None = None,
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
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk, limit=200)
        scoped_ids = [account.id for account in accounts]
        tasks = self.repository.list_open_tasks(account_ids=scoped_ids, limit=200)
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, limit=200)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=200)
        now = self.repository.now()
        critical_tasks = self._critical_tasks(tasks)
        critical_task_items = [self._critical_task_item(task, now) for task in critical_tasks]
        workload = self._workload(scoped_ids)
        mask_commercial = self._mask_commercial_values(current_user)
        at_risk_accounts = [account for account in accounts if account.risk_status in {"warning", "critical"}]
        widgets = [
            self._widget("summary", "Portfolio attention summary", {"accounts": len(accounts), "at_risk_accounts": len(at_risk_accounts), "critical_tasks": len(critical_tasks), "open_tasks": len(tasks)}, [], "portfolio", primary_route="/dashboard"),
            self._forecast_widget(opportunities, accounts, data_scope="portfolio", masked=mask_commercial),
            self._widget("account_portfolio", "Account portfolio table", None, [self._account_item(account, include_commercial=not mask_commercial) for account in self._slice(accounts, page, page_size)], "portfolio", {"page": page, "page_size": page_size, "total": len(accounts), "masked": mask_commercial}, primary_route="/accounts"),
            self._widget("high_risk_accounts", "At-risk accounts", None, [self._risk_account_item(account, include_commercial=not mask_commercial) for account in self._slice(at_risk_accounts, page, page_size)], "portfolio", {"page": page, "page_size": page_size, "total": len(at_risk_accounts), "masked": mask_commercial}, primary_route="/accounts?risk=at_risk"),
            self._widget("critical_tasks", "Critical tasks", None, self._slice(critical_task_items, page, page_size), "portfolio", {"page": page, "page_size": page_size, "total": len(critical_task_items), "source_counts": {"critical_tasks": len(critical_tasks)}}, primary_route="/tasks?priority=critical"),
            self._governance_calendar_widget(governance, data_scope="portfolio", read_only=False),
            self._pipeline_widget(opportunities, data_scope="portfolio", masked=mask_commercial, page=page, page_size=page_size),
            self._widget("am_workload", "AM workload", None, workload, "portfolio", primary_route="/accounts"),
            self._widget("overdue_actions", "Overdue actions", None, [self._task_item(task, now) for task in tasks if self._is_before(task.due_at, now)][:page_size], "portfolio", primary_route="/tasks"),
        ]
        if include_admin:
            widgets.append(self._admin_system_widget(page_size=page_size))
        display = "Admin Portfolio Dashboard" if include_admin else "KAM Head Portfolio"
        role_group = "admin" if include_admin else "kam_head"
        return self._dashboard_read(current_user, "kam_head_portfolio", display, role_group, "portfolio", widgets, read_only=False, filters=["search", "risk", "segment", "region", "lifecycle_status", "am_id", "account_id"])

    def _build_leadership(self, current_user: User, *, search: str | None = None, segment: str | None = None, region: str | None = None, risk: str | None = None, account_id: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, segment=segment, region=region, risk=risk, limit=200)
        scoped_ids = [account.id for account in accounts]
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, limit=200)
        governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=200)
        masked = True
        can_view_forecast = self._can(current_user, "analytics_portfolio", "view")
        growth_value: dict[str, Any] = {"open_opportunities": len(opportunities)}
        growth_value["pipeline_value"] = "Restricted"
        risk_value: dict[str, Any] = {"at_risk_accounts": len([account for account in accounts if account.risk_status in {"warning", "critical"}])}
        risk_value["at_risk_value"] = "Restricted"
        widgets = [
            self._widget("retention", "Retention outlook", None, [self._account_item(account) for account in accounts if account.lifecycle_status in {"Renewal Focus", "At Risk"}][:page_size], "executive", primary_route="/accounts"),
            self._widget("opportunities", "Opportunities / pipeline", growth_value, [self._opportunity_item(item, mask_value=True) for item in opportunities[:page_size]], "executive", {"masked": True}, primary_route="/opportunities"),
            self._widget("revenue_risk", "Revenue risk", risk_value, [self._risk_account_item(account) for account in accounts if account.risk_status in {"warning", "critical"}][:page_size], "executive", {"masked": True}, primary_route="/accounts?risk=at_risk"),
            self._widget("executive_summaries", "Executive summaries", None, [self._executive_summary_item(account) for account in accounts[:page_size]], "executive", primary_route="/accounts"),
            self._governance_calendar_widget(governance, data_scope="executive", read_only=True),
        ]
        if can_view_forecast:
            widgets.insert(3, self._forecast_widget(opportunities, accounts, data_scope="executive", masked=True))
        return self._dashboard_read(current_user, "leadership", "Leadership Dashboard", "leadership", "executive", widgets, read_only=True, filters=["search", "risk", "segment", "region", "account_id"], metadata={"commercial_values_masked": True})

    def _build_operational_dashboard(self, current_user: User, *, role_group: str, display_name: str, dashboard: str, search: str | None, risk: str | None, account_id: str | None, page: int, page_size: int) -> DashboardRead:
        scoped_ids = self._delivery_operations_scope(current_user)
        if account_id:
            scoped_ids = [account_id] if account_id in scoped_ids else []
        accounts = self.repository.list_accounts(account_ids=scoped_ids, search=search, risk=risk, limit=100)
        account_ids = [account.id for account in accounts]
        direct_tasks = self.repository.list_open_tasks(owner_id=current_user.id, limit=100)
        account_tasks = self.repository.list_open_tasks(account_ids=account_ids, limit=100)
        tasks = self._dedupe_by_id([*direct_tasks, *account_tasks])
        signals = self.repository.list_open_signals(account_ids=account_ids, limit=100)
        governance = self.repository.list_governance_events(account_ids=account_ids, limit=100)
        engagement_health = self.repository.list_engagement_health_items(account_ids=account_ids, limit=100)
        now = self.repository.now()
        widgets = [
            self._widget("summary", f"{display_name} summary", {"authorized_accounts": len(accounts), "open_tasks": len(tasks), "critical_signals": len([item for item in signals if item.severity == "critical"]), "engagement_health_items": len(engagement_health)}, [], role_group, primary_route="/dashboard"),
            self._task_summary_widget(tasks, signals, data_scope=role_group),
            self._widget("tasks", "Operational tasks", None, [self._task_item(task, now) for task in self._slice(tasks, page, page_size)], role_group, {"page": page, "page_size": page_size, "total": len(tasks)}, primary_route="/tasks"),
            self._widget("signals", "Delivery risk signals", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], role_group, {"page": page, "page_size": page_size, "total": len(signals)}, primary_route="/tasks"),
            self._widget("high_risk_accounts", "At-risk accounts", None, [self._risk_account_item(account) for account in accounts if account.risk_status in {"warning", "critical"}][:page_size], role_group, {"total": len(accounts)}, primary_route="/accounts?risk=at_risk"),
            self._engagement_health_widget(engagement_health, data_scope=role_group, page_size=page_size),
            self._governance_calendar_widget(governance, data_scope=role_group, read_only=False),
        ]
        return self._dashboard_read(current_user, dashboard, display_name, role_group, role_group, widgets, read_only=False, filters=["search", "risk", "account_id"])

    def _build_rbac_dashboard(self, current_user: User, *, search: str | None, risk: str | None, account_id: str | None, page: int, page_size: int) -> DashboardRead:
        account_ids = self._account_scope(current_user)
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, risk=risk, limit=100) if self._can(current_user, "account_overview", "view") else []
        scoped_ids = [account.id for account in accounts]
        widgets: list[DashboardWidgetRead] = []
        if accounts:
            widgets.append(self._widget("accounts", "Authorized accounts", None, [self._account_item(account) for account in self._slice(accounts, page, page_size)], "rbac", {"page": page, "page_size": page_size, "total": len(accounts)}, primary_route="/accounts"))
        if self._can(current_user, "playbooks_tasks_calendar", "view"):
            tasks = self.repository.list_open_tasks(account_ids=scoped_ids, owner_id=None if self.access.can_view_portfolio(current_user) else current_user.id, limit=100)
            widgets.append(self._widget("tasks", "Tasks summary", None, [self._task_item(task, self.repository.now()) for task in self._slice(tasks, page, page_size)], "rbac", {"total": len(tasks)}, primary_route="/tasks"))
        if self._can(current_user, "signals_attention", "view"):
            signals = self.repository.list_open_signals(account_ids=scoped_ids, owner_id=None if self.access.can_view_portfolio(current_user) else current_user.id, limit=100)
            widgets.append(self._widget("signals", "Signals", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], "rbac", {"total": len(signals)}, primary_route="/tasks"))
        if self._can(current_user, "governance_reviews", "view"):
            governance = self.repository.list_governance_events(account_ids=scoped_ids, limit=100)
            widgets.append(self._governance_calendar_widget(governance, data_scope="rbac", read_only=True))
        if self._can(current_user, "opportunity_management", "view"):
            opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, owner_id=None if self.access.can_view_portfolio(current_user) else current_user.id, limit=100)
            mask_commercial = self._mask_commercial_values(current_user)
            widgets.append(self._pipeline_widget(opportunities, data_scope="rbac", masked=mask_commercial, page=page, page_size=page_size))
        if accounts and self._can(current_user, "engagement_sow_management", "view"):
            engagement_health = self.repository.list_engagement_health_items(account_ids=scoped_ids, limit=100)
            widgets.append(self._engagement_health_widget(engagement_health, data_scope="rbac", page_size=page_size))
        return self._dashboard_read(current_user, "rbac_widgets", "My Dashboard", "rbac", "authorized_scope", widgets, read_only=not self._can(current_user, "dashboards_reporting", "update"), filters=["search", "risk", "account_id"])

    def _account_scope(self, user: User) -> list[str] | None:
        if self.access.can_view_portfolio(user):
            return None
        return self.repository.account_ids_for_user(user.id)

    def _delivery_operations_scope(self, user: User) -> list[str]:
        ids = set(self.repository.account_ids_for_user_by_ownership_roles(user.id, ["ops_lead", "delivery_lead", "delivery_stakeholder"]))
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
            "tasks": "playbooks_tasks_calendar",
            "critical_tasks": "playbooks_tasks_calendar",
            "ai_task_summary": "playbooks_tasks_calendar",
            "signals": "signals_attention",
            "decision_queue": "signals_attention",
            "governance": "governance_reviews",
            "governance_cadence": "governance_reviews",
            "governance_calendar": "governance_reviews",
            "escalations": "escalation_management",
            "major_escalations": "escalation_management",
            "opportunities": "opportunity_management",
            "growth": "opportunity_management",
            "forecast_chart": "dashboards_reporting",
            "revenue_risk": "analytics_portfolio",
            "retention": "retention_stability",
            "executive_summaries": "account_overview",
            "am_workload": "account_overview",
            "account_change_alerts": "analytics_portfolio",
            "engagement_health": "engagement_sow_management",
            "sla_compliance": "dashboards_reporting",
            "admin_system": "admin_audit_security_rbac",
            "summary": "dashboards_reporting",
        }
        filtered: list[DashboardWidgetRead] = []
        for widget in widgets:
            if widget.key == "opportunities" and user.role in AM_ROLES:
                filtered.append(widget)
                continue
            if widget.key == "forecast_chart" and user.role in AM_ROLES and self._can(user, "opportunity_management", "view"):
                filtered.append(widget)
                continue
            module = module_by_key.get(widget.key, "dashboards_reporting")
            if self._can(user, module, "view"):
                filtered.append(widget)
        return filtered

    def _task_breakdown_value(self, tasks: list, accounts: list, current_user_id: str, now: datetime) -> dict[str, Any]:
        week_end = now + timedelta(days=7)
        open_tasks = [task for task in tasks if task.status in {"open", "todo"}]
        in_progress = [task for task in tasks if task.status == "in_progress"]
        overdue = [task for task in tasks if self._is_before(task.due_at, now)]
        due_this_week = [task for task in tasks if not self._is_before(task.due_at, now) and not self._is_before(week_end, task.due_at)]
        account_ids = {task.account_id for task in open_tasks if task.account_id}
        assigned_to_me = [task for task in tasks if task.owner_id == current_user_id]
        return {
            "open": len(open_tasks),
            "accounts_with_open_tasks": len(account_ids),
            "in_progress": len(in_progress),
            "assigned_to_me": len(assigned_to_me),
            "overdue": len(overdue),
            "due_this_week": len(due_this_week),
            "assigned_accounts": len(accounts),
        }

    def _task_summary_widget(self, tasks: list, signals: list, *, data_scope: str) -> DashboardWidgetRead:
        now = self.repository.now()
        overdue = [task for task in tasks if self._is_before(task.due_at, now)]
        critical_signals = [signal for signal in signals if signal.severity == "critical"]
        headline = "Focus on overdue delivery actions" if overdue else "Review active account signals" if signals else "No urgent work queued"
        blockers = [task.title for task in overdue[:3]] + [signal.title for signal in critical_signals[:3]]
        focus = blockers[0] if blockers else "Maintain account review rhythm and monitor score movement."
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

    def _critical_tasks(self, tasks: list) -> list:
        return [task for task in tasks if task.priority == "critical" or task.status == "blocked"]

    def _critical_task_item(self, task, now: datetime) -> dict[str, Any]:
        item = self._task_item(task, now)
        item["source_type"] = "task"
        item["kind"] = "Critical task"
        item["severity"] = item.get("priority")
        return item

    def _pipeline_widget(self, opportunities: list, *, data_scope: str, masked: bool, page: int, page_size: int) -> DashboardWidgetRead:
        stage_totals: dict[str, dict[str, Any]] = {}
        pipeline = 0.0
        stalled_threshold = self.repository.now() - timedelta(days=90)
        stalled = [item for item in opportunities if self._is_before(item.updated_at, stalled_threshold)]
        for item in opportunities:
            stage = item.stage or "Unstaged"
            value = float(item.value)
            pipeline += value
            row = stage_totals.setdefault(stage, {"stage": stage, "count": 0, "value": 0.0})
            row["count"] += 1
            row["value"] += value
        series = [
            {
                "label": row["stage"],
                "value": row["count"] if masked else round(row["value"], 2),
                "count": row["count"],
                "display_value": "Restricted" if masked else round(row["value"], 2),
            }
            for row in stage_totals.values()
        ]
        value: dict[str, Any] = {
            "open_opportunities": len(opportunities),
            "pipeline_value": "Restricted" if masked else round(pipeline, 2),
            "stalled": len(stalled),
            "series": series,
        }
        return self._widget(
            "opportunities",
            "Opportunities & pipeline" if data_scope == "assigned_accounts" else "Opportunities / pipeline",
            value,
            [self._opportunity_item(item, mask_value=masked) for item in self._slice(opportunities, page, page_size)],
            data_scope,
            {"page": page, "page_size": page_size, "total": len(opportunities), "masked": masked, "stalled_after_days": 90},
            primary_route="/opportunities",
        )

    def _forecast_widget(self, opportunities: list, accounts: list, *, data_scope: str, masked: bool) -> DashboardWidgetRead:
        forecast = self.forecasting.generate(accounts, months=6)
        value = self._forecast_dashboard_value(forecast, masked=masked)
        value["open_opportunities"] = len(opportunities)
        return self._widget(
            "forecast_chart",
            "6-Month Revenue Forecast",
            value,
            [],
            data_scope,
            {
                "masked": masked,
                "chart_type": "line",
                "source": "shared_forecasting_service",
                "months": forecast.months,
                "account_count": len(accounts),
                "account_filter_supported": True,
                "account_options": [{"id": account.id, "name": account.name} for account in accounts],
            },
            primary_route="/dashboard",
        )

    def _forecast_dashboard_value(self, forecast: AiForecastResponse, *, masked: bool) -> dict[str, Any]:
        payload = forecast.model_dump(mode="json")
        payload["open_opportunities"] = forecast.totals.open_opportunities
        payload["at_risk_accounts"] = forecast.totals.at_risk_accounts
        payload["pipeline_value"] = forecast.totals.pipeline_value
        payload["weighted_forecast"] = forecast.totals.forecast_revenue
        payload["series"] = [
            {
                "label": point.month,
                "value": point.forecast_revenue,
                "display_value": point.forecast_revenue,
                "baseline_revenue": point.baseline_revenue,
                "weighted_opportunity": point.weighted_opportunity,
                "growth_adjustment": point.growth_adjustment,
                "risk_adjustment": point.risk_adjustment,
                "forecast_revenue": point.forecast_revenue,
            }
            for point in forecast.points
        ]
        if masked:
            return self._mask_forecast_payload(payload)
        return payload

    def _mask_forecast_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        commercial_keys = {
            "baseline_revenue",
            "weighted_opportunity",
            "growth_adjustment",
            "risk_adjustment",
            "forecast_revenue",
            "commercial_value",
            "contracted_baseline",
            "pipeline_value",
            "weighted_forecast",
            "value",
            "display_value",
        }

        def mask(value: Any, key: str | None = None) -> Any:
            if key in commercial_keys and isinstance(value, (int, float)):
                return "Restricted"
            if isinstance(value, list):
                return [mask(item) for item in value]
            if isinstance(value, dict):
                return {child_key: mask(child_value, child_key) for child_key, child_value in value.items()}
            return value

        masked = mask(payload)
        if isinstance(masked, dict):
            masked["summary"] = "Forecast calculated with the shared KAM AI logic. Commercial values are restricted for this role."
            masked["highlights"] = [
                f"{payload.get('open_opportunities', 0)} open opportunity/opportunities in scope.",
                f"{payload.get('at_risk_accounts', 0)} at-risk account(s) influence the risk adjustment.",
                "Commercial forecast values are masked by role-based access.",
            ]
            series = masked.get("series")
            if isinstance(series, list):
                for item in series:
                    if isinstance(item, dict):
                        item["value"] = 1
                        item["display_value"] = "Restricted"
            return masked
        return payload

    def _governance_calendar_widget(self, governance: list, *, data_scope: str, read_only: bool) -> DashboardWidgetRead:
        now = self.repository.now()
        upcoming = [item for item in governance if not self._is_before(item.scheduled_at, now)]
        overdue = [item for item in governance if self._is_before(item.scheduled_at, now) and item.status not in {"completed", "cancelled"}]
        return self._widget(
            "governance_calendar",
            "Global / Governance Calendar",
            {"upcoming": len(upcoming), "overdue": len(overdue)},
            [self._governance_item(item) for item in upcoming[:8]],
            data_scope,
            {"total": len(governance), "calendar_source": "governance_events", "read_only": read_only},
            primary_route="/governance",
        )

    def _engagement_health_widget(self, engagements: list, *, data_scope: str, page_size: int) -> DashboardWidgetRead:
        weak = [item for item in engagements if item.delivery_health < 60]
        watch = [item for item in engagements if 60 <= item.delivery_health < 75]
        return self._widget(
            "engagement_health",
            "Engagement / SOW health",
            {"critical": len(weak), "watch": len(watch), "total": len(engagements)},
            [self._engagement_health_item(item) for item in engagements[:page_size]],
            data_scope,
            {"total": len(engagements)},
            primary_route="/accounts",
        )

    def _admin_system_widget(self, *, page_size: int) -> DashboardWidgetRead:
        counts = self.repository.admin_system_counts()
        items = [
            *[self._admin_worker_item(item) for item in self.repository.list_failed_worker_runs(limit=page_size)],
            *[self._admin_notification_item(item) for item in self.repository.list_failed_notifications(limit=page_size)],
            *[self._admin_integration_item(item) for item in self.repository.list_integration_errors(limit=page_size)],
        ]
        items.sort(key=lambda item: str(item.get("created_at") or item.get("updated_at") or ""), reverse=True)
        return self._widget(
            "admin_system",
            "Admin / system alerts",
            counts,
            items[:page_size],
            "platform",
            {"total": len(items), "sources": ["scheduled_worker_runs", "notification_records", "integration_connections"]},
            primary_route="/admin",
        )

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
    def _account_item(account, *, include_commercial: bool = False) -> dict[str, Any]:
        primary = next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)
        item = {
            "id": account.id,
            "account_id": account.id,
            "name": account.name,
            "account_name": account.name,
            "risk_status": account.risk_status,
            "health": account.health_overall,
            "health_score": account.health_overall,
            "segment": account.segment,
            "region": account.region,
            "lifecycle_status": account.lifecycle_status,
            "owner": primary.user_name if primary else None,
            "next_governance_at": account.next_governance_at.isoformat() if account.next_governance_at else None,
            "route": f"/accounts/{account.id}",
        }
        if include_commercial:
            item["commercial_value"] = float(account.commercial_value)
            item["currency"] = account.currency
        return item

    @staticmethod
    def _risk_account_item(account, *, include_commercial: bool = False) -> dict[str, Any]:
        item = DashboardsService._account_item(account, include_commercial=include_commercial)
        item["risk_reason"] = DashboardsService._risk_reason(account)
        item["route"] = f"/accounts/{account.id}?tab=health"
        return item

    @staticmethod
    def _risk_reason(account) -> str:
        reasons: list[str] = []
        status = (account.risk_status or "").lower()
        if status == "critical":
            reasons.append("Critical risk status")
        elif status == "warning":
            reasons.append("Warning risk status")
        if account.health_overall is not None:
            if account.health_overall < 60:
                reasons.append(f"health score is {account.health_overall}, below the critical threshold of 60")
            elif account.health_overall < 75:
                reasons.append(f"health score is {account.health_overall}, below the watch threshold of 75")
            else:
                reasons.append(f"health score is {account.health_overall}")
        if account.lifecycle_status in {"At Risk", "Renewal Focus"}:
            reasons.append(f"lifecycle is {account.lifecycle_status}")
        return "; ".join(reasons) if reasons else "Risk status requires review in Account Health."

    @staticmethod
    def _executive_summary_item(account) -> dict[str, Any]:
        primary = next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)
        return {
            "id": account.id,
            "title": account.name,
            "account_id": account.id,
            "account_name": account.name,
            "risk_status": account.risk_status,
            "health_score": account.health_overall,
            "lifecycle_status": account.lifecycle_status,
            "segment": account.segment,
            "region": account.region,
            "owner": primary.user_name if primary else None,
            "next_governance_at": account.next_governance_at.isoformat() if account.next_governance_at else None,
            "updated_at": account.updated_at.isoformat() if account.updated_at else None,
            "route": f"/accounts/{account.id}",
        }

    @staticmethod
    def _task_item(task, now: datetime) -> dict[str, Any]:
        account_name = task.account.name if getattr(task, "account", None) else None
        return {"id": task.id, "title": task.title, "account_id": task.account_id, "account_name": account_name, "owner": task.owner_name, "priority": task.priority, "status": task.status, "source_type": task.source_type, "due_at": task.due_at.isoformat(), "overdue": DashboardsService._is_before(task.due_at, now), "route": f"/tasks?account_id={task.account_id}"}

    @staticmethod
    def _is_before(value: datetime, reference: datetime) -> bool:
        if value.tzinfo is None and reference.tzinfo is not None:
            reference = reference.replace(tzinfo=None)
        elif value.tzinfo is not None and reference.tzinfo is None:
            value = value.replace(tzinfo=None)
        return value < reference

    @staticmethod
    def _signal_item(signal) -> dict[str, Any]:
        account_name = signal.account.name if getattr(signal, "account", None) else None
        return {"id": signal.id, "title": signal.title, "account_id": signal.account_id, "account_name": account_name, "source_type": "signal", "kind": "Signal", "severity": signal.severity, "status": signal.status, "owner": signal.owner_name, "due_at": signal.due_at.isoformat() if signal.due_at else None, "route": signal.source_record_route or f"/accounts/{signal.account_id}?tab=health"}

    @staticmethod
    def _opportunity_item(opportunity, *, mask_value: bool = False) -> dict[str, Any]:
        account_name = opportunity.account.name if getattr(opportunity, "account", None) else None
        value: str | float = "Restricted" if mask_value else float(opportunity.value)
        return {"id": opportunity.id, "name": opportunity.name, "title": opportunity.name, "account_id": opportunity.account_id, "account_name": account_name, "stage": opportunity.stage, "service_line": opportunity.service_line, "value": value, "display_value": value, "target_date": opportunity.target_date.isoformat(), "owner": opportunity.owner_name, "route": f"/accounts/{opportunity.account_id}?tab=opportunities"}

    @staticmethod
    def _governance_item(event) -> dict[str, Any]:
        account_name = event.account.name if getattr(event, "account", None) else None
        title = f"{event.governance_type} - {account_name}" if account_name else event.governance_type
        return {"id": event.id, "title": title, "account_id": event.account_id, "account_name": account_name, "type": event.governance_type, "status": event.status, "scheduled_at": event.scheduled_at.isoformat(), "owner": event.owner_name, "route": f"/accounts/{event.account_id}?tab=governance" if event.account_id else "/governance"}

    @staticmethod
    def _engagement_health_item(engagement) -> dict[str, Any]:
        account_name = engagement.account.name if getattr(engagement, "account", None) else None
        return {
            "id": engagement.id,
            "title": engagement.name,
            "account_id": engagement.account_id,
            "account_name": account_name,
            "delivery_health": engagement.delivery_health,
            "health_status": engagement.health_status,
            "renewal_risk": engagement.renewal_risk,
            "delivery_status": engagement.delivery_status,
            "renewal_date": engagement.renewal_date.isoformat() if engagement.renewal_date else None,
            "owner": engagement.owner_name,
            "route": f"/accounts/{engagement.account_id}/engagements/{engagement.id}",
        }

    @staticmethod
    def _admin_worker_item(worker) -> dict[str, Any]:
        return {
            "id": worker.id,
            "title": f"{worker.job_type} worker failed",
            "source_type": "scheduled_worker_run",
            "status": worker.status,
            "severity": "critical",
            "affected_count": worker.affected_count,
            "matched_count": worker.matched_count,
            "detail": worker.error_message,
            "owner": worker.actor_name,
            "created_at": worker.created_at.isoformat(),
            "route": "/admin?tab=jobs",
        }

    @staticmethod
    def _admin_notification_item(notification) -> dict[str, Any]:
        return {
            "id": notification.id,
            "title": notification.title,
            "source_type": "notification_record",
            "status": notification.delivery_status,
            "severity": notification.priority,
            "trigger": notification.trigger,
            "account_id": notification.account_id,
            "account_name": notification.account_name_snapshot,
            "owner": notification.recipient_name,
            "created_at": notification.created_at.isoformat(),
            "route": notification.source_record_route or "/admin?tab=notification-log",
        }

    @staticmethod
    def _admin_integration_item(integration) -> dict[str, Any]:
        return {
            "id": integration.id,
            "title": f"{integration.provider} integration error",
            "source_type": "integration_connection",
            "status": integration.status,
            "severity": "warning",
            "detail": integration.last_error,
            "failure_count": integration.failure_count,
            "created_at": integration.updated_at.isoformat(),
            "route": "/admin?tab=integrations",
        }

    def _workload(self, account_ids: list[str]) -> list[dict[str, Any]]:
        rows = self.repository.list_active_account_owners(account_ids=account_ids, ownership_roles=sorted(AM_OWNERSHIP_ROLES))
        counts: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = row.user_id or row.user_name
            entry = counts.setdefault(
                key,
                {
                    "owner_id": row.user_id,
                    "owner": row.user_name,
                    "account_ids": set(),
                    "route": f"/accounts?am_id={row.user_id}" if row.user_id else "/accounts",
                },
            )
            entry["account_ids"].add(row.account_id)
        result = [
            {"owner_id": item["owner_id"], "owner": item["owner"], "accounts": len(item["account_ids"]), "status": "accounts", "route": item["route"]}
            for item in counts.values()
        ]
        return sorted(result, key=lambda item: item["accounts"], reverse=True)

    def _mask_commercial_values(self, user: User) -> bool:
        if user.role in LEADERSHIP_ROLES:
            return True
        if user.role in AM_ROLES and self._can(user, "opportunity_management", "view"):
            return False
        return not self._can(user, "analytics_portfolio", "view")
