from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

from app.config import get_settings
from app.services.kyc_document_extraction import estimate_tokens

logger = logging.getLogger(__name__)


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
                "competitors": f"Competitor context for {account['name']} requires public research validation and AM review.",
                "regulatory": "Regulatory and compliance obligations should be confirmed against industry standards, data handling needs, and delivery architecture.",
            },
            "client_research": {
                "company_snapshot": f"{account['name']} account profile includes lifecycle {account['lifecycle_status']}, commercial value {float(account['commercial_value']):,.0f} {account['currency']}, and owner context.",
                "strategy": account.get("service_context") or "Strategic priorities should be confirmed with the account owner and latest governance notes.",
                "company_history": "Company history, acquisitions, pivots, and leadership changes require approved research-source validation.",
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

    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.ai_kyc_api_key:
            raise KycGatewayConfigurationError("OpenAI API key is not configured for AI KYC.")

    def run(self, request: KycGatewayRequest) -> KycGatewayResponse:
        started_at = datetime.now(timezone.utc)
        prompt = self._prompt(request)
        input_tokens = estimate_tokens(prompt)
        if input_tokens > self.settings.ai_kyc_max_input_tokens:
            raise KycGatewayConfigurationError(f"KYC prompt exceeds configured input token limit ({input_tokens} > {self.settings.ai_kyc_max_input_tokens}).")
        estimated_cost = self._estimated_cost(input_tokens)
        max_cost_per_run = float(getattr(self.settings, "ai_kyc_max_cost_per_run_usd", 0) or 0)
        if estimated_cost["estimated_cost_usd"] and max_cost_per_run and estimated_cost["estimated_cost_usd"] > max_cost_per_run:
            raise KycGatewayConfigurationError("KYC run estimated cost exceeds the configured per-run AI budget.")

        response_text, metadata = self._call_openai(prompt)
        parsed = self._parse_response(response_text)
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
            "retrieved_context": context,
            "rules": {
                "external_research": "disabled",
                "linkedin": "blocked",
                "only_use_supplied_context": True,
                "require_citations_for_every_field": True,
                "if_evidence_missing": "Return empty value, low confidence, and missing_evidence_note. Do not invent.",
                "sensitive_context_visible_to_requester": request.can_view_sensitive,
            },
        }
        return (
            "You are generating source-cited KYC intelligence for a strategic account management platform.\n"
            "Return only valid JSON. Do not wrap in markdown. Do not use web search or outside knowledge.\n"
            "Every field must include value, citations, confidence, missing_evidence_note, conflicts, reviewer_notes, and suggested_follow_up_questions.\n"
            "Citation objects must reference supplied source_document_id, source_chunk_id, or source_record_id.\n"
            "Required JSON shape: {\"status\":\"complete|partial|failed\", \"workstreams\":[{\"workstream_key\":\"...\", \"title\":\"...\", \"status\":\"complete|failed\", \"fields\":[...], \"missing_fields\":[], \"conflicts\":[], \"reviewer_notes\":[], \"suggested_follow_up_questions\":[], \"confidence\":0}], \"global_conflicts\":[], \"global_missing_evidence\":[], \"model_metadata\":{}}.\n"
            f"Source payload:\n{json.dumps(payload, default=str)}"
        )

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
        return {key: getattr(usage, key) for key in ("input_tokens", "output_tokens", "total_tokens") if hasattr(usage, key)}

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
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
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
            output[key] = {
                "value": value,
                "confidence": confidence,
                "citations": field_citations,
                "missing_evidence_note": missing_note,
                "conflicts": field_item.get("conflicts") or [],
                "reviewer_notes": field_item.get("reviewer_notes") or [],
                "suggested_follow_up_questions": field_item.get("suggested_follow_up_questions") or [],
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


def build_kyc_gateway_adapter() -> KycGatewayAdapter:
    settings = get_settings()
    if settings.ai_kyc_provider == "openai":
        return OpenAiKycGatewayAdapter()
    return DeterministicKycGatewayAdapter()
