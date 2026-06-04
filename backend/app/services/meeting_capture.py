from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib import parse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import MeetingArtifact, User, UserIntegrationConnection, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.meeting_capture import MeetingCaptureRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    IntegrationSyncResponse,
    MeetingArtifactCreateRequest,
    MeetingArtifactPageRead,
    MeetingArtifactRead,
    MeetingArtifactUpdateRequest,
    UserFathomConnectionRead,
    UserFathomConnectionUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.email_domains import field_validation_error
from app.services.integrations import IntegrationService, sanitize_payload
from app.services.secret_encryption import decrypt_credentials, encrypt_credentials
from app.services.user_management import page_count


class MeetingCaptureService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = MeetingCaptureRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.settings = get_settings()

    def read_fathom_connection(self, current_user: User) -> UserFathomConnectionRead:
        connection = self.repository.get_user_connection(user_id=current_user.id, provider="fathom")
        return self._connection_read(connection)

    def update_fathom_connection(self, payload: UserFathomConnectionUpdateRequest, current_user: User) -> UserFathomConnectionRead:
        connection = self._get_or_create_user_connection(current_user, "fathom")
        credentials = self._credentials(connection)
        if payload.api_key is not None:
            credentials["api_key"] = payload.api_key
        connection.credentials_json = encrypt_credentials(credentials)
        connection.enabled = payload.enabled
        if payload.settings_json is not None:
            connection.settings_json = self._validated_settings(payload.settings_json)
        connection.status = "connected" if payload.enabled and credentials.get("api_key") else "configuration_required"
        connection.last_error = None if connection.status == "connected" else "Personal Fathom API key is required."
        self.repository.save_user_connection(connection)
        self.repository.commit()
        return self._connection_read(connection)

    def list_meetings(
        self,
        current_user: User,
        *,
        provider: str | None = None,
        status_filter: str | None = None,
        account_id: str | None = None,
        linked_object_type: str | None = None,
        linked_object_id: str | None = None,
        search: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> MeetingArtifactPageRead:
        if account_id:
            self._require_account_view(current_user, account_id)
        items, total = self.repository.list_meeting_artifacts(
            owner_id=current_user.id,
            provider=provider,
            status=status_filter,
            account_id=account_id,
            linked_object_type=linked_object_type,
            linked_object_id=linked_object_id,
            search=search,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )
        return MeetingArtifactPageRead(items=[self._artifact_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_meeting(self, payload: MeetingArtifactCreateRequest, current_user: User) -> MeetingArtifactRead:
        self._validate_account_link(current_user, payload.account_id, payload.engagement_id)
        artifact = MeetingArtifact(
            owner_id=current_user.id,
            provider=payload.provider,
            title=payload.title or "Fathom meeting",
            summary=payload.summary,
            action_items=payload.action_items,
            meeting_url=payload.meeting_url,
            source_link=payload.meeting_url if self._looks_like_fathom_link(payload.meeting_url) else None,
            occurred_at=payload.occurred_at,
            scheduled_at=payload.scheduled_at,
            account_id=payload.account_id,
            engagement_id=payload.engagement_id,
            linked_object_type=payload.linked_object_type,
            linked_object_id=payload.linked_object_id,
            status=self._status_for_content(payload.summary, payload.action_items, payload.meeting_url),
            metadata_json={"created_source": "manual"},
        )
        self.repository.save_meeting_artifact(artifact)
        self.repository.commit()
        return self._artifact_read(artifact)

    def update_meeting(self, meeting_id: str, payload: MeetingArtifactUpdateRequest, current_user: User) -> MeetingArtifactRead:
        artifact = self._artifact_or_404(meeting_id, current_user)
        updates = payload.model_dump(exclude_unset=True)
        account_id = updates.get("account_id", artifact.account_id)
        engagement_id = updates.get("engagement_id", artifact.engagement_id)
        self._validate_account_link(current_user, account_id, engagement_id)
        for field, value in updates.items():
            setattr(artifact, field, value)
        if "status" not in updates:
            artifact.status = self._status_for_content(artifact.summary, artifact.action_items, artifact.meeting_url)
        self.repository.save_meeting_artifact(artifact)
        self.repository.commit()
        return self._artifact_read(artifact)

    def sync_fathom_meetings(self, current_user: User) -> IntegrationSyncResponse:
        connection = self.repository.get_user_connection(user_id=current_user.id, provider="fathom")
        if connection is None or not connection.enabled or not self._credentials(connection).get("api_key"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Connect your personal Fathom API key before syncing meetings.")
        try:
            records = self._fetch_fathom_records(connection)
            created = updated = 0
            for record in records:
                _, was_created = self._upsert_fathom_record(record, current_user)
                if was_created:
                    created += 1
                else:
                    updated += 1
            connection.status = "connected"
            connection.last_error = None
            connection.last_synced_at = utc_now()
            self.repository.save_user_connection(connection)
            self.repository.commit()
            return IntegrationSyncResponse(provider="fathom", status="connected", created=created, updated=updated, skipped=0, errors=0, message="Fathom meetings synced.")
        except ValueError as exc:
            connection.status = "error"
            connection.last_error = str(exc)
            self.repository.save_user_connection(connection)
            self.repository.commit()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    def get_owned_artifact(self, meeting_id: str, current_user: User) -> MeetingArtifact:
        return self._artifact_or_404(meeting_id, current_user)

    def _fetch_fathom_records(self, connection: UserIntegrationConnection) -> list[dict[str, Any]]:
        credentials = self._credentials(connection)
        api_key = credentials.get("api_key")
        if not api_key:
            raise ValueError("Fathom API key is required.")
        settings = connection.settings_json or {}
        base_url = settings.get("base_url") or self.settings.fathom_base_url
        recordings_path = settings.get("recordings_path") or self.settings.fathom_recordings_path
        page_limit = max(1, min(int(settings.get("max_pages") or 5), 25))
        params = {
            "include_summary": "true",
            "include_action_items": "true",
            "include_transcript": "false",
        }
        if settings.get("limit"):
            params["limit"] = str(settings["limit"])
        records: list[dict[str, Any]] = []
        cursor = None
        for _ in range(page_limit):
            page_params = {**params, **({"cursor": cursor} if cursor else {})}
            url = f"{str(base_url).rstrip('/')}{recordings_path}?{parse.urlencode(page_params)}"
            payload = IntegrationService._json_get(url, {"X-Api-Key": str(api_key)})
            if not isinstance(payload, dict):
                break
            page_records = payload.get("items", payload.get("recordings", []))
            if isinstance(page_records, list):
                records.extend([record for record in page_records if isinstance(record, dict)])
            cursor = payload.get("next_cursor") or payload.get("next_page_token") or payload.get("next")
            if not cursor:
                break
        return records

    def _upsert_fathom_record(self, record: dict[str, Any], current_user: User) -> tuple[MeetingArtifact, bool]:
        external_id = IntegrationService._record_external_id("fathom", record)
        source_link = IntegrationService._record_source_link("fathom", record)
        existing = self.repository.get_meeting_by_external_id(owner_id=current_user.id, provider="fathom", external_id=external_id)
        if existing is None and source_link:
            existing = self.repository.get_meeting_by_source_link(owner_id=current_user.id, provider="fathom", source_link=source_link)

        title = str(record.get("meeting_title") or record.get("title") or record.get("name") or "Fathom meeting")
        summary = IntegrationService._record_description("fathom", record)
        action_items = self._fathom_action_items(record)
        occurred_at = IntegrationService._record_datetime(record)
        metadata = IntegrationService._sanitized_provider_payload("fathom", record)
        if not isinstance(metadata, dict):
            metadata = {"payload": sanitize_payload(metadata)}

        if existing:
            existing.external_id = external_id
            existing.title = title[:255]
            existing.summary = summary
            existing.action_items = action_items
            existing.source_link = source_link or existing.source_link
            existing.occurred_at = occurred_at or existing.occurred_at
            existing.status = "ready"
            existing.metadata_json = metadata
            self.repository.save_meeting_artifact(existing)
            return existing, False

        artifact = MeetingArtifact(
            owner_id=current_user.id,
            provider="fathom",
            external_id=external_id,
            title=title[:255],
            summary=summary,
            action_items=action_items,
            source_link=source_link,
            occurred_at=occurred_at,
            status="ready",
            metadata_json=metadata,
        )
        self.repository.save_meeting_artifact(artifact)
        return artifact, True

    def _validate_account_link(self, current_user: User, account_id: str | None, engagement_id: str | None) -> None:
        if not account_id:
            if engagement_id:
                raise field_validation_error("account_id", "Account is required when selecting an engagement.")
            return
        account = self._require_account_view(current_user, account_id)
        if engagement_id and not any(engagement.id == engagement_id for engagement in account.engagements):
            raise field_validation_error("engagement_id", "Engagement does not belong to the selected account.")

    def _require_account_view(self, current_user: User, account_id: str):
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module="account_overview")
        return account

    def _artifact_or_404(self, meeting_id: str, current_user: User) -> MeetingArtifact:
        artifact = self.repository.get_meeting_artifact(meeting_id)
        if artifact is None or artifact.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting capture was not found")
        return artifact

    def _get_or_create_user_connection(self, current_user: User, provider: str) -> UserIntegrationConnection:
        connection = self.repository.get_user_connection(user_id=current_user.id, provider=provider)
        if connection:
            return connection
        connection = UserIntegrationConnection(user_id=current_user.id, provider=provider, auth_type="api_key", settings_json={})
        self.repository.save_user_connection(connection)
        return connection

    @staticmethod
    def _credentials(connection: UserIntegrationConnection) -> dict[str, Any]:
        return decrypt_credentials(connection.credentials_json)

    @staticmethod
    def _connection_read(connection: UserIntegrationConnection | None) -> UserFathomConnectionRead:
        if connection is None:
            return UserFathomConnectionRead(credential_status={"configured": False, "fields": [], "masked": False})
        credentials = decrypt_credentials(connection.credentials_json)
        configured = bool(credentials.get("api_key"))
        return UserFathomConnectionRead(
            id=connection.id,
            provider=connection.provider,
            enabled=connection.enabled,
            status=connection.status,
            auth_type=connection.auth_type,
            credential_status={"configured": configured, "fields": ["api_key"] if configured else [], "masked": configured},
            settings_json=connection.settings_json or {},
            last_synced_at=connection.last_synced_at,
            last_error=connection.last_error,
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )

    @staticmethod
    def _artifact_read(artifact: MeetingArtifact) -> MeetingArtifactRead:
        return MeetingArtifactRead.model_validate(artifact)

    @staticmethod
    def _status_for_content(summary: str | None, action_items: list[str], meeting_url: str | None = None) -> str:
        if summary or action_items:
            return "ready"
        return "waiting_for_fathom" if meeting_url else "draft"

    @staticmethod
    def _looks_like_fathom_link(value: str | None) -> bool:
        return bool(value and "fathom" in value.lower())

    @staticmethod
    def _fathom_action_items(record: dict[str, Any]) -> list[str]:
        action_items = record.get("action_items") or record.get("actions") or []
        if isinstance(action_items, str):
            return [line.strip("- ").strip()[:220] for line in action_items.splitlines() if line.strip()]
        if not isinstance(action_items, list):
            return []
        items: list[str] = []
        seen: set[str] = set()
        for action in action_items:
            title = str((action.get("title") or action.get("description")) if isinstance(action, dict) else action).strip()
            if not title:
                continue
            title = title[:220]
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(title)
        return items[:50]

    @staticmethod
    def _validated_settings(settings: dict[str, Any]) -> dict[str, Any]:
        allowed = {"base_url", "recordings_path", "limit", "max_pages"}
        unknown = sorted(set(settings) - allowed)
        if unknown:
            raise field_validation_error("settings_json", f"Unsupported Fathom setting(s): {', '.join(unknown)}.")
        base_url = settings.get("base_url")
        if base_url and not str(base_url).startswith(("http://", "https://")):
            raise field_validation_error("settings_json.base_url", "Base URL must be an HTTP or HTTPS URL.")
        recordings_path = settings.get("recordings_path")
        if recordings_path and not str(recordings_path).startswith("/"):
            raise field_validation_error("settings_json.recordings_path", "Fathom meetings path must start with /.")
        return settings
