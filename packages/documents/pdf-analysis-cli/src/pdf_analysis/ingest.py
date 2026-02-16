"""Document ingestion pipeline: text extraction → LLM analysis → structured JSON.

Two-phase approach:
1. Fast text extraction via pymupdf (no API calls)
2. LLM analysis for classification + structured extraction (Ollama/Gemini/Mistral)

The LLM decides what the document is and extracts relevant fields.
No hardcoded document types — the model figures it out.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf

from pdf_analysis.config import Settings
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class TextResult:
    """Raw text extraction result (pymupdf, no LLM)."""

    text: str
    page_count: int
    has_text: bool
    filename: str
    pages_with_text: int


@dataclass(slots=True)
class IngestResult:
    """Full ingestion result: classification + extraction."""

    filename: str
    document_type: str
    summary: str
    extracted: dict[str, Any]
    page_count: int
    text_method: str  # "pdfplumber" or "ocr"
    model: str
    processing_time_ms: int
    raw_text: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Text extraction (phase 1 — no LLM)
# ---------------------------------------------------------------------------


def _has_text_layer(pdf_path: Path, sample_pages: int = 5) -> tuple[bool, int]:
    """Quick check if PDF has a text layer using pymupdf (milliseconds, not minutes).

    Samples up to ``sample_pages`` pages. Returns (has_text, page_count).
    """
    import pymupdf

    doc = pymupdf.open(pdf_path)
    try:
        page_count = len(doc)
        check = min(sample_pages, page_count)
        for i in range(check):
            if doc.load_page(i).get_text().strip():
                return True, page_count
        return False, page_count
    finally:
        doc.close()


def extract_text(pdf_path: Path, max_pages: int = 0) -> TextResult:
    """Extract text from a PDF using pdfplumber. No LLM calls.

    Runs a fast pymupdf pre-check first — if the PDF has no text layer
    (pure scanned images), skips the expensive pdfplumber extraction entirely.

    Args:
        pdf_path: Path to PDF file.
        max_pages: Max pages to extract (0 = all).

    Returns:
        TextResult with extracted text and metadata.
    """
    path = Path(pdf_path)

    # Fast pre-check: skip pdfplumber entirely for pure-image PDFs
    has_text, page_count = _has_text_layer(path)
    if not has_text:
        return TextResult(
            text="",
            page_count=page_count,
            has_text=False,
            filename=path.name,
            pages_with_text=0,
        )

    pages_text: list[str] = []
    pages_with_text = 0

    with pdfplumber.open(path) as pdf:
        page_count = len(pdf.pages)
        limit = min(max_pages, page_count) if max_pages > 0 else page_count

        for page in pdf.pages[:limit]:
            page_text = page.extract_text()
            if page_text and page_text.strip():
                pages_text.append(page_text)
                pages_with_text += 1
            else:
                pages_text.append("")

    full_text = "\n\n".join(f"--- Page {i + 1} ---\n{t}" for i, t in enumerate(pages_text) if t)

    return TextResult(
        text=full_text,
        page_count=page_count,
        has_text=pages_with_text > 0,
        filename=path.name,
        pages_with_text=pages_with_text,
    )


# ---------------------------------------------------------------------------
# LLM analysis (phase 2)
# ---------------------------------------------------------------------------

_ANALYSIS_PROMPT = """You are analyzing a document from a construction company's internal contracts inbox.

This document could be anything: a subcontract, purchase order, work order, letter of intent, estimate, insurance certificate, tax form, lien waiver, preliminary notice, SWPPP plan, dust permit, or something else entirely.

Analyze the document text below and return a JSON object with these fields:

{
  "document_type": "what this document is (be specific, e.g. 'subcontract', 'purchase_order', 'work_authorization', 'estimate', 'loi', 'noi_certificate', 'insurance_cert', 'w9', 'lien_waiver', 'preliminary_notice', 'swppp_plan', 'checklist', 'contact_info', 'schedule_of_values', etc.)",
  "summary": "one sentence describing what this document is and what it's for",
  "parties": {
    "contractor": "the general contractor / buyer / hiring party name",
    "subcontractor": "the subcontractor / seller / hired party name (usually Desert Services)"
  },
  "project": {
    "name": "project name if mentioned",
    "address": "project address if mentioned",
    "number": "project/job number if mentioned"
  },
  "financial": {
    "contract_value": null or number (total contract/PO amount if stated),
    "retainage_pct": null or number (retainage percentage if stated),
    "payment_terms": "payment terms description if stated"
  },
  "line_items": [
    {"description": "...", "amount": null or number, "qty": null or number, "unit": "..."}
  ],
  "dates": {
    "effective_date": "contract/PO date if stated",
    "start_date": "if stated",
    "completion_date": "if stated"
  },
  "scope": "brief description of the scope of work if stated",
  "requirements": ["list of notable requirements: certified payroll, insurance minimums, bonds, etc."],
  "estimate_reference": "our estimate number if referenced (e.g. Est_09152505-R1, 10142535-R2)"
}

Only include fields you can actually find in the document. Use null for missing values.
If there are line items or a schedule of values, include them.
If there's an estimate number referenced, include it — this helps us match to our records.

DOCUMENT TEXT:
"""


async def ingest_pdf(
    pdf_path: Path,
    provider: ProviderSelector = ProviderSelector.AUTO,
    settings: Settings | None = None,
) -> IngestResult:
    """Full ingestion: text extraction → LLM analysis → structured result.

    1. Extracts text with pdfplumber
    2. If no text, falls back to OCR via provider manager
    3. Sends text to LLM for classification + extraction
    4. Returns structured IngestResult
    """
    started = time.perf_counter()
    path = Path(pdf_path)
    manager = ProviderManager(settings or Settings())

    # Phase 1: text extraction
    text_result = extract_text(path)
    text_method = "pdfplumber"
    raw_text = text_result.text

    # If no text, use OCR
    if not text_result.has_text:
        ocr_result = await manager.ocr(path, provider=provider)
        raw_text = ocr_result.text
        text_method = f"ocr:{ocr_result.provider.value}"

    # Phase 2: LLM analysis
    # Truncate to avoid token limits — first 30K chars is plenty for analysis
    truncated = raw_text[:30000]
    prompt = _ANALYSIS_PROMPT + truncated

    extract_result = await manager.chat(prompt, provider=provider)

    data = extract_result.data
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return IngestResult(
        filename=path.name,
        document_type=str(data.get("document_type", "unknown")),
        summary=str(data.get("summary", "")),
        extracted=data,
        page_count=text_result.page_count,
        text_method=text_method,
        model=extract_result.model,
        processing_time_ms=elapsed_ms,
        raw_text=raw_text,
    )


async def ingest_dir(
    dir_path: Path,
    provider: ProviderSelector = ProviderSelector.AUTO,
    settings: Settings | None = None,
) -> list[IngestResult]:
    """Ingest all PDFs in a directory."""
    results: list[IngestResult] = []
    pdf_files = sorted(dir_path.glob("*.pdf"))

    for i, pdf_file in enumerate(pdf_files):
        print(f"[{i + 1}/{len(pdf_files)}] {pdf_file.name}...")
        try:
            result = await ingest_pdf(pdf_file, provider=provider, settings=settings)
            results.append(result)
            print(f"  → {result.document_type}: {result.summary[:80]}")
        except Exception as err:
            print(f"  → ERROR: {err}")
            results.append(
                IngestResult(
                    filename=pdf_file.name,
                    document_type="error",
                    summary=str(err),
                    extracted={},
                    page_count=0,
                    text_method="none",
                    model="none",
                    processing_time_ms=0,
                    metadata={"error": str(err)},
                )
            )

    return results
