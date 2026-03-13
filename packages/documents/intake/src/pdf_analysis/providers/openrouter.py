from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx

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

from .local import LocalProvider


class OpenRouterProvider:
    name = ProviderName.OPENROUTER
    cost_per_1k_pages = 0.0

    def __init__(self, settings: Settings):
        self.settings = settings
        self.api_key = (settings.openrouter_api_key or "").strip()
        self.base_url = settings.openrouter_base_url.rstrip("/")
        self.model = settings.openrouter_model.strip()
        self.timeout = settings.openrouter_timeout_seconds
        self.ocr_delegate = LocalProvider(settings)

    async def is_available(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)

    async def ocr(
        self,
        pdf_path: Path,
        pages: list[int] | None = None,
        output_path: Path | None = None,
    ) -> OCRResult:
        return await self.ocr_delegate.ocr(pdf_path, pages=pages, output_path=output_path)

    async def chat(self, prompt: str) -> ExtractResult:
        started = time.perf_counter()
        raw, metadata = await self._chat_completion(prompt)
        data = extract_json_from_text(raw)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=0.85,
            raw_text=raw,
            metadata=metadata,
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        started = time.perf_counter()
        ocr_result = await self.ocr_delegate.ocr(pdf_path)

        schema_text = f"\nJSON schema:\n{schema}\n" if schema is not None else ""
        extraction_prompt = (
            f"{prompt}\n\n"
            "Use the document text below and return only valid JSON."
            f"{schema_text}\n"
            f"Document text:\n{ocr_result.text[:120000]}"
        )

        raw, metadata = await self._chat_completion(extraction_prompt)
        data = extract_json_from_text(raw)
        elapsed_ms = int((time.perf_counter() - started) * 1000)

        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=0.85,
            raw_text=raw,
            metadata={
                **metadata,
                "ocr_provider": ocr_result.provider.value,
                "ocr_model": ocr_result.model,
            },
        )

    async def identify(self, pdf_path: Path) -> IdentifyResult:
        started = time.perf_counter()
        prompt = (
            "Identify this document type and return JSON with keys: "
            "document_type, document_name, confidence, indicators. "
            "document_type must be one of: contract, estimate, loi, noi, swppp_plan, "
            "dust_permit, civil_plan, grading_plan, drainage_plan, unknown."
        )
        result = await self.extract(pdf_path, prompt)

        doc_type_raw = str(result.data.get("document_type", "unknown")).lower()
        if doc_type_raw not in {
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
        } or not is_document_type(doc_type_raw):
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
            confidence=float(result.data.get("confidence", 0.7) or 0.7),
            indicators=[str(v) for v in result.data.get("indicators", [])][:10],
            processing_time_ms=elapsed_ms,
            model=self.model,
            suggested_filename=suggested,
            metadata=result.metadata,
        )

    async def analyze(self, pdf_path: Path, analysis_type: str) -> PlanAnalysisResult:
        started = time.perf_counter()
        prompt = (
            f"Analyze this engineering plan for {analysis_type}. "
            "Return JSON with keys: measurements (number map), counts (number map), "
            "compliance (object with passed/failed/warnings arrays), findings "
            "(array of objects with type=info|warning|critical, message, location optional), "
            "confidence."
        )
        result = await self.extract(pdf_path, prompt)

        findings: list[PlanFinding] = []
        findings_raw = result.data.get("findings", [])
        if isinstance(findings_raw, list):
            for item in findings_raw:
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
            confidence=float(result.data.get("confidence", 0.7) or 0.7),
            metadata=result.metadata,
        )

    async def _chat_completion(self, prompt: str) -> tuple[str, dict[str, Any]]:
        if not self.api_key:
            raise RuntimeError("OpenRouter provider is unavailable (missing OPENROUTER_API_KEY)")

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://desertservices.app",
            "X-Title": "Desert Services Hub",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self.base_url, headers=headers, json=payload)

        if response.status_code >= 400:
            raise RuntimeError(
                f"OpenRouter request failed: {response.status_code} {response.text}"
            )

        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content")

        if isinstance(content, list):
            chunks: list[str] = []
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    chunks.append(part["text"])
            content_text = "\n".join(chunks).strip()
        else:
            content_text = str(content or "").strip()

        if not content_text:
            raise RuntimeError("OpenRouter returned no chat content")

        metadata = self._extract_response_metadata(data)
        return content_text, metadata

    @staticmethod
    def _extract_response_metadata(data: dict[str, Any]) -> dict[str, Any]:
        metadata: dict[str, Any] = {}
        usage = data.get("usage")
        if isinstance(usage, dict):
            metadata["usage"] = usage
        return metadata

    @staticmethod
    def _normalize_compliance(value: Any) -> dict[str, list[str]]:
        if not isinstance(value, dict):
            return {"failed": [], "passed": [], "warnings": []}
        output: dict[str, list[str]] = {"failed": [], "passed": [], "warnings": []}
        for key in output:
            raw = value.get(key, [])
            if isinstance(raw, list):
                output[key] = [str(item) for item in raw]
        return output

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
