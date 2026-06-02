from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import AccountPlan, AccountPlanAction, AccountPlanVersion, User


class AccountPlanningRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_plan_for_account(self, account_id: str) -> AccountPlan | None:
        return self.db.scalar(
            select(AccountPlan)
            .where(AccountPlan.account_id == account_id)
            .options(
                selectinload(AccountPlan.account),
                selectinload(AccountPlan.actions),
                selectinload(AccountPlan.versions),
            )
        )

    def save_plan(self, plan: AccountPlan) -> AccountPlan:
        self.db.add(plan)
        self.db.flush()
        return plan

    def delete_actions_for_plan(self, plan_id: str) -> None:
        for action in self.db.scalars(select(AccountPlanAction).where(AccountPlanAction.account_plan_id == plan_id)):
            self.db.delete(action)
        self.db.flush()

    def add_action(self, action: AccountPlanAction) -> AccountPlanAction:
        self.db.add(action)
        self.db.flush()
        return action

    def next_version(self, plan_id: str) -> int:
        current = self.db.scalar(select(func.max(AccountPlanVersion.version)).where(AccountPlanVersion.account_plan_id == plan_id))
        return int(current or 0) + 1

    def add_version(self, version: AccountPlanVersion) -> AccountPlanVersion:
        self.db.add(version)
        self.db.flush()
        return version

    def list_versions(self, account_id: str, page: int, page_size: int) -> tuple[list[AccountPlanVersion], int]:
        conditions = [AccountPlanVersion.account_id == account_id]
        total = self.db.scalar(select(func.count(AccountPlanVersion.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(AccountPlanVersion)
                .where(*conditions)
                .order_by(AccountPlanVersion.version.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
