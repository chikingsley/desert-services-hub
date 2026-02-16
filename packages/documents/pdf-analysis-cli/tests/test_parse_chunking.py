"""Tests for page splitting and chunk building in the reconciliation pipeline."""

from __future__ import annotations

from pdf_analysis.parse import (
    OVERLAP_PAGES,
    ChunkSpec,
    OCR_PAGE_RE,
    PLUMBER_PAGE_RE,
    PageText,
    _build_chunks,
    _format_reconcile_prompt,
    _reassemble_pages,
    _split_text_by_pages,
)


# ---------------------------------------------------------------------------
# _split_text_by_pages
# ---------------------------------------------------------------------------
class TestSplitTextByPages:
    def test_plumber_format(self):
        text = "--- Page 1 ---\nHello world\n\n--- Page 2 ---\nSecond page"
        pages = _split_text_by_pages(text, PLUMBER_PAGE_RE)
        assert len(pages) == 2
        assert pages[0].page_num == 1
        assert pages[0].text == "Hello world"
        assert pages[1].page_num == 2
        assert pages[1].text == "Second page"

    def test_ocr_format(self):
        text = "<!-- Page 1 -->\nFirst\n\n---\n\n<!-- Page 2 -->\nSecond"
        pages = _split_text_by_pages(text, OCR_PAGE_RE)
        assert len(pages) == 2
        assert pages[0].page_num == 1
        assert pages[0].text == "First"
        assert pages[1].page_num == 2
        assert pages[1].text == "Second"

    def test_ocr_strips_leading_separator(self):
        text = "<!-- Page 1 -->\nA\n\n---\n\n<!-- Page 2 -->\nB"
        pages = _split_text_by_pages(text, OCR_PAGE_RE)
        # Page 2's text should not start with "---"
        assert not pages[1].text.startswith("---")

    def test_empty_text(self):
        assert _split_text_by_pages("", PLUMBER_PAGE_RE) == []
        assert _split_text_by_pages("   ", OCR_PAGE_RE) == []

    def test_no_markers(self):
        assert _split_text_by_pages("just plain text", PLUMBER_PAGE_RE) == []

    def test_single_page(self):
        text = "--- Page 5 ---\nOnly page"
        pages = _split_text_by_pages(text, PLUMBER_PAGE_RE)
        assert len(pages) == 1
        assert pages[0].page_num == 5
        assert pages[0].text == "Only page"

    def test_sorted_by_page_num(self):
        text = "--- Page 3 ---\nThird\n\n--- Page 1 ---\nFirst"
        pages = _split_text_by_pages(text, PLUMBER_PAGE_RE)
        assert pages[0].page_num == 1
        assert pages[1].page_num == 3


# ---------------------------------------------------------------------------
# _reassemble_pages
# ---------------------------------------------------------------------------
class TestReassemblePages:
    def test_plumber_roundtrip(self):
        original = "--- Page 1 ---\nHello\n\n--- Page 2 ---\nWorld"
        pages = _split_text_by_pages(original, PLUMBER_PAGE_RE)
        rebuilt = _reassemble_pages(pages, "--- Page {} ---", "\n\n")
        assert "--- Page 1 ---\nHello" in rebuilt
        assert "--- Page 2 ---\nWorld" in rebuilt

    def test_ocr_roundtrip(self):
        pages = [PageText(1, "First"), PageText(2, "Second")]
        rebuilt = _reassemble_pages(pages, "<!-- Page {} -->", "\n\n---\n\n")
        assert "<!-- Page 1 -->\nFirst" in rebuilt
        assert "<!-- Page 2 -->\nSecond" in rebuilt
        assert "\n\n---\n\n" in rebuilt


# ---------------------------------------------------------------------------
# _build_chunks
# ---------------------------------------------------------------------------
class TestBuildChunks:
    def _make_pages(self, n: int, chars_each: int = 100) -> list[PageText]:
        return [PageText(page_num=i + 1, text="x" * chars_each) for i in range(n)]

    def test_single_chunk_small_doc(self):
        pages = self._make_pages(5, chars_each=100)
        chunks = _build_chunks(pages, pages, max_chars=10_000, overlap=2)
        assert len(chunks) == 1
        assert chunks[0].start_page == 1
        assert chunks[0].end_page == 5

    def test_multiple_chunks(self):
        pages = self._make_pages(10, chars_each=5000)
        # 10 pages * 5000 = 50K total, with max_chars=15000 → should need ~4 chunks
        chunks = _build_chunks(pages, pages, max_chars=15_000, overlap=2)
        assert len(chunks) >= 3
        # All pages should be covered
        all_core_pages = set()
        for c in chunks:
            for pn in range(c.start_page, c.end_page + 1):
                all_core_pages.add(pn)
        assert all_core_pages == set(range(1, 11))

    def test_overlap_pages_present(self):
        pages = self._make_pages(10, chars_each=5000)
        chunks = _build_chunks(pages, pages, max_chars=15_000, overlap=2)
        if len(chunks) >= 2:
            # Second chunk should contain overlap pages from first chunk
            second_page_nums = {p.page_num for p in chunks[1].plumber_pages}
            first_end = chunks[0].end_page
            # At least one page before the core start should be in the second chunk
            assert any(pn < chunks[1].start_page for pn in second_page_nums)

    def test_first_chunk_no_overlap(self):
        pages = self._make_pages(10, chars_each=5000)
        chunks = _build_chunks(pages, pages, max_chars=15_000, overlap=2)
        # First chunk should start at page 1 with no overlap pages before it
        assert chunks[0].start_page == 1
        assert chunks[0].plumber_pages[0].page_num == 1

    def test_empty_pages(self):
        chunks = _build_chunks([], [], max_chars=10_000, overlap=2)
        assert chunks == []

    def test_single_huge_page(self):
        pages = [PageText(page_num=1, text="x" * 200_000)]
        chunks = _build_chunks(pages, pages, max_chars=50_000, overlap=2)
        # Must still produce at least one chunk even though it exceeds max_chars
        assert len(chunks) == 1
        assert chunks[0].start_page == 1

    def test_mismatched_sources(self):
        plumber = [PageText(1, "a" * 100), PageText(3, "c" * 100)]
        ocr = [PageText(1, "a" * 100), PageText(2, "b" * 100), PageText(3, "c" * 100)]
        chunks = _build_chunks(plumber, ocr, max_chars=10_000, overlap=2)
        assert len(chunks) == 1
        # All 3 pages should be in the chunk
        all_pages = {p.page_num for p in chunks[0].ocr_pages}
        assert all_pages == {1, 2, 3}


# ---------------------------------------------------------------------------
# _format_reconcile_prompt
# ---------------------------------------------------------------------------
class TestFormatReconcilePrompt:
    def test_no_chunk_info(self):
        prompt = _format_reconcile_prompt("plumber text", "ocr text")
        assert "plumber text" in prompt
        assert "ocr text" in prompt
        assert "Pages" not in prompt.split("TEXT-LAYER")[0]

    def test_chunk_info_included(self):
        chunk = ChunkSpec(
            start_page=10, end_page=30,
            plumber_pages=[], ocr_pages=[],
            total_doc_pages=100,
        )
        prompt = _format_reconcile_prompt("p", "o", chunk=chunk, chunk_index=1)
        assert "10" in prompt
        assert "30" in prompt
        assert "100" in prompt

    def test_overlap_note_for_non_first_chunk(self):
        chunk = ChunkSpec(
            start_page=10, end_page=30,
            plumber_pages=[PageText(8, ""), PageText(9, ""), PageText(10, "")],
            ocr_pages=[],
            total_doc_pages=100,
        )
        prompt = _format_reconcile_prompt("p", "o", chunk=chunk, chunk_index=1)
        assert "overlap" in prompt.lower()
        assert "8" in prompt
