from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

from pdf_analysis.config import Settings
from pdf_analysis.types import (
    DocumentType,
    ExtractResult,
    IdentifyResult,
    OCRResult,
    PlanAnalysisResult,
    PlanFinding,
    PlanFindingType,
    ProviderName,
    is_document_type,
    is_plan_finding_type,
)
from pdf_analysis.utils import extract_json_from_text, sanitize_filename

from .base import BaseProvider

genai: Any = None
types: Any = None

try:
    from google import genai as _genai
    from google.genai import types as _types
except Exception:  # pragma: no cover - optional dependency guard
    pass
else:
    genai = _genai
    types = _types


class GeminiProvider(BaseProvider):
    name = ProviderName.GEMINI
    cost_per_1k_pages = 3.0

    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = settings.gemini_model
        self.client: Any | None = None
        if genai is not None and settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)

    async def is_available(self) -> bool:
        return self.client is not None

    async def ocr(self, pdf_path: Path, pages: list[int] | None = None) -> OCRResult:
        started = time.perf_counter()
        if self.client is None:
            raise RuntimeError("Gemini provider is unavailable (missing GEMINI_API_KEY)")

        pages_hint = f" Focus on pages: {', '.join(str(p) for p in pages)}." if pages else ""
        prompt = (
            "Extract all text from this PDF. Preserve structure, section headers, tables, and "
            "important formatting in markdown." + pages_hint
        )
        text = await asyncio.to_thread(self._generate_pdf_text, pdf_path, prompt)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return OCRResult(
            provider=self.name,
            text=text,
            pages=pages or [1],
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=0.95,
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        started = time.perf_counter()
        if self.client is None:
            raise RuntimeError("Gemini provider is unavailable (missing GEMINI_API_KEY)")

        schema_text = (
            f"\nReturn JSON matching this schema:\n{schema}\n"
            if schema is not None
            else "\nReturn strict JSON.\n"
        )
        full_prompt = f"{prompt}\n{schema_text}"

        raw = await asyncio.to_thread(self._generate_pdf_text, pdf_path, full_prompt)
        data = extract_json_from_text(raw)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=float(data.get("confidence", 0.9) or 0.9),
            raw_text=raw,
        )

    async def chat(self, prompt: str) -> ExtractResult:
        """Text-only chat completion using Gemini (no PDF)."""
        started = time.perf_counter()
        if self.client is None or types is None:
            raise RuntimeError("Gemini provider is unavailable (missing GEMINI_API_KEY)")

        raw = await asyncio.to_thread(self._generate_text, prompt)
        data = extract_json_from_text(raw)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=0.9,
            raw_text=raw,
        )

    async def identify(self, pdf_path: Path) -> IdentifyResult:
        started = time.perf_counter()
        prompt = (
            "Identify this document and return JSON with keys: document_type, document_name, "
            "confidence, indicators. document_type must be one of: contract, estimate, loi, noi, "
            "swppp_plan, dust_permit, civil_plan, grading_plan, drainage_plan, unknown."
        )
        result = await self.extract(pdf_path, prompt)

        doc_type_raw = str(result.data.get("document_type", "unknown")).lower()
        valid_types = {
            "contract",
            "estimate",
            "loi",
            "noi",
            "swppp_plan",
            "dust_permit",
            "civil_plan",
            "grading_plan",
            "drainage_plan",
            "unknown",
        }
        if doc_type_raw not in valid_types or not is_document_type(doc_type_raw):
            doc_type: DocumentType = "unknown"
        else:
            doc_type = doc_type_raw

        doc_name = str(result.data.get("document_name", "Unknown Document"))
        suggested = f"{sanitize_filename(doc_type)}_{sanitize_filename(doc_name)}{pdf_path.suffix}"

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return IdentifyResult(
            provider=self.name,
            document_type=doc_type,
            document_name=doc_name,
            confidence=float(result.data.get("confidence", 0.85) or 0.85),
            indicators=[str(v) for v in result.data.get("indicators", [])][:10],
            processing_time_ms=elapsed_ms,
            model=self.model,
            suggested_filename=suggested,
        )

    async def analyze(self, pdf_path: Path, analysis_type: str) -> PlanAnalysisResult:
        started = time.perf_counter()
        prompt = (
            f"Analyze this engineering document for {analysis_type}. "
            "Return JSON with keys: measurements (number map), counts (number map), compliance "
            "(passed, failed, warnings arrays), findings (array of type/message/location), confidence."
        )
        result = await self.extract(pdf_path, prompt)

        findings: list[PlanFinding] = []
        for item in result.data.get("findings", []):
            if not isinstance(item, dict):
                continue
            kind_raw = str(item.get("type", "info")).lower()
            if not is_plan_finding_type(kind_raw):
                kind: PlanFindingType = "info"
            else:
                kind = kind_raw
            findings.append(
                PlanFinding(
                    type=kind,
                    message=str(item.get("message", "")),
                    location=(str(item.get("location")) if item.get("location") else None),
                )
            )

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return PlanAnalysisResult(
            provider=self.name,
            plan_type=analysis_type,
            measurements=self._to_float_map(result.data.get("measurements", {})),
            counts=self._to_int_map(result.data.get("counts", {})),
            compliance=self._normalize_compliance(result.data.get("compliance", {})),
            findings=findings,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=float(result.data.get("confidence", 0.9) or 0.9),
        )

    def _generate_text(self, prompt: str) -> str:
        """Text-only generation (no PDF attachment)."""
        if self.client is None or types is None:
            raise RuntimeError("Gemini SDK is not available")

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=8192,
            ),
        )

        return response.text or ""

    def _generate_pdf_text(self, pdf_path: Path, prompt: str) -> str:
        if self.client is None or types is None:
            raise RuntimeError("Gemini SDK is not available")

        pdf_bytes = pdf_path.read_bytes()
        part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        contents: list[str | Any] = [part, prompt]

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=8192,
            ),
        )

        return response.text or ""

    @staticmethod
    def _to_float_map(value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        output: dict[str, float] = {}
        for key, raw in value.items():
            try:
                output[str(key)] = float(raw)
            except (TypeError, ValueError):
                continue
        return output

    @staticmethod
    def _to_int_map(value: Any) -> dict[str, int]:
        if not isinstance(value, dict):
            return {}
        output: dict[str, int] = {}
        for key, raw in value.items():
            try:
                output[str(key)] = int(raw)
            except (TypeError, ValueError):
                continue
        return output

    @staticmethod
    def _normalize_compliance(value: Any) -> dict[str, list[str]]:
        if not isinstance(value, dict):
            return {"passed": [], "failed": [], "warnings": []}
        return {
            "passed": [str(v) for v in value.get("passed", []) if v is not None],
            "failed": [str(v) for v in value.get("failed", []) if v is not None],
            "warnings": [str(v) for v in value.get("warnings", []) if v is not None],
        }
