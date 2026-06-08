import logging
from html import escape
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models import Account, KycAgentRun, KycConfiguration, KycDraft, KycSnapshot, KycWorkstreamOutput, SourceDocument, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.kyc import KycRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    KycAgentRunCreateRequest,
    KycAgentRunPageRead,
    KycAgentRunRead,
    KycCitationRead,
    KycConfigurationFieldRead,
    KycConfigurationRead,
    KycConfigurationUpdateRequest,
    KycDraftApproveRequest,
    KycDraftCreateRequest,
    KycDraftPageRead,
    KycDraftRead,
    KycDraftRejectRequest,
    KycDraftUpdateRequest,
    KycFieldRead,
    KycFreshnessRead,
    KycJobRunPendingRead,
    KycSnapshotPageRead,
    KycSnapshotRead,
    KycSnapshotRestoreRequest,
    KycWebResearchCreateRequest,
    KycWorkstreamRead,
)
from app.services.account_access import AccountAccessService, GLOBAL_EDIT_ROLES
from app.services.audit import AuditService
from app.services.kyc_debug_logging import log_kyc_verbose
from app.services.kyc_gateway import DeterministicKycGatewayAdapter, KycGatewayAdapter, KycGatewayRequest, KycGatewayResponse, KycGatewayWorkstreamResult
from app.services.kyc_retrieval import KycRetrievalService
from app.services.kyc_web_research import KycWebResearchService
from app.services.tavily_research import KycResearchResult, KycResearchSummary, OllamaKycResearchSummarizer, TavilyKycResearchProvider
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

AI_DISCLAIMER = "AI-assisted output generated from recorded platform data. Verify before use in client communication."
DEFAULT_RESEARCH_SOURCES = ["documents", "engagements", "timeline", "account_notes", "fathom_reviewed", "prior_snapshots"]
LOW_CONFIDENCE_THRESHOLD = 70
FRESHNESS_THRESHOLD_DAYS = 90

WORKSTREAMS: tuple[dict[str, str | int], ...] = (
    {"key": "market_research", "title": "Market Research", "sort_order": 1},
    {"key": "client_research", "title": "Client Research", "sort_order": 2},
    {"key": "stakeholder_details", "title": "Stakeholder Details", "sort_order": 3},
    {"key": "tkxel_engagement", "title": "Tkxel Engagement with Client", "sort_order": 4},
    {"key": "financial_landscape", "title": "Financial Landscape", "sort_order": 5},
)

FIELD_CATALOG: tuple[dict[str, Any], ...] = (
    {"key": "industry_overview", "label": "Industry overview", "workstream_key": "market_research", "required": True},
    {"key": "market_trends", "label": "Market landscape and trends", "workstream_key": "market_research", "required": True},
    {"key": "market_size_growth", "label": "Market size and growth", "workstream_key": "market_research", "required": True},
    {"key": "business_drivers", "label": "Business drivers", "workstream_key": "market_research", "required": True},
    {"key": "competitors", "label": "Competitor analysis", "workstream_key": "market_research", "required": True},
    {"key": "regulatory", "label": "Regulatory and compliance factors", "workstream_key": "market_research", "required": True},
    {"key": "company_snapshot", "label": "Company snapshot", "workstream_key": "client_research", "required": True},
    {"key": "company_profile", "label": "Company profile", "workstream_key": "client_research", "required": True},
    {"key": "strategy", "label": "Vision, mission and strategy", "workstream_key": "client_research", "required": True},
    {"key": "company_history", "label": "Company history and evolution", "workstream_key": "client_research", "required": True},
    {"key": "core_offerings", "label": "Core offerings and solutions", "workstream_key": "client_research", "required": True},
    {"key": "monetization_model", "label": "Monetization model", "workstream_key": "client_research", "required": True},
    {"key": "key_achievements", "label": "Key achievements", "workstream_key": "client_research", "required": True},
    {"key": "clients_and_segments", "label": "Clients and served segments", "workstream_key": "client_research", "required": True},
    {"key": "digital_products", "label": "Digital products and platforms", "workstream_key": "client_research", "required": True},
    {"key": "website_and_social", "label": "Website and approved public profile links", "workstream_key": "client_research", "required": True},
    {"key": "stakeholder_map", "label": "Stakeholder map", "workstream_key": "client_research", "required": True},
    {"key": "technical_landscape", "label": "Technical landscape", "workstream_key": "client_research", "required": True},
    {"key": "client_stakeholders", "label": "Client-side stakeholders", "workstream_key": "stakeholder_details", "required": True},
    {"key": "tkxel_stakeholders", "label": "Tkxel-side stakeholder mapping", "workstream_key": "stakeholder_details", "required": True},
    {"key": "project_charters", "label": "Project charters", "workstream_key": "tkxel_engagement", "required": True},
    {"key": "engagement_models", "label": "Engagement models", "workstream_key": "tkxel_engagement", "required": True},
    {"key": "obligations", "label": "Contractual obligations and SLAs", "workstream_key": "tkxel_engagement", "required": True},
    {"key": "past_engagements", "label": "Past engagement summary", "workstream_key": "tkxel_engagement", "required": True},
    {"key": "renewal_cycle", "label": "Renewal cycle", "workstream_key": "financial_landscape", "required": True},
    {"key": "payment_behaviour", "label": "Payment behaviour", "workstream_key": "financial_landscape", "required": True, "sensitive": True},
    {"key": "gross_margins", "label": "Gross margins", "workstream_key": "financial_landscape", "required": True, "sensitive": True},
    {"key": "billing_models", "label": "Billing models", "workstream_key": "financial_landscape", "required": True, "sensitive": True},
)


class KycService:
    def __init__(self, db: Session, gateway: KycGatewayAdapter | None = None) -> None:
        self.kyc = KycRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))
        self.gateway = gateway or DeterministicKycGatewayAdapter()
        from app.config import get_settings

        self.settings = get_settings()

    def list_drafts(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        confidence_level: str | None = None,
        missing_fields: bool | None = None,
        stale_status: str | None = None,
        reviewer: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> KycDraftPageRead:
        account = self._require_account_view(account_id, current_user)
        config = self._configuration()
        drafts, total = self.kyc.list_drafts(
            account.id,
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
            freshness_threshold_days=config.freshness_threshold_days,
        )
        return KycDraftPageRead(items=[self._draft_read(item, current_user) for item in drafts], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_draft(self, account_id: str, payload: KycDraftCreateRequest, current_user: User) -> KycDraftRead:
        account = self._require_account_trigger(account_id, current_user)
        config = self._configuration()
        source_documents = self._authorized_source_documents(account, payload.source_document_ids, current_user)
        latest_snapshot = self.kyc.latest_snapshot(account.id)
        research_sources = self._normalize_research_sources(payload.research_sources or list(config.research_sources))
        if self._should_queue_ai_run():
            agent_run = self._queue_agent_run(account, source_documents, research_sources, payload.trigger_source, current_user, latest_snapshot=latest_snapshot)
            fields = self._pending_fields(latest_snapshot)
            fields = self._prefill_fields_from_sources(account, fields, source_documents, current_user, latest_snapshot)
            fields = self._apply_note_to_fields(fields, payload.notes)
            initial_quality = self._quality(fields, source_documents, config)
            draft = KycDraft(
                account_id=account.id,
                trigger_source=payload.trigger_source,
                agent_run_id=agent_run.id,
                previous_snapshot_id=latest_snapshot.id if latest_snapshot else None,
                source_document_ids=[document.id for document in source_documents],
                research_sources=research_sources,
                fields_json=fields,
                citations_json=self._citations_from_fields(fields) or self._citations_from_documents(source_documents),
                missing_fields=initial_quality["missing_fields"],
                conflicts=["KYC generation is queued. Review and approve only after the AI run completes."],
                difference_summary=self._difference_summary(fields, latest_snapshot),
                source_context=self._source_context(source_documents, agent_run),
                detailed_description=self._append_detailed_description("", agent_run.detailed_description, agent_run),
                confidence=initial_quality["confidence"],
                completeness=initial_quality["completeness"],
                source_coverage=initial_quality["source_coverage"],
                freshness_status="fresh",
                created_by_id=current_user.id,
                created_by_name=current_user.full_name,
                review_notes=payload.notes,
            )
            self.kyc.save_draft(draft)
            self.audit.log(
                module="kyc",
                action="draft_create_queued",
                entity_type="kyc_draft",
                entity_id=draft.id,
                actor=current_user,
                after_value={"account_id": account.id, "agent_run_id": agent_run.id, "status": agent_run.status},
            )
            self.timeline.add_account_event(
                account_id=account.id,
                event_type="kyc_ai_extraction",
                module="kyc",
                title="AI KYC draft queued",
                description="A local AI KYC run was queued. Previous approved KYC remains official until this draft is reviewed and approved.",
                actor=current_user,
                source_record_id=draft.id,
                source_record_type="kyc_draft",
                source_record_route=f"/accounts/{account.id}?tab=kyc",
                metadata={"agent_run_id": agent_run.id, "research_sources": research_sources},
            )
            self.kyc.commit()
            return self.get_draft(account.id, draft.id, current_user)

        agent_run = self._build_agent_run(account, source_documents, research_sources, payload.trigger_source, current_user, latest_snapshot=latest_snapshot)
        self._log_agent_run(account, agent_run, current_user, "kyc_ai_extraction")
        fields = self._fields_from_run(account, agent_run, latest_snapshot)
        fields = self._apply_note_to_fields(fields, payload.notes)
        quality = self._quality(fields, source_documents, config)
        draft = KycDraft(
            account_id=account.id,
            trigger_source=payload.trigger_source,
            agent_run_id=agent_run.id,
            previous_snapshot_id=latest_snapshot.id if latest_snapshot else None,
            source_document_ids=[document.id for document in source_documents],
            research_sources=research_sources,
            fields_json=fields,
            citations_json=self._citations_from_documents(source_documents),
            missing_fields=quality["missing_fields"],
            conflicts=self._conflicts(source_documents, agent_run),
            difference_summary=self._difference_summary(fields, latest_snapshot),
            source_context=self._source_context(source_documents, agent_run),
            detailed_description=self._append_detailed_description("", agent_run.detailed_description, agent_run),
            confidence=quality["confidence"],
            completeness=quality["completeness"],
            source_coverage=quality["source_coverage"],
            freshness_status="fresh",
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            review_notes=payload.notes,
        )
        self.kyc.save_draft(draft)
        self.audit.log(
            module="kyc",
            action="draft_create",
            entity_type="kyc_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={"account_id": account.id, "confidence": draft.confidence, "completeness": draft.completeness},
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_draft_created",
            module="kyc",
            title="AI KYC draft created",
            description=f"AI-assisted KYC draft created with {len(fields)} field(s) and {len(source_documents)} source document(s).",
            actor=current_user,
            source_record_id=draft.id,
            source_record_type="kyc_draft",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"agent_run_id": agent_run.id, "research_sources": research_sources},
        )
        self.kyc.commit()
        return self.get_draft(account.id, draft.id, current_user)

    def get_draft(self, account_id: str, draft_id: str, current_user: User) -> KycDraftRead:
        account = self._require_account_view(account_id, current_user)
        draft = self._draft_or_404(draft_id, account.id)
        return self._draft_read(draft, current_user)

    def update_draft(self, account_id: str, draft_id: str, payload: KycDraftUpdateRequest, current_user: User) -> KycDraftRead:
        account = self._require_account_update(account_id, current_user)
        draft = self._draft_or_404(draft_id, account.id)
        self._ensure_open_draft(draft)
        before = self._draft_audit_value(draft)
        fields = [dict(field) for field in draft.fields_json]
        updates = {field.key: field for field in payload.fields or []}
        if updates:
            known_keys = {field["key"] for field in fields}
            unknown_keys = sorted(set(updates) - known_keys)
            if unknown_keys:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"message": "KYC draft update validation failed", "errors": [{"field": "fields", "message": f"Unknown KYC field(s): {', '.join(unknown_keys)}"}]})
            restricted_keys = sorted(field["label"] for field in fields if field["key"] in updates and field.get("is_sensitive") and not self._can_view_sensitive(current_user))
            if restricted_keys:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Restricted KYC field update is not allowed: {', '.join(restricted_keys)}")
            for field in fields:
                update = updates.get(field["key"])
                if update is None:
                    continue
                if "value" in update.model_fields_set:
                    value = update.value or ""
                    field["value"] = value
                    field["missing"] = not bool(value.strip())
                if update.reviewed is not None:
                    field["reviewed"] = update.reviewed

        draft.fields_json = fields
        flag_modified(draft, "fields_json")
        draft.low_confidence_acknowledged = payload.low_confidence_acknowledged if payload.low_confidence_acknowledged is not None else draft.low_confidence_acknowledged
        draft.conflicts_acknowledged = payload.conflicts_acknowledged if payload.conflicts_acknowledged is not None else draft.conflicts_acknowledged
        if payload.override_reason is not None:
            draft.override_reason = payload.override_reason
        if payload.review_notes is not None:
            draft.review_notes = payload.review_notes
        if payload.detailed_description is not None:
            draft.detailed_description = payload.detailed_description
        quality = self._quality(fields, self._documents_by_ids(account, draft.source_document_ids), self._configuration())
        draft.missing_fields = quality["missing_fields"]
        draft.confidence = quality["confidence"]
        draft.completeness = quality["completeness"]
        draft.source_coverage = quality["source_coverage"]
        draft.reviewed_by_id = current_user.id
        draft.reviewed_by_name = current_user.full_name
        self.audit.log(
            module="kyc",
            action="draft_update",
            entity_type="kyc_draft",
            entity_id=draft.id,
            actor=current_user,
            before_value=before,
            after_value=self._draft_audit_value(draft),
        )
        self.kyc.commit()
        return self.get_draft(account.id, draft.id, current_user)

    def approve_draft(self, account_id: str, draft_id: str, payload: KycDraftApproveRequest, current_user: User) -> KycDraftRead:
        account = self._require_account_approve(account_id, current_user)
        draft = self._draft_or_404(draft_id, account.id)
        self._ensure_open_draft(draft)
        self._validate_approval(draft, payload)
        latest = self.kyc.latest_snapshot(account.id)
        version = (latest.version + 1) if latest else 1
        change_summary = payload.change_summary or draft.difference_summary or [f"KYC snapshot v{version} approved from AI-assisted draft."]
        now = datetime.now(timezone.utc)
        snapshot = KycSnapshot(
            account_id=account.id,
            version=version,
            source_draft_id=draft.id,
            extraction_run_id=draft.agent_run_id,
            approved_by_id=current_user.id,
            approved_by_name=current_user.full_name,
            approved_at=now,
            fields_json=list(draft.fields_json),
            citations_json=list(draft.citations_json),
            source_context=self._source_context_read(draft.source_context, current_user),
            detailed_description=draft.detailed_description,
            source_document_ids=list(draft.source_document_ids),
            research_sources=list(draft.research_sources),
            confidence=draft.confidence,
            completeness=draft.completeness,
            source_coverage=draft.source_coverage,
            freshness_status="fresh",
            missing_fields=list(draft.missing_fields),
            conflicts=list(draft.conflicts),
            change_summary=change_summary,
        )
        self.kyc.save_snapshot(snapshot)
        draft.status = "approved"
        draft.approved_by_id = current_user.id
        draft.approved_by_name = current_user.full_name
        draft.approved_snapshot_id = snapshot.id
        draft.low_confidence_acknowledged = payload.low_confidence_acknowledged or draft.low_confidence_acknowledged
        draft.conflicts_acknowledged = payload.conflicts_acknowledged or draft.conflicts_acknowledged
        draft.override_reason = payload.override_reason or draft.override_reason
        draft.decided_at = now
        self.audit.log(
            module="kyc",
            action="draft_approve",
            entity_type="kyc_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={"snapshot_id": snapshot.id, "version": version, "confidence": snapshot.confidence, "completeness": snapshot.completeness},
            reason=payload.override_reason,
        )
        self.audit.log(
            module="kyc",
            action="snapshot_create",
            entity_type="kyc_snapshot",
            entity_id=snapshot.id,
            actor=current_user,
            after_value={"account_id": account.id, "version": version, "source_draft_id": draft.id},
            reason="Approved KYC snapshot created.",
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_approved",
            module="kyc",
            title=f"KYC snapshot v{version} approved",
            description="Approved KYC snapshot became official platform intelligence.",
            actor=current_user,
            source_record_id=snapshot.id,
            source_record_type="kyc_snapshot",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            before_value={"previous_snapshot_id": latest.id if latest else None},
            after_value={"snapshot_id": snapshot.id, "version": version},
            metadata={"draft_id": draft.id, "agent_run_id": draft.agent_run_id},
        )
        self.kyc.commit()
        return self.get_draft(account.id, draft.id, current_user)

    def reject_draft(self, account_id: str, draft_id: str, payload: KycDraftRejectRequest, current_user: User) -> KycDraftRead:
        account = self._require_account_approve(account_id, current_user)
        draft = self._draft_or_404(draft_id, account.id)
        self._ensure_open_draft(draft)
        draft.status = "rejected"
        draft.rejected_by_id = current_user.id
        draft.rejected_by_name = current_user.full_name
        draft.rejection_reason = payload.reason
        draft.decided_at = datetime.now(timezone.utc)
        self.audit.log(
            module="kyc",
            action="draft_reject",
            entity_type="kyc_draft",
            entity_id=draft.id,
            actor=current_user,
            before_value={"status": "ready_for_review"},
            after_value={"status": "rejected"},
            reason=payload.reason,
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_rejected",
            module="kyc",
            title="KYC draft rejected",
            description=payload.reason,
            actor=current_user,
            source_record_id=draft.id,
            source_record_type="kyc_draft",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
        )
        self.kyc.commit()
        return self.get_draft(account.id, draft.id, current_user)

    def trigger_web_research(self, account_id: str, payload: KycWebResearchCreateRequest, current_user: User) -> KycAgentRunRead:
        account = self._require_account_trigger(account_id, current_user)
        active = self._active_agent_run_or_release_stale(account.id, current_user)
        if active is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A KYC AI or web research run is already pending or running for this account")
        draft = self._research_target_draft(account.id, payload.draft_id)
        source_documents = self._documents_by_ids(account, list(draft.source_document_ids))
        custom_query = self._normalize_research_query(payload.query)
        now = datetime.now(timezone.utc)
        run = KycAgentRun(
            account_id=account.id,
            status="pending",
            trigger_source="manual",
            source_document_ids=list(draft.source_document_ids),
            research_sources=list(dict.fromkeys([*list(draft.research_sources), "tavily_web_research"])),
            triggered_by_id=current_user.id,
            triggered_by_name=current_user.full_name,
            queued_at=now,
            max_retries=self.settings.ai_kyc_max_retries,
            provider_json={
                "adapter": "tavily-ollama-research",
                "provider": "tavily",
                "search_provider": "tavily",
                "summarizer_provider": self.settings.ai_kyc_research_summarizer_provider,
                "summarizer_model": self.settings.ai_kyc_research_summarizer_model,
                "base_url": self.settings.ai_kyc_research_summarizer_base_url,
                "research_only": True,
                "draft_id": draft.id,
                "custom_query": custom_query,
            },
            model_name=self.settings.ai_kyc_research_summarizer_model,
            retrieval_summary_json={
                "status": "queued",
                "research_only": True,
                "draft_id": draft.id,
                "custom_query": custom_query,
                "source_document_ids": [document.id for document in source_documents],
            },
        )
        self.kyc.save_agent_run(run)
        self.kyc.save_workstream(
            KycWorkstreamOutput(
                run_id=run.id,
                account_id=account.id,
                workstream_key="client_research",
                title="Tavily Web Research",
                status="pending",
                sort_order=2,
                output_json={},
                citations_json=[],
                missing_fields=[],
                confidence=0,
            )
        )
        self.audit.log(
            module="kyc",
            action="web_research_queued",
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            after_value={
                "account_id": account.id,
                "draft_id": draft.id,
                "provider": "tavily",
                "model": self.settings.ai_kyc_research_summarizer_model,
                "custom_query": custom_query,
            },
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_web_research",
            module="kyc",
            title="KYC web research queued",
            description="Tavily web research was queued for local Ollama summarization. Existing KYC content will be appended, not replaced.",
            actor=current_user,
            source_record_id=run.id,
            source_record_type="kyc_agent_run",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"draft_id": draft.id, "provider": "tavily", "model": self.settings.ai_kyc_research_summarizer_model, "custom_query": custom_query},
        )
        self.kyc.commit()
        return self.get_agent_run(account.id, run.id, current_user)

    def restore_snapshot(self, account_id: str, snapshot_id: str, payload: KycSnapshotRestoreRequest, current_user: User) -> KycSnapshotRead:
        account = self._require_account_approve(account_id, current_user)
        snapshot = self.kyc.get_snapshot(snapshot_id)
        if snapshot is None or snapshot.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC snapshot was not found")
        latest = self.kyc.latest_snapshot(account.id)
        if latest is not None and latest.id == snapshot.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected KYC snapshot is already the active version")
        version = (latest.version + 1) if latest else 1
        now = datetime.now(timezone.utc)
        source_context = dict(snapshot.source_context or {})
        source_context["restore_metadata"] = {
            "restored_from_snapshot_id": snapshot.id,
            "restored_from_version": snapshot.version,
            "previous_active_snapshot_id": latest.id if latest else None,
            "previous_active_version": latest.version if latest else None,
            "restore_reason": payload.reason,
            "restored_by_id": current_user.id,
            "restored_by_name": current_user.full_name,
            "restored_at": now.isoformat(),
        }
        restored = KycSnapshot(
            account_id=account.id,
            version=version,
            source_draft_id=snapshot.source_draft_id,
            extraction_run_id=snapshot.extraction_run_id,
            approved_by_id=current_user.id,
            approved_by_name=current_user.full_name,
            approved_at=now,
            fields_json=list(snapshot.fields_json),
            citations_json=list(snapshot.citations_json),
            source_context=source_context,
            detailed_description=snapshot.detailed_description,
            source_document_ids=list(snapshot.source_document_ids),
            research_sources=list(snapshot.research_sources),
            confidence=snapshot.confidence,
            completeness=snapshot.completeness,
            source_coverage=snapshot.source_coverage,
            freshness_status="fresh",
            missing_fields=list(snapshot.missing_fields),
            conflicts=list(snapshot.conflicts),
            change_summary=[
                f"Restored KYC snapshot v{snapshot.version} as v{version}.",
                f"Restore reason: {payload.reason}",
            ],
        )
        self.kyc.save_snapshot(restored)
        self.audit.log(
            module="kyc",
            action="snapshot_restore",
            entity_type="kyc_snapshot",
            entity_id=restored.id,
            actor=current_user,
            before_value={"active_snapshot_id": latest.id if latest else None, "active_version": latest.version if latest else None},
            after_value={"snapshot_id": restored.id, "version": version, "restored_from_snapshot_id": snapshot.id, "restored_from_version": snapshot.version},
            reason=payload.reason,
        )
        self.audit.log(
            module="kyc",
            action="snapshot_create",
            entity_type="kyc_snapshot",
            entity_id=restored.id,
            actor=current_user,
            after_value={"account_id": account.id, "version": version, "restored_from_snapshot_id": snapshot.id},
            reason="Restored KYC snapshot created as active version.",
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_restored",
            module="kyc",
            title=f"KYC snapshot v{snapshot.version} restored as v{version}",
            description=payload.reason,
            actor=current_user,
            source_record_id=restored.id,
            source_record_type="kyc_snapshot",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            before_value={"previous_active_snapshot_id": latest.id if latest else None, "previous_active_version": latest.version if latest else None},
            after_value={"snapshot_id": restored.id, "version": version, "restored_from_snapshot_id": snapshot.id, "restored_from_version": snapshot.version},
            metadata={"restore_reason": payload.reason},
        )
        self.kyc.commit()
        return self.get_snapshot(account.id, restored.id, current_user)

    def list_snapshots(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        approver: str | None = None,
        source: str | None = None,
        confidence_level: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "approved_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> KycSnapshotPageRead:
        account = self._require_account_view(account_id, current_user)
        snapshots, total = self.kyc.list_snapshots(
            account.id,
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
        return KycSnapshotPageRead(items=[self._snapshot_read(item, current_user) for item in snapshots], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_snapshot(self, account_id: str, snapshot_id: str, current_user: User) -> KycSnapshotRead:
        account = self._require_account_view(account_id, current_user)
        snapshot = self.kyc.get_snapshot(snapshot_id)
        if snapshot is None or snapshot.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC snapshot was not found")
        return self._snapshot_read(snapshot, current_user)

    def freshness(self, account_id: str, current_user: User) -> KycFreshnessRead:
        account = self._require_account_view(account_id, current_user)
        config = self._configuration()
        latest = self.kyc.latest_snapshot(account.id)
        if latest is None:
            return KycFreshnessRead(
                account_id=account.id,
                has_approved_snapshot=False,
                completeness=0,
                confidence=0,
                source_coverage=0,
                freshness_status="missing",
                stale=True,
                freshness_threshold_days=config.freshness_threshold_days,
                missing_fields=[item["label"] for item in FIELD_CATALOG if item.get("required", True)],
                required_fields_total=len(config.required_field_keys),
                required_fields_completed=0,
            )
        approved_at = self._as_aware_utc(latest.approved_at)
        stale_after = approved_at + timedelta(days=config.freshness_threshold_days)
        stale = datetime.now(timezone.utc) >= stale_after
        return KycFreshnessRead(
            account_id=account.id,
            has_approved_snapshot=True,
            snapshot_id=latest.id,
            snapshot_version=latest.version,
            completeness=latest.completeness,
            confidence=latest.confidence,
            source_coverage=latest.source_coverage,
            freshness_status="stale" if stale else "fresh",
            stale=stale,
            freshness_threshold_days=config.freshness_threshold_days,
            last_approved_at=approved_at,
            stale_after=stale_after,
            missing_fields=list(latest.missing_fields),
            required_fields_total=len(config.required_field_keys),
            required_fields_completed=self._required_completed(latest.fields_json, config),
        )

    def read_configuration(self, current_user: User) -> KycConfigurationRead:
        self.access.require_module_permission(current_user, "kyc", "configure")
        return self._configuration_read(self._configuration())

    def update_configuration(self, payload: KycConfigurationUpdateRequest, current_user: User) -> KycConfigurationRead:
        self.access.require_module_permission(current_user, "kyc", "configure")
        config = self._configuration()
        before = {
            "required_field_keys": list(config.required_field_keys),
            "freshness_threshold_days": config.freshness_threshold_days,
            "low_confidence_threshold": config.low_confidence_threshold,
            "research_sources": list(config.research_sources),
        }
        if payload.required_field_keys is not None:
            known_keys = {field["key"] for field in FIELD_CATALOG}
            unknown = sorted(set(payload.required_field_keys) - known_keys)
            if unknown:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"message": "KYC configuration validation failed", "errors": [{"field": "required_field_keys", "message": f"Unknown KYC field key(s): {', '.join(unknown)}"}]})
            config.required_field_keys = payload.required_field_keys
        if payload.freshness_threshold_days is not None:
            config.freshness_threshold_days = payload.freshness_threshold_days
        if payload.low_confidence_threshold is not None:
            config.low_confidence_threshold = payload.low_confidence_threshold
        if payload.research_sources is not None:
            config.research_sources = self._normalize_research_sources(payload.research_sources)
        config.updated_by_id = current_user.id
        self.audit.log(
            module="kyc",
            action="configuration_update",
            entity_type="kyc_configuration",
            entity_id=config.id,
            actor=current_user,
            before_value=before,
            after_value={
                "required_field_keys": list(config.required_field_keys),
                "freshness_threshold_days": config.freshness_threshold_days,
                "low_confidence_threshold": config.low_confidence_threshold,
                "research_sources": list(config.research_sources),
            },
        )
        self.kyc.commit()
        return self._configuration_read(config)

    def list_agent_runs(
        self,
        account_id: str,
        current_user: User,
        *,
        search: str | None = None,
        status_filter: str | None = None,
        workstream: str | None = None,
        triggered_by: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "created_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> KycAgentRunPageRead:
        account = self._require_account_view(account_id, current_user)
        runs, total = self.kyc.list_agent_runs(
            account.id,
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
        return KycAgentRunPageRead(items=[self._agent_run_read(run, current_user) for run in runs], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_agent_run(self, account_id: str, payload: KycAgentRunCreateRequest, current_user: User) -> KycAgentRunRead:
        account = self._require_account_trigger(account_id, current_user)
        source_documents = self._authorized_source_documents(account, payload.source_document_ids, current_user)
        research_sources = self._normalize_research_sources(payload.research_sources or list(self._configuration().research_sources))
        latest_snapshot = self.kyc.latest_snapshot(account.id)
        if self._should_queue_ai_run():
            run = self._queue_agent_run(account, source_documents, research_sources, payload.trigger_source, current_user, latest_snapshot=latest_snapshot)
        else:
            run = self._build_agent_run(account, source_documents, research_sources, payload.trigger_source, current_user, latest_snapshot=latest_snapshot)
            self._log_agent_run(account, run, current_user, "kyc_agent_run_create")
        self.kyc.commit()
        return self.get_agent_run(account.id, run.id, current_user)

    def get_agent_run(self, account_id: str, run_id: str, current_user: User) -> KycAgentRunRead:
        account = self._require_account_view(account_id, current_user)
        run = self.kyc.get_agent_run(run_id)
        if run is None or run.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC agent run was not found")
        return self._agent_run_read(run, current_user)

    def refresh_agent_run(self, account_id: str, run_id: str, current_user: User) -> KycAgentRunRead:
        account = self._require_account_trigger(account_id, current_user)
        previous = self.kyc.get_agent_run(run_id)
        if previous is None or previous.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC agent run was not found")
        source_documents = self._authorized_source_documents(account, previous.source_document_ids, current_user)
        research_sources = self._normalize_research_sources(list(previous.research_sources))
        latest_snapshot = self.kyc.latest_snapshot(account.id)
        if self._should_queue_ai_run():
            run = self._queue_agent_run(
                account,
                source_documents,
                research_sources,
                "kyc_page",
                current_user,
                previous_run_id=previous.id,
                latest_snapshot=latest_snapshot,
            )
        else:
            run = self._build_agent_run(
                account,
                source_documents,
                research_sources,
                "kyc_page",
                current_user,
                previous_run_id=previous.id,
                latest_snapshot=latest_snapshot,
            )
            self._log_agent_run(account, run, current_user, "kyc_agent_run_refresh")
        self.kyc.commit()
        return self.get_agent_run(account.id, run.id, current_user)

    def retry_agent_run(self, account_id: str, run_id: str, current_user: User) -> KycAgentRunRead:
        account = self._require_account_trigger(account_id, current_user)
        run = self.kyc.get_agent_run(run_id)
        if run is None or run.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC agent run was not found")
        if run.status not in {"failed", "partial", "cancelled"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only failed, partial, or cancelled KYC runs can be retried")
        run.status = "pending"
        run.error_message = None
        run.queued_at = datetime.now(timezone.utc)
        run.started_at = None
        run.completed_at = None
        run.retry_count += 1
        run.next_retry_at = None
        for workstream in run.workstreams:
            workstream.status = "pending"
            workstream.error_message = None
            workstream.started_at = None
            workstream.completed_at = None
        self.audit.log(
            module="kyc",
            action="agent_run_retry",
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            after_value={"status": run.status, "retry_count": run.retry_count},
        )
        self.kyc.commit()
        return self.get_agent_run(account.id, run.id, current_user)

    def cancel_agent_run(self, account_id: str, run_id: str, current_user: User) -> KycAgentRunRead:
        account = self._require_account_trigger(account_id, current_user)
        run = self.kyc.get_agent_run(run_id)
        if run is None or run.account_id != account.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC agent run was not found")
        if run.status not in {"pending", "running"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending or running KYC runs can be cancelled")
        now = datetime.now(timezone.utc)
        previous_status = run.status
        cancel_message = "Cancelled before processing." if previous_status == "pending" else "Cancelled while running."
        run.status = "cancelled"
        run.error_message = cancel_message
        run.completed_at = now
        run.updated_at = now
        for workstream in run.workstreams:
            if workstream.status in {"pending", "running"}:
                workstream.status = "cancelled"
                workstream.error_message = cancel_message
                workstream.completed_at = now
        self._update_linked_drafts_from_run(account, run, current_user)
        self.audit.log(
            module="kyc",
            action="agent_run_cancel",
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            before_value={"status": previous_status},
            after_value={"status": run.status},
        )
        self.kyc.commit()
        return self.get_agent_run(account.id, run.id, current_user)

    def run_pending_jobs(self, current_user: User | None = None, *, limit: int | None = None) -> KycJobRunPendingRead:
        if current_user is not None:
            self.access.require_module_permission(current_user, "kyc", "configure")
        processed: list[KycAgentRunRead] = []
        failed: list[dict[str, str]] = []
        batch_size = limit or self.settings.kyc_worker_batch_size
        runs = self.kyc.due_agent_runs(limit=batch_size)
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.run_pending_jobs.start",
            {
                "batch_size": batch_size,
                "due_run_ids": [run.id for run in runs],
                "current_user_id": current_user.id if current_user else None,
                "current_user_role": current_user.role if current_user else None,
            },
        )
        for run in runs:
            try:
                actor = self.kyc.db.get(User, run.triggered_by_id) if run.triggered_by_id else current_user
                if actor is None:
                    raise RuntimeError("KYC run actor was not found")
                processed_run = self.process_agent_run(run.id, actor)
                processed.append(self._agent_run_read(processed_run, actor))
            except Exception as exc:  # pragma: no cover - defensive scheduled worker guard
                failed.append({"run_id": run.id, "message": str(exc)[:300]})
                logger.exception("KYC pending job failed for run %s", run.id)
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "kyc_service.run_pending_jobs.failure",
                    {"run_id": run.id, "error": str(exc)},
                )
        self.kyc.commit()
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.run_pending_jobs.complete",
            {
                "processed_count": len(processed),
                "failed_count": len(failed),
                "processed_run_ids": [run.id for run in processed],
                "failures": failed,
            },
        )
        return KycJobRunPendingRead(processed_count=len(processed), failed_count=len(failed), processed_runs=processed, failures=failed)

    def process_agent_run(self, run_id: str, current_user: User) -> KycAgentRun:
        run = self.kyc.get_agent_run(run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC agent run was not found")
        account = self._account_or_404(run.account_id)
        if run.status not in {"pending", "failed"}:
            log_kyc_verbose(
                logger,
                self.settings,
                "kyc_service.process_agent_run.skipped",
                {"run_id": run.id, "status": run.status, "account_id": account.id},
            )
            return run
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.process_agent_run.start",
            {
                "run_id": run.id,
                "account_id": account.id,
                "account_name": account.name,
                "status": run.status,
                "trigger_source": run.trigger_source,
                "source_document_ids": list(run.source_document_ids),
                "research_sources": list(run.research_sources),
                "actor_id": current_user.id,
                "actor_role": current_user.role,
            },
        )
        if self._is_research_only_run(run):
            self._execute_research_run(account, run, current_user)
            self._log_agent_run(account, run, current_user, "kyc_web_research_complete" if run.status in {"complete", "partial"} else "kyc_web_research_failed")
            self.kyc.commit()
            return run
        source_documents = self._authorized_source_documents(account, list(run.source_document_ids), current_user)
        latest_snapshot = self.kyc.latest_snapshot(account.id)
        self._execute_agent_run(account, run, source_documents, list(run.research_sources), run.trigger_source, current_user, latest_snapshot)
        self._update_linked_drafts_from_run(account, run, current_user)
        self._log_agent_run(account, run, current_user, "kyc_agent_run_complete" if run.status in {"complete", "partial"} else "kyc_agent_run_failed")
        self.kyc.commit()
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.process_agent_run.complete",
            {
                "run_id": run.id,
                "status": run.status,
                "error_message": run.error_message,
                "provider_json": run.provider_json,
                "usage_json": run.usage_json,
                "retrieval_summary_json": run.retrieval_summary_json,
                "workstreams": [
                    {
                        "workstream_key": item.workstream_key,
                        "status": item.status,
                        "confidence": item.confidence,
                        "missing_fields": item.missing_fields,
                        "output_json": item.output_json,
                        "citations_json": item.citations_json,
                        "error_message": item.error_message,
                    }
                    for item in run.workstreams
                ],
            },
        )
        return run

    def _require_account_view(self, account_id: str, current_user: User) -> Account:
        account = self._account_or_404(account_id)
        self.access.require_account_view(current_user, account, module="kyc")
        return account

    def _require_account_trigger(self, account_id: str, current_user: User) -> Account:
        account = self._account_or_404(account_id)
        self.access.require_module_permission(current_user, "kyc", "create")
        if not self.access.can_view_account(current_user, account):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this account")
        return account

    def _require_account_update(self, account_id: str, current_user: User) -> Account:
        account = self._account_or_404(account_id)
        self.access.require_account_update(current_user, account, module="kyc")
        return account

    def _require_account_approve(self, account_id: str, current_user: User) -> Account:
        account = self._account_or_404(account_id)
        self.access.require_module_permission(current_user, "kyc", "approve")
        if current_user.role != "kam_head":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only KAM Head can approve or reject KYC drafts")
        return account

    def _account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _draft_or_404(self, draft_id: str, account_id: str) -> KycDraft:
        draft = self.kyc.get_draft(draft_id)
        if draft is None or draft.account_id != account_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC draft was not found")
        return draft

    def _research_target_draft(self, account_id: str, draft_id: str | None) -> KycDraft:
        draft = self._draft_or_404(draft_id, account_id) if draft_id else self.kyc.latest_ready_draft(account_id)
        if draft is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create a ready-for-review KYC draft before running web research")
        self._ensure_open_draft(draft)
        return draft

    @staticmethod
    def _ensure_open_draft(draft: KycDraft) -> None:
        if draft.status != "ready_for_review":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only KYC drafts ready for review can be changed")

    def _configuration(self) -> KycConfiguration:
        configuration = self.kyc.get_configuration()
        if configuration is not None:
            return configuration
        configuration = KycConfiguration(
            name="default",
            required_field_keys=[item["key"] for item in FIELD_CATALOG if item.get("required", True)],
            freshness_threshold_days=FRESHNESS_THRESHOLD_DAYS,
            low_confidence_threshold=LOW_CONFIDENCE_THRESHOLD,
            research_sources=list(DEFAULT_RESEARCH_SOURCES),
        )
        self.kyc.save_configuration(configuration)
        return configuration

    @staticmethod
    def _configuration_read(configuration: KycConfiguration) -> KycConfigurationRead:
        return KycConfigurationRead(
            id=configuration.id,
            name=configuration.name,
            required_field_keys=list(configuration.required_field_keys),
            freshness_threshold_days=configuration.freshness_threshold_days,
            low_confidence_threshold=configuration.low_confidence_threshold,
            research_sources=list(configuration.research_sources),
            field_catalog=[
                KycConfigurationFieldRead(
                    key=str(field["key"]),
                    label=str(field["label"]),
                    workstream_key=str(field["workstream_key"]),
                    required=bool(field.get("required", True)),
                    sensitive=bool(field.get("sensitive", False)),
                )
                for field in FIELD_CATALOG
            ],
            updated_by_id=configuration.updated_by_id,
            created_at=configuration.created_at,
            updated_at=configuration.updated_at,
        )

    @staticmethod
    def _normalize_research_sources(research_sources: list[str]) -> list[str]:
        aliases = {
            "documents": "documents",
            "source_documents": "documents",
            "attachments": "documents",
            "engagements": "engagements",
            "sow": "engagements",
            "timeline": "timeline",
            "account_notes": "account_notes",
            "notes": "account_notes",
            "fathom": "fathom_reviewed",
            "fathom_reviewed": "fathom_reviewed",
            "prior_snapshots": "prior_snapshots",
            "prior_kyc": "prior_snapshots",
            "openai": "openai_context",
            "openai_context": "openai_context",
            "tavily": "tavily_web_research",
            "tavily_web_research": "tavily_web_research",
            "web_research": "tavily_web_research",
            # Legacy labels are accepted for backwards compatibility, but they do not trigger standalone providers.
            "travoly": "documents",
            "trivoly": "documents",
            "zoominfo": "documents",
            "crunchbase": "documents",
        }
        normalized: list[str] = []
        seen: set[str] = set()
        unknown: list[str] = []
        for source in research_sources:
            value = str(source).strip()
            if not value:
                continue
            canonical = aliases.get(value.lower())
            if canonical is None:
                unknown.append(value)
                continue
            key = canonical.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(canonical)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "message": "KYC research source validation failed",
                    "errors": [{"field": "research_sources", "message": f"Unsupported research source(s): {', '.join(unknown)}"}],
                },
            )
        return normalized

    def _authorized_source_documents(self, account: Account, source_document_ids: list[str], current_user: User) -> list[SourceDocument]:
        documents = self._documents_by_ids(account, source_document_ids)
        if not documents and not source_document_ids:
            documents = list(account.source_documents)
        if any(document.is_sensitive and not self._can_view_sensitive(current_user) for document in documents):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="One or more selected KYC source documents are restricted")
        return documents

    @staticmethod
    def _documents_by_ids(account: Account, source_document_ids: list[str]) -> list[SourceDocument]:
        if not source_document_ids:
            return list(account.source_documents)
        by_id = {document.id: document for document in account.source_documents}
        missing = [document_id for document_id in source_document_ids if document_id not in by_id]
        if missing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected source document is unavailable for this account")
        return [by_id[document_id] for document_id in source_document_ids]

    def _gateway_request(
        self,
        account: Account,
        source_documents: list[SourceDocument],
        research_sources: list[str],
        trigger_source: str,
        current_user: User,
        latest_snapshot: KycSnapshot | None,
    ) -> KycGatewayRequest:
        retrieved_context: list[dict[str, Any]] = []
        if getattr(self.gateway, "requires_retrieval_context", False):
            retrieved_context = KycRetrievalService(self.kyc.db).prepare_context(
                account=account,
                source_documents=source_documents,
                current_user=current_user,
                workstreams=[dict(item) for item in WORKSTREAMS],
                can_view_sensitive=self._can_view_sensitive(current_user),
                prior_snapshot=latest_snapshot,
            )
            web_research = KycWebResearchService().research(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
            if web_research.contexts:
                retrieved_context.extend(web_research.contexts)
            log_kyc_verbose(
                logger,
                self.settings,
                "kyc_service.web_research_context",
                {
                    "account_id": account.id,
                    "enabled": self.settings.ai_kyc_web_research_enabled,
                    "metadata": web_research.metadata,
                    "error_message": web_research.error_message,
                    "context_count": len(web_research.contexts),
                    "contexts": web_research.contexts,
                },
            )
        gateway_request = KycGatewayRequest(
            account_context={
                "id": account.id,
                "name": account.name,
                "segment": account.segment,
                "region": account.region,
                "lifecycle_status": account.lifecycle_status,
                "commercial_value": float(account.commercial_value),
                "currency": account.currency,
                "service_context": account.service_context,
                "commercial_summary": account.commercial_summary,
                "initial_notes": account.initial_notes,
                "owners": [
                    {
                        "user_id": owner.user_id,
                        "user_name": owner.user_name,
                        "ownership_role": owner.ownership_role,
                        "is_active": owner.is_active,
                    }
                    for owner in account.owners
                ],
                "engagements": [
                    {
                        "id": engagement.id,
                        "name": engagement.name,
                        "service_lines": list(engagement.service_lines),
                        "renewal_date": engagement.renewal_date.date().isoformat() if engagement.renewal_date else None,
                    }
                    for engagement in account.engagements
                ],
                "field_catalog": list(FIELD_CATALOG),
            },
            source_documents=[
                {
                    "id": document.id,
                    "title": document.title,
                    "source_type": document.source_type,
                    "file_name": document.file_name,
                    "storage_backend": document.storage_backend,
                    "mime_type": document.mime_type,
                    "confidence": document.confidence,
                    "extraction_status": document.extraction_status,
                    "extraction_error": document.extraction_error,
                    "ocr_status": document.ocr_status,
                    "is_sensitive": document.is_sensitive,
                    "citations": [
                        {
                            "label": citation.label,
                            "page_number": citation.page_number,
                            "excerpt": citation.excerpt,
                            "field_key": citation.field_key,
                        }
                        for citation in document.citations
                    ],
                }
                for document in source_documents
            ],
            prior_snapshot_fields={field.get("key"): field.get("value") for field in latest_snapshot.fields_json} if latest_snapshot else {},
            research_sources=research_sources,
            requester_id=current_user.id,
            requester_role=current_user.role,
            trigger_source=trigger_source,
            can_view_sensitive=self._can_view_sensitive(current_user),
            workstreams=[dict(item) for item in WORKSTREAMS],
            retrieved_context=retrieved_context,
        )
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.gateway_request",
            {
                "account_id": account.id,
                "account_name": account.name,
                "trigger_source": trigger_source,
                "current_user_id": current_user.id,
                "current_user_role": current_user.role,
                "source_document_count": len(source_documents),
                "retrieved_context_count": len(retrieved_context),
                "latest_snapshot_id": latest_snapshot.id if latest_snapshot else None,
                "gateway_request": gateway_request,
            },
        )
        return gateway_request

    def _build_agent_run(
        self,
        account: Account,
        source_documents: list[SourceDocument],
        research_sources: list[str],
        trigger_source: str,
        current_user: User,
        previous_run_id: str | None = None,
        latest_snapshot: KycSnapshot | None = None,
    ) -> KycAgentRun:
        now = datetime.now(timezone.utc)
        run = KycAgentRun(
            account_id=account.id,
            status="running",
            trigger_source=trigger_source,
            previous_run_id=previous_run_id,
            source_document_ids=[document.id for document in source_documents],
            research_sources=research_sources,
            triggered_by_id=current_user.id,
            triggered_by_name=current_user.full_name,
            queued_at=now,
            max_retries=0,
            started_at=now,
        )
        self.kyc.save_agent_run(run)
        self._execute_agent_run(account, run, source_documents, research_sources, trigger_source, current_user, latest_snapshot)
        return run

    def _queue_agent_run(
        self,
        account: Account,
        source_documents: list[SourceDocument],
        research_sources: list[str],
        trigger_source: str,
        current_user: User,
        previous_run_id: str | None = None,
        latest_snapshot: KycSnapshot | None = None,
    ) -> KycAgentRun:
        active = self._active_agent_run_or_release_stale(account.id, current_user)
        if active is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A KYC AI run is already pending or running for this account")
        now = datetime.now(timezone.utc)
        run = KycAgentRun(
            account_id=account.id,
            status="pending",
            trigger_source=trigger_source,
            previous_run_id=previous_run_id,
            source_document_ids=[document.id for document in source_documents],
            research_sources=research_sources,
            triggered_by_id=current_user.id,
            triggered_by_name=current_user.full_name,
            queued_at=now,
            max_retries=self.settings.ai_kyc_max_retries,
            provider_json={
                "adapter": getattr(self.gateway, "name", "unknown"),
                "provider": self.settings.ai_kyc_provider,
                "model": self.settings.ai_kyc_model,
                "base_url": self._safe_base_url(),
            },
            model_name=self.settings.ai_kyc_model,
            retrieval_summary_json={
                "source_document_ids": [document.id for document in source_documents],
                "status": "queued",
                "latest_snapshot_id": latest_snapshot.id if latest_snapshot else None,
            },
        )
        self.kyc.save_agent_run(run)
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.queue_agent_run.created",
            {
                "run_id": run.id,
                "account_id": account.id,
                "status": run.status,
                "trigger_source": trigger_source,
                "previous_run_id": previous_run_id,
                "source_document_ids": [document.id for document in source_documents],
                "research_sources": research_sources,
                "provider_json": run.provider_json,
                "retrieval_summary_json": run.retrieval_summary_json,
            },
        )
        for workstream in WORKSTREAMS:
            self.kyc.save_workstream(
                KycWorkstreamOutput(
                    run_id=run.id,
                    account_id=account.id,
                    workstream_key=str(workstream["key"]),
                    title=str(workstream["title"]),
                    status="pending",
                    sort_order=int(workstream["sort_order"]),
                    output_json={},
                    citations_json=[],
                    missing_fields=[],
                    confidence=0,
                )
            )
        self.audit.log(
            module="kyc",
            action="agent_run_queued",
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            after_value={
                "status": run.status,
                "trigger_source": trigger_source,
                "adapter": getattr(self.gateway, "name", "unknown"),
                "model": self.settings.ai_kyc_model,
                "source_document_ids": [document.id for document in source_documents],
            },
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_ai_extraction",
            module="kyc",
            title="KYC AI run queued",
            description="A local AI KYC run is queued for background processing.",
            actor=current_user,
            source_record_id=run.id,
            source_record_type="kyc_agent_run",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"model": self.settings.ai_kyc_model, "provider": self.settings.ai_kyc_provider},
        )
        return run

    def _active_agent_run_or_release_stale(self, account_id: str, current_user: User) -> KycAgentRun | None:
        active = self.kyc.active_agent_run(account_id)
        if active is None:
            return None
        if self._release_stale_running_run(active, current_user):
            return None
        return active

    def _release_stale_running_run(self, run: KycAgentRun, current_user: User) -> bool:
        if run.status != "running":
            return False
        started_at = run.started_at or run.updated_at or run.created_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        timeout_seconds = max(int(self.settings.ai_kyc_timeout_seconds or 0), 1)
        now = datetime.now(timezone.utc)
        if now - started_at <= timedelta(seconds=timeout_seconds):
            return False

        message = f"KYC run timed out after {timeout_seconds} seconds without completing and was released automatically before queuing a new run."
        run.status = "failed"
        run.error_message = message
        run.completed_at = now
        run.next_retry_at = None
        run.updated_at = now
        for workstream in run.workstreams:
            if workstream.status in {"pending", "running"}:
                workstream.status = "failed"
                workstream.error_message = message
                workstream.completed_at = now
        self.audit.log(
            module="kyc",
            action="agent_run_timeout_release",
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            before_value={"status": "running"},
            after_value={"status": run.status, "error_message": message},
        )
        return True

    @staticmethod
    def _is_research_only_run(run: KycAgentRun) -> bool:
        provider = dict(run.provider_json or {})
        retrieval = dict(run.retrieval_summary_json or {})
        return bool(provider.get("research_only") or retrieval.get("research_only"))

    @staticmethod
    def _normalize_research_query(value: str | None) -> str | None:
        text = " ".join(str(value or "").split())
        return text[:500] if text else None

    def _execute_research_run(self, account: Account, run: KycAgentRun, current_user: User) -> None:
        now = datetime.now(timezone.utc)
        draft_id = str((run.provider_json or {}).get("draft_id") or (run.retrieval_summary_json or {}).get("draft_id") or "")
        custom_query = self._normalize_research_query(
            (run.provider_json or {}).get("custom_query") or (run.retrieval_summary_json or {}).get("custom_query")
        )
        draft = self._research_target_draft(account.id, draft_id or None)
        source_documents = self._authorized_source_documents(account, list(run.source_document_ids), current_user)
        internal_context = KycRetrievalService(self.kyc.db).prepare_context(
            account=account,
            source_documents=source_documents,
            current_user=current_user,
            workstreams=[dict(item) for item in WORKSTREAMS],
            can_view_sensitive=self._can_view_sensitive(current_user),
            prior_snapshot=self.kyc.latest_snapshot(account.id),
        )
        run.status = "running"
        run.error_message = None
        run.started_at = now
        run.completed_at = None
        run.provider_json = {
            **dict(run.provider_json or {}),
            "adapter": "tavily-ollama-research",
            "provider": "tavily",
            "search_provider": "tavily",
            "summarizer_provider": self.settings.ai_kyc_research_summarizer_provider,
            "summarizer_model": self.settings.ai_kyc_research_summarizer_model,
                "base_url": self.settings.ai_kyc_research_summarizer_base_url,
                "research_only": True,
                "draft_id": draft.id,
                "custom_query": custom_query,
            }
        run.model_name = self.settings.ai_kyc_research_summarizer_model
        for workstream in self._workstream_outputs_for_run(run):
            workstream.status = "running"
            workstream.error_message = None
            workstream.started_at = now
            workstream.completed_at = None
        self.kyc.commit()
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.execute_research_run.start",
            {
                "run_id": run.id,
                "account_id": account.id,
                "draft_id": draft.id,
                "source_document_ids": [document.id for document in source_documents],
                "internal_context_count": len(internal_context),
                "custom_query": custom_query,
            },
        )
        try:
            research_result = TavilyKycResearchProvider().research(
                account=account,
                source_documents=source_documents,
                retrieved_context=internal_context,
                custom_query=custom_query,
            )
            if research_result.error_message and not research_result.contexts:
                raise RuntimeError(research_result.error_message)
            summary = OllamaKycResearchSummarizer().summarize(account=account, research_result=research_result, internal_context=internal_context)
            if summary.error_message and not summary.summary_markdown:
                raise RuntimeError(summary.error_message)
            self._append_research_to_draft(account, draft, run, research_result, summary, current_user)
            run.status = "partial" if summary.error_message else "complete"
            run.error_message = summary.error_message
            run.completed_at = datetime.now(timezone.utc)
            run.provider_json = {
                **dict(run.provider_json or {}),
                "tavily": dict(research_result.metadata or {}),
                "summarizer": {
                    "provider": summary.provider,
                    "model": summary.model,
                    "metadata": dict(summary.metadata or {}),
                },
            }
            run.usage_json = dict(summary.metadata.get("usage") or {})
            run.retrieval_summary_json = {
                **dict(run.retrieval_summary_json or {}),
                "status": run.status,
                "research_only": True,
                "draft_id": draft.id,
                "custom_query": custom_query,
                "query_count": len(research_result.queries),
                "source_count": len(research_result.contexts),
                "sources": [
                    {"label": context.label, "url": context.source_route, "confidence": context.confidence}
                    for context in research_result.contexts[: self.settings.tavily_max_results]
                ],
            }
            self._mark_research_workstream(run, research_result, summary, status_value="complete")
        except Exception as exc:
            error_message = f"KYC web research failed: {str(exc)[:400]}"
            run.status = "failed"
            run.error_message = error_message
            run.completed_at = datetime.now(timezone.utc)
            if run.retry_count < run.max_retries:
                run.retry_count += 1
                run.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=self.settings.ai_kyc_retry_backoff_seconds * max(run.retry_count, 1))
            else:
                run.next_retry_at = None
            for workstream in self._workstream_outputs_for_run(run):
                workstream.status = "failed"
                workstream.error_message = error_message
                workstream.completed_at = datetime.now(timezone.utc)
            self.audit.log(
                module="kyc",
                action="web_research_failed",
                entity_type="kyc_agent_run",
                entity_id=run.id,
                actor=current_user,
                after_value={"account_id": account.id, "draft_id": draft.id, "error_message": error_message},
            )
            logger.exception("KYC Tavily/Ollama research failed for run %s", run.id)

    def _append_research_to_draft(
        self,
        account: Account,
        draft: KycDraft,
        run: KycAgentRun,
        research_result: KycResearchResult,
        summary: KycResearchSummary,
        current_user: User,
    ) -> None:
        section = self._research_detailed_description(account, run, research_result, summary)
        run.detailed_description = self._append_raw_detailed_description(run.detailed_description, section)
        draft.detailed_description = self._append_research_detailed_description(draft.detailed_description, section, run)
        citations = self._citations_from_research_contexts(research_result.retrieval_contexts())
        existing_citations = list(draft.citations_json or [])
        existing_keys = {(item.get("source_record_id"), item.get("source_route"), item.get("excerpt")) for item in existing_citations if isinstance(item, dict)}
        for citation in citations:
            key = (citation.get("source_record_id"), citation.get("source_route"), citation.get("excerpt"))
            if key not in existing_keys:
                existing_citations.append(citation)
                existing_keys.add(key)
        draft.citations_json = existing_citations
        draft.research_sources = list(dict.fromkeys([*list(draft.research_sources or []), "tavily_web_research"]))
        source_context = dict(draft.source_context or {})
        web_runs = list(source_context.get("web_research_runs") or [])
        web_runs.append(
            {
                "run_id": run.id,
                "provider": "tavily",
                "summarizer_model": summary.model,
                "status": "partial" if summary.error_message else "complete",
                "source_count": len(research_result.contexts),
                "queries": list(research_result.queries),
                "custom_query": (run.provider_json or {}).get("custom_query") or (run.retrieval_summary_json or {}).get("custom_query"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        source_context["web_research_runs"] = web_runs[-20:]
        draft.source_context = source_context
        flag_modified(draft, "citations_json")
        flag_modified(draft, "research_sources")
        flag_modified(draft, "source_context")
        self.audit.log(
            module="kyc",
            action="web_research_appended",
            entity_type="kyc_draft",
            entity_id=draft.id,
            actor=current_user,
            after_value={
                "account_id": account.id,
                "agent_run_id": run.id,
                "source_count": len(research_result.contexts),
                "provider": "tavily",
                "model": summary.model,
                "status": "partial" if summary.error_message else "complete",
            },
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_web_research",
            module="kyc",
            title="KYC web research appended",
            description=f"Tavily research from {len(research_result.contexts)} source(s) was appended to the KYC detailed description.",
            actor=current_user,
            source_record_id=run.id,
            source_record_type="kyc_agent_run",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"draft_id": draft.id, "provider": "tavily", "model": summary.model},
        )

    def _mark_research_workstream(
        self,
        run: KycAgentRun,
        research_result: KycResearchResult,
        summary: KycResearchSummary,
        *,
        status_value: str,
    ) -> None:
        workstream = self._existing_or_new_workstream(run, self._account_or_404(run.account_id), {"key": "client_research", "title": "Tavily Web Research", "sort_order": 2})
        workstream.status = status_value
        workstream.output_json = {
            "web_research_summary": {
                "value": summary.summary_markdown,
                "confidence": summary.confidence,
                "citations": self._citations_from_research_contexts(research_result.retrieval_contexts()),
                "missing_evidence_note": "\n".join(summary.missing_evidence_notes),
                "conflicts": [summary.error_message] if summary.error_message else [],
                "reviewer_notes": ["Review Tavily/Ollama research before approving KYC."],
                "suggested_follow_up_questions": summary.follow_up_questions,
            }
        }
        workstream.citations_json = self._citations_from_research_contexts(research_result.retrieval_contexts())
        workstream.missing_fields = []
        workstream.confidence = summary.confidence
        workstream.error_message = summary.error_message
        workstream.completed_at = datetime.now(timezone.utc)


    def _execute_agent_run(
        self,
        account: Account,
        run: KycAgentRun,
        source_documents: list[SourceDocument],
        research_sources: list[str],
        trigger_source: str,
        current_user: User,
        latest_snapshot: KycSnapshot | None,
    ) -> None:
        now = datetime.now(timezone.utc)
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.execute_agent_run.start",
            {
                "run_id": run.id,
                "account_id": account.id,
                "account_name": account.name,
                "trigger_source": trigger_source,
                "source_documents": [
                    {
                        "id": document.id,
                        "title": document.title,
                        "source_type": document.source_type,
                        "file_name": document.file_name,
                        "extraction_status": document.extraction_status,
                        "ocr_status": document.ocr_status,
                        "confidence": document.confidence,
                        "is_sensitive": document.is_sensitive,
                    }
                    for document in source_documents
                ],
                "research_sources": research_sources,
                "latest_snapshot_id": latest_snapshot.id if latest_snapshot else None,
            },
        )
        run.status = "running"
        run.error_message = None
        run.started_at = now
        run.completed_at = None
        run.provider_json = {
            "adapter": getattr(self.gateway, "name", "unknown"),
            "provider": self.settings.ai_kyc_provider,
            "model": self.settings.ai_kyc_model,
            "base_url": self._safe_base_url(),
        }
        run.model_name = self.settings.ai_kyc_model
        for workstream in self._workstream_outputs_for_run(run):
            workstream.status = "running"
            workstream.error_message = None
            workstream.started_at = now
            workstream.completed_at = None
        self.kyc.commit()
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.execute_agent_run.running_committed",
            {
                "run_id": run.id,
                "account_id": account.id,
                "status": run.status,
                "started_at": run.started_at,
                "workstreams": [
                    {
                        "workstream_key": item.workstream_key,
                        "status": item.status,
                        "started_at": item.started_at,
                    }
                    for item in self._workstream_outputs_for_run(run)
                ],
            },
        )
        gateway_request = self._gateway_request(account, source_documents, research_sources, trigger_source, current_user, latest_snapshot)
        try:
            gateway_response = self.gateway.run(gateway_request)
        except Exception as exc:  # pragma: no cover - adapter boundary guard
            error_message = f"AI/LLM Gateway failure: {str(exc)[:400]}"
            log_kyc_verbose(
                logger,
                self.settings,
                "kyc_service.execute_agent_run.gateway_failure",
                {"run_id": run.id, "account_id": account.id, "error_message": error_message},
            )
            fallback_response = self._gateway_failure_fallback_response(account, gateway_request, error_message, started_at=now)
            if fallback_response is not None:
                gateway_response = fallback_response
            else:
                for workstream in WORKSTREAMS:
                    output = self._existing_or_new_workstream(run, account, workstream)
                    output.status = "failed"
                    output.output_json = {}
                    output.citations_json = []
                    output.missing_fields = self._field_labels_for_workstream(str(workstream["key"]))
                    output.confidence = 0
                    output.error_message = error_message
                    output.started_at = output.started_at or now
                    output.completed_at = datetime.now(timezone.utc)
                run.status = "failed"
                run.error_message = error_message
                run.detailed_description = self._append_raw_detailed_description(run.detailed_description, error_message)
                if run.retry_count < run.max_retries:
                    run.retry_count += 1
                    run.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=self.settings.ai_kyc_retry_backoff_seconds * max(run.retry_count, 1))
                else:
                    run.next_retry_at = None
                run.completed_at = datetime.now(timezone.utc)
                return
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.execute_agent_run.gateway_response",
            {
                "run_id": run.id,
                "status": gateway_response.status,
                "error_message": gateway_response.error_message,
                "metadata": gateway_response.metadata,
                "workstreams": [
                    {
                        "workstream_key": item.workstream_key,
                        "status": item.status,
                        "confidence": item.confidence,
                        "missing_fields": item.missing_fields,
                        "output": item.output,
                        "citations": item.citations,
                        "error_message": item.error_message,
                    }
                    for item in gateway_response.workstreams
                ],
            },
        )
        for workstream in gateway_response.workstreams:
            reviewer_notes = self._reviewer_notes_from_output(workstream.output)
            follow_up_questions = self._follow_up_questions_from_output(workstream.output)
            retrieved_chunk_ids = self._retrieved_chunk_ids_from_citations(workstream.citations)
            output = self._existing_or_new_workstream(
                run,
                account,
                {"key": workstream.workstream_key, "title": workstream.title, "sort_order": workstream.sort_order},
            )
            output.status = workstream.status
            output.title = workstream.title
            output.sort_order = workstream.sort_order
            output.output_json = workstream.output
            output.citations_json = workstream.citations
            output.missing_fields = workstream.missing_fields
            output.confidence = workstream.confidence
            output.reviewer_notes_json = reviewer_notes
            output.follow_up_questions_json = follow_up_questions
            output.retrieved_chunk_ids = retrieved_chunk_ids
            output.provider_response_id = gateway_response.metadata.get("provider_response_id")
            output.error_message = workstream.error_message
            output.started_at = workstream.started_at or now
            output.completed_at = workstream.completed_at or datetime.now(timezone.utc)
        run.status = gateway_response.status
        run.error_message = gateway_response.error_message
        run.provider_json = {
            "adapter": gateway_response.metadata.get("adapter"),
            "provider": self.settings.ai_kyc_provider,
            "model": gateway_response.metadata.get("model"),
            "base_url": self._safe_base_url(),
        }
        run.usage_json = dict(gateway_response.metadata.get("usage") or {})
        run.cost_json = dict(gateway_response.metadata.get("cost") or {})
        run.provider_response_id = gateway_response.metadata.get("provider_response_id")
        run.model_name = gateway_response.metadata.get("model")
        detailed_text = self._append_raw_detailed_description(
            self._web_research_detailed_description(gateway_request.retrieved_context),
            str(gateway_response.metadata.get("detailed_description") or ""),
        )
        run.detailed_description = self._append_raw_detailed_description(run.detailed_description, detailed_text)
        run.retrieval_summary_json = {
            "retrieved_context_count": gateway_response.metadata.get("retrieved_context_count"),
            "source_document_ids": [document.id for document in source_documents],
            "source_coverage": self._source_coverage_summary(source_documents, gateway_response),
        }
        run.completed_at = datetime.now(timezone.utc)
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_service.execute_agent_run.persisted",
            {
                "run_id": run.id,
                "status": run.status,
                "provider_json": run.provider_json,
                "usage_json": run.usage_json,
                "cost_json": run.cost_json,
                "retrieval_summary_json": run.retrieval_summary_json,
                "workstreams": [
                    {
                        "workstream_key": item.workstream_key,
                        "status": item.status,
                        "confidence": item.confidence,
                        "missing_fields": item.missing_fields,
                        "output_json": item.output_json,
                        "citations_json": item.citations_json,
                        "error_message": item.error_message,
                    }
                    for item in self._workstream_outputs_for_run(run)
                ],
            },
        )

    def _should_queue_ai_run(self) -> bool:
        return bool(getattr(self.gateway, "is_async_preferred", False)) and self.settings.kyc_queue_backend == "local"

    def _existing_or_new_workstream(self, run: KycAgentRun, account: Account, workstream: dict[str, Any]) -> KycWorkstreamOutput:
        key = str(workstream["key"])
        existing = next((item for item in run.workstreams if item.workstream_key == key), None)
        if existing is not None:
            return existing
        output = KycWorkstreamOutput(
            run_id=run.id,
            account_id=account.id,
            workstream_key=key,
            title=str(workstream["title"]),
            status="pending",
            sort_order=int(workstream["sort_order"]),
            output_json={},
            citations_json=[],
            missing_fields=[],
            confidence=0,
        )
        self.kyc.save_workstream(output)
        run.workstreams.append(output)
        return output

    @staticmethod
    def _workstream_outputs_for_run(run: KycAgentRun) -> list[KycWorkstreamOutput]:
        return list(run.workstreams)

    def _pending_fields(self, latest_snapshot: KycSnapshot | None) -> list[dict[str, Any]]:
        previous = {field.get("key"): field.get("value") for field in latest_snapshot.fields_json} if latest_snapshot else {}
        return [
            {
                "key": item["key"],
                "label": item["label"],
                "workstream_key": item["workstream_key"],
                "workstream_title": self._workstream_title(str(item["workstream_key"])),
                "value": "",
                "confidence": 0,
                "is_required": bool(item.get("required", True)),
                "is_sensitive": bool(item.get("sensitive", False)),
                "reviewed": False,
                "missing": True,
                "conflict": False,
                "previous_value": previous.get(item["key"]),
                "citations": [],
                "missing_evidence_note": "KYC AI generation is queued. This field will be populated when the run completes.",
                "conflicts": [],
                "reviewer_notes": [],
                "suggested_follow_up_questions": [],
            }
            for item in FIELD_CATALOG
        ]

    def _prefill_fields_from_sources(
        self,
        account: Account,
        fields: list[dict[str, Any]],
        source_documents: list[SourceDocument],
        current_user: User,
        latest_snapshot: KycSnapshot | None,
    ) -> list[dict[str, Any]]:
        contexts = KycRetrievalService(self.kyc.db).prepare_context(
            account=account,
            source_documents=source_documents,
            current_user=current_user,
            workstreams=[dict(item) for item in WORKSTREAMS],
            can_view_sensitive=self._can_view_sensitive(current_user),
            prior_snapshot=latest_snapshot,
        )
        if not contexts:
            return fields
        for field in fields:
            field_contexts = self._contexts_for_field(str(field["key"]), contexts)
            if not field_contexts:
                continue
            value = self._source_prefill_value(account, str(field["key"]), field_contexts)
            if not value:
                continue
            field["value"] = value
            field["confidence"] = min(82, max(62, int(field_contexts[0].get("confidence") or field_contexts[0].get("trust_score") or 68)))
            field["missing"] = False
            field["citations"] = [self._citation_from_context(context, str(field["key"])) for context in field_contexts[:3]]
            field["missing_evidence_note"] = "Immediate source prefill from uploaded SOW/platform evidence. Background AI enrichment may expand this with approved public research."
            field["suggested_follow_up_questions"] = self._source_prefill_follow_ups(str(field["key"]))
        return fields

    @staticmethod
    def _contexts_for_field(field_key: str, contexts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        terms_by_field = {
            "industry_overview": ["industry", "market", "sector", "restaurant", "retail", "commerce"],
            "market_trends": ["trend", "digital", "automation", "ai", "mobile", "loyalty", "consumer"],
            "market_size_growth": ["market size", "growth", "cagr", "revenue", "locations", "stores"],
            "business_drivers": ["driver", "objective", "goal", "success metric", "business outcome"],
            "competitors": ["competitor", "peer", "market segment", "served segment"],
            "regulatory": ["compliance", "security", "privacy", "pci", "gdpr", "regulatory", "audit"],
            "company_snapshot": ["account", "customer", "client", "company", "overview"],
            "company_profile": ["company", "headquarters", "website", "founded", "employee", "revenue"],
            "strategy": ["strategy", "objective", "vision", "goal", "modernization", "transformation"],
            "company_history": ["history", "founded", "milestone", "evolution"],
            "core_offerings": ["offering", "product", "service", "restaurant", "platform", "solution"],
            "monetization_model": ["monetization", "revenue", "fees", "billing", "subscription", "franchise"],
            "key_achievements": ["achievement", "award", "milestone", "success metric"],
            "clients_and_segments": ["segment", "customer", "geography", "region", "market"],
            "digital_products": ["digital", "mobile", "app", "platform", "portal", "integration", "api"],
            "website_and_social": ["website", "url", "profile", "public link"],
            "stakeholder_map": ["stakeholder", "sponsor", "owner", "contact", "decision maker"],
            "technical_landscape": ["technology", "architecture", "integration", "api", "cloud", "data", "security"],
            "client_stakeholders": ["client stakeholder", "sponsor", "decision maker", "contact"],
            "tkxel_stakeholders": ["tkxel", "account manager", "delivery lead", "owner", "ops lead"],
            "project_charters": ["statement of work", "sow", "charter", "scope", "project"],
            "engagement_models": ["engagement", "delivery model", "governance", "cadence", "team"],
            "obligations": ["obligation", "sla", "deliverable", "acceptance", "support", "out of scope"],
            "past_engagements": ["timeline", "meeting", "summary", "fathom", "action item", "past engagement"],
            "renewal_cycle": ["renewal", "end date", "expiration", "notice", "auto renewal"],
            "payment_behaviour": ["payment", "invoice", "billing", "net", "terms"],
            "gross_margins": ["margin", "commercial", "financial", "cost"],
            "billing_models": ["billing", "fee", "contract value", "commercial", "payment"],
        }
        terms = terms_by_field.get(field_key, [field_key.replace("_", " ")])
        matched = [
            context
            for context in contexts
            if any(term in str(context.get("text") or context.get("excerpt") or "").lower() for term in terms)
        ]
        return (matched or contexts)[:4]

    @staticmethod
    def _source_prefill_value(account: Account, field_key: str, contexts: list[dict[str, Any]]) -> str:
        snippets = []
        for context in contexts[:3]:
            text = " ".join(str(context.get("text") or context.get("excerpt") or "").split())
            if not text:
                continue
            snippets.append(f"- {text[:700]}")
        if not snippets:
            return ""
        heading_by_field = {
            "company_snapshot": f"{account.name} source-backed snapshot",
            "company_profile": f"{account.name} profile details found in source material",
            "project_charters": "Uploaded charter/SOW context",
            "obligations": "SOW obligations and delivery commitments",
            "billing_models": "Commercial and billing evidence",
            "renewal_cycle": "Renewal and notice evidence",
        }
        heading = heading_by_field.get(field_key, "Immediate source-backed prefill")
        return f"{heading}:\n" + "\n".join(snippets)

    @staticmethod
    def _citation_from_context(context: dict[str, Any], field_key: str) -> dict[str, Any]:
        return {
            "source_document_id": context.get("source_document_id"),
            "source_chunk_id": context.get("source_chunk_id"),
            "source_record_id": context.get("source_record_id"),
            "source_type": context.get("source_type"),
            "label": context.get("label") or context.get("source_kind") or "Source evidence",
            "page_number": context.get("page_number"),
            "excerpt": str(context.get("excerpt") or context.get("text") or "")[:900],
            "field_key": field_key,
            "confidence": context.get("confidence") or context.get("trust_score") or 65,
            "source_route": context.get("source_route"),
        }

    @staticmethod
    def _source_prefill_follow_ups(field_key: str) -> list[str]:
        questions = {
            "market_size_growth": ["Do we have approved public market-size or growth evidence for this account's industry?"],
            "competitors": ["Which peer companies should be compared for this account?"],
            "gross_margins": ["Should margin details be added by an authorized commercial reviewer?"],
            "payment_behaviour": ["Has Finance confirmed payment behavior and invoice history?"],
            "client_stakeholders": ["Who is the economic buyer, technical decision maker, and executive sponsor?"],
        }
        return questions.get(field_key, ["Should the account owner confirm this source-backed prefill before approval?"])

    @staticmethod
    def _citations_from_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for field in fields:
            for citation in field.get("citations") or []:
                if isinstance(citation, dict):
                    citations.append(citation)
        return citations

    def _update_linked_drafts_from_run(self, account: Account, run: KycAgentRun, current_user: User) -> None:
        drafts = [draft for draft in self.kyc.drafts_for_run(run.id) if draft.status == "ready_for_review"]
        if not drafts:
            log_kyc_verbose(
                logger,
                self.settings,
                "kyc_service.update_linked_drafts.skipped",
                {"run_id": run.id, "reason": "no ready_for_review linked drafts"},
            )
            return
        latest_snapshot = self.kyc.latest_snapshot(account.id)
        source_documents = self._documents_by_ids(account, list(run.source_document_ids))
        for draft in drafts:
            if run.status == "failed":
                draft.conflicts = list(dict.fromkeys([*list(draft.conflicts or []), "KYC AI run failed. Existing draft content was preserved for review."]))
                draft.source_context = self._source_context(source_documents, run)
                draft.detailed_description = self._append_detailed_description(
                    draft.detailed_description,
                    run.detailed_description or run.error_message or "KYC AI run failed.",
                    run,
                )
                flag_modified(draft, "conflicts")
                flag_modified(draft, "source_context")
                self.audit.log(
                    module="kyc",
                    action="draft_ai_run_failed_preserved",
                    entity_type="kyc_draft",
                    entity_id=draft.id,
                    actor=current_user,
                    after_value={"agent_run_id": run.id, "run_status": run.status, "error_message": run.error_message},
                )
                continue
            fields = self._fields_from_run(account, run, latest_snapshot)
            quality = self._quality(fields, source_documents, self._configuration())
            draft.fields_json = fields
            draft.citations_json = self._citations_from_run_or_documents(run, source_documents)
            draft.missing_fields = quality["missing_fields"]
            draft.conflicts = self._conflicts(source_documents, run)
            draft.difference_summary = self._difference_summary(fields, latest_snapshot)
            draft.source_context = self._source_context(source_documents, run)
            draft.detailed_description = self._append_detailed_description(draft.detailed_description, run.detailed_description, run)
            draft.confidence = quality["confidence"]
            draft.completeness = quality["completeness"]
            draft.source_coverage = quality["source_coverage"]
            flag_modified(draft, "fields_json")
            flag_modified(draft, "citations_json")
            flag_modified(draft, "missing_fields")
            flag_modified(draft, "conflicts")
            flag_modified(draft, "difference_summary")
            flag_modified(draft, "source_context")
            self.audit.log(
                module="kyc",
                action="draft_populated_from_agent_run",
                entity_type="kyc_draft",
                entity_id=draft.id,
                actor=current_user,
                after_value={"agent_run_id": run.id, "run_status": run.status, "confidence": draft.confidence, "completeness": draft.completeness},
            )
            log_kyc_verbose(
                logger,
                self.settings,
                "kyc_service.update_linked_drafts.populated",
                {
                    "draft_id": draft.id,
                    "run_id": run.id,
                    "run_status": run.status,
                    "confidence": draft.confidence,
                    "completeness": draft.completeness,
                    "source_coverage": draft.source_coverage,
                    "fields_json": draft.fields_json,
                    "citations_json": draft.citations_json,
                    "missing_fields": draft.missing_fields,
                    "conflicts": draft.conflicts,
                    "difference_summary": draft.difference_summary,
                    "source_context": draft.source_context,
                },
            )

    @staticmethod
    def _citations_from_run_or_documents(run: KycAgentRun, source_documents: list[SourceDocument]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for workstream in run.workstreams:
            citations.extend(list(workstream.citations_json or []))
        if citations:
            return citations
        return KycService._citations_from_documents(source_documents)

    def _safe_base_url(self) -> str | None:
        if self.settings.ai_kyc_provider not in {"local_openai_compatible", "ollama", "lm_studio", "lmstudio"}:
            return None
        return self.settings.ai_kyc_base_url or None

    @staticmethod
    def _source_coverage_summary(source_documents: list[SourceDocument], gateway_response) -> dict[str, Any]:  # noqa: ANN001
        cited_document_ids = {
            str(citation.get("source_document_id"))
            for workstream in gateway_response.workstreams
            for citation in workstream.citations
            if citation.get("source_document_id")
        }
        cited_chunk_ids = {
            str(citation.get("source_chunk_id"))
            for workstream in gateway_response.workstreams
            for citation in workstream.citations
            if citation.get("source_chunk_id")
        }
        return {
            "documents_available": len(source_documents),
            "documents_cited": len(cited_document_ids),
            "chunks_cited": len(cited_chunk_ids),
            "source_types": sorted({document.source_type for document in source_documents}),
        }

    def _gateway_failure_fallback_response(
        self,
        account: Account,
        gateway_request: KycGatewayRequest,
        error_message: str,
        *,
        started_at: datetime,
    ) -> KycGatewayResponse | None:
        contexts = list(gateway_request.retrieved_context or [])
        if not contexts:
            return None
        results: list[KycGatewayWorkstreamResult] = []
        for workstream in WORKSTREAMS:
            workstream_key = str(workstream["key"])
            output: dict[str, dict[str, Any]] = {}
            citations: list[dict[str, Any]] = []
            missing_fields: list[str] = []
            for field in FIELD_CATALOG:
                if str(field["workstream_key"]) != workstream_key:
                    continue
                field_key = str(field["key"])
                field_contexts = self._contexts_for_field(field_key, contexts)
                value = self._source_prefill_value(account, field_key, field_contexts)
                if not value:
                    missing_fields.append(str(field["label"]))
                    continue
                field_citations = [self._citation_from_context(context, field_key) for context in field_contexts[:3]]
                confidence = min(72, max(45, int(field_contexts[0].get("confidence") or field_contexts[0].get("trust_score") or 55)))
                output[field_key] = {
                    "value": value,
                    "confidence": confidence,
                    "citations": field_citations,
                    "missing_evidence_note": "AI provider failed; this field was populated from retrieved SOW, internal, or approved web research context for human review.",
                    "conflicts": [error_message],
                    "reviewer_notes": ["Review this fallback source-backed output before approval."],
                    "suggested_follow_up_questions": self._source_prefill_follow_ups(field_key),
                }
                citations.extend(field_citations)
            results.append(
                KycGatewayWorkstreamResult(
                    workstream_key=workstream_key,
                    title=str(workstream["title"]),
                    status="complete" if output else "failed",
                    sort_order=int(workstream["sort_order"]),
                    output=output,
                    citations=citations,
                    missing_fields=missing_fields,
                    confidence=round(sum(int(value.get("confidence") or 0) for value in output.values()) / len(output)) if output else 0,
                    error_message=None if output else error_message,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                )
            )
        completed = sum(1 for result in results if result.status == "complete")
        if not completed:
            return None
        detailed_description = self._detailed_description_from_retrieved_contexts(account, contexts, error_message)
        return KycGatewayResponse(
            status="partial",
            workstreams=results,
            error_message=error_message,
            metadata={
                "adapter": f"{getattr(self.gateway, 'name', 'unknown')}-retrieved-context-fallback",
                "model": self.settings.ai_kyc_model,
                "retrieved_context_count": len(contexts),
                "fallback_reason": error_message,
                "detailed_description": detailed_description,
                "request_id": f"fallback-{account.id}-{int(started_at.timestamp())}",
            },
        )

    @staticmethod
    def _detailed_description_from_retrieved_contexts(account: Account, contexts: list[dict[str, Any]], error_message: str) -> str:
        ordered = sorted(
            contexts,
            key=lambda item: (
                1 if item.get("source_type") == "web_research" else 0,
                float(item.get("retrieval_score") or item.get("confidence") or item.get("trust_score") or 0),
            ),
            reverse=True,
        )
        parts = [
            f"KYC provider fallback for {account.name}.",
            f"Provider issue: {error_message}",
            "The following source-backed context was available for reviewer use:",
        ]
        for index, context in enumerate(ordered[:12], start=1):
            label = str(context.get("label") or context.get("source_type") or "KYC source")
            route = str(context.get("source_route") or "").strip()
            excerpt = str(context.get("text") or context.get("excerpt") or "").strip()
            if not excerpt:
                continue
            source_line = f"{index}. {label}"
            if route:
                source_line += f" ({route})"
            parts.append(f"{source_line}\n{excerpt[:4000]}")
        return "\n\n".join(parts)

    @staticmethod
    def _web_research_detailed_description(contexts: list[dict[str, Any]]) -> str:
        web_contexts = [context for context in contexts if context.get("source_type") == "web_research"]
        if not web_contexts:
            return ""
        parts = ["## Approved Web Research Context"]
        for index, context in enumerate(web_contexts, start=1):
            label = str(context.get("label") or "OpenAI web research")
            route = str(context.get("source_route") or "").strip()
            text = str(context.get("text") or context.get("excerpt") or "").strip()
            if not text:
                continue
            heading = f"{index}. {label}"
            if route:
                heading += f" ({route})"
            parts.append(f"{heading}\n{text[:6000]}")
        return "\n\n".join(parts)

    @staticmethod
    def _research_detailed_description(account: Account, run: KycAgentRun, research_result: KycResearchResult, summary: KycResearchSummary) -> str:
        parts = [
            f"Tavily + Ollama KYC research for {account.name}.",
            f"Run ID: {run.id}",
            f"Search provider: Tavily",
            f"Summarizer: {summary.provider} / {summary.model or 'local model'}",
            f"Sources used: {len(research_result.contexts)}",
        ]
        custom_query = (run.provider_json or {}).get("custom_query") or (run.retrieval_summary_json or {}).get("custom_query")
        if custom_query:
            parts.append(f"Research question: {custom_query}")
        parts.extend(["", "## Research Summary", summary.summary_markdown])
        if summary.missing_evidence_notes:
            parts.append("## Missing Evidence Notes")
            parts.extend(f"- {item}" for item in summary.missing_evidence_notes)
        if summary.follow_up_questions:
            parts.append("## Suggested Follow-Up Questions")
            parts.extend(f"- {item}" for item in summary.follow_up_questions)
        if research_result.queries:
            parts.append("## Tavily Search Queries")
            parts.extend(f"- {query}" for query in research_result.queries)
        if research_result.contexts:
            parts.append("## Tavily Sources")
            for index, context in enumerate(research_result.contexts, start=1):
                route = f" ({context.source_route})" if context.source_route else ""
                parts.append(f"{index}. {context.label}{route} - confidence {context.confidence}%")
        return "\n".join(str(part) for part in parts if part is not None)

    @staticmethod
    def _append_research_detailed_description(existing: str | None, addition: str | None, run: KycAgentRun) -> str:
        current = (existing or "").strip()
        value = (addition or "").strip()
        if not value:
            return current
        marker = f"kyc-research-run:{run.id}"
        if marker in current:
            return current
        provider = dict(run.provider_json or {})
        timestamp = (run.completed_at or run.updated_at or datetime.now(timezone.utc)).isoformat()
        title = " - ".join(
            item
            for item in [
                "Tavily + Ollama KYC research",
                str(provider.get("summarizer_model") or run.model_name or "").strip(),
            ]
            if item
        )
        body = KycService._research_text_to_html(value)
        section = (
            f'<!-- {marker} -->'
            f'<section data-kyc-research-run-id="{escape(run.id)}" data-kyc-research-provider="tavily" data-kyc-model="{escape(str(provider.get("summarizer_model") or run.model_name or ""))}">'
            f"<h4>{escape(title)}</h4>"
            f"<p><strong>Captured at:</strong> {escape(timestamp)}</p>"
            f"{body}"
            "</section>"
        )
        return f"{current}\n\n{section}".strip() if current else section

    @staticmethod
    def _research_text_to_html(value: str) -> str:
        blocks: list[str] = []
        list_type: str | None = None
        list_items: list[str] = []

        def flush_list() -> None:
            nonlocal list_type, list_items
            if list_type and list_items:
                blocks.append(f"<{list_type}>" + "".join(f"<li>{item}</li>" for item in list_items) + f"</{list_type}>")
            list_type = None
            list_items = []

        def add_list_item(kind: str, text: str) -> None:
            nonlocal list_type, list_items
            if list_type != kind:
                flush_list()
                list_type = kind
            list_items.append(escape(text))

        for raw_line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
            line = raw_line.strip()
            if not line:
                flush_list()
                continue
            if line.startswith("### "):
                flush_list()
                blocks.append(f"<h6>{escape(line[4:].strip())}</h6>")
                continue
            if line.startswith("## "):
                flush_list()
                blocks.append(f"<h5>{escape(line[3:].strip())}</h5>")
                continue
            if line.startswith("- "):
                add_list_item("ul", line[2:].strip())
                continue
            dot_index = line.find(". ")
            if dot_index > 0 and line[:dot_index].isdigit():
                add_list_item("ol", line[dot_index + 2 :].strip())
                continue
            flush_list()
            blocks.append(f"<p>{escape(line)}</p>")
        flush_list()
        return '<div class="kyc-research-brief">' + "".join(blocks) + "</div>"

    @staticmethod
    def _citations_from_research_contexts(contexts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for context in contexts:
            citations.append(
                {
                    "source_document_id": None,
                    "source_chunk_id": None,
                    "source_record_id": context.get("source_record_id"),
                    "source_type": context.get("source_type"),
                    "label": context.get("label") or "Tavily web research",
                    "page_number": None,
                    "section_label": "Tavily web research",
                    "excerpt": str(context.get("excerpt") or context.get("text") or "")[:900],
                    "field_key": "web_research_summary",
                    "confidence": context.get("confidence") or context.get("trust_score") or 62,
                    "source_route": context.get("source_route"),
                    "is_sensitive": False,
                }
            )
        return citations

    @staticmethod
    def _append_raw_detailed_description(existing: str | None, addition: str | None) -> str:
        current = (existing or "").strip()
        value = (addition or "").strip()
        if not value:
            return current
        if current and value in current:
            return current
        return f"{current}\n\n{value}".strip() if current else value

    @staticmethod
    def _append_detailed_description(existing: str | None, addition: str | None, run: KycAgentRun | None) -> str:
        current = (existing or "").strip()
        value = (addition or "").strip()
        if not value:
            return current
        marker = f"kyc-run:{run.id}" if run is not None else f"kyc-run:{datetime.now(timezone.utc).isoformat()}"
        if marker in current:
            return current
        provider = dict(run.provider_json or {}) if run is not None else {}
        model = run.model_name if run is not None else None
        title_bits = [
            "AI KYC detailed response",
            str(provider.get("adapter") or "").strip(),
            str(model or provider.get("model") or "").strip(),
        ]
        title = " - ".join(bit for bit in title_bits if bit)
        timestamp = (run.completed_at or run.updated_at or datetime.now(timezone.utc)).isoformat() if run is not None else datetime.now(timezone.utc).isoformat()
        section = (
            f'<!-- {marker} -->'
            f'<section data-kyc-run-id="{escape(run.id if run is not None else "")}">'
            f"<h4>{escape(title)}</h4>"
            f"<p><strong>Captured at:</strong> {escape(timestamp)}</p>"
            f"<pre>{escape(value)}</pre>"
            "</section>"
        )
        return f"{current}\n\n{section}".strip() if current else section

    def _fields_from_run(self, account: Account, run: KycAgentRun, latest_snapshot: KycSnapshot | None) -> list[dict[str, Any]]:
        output_by_key: dict[str, dict[str, Any]] = {}
        failed_keys = {workstream.workstream_key for workstream in run.workstreams if workstream.status != "complete"}
        for workstream in run.workstreams:
            output_by_key.update(workstream.output_json or {})
        previous = {field.get("key"): field.get("value") for field in latest_snapshot.fields_json} if latest_snapshot else {}
        fields: list[dict[str, Any]] = []
        for item in FIELD_CATALOG:
            output = output_by_key.get(item["key"], {})
            if not isinstance(output, dict):
                output = {"value": output}
            value = output.get("value") or self._fallback_field_value(account, item["key"])
            confidence = output.get("confidence") or self._field_confidence(run, item["workstream_key"])
            missing = item["workstream_key"] in failed_keys or not bool(str(value or "").strip())
            fields.append(
                {
                    "key": item["key"],
                    "label": item["label"],
                    "workstream_key": item["workstream_key"],
                    "workstream_title": self._workstream_title(item["workstream_key"]),
                    "value": "" if missing else value,
                    "confidence": int(confidence),
                    "is_required": bool(item.get("required", True)),
                    "is_sensitive": bool(item.get("sensitive", False)),
                    "reviewed": False,
                    "missing": missing,
                    "conflict": False,
                    "previous_value": previous.get(item["key"]),
                    "citations": output.get("citations", []),
                    "missing_evidence_note": output.get("missing_evidence_note"),
                    "conflicts": output.get("conflicts", []),
                    "reviewer_notes": output.get("reviewer_notes", []),
                    "suggested_follow_up_questions": output.get("suggested_follow_up_questions", []),
                }
            )
        return fields

    @staticmethod
    def _apply_note_to_fields(fields: list[dict[str, Any]], notes: str | None) -> list[dict[str, Any]]:
        if not notes:
            return fields
        for field in fields:
            if field["key"] == "past_engagements":
                field["value"] = f"{field['value']}\n\nReviewer note: {notes}".strip()
        return fields

    def _validate_approval(self, draft: KycDraft, payload: KycDraftApproveRequest) -> None:
        config = self._configuration()
        errors: list[dict[str, str]] = []
        missing_required = self._missing_required_fields(draft.fields_json, config)
        if missing_required and not (payload.override_reason or draft.override_reason):
            errors.append({"field": "override_reason", "message": f"Required KYC fields are missing: {', '.join(missing_required)}. Provide an override reason or complete the fields."})
        low_confidence = self._has_low_confidence(draft.fields_json, config)
        if low_confidence and not (payload.low_confidence_acknowledged or draft.low_confidence_acknowledged):
            errors.append({"field": "low_confidence_acknowledged", "message": "Low-confidence KYC fields require explicit acknowledgement."})
        if draft.conflicts and not (payload.conflicts_acknowledged or draft.conflicts_acknowledged):
            errors.append({"field": "conflicts_acknowledged", "message": "Conflicting KYC fields require explicit acknowledgement."})
        if errors:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"message": "KYC approval validation failed", "errors": errors})

    def _quality(self, fields: list[dict[str, Any]], source_documents: list[SourceDocument], config: KycConfiguration) -> dict[str, Any]:
        required_keys = set(config.required_field_keys)
        required = [field for field in fields if field["key"] in required_keys]
        completed = self._required_completed(fields, config)
        completeness = round((completed / max(len(required), 1)) * 100)
        confidences = [int(field.get("confidence", 0)) for field in fields if not field.get("missing")]
        confidence = round(sum(confidences) / len(confidences)) if confidences else 0
        missing_fields = self._missing_required_fields(fields, config)
        field_keys_with_citation = {citation.field_key for document in source_documents for citation in document.citations if citation.field_key}
        field_keys_with_citation.update(
            str(citation.get("field_key"))
            for field in fields
            for citation in field.get("citations", [])
            if isinstance(citation, dict) and citation.get("field_key")
        )
        source_coverage = round((len(field_keys_with_citation) / max(len(required), 1)) * 100) if source_documents else 0
        if source_documents and source_coverage < 35:
            source_coverage = min(100, round((len(source_documents) / max(len(WORKSTREAMS), 1)) * 100))
        return {"completeness": completeness, "confidence": confidence, "missing_fields": missing_fields, "source_coverage": source_coverage}

    @staticmethod
    def _required_completed(fields: list[dict[str, Any]], config: KycConfiguration) -> int:
        required_keys = set(config.required_field_keys)
        return sum(1 for field in fields if field.get("key") in required_keys and bool(str(field.get("value") or "").strip()) and not field.get("missing"))

    @staticmethod
    def _missing_required_fields(fields: list[dict[str, Any]], config: KycConfiguration) -> list[str]:
        required_keys = set(config.required_field_keys)
        return [str(field.get("label") or field.get("key")) for field in fields if field.get("key") in required_keys and (field.get("missing") or not str(field.get("value") or "").strip())]

    @staticmethod
    def _has_low_confidence(fields: list[dict[str, Any]], config: KycConfiguration) -> bool:
        return any(int(field.get("confidence", 0)) < config.low_confidence_threshold for field in fields if not field.get("missing"))

    @staticmethod
    def _conflicts(source_documents: list[SourceDocument], run: KycAgentRun) -> list[str]:
        conflicts = [f"{document.title} requires citation review." for document in source_documents if document.extraction_status in {"needs_review", "failed"}]
        if run.status in {"partial", "failed"}:
            conflicts.append("One or more AI KYC workstreams failed during extraction.")
        return conflicts

    @staticmethod
    def _difference_summary(fields: list[dict[str, Any]], previous: KycSnapshot | None) -> list[str]:
        if previous is None:
            return ["Initial approved snapshot will be created from this draft."]
        previous_values = {field.get("key"): field.get("value") for field in previous.fields_json}
        changed = [field["label"] for field in fields if previous_values.get(field["key"]) != field.get("value")]
        return changed[:20] or ["No material field differences from the previous approved snapshot."]

    @staticmethod
    def _source_context(source_documents: list[SourceDocument], run: KycAgentRun) -> dict[str, Any]:
        provider = dict(run.provider_json or {})
        return {
            "source_documents": [
                {
                    "id": document.id,
                    "title": document.title,
                    "source_type": document.source_type,
                    "confidence": document.confidence,
                    "is_sensitive": document.is_sensitive,
                }
                for document in source_documents
            ],
            "agent_run_id": run.id,
            "workstream_status": run.status,
            "trigger_source": run.trigger_source,
            "research_sources": list(run.research_sources),
            "gateway_adapter": provider.get("adapter") or "deterministic-local",
            "provider": provider,
            "retrieval_summary": dict(run.retrieval_summary_json or {}),
        }

    @staticmethod
    def _field_confidence(run: KycAgentRun, workstream_key: str) -> int:
        output = next((item for item in run.workstreams if item.workstream_key == workstream_key), None)
        return output.confidence if output else 60

    @staticmethod
    def _fallback_field_value(account: Account, field_key: str) -> str:
        fallback = {
            "company_snapshot": account.name,
            "strategy": account.service_context or "",
            "billing_models": account.commercial_summary or "",
        }
        return fallback.get(field_key, "")

    @staticmethod
    def _workstream_title(workstream_key: str) -> str:
        return next(str(item["title"]) for item in WORKSTREAMS if item["key"] == workstream_key)

    @staticmethod
    def _field_labels_for_workstream(workstream_key: str) -> list[str]:
        return [str(field["label"]) for field in FIELD_CATALOG if field["workstream_key"] == workstream_key]

    @staticmethod
    def _reviewer_notes_from_output(output: dict[str, dict[str, Any]]) -> list[str]:
        notes: list[str] = []
        for value in output.values():
            for note in value.get("reviewer_notes") or []:
                if isinstance(note, str) and note.strip():
                    notes.append(note.strip())
        return notes[:20]

    @staticmethod
    def _follow_up_questions_from_output(output: dict[str, dict[str, Any]]) -> list[str]:
        questions: list[str] = []
        for value in output.values():
            for question in value.get("suggested_follow_up_questions") or []:
                if isinstance(question, str) and question.strip():
                    questions.append(question.strip())
        return questions[:20]

    @staticmethod
    def _retrieved_chunk_ids_from_citations(citations: list[dict[str, Any]]) -> list[str]:
        seen: set[str] = set()
        chunk_ids: list[str] = []
        for citation in citations:
            chunk_id = citation.get("source_chunk_id")
            if not chunk_id or chunk_id in seen:
                continue
            seen.add(str(chunk_id))
            chunk_ids.append(str(chunk_id))
        return chunk_ids

    @staticmethod
    def _citations_from_documents(source_documents: list[SourceDocument], field_keys: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        allowed_keys = set(field_keys or {})
        for document in source_documents:
            for citation in document.citations:
                if allowed_keys and citation.field_key and citation.field_key not in allowed_keys:
                    continue
                citations.append(
                    {
                        "source_document_id": document.id,
                        "label": citation.label,
                        "page_number": citation.page_number,
                        "excerpt": citation.excerpt,
                        "field_key": citation.field_key,
                        "is_sensitive": document.is_sensitive,
                    }
                )
        if not citations:
            citations = [
                {
                    "source_document_id": document.id,
                    "label": document.title,
                    "page_number": None,
                    "excerpt": f"{document.source_type.replace('_', ' ')} source metadata.",
                    "field_key": None,
                    "is_sensitive": document.is_sensitive,
                }
                for document in source_documents
            ]
        return citations

    def _log_agent_run(self, account: Account, run: KycAgentRun, current_user: User, action: str) -> None:
        try:
            from app.services.integrations import IntegrationService

            IntegrationService(self.kyc.db).log_ai_gateway_run(
                request_type="kyc_extraction" if "extraction" in action else "kyc_agent_run",
                status_value=run.status,
                actor=current_user,
                account_id=account.id,
                permission_scope={"module": "kyc", "account_id": account.id, "actor_role": current_user.role},
                source_context=[{"type": "source_document", "id": document_id} for document_id in run.source_document_ids],
                research_sources=list(run.research_sources),
                response_labels=["AI-assisted", "Advisory"],
                error_message=run.error_message,
                affected_records=[{"type": "kyc_agent_run", "id": run.id}],
                commit=False,
            )
        except Exception:
            logger.exception("Failed to write AI Gateway run for KYC agent run %s", run.id)
        self.audit.log(
            module="kyc",
            action=action,
            entity_type="kyc_agent_run",
            entity_id=run.id,
            actor=current_user,
            after_value={
                "status": run.status,
                "workstreams": len(run.workstreams),
                "previous_run_id": run.previous_run_id,
                "source_document_ids": list(run.source_document_ids),
                "research_sources": list(run.research_sources),
                "trigger_source": run.trigger_source,
                "adapter": dict(run.provider_json or {}).get("adapter") or getattr(self.gateway, "name", "unknown"),
                "error_message": run.error_message,
            },
        )
        self.timeline.add_account_event(
            account_id=account.id,
            event_type="kyc_agent_refresh" if action.endswith("refresh") else "kyc_ai_extraction",
            module="kyc",
            title="KYC AI data refreshed" if action.endswith("refresh") else "KYC AI extraction run completed",
            description=f"KYC agent run finished with status {run.status}. Previous output remains available until review.",
            actor=current_user,
            source_record_id=run.id,
            source_record_type="kyc_agent_run",
            source_record_route=f"/accounts/{account.id}?tab=kyc",
            metadata={"workstream_statuses": {item.workstream_key: item.status for item in run.workstreams}},
        )

    def _draft_read(self, draft: KycDraft, current_user: User) -> KycDraftRead:
        return KycDraftRead(
            id=draft.id,
            account_id=draft.account_id,
            status=draft.status,
            trigger_source=draft.trigger_source,
            agent_run_id=draft.agent_run_id,
            previous_snapshot_id=draft.previous_snapshot_id,
            approved_snapshot_id=draft.approved_snapshot_id,
            source_document_ids=list(draft.source_document_ids),
            research_sources=list(draft.research_sources),
            fields=self._fields_read(draft.fields_json, current_user),
            citations=self._citations_read(draft.citations_json, current_user),
            missing_fields=list(draft.missing_fields),
            conflicts=list(draft.conflicts),
            difference_summary=list(draft.difference_summary),
            source_context=self._source_context_read(draft.source_context, current_user),
            detailed_description=draft.detailed_description,
            confidence=draft.confidence,
            completeness=draft.completeness,
            source_coverage=draft.source_coverage,
            freshness_status=self._freshness_status(draft.created_at, self._configuration().freshness_threshold_days),
            low_confidence_acknowledged=draft.low_confidence_acknowledged,
            conflicts_acknowledged=draft.conflicts_acknowledged,
            override_reason=draft.override_reason,
            review_notes=draft.review_notes,
            created_by_name=draft.created_by_name,
            reviewed_by_name=draft.reviewed_by_name,
            approved_by_name=draft.approved_by_name,
            rejected_by_name=draft.rejected_by_name,
            rejection_reason=draft.rejection_reason,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
            decided_at=draft.decided_at,
            ai_disclaimer=AI_DISCLAIMER,
        )

    def _snapshot_read(self, snapshot: KycSnapshot, current_user: User) -> KycSnapshotRead:
        return KycSnapshotRead(
            id=snapshot.id,
            account_id=snapshot.account_id,
            version=snapshot.version,
            source_draft_id=snapshot.source_draft_id,
            extraction_run_id=snapshot.extraction_run_id,
            approved_by_name=snapshot.approved_by_name,
            approved_at=snapshot.approved_at,
            fields=self._fields_read(snapshot.fields_json, current_user),
            citations=self._citations_read(snapshot.citations_json, current_user),
            source_context=self._source_context_read(snapshot.source_context, current_user),
            detailed_description=snapshot.detailed_description,
            source_document_ids=list(snapshot.source_document_ids),
            research_sources=list(snapshot.research_sources),
            confidence=snapshot.confidence,
            completeness=snapshot.completeness,
            source_coverage=snapshot.source_coverage,
            freshness_status=self._freshness_status(snapshot.approved_at, self._configuration().freshness_threshold_days),
            missing_fields=list(snapshot.missing_fields),
            conflicts=list(snapshot.conflicts),
            change_summary=list(snapshot.change_summary),
            created_at=snapshot.created_at,
            ai_disclaimer=AI_DISCLAIMER,
        )

    def _agent_run_read(self, run: KycAgentRun, current_user: User) -> KycAgentRunRead:
        return KycAgentRunRead(
            id=run.id,
            account_id=run.account_id,
            status=run.status,
            trigger_source=run.trigger_source,
            previous_run_id=run.previous_run_id,
            source_document_ids=list(run.source_document_ids),
            research_sources=list(run.research_sources),
            triggered_by_name=run.triggered_by_name,
            error_message=run.error_message,
            queued_at=run.queued_at,
            retry_count=run.retry_count,
            max_retries=run.max_retries,
            next_retry_at=run.next_retry_at,
            provider=dict(run.provider_json or {}),
            usage=dict(run.usage_json or {}),
            cost=dict(run.cost_json or {}),
            retrieval_summary=dict(run.retrieval_summary_json or {}),
            provider_response_id=run.provider_response_id,
            model_name=run.model_name,
            detailed_description=run.detailed_description,
            started_at=run.started_at,
            completed_at=run.completed_at,
            created_at=run.created_at,
            updated_at=run.updated_at,
            workstreams=[
                KycWorkstreamRead(
                    id=item.id,
                    workstream_key=item.workstream_key,
                    title=item.title,
                    status=item.status,
                    sort_order=item.sort_order,
                    confidence=item.confidence,
                    output=self._masked_workstream_output(item.output_json, current_user),
                    citations=self._citations_read(item.citations_json, current_user),
                    missing_fields=list(item.missing_fields),
                    reviewer_notes=list(item.reviewer_notes_json),
                    suggested_follow_up_questions=list(item.follow_up_questions_json),
                    retrieved_chunk_ids=list(item.retrieved_chunk_ids),
                    provider_response_id=item.provider_response_id,
                    error_message=item.error_message,
                    started_at=item.started_at,
                    completed_at=item.completed_at,
                )
                for item in sorted(run.workstreams, key=lambda output: output.sort_order)
            ],
            ai_disclaimer=AI_DISCLAIMER,
        )

    def _fields_read(self, fields: list[dict[str, Any]], current_user: User) -> list[KycFieldRead]:
        return [
            KycFieldRead(
                key=str(field.get("key")),
                label=str(field.get("label")),
                workstream_key=str(field.get("workstream_key")),
                workstream_title=str(field.get("workstream_title")),
                value=self._field_value_for_user(field, current_user),
                confidence=int(field.get("confidence", 0)),
                is_required=bool(field.get("is_required", True)),
                is_sensitive=bool(field.get("is_sensitive", False)),
                reviewed=bool(field.get("reviewed", False)),
                missing=bool(field.get("missing", False)),
                conflict=bool(field.get("conflict", False)),
                previous_value=None if field.get("is_sensitive") and not self._can_view_sensitive(current_user) else field.get("previous_value"),
                citations=self._citations_read(field.get("citations", []), current_user),
                missing_evidence_note=field.get("missing_evidence_note"),
                conflicts=list(field.get("conflicts") or []),
                reviewer_notes=list(field.get("reviewer_notes") or []),
                suggested_follow_up_questions=list(field.get("suggested_follow_up_questions") or []),
            )
            for field in fields
        ]

    def _citations_read(self, citations: list[dict[str, Any]], current_user: User) -> list[KycCitationRead]:
        can_sensitive = self._can_view_sensitive(current_user)
        items = []
        for citation in citations:
            restricted = bool(citation.get("is_sensitive")) and not can_sensitive
            items.append(
                KycCitationRead(
                    source_document_id=citation.get("source_document_id"),
                    source_chunk_id=citation.get("source_chunk_id"),
                    source_record_id=citation.get("source_record_id"),
                    label=str(citation.get("label") or "Source"),
                    page_number=citation.get("page_number"),
                    section_label=citation.get("section_label"),
                    excerpt="Restricted citation" if restricted else str(citation.get("excerpt") or ""),
                    field_key=citation.get("field_key"),
                    restricted=restricted,
                    confidence=citation.get("confidence"),
                    source_route=citation.get("source_route"),
                )
            )
        return items

    def _source_context_read(self, source_context: dict[str, Any], current_user: User) -> dict[str, Any]:
        if self._can_view_sensitive(current_user):
            return dict(source_context)
        context = dict(source_context)
        documents = []
        for document in context.get("source_documents", []):
            if isinstance(document, dict) and document.get("is_sensitive"):
                documents.append({"id": document.get("id"), "title": "Restricted source document", "restricted": True})
            else:
                documents.append(document)
        context["source_documents"] = documents
        return context

    def _masked_workstream_output(self, output: dict[str, Any], current_user: User) -> dict[str, Any]:
        if self._can_view_sensitive(current_user):
            return output
        sensitive_keys = {field["key"] for field in FIELD_CATALOG if field.get("sensitive")}
        masked = dict(output)
        for key in sensitive_keys & set(masked):
            value = masked[key]
            self.audit.log_access(
                module="kyc",
                entity_type="kyc_workstream_output",
                entity_id=None,
                actor=current_user,
                decision="masked",
                field_key=key,
                reason="Sensitive KYC field hidden by RBAC.",
            )
            masked[key] = {**value, "value": "Restricted KYC field"} if isinstance(value, dict) else "Restricted KYC field"
        return masked

    def _field_value_for_user(self, field: dict[str, Any], current_user: User) -> str | None:
        if field.get("is_sensitive") and not self._can_view_sensitive(current_user):
            self.audit.log_access(
                module="kyc",
                entity_type="kyc_field",
                entity_id=str(field.get("id") or field.get("key") or ""),
                actor=current_user,
                decision="masked",
                field_key=str(field.get("key") or ""),
                reason="Sensitive KYC field hidden by RBAC.",
                metadata_json={"label": field.get("label"), "workstream_key": field.get("workstream_key")},
            )
            return "Restricted KYC field"
        return field.get("value")

    @staticmethod
    def _freshness_status(anchor: datetime, threshold_days: int) -> str:
        anchor_utc = KycService._as_aware_utc(anchor)
        return "stale" if datetime.now(timezone.utc) >= anchor_utc + timedelta(days=threshold_days) else "fresh"

    @staticmethod
    def _as_aware_utc(value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    @staticmethod
    def _draft_audit_value(draft: KycDraft) -> dict[str, Any]:
        return {
            "status": draft.status,
            "confidence": draft.confidence,
            "completeness": draft.completeness,
            "missing_fields": list(draft.missing_fields),
            "conflicts": list(draft.conflicts),
        }

    def _can_view_sensitive(self, current_user: User) -> bool:
        if current_user.role in {*GLOBAL_EDIT_ROLES, "account_manager", "am"}:
            return True
        return RbacRepository(self.accounts.db).role_has_permission(current_user.role, "kyc", "export")
