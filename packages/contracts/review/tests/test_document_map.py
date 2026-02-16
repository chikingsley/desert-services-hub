from __future__ import annotations

from contract_review.document_map import build_document_map


def test_build_document_map_sections_and_pages() -> None:
    text = """--- Page 1 ---
# Master Agreement
This subcontract agreement applies to SWPPP services.

Contractor and Subcontractor agree to terms.

--- Page 2 ---
# Scope of Work
Provide 60 inspections every two weeks.

Inspect within 24 hours after rain events greater than 0.5 inches.
"""
    result = build_document_map(text, source_name="sample.md", max_chunk_chars=1400)

    assert result.source_name == "sample.md"
    assert result.page_count == 2
    assert len(result.sections) >= 2
    assert result.sections[0].title == "Master Agreement"
    assert result.sections[1].title == "Scope of Work"
    assert result.sections[1].page_start == 2
    assert result.sections[1].page_end == 2


def test_chunking_creates_multiple_chunks_with_overlap() -> None:
    text = """--- Page 1 ---
# Scope of Work
Paragraph one with inspection quantity language and payment terms net 30.

Paragraph two with frequency every two weeks and periodic reports.

Paragraph three with rainfall-trigger language within 24 hours.
"""
    result = build_document_map(
        text,
        source_name="scope.md",
        max_chunk_chars=120,
        overlap_paragraphs=1,
    )

    assert len(result.chunks) >= 2
    assert all(chunk.section_title == "Scope of Work" for chunk in result.chunks)
    assert any("inspection" in " ".join(chunk.anchor_terms) for chunk in result.chunks)
    assert result.chunks[1].text.startswith("Paragraph two") or "Paragraph two" in result.chunks[1].text
