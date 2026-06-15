from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import DocumentExtraction, SourceDocument, SourceDocumentExtraction
from app.services.kyc_debug_logging import log_kyc_verbose, log_kyc_verbose_text
from app.services.kyc_document_extraction import estimate_tokens
from app.services.source_document_contract import STRUCTURED_SOW_METADATA_KEY, infer_service_lines_from_text

logger = logging.getLogger(__name__)


SOW_EXTRACTION_PROMPT = """You are an SOW extraction engine. Return JSON only.

Extract:
- Client name
- Start date
- End date
- Renewal terms
- Notice period
- Commercial value
- Service lines
- Stakeholders
- Deliverables
- Risks

Return confidence per field."""


@dataclass(frozen=True)
class SowStructuredExtraction:
    fields: dict[str, dict[str, Any]]
    provider: str
    model: str | None
    status: str
    error_message: str | None = None
    raw_response: str | None = None


class SowExtractionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def extract_structured_fields(
        self,
        document: SourceDocument,
        extraction: SourceDocumentExtraction,
        *,
        allow_ai: bool = True,
    ) -> SowStructuredExtraction:
        page_rows = self._page_rows(document.id)
        source_text = "\n\n".join(f"[Page {row.page_number}]\n{row.raw_text}" for row in page_rows)
        fallback = self._deterministic_extract(source_text)
        if not allow_ai or not self.settings.sow_ai_extraction_enabled or not source_text.strip():
            result = SowStructuredExtraction(fields=self._enrich_fields(fallback, page_rows), provider="deterministic", model=None, status="complete")
            self._store_result(extraction, result, page_rows)
            return result

        result: SowStructuredExtraction | None = None
        try:
            if self._openai_enabled():
                result = self._extract_with_openai(source_text, fallback, page_rows)
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.warning("OpenAI SOW extraction failed for source document %s: %s", document.id, exc)
        if result is None:
            try:
                result = self._extract_with_qwen(source_text, fallback, page_rows)
            except Exception as exc:  # pragma: no cover - provider boundary
                logger.warning("Qwen SOW extraction failed for source document %s: %s", document.id, exc)
                result = SowStructuredExtraction(fields=self._enrich_fields(fallback, page_rows), provider="deterministic_fallback", model=None, status="partial", error_message=str(exc)[:500])
        self._store_result(extraction, result, page_rows)
        return result

    def extract_structured_fields_from_text(
        self,
        source_text: str,
        *,
        source_name: str = "uploaded source document",
        allow_ai: bool = True,
    ) -> SowStructuredExtraction:
        fallback = self._deterministic_extract(source_text)
        if not allow_ai or not self.settings.sow_ai_extraction_enabled or not source_text.strip():
            return SowStructuredExtraction(fields=self._fields_without_page_validation(fallback), provider="deterministic", model=None, status="complete")
        try:
            if self._openai_enabled():
                return self._extract_with_openai_text(source_text, fallback, source_name=source_name)
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.warning("OpenAI SOW preview extraction failed for %s: %s", source_name, exc)
        try:
            return self._extract_with_qwen_text(source_text, fallback, source_name=source_name)
        except Exception as exc:  # pragma: no cover - provider boundary
            logger.warning("Qwen SOW preview extraction failed for %s: %s", source_name, exc)
            return SowStructuredExtraction(fields=self._fields_without_page_validation(fallback), provider="deterministic_fallback", model=None, status="partial", error_message=str(exc)[:500])

    def _openai_enabled(self) -> bool:
        return bool(self.settings.ai_kyc_provider == "openai" and self.settings.ai_kyc_api_key)

    def _extract_with_openai(self, source_text: str, fallback: dict[str, dict[str, Any]], page_rows: list[DocumentExtraction]) -> SowStructuredExtraction:
        prompt = self._prompt(source_text)
        log_kyc_verbose(
            logger,
            self.settings,
            "sow_extraction.openai.start",
            {
                "provider": "openai",
                "model": self.settings.sow_ai_extraction_model or self.settings.ai_kyc_model,
                "prompt_tokens_estimate": estimate_tokens(prompt),
            },
        )
        log_kyc_verbose_text(logger, self.settings, "sow_extraction.openai.prompt", prompt)
        started = time.monotonic()
        response_text = self._call_openai(prompt)
        parsed = self._json_object_from_response(response_text)
        normalized = self._normalize_ai_fields(parsed, fallback)
        enriched = self._enrich_fields(normalized, page_rows)
        result = SowStructuredExtraction(
            fields=enriched,
            provider="openai",
            model=self.settings.sow_ai_extraction_model or self.settings.ai_kyc_model,
            status="complete",
            raw_response=response_text[:5000],
        )
        log_kyc_verbose(
            logger,
            self.settings,
            "sow_extraction.openai.complete",
            {"latency_ms": round((time.monotonic() - started) * 1000), "fields": result.fields},
        )
        return result

    def _extract_with_openai_text(self, source_text: str, fallback: dict[str, dict[str, Any]], *, source_name: str) -> SowStructuredExtraction:
        prompt = self._prompt(source_text)
        started = time.monotonic()
        response_text = self._call_openai(prompt)
        parsed = self._json_object_from_response(response_text)
        normalized = self._normalize_ai_fields(parsed, fallback)
        result = SowStructuredExtraction(
            fields=self._fields_without_page_validation(normalized, source_name=source_name),
            provider="openai",
            model=self.settings.sow_ai_extraction_model or self.settings.ai_kyc_model,
            status="complete",
            raw_response=response_text[:5000],
        )
        log_kyc_verbose(
            logger,
            self.settings,
            "sow_extraction.openai.preview_complete",
            {"latency_ms": round((time.monotonic() - started) * 1000), "source_name": source_name, "fields": result.fields},
        )
        return result

    def _extract_with_qwen(self, source_text: str, fallback: dict[str, dict[str, Any]], page_rows: list[DocumentExtraction]) -> SowStructuredExtraction:
        prompt = self._prompt(source_text)
        log_kyc_verbose(
            logger,
            self.settings,
            "sow_extraction.qwen.start",
            {
                "provider": self.settings.ai_kyc_provider,
                "model": self.settings.sow_ai_extraction_model,
                "base_url": self.settings.ai_kyc_base_url,
                "prompt_tokens_estimate": estimate_tokens(prompt),
            },
        )
        log_kyc_verbose_text(logger, self.settings, "sow_extraction.qwen.prompt", prompt)
        started = time.monotonic()
        response_text = self._call_local_ai(prompt)
        parsed = self._json_object_from_response(response_text)
        normalized = self._normalize_ai_fields(parsed, fallback)
        enriched = self._enrich_fields(normalized, page_rows)
        result = SowStructuredExtraction(
            fields=enriched,
            provider="qwen",
            model=self.settings.sow_ai_extraction_model,
            status="complete",
            raw_response=response_text[:5000],
        )
        log_kyc_verbose(
            logger,
            self.settings,
            "sow_extraction.qwen.complete",
            {"latency_ms": round((time.monotonic() - started) * 1000), "fields": result.fields},
        )
        return result

    def _extract_with_qwen_text(self, source_text: str, fallback: dict[str, dict[str, Any]], *, source_name: str) -> SowStructuredExtraction:
        prompt = self._prompt(source_text)
        response_text = self._call_local_ai(prompt)
        parsed = self._json_object_from_response(response_text)
        normalized = self._normalize_ai_fields(parsed, fallback)
        return SowStructuredExtraction(
            fields=self._fields_without_page_validation(normalized, source_name=source_name),
            provider="qwen",
            model=self.settings.sow_ai_extraction_model,
            status="complete",
            raw_response=response_text[:5000],
        )

    def _call_openai(self, prompt: str) -> str:
        from openai import OpenAI

        client_kwargs: dict[str, Any] = {"api_key": self.settings.ai_kyc_api_key, "timeout": self.settings.ai_kyc_timeout_seconds}
        if self.settings.ai_kyc_base_url:
            client_kwargs["base_url"] = self.settings.ai_kyc_base_url
        if self.settings.ai_kyc_organization:
            client_kwargs["organization"] = self.settings.ai_kyc_organization
        if self.settings.ai_kyc_project:
            client_kwargs["project"] = self.settings.ai_kyc_project
        client = OpenAI(**client_kwargs)
        model = self.settings.sow_ai_extraction_model or self.settings.ai_kyc_model
        request_kwargs: dict[str, Any] = {
            "model": model,
            "input": prompt,
            "max_output_tokens": self.settings.sow_ai_extraction_max_output_tokens,
        }
        if not str(model).lower().startswith("gpt-5"):
            request_kwargs["temperature"] = 0
        response = client.responses.create(**request_kwargs)
        return getattr(response, "output_text", "") or ""

    def _prompt(self, source_text: str) -> str:
        return (
            f"{SOW_EXTRACTION_PROMPT}\n\n"
            "Use only the supplied SOW text. Do not use the filename as the client name. Do not invent missing values.\n"
            "Client name means the Customer/client/buyer receiving services. It must not be Tkxel, Consultant, vendor, provider, or service company.\n"
            "When evidence is weak, keep value null or empty and confidence 0.\n"
            "Expected JSON shape:\n"
            "{"
            "\"client_name\":{\"value\":null,\"confidence\":0},"
            "\"start_date\":{\"value\":null,\"confidence\":0},"
            "\"end_date\":{\"value\":null,\"confidence\":0},"
            "\"renewal_terms\":{\"value\":null,\"confidence\":0},"
            "\"notice_period\":{\"value\":null,\"confidence\":0},"
            "\"commercial_value\":{\"value\":null,\"currency\":null,\"confidence\":0},"
            "\"service_lines\":{\"value\":[],\"confidence\":0},"
            "\"stakeholders\":{\"value\":[],\"confidence\":0},"
            "\"deliverables\":{\"value\":[],\"confidence\":0},"
            "\"risks\":{\"value\":[],\"confidence\":0}"
            "}\n\n"
            f"SOW text:\n{source_text[:24000]}"
        )

    def _call_local_ai(self, prompt: str) -> str:
        endpoint = self._ollama_chat_endpoint()
        payload = {
            "model": self.settings.sow_ai_extraction_model,
            "format": "json",
            "messages": [
                {"role": "system", "content": "You extract SOW fields. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "think": False,
            "options": {
                "temperature": 0,
                "num_ctx": max(4096, int(getattr(self.settings, "ai_kyc_ollama_context_tokens", 4096) or 4096)),
                "num_predict": self.settings.sow_ai_extraction_max_output_tokens,
            },
        }
        request = UrlRequest(
            endpoint,
            data=json.dumps(payload, default=str).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=self.settings.sow_ai_extraction_timeout_seconds) as response:
            parsed = json.loads(response.read().decode("utf-8"))
        message = parsed.get("message") if isinstance(parsed, dict) else {}
        return str((message or {}).get("content") or "")

    def _fields_without_page_validation(self, fields: dict[str, dict[str, Any]], *, source_name: str = "uploaded source document") -> dict[str, dict[str, Any]]:
        normalized: dict[str, dict[str, Any]] = {}
        for key, field in fields.items():
            value = field.get("value")
            confidence = self._confidence(field.get("confidence"), 0)
            next_field = dict(field)
            next_field["confidence"] = confidence
            next_field["missing_evidence"] = None if self._has_value(value) else self._missing_evidence_note(key)
            next_field["conflicts"] = list(next_field.get("conflicts") or [])
            if self._has_value(value) and not isinstance(next_field.get("citation"), dict):
                next_field["citation"] = {
                    "document": source_name,
                    "source_file": source_name,
                    "page": None,
                    "page_number": None,
                    "excerpt": str(value)[:500],
                    "field_key": key,
                    "confidence": confidence,
                    "validation_status": "preview_unvalidated",
                }
            normalized[key] = next_field
        return normalized

    def _ollama_chat_endpoint(self) -> str:
        base = (self.settings.ai_kyc_base_url or "http://ollama:11434").rstrip("/")
        base = re.sub(r"/v1/?$", "", base)
        return f"{base}/api/chat"

    @staticmethod
    def _json_object_from_response(response_text: str) -> dict[str, Any]:
        text = response_text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text).strip()
            text = re.sub(r"```$", "", text).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                raise
            parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            raise ValueError("SOW extraction response must be a JSON object")
        return parsed

    def _normalize_ai_fields(self, parsed: dict[str, Any], fallback: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        normalized = {key: dict(value) for key, value in fallback.items()}
        for key in fallback:
            value = parsed.get(key)
            if value is None:
                value = parsed.get(key.replace("_", " "))
            if not isinstance(value, dict):
                continue
            candidate_value = value.get("value", fallback[key].get("value"))
            candidate_confidence = self._confidence(value.get("confidence"), fallback[key].get("confidence", 0))
            fallback_value = fallback[key].get("value")
            fallback_confidence = self._confidence(fallback[key].get("confidence"), 0)
            field_conflicts = list(normalized.get(key, {}).get("conflicts") or [])
            if self._has_value(fallback_value) and (not self._has_value(candidate_value) or candidate_confidence <= 0):
                continue
            if key == "client_name" and self._is_vendor_name(candidate_value):
                field_conflicts.append("AI returned Tkxel/vendor/provider as client name and the value was rejected.")
                normalized[key] = {
                    **fallback[key],
                    "conflicts": field_conflicts,
                }
                if not self._has_value(fallback_value) or self._is_vendor_name(fallback_value):
                    normalized[key]["value"] = None
                    normalized[key]["confidence"] = 0
                continue
            if self._has_value(fallback_value) and self._has_value(candidate_value) and not self._values_equivalent(fallback_value, candidate_value):
                field_conflicts.append(f"AI value conflicts with deterministic extraction: {fallback_value}")
            normalized[key] = {
                **fallback[key],
                "value": candidate_value,
                "confidence": candidate_confidence or fallback_confidence,
                "conflicts": field_conflicts,
            }
            if isinstance(value.get("citation"), dict):
                normalized[key]["citation"] = value.get("citation")
            if value.get("missing_evidence") is not None:
                normalized[key]["missing_evidence"] = value.get("missing_evidence")
            if key == "commercial_value":
                normalized[key]["currency"] = value.get("currency") or fallback[key].get("currency")
        return normalized

    def _enrich_fields(self, fields: dict[str, dict[str, Any]], page_rows: list[DocumentExtraction]) -> dict[str, dict[str, Any]]:
        enriched: dict[str, dict[str, Any]] = {}
        for key, field in fields.items():
            value = field.get("value")
            enriched_field = dict(field)
            confidence = self._confidence(enriched_field.get("confidence"), 0)
            enriched_field["confidence"] = confidence
            citation = self._validated_citation_for_field(key, value, field, page_rows, confidence=confidence)
            enriched_field["citation"] = citation
            enriched_field["missing_evidence"] = None if citation and self._has_value(value) else self._missing_evidence_note(key)
            enriched_field["conflicts"] = list(enriched_field.get("conflicts") or [])
            enriched[key] = enriched_field
        return enriched

    def _validated_citation_for_field(
        self,
        key: str,
        value: Any,
        field: dict[str, Any],
        page_rows: list[DocumentExtraction],
        *,
        confidence: int,
    ) -> dict[str, Any] | None:
        if not page_rows or not self._has_value(value):
            return None
        raw_citation = field.get("citation") if isinstance(field.get("citation"), dict) else None
        if raw_citation:
            cited = self._normalize_ai_citation(key, raw_citation, page_rows, confidence=confidence)
            if cited is not None:
                return cited
        return self._citation_for_field(key, value, page_rows, confidence=confidence)

    def _normalize_ai_citation(self, key: str, citation: dict[str, Any], page_rows: list[DocumentExtraction], *, confidence: int) -> dict[str, Any] | None:
        excerpt = re.sub(r"\s+", " ", str(citation.get("excerpt") or "")).strip()
        if not excerpt:
            return None
        target_page = citation.get("page") or citation.get("page_number")
        candidates = page_rows
        try:
            page_number = int(target_page)
            candidates = [row for row in page_rows if row.page_number == page_number] or page_rows
        except (TypeError, ValueError):
            page_number = None
        best_row = self._row_containing_excerpt(excerpt, candidates) or self._row_containing_excerpt(excerpt, page_rows)
        if best_row is None:
            return None
        return self._citation_payload(
            key=key,
            row=best_row,
            excerpt=self._excerpt_for_value(best_row.raw_text, [excerpt]) or excerpt[:500],
            confidence=confidence,
            validation_status="validated_ai_citation",
        )

    @staticmethod
    def _row_containing_excerpt(excerpt: str, page_rows: list[DocumentExtraction]) -> DocumentExtraction | None:
        excerpt_normalized = re.sub(r"\s+", " ", excerpt).strip().lower()
        if not excerpt_normalized:
            return None
        for row in page_rows:
            row_text = re.sub(r"\s+", " ", row.raw_text or "").strip().lower()
            if excerpt_normalized in row_text:
                return row
        return None

    def _citation_for_field(self, key: str, value: Any, page_rows: list[DocumentExtraction], *, confidence: int) -> dict[str, Any] | None:
        if not page_rows or not self._has_value(value):
            return None
        needles = self._citation_needles(key, value)
        best_row: DocumentExtraction | None = None
        best_score = -1
        for row in page_rows:
            text = (row.raw_text or "").lower()
            score = sum(1 for needle in needles if needle and needle.lower() in text)
            if score > best_score:
                best_score = score
                best_row = row
        if best_row is None or best_score <= 0:
            best_row = page_rows[0]
        excerpt = self._excerpt_for_value(best_row.raw_text, needles)
        return self._citation_payload(
            key=key,
            row=best_row,
            excerpt=excerpt,
            confidence=confidence,
            validation_status="derived_from_extracted_text" if best_score > 0 else "fallback_page_excerpt",
        )

    @staticmethod
    def _citation_payload(*, key: str, row: DocumentExtraction, excerpt: str, confidence: int, validation_status: str) -> dict[str, Any]:
        return {
            "document": row.source_file,
            "source_file": row.source_file,
            "document_id": row.document_id,
            "source_document_id": row.document_id,
            "document_extraction_id": row.id,
            "page": row.page_number,
            "page_number": row.page_number,
            "excerpt": excerpt[:1000],
            "field_key": key,
            "confidence": confidence,
            "validation_status": validation_status,
        }

    @staticmethod
    def _citation_needles(key: str, value: Any) -> list[str]:
        if isinstance(value, list):
            values = [str(item) for item in value[:3] if str(item).strip()]
        elif isinstance(value, (int, float)):
            values = [str(int(value)) if float(value).is_integer() else str(value), f"{value:,.0f}" if float(value).is_integer() else f"{value:,.2f}"]
        else:
            values = [str(value)]
        keyword_map = {
            "client_name": ["customer", "client", "by and between"],
            "start_date": ["start date", "engagement is"],
            "end_date": ["till", "until", "end date", "expiry"],
            "renewal_terms": ["renewed", "renewal", "non-renewal"],
            "notice_period": ["notice", "weeks prior", "days prior"],
            "commercial_value": ["monthly fee", "contract value", "sow value", "commercial"],
            "service_lines": ["resources", "scope of work", "software development"],
            "stakeholders": ["stakeholder", "sponsor", "product owner", "customer shall"],
            "deliverables": ["deliverables", "shall provide", "will support", "success measures"],
            "risks": ["risks", "key delivery risks", "dependency"],
        }
        return [*values, *keyword_map.get(key, [])]

    @staticmethod
    def _excerpt_for_value(text: str, needles: list[str]) -> str:
        normalized = re.sub(r"\s+", " ", text or "").strip()
        if not normalized:
            return ""
        lower = normalized.lower()
        for needle in needles:
            if not needle:
                continue
            index = lower.find(needle.lower())
            if index >= 0:
                start = max(0, index - 120)
                end = min(len(normalized), index + len(needle) + 180)
                return normalized[start:end].strip()
        return normalized[:260].strip()

    @staticmethod
    def _missing_evidence_note(key: str) -> str:
        labels = {
            "client_name": "Client/customer name was not supported by extracted SOW text.",
            "start_date": "Start date was not supported by extracted SOW text.",
            "end_date": "End date was not supported by extracted SOW text.",
            "renewal_terms": "Renewal terms were not supported by extracted SOW text.",
            "notice_period": "Notice period was not supported by extracted SOW text.",
            "commercial_value": "Commercial value was not supported by extracted SOW text.",
            "service_lines": "Service lines were not supported by extracted SOW text.",
            "stakeholders": "Stakeholders were not supported by extracted SOW text.",
            "deliverables": "Deliverables were not supported by extracted SOW text.",
            "risks": "Risks were not supported by extracted SOW text.",
        }
        return labels.get(key, "Field was not supported by extracted SOW text.")

    def _deterministic_extract(self, text: str) -> dict[str, dict[str, Any]]:
        return {
            "client_name": self._field(self._customer(text), 86),
            "start_date": self._field(self._date_from_timeframe(text, 1), 80),
            "end_date": self._field(self._date_from_timeframe(text, 2), 80),
            "renewal_terms": self._field(self._renewal_terms(text), 75),
            "notice_period": self._field(self._notice_period(text), 76),
            "commercial_value": self._commercial_value(text),
            "service_lines": self._field(self._service_lines(text), 72),
            "stakeholders": self._field(self._stakeholders(text), 68),
            "deliverables": self._field(self._deliverables(text), 70),
            "risks": self._field(self._risks(text), 70),
        }

    @staticmethod
    def _field(value: Any, confidence: int) -> dict[str, Any]:
        empty = not SowExtractionService._has_value(value)
        return {"value": value, "confidence": 0 if empty else confidence}

    @staticmethod
    def _has_value(value: Any) -> bool:
        return not (value is None or value == "" or value == () or (isinstance(value, list) and not value))

    @staticmethod
    def _is_vendor_name(value: Any) -> bool:
        text = str(value or "").lower()
        return any(marker in text for marker in ("tkxel", "tkxel llc", "tkxel inc", "tkxel pvt"))

    @staticmethod
    def _confidence(value: Any, fallback: Any) -> int:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            try:
                confidence = float(fallback or 0)
            except (TypeError, ValueError):
                confidence = 0
        if 0 < confidence <= 1:
            confidence *= 100
        return max(0, min(100, round(confidence)))

    @staticmethod
    def _values_equivalent(left: Any, right: Any) -> bool:
        def normalize(value: Any) -> str:
            if isinstance(value, list):
                return "|".join(sorted(re.sub(r"\s+", " ", str(item)).strip().lower() for item in value if str(item).strip()))
            if isinstance(value, (int, float)):
                return str(round(float(value), 2))
            return re.sub(r"\s+", " ", str(value or "")).strip().lower()

        return normalize(left) == normalize(right)

    @staticmethod
    def _customer(text: str) -> str | None:
        for pattern in (
            r"(?is)by\s+and\s+between\s+(.+?)\s*\([\"“']?\s*Customer\s*[\"”']?",
            r"(?im)^\s*(?:Account Name|Customer|Client)\s*(?:[:|]|\s+-\s+)\s*(.+?)\s*$",
        ):
            match = re.search(pattern, text)
            if match:
                candidate = SowExtractionService._clean_customer_candidate(match.group(1))
                if candidate:
                    return candidate
        return SowExtractionService._customer_from_sow_title(text)

    @staticmethod
    def _customer_from_sow_title(text: str) -> str | None:
        for line in SowExtractionService._content_lines(text)[:12]:
            match = re.search(r"(?i)\bstatement\s+of\s+work\b|\bsow\b", line)
            if not match:
                continue
            for candidate in (line[: match.start()], re.sub(r"(?i)^for\s+", "", line[match.end() :])):
                cleaned = SowExtractionService._clean_customer_candidate(candidate)
                if cleaned:
                    return cleaned
        return None

    @staticmethod
    def _clean_customer_candidate(value: Any) -> str | None:
        cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" -|,.;:")
        if not cleaned or len(cleaned) < 2 or len(cleaned) > 120:
            return None
        lower = cleaned.lower()
        if lower == "this":
            return None
        if not re.search(r"[a-z]", lower):
            return None
        if any(
            marker in lower
            for marker in (
                "statement of work",
                "prepared",
                "project",
                "baseline",
                "scope",
                "contract",
                "agreement",
                "dedicated",
                "team",
            )
        ):
            return None
        if SowExtractionService._is_vendor_name(cleaned):
            return None
        return cleaned[:180]

    @staticmethod
    def _content_lines(text: str) -> list[str]:
        lines = []
        for line in text.splitlines():
            cleaned = re.sub(r"\s+", " ", line or "").strip()
            if not cleaned or cleaned.lower().startswith("source:") or cleaned.startswith("["):
                continue
            lines.append(cleaned)
        return lines

    @staticmethod
    def _date_from_timeframe(text: str, group: int) -> str | None:
        match = re.search(r"(?is)start\s+date\s+of\s+engagement\s+is\s+(\d{1,2}/\d{1,2}/\d{4})\s+(?:till|until|through|to)\s+(\d{1,2}/\d{1,2}/\d{4})", text)
        if match:
            return match.group(group)
        label = "Start Date" if group == 1 else "End Date"
        label_match = re.search(rf"(?im)^\s*{re.escape(label)}\s*(?:[:|]|\s+-\s+)\s*(.+?)\s*$", text)
        if not label_match:
            return None
        date_match = re.search(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}", label_match.group(1))
        return date_match.group(0) if date_match else None

    @staticmethod
    def _renewal_terms(text: str) -> str | None:
        match = re.search(r"(?is)(?:Term:)?\s*This SOW shall.*?(?:expiry of the Term|expiry).*?\.", text)
        return re.sub(r"\s+", " ", match.group(0)).strip() if match else None

    @staticmethod
    def _notice_period(text: str) -> str | None:
        match = re.search(r"(?is)(\w+|\d+)\s*\(?\d*\)?\s+weeks?\s+prior\s+to\s+expiry", text)
        return f"{match.group(0).strip()} ({SowExtractionService._notice_days(match.group(1))} days)" if match else None

    @staticmethod
    def _notice_days(raw: str) -> int | None:
        words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
        weeks = int(raw) if raw.isdigit() else words.get(raw.lower())
        return weeks * 7 if weeks else None

    @staticmethod
    def _commercial_value(text: str) -> dict[str, Any]:
        match = re.search(r"(?im)^\s*(?:Applicable monthly fee|Total monthly fee|Contract Value|SOW Value)\s*(?:[:|]|\s+-\s+)\s*(?:([A-Z]{3})\s*)?\$?\s*([\d,]+(?:\.\d+)?)", text)
        if not match:
            return {"value": None, "currency": None, "confidence": 0}
        return {"value": float(match.group(2).replace(",", "")), "currency": match.group(1) or "USD", "confidence": 82}

    @staticmethod
    def _service_lines(text: str) -> list[str]:
        return infer_service_lines_from_text(text)

    @staticmethod
    def _stakeholders(text: str) -> list[str]:
        section = re.search(r"(?is)Stakeholders?\s*[:\n]\s*(.+?)(?=\n\s*(?:Deliverables?|Risks?|Assumptions?|Service Lines?|Commercial|Start Date|End Date)\s*:|\Z)", text)
        if section:
            items = [item.strip(" -•\t\r") for item in re.split(r"[\n;•]+", section.group(1)) if item.strip(" -•\t\r")]
            return items[:12]
        return [line.strip() for line in re.findall(r"(?im)^(?:Name|Title|Customer shall identify|Client has to).*", text)[:12]]

    @staticmethod
    def _deliverables(text: str) -> list[str]:
        matches = re.findall(r"(?is)(?:shall provide|will support|support)\s+(.+?)(?:\.|\n)", text)
        return [re.sub(r"\s+", " ", item).strip()[:500] for item in matches[:10]]

    @staticmethod
    def _risks(text: str) -> list[str]:
        match = re.search(r"(?is)(?:risks?|key delivery risks)\s*[:\n]\s*(.+?)(?=\n\s*\d+\.|\n\s*[A-Z][A-Za-z ]{2,70}\s*[:\n]|\Z)", text)
        if not match:
            return []
        return [item.strip(" .") for item in re.split(r"[,;\n•]+", match.group(1)) if item.strip(" .")][:12]

    def _page_rows(self, document_id: str) -> list[DocumentExtraction]:
        return list(
            self.db.query(DocumentExtraction)
            .filter(DocumentExtraction.document_id == document_id)
            .order_by(DocumentExtraction.page_number)
        )

    def _store_result(self, extraction: SourceDocumentExtraction, result: SowStructuredExtraction, page_rows: list[DocumentExtraction]) -> None:
        metadata = dict(extraction.metadata_json or {})
        metadata[STRUCTURED_SOW_METADATA_KEY] = {
            "status": result.status,
            "provider": result.provider,
            "model": result.model,
            "fields": result.fields,
            "missing_fields": self._missing_fields(result.fields),
            "conflicts": self._field_conflicts(result.fields),
            "error_message": result.error_message,
            "raw_response": result.raw_response,
            "page_row_ids": [row.id for row in page_rows],
            "prompt": SOW_EXTRACTION_PROMPT,
            "stored_at": datetime.now(timezone.utc).isoformat(),
        }
        extraction.metadata_json = metadata
        self.db.flush()

    @staticmethod
    def _missing_fields(fields: dict[str, dict[str, Any]]) -> list[str]:
        return [
            key
            for key, field in fields.items()
            if not SowExtractionService._has_value(field.get("value")) or bool(field.get("missing_evidence"))
        ]

    @staticmethod
    def _field_conflicts(fields: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
        conflicts: list[dict[str, str]] = []
        for key, field in fields.items():
            for conflict in field.get("conflicts") or []:
                conflicts.append({"field_key": key, "message": str(conflict)})
        return conflicts
