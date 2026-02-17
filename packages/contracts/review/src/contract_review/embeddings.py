"""Embedding providers for hybrid retrieval.

Auto-detection: call `auto_embedding_provider()` to get Jina if JINA_API_KEY
is set, or None for BM25-only fallback.
"""

from __future__ import annotations

import os

import httpx


def auto_embedding_provider() -> JinaEmbeddingProvider | None:
    """Return a Jina provider if JINA_API_KEY is set, else None (BM25-only)."""
    if os.environ.get("JINA_API_KEY"):
        return JinaEmbeddingProvider()
    return None


class JinaEmbeddingProvider:
    """Jina AI embeddings via their v1/embeddings API.

    Implements the EmbeddingProvider protocol from retrieval.py.
    Uses jina-embeddings-v3 with asymmetric task hints:
      - retrieval.query  for search queries
      - retrieval.passage for document chunks (with late_chunking)

    Settings:
      - 1024 dims (full quality — storage is irrelevant for per-contract runs)
      - normalized: true so cosine similarity = dot product
      - late_chunking: true for passages — each chunk embedding is conditioned
        on surrounding chunks from the same document
      - truncate: true as safety net (chunks should already be <8192 tokens)
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = "jina-embeddings-v3",
        dimensions: int = 1024,
    ) -> None:
        self._api_key = api_key or os.environ.get("JINA_API_KEY", "")
        if not self._api_key:
            raise ValueError("JINA_API_KEY not set")
        self._model = model
        self._dimensions = dimensions
        self._client = httpx.Client(
            base_url="https://api.jina.ai",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _embed(
        self,
        inputs: list[str],
        *,
        task: str,
        late_chunking: bool = False,
    ) -> list[list[float]]:
        body: dict[str, object] = {
            "input": inputs,
            "model": self._model,
            "task": task,
            "dimensions": self._dimensions,
            "normalized": True,
            "truncate": True,
        }
        if late_chunking:
            body["late_chunking"] = True

        resp = self._client.post("/v1/embeddings", json=body)
        resp.raise_for_status()
        data = resp.json()["data"]
        # Sort by index to guarantee order matches input order
        data.sort(key=lambda d: d["index"])
        return [d["embedding"] for d in data]

    def embed_query(self, query: str) -> list[float]:
        results = self._embed([query], task="retrieval.query")
        return results[0]

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        if not passages:
            return []
        # With late_chunking, total tokens across all inputs must fit in 8192.
        # At ~1800 chars/chunk (~450 tokens), ~18 chunks fit per late-chunking batch.
        # Without late_chunking, each input gets its own 8192-token budget.
        late_batch_size = 16
        large_batch_size = 256
        all_embeddings: list[list[float]] = []

        # First pass: try late_chunking in small batches (same-document context)
        for i in range(0, len(passages), late_batch_size):
            batch = passages[i : i + late_batch_size]
            try:
                all_embeddings.extend(
                    self._embed(batch, task="retrieval.passage", late_chunking=True)
                )
            except httpx.HTTPStatusError:
                # If late_chunking fails (token budget exceeded), fall back
                for j in range(0, len(batch), large_batch_size):
                    sub = batch[j : j + large_batch_size]
                    all_embeddings.extend(
                        self._embed(sub, task="retrieval.passage", late_chunking=False)
                    )
        return all_embeddings
