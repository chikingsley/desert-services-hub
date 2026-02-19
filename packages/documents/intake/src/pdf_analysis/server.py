"""Document extraction HTTP API.

Three extraction tiers — all include LLM classification:
  POST /native-text-extraction  — kreuzberg text layer + LLM classify
  POST /ocr-extraction          — GLM-OCR vision + LLM classify
  POST /full-extraction         — kreuzberg + OCR + LLM reconcile + classify

Specialist extractors — take a file path, return structured JSON:
  POST /estimate   — Desert Services estimate: line items, totals, header
  POST /noi        — ADEQ NOI certificate: site, applicant, coordinates
  POST /contract   — Subcontract/PO: parties, value, scope, terms

Generic LLM gateway (single entry point for all TS callers):
  POST /chat       — Send any prompt, get parsed JSON back (local → gemini fallback)

Utility:
  GET  /health
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pdf_analysis.config import Settings
from pdf_analysis.ingest import _ANALYSIS_PROMPT, extract_text, ingest_pdf
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="pdf-analysis", version="0.2.0")

_manager: ProviderManager | None = None


def get_manager() -> ProviderManager:
    global _manager
    if _manager is None:
        _manager = ProviderManager(Settings())
    return _manager


def _resolve_path(raw: str) -> Path:
    p = Path(raw)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {raw}")
    return p


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class FileRequest(BaseModel):
    path: str
    provider: str = "auto"


class FullExtractionRequest(BaseModel):
    path: str
    ocr_provider: str = "local"
    reconcile_model: str = "zai-coding-plan/glm-4.7"


class ChatRequest(BaseModel):
    prompt: str
    provider: str = "auto"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _llm_extract(
    text: str,
    provider: ProviderSelector,
    manager: ProviderManager,
    prompt: str = _ANALYSIS_PROMPT,
) -> tuple[dict[str, Any], str]:
    """LLM extraction on pre-extracted text. Returns (data_dict, model_name)."""
    result = await manager.chat(prompt + text[:30_000], provider=provider)
    return result.data, result.model


_VERIFY_ESTIMATE_PROMPT = """\
You are a QC reviewer for Desert Services estimates. Given this structured extraction, \
identify any issues:

- Math errors: do line item totals match qty × unit_price? Do section subtotals \
  sum correctly? Does the grand total match?
- Missing required header fields (estimate_number, gc_name, job_name)
- Line items with zero or negative quantities or prices
- Suspiciously high or low unit prices for erosion control / dust suppression work

Return JSON: {"flags": ["concise description of issue"]}
Return empty flags array if everything looks correct.

EXTRACTED ESTIMATE:
"""

_VERIFY_NOI_PROMPT = """\
You are a QC reviewer for ADEQ NOI (Notice of Intent) stormwater permit extractions \
in Arizona. Given this structured extraction, identify any issues:

- Coordinates outside Arizona bounds (lat 31–37°N, lon 109–115°W)
- Missing critical fields: applicant_name, site_name, permit_id, acres_disturbed
- Acres disturbed outside plausible range for construction (0.1–500 acres)
- Outfall coordinates that don't match the site location
- Malformed permit_id or ltf_number format

Return JSON: {"flags": ["concise description of issue"]}
Return empty flags array if everything looks correct.

EXTRACTED NOI:
"""


async def _verify(
    data: dict[str, Any],
    hint: str,
    manager: ProviderManager,
) -> list[str]:
    """LLM sanity-check on structured extraction. Returns flag strings."""
    import json

    prompts = {
        "estimate": _VERIFY_ESTIMATE_PROMPT,
        "noi": _VERIFY_NOI_PROMPT,
    }
    prompt = prompts.get(hint)
    if not prompt:
        return []

    try:
        result = await manager.chat(
            prompt + json.dumps(data, indent=2)[:10_000],
            provider=ProviderSelector.AUTO,
        )
        flags = result.data.get("flags", [])
        return [str(f) for f in flags] if isinstance(flags, list) else []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /chat  (generic LLM gateway — single entry point for all TS callers)
# ---------------------------------------------------------------------------


@app.post("/chat")
async def chat_endpoint(req: ChatRequest) -> dict[str, Any]:
    """Generic LLM prompt → parsed JSON. Local (granite4) first, Gemini fallback.

    The single gateway for all TypeScript LLM calls — email triage, contact
    enrichment, contract field extraction. Provider routing and fallback are
    handled here so TypeScript has no direct Ollama/Gemini knowledge.
    """
    provider = (
        ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.AUTO
    )
    manager = get_manager()
    try:
        result = await manager.chat(req.prompt, provider=provider)
        return {"data": result.data, "model": result.model, "metadata": result.metadata}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /native-text-extraction  (kreuzberg + LLM classify)
# ---------------------------------------------------------------------------


@app.post("/native-text-extraction")
async def native_text_extraction(req: FileRequest) -> dict[str, Any]:
    """Kreuzberg text layer extraction + LLM classification.

    Fast and deterministic. Falls back to OCR automatically if the file has no
    text layer. Best default for most documents.
    """
    path = _resolve_path(req.path)
    provider = ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.AUTO

    started = time.perf_counter()
    result = await ingest_pdf(path, provider=provider)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return {
        "filename": result.filename,
        "document_type": result.document_type,
        "summary": result.summary,
        "extracted": result.extracted,
        "text": result.raw_text,
        "page_count": result.page_count,
        "extraction_method": result.text_method,
        "model": result.model,
        "processing_time_ms": elapsed_ms,
        "metadata": result.metadata,
    }


# ---------------------------------------------------------------------------
# POST /ocr-extraction  (GLM-OCR vision + LLM classify)
# ---------------------------------------------------------------------------


@app.post("/ocr-extraction")
async def ocr_extraction(req: FileRequest) -> dict[str, Any]:
    """GLM-OCR vision model extraction + LLM classification.

    Sends each page as an image to the vision model. Use when the document is
    scanned, image-heavy, or when you explicitly want the vision pass regardless
    of whether a text layer exists.
    """
    path = _resolve_path(req.path)
    provider = ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.LOCAL
    manager = get_manager()

    started = time.perf_counter()
    ocr_result = await manager.ocr(path, provider=provider)
    text = ocr_result.text

    data, model = await _llm_extract(text, provider, manager)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return {
        "filename": path.name,
        "document_type": str(data.get("document_type", "unknown")),
        "summary": str(data.get("summary", "")),
        "extracted": data,
        "text": text,
        "page_count": len(ocr_result.pages),
        "extraction_method": f"ocr:{ocr_result.provider.value}",
        "model": model,
        "processing_time_ms": elapsed_ms,
        "metadata": {
            "ocr_model": ocr_result.model,
            "ocr_pages": ocr_result.pages,
            **ocr_result.metadata,
        },
    }


# ---------------------------------------------------------------------------
# POST /full-extraction  (kreuzberg + OCR + LLM reconcile + classify)
# ---------------------------------------------------------------------------


@app.post("/full-extraction")
async def full_extraction(req: FullExtractionRequest) -> dict[str, Any]:
    """Kreuzberg + GLM-OCR + LLM reconciliation + classification.

    Most expensive option. Both extraction methods run, then an LLM merges them
    into clean markdown before classifying. Use for highest-quality text from
    complex or visually dense documents.
    """
    path = _resolve_path(req.path)
    ocr_provider = (
        ProviderSelector(req.ocr_provider)
        if req.ocr_provider != "auto"
        else ProviderSelector.LOCAL
    )
    manager = get_manager()

    from pdf_analysis.parse import parse_pdf

    started = time.perf_counter()
    parse_result = await parse_pdf(
        path, ocr_provider=ocr_provider, reconcile_model=req.reconcile_model
    )
    text = parse_result.reconciled_markdown

    data, classify_model = await _llm_extract(text, ProviderSelector.AUTO, manager)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return {
        "filename": path.name,
        "document_type": str(data.get("document_type", "unknown")),
        "summary": str(data.get("summary", "")),
        "extracted": data,
        "text": text,
        "page_count": parse_result.page_count,
        "extraction_method": "full",
        "model": classify_model,
        "processing_time_ms": elapsed_ms,
        "metadata": {
            "ocr_model": parse_result.ocr_model,
            "reconcile_model": parse_result.reconcile_model,
            **parse_result.metadata,
        },
    }


# ---------------------------------------------------------------------------
# POST /estimate  (kreuzberg table extraction, no LLM)
# ---------------------------------------------------------------------------


@app.post("/estimate")
async def estimate_endpoint(req: FileRequest) -> dict[str, Any]:
    """Structured extraction for Desert Services estimate PDFs.

    Returns line items, section subtotals, header fields, and grand total.
    Uses kreuzberg table extraction — no LLM.
    """
    path = _resolve_path(req.path)

    from pdf_analysis.analysis.estimates import extract_estimate

    started = time.perf_counter()
    try:
        result = await asyncio.to_thread(extract_estimate, path)
        data = result.model_dump()
        data["flags"] = await _verify(data, "estimate", get_manager())
        data["processing_time_ms"] = int((time.perf_counter() - started) * 1000)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /noi  (kreuzberg + regex, no LLM)
# ---------------------------------------------------------------------------


@app.post("/noi")
async def noi_endpoint(req: FileRequest) -> dict[str, Any]:
    """Structured extraction for ADEQ NOI certificates.

    Extracts applicant, site, coordinates, outfalls, SWPPP contact, permit ID.
    Uses kreuzberg text extraction + regex parsing — no LLM.
    Falls back to OCR if no text layer.
    """
    path = _resolve_path(req.path)

    from pdf_analysis.analysis.noi import extract_noi

    started = time.perf_counter()
    try:
        text_result = extract_text(path)
        text = text_result.text

        if not text_result.has_text:
            manager = get_manager()
            ocr_result = await manager.ocr(path, provider=ProviderSelector.LOCAL)
            text = ocr_result.text

        result = extract_noi(text)
        data = result.model_dump(by_alias=False)
        data["filename"] = path.name
        data["flags"] = await _verify(data, "noi", get_manager())
        data["processing_time_ms"] = int((time.perf_counter() - started) * 1000)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /contract  (kreuzberg + LLM)
# ---------------------------------------------------------------------------

_CONTRACT_PROMPT = """\
Analyze this construction subcontract, purchase order, or work order.
Return JSON with these fields:

{
  "contractor": "GC / hiring party name",
  "subcontractor": "subcontractor / seller name (usually Desert Services)",
  "contract_value": null or number,
  "retainage_pct": null or number,
  "payment_terms": "description if stated",
  "scope": "brief scope of work",
  "project_name": "project name if mentioned",
  "project_address": "project address if mentioned",
  "effective_date": "contract date if stated",
  "start_date": null or "date string",
  "completion_date": null or "date string",
  "requirements": ["key requirements: bonds, certified payroll, insurance minimums"],
  "estimate_reference": "our estimate number if referenced (e.g. Est_09152505-R1)"
}

Use null for missing values.

CONTRACT TEXT:
"""


@app.post("/contract")
async def contract_endpoint(req: FileRequest) -> dict[str, Any]:
    """Structured extraction for subcontracts, POs, and work orders.

    Returns parties, contract value, scope, dates, and key requirements.
    Uses kreuzberg text extraction + LLM. Falls back to OCR if no text layer.
    """
    path = _resolve_path(req.path)
    provider = ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.AUTO
    manager = get_manager()

    started = time.perf_counter()
    try:
        text_result = extract_text(path)
        text = text_result.text

        if not text_result.has_text:
            ocr_result = await manager.ocr(path, provider=ProviderSelector.LOCAL)
            text = ocr_result.text

        data, model = await _llm_extract(text, provider, manager, prompt=_CONTRACT_PROMPT)
        data["filename"] = path.name
        data["model"] = model
        data["processing_time_ms"] = int((time.perf_counter() - started) * 1000)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
