"""PDF Analysis HTTP API — FastAPI service wrapping the CLI functions.

Exposes the same functionality as the CLI over HTTP so TypeScript callers
can use fetch() instead of spawning subprocesses.

Endpoints:
  POST /estimate   — kreuzberg table extraction (deterministic, no LLM)
  POST /classify   — heuristic document classification (no LLM)
  POST /ingest     — text extraction + LLM classification + structured extraction
  POST /parse      — full pipeline: kreuzberg + OCR + LLM reconciliation
  POST /ocr        — raw OCR text extraction (no LLM reconciliation)
  GET  /health     — health check
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pdf_analysis.config import Settings
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="pdf-analysis", version="0.1.0")

_manager: ProviderManager | None = None


def get_manager() -> ProviderManager:
    global _manager
    if _manager is None:
        _manager = ProviderManager(Settings())
    return _manager


def _resolve_path(raw: str) -> Path:
    """Validate that a request path exists; raise 404 if not."""
    pdf_path = Path(raw)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {raw}")
    return pdf_path


def _strip_keys(d: dict[str, Any], *keys: str) -> dict[str, Any]:
    """Remove the specified keys from a dict and return it."""
    for key in keys:
        d.pop(key, None)
    return d


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class FileRequest(BaseModel):
    path: str
    provider: str = "auto"


class OcrRequest(BaseModel):
    path: str
    provider: str = "auto"
    pages: str | None = None  # e.g. "1-2" or "1,3,5"


class ClassifyTextRequest(BaseModel):
    text: str
    filename: str = ""


class ParseRequest(BaseModel):
    path: str
    ocr_provider: str = "local"
    reconcile_model: str = "zai-coding-plan/glm-4.7"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_endpoint(req: OcrRequest) -> dict[str, Any]:
    """Raw OCR text extraction. Returns plain text, no LLM reconciliation."""
    pdf_path = _resolve_path(req.path)

    parsed_pages: list[int] | None = None
    if req.pages:
        from pdf_analysis.cli import parse_page_spec
        parsed_pages = parse_page_spec(req.pages)

    provider = ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.AUTO

    try:
        result = await get_manager().ocr(pdf_path, pages=parsed_pages, provider=provider)
        return asdict(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/estimate")
async def estimate_endpoint(req: FileRequest) -> dict[str, Any]:
    """Extract structured schedule of values from a Desert Services estimate PDF."""
    pdf_path = _resolve_path(req.path)

    from pdf_analysis.estimates import extract_estimate

    started = time.perf_counter()
    try:
        result = await asyncio.to_thread(extract_estimate, pdf_path)
        data = result.model_dump()
        data["processing_time_ms"] = int((time.perf_counter() - started) * 1000)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/classify")
async def classify_endpoint(req: FileRequest) -> list[dict[str, Any]]:
    """Classify PDF by document type using heuristics (no LLM)."""
    pdf_path = _resolve_path(req.path)

    from pdf_analysis.classify import ClassifyResult, classify_dir, classify_pdf

    try:
        results: list[ClassifyResult]
        if pdf_path.is_dir():
            results = await asyncio.to_thread(classify_dir, pdf_path)
        else:
            results = [await asyncio.to_thread(classify_pdf, pdf_path)]
        return [asdict(r) for r in results]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/classify-text")
async def classify_text_endpoint(req: ClassifyTextRequest) -> dict[str, Any]:
    """Classify from pre-extracted text (no file I/O, pure regex)."""
    from pdf_analysis.classify import classify_text

    result = classify_text(req.text, filename=req.filename)
    return asdict(result)


@app.post("/ingest")
async def ingest_endpoint(req: FileRequest) -> list[dict[str, Any]]:
    """Analyze PDF with LLM: classify + extract in one pass."""
    pdf_path = _resolve_path(req.path)

    from pdf_analysis.ingest import IngestResult, ingest_dir, ingest_pdf

    provider = ProviderSelector(req.provider) if req.provider != "auto" else ProviderSelector.AUTO

    try:
        results: list[IngestResult]
        if pdf_path.is_dir():
            results = await ingest_dir(pdf_path, provider=provider)
        else:
            results = [await ingest_pdf(pdf_path, provider=provider)]

        return [_strip_keys(asdict(r), "raw_text") for r in results]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/parse")
async def parse_endpoint(req: ParseRequest) -> list[dict[str, Any]]:
    """Full parse: kreuzberg + OCR + LLM reconciliation."""
    pdf_path = _resolve_path(req.path)

    from pdf_analysis.parse import ParseResult, parse_dir, parse_pdf

    ocr_provider = (
        ProviderSelector(req.ocr_provider)
        if req.ocr_provider != "auto"
        else ProviderSelector.LOCAL
    )

    try:
        results: list[ParseResult]
        if pdf_path.is_dir():
            results = await parse_dir(
                pdf_path, ocr_provider=ocr_provider, reconcile_model=req.reconcile_model
            )
        else:
            results = [
                await parse_pdf(
                    pdf_path, ocr_provider=ocr_provider, reconcile_model=req.reconcile_model
                )
            ]

        return [_strip_keys(asdict(r), "text_layer", "ocr_text") for r in results]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
