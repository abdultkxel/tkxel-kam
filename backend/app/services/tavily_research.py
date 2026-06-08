from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from app.config import get_settings
from app.models import Account, SourceDocument
from app.services.kyc_debug_logging import log_kyc_verbose, log_kyc_verbose_text
from app.services.kyc_document_extraction import estimate_tokens

logger = logging.getLogger(__name__)

BLOCKED_RESEARCH_DOMAINS = {
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
}


@dataclass(frozen=True)
class KycResearchContext:
    source_type: str
    source_record_id: str
    label: str
    text: str
    excerpt: str
    source_route: str | None = None
    confidence: int = 62
    trust_score: int = 62
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_retrieval_context(self) -> dict[str, Any]:
        return {
            "source_type": self.source_type,
            "source_record_id": self.source_record_id,
            "label": self.label,
            "excerpt": self.excerpt,
            "text": self.text,
            "trust_score": self.trust_score,
            "confidence": self.confidence,
            "restricted": False,
            "source_route": self.source_route,
            "token_count": estimate_tokens(self.text),
            "embedding": None,
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class KycResearchResult:
    contexts: list[KycResearchContext] = field(default_factory=list)
    queries: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None

    def retrieval_contexts(self) -> list[dict[str, Any]]:
        return [context.to_retrieval_context() for context in self.contexts]


@dataclass(frozen=True)
class KycResearchSummary:
    summary_markdown: str
    sources: list[dict[str, Any]] = field(default_factory=list)
    confidence: int = 0
    missing_evidence_notes: list[str] = field(default_factory=list)
    follow_up_questions: list[str] = field(default_factory=list)
    model: str | None = None
    provider: str = "ollama"
    metadata: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


class KycResearchProvider(Protocol):
    name: str

    def research(
        self,
        *,
        account: Account,
        source_documents: list[SourceDocument],
        retrieved_context: list[dict[str, Any]],
        custom_query: str | None = None,
    ) -> KycResearchResult:
        """Return source-backed research contexts for KYC enrichment."""


class TavilyKycResearchProvider:
    name = "tavily"

    def __init__(self) -> None:
        self.settings = get_settings()

    def research(
        self,
        *,
        account: Account,
        source_documents: list[SourceDocument],
        retrieved_context: list[dict[str, Any]],
        custom_query: str | None = None,
    ) -> KycResearchResult:
        if not self.settings.tavily_api_key:
            return KycResearchResult(metadata={"provider": self.name, "enabled": True}, error_message="Tavily API key is not configured")
        started = time.monotonic()
        queries = self._queries(account=account, source_documents=source_documents, retrieved_context=retrieved_context, custom_query=custom_query)
        contexts: list[KycResearchContext] = []
        search_payloads: list[dict[str, Any]] = []
        for query in queries:
            payload = self._search(query)
            search_payloads.append(payload)
            contexts.extend(self._contexts_from_search(account=account, query=query, payload=payload))
        contexts = self._dedupe_contexts(contexts)
        if self.settings.tavily_extract_enabled and contexts:
            contexts = self._merge_extract_content(contexts)
        contexts = contexts[: max(1, self.settings.tavily_max_results)]
        metadata = {
            "provider": self.name,
            "enabled": True,
            "query_count": len(queries),
            "source_count": len(contexts),
            "blocked_domains": sorted(self._blocked_domains()),
            "custom_query": self._clean_query(custom_query),
            "latency_ms": round((time.monotonic() - started) * 1000),
            "request_ids": [payload.get("request_id") for payload in search_payloads if payload.get("request_id")],
        }
        log_kyc_verbose(logger, self.settings, "tavily_kyc_research.complete", metadata)
        return KycResearchResult(contexts=contexts, queries=queries, metadata=metadata)

    def _search(self, query: str) -> dict[str, Any]:
        body: dict[str, Any] = {
            "query": query,
            "search_depth": self.settings.tavily_search_depth,
            "max_results": self.settings.tavily_max_results,
            "include_answer": self.settings.tavily_include_answer,
            "include_raw_content": self.settings.tavily_include_raw_content,
            "include_images": self.settings.tavily_include_images,
            "exclude_domains": sorted(self._blocked_domains()),
        }
        include_domains = self._domain_list(self.settings.tavily_include_domains)
        if include_domains:
            body["include_domains"] = include_domains
        return self._post_json(self.settings.tavily_search_endpoint, body)

    def _extract(self, urls: list[str]) -> dict[str, Any]:
        if not urls:
            return {}
        body = {
            "urls": urls[:20],
            "include_images": False,
            "include_favicon": True,
            "extract_depth": self.settings.tavily_extract_depth,
            "format": self.settings.tavily_extract_format,
            "timeout": min(max(self.settings.tavily_timeout_seconds, 1), 60),
        }
        return self._post_json(self.settings.tavily_extract_endpoint, body)

    def _post_json(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.settings.tavily_base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        encoded = json.dumps(body).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.settings.tavily_api_key}",
        }
        attempt = 0
        last_error: Exception | None = None
        while attempt <= self.settings.tavily_max_retries:
            attempt += 1
            try:
                request = UrlRequest(url, data=encoded, headers=headers, method="POST")
                with urlopen(request, timeout=self.settings.tavily_timeout_seconds) as response:  # noqa: S310 - configured first-party API URL
                    response_body = response.read().decode("utf-8")
                payload = json.loads(response_body or "{}")
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "tavily_kyc_research.http_success",
                    {"endpoint": endpoint, "attempt": attempt, "body": {**body, "query": body.get("query")}},
                )
                return payload if isinstance(payload, dict) else {}
            except HTTPError as exc:
                last_error = exc
                if exc.code not in {429, 500, 502, 503, 504} or attempt > self.settings.tavily_max_retries:
                    raise RuntimeError(self._http_error_message(exc)) from exc
            except (URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt > self.settings.tavily_max_retries:
                    raise RuntimeError(f"Tavily request failed: {exc}") from exc
            time.sleep(self.settings.tavily_retry_backoff_seconds * attempt)
        raise RuntimeError(f"Tavily request failed: {last_error}")

    @staticmethod
    def _http_error_message(exc: HTTPError) -> str:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")[:300]
        except Exception:  # pragma: no cover - defensive only
            detail = ""
        if exc.code == 401:
            return "Tavily API key is invalid or unauthorized"
        if exc.code == 429:
            return "Tavily quota or rate limit was reached"
        return f"Tavily request failed with HTTP {exc.code}: {detail}".strip()

    def _queries(
        self,
        *,
        account: Account,
        source_documents: list[SourceDocument],
        retrieved_context: list[dict[str, Any]],
        custom_query: str | None = None,
    ) -> list[str]:
        company = self._research_target(account=account, source_documents=source_documents, retrieved_context=retrieved_context)
        cleaned_custom_query = self._clean_query(custom_query)
        terms = (
            [cleaned_custom_query]
            if cleaned_custom_query
            else [
                f"{company} official website company profile",
                f"{company} products services digital strategy",
                f"{company} recent news press release blog",
                f"{company} annual report revenue headquarters leadership",
            ]
        )
        seen: set[str] = set()
        queries: list[str] = []
        for term in terms:
            key = term.lower()
            if key in seen:
                continue
            seen.add(key)
            queries.append(term)
        return queries[: max(1, min(len(queries), self.settings.tavily_per_run_credit_limit))]

    @staticmethod
    def _clean_query(value: str | None) -> str | None:
        text = " ".join(str(value or "").split())
        return text[:240] if text else None

    @staticmethod
    def _research_target(*, account: Account, source_documents: list[SourceDocument], retrieved_context: list[dict[str, Any]]) -> str:
        for document in source_documents:
            for extraction in getattr(document, "extractions", []):
                metadata = extraction.metadata_json or {}
                structured = metadata.get("structured_sow_extraction") or metadata.get("structured_document_extraction") or {}
                fields = structured.get("fields") if isinstance(structured, dict) else {}
                client = fields.get("client_name") if isinstance(fields, dict) else None
                if isinstance(client, dict) and str(client.get("value") or "").strip():
                    return str(client["value"]).strip()[:160]
        for context in retrieved_context:
            metadata = context.get("metadata") if isinstance(context, dict) else None
            if isinstance(metadata, dict) and metadata.get("client_name"):
                return str(metadata["client_name"]).strip()[:160]
        return str(account.name).strip()[:160]

    def _contexts_from_search(self, *, account: Account, query: str, payload: dict[str, Any]) -> list[KycResearchContext]:
        results = payload.get("results") or []
        contexts: list[KycResearchContext] = []
        for rank, item in enumerate(results, start=1):
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            if self._is_blocked_url(url):
                continue
            title = str(item.get("title") or url or "Tavily search result").strip()
            raw_content = str(item.get("raw_content") or "").strip()
            content = raw_content or str(item.get("content") or item.get("snippet") or "").strip()
            if not content:
                continue
            score = self._trust_score(account, url, rank, item)
            text = self._compact_text(content)
            contexts.append(
                KycResearchContext(
                    source_type="web_research",
                    source_record_id=self._record_id(account.id, url or f"{title}:{query}"),
                    label=title[:255],
                    text=text[:12000],
                    excerpt=text[:1200],
                    source_route=url or None,
                    confidence=score,
                    trust_score=score,
                    metadata={
                        "provider": self.name,
                        "query": query,
                        "rank": rank,
                        "score": item.get("score"),
                        "published_date": item.get("published_date"),
                        "favicon": item.get("favicon"),
                    },
                )
            )
        return contexts

    def _merge_extract_content(self, contexts: list[KycResearchContext]) -> list[KycResearchContext]:
        urls = [context.source_route for context in contexts if context.source_route and not self._is_blocked_url(context.source_route)]
        payload = self._extract(list(dict.fromkeys(urls))[: self.settings.tavily_max_results])
        extracted = {
            str(item.get("url")): item
            for item in payload.get("results") or []
            if isinstance(item, dict) and item.get("url")
        }
        merged: list[KycResearchContext] = []
        for context in contexts:
            item = extracted.get(context.source_route or "")
            if not item:
                merged.append(context)
                continue
            raw_content = self._compact_text(str(item.get("raw_content") or ""))
            if not raw_content:
                merged.append(context)
                continue
            metadata = {**context.metadata, "extract_provider": self.name, "favicon": item.get("favicon")}
            merged.append(
                KycResearchContext(
                    source_type=context.source_type,
                    source_record_id=context.source_record_id,
                    label=context.label,
                    text=raw_content[:16000],
                    excerpt=raw_content[:1200],
                    source_route=context.source_route,
                    confidence=context.confidence,
                    trust_score=context.trust_score,
                    metadata=metadata,
                )
            )
        return merged

    @staticmethod
    def _dedupe_contexts(contexts: list[KycResearchContext]) -> list[KycResearchContext]:
        seen: set[str] = set()
        deduped: list[KycResearchContext] = []
        for context in contexts:
            key = context.source_route or context.source_record_id
            if key in seen:
                continue
            seen.add(key)
            deduped.append(context)
        return sorted(deduped, key=lambda item: item.trust_score, reverse=True)

    def _blocked_domains(self) -> set[str]:
        return BLOCKED_RESEARCH_DOMAINS | set(self._domain_list(self.settings.tavily_exclude_domains))

    @staticmethod
    def _domain_list(value: str) -> list[str]:
        return [item.strip().lower().removeprefix("www.") for item in str(value or "").split(",") if item.strip()]

    def _is_blocked_url(self, url: str) -> bool:
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        if not domain:
            return False
        return any(domain == blocked or domain.endswith(f".{blocked}") for blocked in self._blocked_domains())

    @staticmethod
    def _trust_score(account: Account, url: str, rank: int, item: dict[str, Any]) -> int:
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        company_url = urlparse(str(account.company_url or "")).netloc.lower().removeprefix("www.")
        score = 70 - min(rank * 3, 18)
        if company_url and (domain == company_url or domain.endswith(f".{company_url}")):
            score += 20
        if any(token in domain for token in ("news", "reuters", "bloomberg", "forbes", "businesswire", "prnewswire")):
            score += 8
        if item.get("score"):
            try:
                score += min(8, round(float(item["score"]) * 8))
            except (TypeError, ValueError):
                pass
        return max(35, min(95, score))

    @staticmethod
    def _record_id(account_id: str, value: str) -> str:
        digest = hashlib.sha256(f"{account_id}:tavily:{value}".encode("utf-8")).hexdigest()[:32]
        return f"tavily-{digest}"

    @staticmethod
    def _compact_text(value: str) -> str:
        return " ".join(value.split())


class OllamaKycResearchSummarizer:
    name = "ollama-research-summarizer"

    def __init__(self) -> None:
        self.settings = get_settings()

    def summarize(self, *, account: Account, research_result: KycResearchResult, internal_context: list[dict[str, Any]]) -> KycResearchSummary:
        if not research_result.contexts:
            return KycResearchSummary(summary_markdown="", error_message=research_result.error_message or "No Tavily sources were available")
        prompt = self._prompt(account=account, research_result=research_result, internal_context=internal_context)
        log_kyc_verbose(
            logger,
            self.settings,
            "ollama_kyc_research_summarizer.start",
            {
                "account_id": account.id,
                "account_name": account.name,
                "model": self.settings.ai_kyc_research_summarizer_model,
                "prompt_tokens_estimate": estimate_tokens(prompt),
                "source_count": len(research_result.contexts),
            },
        )
        log_kyc_verbose_text(logger, self.settings, "ollama_kyc_research_summarizer.prompt", prompt)
        try:
            content, metadata = self._call_local_model(prompt)
            log_kyc_verbose_text(logger, self.settings, "ollama_kyc_research_summarizer.raw_response", content)
            parsed = self._parse_summary(content)
            return KycResearchSummary(
                summary_markdown=parsed["summary_markdown"],
                sources=parsed["sources"],
                confidence=parsed["confidence"],
                missing_evidence_notes=parsed["missing_evidence_notes"],
                follow_up_questions=parsed["follow_up_questions"],
                model=self.settings.ai_kyc_research_summarizer_model,
                provider=self.settings.ai_kyc_research_summarizer_provider,
                metadata=metadata,
            )
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.exception("Local KYC research summarizer failed for account %s", account.id)
            fallback = self._fallback_summary(account=account, research_result=research_result, error_message=str(exc))
            return fallback

    def _call_local_model(self, prompt: str) -> tuple[str, dict[str, Any]]:
        base_url = self.settings.ai_kyc_research_summarizer_base_url.rstrip("/")
        url = f"{base_url}/chat/completions"
        body = {
            "model": self.settings.ai_kyc_research_summarizer_model,
            "messages": [
                {
                    "role": "system",
                    "content": "You summarize Tavily search results for KYC. Return JSON only. Do not invent facts.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": self.settings.ai_kyc_research_summarizer_max_output_tokens,
            "temperature": self.settings.ai_kyc_research_summarizer_temperature,
            "stream": False,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.settings.ai_kyc_api_key or 'local-demo'}",
        }
        request = UrlRequest(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        started = time.monotonic()
        with urlopen(request, timeout=self.settings.ai_kyc_research_summarizer_timeout_seconds) as response:  # noqa: S310 - configured local model URL
            payload = json.loads(response.read().decode("utf-8") or "{}")
        content = ""
        choices = payload.get("choices") or []
        if choices and isinstance(choices[0], dict):
            message = choices[0].get("message") or {}
            content = str(message.get("content") or "")
        if not content.strip():
            raise RuntimeError("Local summarizer returned an empty response")
        metadata = {
            "latency_ms": round((time.monotonic() - started) * 1000),
            "usage": payload.get("usage") or {},
            "response_id": payload.get("id"),
        }
        return content, metadata

    def _prompt(self, *, account: Account, research_result: KycResearchResult, internal_context: list[dict[str, Any]]) -> str:
        sources = [
            {
                "title": context.label,
                "url": context.source_route,
                "excerpt": context.excerpt[:1200],
                "confidence": context.confidence,
                "metadata": context.metadata,
            }
            for context in research_result.contexts[: self.settings.tavily_max_results]
        ]
        internal = [
            {
                "source_type": item.get("source_type"),
                "label": item.get("label"),
                "excerpt": str(item.get("text") or item.get("excerpt") or "")[:800],
            }
            for item in internal_context[:6]
        ]
        payload = {
            "account": {
                "id": account.id,
                "name": account.name,
                "company_url": account.company_url,
                "segment": account.segment,
                "region": account.region,
                "service_context": account.service_context,
            },
            "tavily_queries": research_result.queries,
            "tavily_sources": sources,
            "internal_context": internal,
        }
        return (
            "You are a KYC web research summarizer for a Key Account Management platform.\n"
            "Use only the supplied Tavily search results and internal context. Do not invent facts.\n"
            "Do not scrape Google directly. Do not scrape or cite LinkedIn.\n"
            "If evidence is weak or missing, state missing evidence clearly.\n"
            "Return JSON only with this shape: summary_markdown, sources, confidence, missing_evidence_notes, follow_up_questions.\n"
            "summary_markdown should be detailed and sectioned for KYC: company profile, industry/market, products/services, history/evolution, leadership/stakeholders if available, clients/segments, monetization, recent news/posts/blogs, risks, follow-up questions.\n"
            "Every important factual claim in summary_markdown must include source title or URL in parentheses.\n"
            f"Payload:\n{json.dumps(payload, default=str)}"
        )

    @staticmethod
    def _parse_summary(content: str) -> dict[str, Any]:
        raw = content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start : end + 1]
        data = json.loads(raw)
        summary = str(data.get("summary_markdown") or data.get("summary") or "").strip()
        if not summary:
            raise RuntimeError("Local summarizer JSON did not include summary_markdown")
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        missing = data.get("missing_evidence_notes") if isinstance(data.get("missing_evidence_notes"), list) else []
        questions = data.get("follow_up_questions") if isinstance(data.get("follow_up_questions"), list) else []
        confidence = int(data.get("confidence") or 65)
        return {
            "summary_markdown": summary,
            "sources": [item for item in sources if isinstance(item, dict)][:20],
            "confidence": max(0, min(100, confidence)),
            "missing_evidence_notes": [str(item) for item in missing if str(item).strip()][:20],
            "follow_up_questions": [str(item) for item in questions if str(item).strip()][:20],
        }

    def _fallback_summary(self, *, account: Account, research_result: KycResearchResult, error_message: str) -> KycResearchSummary:
        parts = [
            f"## Tavily Web Research For {account.name}",
            f"Local summarizer failed, so this fallback lists source-backed Tavily context for human review. Error: {error_message}",
        ]
        sources: list[dict[str, Any]] = []
        for index, context in enumerate(research_result.contexts[: self.settings.tavily_max_results], start=1):
            route = f" ({context.source_route})" if context.source_route else ""
            parts.append(f"### {index}. {context.label}{route}\n{context.excerpt}")
            sources.append(
                {
                    "title": context.label,
                    "url": context.source_route,
                    "excerpt": context.excerpt,
                    "confidence": context.confidence,
                }
            )
        return KycResearchSummary(
            summary_markdown="\n\n".join(parts),
            sources=sources,
            confidence=45,
            missing_evidence_notes=["Local summarizer failed; reviewer should validate source list manually."],
            follow_up_questions=["Should the account owner validate the Tavily source list before approving KYC?"],
            model=self.settings.ai_kyc_research_summarizer_model,
            provider=self.settings.ai_kyc_research_summarizer_provider,
            metadata={"fallback": True, "error_message": error_message},
            error_message=error_message,
        )
