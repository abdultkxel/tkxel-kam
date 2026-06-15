from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.dependencies import get_account_service, get_current_user, get_custom_field_service, get_engagement_service, get_onboarding_service, require_permission
from app.models import User
from app.rbac import ACCOUNT_CUSTOM_FIELD_MODULES
from app.schemas import (
    AccountCsvImportRequest,
    AccountCsvImportResponse,
    AccountOverviewRead,
    AccountHealthRollupRead,
    AccountOwnerCreateRequest,
    AccountOwnerRead,
    AccountOwnerUpdateRequest,
    AccountOwnershipHistoryPageRead,
    AccountPageRead,
    AccountPermissionsRead,
    AccountRead,
    AccountStatusUpdateRequest,
    AccountSummaryCardsRead,
    CustomFieldDefinitionRead,
    EngagementCreateRequest,
    EngagementImportDraftPageRead,
    EngagementImportDraftRead,
    EngagementPageRead,
    EngagementRead,
    MessageResponse,
    SourceDocumentCreateRequest,
    SourceDocumentChunkPageRead,
    SourceDocumentExtractionRead,
    SourceDocumentPageRead,
    SourceDocumentRead,
)
from app.services.accounts import AccountService
from app.services.custom_fields import CustomFieldService
from app.services.engagements import EngagementService
from app.services.onboarding import OnboardingService

Direction = Literal["asc", "desc"]
AccountSort = Literal["account_number", "name", "lifecycle_status", "risk_status", "owner_name", "segment", "commercial_value", "health", "next_governance_at", "updated_at"]
AttachmentSort = Literal["uploaded_date", "source_type", "name"]
SensitivityFilter = Literal["sensitive", "standard"]
EngagementSort = Literal["renewal_date", "end_date", "value", "delivery_status", "updated_date"]
RenewalWindow = Literal["next_30", "next_60", "next_90", "expired", "notice_due", "missing"]
RiskFilter = Literal["healthy", "warning", "critical", "at_risk"]

router = APIRouter(prefix="/api/accounts", tags=["Account Workspace"])
AccountCreateAccess = Annotated[User, Depends(require_permission("account_onboarding_workspace", "create"))]


@router.get(
    "",
    response_model=AccountPageRead,
    summary="List accounts",
    description=(
        "Account selector and portfolio listing. Supports search by numeric account number, account name, project, service, owner name, or owner email; lifecycle/segment/region filters; ownership "
        "filters, governance-completeness filters, sorting, and pagination."
    ),
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view accounts."},
        422: {"description": "Invalid search/filter/sort/pagination query parameters."},
    },
)
def list_accounts(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    search: Annotated[str | None, Query(description="Search by numeric account number, account name, project name, service context, owner name, or owner email.")] = None,
    lifecycle_status: Annotated[str | None, Query(description="Lifecycle status filter.")] = None,
    segment: Annotated[str | None, Query(description="Account segment filter.")] = None,
    region: Annotated[str | None, Query(description="Account region filter.")] = None,
    risk_status: Annotated[RiskFilter | None, Query(description="Risk status filter.")] = None,
    assigned_user_id: Annotated[str | None, Query(description="Any active account ownership user ID filter.")] = None,
    am_id: Annotated[str | None, Query(description="Any active AM ownership user ID filter, including primary and supporting AM roles.")] = None,
    primary_am: Annotated[str | None, Query(description="Primary AM user ID filter.")] = None,
    supporting_am: Annotated[str | None, Query(description="Supporting AM user ID filter.")] = None,
    ops_lead: Annotated[str | None, Query(description="Ops Lead user ID filter.")] = None,
    leadership_sponsor: Annotated[str | None, Query(description="Leadership sponsor user ID filter.")] = None,
    missing_am: Annotated[bool | None, Query(description="Show accounts missing active primary AM.")] = None,
    missing_current_kyc: Annotated[bool | None, Query(description="Show active accounts missing current KYC.")] = None,
    missing_engagements: Annotated[bool | None, Query(description="Show accounts without engagement records.")] = None,
    missing_next_governance: Annotated[bool | None, Query(description="Show accounts without next governance date.")] = None,
    sort: Annotated[AccountSort, Query(description="Sort column.")] = "name",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "asc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=500, description="Number of accounts per page.")] = 10,
) -> AccountPageRead:
    return service.list_accounts(
        current_user,
        search=search,
        lifecycle_status=lifecycle_status,
        segment=segment,
        region=region,
        risk_status=risk_status,
        assigned_user_id=assigned_user_id,
        am_id=am_id,
        primary_am=primary_am,
        supporting_am=supporting_am,
        ops_lead=ops_lead,
        leadership_sponsor=leadership_sponsor,
        missing_am=missing_am,
        missing_current_kyc=missing_current_kyc,
        missing_engagements=missing_engagements,
        missing_next_governance=missing_next_governance,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/custom-fields",
    response_model=list[CustomFieldDefinitionRead],
    summary="List account custom fields",
    description=(
        "Returns active Accounts Field Builder definitions that should render in the account creation form. "
        "Legacy account-intake module definitions are included for backwards compatibility. Requires account onboarding create permission."
    ),
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create onboarding accounts."},
    },
)
def list_account_custom_fields(
    _: AccountCreateAccess,
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
) -> list[CustomFieldDefinitionRead]:
    return service.list_active_definitions(list(ACCOUNT_CUSTOM_FIELD_MODULES))


@router.post(
    "/import-csv",
    response_model=AccountCsvImportResponse,
    summary="Import accounts from CSV",
    description=(
        "Bulk account creation from mapped CSV rows. Each valid row is converted into the same onboarding draft, "
        "source document, approval, account, primary owner, engagement, health rollup, audit, and timeline hierarchy "
        "used by manual account creation. Duplicate modes support skipping, overwriting an existing account, or "
        "creating a separate duplicate account."
    ),
    responses={
        200: {"description": "CSV rows were processed with per-row created, updated, skipped, or failed results."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create and approve onboarding accounts."},
        422: {"description": "Request-level validation errors such as missing rows or invalid duplicate mode."},
    },
)
def import_accounts_csv(
    payload: AccountCsvImportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> AccountCsvImportResponse:
    return service.import_accounts_from_csv(payload, current_user)


@router.get(
    "/{account_id}",
    response_model=AccountRead,
    summary="Read account",
    description="Returns the authorized account profile with ownership and governance completeness flags.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account."},
        404: {"description": "Account was not found."},
    },
)
def read_account(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountRead:
    return service.get_account(account_id, current_user)


@router.get(
    "/{account_id}/overview",
    response_model=AccountOverviewRead,
    summary="Read account overview",
    description=(
        "Unified Account Overview payload with account profile, summary cards, permissions, first-page engagements, "
        "and first-page attachments for Account 360."
    ),
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account."},
        404: {"description": "Account was not found."},
    },
)
def read_overview(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    account_service: Annotated[AccountService, Depends(get_account_service)],
    engagement_service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> AccountOverviewRead:
    return AccountOverviewRead(
        account=account_service.get_account(account_id, current_user),
        summary_cards=account_service.summary_cards(account_id, current_user),
        permissions=account_service.permissions(account_id, current_user),
        engagements=engagement_service.list_for_account(account_id, current_user, page=1, page_size=10),
        attachments=account_service.list_attachments(account_id, current_user, page=1, page_size=10),
    )


@router.get(
    "/{account_id}/summary-cards",
    response_model=AccountSummaryCardsRead,
    summary="Read account summary cards",
    description="Returns Account Overview commercial value, lifecycle, risk, health, governance, signal, opportunity, and escalation card data.",
    responses={401: {"description": "Missing, invalid, or expired bearer token."}, 403: {"description": "No account access."}, 404: {"description": "Account was not found."}},
)
def read_summary_cards(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountSummaryCardsRead:
    return service.summary_cards(account_id, current_user)


@router.get(
    "/{account_id}/permissions",
    response_model=AccountPermissionsRead,
    summary="Read account permissions",
    description="Returns effective UI permissions for the authenticated user on the account.",
)
def read_permissions(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountPermissionsRead:
    return service.permissions(account_id, current_user)


@router.patch(
    "/{account_id}/status",
    response_model=AccountRead,
    summary="Update account lifecycle status",
    description="Changes lifecycle status with required reason and writes audit/timeline events.",
    responses={
        400: {"description": "Archived account write restrictions or invalid transition."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update account status."},
        404: {"description": "Account was not found."},
        422: {"description": "Status or reason validation failed."},
    },
)
def update_status(
    account_id: str,
    payload: AccountStatusUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountRead:
    return service.update_status(account_id, payload, current_user)


@router.get(
    "/{account_id}/owners",
    response_model=list[AccountOwnerRead],
    summary="List account owners",
    description="Returns active primary and matrix owners for an account.",
)
def list_owners(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> list[AccountOwnerRead]:
    return service.list_owners(account_id, current_user)


@router.post(
    "/{account_id}/owners",
    response_model=AccountOwnerRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add account owner",
    description="Adds primary AM or matrix owner with required rationale and ownership-history audit.",
    responses={
        400: {"description": "Owner is inactive, ineligible, or active account would violate ownership rules."},
        403: {"description": "Authenticated user cannot manage ownership."},
        409: {"description": "User already holds the active ownership role."},
        422: {"description": "Ownership role or rationale validation failed."},
    },
)
def add_owner(
    account_id: str,
    payload: AccountOwnerCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountOwnerRead:
    return service.add_owner(account_id, payload, current_user)


@router.patch(
    "/{account_id}/owners/{owner_id}",
    response_model=AccountOwnerRead,
    summary="Update account owner",
    description="Changes account owner assignment, role, or active state with rationale and ownership-history audit.",
    responses={
        400: {"description": "Owner is inactive, ineligible, or active account would violate ownership rules."},
        403: {"description": "Authenticated user cannot manage ownership."},
        404: {"description": "Owner assignment was not found."},
        422: {"description": "Ownership role or rationale validation failed."},
    },
)
def update_owner(
    account_id: str,
    owner_id: str,
    payload: AccountOwnerUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> AccountOwnerRead:
    return service.update_owner(account_id, owner_id, payload, current_user)


@router.delete(
    "/{account_id}/owners/{owner_id}",
    response_model=MessageResponse,
    summary="Remove account owner",
    description="Deactivates an owner assignment while preserving ownership history.",
    responses={
        400: {"description": "Active accounts require one active primary AM."},
        403: {"description": "Authenticated user cannot manage ownership."},
        404: {"description": "Owner assignment was not found."},
    },
)
def delete_owner(
    account_id: str,
    owner_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> MessageResponse:
    return service.delete_owner(account_id, owner_id, current_user)


@router.get(
    "/{account_id}/ownership-history",
    response_model=AccountOwnershipHistoryPageRead,
    summary="List ownership history",
    description="Returns immutable ownership changes newest-first with pagination.",
)
def ownership_history(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of history rows per page.")] = 10,
) -> AccountOwnershipHistoryPageRead:
    return service.ownership_history(account_id, current_user, page, page_size)


@router.get(
    "/{account_id}/attachments",
    response_model=SourceDocumentPageRead,
    summary="List account attachments",
    description="Returns source documents with search, source type/sensitivity filters, sort, and pagination.",
)
def list_attachments(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    search: Annotated[str | None, Query(description="Search by title, file name, or source type.")] = None,
    source_type: Annotated[str | None, Query(description="Filter by source type.")] = None,
    sensitivity: Annotated[SensitivityFilter | None, Query(description="Filter sensitive or standard documents.")] = None,
    uploaded_from: Annotated[datetime | None, Query(description="Attachments uploaded on or after this ISO timestamp.")] = None,
    uploaded_to: Annotated[datetime | None, Query(description="Attachments uploaded on or before this ISO timestamp.")] = None,
    sort: Annotated[AttachmentSort, Query(description="Sort by uploaded_date, source_type, or name.")] = "uploaded_date",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of attachments per page.")] = 10,
) -> SourceDocumentPageRead:
    return service.list_attachments(
        account_id,
        current_user,
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


@router.post(
    "/{account_id}/attachments",
    response_model=SourceDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add account attachment",
    description="Adds a file/link source document with optional citations and writes audit/timeline entries.",
)
def add_attachment(
    account_id: str,
    payload: SourceDocumentCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> SourceDocumentRead:
    return service.add_attachment(account_id, payload, current_user)


@router.post(
    "/{account_id}/attachments/upload",
    response_model=SourceDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload account source document",
    description=(
        "Uploads a real account source document for AI KYC extraction. Local/demo environments store the file locally, "
        "calculate a checksum, and can immediately extract text/chunks from PDF, DOCX, or plain text sources."
    ),
    responses={
        400: {"description": "Uploaded file is empty, too large, unsupported, or cannot be extracted."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account."},
        404: {"description": "Account was not found."},
        409: {"description": "Uploaded source file checksum already exists for this account."},
        422: {"description": "Upload form validation failed."},
    },
)
async def upload_attachment(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    file: Annotated[UploadFile, File(description="PDF, DOCX, text, CSV, or image file to store as an account source.")],
    title: Annotated[str | None, Form(description="Optional display title. Defaults to uploaded filename.")] = None,
    source_type: Annotated[str, Form(description="Source type such as sow, project_charter, attachment, commercial_note, or manual_import.")] = "attachment",
    is_sensitive: Annotated[bool, Form(description="Marks source as sensitive for RBAC-aware KYC retrieval.")] = False,
    extract_now: Annotated[bool, Form(description="Run text extraction and chunking immediately after upload.")] = True,
) -> SourceDocumentRead:
    return await service.upload_attachment(account_id, file, current_user, title=title, source_type=source_type, is_sensitive=is_sensitive, extract_now=extract_now)


@router.post(
    "/{account_id}/attachments/{attachment_id}/extract",
    response_model=SourceDocumentExtractionRead,
    summary="Extract account source document",
    description="Runs local text extraction, OCR when configured and needed, and chunk generation for an uploaded account source document.",
    responses={
        400: {"description": "Attachment has no local file path or is unsupported."},
        403: {"description": "Authenticated user cannot update or extract this attachment."},
        404: {"description": "Account or attachment was not found."},
    },
)
def extract_attachment(
    account_id: str,
    attachment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    force: Annotated[bool, Query(description="Re-extract even when a completed extraction already exists.")] = False,
) -> SourceDocumentExtractionRead:
    return service.extract_attachment(account_id, attachment_id, current_user, force=force)


@router.get(
    "/{account_id}/attachments/{attachment_id}/extraction",
    response_model=SourceDocumentExtractionRead,
    summary="Read account source extraction",
    description="Returns the latest stored text extraction metadata for an account source document without returning raw extracted text.",
    responses={
        403: {"description": "Authenticated user cannot view this extraction."},
        404: {"description": "Account, attachment, or extraction was not found."},
    },
)
def read_attachment_extraction(
    account_id: str,
    attachment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> SourceDocumentExtractionRead:
    return service.attachment_extraction(account_id, attachment_id, current_user)


@router.get(
    "/{account_id}/attachments/{attachment_id}/download",
    summary="Download account source document",
    description="Downloads the locally stored SOW, charter, or source attachment after account-level and sensitive-document RBAC checks.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot download this source document."},
        404: {"description": "Account, attachment, or stored file was not found."},
    },
)
def download_attachment(
    account_id: str,
    attachment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> FileResponse:
    document, path = service.attachment_download_path(account_id, attachment_id, current_user)
    return FileResponse(
        path,
        media_type=document.mime_type or "application/octet-stream",
        filename=document.file_name or f"{document.title}.bin",
    )


@router.get(
    "/{account_id}/attachments/{attachment_id}/chunks",
    response_model=SourceDocumentChunkPageRead,
    summary="List account source chunks",
    description="Returns source chunks used by AI KYC retrieval with pagination and source metadata.",
    responses={
        403: {"description": "Authenticated user cannot view these chunks."},
        404: {"description": "Account or attachment was not found."},
    },
)
def list_attachment_chunks(
    account_id: str,
    attachment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of chunks per page.")] = 25,
) -> SourceDocumentChunkPageRead:
    return service.attachment_chunks(account_id, attachment_id, current_user, page=page, page_size=page_size)


@router.delete(
    "/{account_id}/attachments/{attachment_id}",
    response_model=MessageResponse,
    summary="Delete account attachment",
    description="Deletes an attachment only when it has no citation references.",
    responses={400: {"description": "Attachment has citations and cannot be deleted."}, 404: {"description": "Attachment was not found."}},
)
def delete_attachment(
    account_id: str,
    attachment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AccountService, Depends(get_account_service)],
) -> MessageResponse:
    return service.delete_attachment(account_id, attachment_id, current_user)


@router.get(
    "/{account_id}/engagements",
    response_model=EngagementPageRead,
    summary="List account engagements",
    description="Lists Engagement/SOW records with search, filters, sorting, and pagination.",
)
def list_engagements(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    search: Annotated[str | None, Query(description="Search by engagement name, source citation, or service line.")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Engagement status filter.")] = None,
    owner: Annotated[str | None, Query(description="Owner user ID filter.")] = None,
    service_line: Annotated[str | None, Query(description="Service line filter.")] = None,
    renewal_window: Annotated[RenewalWindow | None, Query(description="Renewal/notice window filter.")] = None,
    risk_status: Annotated[RiskFilter | None, Query(description="RAG risk filter based on delivery health.")] = None,
    sort: Annotated[EngagementSort, Query(description="Sort column.")] = "updated_date",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of engagements per page.")] = 10,
) -> EngagementPageRead:
    return service.list_for_account(
        account_id,
        current_user,
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


@router.post(
    "/{account_id}/engagements/from-charter",
    response_model=EngagementImportDraftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create editable engagement draft from project charter",
    description=(
        "Uploads a project charter file, reads it with deterministic document parsers, stores the source document for KYC/RAG reuse, "
        "and creates an editable engagement draft that must be approved before an engagement record is created."
    ),
    responses={
        400: {"description": "File is missing, unsupported, or cannot be extracted."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account."},
        404: {"description": "Account was not found."},
    },
)
async def create_engagement_from_charter(
    account_id: str,
    file: Annotated[UploadFile, File(description="Project charter, SOW, PDF, DOCX, XLSX, or text file.")],
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementImportDraftRead:
    return await service.create_engagement_from_charter(account_id, file, current_user)


@router.get(
    "/{account_id}/engagement-drafts",
    response_model=EngagementImportDraftPageRead,
    summary="List account engagement import drafts",
    description="Lists editable engagement drafts created by Import Charter before approval converts them into official Engagement/SOW records.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account's engagement drafts."},
        404: {"description": "Account was not found."},
    },
)
def list_engagement_import_drafts(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
    status_filter: Annotated[str | None, Query(alias="status", description="Draft status filter; defaults to ready_for_review.")] = "ready_for_review",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of engagement drafts per page.")] = 20,
) -> EngagementImportDraftPageRead:
    return service.list_import_drafts_for_account(account_id, current_user, status_filter=status_filter, page=page, page_size=page_size)


@router.post(
    "/{account_id}/engagements",
    response_model=EngagementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create account engagement",
    description="Creates a SOW-backed engagement with owner, service lines, dates, commercial context, risks, and initial health snapshot.",
)
def create_engagement(
    account_id: str,
    payload: EngagementCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> EngagementRead:
    return service.create_engagement(account_id, payload, current_user)


@router.get(
    "/{account_id}/health/rollup",
    response_model=AccountHealthRollupRead,
    summary="Read account health rollup",
    description="Returns the latest engagement health contribution rollup. Final account scoring is delegated to the scoring engine when available.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account health rollup."},
        404: {"description": "Account was not found."},
    },
)
def account_health_rollup(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[EngagementService, Depends(get_engagement_service)],
) -> AccountHealthRollupRead:
    return service.account_rollup(account_id, current_user)
