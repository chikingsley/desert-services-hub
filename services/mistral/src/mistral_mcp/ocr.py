"""
OCR operations with smart PDF handling.

Handles automatic splitting of large documents that exceed Mistral's limits.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from mistral_mcp.client import MistralClient
from mistral_mcp.pdf_utils import extract_pages, get_pdf_info, split_pdf
from mistral_mcp.types import (
    DEFAULT_CHUNK_SIZE,
    MAX_PAGES,
    MISTRAL_OCR_MODEL,
    OCRPage,
    OCRResult,
    TableFormat,
)

logger = logging.getLogger(__name__)


async def ocr_document(
    source: str,
    *,
    model: str = MISTRAL_OCR_MODEL,
    table_format: TableFormat | None = None,
    extract_header: bool = False,
    extract_footer: bool = False,
    include_images: bool = False,
    auto_split: bool = True,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    client: MistralClient | None = None,
) -> OCRResult:
    """
    OCR a document from URL or local file path.

    Automatically handles large documents by splitting them into chunks
    that fit within Mistral's limits (50MB, 1000 pages).

    Args:
        source: URL or local file path to the document.
        model: OCR model to use.
        table_format: How to format extracted tables.
        extract_header: Whether to extract page headers.
        extract_footer: Whether to extract page footers.
        include_images: Whether to include base64 images in response.
        auto_split: Whether to automatically split large documents.
        chunk_size: Pages per chunk when splitting.
        client: Optional MistralClient instance (creates one if not provided).

    Returns:
        OCRResult with extracted content from all pages.

    Example:
        # From URL
        result = await ocr_document("https://example.com/doc.pdf")

        # From local file
        result = await ocr_document("/path/to/document.pdf")

        # With options
        result = await ocr_document(
            "/path/to/large.pdf",
            table_format=TableFormat.HTML,
            auto_split=True,
            chunk_size=200
        )
    """
    if client is None:
        client = MistralClient()

    # Check if it's a URL or local file
    is_url = source.startswith(("http://", "https://"))

    if is_url:
        # URLs go directly to API (no size check possible)
        return await client.ocr_from_url(
            source,
            model=model,
            table_format=table_format,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_images=include_images,
        )

    # Local file - check if splitting is needed
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {source}")

    pdf_info = get_pdf_info(source)

    if not auto_split or not pdf_info.needs_splitting:
        # File is within limits, process directly
        return await client.ocr_from_file(
            source,
            model=model,
            table_format=table_format,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_images=include_images,
        )

    # File exceeds limits - split and process
    logger.info(
        f"Document exceeds limits ({pdf_info.page_count} pages, "
        f"{pdf_info.file_size_mb:.1f}MB). Splitting into chunks..."
    )

    split_result = split_pdf(source, pages_per_chunk=chunk_size)

    # Process all chunks
    all_pages: list[OCRPage] = []
    total_usage: dict[str, int] = {}

    for chunk in split_result.chunks:
        logger.info(
            f"Processing chunk {chunk.chunk_number}/{len(split_result.chunks)} "
            f"(pages {chunk.start_page}-{chunk.end_page})"
        )

        chunk_result = await client.ocr_from_file(
            chunk.file_path,
            model=model,
            table_format=table_format,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_images=include_images,
        )

        # Adjust page indices to be relative to original document
        page_offset = chunk.start_page - 1
        for page in chunk_result.pages:
            page.index = page.index + page_offset
            all_pages.append(page)

        # Aggregate usage
        for key, value in chunk_result.usage_info.items():
            total_usage[key] = total_usage.get(key, 0) + value

    # Sort pages by index
    all_pages.sort(key=lambda p: p.index)

    return OCRResult(
        pages=all_pages,
        model=model,
        usage_info=total_usage,
    )


async def ocr_pages(
    file_path: str,
    start_page: int,
    end_page: int,
    *,
    model: str = MISTRAL_OCR_MODEL,
    table_format: TableFormat | None = None,
    extract_header: bool = False,
    extract_footer: bool = False,
    include_images: bool = False,
    client: MistralClient | None = None,
) -> OCRResult:
    """
    OCR a specific page range from a PDF.

    Args:
        file_path: Path to the PDF file.
        start_page: First page to process (1-indexed, inclusive).
        end_page: Last page to process (1-indexed, inclusive).
        model: OCR model to use.
        table_format: How to format extracted tables.
        extract_header: Whether to extract page headers.
        extract_footer: Whether to extract page footers.
        include_images: Whether to include base64 images in response.
        client: Optional MistralClient instance.

    Returns:
        OCRResult with extracted content from specified pages.

    Example:
        # Get pages 10-25 from a large document
        result = await ocr_pages("/path/to/doc.pdf", 10, 25)
    """
    if client is None:
        client = MistralClient()

    # Validate page range
    pdf_info = get_pdf_info(file_path)
    if start_page < 1:
        raise ValueError(f"start_page must be >= 1, got {start_page}")
    if end_page > pdf_info.page_count:
        raise ValueError(
            f"end_page {end_page} exceeds document pages ({pdf_info.page_count})"
        )
    if start_page > end_page:
        raise ValueError(f"start_page ({start_page}) > end_page ({end_page})")

    page_count = end_page - start_page + 1

    # Check if extraction exceeds limits
    if page_count > MAX_PAGES:
        raise ValueError(
            f"Page range ({page_count} pages) exceeds max allowed ({MAX_PAGES}). "
            "Use auto_split=True with ocr_document() for large documents."
        )

    # Extract pages to temporary file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(file_path, start_page, end_page, tmp_path)

        result = await client.ocr_from_file(
            tmp_path,
            model=model,
            table_format=table_format,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_images=include_images,
        )

        # Adjust page indices to be relative to original document
        for page in result.pages:
            page.index = page.index + (start_page - 1)

        return result

    finally:
        # Cleanup temp file
        Path(tmp_path).unlink(missing_ok=True)


async def ocr_batch(
    sources: list[str],
    *,
    model: str = MISTRAL_OCR_MODEL,
    table_format: TableFormat | None = None,
    extract_header: bool = False,
    extract_footer: bool = False,
    include_images: bool = False,
    max_concurrent: int = 5,
    client: MistralClient | None = None,
) -> list[OCRResult]:
    """
    OCR multiple documents in parallel.

    Note: For large batch jobs with cost savings, use the batch API instead
    (create_batch_job in batch.py).

    Args:
        sources: List of URLs or file paths.
        model: OCR model to use.
        table_format: How to format extracted tables.
        extract_header: Whether to extract page headers.
        extract_footer: Whether to extract page footers.
        include_images: Whether to include base64 images in response.
        max_concurrent: Maximum concurrent requests.
        client: Optional MistralClient instance.

    Returns:
        List of OCRResult objects in same order as sources.
    """
    if client is None:
        client = MistralClient()

    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_one(source: str) -> OCRResult:
        async with semaphore:
            return await ocr_document(
                source,
                model=model,
                table_format=table_format,
                extract_header=extract_header,
                extract_footer=extract_footer,
                include_images=include_images,
                client=client,
            )

    tasks = [process_one(source) for source in sources]
    return await asyncio.gather(*tasks)
