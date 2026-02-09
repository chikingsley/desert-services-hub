"""Document parsing pipeline: pdfplumber text + GLM OCR → reconciled markdown.

Runs BOTH extraction methods on every PDF, then reconciles via opencode CLI
(kimi-k2.5) or a provider chat model. Outputs a single clean markdown document
that captures everything visible in the original.
"""

from __future__ import annotations

import asyncio
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pdf_analysis.config import Settings
from pdf_analysis.ingest import extract_text
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector


@dataclass(slots=True)
class ParseResult:
    """Combined parse result from pdfplumber + OCR + reconciliation."""

    filename: str
    pdfplumber_text: str
    ocr_text: str
    reconciled_markdown: str
    page_count: int
    processing_time_ms: int
    ocr_model: str
    reconcile_model: str
    metadata: dict[str, Any] = field(default_factory=dict)


_RECONCILE_PROMPT = """You are a document reconstruction specialist. You have TWO extractions of the same PDF:

1. **TEXT-LAYER** (pdfplumber) — exact text from the PDF's internal data. Accurate text but loses layout/visual elements.
2. **VISION** (OCR) — a vision model read the rendered page image. Has layout/spatial info but may have minor OCR errors.

Combine both into ONE clean structured markdown document:
- Include ALL text from both (if one has content the other missed, include it)
- Reconstruct layout: headers (#), tables (|), bold (**), lists (-)
- Use proper markdown tables for tabular data
- Keep exact numbers, dates, amounts, addresses
- If extractions disagree on a value, prefer the text-layer version
- Note visual elements (logos, stamps) if the OCR mentions them

Return ONLY the reconstructed markdown. No preamble.

---

## TEXT-LAYER (pdfplumber):

{pdfplumber_text}

---

## VISION (OCR):

{ocr_text}
"""

# Default opencode model for reconciliation
OPENCODE_MODEL = "kimi-for-coding/k2p5"


async def _reconcile_opencode(prompt: str, model: str = OPENCODE_MODEL) -> tuple[str, str]:
    """Reconcile via opencode CLI (kimi-k2.5). Returns (markdown, model_name)."""
    if not shutil.which("opencode"):
        raise RuntimeError("opencode CLI not found. Install: bun add -g opencode-ai")

    proc = await asyncio.create_subprocess_exec(
        "opencode",
        "run",
        "-m",
        model,
        prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

    if proc.returncode != 0:
        raise RuntimeError(f"opencode failed (exit {proc.returncode}): {stderr.decode()[:500]}")

    output = stdout.decode()
    # opencode run prints a header line like "> build · k2p5" then the content
    lines = output.split("\n")
    # Skip blank lines and the "> build · model" header
    content_lines = []
    past_header = False
    for line in lines:
        if not past_header:
            if line.strip().startswith("> ") or line.strip() == "":
                continue
            past_header = True
        content_lines.append(line)

    return "\n".join(content_lines).strip(), model


async def _reconcile_provider(
    prompt: str,
    manager: ProviderManager,
    provider: ProviderSelector,
) -> tuple[str, str]:
    """Reconcile via provider chat model. Returns (markdown, model_name)."""
    chat_result = await manager.chat(prompt, provider=provider)
    reconciled = ""
    if chat_result.raw_text:
        reconciled = chat_result.raw_text
    elif isinstance(chat_result.data, dict):
        reconciled = chat_result.data.get("value", "")
    return reconciled, chat_result.model


async def parse_pdf(
    pdf_path: Path,
    ocr_provider: ProviderSelector = ProviderSelector.LOCAL,
    reconcile_model: str = OPENCODE_MODEL,
    settings: Settings | None = None,
) -> ParseResult:
    """Parse a PDF using both pdfplumber and OCR, then reconcile.

    Args:
        pdf_path: Path to PDF.
        ocr_provider: Provider for OCR (default: local/glm-ocr).
        reconcile_model: OpenCode model for reconciliation (default: kimi-for-coding/k2p5).
            Pass "local" to use local provider chat instead.
        settings: Optional settings override.
    """
    started = time.perf_counter()
    path = Path(pdf_path)
    cfg = settings or Settings()
    manager = ProviderManager(cfg)

    # Phase 1: pdfplumber text extraction (fast, local)
    text_result = extract_text(path)
    pdfplumber_text = text_result.text if text_result.has_text else "[no extractable text layer]"

    # Phase 2: GLM OCR (vision-based)
    ocr_result = await manager.ocr(path, provider=ocr_provider)
    ocr_text = ocr_result.text

    # Phase 3: reconcile both into clean markdown
    prompt = _RECONCILE_PROMPT.format(
        pdfplumber_text=pdfplumber_text[:60000],
        ocr_text=ocr_text[:60000],
    )

    if reconcile_model == "local":
        reconciled, rmodel = await _reconcile_provider(prompt, manager, ProviderSelector.LOCAL)
    else:
        reconciled, rmodel = await _reconcile_opencode(prompt, model=reconcile_model)

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return ParseResult(
        filename=path.name,
        pdfplumber_text=pdfplumber_text,
        ocr_text=ocr_text,
        reconciled_markdown=reconciled,
        page_count=text_result.page_count,
        processing_time_ms=elapsed_ms,
        ocr_model=ocr_result.model,
        reconcile_model=rmodel,
        metadata={
            "ocr_provider": ocr_result.provider.value,
            "ocr_pages": ocr_result.pages,
        },
    )


async def parse_dir(
    dir_path: Path,
    ocr_provider: ProviderSelector = ProviderSelector.LOCAL,
    reconcile_model: str = OPENCODE_MODEL,
    settings: Settings | None = None,
) -> list[ParseResult]:
    """Parse all PDFs in a directory."""
    results: list[ParseResult] = []
    pdf_files = sorted(dir_path.glob("*.pdf"))

    for i, pdf_file in enumerate(pdf_files):
        print(f"[{i + 1}/{len(pdf_files)}] {pdf_file.name}...")
        try:
            result = await parse_pdf(
                pdf_file,
                ocr_provider=ocr_provider,
                reconcile_model=reconcile_model,
                settings=settings,
            )
            results.append(result)
            lines = result.reconciled_markdown.count("\n")
            print(f"  -> {lines} lines, {result.processing_time_ms}ms")
        except Exception as err:
            print(f"  -> ERROR: {err}")
            results.append(
                ParseResult(
                    filename=pdf_file.name,
                    pdfplumber_text="",
                    ocr_text="",
                    reconciled_markdown=f"# Error\n\n{err}",
                    page_count=0,
                    processing_time_ms=0,
                    ocr_model="none",
                    reconcile_model="none",
                    metadata={"error": str(err)},
                )
            )

    return results
