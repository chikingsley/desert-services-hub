"""
Type definitions for Mistral Document AI operations.
"""

from enum import Enum

from pydantic import BaseModel, Field

# --- Constants ---

MISTRAL_OCR_MODEL = "mistral-ocr-latest"

# Mistral limits
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_PAGES = 1000

# Default chunk size for splitting (leave headroom)
DEFAULT_CHUNK_SIZE = 500


class TableFormat(str, Enum):
    """Output format for extracted tables."""

    INLINE = "inline"
    MARKDOWN = "markdown"
    HTML = "html"


# --- OCR Response Models ---


class ImageInfo(BaseModel):
    """Information about an extracted image."""

    id: str
    top_left_x: int
    top_left_y: int
    bottom_right_x: int
    bottom_right_y: int
    image_base64: str | None = None


class TableInfo(BaseModel):
    """Information about an extracted table."""

    id: str
    content: str


class OCRPage(BaseModel):
    """OCR result for a single page."""

    index: int
    markdown: str
    images: list[ImageInfo] = Field(default_factory=list)
    tables: list[TableInfo] = Field(default_factory=list)
    hyperlinks: list[str] = Field(default_factory=list)
    header: str | None = None
    footer: str | None = None


class OCRResult(BaseModel):
    """Complete OCR result for a document."""

    pages: list[OCRPage]
    model: str
    usage_info: dict[str, int] = Field(default_factory=dict)

    @property
    def full_text(self) -> str:
        """Get all page text concatenated with page markers."""
        parts = [
            f"--- Page {page.index + 1} ---\n{page.markdown}" for page in self.pages
        ]
        return "\n\n".join(parts)

    @property
    def page_count(self) -> int:
        """Get number of pages processed."""
        return len(self.pages)


# --- PDF Models ---


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
