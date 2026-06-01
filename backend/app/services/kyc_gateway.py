from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4


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


class DeterministicKycGatewayAdapter:
    """Local gateway adapter used until the real AI/LLM Gateway is connected."""

    name = "deterministic-local"

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
