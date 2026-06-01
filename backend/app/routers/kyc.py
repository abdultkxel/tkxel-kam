from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_kyc_service
from app.models import User
from app.schemas import (
    KycAgentRunCreateRequest,
    KycAgentRunPageRead,
    KycAgentRunRead,
    KycConfidenceLevel,
    KycConfigurationRead,
    KycConfigurationUpdateRequest,
    KycDraftApproveRequest,
    KycDraftCreateRequest,
    KycDraftPageRead,
    KycDraftRead,
    KycDraftRejectRequest,
    KycDraftStatus,
    KycDraftUpdateRequest,
    KycFreshnessRead,
    KycRunStatus,
    KycSnapshotPageRead,
    KycSnapshotRead,
)
from app.services.kyc import KycService

Direction = Literal["asc", "desc"]
DraftSort = Literal["created_at", "updated_at", "confidence", "completeness"]
SnapshotSort = Literal["approved_at", "version", "confidence", "completeness"]
RunSort = Literal["created_at", "updated_at"]
StaleStatus = Literal["fresh", "stale"]

router = APIRouter(prefix="/api/accounts/{account_id}/kyc", tags=["KYC and AI Extraction"])
config_router = APIRouter(prefix="/api/kyc", tags=["KYC and AI Extraction"])


@config_router.get(
    "/configuration",
    response_model=KycConfigurationRead,
    summary="Read KYC configuration",
    description="Returns KYC required-field, freshness, confidence, research-source, and field-catalog configuration.",
)
def read_configuration(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycConfigurationRead:
    return service.read_configuration(current_user)


@config_router.patch(
    "/configuration",
    response_model=KycConfigurationRead,
    summary="Update KYC configuration",
    description="Updates KYC required fields, freshness threshold, low-confidence threshold, and configured research sources.",
)
def update_configuration(
    payload: KycConfigurationUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycConfigurationRead:
    return service.update_configuration(payload, current_user)


@router.get(
    "/drafts",
    response_model=KycDraftPageRead,
    summary="List KYC drafts",
    description="Paginated KYC draft review queue with search across fields, citations, conflicts, missing fields, and change summaries.",
)
def list_drafts(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
    search: Annotated[str | None, Query(description="Search KYC fields, citations, conflicts, missing fields, and change summaries.")] = None,
    status_filter: Annotated[KycDraftStatus | None, Query(alias="status", description="Draft status filter.")] = None,
    confidence_level: Annotated[KycConfidenceLevel | None, Query(description="Confidence bucket filter.")] = None,
    missing_fields: Annotated[bool | None, Query(description="Filter drafts with or without missing required fields.")] = None,
    stale_status: Annotated[StaleStatus | None, Query(description="Fresh or stale draft filter.")] = None,
    reviewer: Annotated[str | None, Query(description="Reviewer/creator/approver/rejector user ID filter.")] = None,
    created_from: Annotated[datetime | None, Query(description="Drafts created on or after this ISO timestamp.")] = None,
    created_to: Annotated[datetime | None, Query(description="Drafts created on or before this ISO timestamp.")] = None,
    sort: Annotated[DraftSort, Query(description="Sort by created date, confidence, or completeness.")] = "created_at",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of drafts per page.")] = 10,
) -> KycDraftPageRead:
    return service.list_drafts(
        account_id,
        current_user,
        search=search,
        status_filter=status_filter,
        confidence_level=confidence_level,
        missing_fields=missing_fields,
        stale_status=stale_status,
        reviewer=reviewer,
        created_from=created_from,
        created_to=created_to,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/drafts",
    response_model=KycDraftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create KYC draft",
    description="Triggers AI-assisted KYC drafting from account context, approved source documents, prior snapshots, attachments, notes, and configured research sources.",
)
def create_draft(
    account_id: str,
    payload: KycDraftCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycDraftRead:
    return service.create_draft(account_id, payload, current_user)


@router.get(
    "/drafts/{draft_id}",
    response_model=KycDraftRead,
    summary="Read KYC draft",
    description="Returns an AI-assisted KYC draft with fields, citations, confidence, conflicts, missing fields, and previous-snapshot differences.",
)
def read_draft(
    account_id: str,
    draft_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycDraftRead:
    return service.get_draft(account_id, draft_id, current_user)


@router.patch(
    "/drafts/{draft_id}",
    response_model=KycDraftRead,
    summary="Update KYC draft",
    description="Edits reviewable KYC draft fields, acknowledgement flags, override reason, and reviewer notes before approval or rejection.",
)
def update_draft(
    account_id: str,
    draft_id: str,
    payload: KycDraftUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycDraftRead:
    return service.update_draft(account_id, draft_id, payload, current_user)


@router.post(
    "/drafts/{draft_id}/approve",
    response_model=KycDraftRead,
    summary="Approve KYC draft",
    description="Approves a complete KYC draft and creates an immutable official KYC snapshot. Missing required fields require an override reason.",
)
def approve_draft(
    account_id: str,
    draft_id: str,
    payload: KycDraftApproveRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycDraftRead:
    return service.approve_draft(account_id, draft_id, payload, current_user)


@router.post(
    "/drafts/{draft_id}/reject",
    response_model=KycDraftRead,
    summary="Reject KYC draft",
    description="Rejects a KYC draft with rationale while preserving the draft for audit and history.",
)
def reject_draft(
    account_id: str,
    draft_id: str,
    payload: KycDraftRejectRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycDraftRead:
    return service.reject_draft(account_id, draft_id, payload, current_user)


@router.get(
    "/snapshots",
    response_model=KycSnapshotPageRead,
    summary="List KYC snapshots",
    description="Returns immutable approved KYC snapshot history newest-first with search, filters, sorting, and pagination.",
)
def list_snapshots(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
    search: Annotated[str | None, Query(description="Search snapshot fields, citations, conflicts, missing fields, and change summaries.")] = None,
    approver: Annotated[str | None, Query(description="Approver user ID filter.")] = None,
    source: Annotated[str | None, Query(description="Source or research-source filter.")] = None,
    confidence_level: Annotated[KycConfidenceLevel | None, Query(description="Confidence bucket filter.")] = None,
    date_from: Annotated[datetime | None, Query(description="Snapshots approved on or after this ISO timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Snapshots approved on or before this ISO timestamp.")] = None,
    sort: Annotated[SnapshotSort, Query(description="Sort by approved date, confidence, or completeness.")] = "approved_at",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of snapshots per page.")] = 10,
) -> KycSnapshotPageRead:
    return service.list_snapshots(
        account_id,
        current_user,
        search=search,
        approver=approver,
        source=source,
        confidence_level=confidence_level,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/snapshots/{snapshot_id}",
    response_model=KycSnapshotRead,
    summary="Read KYC snapshot",
    description="Returns an immutable approved KYC snapshot with source context and change summary.",
)
def read_snapshot(
    account_id: str,
    snapshot_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycSnapshotRead:
    return service.get_snapshot(account_id, snapshot_id, current_user)


@router.get(
    "/freshness",
    response_model=KycFreshnessRead,
    summary="Read KYC freshness",
    description="Returns KYC freshness, stale status, completion percentage, source coverage, confidence, and missing required fields.",
)
def read_freshness(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycFreshnessRead:
    return service.freshness(account_id, current_user)


@router.get(
    "/agent-runs",
    response_model=KycAgentRunPageRead,
    summary="List KYC agent runs",
    description="Returns KYC agent run history with search across outputs/citations, status/workstream filters, sorting, and pagination.",
)
def list_agent_runs(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
    search: Annotated[str | None, Query(description="Search workstream output and citations.")] = None,
    status_filter: Annotated[KycRunStatus | None, Query(alias="status", description="Run status filter.")] = None,
    workstream: Annotated[str | None, Query(description="Workstream key filter.")] = None,
    triggered_by: Annotated[str | None, Query(description="Triggered-by user ID filter.")] = None,
    date_from: Annotated[datetime | None, Query(description="Runs created on or after this ISO timestamp.")] = None,
    date_to: Annotated[datetime | None, Query(description="Runs created on or before this ISO timestamp.")] = None,
    sort: Annotated[RunSort, Query(description="Sort by created or updated date.")] = "created_at",
    direction: Annotated[Direction, Query(description="Sort direction.")] = "desc",
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of runs per page.")] = 10,
) -> KycAgentRunPageRead:
    return service.list_agent_runs(
        account_id,
        current_user,
        search=search,
        status_filter=status_filter,
        workstream=workstream,
        triggered_by=triggered_by,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/agent-runs",
    response_model=KycAgentRunRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create KYC agent run",
    description="Runs the five named KYC workstreams and returns independent status, confidence, citations, and missing-field indicators.",
)
def create_agent_run(
    account_id: str,
    payload: KycAgentRunCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycAgentRunRead:
    return service.create_agent_run(account_id, payload, current_user)


@router.get(
    "/agent-runs/{run_id}",
    response_model=KycAgentRunRead,
    summary="Read KYC agent run",
    description="Returns a KYC agent run with per-workstream status, output, citations, confidence, and errors.",
)
def read_agent_run(
    account_id: str,
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycAgentRunRead:
    return service.get_agent_run(account_id, run_id, current_user)


@router.post(
    "/agent-runs/{run_id}/refresh",
    response_model=KycAgentRunRead,
    summary="Refresh KYC agent run",
    description="Triggers a full re-run of all five KYC workstreams while preserving previous output until the new run completes.",
)
def refresh_agent_run(
    account_id: str,
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[KycService, Depends(get_kyc_service)],
) -> KycAgentRunRead:
    return service.refresh_agent_run(account_id, run_id, current_user)
