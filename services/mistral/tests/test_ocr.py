"""
Integration tests for OCR functionality.

Run with: uv run pytest tests/test_ocr.py -v
"""

from pathlib import Path

import pytest

from mistral_mcp.client import MistralClient
from mistral_mcp.ocr import ocr_document, ocr_pages
from mistral_mcp.types import TableFormat


@pytest.mark.asyncio
async def test_ocr_from_url(mistral_api_key: str):
    """OCR a real PDF from URL."""
    url = "https://arxiv.org/pdf/2310.06825.pdf"

    result = await ocr_document(url)

    assert result.pages
    assert len(result.pages) > 0
    assert result.full_text
    assert len(result.full_text) > 100


@pytest.mark.asyncio
async def test_ocr_from_file(mistral_api_key: str, sample_contract: Path):
    """OCR a local PDF file."""
    result = await ocr_document(str(sample_contract))

    assert result.pages
    assert result.full_text
    assert result.page_count > 0


@pytest.mark.asyncio
async def test_ocr_page_range(mistral_api_key: str, medium_contract: Path):
    """OCR specific pages from a PDF."""
    result = await ocr_pages(str(medium_contract), 1, 3)

    assert result.pages
    assert len(result.pages) == 3
    assert result.full_text


@pytest.mark.asyncio
async def test_ocr_with_table_extraction(mistral_api_key: str):
    """OCR with HTML table format."""
    url = "https://arxiv.org/pdf/2310.06825.pdf"

    result = await ocr_document(url, table_format=TableFormat.HTML)

    assert result.pages
    assert result.full_text


@pytest.mark.asyncio
async def test_ocr_large_document(mistral_api_key: str, large_contract: Path):
    """OCR a large document (should handle without splitting since under 50MB)."""
    result = await ocr_document(str(large_contract))

    assert result.pages
    assert result.full_text
    assert result.page_count > 0


@pytest.mark.asyncio
async def test_ocr_estimate_with_tables(mistral_api_key: str, estimate_pdf: Path):
    """OCR an estimate PDF which typically has tables."""
    result = await ocr_document(str(estimate_pdf), table_format=TableFormat.MARKDOWN)

    assert result.pages
    assert result.full_text
    # Estimates usually have multiple pages
    assert result.page_count >= 1


@pytest.mark.asyncio
async def test_client_ocr_from_url(mistral_api_key: str):
    """Test MistralClient.ocr_from_url directly."""
    client = MistralClient()
    url = "https://arxiv.org/pdf/2310.06825.pdf"

    result = await client.ocr_from_url(url)

    assert result.pages
    assert result.model == "mistral-ocr-latest"


@pytest.mark.asyncio
async def test_client_ocr_from_file(mistral_api_key: str, sample_contract: Path):
    """Test MistralClient.ocr_from_file directly."""
    client = MistralClient()

    result = await client.ocr_from_file(str(sample_contract))

    assert result.pages
    assert result.model == "mistral-ocr-latest"
    assert result.usage_info  # Should have usage stats
