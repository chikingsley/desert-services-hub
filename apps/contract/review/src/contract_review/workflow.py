"""LangGraph-based retrieval-first contract review workflow."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from contract_review.document_map import build_document_map
from contract_review.models import CandidateHit, DocumentMap
from contract_review.policies import PolicyFinding, PolicyRule, default_policy_catalog
from contract_review.retrieval import EmbeddingProvider, HybridRetriever


@dataclass(slots=True)
class ReviewState:
    source_name: str | None = None
    source_text: str = ""
    policies: list[PolicyRule] = field(default_factory=list)
    max_chunk_chars: int = 1800
    overlap_paragraphs: int = 1
    top_k_per_query: int = 6
    document_map: DocumentMap | None = None
    candidate_map: dict[str, list[CandidateHit]] = field(default_factory=dict)
    query_support_map: dict[str, int] = field(default_factory=dict)
    findings: list[PolicyFinding] = field(default_factory=list)


class ReviewResult(BaseModel):
    """Output payload for the Stage-1 retrieval coverage flow."""

    model_config = ConfigDict(extra="forbid")

    source_name: str | None = None
    document_map: DocumentMap
    findings: list[PolicyFinding] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContractReviewWorkflow:
    """Stateful workflow for document map + candidate retrieval."""

    def __init__(self, *, embedding_provider: EmbeddingProvider | None = None) -> None:
        self._embedding_provider = embedding_provider
        graph = StateGraph(ReviewState)
        graph.add_node("build_document_map", self._build_document_map_node)
        graph.add_node("retrieve_candidates", self._retrieve_candidates_node)
        graph.add_node("grade_coverage", self._grade_coverage_node)
        graph.set_entry_point("build_document_map")
        graph.add_edge("build_document_map", "retrieve_candidates")
        graph.add_edge("retrieve_candidates", "grade_coverage")
        graph.add_edge("grade_coverage", END)
        self._app = graph.compile()

    def _build_document_map_node(self, state: ReviewState) -> dict[str, Any]:
        doc_map = build_document_map(
            state.source_text,
            source_name=state.source_name,
            max_chunk_chars=state.max_chunk_chars,
            overlap_paragraphs=state.overlap_paragraphs,
        )
        return {"document_map": doc_map}

    def _retrieve_candidates_node(self, state: ReviewState) -> dict[str, Any]:
        if state.document_map is None:
            raise RuntimeError("document_map missing in workflow state")

        doc_map: DocumentMap = state.document_map
        retriever = HybridRetriever(
            doc_map.chunks,
            embedding_provider=self._embedding_provider,
        )
        top_k = state.top_k_per_query
        candidate_map: dict[str, list[CandidateHit]] = {}
        query_support_map: dict[str, int] = {}

        for policy in state.policies:
            merged_by_chunk: dict[str, CandidateHit] = {}
            query_support = 0
            for query in policy.queries:
                hits = retriever.retrieve(query, top_k=top_k)
                strong_hits = [
                    hit
                    for hit in hits
                    if hit.query_term_coverage >= policy.min_term_coverage
                ]
                if strong_hits:
                    query_support += 1
                for hit in hits:
                    current = merged_by_chunk.get(hit.chunk_id)
                    if current is None or hit.score > current.score:
                        merged_by_chunk[hit.chunk_id] = hit

            ranked_hits = sorted(merged_by_chunk.values(), key=lambda item: item.score, reverse=True)
            candidate_map[policy.rule_id] = ranked_hits[:top_k]
            query_support_map[policy.rule_id] = query_support

        return {"candidate_map": candidate_map, "query_support_map": query_support_map}

    def _grade_coverage_node(self, state: ReviewState) -> dict[str, Any]:
        findings: list[PolicyFinding] = []
        candidates = state.candidate_map
        query_support_map = state.query_support_map
        for policy in state.policies:
            hits = candidates.get(policy.rule_id, [])
            strong_hits = [
                hit
                for hit in hits
                if hit.query_term_coverage >= policy.min_term_coverage
            ]
            query_support = query_support_map.get(policy.rule_id, 0)

            if len(strong_hits) < policy.min_hits or query_support < policy.min_query_support:
                page_note = ""
                if state.document_map and not state.document_map.has_page_markers:
                    page_note = " Page markers are missing in source markdown."
                findings.append(
                    PolicyFinding(
                        rule_id=policy.rule_id,
                        title=policy.title,
                        severity=policy.severity_on_missing,
                        status="uncertain_missing_evidence",
                        summary=(
                            "Candidate evidence did not meet retrieval-quality thresholds. "
                            "Fail-closed: flag for review."
                            + page_note
                        ),
                        evidence=strong_hits[:policy.min_hits],
                    )
                )
                continue

            findings.append(
                PolicyFinding(
                    rule_id=policy.rule_id,
                    title=policy.title,
                    severity="info",
                    status="needs_judgement",
                    summary=(
                        f"Retrieved {len(strong_hits)} threshold-passing candidate chunk(s) "
                        f"from {query_support}/{len(policy.queries)} queries. "
                        "Proceed to LLM/human judgement with evidence."
                    ),
                    evidence=strong_hits,
                )
            )

        return {"findings": findings}

    def run(
        self,
        *,
        source_text: str,
        source_name: str | None = None,
        policies: list[PolicyRule] | None = None,
        max_chunk_chars: int = 1800,
        overlap_paragraphs: int = 1,
        top_k_per_query: int = 6,
    ) -> ReviewResult:
        selected_policies = policies or default_policy_catalog()
        initial_state = ReviewState(
            source_name=source_name,
            source_text=source_text,
            policies=selected_policies,
            max_chunk_chars=max_chunk_chars,
            overlap_paragraphs=overlap_paragraphs,
            top_k_per_query=top_k_per_query,
        )
        final_state = self._app.invoke(initial_state)
        if isinstance(final_state, ReviewState):
            document_map = final_state.document_map
            findings = final_state.findings
        elif isinstance(final_state, dict):
            document_map = final_state.get("document_map")
            findings = final_state.get("findings", [])
        else:
            raise RuntimeError("Unexpected workflow state type")

        if not isinstance(document_map, DocumentMap):
            raise RuntimeError("Workflow finished without document_map")

        return ReviewResult(
            source_name=source_name,
            document_map=document_map,
            findings=findings,
            metadata={
                "policy_count": len(selected_policies),
                "chunk_count": len(document_map.chunks),
                "section_count": len(document_map.sections),
                "has_page_markers": document_map.has_page_markers,
            },
        )
