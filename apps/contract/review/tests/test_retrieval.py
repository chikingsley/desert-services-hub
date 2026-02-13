from __future__ import annotations

from contract_review.models import DocumentChunk
from contract_review.retrieval import HybridRetriever


class _DummyEmbeddingProvider:
    def embed_query(self, query: str) -> list[float]:
        if "risk transfer" in query.lower():
            return [1.0, 0.0]
        return [0.0, 1.0]

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in passages:
            if "indemnify" in text.lower() or "liability" in text.lower():
                vectors.append([1.0, 0.0])
            else:
                vectors.append([0.0, 1.0])
        return vectors


def _chunks() -> list[DocumentChunk]:
    return [
        DocumentChunk(
            chunk_id="section-001-chunk-001",
            section_id="section-001",
            section_title="General Terms",
            chunk_index=1,
            page_start=1,
            page_end=1,
            text="This section includes payment terms net 30 and invoicing windows.",
            anchor_terms=["payment", "terms", "net", "invoicing"],
        ),
        DocumentChunk(
            chunk_id="section-002-chunk-001",
            section_id="section-002",
            section_title="Scope",
            chunk_index=1,
            page_start=2,
            page_end=2,
            text=(
                "Provide 60 inspections every two weeks and inspect within 24 hours "
                "after rainfall events."
            ),
            anchor_terms=["inspections", "weeks", "rainfall"],
        ),
        DocumentChunk(
            chunk_id="section-003-chunk-001",
            section_id="section-003",
            section_title="Indemnity",
            chunk_index=1,
            page_start=3,
            page_end=3,
            text="Subcontractor shall indemnify and hold harmless contractor for liability claims.",
            anchor_terms=["indemnify", "liability", "harmless"],
        ),
    ]


def test_lexical_retrieval_prioritizes_relevant_chunk() -> None:
    retriever = HybridRetriever(_chunks())
    hits = retriever.retrieve("inspection quantity every two weeks", top_k=2)

    assert hits
    assert hits[0].chunk_id == "section-002-chunk-001"
    assert hits[0].lexical_score > 0


def test_vector_retrieval_influences_ranking() -> None:
    retriever = HybridRetriever(_chunks(), embedding_provider=_DummyEmbeddingProvider())
    hits = retriever.retrieve(
        "risk transfer obligations",
        top_k=2,
        lexical_weight=0.1,
        vector_weight=0.9,
    )

    assert hits
    assert hits[0].chunk_id == "section-003-chunk-001"
    assert hits[0].vector_score > 0
