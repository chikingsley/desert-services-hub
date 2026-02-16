"""Shared models for map/retrieval-oriented contract review workflow."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["critical", "warning", "info"]


class DocumentSection(BaseModel):
    """A deterministic section extracted from contract markdown."""

    model_config = ConfigDict(extra="forbid")

    section_id: str
    title: str
    page_start: int
    page_end: int
    line_start: int
    line_end: int
    text: str


class DocumentChunk(BaseModel):
    """A retrieval chunk derived from a section."""

    model_config = ConfigDict(extra="forbid")

    chunk_id: str
    section_id: str
    section_title: str
    chunk_index: int
    page_start: int
    page_end: int
    text: str
    anchor_terms: list[str] = Field(default_factory=list)


class DocumentMap(BaseModel):
    """Structured map of a contract document."""

    model_config = ConfigDict(extra="forbid")

    source_name: str | None = None
    page_count: int
    has_page_markers: bool
    sections: list[DocumentSection]
    chunks: list[DocumentChunk]


class CandidateHit(BaseModel):
    """One candidate chunk returned by retrieval."""

    model_config = ConfigDict(extra="forbid")

    chunk_id: str
    section_id: str
    section_title: str
    page_start: int
    page_end: int
    text_excerpt: str
    query: str
    matched_query_terms: list[str] = Field(default_factory=list)
    query_term_coverage: float
    lexical_score: float
    vector_score: float
    score: float
