from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_account_service, get_current_user, get_custom_field_service, get_engagement_service, require_permission
from app.models import User
from app.schemas import (
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
    EngagementPageRead,
    EngagementRead,
    MessageResponse,
    SourceDocumentCreateRequest,
    SourceDocumentPageRead,
    SourceDocumentRead,
)
from app.services.accounts import AccountService
from app.services.custom_fields import CustomFieldService
from app.services.engagements import EngagementService

Direction = Literal["asc", "desc"]
AccountSort = Literal["name", "lifecycle_status", "risk_status", "owner_name", "segment", "commercial_value", "health", "next_governance_at", "updated_at"]
AttachmentSort = Literal["uploaded_date", "source_type", "name"]
SensitivityFilter = Literal["sensitive", "standard"]
EngagementSort = Literal["renewal_date", "end_date", "value", "delivery_status", "updated_date"]
RenewalWindow = Literal["next_30", "next_60", "next_90", "expired", "notice_due", "missing"]
RiskFilter = Literal["healthy", "warning", "critical"]

router = APIRouter(prefix="/api/accounts", tags=["Account Workspace"])
AccountCreateAccess = Annotated[User, Depends(require_permission("account_onboarding_workspace", "create"))]


@router.get(
    "",
    response_model=AccountPageRead,
    summary="List accounts",
    description=(
        "Account selector and portfolio listing. Supports search by account, project, service, owner name, or owner email; lifecycle/segment/region filters; ownership "
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
    search: Annotated[str | None, Query(description="Search by account name, project name, service context, owner name, or owner email.")] = None,
    lifecycle_status: Annotated[str | None, Query(description="Lifecycle status filter.")] = None,
    segment: Annotated[str | None, Query(description="Account segment filter.")] = None,
    region: Annotated[str | None, Query(description="Account region filter.")] = None,
    risk_status: Annotated[RiskFilter | None, Query(description="Risk status filter.")] = None,
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
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of accounts per page.")] = 10,
) -> AccountPageRead:
    return service.list_accounts(
        current_user,
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
        "Returns active Field Builder definitions that should render in the account creation form. "
        "Requires account onboarding create permission."
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
    return service.list_active_definitions(["account_onboarding_workspace", "account_overview"])


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
