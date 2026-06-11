from __future__ import annotations

from datetime import datetime, timezone
import re
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
    MeetingProviderResolveRequest,
    UserFathomConnectionRead,
    UserFathomConnectionUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.email_domains import field_validation_error
from app.services.integrations import IntegrationService, sanitize_payload
from app.services.secret_encryption import decrypt_credentials, encrypt_credentials
from app.services.user_management import page_count


class MeetingCaptureService:
    ACTION_ITEM_VERBS = (
        "align",
        "assign",
        "circulate",
        "collect",
        "complete",
        "confirm",
        "coordinate",
        "create",
        "define",
        "deliver",
        "develop",
        "document",
        "draft",
        "email",
        "finalize",
        "follow up",
        "follow-up",
        "gather",
        "identify",
        "implement",
        "investigate",
        "monitor",
        "prepare",
        "present",
        "provide",
        "reach out",
        "resolve",
        "review",
        "schedule",
        "send",
        "set up",
        "setup",
        "share",
        "submit",
        "sync",
        "track",
        "update",
        "validate",
    )
    NON_ACTION_HEADINGS = {
        "action",
        "actions",
        "action item",
        "action items",
        "agenda",
        "discussion",
        "discussion notes",
        "follow ups",
        "follow-ups",
        "key takeaways",
        "meeting notes",
        "next steps",
        "notes",
        "overview",
        "q&a",
        "questions",
        "summary",
        "takeaways",
        "transcript",
    }

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = MeetingCaptureRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.settings = get_settings()

    def read_fathom_connection(self, current_user: User) -> UserFathomConnectionRead:
        return self._read_provider_connection("fathom", current_user)

    def update_fathom_connection(self, payload: UserFathomConnectionUpdateRequest, current_user: User) -> UserFathomConnectionRead:
        return self._update_provider_connection("fathom", payload, current_user)

    def read_fireflies_connection(self, current_user: User) -> UserFathomConnectionRead:
        return self._read_provider_connection("fireflies", current_user)

    def update_fireflies_connection(self, payload: UserFathomConnectionUpdateRequest, current_user: User) -> UserFathomConnectionRead:
        return self._update_provider_connection("fireflies", payload, current_user)

    def _read_provider_connection(self, provider: str, current_user: User) -> UserFathomConnectionRead:
        connection = self.repository.get_user_connection(user_id=current_user.id, provider=provider)
        return self._connection_read(connection, provider=provider)

    def _update_provider_connection(self, provider: str, payload: UserFathomConnectionUpdateRequest, current_user: User) -> UserFathomConnectionRead:
        connection = self._get_or_create_user_connection(current_user, provider)
        credentials = self._credentials(connection)
        if payload.clear_api_key:
            credentials.pop("api_key", None)
        if payload.api_key is not None:
            credentials["api_key"] = payload.api_key
        connection.credentials_json = encrypt_credentials(credentials)
        connection.enabled = payload.enabled
        if payload.settings_json is not None:
            connection.settings_json = self._validated_settings(payload.settings_json, provider=provider)
        connection.status = "connected" if payload.enabled and credentials.get("api_key") else "configuration_required"
        connection.last_error = None if connection.status == "connected" else f"Personal {self._provider_label(provider)} API key is required."
        self.repository.save_user_connection(connection)
        self.repository.commit()
        return self._connection_read(connection, provider=provider)

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
            title=payload.title or f"{self._provider_label(payload.provider)} meeting",
            summary=payload.summary,
            action_items=payload.action_items,
            meeting_url=payload.meeting_url,
            source_link=payload.meeting_url if self._looks_like_provider_link(payload.provider, payload.meeting_url) else None,
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

    def resolve_fathom_meeting(self, payload: MeetingProviderResolveRequest, current_user: User) -> MeetingArtifactRead:
        self._validate_account_link(current_user, payload.account_id, payload.engagement_id)
        connection = self.repository.get_user_connection(user_id=current_user.id, provider="fathom")
        if connection is None or not connection.enabled or not self._credentials(connection).get("api_key"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Connect your personal Fathom API key before fetching meeting details.")

        recording_id, source_url = self._parse_fathom_identifier(payload.identifier)
        if source_url and not recording_id:
            existing = self._existing_fathom_artifact(current_user, source_url=source_url)
            if existing:
                self._apply_resolve_context(existing, payload)
                self.repository.save_meeting_artifact(existing)
                self.repository.commit()
                return self._artifact_read(existing)

        if recording_id:
            try:
                record = self._fetch_fathom_summary_record(connection, recording_id, source_url)
            except ValueError as exc:
                self._mark_connection_error(connection, str(exc))
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

            try:
                enriched = self._find_fathom_record_by_recording_id(connection, recording_id)
            except ValueError:
                enriched = None
            if enriched:
                if not IntegrationService._record_description("fathom", enriched):
                    enriched["default_summary"] = record.get("default_summary")
                if source_url and not IntegrationService._record_source_link("fathom", enriched):
                    enriched["share_url"] = source_url
                record = enriched

            artifact, _ = self._upsert_fathom_record(record, current_user)
            self._apply_resolve_context(artifact, payload)
            connection.status = "connected"
            connection.last_error = None
            self.repository.save_user_connection(connection)
            self.repository.save_meeting_artifact(artifact)
            self.repository.commit()
            return self._artifact_read(artifact)

        if source_url:
            try:
                record = self._find_fathom_record_by_source_url(connection, source_url)
            except ValueError as exc:
                self._mark_connection_error(connection, str(exc))
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
            if record is None:
                raise field_validation_error("identifier", "Fathom meeting was not found. Paste the Fathom recording ID or a share URL from a meeting your API key can access.")
            artifact, _ = self._upsert_fathom_record(record, current_user)
            self._apply_resolve_context(artifact, payload)
            connection.status = "connected"
            connection.last_error = None
            self.repository.save_user_connection(connection)
            self.repository.save_meeting_artifact(artifact)
            self.repository.commit()
            return self._artifact_read(artifact)

        raise field_validation_error("identifier", "Enter a Fathom recording ID or share URL.")

    def resolve_fireflies_meeting(self, payload: MeetingProviderResolveRequest, current_user: User) -> MeetingArtifactRead:
        self._validate_account_link(current_user, payload.account_id, payload.engagement_id)
        connection = self.repository.get_user_connection(user_id=current_user.id, provider="fireflies")
        if connection is None or not connection.enabled or not self._credentials(connection).get("api_key"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Connect your personal Fireflies API key before fetching meeting details.")

        transcript_id, source_url = self._parse_fireflies_identifier(payload.identifier)
        if source_url:
            existing = self._existing_provider_artifact("fireflies", current_user, source_url=source_url, external_id=transcript_id)
            if existing:
                self._apply_resolve_context(existing, payload)
                self.repository.save_meeting_artifact(existing)
                self.repository.commit()
                return self._artifact_read(existing)
            if transcript_id is None:
                raise field_validation_error("identifier", "Fireflies transcript URL could not be resolved. Paste the Fireflies transcript ID instead.")

        if not transcript_id:
            raise field_validation_error("identifier", "Enter a Fireflies transcript ID or transcript URL.")

        try:
            record = self._fetch_fireflies_transcript_record(connection, transcript_id)
        except LookupError as exc:
            raise field_validation_error("identifier", str(exc)) from exc
        except ValueError as exc:
            self._mark_connection_error(connection, str(exc))
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

        artifact, _ = self._upsert_fireflies_record(record, current_user)
        self._apply_resolve_context(artifact, payload)
        connection.status = "connected"
        connection.last_error = None
        self.repository.save_user_connection(connection)
        self.repository.save_meeting_artifact(artifact)
        self.repository.commit()
        return self._artifact_read(artifact)

    def get_owned_artifact(self, meeting_id: str, current_user: User) -> MeetingArtifact:
        return self._artifact_or_404(meeting_id, current_user)

    def _fetch_fathom_records(self, connection: UserIntegrationConnection, *, max_pages: int | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        credentials = self._credentials(connection)
        api_key = credentials.get("api_key")
        if not api_key:
            raise ValueError("Fathom API key is required.")
        settings = connection.settings_json or {}
        base_url = settings.get("base_url") or self.settings.fathom_base_url
        recordings_path = settings.get("recordings_path") or self.settings.fathom_recordings_path
        page_limit = max(1, min(int(max_pages if max_pages is not None else settings.get("max_pages") or 5), 25))
        params = {
            "include_summary": "true",
            "include_action_items": "true",
            "include_transcript": "false",
        }
        if limit is not None:
            params["limit"] = str(max(1, min(limit, 100)))
        elif settings.get("limit"):
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

    def _fetch_fathom_summary_record(self, connection: UserIntegrationConnection, recording_id: str, source_url: str | None) -> dict[str, Any]:
        credentials = self._credentials(connection)
        api_key = credentials.get("api_key")
        if not api_key:
            raise ValueError("Fathom API key is required.")
        settings = connection.settings_json or {}
        base_url = str(settings.get("base_url") or self.settings.fathom_base_url).rstrip("/")
        encoded_recording_id = parse.quote(recording_id, safe="")
        url = f"{base_url}/external/v1/recordings/{encoded_recording_id}/summary"
        payload = IntegrationService._json_get(url, {"X-Api-Key": str(api_key)})
        summary = payload.get("summary") if isinstance(payload, dict) else None
        if isinstance(summary, dict):
            default_summary = summary
        elif isinstance(summary, str):
            default_summary = {"markdown_formatted": summary}
        else:
            default_summary = {"markdown_formatted": ""}
        record: dict[str, Any] = {
            "recording_id": recording_id,
            "meeting_title": f"Fathom recording {recording_id}",
            "default_summary": default_summary,
            "resolve_source": "recording_summary",
        }
        if source_url:
            record["share_url"] = source_url
        return record

    def _find_fathom_record_by_recording_id(self, connection: UserIntegrationConnection, recording_id: str) -> dict[str, Any] | None:
        for record in self._fetch_fathom_records(connection, max_pages=1, limit=25):
            if str(record.get("recording_id") or record.get("id") or "").strip() == recording_id:
                return record
        return None

    def _find_fathom_record_by_source_url(self, connection: UserIntegrationConnection, source_url: str) -> dict[str, Any] | None:
        expected = self._url_key(source_url)
        for record in self._fetch_fathom_records(connection, max_pages=1, limit=25):
            for value in (record.get("share_url"), record.get("url"), record.get("source_link"), record.get("meeting_url")):
                if self._url_key(value) == expected:
                    return record
        return None

    def _fetch_fireflies_transcript_record(self, connection: UserIntegrationConnection, transcript_id: str) -> dict[str, Any]:
        credentials = self._credentials(connection)
        api_key = credentials.get("api_key")
        if not api_key:
            raise ValueError("Fireflies API key is required.")
        settings = connection.settings_json or {}
        url = str(settings.get("base_url") or "https://api.fireflies.ai/graphql").rstrip("/")
        query = """
        query Transcript($transcriptId: String!) {
          transcript(id: $transcriptId) {
            id
            title
            transcript_url
            meeting_link
            date
            summary {
              notes
              overview
              short_summary
              action_items
            }
          }
        }
        """
        payload = IntegrationService._json_post(
            url,
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            {"query": query, "variables": {"transcriptId": transcript_id}},
        )
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if isinstance(errors, list) and errors:
            message = str(errors[0].get("message") if isinstance(errors[0], dict) else errors[0])
            raise LookupError(message or "Fireflies transcript was not found or is not accessible.")
        transcript = payload.get("data", {}).get("transcript") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else None
        if not isinstance(transcript, dict):
            raise LookupError("Fireflies transcript was not found or is not accessible.")
        transcript.setdefault("id", transcript_id)
        return transcript

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

    def _upsert_fireflies_record(self, record: dict[str, Any], current_user: User) -> tuple[MeetingArtifact, bool]:
        external_id = str(record.get("id") or record.get("external_id") or "").strip()
        if not external_id:
            raise ValueError("Fireflies transcript ID is required.")
        source_link = str(record.get("transcript_url") or record.get("source_link") or "").strip() or None
        meeting_url = str(record.get("meeting_link") or record.get("meeting_url") or "").strip() or None
        existing = self.repository.get_meeting_by_external_id(owner_id=current_user.id, provider="fireflies", external_id=external_id)
        if existing is None and source_link:
            existing = self.repository.get_meeting_by_source_link(owner_id=current_user.id, provider="fireflies", source_link=source_link)

        title = str(record.get("title") or "Fireflies transcript")
        summary = self._fireflies_summary(record)
        action_items = self._fireflies_action_items(record)
        occurred_at = self._fireflies_record_datetime(record)
        metadata = sanitize_payload(record)
        if not isinstance(metadata, dict):
            metadata = {"payload": metadata}
        if isinstance(metadata.get("summary"), dict):
            if summary:
                metadata["summary"]["notes"] = summary
            metadata["summary"]["action_items"] = action_items

        if existing:
            existing.external_id = external_id
            existing.title = title[:255]
            existing.summary = summary
            existing.action_items = action_items
            existing.source_link = source_link or existing.source_link
            existing.meeting_url = meeting_url or existing.meeting_url
            existing.occurred_at = occurred_at or existing.occurred_at
            existing.status = "ready"
            existing.metadata_json = metadata
            self.repository.save_meeting_artifact(existing)
            return existing, False

        artifact = MeetingArtifact(
            owner_id=current_user.id,
            provider="fireflies",
            external_id=external_id,
            title=title[:255],
            summary=summary,
            action_items=action_items,
            source_link=source_link,
            meeting_url=meeting_url,
            occurred_at=occurred_at,
            status="ready",
            metadata_json=metadata,
        )
        self.repository.save_meeting_artifact(artifact)
        return artifact, True

    def _existing_fathom_artifact(self, current_user: User, *, source_url: str | None = None, recording_id: str | None = None) -> MeetingArtifact | None:
        if recording_id:
            existing = self.repository.get_meeting_by_external_id(owner_id=current_user.id, provider="fathom", external_id=recording_id)
            if existing:
                return existing
        if not source_url:
            return None
        for url in self._url_variants(source_url):
            existing = self.repository.get_meeting_by_source_link(owner_id=current_user.id, provider="fathom", source_link=url)
            if existing:
                return existing
        return None

    def _existing_provider_artifact(self, provider: str, current_user: User, *, source_url: str | None = None, external_id: str | None = None) -> MeetingArtifact | None:
        if external_id:
            existing = self.repository.get_meeting_by_external_id(owner_id=current_user.id, provider=provider, external_id=external_id)
            if existing:
                return existing
        if not source_url:
            return None
        for url in self._url_variants(source_url):
            existing = self.repository.get_meeting_by_source_link(owner_id=current_user.id, provider=provider, source_link=url)
            if existing:
                return existing
        return None

    def _apply_resolve_context(self, artifact: MeetingArtifact, payload: MeetingProviderResolveRequest) -> None:
        if payload.account_id:
            artifact.account_id = payload.account_id
        if payload.engagement_id:
            artifact.engagement_id = payload.engagement_id
        if payload.linked_object_type:
            artifact.linked_object_type = payload.linked_object_type
        if payload.linked_object_id:
            artifact.linked_object_id = payload.linked_object_id

    def _mark_connection_error(self, connection: UserIntegrationConnection, message: str) -> None:
        connection.status = "error"
        connection.last_error = message
        self.repository.save_user_connection(connection)
        self.repository.commit()

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
    def _connection_read(connection: UserIntegrationConnection | None, *, provider: str = "fathom") -> UserFathomConnectionRead:
        if connection is None:
            return UserFathomConnectionRead(provider=provider, credential_status={"configured": False, "fields": [], "masked": False})
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
    def _looks_like_provider_link(provider: str, value: str | None) -> bool:
        if provider == "fireflies":
            return bool(value and "fireflies.ai" in value.lower())
        return MeetingCaptureService._looks_like_fathom_link(value)

    @staticmethod
    def _parse_fathom_identifier(identifier: str) -> tuple[str | None, str | None]:
        value = identifier.strip()
        if value.isdigit():
            return value, None
        parsed = parse.urlparse(value)
        if not parsed.scheme and not parsed.netloc:
            raise field_validation_error("identifier", "Enter a Fathom recording ID or share URL.")
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise field_validation_error("identifier", "Fathom meeting URL must be a valid HTTP or HTTPS URL.")
        if "fathom" not in parsed.netloc.lower():
            raise field_validation_error("identifier", "Enter a Fathom recording ID or Fathom share URL.")

        query = parse.parse_qs(parsed.query)
        for key in ("recording_id", "recordingId", "recording", "id"):
            for candidate in query.get(key, []):
                if str(candidate).strip().isdigit():
                    return str(candidate).strip(), value

        for segment in reversed([part for part in parsed.path.split("/") if part]):
            clean = re.sub(r"\D", "", segment)
            if clean and clean == segment:
                return clean, value
        return None, value

    @staticmethod
    def _parse_fireflies_identifier(identifier: str) -> tuple[str | None, str | None]:
        value = identifier.strip()
        if MeetingCaptureService._looks_like_fireflies_id(value):
            return value, None
        parsed = parse.urlparse(value)
        if not parsed.scheme and not parsed.netloc:
            raise field_validation_error("identifier", "Enter a Fireflies transcript ID or transcript URL.")
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise field_validation_error("identifier", "Fireflies transcript URL must be a valid HTTP or HTTPS URL.")
        if "fireflies.ai" not in parsed.netloc.lower():
            raise field_validation_error("identifier", "Enter a Fireflies transcript ID or Fireflies transcript URL.")

        query = parse.parse_qs(parsed.query)
        for key in ("transcript_id", "transcriptId", "id"):
            for candidate in query.get(key, []):
                candidate_value = str(candidate).strip()
                if MeetingCaptureService._looks_like_fireflies_id(candidate_value):
                    return candidate_value, value

        for segment in reversed([parse.unquote(part).strip() for part in parsed.path.split("/") if part]):
            candidate = segment.split("::")[-1].strip()
            if candidate.lower() in {"app", "meeting", "meetings", "transcript", "transcripts", "view"}:
                continue
            if MeetingCaptureService._looks_like_fireflies_id(candidate):
                return candidate, value
        return None, value

    @staticmethod
    def _looks_like_fireflies_id(value: str) -> bool:
        return bool(re.fullmatch(r"[A-Za-z0-9:_-]{4,255}", value.strip()))

    @classmethod
    def _url_variants(cls, value: str) -> list[str]:
        variants = [value.strip()]
        without_trailing = variants[0].rstrip("/")
        if without_trailing and without_trailing not in variants:
            variants.append(without_trailing)
        with_trailing = f"{without_trailing}/" if without_trailing else ""
        if with_trailing and with_trailing not in variants:
            variants.append(with_trailing)
        return variants

    @classmethod
    def _url_key(cls, value: Any) -> str:
        if not value:
            return ""
        return str(value).strip().rstrip("/").lower()

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
    def _fireflies_summary(record: dict[str, Any]) -> str | None:
        summary = record.get("summary") if isinstance(record.get("summary"), dict) else {}
        for key in ("notes", "overview", "short_summary"):
            value = summary.get(key)
            if isinstance(value, str) and value.strip():
                cleaned = MeetingCaptureService._clean_meeting_text(value, max_length=8000)
                return cleaned or None
        return None

    @staticmethod
    def _fireflies_action_items(record: dict[str, Any]) -> list[str]:
        summary = record.get("summary") if isinstance(record.get("summary"), dict) else {}
        action_items = summary.get("action_items")
        raw_items: list[Any]
        if isinstance(action_items, str):
            raw_items = action_items.splitlines()
        elif isinstance(action_items, list):
            raw_items = action_items
        else:
            raw_items = []

        items: list[str] = []
        seen: set[str] = set()
        for action in raw_items:
            if isinstance(action, dict):
                title = str(action.get("title") or action.get("description") or action.get("text") or "").strip()
            else:
                title = str(action).strip()
            title = MeetingCaptureService._clean_action_item_text(title)
            if not title or not MeetingCaptureService._looks_like_action_item(title):
                continue
            title = title[:220]
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(title)
        return items[:50]

    @classmethod
    def _clean_meeting_text(cls, value: Any, *, max_length: int) -> str:
        text = str(value or "")
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</(?:p|div|li|h[1-6])\s*>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        lines: list[str] = []
        previous_blank = False
        for line in text.splitlines():
            cleaned = cls._clean_meeting_line(line)
            if not cleaned:
                if lines and not previous_blank:
                    lines.append("")
                    previous_blank = True
                continue
            if cleaned.lower().rstrip(":") in cls.NON_ACTION_HEADINGS:
                continue
            lines.append(cleaned)
            previous_blank = False
        cleaned_text = "\n".join(lines).strip()
        cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)
        return cleaned_text[:max_length].rstrip()

    @classmethod
    def _clean_action_item_text(cls, value: str) -> str:
        title = cls._clean_meeting_line(value)
        if not title:
            return ""
        title = re.sub(r"^(?:action items?|actions?|follow[- ]?ups?|next steps?)\s*:\s*", "", title, flags=re.IGNORECASE).strip()
        owner_prefix = re.match(r"^([A-Z][A-Za-z.'_-]+(?:\s+[A-Z][A-Za-z.'_-]+){0,3})\s*[:\-–—]\s+(.+)$", title)
        if owner_prefix and cls._contains_action_signal(owner_prefix.group(2)):
            title = owner_prefix.group(2).strip()
        return title

    @classmethod
    def _clean_meeting_line(cls, value: str) -> str:
        line = value.strip()
        if not line:
            return ""
        line = re.sub(r"^\s*#{1,6}\s*", "", line)
        line = cls._strip_markdown(line)
        line = re.sub(r"^\s*(?:[-•]|\d+[.)])\s*", "", line).strip()
        line = cls._strip_timecodes(line)
        line = re.sub(r"\s+", " ", line)
        return line.strip(" \t-–—:")

    @staticmethod
    def _strip_markdown(value: str) -> str:
        text = value
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        text = re.sub(r"`([^`]+)`", r"\1", text)
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        text = re.sub(r"__([^_]+)__", r"\1", text)
        text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", text)
        text = re.sub(r"(?<!_)_([^_\n]+)_(?!_)", r"\1", text)
        return text

    @staticmethod
    def _strip_timecodes(value: str) -> str:
        timecode = r"(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?"
        return re.sub(rf"\s*[\[(]?\s*{timecode}(?:\s*[-–—]\s*{timecode})?\s*[\])]?", " ", value)

    @classmethod
    def _looks_like_action_item(cls, value: str) -> bool:
        title = value.strip()
        if not title:
            return False
        normalized = title.lower().strip(" .:")
        if normalized in cls.NON_ACTION_HEADINGS:
            return False
        words = re.findall(r"[A-Za-z0-9]+", title)
        if len(words) < 2 and not cls._contains_action_signal(title):
            return False
        if re.fullmatch(r"[A-Z][A-Za-z.'_-]+(?:\s+[A-Z][A-Za-z.'_-]+){0,3}", title) and not cls._contains_action_signal(title):
            return False
        return cls._contains_action_signal(title)

    @classmethod
    def _contains_action_signal(cls, value: str) -> bool:
        normalized = value.lower()
        if any(re.search(rf"\b{re.escape(verb)}\b", normalized) for verb in cls.ACTION_ITEM_VERBS):
            return True
        return bool(re.search(r"\b(?:before|due|deadline|owner|needs?|should|must|will)\b", normalized))

    @staticmethod
    def _fireflies_record_datetime(record: dict[str, Any]) -> datetime | None:
        value = record.get("date")
        if value is None:
            return None
        if isinstance(value, int | float):
            timestamp = float(value) / 1000 if float(value) > 9999999999 else float(value)
            return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            if re.fullmatch(r"\d+(?:\.\d+)?", stripped):
                timestamp = float(stripped) / 1000 if float(stripped) > 9999999999 else float(stripped)
                return datetime.fromtimestamp(timestamp, tz=timezone.utc)
            try:
                return datetime.fromisoformat(stripped.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None

    @staticmethod
    def _validated_settings(settings: dict[str, Any], *, provider: str = "fathom") -> dict[str, Any]:
        allowed = {"base_url"} if provider == "fireflies" else {"base_url", "recordings_path", "limit", "max_pages"}
        unknown = sorted(set(settings) - allowed)
        if unknown:
            raise field_validation_error("settings_json", f"Unsupported {MeetingCaptureService._provider_label(provider)} setting(s): {', '.join(unknown)}.")
        base_url = settings.get("base_url")
        if base_url and not str(base_url).startswith(("http://", "https://")):
            raise field_validation_error("settings_json.base_url", "Base URL must be an HTTP or HTTPS URL.")
        recordings_path = settings.get("recordings_path")
        if recordings_path and not str(recordings_path).startswith("/"):
            raise field_validation_error("settings_json.recordings_path", "Fathom meetings path must start with /.")
        return settings

    @staticmethod
    def _provider_label(provider: str) -> str:
        return "Fireflies" if provider == "fireflies" else "Fathom"
