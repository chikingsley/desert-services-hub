"""Document parsing pipeline: kreuzberg text + GLM OCR → reconciled markdown.

Runs BOTH extraction methods on every PDF, then reconciles via opencode CLI
(kimi-k2.5) or a provider chat model. Outputs a single clean markdown document
that captures everything visible in the original.

For large documents, the reconciliation is split into page-aligned chunks with
overlap to stay within the LLM context window while preserving full coverage.
"""

from __future__ import annotations

import asyncio
import re
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pdf_analysis.config import Settings
from pdf_analysis.ingest import extract_text
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector

# ---------------------------------------------------------------------------
# Page-splitting patterns (match markers produced by ingest.py and local.py)
# ---------------------------------------------------------------------------
TEXT_PAGE_RE = re.compile(r"--- Page (\d+) ---")
OCR_PAGE_RE = re.compile(r"<!-- Page (\d+) -->")

# ---------------------------------------------------------------------------
# Chunking constants
# ---------------------------------------------------------------------------
MAX_CHARS_PER_SOURCE = 100_000  # chars per extraction source per chunk
OVERLAP_PAGES = 2  # pages shared between adjacent chunks


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class PageText:
    """A single page's extracted text."""

    page_num: int
    text: str


@dataclass(slots=True)
class ChunkSpec:
    """A chunk of pages to reconcile together."""

    start_page: int  # first core page (inclusive)
    end_page: int  # last core page (inclusive)
    text_pages: list[PageText]  # includes overlap pages
    ocr_pages: list[PageText]  # includes overlap pages
    total_doc_pages: int


@dataclass(slots=True)
class ParseResult:
    """Combined parse result from kreuzberg text + OCR + reconciliation."""

    filename: str
    text_layer: str
    ocr_text: str
    reconciled_markdown: str
    page_count: int
    processing_time_ms: int
    ocr_model: str
    reconcile_model: str
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Reconciliation prompt
# ---------------------------------------------------------------------------
_RECONCILE_PROMPT = """\
You are a document reconstruction specialist. You have TWO extractions of the \
same PDF{page_range_info}:

1. **TEXT-LAYER** (kreuzberg) — exact text from the PDF's internal data. \
Accurate text but loses layout/visual elements.
2. **VISION** (OCR) — a vision model read the rendered page image. Has \
layout/spatial info but may have minor OCR errors.

Combine both into ONE clean structured markdown document:
- Include ALL text from both (if one has content the other missed, include it)
- Reconstruct layout: headers (#), tables (|), bold (**), lists (-)
- Use proper markdown tables for tabular data
- Keep exact numbers, dates, amounts, addresses
- If extractions disagree on a value, prefer the text-layer version
- Note visual elements (logos, stamps) if the OCR mentions them
{overlap_note}\
Return ONLY the reconstructed markdown. No preamble.

---

## TEXT-LAYER (kreuzberg):

{text_layer}

---

## VISION (OCR):

{ocr_text}
"""

# Default opencode model for reconciliation
OPENCODE_MODEL = "zai-coding-plan/glm-4.7"


# ---------------------------------------------------------------------------
# Page splitting & reassembly
# ---------------------------------------------------------------------------
def _split_text_by_pages(text: str, marker_pattern: re.Pattern[str]) -> list[PageText]:
    """Split marked-up text into individual PageText entries.

    Works for both text-layer (``--- Page N ---``) and OCR (``<!-- Page N -->``)
    marker styles.
    """
    if not text or not text.strip():
        return []

    parts = marker_pattern.split(text)
    # parts alternates: [pre-text, page_num, page_text, page_num, page_text, ...]
    pages: list[PageText] = []
    for i in range(1, len(parts), 2):
        page_num = int(parts[i])
        raw = parts[i + 1] if i + 1 < len(parts) else ""
        # Strip "---" separators left by OCR join format (leading or trailing)
        cleaned = re.sub(r"^\s*---\s*", "", raw)
        cleaned = re.sub(r"\s*---\s*$", "", cleaned).strip()
        pages.append(PageText(page_num=page_num, text=cleaned))

    return sorted(pages, key=lambda p: p.page_num)


def _reassemble_pages(
    pages: list[PageText],
    marker_template: str,
    separator: str,
) -> str:
    """Reconstruct marked-up text from a list of PageText entries.

    ``marker_template`` should contain ``{}`` for the page number,
    e.g. ``"--- Page {} ---"`` or ``"<!-- Page {} -->"``
    """
    chunks = [f"{marker_template.format(p.page_num)}\n{p.text}" for p in pages]
    return separator.join(chunks)


# ---------------------------------------------------------------------------
# Chunk builder
# ---------------------------------------------------------------------------
def _build_chunks(
    text_pages: list[PageText],
    ocr_pages: list[PageText],
    max_chars: int = MAX_CHARS_PER_SOURCE,
    overlap: int = OVERLAP_PAGES,
) -> list[ChunkSpec]:
    """Group pages into chunks that fit within the LLM context window.

    Each chunk targets ≤ *max_chars* of text from each extraction source.
    Adjacent chunks share *overlap* pages for context continuity.
    """
    text_by_page = {p.page_num: p for p in text_pages}
    ocr_by_page = {p.page_num: p for p in ocr_pages}
    all_pages = sorted(set(text_by_page) | set(ocr_by_page))

    if not all_pages:
        return []

    total_doc_pages = max(all_pages)

    # Phase 1: determine core page ranges with greedy packing
    core_ranges: list[tuple[int, int]] = []  # (start_idx, end_idx) into all_pages
    chunk_start = 0
    p_chars = 0
    o_chars = 0

    for i, pn in enumerate(all_pages):
        p_len = len(text_by_page[pn].text) if pn in text_by_page else 0
        o_len = len(ocr_by_page[pn].text) if pn in ocr_by_page else 0

        if (p_chars + p_len > max_chars or o_chars + o_len > max_chars) and i > chunk_start:
            core_ranges.append((chunk_start, i - 1))
            chunk_start = i
            p_chars = p_len
            o_chars = o_len
        else:
            p_chars += p_len
            o_chars += o_len

    core_ranges.append((chunk_start, len(all_pages) - 1))

    # Phase 2: expand each chunk with overlap pages and build ChunkSpecs
    chunks: list[ChunkSpec] = []
    for idx, (start_idx, end_idx) in enumerate(core_ranges):
        core_start = all_pages[start_idx]
        core_end = all_pages[end_idx]

        # Include overlap pages from the tail of the previous chunk
        if idx > 0:
            prev_end_idx = core_ranges[idx - 1][1]
            prev_start = max(core_ranges[idx - 1][0], prev_end_idx - overlap + 1)
            overlap_nums = all_pages[prev_start : prev_end_idx + 1]
        else:
            overlap_nums = []

        chunk_nums = list(dict.fromkeys(overlap_nums + all_pages[start_idx : end_idx + 1]))

        chunks.append(
            ChunkSpec(
                start_page=core_start,
                end_page=core_end,
                text_pages=[text_by_page[n] for n in chunk_nums if n in text_by_page],
                ocr_pages=[ocr_by_page[n] for n in chunk_nums if n in ocr_by_page],
                total_doc_pages=total_doc_pages,
            )
        )

    return chunks


# ---------------------------------------------------------------------------
# Prompt formatting
# ---------------------------------------------------------------------------
def _format_reconcile_prompt(
    text_layer_text: str,
    ocr_text: str,
    chunk: ChunkSpec | None = None,
    chunk_index: int = 0,
) -> str:
    """Build the reconciliation prompt, optionally scoped to a page range."""
    if chunk is None:
        page_range_info = ""
        overlap_note = ""
    else:
        page_range_info = f" (Pages {chunk.start_page}\u2013{chunk.end_page} of {chunk.total_doc_pages})"
        if chunk_index > 0 and chunk.text_pages:
            first = min(p.page_num for p in (chunk.text_pages or chunk.ocr_pages))
            if first < chunk.start_page:
                overlap_note = (
                    f"\nNote: Pages {first}\u2013{chunk.start_page - 1} are overlap from the "
                    f"previous section for context continuity. Focus your reconstruction on "
                    f"Pages {chunk.start_page}\u2013{chunk.end_page}.\n\n"
                )
            else:
                overlap_note = "\n"
        else:
            overlap_note = "\n"

    return _RECONCILE_PROMPT.format(
        page_range_info=page_range_info,
        overlap_note=overlap_note,
        text_layer=text_layer_text,
        ocr_text=ocr_text,
    )


# ---------------------------------------------------------------------------
# Reconciliation backends
# ---------------------------------------------------------------------------
async def _reconcile_opencode(prompt: str, model: str = OPENCODE_MODEL) -> tuple[str, str]:
    """Reconcile via opencode CLI. Returns (markdown, model_name)."""
    if not shutil.which("opencode"):
        raise RuntimeError("opencode CLI not found. Install: bun add -g opencode-ai")

    # Sanitize null bytes that break subprocess args
    clean = prompt.replace("\x00", "")

    proc = await asyncio.create_subprocess_exec(
        "opencode",
        "run",
        "-m",
        model,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(input=clean.encode()), timeout=300)

    if proc.returncode != 0:
        raise RuntimeError(f"opencode failed (exit {proc.returncode}): {stderr.decode()[:500]}")

    output = stdout.decode()
    # opencode run prints a header line like "> build · k2p5" then the content
    lines = output.split("\n")
    content_lines: list[str] = []
    past_header = False
    for line in lines:
        if not past_header:
            if line.strip().startswith("> ") or line.strip() == "":
                continue
            past_header = True
        content_lines.append(line)

    return "\n".join(content_lines).strip(), model


async def _reconcile_gemini(prompt: str, model: str = "gemini-2.5-flash") -> tuple[str, str]:
    """Reconcile via Gemini CLI (headless mode, stdin). Returns (markdown, model_name)."""
    if not shutil.which("gemini"):
        raise RuntimeError("gemini CLI not found. Install: bun add -g @anthropic-ai/gemini-cli")

    # Sanitize null bytes
    clean = prompt.replace("\x00", "")

    proc = await asyncio.create_subprocess_exec(
        "gemini",
        "-m",
        model,
        "-p",
        "",
        "-o",
        "text",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=clean.encode()), timeout=300
    )

    if proc.returncode != 0:
        raise RuntimeError(f"gemini failed (exit {proc.returncode}): {stderr.decode()[:500]}")

    return stdout.decode().strip(), model


async def _reconcile_codex(
    prompt: str, reasoning_effort: str = "medium",
) -> tuple[str, str]:
    """Reconcile via Codex CLI (gpt-5.3-codex). Returns (markdown, model_name).

    reasoning_effort: "low", "medium", or "high".
    Model format: "codex" or "codex:high" or "codex:low".
    """
    if not shutil.which("codex"):
        raise RuntimeError("codex CLI not found. Install: npm i -g @openai/codex")

    clean = prompt.replace("\x00", "")

    proc = await asyncio.create_subprocess_exec(
        "codex",
        "exec",
        "-c",
        f'model_reasoning_effort="{reasoning_effort}"',
        "-",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=clean.encode()), timeout=300
    )

    if proc.returncode != 0:
        raise RuntimeError(f"codex failed (exit {proc.returncode}): {stderr.decode()[:500]}")

    # codex exec prints metadata + response. Last non-empty line before "tokens used" is the answer.
    # But with -o we'd need a tempfile. Instead, parse stdout: content is between the prompt and "tokens used".
    output = stdout.decode()
    lines = output.split("\n")
    # Find content lines: after the user prompt echo, before "tokens used"
    content_lines: list[str] = []
    in_response = False
    for line in lines:
        if line.strip() == "codex":
            in_response = True
            continue
        if in_response:
            if line.strip() == "tokens used":
                break
            content_lines.append(line)

    model_name = f"codex/gpt-5.3-codex:{reasoning_effort}"
    return "\n".join(content_lines).strip(), model_name


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


def _is_gemini_model(model: str) -> bool:
    """Check if a model string refers to a Gemini model (uses gemini CLI)."""
    return model.startswith("gemini")


def _is_codex_model(model: str) -> bool:
    """Check if a model string refers to Codex (uses codex CLI)."""
    return model.startswith("codex")


async def _reconcile_chunk(
    text_layer_text: str,
    ocr_text: str,
    reconcile_model: str,
    manager: ProviderManager,
    chunk: ChunkSpec | None = None,
    chunk_index: int = 0,
) -> tuple[str, str]:
    """Run reconciliation for a single chunk. Returns (markdown, model_name)."""
    prompt = _format_reconcile_prompt(text_layer_text, ocr_text, chunk=chunk, chunk_index=chunk_index)

    if reconcile_model == "local":
        return await _reconcile_provider(prompt, manager, ProviderSelector.LOCAL)
    if _is_gemini_model(reconcile_model):
        return await _reconcile_gemini(prompt, model=reconcile_model)
    if _is_codex_model(reconcile_model):
        # "codex" or "codex:high" or "codex:low"
        parts = reconcile_model.split(":", 1)
        effort = parts[1] if len(parts) > 1 else "medium"
        return await _reconcile_codex(prompt, reasoning_effort=effort)
    return await _reconcile_opencode(prompt, model=reconcile_model)


# ---------------------------------------------------------------------------
# Main parse pipeline
# ---------------------------------------------------------------------------
async def parse_pdf(
    pdf_path: Path,
    ocr_provider: ProviderSelector = ProviderSelector.LOCAL,
    reconcile_model: str = OPENCODE_MODEL,
    settings: Settings | None = None,
) -> ParseResult:
    """Parse a PDF using both kreuzberg text extraction and OCR, then reconcile.

    For small documents that fit within the LLM context, reconciliation
    happens in a single pass.  For large documents, the text is split into
    page-aligned chunks with 2-page overlap between adjacent chunks.

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

    # Phase 1: quick text-layer check + kreuzberg extraction
    text_result = extract_text(path)
    text_layer = text_result.text if text_result.has_text else ""

    # Phase 2: OCR (vision-based)
    ocr_result = await manager.ocr(path, provider=ocr_provider)
    ocr_text = ocr_result.text

    # Shortcut: pure-image PDF — no text layer, nothing to reconcile.
    # OCR output is the final product.
    if not text_result.has_text:
        print(
            f"[parse] {path.name}: no text layer ({text_result.page_count} pages), "
            f"using OCR output directly",
            file=sys.stderr,
        )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ParseResult(
            filename=path.name,
            text_layer="",
            ocr_text=ocr_text,
            reconciled_markdown=ocr_text,
            page_count=text_result.page_count,
            processing_time_ms=elapsed_ms,
            ocr_model=ocr_result.model,
            reconcile_model="none (ocr-only)",
            metadata={
                "ocr_provider": ocr_result.provider.value,
                "ocr_pages": ocr_result.pages,
                "chunks_used": 0,
                "ocr_only": True,
            },
        )

    # Phase 3: split into pages and build chunks
    text_pages = _split_text_by_pages(text_layer, TEXT_PAGE_RE)
    ocr_pages = _split_text_by_pages(ocr_text, OCR_PAGE_RE)

    # Fallback: if markers weren't found, treat entire text as one page
    if not text_pages and text_layer.strip():
        text_pages = [PageText(page_num=1, text=text_layer)]
    if not ocr_pages and ocr_text.strip():
        ocr_pages = [PageText(page_num=1, text=ocr_text)]

    chunks = _build_chunks(text_pages, ocr_pages)

    # Phase 4: reconcile (single-pass or chunked)
    chunks_used = max(len(chunks), 1)

    if len(chunks) <= 1:
        # Small document — single pass, no truncation
        reconciled, rmodel = await _reconcile_chunk(
            text_layer, ocr_text, reconcile_model, manager
        )
    else:
        print(
            f"[parse] {path.name}: {len(chunks)} chunks for {text_result.page_count} pages",
            file=sys.stderr,
        )
        parts: list[str] = []
        rmodel = reconcile_model

        for i, chunk in enumerate(chunks):
            p_text = _reassemble_pages(chunk.text_pages, "--- Page {} ---", "\n\n")
            o_text = _reassemble_pages(chunk.ocr_pages, "<!-- Page {} -->", "\n\n---\n\n")

            print(
                f"[parse]   chunk {i + 1}/{len(chunks)}: "
                f"pages {chunk.start_page}\u2013{chunk.end_page} "
                f"(text={len(p_text):,} ocr={len(o_text):,})",
                file=sys.stderr,
            )

            chunk_md, rmodel = await _reconcile_chunk(
                p_text, o_text, reconcile_model, manager,
                chunk=chunk, chunk_index=i,
            )
            parts.append(chunk_md)

            print(
                f"[parse]   chunk {i + 1}/{len(chunks)} done: {len(chunk_md):,} chars",
                file=sys.stderr,
            )

        reconciled = "\n\n".join(parts)

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return ParseResult(
        filename=path.name,
        text_layer=text_layer,
        ocr_text=ocr_text,
        reconciled_markdown=reconciled,
        page_count=text_result.page_count,
        processing_time_ms=elapsed_ms,
        ocr_model=ocr_result.model,
        reconcile_model=rmodel,
        metadata={
            "ocr_provider": ocr_result.provider.value,
            "ocr_pages": ocr_result.pages,
            "chunks_used": chunks_used,
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
                    text_layer="",
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
