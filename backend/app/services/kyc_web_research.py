from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings
from app.models import Account, SourceDocument
from app.services.kyc_debug_logging import log_kyc_verbose, log_kyc_verbose_text
from app.services.kyc_document_extraction import estimate_tokens
from app.services.source_document_contract import STRUCTURED_SOW_METADATA_KEY
from app.services.tavily_research import TavilyKycResearchProvider

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class KycWebResearchResult:
    contexts: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


class KycWebResearchService:
    """Fetch source-cited public web context for KYC using approved provider APIs."""

    def __init__(self) -> None:
        self.settings = get_settings()

    def research(self, *, account: Account, source_documents: list[SourceDocument], retrieved_context: list[dict[str, Any]]) -> KycWebResearchResult:
        if not self.settings.ai_kyc_web_research_enabled:
            return KycWebResearchResult(metadata={"enabled": False})
        if self.settings.ai_kyc_web_research_provider == "tavily":
            return self._tavily_web_research(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
        if self.settings.ai_kyc_web_research_provider != "openai":
            return KycWebResearchResult(metadata={"enabled": True, "provider": self.settings.ai_kyc_web_research_provider}, error_message="Unsupported KYC web research provider")
        if not self.settings.ai_kyc_web_research_api_key:
            return KycWebResearchResult(metadata={"enabled": True, "provider": "openai"}, error_message="OpenAI web research API key is not configured")
        try:
            return self._openai_web_research(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.exception("KYC web research failed for account %s", account.id)
            log_kyc_verbose(logger, self.settings, "kyc_web_research.error", {"account_id": account.id, "error": str(exc)})
            return KycWebResearchResult(
                metadata={"enabled": True, "provider": "openai", "model": self.settings.ai_kyc_web_research_model},
                error_message=str(exc)[:500],
            )

    def _tavily_web_research(self, *, account: Account, source_documents: list[SourceDocument], retrieved_context: list[dict[str, Any]]) -> KycWebResearchResult:
        try:
            result = TavilyKycResearchProvider().research(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
            metadata = {"enabled": True, "provider": "tavily", **dict(result.metadata or {})}
            return KycWebResearchResult(contexts=result.retrieval_contexts(), metadata=metadata, error_message=result.error_message)
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.exception("Tavily KYC web research failed for account %s", account.id)
            log_kyc_verbose(logger, self.settings, "kyc_web_research.tavily.error", {"account_id": account.id, "error": str(exc)})
            return KycWebResearchResult(metadata={"enabled": True, "provider": "tavily"}, error_message=str(exc)[:500])

    def _openai_web_research(self, *, account: Account, source_documents: list[SourceDocument], retrieved_context: list[dict[str, Any]]) -> KycWebResearchResult:
        from openai import OpenAI

        prompt = self._research_prompt(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
        log_kyc_verbose(
            logger,
            self.settings,
            "kyc_web_research.openai.start",
            {
                "account_id": account.id,
                "account_name": account.name,
                "model": self.settings.ai_kyc_web_research_model,
                "context_size": self.settings.ai_kyc_web_research_context_size,
                "prompt_tokens_estimate": estimate_tokens(prompt),
            },
        )
        log_kyc_verbose_text(logger, self.settings, "kyc_web_research.openai.prompt", prompt)
        client = OpenAI(api_key=self.settings.ai_kyc_web_research_api_key, timeout=self.settings.ai_kyc_web_research_timeout_seconds)
        started = time.monotonic()
        response = client.responses.create(
            model=self.settings.ai_kyc_web_research_model,
            tools=[
                {
                    "type": "web_search_preview",
                    "search_context_size": self.settings.ai_kyc_web_research_context_size,
                    "user_location": {"type": "approximate", "country": "US"},
                }
            ],
            input=prompt,
            max_output_tokens=1800,
        )
        response_payload = response.model_dump() if hasattr(response, "model_dump") else {}
        output_text = getattr(response, "output_text", "") or self._text_from_response_payload(response_payload)
        annotations = self._url_citations(response_payload)
        sources = self._sources(response_payload)
        contexts = self._contexts_from_output(account=account, output_text=output_text, annotations=annotations, sources=sources)
        metadata = {
            "enabled": True,
            "provider": "openai",
            "model": self.settings.ai_kyc_web_research_model,
            "latency_ms": round((time.monotonic() - started) * 1000),
            "response_id": getattr(response, "id", None),
            "source_count": len(contexts),
            "usage": response_payload.get("usage") or {},
            "output_text": output_text,
        }
        log_kyc_verbose(logger, self.settings, "kyc_web_research.openai.response_metadata", metadata)
        log_kyc_verbose_text(logger, self.settings, "kyc_web_research.openai.response_text", output_text)
        log_kyc_verbose(logger, self.settings, "kyc_web_research.openai.contexts", contexts)
        return KycWebResearchResult(contexts=contexts, metadata=metadata)

    def _research_prompt(self, *, account: Account, source_documents: list[SourceDocument], retrieved_context: list[dict[str, Any]]) -> str:
        document_summary = [
            {
                "title": document.title,
                "source_type": document.source_type,
                "file_name": document.file_name,
                "extraction_status": document.extraction_status,
                "confidence": document.confidence,
                "document_client_name_hint": self._document_client_name_hint(document),
            }
            for document in source_documents
        ]
        internal_snippets = [
            {
                "source_type": item.get("source_type"),
                "label": item.get("label"),
                "excerpt": str(item.get("text") or item.get("excerpt") or "")[:1200],
            }
            for item in retrieved_context[:8]
        ]
        payload = {
            "account": {
                "name": account.name,
                "document_client_name_hints": self._document_client_name_hints(source_documents),
                "project_name": account.project_name,
                "company_url": account.company_url,
                "segment": account.segment,
                "region": account.region,
                "service_context": account.service_context,
                "initial_notes": account.initial_notes,
            },
            "source_documents": document_summary,
            "internal_snippets": internal_snippets,
        }
        return (
            "Research this customer/account for a KYC profile. Use live public web search.\n"
            "First resolve the most likely client/company name from document_client_name_hints and account.name. Prefer SOW/customer evidence over file names.\n"
            "Search broadly across the company website, product pages, press releases, reputable business/news sites, customer stories, blogs, and public profile pages.\n"
            "Do not use unsupported facts. Do not invent facts. If evidence is weak, label it as inference or missing evidence.\n"
            "Do not scrape LinkedIn; only use accessible public pages surfaced by the search tool.\n"
            "Return a dense source-backed research brief with sections: company profile, industry/market, products and services, history, leadership/stakeholders, clients/segments, monetization, recent news/posts/blogs, risks, and useful follow-up questions.\n"
            "For each important factual claim include source title, URL, date if available, and a short excerpt.\n"
            f"Account payload:\n{json.dumps(payload, default=str)}"
        )

    @staticmethod
    def _document_client_name_hints(source_documents: list[SourceDocument]) -> list[str]:
        hints: list[str] = []
        seen: set[str] = set()
        for document in source_documents:
            hint = KycWebResearchService._document_client_name_hint(document)
            if not hint:
                continue
            key = hint.lower()
            if key in seen:
                continue
            seen.add(key)
            hints.append(hint)
        return hints

    @staticmethod
    def _document_client_name_hint(document: SourceDocument) -> str | None:
        for extraction in document.extractions:
            structured = (extraction.metadata_json or {}).get(STRUCTURED_SOW_METADATA_KEY) or {}
            fields = structured.get("fields") if isinstance(structured, dict) else {}
            client = fields.get("client_name") if isinstance(fields, dict) else None
            if not isinstance(client, dict):
                continue
            value = str(client.get("value") or "").strip()
            confidence = int(client.get("confidence") or 0)
            if value and confidence >= 30:
                return value[:160]
        return None

    def _contexts_from_output(self, *, account: Account, output_text: str, annotations: list[dict[str, Any]], sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        contexts: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        source_items = annotations or sources
        if not source_items and output_text.strip():
            source_items = [{"title": "OpenAI web research", "url": None}]
        for index, source in enumerate(source_items[: max(1, self.settings.ai_kyc_web_research_max_sources)]):
            url = source.get("url")
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            label = source.get("title") or source.get("source") or url or "OpenAI web research"
            text = self._excerpt_for_source(output_text, source, index)
            record_id = self._record_id(account.id, url or label)
            contexts.append(
                {
                    "source_type": "web_research",
                    "source_record_id": record_id,
                    "label": label,
                    "excerpt": text[:1000],
                    "text": text,
                    "trust_score": 62,
                    "confidence": 62,
                    "restricted": False,
                    "source_route": url,
                    "token_count": estimate_tokens(text),
                    "embedding": None,
                    "metadata": {"url": url, "provider": "openai", "annotation": source},
                }
            )
        return contexts

    @staticmethod
    def _record_id(account_id: str, value: str) -> str:
        digest = hashlib.sha256(f"{account_id}:{value}".encode("utf-8")).hexdigest()[:32]
        return f"web-{digest}"

    @staticmethod
    def _excerpt_for_source(output_text: str, source: dict[str, Any], index: int) -> str:
        title = str(source.get("title") or source.get("source") or source.get("url") or "Web research source")
        url = str(source.get("url") or "")
        excerpt = str(source.get("excerpt") or source.get("snippet") or "")
        if excerpt:
            return f"{title}\n{url}\n{excerpt}".strip()
        return f"{title}\n{url}\n{output_text[:3500]}".strip() if index == 0 else f"{title}\n{url}\n{output_text[:1600]}".strip()

    @staticmethod
    def _text_from_response_payload(payload: dict[str, Any]) -> str:
        parts: list[str] = []
        for item in payload.get("output") or []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for content in item.get("content") or []:
                if isinstance(content, dict) and content.get("text"):
                    parts.append(str(content["text"]))
        return "\n".join(parts)

    @staticmethod
    def _url_citations(payload: dict[str, Any]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for item in payload.get("output") or []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for content in item.get("content") or []:
                if not isinstance(content, dict):
                    continue
                for annotation in content.get("annotations") or []:
                    if not isinstance(annotation, dict):
                        continue
                    if annotation.get("type") == "url_citation":
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
    def _sources(payload: dict[str, Any]) -> list[dict[str, Any]]:
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
