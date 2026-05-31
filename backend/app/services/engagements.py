from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, AccountHealthRollup, Engagement, EngagementHealthSnapshot, EngagementRenewal, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.rbac import RbacRepository
from app.repositories.retention import RetentionRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    AccountHealthRollupRead,
    EngagementCreateRequest,
    EngagementHealthPageRead,
    EngagementHealthRead,
    EngagementPageRead,
    EngagementRead,
    EngagementUpdateRequest,
    MessageResponse,
)
from app.services.account_access import AccountAccessService
from app.services.accounts import AccountService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count


class EngagementService:
    def __init__(self, db: Session) -> None:
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
        self.retention = RetentionRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_for_account(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        owner: str | None = None,
        service_line: str | None = None,
        renewal_window: str | None = None,
        risk_status: str | None = None,
        sort: str = "updated_date",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> EngagementPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        items, total = self.engagements.list_for_account(
            account_id=account_id,
            search=search,
            status_filter=status_filter,
            owner=owner,
            service_line=service_line,
            renewal_window=renewal_window,
            risk_status=risk_status,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return EngagementPageRead(
            items=[EngagementRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def create_engagement(self, account_id: str, payload: EngagementCreateRequest, current_user: User) -> EngagementRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        owner = self._get_active_user(payload.owner_id)
        AccountService._ensure_owner_is_eligible(owner, "primary_am")
        ops_lead = self._get_optional_ops_lead(payload.ops_lead_id)
        engagement = Engagement(
            account_id=account_id,
            name=payload.name,
            status="active",
            owner_id=owner.id,
            owner_name=owner.full_name,
            ops_lead_id=ops_lead.id if ops_lead else None,
            ops_lead_name=ops_lead.full_name if ops_lead else payload.ops_lead_name,
            service_lines=list(payload.service_lines),
            value=payload.value,
            currency=payload.currency,
            delivery_status=payload.delivery_status,
            delivery_health=70,
            start_date=payload.start_date,
            end_date=payload.end_date,
            renewal_date=payload.renewal_date,
            notice_deadline=payload.notice_deadline,
            notice_period_days=payload.notice_period_days,
            auto_renewal=payload.auto_renewal,
            commercial_context=payload.commercial_context,
            resource_dependency=payload.resource_dependency,
            risks=list(payload.risks),
            source_citation=payload.source_citation,
        )
        self.engagements.save(engagement)
        self._sync_retention_renewal(account, engagement, current_user)
        self._add_health_snapshot(engagement, current_user, is_dirty=False)
        self._refresh_account_rollup(account, current_user)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_create",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            after_value=self._engagement_audit_value(engagement),
        )
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement.id,
            event_type="engagement_created",
            module="engagement",
            title=f"Engagement created: {engagement.name}",
            description="Engagement/SOW record created.",
            actor=current_user,
            source_record_id=engagement.id,
            source_record_type="engagement",
            source_record_route=f"/accounts/{account.id}?tab=engagements",
        )
        self.engagements.commit()
        return EngagementRead.model_validate(engagement)

    def get_engagement(self, engagement_id: str, current_user: User) -> EngagementRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        return EngagementRead.model_validate(engagement)

    def update_engagement(self, engagement_id: str, payload: EngagementUpdateRequest, current_user: User) -> EngagementRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        before = self._engagement_audit_value(engagement)
        self._apply_updates(engagement, payload)
        self._validate_engagement_dates(engagement)
        self._sync_retention_renewal(account, engagement, current_user)
        if payload.delivery_health is not None:
            self._add_health_snapshot(engagement, current_user, is_dirty=False)
            self._refresh_account_rollup(account, current_user)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_update",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            before_value=before,
            after_value=self._engagement_audit_value(engagement),
        )
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement.id,
            event_type="engagement_updated",
            module="engagement",
            title=f"Engagement updated: {engagement.name}",
            description="Engagement/SOW fields were updated.",
            actor=current_user,
            source_record_id=engagement.id,
            source_record_type="engagement",
            source_record_route=f"/accounts/{account.id}?tab=engagements",
            before_value=before,
            after_value=self._engagement_audit_value(engagement),
        )
        self.engagements.commit()
        return EngagementRead.model_validate(engagement)

    def archive_engagement(self, engagement_id: str, current_user: User) -> MessageResponse:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        engagement.status = "archived"
        engagement.archived_at = datetime.now(timezone.utc)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_archive",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            before_value={"status": "active"},
            after_value={"status": engagement.status},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement.id,
            event_type="engagement_archived",
            module="engagement",
            title=f"Engagement archived: {engagement.name}",
            description="Engagement/SOW record was archived.",
            actor=current_user,
            source_record_id=engagement.id,
            source_record_type="engagement",
            source_record_route=f"/accounts/{account.id}?tab=engagements",
        )
        self._refresh_account_rollup(account, current_user)
        self.engagements.commit()
        return MessageResponse(message="Engagement archived successfully")

    def list_health(
        self,
        engagement_id: str,
        current_user: User,
        page: int,
        page_size: int,
        *,
        rag_status: str | None = None,
        freshness_status: str | None = None,
        is_dirty: bool | None = None,
    ) -> EngagementHealthPageRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        items, total = self.engagements.list_health_snapshots(
            engagement_id,
            page,
            page_size,
            rag_status=rag_status,
            freshness_status=freshness_status,
            is_dirty=is_dirty,
        )
        return EngagementHealthPageRead(
            items=[EngagementHealthRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def recalculate_health(self, engagement_id: str, current_user: User) -> EngagementHealthRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        engagement.delivery_health = self._calculated_health(engagement)
        snapshot = self._add_health_snapshot(engagement, current_user, is_dirty=False)
        self._refresh_account_rollup(account, current_user)
        self.audit.log(
            module="engagement_sow_management",
            action="health_recalculate",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            after_value={"delivery_health": engagement.delivery_health, "rag_status": snapshot.rag_status},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=engagement.id,
            event_type="health_recalculated",
            module="engagement",
            title=f"Engagement health recalculated: {engagement.name}",
            description=f"Delivery health is now {engagement.delivery_health}/100.",
            actor=current_user,
            source_record_id=snapshot.id,
            source_record_type="engagement_health_snapshot",
            source_record_route=f"/accounts/{account.id}?tab=health",
        )
        self.engagements.commit()
        return EngagementHealthRead.model_validate(snapshot)

    def account_rollup(self, account_id: str, current_user: User) -> AccountHealthRollupRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        rollup = self.engagements.latest_account_rollup(account_id)
        if rollup:
            return AccountHealthRollupRead.model_validate(rollup)
        return self._synthetic_rollup(account)

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_or_404(self, engagement_id: str) -> Engagement:
        engagement = self.engagements.get_by_id(engagement_id)
        if engagement is None or engagement.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement

    def _get_active_user(self, user_id: str) -> User:
        user = self.accounts.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is inactive or does not exist")
        return user

    def _get_optional_ops_lead(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        user = self._get_active_user(user_id)
        AccountService._ensure_owner_is_eligible(user, "ops_lead")
        return user

    def _apply_updates(self, engagement: Engagement, payload: EngagementUpdateRequest) -> None:
        updates = payload.model_dump(exclude_unset=True)
        if payload.owner_id:
            owner = self._get_active_user(payload.owner_id)
            AccountService._ensure_owner_is_eligible(owner, "primary_am")
            updates["owner_name"] = owner.full_name
        if payload.ops_lead_id:
            ops_lead = self._get_optional_ops_lead(payload.ops_lead_id)
            updates["ops_lead_name"] = ops_lead.full_name if ops_lead else None
        for field, value in updates.items():
            setattr(engagement, field, value)

    def _sync_retention_renewal(self, account: Account, engagement: Engagement, current_user: User) -> EngagementRenewal:
        renewal = self.retention.get_renewal_by_engagement(engagement.id)
        if renewal is None:
            renewal = EngagementRenewal(
                account_id=account.id,
                engagement_id=engagement.id,
                created_by_id=current_user.id,
            )
        renewal.owner_id = engagement.owner_id
        renewal.owner_name = engagement.owner_name
        renewal.sow_start_date = engagement.start_date
        renewal.sow_end_date = engagement.end_date
        renewal.renewal_date = engagement.renewal_date
        renewal.notice_deadline = engagement.notice_deadline
        renewal.notice_period_days = engagement.notice_period_days
        renewal.auto_renewal = engagement.auto_renewal
        renewal.commercial_exposure = engagement.value
        renewal.currency = engagement.currency
        renewal.confidence = renewal.confidence if renewal.confidence is not None else engagement.delivery_health
        current_source = renewal.source_kind or "manual"
        renewal.source_kind = current_source if current_source != "manual" else ("sow" if engagement.source_citation else "manual")
        renewal.source_title = renewal.source_title or engagement.name
        renewal.source_citation = renewal.source_citation or engagement.source_citation
        renewal.renewal_risk = self._retention_risk(account, engagement)
        renewal.readiness_status = self._retention_readiness(renewal)
        renewal.updated_by_id = current_user.id
        return self.retention.save_renewal(renewal)

    @staticmethod
    def _validate_engagement_dates(engagement: Engagement) -> None:
        if engagement.end_date and engagement.end_date <= engagement.start_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Engagement end date must be after start date.")
        if engagement.notice_deadline and engagement.renewal_date and engagement.notice_deadline >= engagement.renewal_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Notice deadline must be before renewal date.")
        if engagement.notice_deadline and engagement.end_date and engagement.notice_deadline >= engagement.end_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Notice deadline must be before SOW end date.")

    @staticmethod
    def _retention_risk(account: Account, engagement: Engagement) -> str:
        if account.risk_status == "critical" or engagement.delivery_health < 60:
            return "critical"
        now = datetime.now(timezone.utc)
        if engagement.notice_deadline:
            comparable = engagement.notice_deadline if engagement.notice_deadline.tzinfo else engagement.notice_deadline.replace(tzinfo=timezone.utc)
            if comparable <= now + timedelta(days=14):
                return "critical"
            if comparable <= now + timedelta(days=60):
                return "warning"
        renewal_date = engagement.renewal_date or engagement.end_date
        if renewal_date:
            comparable = renewal_date if renewal_date.tzinfo else renewal_date.replace(tzinfo=timezone.utc)
            if comparable < now:
                return "critical"
            if comparable <= now + timedelta(days=90):
                return "warning"
        return EngagementService._rag_status(min(account.health_overall, engagement.delivery_health))

    @staticmethod
    def _retention_readiness(renewal: EngagementRenewal) -> str:
        if not renewal.renewal_date and not renewal.notice_deadline:
            return "not_started"
        if renewal.renewal_risk == "critical":
            return "blocked"
        if renewal.renewal_date and renewal.notice_deadline and (renewal.confidence or 0) >= 75 and (renewal.source_citation or renewal.manual_override_reason):
            return "ready"
        return "in_review"

    def _add_health_snapshot(self, engagement: Engagement, current_user: User, *, is_dirty: bool) -> EngagementHealthSnapshot:
        snapshot = EngagementHealthSnapshot(
            engagement_id=engagement.id,
            account_id=engagement.account_id,
            overall=engagement.delivery_health,
            rag_status=self._rag_status(engagement.delivery_health),
            drivers=self._health_drivers(engagement),
            freshness_status="fresh",
            is_dirty=is_dirty,
            contribution=round(engagement.delivery_health / 100, 2),
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        return self.engagements.add_health_snapshot(snapshot)

    def _refresh_account_rollup(self, account: Account, current_user: User) -> AccountHealthRollup:
        active_engagements, _ = self.engagements.list_for_account(account_id=account.id, page=1, page_size=100)
        scores = [engagement.delivery_health for engagement in active_engagements]
        overall = round(sum(scores) / len(scores)) if scores else account.health_overall
        account.health_delivery = overall
        account.health_overall = round((account.health_relationship + account.health_usage + account.health_delivery + account.health_commercial) / 4)
        account.risk_status = self._rag_status(account.health_overall)
        rollup = AccountHealthRollup(
            account_id=account.id,
            overall=account.health_overall,
            rag_status=account.risk_status,
            contributions=[{"engagement_id": item.id, "name": item.name, "score": item.delivery_health} for item in active_engagements],
        )
        self.engagements.add_account_rollup(rollup)
        self.audit.log(
            module="engagement_sow_management",
            action="account_health_rollup",
            entity_type="account",
            entity_id=account.id,
            actor=current_user,
            after_value={"overall": account.health_overall, "rag_status": account.risk_status},
        )
        return rollup

    @staticmethod
    def _synthetic_rollup(account: Account) -> AccountHealthRollupRead:
        return AccountHealthRollupRead(
            id="current",
            account_id=account.id,
            overall=account.health_overall,
            rag_status=account.risk_status,
            contributions=[],
            metric_version="account-rollup-v1",
            created_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _engagement_audit_value(engagement: Engagement) -> dict:
        return {
            "name": engagement.name,
            "status": engagement.status,
            "owner_id": engagement.owner_id,
            "delivery_status": engagement.delivery_status,
            "delivery_health": engagement.delivery_health,
            "value": float(engagement.value),
            "renewal_date": engagement.renewal_date.isoformat() if engagement.renewal_date else None,
        }

    @staticmethod
    def _calculated_health(engagement: Engagement) -> int:
        status_adjustments = {"blocked": -30, "watch": -15, "planned": -5, "active": 0, "completed": 5}
        score = 75 + status_adjustments.get(engagement.delivery_status, 0) - (len(engagement.risks) * 7)
        if engagement.notice_deadline:
            now = datetime.now(engagement.notice_deadline.tzinfo or timezone.utc)
            if engagement.notice_deadline.tzinfo is None:
                now = now.replace(tzinfo=None)
            if engagement.notice_deadline < now:
                score -= 10
        return max(0, min(100, score))

    @staticmethod
    def _health_drivers(engagement: Engagement) -> list[str]:
        drivers = [f"Delivery status: {engagement.delivery_status}"]
        if engagement.risks:
            drivers.append(f"{len(engagement.risks)} active risk(s)")
        if engagement.notice_deadline:
            drivers.append("Notice deadline tracked")
        if engagement.resource_dependency:
            drivers.append("Resource dependency recorded")
        return drivers

    @staticmethod
    def _rag_status(score: int) -> str:
        if score < 60:
            return "critical"
        if score < 75:
            return "warning"
        return "healthy"
