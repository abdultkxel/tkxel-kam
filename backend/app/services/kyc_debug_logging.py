from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any


VERBOSE_LOG_PREFIX = "[AI_KYC_VERBOSE]"


def kyc_verbose_enabled(settings: Any) -> bool:
    return bool(getattr(settings, "ai_kyc_verbose_logging", False))


def log_kyc_verbose(logger: Any, settings: Any, event: str, payload: Any) -> None:
    if not kyc_verbose_enabled(settings):
        return
    logger.warning("%s %s\n%s", VERBOSE_LOG_PREFIX, event, _truncate(_json_dumps(payload), settings))


def log_kyc_verbose_text(logger: Any, settings: Any, event: str, text: str) -> None:
    if not kyc_verbose_enabled(settings):
        return
    logger.warning("%s %s\n%s", VERBOSE_LOG_PREFIX, event, _truncate(text, settings))


def _truncate(value: str, settings: Any) -> str:
    max_chars = int(getattr(settings, "ai_kyc_verbose_log_max_chars", 60000) or 0)
    if max_chars <= 0 or len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}\n...[truncated {len(value) - max_chars} chars; increase AI_KYC_VERBOSE_LOG_MAX_CHARS to see more]"


def _json_dumps(payload: Any) -> str:
    return json.dumps(_normalize(payload), default=str, ensure_ascii=False, indent=2, sort_keys=True)


def _normalize(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            key_string = str(key)
            if key_string == "embedding" and isinstance(item, (list, tuple)):
                normalized[key_string] = f"[redacted embedding vector: {len(item)} dimensions]"
                continue
            normalized[key_string] = _normalize(item)
        return normalized
    if isinstance(value, (list, tuple, set)):
        return [_normalize(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "model_dump"):
        return _normalize(value.model_dump())
    if hasattr(value, "__dict__") and not isinstance(value, type):
        return _normalize(vars(value))
    return value
