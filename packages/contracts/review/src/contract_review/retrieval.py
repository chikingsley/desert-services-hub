"""Hybrid retrieval over document-map chunks."""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

from contract_review.models import CandidateHit, DocumentChunk

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]{1,}", re.IGNORECASE)
_EXCERPT_LIMIT = 320
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "with",
    "within",
}


class EmbeddingProvider(Protocol):
    """Interface for embedding-backed retrieval."""

    def embed_query(self, query: str) -> list[float]:
        """Embed one query string."""

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        """Embed multiple passage strings."""


def _tokenize(text: str) -> list[str]:
    tokens = [match.group(0).lower() for match in _TOKEN_RE.finditer(text)]
    return [token for token in tokens if token not in _STOPWORDS]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0

    dot = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


def _normalize_scores(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    max_v = max(values.values())
    min_v = min(values.values())
    if math.isclose(max_v, min_v):
        if math.isclose(max_v, 0.0):
            return dict.fromkeys(values, 0.0)
        return dict.fromkeys(values, 1.0)
    scale = max_v - min_v
    return {key: (value - min_v) / scale for key, value in values.items()}


@dataclass(slots=True)
class _ChunkStats:
    term_freq: Counter[str]
    length: int


class HybridRetriever:
    """BM25-style lexical retrieval with optional embedding rescoring."""

    def __init__(
        self,
        chunks: list[DocumentChunk],
        *,
        embedding_provider: EmbeddingProvider | None = None,
    ) -> None:
        self._chunks = chunks
        self._embedding_provider = embedding_provider

        self._stats: dict[str, _ChunkStats] = {}
        self._doc_freq: Counter[str] = Counter()
        self._avg_length = 0.0
        self._chunk_embeddings: dict[str, list[float]] | None = None

        total_length = 0
        for chunk in chunks:
            terms = _tokenize(chunk.text)
            term_freq = Counter(terms)
            self._stats[chunk.chunk_id] = _ChunkStats(term_freq=term_freq, length=max(1, len(terms)))
            total_length += max(1, len(terms))
            self._doc_freq.update(set(terms))

        self._avg_length = total_length / max(1, len(chunks))

    def _idf(self, term: str) -> float:
        n_docs = max(1, len(self._chunks))
        df = self._doc_freq.get(term, 0)
        return math.log(1.0 + ((n_docs - df + 0.5) / (df + 0.5)))

    def _lexical_scores(self, query: str, *, k1: float = 1.6, b: float = 0.75) -> dict[str, float]:
        query_terms = _tokenize(query)
        if not query_terms:
            return {}

        scores: dict[str, float] = {}
        for chunk in self._chunks:
            stat = self._stats[chunk.chunk_id]
            score = 0.0
            for term in query_terms:
                tf = stat.term_freq.get(term, 0)
                if tf == 0:
                    continue
                idf = self._idf(term)
                norm = tf + k1 * (1.0 - b + b * (stat.length / self._avg_length))
                score += idf * ((tf * (k1 + 1.0)) / norm)
            if score > 0:
                scores[chunk.chunk_id] = score
        return scores

    def _query_term_matches(self, query: str) -> dict[str, tuple[list[str], float]]:
        query_terms = sorted(set(_tokenize(query)))
        if not query_terms:
            return {}

        hits: dict[str, tuple[list[str], float]] = {}
        for chunk in self._chunks:
            stat = self._stats[chunk.chunk_id]
            matched = [term for term in query_terms if stat.term_freq.get(term, 0) > 0]
            if not matched:
                continue
            coverage = len(matched) / len(query_terms)
            hits[chunk.chunk_id] = (matched, coverage)
        return hits

    def _ensure_embeddings(self) -> dict[str, list[float]]:
        if self._embedding_provider is None:
            return {}
        if self._chunk_embeddings is not None:
            return self._chunk_embeddings

        vectors = self._embedding_provider.embed_passages([chunk.text for chunk in self._chunks])
        self._chunk_embeddings = {
            chunk.chunk_id: vector
            for chunk, vector in zip(self._chunks, vectors, strict=False)
        }
        return self._chunk_embeddings

    def _vector_scores(self, query: str) -> dict[str, float]:
        if self._embedding_provider is None:
            return {}
        chunk_embeddings = self._ensure_embeddings()
        if not chunk_embeddings:
            return {}

        query_vector = self._embedding_provider.embed_query(query)
        scores: dict[str, float] = {}
        for chunk in self._chunks:
            chunk_vector = chunk_embeddings.get(chunk.chunk_id)
            if chunk_vector is None:
                continue
            similarity = _cosine_similarity(query_vector, chunk_vector)
            if similarity > 0:
                scores[chunk.chunk_id] = similarity
        return scores

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 8,
        lexical_k: int = 40,
        vector_k: int = 40,
        lexical_weight: float = 0.65,
        vector_weight: float = 0.35,
    ) -> list[CandidateHit]:
        """Retrieve top candidate chunks for one query."""
        if top_k <= 0:
            return []

        lexical_raw = self._lexical_scores(query)
        vector_raw = self._vector_scores(query)
        term_matches = self._query_term_matches(query)

        lexical_top_ids = {
            key
            for key, _ in sorted(
                lexical_raw.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:lexical_k]
        }
        vector_top_ids = {
            key
            for key, _ in sorted(
                vector_raw.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:vector_k]
        }

        candidate_ids = lexical_top_ids | vector_top_ids
        if not candidate_ids:
            return []

        lexical_norm = _normalize_scores({k: v for k, v in lexical_raw.items() if k in candidate_ids})
        vector_norm = _normalize_scores({k: v for k, v in vector_raw.items() if k in candidate_ids})

        by_id = {chunk.chunk_id: chunk for chunk in self._chunks}
        hits: list[CandidateHit] = []
        for chunk_id in candidate_ids:
            chunk = by_id.get(chunk_id)
            if chunk is None:
                continue

            lexical_score = lexical_norm.get(chunk_id, 0.0)
            vector_score = vector_norm.get(chunk_id, 0.0)
            matched_terms, coverage = term_matches.get(chunk_id, ([], 0.0))
            if vector_raw:
                total = lexical_weight * lexical_score + vector_weight * vector_score
            else:
                total = lexical_score

            excerpt = chunk.text[:_EXCERPT_LIMIT].strip()
            hits.append(
                CandidateHit(
                    chunk_id=chunk.chunk_id,
                    section_id=chunk.section_id,
                    section_title=chunk.section_title,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    text_excerpt=excerpt,
                    query=query,
                    matched_query_terms=matched_terms,
                    query_term_coverage=round(coverage, 6),
                    lexical_score=round(lexical_score, 6),
                    vector_score=round(vector_score, 6),
                    score=round(total, 6),
                )
            )

        hits.sort(key=lambda item: item.score, reverse=True)
        return hits[:top_k]
