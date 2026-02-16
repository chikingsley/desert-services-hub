"""Deterministic contract document map and chunk construction."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from contract_review.models import DocumentChunk, DocumentMap, DocumentSection

_PLUMBER_PAGE_RE = re.compile(r"^---\s*Page\s+(\d+)\s*---\s*$")
_OCR_PAGE_RE = re.compile(r"^<!--\s*Page\s+(\d+)\s*-->\s*$")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_CLAUSE_PREFIX_RE = re.compile(r"^(?P<num>\d{1,3}(?:\.\d{1,3}){0,3})\.?\s+(?P<rest>.+)$")
_ALLCAPS_HEADING_RE = re.compile(r"^[A-Z0-9][A-Z0-9\s&'(),./:-]{5,}$")
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]{2,}", re.IGNORECASE)

_STOPWORDS = {
    "about",
    "after",
    "against",
    "also",
    "among",
    "and",
    "are",
    "been",
    "being",
    "between",
    "both",
    "but",
    "can",
    "for",
    "from",
    "has",
    "have",
    "here",
    "into",
    "its",
    "may",
    "more",
    "not",
    "our",
    "shall",
    "should",
    "that",
    "the",
    "their",
    "there",
    "these",
    "this",
    "those",
    "under",
    "upon",
    "with",
    "within",
}


@dataclass(slots=True)
class _Line:
    number: int
    page: int
    text: str


@dataclass(slots=True)
class _Paragraph:
    text: str
    page_start: int
    page_end: int


@dataclass(slots=True)
class _SectionDraft:
    title: str
    lines: list[_Line]


def _extract_clause_heading(line: str) -> str | None:
    stripped = line.strip()
    match = _CLAUSE_PREFIX_RE.match(stripped)
    if not match:
        return None

    number = match.group("num").strip()
    rest = match.group("rest").strip()
    if not rest:
        return None

    # Many extracted clause lines are "4.1 Heading. Body text...".
    # Keep only the heading prefix before sentence body starts.
    heading_text = rest.split(". ", 1)[0].strip()
    if not heading_text:
        return None
    if not heading_text[0].isupper():
        return None
    if len(heading_text) > 100:
        return None
    return f"{number} {heading_text}".strip()


def _heading_title(line: str) -> str:
    stripped = line.strip()
    markdown_match = _HEADING_RE.match(stripped)
    if markdown_match:
        return markdown_match.group(2).strip()
    clause_heading = _extract_clause_heading(stripped)
    if clause_heading:
        return clause_heading
    return stripped


def _is_heading_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if _HEADING_RE.match(stripped):
        return True

    # Clause-like headings: "4.3 Time of Payment"
    if _extract_clause_heading(stripped):
        return True

    # Uppercase title blocks often appear in plain text extraction.
    if _ALLCAPS_HEADING_RE.match(stripped) and len(stripped) <= 120:
        alpha_count = sum(1 for ch in stripped if ch.isalpha())
        return alpha_count >= 6
    return False


def _parse_lines(markdown: str) -> tuple[list[_Line], int, bool]:
    page = 1
    max_page = 1
    has_markers = False
    lines: list[_Line] = []

    for number, raw in enumerate(markdown.splitlines(), start=1):
        line = raw.rstrip()
        stripped = line.strip()

        marker_match = _PLUMBER_PAGE_RE.match(stripped) or _OCR_PAGE_RE.match(stripped)
        if marker_match:
            page = int(marker_match.group(1))
            max_page = max(max_page, page)
            has_markers = True
            continue

        lines.append(_Line(number=number, page=page, text=line))

    if lines:
        max_page = max(max_page, max(item.page for item in lines))
    return lines, max_page, has_markers


def _split_sections(lines: list[_Line]) -> list[_SectionDraft]:
    if not lines:
        return []

    headings = [
        idx
        for idx, line in enumerate(lines)
        if _is_heading_line(line.text)
    ]
    if not headings:
        return [_SectionDraft(title="Document", lines=lines)]

    sections: list[_SectionDraft] = []
    start_idx = 0
    current_title = "Preamble"

    for heading_idx in headings:
        if heading_idx > start_idx:
            sections.append(_SectionDraft(title=current_title, lines=lines[start_idx:heading_idx]))

        heading_line = lines[heading_idx].text.strip()
        current_title = _heading_title(heading_line)
        start_idx = heading_idx

    if start_idx < len(lines):
        sections.append(_SectionDraft(title=current_title, lines=lines[start_idx:]))

    return [section for section in sections if any(line.text.strip() for line in section.lines)]


def _iter_paragraphs(lines: Iterable[_Line]) -> list[_Paragraph]:
    paragraphs: list[_Paragraph] = []
    buffer: list[_Line] = []

    def flush() -> None:
        if not buffer:
            return
        paragraphs.append(
            _Paragraph(
                text="\n".join(line.text for line in buffer).strip(),
                page_start=min(line.page for line in buffer),
                page_end=max(line.page for line in buffer),
            )
        )
        buffer.clear()

    for line in lines:
        if line.text.strip():
            buffer.append(line)
        else:
            flush()
    flush()
    return paragraphs


def _split_long_paragraph(paragraph: _Paragraph, max_chunk_chars: int) -> list[_Paragraph]:
    if len(paragraph.text) <= max_chunk_chars:
        return [paragraph]

    # Prefer sentence boundaries; fallback to hard character windows.
    sentences = re.split(r"(?<=[.!?])\s+", paragraph.text)
    parts: list[_Paragraph] = []
    current: list[str] = []
    current_len = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        projected = current_len + (1 if current else 0) + len(sentence)
        if current and projected > max_chunk_chars:
            parts.append(
                _Paragraph(
                    text=" ".join(current),
                    page_start=paragraph.page_start,
                    page_end=paragraph.page_end,
                )
            )
            current = [sentence]
            current_len = len(sentence)
            continue

        if not current and len(sentence) > max_chunk_chars:
            start = 0
            while start < len(sentence):
                end = min(start + max_chunk_chars, len(sentence))
                parts.append(
                    _Paragraph(
                        text=sentence[start:end].strip(),
                        page_start=paragraph.page_start,
                        page_end=paragraph.page_end,
                    )
                )
                start = end
            current_len = 0
            current = []
            continue

        current.append(sentence)
        current_len = projected

    if current:
        parts.append(
            _Paragraph(
                text=" ".join(current),
                page_start=paragraph.page_start,
                page_end=paragraph.page_end,
            )
        )

    return [part for part in parts if part.text]


def _anchor_terms(text: str, *, limit: int = 8) -> list[str]:
    counts: dict[str, int] = {}
    for match in _TOKEN_RE.finditer(text.lower()):
        token = match.group(0)
        if token in _STOPWORDS:
            continue
        counts[token] = counts.get(token, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [token for token, _ in ranked[:limit]]


def build_document_map(
    markdown: str,
    *,
    source_name: str | None = None,
    max_chunk_chars: int = 1800,
    overlap_paragraphs: int = 1,
) -> DocumentMap:
    """Build deterministic sections and retrieval chunks from contract markdown."""
    if max_chunk_chars < 120:
        msg = "max_chunk_chars must be >= 120"
        raise ValueError(msg)
    if overlap_paragraphs < 0:
        msg = "overlap_paragraphs must be >= 0"
        raise ValueError(msg)

    lines, page_count, has_page_markers = _parse_lines(markdown)
    section_drafts = _split_sections(lines)

    sections: list[DocumentSection] = []
    chunks: list[DocumentChunk] = []

    for section_index, section_draft in enumerate(section_drafts, start=1):
        section_id = f"section-{section_index:03d}"
        pages = [line.page for line in section_draft.lines]
        section_text = "\n".join(line.text for line in section_draft.lines).strip()

        section = DocumentSection(
            section_id=section_id,
            title=section_draft.title,
            page_start=min(pages),
            page_end=max(pages),
            line_start=section_draft.lines[0].number,
            line_end=section_draft.lines[-1].number,
            text=section_text,
        )
        sections.append(section)

        paragraphs = _iter_paragraphs(section_draft.lines)
        normalized_paragraphs: list[_Paragraph] = []
        for paragraph in paragraphs:
            normalized_paragraphs.extend(_split_long_paragraph(paragraph, max_chunk_chars))

        if not normalized_paragraphs:
            normalized_paragraphs = [
                _Paragraph(
                    text=section_text,
                    page_start=section.page_start,
                    page_end=section.page_end,
                )
            ]

        raw_chunks: list[list[_Paragraph]] = []
        current: list[_Paragraph] = []
        current_len = 0

        for paragraph in normalized_paragraphs:
            candidate = len(paragraph.text) + (2 if current else 0)
            if current and (current_len + candidate > max_chunk_chars):
                raw_chunks.append(current)
                current = [paragraph]
                current_len = len(paragraph.text)
            else:
                current.append(paragraph)
                current_len += candidate

        if current:
            raw_chunks.append(current)

        for chunk_index, chunk_paragraphs in enumerate(raw_chunks, start=1):
            merged_paragraphs: list[_Paragraph] = []
            if overlap_paragraphs > 0 and chunk_index > 1:
                overlap = raw_chunks[chunk_index - 2][-overlap_paragraphs:]
                merged_paragraphs.extend(overlap)
            merged_paragraphs.extend(chunk_paragraphs)

            chunk_text = "\n\n".join(p.text for p in merged_paragraphs if p.text).strip()
            if not chunk_text:
                continue

            chunk = DocumentChunk(
                chunk_id=f"{section_id}-chunk-{chunk_index:03d}",
                section_id=section_id,
                section_title=section.title,
                chunk_index=chunk_index,
                page_start=min(p.page_start for p in merged_paragraphs),
                page_end=max(p.page_end for p in merged_paragraphs),
                text=chunk_text,
                anchor_terms=_anchor_terms(chunk_text),
            )
            chunks.append(chunk)

    if not sections:
        return DocumentMap(
            source_name=source_name,
            page_count=page_count,
            has_page_markers=has_page_markers,
            sections=[],
            chunks=[],
        )

    return DocumentMap(
        source_name=source_name,
        page_count=page_count,
        has_page_markers=has_page_markers,
        sections=sections,
        chunks=chunks,
    )
