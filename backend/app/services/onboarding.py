import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountOwner,
    AccountOwnershipHistory,
    Engagement,
    KycDraft,
    OnboardingDraft,
    OnboardingDraftEngagement,
    SourceCitation,
    SourceDocument,
    Stakeholder,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.rbac import ACCOUNT_CUSTOM_FIELD_MODULES
from app.schemas import (
    AccountCsvImportRequest,
    AccountCsvImportResponse,
    AccountCsvImportResult,
    AccountCsvImportRow,
    AccountRead,
    OnboardingDraftCreateRequest,
    OnboardingDraftLinkRequest,
    OnboardingDraftPageRead,
    OnboardingDraftRead,
    OnboardingDraftRejectRequest,
    OnboardingDraftUpdateRequest,
    OnboardingUploadExtractionRead,
    SourceDocumentExtractionRead,
    UserRead,
    validate_linkedin_url,
)
from app.services.account_access import AccountAccessService
from app.services.accounts import AccountService
from app.services.audit import AuditService
from app.services.custom_fields import CustomFieldService
from app.services.engagements import calculate_notice_deadline
from app.services.engagement_health_rollup import notify_account_health_impacted_by_engagement_change
from app.services.kyc_document_extraction import KycDocumentExtractionService
from app.services.kyc import DEFAULT_RESEARCH_SOURCES, KycService
from app.services.in_app_notifications import InAppNotificationService
from app.services.notifications import NotificationsService
from app.services.source_document_contract import ONBOARDING_DRAFT_LIFECYCLE_DEFAULT, STRUCTURED_SOW_METADATA_KEY, infer_service_lines_from_text
from app.services.sow_extraction import SowExtractionService
from app.services.storage import ContentStorageService
from app.services.timeline import TimelineService
from app.services.user_management import page_count


ACCOUNT_FIELD_MODULES = list(ACCOUNT_CUSTOM_FIELD_MODULES)


class OnboardingService:
    def __init__(self, db: Session) -> None:
        self.onboarding = OnboardingRepository(db)
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.custom_fields = CustomFieldService(db, CustomFieldRepository(db))
        self.account_service = AccountService(db)
        self.notifications = NotificationsService(db)
        self.in_app_notifications = InAppNotificationService(db)

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
        visibility = self._draft_visibility_filter(current_user)
        items, total = self.onboarding.list_drafts(
            search=search,
            status_filter=status_filter,
            lifecycle_status=lifecycle_status,
            segment=segment,
            region=region,
            uploader=uploader,
            owner=owner,
            visible_to_user_id=visibility[0],
            visible_to_user_email=visibility[1],
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
        draft = self._get_draft_or_404(draft_id)
        self._ensure_draft_visible(draft, current_user)
        return OnboardingDraftRead.model_validate(draft)

    def list_account_manager_candidates(self, current_user: User) -> list[UserRead]:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        return [UserRead.model_validate(user) for user in self.accounts.list_active_users() if self._is_primary_am_eligible(user)]

    def create_draft(self, payload: OnboardingDraftCreateRequest, current_user: User) -> OnboardingDraftRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        duplicate = self._find_duplicate_account(payload.account_name, payload.company_url)
        primary_owner = self._resolve_owner_from_payload(payload, current_user)
        self._ensure_owner_selection_allowed(current_user, primary_owner)
        conflicts = list(payload.conflicts)
        if duplicate:
            conflicts.append(f"Possible duplicate account: {duplicate.name}")

        draft = OnboardingDraft(
            account_name=payload.account_name,
            project_name=payload.project_name,
            company_url=payload.company_url,
            linkedin_url=payload.linkedin_url,
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
        self.custom_fields.save_record_values(ACCOUNT_FIELD_MODULES, draft.id, payload.custom_field_values, current_user)
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
        self._notify_draft_created(draft, current_user)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    async def create_draft_from_uploads(
        self,
        uploads: list[UploadFile],
        current_user: User,
        *,
        account_name: str | None = None,
        project_name: str | None = None,
        company_url: str | None = None,
        manager_id: str | None = None,
        manager_name: str | None = None,
        manager_email: str | None = None,
        linkedin_url: str | None = None,
        use_ai: bool = True,
    ) -> OnboardingDraftRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        if not uploads:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one SOW, charter, or source document is required")
        if len(uploads) > 10:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At most 10 source documents can be uploaded for one onboarding draft")
        try:
            normalized_linkedin_url = validate_linkedin_url(linkedin_url)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Validation failed", "errors": [{"field": "linkedin_url", "message": str(exc)}]},
            ) from exc
        primary_owner = self._resolve_owner_from_values(manager_id, manager_email)
        self._ensure_owner_selection_allowed(current_user, primary_owner)
        resolved_manager_name = primary_owner.full_name if primary_owner else manager_name
        resolved_manager_email = primary_owner.email if primary_owner else manager_email

        storage = ContentStorageService()
        extraction_service = KycDocumentExtractionService(self.onboarding.db)
        documents: list[SourceDocument] = []
        extracted_parts: list[str] = []
        structured_extractions: list[dict] = []
        stored_files_to_cleanup: list[str] = []
        try:
            for upload in uploads:
                stored = await storage.save_upload(upload)
                stored_files_to_cleanup.append(stored.file_path)
                checksum = self.account_service.file_checksum_for_upload(stored.file_path)
                document = SourceDocument(
                    title=self._title_from_file(stored.file_name),
                    source_type=self._source_type_from_file(stored.file_name),
                    file_name=stored.file_name,
                    file_url=stored.file_path,
                    storage_backend=stored.storage_backend,
                    storage_path=stored.file_path,
                    mime_type=stored.mime_type,
                    size_bytes=stored.size_bytes,
                    checksum_sha256=checksum,
                    uploaded_by_id=current_user.id,
                    uploaded_by_name=current_user.full_name,
                    extraction_status="queued",
                    confidence=75,
                    pages=0,
                    is_sensitive=False,
                )
                self.accounts.add_attachment(document)
                extraction = extraction_service.extract_document(document, force=True)
                if extraction.status == "completed":
                    extraction_service.chunk_document(document, extraction=extraction, force=True)
                    structured = SowExtractionService(self.onboarding.db).extract_structured_fields(document, extraction, allow_ai=use_ai)
                    structured_extractions.append(structured.fields)
                    extracted_text = extraction.raw_text or extraction.normalized_text
                    if extracted_text:
                        extracted_parts.append(f"Source: {stored.file_name}\n{extracted_text}")
                else:
                    document.extraction_status = extraction.status
                documents.append(document)
        except HTTPException:
            for path in stored_files_to_cleanup:
                storage.delete_stored_file(path)
            self.onboarding.db.rollback()
            raise

        combined_text = "\n\n".join(extracted_parts)
        inferred = self._infer_uploaded_draft_fields(
            combined_text,
            documents,
            structured_extractions=structured_extractions,
            manager_name=resolved_manager_name,
            manager_email=resolved_manager_email,
            current_user=current_user,
        )
        submitted_account_name = self._clean_short(account_name, default="") if account_name is not None else inferred["account_name"]
        submitted_project_name = self._clean_short(project_name, default="") if project_name is not None else inferred["project_name"]
        submitted_company_url = self._normalize_url(company_url) if company_url is not None else inferred["company_url"]
        submitted_linkedin_url = normalized_linkedin_url if linkedin_url is not None else inferred["linkedin_url"]
        source_name = documents[0].file_name if documents else "uploaded source document"
        form_values_submitted = any(value is not None for value in (account_name, project_name, company_url, linkedin_url))
        source_citation = (
            f"{source_name}: source document stored for KYC context; account fields submitted in the creation form."
            if form_values_submitted
            else inferred["source_citation"]
        )
        missing_fields = self._missing_fields_after_submitted_values(
            inferred["missing_fields"],
            account_name=submitted_account_name,
            project_name=submitted_project_name,
            company_url=submitted_company_url,
        )
        duplicate = self._find_duplicate_account(submitted_account_name, submitted_company_url)
        conflicts = list(inferred["conflicts"])
        if duplicate:
            conflicts.append(f"Possible duplicate account: {duplicate.name}")
        engagement_inferred = {
            **inferred,
            "project_name": submitted_project_name or inferred["project_name"],
            "primary_owner_name": resolved_manager_name or inferred["primary_owner_name"],
            "primary_owner_email": resolved_manager_email or inferred["primary_owner_email"],
        }

        draft = OnboardingDraft(
            account_name=submitted_account_name,
            project_name=submitted_project_name,
            company_url=submitted_company_url,
            lifecycle_status=ONBOARDING_DRAFT_LIFECYCLE_DEFAULT,
            segment=inferred["segment"],
            region=inferred["region"],
            service_context=inferred["service_context"],
            commercial_summary=inferred["commercial_summary"],
            initial_notes=inferred["initial_notes"],
            commercial_value=inferred["commercial_value"],
            currency=inferred["currency"],
            linkedin_url=submitted_linkedin_url,
            primary_owner_id=primary_owner.id if primary_owner else None,
            primary_owner_name=engagement_inferred["primary_owner_name"],
            primary_owner_email=engagement_inferred["primary_owner_email"],
            confidence=inferred["confidence"],
            missing_fields=missing_fields,
            conflicts=conflicts,
            duplicate_account_id=duplicate.id if duplicate else None,
            source_citation=source_citation,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            extraction_status="completed" if combined_text.strip() else "needs_review",
        )
        self.onboarding.add_draft(draft)
        for document in documents:
            document.draft_id = draft.id
            self._add_inferred_citations(document, combined_text, inferred)
            self._notify_uploaded_source_status(draft, document, current_user)
        self._add_uploaded_engagement_draft(draft, engagement_inferred)
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_create_from_upload",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={
                "account_name": draft.account_name,
                "source_count": len(documents),
                "extraction_status": draft.extraction_status,
                "used_filename_for_account_name": False,
            },
        )
        self._notify_draft_created(draft, current_user)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    async def extract_fields_from_uploads(
        self,
        uploads: list[UploadFile],
        current_user: User,
        *,
        manager_name: str | None = None,
        manager_email: str | None = None,
        linkedin_url: str | None = None,
        use_ai: bool = True,
    ) -> OnboardingUploadExtractionRead:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        if not uploads:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload at least one SOW or source document")
        if len(uploads) > 10:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At most 10 source documents can be inspected at one time")
        try:
            normalized_linkedin_url = validate_linkedin_url(linkedin_url) if linkedin_url else None
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Validation failed", "errors": [{"field": "linkedin_url", "message": str(exc)}]},
            ) from exc

        storage = ContentStorageService()
        extraction_service = KycDocumentExtractionService(self.onboarding.db)
        stored_files_to_cleanup: list[str] = []
        documents: list[SourceDocument] = []
        extracted_parts: list[str] = []
        structured_extractions: list[dict] = []
        try:
            for upload in uploads:
                stored = await storage.save_upload(upload)
                stored_files_to_cleanup.append(stored.file_path)
                result = extraction_service.extract_stored_file(Path(stored.file_path), stored.mime_type)
                status_value = KycDocumentExtractionService._status_for_extracted_text(result)
                document = SourceDocument(
                    title=self._title_from_file(stored.file_name),
                    source_type=self._source_type_from_file(stored.file_name),
                    file_name=stored.file_name,
                    file_url=stored.file_path,
                    storage_backend=stored.storage_backend,
                    storage_path=stored.file_path,
                    mime_type=stored.mime_type,
                    size_bytes=stored.size_bytes,
                    checksum_sha256=self.account_service.file_checksum_for_upload(stored.file_path),
                    uploaded_by_id=current_user.id,
                    uploaded_by_name=current_user.full_name,
                    extraction_status=status_value,
                    confidence=75,
                    pages=result.page_count,
                    is_sensitive=False,
                )
                documents.append(document)
                extracted_text = result.raw_text or result.normalized_text
                if extracted_text:
                    extracted_parts.append(f"Source: {stored.file_name}\n{extracted_text}")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Source document extraction failed: {str(exc)[:300]}",
            ) from exc
        finally:
            for path in stored_files_to_cleanup:
                storage.delete_stored_file(path)

        combined_text = "\n\n".join(extracted_parts)
        if combined_text.strip():
            structured = SowExtractionService(self.onboarding.db).extract_structured_fields_from_text(
                combined_text,
                source_name=documents[0].file_name if documents else "uploaded source document",
                allow_ai=use_ai,
            )
            structured_extractions.append(structured.fields)
        inferred = self._infer_uploaded_draft_fields(
            combined_text,
            documents,
            structured_extractions=structured_extractions,
            manager_name=manager_name,
            manager_email=manager_email,
            current_user=current_user,
        )
        return OnboardingUploadExtractionRead(
            account_name=inferred["account_name"],
            project_name=inferred["project_name"],
            company_url=inferred["company_url"],
            linkedin_url=normalized_linkedin_url or inferred["linkedin_url"],
            confidence=inferred["confidence"],
            missing_fields=inferred["missing_fields"],
            conflicts=inferred["conflicts"],
            source_citation=inferred["source_citation"],
            source_file_names=[document.file_name or document.title for document in documents],
            extraction_status="completed" if combined_text.strip() else "needs_review",
        )

    def update_draft(self, draft_id: str, payload: OnboardingDraftUpdateRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "update")
        self._ensure_draft_visible(draft, current_user)
        self._ensure_open_draft(draft)
        before = self._draft_audit_value(draft)
        before_notification = self._draft_update_notification_value(draft)
        updates = payload.model_dump(exclude_unset=True)
        if "primary_owner_id" in updates or "primary_owner_email" in updates:
            owner = self._resolve_owner_from_values(
                updates.get("primary_owner_id"),
                updates.get("primary_owner_email"),
            )
            self._ensure_owner_selection_allowed(current_user, owner, draft)
            if owner:
                updates["primary_owner_id"] = owner.id
                updates["primary_owner_name"] = owner.full_name
                updates["primary_owner_email"] = owner.email
            else:
                updates["primary_owner_id"] = None
                updates["primary_owner_name"] = None
                updates["primary_owner_email"] = None
        for field, value in updates.items():
            setattr(draft, field, value)
        changed_labels = self._draft_update_changed_labels(before_notification, self._draft_update_notification_value(draft))
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_update",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=current_user,
            before_value=before,
            after_value=self._draft_audit_value(draft),
        )
        if changed_labels:
            self._notify_draft_updated(draft, current_user, changed_labels)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def approve_draft(self, draft_id: str, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self._ensure_draft_visible(draft, current_user)
        self._ensure_open_draft(draft)
        self._ensure_not_duplicate(draft)
        primary_owner = self._resolve_primary_owner_for_approval(draft)
        self._apply_approval_defaults(draft, current_user)
        self._validate_approval(draft)

        account = Account(
            name=draft.account_name,
            project_name=draft.project_name,
            company_url=draft.company_url,
            linkedin_url=draft.linkedin_url,
            segment=draft.segment,
            region=draft.region,
            lifecycle_status=self._official_lifecycle_for_draft(draft.lifecycle_status),
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
        self.custom_fields.copy_record_values(ACCOUNT_FIELD_MODULES, draft.id, account.id, current_user)
        self._create_primary_owner(account, primary_owner, current_user)
        for document in draft.source_documents:
            document.account_id = account.id
        created_engagements = [self._create_engagement(account, engagement_draft, primary_owner, current_user) for engagement_draft in draft.engagement_drafts]
        self._link_source_documents_to_created_engagements(draft, created_engagements)
        self._notify_account_health_impacted_by_engagement_creation(account, created_engagements)
        self._create_default_stakeholder_from_approval(account, draft, current_user, created_engagements)
        self._create_default_kyc_from_approval(account, draft, current_user)
        draft.status = "approved"
        draft.approved_by_id = current_user.id
        draft.approved_account_id = account.id
        draft.decided_at = datetime.now(timezone.utc)
        self._log_approval(account, draft, current_user, created_engagements)
        self._notify_draft_outcome(draft, current_user, "account_draft_approved", f"Draft approved: {draft.account_name}", f"{current_user.full_name} approved the draft account.", account_id=account.id)
        self._notify_account_onboarded(draft, account, current_user)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def reject_draft(self, draft_id: str, payload: OnboardingDraftRejectRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self._ensure_draft_visible(draft, current_user)
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
        self._notify_draft_outcome(draft, current_user, "account_draft_rejected", f"Draft rejected: {draft.account_name}", payload.reason)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def link_account(self, draft_id: str, payload: OnboardingDraftLinkRequest, current_user: User) -> OnboardingDraftRead:
        draft = self._get_draft_or_404(draft_id)
        account = self.accounts.get_by_id(payload.account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")
        self._ensure_draft_visible(draft, current_user)
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
        self._notify_draft_outcome(draft, current_user, "account_draft_linked_existing", f"Draft linked: {draft.account_name}", payload.reason, account_id=account.id)
        self.onboarding.commit()
        return OnboardingDraftRead.model_validate(self._get_draft_or_404(draft.id))

    def import_accounts_from_csv(self, payload: AccountCsvImportRequest, current_user: User) -> AccountCsvImportResponse:
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "create")
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "approve")

        results = [self._import_csv_row(index, row, payload, current_user) for index, row in enumerate(payload.rows, start=1)]
        return AccountCsvImportResponse(
            created=sum(1 for result in results if result.status == "created"),
            updated=sum(1 for result in results if result.status == "updated"),
            skipped=sum(1 for result in results if result.status == "skipped"),
            failed=sum(1 for result in results if result.status == "failed"),
            total_rows=len(payload.rows),
            results=results,
        )

    def _import_csv_row(self, row_number: int, row: AccountCsvImportRow, payload: AccountCsvImportRequest, current_user: User) -> AccountCsvImportResult:
        try:
            duplicate = self.accounts.find_duplicate_by_name(row.account_name or "")
            if duplicate and payload.duplicate_mode == "skip":
                return self._csv_row_result(row_number, "skipped", row.account_name, "Duplicate account skipped.", account_id=duplicate.id)
            if duplicate and payload.duplicate_mode == "overwrite":
                return self._overwrite_csv_account(row_number, row, payload.source_file_name, duplicate, current_user)
            return self._create_csv_account(row_number, row, payload.source_file_name, current_user, allow_duplicate=payload.duplicate_mode == "create")
        except ValidationError as exc:
            self.onboarding.db.rollback()
            return self._csv_failure_result(row_number, row.account_name, "CSV row validation failed.", self._errors_from_validation(exc))
        except HTTPException as exc:
            self.onboarding.db.rollback()
            return self._csv_failure_result(row_number, row.account_name, self._message_from_http_exception(exc), self._errors_from_http_exception(exc))

    def _create_csv_account(
        self,
        row_number: int,
        row: AccountCsvImportRow,
        source_file_name: str | None,
        current_user: User,
        *,
        allow_duplicate: bool,
    ) -> AccountCsvImportResult:
        draft_payload = self._csv_row_to_draft_payload(row, row_number, source_file_name)
        draft = self.create_draft(draft_payload, current_user)
        if allow_duplicate:
            self._allow_duplicate_csv_draft(draft.id)
        approved = self.approve_draft(draft.id, current_user)
        account = self._account_read_by_id(approved.approved_account_id) if approved.approved_account_id else None
        return self._csv_row_result(
            row_number,
            "created",
            draft.account_name,
            "Account imported and stored in the account hierarchy.",
            account_id=approved.approved_account_id,
            draft_id=draft.id,
            account=account,
        )

    def _overwrite_csv_account(
        self,
        row_number: int,
        row: AccountCsvImportRow,
        source_file_name: str | None,
        account: Account,
        current_user: User,
    ) -> AccountCsvImportResult:
        draft_payload = self._csv_row_to_draft_payload(row, row_number, source_file_name)
        draft = self.create_draft(draft_payload, current_user)
        self.link_account(
            draft.id,
            OnboardingDraftLinkRequest(account_id=account.id, reason="CSV import overwrite matched this existing account."),
            current_user,
        )
        linked_draft = self._get_draft_or_404(draft.id)
        account = self.accounts.get_by_id(account.id) or account
        before = self._account_import_audit_value(account)
        self._apply_csv_account_updates(account, linked_draft, current_user)
        self.custom_fields.copy_record_values(ACCOUNT_FIELD_MODULES, linked_draft.id, account.id, current_user)
        self.audit.log(
            module="account_onboarding_workspace",
            action="csv_account_overwrite",
            entity_type="account",
            entity_id=account.id,
            actor=current_user,
            before_value=before,
            after_value=self._account_import_audit_value(account),
            reason="CSV import overwrite matched an existing account name.",
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="account_setup",
            module="onboarding",
            title="Account updated from CSV import",
            description=f"CSV row {row_number} updated this account and linked import source evidence.",
            actor=current_user,
            source_record_id=linked_draft.id,
            source_record_type="onboarding_draft",
            source_record_route=f"/accounts/onboarding?draft={linked_draft.id}",
        )
        self.onboarding.commit()
        return self._csv_row_result(
            row_number,
            "updated",
            linked_draft.account_name,
            "Existing account updated from CSV import.",
            account_id=account.id,
            draft_id=linked_draft.id,
            account=self._account_read_by_id(account.id),
        )

    def _csv_row_to_draft_payload(self, row: AccountCsvImportRow, row_number: int, source_file_name: str | None) -> OnboardingDraftCreateRequest:
        account_name = self._clean(row.account_name)
        project_name = self._clean(row.project_name) or f"{account_name or 'Imported account'} Account Onboarding"
        source_name = source_file_name or "account-import.csv"
        industry = self._clean(row.industry)
        owner_name = self._clean(row.owner_name)
        owner_email = self._clean(row.owner_email)
        commercial_value = self._first_present(row.commercial_value, row.arr, 0)
        lifecycle_status = self._normalize_csv_lifecycle(self._clean(row.lifecycle_status) or self._clean(row.stage))
        source_citation = f"{source_name} row {row_number}: account details supplied by CSV import."

        return OnboardingDraftCreateRequest.model_validate(
            {
                "account_name": account_name or "",
                "project_name": project_name,
                "company_url": self._clean(row.company_url),
                "linkedin_url": self._clean(row.linkedin_url),
                "lifecycle_status": lifecycle_status,
                "segment": self._clean(row.segment) or "Growth",
                "region": self._clean(row.region) or "Global",
                "service_context": f"Industry: {industry}" if industry else "Imported from account CSV.",
                "initial_notes": f"Imported from {source_name} row {row_number}.",
                "commercial_value": commercial_value,
                "currency": self._clean(row.currency) or "USD",
                "primary_owner_name": owner_name,
                "primary_owner_email": owner_email,
                "confidence": 75,
                "source_citation": source_citation,
                "source_documents": [
                    {
                        "title": f"{source_name} row {row_number}",
                        "source_type": "manual_import",
                        "file_name": source_name,
                        "confidence": 75,
                        "pages": 1,
                        "citations": [
                            {
                                "label": f"CSV row {row_number}",
                                "page_number": 1,
                                "excerpt": f"{account_name or 'Missing account name'} | {project_name}",
                                "field_key": "account_name",
                            }
                        ],
                    }
                ],
                "engagement_drafts": [
                    {
                        "name": project_name,
                        "owner_name": owner_name,
                        "service_lines": ["Account onboarding"],
                        "value": commercial_value,
                        "currency": self._clean(row.currency) or "USD",
                        "delivery_status": "active",
                        "start_date": datetime.now(timezone.utc),
                        "commercial_context": source_citation,
                        "risks": ["KYC has not been completed yet"],
                        "source_citation": source_citation,
                        "confidence": 75,
                    }
                ],
                "custom_field_values": row.custom_field_values,
            }
        )

    def _allow_duplicate_csv_draft(self, draft_id: str) -> None:
        draft = self._get_draft_or_404(draft_id)
        if not draft.duplicate_account_id:
            return
        draft.duplicate_account_id = None
        draft.conflicts = [*draft.conflicts, "CSV duplicate mode created a separate account with the same name."]
        self.onboarding.commit()

    def _apply_csv_account_updates(self, account: Account, draft: OnboardingDraft, current_user: User) -> None:
        account.name = draft.account_name
        account.project_name = draft.project_name
        account.company_url = draft.company_url
        account.linkedin_url = draft.linkedin_url
        account.segment = draft.segment
        account.region = draft.region
        account.lifecycle_status = self._official_lifecycle_for_draft(draft.lifecycle_status)
        account.commercial_value = draft.commercial_value
        account.currency = draft.currency
        account.service_context = draft.service_context
        account.commercial_summary = draft.commercial_summary
        account.initial_notes = draft.initial_notes
        account.source_citation = self._source_citation_for_draft(draft)
        if not draft.primary_owner_id and not draft.primary_owner_email:
            return
        owner = self._resolve_primary_owner_for_approval(draft)
        previous = self.accounts.get_active_primary_owner(account.id)
        if previous and previous.user_id == owner.id:
            return
        if previous:
            previous.is_active = False
            previous.ended_at = datetime.now(timezone.utc)
        self._create_primary_owner(
            account,
            owner,
            current_user,
            rationale="Primary Account Manager assigned during CSV import overwrite.",
            source="csv_import_overwrite",
        )

    def _account_read_by_id(self, account_id: str | None) -> AccountRead | None:
        if not account_id:
            return None
        account = self.accounts.get_by_id(account_id)
        return self.account_service._account_read(account) if account else None

    @staticmethod
    def _csv_row_result(
        row_number: int,
        result_status: str,
        account_name: str | None,
        message: str,
        *,
        account_id: str | None = None,
        draft_id: str | None = None,
        account: AccountRead | None = None,
    ) -> AccountCsvImportResult:
        return AccountCsvImportResult(
            row_number=row_number,
            status=result_status,
            account_name=account_name,
            message=message,
            account_id=account_id,
            draft_id=draft_id,
            account=account,
        )

    @staticmethod
    def _csv_failure_result(row_number: int, account_name: str | None, message: str, errors: list[dict[str, str]]) -> AccountCsvImportResult:
        return AccountCsvImportResult(row_number=row_number, status="failed", account_name=account_name, message=message, errors=errors)

    @staticmethod
    def _message_from_http_exception(exc: HTTPException) -> str:
        if isinstance(exc.detail, dict) and isinstance(exc.detail.get("message"), str):
            return exc.detail["message"]
        return str(exc.detail)

    @staticmethod
    def _errors_from_http_exception(exc: HTTPException) -> list[dict[str, str]]:
        if isinstance(exc.detail, dict) and isinstance(exc.detail.get("errors"), list):
            return [error for error in exc.detail["errors"] if isinstance(error, dict)]
        return [{"field": "row", "message": str(exc.detail)}]

    @staticmethod
    def _errors_from_validation(exc: ValidationError) -> list[dict[str, str]]:
        errors = []
        for error in exc.errors():
            field_path = ".".join(str(item) for item in error.get("loc", ()) if item != "body") or "row"
            message = str(error.get("msg", "Invalid value.")).removeprefix("Value error, ")
            errors.append({"field": field_path, "message": message[:1].upper() + message[1:]})
        return errors

    def draft_document_download_path(self, draft_id: str, document_id: str, current_user: User) -> tuple[SourceDocument, Path]:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "view")
        self._ensure_draft_visible(draft, current_user)
        document = next((item for item in draft.source_documents if item.id == document_id), None)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding source document was not found")
        if document.is_sensitive and not self.access.can_view_sensitive_sources(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot download sensitive source documents")
        path = self._stored_file_path(document)
        if path is None or not path.exists() or not path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored source document file was not found")
        return document, path

    def extract_draft_document(
        self,
        draft_id: str,
        document_id: str,
        current_user: User,
        *,
        force: bool = True,
    ) -> SourceDocumentExtractionRead:
        draft = self._get_draft_or_404(draft_id)
        self.access.require_module_permission(current_user, "account_onboarding_workspace", "update")
        self._ensure_draft_visible(draft, current_user)
        if draft.status not in {"ready_for_review"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only source documents on drafts ready for review can be re-extracted")
        document = next((item for item in draft.source_documents if item.id == document_id), None)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding source document was not found")
        if document.is_sensitive and not self.access.can_view_sensitive_sources(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot extract sensitive source documents")

        extraction_service = KycDocumentExtractionService(self.onboarding.db)
        extraction = extraction_service.extract_document(document, force=force)
        if extraction.status == "completed":
            extraction_service.chunk_document(document, extraction=extraction, force=force)
            if document.source_type in {"sow", "project_charter", "commercial_note"}:
                SowExtractionService(self.onboarding.db).extract_structured_fields(document, extraction)
        draft.extraction_status = "completed" if all(item.extraction_status == "completed" for item in draft.source_documents) else "needs_review"
        self.audit.log(
            module="account_onboarding_workspace",
            action="source_extraction_retry",
            entity_type="source_document",
            entity_id=document.id,
            actor=current_user,
            after_value={
                "draft_id": draft.id,
                "extraction_status": document.extraction_status,
                "ocr_status": document.ocr_status,
                "pages": document.pages,
                "force": force,
            },
        )
        self._notify_uploaded_source_status(draft, document, current_user)
        self.onboarding.commit()
        return SourceDocumentExtractionRead.model_validate(extraction)

    def _infer_uploaded_draft_fields(
        self,
        text: str,
        documents: list[SourceDocument],
        *,
        structured_extractions: list[dict] | None = None,
        manager_name: str | None,
        manager_email: str | None,
        current_user: User,
    ) -> dict:
        structured = self._merge_structured_extractions(structured_extractions or [])
        field_citations = self._draft_field_citations(structured)
        account_name = (
            self._structured_value(structured, "client_name", min_confidence=30)
            or
            self._extract_label(text, ["Account Name", "Name of Account", "Customer", "Client", "Client Name", "Company Name", "Legal Entity", "Client Legal Name"])
            or self._extract_customer_from_legal_intro(text)
            or ""
        )
        project_name = (
            self._extract_label(text, ["Project Name", "Name of Project", "SOW Title", "Statement of Work Title", "Engagement Name", "Program Name"])
            or self._extract_project_from_sow_heading(text, account_name)
            or self._extract_sow_heading(text)
        )
        company_url = self._extract_label(text, ["Company URL", "Website", "Website URL", "Company Website", "Client Website"])
        linkedin_url = self._extract_label(text, ["LinkedIn URL", "LinkedIn", "Company LinkedIn", "Client LinkedIn"]) or self._extract_linkedin_url(text)
        region = self._extract_label(text, ["Region", "Primary Region", "Geography"]) or self._extract_region_from_legal_intro(text) or "Global"
        segment = self._extract_label(text, ["Segment", "Account Segment", "Client Segment", "Industry Vertical"]) or "Enterprise"
        structured_service_lines = self._structured_list(structured, "service_lines")
        explicit_service_lines = self._split_list(self._extract_label(text, ["Service Lines", "Services", "Tkxel Service Lines", "Service Stream Name", "Service Stream", "Project Role/Skillsets"]))
        service_lines = explicit_service_lines or structured_service_lines or self._infer_service_lines(text)
        commercial_value, currency = self._extract_money(text)
        structured_commercial_value, structured_currency = self._structured_money(structured)
        if structured_commercial_value is not None:
            commercial_value = structured_commercial_value
            currency = structured_currency or currency
        start_date = self._extract_date(text, ["Start Date", "Effective Date", "SOW Start Date", "Project Kickoff Date", "Kickoff Date", "Project Start Date"])
        end_date = self._extract_date(text, ["End Date", "Expiration Date", "SOW End Date", "Project Signoff Date", "Signoff Date", "Project End Date"])
        narrative_start, narrative_end = self._extract_timeframe_sentence_dates(text)
        start_date = self._parse_structured_date(self._structured_value(structured, "start_date", min_confidence=30)) or start_date or narrative_start
        end_date = self._parse_structured_date(self._structured_value(structured, "end_date", min_confidence=30)) or end_date or narrative_end
        renewal_date = self._extract_date(text, ["Renewal Date", "Renewal Review Date"])
        structured_notice = self._structured_value(structured, "notice_period", min_confidence=30)
        structured_renewal_terms = self._structured_value(structured, "renewal_terms", min_confidence=30)
        notice_period_days = self._structured_notice_days(structured_notice) or self._extract_notice_period(text) or self._extract_renewal_notice_days(text)
        auto_renewal = self._structured_auto_renewal(structured_renewal_terms) or self._extract_bool(text, ["Auto Renewal", "Auto-Renewal", "Automatic Renewal"])
        owner_name = manager_name or self._extract_label(text, ["Primary Owner Name", "Account Manager", "Tkxel Account Manager", "Account Executive"]) or current_user.full_name
        owner_email = manager_email or self._extract_label(text, ["Primary Owner Email", "Account Manager Email", "Tkxel Account Manager Email"]) or current_user.email

        structured_deliverables = self._structured_list(structured, "deliverables")
        service_context = self._extract_section(
            text,
            ["Scope of Work", "Service Context", "Engagement Scope", "Project Scope", "Business Context", "Objectives"],
            max_chars=1600,
        )
        charter_context = self._extract_labeled_summary(
            text,
            ["Business Domain", "Project Domain", "Project Objectives", "Special Requirements / Remarks", "Special Requirements", "Success Metrics"],
            max_chars=1600,
        )
        if charter_context:
            service_context = "\n\n".join(part for part in (service_context, charter_context) if part)
        commercial_summary = self._extract_section(
            text,
            ["Commercial Summary", "Commercial Terms", "Pricing", "Fees", "Billing Terms", "Payment Terms"],
            max_chars=1400,
        )
        commercial_summary = self._structured_commercial_summary(
            commercial_summary,
            commercial_value,
            currency,
            renewal_terms=structured_renewal_terms,
            notice_period=structured_notice,
        )
        charter_commercial_summary = self._extract_labeled_summary(
            text,
            ["Contract Type", "Resource Agreement Type", "Project Size (man hours)", "Project Size", "Invoicing Methodology", "Invoicing Schedule"],
            max_chars=1400,
        )
        if charter_commercial_summary:
            commercial_summary = "\n\n".join(part for part in (commercial_summary, charter_commercial_summary) if part)
        initial_notes = self._extract_section(
            text,
            ["Risks", "Assumptions", "Success Metrics", "Governance", "Out of Scope"],
            max_chars=1400,
        )
        charter_risks = self._extract_charter_risks(text)
        if charter_risks:
            initial_notes = charter_risks
        structured_risks = self._structured_list(structured, "risks")
        if structured_risks:
            initial_notes = "Risks:\n" + "\n".join(f"- {item}" for item in structured_risks)
        if structured_deliverables and service_context:
            service_context = f"{service_context}\n\nDeliverables:\n" + "\n".join(f"- {item}" for item in structured_deliverables[:12])
        elif structured_deliverables:
            service_context = "Deliverables:\n" + "\n".join(f"- {item}" for item in structured_deliverables[:12])

        source_name = documents[0].file_name if documents else "uploaded source document"
        missing_fields = []
        if not account_name:
            missing_fields.append("Account name was not found in the uploaded source text.")
        if not project_name:
            missing_fields.append("Project name was not found in the uploaded source text.")
        if not company_url:
            missing_fields.append("Company website was not found in the uploaded source text.")
        if not text.strip():
            missing_fields.append("Readable text could not be extracted from the uploaded source document.")
        if not service_lines:
            missing_fields.append("Service lines were not found in the uploaded source text.")
        if commercial_value <= 0:
            missing_fields.append("Commercial value was not found in the uploaded source text.")
        if not start_date:
            missing_fields.append("Engagement start date was not found in the uploaded source text.")
        if not end_date:
            missing_fields.append("Engagement end date was not found in the uploaded source text.")
        if not notice_period_days:
            missing_fields.append("Renewal notice period was not found in the uploaded source text.")
        missing_fields.extend(self._structured_missing_evidence_notes(structured))
        missing_fields = list(dict.fromkeys(missing_fields))

        conflicts = []
        if any(document.extraction_status not in {"completed", "parsed"} for document in documents):
            conflicts.append("One or more source documents could not be fully extracted and need manual review.")

        confidence = self._draft_confidence(structured)
        if missing_fields:
            confidence = min(confidence, 74)
        if not text.strip():
            confidence = 45
        source_citation = (
            self._citation_summary("Account name", field_citations.get("account_name"))
            or f"{source_name}: onboarding draft inferred from extracted document text, not from the file name."
        )

        return {
            "account_name": self._clean_short(account_name, default=""),
            "project_name": self._clean_short(project_name, default=""),
            "company_url": self._normalize_url(company_url),
            "linkedin_url": self._normalize_linkedin_url(linkedin_url),
            "segment": self._clean_short(segment, default="Enterprise"),
            "region": self._clean_short(region, default="Global"),
            "service_context": service_context or self._summarize_text(text, "Service scope was extracted from the uploaded source document."),
            "commercial_summary": commercial_summary or self._commercial_summary_from_money(commercial_value, currency),
            "initial_notes": initial_notes or "Review the extracted source document before approval. No separate assumptions or risks section was found.",
            "commercial_value": commercial_value,
            "currency": currency,
            "primary_owner_name": self._clean_short(owner_name, default=current_user.full_name),
            "primary_owner_email": owner_email,
            "source_citation": source_citation,
            "missing_fields": missing_fields,
            "conflicts": conflicts,
            "confidence": confidence,
            "service_lines": service_lines or ["Account onboarding"],
            "start_date": start_date,
            "end_date": end_date,
            "renewal_date": renewal_date or end_date,
            "notice_period_days": notice_period_days,
            "auto_renewal": auto_renewal,
            "delivery_status": self._inferred_delivery_status(start_date, end_date),
            "resource_dependency": self._resource_dependency_from_risks(structured_risks, initial_notes),
            "engagement_source_citation": self._engagement_source_citation(field_citations, source_name),
            "engagement_confidence": self._engagement_confidence(structured, fallback=confidence, missing_fields=missing_fields),
            "structured_extraction": structured,
            "field_citations": field_citations,
        }

    @staticmethod
    def _merge_structured_extractions(extractions: list[dict]) -> dict:
        merged: dict[str, dict] = {}
        for extraction in extractions:
            for key, value in extraction.items():
                if not isinstance(value, dict):
                    continue
                current = merged.get(key)
                if current is None or OnboardingService._confidence_value(value) > OnboardingService._confidence_value(current):
                    merged[key] = value
        return merged

    @staticmethod
    def _structured_value(structured: dict, key: str, *, min_confidence: int = 1) -> str | None:
        item = structured.get(key)
        if not isinstance(item, dict):
            return None
        if OnboardingService._confidence_value(item) < min_confidence:
            return None
        value = item.get("value")
        if value is None:
            return None
        if isinstance(value, str):
            return value.strip() or None
        if isinstance(value, (int, float)):
            return str(value)
        return None

    @staticmethod
    def _structured_list(structured: dict, key: str) -> list[str]:
        item = structured.get(key)
        if not isinstance(item, dict):
            return []
        value = item.get("value")
        if isinstance(value, list):
            return [str(entry).strip() for entry in value if str(entry).strip()][:20]
        if isinstance(value, str):
            return [entry.strip() for entry in re.split(r"[,;\n|]+", value) if entry.strip()][:20]
        return []

    @staticmethod
    def _structured_money(structured: dict) -> tuple[float | None, str | None]:
        item = structured.get("commercial_value")
        if not isinstance(item, dict) or OnboardingService._confidence_value(item) < 30:
            return None, None
        raw_value = item.get("value")
        if raw_value in {None, ""}:
            return None, None
        try:
            value = float(str(raw_value).replace(",", "").replace("$", "").strip())
        except ValueError:
            return None, None
        raw_currency = str(item.get("currency") or "").strip().upper()
        currency = raw_currency[:3] if re.fullmatch(r"[A-Z]{3}", raw_currency[:3]) else None
        return value, currency

    @staticmethod
    def _structured_auto_renewal(renewal_terms: str | None) -> bool:
        return bool(renewal_terms and re.search(r"\b(auto|automatic|automatically|stand renewed|renewed automatically)\b", renewal_terms, re.IGNORECASE))

    @staticmethod
    def _confidence_value(item: dict | None) -> int:
        if not isinstance(item, dict):
            return 0
        try:
            confidence = float(item.get("confidence") or 0)
        except (TypeError, ValueError):
            return 0
        if 0 < confidence <= 1:
            confidence *= 100
        return max(0, min(100, round(confidence)))

    @staticmethod
    def _draft_confidence(structured: dict) -> int:
        required_keys = ["client_name", "commercial_value", "service_lines", "start_date", "end_date"]
        confidences = [OnboardingService._confidence_value(structured.get(key)) for key in required_keys if OnboardingService._confidence_value(structured.get(key)) > 0]
        if not confidences:
            return 92
        return max(45, min(96, round(sum(confidences) / len(confidences))))

    @staticmethod
    def _structured_commercial_summary(
        current_summary: str | None,
        commercial_value: float,
        currency: str,
        *,
        renewal_terms: str | None,
        notice_period: str | None,
    ) -> str | None:
        parts: list[str] = []
        if current_summary:
            parts.append(current_summary)
        elif commercial_value:
            parts.append(OnboardingService._commercial_summary_from_money(commercial_value, currency))
        if renewal_terms:
            parts.append(f"Renewal terms: {renewal_terms}")
        if notice_period:
            parts.append(f"Notice period: {notice_period}")
        return "\n\n".join(part for part in parts if part).strip() or None

    @staticmethod
    def _draft_field_citations(structured: dict) -> dict[str, dict]:
        mapping = {
            "account_name": "client_name",
            "commercial_value": "commercial_value",
            "start_date": "start_date",
            "end_date": "end_date",
            "renewal_terms": "renewal_terms",
            "notice_period_days": "notice_period",
            "service_lines": "service_lines",
            "service_context": "deliverables",
            "initial_notes": "risks",
        }
        citations: dict[str, dict] = {}
        for draft_key, structured_key in mapping.items():
            item = structured.get(structured_key)
            if not isinstance(item, dict):
                continue
            citation = item.get("citation")
            if isinstance(citation, dict) and citation.get("excerpt"):
                citations[draft_key] = citation
        return citations

    @staticmethod
    def _citation_summary(label: str, citation: dict | None) -> str | None:
        if not citation:
            return None
        document = citation.get("document") or "uploaded source document"
        page = citation.get("page")
        excerpt = re.sub(r"\s+", " ", str(citation.get("excerpt") or "")).strip()
        if not excerpt:
            return None
        page_label = f" p{page}" if page else ""
        return f"{document}{page_label}: {label} inferred from extracted source text: {excerpt[:500]}"

    @staticmethod
    def _structured_missing_evidence_notes(structured: dict) -> list[str]:
        review_relevant_keys = {"client_name", "commercial_value", "service_lines", "start_date", "end_date", "notice_period"}
        notes: list[str] = []
        for key, item in structured.items():
            if key not in review_relevant_keys:
                continue
            if not isinstance(item, dict):
                continue
            note = item.get("missing_evidence")
            value = item.get("value")
            if note and not OnboardingService._has_structured_value(value):
                notes.append(str(note)[:500])
        return notes

    @staticmethod
    def _has_structured_value(value) -> bool:
        return not (value is None or value == "" or value == () or (isinstance(value, list) and not value))

    @staticmethod
    def _parse_structured_date(value: str | None) -> datetime | None:
        if not value:
            return None
        value = value.strip()
        iso_match = re.search(r"\d{4}-\d{2}-\d{2}", value)
        if iso_match:
            return datetime.fromisoformat(iso_match.group(0)).replace(tzinfo=timezone.utc)
        us_match = re.search(r"\d{1,2}/\d{1,2}/\d{4}", value)
        if us_match:
            return OnboardingService._parse_us_date(us_match.group(0))
        return None

    @staticmethod
    def _structured_notice_days(value: str | None) -> int | None:
        if not value:
            return None
        days_match = re.search(r"(\d+)\s*days?", value, re.IGNORECASE)
        if days_match:
            return int(days_match.group(1))
        weeks_match = re.search(r"(\d+)\s*weeks?", value, re.IGNORECASE)
        if weeks_match:
            return int(weeks_match.group(1)) * 7
        word_weeks = re.search(r"\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b\s*(?:\(\d+\))?\s*weeks?", value, re.IGNORECASE)
        if not word_weeks:
            return None
        word_numbers = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}
        return word_numbers[word_weeks.group(1).lower()] * 7

    def _add_uploaded_engagement_draft(self, draft: OnboardingDraft, inferred: dict) -> None:
        start_date = inferred["start_date"] or self._default_engagement_start_date()
        self.onboarding.add_engagement_draft(
            OnboardingDraftEngagement(
                draft_id=draft.id,
                name=inferred["project_name"] or f"{draft.account_name} Engagement",
                owner_name=inferred["primary_owner_name"],
                service_lines=inferred["service_lines"],
                value=inferred["commercial_value"],
                currency=inferred["currency"],
                delivery_status=inferred["delivery_status"],
                start_date=start_date,
                end_date=inferred["end_date"],
                renewal_date=inferred["renewal_date"],
                notice_deadline=calculate_notice_deadline(inferred["renewal_date"], inferred["end_date"], inferred["notice_period_days"]),
                notice_period_days=inferred["notice_period_days"],
                auto_renewal=bool(inferred["auto_renewal"]),
                commercial_context=self._engagement_context(inferred),
                resource_dependency=inferred["resource_dependency"],
                risks=self._inferred_risks(inferred),
                source_citation=inferred["engagement_source_citation"],
                confidence=inferred["engagement_confidence"],
            )
        )

    @staticmethod
    def _inferred_delivery_status(start_date: datetime | None, end_date: datetime | None) -> str:
        now = datetime.now(timezone.utc)
        if start_date and start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date and end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        if not start_date:
            return "watch"
        if end_date and end_date < now:
            return "completed"
        if start_date > now:
            return "planned"
        return "active"

    @staticmethod
    def _default_engagement_start_date() -> datetime:
        return datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)

    def _apply_approval_defaults(self, draft: OnboardingDraft, actor: User) -> None:
        default_start_date = self._default_engagement_start_date()
        applied: list[dict[str, str]] = []
        for index, engagement in enumerate(draft.engagement_drafts):
            prefix = f"engagement_drafts.{index}"
            if not engagement.name:
                engagement.name = draft.project_name or f"{draft.account_name} Engagement"
                applied.append({"field": f"{prefix}.name", "value": engagement.name})
            if not engagement.service_lines:
                engagement.service_lines = ["Account onboarding"]
                applied.append({"field": f"{prefix}.service_lines", "value": "Account onboarding"})
            if not engagement.delivery_status:
                engagement.delivery_status = self._inferred_delivery_status(engagement.start_date, engagement.end_date)
                applied.append({"field": f"{prefix}.delivery_status", "value": engagement.delivery_status})
            if not engagement.start_date:
                engagement.start_date = default_start_date
                applied.append({"field": f"{prefix}.start_date", "value": engagement.start_date.isoformat()})
            if engagement.renewal_date is None and engagement.end_date is not None:
                engagement.renewal_date = engagement.end_date
                applied.append({"field": f"{prefix}.renewal_date", "value": engagement.renewal_date.isoformat()})
            engagement.notice_deadline = calculate_notice_deadline(engagement.renewal_date, engagement.end_date, engagement.notice_period_days)
        if not applied:
            return
        self.audit.log(
            module="account_onboarding_workspace",
            action="draft_approval_defaults_applied",
            entity_type="onboarding_draft",
            entity_id=draft.id,
            actor=actor,
            after_value={"defaults": applied},
        )

    def _resource_dependency_from_risks(self, structured_risks: list[str], initial_notes: str | None) -> str | None:
        candidates = structured_risks or self._split_list(self._extract_label(initial_notes or "", ["Risks"]))
        dependency_items = [item for item in candidates if re.search(r"\b(dependency|dependent|access|input|approval|integration|data)\b", item, re.IGNORECASE)]
        if not dependency_items:
            return None
        return "; ".join(dependency_items[:5])[:1000]

    @staticmethod
    def _engagement_source_citation(field_citations: dict[str, dict], source_name: str) -> str:
        for label, field_key in (
            ("Renewal terms", "renewal_terms"),
            ("Commercial value", "commercial_value"),
            ("Service scope", "service_context"),
            ("Service lines", "service_lines"),
            ("End date", "end_date"),
            ("Start date", "start_date"),
        ):
            summary = OnboardingService._citation_summary(label, field_citations.get(field_key))
            if summary:
                return summary
        return f"{source_name}: engagement draft inferred from extracted SOW/charter text."

    @staticmethod
    def _engagement_confidence(structured: dict, *, fallback: int, missing_fields: list[str]) -> int:
        engagement_keys = ["commercial_value", "service_lines", "start_date", "end_date", "renewal_terms", "notice_period", "deliverables", "risks"]
        confidences = [OnboardingService._confidence_value(structured.get(key)) for key in engagement_keys if OnboardingService._confidence_value(structured.get(key)) > 0]
        confidence = round(sum(confidences) / len(confidences)) if confidences else fallback
        if any("Engagement" in field or "Commercial value" in field or "Service lines" in field for field in missing_fields):
            confidence = min(confidence, 74)
        return max(45, min(96, confidence))

    def _engagement_context(self, inferred: dict) -> str | None:
        parts = [inferred.get("commercial_summary"), inferred.get("service_context")]
        return "\n\n".join(str(part).strip() for part in parts if str(part or "").strip())[:3000] or None

    def _inferred_risks(self, inferred: dict) -> list[str]:
        structured_risks = self._structured_list(inferred.get("structured_extraction") or {}, "risks")
        if structured_risks:
            return structured_risks
        label_risks = self._split_list(self._extract_label(inferred["initial_notes"], ["Risks"]))
        return label_risks or ["KYC has not been completed yet"]

    def _find_duplicate_account(self, account_name: str | None, company_url: str | None) -> Account | None:
        duplicate_by_name = self.accounts.find_duplicate_by_name(account_name) if account_name else None
        if duplicate_by_name:
            return duplicate_by_name
        return self.accounts.find_duplicate_by_company_url(company_url)

    @staticmethod
    def _missing_fields_after_submitted_values(
        missing_fields: list[str],
        *,
        account_name: str | None,
        project_name: str | None,
        company_url: str | None,
    ) -> list[str]:
        filtered: list[str] = []
        for field in missing_fields:
            if account_name and "Account name was not found" in field:
                continue
            if project_name and "Project name was not found" in field:
                continue
            if company_url and "Company website was not found" in field:
                continue
            filtered.append(field)
        return filtered

    def _add_inferred_citations(self, document: SourceDocument, combined_text: str, inferred: dict) -> None:
        citations = [
            ("Account name", "account_name", inferred["account_name"]),
            ("Project name", "project_name", inferred["project_name"]),
            ("Service context", "service_context", inferred["service_context"]),
            ("Commercial summary", "commercial_summary", inferred["commercial_summary"]),
            ("Commercial value", "commercial_value", inferred["commercial_value"]),
            ("Start date", "start_date", inferred["start_date"]),
            ("End date", "end_date", inferred["end_date"]),
            ("Renewal terms", "renewal_terms", inferred.get("structured_extraction", {}).get("renewal_terms", {}).get("value")),
            ("Notice period", "notice_period_days", inferred["notice_period_days"]),
            ("Service lines", "service_lines", ", ".join(inferred["service_lines"])),
            ("Risks", "initial_notes", inferred["initial_notes"]),
        ]
        structured_citations = inferred.get("field_citations") or {}
        for label, field_key, value in citations:
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            structured_citation = structured_citations.get(field_key)
            if structured_citation and structured_citation.get("document_id") and structured_citation.get("document_id") != document.id:
                continue
            confidence = self._citation_confidence_for_draft_field(inferred, field_key)
            if structured_citation and structured_citation.get("excerpt"):
                page_number = structured_citation.get("page") or 1
                excerpt = str(structured_citation.get("excerpt") or "")[:1000]
                confidence = self._confidence_value({"confidence": structured_citation.get("confidence")}) or confidence
            else:
                page_number = 1
                excerpt = self._snippet_for_value(combined_text, str(value or "")) or f"{label} inferred from {document.file_name or document.title}."
            self.accounts.add_citation(
                SourceCitation(
                    source_document_id=document.id,
                    label=f"{document.title}: {label}",
                    page_number=page_number,
                    excerpt=excerpt[:1000],
                    field_key=field_key,
                    confidence=confidence,
                )
            )

    @staticmethod
    def _citation_confidence_for_draft_field(inferred: dict, field_key: str) -> int:
        structured_key_by_field = {
            "account_name": "client_name",
            "commercial_summary": "commercial_value",
            "commercial_value": "commercial_value",
            "start_date": "start_date",
            "end_date": "end_date",
            "renewal_terms": "renewal_terms",
            "notice_period_days": "notice_period",
            "service_lines": "service_lines",
            "service_context": "deliverables",
            "project_name": "client_name",
            "initial_notes": "risks",
        }
        structured = inferred.get("structured_extraction") or {}
        confidence = OnboardingService._confidence_value(structured.get(structured_key_by_field.get(field_key, "")))
        if confidence:
            return confidence
        return int(inferred.get("confidence") or 75)

    @staticmethod
    def _title_from_file(file_name: str) -> str:
        return Path(file_name).stem.replace("_", " ").replace("-", " ").strip()[:220] or "Uploaded source document"

    @staticmethod
    def _source_type_from_file(file_name: str) -> str:
        lower = file_name.lower()
        if "sow" in lower or "statement" in lower:
            return "sow"
        if "charter" in lower:
            return "project_charter"
        if "commercial" in lower or "pricing" in lower or "billing" in lower:
            return "commercial_note"
        return "attachment"

    @staticmethod
    def _extract_customer_from_legal_intro(text: str) -> str | None:
        patterns = [
            r"(?is)by\s+and\s+between\s+(.+?)\s*\([\"“']?\s*Customer\s*[\"”']?",
            r"(?is)between\s+(.+?)\s+and\s+TkXel\s+LLC",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if not match:
                continue
            value = re.sub(r"\s+", " ", match.group(1)).strip(" ,.;")
            if value:
                return value[:180]
        return None

    @staticmethod
    def _extract_sow_heading(text: str) -> str | None:
        lines = OnboardingService._content_lines(text)
        if not lines:
            return None
        for index, line in enumerate(lines[:8]):
            if "statement of work" not in line.lower():
                continue
            suffix = lines[index + 1].strip() if index + 1 < len(lines) else ""
            if suffix and not suffix.lower().startswith("this statement"):
                return f"{line} - {suffix}"[:180]
            return line[:180]
        return None

    @staticmethod
    def _extract_project_from_sow_heading(text: str, account_name: str | None) -> str | None:
        lines = OnboardingService._content_lines(text)
        normalized_account = re.sub(r"\s+", " ", account_name or "").strip().lower()
        for index, line in enumerate(lines[:12]):
            if line.lower().startswith("this statement"):
                continue
            match = re.search(r"(?i)\bstatement\s+of\s+work\b|\bsow\b", line)
            if not match:
                continue
            before_title = re.sub(r"\s+", " ", line[: match.start()]).strip(" -|:")
            title_mentions_account = bool(normalized_account and normalized_account in line.lower())
            if not title_mentions_account and not OnboardingService._looks_like_customer_name(before_title):
                continue
            trailing_title = line[match.end() :].strip(" -|:")
            candidate = OnboardingService._clean_project_title(trailing_title, account_name)
            if candidate:
                return candidate
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            candidate = OnboardingService._clean_project_title(next_line, account_name)
            if candidate:
                return candidate
        return None

    @staticmethod
    def _clean_project_title(value: str | None, account_name: str | None) -> str | None:
        cleaned = re.sub(r"\s+", " ", value or "").strip(" -|,.;:")
        if not cleaned:
            return None
        if account_name:
            cleaned = re.sub(rf"(?i)^{re.escape(account_name.strip())}\s*(?:[-|:]|\s+-\s+)\s*", "", cleaned).strip(" -|,.;:")
        cleaned = re.sub(r"(?i)\bstatement\s+of\s+work\b|\bsow\b", "", cleaned).strip(" -|,.;:")
        cleaned = re.sub(r"(?i)\s+\bprepared\s+(?:by|from)\s+tkxel\b.*$", "", cleaned).strip(" -|,.;:")
        if not OnboardingService._meaningful_project_title(cleaned):
            return None
        return cleaned[:180]

    @staticmethod
    def _meaningful_project_title(value: str) -> bool:
        cleaned = re.sub(r"\s+", " ", value or "").strip()
        if len(cleaned) < 3 or not re.search(r"[A-Za-z]", cleaned):
            return False
        lower = cleaned.lower()
        if lower in {"statement of work", "sow", "project", "source document"}:
            return False
        return not re.match(
            r"(?i)^(source|\[sheet|this statement|company url|website|linkedin|client|customer|account name|start date|end date|service lines|contract value|sow value)\b",
            cleaned,
        )

    @staticmethod
    def _looks_like_customer_name(value: str | None) -> bool:
        cleaned = re.sub(r"\s+", " ", value or "").strip(" -|,.;:")
        if len(cleaned) < 2 or not re.search(r"[A-Za-z]", cleaned):
            return False
        lower = cleaned.lower()
        if lower == "this":
            return False
        return not any(
            marker in lower
            for marker in (
                "statement of work",
                "prepared",
                "project",
                "baseline",
                "scope",
                "contract",
                "agreement",
                "dedicated",
                "team",
            )
        )

    @staticmethod
    def _content_lines(text: str) -> list[str]:
        lines: list[str] = []
        for line in text.splitlines():
            cleaned = re.sub(r"\s+", " ", line or "").strip()
            if not cleaned or cleaned.lower().startswith("source:") or cleaned.startswith("["):
                continue
            lines.append(cleaned)
        return lines

    @staticmethod
    def _extract_region_from_legal_intro(text: str) -> str | None:
        match = re.search(r"(?is)principal place of business at .{0,220}?(United States|USA|Canada|United Kingdom|Europe|North America)", text)
        return match.group(1) if match else None

    @staticmethod
    def _extract_label(text: str, labels: list[str]) -> str | None:
        for label in labels:
            for line in text.splitlines():
                value = OnboardingService._extract_label_from_pipe_cells(line, label)
                if value:
                    return value[:1000]
            pattern = rf"(?im)^\s*{re.escape(label)}\s*(?:[:]|(?:\s+-\s+))\s*(.+?)\s*$"
            match = re.search(pattern, text)
            if match:
                value = OnboardingService._clean_label_value(match.group(1))
                if value:
                    return value[:1000]
        return None

    @staticmethod
    def _extract_labeled_summary(text: str, labels: list[str], *, max_chars: int) -> str | None:
        parts: list[str] = []
        seen: set[str] = set()
        for label in labels:
            value = OnboardingService._extract_label(text, [label])
            if not value:
                continue
            normalized = f"{label.lower()}:{value.lower()}"
            if normalized in seen:
                continue
            seen.add(normalized)
            parts.append(f"{label}: {value}")
        summary = "\n".join(parts).strip()
        return summary[:max_chars] if summary else None

    @staticmethod
    def _extract_label_from_pipe_cells(line: str, label: str) -> str | None:
        cells = [cell.strip() for cell in line.split("|")]
        if len(cells) <= 1:
            return None
        normalized_label = re.sub(r"\s+", " ", label).strip().lower()
        for index, cell in enumerate(cells):
            inline = re.match(rf"(?i)^\s*{re.escape(label)}\s*:\s*(.+?)\s*$", cell)
            if inline:
                return OnboardingService._clean_label_value(inline.group(1))
            normalized_cell = re.sub(r"\s+", " ", cell).strip().rstrip(":").lower()
            if normalized_cell == normalized_label:
                for value_cell in cells[index + 1 :]:
                    value = OnboardingService._clean_label_value(value_cell)
                    if value:
                        return value
        return None

    @staticmethod
    def _clean_label_value(value: str | None) -> str | None:
        cleaned = re.sub(r"\s+", " ", value or "").strip(" |")
        return cleaned or None

    @staticmethod
    def _extract_section(text: str, headings: list[str], *, max_chars: int) -> str | None:
        if not text.strip():
            return None
        for heading in headings:
            pattern = rf"(?is)(?:^|\n)\s*{re.escape(heading)}\s*[:\n-]\s*(.+?)(?=\n\s*[A-Z][A-Za-z0-9 /&(),.-]{{2,70}}\s*[:\n-]|\Z)"
            match = re.search(pattern, text)
            if match:
                value = re.sub(r"\n{3,}", "\n\n", match.group(1).strip())
                if value:
                    return value[:max_chars]
        return None

    @staticmethod
    def _split_list(value: str | None) -> list[str]:
        if not value:
            return []
        return [item.strip(" .") for item in re.split(r"[,;\n|]+", value) if item.strip(" .")][:12]

    @staticmethod
    def _infer_service_lines(text: str) -> list[str]:
        return infer_service_lines_from_text(text)

    @staticmethod
    def _extract_charter_risks(text: str) -> str | None:
        risk_lines: list[str] = []
        in_risk_sheet = False
        header_cells = {"risk", "risk statement", "risks", "mitigation", "mitigation plan", "owner", "impact"}
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.lower().startswith("[sheet:"):
                in_risk_sheet = "risk" in line.lower()
                continue
            if not in_risk_sheet:
                continue
            cells = [cell.strip() for cell in line.split("|") if cell.strip()]
            if not cells:
                continue
            first_cell = cells[0].strip().lower()
            if first_cell in header_cells:
                continue
            meaningful_cells = [cell for cell in cells if cell.strip().lower() not in header_cells]
            if not meaningful_cells:
                continue
            risk = meaningful_cells[0]
            mitigation = meaningful_cells[1] if len(meaningful_cells) > 1 else ""
            risk_lines.append(f"- {risk}{f' - Mitigation: {mitigation}' if mitigation else ''}")
        if not risk_lines:
            return None
        return "Risks:\n" + "\n".join(risk_lines[:12])

    @staticmethod
    def _extract_money(text: str) -> tuple[float, str]:
        raw = OnboardingService._extract_label(text, ["Contract Value", "SOW Value", "Commercial Value", "Estimated Budget", "Budget", "Fees", "Total monthly fee", "Applicable monthly fee", "Monthly fee"])
        if raw:
            money_match = re.search(r"(?i)\b([A-Z]{3})?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\b", raw)
            if money_match:
                currency = (money_match.group(1) or money_match.group(3) or "USD").upper()
                return float(money_match.group(2).replace(",", "")), currency[:3]
        patterns = [
            r"(?im)^\s*(?:Contract Value|SOW Value|Commercial Value|Estimated Budget|Budget|Fees|Total monthly fee|Applicable monthly fee|Monthly fee)\s*(?:[:|]|\s+-\s+)\s*(?:([A-Z]{3})\s*)?\$?\s*([\d,]+(?:\.\d+)?)",
            r"(?im)^\s*(?:Contract Value|SOW Value|Commercial Value|Estimated Budget|Budget|Fees|Total monthly fee|Applicable monthly fee|Monthly fee)\s*(?:[:|]|\s+-\s+)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if not match:
                continue
            groups = [group for group in match.groups() if group]
            currency = next((group for group in groups if re.fullmatch(r"[A-Z]{3}", group)), "USD")
            amount = next((group for group in groups if re.search(r"\d", group) and not re.fullmatch(r"[A-Z]{3}", group)), "0")
            return float(amount.replace(",", "")), currency
        currency = OnboardingService._extract_label(text, ["Currency"]) or "USD"
        return 0.0, currency[:3].upper()

    @staticmethod
    def _extract_date(text: str, labels: list[str]) -> datetime | None:
        raw = OnboardingService._extract_label(text, labels)
        if not raw:
            return None
        match = re.search(r"\d{4}-\d{2}-\d{2}", raw)
        if match:
            return datetime.fromisoformat(match.group(0)).replace(tzinfo=timezone.utc)
        us_match = re.search(r"\d{1,2}/\d{1,2}/\d{4}", raw)
        if us_match:
            return OnboardingService._parse_us_date(us_match.group(0))
        return OnboardingService._parse_excel_serial_date(raw)

    @staticmethod
    def _extract_timeframe_sentence_dates(text: str) -> tuple[datetime | None, datetime | None]:
        match = re.search(r"(?is)start\s+date\s+of\s+engagement\s+is\s+(\d{1,2}/\d{1,2}/\d{4})\s+(?:till|until|through|to)\s+(\d{1,2}/\d{1,2}/\d{4})", text)
        if not match:
            return None, None
        return OnboardingService._parse_us_date(match.group(1)), OnboardingService._parse_us_date(match.group(2))

    @staticmethod
    def _parse_us_date(value: str) -> datetime | None:
        try:
            month, day, year = [int(part) for part in value.split("/")]
            return datetime(year, month, day, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_excel_serial_date(value: str) -> datetime | None:
        match = re.search(r"\b(\d{4,6})(?:\.0+)?\b", value)
        if not match:
            return None
        try:
            serial = int(match.group(1))
        except (TypeError, ValueError):
            return None
        if serial < 20000 or serial > 80000:
            return None
        return datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=serial)

    @staticmethod
    def _extract_notice_period(text: str) -> int | None:
        raw = OnboardingService._extract_label(text, ["Notice Period", "Renewal Notice Period", "Termination Notice"])
        if not raw:
            return None
        match = re.search(r"\d+", raw)
        return int(match.group(0)) if match else None

    @staticmethod
    def _extract_renewal_notice_days(text: str) -> int | None:
        match = re.search(r"(?is)(\w+|\d+)\s*\(?\d*\)?\s+weeks?\s+prior\s+to\s+expiry", text)
        if not match:
            return None
        raw = match.group(1).lower()
        word_numbers = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
            "twelve": 12,
        }
        weeks = int(raw) if raw.isdigit() else word_numbers.get(raw)
        return weeks * 7 if weeks else None

    @staticmethod
    def _extract_bool(text: str, labels: list[str]) -> bool:
        raw = OnboardingService._extract_label(text, labels)
        return bool(raw and raw.strip().lower() in {"yes", "true", "enabled", "automatic"})

    @staticmethod
    def _clean_short(value: str | None, *, default: str) -> str:
        cleaned = re.sub(r"\s+", " ", value or "").strip()
        return (cleaned or default)[:180]

    @staticmethod
    def _normalize_url(value: str | None) -> str | None:
        if not value:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if not cleaned.startswith(("http://", "https://")):
            cleaned = f"https://{cleaned}"
        return cleaned[:500]

    @staticmethod
    def _extract_linkedin_url(text: str) -> str | None:
        match = re.search(r"https?://(?:www\.)?linkedin\.com/company/[^\s<>)\"']+", text, re.IGNORECASE)
        return match.group(0).rstrip(".,;") if match else None

    @staticmethod
    def _normalize_linkedin_url(value: str | None) -> str | None:
        normalized = OnboardingService._normalize_url(value)
        if not normalized:
            return None
        try:
            return validate_linkedin_url(normalized)
        except ValueError:
            return None

    @staticmethod
    def _summarize_text(text: str, fallback: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        return cleaned[:1600] if cleaned else fallback

    @staticmethod
    def _commercial_summary_from_money(value: float, currency: str) -> str:
        if value:
            return f"Commercial value extracted from the uploaded source document: {currency} {value:,.2f}."
        return "Commercial value, billing terms, and payment terms were not clearly found in the uploaded source document."

    @staticmethod
    def _snippet_for_value(text: str, value: str) -> str | None:
        if not text.strip() or not value.strip():
            return None
        needle = value.strip()[:80]
        index = text.lower().find(needle.lower())
        if index < 0:
            return None
        start = max(index - 160, 0)
        end = min(index + len(needle) + 260, len(text))
        return re.sub(r"\s+", " ", text[start:end]).strip()

    @staticmethod
    def _stored_file_path(document: SourceDocument) -> Path | None:
        if not document.storage_path:
            return None
        path = Path(document.storage_path)
        if path.is_absolute():
            return path
        return Path(ContentStorageService().settings.local_content_storage_dir) / path

    @staticmethod
    def _account_import_audit_value(account: Account) -> dict:
        return {
            "name": account.name,
            "project_name": account.project_name,
            "lifecycle_status": account.lifecycle_status,
            "segment": account.segment,
            "region": account.region,
            "commercial_value": float(account.commercial_value),
            "currency": account.currency,
        }

    @staticmethod
    def _normalize_csv_lifecycle(value: str | None) -> str:
        if not value:
            return "Onboarding"
        normalized = {
            "adoption": "Active",
            "expansion": "Expansion Focus",
            "renewal": "Renewal Focus",
            "at_risk": "At Risk",
            "at risk": "At Risk",
        }.get(value.strip().lower())
        return normalized or value.strip()

    @staticmethod
    def _first_present(*values):
        return next((value for value in values if value not in {None, ""}), None)

    @staticmethod
    def _clean(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _notify_draft_created(self, draft: OnboardingDraft, current_user: User) -> None:
        recipients = self._draft_creation_recipients(draft, exclude_user_id=current_user.id)
        trigger = "account_duplicate_detected" if draft.duplicate_account_id else "account_draft_created"
        title = f"Draft account ready: {draft.account_name}"
        body = f"{current_user.full_name} created a draft account that needs approval."
        if draft.duplicate_account_id:
            body = f"{current_user.full_name} created a draft account with a possible duplicate. Review before approval."
        for recipient in recipients:
            self.notifications.queue_notification(
                recipient=recipient,
                trigger=trigger,
                title=title,
                body=body,
                source_record_type="onboarding_draft",
                source_record_id=draft.id,
                source_record_route=f"/accounts/onboarding?draft={draft.id}",
                priority="high",
                delivery_metadata={"draft_id": draft.id, "created_by_id": current_user.id},
                deduplication_key=f"{trigger}:{draft.id}:{recipient.id}",
                in_app_only=True,
            )

    def _notify_draft_updated(self, draft: OnboardingDraft, actor: User, changed_labels: list[str]) -> None:
        recipients = self._draft_update_recipients(draft, exclude_user_id=actor.id)
        fields = ", ".join(changed_labels[:6])
        suffix = " and more" if len(changed_labels) > 6 else ""
        body = f"{actor.full_name} saved changes to {fields}{suffix}."
        notification_run = datetime.now(timezone.utc).isoformat()
        for recipient in recipients:
            self.notifications.queue_notification(
                recipient=recipient,
                trigger="account_draft_updated",
                title=f"Draft updated: {draft.account_name}",
                body=body,
                source_record_type="onboarding_draft",
                source_record_id=draft.id,
                source_record_route=f"/accounts/onboarding?draft={draft.id}",
                priority="medium",
                delivery_metadata={"draft_id": draft.id, "actor_id": actor.id, "changed_fields": changed_labels},
                deduplication_key=f"account_draft_updated:{draft.id}:{recipient.id}:{notification_run}",
                in_app_only=True,
            )

    def _notify_account_onboarded(self, draft: OnboardingDraft, account: Account, actor: User) -> None:
        owner_recipient_ids = {recipient.id for recipient in self._draft_owner_recipients(draft, exclude_user_id=actor.id)}
        recipients = [recipient for recipient in self._kam_head_recipients(exclude_user_id=actor.id) if recipient.id not in owner_recipient_ids]
        for recipient in recipients:
            self.notifications.queue_notification(
                recipient=recipient,
                trigger="account_draft_approved",
                title=f"New account onboarded: {account.name}",
                body=f"{actor.full_name} approved {account.name}; the account is now onboarded.",
                account=account,
                source_record_type="account",
                source_record_id=account.id,
                source_record_route=f"/accounts/{account.id}",
                priority="medium",
                delivery_metadata={"draft_id": draft.id, "actor_id": actor.id, "approved_account_id": account.id},
                deduplication_key=f"account_onboarded:{draft.id}:{account.id}:{recipient.id}",
                in_app_only=True,
            )

    def _notify_draft_outcome(self, draft: OnboardingDraft, actor: User, trigger: str, title: str, body: str, *, account_id: str | None = None) -> None:
        recipients = self._draft_owner_recipients(draft, exclude_user_id=actor.id)
        account = self.accounts.get_by_id(account_id) if account_id else None
        for recipient in recipients:
            self.notifications.queue_notification(
                recipient=recipient,
                trigger=trigger,
                title=title,
                body=body,
                account=account,
                source_record_type="onboarding_draft",
                source_record_id=draft.id,
                source_record_route=f"/accounts/onboarding?draft={draft.id}",
                priority="high" if trigger == "account_draft_rejected" else "medium",
                delivery_metadata={"draft_id": draft.id, "actor_id": actor.id, "approved_account_id": account_id},
                deduplication_key=f"{trigger}:{draft.id}:{recipient.id}",
                in_app_only=True,
            )

    def _notify_uploaded_source_status(self, draft: OnboardingDraft, document: SourceDocument, current_user: User) -> None:
        recipients = [current_user, *self._draft_approvers(exclude_user_id=current_user.id)]
        if document.extraction_status in {"failed", "error"}:
            self.in_app_notifications.queue_many(
                recipients,
                trigger="source_document_failed",
                title=f"Source extraction failed: {document.title}",
                body=document.extraction_error or "A draft source document could not be extracted.",
                source_record_type="source_document",
                source_record_id=document.id,
                source_record_route=f"/accounts/onboarding?draft={draft.id}",
                priority="high",
                dedupe_scope=f"failed:{document.updated_at.isoformat() if document.updated_at else document.id}",
            )
            return
        if document.extraction_status in {"needs_review", "ocr_required"} or (document.confidence is not None and document.confidence < 70):
            self.in_app_notifications.queue_many(
                recipients,
                trigger="source_document_low_confidence",
                title=f"Source needs review: {document.title}",
                body="A draft source document needs review before approval or KYC reuse.",
                source_record_type="source_document",
                source_record_id=document.id,
                source_record_route=f"/accounts/onboarding?draft={draft.id}",
                priority="medium",
                dedupe_scope=f"review:{document.updated_at.isoformat() if document.updated_at else document.id}",
            )

    def _draft_creation_recipients(self, draft: OnboardingDraft, *, exclude_user_id: str | None = None) -> list[User]:
        return self._unique_users(
            [
                *self._draft_owner_recipients(draft, exclude_user_id=exclude_user_id),
                *self._kam_head_recipients(exclude_user_id=exclude_user_id),
            ],
            exclude_user_id=exclude_user_id,
        )

    def _draft_update_recipients(self, draft: OnboardingDraft, *, exclude_user_id: str | None = None) -> list[User]:
        return self._unique_users(
            [
                *self._draft_assigned_owner_recipients(draft, exclude_user_id=exclude_user_id),
                *self._kam_head_recipients(exclude_user_id=exclude_user_id),
            ],
            exclude_user_id=exclude_user_id,
        )

    def _kam_head_recipients(self, *, exclude_user_id: str | None = None) -> list[User]:
        users = [user for user in self.accounts.list_active_users() if user.role == "kam_head"]
        return self._unique_users(users, exclude_user_id=exclude_user_id)

    def _draft_approvers(self, *, exclude_user_id: str | None = None) -> list[User]:
        users = [
            user
            for user in self.notifications.active_users_with_any_permission({"onboarding:approve_draft"})
            if self.access.has_any_permission(user, {"onboarding:view_all"})
        ]
        return self._unique_users(users, exclude_user_id=exclude_user_id)

    def _draft_owner_recipients(self, draft: OnboardingDraft, *, exclude_user_id: str | None = None) -> list[User]:
        candidates = [
            self._get_user_if_active(draft.created_by_id),
            self._get_user_if_active(draft.primary_owner_id),
            self.accounts.get_user_by_email(draft.primary_owner_email) if draft.primary_owner_email else None,
        ]
        return self._unique_users([user for user in candidates if user is not None], exclude_user_id=exclude_user_id)

    def _draft_assigned_owner_recipients(self, draft: OnboardingDraft, *, exclude_user_id: str | None = None) -> list[User]:
        candidates = [
            self._get_user_if_active(draft.primary_owner_id),
            self.accounts.get_user_by_email(draft.primary_owner_email) if draft.primary_owner_email else None,
        ]
        return self._unique_users([user for user in candidates if user is not None], exclude_user_id=exclude_user_id)

    @staticmethod
    def _unique_users(users: list[User], *, exclude_user_id: str | None = None) -> list[User]:
        seen: set[str] = set()
        unique: list[User] = []
        for user in users:
            if user.id == exclude_user_id or user.id in seen:
                continue
            seen.add(user.id)
            unique.append(user)
        return unique

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
        if not draft.engagement_drafts:
            return [{"field": "engagement_drafts", "message": "At least one engagement is required before approval."}]
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

    def _resolve_owner_from_payload(self, payload: OnboardingDraftCreateRequest, current_user: User) -> User | None:
        owner = self._resolve_owner_from_values(payload.primary_owner_id, str(payload.primary_owner_email) if payload.primary_owner_email else None)
        if owner:
            return owner
        if self._is_primary_am_eligible(current_user):
            return current_user
        return None

    def _resolve_primary_owner_for_approval(self, draft: OnboardingDraft) -> User:
        owner = self._resolve_owner_from_values(draft.primary_owner_id, draft.primary_owner_email)
        if owner is None:
            self._raise_owner_validation("Assign an account manager before approving this draft.")
        draft.primary_owner_id = owner.id
        draft.primary_owner_name = owner.full_name
        draft.primary_owner_email = owner.email
        return owner

    def _resolve_owner_from_values(self, owner_id: str | None, owner_email: str | None) -> User | None:
        if owner_id:
            return self._get_active_account_manager(owner_id, "primary_owner_id")
        if owner_email:
            user = self.accounts.get_user_by_email(owner_email)
            if user is None or not user.is_active:
                self._raise_owner_validation("Selected account manager is inactive or does not exist.", "primary_owner_email")
            if not self._is_primary_am_eligible(user):
                self._raise_owner_validation("Selected owner must be an Account Manager.", "primary_owner_email")
            return user
        return None

    def _get_user_if_active(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        user = self.accounts.get_user(user_id)
        return user if user and user.is_active else None

    def _get_active_account_manager(self, user_id: str, field: str = "primary_owner_id") -> User:
        user = self._get_user_if_active(user_id)
        if user is None:
            self._raise_owner_validation("Selected account manager is inactive or does not exist.", field)
        if not self._is_primary_am_eligible(user):
            self._raise_owner_validation("Selected owner must be an Account Manager.", field)
        return user

    def _is_primary_am_eligible(self, user: User) -> bool:
        return (
            self.access.has_any_permission(user, {"accounts:update_profile_assigned"})
            and self.access.has_any_permission(user, {"onboarding:create_draft"})
            and not self.access.can_view_portfolio(user)
            and not self.access.can_assign_account_owners(user)
        )

    @staticmethod
    def _raise_owner_validation(message: str, field: str = "primary_owner_id") -> None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]},
        )

    def _draft_visibility_filter(self, current_user: User) -> tuple[str | None, str | None]:
        if self.access.has_any_permission(current_user, {"onboarding:view_all"}):
            return None, None
        return current_user.id, current_user.email

    def _ensure_draft_visible(self, draft: OnboardingDraft, current_user: User) -> None:
        if self.access.has_any_permission(current_user, {"onboarding:view_all"}):
            return
        if draft.created_by_id == current_user.id:
            return
        if draft.primary_owner_id == current_user.id:
            return
        if draft.primary_owner_email and draft.primary_owner_email.strip().lower() == current_user.email.strip().lower():
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this onboarding draft")

    def _ensure_owner_selection_allowed(self, current_user: User, owner: User | None, draft: OnboardingDraft | None = None) -> None:
        if owner is None:
            if self.access.can_assign_account_owners(current_user):
                return
            if draft is None:
                return
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to clear account manager assignment")
        if self.access.can_assign_account_owners(current_user):
            return
        if self._is_primary_am_eligible(current_user) and owner.id == current_user.id and (
            draft is None or draft.created_by_id == current_user.id or self._draft_assigned_to_user(draft, current_user)
        ):
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to assign onboarding drafts to other account managers")

    @staticmethod
    def _draft_assigned_to_user(draft: OnboardingDraft, user: User) -> bool:
        if draft.primary_owner_id == user.id:
            return True
        return bool(draft.primary_owner_email and draft.primary_owner_email.strip().lower() == user.email.strip().lower())

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
                        confidence=citation_payload.confidence,
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
                    start_date=payload.start_date or self._default_engagement_start_date(),
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

    def _create_primary_owner(
        self,
        account: Account,
        owner_user: User,
        current_user: User,
        *,
        rationale: str = "Primary Account Manager assigned during onboarding approval.",
        source: str = "onboarding_approval",
    ) -> AccountOwner:
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
                source=source,
            )
        )
        return owner

    def _create_engagement(self, account: Account, draft: OnboardingDraftEngagement, primary_owner: User, current_user: User) -> Engagement:
        owner = self._get_user_if_active(draft.owner_id) or primary_owner
        ops_lead = self._get_user_if_active(draft.ops_lead_id)
        self.account_service._ensure_owner_is_eligible(owner, "primary_am")
        engagement = Engagement(
            account_id=account.id,
            name=draft.name,
            status="draft",
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
        return engagement

    @staticmethod
    def _link_source_documents_to_created_engagements(draft: OnboardingDraft, engagements: list[Engagement]) -> None:
        if len(engagements) != 1:
            return
        engagement = engagements[0]
        for document in draft.source_documents:
            if document.source_type in {"sow", "project_charter", "commercial_note", "attachment"}:
                document.engagement_id = engagement.id

    def _create_default_stakeholder_from_approval(
        self,
        account: Account,
        draft: OnboardingDraft,
        actor: User,
        engagements: list[Engagement],
    ) -> None:
        if account.stakeholders:
            return
        structured = self._first_structured_sow_fields(draft)
        stakeholder_name = self._first_structured_stakeholder_name(structured) or "Client Executive Sponsor"
        stakeholder = Stakeholder(
            account_id=account.id,
            engagement_id=engagements[0].id if engagements else None,
            name=stakeholder_name,
            title="Executive Sponsor" if stakeholder_name == "Client Executive Sponsor" else None,
            company=account.name,
            role="executive_sponsor",
            influence="high",
            relationship_strength="unknown",
            sentiment="neutral",
            political_risk="unknown",
            status="active",
            notes=(
                "Automatically created from approved SOW onboarding. "
                "Review and replace with the named client sponsor when confirmed."
            ),
            is_sensitive=False,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        self.onboarding.db.add(stakeholder)
        self.onboarding.db.flush()
        self.audit.log(
            module="stakeholder_relationship",
            action="auto_create_from_onboarding",
            entity_type="stakeholder",
            entity_id=stakeholder.id,
            actor=actor,
            after_value={"account_id": account.id, "name": stakeholder.name, "role": stakeholder.role},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="stakeholder_added",
            module="stakeholder_relationship",
            title=f"Default stakeholder created: {stakeholder.name}",
            description="A default stakeholder was created from approved SOW onboarding for review.",
            actor=actor,
            source_record_id=stakeholder.id,
            source_record_type="stakeholder",
            source_record_route=f"/accounts/{account.id}?tab=stakeholders&stakeholder={stakeholder.id}",
            metadata={"source": "onboarding_approval", "draft_id": draft.id},
        )

    def _create_default_kyc_from_approval(self, account: Account, draft: OnboardingDraft, actor: User) -> None:
        kyc = KycService(self.onboarding.db)
        if kyc.kyc.latest_ready_draft(account.id) is not None or kyc.kyc.latest_snapshot(account.id) is not None:
            return
        source_documents = list(draft.source_documents)
        latest_snapshot = None
        fields = kyc._pending_fields(latest_snapshot)
        fields = kyc._prefill_fields_from_sources(account, fields, source_documents, actor, latest_snapshot)
        config = kyc._configuration()
        quality = kyc._quality(fields, source_documents, config)
        detailed = self._default_kyc_description_from_draft(account, draft)
        default_draft = KycDraft(
            account_id=account.id,
            trigger_source="onboarding_draft",
            previous_snapshot_id=None,
            source_document_ids=[document.id for document in source_documents],
            research_sources=list(DEFAULT_RESEARCH_SOURCES),
            fields_json=fields,
            citations_json=kyc._citations_from_fields(fields) or kyc._citations_from_documents(source_documents),
            missing_fields=quality["missing_fields"],
            conflicts=["Default KYC draft was source-prefilled during account approval. Run AI KYC before approval if deeper enrichment is required."],
            difference_summary=["Initial default KYC draft created from approved onboarding SOW."],
            source_context={
                "source_documents": [
                    {
                        "id": document.id,
                        "title": document.title,
                        "source_type": document.source_type,
                        "confidence": document.confidence,
                        "is_sensitive": document.is_sensitive,
                    }
                    for document in source_documents
                ],
                "trigger_source": "onboarding_draft",
                "provider": {"adapter": "source_prefill", "provider": "stored_sow"},
            },
            detailed_description=detailed,
            confidence=quality["confidence"],
            completeness=quality["completeness"],
            source_coverage=quality["source_coverage"],
            freshness_status="fresh",
            created_by_id=actor.id,
            created_by_name=actor.full_name,
            review_notes="Default KYC draft created automatically from approved onboarding. Run AI KYC for deeper enrichment before final approval.",
        )
        kyc.kyc.save_draft(default_draft)
        self.onboarding.db.flush()
        self.audit.log(
            module="kyc",
            action="default_draft_create_from_onboarding",
            entity_type="kyc_draft",
            entity_id=default_draft.id,
            actor=actor,
            after_value={"account_id": account.id, "source_document_ids": default_draft.source_document_ids, "completeness": default_draft.completeness},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_draft_created",
            module="kyc",
            title="Default KYC draft created",
            description="A default source-prefilled KYC draft was created after account onboarding approval.",
            actor=actor,
            source_record_id=default_draft.id,
            source_record_type="kyc_draft",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"draft_id": draft.id, "source": "onboarding_approval"},
        )

    def _default_kyc_description_from_draft(self, account: Account, draft: OnboardingDraft) -> str:
        document_sections: list[str] = []
        for document in draft.source_documents[:5]:
            excerpt = " ".join(str(document.extracted_text or "").split())[:2200]
            if excerpt:
                document_sections.append(f"<h4>{document.title}</h4><p>{excerpt}</p>")
        return (
            f"<h3>{account.name} default KYC draft</h3>"
            "<p>This draft was automatically created when the source-backed onboarding account was approved. "
            "It is not an approved KYC snapshot until capability-based review and approval.</p>"
            f"{''.join(document_sections)}"
        )

    @staticmethod
    def _first_structured_sow_fields(draft: OnboardingDraft) -> dict:
        for document in draft.source_documents:
            for extraction in sorted(document.extractions, key=lambda item: item.completed_at or item.created_at, reverse=True):
                metadata = dict(extraction.metadata_json or {})
                structured = metadata.get(STRUCTURED_SOW_METADATA_KEY)
                if isinstance(structured, dict) and isinstance(structured.get("fields"), dict):
                    return structured["fields"]
        return {}

    @staticmethod
    def _first_structured_stakeholder_name(structured: dict) -> str | None:
        item = structured.get("stakeholders") if isinstance(structured, dict) else None
        values = item.get("value") if isinstance(item, dict) else None
        if isinstance(values, list):
            for value in values:
                text = " ".join(str(value).split())
                if text:
                    return text[:180]
        if isinstance(values, str) and values.strip():
            return values.strip()[:180]
        return None

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
        active_engagements = [engagement for engagement in engagements if engagement.status == "active"]
        if not active_engagements:
            return
        notify_account_health_impacted_by_engagement_change(self.engagements, account=account, engagement=active_engagements[-1])

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
    def _official_lifecycle_for_draft(lifecycle_status: str) -> str:
        return "Onboarding" if lifecycle_status == "Draft" else lifecycle_status

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
    def _draft_update_notification_value(draft: OnboardingDraft) -> dict:
        return {
            "account_name": draft.account_name,
            "project_name": draft.project_name,
            "company_url": draft.company_url,
            "linkedin_url": draft.linkedin_url,
            "lifecycle_status": draft.lifecycle_status,
            "segment": draft.segment,
            "region": draft.region,
            "service_context": draft.service_context,
            "commercial_summary": draft.commercial_summary,
            "initial_notes": draft.initial_notes,
            "commercial_value": float(draft.commercial_value or 0),
            "currency": draft.currency,
            "primary_owner_id": draft.primary_owner_id,
            "primary_owner_name": draft.primary_owner_name,
            "primary_owner_email": draft.primary_owner_email,
        }

    @staticmethod
    def _draft_update_changed_labels(before: dict, after: dict) -> list[str]:
        labels_by_key = {
            "account_name": "account name",
            "project_name": "project name",
            "company_url": "company URL",
            "linkedin_url": "LinkedIn URL",
            "lifecycle_status": "lifecycle status",
            "segment": "segment",
            "region": "region",
            "service_context": "service context",
            "commercial_summary": "commercial summary",
            "initial_notes": "initial notes",
            "commercial_value": "commercial value",
            "currency": "currency",
        }
        changed = [label for key, label in labels_by_key.items() if before.get(key) != after.get(key)]
        owner_keys = ("primary_owner_id", "primary_owner_name", "primary_owner_email")
        if any(before.get(key) != after.get(key) for key in owner_keys):
            changed.append("assigned Account Manager")
        return changed

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
