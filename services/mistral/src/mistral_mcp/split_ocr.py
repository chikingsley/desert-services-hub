"""
Split and OCR workflow with durable output.

Splits a PDF into pages, OCRs each page, and appends to output file
immediately for crash recovery. Supports resuming interrupted jobs.
"""

from __future__ import annotations

import asyncio
import logging
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from mistral_mcp.client import MistralClient
from mistral_mcp.pdf_utils import get_pdf_info, split_pdf

if TYPE_CHECKING:
    from mistral_mcp.types import PDFChunk

logger = logging.getLogger(__name__)

# Pattern to find page markers in existing output
PAGE_MARKER_PATTERN = re.compile(r"<!-- Page (\d+) -->")


@dataclass
class SplitOCRResult:
    """Result of split and OCR operation."""

    source_file: str
    output_file: str
    total_pages: int
    pages_processed: int
    resumed_from: int  # 0 if fresh start


async def split_and_ocr(
    file_path: str | Path,
    output_path: str | Path,
    *,
    max_concurrent: int = 5,
    client: MistralClient | None = None,
) -> SplitOCRResult:
    """
    Split a PDF into pages, OCR each, and save to a single markdown file.

    **Durable**: Each page is appended immediately after OCR completes.
    If interrupted, re-running with the same output_path will resume
    from where it left off.

    Args:
        file_path: Path to the PDF file.
        output_path: Path for the combined markdown output file.
        max_concurrent: Max concurrent OCR requests (default: 5).
        client: Optional MistralClient instance.

    Returns:
        SplitOCRResult with processing stats.

    Example:
        result = await split_and_ocr(
            "/path/to/contract.pdf",
            "/output/contract.md"
        )
        print(f"Processed {result.pages_processed} pages")

        # If interrupted, just run again - it resumes automatically
        result = await split_and_ocr(
            "/path/to/contract.pdf",
            "/output/contract.md"  # same output path
        )
    """
    if client is None:
        client = MistralClient()

    path = Path(file_path)
    output = Path(output_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Get PDF info
    info = get_pdf_info(str(path))
    total_pages = info.page_count
    logger.info(f"Processing {total_pages} pages from {path.name}")

    # Check for existing progress (resume support)
    completed_pages: set[int] = set()
    if output.exists():
        existing_content = output.read_text()
        for match in PAGE_MARKER_PATTERN.finditer(existing_content):
            completed_pages.add(int(match.group(1)))
        if completed_pages:
            logger.info(f"Resuming: found {len(completed_pages)} pages already done")

    resumed_from = max(completed_pages) if completed_pages else 0

    # Ensure output directory exists
    output.parent.mkdir(parents=True, exist_ok=True)

    # Split into individual pages
    with tempfile.TemporaryDirectory() as tmpdir:
        split_result = split_pdf(str(path), tmpdir, pages_per_chunk=1)

        # Filter to only pages we haven't done yet
        chunks_to_process = [
            chunk for chunk in split_result.chunks
            if chunk.start_page not in completed_pages
        ]

        if not chunks_to_process:
            logger.info("All pages already processed")
            return SplitOCRResult(
                source_file=str(path),
                output_file=str(output),
                total_pages=total_pages,
                pages_processed=0,
                resumed_from=resumed_from,
            )

        logger.info(f"Processing {len(chunks_to_process)} remaining pages...")

        # Process pages with concurrency limit, write each immediately
        semaphore = asyncio.Semaphore(max_concurrent)
        pages_processed = 0

        # We need to process in order for clean appending
        # But we can OCR in parallel, then write in order
        async def ocr_chunk(chunk: PDFChunk) -> tuple[int, str]:
            async with semaphore:
                logger.debug(f"OCR page {chunk.start_page}")
                result = await client.ocr_from_file(chunk.file_path)
                markdown = result.full_text if result.pages else ""
                return chunk.start_page, markdown

        # OCR all remaining pages in parallel
        tasks = [ocr_chunk(chunk) for chunk in chunks_to_process]
        results = await asyncio.gather(*tasks)

        # Sort by page number and append each one
        results_sorted = sorted(results, key=lambda x: x[0])

        for page_num, markdown in results_sorted:
            # Build page content with separator if file has content
            needs_separator = output.exists() and output.stat().st_size > 0
            separator = "\n\n---\n\n" if needs_separator else ""
            page_content = f"{separator}<!-- Page {page_num} -->\n{markdown}"

            # Append to file immediately (durable)
            # Blocking I/O is acceptable here - small writes between OCR calls
            with output.open("a") as f:  # noqa: ASYNC230
                f.write(page_content)

            pages_processed += 1
            logger.info(f"Saved page {page_num}/{total_pages}")

    return SplitOCRResult(
        source_file=str(path),
        output_file=str(output),
        total_pages=total_pages,
        pages_processed=pages_processed,
        resumed_from=resumed_from,
    )
