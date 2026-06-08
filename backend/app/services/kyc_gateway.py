from __future__ import annotations

import json
import logging
import time
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

from app.config import get_settings
from app.services.kyc_debug_logging import log_kyc_verbose, log_kyc_verbose_text
from app.services.kyc_document_extraction import estimate_tokens

logger = logging.getLogger(__name__)


REFERENCE_KYC_STYLE_GUIDE: dict[str, Any] = {
    "source": "requirements/Account Informationn Reference .pdf",
    "purpose": "Use this as a style and depth guide only. Do not copy facts from the reference into another account.",
    "document_shape": [
        "Account name as the first heading.",
        "Industry and Market Overview with bullets or detailed paragraphs.",
        "Company Profile table-style facts: name, founding year, head office, industry, headcount, revenue, services, website, and approved public profile links.",
        "Problems solved and Core Offerings with named products, platforms, and services.",
        "History and Evolution timeline with periods and milestones when source evidence supports them.",
        "Monetization Model, Key Achievements, and Clients or served segments.",
    ],
    "target_sections": [
        "Industry and market overview with drivers, trends, market size, and regulatory context.",
        "Company profile with name, founding year, headquarters, industry, revenue/headcount when supplied, website, and approved public profile links.",
        "Problems solved, core offerings, products/platforms, and service lines.",
        "Company history and evolution with dated milestones when source evidence provides them.",
        "Monetization model, key achievements, clients, and served market segments.",
    ],
    "writing_rules": [
        "Prefer reference-style detailed paragraphs over one-line answers.",
        "Use concrete source-backed data points such as dates, locations, revenue, headcount, products, clients, and market numbers when available.",
        "If evidence is weak or missing, leave the value empty or low-confidence and explain the missing evidence. Do not invent facts.",
        "Every field must be reviewable and source-cited.",
    ],
}

REFERENCE_KYC_OUTPUT_TEMPLATE: dict[str, list[str]] = {
    "market_research": [
        "Industry Overview",
        "Market Trends",
        "Market Size and Growth",
        "Business Drivers",
        "Competitor / Peer Context",
        "Regulatory and Compliance Context",
    ],
    "client_research": [
        "Company Profile",
        "Problems They Are Trying To Solve",
        "Core Offerings",
        "History and Evolution",
        "Monetization Model",
        "Key Achievements",
        "Clients and Market Segments",
        "Digital Products / Platforms",
        "Website and Approved Public Profile Links",
    ],
    "stakeholder_details": [
        "Client Stakeholder Map",
        "Tkxel Stakeholder Map",
    ],
    "tkxel_engagement": [
        "Project Charters / SOW Context",
        "Engagement Model",
        "Obligations / SLAs",
        "Past Engagement Summary",
    ],
    "financial_landscape": [
        "Renewal Cycle",
        "Payment Behaviour",
        "Gross Margins",
        "Billing Models",
    ],
}

FIELD_DETAIL_GUIDANCE: dict[str, str] = {
    "industry_overview": "Write a reference-style industry overview explaining the sector, where the client fits, and why the market matters.",
    "market_trends": "Summarize current trends, technology shifts, buyer behavior, and operating pressures shown by the sources.",
    "market_size_growth": "Capture market size, projected growth, CAGR, or other quantified market indicators when supplied.",
    "business_drivers": "Explain the business drivers creating demand, urgency, or risk for the client.",
    "competitors": "Identify competitor or peer context only when supplied; otherwise describe what evidence is missing.",
    "regulatory": "Describe regulatory, compliance, security, data, or industry-specific obligations with citations.",
    "company_snapshot": "Create a concise executive snapshot of the client and its strategic context.",
    "company_profile": "Capture name, founding year, headquarters, industry, headcount, revenue, website, and approved profile links when supplied.",
    "strategy": "Summarize vision, mission, strategy, transformation priorities, and problems the client is trying to solve.",
    "company_history": "Describe company evolution and dated milestones in chronological order when evidence supports them.",
    "core_offerings": "List and explain the client's main products, services, or solutions.",
    "monetization_model": "Explain how the client appears to make money, including contracts, subscriptions, fees, services, or platform revenue when supplied.",
    "key_achievements": "Capture awards, rankings, growth indicators, partnerships, acquisitions, or notable public milestones.",
    "clients_and_segments": "Summarize customer segments, named clients, verticals, geographies, or franchise/location footprint when supplied.",
    "digital_products": "Describe software platforms, proprietary tools, automation, AI/OCR, integrations, or technology products mentioned in the sources.",
    "website_and_social": "Record website and approved public profile links from source evidence. Do not scrape LinkedIn.",
    "stakeholder_map": "Map executive, commercial, technical, operational, and influencer stakeholders where evidence exists.",
    "technical_landscape": "Summarize architecture, platforms, integrations, technical constraints, and modernization signals.",
}


@dataclass(frozen=True)
class KycGatewayRequest:
    account_context: dict[str, Any]
    source_documents: list[dict[str, Any]]
    prior_snapshot_fields: dict[str, Any]
    research_sources: list[str]
    requester_id: str
    requester_role: str
    trigger_source: str
    can_view_sensitive: bool
    workstreams: list[dict[str, Any]]
    retrieved_context: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class KycGatewayWorkstreamResult:
    workstream_key: str
    title: str
    status: str
    sort_order: int
    output: dict[str, dict[str, Any]] = field(default_factory=dict)
    citations: list[dict[str, Any]] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    confidence: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(frozen=True)
class KycGatewayResponse:
    status: str
    workstreams: list[KycGatewayWorkstreamResult]
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class KycGatewayAdapter(Protocol):
    def run(self, request: KycGatewayRequest) -> KycGatewayResponse:
        """Run KYC extraction/enrichment and return source-backed workstream outputs."""


class KycGatewayConfigurationError(RuntimeError):
    pass


class KycGatewaySchemaError(RuntimeError):
    pass


class DeterministicKycGatewayAdapter:
    """Local gateway adapter used until the real AI/LLM Gateway is connected."""

    name = "deterministic-local"
    requires_retrieval_context = False
    is_async_preferred = False

    def run(self, request: KycGatewayRequest) -> KycGatewayResponse:
        started_at = datetime.now(timezone.utc)
        failures = {source.split(":", 1)[1] for source in request.research_sources if source.lower().startswith("fail:")}
        results: list[KycGatewayWorkstreamResult] = []
        completed = 0
        failed = 0
        for workstream in request.workstreams:
            key = str(workstream["key"])
            is_failed = key in failures
            output = self._workstream_output(request, key)
            citations = self._citations_from_documents(request.source_documents, field_keys=output)
            if is_failed:
                failed += 1
                results.append(
                    KycGatewayWorkstreamResult(
                        workstream_key=key,
                        title=str(workstream["title"]),
                        status="failed",
                        sort_order=int(workstream["sort_order"]),
                        missing_fields=self._missing_labels_for_workstream(request, key),
                        error_message="Research source outage for this workstream.",
                        started_at=started_at,
                        completed_at=datetime.now(timezone.utc),
                    )
                )
                continue
            completed += 1
            results.append(
                KycGatewayWorkstreamResult(
                    workstream_key=key,
                    title=str(workstream["title"]),
                    status="complete",
                    sort_order=int(workstream["sort_order"]),
                    output=output,
                    citations=citations,
                    confidence=self._workstream_confidence(request.source_documents, key),
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                )
            )

        status = "partial" if failed and completed else "failed" if failed else "complete"
        return KycGatewayResponse(
            status=status,
            workstreams=results,
            error_message="One or more KYC workstreams failed." if failed else None,
            metadata={
                "adapter": self.name,
                "request_id": str(uuid4()),
                "trigger_source": request.trigger_source,
                "research_sources": request.research_sources,
                "source_document_ids": [document["id"] for document in request.source_documents],
                "prior_snapshot_fields": sorted(request.prior_snapshot_fields),
                "can_view_sensitive": request.can_view_sensitive,
            },
        )

    def _workstream_output(self, request: KycGatewayRequest, workstream_key: str) -> dict[str, dict[str, Any]]:
        account = request.account_context
        mapping = {
            "market_research": {
                "industry_overview": f"{account['name']} is tracked as a {account['segment']} account in {account.get('region') or 'global'} markets.",
                "market_trends": "AI research should validate buying cycles, technology demand, macro demand drivers, and peer movement before client-facing use.",
                "market_size_growth": "Market size, CAGR, and growth projections require approved source evidence before approval.",
                "business_drivers": "Business drivers should capture demand triggers, compliance pressure, automation needs, growth initiatives, and operational risks from source evidence.",
                "competitors": f"Competitor context for {account['name']} requires public research validation and AM review.",
                "regulatory": "Regulatory and compliance obligations should be confirmed against industry standards, data handling needs, and delivery architecture.",
            },
            "client_research": {
                "company_snapshot": f"{account['name']} account profile includes lifecycle {account['lifecycle_status']}, commercial value {float(account['commercial_value']):,.0f} {account['currency']}, and owner context.",
                "company_profile": f"{account['name']} company profile should include founding year, headquarters, industry, headcount, revenue, website, and approved public profile links when source evidence is available.",
                "strategy": account.get("service_context") or "Strategic priorities should be confirmed with the account owner and latest governance notes.",
                "company_history": "Company history, acquisitions, pivots, and leadership changes require approved research-source validation.",
                "core_offerings": "Core offerings should describe the client's products, services, platforms, and customer problems solved using attached source evidence.",
                "monetization_model": account.get("commercial_summary") or "Monetization model should be inferred only from contracts, SOWs, product notes, or approved research evidence.",
                "key_achievements": "Key achievements should include awards, rankings, partnerships, acquisitions, growth signals, or major milestones when cited evidence exists.",
                "clients_and_segments": "Client segments, named customers, verticals, geographies, or franchise footprint need approved source evidence.",
                "digital_products": "Digital products and platforms should capture proprietary software, automation, AI/OCR, integrations, or tools mentioned in source material.",
                "website_and_social": "Website and approved public profile links must come from supplied source evidence; LinkedIn scraping remains blocked.",
                "stakeholder_map": self._owner_summary(account),
                "technical_landscape": "Technical landscape should capture architecture, integrations, cloud providers, constraints, and legacy dependencies from delivery evidence.",
            },
            "stakeholder_details": {
                "client_stakeholders": "Client stakeholder map needs executive sponsor, economic buyer, technical decision maker, operational POC, commercial owner, and influencer coverage.",
                "tkxel_stakeholders": self._owner_summary(account),
            },
            "tkxel_engagement": {
                "project_charters": self._source_summary(request.source_documents, "project_charter") or "No project charter source is attached yet.",
                "engagement_models": self._engagement_summary(account),
                "obligations": self._source_summary(request.source_documents, "sow") or "SOW obligations, SLAs, escalation procedures, renewal windows, and legal considerations need source citation.",
                "past_engagements": account.get("initial_notes") or "Past engagement outcomes, blockers, escalations, sentiment, and lessons learned should be validated from timeline history.",
            },
            "financial_landscape": {
                "renewal_cycle": self._renewal_summary(account),
                "payment_behaviour": "Payment behavior needs finance confirmation before approval.",
                "gross_margins": "Margin by project and blended account margin require commercial review before sharing.",
                "billing_models": account.get("commercial_summary") or "Billing model should be confirmed from SOW or commercial notes.",
            },
        }
        selected = mapping.get(workstream_key, {})
        confidence = self._workstream_confidence(request.source_documents, workstream_key)
        citations = self._citations_from_documents(request.source_documents)
        return {
            key: {
                "value": value,
                "confidence": confidence,
                "citations": [citation for citation in citations if citation.get("field_key") in {key, None}] or citations[:1],
            }
            for key, value in selected.items()
        }

    @staticmethod
    def _citations_from_documents(source_documents: list[dict[str, Any]], field_keys: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        allowed_keys = set(field_keys or {})
        for document in source_documents:
            for citation in document.get("citations", []):
                field_key = citation.get("field_key")
                if allowed_keys and field_key and field_key not in allowed_keys:
                    continue
                citations.append(
                    {
                        "source_document_id": document["id"],
                        "label": citation.get("label") or document["title"],
                        "page_number": citation.get("page_number"),
                        "excerpt": citation.get("excerpt") or "",
                        "field_key": field_key,
                        "is_sensitive": bool(document.get("is_sensitive")),
                    }
                )
        if not citations:
            citations = [
                {
                    "source_document_id": document["id"],
                    "label": document["title"],
                    "page_number": None,
                    "excerpt": f"{document['source_type'].replace('_', ' ')} source metadata.",
                    "field_key": None,
                    "is_sensitive": bool(document.get("is_sensitive")),
                }
                for document in source_documents
            ]
        return citations

    @staticmethod
    def _workstream_confidence(source_documents: list[dict[str, Any]], workstream_key: str) -> int:
        if not source_documents:
            return 62
        base = round(sum(int(document.get("confidence") or 0) for document in source_documents) / len(source_documents))
        if workstream_key == "financial_landscape" and not any(document.get("source_type") in {"sow", "commercial_note"} for document in source_documents):
            return min(base, 68)
        return max(55, min(95, base))

    @staticmethod
    def _missing_labels_for_workstream(request: KycGatewayRequest, workstream_key: str) -> list[str]:
        return [
            str(field["label"])
            for field in request.account_context.get("field_catalog", [])
            if field.get("workstream_key") == workstream_key
        ]

    @staticmethod
    def _owner_summary(account: dict[str, Any]) -> str:
        owners = [owner for owner in account.get("owners", []) if owner.get("is_active")]
        if not owners:
            return "No active stakeholder or ownership mapping is recorded."
        return "; ".join(f"{owner['ownership_role'].replace('_', ' ')}: {owner['user_name']}" for owner in owners)

    @staticmethod
    def _engagement_summary(account: dict[str, Any]) -> str:
        engagements = account.get("engagements", [])
        if not engagements:
            return "No approved engagement records are attached yet."
        return "; ".join(f"{engagement['name']} ({', '.join(engagement.get('service_lines') or []) or 'service lines pending'})" for engagement in engagements)

    @staticmethod
    def _renewal_summary(account: dict[str, Any]) -> str:
        renewal_dates = sorted(date for date in (engagement.get("renewal_date") for engagement in account.get("engagements", [])) if date)
        if not renewal_dates:
            return "Renewal dates and notice windows need SOW validation."
        return f"Soonest renewal date currently recorded as {renewal_dates[0]}."

    @staticmethod
    def _source_summary(source_documents: list[dict[str, Any]], source_type: str) -> str:
        matched = [document["title"] for document in source_documents if document.get("source_type") == source_type]
        return "; ".join(matched)


class OpenAiKycGatewayAdapter:
    """OpenAI-backed KYC adapter using source-bound context and strict JSON output."""

    name = "openai"
    requires_retrieval_context = True
    is_async_preferred = True

    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.ai_kyc_api_key:
            raise KycGatewayConfigurationError("OpenAI API key is not configured for AI KYC.")

    def run(self, request: KycGatewayRequest) -> KycGatewayResponse:
        started_at = datetime.now(timezone.utc)
        prompt = self._prompt(request)
        input_tokens = estimate_tokens(prompt)
        log_kyc_verbose(
            logger,
            self.settings,
            "openai.run.start",
            {
                "adapter": self.name,
                "model": self.settings.ai_kyc_model,
                "account_id": request.account_context.get("id"),
                "account_name": request.account_context.get("name"),
                "trigger_source": request.trigger_source,
                "workstreams": request.workstreams,
                "source_documents": request.source_documents,
                "research_sources": request.research_sources,
                "retrieved_context_count": len(request.retrieved_context),
                "input_tokens_estimate": input_tokens,
            },
        )
        log_kyc_verbose_text(logger, self.settings, "openai.prompt", prompt)
        if input_tokens > self.settings.ai_kyc_max_input_tokens:
            raise KycGatewayConfigurationError(f"KYC prompt exceeds configured input token limit ({input_tokens} > {self.settings.ai_kyc_max_input_tokens}).")
        estimated_cost = self._estimated_cost(input_tokens)
        max_cost_per_run = float(getattr(self.settings, "ai_kyc_max_cost_per_run_usd", 0) or 0)
        if estimated_cost["estimated_cost_usd"] and max_cost_per_run and estimated_cost["estimated_cost_usd"] > max_cost_per_run:
            raise KycGatewayConfigurationError("KYC run estimated cost exceeds the configured per-run AI budget.")

        response_text, metadata = self._call_openai(prompt)
        log_kyc_verbose(logger, self.settings, "openai.response.metadata", metadata)
        log_kyc_verbose_text(logger, self.settings, "openai.response.raw_text", response_text)
        parsed = self._parse_response(response_text)
        log_kyc_verbose(logger, self.settings, "openai.response.parsed_json", parsed)
        results = self._workstream_results(parsed, request, started_at=started_at)
        failed = sum(1 for item in results if item.status == "failed")
        complete = sum(1 for item in results if item.status == "complete")
        status = "partial" if failed and complete else "failed" if failed else "complete"
        return KycGatewayResponse(
            status=status,
            workstreams=results,
            error_message="One or more OpenAI KYC workstreams failed." if failed else None,
            metadata={
                "adapter": self.name,
                "model": self.settings.ai_kyc_model,
                "provider_response_id": metadata.get("response_id"),
                "usage": metadata.get("usage", {}),
                "cost": estimated_cost,
                "estimated_input_tokens": input_tokens,
                "retrieved_context_count": len(request.retrieved_context),
                "detailed_description": response_text,
                "request_id": str(uuid4()),
            },
        )

    def _prompt(self, request: KycGatewayRequest) -> str:
        field_catalog = request.account_context.get("field_catalog") or []
        context = [
            {
                "source_type": item.get("source_type"),
                "source_record_id": item.get("source_record_id"),
                "source_document_id": item.get("source_document_id"),
                "source_chunk_id": item.get("source_chunk_id"),
                "label": item.get("label"),
                "page_number": item.get("page_number"),
                "section_label": item.get("section_label"),
                "excerpt": item.get("excerpt"),
                "trust_score": item.get("trust_score"),
                "confidence": item.get("confidence"),
                "restricted": item.get("restricted"),
                "source_route": item.get("source_route"),
                "text": item.get("text"),
            }
            for item in request.retrieved_context
        ]
        payload = {
            "account_context": request.account_context,
            "prior_snapshot_fields": request.prior_snapshot_fields,
            "workstreams": request.workstreams,
            "field_catalog": field_catalog,
            "reference_kyc_style_guide": REFERENCE_KYC_STYLE_GUIDE,
            "field_detail_guidance": self._field_detail_guidance_payload(field_catalog),
            "retrieved_context": context,
            "rules": {
                "external_research": "Use only approved retrieved_context records. Some retrieved_context records may be source-cited OpenAI web research.",
                "linkedin": "blocked",
                "only_use_supplied_context": True,
                "require_citations_for_every_field": True,
                "if_evidence_missing": "Return empty value, low confidence, and missing_evidence_note. Do not invent.",
                "sensitive_context_visible_to_requester": request.can_view_sensitive,
                "target_depth": "For supported fields, write reference-style detailed values roughly 80-180 words each. Use compact prose, not a one-line placeholder.",
            },
        }
        return (
            "You are generating source-cited KYC intelligence for a strategic account management platform.\n"
            "Return only valid JSON. Do not wrap in markdown. Do not perform additional web search or use outside knowledge beyond the supplied source payload.\n"
            "Use the Account Information Reference style guide for structure and depth only; never copy its facts into this account.\n"
            "Every field must include value, citations, confidence, missing_evidence_note, conflicts, reviewer_notes, and suggested_follow_up_questions.\n"
            "Citation objects must reference supplied source_document_id, source_chunk_id, or source_record_id.\n"
            "Required JSON shape: {\"status\":\"complete|partial|failed\", \"workstreams\":[{\"workstream_key\":\"...\", \"title\":\"...\", \"status\":\"complete|failed\", \"fields\":[{\"key\":\"...\", \"value\":\"...\", \"citations\":[], \"confidence\":0, \"missing_evidence_note\":\"...\", \"conflicts\":[], \"reviewer_notes\":[], \"suggested_follow_up_questions\":[]}], \"missing_fields\":[], \"conflicts\":[], \"reviewer_notes\":[], \"suggested_follow_up_questions\":[], \"confidence\":0}], \"global_conflicts\":[], \"global_missing_evidence\":[], \"model_metadata\":{}}.\n"
            f"Source payload:\n{json.dumps(payload, default=str)}"
        )

    @staticmethod
    def _field_detail_guidance_payload(field_catalog: list[dict[str, Any]]) -> dict[str, str]:
        return {
            str(field.get("key")): FIELD_DETAIL_GUIDANCE.get(
                str(field.get("key")),
                f"Write a source-backed, reviewable KYC value for {field.get('label') or field.get('key')}.",
            )
            for field in field_catalog
            if field.get("key")
        }

    def _call_openai(self, prompt: str) -> tuple[str, dict[str, Any]]:
        from openai import OpenAI

        client_kwargs: dict[str, Any] = {"api_key": self.settings.ai_kyc_api_key}
        if self.settings.ai_kyc_base_url:
            client_kwargs["base_url"] = self.settings.ai_kyc_base_url
        if self.settings.ai_kyc_organization:
            client_kwargs["organization"] = self.settings.ai_kyc_organization
        if self.settings.ai_kyc_project:
            client_kwargs["project"] = self.settings.ai_kyc_project
        client_kwargs["timeout"] = self.settings.ai_kyc_timeout_seconds
        client = OpenAI(**client_kwargs)
        last_error: Exception | None = None
        for attempt in range(self.settings.ai_kyc_max_retries + 1):
            started = time.monotonic()
            try:
                request_kwargs: dict[str, Any] = {
                    "model": self.settings.ai_kyc_model,
                    "input": prompt,
                    "max_output_tokens": self.settings.ai_kyc_max_output_tokens,
                }
                if not str(self.settings.ai_kyc_model).lower().startswith("gpt-5"):
                    request_kwargs["temperature"] = self.settings.ai_kyc_temperature
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "openai.request",
                    {
                        "attempt": attempt + 1,
                        "model": request_kwargs.get("model"),
                        "max_output_tokens": request_kwargs.get("max_output_tokens"),
                        "temperature": request_kwargs.get("temperature"),
                        "base_url": self.settings.ai_kyc_base_url or "openai_default",
                        "input": request_kwargs.get("input"),
                    },
                )
                response = client.responses.create(
                    **request_kwargs,
                )
                text = getattr(response, "output_text", "") or ""
                usage = getattr(response, "usage", None)
                return text, {
                    "response_id": getattr(response, "id", None),
                    "usage": self._usage_dict(usage),
                    "latency_ms": round((time.monotonic() - started) * 1000),
                }
            except Exception as exc:  # pragma: no cover - provider boundary
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "openai.request.error",
                    {"attempt": attempt + 1, "error": str(exc)},
                )
                last_error = exc
                if attempt >= self.settings.ai_kyc_max_retries:
                    break
                time.sleep(self.settings.ai_kyc_retry_backoff_seconds * (attempt + 1))
        raise RuntimeError(f"OpenAI KYC request failed: {str(last_error)[:300]}") from last_error

    @staticmethod
    def _usage_dict(usage: Any) -> dict[str, Any]:
        if usage is None:
            return {}
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if isinstance(usage, dict):
            return usage
        return {
            key: getattr(usage, key)
            for key in ("input_tokens", "output_tokens", "prompt_tokens", "completion_tokens", "total_tokens")
            if hasattr(usage, key)
        }

    def _estimated_cost(self, input_tokens: int) -> dict[str, Any]:
        input_rate = float(getattr(self.settings, "ai_kyc_estimated_input_cost_per_1k_usd", 0) or 0)
        output_rate = float(getattr(self.settings, "ai_kyc_estimated_output_cost_per_1k_usd", 0) or 0)
        estimated_input_cost = (input_tokens / 1000) * input_rate
        estimated_output_cost = (self.settings.ai_kyc_max_output_tokens / 1000) * output_rate
        estimated_cost = estimated_input_cost + estimated_output_cost
        return {
            "estimated_input_tokens": input_tokens,
            "estimated_max_output_tokens": self.settings.ai_kyc_max_output_tokens,
            "estimated_input_cost_per_1k_usd": input_rate,
            "estimated_output_cost_per_1k_usd": output_rate,
            "estimated_cost_usd": round(estimated_cost, 6) if estimated_cost else 0,
            "max_cost_per_run_usd": getattr(self.settings, "ai_kyc_max_cost_per_run_usd", 0),
        }

    @staticmethod
    def _parse_response(response_text: str) -> dict[str, Any]:
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].strip().startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(text[start : end + 1])
                except json.JSONDecodeError as nested_exc:
                    raise KycGatewaySchemaError("OpenAI KYC response was not valid JSON.") from nested_exc
            else:
                raise KycGatewaySchemaError("OpenAI KYC response was not valid JSON.") from exc
        if not isinstance(parsed, dict) or not isinstance(parsed.get("workstreams"), list):
            raise KycGatewaySchemaError("OpenAI KYC response is missing workstreams.")
        return parsed

    def _workstream_results(self, parsed: dict[str, Any], request: KycGatewayRequest, *, started_at: datetime) -> list[KycGatewayWorkstreamResult]:
        by_key = {str(item.get("workstream_key")): item for item in parsed.get("workstreams") or [] if isinstance(item, dict)}
        allowed_field_keys = {str(item.get("key")) for item in request.account_context.get("field_catalog", []) if item.get("key")}
        results: list[KycGatewayWorkstreamResult] = []
        for workstream in request.workstreams:
            key = str(workstream["key"])
            item = by_key.get(key) or {}
            status = str(item.get("status") or "failed")
            output, citations, missing_fields = self._fields_from_workstream(item, allowed_field_keys=allowed_field_keys, request=request)
            results.append(
                KycGatewayWorkstreamResult(
                    workstream_key=key,
                    title=str(workstream["title"]),
                    status="complete" if status == "complete" and output else "failed",
                    sort_order=int(workstream["sort_order"]),
                    output=output,
                    citations=citations,
                    missing_fields=missing_fields or [field for field in item.get("missing_fields", []) if isinstance(field, str)],
                    confidence=max(0, min(100, int(item.get("confidence") or self._average_confidence(output)))),
                    error_message=None if status == "complete" and output else "OpenAI did not return valid source-backed fields for this workstream.",
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                )
            )
        return results

    def _fields_from_workstream(self, item: dict[str, Any], *, allowed_field_keys: set[str], request: KycGatewayRequest) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], list[str]]:
        output: dict[str, dict[str, Any]] = {}
        citations: list[dict[str, Any]] = []
        missing_fields: list[str] = []
        fields = item.get("fields") or []
        if isinstance(fields, dict):
            fields = [{"key": key, **value} if isinstance(value, dict) else {"key": key, "value": value} for key, value in fields.items()]
        for field_item in fields:
            if not isinstance(field_item, dict):
                continue
            key = str(field_item.get("key") or "")
            if key not in allowed_field_keys:
                continue
            field_citations = [self._normalize_citation(citation, request) for citation in field_item.get("citations") or [] if isinstance(citation, dict)]
            field_citations = [citation for citation in field_citations if citation]
            confidence = max(0, min(100, int(field_item.get("confidence") or 0)))
            value = str(field_item.get("value") or "").strip()
            missing_note = str(field_item.get("missing_evidence_note") or "").strip()
            if not field_citations:
                confidence = min(confidence or 35, 45)
                missing_note = missing_note or "No source-backed citation was returned for this field."
            if not value:
                missing_fields.append(str(field_item.get("label") or key))
                missing_note = missing_note or "No sufficient source evidence was available for this field."
            output[key] = {
                "value": value,
                "confidence": confidence,
                "citations": field_citations,
                "missing_evidence_note": missing_note,
                "conflicts": [str(item) for item in field_item.get("conflicts") or [] if str(item).strip()],
                "reviewer_notes": [str(item) for item in field_item.get("reviewer_notes") or [] if str(item).strip()],
                "suggested_follow_up_questions": [str(item) for item in field_item.get("suggested_follow_up_questions") or [] if str(item).strip()],
            }
            citations.extend(field_citations)
        return output, citations, missing_fields

    @staticmethod
    def _normalize_citation(citation: dict[str, Any], request: KycGatewayRequest) -> dict[str, Any] | None:
        allowed_document_ids = {str(document.get("id")) for document in request.source_documents}
        allowed_chunk_ids = {str(item.get("source_chunk_id")) for item in request.retrieved_context if item.get("source_chunk_id")}
        allowed_record_ids = {str(item.get("source_record_id")) for item in request.retrieved_context if item.get("source_record_id")}
        source_document_id = citation.get("source_document_id")
        source_chunk_id = citation.get("source_chunk_id")
        source_record_id = citation.get("source_record_id")
        if source_document_id and str(source_document_id) not in allowed_document_ids:
            return None
        if source_chunk_id and str(source_chunk_id) not in allowed_chunk_ids:
            return None
        if source_record_id and str(source_record_id) not in allowed_record_ids:
            return None
        if not (source_document_id or source_chunk_id or source_record_id):
            return None
        return {
            "source_document_id": source_document_id,
            "source_chunk_id": source_chunk_id,
            "source_record_id": source_record_id,
            "label": citation.get("label") or citation.get("source_type") or "KYC source",
            "page_number": citation.get("page_number"),
            "section_label": citation.get("section_label"),
            "excerpt": str(citation.get("excerpt") or "")[:500],
            "field_key": citation.get("field_key"),
            "restricted": bool(citation.get("restricted")),
            "confidence": citation.get("confidence"),
            "source_route": citation.get("source_route"),
        }

    @staticmethod
    def _average_confidence(output: dict[str, dict[str, Any]]) -> int:
        values = [int(item.get("confidence") or 0) for item in output.values()]
        return round(sum(values) / len(values)) if values else 0


class LocalOpenAiCompatibleKycGatewayAdapter(OpenAiKycGatewayAdapter):
    """Local Qwen adapter for Ollama/LM Studio OpenAI-compatible chat endpoints."""

    name = "local-openai-compatible"

    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.ai_kyc_base_url:
            raise KycGatewayConfigurationError("AI_KYC_BASE_URL is required for local OpenAI-compatible AI KYC.")

    def run(self, request: KycGatewayRequest) -> KycGatewayResponse:
        if not self._should_use_ollama_native_api():
            return super().run(request)

        log_kyc_verbose(
            logger,
            self.settings,
            "local_ollama.run.start",
            {
                "adapter": self.name,
                "provider": self.settings.ai_kyc_provider,
                "model": self.settings.ai_kyc_model,
                "base_url": self.settings.ai_kyc_base_url,
                "account_context": request.account_context,
                "source_documents": request.source_documents,
                "prior_snapshot_fields": request.prior_snapshot_fields,
                "research_sources": request.research_sources,
                "requester_id": request.requester_id,
                "requester_role": request.requester_role,
                "trigger_source": request.trigger_source,
                "can_view_sensitive": request.can_view_sensitive,
                "workstreams": request.workstreams,
                "retrieved_context": request.retrieved_context,
            },
        )
        results: list[KycGatewayWorkstreamResult] = []
        failures: list[str] = []
        metadata: dict[str, Any] = {
            "adapter": self.name,
            "model": self.settings.ai_kyc_model,
            "request_id": str(uuid4()),
            "local_execution": "per_workstream",
            "workstream_calls": [],
            "prompt_sections": [],
            "raw_response_sections": [],
            "retrieved_context_count": len(request.retrieved_context),
            "schema_fallback_count": 0,
        }
        for workstream in request.workstreams:
            workstream_started_at = datetime.now(timezone.utc)
            workstream_request = self._workstream_request(request, workstream)
            try:
                prompt = self._local_workstream_prompt(workstream_request, workstream)
                input_tokens = estimate_tokens(prompt)
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "local_ollama.workstream.start",
                    {
                        "workstream": workstream,
                        "input_tokens_estimate": input_tokens,
                        "output_tokens": self._local_workstream_output_tokens(workstream_request),
                        "field_keys": [field.get("key") for field in workstream_request.account_context.get("field_catalog", [])],
                        "retrieved_context": workstream_request.retrieved_context,
                    },
                )
                log_kyc_verbose_text(logger, self.settings, "local_ollama.workstream.prompt", prompt)
                metadata["prompt_sections"].append(
                    {
                        "workstream_key": workstream.get("key"),
                        "title": workstream.get("title"),
                        "prompt": prompt,
                        "input_tokens_estimate": input_tokens,
                        "retrieved_context_count": len(workstream_request.retrieved_context),
                    }
                )
                if input_tokens > self.settings.ai_kyc_max_input_tokens:
                    raise KycGatewayConfigurationError(
                        f"KYC workstream prompt exceeds configured input token limit ({input_tokens} > {self.settings.ai_kyc_max_input_tokens})."
                    )
                response_text, response_metadata = self._call_ollama_native(
                    prompt,
                    max_output_tokens=self._local_workstream_output_tokens(workstream_request),
                )
                metadata["raw_response_sections"].append(
                    {
                        "workstream_key": workstream.get("key"),
                        "title": workstream.get("title"),
                        "raw_response": response_text,
                    }
                )
                log_kyc_verbose(logger, self.settings, "local_ollama.workstream.response_metadata", response_metadata)
                log_kyc_verbose_text(logger, self.settings, "local_ollama.workstream.raw_response_text", response_text)
                try:
                    parsed = self._json_object_from_response(response_text)
                    log_kyc_verbose(logger, self.settings, "local_ollama.workstream.parsed_json", parsed)
                    result = self._compact_workstream_result(parsed, workstream, workstream_request, workstream_started_at)
                    schema_fallback = False
                except Exception as parse_exc:
                    log_kyc_verbose(
                        logger,
                        self.settings,
                        "local_ollama.workstream.parse_error",
                        {
                            "workstream_key": workstream.get("key"),
                            "error": str(parse_exc),
                            "raw_response_text": response_text,
                        },
                    )
                    result = self._fallback_local_workstream_result(
                        workstream,
                        workstream_request,
                        workstream_started_at,
                        str(parse_exc)[:300],
                    )
                    metadata["schema_fallback_count"] += 1
                    schema_fallback = True
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "local_ollama.workstream.result",
                    {
                        "workstream_key": result.workstream_key,
                        "status": result.status,
                        "confidence": result.confidence,
                        "missing_fields": result.missing_fields,
                        "output": result.output,
                        "citations": result.citations,
                        "error_message": result.error_message,
                        "schema_fallback": schema_fallback,
                    },
                )
                results.append(result)
                metadata["workstream_calls"].append(
                    {
                        "workstream_key": workstream.get("key"),
                        "status": result.status,
                        "usage": response_metadata.get("usage", {}),
                        "latency_ms": response_metadata.get("latency_ms"),
                        "schema_fallback": schema_fallback,
                    }
                )
                if result.status != "complete":
                    failures.append(str(workstream.get("key")))
            except Exception as exc:  # pragma: no cover - provider boundary
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "local_ollama.workstream.error",
                    {"workstream_key": workstream.get("key"), "error": str(exc)},
                )
                failures.append(str(workstream.get("key")))
                results.append(self._failed_workstream_result(workstream, workstream_request, workstream_started_at, str(exc)[:300]))
                metadata["workstream_calls"].append(
                    {
                        "workstream_key": workstream.get("key"),
                        "status": "failed",
                        "error": str(exc)[:300],
                    }
                )

        completed = sum(1 for result in results if result.status == "complete")
        failed = len(results) - completed
        status = "partial" if failed and completed else "failed" if failed else "complete"
        log_kyc_verbose(
            logger,
            self.settings,
            "local_ollama.run.complete",
            {
                "status": status,
                "metadata": metadata,
                "results": [
                    {
                        "workstream_key": result.workstream_key,
                        "status": result.status,
                        "confidence": result.confidence,
                        "missing_fields": result.missing_fields,
                        "output": result.output,
                        "citations": result.citations,
                        "error_message": result.error_message,
                    }
                    for result in results
                ],
            },
        )
        metadata["detailed_description"] = self._local_detailed_description(metadata["raw_response_sections"])
        return KycGatewayResponse(
            status=status,
            workstreams=results,
            error_message="One or more local Ollama KYC workstreams failed." if failures else None,
            metadata=metadata,
        )

    def _call_openai(self, prompt: str) -> tuple[str, dict[str, Any]]:
        if self._should_use_ollama_native_api():
            return self._call_ollama_native(prompt)

        from openai import OpenAI

        client = OpenAI(
            api_key=self.settings.ai_kyc_api_key or "local-demo",
            base_url=self.settings.ai_kyc_base_url,
            timeout=self.settings.ai_kyc_timeout_seconds,
        )
        last_error: Exception | None = None
        for attempt in range(self.settings.ai_kyc_max_retries + 1):
            started = time.monotonic()
            try:
                response = client.chat.completions.create(
                    model=self.settings.ai_kyc_model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a source-grounded KYC extraction engine. "
                                "Return only valid JSON that matches the requested schema. "
                                "Do not include markdown, analysis text, or unsupported facts."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=self.settings.ai_kyc_temperature,
                    max_tokens=self.settings.ai_kyc_max_output_tokens,
                )
                message = response.choices[0].message if response.choices else None
                text = getattr(message, "content", "") if message is not None else ""
                usage = getattr(response, "usage", None)
                return text or "", {
                    "response_id": getattr(response, "id", None),
                    "usage": self._usage_dict(usage),
                    "latency_ms": round((time.monotonic() - started) * 1000),
                    "base_url": self.settings.ai_kyc_base_url,
                }
            except Exception as exc:  # pragma: no cover - provider boundary
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "local_openai_compatible.request.error",
                    {"attempt": attempt + 1, "error": str(exc), "base_url": self.settings.ai_kyc_base_url},
                )
                last_error = exc
                if attempt >= self.settings.ai_kyc_max_retries:
                    break
                time.sleep(self.settings.ai_kyc_retry_backoff_seconds * (attempt + 1))
        raise RuntimeError(f"Local AI KYC request failed: {str(last_error)[:300]}") from last_error

    def _should_use_ollama_native_api(self) -> bool:
        provider = str(getattr(self.settings, "ai_kyc_provider", "") or "").lower()
        base_url = str(getattr(self.settings, "ai_kyc_base_url", "") or "").lower()
        return provider == "ollama" or "11434" in base_url or "ollama" in base_url

    def _call_ollama_native(self, prompt: str, *, max_output_tokens: int | None = None) -> tuple[str, dict[str, Any]]:
        last_error: Exception | None = None
        endpoint = self._ollama_native_chat_url()
        output_tokens = max_output_tokens or self.settings.ai_kyc_max_output_tokens
        for attempt in range(self.settings.ai_kyc_max_retries + 1):
            started = time.monotonic()
            try:
                payload = {
                    "model": self.settings.ai_kyc_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a source-grounded KYC extraction engine. "
                                "Return only valid JSON that matches the requested schema. "
                                "Do not include markdown, analysis text, or unsupported facts."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                    "think": False,
                    "options": {
                        "temperature": self.settings.ai_kyc_temperature,
                        "num_ctx": max(2048, int(getattr(self.settings, "ai_kyc_ollama_context_tokens", 2048) or 2048)),
                        "num_predict": output_tokens,
                    },
                }
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "ollama_native.request",
                    {
                        "attempt": attempt + 1,
                        "endpoint": endpoint,
                        "payload": payload,
                    },
                )
                request = UrlRequest(
                    endpoint,
                    data=json.dumps(payload, default=str).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(request, timeout=self.settings.ai_kyc_timeout_seconds) as response:
                    parsed = json.loads(response.read().decode("utf-8"))
                log_kyc_verbose(logger, self.settings, "ollama_native.response", parsed)
                message = parsed.get("message") if isinstance(parsed, dict) else {}
                return str((message or {}).get("content") or ""), {
                    "response_id": parsed.get("created_at") if isinstance(parsed, dict) else None,
                    "usage": self._ollama_usage_dict(parsed),
                    "latency_ms": round((time.monotonic() - started) * 1000),
                    "base_url": self.settings.ai_kyc_base_url,
                    "native_endpoint": endpoint,
                    "think": False,
                }
            except Exception as exc:  # pragma: no cover - provider boundary
                log_kyc_verbose(
                    logger,
                    self.settings,
                    "ollama_native.request.error",
                    {"attempt": attempt + 1, "endpoint": endpoint, "error": str(exc)},
                )
                last_error = exc
                if attempt >= self.settings.ai_kyc_max_retries:
                    break
                time.sleep(self.settings.ai_kyc_retry_backoff_seconds * (attempt + 1))
        raise RuntimeError(f"Local Ollama KYC request failed: {str(last_error)[:300]}") from last_error

    def debug_prompt_sections(self, request: KycGatewayRequest) -> list[dict[str, Any]]:
        sections: list[dict[str, Any]] = []
        for workstream in request.workstreams:
            workstream_request = self._workstream_request(request, workstream)
            prompt = self._local_workstream_prompt(workstream_request, workstream)
            sections.append(
                {
                    "workstream_key": workstream.get("key"),
                    "title": workstream.get("title"),
                    "prompt": prompt,
                    "input_tokens_estimate": estimate_tokens(prompt),
                    "retrieved_context_count": len(workstream_request.retrieved_context),
                    "status": "prompt_prepared",
                }
            )
        return sections

    def _workstream_request(self, request: KycGatewayRequest, workstream: dict[str, Any]) -> KycGatewayRequest:
        workstream_key = str(workstream.get("key") or "")
        account_context = dict(request.account_context)
        account_context["field_catalog"] = [
            field
            for field in request.account_context.get("field_catalog", [])
            if str(field.get("workstream_key") or "") == workstream_key
        ]
        retrieved_context = self._contexts_for_workstream(request.retrieved_context, workstream_key)
        return replace(
            request,
            workstreams=[workstream],
            account_context=account_context,
            retrieved_context=retrieved_context,
        )

    def _contexts_for_workstream(self, contexts: list[dict[str, Any]], workstream_key: str) -> list[dict[str, Any]]:
        top_k = min(10, max(1, int(getattr(self.settings, "ai_kyc_retrieval_top_k", 10) or 10)))
        matched: list[dict[str, Any]] = []
        untagged: list[dict[str, Any]] = []
        for context in contexts:
            matched_workstreams = {str(item) for item in context.get("matched_workstreams", []) if str(item).strip()}
            if matched_workstreams and workstream_key in matched_workstreams:
                matched.append(context)
            elif not matched_workstreams:
                untagged.append(context)
        ordered = sorted(matched, key=lambda item: float(item.get("retrieval_score") or 0), reverse=True)
        if len(ordered) < top_k and untagged:
            ordered.extend(sorted(untagged, key=lambda item: float(item.get("trust_score") or item.get("confidence") or 0), reverse=True))
        return ordered[:top_k]

    def _local_workstream_output_tokens(self, request: KycGatewayRequest) -> int:
        field_count = len(request.account_context.get("field_catalog") or [])
        if self._reference_detail_enabled():
            return min(self.settings.ai_kyc_max_output_tokens, max(1000, field_count * 300))
        return min(self.settings.ai_kyc_max_output_tokens, max(220, field_count * 70))

    def _local_workstream_prompt(self, request: KycGatewayRequest, workstream: dict[str, Any]) -> str:
        fields = [
            {
                "key": field.get("key"),
                "label": field.get("label"),
                "sensitive": bool(field.get("sensitive")),
                "detail_guidance": FIELD_DETAIL_GUIDANCE.get(
                    str(field.get("key")),
                    f"Write a source-backed, reviewable KYC value for {field.get('label') or field.get('key')}.",
                ),
            }
            for field in request.account_context.get("field_catalog", [])
        ]
        context = []
        max_excerpt_chars = 1700 if self._reference_detail_enabled() else 700
        for item in request.retrieved_context[: max(1, self.settings.ai_kyc_retrieval_top_k)]:
            context.append(
                {
                    "source_document_id": item.get("source_document_id"),
                    "source_chunk_id": item.get("source_chunk_id"),
                    "source_record_id": item.get("source_record_id"),
                    "source_type": item.get("source_type"),
                    "label": item.get("label"),
                    "page_number": item.get("page_number"),
                    "section_label": item.get("section_label"),
                    "excerpt": self._context_excerpt(item, max_chars=max_excerpt_chars),
                }
            )
        value_length = (
            "For each supported field, write detailed reference-style content. Prefer 1-3 paragraphs or bullets, roughly 90-180 words when source evidence supports it. "
            "Use concrete facts, dates, locations, products, clients, monetary values, headcount, renewal terms, obligations, and milestones when they appear in the supplied context."
            if self._reference_detail_enabled()
            else "Each value should be source-backed and concise: 1-2 strong sentences, roughly 25-55 words when evidence supports it."
        )
        prompt_depth = (
            "Use the Account Information Reference document shape: industry overview, company profile facts, core offerings, history/evolution, monetization, achievements, clients, and engagement details. "
            "The response can be long, but must remain valid JSON."
            if self._reference_detail_enabled()
            else "Use the Account Information Reference style for structure, but keep local CPU output concise enough to finish quickly."
        )
        payload = {
            "account": {
                "name": request.account_context.get("name"),
                "segment": request.account_context.get("segment"),
                "region": request.account_context.get("region"),
                "lifecycle_status": request.account_context.get("lifecycle_status"),
                "service_context": request.account_context.get("service_context"),
            },
            "workstream": {
                "key": workstream.get("key"),
                "title": workstream.get("title"),
            },
            "fields": fields,
            "reference_kyc_style_guide": REFERENCE_KYC_STYLE_GUIDE,
            "reference_output_template": REFERENCE_KYC_OUTPUT_TEMPLATE.get(str(workstream.get("key") or ""), []),
            "context": context,
            "reviewer_enrichment_request": {
                "instruction": (
                    "Get maximum source-backed KYC detail from the extracted uploaded document text and approved web research context. "
                    "Treat the context array as the extracted SOW/charter/account text plus any API-backed web/news/blog/Reddit research already retrieved for this run."
                ),
                "web_search_policy": (
                    "Use only approved retrieved web research records, currently Tavily/API-backed search where enabled. "
                    "Do not scrape Google directly. Do not scrape or cite LinkedIn unless official API/data-provider context is already present in retrieved_context. "
                    "Do not query or cite ZoomInfo unless approved API credentials/context are already present in retrieved_context."
                ),
                "append_behavior": "Return detailed values so the application can append the generated KYC response and logs to the reviewer output panel.",
            },
            "rules": {
                "only_use_context": True,
                "no_additional_web_search": True,
                "approved_public_web_research_context_allowed": True,
                "value_length": value_length,
                "weak_evidence": "If evidence is weak, still return the field with low confidence and a missing_evidence_note.",
                "no_reference_fact_copying": "The reference guide is a style guide only. Do not copy Fintua, Signal, CLI, or any sample facts unless those facts appear in this account context.",
            },
        }
        return (
            "Return only valid JSON. Do not use markdown. Do not explain your reasoning.\n"
            f"{prompt_depth}\n"
            "Use only the supplied account context and retrieved context, including approved web research records when present. If a fact is not in source context, do not invent it.\n"
            "The reviewer asked for maximum detail from the extracted document text and approved web research. Use the provided SOW/charter text chunks and Tavily/API-backed web context when present; direct Google scraping, unofficial LinkedIn scraping, and uncredentialed ZoomInfo access are not allowed.\n"
            "Preserve useful line breaks inside string values using \\n when it improves reviewability.\n"
            "Use this exact compact shape: "
            "{\"status\":\"complete\", \"fields\":[{\"key\":\"field_key\", \"value\":\"source-backed account intelligence\", \"confidence\":0, "
            "\"missing_evidence_note\":\"\", \"suggested_follow_up_questions\":[]}], \"missing_fields\":[]}.\n"
            f"Payload:\n{json.dumps(payload, default=str)}"
        )

    def _compact_workstream_result(
        self,
        parsed: dict[str, Any],
        workstream: dict[str, Any],
        request: KycGatewayRequest,
        started_at: datetime,
    ) -> KycGatewayWorkstreamResult:
        allowed_fields = {str(field.get("key")): field for field in request.account_context.get("field_catalog", []) if field.get("key")}
        fields = parsed.get("fields") or []
        if isinstance(fields, dict):
            fields = [{"key": key, "value": value} if not isinstance(value, dict) else {"key": key, **value} for key, value in fields.items()]
        by_key = {str(field.get("key")): field for field in fields if isinstance(field, dict)}
        output: dict[str, dict[str, Any]] = {}
        citations: list[dict[str, Any]] = []
        missing_fields: list[str] = []
        for key, field_config in allowed_fields.items():
            field_item = by_key.get(key) or {}
            value = str(field_item.get("value") or "").strip()
            confidence = max(0, min(100, int(field_item.get("confidence") or (65 if value else 35))))
            missing_note = str(field_item.get("missing_evidence_note") or "").strip()
            field_citation = self._default_local_citation(request, key)
            field_citations = [field_citation] if field_citation else []
            if not value:
                missing_fields.append(str(field_config.get("label") or key))
                missing_note = missing_note or "Local model did not return enough source-backed detail for this field."
            if not field_citations:
                confidence = min(confidence, 45)
                missing_note = missing_note or "No source citation was available for this field."
            output[key] = {
                "value": value,
                "confidence": confidence,
                "citations": field_citations,
                "missing_evidence_note": missing_note,
                "conflicts": [],
                "reviewer_notes": [],
                "suggested_follow_up_questions": [
                    str(item)
                    for item in field_item.get("suggested_follow_up_questions", [])
                    if str(item).strip()
                ]
                if isinstance(field_item.get("suggested_follow_up_questions"), list)
                else [],
            }
            citations.extend(field_citations)
        return KycGatewayWorkstreamResult(
            workstream_key=str(workstream.get("key") or ""),
            title=str(workstream.get("title") or workstream.get("key") or "KYC workstream"),
            status="complete" if output else "failed",
            sort_order=int(workstream.get("sort_order") or 0),
            output=output,
            citations=citations,
            missing_fields=missing_fields,
            confidence=self._average_confidence(output),
            error_message=None if output else "Local model did not return any valid fields for this workstream.",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )

    def _fallback_local_workstream_result(
        self,
        workstream: dict[str, Any],
        request: KycGatewayRequest,
        started_at: datetime,
        parse_error: str,
    ) -> KycGatewayWorkstreamResult:
        output: dict[str, dict[str, Any]] = {}
        citations: list[dict[str, Any]] = []
        missing_fields: list[str] = []
        excerpt = self._fallback_source_excerpt(request)
        source_label = self._fallback_source_label(request)
        for field_config in request.account_context.get("field_catalog", []):
            key = str(field_config.get("key") or "")
            if not key:
                continue
            label = str(field_config.get("label") or key)
            field_citation = self._default_local_citation(request, key)
            field_citations = [field_citation] if field_citation else []
            value = self._reference_style_fallback_value(label=label, source_label=source_label, excerpt=excerpt) if excerpt else ""
            confidence = 55 if value and field_citations else 35
            if not value:
                missing_fields.append(label)
            output[key] = {
                "value": value,
                "confidence": confidence,
                "citations": field_citations,
                "missing_evidence_note": (
                    "The local model returned invalid JSON, so this field was populated from retrieved source evidence "
                    f"for human review. Parse error: {parse_error}"
                ),
                "conflicts": [],
                "reviewer_notes": ["Review this local fallback output before approval."],
                "suggested_follow_up_questions": [],
            }
            citations.extend(field_citations)
        return KycGatewayWorkstreamResult(
            workstream_key=str(workstream.get("key") or ""),
            title=str(workstream.get("title") or workstream.get("key") or "KYC workstream"),
            status="complete" if output else "failed",
            sort_order=int(workstream.get("sort_order") or 0),
            output=output,
            citations=citations,
            missing_fields=missing_fields,
            confidence=self._average_confidence(output),
            error_message=None if output else f"Local model returned invalid JSON and no fallback fields were available: {parse_error}",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _json_object_from_response(response_text: str) -> dict[str, Any]:
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].strip().startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            start = text.find("{")
            end = text.rfind("}")
            if start < 0 or end <= start:
                raise KycGatewaySchemaError("Local KYC response was not valid JSON.") from exc
            parsed = json.loads(text[start : end + 1])
        if not isinstance(parsed, dict):
            raise KycGatewaySchemaError("Local KYC response was not a JSON object.")
        return parsed

    def _default_local_citation(self, request: KycGatewayRequest, field_key: str) -> dict[str, Any] | None:
        for item in request.retrieved_context:
            citation = self._normalize_citation(
                {
                    "source_document_id": item.get("source_document_id"),
                    "source_chunk_id": item.get("source_chunk_id"),
                    "source_record_id": item.get("source_record_id"),
                    "label": item.get("label") or item.get("source_type") or "KYC source",
                    "page_number": item.get("page_number"),
                    "section_label": item.get("section_label"),
                    "excerpt": self._context_excerpt(item),
                    "field_key": field_key,
                    "restricted": bool(item.get("restricted")),
                    "confidence": item.get("confidence"),
                    "source_route": item.get("source_route"),
                },
                request,
            )
            if citation:
                return citation
        for document in request.source_documents:
            return {
                "source_document_id": document.get("id"),
                "source_chunk_id": None,
                "source_record_id": None,
                "label": document.get("title") or document.get("source_type") or "KYC source",
                "page_number": None,
                "section_label": None,
                "excerpt": str(document.get("title") or document.get("source_type") or "")[:500],
                "field_key": field_key,
                "restricted": bool(document.get("is_sensitive")),
                "confidence": document.get("confidence"),
                "source_route": None,
            }
        return None

    @staticmethod
    def _context_excerpt(item: dict[str, Any], *, max_chars: int = 700) -> str:
        value = str(item.get("excerpt") or item.get("text") or "")
        return value[:max_chars]

    def _reference_detail_enabled(self) -> bool:
        return str(getattr(self.settings, "ai_kyc_detail_level", "compact") or "compact").lower() in {"reference", "full", "detailed", "quality"}

    def _fallback_source_excerpt(self, request: KycGatewayRequest) -> str:
        for item in request.retrieved_context:
            excerpt = self._context_excerpt(item).strip()
            if excerpt:
                return excerpt[:320]
        for document in request.source_documents:
            value = str(document.get("title") or document.get("source_type") or "").strip()
            if value:
                return value[:320]
        return ""

    @staticmethod
    def _fallback_source_label(request: KycGatewayRequest) -> str:
        for item in request.retrieved_context:
            value = str(item.get("label") or item.get("source_type") or "").strip()
            if value:
                return value[:120]
        for document in request.source_documents:
            value = str(document.get("title") or document.get("source_type") or "").strip()
            if value:
                return value[:120]
        return "available KYC source evidence"

    @staticmethod
    def _reference_style_fallback_value(*, label: str, source_label: str, excerpt: str) -> str:
        return (
            f"{label} requires human review because the local model did not return valid JSON. "
            f"The strongest retrieved evidence from {source_label} says: {excerpt} "
            "Use this as a source-backed starting point and enrich only with verified account documents, notes, Fathom summaries, "
            "engagement records, or approved research evidence before approving the KYC snapshot."
        )

    @staticmethod
    def _local_detailed_description(raw_response_sections: list[dict[str, Any]]) -> str:
        parts: list[str] = []
        for section in raw_response_sections:
            title = str(section.get("title") or section.get("workstream_key") or "KYC workstream")
            raw_response = str(section.get("raw_response") or "").strip()
            if not raw_response:
                continue
            parts.append(f"## {title}\n{raw_response}")
        return "\n\n".join(parts)

    @staticmethod
    def _failed_workstream_result(
        workstream: dict[str, Any],
        request: KycGatewayRequest,
        started_at: datetime,
        error_message: str,
    ) -> KycGatewayWorkstreamResult:
        return KycGatewayWorkstreamResult(
            workstream_key=str(workstream.get("key") or ""),
            title=str(workstream.get("title") or workstream.get("key") or "KYC workstream"),
            status="failed",
            sort_order=int(workstream.get("sort_order") or 0),
            missing_fields=[str(field.get("label") or field.get("key")) for field in request.account_context.get("field_catalog", [])],
            error_message=f"Local Ollama KYC workstream failed: {error_message}",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )

    def _ollama_native_chat_url(self) -> str:
        parsed = urlparse(self.settings.ai_kyc_base_url)
        if not parsed.scheme or not parsed.netloc:
            return self.settings.ai_kyc_base_url.rstrip("/") + "/api/chat"
        return f"{parsed.scheme}://{parsed.netloc}/api/chat"

    @staticmethod
    def _ollama_usage_dict(response: Any) -> dict[str, Any]:
        if not isinstance(response, dict):
            return {}
        return {
            key: response.get(key)
            for key in (
                "prompt_eval_count",
                "eval_count",
                "total_duration",
                "load_duration",
                "prompt_eval_duration",
                "eval_duration",
            )
            if key in response
        }


def build_kyc_gateway_adapter() -> KycGatewayAdapter:
    settings = get_settings()
    if settings.ai_kyc_provider == "openai":
        return OpenAiKycGatewayAdapter()
    if settings.ai_kyc_provider in {"local_openai_compatible", "ollama", "lm_studio", "lmstudio"}:
        return LocalOpenAiCompatibleKycGatewayAdapter()
    return DeterministicKycGatewayAdapter()
