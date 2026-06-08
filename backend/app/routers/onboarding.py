from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.dependencies import get_current_user, get_onboarding_service
from app.models import User
from app.schemas import (
    OnboardingDraftCreateRequest,
    OnboardingDraftLinkRequest,
    OnboardingDraftPageRead,
    OnboardingDraftRead,
    OnboardingDraftRejectRequest,
    OnboardingDraftUpdateRequest,
    SourceDocumentExtractionRead,
)
from app.services.onboarding import OnboardingService

DraftStatusFilter = Literal["ready_for_review", "approved", "rejected", "linked"]
DraftSort = Literal["newest", "oldest", "account_name", "extraction_status"]

router = APIRouter(prefix="/api/onboarding", tags=["Account Onboarding"])


@router.get(
    "/drafts",
    response_model=OnboardingDraftPageRead,
    summary="List onboarding drafts",
    description=(
        "Step 1 of charter/SOW onboarding. Returns paginated AI/manual onboarding drafts with search by account "
        "or source document and filters for status, lifecycle, segment, region, uploader, and owner."
    ),
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view onboarding drafts."},
        422: {"description": "Invalid filter or pagination query parameters."},
    },
)
def list_drafts(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
    search: Annotated[str | None, Query(description="Search by account name or source document name.")] = None,
    status_filter: Annotated[DraftStatusFilter | None, Query(alias="status", description="Draft status filter.")] = None,
    lifecycle_status: Annotated[str | None, Query(description="Lifecycle status extracted or selected for the draft.")] = None,
    segment: Annotated[str | None, Query(description="Account segment filter.")] = None,
    region: Annotated[str | None, Query(description="Account region filter.")] = None,
    uploader: Annotated[str | None, Query(description="User ID of the uploader/creator.")] = None,
    owner: Annotated[str | None, Query(description="Primary owner user ID.")] = None,
    created_from: Annotated[datetime | None, Query(description="Drafts created on or after this ISO timestamp.")] = None,
    created_to: Annotated[datetime | None, Query(description="Drafts created on or before this ISO timestamp.")] = None,
    sort: Annotated[DraftSort, Query(description="Sort drafts by newest, oldest, account_name, or extraction_status.")] = "newest",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of drafts per page.")] = 10,
) -> OnboardingDraftPageRead:
    return service.list_drafts(
        current_user,
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


@router.post(
    "/drafts",
    response_model=OnboardingDraftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create onboarding draft",
    description=(
        "Step 2 of charter/SOW onboarding. Creates a source-backed draft from uploaded file metadata, links, "
        "manual entry, or CSV/manual fallback data. The draft is not official until approval."
    ),
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create onboarding drafts."},
        422: {"description": "Field-level validation errors, including missing source file/link."},
    },
)
def create_draft(
    payload: OnboardingDraftCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.create_draft(payload, current_user)


@router.post(
    "/drafts/upload",
    response_model=OnboardingDraftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create onboarding draft from uploaded SOW or charter files",
    description=(
        "Stores uploaded source documents, extracts readable PDF/DOCX/TXT text, and creates an onboarding draft from "
        "document content instead of file names. Stored sources remain downloadable during review and after approval."
    ),
    responses={
        400: {"description": "No file was supplied, file type is unsupported, or extraction cannot read the upload."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create onboarding drafts."},
        409: {"description": "Uploaded source file checksum already exists or was repeated in this request."},
    },
)
async def create_draft_from_upload(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
    files: Annotated[list[UploadFile], File(description="One or more PDF, DOCX, TXT, or CSV source documents.")],
    manager_name: Annotated[str | None, Form(description="Optional primary account manager display name.")] = None,
    manager_email: Annotated[str | None, Form(description="Optional primary account manager email.")] = None,
) -> OnboardingDraftRead:
    return await service.create_draft_from_uploads(files, current_user, manager_name=manager_name, manager_email=manager_email)


@router.get(
    "/drafts/{draft_id}",
    response_model=OnboardingDraftRead,
    summary="Read onboarding draft",
    description="Step 3 of onboarding review. Returns a draft with source documents, citations, conflicts, and engagement drafts.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view onboarding drafts."},
        404: {"description": "Onboarding draft was not found."},
    },
)
def read_draft(
    draft_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.get_draft(draft_id, current_user)


@router.get(
    "/drafts/{draft_id}/documents/{document_id}/download",
    summary="Download onboarding source document",
    description="Downloads the locally stored SOW, charter, or source attachment while the onboarding draft is still under review.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot download this source document."},
        404: {"description": "Draft, source document, or stored file was not found."},
    },
)
def download_draft_document(
    draft_id: str,
    document_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> FileResponse:
    document, path = service.draft_document_download_path(draft_id, document_id, current_user)
    return FileResponse(
        path,
        media_type=document.mime_type or "application/octet-stream",
        filename=document.file_name or f"{document.title}.bin",
    )


@router.post(
    "/drafts/{draft_id}/documents/{document_id}/extract",
    response_model=SourceDocumentExtractionRead,
    summary="Retry onboarding source extraction",
    description=(
        "Re-runs text extraction, OCR fallback, page-row persistence, chunking, and structured SOW/charter extraction "
        "for a stored onboarding source document."
    ),
    responses={
        400: {"description": "Draft cannot be re-extracted in its current status."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this onboarding draft or sensitive source."},
        404: {"description": "Draft or source document was not found."},
    },
)
def retry_draft_document_extraction(
    draft_id: str,
    document_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
    force: Annotated[bool, Query(description="Re-extract even when a completed extraction already exists.")] = True,
) -> SourceDocumentExtractionRead:
    return service.extract_draft_document(draft_id, document_id, current_user, force=force)


@router.patch(
    "/drafts/{draft_id}",
    response_model=OnboardingDraftRead,
    summary="Update onboarding draft",
    description="Step 4 of onboarding review. Edits extracted or manually entered draft fields before approval/rejection/linking.",
    responses={
        400: {"description": "Draft is already decided and cannot be changed."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update onboarding drafts."},
        404: {"description": "Onboarding draft was not found."},
        422: {"description": "Field-level validation errors."},
    },
)
def update_draft(
    draft_id: str,
    payload: OnboardingDraftUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.update_draft(draft_id, payload, current_user)


@router.post(
    "/drafts/{draft_id}/approve",
    response_model=OnboardingDraftRead,
    summary="Approve onboarding draft",
    description=(
        "Step 5 of onboarding review. Transactionally creates the official account, primary AM ownership, "
        "engagement records, health snapshots, audit log, and timeline events."
    ),
    responses={
        400: {"description": "Draft is not ready or primary owner is invalid."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot approve onboarding drafts."},
        404: {"description": "Onboarding draft was not found."},
        409: {"description": "Possible duplicate account requires link-to-existing decision."},
        422: {"description": "Approval validation errors for required account, source, or engagement fields."},
    },
)
def approve_draft(
    draft_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.approve_draft(draft_id, current_user)


@router.post(
    "/drafts/{draft_id}/reject",
    response_model=OnboardingDraftRead,
    summary="Reject onboarding draft",
    description="Step 6 of onboarding review. Rejects a draft with required rationale and preserves it for audit.",
    responses={
        400: {"description": "Draft is already decided and cannot be rejected."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot reject onboarding drafts."},
        404: {"description": "Onboarding draft was not found."},
        422: {"description": "Rejection reason is missing or invalid."},
    },
)
def reject_draft(
    draft_id: str,
    payload: OnboardingDraftRejectRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.reject_draft(draft_id, payload, current_user)


@router.post(
    "/drafts/{draft_id}/link-account",
    response_model=OnboardingDraftRead,
    summary="Link onboarding draft to existing account",
    description="Step 7 of duplicate handling. Links source documents to an existing account without creating a duplicate account.",
    responses={
        400: {"description": "Draft is already decided and cannot be linked."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot link onboarding drafts or cannot update the target account."},
        404: {"description": "Draft or account was not found."},
        422: {"description": "Link rationale or account ID is invalid."},
    },
)
def link_account(
    draft_id: str,
    payload: OnboardingDraftLinkRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingDraftRead:
    return service.link_account(draft_id, payload, current_user)
