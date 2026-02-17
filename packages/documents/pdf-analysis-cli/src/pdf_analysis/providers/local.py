from __future__ import annotations

import asyncio
import base64
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import httpx
from kreuzberg import render_page_to_image

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


class LocalProvider(BaseProvider):
    name = ProviderName.LOCAL
    cost_per_1k_pages = 0.0
    _MAX_RETRIES = 5
    _RETRY_BACKOFF = [5, 15, 30, 60, 90]

    def __init__(self, settings: Settings):
        self.settings = settings
        self.endpoint = settings.ollama_endpoint.rstrip("/")
        manager = (settings.ollama_manager_endpoint or "").strip()
        self.manager_endpoint = manager.rstrip("/") if manager else None
        self.model = settings.ollama_model
        self.chat_model = settings.ollama_chat_model
        self.timeout = settings.http_timeout_seconds
        self._resolved_completion_endpoint: str | None = None

    async def is_available(self) -> bool:
        if self.manager_endpoint:
            return await self._manager_reports_available()

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
                model = self.model.lower().strip()
                if model and model in body:
                    return True

                # Endpoint is healthy, model may still be loaded at request time.
                if "models" in url:
                    return True

        return False

    async def ocr(
        self,
        pdf_path: Path,
        pages: list[int] | None = None,
        output_path: Path | None = None,
    ) -> OCRResult:
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
            failed_pages: list[int] = []
            total = len(rendered_pages)

            # Incremental write: truncate output file if provided
            if output_path:
                output_path.write_text("", encoding="utf-8")

            for page_number, image_path in rendered_pages:
                image_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
                try:
                    content = await self._ocr_page_with_retry(
                        image_b64, page_number, total,
                    )
                except Exception as e:
                    print(
                        f"[ocr] page {page_number} FAILED after {self._MAX_RETRIES} "
                        f"retries ({type(e).__name__}), skipping",
                        file=sys.stderr,
                    )
                    failed_pages.append(page_number)
                    content = f"[OCR FAILED: {type(e).__name__}]"

                page_numbers.append(page_number)
                chunk = f"<!-- Page {page_number} -->\n{content.strip()}"
                chunks.append(chunk)

                # Write incrementally so completed pages are never lost
                if output_path:
                    with open(output_path, "a", encoding="utf-8") as f:
                        if len(chunks) > 1:
                            f.write("\n\n---\n\n")
                        f.write(chunk)

            if failed_pages:
                print(
                    f"[ocr] completed with {len(failed_pages)} failed pages: {failed_pages}",
                    file=sys.stderr,
                )

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return OCRResult(
            provider=self.name,
            text="\n\n---\n\n".join(chunks),
            pages=page_numbers,
            processing_time_ms=elapsed_ms,
            model=self.model,
        )

    async def chat(self, prompt: str) -> ExtractResult:
        """Text-only chat completion using the chat model (no OCR/vision)."""
        started = time.perf_counter()
        raw = await self._chat_completion(prompt=prompt, model_override=self.chat_model)
        data = extract_json_from_text(raw)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.chat_model,
            confidence=0.75,
            raw_text=raw,
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        started = time.perf_counter()
        ocr_result = await self.ocr(pdf_path)

        schema_text = f"\nJSON schema:\n{schema}\n" if schema is not None else ""

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
                finding_type_raw = str(finding.get("type", "info")).lower()
                if not is_plan_finding_type(finding_type_raw):
                    finding_type: PlanFindingType = "info"
                else:
                    finding_type = finding_type_raw
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

    async def _ocr_page_with_retry(
        self, image_b64: str, page_num: int, total: int,
    ) -> str:
        """OCR a single page with retry on transient errors."""
        last_err: Exception | None = None
        for attempt in range(1, self._MAX_RETRIES + 1):
            try:
                print(
                    f"[ocr] page {page_num}/{total}"
                    + (f" (retry {attempt})" if attempt > 1 else ""),
                    file=sys.stderr,
                )
                return await self._chat_completion(
                    prompt=(
                        "Extract all visible text from this page. Preserve structure, "
                        "tables, and section headings in markdown."
                    ),
                    image_base64=image_b64,
                )
            except (
                httpx.ReadTimeout,
                httpx.ConnectError,
                httpx.RemoteProtocolError,
                httpx.ReadError,
                httpx.HTTPStatusError,
            ) as e:
                last_err = e
                if attempt < self._MAX_RETRIES:
                    wait = self._RETRY_BACKOFF[attempt - 1]
                    print(
                        f"[ocr] page {page_num} failed ({type(e).__name__}), "
                        f"retrying in {wait}s...",
                        file=sys.stderr,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise
        raise last_err  # type: ignore[misc]

    def _render_pdf_pages(
        self,
        pdf_path: Path,
        temp_dir: Path,
        pages: list[int] | None,
    ) -> list[tuple[int, Path]]:
        from kreuzberg import extract_file_sync

        pdf_bytes = pdf_path.read_bytes()
        result = extract_file_sync(str(pdf_path))
        total_pages = result.metadata.get("page_count", 0)
        selected_pages = pages or list(range(1, total_pages + 1))

        rendered: list[tuple[int, Path]] = []
        for page_num in selected_pages:
            if page_num < 1 or page_num > total_pages:
                raise ValueError(
                    f"Requested page {page_num} outside document bounds 1-{total_pages}"
                )
            # dpi=144 matches the old pymupdf Matrix(2, 2) (2x zoom from 72 DPI base)
            png_data = render_page_to_image(pdf_bytes, page_num - 1, dpi=144)
            path = temp_dir / f"page_{page_num:04d}.png"
            path.write_bytes(png_data)
            rendered.append((page_num, path))
        return rendered

    async def _chat_completion(
        self, prompt: str, image_base64: str | None = None, model_override: str | None = None
    ) -> str:
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
            "model": model_override or self.model,
            "messages": [{"role": "user", "content": message_content}],
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            endpoints = await self._candidate_completion_endpoints(client)
            response: httpx.Response | None = None
            errors: list[str] = []

            for endpoint in endpoints:
                try:
                    attempt = await client.post(endpoint, json=payload)
                    if attempt.status_code in {404, 405}:
                        errors.append(f"{endpoint} -> HTTP {attempt.status_code}")
                        continue
                    attempt.raise_for_status()
                    response = attempt
                    break
                except Exception as err:
                    errors.append(f"{endpoint} -> {type(err).__name__}: {err}")

            if response is None:
                joined = " | ".join(errors[:4])
                raise RuntimeError(
                    "No working local OCR completion endpoint. "
                    f"Tried: {', '.join(endpoints)}. Errors: {joined}"
                )

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

    async def _candidate_completion_endpoints(self, client: httpx.AsyncClient) -> list[str]:
        endpoints: list[str] = []

        if self._resolved_completion_endpoint:
            endpoints.append(self._resolved_completion_endpoint)

        endpoints.extend(self._endpoint_variants(self.endpoint))

        if self.manager_endpoint:
            manager_endpoint = await self._resolve_from_manager(client)
            if manager_endpoint:
                endpoints.extend(self._endpoint_variants(manager_endpoint))

        deduped: list[str] = []
        seen: set[str] = set()
        for endpoint in endpoints:
            if endpoint in seen:
                continue
            seen.add(endpoint)
            deduped.append(endpoint)
        return deduped

    async def _resolve_from_manager(self, client: httpx.AsyncClient) -> str | None:
        assert self.manager_endpoint is not None

        # Best-effort activation. If this fails, status may still expose a usable endpoint.
        for body in [{"model": self.model}, {}]:
            try:
                await client.post(f"{self.manager_endpoint}/activate/ocr", json=body)
                break
            except Exception:
                continue

        try:
            response = await client.get(f"{self.manager_endpoint}/status")
            if response.status_code != 200:
                return None
            data = response.json()
        except Exception:
            return None

        services = data.get("services", [])
        if not isinstance(services, list):
            return None

        for service in services:
            if not isinstance(service, dict):
                continue
            endpoint = service.get("endpoint")
            if not endpoint or not isinstance(endpoint, str):
                continue
            candidate = endpoint.rstrip("/")
            if not candidate:
                continue
            self._resolved_completion_endpoint = candidate
            return candidate
        return None

    async def _manager_reports_available(self) -> bool:
        if not self.manager_endpoint:
            return False

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # Must have healthy control plane first.
            try:
                health = await client.get(f"{self.manager_endpoint}/health")
            except Exception:
                return False
            if health.status_code != 200:
                return False

            # If status fails, manager is not operational for inference.
            try:
                status = await client.get(f"{self.manager_endpoint}/status")
            except Exception:
                return False
            if status.status_code != 200:
                return False

            endpoint = await self._resolve_from_manager(client)
            return bool(endpoint)

    @staticmethod
    def _endpoint_variants(endpoint: str) -> list[str]:
        base = endpoint.rstrip("/")
        if base.endswith("/chat/completions"):
            return [base]
        if base.endswith("/v1"):
            return [f"{base}/chat/completions"]
        return [f"{base}/chat/completions", f"{base}/v1/chat/completions"]

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
