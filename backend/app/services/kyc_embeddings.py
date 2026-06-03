from __future__ import annotations

import hashlib
import math
from typing import Protocol

from app.config import get_settings


class EmbeddingClient(Protocol):
    provider: str
    model: str

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector for each text."""


class KycEmbeddingConfigurationError(RuntimeError):
    pass


class LocalHashEmbeddingClient:
    """Deterministic local embeddings for tests and offline fallback."""

    provider = "local_hash"

    def __init__(self, *, dimensions: int = 64, model: str = "local-hash-v1") -> None:
        self.dimensions = max(16, min(dimensions, 512))
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        words = [word.strip().lower() for word in text.split() if word.strip()]
        if not words:
            return vector
        for word in words:
            digest = hashlib.sha256(word.encode("utf-8")).digest()
            index = int.from_bytes(digest[:2], "big") % self.dimensions
            direction = 1.0 if digest[2] % 2 else -1.0
            vector[index] += direction
        return normalize_vector(vector)


class OpenAiEmbeddingClient:
    provider = "openai"

    def __init__(self, *, api_key: str | None = None, model: str | None = None, base_url: str | None = None) -> None:
        settings = get_settings()
        self.model = model or settings.ai_kyc_embedding_model
        self.api_key = api_key if api_key is not None else settings.ai_kyc_api_key
        self.base_url = base_url if base_url is not None else settings.ai_kyc_base_url
        if not self.api_key:
            raise KycEmbeddingConfigurationError("OpenAI embedding API key is not configured.")

    def embed(self, texts: list[str]) -> list[list[float]]:
        from openai import OpenAI

        client_kwargs = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        client = OpenAI(**client_kwargs)
        response = client.embeddings.create(model=self.model, input=texts)
        return [list(item.embedding) for item in response.data]


def build_embedding_client() -> EmbeddingClient:
    settings = get_settings()
    if not settings.ai_kyc_use_embeddings:
        return LocalHashEmbeddingClient(dimensions=settings.ai_kyc_embedding_dimensions)
    if settings.ai_kyc_embedding_provider == "openai":
        return OpenAiEmbeddingClient()
    return LocalHashEmbeddingClient(dimensions=settings.ai_kyc_embedding_dimensions)


def normalize_vector(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude <= 0:
        return vector
    return [value / magnitude for value in vector]


def cosine_similarity(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right:
        return 0.0
    length = min(len(left), len(right))
    if length == 0:
        return 0.0
    return sum(float(left[index]) * float(right[index]) for index in range(length))
