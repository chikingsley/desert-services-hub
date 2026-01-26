"""
Integration tests for PDF utilities (PyMuPDF operations).

These don't need API keys - they test local PDF manipulation.
Run with: uv run pytest tests/test_pdf_utils.py -v
"""

import tempfile
from pathlib import Path

import pymupdf
import pytest

from mistral_mcp.pdf_utils import (
    extract_pages,
    get_pdf_info,
    pdf_to_images,
    split_pdf,
)


class TestGetPdfInfo:
    """Tests for PDF info extraction."""

    def test_gets_page_count(self, sample_contract: Path):
        """Should return correct page count."""
        info = get_pdf_info(str(sample_contract))

        assert info.page_count > 0
        assert info.file_path == str(sample_contract)

    def test_gets_file_size(self, sample_contract: Path):
        """Should return file size in MB."""
        info = get_pdf_info(str(sample_contract))

        assert info.file_size_mb > 0
        # Small contract should be under 1MB
        assert info.file_size_mb < 1

    def test_large_file_size(self, large_contract: Path):
        """Should handle large files."""
        info = get_pdf_info(str(large_contract))

        # Large contract is ~13MB
        assert info.file_size_mb > 10
        assert info.page_count > 0

    def test_needs_splitting_small_file(self, sample_contract: Path):
        """Small files should not need splitting."""
        info = get_pdf_info(str(sample_contract))

        assert info.needs_splitting is False

    def test_needs_splitting_large_file(self, large_contract: Path):
        """Large files should be checked for splitting needs."""
        info = get_pdf_info(str(large_contract))

        # 13MB is under 50MB limit, so shouldn't need splitting
        # unless it has >1000 pages
        assert isinstance(info.needs_splitting, bool)

    def test_is_encrypted(self, sample_contract: Path):
        """Should detect unencrypted PDFs."""
        info = get_pdf_info(str(sample_contract))

        assert info.is_encrypted is False


class TestSplitPdf:
    """Tests for PDF splitting."""

    def test_splits_into_chunks(self, medium_contract: Path):
        """Should split PDF into chunks."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = split_pdf(str(medium_contract), tmpdir, pages_per_chunk=5)

            assert result.original_page_count > 0
            assert len(result.chunks) > 0

            # Verify chunks were created
            for chunk in result.chunks:
                assert Path(chunk.file_path).exists()
                assert chunk.page_count <= 5

    def test_chunk_page_ranges_correct(self, medium_contract: Path):
        """Chunk page ranges should be contiguous."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = split_pdf(str(medium_contract), tmpdir, pages_per_chunk=3)

            # First chunk starts at page 1
            assert result.chunks[0].start_page == 1

            # Chunks should be contiguous
            for i in range(1, len(result.chunks)):
                prev_chunk = result.chunks[i - 1]
                curr_chunk = result.chunks[i]
                assert curr_chunk.start_page == prev_chunk.end_page + 1

    def test_chunk_files_have_correct_pages(self, sample_contract: Path):
        """Each chunk file should have correct number of pages."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = split_pdf(str(sample_contract), tmpdir, pages_per_chunk=2)

            for chunk in result.chunks:
                doc = pymupdf.open(chunk.file_path)
                assert len(doc) == chunk.page_count
                doc.close()


class TestExtractPages:
    """Tests for page extraction."""

    def test_extracts_single_page(self, medium_contract: Path):
        """Should extract a single page."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = str(Path(tmpdir) / "extracted.pdf")
            result = extract_pages(str(medium_contract), 1, 1, output)

            doc = pymupdf.open(result)
            assert len(doc) == 1
            doc.close()

    def test_extracts_page_range(self, medium_contract: Path):
        """Should extract a range of pages."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = str(Path(tmpdir) / "extracted.pdf")
            result = extract_pages(str(medium_contract), 2, 5, output)

            doc = pymupdf.open(result)
            assert len(doc) == 4  # pages 2, 3, 4, 5
            doc.close()

    def test_generates_output_path(self, sample_contract: Path):
        """Should auto-generate output path if not provided."""
        result = extract_pages(str(sample_contract), 1, 1)

        assert Path(result).exists()
        assert "_pages_1-1" in result

        # Cleanup
        Path(result).unlink()


class TestPdfToImages:
    """Tests for PDF to image conversion."""

    def test_converts_to_images(self, sample_contract: Path):
        """Should convert PDF pages to images."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = pdf_to_images(str(sample_contract), tmpdir)

            assert len(result) > 0
            for img_path in result:
                assert Path(img_path).exists()
                assert img_path.endswith(".png")

    def test_converts_page_range(self, medium_contract: Path):
        """Should convert specific page range."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = pdf_to_images(str(medium_contract), tmpdir, page_range=(1, 3))

            assert len(result) == 3

    def test_respects_dpi(self, sample_contract: Path):
        """Higher DPI should produce larger images."""
        with tempfile.TemporaryDirectory() as tmpdir:
            low_dir = Path(tmpdir) / "low"
            high_dir = Path(tmpdir) / "high"
            low_dir.mkdir()
            high_dir.mkdir()

            low_dpi = pdf_to_images(str(sample_contract), str(low_dir), dpi=72)
            high_dpi = pdf_to_images(str(sample_contract), str(high_dir), dpi=200)

            low_size = Path(low_dpi[0]).stat().st_size
            high_size = Path(high_dpi[0]).stat().st_size

            assert high_size > low_size
