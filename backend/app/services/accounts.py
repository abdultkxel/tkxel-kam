import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, AccountOwner, AccountOwnershipHistory, SourceCitation, SourceDocument, SourceDocumentChunk, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.kyc import KycRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    AccountOwnerCreateRequest,
    AccountOwnerRead,
    AccountOwnerUpdateRequest,
    AccountOwnershipHistoryRead,
    AccountOwnershipHistoryPageRead,
    AccountPageRead,
    AccountPermissionsRead,
    AccountRead,
    AccountStatusUpdateRequest,
    AccountSummaryCardsRead,
    HealthScoreRead,
    MessageResponse,
    SourceDocumentCreateRequest,
    SourceDocumentChunkPageRead,
    SourceDocumentChunkRead,
    SourceDocumentExtractionRead,
    SourceDocumentPageRead,
    SourceDocumentRead,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES
from app.services.audit import AuditService
from app.services.kyc_document_extraction import KycDocumentExtractionService
from app.services.source_document_contract import SENSITIVE_SOURCE_TYPES
from app.services.sow_extraction import SowExtractionService
from app.services.storage import ContentStorageService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

SOURCE_TYPES = {"project_charter", "sow", "attachment", "source_link", "commercial_note", "research", "manual_import"}


class AccountService:
    def __init__(self, db: Session) -> None:
        self.accounts = AccountRepository(db)
        self.kyc = KycRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_accounts(
        self,
        current_user: User,
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
        missing_current_kyc: bool | None = None,
        missing_engagements: bool | None = None,
        missing_next_governance: bool | None = None,
        sort: str = "name",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> AccountPageRead:
        self.access.require_module_permission(current_user, "account_overview", "view")
        if current_user.role in {"account_manager", "am"}:
            primary_am = current_user.id
        kyc_configuration = self.kyc.get_configuration()

        accounts, total = self.accounts.list_accounts(
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
            missing_current_kyc=missing_current_kyc,
            kyc_freshness_threshold_days=kyc_configuration.freshness_threshold_days if kyc_configuration else 90,
            missing_engagements=missing_engagements,
            missing_next_governance=missing_next_governance,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        visible = [account for account in accounts if self.access.can_view_account(current_user, account)]
        return AccountPageRead(
            items=[self._account_read(account) for account in visible],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def get_account(self, account_id: str, current_user: User) -> AccountRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        return self._account_read(account)

    def summary_cards(self, account_id: str, current_user: User) -> AccountSummaryCardsRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        return self._summary_cards(account)

    def permissions(self, account_id: str, current_user: User) -> AccountPermissionsRead:
        account = self._get_account_or_404(account_id)
        can_view = self.access.can_view_account(current_user, account)
        can_update = can_view and self.access.can_update_account(current_user, account)
        can_assign = current_user.role in GLOBAL_EDIT_ROLES
        return AccountPermissionsRead(
            can_view=can_view,
            can_update=can_update,
            can_delete=current_user.role in GLOBAL_EDIT_ROLES,
            can_approve=current_user.role in GLOBAL_EDIT_ROLES,
            can_assign=can_assign,
            can_manage_attachments=can_update,
            read_only=not can_update,
        )

    def update_status(self, account_id: str, payload: AccountStatusUpdateRequest, current_user: User) -> AccountRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account)
        before = {"lifecycle_status": account.lifecycle_status}
        account.lifecycle_status = payload.lifecycle_status
        account.archived_at = datetime.now(timezone.utc) if payload.lifecycle_status == "Archived" else None
        self.audit.log(
            module="account_onboarding_workspace",
            action="status_change",
            entity_type="account",
            entity_id=account.id,
            actor=current_user,
            before_value=before,
            after_value={"lifecycle_status": account.lifecycle_status},
            reason=payload.reason,
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="stage_change",
            module="stage",
            title=f"Stage: {before['lifecycle_status']} -> {account.lifecycle_status}",
            description=payload.reason,
            actor=current_user,
            before_value=before,
            after_value={"lifecycle_status": account.lifecycle_status},
            source_record_id=account.id,
            source_record_type="account",
            source_record_route=f"/accounts/{account.id}",
        )
        self.accounts.commit()
        return self._account_read(account)

    def list_owners(self, account_id: str, current_user: User) -> list[AccountOwnerRead]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        return [AccountOwnerRead.model_validate(owner) for owner in self.accounts.list_owners(account_id)]

    def add_owner(self, account_id: str, payload: AccountOwnerCreateRequest, current_user: User) -> AccountOwnerRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_assign(current_user, account)
        user = self._get_active_user(payload.user_id)
        self._ensure_owner_is_eligible(user, payload.ownership_role)
        existing_same = self.accounts.get_active_owner_for_role(account_id, payload.ownership_role, user.id)
        if existing_same:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This user already has that active ownership role")

        previous = None
        if payload.ownership_role == "primary_am":
            previous = self.accounts.get_active_primary_owner(account_id)
            if previous:
                previous.is_active = False
                previous.ended_at = datetime.now(timezone.utc)

        owner = AccountOwner(
            account_id=account_id,
            user_id=user.id,
            user_name=user.full_name,
            user_email=user.email,
            ownership_role=payload.ownership_role,
            is_primary=payload.ownership_role == "primary_am",
            rationale=payload.rationale,
            source_document_id=payload.source_document_id,
            created_by_id=current_user.id,
        )
        self.accounts.add_owner(owner)
        self._record_owner_history(account, owner, previous, user, current_user, payload.rationale, source="manual")
        self._log_owner_change(account, current_user, payload.rationale, previous, owner)
        self.accounts.commit()
        return AccountOwnerRead.model_validate(owner)

    def update_owner(self, account_id: str, owner_id: str, payload: AccountOwnerUpdateRequest, current_user: User) -> AccountOwnerRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_assign(current_user, account)
        owner = self._get_owner_for_account(owner_id, account_id)
        previous_owner_snapshot = {"user_id": owner.user_id, "user_name": owner.user_name, "ownership_role": owner.ownership_role, "is_active": owner.is_active}
        previous_for_history = owner
        new_user = None
        if payload.user_id and payload.user_id != owner.user_id:
            new_user = self._get_active_user(payload.user_id)
            self._ensure_owner_is_eligible(new_user, payload.ownership_role or owner.ownership_role)
            owner.user_id = new_user.id
            owner.user_name = new_user.full_name
            owner.user_email = new_user.email
        if payload.ownership_role:
            owner.ownership_role = payload.ownership_role
            owner.is_primary = payload.ownership_role == "primary_am"
        if payload.is_active is not None:
            owner.is_active = payload.is_active
            owner.ended_at = None if payload.is_active else datetime.now(timezone.utc)
        owner.rationale = payload.rationale
        self.accounts.add_owner_history(
            AccountOwnershipHistory(
                account_id=account_id,
                owner_record_id=owner.id,
                ownership_role=owner.ownership_role,
                previous_user_id=previous_owner_snapshot["user_id"],
                previous_user_name=previous_owner_snapshot["user_name"],
                new_user_id=owner.user_id,
                new_user_name=owner.user_name,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                rationale=payload.rationale,
                source="manual",
            )
        )
        self._log_owner_change(account, current_user, payload.rationale, previous_for_history, owner)
        self.accounts.commit()
        return AccountOwnerRead.model_validate(owner)

    def delete_owner(self, account_id: str, owner_id: str, current_user: User) -> MessageResponse:
        account = self._get_account_or_404(account_id)
        self.access.require_account_assign(current_user, account)
        owner = self._get_owner_for_account(owner_id, account_id)
        if owner.ownership_role == "primary_am" and account.lifecycle_status == "Active":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active accounts require one active primary Account Manager")
        owner.is_active = False
        owner.ended_at = datetime.now(timezone.utc)
        reason = "Owner removed"
        self.accounts.add_owner_history(
            AccountOwnershipHistory(
                account_id=account_id,
                owner_record_id=owner.id,
                ownership_role=owner.ownership_role,
                previous_user_id=owner.user_id,
                previous_user_name=owner.user_name,
                new_user_id=None,
                new_user_name=None,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                rationale=reason,
                source="manual",
            )
        )
        self._log_owner_change(account, current_user, reason, owner, None)
        self.accounts.commit()
        return MessageResponse(message="Owner removed successfully")

    def ownership_history(self, account_id: str, current_user: User, page: int, page_size: int) -> AccountOwnershipHistoryPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        items, total = self.accounts.list_owner_history(account_id, page, page_size)
        return AccountOwnershipHistoryPageRead(
            items=[AccountOwnershipHistoryRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def list_attachments(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        source_type: str | None = None,
        sensitivity: str | None = None,
        uploaded_from: datetime | None = None,
        uploaded_to: datetime | None = None,
        sort: str = "uploaded_date",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> SourceDocumentPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        items, total = self.accounts.list_attachments(
            account_id=account_id,
            search=search,
            source_type=source_type,
            sensitivity=sensitivity,
            uploaded_from=uploaded_from,
            uploaded_to=uploaded_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return SourceDocumentPageRead(items=[SourceDocumentRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def add_attachment(self, account_id: str, payload: SourceDocumentCreateRequest, current_user: User) -> SourceDocumentRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account)
        document = SourceDocument(
            account_id=account_id,
            title=payload.title,
            source_type=payload.source_type,
            file_name=payload.file_name,
            file_url=payload.file_url,
            link_url=payload.link_url,
            uploaded_by_id=current_user.id,
            uploaded_by_name=current_user.full_name,
            extraction_status=payload.extraction_status,
            confidence=payload.confidence,
            pages=payload.pages,
            is_sensitive=payload.is_sensitive,
        )
        self.accounts.add_attachment(document)
        for citation_payload in payload.citations:
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
        self.audit.log(
            module="account_onboarding_workspace",
            action="attachment_upload",
            entity_type="source_document",
            entity_id=document.id,
            actor=current_user,
            after_value={"title": document.title, "source_type": document.source_type},
        )
        self.timeline.add_account_event(
            account_id=account_id,
            title=f"Source uploaded: {document.title}",
            description=f"{document.source_type.replace('_', ' ')} source added to account.",
            actor=current_user,
            source_record_id=document.id,
            source_record_type="source_document",
            source_record_route=f"/accounts/{account_id}?tab=documents",
        )
        self.accounts.commit()
        return SourceDocumentRead.model_validate(document)

    async def upload_attachment(
        self,
        account_id: str,
        upload: UploadFile,
        current_user: User,
        *,
        title: str | None = None,
        source_type: str = "attachment",
        is_sensitive: bool = False,
        extract_now: bool = True,
    ) -> SourceDocumentRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account)
        if source_type not in SOURCE_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Source type is not supported for KYC extraction")
        stored = await ContentStorageService().save_upload(upload)
        checksum = self.file_checksum_for_upload(stored.file_path)
        duplicate = self.accounts.find_source_document_by_checksum(checksum, account_id=account_id) if checksum else None
        if duplicate:
            ContentStorageService().delete_stored_file(stored)
            raise self._duplicate_source_exception(duplicate, scope="account")
        document = SourceDocument(
            account_id=account_id,
            title=(title or stored.file_name).strip(),
            source_type=source_type,
            file_name=stored.file_name,
            storage_backend=stored.storage_backend,
            storage_path=stored.file_path,
            mime_type=stored.mime_type,
            size_bytes=stored.size_bytes,
            checksum_sha256=checksum,
            uploaded_by_id=current_user.id,
            uploaded_by_name=current_user.full_name,
            extraction_status="queued" if extract_now else "needs_review",
            confidence=0 if extract_now else 50,
            pages=0,
            is_sensitive=is_sensitive or source_type in SENSITIVE_SOURCE_TYPES,
        )
        self.accounts.add_attachment(document)
        self.audit.log(
            module="account_onboarding_workspace",
            action="attachment_upload",
            entity_type="source_document",
            entity_id=document.id,
            actor=current_user,
            after_value={
                "title": document.title,
                "source_type": document.source_type,
                "mime_type": document.mime_type,
                "size_bytes": document.size_bytes,
                "extract_now": extract_now,
            },
        )
        self.timeline.add_account_event(
            account_id=account_id,
            title=f"Source uploaded: {document.title}",
            description=f"{document.source_type.replace('_', ' ')} source uploaded for AI KYC extraction.",
            actor=current_user,
            source_record_id=document.id,
            source_record_type="source_document",
            source_record_route=f"/accounts/{account_id}?tab=documents",
        )
        if extract_now:
            extraction_service = KycDocumentExtractionService(self.accounts.db)
            extraction = extraction_service.extract_document(document, force=True)
            if extraction.status == "completed":
                extraction_service.chunk_document(document, extraction=extraction, force=True)
                if source_type in {"sow", "project_charter", "commercial_note"}:
                    SowExtractionService(self.accounts.db).extract_structured_fields(document, extraction)
            self.audit.log(
                module="kyc",
                action="source_extraction",
                entity_type="source_document",
                entity_id=document.id,
                actor=current_user,
                after_value={"extraction_status": document.extraction_status, "ocr_status": document.ocr_status, "pages": document.pages},
            )
        self.accounts.commit()
        return SourceDocumentRead.model_validate(document)

    def extract_attachment(self, account_id: str, attachment_id: str, current_user: User, *, force: bool = False) -> SourceDocumentExtractionRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account)
        document = self._get_attachment_for_account(account_id, attachment_id)
        if document.is_sensitive and current_user.role not in {*GLOBAL_EDIT_ROLES, "account_manager", "am"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot extract sensitive source documents")
        extraction_service = KycDocumentExtractionService(self.accounts.db)
        extraction = extraction_service.extract_document(document, force=force)
        if extraction.status == "completed":
            extraction_service.chunk_document(document, extraction=extraction, force=force)
        self.audit.log(
            module="kyc",
            action="source_extraction",
            entity_type="source_document",
            entity_id=document.id,
            actor=current_user,
            after_value={"extraction_status": document.extraction_status, "ocr_status": document.ocr_status, "pages": document.pages},
        )
        self.accounts.commit()
        return SourceDocumentExtractionRead.model_validate(extraction)

    def attachment_extraction(self, account_id: str, attachment_id: str, current_user: User) -> SourceDocumentExtractionRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        document = self._get_attachment_for_account(account_id, attachment_id)
        if document.is_sensitive and current_user.role not in {*GLOBAL_EDIT_ROLES, "account_manager", "am"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view extraction details for sensitive source documents")
        extraction = KycDocumentExtractionService(self.accounts.db).latest_extraction(attachment_id)
        if extraction is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction was not found for this attachment")
        return SourceDocumentExtractionRead.model_validate(extraction)

    def attachment_download_path(self, account_id: str, attachment_id: str, current_user: User) -> tuple[SourceDocument, Path]:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        document = self._get_attachment_for_account(account_id, attachment_id)
        if document.is_sensitive and current_user.role not in {*GLOBAL_EDIT_ROLES, "account_manager", "am"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot download sensitive source documents")
        path = self._stored_file_path(document)
        if path is None or not path.exists() or not path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored attachment file was not found")
        return document, path

    def attachment_chunks(
        self,
        account_id: str,
        attachment_id: str,
        current_user: User,
        *,
        page: int = 1,
        page_size: int = 25,
    ) -> SourceDocumentChunkPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account)
        document = self._get_attachment_for_account(account_id, attachment_id)
        if document.is_sensitive and current_user.role not in {*GLOBAL_EDIT_ROLES, "account_manager", "am"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view chunks for sensitive source documents")
        conditions = [SourceDocumentChunk.source_document_id == attachment_id]
        total = self.accounts.db.scalar(select(func.count(SourceDocumentChunk.id)).where(*conditions)) or 0
        items = list(
            self.accounts.db.scalars(
                select(SourceDocumentChunk)
                .where(*conditions)
                .order_by(SourceDocumentChunk.chunk_index)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return SourceDocumentChunkPageRead(
            items=[SourceDocumentChunkRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def delete_attachment(self, account_id: str, attachment_id: str, current_user: User) -> MessageResponse:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account)
        document = self.accounts.get_attachment(attachment_id)
        if document is None or document.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment was not found")
        if document.citations:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment has citations and cannot be deleted without removing citation references")
        self.audit.log(
            module="account_onboarding_workspace",
            action="attachment_delete",
            entity_type="source_document",
            entity_id=document.id,
            actor=current_user,
            before_value={"title": document.title, "source_type": document.source_type},
        )
        self.accounts.delete_attachment(document)
        self.accounts.commit()
        return MessageResponse(message="Attachment deleted successfully")

    def _get_attachment_for_account(self, account_id: str, attachment_id: str) -> SourceDocument:
        document = self.accounts.get_attachment(attachment_id)
        if document is None or document.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment was not found")
        return document

    def _stored_file_path(self, document: SourceDocument) -> Path | None:
        if not document.storage_path:
            return None
        path = Path(document.storage_path)
        if path.is_absolute():
            return path
        return Path(ContentStorageService().settings.local_content_storage_dir) / path

    @staticmethod
    def _file_checksum(path: str) -> str | None:
        try:
            return hashlib.sha256(Path(path).read_bytes()).hexdigest()
        except OSError:
            return None

    @staticmethod
    def file_checksum_for_upload(path: str) -> str | None:
        return AccountService._file_checksum(path)

    @staticmethod
    def _duplicate_source_exception(document: SourceDocument, *, scope: str) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This source file was already uploaded. Reuse the existing source document or upload a different file.",
                "duplicate_scope": scope,
                "existing_document_id": document.id,
                "existing_account_id": document.account_id,
                "existing_draft_id": document.draft_id,
                "existing_title": document.title,
                "existing_file_name": document.file_name,
                "checksum_sha256": document.checksum_sha256,
            },
        )

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_owner_for_account(self, owner_id: str, account_id: str) -> AccountOwner:
        owner = self.accounts.get_owner(owner_id)
        if owner is None or owner.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner assignment was not found")
        return owner

    def _get_active_user(self, user_id: str) -> User:
        user = self.accounts.get_user(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is inactive or unauthorized")
        return user

    @staticmethod
    def _ensure_owner_is_eligible(user: User, ownership_role: str) -> None:
        role_map = {
            "primary_am": {"account_manager", "am", "kam_head", "admin"},
            "supporting_am": {"account_manager", "am", "kam_head", "admin"},
            "ops_lead": {"ops_lead", "delivery_lead", "delivery_stakeholder", "admin", "kam_head"},
            "leadership_sponsor": {"leadership_viewer", "leadership", "kam_head", "admin"},
        }
        allowed = role_map.get(ownership_role, set())
        if user.role not in allowed and user.role != "super_admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected owner is not eligible for that ownership role")

    def _record_owner_history(self, account: Account, owner: AccountOwner, previous: AccountOwner | None, user: User, actor: User, rationale: str, source: str) -> None:
        self.accounts.add_owner_history(
            AccountOwnershipHistory(
                account_id=account.id,
                owner_record_id=owner.id,
                ownership_role=owner.ownership_role,
                previous_user_id=previous.user_id if previous else None,
                previous_user_name=previous.user_name if previous else None,
                new_user_id=user.id,
                new_user_name=user.full_name,
                actor_id=actor.id,
                actor_name=actor.full_name,
                rationale=rationale,
                source=source,
            )
        )

    def _log_owner_change(self, account: Account, actor: User, rationale: str, previous: AccountOwner | None, current: AccountOwner | None) -> None:
        self.audit.log(
            module="account_onboarding_workspace",
            action="ownership_change",
            entity_type="account",
            entity_id=account.id,
            actor=actor,
            before_value={"owner": previous.user_name, "role": previous.ownership_role} if previous else None,
            after_value={"owner": current.user_name, "role": current.ownership_role} if current else None,
            reason=rationale,
        )
        self.timeline.add_account_event(
            account_id=account.id,
            title="Owner changed",
            description=rationale,
            actor=actor,
            source_record_id=account.id,
            source_record_type="account",
            source_record_route=f"/accounts/{account.id}",
        )

    def _account_read(self, account: Account) -> AccountRead:
        owners = [AccountOwnerRead.model_validate(owner) for owner in account.owners if owner.is_active]
        primary = next((owner for owner in owners if owner.ownership_role == "primary_am"), None)
        return AccountRead(
            id=account.id,
            name=account.name,
            project_name=account.project_name,
            company_url=account.company_url,
            segment=account.segment,
            region=account.region,
            lifecycle_status=account.lifecycle_status,
            risk_status=account.risk_status,
            commercial_value=float(account.commercial_value),
            currency=account.currency,
            service_context=account.service_context,
            commercial_summary=account.commercial_summary,
            initial_notes=account.initial_notes,
            source_citation=account.source_citation,
            health=HealthScoreRead(
                overall=account.health_overall,
                relationship=account.health_relationship,
                usage=account.health_usage,
                delivery=account.health_delivery,
                commercial=account.health_commercial,
            ),
            next_governance_at=account.next_governance_at,
            created_from_draft_id=account.created_from_draft_id,
            created_at=account.created_at,
            updated_at=account.updated_at,
            primary_owner=primary,
            owners=owners,
            governance_completeness={
                "accountable_am": primary is not None,
                "current_kyc": self._has_current_kyc(account),
                "engagement_records": bool(account.engagements),
                "next_governance": account.next_governance_at is not None,
            },
        )

    def _has_current_kyc(self, account: Account) -> bool:
        if not account.kyc_snapshots:
            return False
        configuration = self.kyc.get_configuration()
        threshold_days = configuration.freshness_threshold_days if configuration else 90
        latest = max(account.kyc_snapshots, key=lambda snapshot: snapshot.approved_at)
        approved_at = latest.approved_at.replace(tzinfo=timezone.utc) if latest.approved_at.tzinfo is None else latest.approved_at.astimezone(timezone.utc)
        return datetime.now(timezone.utc) < approved_at + timedelta(days=threshold_days)

    def _summary_cards(self, account: Account) -> AccountSummaryCardsRead:
        return AccountSummaryCardsRead(
            commercial_value=float(account.commercial_value),
            currency=account.currency,
            lifecycle_status=account.lifecycle_status,
            risk_status=account.risk_status,
            health_overall=account.health_overall,
            next_governance_at=account.next_governance_at,
            open_opportunities=self.accounts.count_open_opportunities(account.id),
        )
