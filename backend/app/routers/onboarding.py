from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_onboarding_service
from app.models import User
from app.schemas import (
    OnboardingDraftCreateRequest,
    OnboardingDraftLinkRequest,
    OnboardingDraftPageRead,
    OnboardingDraftRead,
    OnboardingDraftRejectRequest,
    OnboardingDraftUpdateRequest,
    UserRead,
)
from app.services.onboarding import OnboardingService

DraftStatusFilter = Literal["ready_for_review", "approved", "rejected", "linked"]
DraftSort = Literal["newest", "oldest", "account_name", "extraction_status"]

router = APIRouter(prefix="/api/onboarding", tags=["Account Onboarding"])


@router.get(
    "/account-managers",
    response_model=list[UserRead],
    summary="List account manager assignment candidates",
    description=(
        "Returns active Account Manager/KAM users that can be assigned as the primary owner of an onboarding draft. "
        "Used by manual and upload-based intake before draft approval."
    ),
    response_description="Active account managers available for onboarding draft assignment.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot create onboarding drafts."},
    },
)
def list_account_managers(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> list[UserRead]:
    return service.list_account_manager_candidates(current_user)


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
