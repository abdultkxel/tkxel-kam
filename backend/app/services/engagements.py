from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import AccountHealthSnapshot, Engagement, EngagementHealthSnapshot
from app.repositories.engagements import EngagementRepository
from app.schemas import (
    AccountHealthRollupRead,
    AccountHealthSnapshotRead,
    EngagementContributionRead,
    EngagementCreateRequest,
    EngagementHealthRead,
    EngagementPageRead,
    EngagementRead,
    EngagementUpdateRequest,
    MessageResponse,
    validate_engagement_dates,
)
from app.services.user_management import page_count

PUBLISHED_FORMULA_VERSION = "engagement-health-v1"
CONFIGURED_CURRENCY = "USD"
ACTIVE_ROLLUP_STATUSES = {"active", "renewal_watch", "at_risk"}

SortField = Literal["renewal_date", "end_date", "value", "delivery_status", "updated_date"]
SortDirection = Literal["asc", "desc"]
RenewalWindow = Literal["all", "expired", "next_30", "next_60", "next_90"]
ContributionSortField = Literal["score", "risk", "freshness", "value"]


@dataclass(frozen=True)
class HealthCalculation:
    score: int
    rag_status: str
    drivers: list[str]
    freshness: str
    dirty: bool
    metric_inputs: dict


class EngagementService:
    def __init__(self, db: Session, repository: EngagementRepository | None = None) -> None:
        self.repository = repository or EngagementRepository(db)

    def list_account_engagements(
        self,
        account_id: str,
        status_filter: str | None = None,
        owner: str | None = None,
        service_line: str | None = None,
        renewal_window: RenewalWindow = "all",
        risk_status: str | None = None,
        search: str | None = None,
        sort_by: SortField = "updated_date",
        sort_dir: SortDirection = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> EngagementPageRead:
        engagements = self.repository.list_for_account(account_id)
        filtered = [
            engagement
            for engagement in engagements
            if self._matches_filters(engagement, status_filter, owner, service_line, renewal_window, risk_status, search)
        ]
        sorted_items = sorted(filtered, key=lambda item: self._sort_value(item, sort_by), reverse=sort_dir == "desc")
        total = len(sorted_items)
        page_items = sorted_items[(page - 1) * page_size : page * page_size]
        return EngagementPageRead(items=[EngagementRead.model_validate(item) for item in page_items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_engagement(self, account_id: str, payload: EngagementCreateRequest) -> Engagement:
        engagement = Engagement(account_id=account_id, **self._json_ready(payload.model_dump()))
        self._validate_persisted_engagement(engagement)
        self.repository.add(engagement)
        self.repository.commit()
        self.repository.refresh(engagement)
        return self.get_engagement(engagement.id)

    def get_engagement(self, engagement_id: str) -> Engagement:
        engagement = self.repository.get(engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement

    def update_engagement(self, engagement_id: str, payload: EngagementUpdateRequest) -> Engagement:
        engagement = self.get_engagement(engagement_id)
        updates = self._json_ready(payload.model_dump(exclude_unset=True))
        for key, value in updates.items():
            setattr(engagement, key, value)
        engagement.health_dirty = True
        engagement.health_freshness = "dirty"
        self._validate_persisted_engagement(engagement)
        self.repository.commit()
        self.repository.refresh(engagement)
        return self.get_engagement(engagement.id)

    def archive_engagement(self, engagement_id: str) -> MessageResponse:
        engagement = self.get_engagement(engagement_id)
        self.repository.archive(engagement)
        self.repository.commit()
        return MessageResponse(message="Engagement archived successfully")

    def get_health(self, engagement_id: str) -> EngagementHealthRead:
        engagement = self.get_engagement(engagement_id)
        latest_snapshot = self._latest_snapshot(engagement)
        if latest_snapshot:
            return self._snapshot_to_health(latest_snapshot)
        return self._engagement_to_health(engagement)

    def recalculate_health(self, engagement_id: str) -> EngagementHealthRead:
        engagement = self.get_engagement(engagement_id)
        calculation = self._calculate_health(engagement)
        contribution = self._contribution_for_engagement(engagement, calculation.score, dirty=calculation.dirty)

        engagement.health_score = calculation.score
        engagement.health_rag_status = calculation.rag_status
        engagement.health_drivers = calculation.drivers
        engagement.health_freshness = calculation.freshness
        engagement.health_dirty = calculation.dirty
        engagement.health_contribution = Decimal(str(contribution))
        engagement.formula_version = PUBLISHED_FORMULA_VERSION

        snapshot = EngagementHealthSnapshot(
            engagement_id=engagement.id,
            account_id=engagement.account_id,
            score=calculation.score,
            rag_status=calculation.rag_status,
            drivers=calculation.drivers,
            freshness=calculation.freshness,
            contribution_to_account_health=Decimal(str(contribution)),
            formula_version=PUBLISHED_FORMULA_VERSION,
            dirty=calculation.dirty,
            metric_inputs=calculation.metric_inputs,
        )
        self.repository.add_health_snapshot(snapshot)
        self.repository.commit()
        self.repository.refresh(snapshot)
        return self._snapshot_to_health(snapshot)

    def get_account_health_rollup(
        self,
        account_id: str,
        sort_by: ContributionSortField = "score",
        rag_status: str | None = None,
        dirty: bool | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> AccountHealthRollupRead:
        engagements = [item for item in self.repository.list_for_account(account_id) if item.status in ACTIVE_ROLLUP_STATUSES]
        usable_total = sum(float(item.value) for item in engagements if item.health_score is not None and not item.health_dirty)
        contributions = [self._contribution_read(item, usable_total) for item in engagements]
        if rag_status:
            contributions = [item for item in contributions if item.rag_status == rag_status]
        if dirty is not None:
            contributions = [item for item in contributions if item.dirty is dirty]

        contributions = sorted(contributions, key=lambda item: self._contribution_sort_value(item, sort_by), reverse=True)
        rollup_score = self._account_rollup_score(contributions)
        dirty_count = sum(1 for item in contributions if item.dirty)

        snapshot = AccountHealthSnapshot(
            account_id=account_id,
            rollup_score=rollup_score,
            formula_version=PUBLISHED_FORMULA_VERSION,
            contributions=[item.model_dump() for item in contributions],
            dirty_count=dirty_count,
        )
        self.repository.add_account_snapshot(snapshot)
        self.repository.commit()
        snapshots, total_snapshots = self.repository.list_account_snapshots(account_id, page, page_size)
        return AccountHealthRollupRead(
            account_id=account_id,
            rollup_score=rollup_score,
            formula_version=PUBLISHED_FORMULA_VERSION,
            contributions=contributions,
            dirty_count=dirty_count,
            snapshots=[AccountHealthSnapshotRead.model_validate(item) for item in snapshots],
            total=total_snapshots,
            page=page,
            page_size=page_size,
            pages=page_count(total_snapshots, page_size),
        )

    @staticmethod
    def _json_ready(data: dict) -> dict:
        converted = dict(data)
        for key in ("source_document_links", "attachments", "activity_notes", "escalation_notes"):
            if key in converted and converted[key] is not None:
                converted[key] = [item.model_dump() if hasattr(item, "model_dump") else item for item in converted[key]]
        return converted

    @staticmethod
    def _validate_persisted_engagement(engagement: Engagement) -> None:
        if engagement.currency != CONFIGURED_CURRENCY:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Value must use configured currency {CONFIGURED_CURRENCY}")
        if not engagement.account_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account is required")
        if not engagement.name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Engagement name is required")
        if not engagement.owner_id or not engagement.owner_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Owner is required")
        if not engagement.service_lines:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one service line is required")
        validate_engagement_dates(engagement.start_date, engagement.end_date, engagement.renewal_date, engagement.notice_deadline, engagement.notice_period_days)

    def _matches_filters(
        self,
        engagement: Engagement,
        status_filter: str | None,
        owner: str | None,
        service_line: str | None,
        renewal_window: RenewalWindow,
        risk_status: str | None,
        search: str | None,
    ) -> bool:
        if status_filter and engagement.status != status_filter:
            return False
        if owner:
            owner_term = owner.lower()
            if owner_term not in engagement.owner_id.lower() and owner_term not in engagement.owner_name.lower():
                return False
        if service_line and service_line.lower() not in [line.lower() for line in engagement.service_lines]:
            return False
        if risk_status and self._risk_status_for_engagement(engagement) != risk_status:
            return False
        if renewal_window != "all" and not self._is_in_renewal_window(engagement, renewal_window):
            return False
        if search and not self._matches_search(engagement, search):
            return False
        return True

    @staticmethod
    def _matches_search(engagement: Engagement, search: str) -> bool:
        term = search.lower()
        document_titles = " ".join(str(link.get("title", "")) for link in engagement.source_document_links)
        service_lines = " ".join(engagement.service_lines)
        return term in f"{engagement.name} {document_titles} {service_lines}".lower()

    @staticmethod
    def _is_in_renewal_window(engagement: Engagement, renewal_window: RenewalWindow) -> bool:
        target = engagement.renewal_date or engagement.end_date
        days = (target - date.today()).days
        if renewal_window == "expired":
            return days < 0
        max_days = {"next_30": 30, "next_60": 60, "next_90": 90}[renewal_window]
        return 0 <= days <= max_days

    @staticmethod
    def _sort_value(engagement: Engagement, sort_by: SortField):
        values = {
            "renewal_date": engagement.renewal_date or engagement.end_date,
            "end_date": engagement.end_date,
            "value": engagement.value,
            "delivery_status": engagement.delivery_status,
            "updated_date": engagement.updated_at,
        }
        return values[sort_by]

    @staticmethod
    def _latest_snapshot(engagement: Engagement) -> EngagementHealthSnapshot | None:
        if not engagement.health_snapshots:
            return None
        return max(engagement.health_snapshots, key=lambda item: item.created_at)

    def _engagement_to_health(self, engagement: Engagement) -> EngagementHealthRead:
        score = engagement.health_score if engagement.health_score is not None else 0
        return EngagementHealthRead(
            engagement_id=engagement.id,
            account_id=engagement.account_id,
            score=score,
            rag_status=engagement.health_rag_status or "dirty",
            drivers=engagement.health_drivers or ["Health has not been calculated."],
            freshness=engagement.health_freshness,
            contribution_to_account_health=float(engagement.health_contribution),
            formula_version=engagement.formula_version or PUBLISHED_FORMULA_VERSION,
            dirty=engagement.health_dirty,
            metric_inputs={},
            calculated_at=None,
        )

    @staticmethod
    def _snapshot_to_health(snapshot: EngagementHealthSnapshot) -> EngagementHealthRead:
        return EngagementHealthRead(
            engagement_id=snapshot.engagement_id,
            account_id=snapshot.account_id,
            score=snapshot.score,
            rag_status=snapshot.rag_status,
            drivers=snapshot.drivers,
            freshness=snapshot.freshness,
            contribution_to_account_health=float(snapshot.contribution_to_account_health),
            formula_version=snapshot.formula_version,
            dirty=snapshot.dirty,
            metric_inputs=snapshot.metric_inputs,
            calculated_at=snapshot.created_at,
        )

    def _calculate_health(self, engagement: Engagement) -> HealthCalculation:
        metric_inputs = {
            "delivery_health": engagement.delivery_health,
            "delivery_status": engagement.delivery_status,
            "risk_count": len(engagement.risks),
            "days_to_renewal": ((engagement.renewal_date or engagement.end_date) - date.today()).days,
            "value": float(engagement.value),
            "source_document_count": len(engagement.source_document_links),
        }
        if engagement.status == "draft":
            return HealthCalculation(0, "dirty", ["Draft engagements do not contribute to health until approved."], "draft", True, metric_inputs)
        if not engagement.source_document_links:
            return HealthCalculation(
                max(0, engagement.delivery_health - 10),
                "dirty",
                ["Source document evidence is missing; score marked dirty."],
                "source_missing",
                True,
                metric_inputs,
            )

        score = engagement.delivery_health
        drivers = [f"Delivery health contributes {engagement.delivery_health}/100."]
        status_penalty = {"on_track": 0, "watch": 8, "at_risk": 18, "blocked": 28, "complete": 0}[engagement.delivery_status]
        if status_penalty:
            score -= status_penalty
            drivers.append(f"Delivery status penalty: {engagement.delivery_status.replace('_', ' ')}.")
        risk_penalty = min(24, len(engagement.risks) * 6)
        if risk_penalty:
            score -= risk_penalty
            drivers.append(f"{len(engagement.risks)} risk item(s) reduced the score.")
        renewal_days = metric_inputs["days_to_renewal"]
        if 0 <= renewal_days <= 30:
            score -= 12
            drivers.append("Renewal is inside 30 days.")
        elif 0 <= renewal_days <= 90:
            score -= 6
            drivers.append("Renewal is inside 90 days.")

        final_score = max(0, min(100, score))
        rag_status = "red" if final_score < 60 else "amber" if final_score < 75 else "green"
        return HealthCalculation(final_score, rag_status, drivers, "current", False, metric_inputs)

    def _contribution_for_engagement(self, engagement: Engagement, score: int, dirty: bool) -> float:
        if engagement.status not in ACTIVE_ROLLUP_STATUSES or dirty:
            return 0.0
        active_engagements = []
        for item in self.repository.list_for_account(engagement.account_id):
            if item.status not in ACTIVE_ROLLUP_STATUSES:
                continue
            if item.id == engagement.id:
                active_engagements.append(item)
            elif not item.health_dirty:
                active_engagements.append(item)
        total_value = sum(float(item.value) for item in active_engagements)
        if total_value <= 0:
            return 0.0
        return round(score * (float(engagement.value) / total_value), 4)

    def _contribution_read(self, engagement: Engagement, usable_total: float | None = None) -> EngagementContributionRead:
        score = engagement.health_score
        rag_status = engagement.health_rag_status or "dirty"
        if score is None or engagement.health_dirty or not usable_total:
            contribution = 0.0
        else:
            contribution = round(score * (float(engagement.value) / usable_total), 4)
        return EngagementContributionRead(
            engagement_id=engagement.id,
            engagement_name=engagement.name,
            status=engagement.status,
            value=float(engagement.value),
            score=score,
            rag_status=rag_status,
            dirty=engagement.health_dirty,
            contribution_to_account_health=contribution,
            freshness=engagement.health_freshness,
            drivers=engagement.health_drivers or ["Health has not been calculated."],
        )

    @staticmethod
    def _account_rollup_score(contributions: list[EngagementContributionRead]) -> int:
        usable = [item for item in contributions if item.score is not None and not item.dirty]
        total_value = sum(item.value for item in usable)
        if total_value <= 0:
            return 0
        weighted_score = sum((item.score or 0) * (item.value / total_value) for item in usable)
        return round(weighted_score)

    @staticmethod
    def _contribution_sort_value(item: EngagementContributionRead, sort_by: ContributionSortField):
        if sort_by == "score":
            return item.score if item.score is not None else -1
        if sort_by == "risk":
            return {"red": 3, "dirty": 2, "amber": 1, "green": 0}[item.rag_status]
        if sort_by == "freshness":
            return 1 if item.freshness == "current" else 0
        return item.value

    @staticmethod
    def _risk_status_for_engagement(engagement: Engagement) -> str:
        if engagement.health_dirty or engagement.delivery_status in {"blocked", "at_risk"}:
            return "critical"
        if engagement.delivery_status == "watch" or len(engagement.risks) >= 2:
            return "warning"
        return "healthy"
