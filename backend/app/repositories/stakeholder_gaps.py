from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Stakeholder, StakeholderCoverageGap, StakeholderInteraction


class StakeholderGapRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_account(self, account_id: str) -> list[StakeholderCoverageGap]:
        return list(
            self.db.scalars(
                select(StakeholderCoverageGap)
                .where(StakeholderCoverageGap.account_id == account_id)
                .order_by(StakeholderCoverageGap.created_at.asc())
            )
        )

    def list_active_stakeholders(self, account_id: str) -> list[Stakeholder]:
        return list(
            self.db.scalars(
                select(Stakeholder)
                .where(
                    Stakeholder.account_id == account_id,
                    Stakeholder.status == "active",
                    Stakeholder.archived_at.is_(None),
                )
                .order_by(Stakeholder.name.asc())
            )
        )

    def latest_active_stakeholder_interaction_at(self, account_id: str) -> datetime | None:
        return self.db.scalar(
            select(func.max(StakeholderInteraction.interaction_at))
            .join(Stakeholder, Stakeholder.id == StakeholderInteraction.stakeholder_id)
            .where(
                Stakeholder.account_id == account_id,
                Stakeholder.status == "active",
                Stakeholder.archived_at.is_(None),
                StakeholderInteraction.archived_at.is_(None),
            )
        )

    def save(self, gap: StakeholderCoverageGap) -> StakeholderCoverageGap:
        self.db.add(gap)
        self.db.flush()
        return gap

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
