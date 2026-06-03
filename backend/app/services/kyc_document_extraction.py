from __future__ import annotations

import hashlib
import mimetypes
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import SourceDocument, SourceDocumentChunk, SourceDocumentExtraction


TOKEN_WORD_RATIO = 1.35


@dataclass(frozen=True)
class ExtractedText:
    raw_text: str
    normalized_text: str
    page_count: int
    metadata: dict[str, Any]
    ocr_status: str | None = None
    ocr_engine: str | None = None


class KycDocumentExtractionService:
    extractor_name = "local-document-extractor"
    extractor_version = "v1"

    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def extract_document(self, document: SourceDocument, *, force: bool = False) -> SourceDocumentExtraction:
        latest = self.latest_extraction(document.id)
        if latest and latest.status == "completed" and not force:
            return latest

        now = datetime.now(timezone.utc)
        document.extraction_status = "running"
        document.extraction_started_at = now
        document.extraction_error = None
        path = self._document_path(document)
        extraction = SourceDocumentExtraction(
            source_document_id=document.id,
            status="running",
            extractor_name=self.extractor_name,
            extractor_version=self.extractor_version,
            mime_type=document.mime_type or self._guess_mime_type(document),
            started_at=now,
        )
        self.db.add(extraction)
        self.db.flush()

        if not self.settings.kyc_document_extraction_enabled:
            return self._finish_failure(document, extraction, "Document extraction is disabled.", status_value="failed")
        if path is None:
            return self._finish_failure(document, extraction, "No readable stored file path is available for this source document.", status_value="failed")
        if not path.exists():
            return self._finish_failure(document, extraction, f"Stored source document file was not found: {path.name}", status_value="failed")
        if path.stat().st_size > self.settings.kyc_document_extraction_max_file_mb * 1024 * 1024:
            return self._finish_failure(document, extraction, "Source document exceeds the configured extraction file-size limit.", status_value="failed")

        try:
            data = path.read_bytes()
            document.checksum_sha256 = hashlib.sha256(data).hexdigest()
            document.size_bytes = len(data)
            document.mime_type = document.mime_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            result = self._extract_by_type(path, document.mime_type)
        except Exception as exc:  # pragma: no cover - library boundary guard
            return self._finish_failure(document, extraction, f"Document extraction failed: {str(exc)[:400]}", status_value="failed")

        extraction.status = "completed"
        extraction.raw_text = result.raw_text
        extraction.normalized_text = result.normalized_text
        extraction.page_count = result.page_count
        extraction.metadata_json = result.metadata
        extraction.completed_at = datetime.now(timezone.utc)
        document.pages = result.page_count or document.pages
        document.extracted_text_checksum = hashlib.sha256(result.normalized_text.encode("utf-8")).hexdigest() if result.normalized_text else None
        document.extraction_status = "completed"
        document.extraction_completed_at = extraction.completed_at
        document.ocr_status = result.ocr_status
        document.ocr_engine = result.ocr_engine
        self.db.flush()
        return extraction

    def latest_extraction(self, source_document_id: str) -> SourceDocumentExtraction | None:
        return self.db.scalar(
            select(SourceDocumentExtraction)
            .where(SourceDocumentExtraction.source_document_id == source_document_id)
            .order_by(SourceDocumentExtraction.created_at.desc())
            .limit(1)
        )

    def chunks_for_document(self, source_document_id: str) -> list[SourceDocumentChunk]:
        return list(
            self.db.scalars(
                select(SourceDocumentChunk)
                .where(SourceDocumentChunk.source_document_id == source_document_id)
                .order_by(SourceDocumentChunk.chunk_index)
            )
        )

    def ensure_chunks(self, document: SourceDocument, *, force: bool = False) -> list[SourceDocumentChunk]:
        existing = self.chunks_for_document(document.id)
        if existing and not force:
            return existing
        extraction = self.extract_document(document, force=force) if self._document_path(document) else self.latest_extraction(document.id)
        return self.chunk_document(document, extraction=extraction, force=True)

    def chunk_document(self, document: SourceDocument, *, extraction: SourceDocumentExtraction | None = None, force: bool = False) -> list[SourceDocumentChunk]:
        if force:
            self.db.execute(delete(SourceDocumentChunk).where(SourceDocumentChunk.source_document_id == document.id))
            self.db.flush()

        text = (extraction.normalized_text if extraction else None) or ""
        chunks = self._chunk_text(text, chunk_size_tokens=self.settings.ai_kyc_chunk_size_tokens, overlap_tokens=self.settings.ai_kyc_chunk_overlap_tokens)
        if not chunks:
            chunks = self._chunks_from_citations(document)
        records: list[SourceDocumentChunk] = []
        for index, chunk in enumerate(chunks):
            chunk_hash = hashlib.sha256(chunk["text"].encode("utf-8")).hexdigest()
            record = SourceDocumentChunk(
                source_document_id=document.id,
                extraction_id=extraction.id if extraction else None,
                account_id=document.account_id,
                engagement_id=document.engagement_id,
                chunk_index=index,
                chunk_text=chunk["text"],
                chunk_hash=chunk_hash,
                page_number=chunk.get("page_number"),
                section_label=chunk.get("section_label"),
                start_offset=chunk.get("start_offset"),
                end_offset=chunk.get("end_offset"),
                token_count=estimate_tokens(chunk["text"]),
                sensitivity_level="sensitive" if document.is_sensitive else "standard",
                source_type=document.source_type,
                trust_score=source_trust_score(document.source_type, is_sensitive=document.is_sensitive),
                metadata_json={"source_title": document.title, **chunk.get("metadata", {})},
            )
            self.db.add(record)
            records.append(record)
        self.db.flush()
        return records

    def _extract_by_type(self, path: Path, mime_type: str | None) -> ExtractedText:
        suffix = path.suffix.lower()
        if suffix == ".pdf" or mime_type == "application/pdf":
            return self._extract_pdf(path)
        if suffix == ".docx" or mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return self._extract_docx(path)
        if suffix in {".txt", ".csv"} or (mime_type or "").startswith("text/"):
            return self._extract_text(path)
        raise ValueError(f"Unsupported source document type: {suffix or mime_type or 'unknown'}")

    def _extract_pdf(self, path: Path) -> ExtractedText:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages: list[str] = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        raw = "\n\n".join(pages)
        normalized = normalize_text(raw)
        metadata = {"pages": [{"page_number": index + 1, "char_count": len(value)} for index, value in enumerate(pages)]}
        if len(normalized) >= self.settings.kyc_ocr_min_text_chars or not self.settings.kyc_ocr_enabled:
            return ExtractedText(raw_text=raw, normalized_text=normalized, page_count=len(pages), metadata=metadata, ocr_status="not_required")
        ocr = self._ocr_pdf(path)
        if ocr is None:
            return ExtractedText(raw_text=raw, normalized_text=normalized, page_count=len(pages), metadata=metadata, ocr_status="ocr_required", ocr_engine=self.settings.kyc_ocr_engine)
        return ExtractedText(
            raw_text=ocr,
            normalized_text=normalize_text(ocr),
            page_count=len(pages),
            metadata={**metadata, "ocr_applied": True},
            ocr_status="completed",
            ocr_engine=self.settings.kyc_ocr_engine,
        )

    def _ocr_pdf(self, path: Path) -> str | None:
        if self.settings.kyc_ocr_engine != "tesseract":
            return None
        try:
            from pdf2image import convert_from_path
            import pytesseract
        except Exception:
            return None
        try:
            images = convert_from_path(str(path), dpi=200)
            return "\n\n".join(pytesseract.image_to_string(image) for image in images)
        except Exception:
            return None

    @staticmethod
    def _extract_docx(path: Path) -> ExtractedText:
        from docx import Document

        document = Document(str(path))
        parts: list[str] = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                values = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if values:
                    parts.append(" | ".join(values))
        raw = "\n".join(parts)
        return ExtractedText(raw_text=raw, normalized_text=normalize_text(raw), page_count=0, metadata={"paragraphs": len(parts)}, ocr_status="not_required")

    @staticmethod
    def _extract_text(path: Path) -> ExtractedText:
        raw = path.read_text(encoding="utf-8", errors="ignore")
        return ExtractedText(raw_text=raw, normalized_text=normalize_text(raw), page_count=0, metadata={"line_count": raw.count("\n") + 1}, ocr_status="not_required")

    def _finish_failure(self, document: SourceDocument, extraction: SourceDocumentExtraction, message: str, *, status_value: str) -> SourceDocumentExtraction:
        now = datetime.now(timezone.utc)
        extraction.status = status_value
        extraction.error_message = message
        extraction.completed_at = now
        document.extraction_status = status_value
        document.extraction_completed_at = now
        document.extraction_error = message
        self.db.flush()
        return extraction

    def _document_path(self, document: SourceDocument) -> Path | None:
        candidates = [document.storage_path, document.file_url]
        for candidate in candidates:
            if not candidate or str(candidate).startswith(("http://", "https://")):
                continue
            path = Path(candidate)
            if path.exists() or path.is_absolute():
                return path
            local_path = Path(self.settings.local_content_storage_dir) / candidate
            if local_path.exists():
                return local_path
        if document.file_name:
            local_path = Path(self.settings.local_content_storage_dir) / document.file_name
            if local_path.exists():
                return local_path
        return None

    @staticmethod
    def _guess_mime_type(document: SourceDocument) -> str | None:
        return mimetypes.guess_type(document.file_name or document.file_url or document.storage_path or "")[0]

    @staticmethod
    def _chunk_text(text: str, *, chunk_size_tokens: int, overlap_tokens: int) -> list[dict[str, Any]]:
        words = text.split()
        if not words:
            return []
        words_per_chunk = max(80, round(chunk_size_tokens / TOKEN_WORD_RATIO))
        overlap_words = max(0, min(round(overlap_tokens / TOKEN_WORD_RATIO), words_per_chunk // 2))
        chunks: list[dict[str, Any]] = []
        start = 0
        while start < len(words):
            end = min(len(words), start + words_per_chunk)
            chunk_text = " ".join(words[start:end]).strip()
            if chunk_text:
                chunks.append({"text": chunk_text, "start_offset": start, "end_offset": end})
            if end >= len(words):
                break
            start = max(end - overlap_words, start + 1)
        return chunks

    @staticmethod
    def _chunks_from_citations(document: SourceDocument) -> list[dict[str, Any]]:
        chunks = []
        for citation in document.citations:
            if not citation.excerpt:
                continue
            chunks.append(
                {
                    "text": citation.excerpt,
                    "page_number": citation.page_number,
                    "section_label": citation.label,
                    "metadata": {"field_key": citation.field_key, "citation_id": citation.id},
                }
            )
        return chunks


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def estimate_tokens(value: str) -> int:
    return max(1, round(len((value or "").split()) * TOKEN_WORD_RATIO))


def source_trust_score(source_type: str, *, is_sensitive: bool = False) -> int:
    mapping = {
        "sow": 100,
        "contract": 100,
        "msa": 100,
        "project_charter": 92,
        "engagement": 95,
        "commercial_note": 90,
        "governance": 80,
        "timeline": 80,
        "account_note": 70,
        "fathom": 70,
        "research": 65,
        "prior_kyc": 50,
    }
    score = mapping.get(source_type, 60)
    return min(100, score + 3) if is_sensitive and source_type in {"sow", "contract", "commercial_note"} else score
