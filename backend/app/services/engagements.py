from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Account, Engagement, EngagementHealthSnapshot, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.rbac import RbacRepository
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
from app.services.engagement_health_rollup import notify_account_health_impacted_by_engagement_change
from app.services.timeline import TimelineService
from app.services.user_management import page_count


def calculate_notice_deadline(
    renewal_date: datetime | None,
    end_date: datetime | None,
    notice_period_days: int | None,
) -> datetime | None:
    target_date = renewal_date or end_date
    if target_date is None or notice_period_days is None:
        return None
    return target_date - timedelta(days=notice_period_days)


def datetime_value(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


SOW_TERM_FIELDS = {"auto_renewal", "currency", "end_date", "service_lines", "source_links", "start_date", "value"}
RENEWAL_DATE_FIELDS = {"notice_deadline", "notice_period_days", "renewal_date"}
HEALTH_FIELDS = {"delivery_health", "health_status", "renewal_risk"}
ACCOUNT_HEALTH_IMPACT_FIELDS = {"delivery_health", "health_status"}


class EngagementService:
    def __init__(self, db: Session) -> None:
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
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

    def list_engagements_for_account(self, account_id: str, current_user: User, **filters) -> EngagementPageRead:
        return self.list_for_account(account_id, current_user, **filters)

    def create_engagement(self, account_id: str, payload: EngagementCreateRequest, current_user: User) -> EngagementRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        owner = self._get_active_user(payload.owner_id)
        AccountService._ensure_owner_is_eligible(owner, "primary_am")
        ops_lead = self._get_optional_ops_lead(payload.ops_lead_id)
        engagement = Engagement(
            account_id=account_id,
            name=payload.name,
            description=payload.description,
            status="active",
            owner_id=owner.id,
            owner_name=owner.full_name,
            ops_lead_id=ops_lead.id if ops_lead else None,
            ops_lead_name=ops_lead.full_name if ops_lead else payload.ops_lead_name,
            service_lines=list(payload.service_lines),
            source_links=[link.model_dump() for link in payload.source_links],
            value=payload.value,
            currency=payload.currency,
            delivery_status=payload.delivery_status,
            commercial_status=payload.commercial_status,
            delivery_health=payload.delivery_health,
            health_status=payload.health_status,
            renewal_risk=payload.renewal_risk,
            start_date=payload.start_date,
            end_date=payload.end_date,
            renewal_date=payload.renewal_date,
            notice_deadline=calculate_notice_deadline(payload.renewal_date, payload.end_date, payload.notice_period_days),
            notice_period_days=payload.notice_period_days,
            auto_renewal=payload.auto_renewal,
            commercial_context=payload.commercial_context,
            resource_dependency=payload.resource_dependency,
            risks=list(payload.risks),
            source_citation=payload.source_citation,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self._validate_engagement_dates(engagement)
        self.engagements.save(engagement)
        self._add_health_snapshot(engagement, current_user, is_dirty=False)
        self._notify_account_health_impacted_by_engagement_change(account, engagement, current_user)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_create",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            after_value=self._engagement_audit_value(engagement),
        )
        self._add_engagement_timeline_event(
            account,
            engagement,
            current_user,
            event_type="engagement_created",
            title=f"Engagement created: {engagement.name}",
            description="Engagement/SOW record created.",
            new_value=self._engagement_audit_value(engagement),
        )
        self.engagements.commit()
        return EngagementRead.model_validate(engagement)

    def get_engagement(self, engagement_id: str, current_user: User) -> EngagementRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        return EngagementRead.model_validate(engagement)

    def get_engagement_summary(self, engagement_id: str, current_user: User) -> dict:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module="engagement_sow_management")
        latest_health = self.engagements.latest_health_snapshot(engagement_id)
        return self._engagement_summary(engagement, latest_health)

    def get_engagement_timeline(
        self,
        engagement_id: str,
        current_user: User,
        *,
        page: int = 1,
        page_size: int = 100,
        show_sensitive: bool = False,
    ) -> dict:
        engagement = self._get_engagement_record_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module="account_timeline")
        include_sensitive = show_sensitive and self.timeline._can_view_sensitive(current_user)
        include_restricted = self.timeline._can_view_restricted(current_user)
        items, total = self.timeline.list_engagement_events(engagement_id, page=page, page_size=page_size, include_sensitive=include_sensitive, include_restricted=include_restricted)
        return {
            "items": [self._timeline_entry_value(item) for item in items],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": page_count(total, page_size),
        }

    def update_engagement(self, engagement_id: str, payload: EngagementUpdateRequest, current_user: User) -> EngagementRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        before = self._engagement_audit_value(engagement)
        self._apply_updates(engagement, payload, current_user)
        self._validate_engagement_dates(engagement)
        self._set_notice_deadline(engagement)
        after = self._engagement_audit_value(engagement)
        changed_fields = self._important_field_changes(before, after)
        if "delivery_health" in changed_fields:
            self._add_health_snapshot(engagement, current_user, is_dirty=False)
        if ACCOUNT_HEALTH_IMPACT_FIELDS.intersection(changed_fields):
            self._notify_account_health_impacted_by_engagement_change(account, engagement, current_user)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_update",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        self._add_update_timeline_events(account, engagement, current_user, before, after, changed_fields)
        self.engagements.commit()
        return EngagementRead.model_validate(engagement)

    def archive_engagement(self, engagement_id: str, current_user: User) -> MessageResponse:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module="engagement_sow_management")
        before = self._engagement_audit_value(engagement)
        engagement.status = "archived"
        engagement.archived_at = datetime.now(timezone.utc)
        engagement.updated_by_id = current_user.id
        after = self._engagement_audit_value(engagement)
        self.audit.log(
            module="engagement_sow_management",
            action="engagement_archive",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            before_value=before,
            after_value=after,
        )
        self._add_engagement_timeline_event(
            account,
            engagement,
            current_user,
            event_type="engagement_archived",
            title=f"Engagement archived: {engagement.name}",
            description="Engagement/SOW record was archived.",
            previous_value=before,
            new_value=after,
            metadata={"changed_fields": ["status", "archived_at"]},
        )
        self._notify_account_health_impacted_by_engagement_change(account, engagement, current_user)
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
        before = self._engagement_audit_value(engagement)
        engagement.delivery_health = self._calculated_health(engagement)
        snapshot = self._add_health_snapshot(engagement, current_user, is_dirty=False)
        self._notify_account_health_impacted_by_engagement_change(account, engagement, current_user)
        after = self._engagement_audit_value(engagement)
        self.audit.log(
            module="engagement_sow_management",
            action="health_recalculate",
            entity_type="engagement",
            entity_id=engagement.id,
            actor=current_user,
            after_value={"delivery_health": engagement.delivery_health, "rag_status": snapshot.rag_status},
        )
        self._add_engagement_timeline_event(
            account,
            engagement,
            current_user,
            event_type="engagement_health_changed",
            title=f"Engagement health changed: {engagement.name}",
            description=f"Delivery health is now {engagement.delivery_health}/100.",
            previous_value=self._select_timeline_fields(before, HEALTH_FIELDS),
            new_value={**self._select_timeline_fields(after, HEALTH_FIELDS), "rag_status": snapshot.rag_status},
            metadata={"changed_fields": ["delivery_health"], "source": "manual_recalculation"},
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
        engagement = self._get_engagement_record_or_404(engagement_id)
        if engagement is None or engagement.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement

    def _get_engagement_record_or_404(self, engagement_id: str) -> Engagement:
        engagement = self.engagements.get_by_id(engagement_id)
        if engagement is None:
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

    def _apply_updates(self, engagement: Engagement, payload: EngagementUpdateRequest, current_user: User) -> None:
        updates = payload.model_dump(exclude_unset=True)
        updates.pop("notice_deadline", None)
        if "owner_id" in updates and updates["owner_id"]:
            owner = self._get_active_user(updates["owner_id"])
            AccountService._ensure_owner_is_eligible(owner, "primary_am")
            updates["owner_name"] = owner.full_name
        if "ops_lead_id" in updates:
            ops_lead = self._get_optional_ops_lead(updates["ops_lead_id"])
            updates["ops_lead_name"] = ops_lead.full_name if ops_lead else None
        for field, value in updates.items():
            setattr(engagement, field, value)
        engagement.updated_by_id = current_user.id

    @staticmethod
    def _validate_engagement_dates(engagement: Engagement) -> None:
        start_date = EngagementService._calendar_date(engagement.start_date)
        end_date = EngagementService._calendar_date(engagement.end_date)
        if start_date and end_date and end_date < start_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Engagement end date must be after start date.")

    @staticmethod
    def _set_notice_deadline(engagement: Engagement) -> None:
        engagement.notice_deadline = calculate_notice_deadline(
            engagement.renewal_date,
            engagement.end_date,
            engagement.notice_period_days,
        )

    @staticmethod
    def _calendar_date(value: date | datetime | None) -> date | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        return value

    def _add_update_timeline_events(
        self,
        account: Account,
        engagement: Engagement,
        current_user: User,
        before: dict,
        after: dict,
        changed_fields: list[str],
    ) -> None:
        metadata = {"changed_fields": changed_fields}
        self._add_engagement_timeline_event(
            account,
            engagement,
            current_user,
            event_type="engagement_updated",
            title=f"Engagement updated: {engagement.name}",
            description="Engagement/SOW fields were updated.",
            previous_value=before,
            new_value=after,
            metadata=metadata,
        )
        self._add_field_change_event(
            account,
            engagement,
            current_user,
            before,
            after,
            changed_fields,
            fields=SOW_TERM_FIELDS,
            event_type="sow_terms_updated",
            title=f"SOW terms updated: {engagement.name}",
            description="SOW commercial, service, or term fields were updated.",
        )
        self._add_field_change_event(
            account,
            engagement,
            current_user,
            before,
            after,
            changed_fields,
            fields=RENEWAL_DATE_FIELDS,
            event_type="renewal_dates_updated",
            title=f"Renewal dates updated: {engagement.name}",
            description="Renewal date, notice period, or calculated notice deadline was updated.",
        )
        self._add_field_change_event(
            account,
            engagement,
            current_user,
            before,
            after,
            changed_fields,
            fields=HEALTH_FIELDS,
            event_type="engagement_health_changed",
            title=f"Engagement health changed: {engagement.name}",
            description="Engagement health, health status, or renewal risk was updated.",
        )
        self._add_field_change_event(
            account,
            engagement,
            current_user,
            before,
            after,
            changed_fields,
            fields={"delivery_status"},
            event_type="engagement_delivery_status_changed",
            title=f"Delivery status changed: {engagement.name}",
            description="Engagement delivery status was updated.",
        )

    def _add_field_change_event(
        self,
        account: Account,
        engagement: Engagement,
        current_user: User,
        before: dict,
        after: dict,
        changed_fields: list[str],
        *,
        fields: set[str],
        event_type: str,
        title: str,
        description: str,
    ) -> None:
        event_fields = sorted(fields.intersection(changed_fields))
        if not event_fields:
            return
        self._add_engagement_timeline_event(
            account,
            engagement,
            current_user,
            event_type=event_type,
            title=title,
            description=description,
            previous_value=self._select_timeline_fields(before, set(event_fields)),
            new_value=self._select_timeline_fields(after, set(event_fields)),
            metadata={"changed_fields": event_fields},
        )

    def _add_engagement_timeline_event(
        self,
        account: Account,
        engagement: Engagement,
        current_user: User,
        *,
        event_type: str,
        title: str,
        description: str,
        previous_value: dict | None = None,
        new_value: dict | None = None,
        metadata: dict | None = None,
        source_record_id: str | None = None,
        source_record_type: str = "engagement",
        source_record_route: str | None = None,
    ) -> None:
        self.timeline.add_engagement_event(
            account_id=account.id,
            engagement_id=engagement.id,
            event_type=event_type,
            title=title,
            description=description,
            actor=current_user,
            previous_value=previous_value,
            new_value=new_value,
            metadata=metadata,
            source_record_id=source_record_id,
            source_record_type=source_record_type,
            source_record_route=source_record_route or f"/accounts/{account.id}?tab=engagements",
        )

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

    def _notify_account_health_impacted_by_engagement_change(self, account: Account, engagement: Engagement, current_user: User) -> None:
        rollup = notify_account_health_impacted_by_engagement_change(self.engagements, account=account, engagement=engagement)
        self.audit.log(
            module="engagement_sow_management",
            action="account_health_impacted_by_engagement_change",
            entity_type="account",
            entity_id=account.id,
            actor=current_user,
            after_value={
                "engagement_id": engagement.id,
                "overall": rollup.overall,
                "rag_status": rollup.rag_status,
                "metric_version": rollup.metric_version,
                "contribution_count": len(rollup.contributions),
            },
        )

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
            "id": engagement.id,
            "account_id": engagement.account_id,
            "name": engagement.name,
            "description": engagement.description,
            "status": engagement.status,
            "owner_id": engagement.owner_id,
            "owner_name": engagement.owner_name,
            "ops_lead_id": engagement.ops_lead_id,
            "ops_lead_name": engagement.ops_lead_name,
            "service_lines": list(engagement.service_lines or []),
            "source_links": list(engagement.source_links or []),
            "delivery_status": engagement.delivery_status,
            "commercial_status": engagement.commercial_status,
            "delivery_health": engagement.delivery_health,
            "health_status": engagement.health_status,
            "renewal_risk": engagement.renewal_risk,
            "value": float(engagement.value),
            "currency": engagement.currency,
            "start_date": datetime_value(engagement.start_date),
            "end_date": datetime_value(engagement.end_date),
            "renewal_date": datetime_value(engagement.renewal_date),
            "notice_deadline": datetime_value(engagement.notice_deadline),
            "notice_period_days": engagement.notice_period_days,
            "auto_renewal": engagement.auto_renewal,
            "commercial_context": engagement.commercial_context,
            "resource_dependency": engagement.resource_dependency,
            "risks": list(engagement.risks or []),
            "source_citation": engagement.source_citation,
            "archived_at": datetime_value(engagement.archived_at),
        }

    @classmethod
    def _important_field_changes(cls, before: dict, after: dict) -> list[str]:
        important_fields = {
            "name",
            "description",
            "status",
            "owner_id",
            "ops_lead_id",
            "service_lines",
            "source_links",
            "value",
            "currency",
            "delivery_status",
            "commercial_status",
            "delivery_health",
            "health_status",
            "renewal_risk",
            "start_date",
            "end_date",
            "renewal_date",
            "notice_deadline",
            "notice_period_days",
            "auto_renewal",
            "commercial_context",
            "resource_dependency",
            "risks",
            "source_citation",
        }
        return sorted(field for field in important_fields if before.get(field) != after.get(field))

    @staticmethod
    def _select_timeline_fields(snapshot: dict, fields: set[str]) -> dict:
        return {field: snapshot.get(field) for field in sorted(fields)}

    def _engagement_summary(self, engagement: Engagement, latest_health: EngagementHealthSnapshot | None) -> dict:
        return {
            "id": engagement.id,
            "account_id": engagement.account_id,
            "name": engagement.name,
            "description": engagement.description,
            "status": engagement.status,
            "owner_id": engagement.owner_id,
            "owner_name": engagement.owner_name,
            "service_lines": list(engagement.service_lines or []),
            "source_document_ids": engagement.source_document_ids,
            "source_links": list(engagement.source_links or []),
            "contract_value": float(engagement.value),
            "currency": engagement.currency,
            "delivery_status": engagement.delivery_status,
            "commercial_status": engagement.commercial_status,
            "health_score": engagement.delivery_health,
            "health_status": engagement.health_status,
            "renewal_risk": engagement.renewal_risk,
            "start_date": engagement.start_date,
            "end_date": engagement.end_date,
            "renewal_date": engagement.renewal_date,
            "notice_period_days": engagement.notice_period_days,
            "notice_deadline": engagement.notice_deadline,
            "days_to_expiry": engagement.days_to_expiry,
            "renewal_status": engagement.renewal_status,
            "resource_dependency_notes": engagement.resource_dependency,
            "risks": list(engagement.risks or []),
            "latest_health": self._health_snapshot_summary(latest_health),
            "created_at": engagement.created_at,
            "updated_at": engagement.updated_at,
            "created_by": engagement.created_by,
            "updated_by": engagement.updated_by,
        }

    @staticmethod
    def _health_snapshot_summary(snapshot: EngagementHealthSnapshot | None) -> dict | None:
        if snapshot is None:
            return None
        return {
            "id": snapshot.id,
            "overall": snapshot.overall,
            "rag_status": snapshot.rag_status,
            "drivers": list(snapshot.drivers or []),
            "freshness_status": snapshot.freshness_status,
            "is_dirty": snapshot.is_dirty,
            "contribution": snapshot.contribution,
            "created_at": snapshot.created_at,
            "created_by_name": snapshot.created_by_name,
        }

    @staticmethod
    def _timeline_entry_value(entry) -> dict:
        return {
            "id": entry.id,
            "account_id": entry.account_id,
            "engagement_id": entry.engagement_id,
            "event_type": entry.event_type,
            "source_module": entry.module,
            "module": entry.module,
            "title": entry.title,
            "description": entry.description,
            "actor_id": entry.performed_by,
            "actor_name": entry.performed_by_name,
            "performed_by": entry.performed_by,
            "performed_by_name": entry.performed_by_name,
            "source_record_id": entry.source_record_id,
            "source_record_type": entry.source_record_type,
            "source_record_route": entry.source_record_route,
            "previous_value": entry.before_value,
            "new_value": entry.after_value,
            "before_value": entry.before_value,
            "after_value": entry.after_value,
            "metadata": entry.metadata_json,
            "event_at": entry.event_at,
            "timestamp": entry.event_at or entry.created_at,
            "is_sensitive": entry.is_sensitive,
            "sensitivity_level": entry.sensitivity_level,
            "tags": list(entry.tags or []),
            "mentions": list(entry.mentions or []),
            "attachments": list(entry.attachments or []),
            "status": entry.status,
            "is_system_generated": entry.is_system_generated,
            "is_immutable": entry.is_immutable,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
        }

    @staticmethod
    def _days_until(value: date | datetime | None) -> int | None:
        if value is None:
            return None
        value_tzinfo = value.tzinfo if isinstance(value, datetime) else timezone.utc
        now = datetime.now(value_tzinfo or timezone.utc)
        if isinstance(value, datetime) and value.tzinfo is None:
            now = now.replace(tzinfo=None)
        target_date = value.date() if isinstance(value, datetime) else value
        return (target_date - now.date()).days

    def _renewal_status(self, engagement: Engagement) -> str:
        return engagement.renewal_status

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
