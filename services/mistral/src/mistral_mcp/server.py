"""
MCP Server for Mistral Document AI.

Tools:
- ocr: Full document OCR, durable, returns text
- extract: Slice first N pages, structured schema extraction
- identify_document: Quick identification of construction docs (GC, project, type)

Run with:
    python -m mistral_mcp.server

Or via CLI:
    mistral-mcp serve
"""

import json
import logging
import re
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any

from mcp.server.fastmcp import Context, FastMCP

from mistral_mcp.client import MistralClient
from mistral_mcp.pdf_utils import extract_pages, get_pdf_info
from mistral_mcp.split_ocr import split_and_ocr

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

# Type alias for our context
MistralContext = Context[Any, dict[str, MistralClient], Any]

# Configure logging to stderr (CRITICAL for stdio MCP servers)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger(__name__)


# --- Lifespan: Create MistralClient once at startup ---


@asynccontextmanager
async def lifespan(_mcp: FastMCP) -> "AsyncIterator[dict[str, MistralClient]]":
    """Initialize shared resources at startup."""
    logger.info("Initializing Mistral client...")
    client = MistralClient()
    yield {"client": client}
    logger.info("Shutting down Mistral client...")


# Initialize FastMCP server with lifespan
mcp = FastMCP("mistral-document-ai", lifespan=lifespan)


def get_client(ctx: MistralContext) -> MistralClient:
    """Get MistralClient from lifespan context."""
    return ctx.request_context.lifespan_context["client"]


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use in filenames."""
    # Replace spaces and underscores with hyphens
    name = re.sub(r"[\s_]+", "-", name)
    # Remove special chars except hyphens
    name = re.sub(r"[^\w\-]", "", name)
    # Collapse multiple hyphens
    name = re.sub(r"-+", "-", name)
    # Strip leading/trailing hyphens
    return name.strip("-")


# --- Tools ---


@mcp.tool()
async def ocr(
    ctx: MistralContext,
    file_path: str,
    output_path: str | None = None,
    max_concurrent: int = 5,
) -> str:
    """
    OCR a PDF document.

    **Durable**: Each page is saved immediately after OCR.
    **Resumable**: If interrupted, re-running resumes from where it stopped.

    Output file is saved next to the source file by default
    (e.g., contract.pdf → contract.md).

    Args:
        ctx: MCP context (injected automatically)
        file_path: Path to the PDF file
        output_path: Custom output path (default: same dir, .md extension)
        max_concurrent: Max concurrent OCR requests (default: 5)

    Returns:
        The extracted text in markdown format

    Example:
        ocr("/path/to/contract.pdf")
        # Creates /path/to/contract.md and returns the text
    """
    source = Path(file_path)
    client = get_client(ctx)

    # Default output path: same directory, .md extension
    output = source.with_suffix(".md") if output_path is None else Path(output_path)

    result = await split_and_ocr(
        file_path,
        str(output),
        max_concurrent=max_concurrent,
        client=client,
    )

    # Read and return the content
    content = output.read_text()

    logger.info(
        f"OCR complete: {result.total_pages} pages, "
        f"{result.pages_processed} processed, output: {output}"
    )

    return content


@mcp.tool()
async def extract(
    ctx: MistralContext,
    file_path: str,
    prompt: str,
    schema: dict[str, object],
    schema_name: str = "extraction",
    pages: int = 5,
) -> str:
    """
    Extract structured data from the first N pages of a document.

    Slices the first N pages (default 5), sends to Mistral with a JSON schema,
    and returns structured data. Fast way to classify or extract metadata
    without processing the entire document.

    Args:
        ctx: MCP context (injected automatically)
        file_path: Path to the PDF file
        prompt: Instructions for what to extract
        schema: JSON Schema defining expected output structure
        schema_name: Name for the schema (default: "extraction")
        pages: Number of pages to extract from (default: 5)

    Returns:
        JSON string matching the provided schema

    Example:
        extract(
            "/path/to/contract.pdf",
            "Identify this document and extract key details",
            {
                "type": "object",
                "properties": {
                    "document_type": {
                        "type": "string",
                        "enum": ["contract", "invoice", "permit", "estimate", "other"]
                    },
                    "title": {"type": "string"},
                    "date": {"type": "string"},
                    "parties": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "other_notes": {"type": "string"}
                },
                "required": ["document_type"]
            },
            pages=5
        )
    """
    source = Path(file_path)
    client = get_client(ctx)

    # Get page count and clamp
    info = get_pdf_info(str(source))
    actual_pages = min(pages, info.page_count)

    # Slice first N pages to a temp file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(str(source), 1, actual_pages, tmp_path)

        # Send to Mistral with schema
        result = await client.extract_structured(
            prompt,
            schema,
            schema_name=schema_name,
            document_path=tmp_path,
        )

        logger.info(f"Extracted from first {actual_pages} pages of {source.name}")
        return result

    finally:
        # Cleanup temp file
        Path(tmp_path).unlink(missing_ok=True)


# Schema for identify_document
IDENTIFY_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "gc_company": {
            "type": "string",
            "description": "General contractor company name",
        },
        "project_name": {
            "type": "string",
            "description": "Project name",
        },
        "document_type": {
            "type": "string",
            "enum": [
                "contract",
                "estimate",
                "LOI",
                "change_order",
                "permit",
                "insurance_cert",
                "invoice",
                "correspondence",
                "other",
            ],
            "description": "Type of document",
        },
        "action_required": {
            "type": ["string", "null"],
            "description": "Action required by Desert Services, or null if none",
        },
        "deadline": {
            "type": ["string", "null"],
            "description": "Deadline for action in YYYY-MM-DD format, or null if none",
        },
        "document_number": {
            "type": ["string", "null"],
            "description": "Document ID/number (22-014, C-0001, etc), or null",
        },
    },
    "required": ["gc_company", "project_name", "document_type"],
}

IDENTIFY_PROMPT = """Identify this construction document.

Extract:
- gc_company: The legal company name (from letterhead/signature block, not logos)
- project_name: The project name (use common/short name, not full legal)
- document_type: contract, estimate, LOI, change_order, permit,
  insurance_cert, invoice, correspondence, or other.
  Use "correspondence" for letters, notices, RFIs, or any document that
  isn't itself a contract/estimate/permit/etc.
- action_required: If recipient must act, describe briefly. Else null.
- deadline: Deadline in YYYY-MM-DD format, or null if none.
- document_number: Any ID/number on the doc (22-014, C-0001, EST-1234, etc).

Be concise."""


@mcp.tool()
async def identify_document(
    ctx: MistralContext,
    file_path: str,
    rename: bool = True,
    pages: int = 3,
) -> str:
    """
    Quickly identify a construction document.

    Extracts GC company, project name, and document type from the first few pages.
    Renames the file to a standardized format by default.

    Args:
        ctx: MCP context (injected automatically)
        file_path: Path to the PDF file
        rename: Rename file to {type}_{project}_{gc}_{number}.pdf (default: True)
        pages: Number of pages to analyze (default: 3)

    Returns:
        JSON with gc_company, project_name, document_type, action_required, deadline.
        If rename=True, also includes new_path.

    Example:
        identify_document("/path/to/messy-filename.pdf", rename=True)
        # Returns: {"gc_company": "NFC Contracting", "project_name": "...", ...}
        # Renames to: contract_Good-Day-Gilbert_NFC-Contracting.pdf
    """
    source = Path(file_path)
    client = get_client(ctx)

    # Get page count and clamp
    info = get_pdf_info(str(source))
    actual_pages = min(pages, info.page_count)

    # Slice first N pages to a temp file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(str(source), 1, actual_pages, tmp_path)

        # Send to Mistral with schema
        result_json = await client.extract_structured(
            IDENTIFY_PROMPT,
            IDENTIFY_SCHEMA,
            schema_name="document_identification",
            document_path=tmp_path,
        )

        result = json.loads(result_json)

        # Rename if requested
        if rename:
            doc_type = sanitize_filename(result.get("document_type", "unknown"))
            project = sanitize_filename(result.get("project_name", "unknown"))
            gc = sanitize_filename(result.get("gc_company", "unknown"))
            doc_num = result.get("document_number")

            # Build filename: {type}_{project}_{gc}[_{doc_number}].pdf
            if doc_num:
                doc_num_clean = sanitize_filename(doc_num)
                new_name = f"{doc_type}_{project}_{gc}_{doc_num_clean}{source.suffix}"
            else:
                new_name = f"{doc_type}_{project}_{gc}{source.suffix}"

            new_path = source.parent / new_name

            # Handle collision by adding counter
            counter = 1
            while new_path.exists() and new_path != source:
                if doc_num:
                    base = f"{doc_type}_{project}_{gc}_{doc_num_clean}"
                else:
                    base = f"{doc_type}_{project}_{gc}"
                new_name = f"{base}_{counter}{source.suffix}"
                new_path = source.parent / new_name
                counter += 1

            source.rename(new_path)
            result["new_path"] = str(new_path)
            logger.info(f"Renamed {source.name} -> {new_name}")

        logger.info(
            f"Identified {source.name}: {result.get('document_type')} - "
            f"{result.get('project_name')} / {result.get('gc_company')}"
        )

        return json.dumps(result, indent=2)

    finally:
        # Cleanup temp file
        Path(tmp_path).unlink(missing_ok=True)


# Schema for chunk_document - structure detection
STRUCTURE_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "high_level": {
            "type": "object",
            "properties": {
                "notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key observations about structure or OCR quality",
                },
                "location": {
                    "type": ["string", "null"],
                    "description": "City/region (Tucson, Phoenix, etc.)",
                },
                "gc_company": {
                    "type": "string",
                    "description": "General contractor name",
                },
                "project_name": {"type": "string", "description": "Project name"},
                "document_type": {
                    "type": "string",
                    "enum": ["contract", "LOI", "change_order", "estimate", "other"],
                },
                "has_exhibits": {"type": "boolean"},
                "has_numbered_sections": {"type": "boolean"},
                "has_sov": {
                    "type": "boolean",
                    "description": "Has Schedule of Values with line items and prices",
                },
            },
            "required": ["gc_company", "project_name", "document_type"],
        },
        "chunks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "notes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Chunk-specific warnings or quality issues",
                    },
                    "id": {
                        "type": "string",
                        "description": "Unique ID (exhibit_a, exhibit_a_item_8)",
                    },
                    "parent_id": {
                        "type": ["string", "null"],
                        "description": "Parent chunk ID if nested, null if top-level",
                    },
                    "type": {
                        "type": "string",
                        "enum": [
                            "exhibit",
                            "section",
                            "numbered_item",
                            "sov_line",
                            "signature_block",
                            "other",
                        ],
                    },
                    "label": {
                        "type": "string",
                        "description": "Human-readable label",
                    },
                    "page_start": {
                        "type": "integer",
                        "description": "Starting page number",
                    },
                    "page_end": {
                        "type": "integer",
                        "description": "Ending page number",
                    },
                    "content": {
                        "type": "string",
                        "description": "The actual text content of this chunk",
                    },
                },
                "required": ["id", "type", "label", "content"],
            },
        },
    },
    "required": ["high_level", "chunks"],
}

CHUNK_PROMPT = """Analyze this construction document and extract its structure.

Follow the workflow: INGEST → UNDERSTAND → CHUNK → EXTRACT → VALIDATE → REPORT.
Late chunking: understand first, then chunk. Don’t chunk blindly.

1) UNDERSTAND (high-level scan):
   - Page count and overall structure (exhibits, numbered sections, SOV)
   - Document type and key parties
   - OCR quality (if text is low quality or scanned, note it)

2) CHUNK (structured breakdown):
   - Exhibits (A, B, C...) = chunk per exhibit
   - Numbered items in exhibits = nested chunk under parent exhibit
   - Schedule of Values (SOV) = chunk per line item
   - Sections with headers = chunk per section
   - Signature blocks = own chunk
   - If structure is unclear, use semantic sections but keep them labeled

For each chunk, include:
- id: Unique identifier (exhibit_a, exhibit_a_item_8, sov_line_1)
- parent_id: Parent chunk if nested, null if top-level
- type: exhibit, section, numbered_item, sov_line, signature_block, or other
- label: Human-readable label
- page_start/page_end: Page numbers
- content: The actual text content
- notes: Any OCR/structure issues for this chunk

Be thorough - capture ALL content. Include full text of each chunk."""


@mcp.tool()
async def chunk_document(
    ctx: MistralContext,
    file_path: str,
    pages: int | None = None,
) -> str:
    """
    Analyze document structure and split into chunks with context.

    Returns hierarchical chunks where each chunk knows its parent context.
    Use this for systematic validation - process each chunk independently
    while preserving knowledge of where it came from.

    Args:
        ctx: MCP context (injected automatically)
        file_path: Path to the PDF file
        pages: Max pages to process (default: all)

    Returns:
        JSON with high_level metadata and array of chunks with parent context.

    Example output:
        {
            "high_level": {
                "location": "Tucson",
                "gc_company": "A.R. Mays",
                "project_name": "Sprouts Rita Ranch",
                "document_type": "LOI",
                "has_exhibits": true,
                "has_numbered_sections": true,
                "has_sov": false
            },
            "chunks": [
                {
                    "id": "exhibit_a",
                    "parent_id": null,
                    "type": "exhibit",
                    "label": "Exhibit A - Scope of Work",
                    "page_start": 3,
                    "page_end": 5,
                    "content": "..."
                },
                {
                    "id": "exhibit_a_item_8",
                    "parent_id": "exhibit_a",
                    "type": "numbered_item",
                    "label": "Item 8 - SWPPP Preparation",
                    "page_start": 3,
                    "page_end": 3,
                    "content": "Contractor shall prepare SWPPP..."
                }
            ]
        }
    """
    source = Path(file_path)
    client = get_client(ctx)

    if not source.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Get page count and determine how many to process
    info = get_pdf_info(str(source))
    actual_pages = info.page_count if pages is None else min(pages, info.page_count)

    # If processing subset of pages, slice to temp file
    if actual_pages < info.page_count:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = tmp.name
        extract_pages(str(source), 1, actual_pages, tmp_path)
        doc_path = tmp_path
    else:
        doc_path = str(source)
        tmp_path = None

    try:
        # Use structured extraction with our schema
        result_json = await client.extract_structured(
            CHUNK_PROMPT,
            STRUCTURE_SCHEMA,
            schema_name="document_chunks",
            document_path=doc_path,
        )

        logger.info(f"Chunked {source.name}: {actual_pages} pages processed")

        return result_json

    finally:
        # Cleanup temp file if we created one
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


def main() -> None:
    """Run the MCP server."""
    logger.info("Starting Mistral Document AI MCP server...")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
