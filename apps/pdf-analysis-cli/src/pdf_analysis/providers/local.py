from __future__ import annotations

import base64
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import httpx
import pymupdf

from pdf_analysis.config import Settings
from pdf_analysis.types import (
    ExtractResult,
    IdentifyResult,
    OCRResult,
    PlanAnalysisResult,
    PlanFinding,
    ProviderName,
)
from pdf_analysis.utils import extract_json_from_text, sanitize_filename

from .base import BaseProvider


class LocalProvider(BaseProvider):
    name = ProviderName.LOCAL
    cost_per_1k_pages = 0.0

    def __init__(self, settings: Settings):
        self.settings = settings
        self.endpoint = settings.ollama_endpoint.rstrip("/")
        self.model = settings.ollama_model
        self.timeout = settings.http_timeout_seconds

    async def is_available(self) -> bool:
        root_endpoint = self.endpoint[:-3] if self.endpoint.endswith("/v1") else self.endpoint
        urls = [
            f"{self.endpoint}/models",
            f"{root_endpoint}/api/tags",
        ]

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for url in urls:
                try:
                    response = await client.get(url)
                except Exception:
                    continue
                if response.status_code != 200:
                    continue

                body = response.text.lower()
                if self.model.lower() in body:
                    return True

                # Endpoint is healthy, model may still be loaded at request time.
                if "models" in url:
                    return True

        return False

    async def ocr(self, pdf_path: Path, pages: list[int] | None = None) -> OCRResult:
        started = time.perf_counter()

        if not pdf_path.exists():
            raise FileNotFoundError(f"File not found: {pdf_path}")

        rendered_pages: list[tuple[int, Path]] = []
        with TemporaryDirectory(prefix="pdf-analysis-local-") as temp_dir:
            if pdf_path.suffix.lower() == ".pdf":
                rendered_pages = self._render_pdf_pages(pdf_path, Path(temp_dir), pages)
            else:
                rendered_pages = [(1, pdf_path)]

            chunks: list[str] = []
            page_numbers: list[int] = []

            for page_number, image_path in rendered_pages:
                image_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
                content = await self._chat_completion(
                    prompt=(
                        "Extract all visible text from this page. Preserve structure, "
                        "tables, and section headings in markdown."
                    ),
                    image_base64=image_b64,
                )
                page_numbers.append(page_number)
                chunks.append(f"<!-- Page {page_number} -->\n{content.strip()}")

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return OCRResult(
            provider=self.name,
            text="\n\n---\n\n".join(chunks),
            pages=page_numbers,
            processing_time_ms=elapsed_ms,
            model=self.model,
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        started = time.perf_counter()
        ocr_result = await self.ocr(pdf_path)

        schema_text = (
            f"\nJSON schema:\n{schema}\n"
            if schema is not None
            else ""
        )

        extraction_prompt = (
            f"{prompt}\n\n"
            "Use the document text below and return only valid JSON."
            f"{schema_text}\n"
            f"Document text:\n{ocr_result.text[:120000]}"
        )

        raw = await self._chat_completion(prompt=extraction_prompt)
        data = extract_json_from_text(raw)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.model,
            confidence=0.75,
            raw_text=raw,
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

        doc_type = str(result.data.get("document_type", "unknown")).lower()
        if doc_type not in {
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
        }:
            doc_type = "unknown"

        doc_name = str(result.data.get("document_name", "Unknown Document"))
        suggested = f"{sanitize_filename(doc_type)}_{sanitize_filename(doc_name)}{pdf_path.suffix}"

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return IdentifyResult(
            provider=self.name,
            document_type=doc_type,
            document_name=doc_name,
            confidence=float(result.data.get("confidence", 0.6) or 0.6),
            indicators=[str(v) for v in result.data.get("indicators", [])][:10],
            processing_time_ms=elapsed_ms,
            model=self.model,
            suggested_filename=suggested,
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

        findings_raw = result.data.get("findings", [])
        findings: list[PlanFinding] = []
        if isinstance(findings_raw, list):
            for finding in findings_raw:
                if not isinstance(finding, dict):
                    continue
                finding_type = str(finding.get("type", "info"))
                if finding_type not in {"info", "warning", "critical"}:
                    finding_type = "info"
                findings.append(
                    PlanFinding(
                        type=finding_type,
                        message=str(finding.get("message", "")),
                        location=(
                            str(finding.get("location"))
                            if finding.get("location") is not None
                            else None
                        ),
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
            confidence=float(result.data.get("confidence", 0.65) or 0.65),
        )

    def _render_pdf_pages(
        self,
        pdf_path: Path,
        temp_dir: Path,
        pages: list[int] | None,
    ) -> list[tuple[int, Path]]:
        doc = pymupdf.open(pdf_path)
        try:
            total_pages = len(doc)
            selected_pages = pages or list(range(1, total_pages + 1))

            rendered: list[tuple[int, Path]] = []
            for page_num in selected_pages:
                if page_num < 1 or page_num > total_pages:
                    raise ValueError(
                        f"Requested page {page_num} outside document bounds 1-{total_pages}"
                    )
                page = doc.load_page(page_num - 1)
                pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                path = temp_dir / f"page_{page_num:04d}.png"
                pix.save(str(path))
                rendered.append((page_num, path))
            return rendered
        finally:
            doc.close()

    async def _chat_completion(self, prompt: str, image_base64: str | None = None) -> str:
        if image_base64 is None:
            message_content: str | list[dict[str, Any]] = prompt
        else:
            message_content = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_base64}"},
                },
            ]

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "user", "content": message_content}],
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.endpoint}/chat/completions",
                json=payload,
            )
            response.raise_for_status()
            result = response.json()

        choices = result.get("choices", [])
        if not choices:
            return ""

        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [part.get("text", "") for part in content if isinstance(part, dict)]
            return "\n".join(parts)
        return str(content)

    @staticmethod
    def _to_float_map(value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, float] = {}
        for key, raw in value.items():
            try:
                out[str(key)] = float(raw)
            except (TypeError, ValueError):
                continue
        return out

    @staticmethod
    def _to_int_map(value: Any) -> dict[str, int]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, int] = {}
        for key, raw in value.items():
            try:
                out[str(key)] = int(raw)
            except (TypeError, ValueError):
                continue
        return out

    @staticmethod
    def _normalize_compliance(value: Any) -> dict[str, list[str]]:
        if not isinstance(value, dict):
            return {"passed": [], "failed": [], "warnings": []}
        return {
            "passed": [str(v) for v in value.get("passed", []) if v is not None],
            "failed": [str(v) for v in value.get("failed", []) if v is not None],
            "warnings": [str(v) for v in value.get("warnings", []) if v is not None],
        }
