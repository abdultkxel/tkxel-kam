from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Account, AccountOwner, AccountOwnershipHistory, Opportunity, SourceCitation, SourceDocument, User


class AccountRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_accounts(
        self,
        *,
        search: str | None = None,
        lifecycle_status: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        risk_status: str | None = None,
        primary_am: str | None = None,
        supporting_am: str | None = None,
        ops_lead: str | None = None,
        leadership_sponsor: str | None = None,
        missing_am: bool | None = None,
        missing_engagements: bool | None = None,
        missing_next_governance: bool | None = None,
        sort: str = "name",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Account], int]:
        conditions = self._account_conditions(
            search=search,
            lifecycle_status=lifecycle_status,
            segment=segment,
            region=region,
            risk_status=risk_status,
            primary_am=primary_am,
            supporting_am=supporting_am,
            ops_lead=ops_lead,
            leadership_sponsor=leadership_sponsor,
            missing_am=missing_am,
            missing_engagements=missing_engagements,
            missing_next_governance=missing_next_governance,
        )
        total = self.db.scalar(select(func.count(Account.id)).where(*conditions)) or 0
        primary_owner_name = (
            select(AccountOwner.user_name)
            .where(
                AccountOwner.account_id == Account.id,
                AccountOwner.ownership_role == "primary_am",
                AccountOwner.is_active.is_(True),
            )
            .order_by(AccountOwner.user_name)
            .limit(1)
            .scalar_subquery()
        )
        order_column = {
            "name": Account.name,
            "lifecycle_status": Account.lifecycle_status,
            "risk_status": Account.risk_status,
            "owner_name": primary_owner_name,
            "segment": Account.segment,
            "commercial_value": Account.commercial_value,
            "health": Account.health_overall,
            "next_governance_at": Account.next_governance_at,
            "updated_at": Account.updated_at,
        }.get(sort, Account.name)
        if direction == "desc":
            order_column = order_column.desc()

        accounts = list(
            self.db.scalars(
                select(Account)
                .where(*conditions)
                .options(selectinload(Account.owners), selectinload(Account.engagements))
                .order_by(order_column, Account.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return accounts, total

    def get_by_id(self, account_id: str) -> Account | None:
        return self.db.scalar(
            select(Account)
            .where(Account.id == account_id)
            .options(
                selectinload(Account.owners),
                selectinload(Account.engagements),
                selectinload(Account.source_documents).selectinload(SourceDocument.citations),
            )
        )

    def find_duplicate_by_name(self, name: str) -> Account | None:
        return self.db.scalar(select(Account).where(func.lower(Account.name) == name.strip().lower()))

    def save(self, account: Account, refresh: bool = False) -> Account:
        self.db.add(account)
        self.db.flush()
        if refresh:
            self.db.refresh(account)
        return account

    def list_owners(self, account_id: str) -> list[AccountOwner]:
        return list(
            self.db.scalars(
                select(AccountOwner)
                .where(AccountOwner.account_id == account_id, AccountOwner.is_active.is_(True))
                .order_by(AccountOwner.is_primary.desc(), AccountOwner.ownership_role, AccountOwner.user_name)
            )
        )

    def list_account_ids_for_user(self, user_id: str) -> list[str]:
        return list(
            self.db.scalars(
                select(AccountOwner.account_id)
                .where(AccountOwner.user_id == user_id, AccountOwner.is_active.is_(True))
                .distinct()
            )
        )

    def get_owner(self, owner_id: str) -> AccountOwner | None:
        return self.db.get(AccountOwner, owner_id)

    def get_active_primary_owner(self, account_id: str) -> AccountOwner | None:
        return self.db.scalar(
            select(AccountOwner).where(
                AccountOwner.account_id == account_id,
                AccountOwner.ownership_role == "primary_am",
                AccountOwner.is_active.is_(True),
            )
        )

    def get_active_owner_for_role(self, account_id: str, role: str, user_id: str) -> AccountOwner | None:
        return self.db.scalar(
            select(AccountOwner).where(
                AccountOwner.account_id == account_id,
                AccountOwner.ownership_role == role,
                AccountOwner.user_id == user_id,
                AccountOwner.is_active.is_(True),
            )
        )

    def add_owner(self, owner: AccountOwner) -> AccountOwner:
        self.db.add(owner)
        self.db.flush()
        return owner

    def add_owner_history(self, history: AccountOwnershipHistory) -> AccountOwnershipHistory:
        self.db.add(history)
        self.db.flush()
        return history

    def list_owner_history(self, account_id: str, page: int, page_size: int) -> tuple[list[AccountOwnershipHistory], int]:
        conditions = [AccountOwnershipHistory.account_id == account_id]
        total = self.db.scalar(select(func.count(AccountOwnershipHistory.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(AccountOwnershipHistory)
                .where(*conditions)
                .order_by(AccountOwnershipHistory.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_attachments(
        self,
        *,
        account_id: str,
        search: str | None = None,
        source_type: str | None = None,
        sensitivity: str | None = None,
        uploaded_from: datetime | None = None,
        uploaded_to: datetime | None = None,
        sort: str = "uploaded_date",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[SourceDocument], int]:
        conditions = [SourceDocument.account_id == account_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(SourceDocument.title.ilike(term), SourceDocument.file_name.ilike(term), SourceDocument.source_type.ilike(term)))
        if source_type:
            conditions.append(SourceDocument.source_type == source_type)
        if sensitivity == "sensitive":
            conditions.append(SourceDocument.is_sensitive.is_(True))
        if sensitivity == "standard":
            conditions.append(SourceDocument.is_sensitive.is_(False))
        if uploaded_from:
            conditions.append(SourceDocument.created_at >= uploaded_from)
        if uploaded_to:
            conditions.append(SourceDocument.created_at <= uploaded_to)

        total = self.db.scalar(select(func.count(SourceDocument.id)).where(*conditions)) or 0
        order_column = {
            "uploaded_date": SourceDocument.created_at,
            "source_type": SourceDocument.source_type,
            "name": SourceDocument.title,
        }.get(sort, SourceDocument.created_at)
        if direction == "desc":
            order_column = order_column.desc()
        items = list(
            self.db.scalars(
                select(SourceDocument)
                .where(*conditions)
                .options(selectinload(SourceDocument.citations))
                .order_by(order_column, SourceDocument.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_attachment(self, attachment_id: str) -> SourceDocument | None:
        return self.db.scalar(select(SourceDocument).where(SourceDocument.id == attachment_id).options(selectinload(SourceDocument.citations)))

    def add_attachment(self, document: SourceDocument) -> SourceDocument:
        self.db.add(document)
        self.db.flush()
        return document

    def delete_attachment(self, document: SourceDocument) -> None:
        self.db.delete(document)
        self.db.flush()

    def add_citation(self, citation: SourceCitation) -> SourceCitation:
        self.db.add(citation)
        self.db.flush()
        return citation

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_user_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))

    def get_first_active_user_by_role(self, role: str) -> User | None:
        return self.db.scalar(
            select(User)
            .where(User.role == role, User.is_active.is_(True))
            .order_by(User.full_name, User.email)
            .limit(1)
        )

    def count_open_opportunities(self, account_id: str) -> int:
        return self.db.scalar(
            select(func.count(Opportunity.id)).where(
                Opportunity.account_id == account_id,
                Opportunity.archived_at.is_(None),
                Opportunity.stage.notin_(("Won", "Lost")),
            )
        ) or 0

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _account_conditions(
        *,
        search: str | None,
        lifecycle_status: str | None,
        segment: str | None,
        region: str | None,
        risk_status: str | None,
        primary_am: str | None,
        supporting_am: str | None,
        ops_lead: str | None,
        leadership_sponsor: str | None,
        missing_am: bool | None,
        missing_engagements: bool | None,
        missing_next_governance: bool | None,
    ) -> list:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    Account.name.ilike(term),
                    Account.project_name.ilike(term),
                    Account.service_context.ilike(term),
                    Account.owners.any(
                        and_(
                            AccountOwner.is_active.is_(True),
                            or_(AccountOwner.user_name.ilike(term), AccountOwner.user_email.ilike(term)),
                        )
                    ),
                )
            )
        if lifecycle_status:
            conditions.append(Account.lifecycle_status == lifecycle_status)
        if segment:
            conditions.append(Account.segment == segment)
        if region:
            conditions.append(Account.region == region)
        if risk_status:
            conditions.append(Account.risk_status == risk_status)
        for role, user_id in (
            ("primary_am", primary_am),
            ("supporting_am", supporting_am),
            ("ops_lead", ops_lead),
            ("leadership_sponsor", leadership_sponsor),
        ):
            if user_id:
                conditions.append(
                    Account.owners.any(and_(
                        AccountOwner.ownership_role == role,
                        AccountOwner.user_id == user_id,
                        AccountOwner.is_active.is_(True),
                    ))
                )
        if missing_am is True:
            conditions.append(~Account.owners.any(and_(AccountOwner.ownership_role == "primary_am", AccountOwner.is_active.is_(True))))
        if missing_engagements is True:
            conditions.append(~Account.engagements.any())
        if missing_next_governance is True:
            conditions.append(Account.next_governance_at.is_(None))
        return conditions
