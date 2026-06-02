from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Stakeholder, StakeholderGapRule, StakeholderRoleConfig


class StakeholderConfigRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_roles(self, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50) -> tuple[list[StakeholderRoleConfig], int]:
        conditions = []
        if active_state == "active":
            conditions.append(StakeholderRoleConfig.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(StakeholderRoleConfig.is_active.is_(False))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(StakeholderRoleConfig.name.ilike(term), StakeholderRoleConfig.slug.ilike(term), StakeholderRoleConfig.description.ilike(term)))
        total = self.db.scalar(select(func.count(StakeholderRoleConfig.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(StakeholderRoleConfig)
                .where(*conditions)
                .order_by(StakeholderRoleConfig.display_order, StakeholderRoleConfig.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_role(self, role_id: str) -> StakeholderRoleConfig | None:
        return self.db.get(StakeholderRoleConfig, role_id)

    def get_role_by_slug(self, slug: str) -> StakeholderRoleConfig | None:
        return self.db.scalar(select(StakeholderRoleConfig).where(StakeholderRoleConfig.slug == slug))

    def save_role(self, role: StakeholderRoleConfig) -> StakeholderRoleConfig:
        self.db.add(role)
        self.db.flush()
        return role

    def count_role_usage(self, slug: str) -> int:
        return self.db.scalar(select(func.count(Stakeholder.id)).where(Stakeholder.role == slug)) or 0

    def list_rules(self, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50) -> tuple[list[StakeholderGapRule], int]:
        conditions = []
        if active_state == "active":
            conditions.append(StakeholderGapRule.is_active.is_(True))
        if active_state == "inactive":
            conditions.append(StakeholderGapRule.is_active.is_(False))
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(StakeholderGapRule.title.ilike(term), StakeholderGapRule.rule_key.ilike(term), StakeholderGapRule.description.ilike(term)))
        total = self.db.scalar(select(func.count(StakeholderGapRule.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(StakeholderGapRule)
                .where(*conditions)
                .order_by(StakeholderGapRule.display_order, StakeholderGapRule.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_active_rules(self) -> list[StakeholderGapRule]:
        return list(self.db.scalars(select(StakeholderGapRule).where(StakeholderGapRule.is_active.is_(True)).order_by(StakeholderGapRule.display_order, StakeholderGapRule.title)))

    def get_rule(self, rule_id: str) -> StakeholderGapRule | None:
        return self.db.get(StakeholderGapRule, rule_id)

    def get_rule_by_key(self, rule_key: str) -> StakeholderGapRule | None:
        return self.db.scalar(select(StakeholderGapRule).where(StakeholderGapRule.rule_key == rule_key))

    def save_rule(self, rule: StakeholderGapRule) -> StakeholderGapRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
