"""
Integration tests for split and OCR workflow.

Run with: uv run pytest tests/test_split_ocr.py -v
"""

import tempfile
from pathlib import Path

import pytest

from mistral_mcp.split_ocr import split_and_ocr


class TestSplitAndOCR:
    """Tests for split_and_ocr function."""

    @pytest.mark.asyncio
    async def test_split_and_ocr_creates_output(self, mistral_api_key: str, sample_contract: Path):
        """Should create output markdown file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "output.md"

            result = await split_and_ocr(str(sample_contract), str(output))

            assert output.exists()
            assert result.total_pages > 0
            assert result.pages_processed == result.total_pages
            assert result.resumed_from == 0

    @pytest.mark.asyncio
    async def test_output_has_page_markers(self, mistral_api_key: str, sample_contract: Path):
        """Output should have page markers for each page."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "output.md"

            result = await split_and_ocr(str(sample_contract), str(output))

            content = output.read_text()
            assert "<!-- Page 1 -->" in content

            # If multi-page, should have separators
            if result.total_pages > 1:
                assert "---" in content

    @pytest.mark.asyncio
    async def test_resume_skips_completed_pages(self, mistral_api_key: str, sample_contract: Path):
        """Running again should skip already-processed pages."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "output.md"

            # First run
            result1 = await split_and_ocr(str(sample_contract), str(output))
            assert result1.pages_processed > 0

            # Second run - should skip all
            result2 = await split_and_ocr(str(sample_contract), str(output))
            assert result2.pages_processed == 0
            assert result2.resumed_from > 0

    @pytest.mark.asyncio
    async def test_resume_partial(self, mistral_api_key: str, sample_contract: Path):
        """Should resume from partial progress."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "output.md"

            # Simulate partial progress by writing page 1 marker
            output.write_text("<!-- Page 1 -->\nSome content from page 1")

            result = await split_and_ocr(str(sample_contract), str(output))

            # Should have skipped page 1
            assert result.resumed_from == 1
            # If multi-page doc, should have processed remaining
            if result.total_pages > 1:
                assert result.pages_processed == result.total_pages - 1

    @pytest.mark.asyncio
    async def test_medium_document(self, mistral_api_key: str, medium_contract: Path):
        """Should handle medium-sized documents."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "output.md"

            result = await split_and_ocr(
                str(medium_contract),
                str(output),
                max_concurrent=3,
            )

            assert output.exists()
            assert result.total_pages > 0
            assert result.pages_processed == result.total_pages

            # Verify content
            content = output.read_text()
            assert len(content) > 100
