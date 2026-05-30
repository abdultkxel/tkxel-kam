from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountOwner,
    AccountOwnershipHistory,
    Engagement,
    EngagementHealthSnapshot,
    OnboardingDraft,
    OnboardingDraftEngagement,
    SourceCitation,
    SourceDocument,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.schemas import (
    OnboardingDraftCreateRequest,
    OnboardingDraftLinkRequest,
    OnboardingDraftPageRead,
    OnboardingDraftRead,
    OnboardingDraftRejectRequest,
    OnboardingDraftUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.accounts import AccountService
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.engagements import calculate_notice_deadline
from app.services.engagement_health_rollup import notify_account_health_impacted_by_engagement_change
from app.services.timeline import TimelineService
from app.services.user_management import page_count


class OnboardingService:
    def __init__(self, db: Session) -> None:
        self.onboarding = OnboardingRepository(db)
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))

    def list_drafts(
        self,
        current_user: User,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        lifecycle_status: str | None = None,
        segment: str | None = None,
        region: str | None = None,
        uploader: str | None = None,
        owner: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "newest",
        page: int = 1,
        page_size: int = 10,
    ) -> OnboardingDraftPageRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "view")
        items, total = self.onboarding.list_drafts(
            search=search,
            status_filter=status_filter,
            lifecycle_status=lifecycle_status,
            segment=segment,
            region=region,
            uploader=uploader,
            owner=owner,
            created_from=created_from,
            created_to=created_to,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        return OnboardingDraftPageRead(
            items=[OnboardingDraftRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def get_draft(self, draft_id: str, current_user: User) -> OnboardingDraftRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "view")
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft_id))

    def create_draft(self, payload: OnboardingDraftCreateRequest, current_user: User) -> OnboardingDraftRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        duplicate = self.accounts.find_duplicate_by_name(payload.account_name)
        primary_owner = self._resolve_owner_from_payload(payload)
        conflicts = list(payload.conflicts)
        if duplicate:
            conflicts.append(f"Possible duplicate account: {duplicate.name}")

        draft = OnboardingDraft(
            account_name=payload.account_name,
            project_name=payload.project_name,
            company_url=payload.company_url,
            lifecycle_status=payload.lifecycle_status,
            segment=payload.segment,
            region=payload.region,
            service_context=payload.service_context,
            commercial_summary=payload.commercial_summary,
            initial_notes=payload.initial_notes,
            commercial_value=payload.commercial_value,
            currency=payload.currency,
            primary_owner_id=primary_owner.id if primary_owner else payload.primary_owner_id,
            primary_owner_name=primary_owner.full_name if primary_owner else payload.primary_owner_name,
            primary_owner_email=primary_owner.email if primary_owner else str(payload.primary_owner_email) if payload.primary_owner_email else None,
            confidence=payload.confidence,
            missing_fields=list(payload.missing_fields),
            conflicts=conflicts,
            duplicate_account_id=duplicate.id if duplicate else None,
            source_citation=payload.source_citation,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
        )
        self.onboarding.add_draft(draft)
        self.custom_fields.save_record_values(["account_onboarding_workspace", "account_overview"], draft.id, payload.custom_field_values, current_user)
        self._add_source_documents(draft, payload.source_documents, current_user)
        self._add_engagement_drafts(draft, payload.engagement_drafts)
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_create",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={"account_name": draft.account_name, "source_count": len(payload.source_documents)},
        )
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def update_draft(self, draft_id: str, payload: OnboardingDraftUpdateRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "update")
        self._ensure_open_draft(draft)
        before = self._draft_audit_value(draft)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(draft, field, value)
        if payload.primary_owner_id:
            owner = self._get_active_user(payload.primary_owner_id)
            draft.primary_owner_name = owner.full_name
            draft.primary_owner_email = owner.email
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_update",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            before_value=before,
            after_value=self._draft_audit_value(draft),
        )
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def approve_draft(self, draft_id: str, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self._ensure_open_draft(draft)
        self._ensure_not_duplicate(draft)
        primary_owner = self._resolve_primary_owner_for_approval(draft, current_user)
        self._validate_approval(draft)

        account = Account(
            name=draft.account_name,
            project_name=draft.project_name,
            company_url=draft.company_url,
            segment=draft.segment,
            region=draft.region,
            lifecycle_status=draft.lifecycle_status,
            risk_status="warning",
            commercial_value=draft.commercial_value,
            currency=draft.currency,
            service_context=draft.service_context,
            commercial_summary=draft.commercial_summary,
            initial_notes=draft.initial_notes,
            source_citation=self._source_citation_for_draft(draft),
            created_from_draft_id=draft.id,
            created_by_id=current_user.id,
        )
        self.accounts.save(account)
        self.custom_fields.copy_record_values(["account_onboarding_workspace", "account_overview"], draft.id, account.id, current_user)
        self._create_primary_owner(account, primary_owner, current_user)
        for document in draft.source_documents:
            document.account_id = account.id
        created_engagements = [self._create_engagement(account, engagement_draft, primary_owner, current_user) for engagement_draft in draft.engagement_drafts]
        self._notify_account_health_impacted_by_engagement_creation(account, created_engagements)
        draft.status = "approved"
        draft.approved_by_id = current_user.id
        draft.approved_account_id = account.id
        draft.decided_at = datetime.now(timezone.utc)
        self._log_approval(account, draft, current_user, created_engagements)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def reject_draft(self, draft_id: str, payload: OnboardingDraftRejectRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self._ensure_open_draft(draft)
        draft.status = "rejected"
        draft.rejected_by_id = current_user.id
        draft.rejection_reason = payload.reason
        draft.decided_at = datetime.now(timezone.utc)
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_reject",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            before_value={"status": "ready_for_review"},
            after_value={"status": draft.status},
            reason=payload.reason,
        )
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def link_account(self, draft_id: str, payload: OnboardingDraftLinkRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        account = self.accounts.get_by_id(payload.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self.access.require_account_update(current_user, account)
        self._ensure_open_draft(draft)
        for document in draft.source_documents:
            document.account_id = account.id
        draft.status = "linked"
        draft.approved_account_id = account.id
        draft.approved_by_id = current_user.id
        draft.decided_at = datetime.now(timezone.utc)
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_link",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={"linked_account_id": account.id},
            reason=payload.reason,
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="account_setup",
            module="onboarding",
            title="Onboarding draft linked",
            description=payload.reason,
            actor=current_user,
            source_record_id=draft.id,
            source_record_type="onboarding_draft",
            source_record_route=f"/accounts/onboarding?draft={draft.id}",
        )
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def _get_draft_or_404(self, draft_id: str) -> OnboardingDraft:
        draft = self.onboarding.get_by_id(draft_id)
        if draft is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding draft was not found")
        return draft

    @staticmethod
    def _ensure_open_draft(draft: OnboardingDraft) -> None:
        if draft.status != "ready_for_review":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only drafts ready for review can be changed")

    @staticmethod
    def _ensure_not_duplicate(draft: OnboardingDraft) -> None:
        if draft.duplicate_account_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Possible duplicate account found. Link this draft to the existing account or edit the account name.")

    def _validate_approval(self, draft: OnboardingDraft) -> None:
        errors = self._approval_errors(draft)
        if errors:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Draft approval validation failed", "errors": errors})

    def _approval_errors(self, draft: OnboardingDraft) -> list[dict[str, str]]:
        checks = [
            ("account_name", bool(draft.account_name), "Account name is required before approval."),
            ("lifecycle_status", bool(draft.lifecycle_status), "Lifecycle status is required before approval."),
            ("segment", bool(draft.segment), "Segment is required before approval."),
            ("region", bool(draft.region), "Region is required before approval."),
            ("source_citation", bool(self._source_citation_for_draft(draft)), "Source citation is required before approval."),
        ]
        errors = [{"field": field, "message": message} for field, passed, message in checks if not passed]
        return errors + self._engagement_approval_errors(draft)

    @staticmethod
    def _engagement_approval_errors(draft: OnboardingDraft) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        for index, engagement in enumerate(draft.engagement_drafts):
            prefix = f"engagement_drafts.{index}"
            required_checks = [
                ("name", bool(engagement.name), "Engagement name is required."),
                ("service_lines", bool(engagement.service_lines), "At least one service line is required."),
                ("start_date", bool(engagement.start_date), "Start date is required."),
                ("delivery_status", bool(engagement.delivery_status), "Delivery status is required."),
            ]
            errors.extend({"field": f"{prefix}.{field}", "message": message} for field, passed, message in required_checks if not passed)
        return errors

    def _resolve_owner_from_payload(self, payload: OnboardingDraftCreateRequest) -> User | None:
        if payload.primary_owner_id:
            return self._get_active_user(payload.primary_owner_id)
        if payload.primary_owner_email:
            user = self.accounts.get_user_by_email(str(payload.primary_owner_email))
            return user if user and user.is_active else None
        return None

    def _resolve_primary_owner_for_approval(self, draft: OnboardingDraft, current_user: User) -> User:
        candidates = [
            self._get_user_if_active(draft.primary_owner_id),
            self.accounts.get_user_by_email(draft.primary_owner_email) if draft.primary_owner_email else None,
            self.accounts.get_first_active_user_by_role("account_manager"),
            current_user if current_user.is_active and self._is_primary_am_eligible(current_user) else None,
        ]
        owner = next((candidate for candidate in candidates if candidate and self._is_primary_am_eligible(candidate)), None)
        if owner is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An active primary Account Manager is required before approval")
        draft.primary_owner_id = owner.id
        draft.primary_owner_name = owner.full_name
        draft.primary_owner_email = owner.email
        return owner

    def _get_user_if_active(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        user = self.accounts.get_user(user_id)
        return user if user and user.is_active else None

    def _get_active_user(self, user_id: str) -> User:
        user = self._get_user_if_active(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is inactive or does not exist")
        return user

    @staticmethod
    def _is_primary_am_eligible(user: User) -> bool:
        return user.role in {"account_manager", "am", "kam_head", "admin", "super_admin"}

    def _add_source_documents(self, draft: OnboardingDraft, source_documents, current_user: User) -> None:
        for document_payload in source_documents:
            document = SourceDocument(
                draft_id=draft.id,
                title=document_payload.title,
                source_type=document_payload.source_type,
                file_name=document_payload.file_name,
                file_url=document_payload.file_url,
                link_url=document_payload.link_url,
                uploaded_by_id=current_user.id,
                uploaded_by_name=current_user.full_name,
                extraction_status=document_payload.extraction_status,
                confidence=document_payload.confidence,
                pages=document_payload.pages,
                is_sensitive=document_payload.is_sensitive,
            )
            self.accounts.add_attachment(document)
            for citation_payload in document_payload.citations:
                self.accounts.add_citation(
                    SourceCitation(
                        source_document_id=document.id,
                        label=citation_payload.label,
                        page_number=citation_payload.page_number,
                        excerpt=citation_payload.excerpt,
                        field_key=citation_payload.field_key,
                    )
                )

    def _add_engagement_drafts(self, draft: OnboardingDraft, engagement_drafts) -> None:
        for payload in engagement_drafts:
            owner = self._get_user_if_active(payload.owner_id)
            ops_lead = self._get_user_if_active(payload.ops_lead_id)
            self.onboarding.add_engagement_draft(
                OnboardingDraftEngagement(
                    draft_id=draft.id,
                    name=payload.name,
                    owner_id=owner.id if owner else payload.owner_id,
                    owner_name=owner.full_name if owner else payload.owner_name,
                    ops_lead_id=ops_lead.id if ops_lead else payload.ops_lead_id,
                    ops_lead_name=ops_lead.full_name if ops_lead else payload.ops_lead_name,
                    service_lines=list(payload.service_lines),
                    value=payload.value,
                    currency=payload.currency,
                    delivery_status=payload.delivery_status,
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
                    confidence=payload.confidence,
                )
            )

    def _create_primary_owner(self, account: Account, owner_user: User, current_user: User) -> AccountOwner:
        rationale = "Primary Account Manager assigned during onboarding approval."
        owner = AccountOwner(
            account_id=account.id,
            user_id=owner_user.id,
            user_name=owner_user.full_name,
            user_email=owner_user.email,
            ownership_role="primary_am",
            is_primary=True,
            rationale=rationale,
            created_by_id=current_user.id,
        )
        self.accounts.add_owner(owner)
        self.accounts.add_owner_history(
            AccountOwnershipHistory(
                account_id=account.id,
                owner_record_id=owner.id,
                ownership_role="primary_am",
                previous_user_id=None,
                previous_user_name=None,
                new_user_id=owner_user.id,
                new_user_name=owner_user.full_name,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                rationale=rationale,
                source="onboarding_approval",
            )
        )
        return owner

    def _create_engagement(self, account: Account, draft: OnboardingDraftEngagement, primary_owner: User, current_user: User) -> Engagement:
        owner = self._get_user_if_active(draft.owner_id) or primary_owner
        ops_lead = self._get_user_if_active(draft.ops_lead_id)
        AccountService._ensure_owner_is_eligible(owner, "primary_am")
        engagement = Engagement(
            account_id=account.id,
            name=draft.name,
            status="active",
            owner_id=owner.id,
            owner_name=owner.full_name,
            ops_lead_id=ops_lead.id if ops_lead else draft.ops_lead_id,
            ops_lead_name=ops_lead.full_name if ops_lead else draft.ops_lead_name,
            service_lines=list(draft.service_lines),
            value=draft.value,
            currency=draft.currency,
            delivery_status=draft.delivery_status,
            delivery_health=max(45, min(95, draft.confidence)),
            start_date=draft.start_date,
            end_date=draft.end_date,
            renewal_date=draft.renewal_date,
            notice_deadline=calculate_notice_deadline(draft.renewal_date, draft.end_date, draft.notice_period_days),
            notice_period_days=draft.notice_period_days,
            auto_renewal=draft.auto_renewal,
            commercial_context=draft.commercial_context,
            resource_dependency=draft.resource_dependency,
            risks=list(draft.risks),
            source_citation=draft.source_citation or account.source_citation,
        )
        self.engagements.save(engagement)
        self.engagements.add_health_snapshot(
            EngagementHealthSnapshot(
                engagement_id=engagement.id,
                account_id=account.id,
                overall=engagement.delivery_health,
                rag_status=self._rag_status(engagement.delivery_health),
                drivers=self._health_drivers(engagement),
                freshness_status="fresh",
                is_dirty=False,
                contribution=round(engagement.delivery_health / 100, 2),
                created_by_id=current_user.id,
                created_by_name=current_user.full_name,
            )
        )
        return engagement

    def _log_approval(self, account: Account, draft: OnboardingDraft, actor: User, engagements: list[Engagement]) -> None:
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_approve",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=actor,
            after_value={"account_id": account.id, "engagement_count": len(engagements)},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="account_setup",
            module="onboarding",
            title="Account onboarding approved",
            description=f"{account.name} was approved from source-backed onboarding with {len(engagements)} engagement record(s).",
            actor=actor,
            source_record_id=draft.id,
            source_record_type="onboarding_draft",
            source_record_route=f"/accounts/onboarding?draft={draft.id}",
            metadata={"source_document_ids": [document.id for document in draft.source_documents]},
        )
        for engagement in engagements:
            self.timeline.add_engagement_event(
                account_id=account.id,
                engagement_id=engagement.id,
                event_type="engagement_created",
                title=f"Engagement created: {engagement.name}",
                description="Engagement created from approved onboarding draft.",
                actor=actor,
                source_record_route=f"/accounts/{account.id}?tab=engagements",
                new_value={"id": engagement.id, "name": engagement.name, "source": "onboarding_approval"},
            )

    def _notify_account_health_impacted_by_engagement_creation(self, account: Account, engagements: list[Engagement]) -> None:
        if not engagements:
            return
        notify_account_health_impacted_by_engagement_change(self.engagements, account=account, engagement=engagements[-1])

    @staticmethod
    def _source_citation_for_draft(draft: OnboardingDraft) -> str | None:
        if draft.source_citation:
            return draft.source_citation
        for document in draft.source_documents:
            if document.citations:
                citation = document.citations[0]
                return f"{citation.label}: {citation.excerpt}"
        return None

    @staticmethod
    def _draft_audit_value(draft: OnboardingDraft) -> dict:
        return {
            "account_name": draft.account_name,
            "lifecycle_status": draft.lifecycle_status,
            "segment": draft.segment,
            "region": draft.region,
            "status": draft.status,
        }

    @staticmethod
    def _health_drivers(engagement: Engagement) -> list[str]:
        drivers = [f"Delivery status: {engagement.delivery_status}"]
        if engagement.risks:
            drivers.append(f"{len(engagement.risks)} risk item(s)")
        if engagement.renewal_date:
            drivers.append("Renewal terms available")
        return drivers

    @staticmethod
    def _rag_status(score: int) -> str:
        if score < 60:
            return "critical"
        if score < 75:
            return "warning"
        return "healthy"
