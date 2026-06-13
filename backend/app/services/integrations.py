from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import error, parse, request

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Account,
    AiGatewayRun,
    FathomTaskSuggestion,
    GovernanceEvent,
    IntegrationConnection,
    IntegrationImportedItem,
    IntegrationMappingRule,
    IntegrationSyncLog,
    IntegrationSyncRun,
    Task,
    User,
    utc_now,
)
from app.rbac import ADMIN_MODULE
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.integrations import IntegrationRepository
from app.repositories.platform_settings import PlatformSettingRepository
from app.repositories.rbac import RbacRepository
from app.repositories.playbooks_tasks import PlaybooksTasksRepository
from app.repositories.timeline import TimelineRepository
from app.repositories.users import UserRepository
from app.schemas import (
    AiGatewayRunPageRead,
    AiGatewayRunRead,
    FathomRedactRequest,
    FathomTaskSuggestionPageRead,
    FathomTaskSuggestionRead,
    IntegrationConnectionRead,
    IntegrationConnectionUpdateRequest,
    IntegrationImportedItemPageRead,
    IntegrationImportedItemRead,
    IntegrationItemMapRequest,
    IntegrationItemReviewRequest,
    IntegrationMappingRulePageRead,
    IntegrationMappingRuleRead,
    IntegrationMappingRuleRequest,
    IntegrationSyncLogPageRead,
    IntegrationSyncLogRead,
    IntegrationSyncResponse,
    IntegrationSyncRunPageRead,
    IntegrationSyncRunRead,
    MessageResponse,
    SecurityAlertSettingsRead,
    SecurityAlertSettingsUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.email_delivery import EmailDeliveryService
from app.services.email_domains import field_validation_error
from app.services.secret_encryption import decrypt_credentials, encrypt_credentials
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

INTEGRATIONS_MODULE = "integrations"
SECURITY_ALERT_EMAIL_KEY = "security_alert_administration_email"
DEFAULT_SECURITY_ALERT_EMAIL = "abdul.rehman@tkxel.io"
APPROVED_PROVIDERS = ("google_calendar", "csat", "ai_llm_gateway")
RETIRED_ADMIN_PROVIDERS = {"fathom"}
HISTORICAL_PROVIDERS = set(APPROVED_PROVIDERS) | RETIRED_ADMIN_PROVIDERS
PROVIDER_DISPLAY_NAMES = {
    "google_calendar": "Google Calendar",
    "fathom": "Fathom",
    "csat": "CSAT",
    "ai_llm_gateway": "AI/LLM Gateway",
}
SECRET_KEYS = {"access_token", "refresh_token", "api_key", "client_secret", "webhook_secret", "password", "secret", "token"}
GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"


def canonical_provider(provider: str) -> str:
    normalized = provider.strip().lower().replace("-", "_")
    aliases = {"googlecalendar": "google_calendar", "ai_gateway": "ai_llm_gateway", "ai-llm-gateway": "ai_llm_gateway"}
    normalized = aliases.get(normalized, normalized)
    if normalized in RETIRED_ADMIN_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration provider was not found")
    if normalized not in APPROVED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported integration provider")
    return normalized


def canonical_history_provider(provider: str) -> str:
    normalized = provider.strip().lower().replace("-", "_")
    aliases = {"googlecalendar": "google_calendar", "ai_gateway": "ai_llm_gateway", "ai-llm-gateway": "ai_llm_gateway"}
    normalized = aliases.get(normalized, normalized)
    if normalized not in HISTORICAL_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported integration provider")
    return normalized


def sanitize_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        sanitized: dict[str, Any] = {}
        for key, value in payload.items():
            if key.lower() in SECRET_KEYS or any(secret in key.lower() for secret in ("token", "secret", "password", "api_key")):
                sanitized[key] = "***"
            else:
                sanitized[key] = sanitize_payload(value)
        return sanitized
    if isinstance(payload, list):
        return [sanitize_payload(item) for item in payload]
    return payload


class IntegrationService:
    def __init__(
        self,
        db: Session,
        repository: IntegrationRepository | None = None,
        email_delivery: EmailDeliveryService | None = None,
    ) -> None:
        self.db = db
        self.repository = repository or IntegrationRepository(db)
        self.accounts = AccountRepository(db)
        self.users = UserRepository(db)
        self.tasks = PlaybooksTasksRepository(db)
        self.platform_settings = PlatformSettingRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.email_delivery = email_delivery or EmailDeliveryService()
        self.settings = get_settings()

    def seed_defaults(self, actor: User | None = None) -> None:
        for provider in APPROVED_PROVIDERS:
            self._get_or_create_connection(provider)
        if self.platform_settings.get_by_key(SECURITY_ALERT_EMAIL_KEY) is None:
            self.platform_settings.set_value(SECURITY_ALERT_EMAIL_KEY, DEFAULT_SECURITY_ALERT_EMAIL, updated_by_id=actor.id if actor else None)
        self.repository.commit()

    def list_integrations(
        self,
        current_user: User,
        *,
        provider: str | None = None,
        status_filter: str | None = None,
        error_state: str | None = None,
        last_synced_from: datetime | None = None,
        last_synced_to: datetime | None = None,
    ) -> list[IntegrationConnectionRead]:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        self.seed_defaults()
        connections = self.repository.list_connections()
        if provider:
            canonical = canonical_provider(provider)
            connections = [item for item in connections if item.provider == canonical]
        if status_filter:
            connections = [item for item in connections if item.status == status_filter]
        if error_state == "with_errors":
            connections = [item for item in connections if item.last_error]
        if error_state == "without_errors":
            connections = [item for item in connections if not item.last_error]
        if last_synced_from:
            connections = [item for item in connections if item.last_synced_at and item.last_synced_at >= last_synced_from]
        if last_synced_to:
            connections = [item for item in connections if item.last_synced_at and item.last_synced_at <= last_synced_to]
        return [self._connection_read(item) for item in connections if item.provider in APPROVED_PROVIDERS]

    def update_integration(self, provider: str, payload: IntegrationConnectionUpdateRequest, current_user: User) -> IntegrationConnectionRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        canonical = canonical_provider(provider)
        connection = self._get_or_create_connection(canonical)
        before = self._connection_read(connection).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        if "credentials_json" in updates and updates["credentials_json"] is not None:
            updates["credentials_json"] = encrypt_credentials(self._validate_credentials(canonical, updates["credentials_json"]))
        if "settings_json" in updates and updates["settings_json"] is not None:
            updates["settings_json"] = self._validate_settings(canonical, updates["settings_json"])
        if "scopes" in updates and updates["scopes"] is not None:
            updates["scopes"] = self._validate_scopes(canonical, updates["scopes"])
        for field, value in updates.items():
            setattr(connection, field, value)
        if connection.enabled and connection.status in {"configuration_required", "disabled"}:
            connection.status = "connected" if self._has_required_config(canonical, connection) else "configuration_required"
        if not connection.enabled:
            connection.status = "disabled"
        self.audit.log(module=INTEGRATIONS_MODULE, action="update", entity_type="integration_connection", entity_id=connection.id, actor=current_user, before_value=before, after_value=self._connection_read(connection).model_dump(mode="json"))
        self.repository.commit()
        return self._connection_read(connection)

    def test_integration(self, provider: str, current_user: User) -> IntegrationSyncResponse:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        canonical = canonical_provider(provider)
        connection = self._get_or_create_connection(canonical)
        message = ""
        try:
            self._test_provider(canonical, connection)
            connection.status = "connected"
            connection.last_test_status = "success"
            connection.last_error = None
            message = f"{PROVIDER_DISPLAY_NAMES[canonical]} connection test passed."
            errors = 0
        except Exception as exc:
            connection.status = "configuration_required" if isinstance(exc, ValueError) else "error"
            connection.last_test_status = "failed"
            connection.last_error = str(exc)
            message = str(exc)
            errors = 1
            self._record_failure(connection, "test", message, current_user)
        connection.last_tested_at = utc_now()
        self._sync_log(canonical, "test", connection.last_test_status or "failed", message)
        self.audit.log(module=INTEGRATIONS_MODULE, action="test", entity_type="integration_connection", entity_id=connection.id, actor=current_user, after_value={"provider": canonical, "status": connection.status})
        self.repository.commit()
        return IntegrationSyncResponse(provider=canonical, status=connection.status, errors=errors, message=message)

    def sync_integration(self, provider: str, current_user: User, *, trigger_type: str = "manual", retry_count: int = 0) -> IntegrationSyncResponse:
        self._require_sync_permission(current_user)
        canonical = canonical_provider(provider)
        connection = self._get_or_create_connection(canonical)
        run = IntegrationSyncRun(provider=canonical, trigger_type=trigger_type, status="running", actor_id=current_user.id, actor_name=current_user.full_name, retry_count=retry_count)
        self.repository.add_sync_run(run)
        if not connection.enabled or connection.status == "disabled":
            return self._finish_sync_failure(connection, run, "configuration_required", f"{PROVIDER_DISPLAY_NAMES[canonical]} is disabled or not configured.", current_user)
        if not self._has_required_config(canonical, connection):
            return self._finish_sync_failure(connection, run, "configuration_required", f"{PROVIDER_DISPLAY_NAMES[canonical]} credentials/configuration are required before sync.", current_user)
        try:
            created, updated, skipped = self._sync_provider(canonical, connection, current_user)
            run.status = "success"
            run.created_count = created
            run.updated_count = updated
            run.skipped_count = skipped
            run.message = (
                "Google Calendar inbound sync is disabled; governance events are pushed outbound only."
                if canonical == "google_calendar"
                else f"Synced {created} created, {updated} updated, {skipped} skipped."
            )
            run.finished_at = utc_now()
            connection.status = "connected"
            connection.last_error = None
            connection.failure_count = 0
            connection.last_failure_key = None
            connection.next_retry_at = None
            connection.last_synced_at = utc_now()
            self._sync_log(canonical, "sync", "success", run.message)
            self.audit.log(module=INTEGRATIONS_MODULE, action="sync", entity_type="integration_sync_run", entity_id=run.id, actor=current_user, after_value={"provider": canonical, "created": created, "updated": updated, "skipped": skipped})
            self.repository.commit()
            return IntegrationSyncResponse(provider=canonical, status=connection.status, created=created, updated=updated, skipped=skipped, message=run.message)
        except Exception as exc:
            return self._finish_sync_failure(connection, run, "error", str(exc), current_user)

    def retry_integration(self, provider: str, current_user: User) -> IntegrationSyncResponse:
        self._require_sync_permission(current_user)
        connection = self._get_or_create_connection(canonical_provider(provider))
        return self.sync_integration(connection.provider, current_user, trigger_type="retry", retry_count=connection.failure_count)

    def disconnect_integration(self, provider: str, current_user: User) -> IntegrationConnectionRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        connection = self._get_or_create_connection(canonical_provider(provider))
        before = self._connection_read(connection).model_dump(mode="json")
        connection.enabled = False
        connection.status = "disabled"
        connection.credentials_json = None
        connection.sync_token = None
        connection.last_error = None
        self.audit.log(module=INTEGRATIONS_MODULE, action="disconnect", entity_type="integration_connection", entity_id=connection.id, actor=current_user, before_value=before, after_value=self._connection_read(connection).model_dump(mode="json"))
        self.repository.commit()
        return self._connection_read(connection)

    def list_logs(
        self,
        current_user: User,
        provider: str | None = None,
        status_filter: str | None = None,
        severity: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> IntegrationSyncLogPageRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        canonical = canonical_history_provider(provider) if provider else None
        items, total = self.repository.list_sync_logs(provider=canonical, status=status_filter, severity=severity, date_from=date_from, date_to=date_to, search=search, page=page, page_size=page_size)
        sanitized = [IntegrationSyncLogRead.model_validate(item) for item in items]
        for item in sanitized:
            item.payload = sanitize_payload(item.payload)
        return IntegrationSyncLogPageRead(items=sanitized, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def list_sync_runs(self, current_user: User, provider: str | None = None, status_filter: str | None = None, failure_type: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, page: int = 1, page_size: int = 10) -> IntegrationSyncRunPageRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        canonical = canonical_history_provider(provider) if provider else None
        items, total = self.repository.list_sync_runs(provider=canonical, status=status_filter, failure_type=failure_type, date_from=date_from, date_to=date_to, page=page, page_size=page_size)
        return IntegrationSyncRunPageRead(items=[IntegrationSyncRunRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def list_mapping_rules(self, provider: str, current_user: User, *, search: str | None = None, active_state: str = "all", page: int = 1, page_size: int = 10) -> IntegrationMappingRulePageRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        canonical = canonical_provider(provider)
        items, total = self.repository.list_mapping_rules(provider=canonical, search=search, active_state=active_state, page=page, page_size=page_size)
        return IntegrationMappingRulePageRead(items=[IntegrationMappingRuleRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_mapping_rule(self, provider: str, payload: IntegrationMappingRuleRequest, current_user: User) -> IntegrationMappingRuleRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        canonical = canonical_provider(provider)
        self._validate_mapping_targets(payload.target_account_id, payload.target_engagement_id)
        rule = IntegrationMappingRule(provider=canonical, created_by_id=current_user.id, updated_by_id=current_user.id, **payload.model_dump())
        self.repository.save_mapping_rule(rule)
        self.audit.log(module=INTEGRATIONS_MODULE, action="create_mapping_rule", entity_type="integration_mapping_rule", entity_id=rule.id, actor=current_user, after_value=IntegrationMappingRuleRead.model_validate(rule).model_dump(mode="json"))
        self.repository.commit()
        return IntegrationMappingRuleRead.model_validate(rule)

    def update_mapping_rule(self, provider: str, rule_id: str, payload: IntegrationMappingRuleRequest, current_user: User) -> IntegrationMappingRuleRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        canonical = canonical_provider(provider)
        rule = self.repository.get_mapping_rule(rule_id)
        if rule is None or rule.provider != canonical:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mapping rule was not found")
        self._validate_mapping_targets(payload.target_account_id, payload.target_engagement_id)
        before = IntegrationMappingRuleRead.model_validate(rule).model_dump(mode="json")
        for field, value in payload.model_dump().items():
            setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        self.audit.log(module=INTEGRATIONS_MODULE, action="update_mapping_rule", entity_type="integration_mapping_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=IntegrationMappingRuleRead.model_validate(rule).model_dump(mode="json"))
        self.repository.commit()
        return IntegrationMappingRuleRead.model_validate(rule)

    def delete_mapping_rule(self, provider: str, rule_id: str, current_user: User) -> MessageResponse:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        canonical = canonical_provider(provider)
        rule = self.repository.get_mapping_rule(rule_id)
        if rule is None or rule.provider != canonical:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mapping rule was not found")
        self.audit.log(module=INTEGRATIONS_MODULE, action="delete_mapping_rule", entity_type="integration_mapping_rule", entity_id=rule.id, actor=current_user)
        self.repository.delete_mapping_rule(rule)
        self.repository.commit()
        return MessageResponse(message="Mapping rule deleted")

    def list_imported_items(self, current_user: User, **filters: Any) -> IntegrationImportedItemPageRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        if filters.get("provider"):
            filters["provider"] = canonical_history_provider(filters["provider"])
        items, total = self.repository.list_imported_items(**filters)
        visible = [item for item in items if self._can_view_imported_item(current_user, item)]
        return IntegrationImportedItemPageRead(items=[IntegrationImportedItemRead.model_validate(item) for item in visible], total=total, page=filters.get("page", 1), page_size=filters.get("page_size", 10), pages=page_count(total, filters.get("page_size", 10)))

    def map_imported_item(self, item_id: str, payload: IntegrationItemMapRequest, current_user: User) -> IntegrationImportedItemRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        item = self._imported_item_or_404(item_id)
        account = self._account_or_404(payload.account_id)
        self.access.require_account_update(current_user, account, module=INTEGRATIONS_MODULE)
        item.account_id = account.id
        item.engagement_id = payload.engagement_id
        item.mapping_status = "mapped"
        item.review_required = False
        self.repository.commit()
        return IntegrationImportedItemRead.model_validate(item)

    def approve_fathom_item(self, item_id: str, payload: IntegrationItemReviewRequest, current_user: User) -> IntegrationImportedItemRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        item = self._provider_item_or_404(item_id, "fathom")
        account_id = payload.account_id or item.account_id
        if not account_id:
            raise field_validation_error("account_id", "Account mapping is required before approving a Fathom item.")
        account = self._account_or_404(account_id)
        self.access.require_account_update(current_user, account, module="governance_reviews")
        item.account_id = account.id
        item.engagement_id = payload.engagement_id or item.engagement_id
        item.mapping_status = "mapped"
        item.review_status = "approved"
        item.review_required = False
        item.reviewed_by_id = current_user.id
        item.reviewed_by_name = current_user.full_name
        item.reviewed_at = utc_now()
        timeline = self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=item.engagement_id,
            title=f"Fathom summary approved: {item.title}",
            description=item.description or payload.notes or "Fathom meeting summary approved.",
            actor=current_user,
            event_type="governance_event",
            module="governance_reviews",
            source_record_id=item.id,
            source_record_type="fathom",
            source_record_route="/admin?section=integrations",
            metadata={"provider": "fathom", "external_id": item.external_id},
            idempotency_key=f"fathom:{item.external_id}:approved",
        )
        item.result_record_type = "timeline_entry"
        item.result_record_id = timeline.id
        self.audit.log(module=INTEGRATIONS_MODULE, action="approve_fathom_item", entity_type="integration_imported_item", entity_id=item.id, actor=current_user, after_value={"timeline_entry_id": timeline.id})
        self.repository.commit()
        return IntegrationImportedItemRead.model_validate(item)

    def reject_fathom_item(self, item_id: str, payload: IntegrationItemReviewRequest, current_user: User) -> IntegrationImportedItemRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        item = self._provider_item_or_404(item_id, "fathom")
        item.review_status = "rejected"
        item.reviewed_by_id = current_user.id
        item.reviewed_by_name = current_user.full_name
        item.reviewed_at = utc_now()
        self.audit.log(module=INTEGRATIONS_MODULE, action="reject_fathom_item", entity_type="integration_imported_item", entity_id=item.id, actor=current_user, after_value={"reason": payload.notes})
        self.repository.commit()
        return IntegrationImportedItemRead.model_validate(item)

    def redact_fathom_item(self, item_id: str, payload: FathomRedactRequest, current_user: User) -> IntegrationImportedItemRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        item = self._provider_item_or_404(item_id, "fathom")
        item.description = payload.redacted_description
        item.sanitized_payload_json = {**(item.sanitized_payload_json or {}), "redacted": True}
        self.audit.log(module=INTEGRATIONS_MODULE, action="redact_fathom_item", entity_type="integration_imported_item", entity_id=item.id, actor=current_user, after_value={"redacted": True})
        self.repository.commit()
        return IntegrationImportedItemRead.model_validate(item)

    def list_fathom_task_suggestions(self, current_user: User, *, status_filter: str | None = None, account_id: str | None = None, search: str | None = None, page: int = 1, page_size: int = 10) -> FathomTaskSuggestionPageRead:
        self.access.require_module_permission(current_user, "playbooks_tasks_calendar", "view")
        items, total = self.repository.list_fathom_suggestions(status=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)
        visible = [item for item in items if not item.account_id or self._can_view_account_id(current_user, item.account_id)]
        return FathomTaskSuggestionPageRead(items=[FathomTaskSuggestionRead.model_validate(item) for item in visible], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def approve_fathom_task_suggestion(self, suggestion_id: str, current_user: User) -> FathomTaskSuggestionRead:
        self.access.require_module_permission(current_user, "playbooks_tasks_calendar", "create")
        suggestion = self.repository.get_fathom_suggestion(suggestion_id)
        if suggestion is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fathom task suggestion was not found")
        if suggestion.status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending suggestions can be approved")
        if not suggestion.account_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Suggestion must be mapped to an account before task creation")
        account = self._account_or_404(suggestion.account_id)
        self.access.require_account_update(current_user, account, module="playbooks_tasks_calendar")
        task = Task(
            account_id=account.id,
            engagement_id=suggestion.engagement_id,
            source_type="fathom_suggestion",
            source_record_id=suggestion.id,
            title=suggestion.title,
            description=suggestion.description,
            owner_id=current_user.id,
            owner_name=current_user.full_name,
            due_at=suggestion.suggested_due_at or utc_now() + timedelta(days=7),
            status="open",
            priority="medium",
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            updated_by_id=current_user.id,
        )
        self.tasks.save_task(task)
        suggestion.status = "approved"
        suggestion.reviewer_id = current_user.id
        suggestion.reviewer_name = current_user.full_name
        suggestion.reviewed_at = utc_now()
        suggestion.created_task_id = task.id
        self.audit.log(module=INTEGRATIONS_MODULE, action="approve_fathom_task_suggestion", entity_type="fathom_task_suggestion", entity_id=suggestion.id, actor=current_user, after_value={"task_id": task.id})
        self.repository.commit()
        return FathomTaskSuggestionRead.model_validate(suggestion)

    def reject_fathom_task_suggestion(self, suggestion_id: str, current_user: User) -> FathomTaskSuggestionRead:
        self.access.require_module_permission(current_user, "playbooks_tasks_calendar", "update")
        suggestion = self.repository.get_fathom_suggestion(suggestion_id)
        if suggestion is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fathom task suggestion was not found")
        if suggestion.status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending suggestions can be rejected")
        suggestion.status = "rejected"
        suggestion.reviewer_id = current_user.id
        suggestion.reviewer_name = current_user.full_name
        suggestion.reviewed_at = utc_now()
        self.audit.log(module=INTEGRATIONS_MODULE, action="reject_fathom_task_suggestion", entity_type="fathom_task_suggestion", entity_id=suggestion.id, actor=current_user)
        self.repository.commit()
        return FathomTaskSuggestionRead.model_validate(suggestion)

    def read_security_alert_settings(self, current_user: User) -> SecurityAlertSettingsRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        return self._security_alert_settings_read()

    def update_security_alert_settings(self, payload: SecurityAlertSettingsUpdateRequest, current_user: User) -> SecurityAlertSettingsRead:
        self.access.require_module_permission(current_user, ADMIN_MODULE, "configure")
        before = self._security_alert_settings_read().model_dump(mode="json")
        email = str(payload.administration_email).strip().lower()
        setting = self.platform_settings.set_value(SECURITY_ALERT_EMAIL_KEY, email, updated_by_id=current_user.id)
        self.audit.log(module=ADMIN_MODULE, action="configure_security_alert_email", entity_type="platform_setting", entity_id=setting.id, actor=current_user, before_value=before, after_value={"administration_email": email})
        self.repository.commit()
        return self._security_alert_settings_read()

    def list_ai_gateway_runs(self, current_user: User, *, request_type: str | None = None, status_filter: str | None = None, account_id: str | None = None, search: str | None = None, page: int = 1, page_size: int = 10) -> AiGatewayRunPageRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        items, total = self.repository.list_ai_runs(request_type=request_type, status=status_filter, account_id=account_id, search=search, page=page, page_size=page_size)
        visible = [item for item in items if not item.account_id or self._can_view_account_id(current_user, item.account_id)]
        return AiGatewayRunPageRead(items=[AiGatewayRunRead.model_validate(item) for item in visible], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_ai_gateway_run(self, run_id: str, current_user: User) -> AiGatewayRunRead:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "view")
        run = self.repository.get_ai_run(run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Gateway run was not found")
        if run.account_id and not self._can_view_account_id(current_user, run.account_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this AI Gateway run")
        return AiGatewayRunRead.model_validate(run)

    def log_ai_gateway_run(self, *, request_type: str, status_value: str, actor: User | None = None, account_id: str | None = None, engagement_id: str | None = None, permission_scope: dict | None = None, source_context: list | None = None, research_sources: list | None = None, response_labels: list | None = None, prompt: dict | None = None, response: dict | None = None, feedback: dict | None = None, latency_ms: int | None = None, usage: dict | None = None, error_message: str | None = None, affected_records: list | None = None, commit: bool = True) -> AiGatewayRun:
        run = AiGatewayRun(
            request_type=request_type,
            status=status_value,
            actor_id=actor.id if actor else None,
            actor_name=actor.full_name if actor else None,
            account_id=account_id,
            engagement_id=engagement_id,
            permission_scope_json=permission_scope or {},
            source_context_json=source_context or [],
            research_sources_json=research_sources or [],
            response_labels_json=response_labels or ["AI-assisted", "Advisory"],
            prompt_json=prompt or {},
            response_json=response or {},
            feedback_json=feedback or {},
            latency_ms=latency_ms,
            usage_json=usage or {},
            error_message=error_message,
            affected_records_json=affected_records or [],
        )
        self.repository.save_ai_run(run)
        if commit:
            self.repository.commit()
        return run

    def handle_fathom_webhook(self, headers: Mapping[str, str], raw_body: bytes) -> MessageResponse:
        connection = self._get_or_create_connection("fathom")
        if not connection.enabled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fathom integration is disabled")
        self._verify_fathom_webhook(headers, raw_body, connection)
        webhook_id = self._header_value(headers, "webhook-id")
        if webhook_id and self.repository.get_sync_log_by_source(provider="fathom", action="webhook", source_record_id=webhook_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fathom webhook event was already processed")
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fathom webhook payload is not valid JSON") from exc
        records = payload if isinstance(payload, list) else [payload.get("meeting") if isinstance(payload, dict) and isinstance(payload.get("meeting"), dict) else payload]
        created = updated = 0
        for record in records:
            if not isinstance(record, dict):
                continue
            item, was_created = self._upsert_imported_item("fathom", record, connection)
            if was_created:
                created += 1
            else:
                updated += 1
        self._sync_log("fathom", "webhook", "success", f"Fathom webhook accepted: {created} created, {updated} updated.", source_record_id=webhook_id, deduplication_key=f"fathom:webhook:{webhook_id}" if webhook_id else None, payload={"created": created, "updated": updated})
        self.repository.commit()
        return MessageResponse(message="Fathom webhook accepted")

    def google_oauth_authorize_url(self, current_user: User) -> dict[str, str]:
        self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        if not self.settings.google_calendar_client_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Calendar OAuth is not configured")
        query = parse.urlencode(
            {
                "client_id": self.settings.google_calendar_client_id,
                "redirect_uri": self.settings.google_calendar_redirect_uri,
                "response_type": "code",
                "scope": GOOGLE_CALENDAR_SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "state": current_user.id,
            }
        )
        return {"authorization_url": f"https://accounts.google.com/o/oauth2/v2/auth?{query}"}

    def google_oauth_callback(self, code: str, state: str | None = None) -> IntegrationConnectionRead:
        if not self.settings.google_calendar_client_id or not self.settings.google_calendar_client_secret:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google Calendar OAuth is not configured")
        token_payload = self._exchange_google_code(code)
        connection = self._get_or_create_connection("google_calendar")
        current_credentials = self._credentials(connection)
        connection.credentials_json = encrypt_credentials({
            "access_token": token_payload.get("access_token"),
            "refresh_token": token_payload.get("refresh_token") or current_credentials.get("refresh_token"),
            "token_type": token_payload.get("token_type"),
        })
        connection.scopes = str(token_payload.get("scope", GOOGLE_CALENDAR_SCOPE)).split()
        expires_in = int(token_payload.get("expires_in", 0) or 0)
        connection.token_expires_at = utc_now() + timedelta(seconds=expires_in) if expires_in else None
        connection.enabled = True
        connection.status = "connected"
        connection.last_error = None
        self._sync_log("google_calendar", "oauth_callback", "success", "Google Calendar OAuth completed.", payload={"actor_state": state})
        self.repository.commit()
        return self._connection_read(connection)

    def google_oauth_callback_redirect_url(
        self,
        *,
        code: str | None = None,
        state: str | None = None,
        error_value: str | None = None,
        error_description: str | None = None,
    ) -> str:
        query: dict[str, str] = {"provider": "google_calendar"}
        if error_value:
            query.update({"status": "error", "message": error_description or error_value})
            return self._frontend_oauth_callback_url(query)
        if not code:
            query.update({"status": "error", "message": "Google did not return an authorization code."})
            return self._frontend_oauth_callback_url(query)
        try:
            self.google_oauth_callback(code, state)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Google Calendar OAuth could not be completed."
            query.update({"status": "error", "message": detail})
        except Exception:
            logger.exception("Google Calendar OAuth callback failed")
            query.update({"status": "error", "message": "Google Calendar OAuth could not be completed."})
        else:
            query.update({"status": "success", "message": "Google Calendar connected successfully."})
        return self._frontend_oauth_callback_url(query)

    def scheduled_sync_due_connections(self) -> int:
        synced = 0
        system_user = self.users.get_by_email(self.settings.super_admin_email) or self.users.list_users()[0]
        now = utc_now()
        for connection in self.repository.list_connections():
            if not connection.enabled or connection.provider not in APPROVED_PROVIDERS or connection.provider == "csat":
                continue
            cadence_minutes = int((connection.settings_json or {}).get("sync_interval_minutes") or (1440 if connection.provider == "ai_llm_gateway" else 60))
            if connection.last_synced_at and connection.last_synced_at + timedelta(minutes=cadence_minutes) > now:
                continue
            self.sync_integration(connection.provider, system_user, trigger_type="scheduled")
            synced += 1
        return synced

    def _sync_provider(self, provider: str, connection: IntegrationConnection, actor: User) -> tuple[int, int, int]:
        if provider == "google_calendar":
            self._sync_log(provider, "sync", "skipped", "Google Calendar inbound sync is disabled; governance events are pushed outbound only.")
            return 0, 0, 0
        if provider == "csat":
            return 0, 0, 0
        if provider == "ai_llm_gateway":
            self.log_ai_gateway_run(request_type="gateway_health_check", status_value="complete", actor=actor, response_labels=["AI-assisted", "Advisory"])
            return 1, 0, 0
        records = self._fetch_provider_records(provider, connection)
        created = updated = skipped = 0
        for record in records:
            item, was_created = self._upsert_imported_item(provider, record, connection)
            if was_created:
                created += 1
                if provider == "google_calendar" and not item.review_required:
                    if self._create_governance_event_from_calendar_item(item, record, actor):
                        updated += 1
            else:
                updated += 1
        return created, updated, skipped

    def write_governance_event_to_calendar(self, event: GovernanceEvent, actor: User) -> str | None:
        connection = self._get_or_create_connection("google_calendar")
        if not connection.enabled or not self._has_required_config("google_calendar", connection):
            self._sync_log(
                "google_calendar",
                "outbound_write",
                "configuration_required",
                "Google Calendar write skipped because credentials are not configured.",
                source_record_id=event.id,
                deduplication_key=event.deduplication_key,
            )
            return None
        target_user = self.users.get_by_id(event.owner_id) if event.owner_id else None
        try:
            calendar_id = self._calendar_id_for_user(target_user or actor)
        except ValueError as exc:
            self._sync_log(
                "google_calendar",
                "outbound_write",
                "configuration_required",
                str(exc),
                source_record_id=event.id,
                deduplication_key=event.deduplication_key,
            )
            return None
        if event.status == "cancelled" and not event.external_event_id:
            self._sync_log(
                "google_calendar",
                "outbound_write",
                "skipped",
                "Google Calendar write skipped because the governance event is cancelled.",
                source_record_id=event.id,
                deduplication_key=event.deduplication_key,
                payload={"calendar_id": calendar_id},
            )
            return None
        token = self._credentials(connection).get("access_token")
        body = self._google_event_body(event)
        has_external_event = event.external_provider == "google_calendar" and bool(event.external_event_id)
        url = f"https://www.googleapis.com/calendar/v3/calendars/{parse.quote(calendar_id, safe='')}/events"
        if has_external_event:
            url = f"{url}/{parse.quote(str(event.external_event_id), safe='')}"
        try:
            payload = (
                self._json_patch(url, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body)
                if has_external_event
                else self._json_post(url, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body)
            )
        except ValueError as exc:
            message = f"{exc} while writing to Google Calendar ID {calendar_id}"
            self._sync_log(
                "google_calendar",
                "outbound_write",
                "error",
                message,
                source_record_id=event.id,
                deduplication_key=event.deduplication_key,
                payload={"calendar_id": calendar_id},
            )
            raise ValueError(message) from exc
        external_id = str(payload.get("id") or "")
        if external_id:
            event.external_provider = "google_calendar"
            event.external_event_id = external_id
            self._sync_log(
                "google_calendar",
                "outbound_write",
                "success",
                "Governance event updated in Google Calendar." if has_external_event else "Governance event written to Google Calendar.",
                source_record_id=event.id,
                deduplication_key=event.deduplication_key,
                payload={"calendar_id": calendar_id, "external_event_id": external_id},
            )
        return external_id or None

    def _fetch_provider_records(self, provider: str, connection: IntegrationConnection) -> list[dict[str, Any]]:
        if provider == "google_calendar":
            token = self._credentials(connection).get("access_token")
            if not token:
                raise ValueError("Google Calendar access token is required.")
            calendar_id = (connection.settings_json or {}).get("shared_governance_calendar_id") or (connection.settings_json or {}).get("calendar_id") or self.settings.google_calendar_default_calendar_id
            url = f"https://www.googleapis.com/calendar/v3/calendars/{parse.quote(calendar_id, safe='')}/events?singleEvents=true&orderBy=startTime"
            payload = self._json_get(url, {"Authorization": f"Bearer {token}"})
            return payload.get("items", [])
        if provider == "fathom":
            api_key = self._credentials(connection).get("api_key") or self.settings.fathom_api_key
            if not api_key:
                raise ValueError("Fathom API key is required.")
            provider_settings = connection.settings_json or {}
            base_url = provider_settings.get("base_url") or self.settings.fathom_base_url
            recordings_path = provider_settings.get("recordings_path") or self.settings.fathom_recordings_path
            page_limit = max(1, min(int(provider_settings.get("max_pages") or 5), 25))
            params = {
                "include_summary": "true",
                "include_action_items": "true",
                "include_transcript": "true" if provider_settings.get("include_transcript") else "false",
                "include_crm_matches": "true" if provider_settings.get("include_crm_matches") else "false",
            }
            if provider_settings.get("limit"):
                params["limit"] = str(provider_settings["limit"])
            records: list[dict[str, Any]] = []
            cursor = connection.sync_token
            for _ in range(page_limit):
                page_params = {**params, **({"cursor": cursor} if cursor else {})}
                url = f"{str(base_url).rstrip('/')}{recordings_path}?{parse.urlencode(page_params)}"
                payload = self._json_get(url, {"X-Api-Key": api_key})
                if not isinstance(payload, dict):
                    break
                page_records = payload.get("items", payload.get("recordings", []))
                if isinstance(page_records, list):
                    records.extend([record for record in page_records if isinstance(record, dict)])
                cursor = payload.get("next_cursor") or payload.get("next_page_token") or payload.get("next")
                if not cursor:
                    break
            connection.sync_token = str(cursor) if cursor else None
            return records
        raise ValueError("Unsupported integration provider")

    @staticmethod
    def _calendar_id_for_user(user: User) -> str:
        calendar_id = user.primary_google_calendar_id
        if not calendar_id:
            raise ValueError("Google Calendar target is not configured. Add a primary Calendar ID on the governance owner profile.")
        return str(calendar_id)

    @staticmethod
    def _google_event_body(event: GovernanceEvent) -> dict[str, Any]:
        body: dict[str, Any] = {
            "summary": f"{event.governance_type}: {event.account.name if event.account else 'Account'}",
            "description": "\n\n".join([value for value in (event.agenda, event.notes) if value]),
            "start": {"dateTime": event.scheduled_at.isoformat()},
            "end": {"dateTime": (event.end_at or event.scheduled_at + timedelta(hours=1)).isoformat()},
            "extendedProperties": {"private": {"kam_governance_event_id": event.id}},
        }
        if event.status == "cancelled":
            body["status"] = "cancelled"
        return body

    def _test_provider(self, provider: str, connection: IntegrationConnection) -> None:
        if provider == "csat":
            return
        if provider == "google_calendar":
            if not self._has_required_config(provider, connection):
                raise ValueError("Google Calendar access token is required.")
            return
        if provider == "ai_llm_gateway":
            base_url = (connection.settings_json or {}).get("base_url")
            api_key = self._credentials(connection).get("api_key")
            if not base_url or not api_key:
                raise ValueError("AI/LLM Gateway base URL and API key are required.")
            health_path = (connection.settings_json or {}).get("health_path") or "/health"
            self._json_get(f"{str(base_url).rstrip('/')}{health_path}", {"Authorization": f"Bearer {api_key}"})
            return
        records = self._fetch_provider_records(provider, connection)
        if not isinstance(records, list):
            raise ValueError("Provider test did not return a list of records.")

    def _upsert_imported_item(self, provider: str, record: dict[str, Any], connection: IntegrationConnection) -> tuple[IntegrationImportedItem, bool]:
        external_id = self._record_external_id(provider, record)
        existing = self.repository.get_imported_item_by_external_id(provider, external_id)
        title = str(record.get("summary") or record.get("title") or record.get("name") or "Imported item")
        occurred_at = self._record_datetime(record)
        account, engagement_id, mapped_type, auto_create = self._mapping_context(provider, record, title, connection)
        sanitized = self._sanitized_provider_payload(provider, record)
        source_link = self._record_source_link(provider, record)
        if existing:
            existing.title = title
            existing.description = self._record_description(provider, record)
            existing.source_link = source_link
            existing.occurred_at = occurred_at
            existing.source_timestamp = utc_now()
            existing.sanitized_payload_json = sanitized
            if account and existing.mapping_status == "unmapped":
                existing.account_id = account.id
                existing.engagement_id = engagement_id
                existing.mapping_status = "mapped"
            if provider == "google_calendar" and existing.account_id and auto_create and existing.review_status == "pending":
                existing.review_required = False
            self.repository.save_imported_item(existing)
            self._sync_log(provider, "upsert", "updated", "Imported item updated.", source_record_id=external_id, deduplication_key=f"{provider}:{external_id}", payload=sanitized)
            return existing, False
        item = IntegrationImportedItem(
            provider=provider,
            external_id=external_id,
            title=title,
            description=self._record_description(provider, record),
            source_link=source_link,
            occurred_at=occurred_at,
            source_timestamp=utc_now(),
            account_id=account.id if account else None,
            engagement_id=engagement_id,
            mapping_status="mapped" if account else "unmapped",
            review_status="pending",
            review_required=account is None or provider == "fathom" or (provider == "google_calendar" and not auto_create),
            deduplication_key=f"{provider}:{external_id}",
            sanitized_payload_json={**sanitized, "mapped_governance_type": mapped_type},
        )
        self.repository.save_imported_item(item)
        self._sync_log(provider, "import", "created", "Imported item stored for review.", source_record_id=external_id, deduplication_key=item.deduplication_key, payload=sanitized)
        return item, True

    def _create_governance_event_from_calendar_item(self, item: IntegrationImportedItem, record: dict[str, Any], actor: User) -> bool:
        if item.result_record_id or not item.account_id:
            return False
        scheduled_at = item.occurred_at
        if scheduled_at is None:
            item.review_required = True
            self._sync_log("google_calendar", "review_required", "skipped", "Calendar item did not include a start date.", source_record_id=item.external_id, deduplication_key=item.deduplication_key)
            return False
        existing = self.db.scalar(select(GovernanceEvent).where(GovernanceEvent.deduplication_key == item.deduplication_key))
        if existing:
            item.result_record_type = "governance_event"
            item.result_record_id = existing.id
            return False
        governance_type = str((item.sanitized_payload_json or {}).get("mapped_governance_type") or self._governance_type_from_text(item.title))
        end_at = self._record_end_datetime(record)
        attendees = self._calendar_attendees(record)
        event = GovernanceEvent(
            account_id=item.account_id,
            engagement_id=item.engagement_id,
            owner_id=actor.id,
            owner_name=actor.full_name,
            governance_type=governance_type,
            source="google_calendar",
            external_provider="google_calendar",
            external_event_id=item.external_id,
            deduplication_key=item.deduplication_key or f"google_calendar:{item.external_id}",
            mapping_confidence=100,
            review_required=False,
            scheduled_at=scheduled_at,
            end_at=end_at,
            status="scheduled",
            agenda=item.description or item.title,
            notes=None,
            attendees=attendees,
            created_by_id=actor.id,
            created_by_name=actor.full_name,
        )
        self.db.add(event)
        self.db.flush()
        item.result_record_type = "governance_event"
        item.result_record_id = event.id
        item.review_status = "approved"
        item.reviewed_by_id = actor.id
        item.reviewed_by_name = actor.full_name
        item.reviewed_at = utc_now()
        self.timeline.add_account_event(
            account_id=item.account_id,
            engagement_id=item.engagement_id,
            event_type="governance_event",
            module="governance_reviews",
            title=f"Calendar governance synced: {item.title}",
            description=item.description or item.title,
            actor=actor,
            source_record_id=event.id,
            source_record_type="governance_event",
            source_record_route=f"/governance?selected={event.id}",
            metadata={"provider": "google_calendar", "external_id": item.external_id},
            idempotency_key=f"timeline:{item.deduplication_key}",
        )
        self._sync_log("google_calendar", "create_governance_event", "created", "Governance event created from tagged Calendar record.", source_record_id=item.external_id, deduplication_key=item.deduplication_key)
        return True

    def _create_fathom_suggestions(self, item: IntegrationImportedItem, record: dict[str, Any]) -> None:
        action_items = record.get("action_items") or record.get("actions") or []
        if isinstance(action_items, str):
            action_items = [line.strip("- ") for line in action_items.splitlines() if line.strip()]
        if not isinstance(action_items, list):
            return
        for action in action_items[:20]:
            title = str((action.get("title") or action.get("description")) if isinstance(action, dict) else action).strip()
            if not title:
                continue
            playback_url = action.get("recording_playback_url") if isinstance(action, dict) else None
            description = item.description
            if playback_url:
                description = f"{description or ''}\n\nFathom playback: {playback_url}".strip()
            suggestion = FathomTaskSuggestion(
                imported_item_id=item.id,
                account_id=item.account_id,
                engagement_id=item.engagement_id,
                title=title[:220],
                description=description,
                suggested_due_at=utc_now() + timedelta(days=7),
            )
            self.repository.save_fathom_suggestion(suggestion)

    def _finish_sync_failure(self, connection: IntegrationConnection, run: IntegrationSyncRun, failure_type: str, message: str, actor: User) -> IntegrationSyncResponse:
        connection.status = "configuration_required" if failure_type == "configuration_required" else "error"
        connection.last_error = message
        run.status = connection.status
        run.error_count = 1
        run.failure_type = failure_type
        run.message = message
        run.finished_at = utc_now()
        self._record_failure(connection, failure_type, message, actor)
        self._sync_log(connection.provider, "sync", connection.status, message)
        self.audit.log(module=INTEGRATIONS_MODULE, action="sync_failed", entity_type="integration_sync_run", entity_id=run.id, actor=actor, after_value={"provider": connection.provider, "failure_type": failure_type})
        self.repository.commit()
        return IntegrationSyncResponse(provider=connection.provider, status=connection.status, errors=1, message=message)

    def _record_failure(self, connection: IntegrationConnection, failure_key: str, message: str, actor: User) -> None:
        connection.failure_count = connection.failure_count + 1 if connection.last_failure_key == failure_key else 1
        connection.last_failure_key = failure_key
        connection.next_retry_at = utc_now() + self._backoff(connection.failure_count)
        logger.warning("Integration failure provider=%s key=%s count=%s", connection.provider, failure_key, connection.failure_count)
        if connection.failure_count >= 3:
            self._send_admin_alert(connection, message, actor)

    def _send_admin_alert(self, connection: IntegrationConnection, message: str, actor: User) -> None:
        alert_email = self._security_alert_email()
        title = f"{PROVIDER_DISPLAY_NAMES.get(connection.provider, connection.provider)} integration failure"
        body = f"{PROVIDER_DISPLAY_NAMES.get(connection.provider, connection.provider)} has failed {connection.failure_count} consecutive time(s). {message}"
        result = self.email_delivery.send_template(
            "integration_failure_alert",
            recipient_email=alert_email,
            recipient_name="Platform Administrator",
            context={
                "recipient_name": "Platform Administrator",
                "title": title,
                "body": body,
                "source_url": self.email_delivery.absolute_url("/admin?section=integrations"),
                "priority_label": "Critical",
            },
        )
        self._queue_admin_failure_notifications(connection, title, body)
        self._sync_log(connection.provider, "admin_alert", result.status, "Admin failure alert evaluated.", payload=result.as_metadata())
        self.audit.log(module=INTEGRATIONS_MODULE, action="admin_failure_alert", entity_type="integration_connection", entity_id=connection.id, actor=actor, after_value={"email": alert_email, "delivery_status": result.status})

    def _queue_admin_failure_notifications(self, connection: IntegrationConnection, title: str, body: str) -> None:
        try:
            from app.services.notifications import NotificationsService

            notifications = NotificationsService(self.db, email_delivery=self.email_delivery)
            trigger_config = notifications.repository.get_trigger_config("integration_failure")
            if trigger_config is None:
                from app.models import NotificationTriggerConfig

                notifications.repository.save_trigger_config(
                    NotificationTriggerConfig(
                        trigger="integration_failure",
                        label="Integration failure",
                        description="An approved integration has repeated failures or needs administrator attention.",
                        default_mode="in_app",
                        default_digest_cadence="daily",
                        supported_channels=["in_app", "email"],
                        mandatory=True,
                        is_active=True,
                    )
                )
            elif not trigger_config.is_active:
                trigger_config.is_active = True
                trigger_config.mandatory = True
                notifications.repository.save_trigger_config(trigger_config)
            recipients = [
                user
                for user in self.users.list_users()
                if user.is_active and self.access.has_any_permission(user, {"integrations:configure", "platform_ops:view_health", "access_admin:manage_users"})
            ]
            for recipient in recipients:
                notifications.queue_notification(
                    recipient=recipient,
                    trigger="integration_failure",
                    title=title,
                    body=body,
                    source_record_type="integration_connection",
                    source_record_id=connection.id,
                    source_record_route="/admin?section=integrations",
                    priority="critical",
                    delivery_metadata={"provider": connection.provider, "failure_count": connection.failure_count},
                    deduplication_key=f"integration_failure:{connection.provider}:{connection.last_failure_key}:{recipient.id}",
                    in_app_only=True,
                )
        except Exception:
            logger.exception("Failed to queue integration failure notifications provider=%s", connection.provider)

    @staticmethod
    def _backoff(count: int) -> timedelta:
        if count <= 1:
            return timedelta(minutes=5)
        if count == 2:
            return timedelta(minutes=15)
        return timedelta(hours=1)

    def _get_or_create_connection(self, provider: str) -> IntegrationConnection:
        canonical = canonical_provider(provider)
        legacy = self.repository.get_connection("google-calendar") if canonical == "google_calendar" else None
        connection = self.repository.get_connection(canonical)
        if legacy and not connection:
            legacy.provider = "google_calendar"
            self.repository.save_connection(legacy)
            return legacy
        if connection:
            return connection
        defaults = self._provider_defaults(canonical)
        connection = IntegrationConnection(provider=canonical, **defaults)
        try:
            self.repository.save_connection(connection)
            return connection
        except IntegrityError:
            self.repository.db.rollback()
            existing = self.repository.get_connection(canonical)
            if existing:
                return existing
            raise

    @staticmethod
    def _provider_defaults(provider: str) -> dict[str, Any]:
        if provider == "google_calendar":
            return {"auth_type": "oauth2", "scopes": [GOOGLE_CALENDAR_SCOPE], "settings_json": {"sync_interval_minutes": 60}, "enabled": False}
        if provider == "fathom":
            return {"auth_type": "api_key", "scopes": ["meetings.read"], "settings_json": {"sync_interval_minutes": 60}, "enabled": False}
        if provider == "csat":
            return {"auth_type": "internal_manual", "scopes": ["manual.csat"], "settings_json": {"mode": "manual"}, "enabled": True, "status": "connected"}
        return {"auth_type": "api_key", "scopes": ["ai_gateway.run"], "settings_json": {"sync_interval_minutes": 1440}, "enabled": False}

    def _connection_read(self, connection: IntegrationConnection) -> IntegrationConnectionRead:
        data = IntegrationConnectionRead.model_validate(connection)
        data.provider = canonical_provider(connection.provider)
        data.name = PROVIDER_DISPLAY_NAMES.get(data.provider, data.provider)
        data.settings_json = sanitize_payload(connection.settings_json or {})
        data.credential_status = self._credential_status(connection)
        return data

    def _credential_status(self, connection: IntegrationConnection) -> dict[str, Any]:
        credentials = connection.credentials_json or {}
        configured = self._has_required_config(connection.provider, connection)
        return {
            "configured": configured,
            "fields": sorted([key for key in credentials if key.lower() in SECRET_KEYS or "token" in key.lower() or "secret" in key.lower() or "api_key" in key.lower()]),
            "environment_configured": configured and not bool(credentials),
            "masked": True,
        }

    def _has_required_config(self, provider: str, connection: IntegrationConnection) -> bool:
        if provider == "csat":
            return True
        credentials = self._credentials(connection)
        settings = connection.settings_json or {}
        if provider == "google_calendar":
            return bool(credentials.get("access_token"))
        if provider == "fathom":
            return bool(credentials.get("api_key") or self.settings.fathom_api_key)
        if provider == "ai_llm_gateway":
            return bool((credentials.get("api_key") or credentials.get("bearer_token")) and settings.get("base_url"))
        return False

    def _validate_credentials(self, provider: str, credentials: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(credentials, dict):
            raise field_validation_error("credentials_json", "Credentials must be an object.")
        allowed = {
            "google_calendar": {"access_token", "refresh_token", "token_type"},
            "fathom": {"api_key", "webhook_secret"},
            "csat": set(),
            "ai_llm_gateway": {"api_key", "bearer_token"},
        }[provider]
        unknown = sorted(set(credentials) - allowed)
        if unknown:
            raise field_validation_error("credentials_json", f"Unsupported credential field(s): {', '.join(unknown)}.")
        return credentials

    @staticmethod
    def _credentials(connection: IntegrationConnection) -> dict[str, Any]:
        return decrypt_credentials(connection.credentials_json)

    def _validate_settings(self, provider: str, settings: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(settings, dict):
            raise field_validation_error("settings_json", "Settings must be an object.")
        allowed_settings = {
            "google_calendar": {"shared_governance_calendar_id", "calendar_id", "sync_interval_minutes", "deduplication_window_minutes", "auto_create_tagged_events"},
            "fathom": {"base_url", "recordings_path", "sync_interval_minutes", "deduplication_window_minutes", "auto_approve", "include_transcript", "include_crm_matches"},
            "csat": {"mode"},
            "ai_llm_gateway": {"base_url", "health_path", "model", "sync_interval_minutes"},
        }[provider]
        unknown = sorted(set(settings) - allowed_settings)
        if unknown:
            raise field_validation_error("settings_json", f"Unsupported setting field(s): {', '.join(unknown)}.")
        if provider == "google_calendar":
            for key in ("shared_governance_calendar_id", "calendar_id"):
                if key in settings and settings[key]:
                    value = str(settings[key]).strip()
                    if any(marker in value for marker in (" ", "://", "/", "\\", "?", "#")):
                        raise field_validation_error(f"settings_json.{key}", "Google Calendar ID is invalid.")
                    settings[key] = value
        if "sync_interval_minutes" in settings and settings["sync_interval_minutes"]:
            interval = int(settings["sync_interval_minutes"])
            if interval < 15 or interval > 10080:
                raise field_validation_error("settings_json.sync_interval_minutes", "Sync interval must be between 15 minutes and 7 days.")
            settings["sync_interval_minutes"] = interval
        if "deduplication_window_minutes" in settings and settings["deduplication_window_minutes"]:
            window = int(settings["deduplication_window_minutes"])
            if window < 5 or window > 10080:
                raise field_validation_error("settings_json.deduplication_window_minutes", "Deduplication window must be between 5 minutes and 7 days.")
            settings["deduplication_window_minutes"] = window
        for url_key in ("base_url",):
            if url_key in settings and settings[url_key]:
                value = str(settings[url_key]).strip()
                if not (value.startswith("https://") or value.startswith("http://")):
                    raise field_validation_error(f"settings_json.{url_key}", "Base URL must be an HTTP or HTTPS URL.")
                settings[url_key] = value
        if provider == "fathom" and settings.get("recordings_path"):
            recordings_path = str(settings["recordings_path"]).strip()
            if not recordings_path.startswith("/"):
                raise field_validation_error("settings_json.recordings_path", "Fathom meetings path must start with /.")
            settings["recordings_path"] = recordings_path
        return settings

    def _validate_scopes(self, provider: str, scopes: list[str]) -> list[str]:
        values = [str(item).strip() for item in scopes if str(item).strip()]
        if provider == "google_calendar" and GOOGLE_CALENDAR_SCOPE not in values:
            values.append(GOOGLE_CALENDAR_SCOPE)
        return values

    def _validate_mapping_targets(self, account_id: str | None, engagement_id: str | None) -> None:
        if account_id:
            self._account_or_404(account_id)
        if engagement_id and account_id:
            account = self._account_or_404(account_id)
            if not any(engagement.id == engagement_id for engagement in account.engagements):
                raise field_validation_error("target_engagement_id", "Engagement does not belong to the selected account.")

    def _sync_log(self, provider: str, action: str, sync_status: str, message: str, *, source_record_id: str | None = None, deduplication_key: str | None = None, payload: dict | None = None) -> None:
        self.repository.add_sync_log(IntegrationSyncLog(provider=provider, source_record_id=source_record_id, action=action, status=sync_status, deduplication_key=deduplication_key, message=message, payload=sanitize_payload(payload)))

    @staticmethod
    def _json_get(url: str, headers: dict[str, str]) -> dict[str, Any]:
        req = request.Request(url, headers=headers)
        try:
            with request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise ValueError(IntegrationService._external_api_error_message(exc)) from exc

    @staticmethod
    def _json_post(url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        req = request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise ValueError(IntegrationService._external_api_error_message(exc)) from exc

    @staticmethod
    def _json_patch(url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        req = request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="PATCH")
        try:
            with request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise ValueError(IntegrationService._external_api_error_message(exc)) from exc

    @staticmethod
    def _external_api_error_message(exc: error.HTTPError) -> str:
        base = f"External API returned {exc.code}"
        try:
            raw_body = exc.read().decode("utf-8")
        except Exception:
            return base
        if not raw_body:
            return base
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            return base
        error_payload = payload.get("error") if isinstance(payload, dict) else None
        if not isinstance(error_payload, dict):
            return base
        status_value = str(error_payload.get("status") or "").strip()
        message = str(error_payload.get("message") or "").strip()
        reason = IntegrationService._external_api_error_reason(error_payload)
        details = " - ".join(item for item in (status_value, message) if item)
        if reason:
            details = f"{details} (reason: {reason})" if details else f"reason: {reason}"
        return f"{base}: {details}" if details else base

    @staticmethod
    def _external_api_error_reason(error_payload: dict[str, Any]) -> str | None:
        errors = error_payload.get("errors")
        if not isinstance(errors, list):
            return None
        for item in errors:
            if isinstance(item, dict) and item.get("reason"):
                return str(item["reason"])
        return None

    def _frontend_oauth_callback_url(self, query: dict[str, str]) -> str:
        return f"{self.settings.frontend_app_url}/admin/integrations/google-calendar/callback?{parse.urlencode(query)}"

    def _exchange_google_code(self, code: str) -> dict[str, Any]:
        payload = parse.urlencode(
            {
                "code": code,
                "client_id": self.settings.google_calendar_client_id,
                "client_secret": self.settings.google_calendar_client_secret,
                "redirect_uri": self.settings.google_calendar_redirect_uri,
                "grant_type": "authorization_code",
            }
        ).encode("utf-8")
        req = request.Request("https://oauth2.googleapis.com/token", data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with request.urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google OAuth token exchange failed with {exc.code}") from exc

    @staticmethod
    def _record_external_id(provider: str, record: dict[str, Any]) -> str:
        return str(record.get("recording_id") or record.get("id") or record.get("external_id") or f"{provider}:{record.get('summary') or record.get('title') or utc_now().isoformat()}")

    @staticmethod
    def _record_datetime(record: dict[str, Any]) -> datetime | None:
        value = record.get("start", {}).get("dateTime") if isinstance(record.get("start"), dict) else record.get("scheduled_start_time") or record.get("recording_start_time") or record.get("started_at") or record.get("date") or record.get("created_at")
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _record_end_datetime(record: dict[str, Any]) -> datetime | None:
        value = record.get("end", {}).get("dateTime") if isinstance(record.get("end"), dict) else record.get("scheduled_end_time") or record.get("recording_end_time") or record.get("ended_at") or record.get("end_date")
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _record_description(provider: str, record: dict[str, Any]) -> str | None:
        if provider == "fathom":
            summary = record.get("default_summary")
            if isinstance(summary, dict):
                return summary.get("markdown_formatted") or summary.get("text") or summary.get("summary")
            if isinstance(record.get("summary"), dict):
                return record["summary"].get("markdown_formatted") or record["summary"].get("text")
            if isinstance(record.get("summary"), str):
                return record.get("summary")
            return record.get("description")
        return record.get("description") or record.get("summary")

    @staticmethod
    def _record_source_link(provider: str, record: dict[str, Any]) -> str | None:
        if provider == "fathom":
            return record.get("share_url") or record.get("url") or record.get("recording_playback_url")
        return record.get("htmlLink") or record.get("url") or record.get("share_url")

    @staticmethod
    def _sanitized_provider_payload(provider: str, record: dict[str, Any]) -> dict[str, Any]:
        sanitized = sanitize_payload(record)
        if provider != "fathom" or not isinstance(sanitized, dict):
            return sanitized
        if "transcript" in sanitized:
            transcript = sanitized.pop("transcript")
            sanitized["transcript_metadata"] = {"entries": len(transcript) if isinstance(transcript, list) else 1, "omitted": True}
        return sanitized

    def _match_account(self, text: str) -> Account | None:
        clean = text.lower()
        accounts = self.accounts.list_accounts(page=1, page_size=500)[0]
        matches = [account for account in accounts if account.name.lower() in clean]
        return max(matches, key=lambda item: len(item.name)) if matches else None

    def _mapping_context(self, provider: str, record: dict[str, Any], title: str, connection: IntegrationConnection) -> tuple[Account | None, str | None, str, bool]:
        summary = record.get("default_summary")
        summary_text = summary.get("markdown_formatted") if isinstance(summary, dict) else record.get("summary")
        metadata_text = "\n".join(str(value) for value in (title, record.get("meeting_title"), record.get("description"), summary_text, record.get("notes")) if value)
        account_name = self._tag_value(metadata_text, "KAM_ACCOUNT") or self._title_account_tag(title)
        account = self._match_account(account_name) if account_name else self._match_account(title)
        engagement_id = None
        engagement_name = self._tag_value(metadata_text, "KAM_ENGAGEMENT")
        if account and engagement_name:
            engagement = next((item for item in account.engagements if item.name.lower() == engagement_name.lower()), None)
            engagement_id = engagement.id if engagement else None
        governance_type = self._governance_type_from_text(self._tag_value(metadata_text, "KAM_TYPE") or title)
        auto_tag = str(self._tag_value(metadata_text, "KAM_AUTO_CREATE") or "").lower()
        auto_create = provider == "google_calendar" and account is not None and (
            auto_tag == "true" or bool((connection.settings_json or {}).get("auto_create_tagged_events"))
        )
        return account, engagement_id, governance_type, auto_create

    @staticmethod
    def _tag_value(text: str, key: str) -> str | None:
        for line in text.replace(";", "\n").splitlines():
            if "=" not in line:
                continue
            left, right = line.split("=", 1)
            if left.strip().upper() == key:
                return right.strip() or None
        return None

    @staticmethod
    def _title_account_tag(title: str) -> str | None:
        marker = "[KAM:"
        if marker not in title:
            return None
        after = title.split(marker, 1)[1]
        if "]" not in after:
            return None
        return after.split("]", 1)[0].strip() or None

    @staticmethod
    def _governance_type_from_text(text: str) -> str:
        value = text.lower()
        if "steerco" in value or "steering" in value:
            return "SteerCo"
        if "executive" in value:
            return "Executive Review"
        if "qbr" in value or "quarter" in value:
            return "QBR"
        return "Client Call"

    @staticmethod
    def _calendar_attendees(record: dict[str, Any]) -> list[dict[str, Any]]:
        attendees = record.get("attendees") if isinstance(record.get("attendees"), list) else []
        return [
            {"email": item.get("email"), "name": item.get("displayName") or item.get("email"), "response_status": item.get("responseStatus")}
            for item in attendees
            if isinstance(item, dict) and item.get("email")
        ]

    def _imported_item_or_404(self, item_id: str) -> IntegrationImportedItem:
        item = self.repository.get_imported_item(item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imported integration item was not found")
        return item

    def _provider_item_or_404(self, item_id: str, provider: str) -> IntegrationImportedItem:
        item = self._imported_item_or_404(item_id)
        if item.provider != provider:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imported integration item was not found")
        return item

    def _account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _can_view_account_id(self, user: User, account_id: str) -> bool:
        account = self.accounts.get_by_id(account_id)
        return bool(account and self.access.can_view_account(user, account))

    def _can_view_imported_item(self, user: User, item: IntegrationImportedItem) -> bool:
        return not item.account_id or self._can_view_account_id(user, item.account_id)

    def _security_alert_settings_read(self) -> SecurityAlertSettingsRead:
        setting = self.platform_settings.get_by_key(SECURITY_ALERT_EMAIL_KEY)
        email = str(setting.value_json if setting else DEFAULT_SECURITY_ALERT_EMAIL).strip().lower()
        updated_by = self.users.get_by_id(setting.updated_by_id) if setting and setting.updated_by_id else None
        return SecurityAlertSettingsRead(administration_email=email, updated_by_id=setting.updated_by_id if setting else None, updated_by_name=updated_by.full_name if updated_by else None, updated_at=setting.updated_at if setting else None)

    def _security_alert_email(self) -> str:
        return str(self._security_alert_settings_read().administration_email)

    def _require_sync_permission(self, current_user: User) -> None:
        try:
            self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "configure")
        except HTTPException as exc:
            if exc.status_code != status.HTTP_403_FORBIDDEN:
                raise
            self.access.require_module_permission(current_user, INTEGRATIONS_MODULE, "create")

    def _verify_fathom_webhook(self, headers: Mapping[str, str], raw_body: bytes, connection: IntegrationConnection) -> None:
        secret = self._credentials(connection).get("webhook_secret") or self.settings.fathom_webhook_secret
        if not secret:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Fathom webhook secret is not configured")
        webhook_id = self._header_value(headers, "webhook-id")
        timestamp_value = self._header_value(headers, "webhook-timestamp")
        signature_value = self._header_value(headers, "webhook-signature")
        if not webhook_id or not timestamp_value or not signature_value:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fathom webhook signature headers are required")
        try:
            timestamp = int(timestamp_value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fathom webhook timestamp is invalid") from exc
        if abs(int(time.time()) - timestamp) > 300:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fathom webhook timestamp is outside the allowed tolerance")
        if not str(secret).startswith("whsec_"):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Fathom webhook secret format is invalid")
        try:
            secret_bytes = base64.b64decode(str(secret).split("_", 1)[1])
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Fathom webhook secret could not be decoded") from exc
        signed_content = b".".join([webhook_id.encode("utf-8"), timestamp_value.encode("utf-8"), raw_body])
        expected = base64.b64encode(hmac.new(secret_bytes, signed_content, hashlib.sha256).digest()).decode("utf-8")
        received = [part.split(",", 1)[1] if "," in part else part for part in signature_value.split()]
        if not any(hmac.compare_digest(expected, candidate) for candidate in received):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fathom webhook signature is invalid")

    @staticmethod
    def _header_value(headers: Mapping[str, str], key: str) -> str | None:
        return headers.get(key) or headers.get(key.lower()) or headers.get(key.upper())
