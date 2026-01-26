"""
PDF utilities using PyMuPDF.

Provides PDF splitting, page extraction, and file info operations.
Handles large documents that exceed Mistral's limits (50MB, 1000 pages).
"""

import logging
import math
from pathlib import Path

import pymupdf

from mistral_mcp.types import (
    DEFAULT_CHUNK_SIZE,
    MAX_FILE_SIZE_BYTES,
    MAX_PAGES,
    PDFChunk,
    PDFInfo,
    SplitResult,
)

logger = logging.getLogger(__name__)


def get_pdf_info(file_path: str) -> PDFInfo:
    """
    Get information about a PDF file.

    Args:
        file_path: Path to the PDF file.

    Returns:
        PDFInfo with file details and whether splitting is needed.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If the file is not a valid PDF.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if not path.suffix.lower() == ".pdf":
        raise ValueError(f"File is not a PDF: {file_path}")

    file_size = path.stat().st_size

    doc = pymupdf.open(file_path)
    try:
        page_count = len(doc)
        is_encrypted = doc.is_encrypted

        # Calculate if splitting is needed
        needs_splitting = file_size > MAX_FILE_SIZE_BYTES or page_count > MAX_PAGES

        # Calculate recommended chunks
        if needs_splitting:
            # Use page-based chunking (more predictable than size-based)
            recommended_chunks = math.ceil(page_count / DEFAULT_CHUNK_SIZE)
        else:
            recommended_chunks = 1

        return PDFInfo(
            file_path=str(path.absolute()),
            file_size_bytes=file_size,
            file_size_mb=file_size / (1024 * 1024),
            page_count=page_count,
            is_encrypted=is_encrypted,
            needs_splitting=needs_splitting,
            recommended_chunks=recommended_chunks,
        )
    finally:
        doc.close()


def split_pdf(
    file_path: str,
    output_dir: str | None = None,
    pages_per_chunk: int = DEFAULT_CHUNK_SIZE,
    output_prefix: str | None = None,
) -> SplitResult:
    """
    Split a PDF into smaller chunks.

    Args:
        file_path: Path to the input PDF file.
        output_dir: Directory for output files. Defaults to same dir as input.
        pages_per_chunk: Maximum pages per chunk. Defaults to 500.
        output_prefix: Prefix for output filenames. Defaults to input filename.

    Returns:
        SplitResult with information about all chunks created.

    Raises:
        FileNotFoundError: If the input file doesn't exist.
        ValueError: If the file is encrypted or empty.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Set defaults
    if output_dir is None:
        output_dir = str(path.parent / f"{path.stem}_chunks")

    if output_prefix is None:
        output_prefix = path.stem

    # Create output directory
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(file_path)
    try:
        if doc.is_encrypted:
            raise ValueError(f"Cannot split encrypted PDF: {file_path}")

        total_pages = len(doc)
        if total_pages == 0:
            raise ValueError(f"PDF has no pages: {file_path}")

        chunks: list[PDFChunk] = []
        chunk_num = 1

        for start_page in range(0, total_pages, pages_per_chunk):
            end_page = min(start_page + pages_per_chunk - 1, total_pages - 1)

            # Create chunk PDF
            chunk_doc = pymupdf.open()
            chunk_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)

            # Save chunk
            chunk_filename = f"{output_prefix}_chunk_{chunk_num:03d}.pdf"
            chunk_path = out_path / chunk_filename
            chunk_doc.save(
                str(chunk_path),
                garbage=3,  # Remove unused objects
                deflate=True,  # Compress streams
            )

            chunk_size = chunk_path.stat().st_size
            page_count = end_page - start_page + 1

            chunks.append(
                PDFChunk(
                    chunk_number=chunk_num,
                    start_page=start_page + 1,  # 1-indexed
                    end_page=end_page + 1,  # 1-indexed
                    page_count=page_count,
                    file_path=str(chunk_path.absolute()),
                    file_size_bytes=chunk_size,
                )
            )

            chunk_doc.close()
            chunk_num += 1

            logger.info(
                f"Created chunk {chunk_num - 1}: "
                f"pages {start_page + 1}-{end_page + 1} ({page_count} pages)"
            )

        return SplitResult(
            original_path=str(path.absolute()),
            original_page_count=total_pages,
            chunks=chunks,
            output_directory=str(out_path.absolute()),
        )
    finally:
        doc.close()


def extract_pages(
    file_path: str,
    start_page: int,
    end_page: int,
    output_path: str | None = None,
) -> str:
    """
    Extract a range of pages from a PDF.

    Args:
        file_path: Path to the input PDF file.
        start_page: First page to extract (1-indexed, inclusive).
        end_page: Last page to extract (1-indexed, inclusive).
        output_path: Path for output file. Defaults to auto-generated name.

    Returns:
        Path to the extracted PDF.

    Raises:
        FileNotFoundError: If the input file doesn't exist.
        ValueError: If page range is invalid.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    doc = pymupdf.open(file_path)
    try:
        total_pages = len(doc)

        # Validate page range (1-indexed)
        if start_page < 1:
            raise ValueError(f"start_page must be >= 1, got {start_page}")
        if end_page > total_pages:
            raise ValueError(f"end_page {end_page} exceeds total pages {total_pages}")
        if start_page > end_page:
            raise ValueError(f"start_page {start_page} > end_page {end_page}")

        # Convert to 0-indexed
        start_idx = start_page - 1
        end_idx = end_page - 1

        # Generate output path if not provided
        if output_path is None:
            output_path = str(
                path.parent / f"{path.stem}_pages_{start_page}-{end_page}.pdf"
            )

        # Create extracted PDF
        new_doc = pymupdf.open()
        new_doc.insert_pdf(doc, from_page=start_idx, to_page=end_idx)
        new_doc.save(output_path, garbage=3, deflate=True)
        new_doc.close()

        return output_path
    finally:
        doc.close()


def pdf_to_images(
    file_path: str,
    output_dir: str | None = None,
    dpi: int = 150,
    image_format: str = "png",
    page_range: tuple[int, int] | None = None,
) -> list[str]:
    """
    Convert PDF pages to images.

    Args:
        file_path: Path to the PDF file.
        output_dir: Directory for output images. Defaults to same dir as input.
        dpi: Image resolution. 72=screen, 150=print, 300=high quality.
        image_format: Output format (png, jpeg).
        page_range: Optional (start, end) 1-indexed page range.

    Returns:
        List of paths to generated images.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if output_dir is None:
        output_dir = str(path.parent / f"{path.stem}_images")

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(file_path)
    try:
        total_pages = len(doc)

        # Determine page range
        if page_range:
            start_idx = page_range[0] - 1
            end_idx = page_range[1]
        else:
            start_idx = 0
            end_idx = total_pages

        output_files = []

        for page_num in range(start_idx, end_idx):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=dpi)

            output_file = out_path / f"page_{page_num + 1:03d}.{image_format}"
            pix.save(str(output_file))
            output_files.append(str(output_file))

            del pix

        return output_files
    finally:
        doc.close()


def get_page_count(file_path: str) -> int:
    """
    Get the page count of a PDF without loading the full document info.

    Args:
        file_path: Path to the PDF file.

    Returns:
        Number of pages in the PDF.
    """
    doc = pymupdf.open(file_path)
    try:
        return len(doc)
    finally:
        doc.close()
