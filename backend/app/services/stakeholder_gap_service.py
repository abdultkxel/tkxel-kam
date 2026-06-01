from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Stakeholder, StakeholderCoverageGap, User, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.rbac import RbacRepository
from app.repositories.stakeholder_gaps import StakeholderGapRepository
from app.schemas import StakeholderCoverageGapRead
from app.services.account_access import AccountAccessService


STAKEHOLDER_GAP_MODULE = "stakeholder_relationship"
STAKEHOLDER_INTERACTION_STALE_DAYS = 90


@dataclass(frozen=True)
class DetectedStakeholderGap:
    rule_key: str
    severity: str
    title: str
    description: str
    evidence: dict


class StakeholderGapService:
    def __init__(self, db: Session) -> None:
        self.repository = StakeholderGapRepository(db)
        self.accounts = AccountRepository(db)
        self.rbac = RbacRepository(db)
        self.access = AccountAccessService(self.accounts, self.rbac)

    def list_for_account(self, account_id: str, current_user: User) -> list[StakeholderCoverageGapRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=STAKEHOLDER_GAP_MODULE)
        return self._read_many(self.repository.list_for_account(account_id))

    def recalculate(self, account_id: str, current_user: User) -> list[StakeholderCoverageGapRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=STAKEHOLDER_GAP_MODULE)
        gaps = self._recalculate(account)
        self.repository.commit()
        return self._read_many(gaps)

    def recalculate_after_stakeholder_change(self, account_id: str) -> None:
        account = self._get_account_or_404(account_id)
        self._recalculate(account)
        self.repository.flush()

    def _recalculate(self, account: Account) -> list[StakeholderCoverageGap]:
        self.repository.flush()
        now = utc_now()
        active_stakeholders = self.repository.list_active_stakeholders(account.id)
        latest_interaction_at = self.repository.latest_active_stakeholder_interaction_at(account.id)
        detected = {gap.rule_key: gap for gap in self._detect_gaps(account.id, active_stakeholders, latest_interaction_at, now)}
        existing = {gap.rule_key: gap for gap in self.repository.list_for_account(account.id)}

        for rule_key, detected_gap in detected.items():
            gap = existing.get(rule_key)
            if gap is None:
                gap = StakeholderCoverageGap(
                    account_id=account.id,
                    rule_key=detected_gap.rule_key,
                    severity=detected_gap.severity,
                    title=detected_gap.title,
                    description=detected_gap.description,
                    evidence=detected_gap.evidence,
                    status="open",
                    created_at=now,
                    updated_at=now,
                )
                self.repository.save(gap)
                existing[rule_key] = gap
                continue

            gap.severity = detected_gap.severity
            gap.title = detected_gap.title
            gap.description = detected_gap.description
            gap.evidence = detected_gap.evidence
            gap.status = "open"
            gap.resolved_at = None
            gap.updated_at = now

        for rule_key, gap in existing.items():
            if rule_key in detected or gap.status == "resolved":
                continue
            gap.status = "resolved"
            gap.resolved_at = now
            gap.updated_at = now

        self.repository.flush()
        gaps = self.repository.list_for_account(account.id)
        self._sync_stakeholder_coverage_signals(account, gaps)
        return gaps

    def _detect_gaps(
        self,
        account_id: str,
        active_stakeholders: list[Stakeholder],
        latest_interaction_at: datetime | None,
        now: datetime,
    ) -> list[DetectedStakeholderGap]:
        roles = {stakeholder.role for stakeholder in active_stakeholders}
        influences = {stakeholder.influence for stakeholder in active_stakeholders}
        gaps: list[DetectedStakeholderGap] = []

        if "executive_sponsor" not in roles:
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="no_active_executive_sponsor",
                    severity="high",
                    title="No active executive sponsor",
                    description="The account does not have an active stakeholder with the executive sponsor role.",
                    evidence=self._coverage_evidence(account_id, active_stakeholders),
                )
            )

        if not roles.intersection({"commercial_owner", "economic_buyer"}):
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="no_commercial_owner_or_economic_buyer",
                    severity="high",
                    title="No active commercial owner or economic buyer",
                    description="The account does not have active commercial ownership coverage through a commercial owner or economic buyer.",
                    evidence=self._coverage_evidence(account_id, active_stakeholders),
                )
            )

        if len(active_stakeholders) == 1:
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="only_one_active_stakeholder",
                    severity="medium",
                    title="Only one active stakeholder",
                    description="The account has a single active stakeholder, which creates relationship concentration risk.",
                    evidence=self._coverage_evidence(account_id, active_stakeholders),
                )
            )

        if not influences.intersection({"high", "critical"}):
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="no_high_or_critical_influence_stakeholder",
                    severity="medium",
                    title="No high or critical influence stakeholder",
                    description="The account does not have an active stakeholder marked with high or critical influence.",
                    evidence={**self._coverage_evidence(account_id, active_stakeholders), "active_influence_values": sorted(influences)},
                )
            )

        high_risk_stakeholders = [stakeholder for stakeholder in active_stakeholders if stakeholder.political_risk == "high"]
        if high_risk_stakeholders:
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="active_high_political_risk_stakeholder",
                    severity="high",
                    title="Active stakeholder has high political risk",
                    description="One or more active stakeholders are marked with high political risk.",
                    evidence={
                        "account_id": account_id,
                        "stakeholders": [self._stakeholder_evidence(stakeholder) for stakeholder in high_risk_stakeholders],
                    },
                )
            )

        cutoff = now - timedelta(days=STAKEHOLDER_INTERACTION_STALE_DAYS)
        if latest_interaction_at is None or self._as_aware(latest_interaction_at) < cutoff:
            gaps.append(
                DetectedStakeholderGap(
                    rule_key="no_recent_stakeholder_interaction",
                    severity="medium",
                    title="No stakeholder interaction in the last 90 days",
                    description="No interaction has been logged for an active stakeholder within the last 90 days.",
                    evidence={
                        "account_id": account_id,
                        "threshold_days": STAKEHOLDER_INTERACTION_STALE_DAYS,
                        "latest_interaction_at": latest_interaction_at.isoformat() if latest_interaction_at else None,
                        "days_since_latest_interaction": self._days_since(latest_interaction_at, now),
                    },
                )
            )

        return gaps

    def _coverage_evidence(self, account_id: str, active_stakeholders: list[Stakeholder]) -> dict:
        return {
            "account_id": account_id,
            "active_stakeholder_count": len(active_stakeholders),
            "active_roles": sorted({stakeholder.role for stakeholder in active_stakeholders}),
            "stakeholders": [self._stakeholder_evidence(stakeholder) for stakeholder in active_stakeholders],
        }

    @staticmethod
    def _stakeholder_evidence(stakeholder: Stakeholder) -> dict:
        return {
            "id": stakeholder.id,
            "name": stakeholder.name,
            "role": stakeholder.role,
            "influence": stakeholder.influence,
            "political_risk": stakeholder.political_risk,
            "last_interaction_at": stakeholder.last_interaction_at.isoformat() if stakeholder.last_interaction_at else None,
        }

    @staticmethod
    def _days_since(value: datetime | None, now: datetime) -> int | None:
        if value is None:
            return None
        return (now - StakeholderGapService._as_aware(value)).days

    @staticmethod
    def _as_aware(value: datetime) -> datetime:
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _read_many(self, gaps: list[StakeholderCoverageGap]) -> list[StakeholderCoverageGapRead]:
        return [StakeholderCoverageGapRead.model_validate(gap) for gap in self._sort_gaps(gaps)]

    @staticmethod
    def _sort_gaps(gaps: list[StakeholderCoverageGap]) -> list[StakeholderCoverageGap]:
        severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        status_rank = {"open": 0, "resolved": 1}
        return sorted(gaps, key=lambda gap: (status_rank.get(gap.status, 2), severity_rank.get(gap.severity, 4), gap.created_at, gap.rule_key))

    def _sync_stakeholder_coverage_signals(self, account: Account, gaps: list[StakeholderCoverageGap]) -> None:
        # TODO: Publish open stakeholder coverage gaps into the future signal engine
        # as stakeholder coverage signals once signal models/services are implemented.
        return None
