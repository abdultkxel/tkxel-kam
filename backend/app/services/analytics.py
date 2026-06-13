from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Account, AccountOwner, User, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.analytics import AnalyticsRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    AnalyticsBenchmarkPageRead,
    AnalyticsBenchmarkRead,
    AnalyticsMetricRead,
    AnalyticsPortfolioRead,
    AnalyticsSeriesRead,
    KamPerformancePageRead,
    KamPerformanceRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.user_management import page_count

ANALYTICS_MODULE = "analytics_portfolio"


class AnalyticsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AnalyticsRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))

    def portfolio(
        self,
        current_user: User,
        *,
        search: str | None = None,
        am_id: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        lifecycle_status: str | None = None,
        risk: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> AnalyticsPortfolioRead:
        self.access.require_module_permission(current_user, ANALYTICS_MODULE, "view")
        accounts = self._accounts(current_user, search=search, am_id=am_id, segment=segment, region=region, lifecycle_status=lifecycle_status, risk=risk)
        account_ids = [account.id for account in accounts]
        opportunities = self.repository.list_open_opportunities(account_ids)
        escalations = self.repository.list_open_escalations(account_ids)
        tasks = self.repository.list_open_tasks(account_ids)
        signals = self.repository.list_open_signals(account_ids)
        snapshots = self.repository.list_score_snapshots(account_ids=account_ids, date_from=date_from, date_to=date_to)
        avg_health = round(sum(account.health_overall for account in accounts) / len(accounts)) if accounts else 0
        open_pipeline = round(sum(float(item.value or 0) for item in opportunities), 2)
        overdue_tasks = [task for task in tasks if task.due_at < utc_now()]
        generated_at = utc_now()
        metrics = [
            AnalyticsMetricRead(label="Authorized accounts", value=len(accounts)),
            AnalyticsMetricRead(label="Average health", value=avg_health, tone="warning" if avg_health < 65 else "success"),
            AnalyticsMetricRead(label="Open pipeline", value=open_pipeline),
            AnalyticsMetricRead(label="Open escalations", value=len(escalations), tone="warning" if escalations else "success"),
            AnalyticsMetricRead(label="Overdue actions", value=len(overdue_tasks), tone="warning" if overdue_tasks else "success"),
        ]
        trend_rows = self._health_trend_rows(accounts, snapshots)
        driver_rows = self._driver_rows(accounts)
        escalation_rows = self._escalation_rows(accounts, escalations)
        kam_rows = self._kam_rows(accounts, tasks, escalations, opportunities)
        self.audit.log(
            module=ANALYTICS_MODULE,
            action="portfolio_query",
            entity_type="analytics",
            entity_id="portfolio",
            actor=current_user,
            after_value={"filters": self._filters(search, am_id, segment, region, lifecycle_status, risk, date_from, date_to), "account_count": len(accounts)},
        )
        self.db.commit()
        return AnalyticsPortfolioRead(
            generated_at=generated_at,
            filters=self._filters(search, am_id, segment, region, lifecycle_status, risk, date_from, date_to),
            metrics=metrics,
            series=[
                AnalyticsSeriesRead(name="health_trend", rows=trend_rows),
                AnalyticsSeriesRead(name="dimension_drivers", rows=driver_rows),
                AnalyticsSeriesRead(name="escalation_intelligence", rows=escalation_rows),
                AnalyticsSeriesRead(name="kam_performance", rows=kam_rows),
            ],
            drilldowns={
                "high_risk_accounts": [self._account_row(account) for account in accounts if account.risk_status in {"warning", "critical"}][:50],
                "open_opportunities": [self._opportunity_row(item) for item in opportunities[:50]],
                "open_escalations": [self._escalation_row(item) for item in escalations[:50]],
                "open_signals": [{"id": item.id, "account_id": item.account_id, "title": item.title, "severity": item.severity, "status": item.status} for item in signals[:50]],
            },
            redactions={"commercial_metrics": False, "hidden_record_counts": False},
        )

    def benchmarks(self, current_user: User, *, cohort_by: str = "segment", page: int = 1, page_size: int = 25) -> AnalyticsBenchmarkPageRead:
        self.access.require_module_permission(current_user, ANALYTICS_MODULE, "view")
        accounts = self._accounts(current_user)
        grouped: dict[str, list[Account]] = defaultdict(list)
        for account in accounts:
            key = getattr(account, cohort_by, None) or "Unknown"
            grouped[str(key)].append(account)
        rows = []
        for cohort, cohort_accounts in sorted(grouped.items()):
            suppressed = len(cohort_accounts) < 3
            avg_health = round(sum(account.health_overall for account in cohort_accounts) / len(cohort_accounts)) if cohort_accounts else 0
            avg_pipeline = 0.0
            if not suppressed:
                opportunities = self.repository.list_open_opportunities([account.id for account in cohort_accounts])
                avg_pipeline = round(sum(float(item.value or 0) for item in opportunities) / max(1, len(cohort_accounts)), 2)
            rows.append(
                AnalyticsBenchmarkRead(
                    cohort=cohort,
                    account_count=len(cohort_accounts),
                    average_health=0 if suppressed else avg_health,
                    average_pipeline=0 if suppressed else avg_pipeline,
                    risk_distribution={} if suppressed else self._risk_distribution(cohort_accounts),
                    suppressed=suppressed,
                    reason="Benchmark cohort requires at least 3 accounts." if suppressed else None,
                )
            )
        total = len(rows)
        return AnalyticsBenchmarkPageRead(items=rows[(page - 1) * page_size : page * page_size], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def kam_performance(self, current_user: User, *, page: int = 1, page_size: int = 25) -> KamPerformancePageRead:
        self.access.require_module_permission(current_user, ANALYTICS_MODULE, "view")
        accounts = self._accounts(current_user)
        tasks = self.repository.list_open_tasks([account.id for account in accounts])
        escalations = self.repository.list_open_escalations([account.id for account in accounts])
        opportunities = self.repository.list_open_opportunities([account.id for account in accounts])
        rows = self._kam_rows(accounts, tasks, escalations, opportunities)
        items = [KamPerformanceRead(**row) for row in rows]
        total = len(items)
        return KamPerformancePageRead(items=items[(page - 1) * page_size : page * page_size], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def _accounts(self, current_user: User, **filters: Any) -> list[Account]:
        return self.repository.list_accounts(account_ids=self._account_scope(current_user), **filters)

    def _account_scope(self, current_user: User) -> list[str] | None:
        return None if self.access.can_view_portfolio(current_user) else self.repository.account_ids_for_user(current_user.id)

    @staticmethod
    def _primary_owner(account: Account) -> AccountOwner | None:
        return next((owner for owner in account.owners if owner.is_active and owner.ownership_role == "primary_am"), None)

    @staticmethod
    def _health_trend_rows(accounts: list[Account], snapshots: list) -> list[dict[str, Any]]:
        buckets: dict[str, list[int]] = defaultdict(list)
        for snapshot in snapshots:
            month = snapshot.calculated_at.strftime("%b %Y")
            buckets[month].append(snapshot.overall)
        if not buckets:
            now = utc_now().strftime("%b %Y")
            return [{"month": now, "average_health": round(sum(account.health_overall for account in accounts) / len(accounts)) if accounts else 0}]
        return [{"month": month, "average_health": round(sum(values) / len(values))} for month, values in buckets.items()]

    @staticmethod
    def _driver_rows(accounts: list[Account]) -> list[dict[str, Any]]:
        metrics = {
            "Relationship": [account.health_relationship for account in accounts],
            "Usage": [account.health_usage for account in accounts],
            "Delivery": [account.health_delivery for account in accounts],
            "Commercial": [account.health_commercial for account in accounts],
        }
        return [{"dimension": key, "average": round(sum(values) / len(values)) if values else 0, "at_risk_count": len([value for value in values if value < 65])} for key, values in metrics.items()]

    @staticmethod
    def _escalation_rows(accounts: list[Account], escalations: list) -> list[dict[str, Any]]:
        segments = {account.id: account.segment for account in accounts}
        counts: dict[str, int] = defaultdict(int)
        for escalation in escalations:
            counts[segments.get(escalation.account_id, "Unknown")] += 1
        return [{"segment": segment, "escalations": count} for segment, count in sorted(counts.items())]

    def _kam_rows(self, accounts: list[Account], tasks: list, escalations: list, opportunities: list) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        account_owner: dict[str, str] = {}
        for account in accounts:
            owner = self._primary_owner(account)
            key = owner.user_id if owner and owner.user_id else owner.user_name if owner else "unassigned"
            account_owner[account.id] = key
            row = grouped.setdefault(key, {"owner_id": owner.user_id if owner else None, "owner_name": owner.user_name if owner else "Unassigned", "accounts": [], "account_count": 0, "health_values": []})
            row["account_count"] += 1
            row["accounts"].append(account.id)
            row["health_values"].append(account.health_overall)
        now = utc_now()
        for row in grouped.values():
            ids = set(row["accounts"])
            owner_tasks = [task for task in tasks if task.account_id in ids]
            owner_escalations = [item for item in escalations if item.account_id in ids]
            owner_opportunities = [item for item in opportunities if item.account_id in ids]
            overdue = [task for task in owner_tasks if task.due_at < now]
            governance_ready = [account for account in accounts if account.id in ids and account.next_governance_at is not None]
            renewal_ready = [account for account in accounts if account.id in ids and account.lifecycle_status != "At Risk"]
            row.update(
                {
                    "average_health": round(sum(row["health_values"]) / len(row["health_values"])) if row["health_values"] else 0,
                    "overdue_action_rate": round((len(overdue) / max(1, len(owner_tasks))) * 100, 2),
                    "governance_cadence_rate": round((len(governance_ready) / max(1, row["account_count"])) * 100, 2),
                    "renewal_readiness": round((len(renewal_ready) / max(1, row["account_count"])) * 100),
                    "open_pipeline": round(sum(float(item.value or 0) for item in owner_opportunities), 2),
                    "open_escalations": len(owner_escalations),
                }
            )
            row.pop("accounts", None)
            row.pop("health_values", None)
        return sorted(grouped.values(), key=lambda item: (item["open_escalations"], -item["average_health"]), reverse=True)

    @staticmethod
    def _risk_distribution(accounts: list[Account]) -> dict[str, int]:
        result = {"healthy": 0, "warning": 0, "critical": 0}
        for account in accounts:
            result[account.risk_status] = result.get(account.risk_status, 0) + 1
        return result

    @staticmethod
    def _account_row(account: Account) -> dict[str, Any]:
        owner = AnalyticsService._primary_owner(account)
        return {"id": account.id, "name": account.name, "segment": account.segment, "region": account.region, "risk_status": account.risk_status, "health": account.health_overall, "owner_name": owner.user_name if owner else None}

    @staticmethod
    def _opportunity_row(opportunity: Any) -> dict[str, Any]:
        return {"id": opportunity.id, "account_id": opportunity.account_id, "name": opportunity.name, "stage": opportunity.stage, "value": float(opportunity.value or 0), "owner_name": opportunity.owner_name}

    @staticmethod
    def _escalation_row(escalation: Any) -> dict[str, Any]:
        return {"id": escalation.id, "account_id": escalation.account_id, "summary": escalation.summary, "severity": escalation.severity, "status": escalation.status, "owner_name": escalation.owner_name}

    @staticmethod
    def _filters(*values: Any) -> dict[str, Any]:
        keys = ("search", "am_id", "segment", "region", "lifecycle_status", "risk", "date_from", "date_to")
        return {key: value.isoformat() if isinstance(value, datetime) else value for key, value in zip(keys, values) if value not in (None, "")}
