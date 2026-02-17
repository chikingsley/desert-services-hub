"""PDF utilities using kreuzberg.

Provides PDF splitting, page extraction, and file info operations.
"""

import logging
import math
from pathlib import Path

from kreuzberg import (
    extract_file_sync,
    render_page_to_image,
    split_pdf as kreuzberg_split_pdf,
)
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_PAGES = 1000
DEFAULT_CHUNK_SIZE = 500


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class PDFInfo(BaseModel):
    """Information about a PDF file."""

    file_path: str
    file_size_bytes: int
    file_size_mb: float
    page_count: int
    is_encrypted: bool
    needs_splitting: bool
    recommended_chunks: int


class PDFChunk(BaseModel):
    """Information about a PDF chunk after splitting."""

    chunk_number: int
    start_page: int  # 1-indexed
    end_page: int  # 1-indexed (inclusive)
    page_count: int
    file_path: str
    file_size_bytes: int


class SplitResult(BaseModel):
    """Result of splitting a PDF."""

    original_path: str
    original_page_count: int
    chunks: list[PDFChunk]
    output_directory: str

logger = logging.getLogger(__name__)


def get_pdf_info(file_path: str) -> PDFInfo:
    """
    Get information about a PDF file using kreuzberg.

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

    # Use kreuzberg for metadata extraction
    result = extract_file_sync(file_path)
    page_count = result.metadata.get("page_count", 0)
    is_encrypted = result.metadata.get("is_encrypted", False)

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

    pdf_bytes = path.read_bytes()

    # Get page count from metadata
    result = extract_file_sync(file_path)
    total_pages = result.metadata.get("page_count", 0)

    if total_pages == 0:
        raise ValueError(f"PDF has no pages: {file_path}")

    # Build page ranges (1-indexed, inclusive)
    ranges: list[tuple[int, int]] = []
    for start_page in range(1, total_pages + 1, pages_per_chunk):
        end_page = min(start_page + pages_per_chunk - 1, total_pages)
        ranges.append((start_page, end_page))

    chunk_pdfs = kreuzberg_split_pdf(pdf_bytes, ranges)

    chunks: list[PDFChunk] = []
    for chunk_num, (chunk_data, (start_page, end_page)) in enumerate(
        zip(chunk_pdfs, ranges), start=1
    ):
        chunk_filename = f"{output_prefix}_chunk_{chunk_num:03d}.pdf"
        chunk_path = out_path / chunk_filename
        chunk_path.write_bytes(chunk_data)

        page_count = end_page - start_page + 1

        chunks.append(
            PDFChunk(
                chunk_number=chunk_num,
                start_page=start_page,
                end_page=end_page,
                page_count=page_count,
                file_path=str(chunk_path.absolute()),
                file_size_bytes=len(chunk_data),
            )
        )

        logger.info(
            f"Created chunk {chunk_num}: "
            f"pages {start_page}-{end_page} ({page_count} pages)"
        )

    return SplitResult(
        original_path=str(path.absolute()),
        original_page_count=total_pages,
        chunks=chunks,
        output_directory=str(out_path.absolute()),
    )


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

    pdf_bytes = path.read_bytes()

    # Validate page range (1-indexed)
    result = extract_file_sync(file_path)
    total_pages = result.metadata.get("page_count", 0)

    if start_page < 1:
        raise ValueError(f"start_page must be >= 1, got {start_page}")
    if end_page > total_pages:
        raise ValueError(f"end_page {end_page} exceeds total pages {total_pages}")
    if start_page > end_page:
        raise ValueError(f"start_page {start_page} > end_page {end_page}")

    # Generate output path if not provided
    if output_path is None:
        output_path = str(path.parent / f"{path.stem}_pages_{start_page}-{end_page}.pdf")

    # kreuzberg split_pdf uses 1-indexed inclusive ranges
    parts = kreuzberg_split_pdf(pdf_bytes, [(start_page, end_page)])
    Path(output_path).write_bytes(parts[0])

    return output_path


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

    pdf_bytes = path.read_bytes()

    # Get total page count
    result = extract_file_sync(file_path)
    total_pages = result.metadata.get("page_count", 0)

    # Determine page range (convert to 0-indexed for render_page_to_image)
    if page_range:
        start_idx = page_range[0] - 1
        end_idx = page_range[1]
    else:
        start_idx = 0
        end_idx = total_pages

    output_files = []

    for page_idx in range(start_idx, end_idx):
        png_data = render_page_to_image(pdf_bytes, page_idx, dpi=dpi)

        output_file = out_path / f"page_{page_idx + 1:03d}.{image_format}"
        output_file.write_bytes(png_data)
        output_files.append(str(output_file))

    return output_files


def get_page_count(file_path: str) -> int:
    """
    Get the page count of a PDF using kreuzberg.

    Args:
        file_path: Path to the PDF file.

    Returns:
        Number of pages in the PDF.
    """
    result = extract_file_sync(file_path)
    return result.metadata.get("page_count", 0)
