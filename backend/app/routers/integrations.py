from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status

from app.dependencies import get_current_user, get_integration_service
from app.models import User
from app.schemas import (
    AiGatewayRunPageRead,
    AiGatewayRunRead,
    FathomRedactRequest,
    FathomTaskSuggestionPageRead,
    FathomTaskSuggestionRead,
    IntegrationConnectionRead,
    IntegrationImportedItemPageRead,
    IntegrationImportedItemRead,
    IntegrationItemMapRequest,
    IntegrationItemReviewRequest,
    IntegrationMappingRulePageRead,
    IntegrationMappingRuleRead,
    IntegrationMappingRuleRequest,
    IntegrationProvider,
    IntegrationSyncResponse,
    IntegrationSyncLogPageRead,
    IntegrationSyncRunPageRead,
    MessageResponse,
    SecurityAlertSettingsRead,
    SecurityAlertSettingsUpdateRequest,
)
from app.services.integrations import IntegrationService

router = APIRouter(prefix="/api", tags=["Approved Integrations"])

Direction = Literal["asc", "desc"]
ActiveState = Literal["all", "active", "inactive"]


@router.post("/admin/integrations/{provider}/test", response_model=IntegrationSyncResponse, summary="Test integration connection", description="Runs a real provider connectivity check using configured credentials or provider environment settings.")
def test_integration(provider: IntegrationProvider, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationSyncResponse:
    return service.test_integration(provider, current_user)


@router.post("/admin/integrations/{provider}/retry", response_model=IntegrationSyncResponse, summary="Retry failed integration sync", description="Retries an integration after a failure and records retry count/backoff metadata.")
def retry_integration(provider: IntegrationProvider, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationSyncResponse:
    return service.retry_integration(provider, current_user)


@router.post("/admin/integrations/{provider}/disconnect", response_model=IntegrationConnectionRead, summary="Disconnect integration", description="Disables a provider connection and clears stored credentials.")
def disconnect_integration(provider: IntegrationProvider, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationConnectionRead:
    return service.disconnect_integration(provider, current_user)


@router.get("/admin/integrations/sync-runs", response_model=IntegrationSyncRunPageRead, summary="List integration sync runs", description="Paginated sync run history with provider, status, failure type, and date filtering.")
def list_sync_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    provider: str | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    failure_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> IntegrationSyncRunPageRead:
    return service.list_sync_runs(current_user, provider=provider, status_filter=status_filter, failure_type=failure_type, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.get("/admin/integrations/{provider}/logs", response_model=IntegrationSyncLogPageRead, summary="List provider integration logs", description="Lists sync logs for a single approved provider with status, severity, search, and date filtering.")
def list_provider_logs(
    provider: IntegrationProvider,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    severity: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> IntegrationSyncLogPageRead:
    return service.list_logs(current_user, provider=provider, status_filter=status_filter, severity=severity, date_from=date_from, date_to=date_to, search=search, page=page, page_size=page_size)


@router.get("/admin/integrations/{provider}/sync-runs", response_model=IntegrationSyncRunPageRead, summary="List provider sync runs", description="Lists sync runs for a single approved provider.")
def list_provider_sync_runs(
    provider: IntegrationProvider,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    failure_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> IntegrationSyncRunPageRead:
    return service.list_sync_runs(current_user, provider=provider, status_filter=status_filter, failure_type=failure_type, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.get("/admin/integrations/{provider}/mapping-rules", response_model=IntegrationMappingRulePageRead, summary="List integration mapping rules", description="Lists account/engagement mapping rules for a provider.")
def list_mapping_rules(provider: IntegrationProvider, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], search: str | None = None, active_state: ActiveState = "all", page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> IntegrationMappingRulePageRead:
    return service.list_mapping_rules(provider, current_user, search=search, active_state=active_state, page=page, page_size=page_size)


@router.post("/admin/integrations/{provider}/mapping-rules", response_model=IntegrationMappingRuleRead, status_code=status.HTTP_201_CREATED, summary="Create integration mapping rule", description="Creates a provider mapping rule for account/engagement auto-matching.")
def create_mapping_rule(provider: IntegrationProvider, payload: IntegrationMappingRuleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationMappingRuleRead:
    return service.create_mapping_rule(provider, payload, current_user)


@router.patch("/admin/integrations/{provider}/mapping-rules/{rule_id}", response_model=IntegrationMappingRuleRead, summary="Update integration mapping rule", description="Updates a provider mapping rule.")
def update_mapping_rule(provider: IntegrationProvider, rule_id: str, payload: IntegrationMappingRuleRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationMappingRuleRead:
    return service.update_mapping_rule(provider, rule_id, payload, current_user)


@router.delete("/admin/integrations/{provider}/mapping-rules/{rule_id}", response_model=MessageResponse, summary="Delete integration mapping rule", description="Deletes a provider mapping rule.")
def delete_mapping_rule(provider: IntegrationProvider, rule_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> MessageResponse:
    return service.delete_mapping_rule(provider, rule_id, current_user)


@router.get("/admin/integrations/imported-items", response_model=IntegrationImportedItemPageRead, summary="List imported integration items", description="Lists imported provider items pending mapping/review with search, filter, and pagination.")
def list_imported_items(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    provider: str | None = None,
    search: str | None = None,
    account_id: str | None = None,
    mapping_status: str | None = None,
    review_status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> IntegrationImportedItemPageRead:
    return service.list_imported_items(current_user, provider=provider, search=search, account_id=account_id, mapping_status=mapping_status, review_status=review_status, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.post("/admin/integrations/imported-items/{item_id}/map", response_model=IntegrationImportedItemRead, summary="Map imported item", description="Maps an imported item to an account and optional engagement.")
def map_imported_item(item_id: str, payload: IntegrationItemMapRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.map_imported_item(item_id, payload, current_user)


@router.get("/integrations/calendar/events", response_model=IntegrationImportedItemPageRead, summary="List imported Calendar events", description="Lists imported Google Calendar events pending or completed mapping/review.")
def list_calendar_imported_events(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], search: str | None = None, account_id: str | None = None, mapping_status: str | None = None, review_status: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> IntegrationImportedItemPageRead:
    return service.list_imported_items(current_user, provider="google_calendar", search=search, account_id=account_id, mapping_status=mapping_status, review_status=review_status, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.post("/integrations/calendar/events/{event_id}/map", response_model=IntegrationImportedItemRead, summary="Map imported Calendar event", description="Maps an imported Google Calendar event to an account and optional engagement.")
def map_calendar_imported_event(event_id: str, payload: IntegrationItemMapRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.map_imported_item(event_id, payload, current_user)


@router.post("/admin/integrations/fathom/items/{item_id}/approve", response_model=IntegrationImportedItemRead, summary="Approve Fathom item", description="Approves a Fathom summary and writes a source-linked timeline event.")
def approve_fathom_item(item_id: str, payload: IntegrationItemReviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.approve_fathom_item(item_id, payload, current_user)


@router.post("/admin/integrations/fathom/items/{item_id}/reject", response_model=IntegrationImportedItemRead, summary="Reject Fathom item", description="Rejects a Fathom summary and keeps the review audit trail.")
def reject_fathom_item(item_id: str, payload: IntegrationItemReviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.reject_fathom_item(item_id, payload, current_user)


@router.post("/admin/integrations/fathom/items/{item_id}/redact", response_model=IntegrationImportedItemRead, summary="Redact Fathom item", description="Stores a redacted Fathom summary before approval.")
def redact_fathom_item(item_id: str, payload: FathomRedactRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.redact_fathom_item(item_id, payload, current_user)


@router.get("/integrations/fathom/items", response_model=IntegrationImportedItemPageRead, summary="List Fathom imported items", description="Lists imported Fathom summaries/transcripts for review.")
def list_fathom_items(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], search: str | None = None, account_id: str | None = None, mapping_status: str | None = None, review_status: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> IntegrationImportedItemPageRead:
    return service.list_imported_items(current_user, provider="fathom", search=search, account_id=account_id, mapping_status=mapping_status, review_status=review_status, date_from=date_from, date_to=date_to, page=page, page_size=page_size)


@router.post("/integrations/fathom/items/{item_id}/approve", response_model=IntegrationImportedItemRead, summary="Approve Fathom item", description="Approves a Fathom summary and writes a source-linked timeline event.")
def approve_fathom_item_alias(item_id: str, payload: IntegrationItemReviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.approve_fathom_item(item_id, payload, current_user)


@router.post("/integrations/fathom/items/{item_id}/reject", response_model=IntegrationImportedItemRead, summary="Reject Fathom item", description="Rejects a Fathom summary.")
def reject_fathom_item_alias(item_id: str, payload: IntegrationItemReviewRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.reject_fathom_item(item_id, payload, current_user)


@router.patch("/integrations/fathom/items/{item_id}/redact", response_model=IntegrationImportedItemRead, summary="Redact Fathom item", description="Stores a redacted Fathom summary before approval.")
def redact_fathom_item_alias(item_id: str, payload: FathomRedactRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> IntegrationImportedItemRead:
    return service.redact_fathom_item(item_id, payload, current_user)


@router.get("/fathom-task-suggestions", response_model=FathomTaskSuggestionPageRead, summary="List Fathom task suggestions", description="Lists Fathom-derived action item suggestions for review and task creation.")
def list_fathom_task_suggestions(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], status_filter: Annotated[str | None, Query(alias="status")] = None, account_id: str | None = None, search: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> FathomTaskSuggestionPageRead:
    return service.list_fathom_task_suggestions(current_user, status_filter=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)


@router.get("/integrations/fathom/task-suggestions", response_model=FathomTaskSuggestionPageRead, summary="List Fathom task suggestions", description="Lists Fathom-derived action item suggestions for review and task creation.")
def list_fathom_task_suggestions_alias(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], status_filter: Annotated[str | None, Query(alias="status")] = None, account_id: str | None = None, search: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> FathomTaskSuggestionPageRead:
    return service.list_fathom_task_suggestions(current_user, status_filter=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)


@router.post("/fathom-task-suggestions/{suggestion_id}/approve", response_model=FathomTaskSuggestionRead, summary="Approve Fathom task suggestion", description="Approves a Fathom action item suggestion and creates a task for the current user.")
def approve_fathom_task_suggestion(suggestion_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> FathomTaskSuggestionRead:
    return service.approve_fathom_task_suggestion(suggestion_id, current_user)


@router.post("/integrations/fathom/task-suggestions/{suggestion_id}/approve", response_model=FathomTaskSuggestionRead, summary="Approve Fathom task suggestion", description="Approves a Fathom action item suggestion and creates a task for the current user.")
def approve_fathom_task_suggestion_alias(suggestion_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> FathomTaskSuggestionRead:
    return service.approve_fathom_task_suggestion(suggestion_id, current_user)


@router.post("/fathom-task-suggestions/{suggestion_id}/reject", response_model=FathomTaskSuggestionRead, summary="Reject Fathom task suggestion", description="Rejects a Fathom action item suggestion.")
def reject_fathom_task_suggestion(suggestion_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> FathomTaskSuggestionRead:
    return service.reject_fathom_task_suggestion(suggestion_id, current_user)


@router.post("/integrations/fathom/task-suggestions/{suggestion_id}/reject", response_model=FathomTaskSuggestionRead, summary="Reject Fathom task suggestion", description="Rejects a Fathom action item suggestion.")
def reject_fathom_task_suggestion_alias(suggestion_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> FathomTaskSuggestionRead:
    return service.reject_fathom_task_suggestion(suggestion_id, current_user)


@router.post("/integrations/fathom/webhook", response_model=MessageResponse, summary="Receive Fathom webhook", description="Receives signed Fathom meeting content webhooks and stores them as imported review items.")
async def receive_fathom_webhook(request: Request, service: Annotated[IntegrationService, Depends(get_integration_service)]) -> MessageResponse:
    return service.handle_fathom_webhook(request.headers, await request.body())


@router.get("/admin/settings/security-alert-email", response_model=SecurityAlertSettingsRead, summary="Read administration alert email", description="Returns the email used for integration/security failure alerts.")
def read_security_alert_settings(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> SecurityAlertSettingsRead:
    return service.read_security_alert_settings(current_user)


@router.patch("/admin/settings/security-alert-email", response_model=SecurityAlertSettingsRead, summary="Update administration alert email", description="Updates the email used for integration/security failure alerts.")
def update_security_alert_settings(payload: SecurityAlertSettingsUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> SecurityAlertSettingsRead:
    return service.update_security_alert_settings(payload, current_user)


@router.get("/admin/settings/security-alerts", response_model=SecurityAlertSettingsRead, summary="Read administration alert settings", description="Returns integration/security failure alert settings.")
def read_security_alert_settings_alias(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> SecurityAlertSettingsRead:
    return service.read_security_alert_settings(current_user)


@router.patch("/admin/settings/security-alerts", response_model=SecurityAlertSettingsRead, summary="Update administration alert settings", description="Updates integration/security failure alert settings.")
def update_security_alert_settings_alias(payload: SecurityAlertSettingsUpdateRequest, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> SecurityAlertSettingsRead:
    return service.update_security_alert_settings(payload, current_user)


@router.get("/admin/integrations/ai-gateway-runs", response_model=AiGatewayRunPageRead, summary="List AI Gateway runs", description="Lists unified AI/LLM Gateway run audit records.")
def list_ai_gateway_runs(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], request_type: str | None = None, status_filter: Annotated[str | None, Query(alias="status")] = None, account_id: str | None = None, search: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> AiGatewayRunPageRead:
    return service.list_ai_gateway_runs(current_user, request_type=request_type, status_filter=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)


@router.get("/admin/ai-gateway/runs", response_model=AiGatewayRunPageRead, summary="List AI Gateway runs", description="Lists unified AI/LLM Gateway run audit records.")
def list_ai_gateway_runs_alias(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)], request_type: str | None = None, status_filter: Annotated[str | None, Query(alias="status")] = None, account_id: str | None = None, search: str | None = None, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 10) -> AiGatewayRunPageRead:
    return service.list_ai_gateway_runs(current_user, request_type=request_type, status_filter=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)


@router.get("/admin/integrations/ai-gateway-runs/{run_id}", response_model=AiGatewayRunRead, summary="Read AI Gateway run", description="Reads a single AI/LLM Gateway audit run with account authorization.")
def get_ai_gateway_run(run_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> AiGatewayRunRead:
    return service.get_ai_gateway_run(run_id, current_user)


@router.get("/admin/ai-gateway/runs/{run_id}", response_model=AiGatewayRunRead, summary="Read AI Gateway run", description="Reads a single AI/LLM Gateway audit run with account authorization.")
def get_ai_gateway_run_alias(run_id: str, current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> AiGatewayRunRead:
    return service.get_ai_gateway_run(run_id, current_user)


@router.get("/admin/integrations/google-calendar/oauth-url", response_model=dict[str, str], summary="Create Google Calendar OAuth URL", description="Returns the Google OAuth authorization URL for Calendar event read/write scopes.")
def google_oauth_authorize_url(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> dict[str, str]:
    return service.google_oauth_authorize_url(current_user)


@router.get("/integrations/google-calendar/oauth/authorize", response_model=dict[str, str], summary="Create Google Calendar OAuth URL", description="Returns the Google OAuth authorization URL for Calendar event read/write scopes.")
def google_oauth_authorize_url_alias(current_user: Annotated[User, Depends(get_current_user)], service: Annotated[IntegrationService, Depends(get_integration_service)]) -> dict[str, str]:
    return service.google_oauth_authorize_url(current_user)


@router.get("/admin/integrations/google-calendar/oauth-callback", response_model=IntegrationConnectionRead, summary="Complete Google Calendar OAuth", description="Exchanges a Google authorization code and stores Calendar tokens for the integration.")
def google_oauth_callback(code: str, service: Annotated[IntegrationService, Depends(get_integration_service)], state: str | None = None) -> IntegrationConnectionRead:
    return service.google_oauth_callback(code, state)


@router.get("/integrations/google-calendar/oauth/callback", response_model=IntegrationConnectionRead, summary="Complete Google Calendar OAuth", description="Exchanges a Google authorization code and stores Calendar tokens for the integration.")
def google_oauth_callback_alias(code: str, service: Annotated[IntegrationService, Depends(get_integration_service)], state: str | None = None) -> IntegrationConnectionRead:
    return service.google_oauth_callback(code, state)
