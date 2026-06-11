from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Account,
    Engagement,
    Escalation,
    GovernanceEvent,
    IntegrationImportedItem,
    KamAiChatMessage,
    KamAiChatMessageSource,
    KamAiChatSession,
    KamAiSourceChunk,
    KycSnapshot,
    Opportunity,
    ScoreSnapshot,
    Signal,
    SourceDocumentChunk,
    Stakeholder,
    Task,
    TimelineEntry,
    User,
    utc_now,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.kam_ai_chat import KamAiChatRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    KamAiChatMessageCreateRequest,
    KamAiChatMessageRead,
    KamAiChatSessionCreateRequest,
    KamAiChatSessionDetailRead,
    KamAiChatSessionPageRead,
    KamAiChatSessionRead,
    KamAiChatSessionUpdateRequest,
    KamAiChatSourceRead,
    KamAiIndexStatusRead,
    KamAiReindexResponse,
)
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.kyc_document_extraction import estimate_tokens
from app.services.kyc_embeddings import LocalHashEmbeddingClient, OpenAiEmbeddingClient, cosine_similarity
from app.services.forecasting import ForecastingService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

AI_MODULE = "ai_assistance_search"
AI_DISCLAIMER = "AI-assisted output is advisory. Internal claims use authorized KAM records; public web context is included only when OpenAI search is used."
SENSITIVE_LEVELS = {"sensitive", "commercial", "financial", "executive", "confidential", "restricted"}
DEFAULT_SCOPES = ["timeline", "opportunities", "governance", "notes", "kyc", "documents"]
EXTERNAL_SEARCH_PATTERNS = [
    r"\buse\s+(?:open\s*ai|openai|chatgpt|gpt|llm)\b",
    r"\b(?:open\s*ai|openai|chatgpt|gpt|llm)\s+(?:search|lookup|research|find|check)\b",
    r"\buse\s+(?:ai|llm)\s+to\s+(?:search|lookup|research|find|check)\b",
    r"\b(?:web|internet|online|external|public)\s+(?:search|lookup|research|sources?)\b",
    r"\bsearch\s+(?:the\s+)?(?:web|internet|online|google|public\s+sources?)\b",
    r"\b(?:google\s+search|search\s+on\s+google|google\s+it)\b",
    r"\boutside\s+(?:of\s+)?kam\b",
    r"\bgo\s+outside\s+(?:of\s+)?kam\b",
]
PUBLIC_CONTEXT_LOOKUP_PATTERNS = [
    r"\b(?:get|give|show|tell|explain|research|summari[sz]e).{0,80}\bindustry\b",
    r"\bdetails?\s+(?:from|about|on)\s+(?:the\s+)?(?:industry|market|sector)\b",
    r"\bindustry\s+(?:details?|overview|context|trends?|analysis|benchmarks?|risks?|outlook|news)\b",
    r"\bindustry\b.{0,60}\b(?:details?|overview|context|research|summary)\b",
    r"\b(?:market|sector)\s+(?:details?|overview|context|trends?|analysis|benchmarks?|risks?|outlook|news)\b",
    r"\b(?:industry|market|sector)\b.*\b(?:trends?|benchmarks?|regulations?|regulatory|outlook|news|risks?|opportunities|landscape)\b",
    r"\b(?:competitor|competitive)\s+(?:analysis|landscape|benchmark|benchmarks|positioning)\b",
    r"\bpublic\s+(?:company|industry|market|sector)\s+(?:details?|overview|context|research|news)\b",
]
PUBLIC_PROFILE_LOOKUP_PATTERNS = [
    r"\blinked\s*in\b",
    r"\blinkedin\b",
    r"\bcompany\s+(?:url|link|website|site|domain)\b",
    r"\bofficial\s+(?:url|link|website|site|domain)\b",
    r"\b(?:website|homepage|domain)\s+(?:url|link)\b",
    r"\bpublic\s+(?:profile|url|link|website|site)\b",
    r"\bsocial\s+(?:profile|url|link)\b",
]
KAM_AI_STOP_WORDS = {
    "about",
    "across",
    "after",
    "again",
    "also",
    "and",
    "any",
    "are",
    "can",
    "chart",
    "could",
    "for",
    "from",
    "give",
    "how",
    "into",
    "kam",
    "next",
    "please",
    "show",
    "six",
    "tell",
    "the",
    "this",
    "through",
    "what",
    "when",
    "where",
    "with",
}


@dataclass(frozen=True)
class RetrievedKamAiSource:
    chunk: KamAiSourceChunk
    account_name: str
    relevance_score: float
    rank_reason: dict[str, Any]


class KamAiChatService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.repository = KamAiChatRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.embedding_client = self._embedding_client()

    def list_sessions(self, current_user: User, *, page: int = 1, page_size: int = 25, include_archived: bool = False) -> KamAiChatSessionPageRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        items, total = self.repository.list_sessions(current_user.id, page=page, page_size=page_size, include_archived=include_archived)
        return KamAiChatSessionPageRead(
            items=[self._session_read(item, include_messages=False) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def create_session(self, payload: KamAiChatSessionCreateRequest, current_user: User) -> KamAiChatSessionDetailRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        account_id = payload.account_id
        if account_id:
            self._require_account_view(account_id, current_user)
        session = KamAiChatSession(
            user_id=current_user.id,
            title=(payload.title or "New KAM AI chat").strip(),
            account_id=account_id,
            scope_json=self._normalized_scopes(payload.scopes),
            status="active",
        )
        self.repository.save_session(session)
        self.audit.log(module=AI_MODULE, action="chat_session_created", entity_type="kam_ai_chat_session", entity_id=session.id, actor=current_user, after_value={"account_id": account_id})
        self.db.commit()
        return self._session_detail(session)

    def get_session(self, session_id: str, current_user: User) -> KamAiChatSessionDetailRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        session = self._session_or_404(session_id, current_user)
        return self._session_detail(session)

    def update_session(self, session_id: str, payload: KamAiChatSessionUpdateRequest, current_user: User) -> KamAiChatSessionDetailRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        session = self._session_or_404(session_id, current_user)
        before = {"title": session.title, "archived_at": session.archived_at.isoformat() if session.archived_at else None}
        if payload.title is not None and payload.title.strip():
            session.title = payload.title.strip()
        if payload.archived is not None:
            session.archived_at = utc_now() if payload.archived else None
            session.status = "archived" if payload.archived else "active"
        session.updated_at = utc_now()
        self.repository.save_session(session)
        self.audit.log(module=AI_MODULE, action="chat_session_updated", entity_type="kam_ai_chat_session", entity_id=session.id, actor=current_user, before_value=before, after_value={"title": session.title, "archived_at": session.archived_at.isoformat() if session.archived_at else None})
        self.db.commit()
        return self._session_detail(session)

    def send_message(self, session_id: str, payload: KamAiChatMessageCreateRequest, current_user: User) -> KamAiChatSessionDetailRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        session = self._session_or_404(session_id, current_user)
        if session.archived_at is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived KAM AI chat sessions cannot receive new messages")

        account_id = payload.account_id or session.account_id
        accounts = self._accounts_for_scope(current_user, account_id)
        intent = self._intent(payload.content)
        external_search_reason = self._external_search_reason(payload.content)
        external_search_requested = external_search_reason != "not_requested"
        if intent == "forecast" and not account_id:
            matched_account = self._account_from_query(payload.content, accounts)
            if matched_account:
                account_id = matched_account.id
                accounts = [matched_account]
        scopes = self._normalized_scopes(payload.scopes or session.scope_json or DEFAULT_SCOPES)
        user_message = KamAiChatMessage(
            session_id=session.id,
            role="user",
            content=payload.content.strip(),
            status="complete",
            created_at=utc_now(),
            completed_at=utc_now(),
        )
        self.repository.save_message(user_message)
        if session.title == "New KAM AI chat":
            session.title = self._title_from_prompt(payload.content)
        session.scope_json = scopes
        session.account_id = account_id or session.account_id
        session.last_message_at = user_message.created_at
        session.updated_at = utc_now()
        self.repository.save_session(session)
        self.db.flush()

        assistant_message = KamAiChatMessage(
            session_id=session.id,
            role="assistant",
            content="",
            status="running",
            intent=intent,
            model_provider=self.settings.kam_ai_provider,
            model_name=self.settings.kam_ai_model,
            created_at=utc_now(),
        )
        self.repository.save_message(assistant_message)
        self.db.flush()

        started = time.monotonic()
        try:
            indexed = self.index_accounts(accounts, current_user=current_user)
            sources = self.retrieve_sources(
                payload.content,
                accounts=accounts,
                current_user=current_user,
                scopes=scopes,
                include_documents=payload.document_search,
                limit=payload.limit,
            )
            if intent == "forecast":
                answer_sources = sources
                answer = self._generate_forecast_answer(payload.content, sources=sources, accounts=accounts, current_user=current_user)
            elif external_search_requested:
                answer_sources = self._usable_internal_sources(sources)
                answer = self._generate_combined_openai_answer(payload.content, sources=answer_sources, accounts=accounts, current_user=current_user, reason=external_search_reason)
            else:
                answer_sources = self._usable_internal_sources(sources)
                answer = self._generate_answer(payload.content, sources=answer_sources, accounts=accounts, current_user=current_user)
            run_id = self._log_ai_run(
                current_user,
                session=session,
                query=payload.content,
                response=answer,
                sources=answer_sources,
                latency_ms=round((time.monotonic() - started) * 1000),
                indexed_chunks=indexed,
            )
            assistant_message.content = answer["answer_markdown"]
            assistant_message.status = "complete"
            assistant_message.intent = answer.get("intent") or self._intent(payload.content)
            assistant_message.confidence = answer.get("confidence") or self._confidence_from_sources(sources)
            assistant_message.model_provider = answer.get("provider") or self.settings.kam_ai_provider
            assistant_message.model_name = answer.get("model") or self.settings.kam_ai_model
            assistant_message.token_usage_json = dict(answer.get("usage") or {})
            assistant_message.metadata_json = {
                "disclaimer": AI_DISCLAIMER,
                "recommended_actions": answer.get("recommended_actions") or [],
                "missing_evidence": answer.get("missing_evidence") or [],
                "follow_up_questions": answer.get("follow_up_questions") or [],
                "source_count": len(answer_sources),
                "indexed_chunks": indexed,
                "fallback_used": answer.get("fallback_used", False),
                **dict(answer.get("metadata") or {}),
            }
            assistant_message.ai_gateway_run_id = run_id
            assistant_message.completed_at = utc_now()
            self.repository.save_message(assistant_message)
            self._store_message_sources(assistant_message, answer_sources)
            session.last_message_at = assistant_message.completed_at
            session.updated_at = utc_now()
            self.repository.save_session(session)
            self.audit.log(module=AI_MODULE, action="chat_message_generated", entity_type="kam_ai_chat_session", entity_id=session.id, actor=current_user, after_value={"message_id": assistant_message.id, "source_count": len(answer_sources), "confidence": assistant_message.confidence})
        except Exception as exc:
            logger.exception("KAM AI chat message failed for session %s", session.id)
            assistant_message.status = "failed"
            assistant_message.content = "I could not complete that KAM AI request. Please retry after checking source access and AI configuration."
            assistant_message.error_message = str(exc)[:1000]
            assistant_message.completed_at = utc_now()
            assistant_message.metadata_json = {"disclaimer": AI_DISCLAIMER}
            self.repository.save_message(assistant_message)
            self.audit.log(module=AI_MODULE, action="chat_message_failed", entity_type="kam_ai_chat_session", entity_id=session.id, actor=current_user, after_value={"message_id": assistant_message.id, "error": assistant_message.error_message})
        self.db.commit()
        refreshed = self.repository.get_session(session.id) or session
        return self._session_detail(refreshed)

    def reindex(self, current_user: User) -> KamAiReindexResponse:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        accounts = self._accounts_for_scope(current_user, None)
        indexed = self.index_accounts(accounts, current_user=current_user)
        self.db.commit()
        return KamAiReindexResponse(
            indexed_chunks=indexed,
            account_count=len(accounts),
            embedding_provider=self.embedding_client.provider,
            embedding_model=self.embedding_client.model,
        )

    def index_status(self, current_user: User) -> KamAiIndexStatusRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        return KamAiIndexStatusRead(
            source_chunks=self.repository.source_chunk_count(),
            embedding_provider=self.embedding_client.provider,
            embedding_model=self.embedding_client.model,
            updated_at=utc_now(),
        )

    def index_accounts(self, accounts: list[Account], *, current_user: User) -> int:
        raw_chunks = self._source_chunks(accounts, current_user=current_user)
        indexed = 0
        for raw in raw_chunks:
            text = self._compact_text(str(raw["chunk_text"]))
            if len(text) < 12:
                continue
            chunk_hash = sha256(text.encode("utf-8")).hexdigest()
            existing = self.repository.get_source_chunk(
                account_id=raw["account_id"],
                source_type=raw["source_type"],
                source_record_id=raw["source_record_id"],
                chunk_hash=chunk_hash,
            )
            if existing is None:
                embedding = self._safe_embed([text])[0]
                existing = KamAiSourceChunk(
                    account_id=raw["account_id"],
                    source_type=raw["source_type"],
                    source_record_id=raw["source_record_id"],
                    source_route=raw.get("source_route"),
                    title=str(raw["title"])[:220],
                    chunk_text=text[:8000],
                    chunk_hash=chunk_hash,
                    embedding_json=embedding,
                    embedding_provider=self.embedding_client.provider,
                    embedding_model=self.embedding_client.model,
                    embedding_dimensions=len(embedding),
                    sensitivity_level=raw.get("sensitivity_level") or "standard",
                    permission_module=raw.get("permission_module"),
                    permission_action=raw.get("permission_action") or "view",
                    source_trust_score=int(raw.get("source_trust_score") or 50),
                    metadata_json=dict(raw.get("metadata_json") or {}),
                )
                self.repository.save_source_chunk(existing)
                indexed += 1
            else:
                existing.title = str(raw["title"])[:220]
                existing.source_route = raw.get("source_route")
                existing.sensitivity_level = raw.get("sensitivity_level") or "standard"
                existing.permission_module = raw.get("permission_module")
                existing.permission_action = raw.get("permission_action") or "view"
                existing.source_trust_score = int(raw.get("source_trust_score") or existing.source_trust_score or 50)
                existing.metadata_json = dict(raw.get("metadata_json") or {})
                existing.updated_at = utc_now()
                self.repository.save_source_chunk(existing)
        self.db.flush()
        return indexed

    def retrieve_sources(
        self,
        query: str,
        *,
        accounts: list[Account],
        current_user: User,
        scopes: list[str],
        include_documents: bool,
        limit: int,
    ) -> list[RetrievedKamAiSource]:
        account_by_id = {account.id: account for account in accounts}
        chunks = self.repository.source_chunks_for_accounts(list(account_by_id))
        normalized_scopes = set(self._normalized_scopes(scopes))
        query_embedding = self._safe_embed([query])[0]
        ranked: list[RetrievedKamAiSource] = []
        for chunk in chunks:
            if not self._chunk_in_scope(chunk, normalized_scopes, include_documents=include_documents):
                continue
            if self._chunk_restricted(chunk) and not self._can_view_sensitive(current_user):
                continue
            if chunk.permission_module and not self._can_view_module(current_user, chunk.permission_module):
                continue
            score, reason = self._rank_chunk(chunk, query=query, query_embedding=query_embedding)
            account = account_by_id.get(chunk.account_id)
            ranked.append(
                RetrievedKamAiSource(
                    chunk=chunk,
                    account_name=account.name if account else "Account",
                    relevance_score=score,
                    rank_reason=reason,
                )
            )
        return sorted(ranked, key=lambda item: item.relevance_score, reverse=True)[: max(1, min(limit, 50))]

    def _source_chunks(self, accounts: list[Account], *, current_user: User) -> list[dict[str, Any]]:
        account_ids = [account.id for account in accounts]
        if not account_ids:
            return []
        chunks: list[dict[str, Any]] = []
        for account in accounts:
            chunks.append(
                self._raw_chunk(
                    account,
                    "account",
                    account.id,
                    "Account profile",
                    "\n".join(
                        item
                        for item in (
                            f"Account: {account.name}",
                            f"Project: {account.project_name or ''}",
                            f"Segment: {account.segment}",
                            f"Region: {account.region or ''}",
                            f"Lifecycle: {account.lifecycle_status}",
                            f"Risk: {account.risk_status}",
                            f"Service context: {account.service_context or ''}",
                            f"Initial notes: {account.initial_notes or ''}",
                            f"Commercial summary: {account.commercial_summary or ''}" if self._can_view_sensitive(current_user) else "",
                        )
                        if item.strip()
                    ),
                    "/accounts/{account_id}?tab=overview",
                    "account_overview",
                    85,
                )
            )
        chunks.extend(self._engagement_chunks(account_ids, current_user))
        chunks.extend(self._source_document_chunks(account_ids))
        chunks.extend(self._kyc_chunks(account_ids))
        chunks.extend(self._timeline_chunks(account_ids))
        chunks.extend(self._opportunity_chunks(account_ids, current_user))
        chunks.extend(self._signal_chunks(account_ids))
        chunks.extend(self._governance_chunks(account_ids))
        chunks.extend(self._task_chunks(account_ids))
        chunks.extend(self._score_chunks(account_ids))
        chunks.extend(self._stakeholder_chunks(account_ids))
        chunks.extend(self._fathom_chunks(account_ids))
        chunks.extend(self._escalation_chunks(account_ids, current_user))
        return chunks

    def _engagement_chunks(self, account_ids: list[str], current_user: User) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Engagement).where(Engagement.account_id.in_(account_ids), Engagement.archived_at.is_(None)).limit(500)))
        chunks = []
        for item in items:
            chunks.append(
                self._raw_chunk(
                    self._account_stub(item.account_id),
                    "engagement",
                    item.id,
                    f"Engagement: {item.name}",
                    "\n".join(
                        part
                        for part in (
                            item.name,
                            item.description or "",
                            f"Status: {item.status}",
                            f"Service lines: {', '.join(item.service_lines or [])}",
                            f"Delivery status: {item.delivery_status}",
                            f"Health: {item.delivery_health}",
                            f"Renewal date: {item.renewal_date}",
                            f"Notice deadline: {item.notice_deadline}",
                            f"Risks: {', '.join(item.risks or [])}",
                            f"Commercial context: {item.commercial_context or ''}" if self._can_view_sensitive(current_user) else "",
                        )
                        if str(part).strip()
                    ),
                    "/accounts/{account_id}?tab=engagement",
                    "engagement_sow_management",
                    95,
                    sensitivity_level="commercial" if item.commercial_context else "standard",
                )
            )
        return chunks

    def _source_document_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(SourceDocumentChunk).where(SourceDocumentChunk.account_id.in_(account_ids)).limit(1000)))
        chunks = []
        for item in items:
            chunks.append(
                self._raw_chunk(
                    self._account_stub(item.account_id or ""),
                    "document",
                    item.id,
                    item.section_label or "Source document chunk",
                    item.chunk_text,
                    "/accounts/{account_id}?tab=documents",
                    "account_overview",
                    item.trust_score or 88,
                    sensitivity_level=item.sensitivity_level,
                    metadata={"source_document_id": item.source_document_id, "page_number": item.page_number, "section_label": item.section_label},
                )
            )
        return chunks

    def _kyc_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(KycSnapshot).where(KycSnapshot.account_id.in_(account_ids)).order_by(KycSnapshot.version.desc()).limit(300)))
        chunks = []
        for item in items:
            field_text = "\n".join(f"{field.get('label') or field.get('key')}: {field.get('value')}" for field in item.fields_json or [] if field.get("value"))
            chunks.append(
                self._raw_chunk(
                    self._account_stub(item.account_id),
                    "kyc",
                    item.id,
                    f"KYC snapshot v{item.version}",
                    "\n".join(part for part in (field_text, item.detailed_description or "", f"Change summary: {item.change_summary}") if str(part).strip()),
                    "/accounts/{account_id}?tab=kyc",
                    "kyc",
                    92,
                    metadata={"version": item.version, "confidence": item.confidence},
                )
            )
        return chunks

    def _timeline_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(TimelineEntry).where(TimelineEntry.account_id.in_(account_ids), TimelineEntry.deleted_at.is_(None), TimelineEntry.status != "deleted").order_by(TimelineEntry.event_at.desc()).limit(800)))
        chunks = []
        for item in items:
            chunks.append(
                self._raw_chunk(
                    self._account_stub(item.account_id),
                    item.module or item.event_type or "timeline",
                    item.id,
                    item.title,
                    f"{item.title}\n{item.description}\nModule: {item.module}\nEvent type: {item.event_type}",
                    item.source_record_route or "/accounts/{account_id}?tab=timeline",
                    self._module_permission(item.module),
                    80,
                    sensitivity_level=item.sensitivity_level or ("sensitive" if item.is_sensitive else "standard"),
                    metadata={"event_type": item.event_type, "module": item.module, "event_at": item.event_at.isoformat() if item.event_at else None},
                )
            )
        return chunks

    def _opportunity_chunks(self, account_ids: list[str], current_user: User) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Opportunity).where(Opportunity.account_id.in_(account_ids), Opportunity.archived_at.is_(None)).limit(500)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "opportunity",
                item.id,
                item.name,
                f"{item.name}\nStage: {item.stage}\nService line: {item.service_line}\nNext step: {item.next_step}\nValue: {item.value if self._can_view_sensitive(current_user) else 'restricted'}\nTarget date: {item.target_date}\nSource context: {item.source_context or ''}",
                "/opportunities",
                "opportunity_management",
                82,
                sensitivity_level="commercial" if item.value else "standard",
            )
            for item in items
        ]

    def _signal_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Signal).where(Signal.account_id.in_(account_ids)).order_by(Signal.created_at.desc()).limit(500)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "signal",
                item.id,
                item.title,
                f"{item.title}\nSeverity: {item.severity}\nStatus: {item.status}\nDetail: {item.detail}\nReason codes: {item.reason_codes}",
                "/playbook",
                "signals_attention",
                86,
                metadata={"severity": item.severity, "status": item.status},
            )
            for item in items
        ]

    def _governance_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(GovernanceEvent).where(GovernanceEvent.account_id.in_(account_ids)).order_by(GovernanceEvent.scheduled_at.desc()).limit(500)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "governance",
                item.id,
                item.governance_type,
                f"{item.governance_type}\nStatus: {item.status}\nAgenda: {item.agenda or ''}\nNotes: {item.notes or ''}\nAttendees: {item.attendees}",
                "/accounts/{account_id}?tab=governance",
                "governance_reviews",
                88,
            )
            for item in items
            if item.account_id
        ]

    def _task_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Task).where(Task.account_id.in_(account_ids)).order_by(Task.created_at.desc()).limit(600)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "task",
                item.id,
                item.title,
                f"{item.title}\nDescription: {item.description or ''}\nStatus: {item.status}\nPriority: {item.priority}\nOwner: {item.owner_name}\nDue: {item.due_at}\nNotes: {item.notes or ''}\nOutcome: {item.outcome or ''}\nSuccess criteria: {item.success_criteria}",
                f"/tasks?accountId={item.account_id}",
                "playbooks_tasks_calendar",
                78,
            )
            for item in items
        ]

    def _score_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(ScoreSnapshot).where(ScoreSnapshot.account_id.in_(account_ids)).order_by(ScoreSnapshot.calculated_at.desc()).limit(500)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "health",
                item.id,
                f"Health score {item.overall}",
                f"Overall: {item.overall}\nRAG: {item.rag_status}\nDrivers: {item.drivers}\nReasons: {item.reason_codes}\nTrend: {item.trend}",
                "/accounts/{account_id}?tab=health",
                "scoring_engine",
                84,
            )
            for item in items
        ]

    def _stakeholder_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Stakeholder).where(Stakeholder.account_id.in_(account_ids), Stakeholder.archived_at.is_(None)).limit(500)))
        chunks = []
        for item in items:
            chunks.append(
                self._raw_chunk(
                    self._account_stub(item.account_id),
                    "stakeholder",
                    item.id,
                    item.name,
                    "\n".join(str(getattr(item, attr, "")) for attr in ("name", "title", "role", "influence_level", "sentiment", "notes") if str(getattr(item, attr, "")).strip()),
                    "/accounts/{account_id}?tab=overview",
                    "stakeholder_relationship",
                    76,
                )
            )
        return chunks

    def _fathom_chunks(self, account_ids: list[str]) -> list[dict[str, Any]]:
        items = list(
            self.db.scalars(
                select(IntegrationImportedItem)
                .where(IntegrationImportedItem.provider == "fathom", IntegrationImportedItem.account_id.in_(account_ids), IntegrationImportedItem.review_status == "approved")
                .order_by(IntegrationImportedItem.created_at.desc())
                .limit(300)
            )
        )
        return [
            self._raw_chunk(
                self._account_stub(item.account_id or ""),
                "fathom",
                item.id,
                item.title,
                f"{item.title}\n{item.description or ''}\nPayload: {item.sanitized_payload_json}",
                item.source_link or "/accounts/{account_id}?tab=timeline",
                "integrations",
                74,
            )
            for item in items
            if item.account_id
        ]

    def _escalation_chunks(self, account_ids: list[str], current_user: User) -> list[dict[str, Any]]:
        items = list(self.db.scalars(select(Escalation).where(Escalation.account_id.in_(account_ids)).order_by(Escalation.created_at.desc()).limit(300)))
        return [
            self._raw_chunk(
                self._account_stub(item.account_id),
                "escalation",
                item.id,
                item.summary,
                f"{item.summary}\nImpact: {item.impact}\nSeverity: {item.severity}\nStatus: {item.status}\nMitigation: {item.mitigation or ''}\nRCA: {item.rca or ''}",
                "/escalations",
                "escalation_management",
                90,
                sensitivity_level="sensitive",
            )
            for item in items
            if self._can_view_sensitive(current_user)
        ]

    def _raw_chunk(
        self,
        account: Account,
        source_type: str,
        source_record_id: str,
        title: str,
        text: str,
        route_template: str | None,
        permission_module: str | None,
        trust_score: int,
        *,
        sensitivity_level: str = "standard",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        route = route_template.format(account_id=account.id) if route_template else None
        return {
            "account_id": account.id,
            "source_type": source_type,
            "source_record_id": source_record_id,
            "title": title,
            "chunk_text": text,
            "source_route": route,
            "permission_module": permission_module,
            "permission_action": "view",
            "source_trust_score": trust_score,
            "sensitivity_level": sensitivity_level or "standard",
            "metadata_json": metadata or {},
        }

    def _generate_answer(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], current_user: User) -> dict[str, Any]:
        if sources:
            return self._fallback_answer(query, sources=sources, accounts=accounts, reason="internal_vector_search")
        if self.settings.kam_ai_provider != "openai" or not self.settings.kam_ai_api_key:
            return self._fallback_answer(query, sources=sources, accounts=accounts, reason="no_internal_sources_openai_not_configured")
        prompt = self._openai_general_prompt(query, accounts=accounts, current_user=current_user)
        if estimate_tokens(prompt) > self.settings.kam_ai_max_input_tokens:
            prompt = prompt[: self.settings.kam_ai_max_input_tokens * 4]
        try:
            text, metadata = self._call_openai(prompt)
            parsed = self._parse_openai_response(text)
            return {
                "answer_markdown": parsed.get("answer_markdown") or text,
                "confidence": parsed.get("confidence") or "low",
                "intent": parsed.get("intent") or self._intent(query),
                "recommended_actions": parsed.get("recommended_actions") if isinstance(parsed.get("recommended_actions"), list) else [],
                "missing_evidence": parsed.get("missing_evidence") if isinstance(parsed.get("missing_evidence"), list) else ["No matching internal KAM records were found."],
                "follow_up_questions": parsed.get("follow_up_questions") if isinstance(parsed.get("follow_up_questions"), list) else [],
                "provider": "openai",
                "model": self.settings.kam_ai_model,
                "usage": metadata.get("usage") or {},
                "raw_response": text,
                "metadata": {"openai_used_because": "no_internal_vector_match"},
            }
        except Exception as exc:
            logger.exception("KAM AI OpenAI response failed")
            fallback = self._fallback_answer(query, sources=sources, accounts=accounts, reason=f"no_internal_sources_openai_failed: {str(exc)[:240]}")
            fallback["fallback_used"] = True
            return fallback

    def _generate_combined_openai_answer(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], current_user: User, reason: str) -> dict[str, Any]:
        if self.settings.kam_ai_provider != "openai" or not self.settings.kam_ai_api_key:
            fallback_reason = f"{reason}_openai_web_search_not_configured"
            return self._fallback_answer(query, sources=sources, accounts=accounts, reason=fallback_reason)
        prompt = self._openai_combined_search_prompt(query, sources=sources, accounts=accounts, current_user=current_user, reason=reason)
        if estimate_tokens(prompt) > self.settings.kam_ai_max_input_tokens:
            prompt = prompt[: self.settings.kam_ai_max_input_tokens * 4]
        try:
            text, metadata = self._call_openai(prompt, use_web_search=True)
            parsed = self._parse_openai_response(text)
            citations = metadata.get("url_citations") or []
            external_sources = metadata.get("web_sources") or []
            missing = parsed.get("missing_evidence") if isinstance(parsed.get("missing_evidence"), list) else []
            return {
                "answer_markdown": parsed.get("answer_markdown") or text,
                "confidence": parsed.get("confidence") or ("medium" if citations or external_sources else "low"),
                "intent": parsed.get("intent") or "general",
                "recommended_actions": parsed.get("recommended_actions") if isinstance(parsed.get("recommended_actions"), list) else [],
                "missing_evidence": missing,
                "follow_up_questions": parsed.get("follow_up_questions") if isinstance(parsed.get("follow_up_questions"), list) else [],
                "provider": "openai_combined_search",
                "model": self.settings.kam_ai_model,
                "usage": {**dict(metadata.get("usage") or {}), "internal_source_count": len(sources)},
                "raw_response": text,
                "metadata": {
                    "external_search_requested": True,
                    "combined_internal_and_external": True,
                    "openai_used_because": reason,
                    "openai_web_search_used": metadata.get("web_search_used", False),
                    "openai_url_citations": citations,
                    "openai_external_sources": external_sources,
                    "internal_source_count": len(sources),
                    "response_id": metadata.get("response_id"),
                },
            }
        except Exception as exc:
            logger.exception("KAM AI combined OpenAI search failed")
            fallback = self._fallback_answer(query, sources=sources, accounts=accounts, reason=f"{reason}_openai_web_search_failed: {str(exc)[:240]}")
            fallback["fallback_used"] = True
            fallback["metadata"] = {"external_search_requested": True, "combined_internal_and_external": bool(sources), "openai_used_because": reason, "internal_source_count": len(sources)}
            return fallback

    def _generate_external_openai_answer(self, query: str, *, accounts: list[Account], current_user: User) -> dict[str, Any]:
        return self._generate_combined_openai_answer(query, sources=[], accounts=accounts, current_user=current_user, reason="user_requested_external_search")

    def _generate_forecast_answer(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], current_user: User) -> dict[str, Any]:
        months = self._forecast_months(query)
        forecast = ForecastingService(self.db).generate(accounts, months=months)
        forecast_payload = forecast.model_dump(mode="json")
        account_scope = "portfolio" if len(accounts) != 1 else accounts[0].name
        highlights = [str(item) for item in forecast.highlights[:3]]
        missing = [str(item) for item in forecast.missing_data[:6]]
        actions = [str(item) for item in forecast.recommended_actions[:5]]
        content_parts = [
            forecast.title,
            forecast.summary,
            f"Scope: {account_scope}.",
        ]
        if highlights:
            content_parts.extend(["Key drivers", *highlights])
        if missing:
            content_parts.extend(["Data caveats", *missing])
        if actions:
            content_parts.extend(["Recommended next actions", *actions])
        content_parts.append("The chart below visualizes forecast revenue and baseline revenue for the requested period.")
        confidence = forecast.confidence if forecast.confidence != "not_available" else "low"
        return {
            "answer_markdown": "\n".join(content_parts),
            "confidence": confidence,
            "intent": "forecast",
            "recommended_actions": actions,
            "missing_evidence": missing,
            "follow_up_questions": [],
            "provider": "deterministic_forecast",
            "model": "forecasting_service",
            "usage": {
                "source_count": len(sources),
                "account_count": len(accounts),
                "months": months,
                "forecast_run_id": forecast.run_id,
            },
            "metadata": {
                "visualization_type": "forecast_chart",
                "forecast_chart": forecast_payload,
            },
        }

    def _openai_prompt(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], current_user: User) -> str:
        payload = {
            "question": query,
            "user": {"id": current_user.id, "role": current_user.role},
            "authorized_accounts": [{"id": account.id, "name": account.name, "risk_status": account.risk_status, "lifecycle_status": account.lifecycle_status} for account in accounts],
            "sources": [
                {
                    "citation_index": index,
                    "account_id": item.chunk.account_id,
                    "account_name": item.account_name,
                    "source_type": item.chunk.source_type,
                    "source_record_id": item.chunk.source_record_id,
                    "title": item.chunk.title,
                    "excerpt": item.chunk.chunk_text[:1800],
                    "source_route": item.chunk.source_route,
                    "relevance_score": round(item.relevance_score, 4),
                    "rank_reason": item.rank_reason,
                }
                for index, item in enumerate(sources, start=1)
            ],
        }
        return (
            "You are KAM AI, a strategic account-management assistant.\n"
            "Answer the user's question using only the supplied authorized KAM source records. Do not invent facts.\n"
            "If the sources are weak, say what is missing. Keep recommendations separate from evidence.\n"
            "Cite important claims with [source #] markers that match citation_index.\n"
            "Return JSON only with this shape: {\"answer_markdown\":\"...\", \"confidence\":\"high|medium|low\", \"intent\":\"risk|renewal|governance|growth|forecast|handoff|general\", \"recommended_actions\":[], \"missing_evidence\":[], \"follow_up_questions\":[]}.\n"
            f"Payload:\n{json.dumps(payload, default=str)}"
        )

    def _openai_general_prompt(self, query: str, *, accounts: list[Account], current_user: User) -> str:
        payload = {
            "question": query,
            "user": {"id": current_user.id, "role": current_user.role},
            "authorized_account_names": [account.name for account in accounts],
            "internal_search_status": "No reliable matching internal KAM vector records were found for this question.",
        }
        return (
            "You are KAM AI, a strategic account-management assistant.\n"
            "The internal KAM vector search did not find reliable source-backed evidence for the user's question.\n"
            "Use OpenAI model knowledge as a fallback only. Do not pretend this is live web search or internal record evidence.\n"
            "State clearly that no matching internal KAM records were found, and keep advice practical for account-management review.\n"
            "Do not invent account-specific commercial, stakeholder, escalation, or delivery facts. Ask for source records when needed.\n"
            "Return JSON only with this shape: {\"answer_markdown\":\"...\", \"confidence\":\"high|medium|low\", \"intent\":\"risk|renewal|governance|growth|forecast|handoff|general\", \"recommended_actions\":[], \"missing_evidence\":[], \"follow_up_questions\":[]}.\n"
            f"Payload:\n{json.dumps(payload, default=str)}"
        )

    def _openai_external_search_prompt(self, query: str, *, accounts: list[Account], current_user: User) -> str:
        return self._openai_combined_search_prompt(query, sources=[], accounts=accounts, current_user=current_user, reason="user_requested_external_search")

    def _openai_combined_search_prompt(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], current_user: User, reason: str) -> str:
        payload = {
            "question": query,
            "user": {"id": current_user.id, "role": current_user.role},
            "authorized_account_names": [account.name for account in accounts],
            "external_search_reason": reason,
            "external_search_policy": "Use OpenAI web search for public/industry/company context that is not expected to live in KAM records. Combine it with any authorized KAM source records supplied below.",
            "internal_sources": [
                {
                    "citation_index": index,
                    "account_id": item.chunk.account_id,
                    "account_name": item.account_name,
                    "source_type": item.chunk.source_type,
                    "source_record_id": item.chunk.source_record_id,
                    "title": item.chunk.title,
                    "excerpt": item.chunk.chunk_text[:1800],
                    "source_route": item.chunk.source_route,
                    "relevance_score": round(item.relevance_score, 4),
                    "rank_reason": item.rank_reason,
                }
                for index, item in enumerate(sources, start=1)
            ],
        }
        return (
            "You are KAM AI, a strategic account-management assistant.\n"
            "Use BOTH evidence channels when available: authorized internal KAM source records and OpenAI web search/public web research.\n"
            "Use OpenAI web search for industry, market, competitor, public company, public URL/profile, or current public-news context. Do not claim Google-specific scraping; describe it as OpenAI web search or public web research.\n"
            "Clearly separate internal KAM facts from public/industry findings. Do not let public web information override internal account facts; call out conflicts or stale evidence instead.\n"
            "Cite internal KAM claims with [source #] markers that match citation_index. Cite public web claims in natural language using source names or URLs when available from the search result context.\n"
            "For URL/profile lookup questions, return the best matching URL list first, then add a short note about confidence or ambiguity.\n"
            "Do not invent account-specific commercial, stakeholder, escalation, or delivery facts.\n"
            "Write the final answer in clear, human-readable markdown with concise headings when useful.\n"
            "Return JSON only with this shape: {\"answer_markdown\":\"...\", \"confidence\":\"high|medium|low\", \"intent\":\"risk|renewal|governance|growth|forecast|handoff|general\", \"recommended_actions\":[], \"missing_evidence\":[], \"follow_up_questions\":[]}.\n"
            f"Payload:\n{json.dumps(payload, default=str)}"
        )

    def _call_openai(self, prompt: str, *, use_web_search: bool = False) -> tuple[str, dict[str, Any]]:
        from openai import OpenAI

        client_kwargs: dict[str, Any] = {"api_key": self.settings.kam_ai_api_key, "timeout": self.settings.kam_ai_timeout_seconds}
        if self.settings.kam_ai_base_url:
            client_kwargs["base_url"] = self.settings.kam_ai_base_url
        client = OpenAI(**client_kwargs)
        last_error: Exception | None = None
        for attempt in range(self.settings.kam_ai_max_retries + 1):
            started = time.monotonic()
            try:
                request_kwargs: dict[str, Any] = {
                    "model": self.settings.kam_ai_model,
                    "input": prompt,
                    "max_output_tokens": self.settings.kam_ai_max_output_tokens,
                }
                if use_web_search:
                    request_kwargs["tools"] = [
                        {
                            "type": "web_search",
                            "search_context_size": "medium",
                            "user_location": {"type": "approximate", "country": "US"},
                        }
                    ]
                    request_kwargs["include"] = ["web_search_call.action.sources"]
                if not self.settings.kam_ai_model.lower().startswith("gpt-5"):
                    request_kwargs["temperature"] = self.settings.kam_ai_temperature
                response = client.responses.create(**request_kwargs)
                response_payload = response.model_dump() if hasattr(response, "model_dump") else {}
                return getattr(response, "output_text", "") or "", {
                    "response_id": getattr(response, "id", None),
                    "usage": self._usage_dict(getattr(response, "usage", None)),
                    "latency_ms": round((time.monotonic() - started) * 1000),
                    "web_search_used": use_web_search,
                    "url_citations": self._openai_url_citations(response_payload),
                    "web_sources": self._openai_web_sources(response_payload),
                }
            except Exception as exc:
                last_error = exc
                if attempt >= self.settings.kam_ai_max_retries:
                    break
                time.sleep(self.settings.kam_ai_retry_backoff_seconds * (attempt + 1))
        raise RuntimeError(f"OpenAI KAM AI request failed: {str(last_error)[:300]}") from last_error

    @staticmethod
    def _parse_openai_response(text: str) -> dict[str, Any]:
        value = text.strip()
        if value.startswith("```"):
            value = value.strip("`")
            if value.lower().startswith("json"):
                value = value[4:].strip()
        start = value.find("{")
        end = value.rfind("}")
        if start >= 0 and end > start:
            value = value[start : end + 1]
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _openai_url_citations(payload: dict[str, Any]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for item in payload.get("output") or []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for content in item.get("content") or []:
                if not isinstance(content, dict):
                    continue
                for annotation in content.get("annotations") or []:
                    if isinstance(annotation, dict) and annotation.get("type") == "url_citation":
                        citations.append(
                            {
                                "title": annotation.get("title"),
                                "url": annotation.get("url"),
                                "start_index": annotation.get("start_index"),
                                "end_index": annotation.get("end_index"),
                            }
                        )
        return citations

    @staticmethod
    def _openai_web_sources(payload: dict[str, Any]) -> list[dict[str, Any]]:
        sources: list[dict[str, Any]] = []
        for item in payload.get("output") or []:
            if not isinstance(item, dict) or item.get("type") != "web_search_call":
                continue
            action = item.get("action") or {}
            if not isinstance(action, dict):
                continue
            for source in action.get("sources") or []:
                if isinstance(source, dict):
                    sources.append({"title": source.get("title"), "url": source.get("url")})
        return sources

    def _fallback_answer(self, query: str, *, sources: list[RetrievedKamAiSource], accounts: list[Account], reason: str) -> dict[str, Any]:
        if not sources:
            answer = f"I could not find enough authorized source records to answer '{query}' with confidence."
        else:
            source_lines = "\n".join(
                f"- [{index}] {item.account_name}: {item.chunk.title} ({item.chunk.source_type})"
                for index, item in enumerate(sources[:8], start=1)
            )
            closing = (
                "Internal vector search found matching KAM records, so OpenAI was not needed for this response."
                if reason == "internal_vector_search"
                else "OpenAI synthesis was not available for this response, so this is a source-ranked summary for review."
            )
            answer = (
                f"I found {len(sources)} authorized source record(s) across {len(accounts)} account(s) for '{query}'.\n\n"
                f"Top evidence:\n{source_lines}\n\n"
                + closing
            )
        return {
            "answer_markdown": answer,
            "confidence": self._confidence_from_sources(sources),
            "intent": self._intent(query),
            "recommended_actions": ["Open the cited source records and validate the recommendation before taking account action."] if sources else [],
            "missing_evidence": [] if reason == "internal_vector_search" else [reason],
            "follow_up_questions": ["Which account or time window should KAM AI narrow the answer to?"] if len(accounts) > 1 else [],
            "provider": "internal_vector_search" if reason == "internal_vector_search" else "deterministic_fallback",
            "model": "source-ranked",
            "usage": {"source_count": len(sources), "account_count": len(accounts), "fallback_reason": reason},
            "fallback_used": reason != "internal_vector_search",
        }

    def _store_message_sources(self, message: KamAiChatMessage, sources: list[RetrievedKamAiSource]) -> None:
        for index, item in enumerate(sources, start=1):
            self.repository.save_message_source(
                KamAiChatMessageSource(
                    message_id=message.id,
                    account_id=item.chunk.account_id,
                    account_name=item.account_name,
                    source_type=item.chunk.source_type,
                    source_record_id=item.chunk.source_record_id,
                    title=item.chunk.title,
                    excerpt=item.chunk.chunk_text[:600],
                    source_route=item.chunk.source_route,
                    relevance_score=item.relevance_score,
                    citation_index=index,
                    metadata_json={"rank_reason": item.rank_reason, **dict(item.chunk.metadata_json or {})},
                )
            )

    def _rank_chunk(self, chunk: KamAiSourceChunk, *, query: str, query_embedding: list[float]) -> tuple[float, dict[str, Any]]:
        terms = self._query_terms(query)
        text = f"{chunk.title} {chunk.chunk_text}".lower()
        matched_terms = sorted(term for term in terms if term in text)[:12]
        keyword_score = len(matched_terms) * 4
        vector_score = cosine_similarity(chunk.embedding_json, query_embedding) * 35 if chunk.embedding_json else 0
        trust_score = float(chunk.source_trust_score or 50)
        recency_bonus = 1.5 if chunk.updated_at else 0
        score = trust_score + keyword_score + vector_score + recency_bonus
        return score, {"matched_terms": matched_terms, "vector_similarity": round(cosine_similarity(chunk.embedding_json, query_embedding), 4) if chunk.embedding_json else None, "trust_score": trust_score, "source_type": chunk.source_type}

    @staticmethod
    def _query_terms(query: str) -> set[str]:
        return {
            term
            for term in re.findall(r"[a-z0-9]+", query.lower())
            if len(term) > 2 and term not in KAM_AI_STOP_WORDS
        }

    @staticmethod
    def _usable_internal_sources(sources: list[RetrievedKamAiSource]) -> list[RetrievedKamAiSource]:
        if not sources:
            return []
        usable = [
            source
            for source in sources
            if source.rank_reason.get("matched_terms")
            or (
                str(source.chunk.embedding_provider or "").lower() != "local_hash"
                and float(source.rank_reason.get("vector_similarity") or 0) >= 0.42
            )
        ]
        return usable[: len(sources)]

    def _chunk_in_scope(self, chunk: KamAiSourceChunk, scopes: set[str], *, include_documents: bool) -> bool:
        if "all" in scopes:
            return include_documents or chunk.source_type != "document"
        source_map = {
            "account": {"timeline", "overview", "all"},
            "engagement": {"engagement", "timeline", "all"},
            "document": {"documents", "kyc", "all"},
            "kyc": {"kyc", "all"},
            "manual": {"notes", "timeline", "all"},
            "note": {"notes", "timeline", "all"},
            "timeline": {"timeline", "all"},
            "governance": {"governance", "timeline", "all"},
            "opportunity": {"opportunities", "all"},
            "signal": {"signals", "timeline", "all"},
            "task": {"tasks", "timeline", "all"},
            "health": {"health", "all"},
            "stakeholder": {"stakeholders", "all"},
            "fathom": {"timeline", "governance", "all"},
            "escalation": {"escalations", "timeline", "all"},
        }
        if chunk.source_type == "document" and not include_documents:
            return False
        return bool(scopes.intersection(source_map.get(chunk.source_type, {chunk.source_type})))

    def _session_or_404(self, session_id: str, current_user: User) -> KamAiChatSession:
        session = self.repository.get_session(session_id)
        if session is None or session.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KAM AI chat session was not found")
        return session

    def _accounts_for_scope(self, current_user: User, account_id: str | None) -> list[Account]:
        if account_id:
            return [self._require_account_view(account_id, current_user)]
        if current_user.role in GLOBAL_VIEW_ROLES:
            return list(self.db.scalars(select(Account).where(Account.archived_at.is_(None)).order_by(Account.name).limit(100)))
        account_ids = self.accounts.list_account_ids_for_user(current_user.id)
        if not account_ids:
            return []
        return list(self.db.scalars(select(Account).where(Account.id.in_(account_ids), Account.archived_at.is_(None)).order_by(Account.name).limit(100)))

    def _require_account_view(self, account_id: str, current_user: User) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module=AI_MODULE)
        return account

    def _can_view_module(self, current_user: User, module: str) -> bool:
        try:
            self.access.require_module_permission(current_user, module, "view")
            return True
        except HTTPException:
            return False

    @staticmethod
    def _can_view_sensitive(current_user: User) -> bool:
        return current_user.role in {"super_admin", "admin", "kam_head", "account_manager"}

    @staticmethod
    def _chunk_restricted(chunk: KamAiSourceChunk) -> bool:
        return str(chunk.sensitivity_level or "").lower() in SENSITIVE_LEVELS

    def _embedding_client(self) -> LocalHashEmbeddingClient | OpenAiEmbeddingClient:
        if self.settings.kam_ai_embedding_provider == "openai" and self.settings.kam_ai_api_key:
            return OpenAiEmbeddingClient(api_key=self.settings.kam_ai_api_key, model=self.settings.kam_ai_embedding_model, base_url=self.settings.kam_ai_base_url or None)
        return LocalHashEmbeddingClient(dimensions=self.settings.kam_ai_embedding_dimensions, model=self.settings.kam_ai_embedding_model or "local-hash-v1")

    def _safe_embed(self, texts: list[str]) -> list[list[float]]:
        try:
            return self.embedding_client.embed(texts)
        except Exception:
            fallback = LocalHashEmbeddingClient(dimensions=self.settings.kam_ai_embedding_dimensions, model="local-hash-v1")
            return fallback.embed(texts)

    @staticmethod
    def _compact_text(value: str) -> str:
        return " ".join(value.split())

    @staticmethod
    def _title_from_prompt(value: str) -> str:
        title = " ".join(value.strip().split())[:70]
        return title or "New KAM AI chat"

    @staticmethod
    def _normalized_scopes(scopes: list[str] | None) -> list[str]:
        values = [str(scope).strip().lower() for scope in (scopes or DEFAULT_SCOPES) if str(scope).strip()]
        return list(dict.fromkeys(values)) or list(DEFAULT_SCOPES)

    @staticmethod
    def _intent(query: str) -> str:
        normalized = query.lower()
        if any(term in normalized for term in ["forecast", "prediction", "predict", "projection", "chart", "graph", "next 6 months", "next six months"]):
            return "forecast"
        if "handoff" in normalized:
            return "handoff"
        if "risk" in normalized or "health" in normalized or "escalation" in normalized:
            return "risk"
        if "renewal" in normalized or "notice" in normalized:
            return "renewal"
        if "opportun" in normalized or "growth" in normalized or "whitespace" in normalized:
            return "growth"
        if "governance" in normalized or "qbr" in normalized:
            return "governance"
        return "general"

    @staticmethod
    def _external_search_requested(query: str) -> bool:
        return KamAiChatService._external_search_reason(query) != "not_requested"

    @staticmethod
    def _external_search_reason(query: str) -> str:
        normalized = " ".join(query.lower().split())
        if any(re.search(pattern, normalized) for pattern in EXTERNAL_SEARCH_PATTERNS):
            return "user_requested_external_search"
        if any(re.search(pattern, normalized) for pattern in PUBLIC_PROFILE_LOOKUP_PATTERNS):
            return "public_profile_lookup"
        if any(re.search(pattern, normalized) for pattern in PUBLIC_CONTEXT_LOOKUP_PATTERNS):
            return "industry_or_market_context"
        return "not_requested"

    @staticmethod
    def _forecast_months(query: str) -> int:
        normalized = query.lower()
        if "next six" in normalized:
            return 6
        match = re.search(r"(?:next|for|over)\s+(\d{1,2})\s+month", normalized)
        if match:
            return max(1, min(int(match.group(1)), 12))
        return 6

    @staticmethod
    def _account_from_query(query: str, accounts: list[Account]) -> Account | None:
        normalized = re.sub(r"[^a-z0-9]+", " ", query.lower()).strip()
        best: tuple[int, Account] | None = None
        for account in accounts:
            name = re.sub(r"[^a-z0-9]+", " ", account.name.lower()).strip()
            if not name:
                continue
            words = [word for word in name.split() if len(word) > 2]
            score = 0
            if name in normalized:
                score += 100
            score += sum(10 for word in words if word in normalized)
            if score and (best is None or score > best[0]):
                best = (score, account)
        return best[1] if best and best[0] >= 10 else None

    @staticmethod
    def _confidence_from_sources(sources: list[RetrievedKamAiSource]) -> str:
        if len(sources) >= 6:
            return "high"
        if sources:
            return "medium"
        return "low"

    @staticmethod
    def _usage_dict(usage: Any) -> dict[str, Any]:
        if usage is None:
            return {}
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        return usage if isinstance(usage, dict) else {}

    def _log_ai_run(
        self,
        current_user: User,
        *,
        session: KamAiChatSession,
        query: str,
        response: dict[str, Any],
        sources: list[RetrievedKamAiSource],
        latency_ms: int,
        indexed_chunks: int,
    ) -> str | None:
        try:
            from app.services.integrations import IntegrationService

            run = IntegrationService(self.db).log_ai_gateway_run(
                request_type="kam_ai_chat",
                status_value="complete",
                actor=current_user,
                account_id=session.account_id,
                permission_scope={"module": AI_MODULE, "actor_role": current_user.role, "session_id": session.id},
                source_context=[
                    {"type": source.chunk.source_type, "id": source.chunk.source_record_id, "account_id": source.chunk.account_id, "score": source.relevance_score}
                    for source in sources
                ],
                response_labels=["AI-assisted", "Chat", "Source-backed"],
                prompt={"query": query, "session_id": session.id, "scopes": session.scope_json},
                response=response,
                usage={**dict(response.get("usage") or {}), "source_count": len(sources), "indexed_chunks": indexed_chunks},
                latency_ms=latency_ms,
                affected_records=[{"type": "kam_ai_chat_session", "id": session.id}],
                commit=False,
            )
            return run.id
        except Exception:
            logger.exception("Failed to write KAM AI chat gateway run")
            return None

    def _session_read(self, session: KamAiChatSession, *, include_messages: bool) -> KamAiChatSessionRead | KamAiChatSessionDetailRead:
        messages = sorted(session.messages, key=lambda item: item.created_at) if include_messages else []
        last_message = messages[-1] if messages else None
        base = {
            "id": session.id,
            "user_id": session.user_id,
            "title": session.title,
            "account_id": session.account_id,
            "account_name": session.account.name if session.account else None,
            "scope_json": list(session.scope_json or []),
            "status": session.status,
            "message_count": len(session.messages) if session.messages else 0,
            "last_message_preview": (last_message.content[:140] if last_message else None),
            "last_message_at": session.last_message_at,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "archived_at": session.archived_at,
        }
        if include_messages:
            return KamAiChatSessionDetailRead(**base, messages=[self._message_read(message) for message in messages])
        return KamAiChatSessionRead(**base)

    def _session_detail(self, session: KamAiChatSession) -> KamAiChatSessionDetailRead:
        refreshed = self.repository.get_session(session.id) or session
        return self._session_read(refreshed, include_messages=True)  # type: ignore[return-value]

    @staticmethod
    def _message_read(message: KamAiChatMessage) -> KamAiChatMessageRead:
        return KamAiChatMessageRead(
            id=message.id,
            session_id=message.session_id,
            role=message.role,  # type: ignore[arg-type]
            content=message.content,
            status=message.status,  # type: ignore[arg-type]
            intent=message.intent,
            confidence=message.confidence,  # type: ignore[arg-type]
            model_provider=message.model_provider,
            model_name=message.model_name,
            token_usage_json=dict(message.token_usage_json or {}),
            metadata_json=dict(message.metadata_json or {}),
            error_message=message.error_message,
            ai_gateway_run_id=message.ai_gateway_run_id,
            sources=[
                KamAiChatSourceRead(
                    id=source.id,
                    account_id=source.account_id,
                    account_name=source.account_name,
                    source_type=source.source_type,
                    source_record_id=source.source_record_id,
                    title=source.title,
                    excerpt=source.excerpt,
                    source_route=source.source_route,
                    relevance_score=source.relevance_score,
                    citation_index=source.citation_index,
                    metadata_json=dict(source.metadata_json or {}),
                )
                for source in sorted(message.sources, key=lambda item: item.citation_index)
            ],
            created_at=message.created_at,
            completed_at=message.completed_at,
        )

    def _account_stub(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            return Account(id=account_id, name="Account", segment="Unknown", lifecycle_status="Unknown")
        return account

    @staticmethod
    def _module_permission(module: str | None) -> str:
        value = str(module or "").lower()
        if value == "governance":
            return "governance_reviews"
        if value == "kyc":
            return "kyc"
        if value in {"signal", "signals"}:
            return "signals_attention"
        if value in {"task", "tasks"}:
            return "playbooks_tasks_calendar"
        return "account_timeline"
