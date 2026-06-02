from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import AccountOwner, User
from app.repositories.accounts import AccountRepository
from app.repositories.dashboards import DashboardRepository
from app.repositories.rbac import RbacRepository
from app.schemas import DashboardRead, DashboardWidgetRead, TaskSummaryRefreshRead
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES


class DashboardsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DashboardRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)

    def am_home(self, current_user: User, *, search: str | None = None, account_id: str | None = None, priority: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        account_ids = self._account_scope(current_user)
        if account_id:
            account_ids = [account_id] if account_ids is None or account_id in account_ids else []
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, limit=100)
        tasks = self.repository.list_open_tasks(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        if priority:
            tasks = [task for task in tasks if task.priority == priority]
        signals = self.repository.list_open_signals(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        escalations = self.repository.list_open_escalations(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        opportunities = self.repository.list_open_opportunities(account_ids=account_ids, owner_id=None if current_user.role in GLOBAL_VIEW_ROLES else current_user.id, limit=100)
        governance = self.repository.list_governance_events(account_ids=account_ids, limit=100)
        now = self.repository.now()
        widgets = [
            self._widget("summary", "Attention summary", {"assigned_accounts": len(accounts), "open_signals": len(signals), "open_tasks": len(tasks), "open_escalations": len(escalations), "open_opportunities": len(opportunities)}, [], "assigned_accounts"),
            self._task_summary_widget(tasks, signals, data_scope="assigned_accounts"),
            self._widget("accounts", "Assigned accounts", None, [self._account_item(account) for account in self._slice(accounts, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(accounts)}),
            self._widget("tasks", "Overdue and active tasks", None, [self._task_item(task, now) for task in self._slice(tasks, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(tasks)}),
            self._widget("signals", "Signals", None, [self._signal_item(signal) for signal in self._slice(signals, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(signals)}),
            self._widget("escalations", "Open escalations", None, [self._escalation_item(item) for item in self._slice(escalations, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(escalations)}),
            self._widget("opportunities", "Opportunities", None, [self._opportunity_item(item) for item in self._slice(opportunities, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(opportunities)}),
            self._widget("governance", "Governance cadence", None, [self._governance_item(item) for item in self._slice(governance, page, page_size)], "assigned_accounts", {"page": page, "page_size": page_size, "total": len(governance)}),
        ]
        return DashboardRead(dashboard="am_home", generated_at=now, data_scope="assigned_accounts", widgets=widgets)

    def refresh_task_summary(self, current_user: User) -> TaskSummaryRefreshRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
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
            self._widget("health_distribution", "Health distribution", self._health_distribution(accounts), [], "portfolio"),
            self._widget("high_risk_accounts", "High-risk accounts", None, [self._account_item(account) for account in self._slice([account for account in accounts if account.risk_status in {"warning", "critical"}], page, page_size)], "portfolio", {"page": page, "page_size": page_size, "total": len(accounts)}),
            self._widget("stale_kyc", "Stale KYC", None, self._stale_kyc_items(accounts), "portfolio"),
            self._widget("escalations", "Major escalations", None, [self._escalation_item(item) for item in self._slice(escalations, page, page_size)], "portfolio", {"total": len(escalations)}),
            self._widget("renewal_focus", "Renewal focus", None, [self._opportunity_item(item) for item in opportunities if item.stage.lower() != "won"][:page_size], "portfolio", {"total": len(opportunities)}),
            self._widget("am_workload", "AM workload", None, workload, "portfolio"),
            self._widget("overdue_actions", "Overdue actions", None, [self._task_item(task, now) for task in tasks if task.due_at < now][:page_size], "portfolio"),
            self._widget("governance_cadence", "Governance cadence", None, [self._governance_item(item) for item in governance[:page_size]], "portfolio"),
            self._widget("sla_compliance", "SLA compliance", {"critical_signals": len([item for item in signals if item.severity == "critical"]), "open_escalations": len(escalations), "overdue_tasks": len([item for item in tasks if item.due_at < now])}, [], "portfolio"),
        ]
        return DashboardRead(dashboard="kam_head_portfolio", generated_at=now, data_scope="portfolio", widgets=widgets)

    def leadership(self, current_user: User, *, search: str | None = None, segment: str | None = None, region: str | None = None, risk: str | None = None, page: int = 1, page_size: int = 10) -> DashboardRead:
        self.access.require_module_permission(current_user, "dashboards_reporting", "view")
        account_ids = self._account_scope(current_user)
        accounts = self.repository.list_accounts(account_ids=account_ids, search=search, segment=segment, region=region, risk=risk, limit=200)
        scoped_ids = [account.id for account in accounts]
        escalations = self.repository.list_open_escalations(account_ids=scoped_ids, limit=200)
        opportunities = self.repository.list_open_opportunities(account_ids=scoped_ids, limit=200)
        signals = self.repository.list_open_signals(account_ids=scoped_ids, limit=200)
        now = self.repository.now()
        widgets = [
            self._widget("strategic_health", "Strategic health", self._health_distribution(accounts), [], "executive"),
            self._widget("retention", "Retention outlook", None, [self._account_item(account) for account in accounts if account.lifecycle_status in {"Renewal Focus", "At Risk"}][:page_size], "executive"),
            self._widget("growth", "Growth", {"pipeline_value": sum(float(item.value) for item in opportunities), "open_opportunities": len(opportunities)}, [self._opportunity_item(item) for item in opportunities[:page_size]], "executive"),
            self._widget("revenue_risk", "Revenue risk", {"at_risk_value": sum(float(account.commercial_value) for account in accounts if account.risk_status == "critical")}, [self._account_item(account) for account in accounts if account.risk_status == "critical"][:page_size], "executive"),
            self._widget("major_escalations", "Major escalations", None, [self._escalation_item(item) for item in escalations[:page_size]], "executive"),
            self._widget("executive_summaries", "Executive summaries", None, [{"account": account.name, "summary": f"{account.name} is {account.risk_status} with health {account.health_overall}.", "account_id": account.id} for account in accounts[:page_size]], "executive"),
            self._widget("decision_queue", "Decision queue", None, [self._signal_item(item) for item in signals[:page_size]], "executive"),
        ]
        return DashboardRead(dashboard="leadership", generated_at=now, data_scope="executive", widgets=widgets)

    def _account_scope(self, user: User) -> list[str] | None:
        if user.role in GLOBAL_VIEW_ROLES:
            return None
        return self.repository.account_ids_for_user(user.id)

    def _task_summary_widget(self, tasks: list, signals: list, *, data_scope: str) -> DashboardWidgetRead:
        now = self.repository.now()
        overdue = [task for task in tasks if task.due_at < now]
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
        )

    def _widget(self, key: str, title: str, value: Any | None, items: list[dict[str, Any]], data_scope: str, metadata: dict[str, Any] | None = None) -> DashboardWidgetRead:
        return DashboardWidgetRead(key=key, title=title, status="empty" if value in (None, {}, []) and not items else "complete", generated_at=self.repository.now(), data_scope=data_scope, value=value, items=items, metadata=metadata or {})

    @staticmethod
    def _slice(items: list, page: int, page_size: int) -> list:
        start = (page - 1) * page_size
        return items[start : start + page_size]

    @staticmethod
    def _account_item(account) -> dict[str, Any]:
        primary = next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)
        return {"id": account.id, "name": account.name, "risk_status": account.risk_status, "health": account.health_overall, "segment": account.segment, "region": account.region, "owner": primary.user_name if primary else None, "next_governance_at": account.next_governance_at.isoformat() if account.next_governance_at else None}

    @staticmethod
    def _task_item(task, now: datetime) -> dict[str, Any]:
        return {"id": task.id, "title": task.title, "account_id": task.account_id, "owner": task.owner_name, "priority": task.priority, "status": task.status, "due_at": task.due_at.isoformat(), "overdue": task.due_at < now}

    @staticmethod
    def _signal_item(signal) -> dict[str, Any]:
        return {"id": signal.id, "title": signal.title, "account_id": signal.account_id, "severity": signal.severity, "status": signal.status, "owner": signal.owner_name, "route": signal.source_record_route}

    @staticmethod
    def _escalation_item(escalation) -> dict[str, Any]:
        return {"id": escalation.id, "summary": escalation.summary, "account_id": escalation.account_id, "severity": escalation.severity, "priority": escalation.priority, "status": escalation.status, "sla_due_at": escalation.sla_due_at.isoformat(), "owner": escalation.owner_name}

    @staticmethod
    def _opportunity_item(opportunity) -> dict[str, Any]:
        return {"id": opportunity.id, "name": opportunity.name, "account_id": opportunity.account_id, "stage": opportunity.stage, "service_line": opportunity.service_line, "value": float(opportunity.value), "target_date": opportunity.target_date.isoformat(), "owner": opportunity.owner_name}

    @staticmethod
    def _governance_item(event) -> dict[str, Any]:
        return {"id": event.id, "account_id": event.account_id, "type": event.governance_type, "status": event.status, "scheduled_at": event.scheduled_at.isoformat(), "owner": event.owner_name}

    def _stale_kyc_items(self, accounts: list) -> list[dict[str, Any]]:
        items = []
        for account in accounts:
            snapshot = self.repository.latest_kyc_snapshot(account.id)
            if snapshot and snapshot.freshness_status == "fresh":
                continue
            items.append({"account_id": account.id, "account": account.name, "freshness_status": snapshot.freshness_status if snapshot else "missing", "approved_at": snapshot.approved_at.isoformat() if snapshot else None})
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
            counts.setdefault(key, {"owner_id": row.user_id, "owner": row.user_name, "accounts": 0})
            counts[key]["accounts"] += 1
        return sorted(counts.values(), key=lambda item: item["accounts"], reverse=True)
