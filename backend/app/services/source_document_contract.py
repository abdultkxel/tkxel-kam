from __future__ import annotations

from dataclasses import dataclass


STRUCTURED_SOW_METADATA_KEY = "sow_structured_extraction"

SOURCE_DOCUMENT_SCHEMA_TABLES = (
    "source_documents",
    "source_document_extractions",
    "document_extractions",
    "source_document_chunks",
    "source_citations",
)

SENSITIVE_SOURCE_FIELDS = {
    "commercial_summary",
    "commercial_value",
    "contract_value",
    "billing",
    "payment_terms",
    "renewal_terms",
    "notice_period",
    "margin",
    "revenue",
    "financial_landscape",
}

SENSITIVE_SOURCE_TYPES = {"commercial_note"}

DOCUMENT_UPLOAD_STATUSES = ("queued", "running", "completed", "failed", "needs_review", "parsed")
ONBOARDING_DRAFT_STATUSES = ("ready_for_review", "approved", "rejected", "linked")
ONBOARDING_DRAFT_LIFECYCLE_DEFAULT = "Onboarding"


@dataclass(frozen=True)
class ServiceLineSignal:
    keyword: str
    label: str


SERVICE_LINE_SIGNALS = (
    ServiceLineSignal("software development", "Software development"),
    ServiceLineSignal("product engineering", "Product engineering"),
    ServiceLineSignal("python", "Python engineering"),
    ServiceLineSignal("react", "React engineering"),
    ServiceLineSignal("java", "Java engineering"),
    ServiceLineSignal("qa automation", "QA automation"),
    ServiceLineSignal("qa (automation)", "QA automation"),
    ServiceLineSignal("qa (functional)", "Functional QA"),
    ServiceLineSignal("functional qa", "Functional QA"),
    ServiceLineSignal("functional", "Functional QA"),
    ServiceLineSignal("devops", "DevOps"),
    ServiceLineSignal("solution architect", "Solution architecture"),
    ServiceLineSignal("architecture", "Solution architecture"),
    ServiceLineSignal("ai/ml", "AI/ML SME"),
    ServiceLineSignal("machine learning", "AI/ML SME"),
    ServiceLineSignal("ui/ux", "UI/UX"),
    ServiceLineSignal("cloud", "Cloud integration"),
    ServiceLineSignal("data engineering", "Data engineering"),
    ServiceLineSignal("data", "Data engineering"),
    ServiceLineSignal("api integration", "API integration"),
    ServiceLineSignal("mobile", "Mobile engineering"),
)

SERVICE_LINE_LABELS = tuple(dict.fromkeys(signal.label for signal in SERVICE_LINE_SIGNALS))


def infer_service_lines_from_text(text: str, *, limit: int = 12) -> list[str]:
    lower = (text or "").lower()
    services: list[str] = []
    for signal in SERVICE_LINE_SIGNALS:
        if signal.keyword in lower and signal.label not in services:
            services.append(signal.label)
        if len(services) >= limit:
            break
    return services
