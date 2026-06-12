from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, IntegrationImportedItem, KycSnapshot, SourceDocument, SourceDocumentChunk, TimelineEntry, User
from app.services.kyc_document_extraction import KycDocumentExtractionService, estimate_tokens, source_trust_score
from app.services.kyc_embeddings import EmbeddingClient, build_embedding_client, cosine_similarity


SENSITIVE_CONTEXT_LEVELS = {"sensitive", "commercial", "financial", "executive", "confidential", "restricted"}

WORKSTREAM_QUERY_HINTS: dict[str, list[str]] = {
    "market_research": [
        "industry overview",
        "market trends",
        "market size",
        "growth drivers",
        "competitors",
        "regulatory compliance",
        "public company context",
    ],
    "client_research": [
        "company profile",
        "client overview",
        "strategy",
        "business model",
        "core offerings",
        "digital products",
        "customer segments",
        "technical landscape",
        "account context",
        "platform modernization",
        "governance cadence",
        "executive reporting",
        "statement of work",
    ],
    "stakeholder_details": [
        "client stakeholders",
        "tkxel stakeholders",
        "executive sponsor",
        "decision maker",
        "account owner",
        "delivery lead",
        "responsibilities",
    ],
    "tkxel_engagement": [
        "statement of work",
        "project charter",
        "engagement scope",
        "deliverables",
        "obligations",
        "sla",
        "governance cadence",
        "delivery model",
        "fathom action items",
    ],
    "financial_landscape": [
        "commercial terms",
        "contract value",
        "billing model",
        "payment terms",
        "renewal terms",
        "notice period",
        "gross margin",
        "invoice",
        "auto renewal",
    ],
}


class KycRetrievalService:
    def __init__(self, db: Session, *, embedding_client: EmbeddingClient | None = None) -> None:
        self.db = db
        self.settings = get_settings()
        self.embedding_client = embedding_client or build_embedding_client()
        self.extraction = KycDocumentExtractionService(db)

    def prepare_context(
        self,
        *,
        account: Account,
        source_documents: list[SourceDocument],
        current_user: User,
        workstreams: list[dict[str, Any]],
        can_view_sensitive: bool,
        prior_snapshot: KycSnapshot | None = None,
    ) -> list[dict[str, Any]]:
        contexts_by_workstream = self.prepare_workstream_contexts(
            account=account,
            source_documents=source_documents,
            current_user=current_user,
            workstreams=workstreams,
            can_view_sensitive=can_view_sensitive,
            prior_snapshot=prior_snapshot,
        )
        return self._flatten_workstream_contexts(contexts_by_workstream)

    def prepare_workstream_contexts(
        self,
        *,
        account: Account,
        source_documents: list[SourceDocument],
        current_user: User,
        workstreams: list[dict[str, Any]],
        can_view_sensitive: bool,
        prior_snapshot: KycSnapshot | None = None,
        top_k_per_workstream: int | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        document_chunks = self._document_chunks(source_documents, can_view_sensitive=can_view_sensitive)
        platform_chunks = self._platform_chunks(account, current_user=current_user, can_view_sensitive=can_view_sensitive, prior_snapshot=prior_snapshot)
        all_chunks = document_chunks + platform_chunks
        if not all_chunks:
            return {}

        requested_workstreams = workstreams or [{"key": "general", "title": "General KYC"}]
        top_k = self._top_k_per_workstream(top_k_per_workstream)
        contexts_by_workstream: dict[str, list[dict[str, Any]]] = {}
        for workstream in requested_workstreams:
            workstream_key = str(workstream.get("key") or "general")
            query = self._query_for_workstream(workstream)
            query_vector = self._safe_embed([query])[0] if self.settings.ai_kyc_use_embeddings else None
            ranked = sorted(
                ((self._rank_context(item, query=query, query_vector=query_vector), index, item) for index, item in enumerate(all_chunks)),
                key=lambda pair: (pair[0], -pair[1]),
                reverse=True,
            )
            contexts: list[dict[str, Any]] = []
            for rank, (score, _, item) in enumerate(ranked[:top_k], start=1):
                context = dict(item)
                context["retrieval_query"] = query
                context["retrieval_score"] = round(float(score), 4)
                context["retrieval_rank"] = rank
                context["matched_workstreams"] = [workstream_key]
                context["rank_reason"] = self._rank_reason(context, query=query, query_vector=query_vector)
                contexts.append(context)
            contexts_by_workstream[workstream_key] = contexts
        return contexts_by_workstream

    def _document_chunks(self, source_documents: list[SourceDocument], *, can_view_sensitive: bool) -> list[dict[str, Any]]:
        contexts: list[dict[str, Any]] = []
        chunks_needing_embeddings: list[SourceDocumentChunk] = []
        for document in source_documents:
            if document.is_sensitive and not can_view_sensitive:
                continue
            chunks = self.extraction.ensure_chunks(document)
            for chunk in chunks:
                if self._chunk_restricted(chunk, document=document) and not can_view_sensitive:
                    continue
                if self.settings.ai_kyc_use_embeddings and not chunk.embedding_json:
                    chunks_needing_embeddings.append(chunk)
        self._embed_chunks(chunks_needing_embeddings)
        for document in source_documents:
            if document.is_sensitive and not can_view_sensitive:
                continue
            for chunk in self.extraction.chunks_for_document(document.id):
                if self._chunk_restricted(chunk, document=document) and not can_view_sensitive:
                    continue
                contexts.append(
                    {
                        "source_type": "source_document",
                        "source_document_id": document.id,
                        "source_chunk_id": chunk.id,
                        "source_record_id": document.id,
                        "label": document.title,
                        "source_kind": document.source_type,
                        "page_number": chunk.page_number,
                        "section_label": chunk.section_label,
                        "sensitivity_level": chunk.sensitivity_level,
                        "excerpt": chunk.chunk_text[:800],
                        "text": chunk.chunk_text,
                        "trust_score": chunk.trust_score,
                        "confidence": document.confidence,
                        "restricted": self._chunk_restricted(chunk, document=document),
                        "source_route": f"/accounts/{document.account_id}?tab=documents" if document.account_id else None,
                        "token_count": chunk.token_count,
                        "embedding": chunk.embedding_json,
                        "metadata": chunk.metadata_json,
                        "created_at": chunk.created_at or document.created_at,
                    }
                )
        return contexts

    def _embed_chunks(self, chunks: list[SourceDocumentChunk]) -> None:
        if not chunks:
            return
        vectors = self._safe_embed([chunk.chunk_text for chunk in chunks])
        for chunk, vector in zip(chunks, vectors, strict=False):
            chunk.embedding_provider = self.embedding_client.provider
            chunk.embedding_model = self.embedding_client.model
            chunk.embedding_json = vector
            chunk.embedding_hash = hashlib.sha256(chunk.chunk_text.encode("utf-8")).hexdigest()
        self.db.flush()

    def _safe_embed(self, texts: list[str]) -> list[list[float]]:
        try:
            return self.embedding_client.embed(texts)
        except Exception:
            if self.embedding_client.provider == "local_hash":
                raise
            from app.services.kyc_embeddings import LocalHashEmbeddingClient

            fallback = LocalHashEmbeddingClient()
            return fallback.embed(texts)

    def _platform_chunks(self, account: Account, *, current_user: User, can_view_sensitive: bool, prior_snapshot: KycSnapshot | None) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        account_text = "\n".join(
            value
            for value in (
                f"Account: {account.name}",
                f"Segment: {account.segment}",
                f"Region: {account.region or 'unknown'}",
                f"Lifecycle: {account.lifecycle_status}",
                f"Service context: {account.service_context or ''}",
                f"Initial notes: {account.initial_notes or ''}",
                f"Commercial summary: {account.commercial_summary or ''}" if can_view_sensitive else "",
            )
            if value.strip()
        )
        if account_text.strip():
            chunks.append(self._platform_context("account", account.id, "Account profile", account_text, 85, f"/accounts/{account.id}", created_at=account.created_at))

        for engagement in account.engagements:
            text = "\n".join(
                value
                for value in (
                    f"Engagement: {engagement.name}",
                    f"Status: {engagement.status}",
                    f"Service lines: {', '.join(engagement.service_lines or [])}",
                    f"Delivery status: {engagement.delivery_status}",
                    f"Commercial status: {engagement.commercial_status}" if can_view_sensitive else "",
                    f"Renewal date: {engagement.renewal_date.isoformat() if engagement.renewal_date else 'unknown'}",
                    f"Notice deadline: {engagement.notice_deadline.isoformat() if engagement.notice_deadline else 'unknown'}",
                    f"Commercial context: {engagement.commercial_context or ''}" if can_view_sensitive else "",
                    f"Risks: {', '.join(engagement.risks or [])}",
                    f"Source citation: {engagement.source_citation or ''}",
                )
                if value.strip()
            )
            chunks.append(
                self._platform_context(
                    "engagement",
                    engagement.id,
                    f"Engagement: {engagement.name}",
                    text,
                    95,
                    f"/accounts/{account.id}?tab=engagement",
                    created_at=engagement.created_at,
                    restricted=not can_view_sensitive and ("Commercial status:" in text or "Commercial context:" in text),
                )
            )

        for entry in self._timeline_entries(account.id):
            if entry.is_sensitive and not can_view_sensitive:
                continue
            text = f"{entry.title}\n{entry.description}\nModule: {entry.module}\nEvent type: {entry.event_type}"
            chunks.append(
                self._platform_context(
                    "timeline",
                    entry.id,
                    entry.title,
                    text,
                    80,
                    entry.source_record_route or f"/accounts/{account.id}?tab=timeline",
                    restricted=entry.is_sensitive,
                    sensitivity_level=entry.sensitivity_level,
                    created_at=entry.event_at,
                )
            )

        for item in self._reviewed_fathom_items(account.id):
            text = f"{item.title}\n{item.description or ''}\nPayload: {self._payload_summary(item.sanitized_payload_json)}"
            chunks.append(self._platform_context("fathom", item.id, f"Fathom: {item.title}", text, 70, item.source_link, created_at=item.occurred_at or item.created_at))

        if prior_snapshot:
            text = "\n".join(f"{field.get('label') or field.get('key')}: {field.get('value')}" for field in prior_snapshot.fields_json if field.get("value"))
            chunks.append(self._platform_context("prior_snapshot", prior_snapshot.id, f"KYC snapshot v{prior_snapshot.version}", text, 90, f"/accounts/{account.id}?tab=kyc", created_at=prior_snapshot.approved_at or prior_snapshot.created_at))

        if self.settings.ai_kyc_use_embeddings and chunks:
            vectors = self._safe_embed([chunk["text"] for chunk in chunks])
            for chunk, vector in zip(chunks, vectors, strict=False):
                chunk["embedding"] = vector
        return chunks

    def _timeline_entries(self, account_id: str) -> list[TimelineEntry]:
        return list(
            self.db.scalars(
                select(TimelineEntry)
                .where(TimelineEntry.account_id == account_id, TimelineEntry.deleted_at.is_(None))
                .order_by(TimelineEntry.event_at.desc())
                .limit(100)
            )
        )

    def _reviewed_fathom_items(self, account_id: str) -> list[IntegrationImportedItem]:
        return list(
            self.db.scalars(
                select(IntegrationImportedItem)
                .where(
                    IntegrationImportedItem.provider == "fathom",
                    IntegrationImportedItem.account_id == account_id,
                    IntegrationImportedItem.review_status == "approved",
                )
                .order_by(IntegrationImportedItem.occurred_at.desc().nullslast(), IntegrationImportedItem.created_at.desc())
                .limit(50)
            )
        )

    @staticmethod
    def _payload_summary(payload: dict[str, Any]) -> str:
        parts = []
        for key in ("summary", "action_items", "participants", "decisions", "topics"):
            value = payload.get(key)
            if value:
                parts.append(f"{key}: {value}")
        return "\n".join(parts)[:2000]

    @staticmethod
    def _platform_context(
        source_type: str,
        record_id: str,
        label: str,
        text: str,
        trust_score: int,
        route: str | None,
        *,
        restricted: bool = False,
        sensitivity_level: str | None = None,
        created_at: datetime | None = None,
    ) -> dict[str, Any]:
        return {
            "source_type": source_type,
            "source_record_id": record_id,
            "label": label,
            "excerpt": text[:800],
            "text": text,
            "trust_score": trust_score,
            "confidence": trust_score,
            "restricted": restricted,
            "sensitivity_level": sensitivity_level or ("sensitive" if restricted else "standard"),
            "source_route": route,
            "token_count": estimate_tokens(text),
            "embedding": None,
            "metadata": {},
            "created_at": created_at,
        }

    @staticmethod
    def _query_for_workstreams(workstreams: list[dict[str, Any]]) -> str:
        base_terms = [
            "market research client company stakeholder engagement SOW contract renewal financial landscape",
            "obligations billing payment delivery governance notes Fathom action items timeline",
        ]
        return " ".join(base_terms + [f"{item.get('title', '')} {item.get('key', '')}" for item in workstreams])

    @staticmethod
    def _query_for_workstream(workstream: dict[str, Any]) -> str:
        key = str(workstream.get("key") or "").strip().lower()
        title = str(workstream.get("title") or "").strip()
        hints = WORKSTREAM_QUERY_HINTS.get(key, [])
        return " ".join([title, key.replace("_", " "), *hints]).strip() or KycRetrievalService._query_for_workstreams([workstream])

    @staticmethod
    def _rank_context(item: dict[str, Any], *, query: str, query_vector: list[float] | None) -> float:
        text = str(item.get("text") or "").lower()
        section_label = str(item.get("section_label") or item.get("label") or "").lower()
        terms = {term.strip().lower() for term in query.split() if len(term.strip()) > 3}
        keyword_score = sum(1 for term in terms if term in text)
        section_score = sum(1 for term in terms if term in section_label) * 2
        vector_score = cosine_similarity(item.get("embedding"), query_vector) * 25 if query_vector else 0
        trust = float(item.get("trust_score") or source_trust_score(str(item.get("source_kind") or item.get("source_type") or "")))
        recency_bonus = 0.0
        created_at = item.get("created_at")
        if isinstance(created_at, datetime):
            recency_bonus = 2.0
        return trust + keyword_score + section_score + vector_score + recency_bonus

    @staticmethod
    def _rank_reason(item: dict[str, Any], *, query: str, query_vector: list[float] | None) -> dict[str, Any]:
        text = str(item.get("text") or "").lower()
        section_label = str(item.get("section_label") or item.get("label") or "").lower()
        terms = sorted({term.strip().lower() for term in query.split() if len(term.strip()) > 3})
        matched_terms = [term for term in terms if term in text or term in section_label][:12]
        return {
            "matched_terms": matched_terms,
            "vector_similarity": round(cosine_similarity(item.get("embedding"), query_vector), 4) if query_vector else None,
            "trust_score": item.get("trust_score"),
            "source_type": item.get("source_type"),
            "source_kind": item.get("source_kind"),
            "section_label": item.get("section_label"),
            "restricted": bool(item.get("restricted")),
        }

    def _top_k_per_workstream(self, configured: int | None = None) -> int:
        value = configured if configured is not None else self.settings.ai_kyc_retrieval_top_k
        return min(10, max(1, int(value or 10)))

    @staticmethod
    def _chunk_restricted(chunk: SourceDocumentChunk, *, document: SourceDocument) -> bool:
        sensitivity = str(chunk.sensitivity_level or "").strip().lower()
        return bool(document.is_sensitive or sensitivity in SENSITIVE_CONTEXT_LEVELS)

    @staticmethod
    def _context_identity(item: dict[str, Any]) -> str:
        if item.get("source_chunk_id"):
            return f"chunk:{item['source_chunk_id']}"
        if item.get("source_document_id") and item.get("page_number") and item.get("section_label"):
            return f"doc-section:{item['source_document_id']}:{item['page_number']}:{item['section_label']}"
        return f"{item.get('source_type')}:{item.get('source_record_id')}:{item.get('label')}:{str(item.get('excerpt') or item.get('text') or '')[:80]}"

    def _flatten_workstream_contexts(self, contexts_by_workstream: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for workstream_key, contexts in contexts_by_workstream.items():
            for context in contexts:
                identity = self._context_identity(context)
                if identity not in merged:
                    merged[identity] = dict(context)
                    merged[identity]["matched_workstreams"] = list(dict.fromkeys(context.get("matched_workstreams") or [workstream_key]))
                    continue
                existing = merged[identity]
                existing["matched_workstreams"] = list(
                    dict.fromkeys([*existing.get("matched_workstreams", []), *(context.get("matched_workstreams") or [workstream_key])])
                )
                if float(context.get("retrieval_score") or 0) > float(existing.get("retrieval_score") or 0):
                    for key in ("retrieval_query", "retrieval_score", "retrieval_rank", "rank_reason"):
                        existing[key] = context.get(key)
        return sorted(merged.values(), key=lambda item: float(item.get("retrieval_score") or 0), reverse=True)
