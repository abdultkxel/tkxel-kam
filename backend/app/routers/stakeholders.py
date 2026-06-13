from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_current_user, get_stakeholder_config_service, get_stakeholder_gap_service, get_stakeholder_service
from app.models import User
from app.schemas import (
    MessageResponse,
    StakeholderCoverageGapRead,
    StakeholderCreateRequest,
    StakeholderGapRuleCreateRequest,
    StakeholderGapRulePageRead,
    StakeholderGapRuleRead,
    StakeholderGapRuleUpdateRequest,
    StakeholderInteractionCreateRequest,
    StakeholderInteractionPageRead,
    StakeholderInteractionRead,
    StakeholderOrgChartRead,
    StakeholderPageRead,
    StakeholderPoliticalRisk,
    StakeholderRead,
    StakeholderRoleConfigCreateRequest,
    StakeholderRoleConfigPageRead,
    StakeholderRoleConfigRead,
    StakeholderRoleConfigUpdateRequest,
    StakeholderSentiment,
    StakeholderStatus,
    StakeholderUpdateRequest,
)
from app.services.stakeholder_gap_service import StakeholderGapService
from app.services.stakeholder_config import StakeholderConfigService
from app.services.stakeholders import StakeholderService

router = APIRouter(prefix="/api", tags=["Stakeholder Relationships"])


@router.get(
    "/accounts/{account_id}/stakeholders",
    response_model=StakeholderPageRead,
    summary="List account stakeholders",
    description="Returns account-scoped stakeholder records with engagement, role, sentiment, political-risk, status, and search filters.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
        422: {"description": "Invalid pagination or filter query parameters."},
    },
)
def list_stakeholders(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
    engagement_id: Annotated[str | None, Query(description="Filter by linked engagement ID.")] = None,
    role: Annotated[str | None, Query(description="Filter by stakeholder role.")] = None,
    sentiment: Annotated[StakeholderSentiment | None, Query(description="Filter by sentiment.")] = None,
    political_risk: Annotated[StakeholderPoliticalRisk | None, Query(description="Filter by political risk.")] = None,
    status_filter: Annotated[StakeholderStatus | None, Query(alias="status", description="Filter by stakeholder status.")] = None,
    search: Annotated[str | None, Query(description="Search name, title, company, or email.")] = None,
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> StakeholderPageRead:
    return service.list_for_account(
        account_id,
        current_user,
        engagement_id=engagement_id,
        role=role,
        sentiment=sentiment,
        political_risk=political_risk,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/accounts/{account_id}/stakeholders",
    response_model=StakeholderRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create account stakeholder",
    description="Creates an account-scoped stakeholder, validates optional engagement and reporting hierarchy links, and emits stakeholder timeline/audit events.",
    responses={
        400: {"description": "Linked engagement or reporting stakeholder is invalid for this account."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account or module."},
        404: {"description": "Account, engagement, or reporting stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_stakeholder(
    account_id: str,
    payload: StakeholderCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.create(account_id, payload, current_user)


@router.get(
    "/accounts/{account_id}/stakeholders/coverage-gaps",
    response_model=list[StakeholderCoverageGapRead],
    summary="List stakeholder coverage gaps",
    description="Returns deterministic stakeholder coverage gaps for an account with account-level RBAC applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
    },
)
def list_stakeholder_coverage_gaps(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderGapService, Depends(get_stakeholder_gap_service)],
) -> list[StakeholderCoverageGapRead]:
    return service.list_for_account(account_id, current_user)


@router.post(
    "/accounts/{account_id}/stakeholders/recalculate-coverage-gaps",
    response_model=list[StakeholderCoverageGapRead],
    summary="Recalculate stakeholder coverage gaps",
    description="Runs deterministic stakeholder coverage rules, resolves stale gaps, and returns the current gap state.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this account or module."},
        404: {"description": "Account was not found."},
    },
)
def recalculate_stakeholder_coverage_gaps(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderGapService, Depends(get_stakeholder_gap_service)],
) -> list[StakeholderCoverageGapRead]:
    return service.recalculate(account_id, current_user)


@router.get(
    "/accounts/{account_id}/stakeholders/org-chart",
    response_model=StakeholderOrgChartRead,
    summary="Read stakeholder org chart",
    description="Returns graph-friendly stakeholder nodes and hierarchy edges using reports_to links, with unmapped stakeholders grouped under a synthetic root node.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this account or module."},
        404: {"description": "Account was not found."},
    },
)
def read_stakeholder_org_chart(
    account_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderOrgChartRead:
    return service.org_chart(account_id, current_user)


@router.get(
    "/stakeholders/{stakeholder_id}",
    response_model=StakeholderRead,
    summary="Read stakeholder",
    description="Returns a single stakeholder with account-level RBAC and sensitive-field redaction applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this stakeholder."},
        404: {"description": "Stakeholder was not found."},
    },
)
def read_stakeholder(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.get(stakeholder_id, current_user)


@router.get(
    "/stakeholders/{stakeholder_id}/interactions",
    response_model=StakeholderInteractionPageRead,
    summary="List stakeholder interactions",
    description="Returns interaction history for a stakeholder with account-level RBAC and sensitive-field redaction applied.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot view this stakeholder."},
        404: {"description": "Stakeholder was not found."},
        422: {"description": "Invalid pagination query parameters."},
    },
)
def list_stakeholder_interactions(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
    page: Annotated[int, Query(ge=1, description="One-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Number of records per page.")] = 10,
) -> StakeholderInteractionPageRead:
    return service.list_interactions(stakeholder_id, current_user, page=page, page_size=page_size)


@router.post(
    "/stakeholders/{stakeholder_id}/interactions",
    response_model=StakeholderInteractionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create stakeholder interaction",
    description="Logs a stakeholder interaction, updates last interaction and optional relationship fields, and emits a stakeholder_interaction_added timeline event.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this stakeholder."},
        404: {"description": "Stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def create_stakeholder_interaction(
    stakeholder_id: str,
    payload: StakeholderInteractionCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderInteractionRead:
    return service.create_interaction(stakeholder_id, payload, current_user)


@router.patch(
    "/stakeholders/{stakeholder_id}",
    response_model=StakeholderRead,
    summary="Update stakeholder",
    description="Updates stakeholder profile and relationship attributes. Material relationship updates emit an additional relationship_changed timeline event.",
    responses={
        400: {"description": "Linked engagement or reporting hierarchy is invalid."},
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot update this stakeholder."},
        404: {"description": "Stakeholder, engagement, or reporting stakeholder was not found."},
        422: {"description": "Field-level validation errors with meaningful messages."},
    },
)
def update_stakeholder(
    stakeholder_id: str,
    payload: StakeholderUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> StakeholderRead:
    return service.update(stakeholder_id, payload, current_user)


@router.delete(
    "/stakeholders/{stakeholder_id}",
    response_model=MessageResponse,
    summary="Archive stakeholder",
    description="Soft-archives a stakeholder and emits stakeholder_archived timeline/audit events. Historical timeline/audit records remain intact.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot archive this stakeholder."},
        404: {"description": "Stakeholder was not found."},
    },
)
def delete_stakeholder(
    stakeholder_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderService, Depends(get_stakeholder_service)],
) -> MessageResponse:
    return service.delete(stakeholder_id, current_user)


@router.get(
    "/stakeholder-roles",
    response_model=StakeholderRoleConfigPageRead,
    summary="List active stakeholder roles",
    description="Returns active stakeholder role taxonomy for account stakeholder forms and filters.",
)
def list_active_stakeholder_roles(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)],
    search: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> StakeholderRoleConfigPageRead:
    return service.list_roles(current_user, active_state="active", search=search, page=page, page_size=page_size)


@router.get(
    "/admin/stakeholder-roles",
    response_model=StakeholderRoleConfigPageRead,
    summary="List stakeholder role configuration",
    description="Admin/KAM Head taxonomy for stakeholder roles used by stakeholder forms and coverage rules.",
)
def list_stakeholder_roles(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)],
    search: str | None = None,
    active_state: Annotated[str, Query(pattern="^(all|active|inactive)$")] = "active",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> StakeholderRoleConfigPageRead:
    return service.list_roles(current_user, active_state=active_state, search=search, page=page, page_size=page_size, require_configure=True)


@router.post(
    "/admin/stakeholder-roles",
    response_model=StakeholderRoleConfigRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create stakeholder role",
    description="Creates an active/inactive stakeholder role for relationship maps and coverage rules.",
)
def create_stakeholder_role(payload: StakeholderRoleConfigCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)]) -> StakeholderRoleConfigRead:
    return service.create_role(payload, current_user)


@router.patch(
    "/admin/stakeholder-roles/{role_id}",
    response_model=StakeholderRoleConfigRead,
    summary="Update stakeholder role",
    description="Updates stakeholder role labels, slug, ordering, or active state while preserving historical stakeholder records.",
)
def update_stakeholder_role(role_id: str, payload: StakeholderRoleConfigUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)]) -> StakeholderRoleConfigRead:
    return service.update_role(role_id, payload, current_user)


@router.delete(
    "/admin/stakeholder-roles/{role_id}",
    response_model=MessageResponse,
    summary="Delete unused stakeholder role",
    description="Deletes a stakeholder role only when no stakeholder records or gap rules reference it. Used roles should be deactivated instead.",
    responses={
        401: {"description": "Missing, invalid, or expired bearer token."},
        403: {"description": "Authenticated user cannot configure stakeholder roles."},
        404: {"description": "Stakeholder role was not found."},
        409: {"description": "Role is referenced by stakeholders or gap rules and cannot be deleted."},
    },
)
def delete_stakeholder_role(role_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)]) -> MessageResponse:
    return service.delete_role(role_id, current_user)


@router.get(
    "/admin/stakeholder-gap-rules",
    response_model=StakeholderGapRulePageRead,
    summary="List stakeholder gap rules",
    description="Admin/KAM Head configurable stakeholder coverage gap rules with search, active state, and pagination.",
)
def list_stakeholder_gap_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)],
    search: str | None = None,
    active_state: Annotated[str, Query(pattern="^(all|active|inactive)$")] = "active",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> StakeholderGapRulePageRead:
    return service.list_rules(current_user, active_state=active_state, search=search, page=page, page_size=page_size, require_configure=True)


@router.post(
    "/admin/stakeholder-gap-rules",
    response_model=StakeholderGapRuleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create stakeholder gap rule",
    description="Creates a configurable coverage gap rule. Supported deterministic condition types include missing_role, missing_any_role, max_active_stakeholders, missing_any_influence, political_risk_present, and stale_interaction.",
)
def create_stakeholder_gap_rule(payload: StakeholderGapRuleCreateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)]) -> StakeholderGapRuleRead:
    return service.create_rule(payload, current_user)


@router.patch(
    "/admin/stakeholder-gap-rules/{rule_id}",
    response_model=StakeholderGapRuleRead,
    summary="Update stakeholder gap rule",
    description="Updates stakeholder coverage gap rule condition, labels, severity, ordering, or active state.",
)
def update_stakeholder_gap_rule(rule_id: str, payload: StakeholderGapRuleUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[StakeholderConfigService, Depends(get_stakeholder_config_service)]) -> StakeholderGapRuleRead:
    return service.update_rule(rule_id, payload, current_user)
