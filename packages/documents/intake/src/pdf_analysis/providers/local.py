from __future__ import annotations

import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any

import httpx
from kreuzberg import ExtractionConfig, OcrConfig, PageConfig, extract_file_sync

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


class LocalProvider:
    name = ProviderName.LOCAL
    cost_per_1k_pages = 0.0
    _KREUZBERG_OCR_MODEL = "kreuzberg:paddleocr"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.endpoint = settings.local_llm_endpoint.rstrip("/")
        manager = (settings.local_llm_manager_endpoint or "").strip()
        self.manager_endpoint = manager.rstrip("/") if manager else None
        self.model = settings.local_llm_model
        self.chat_model = settings.local_llm_chat_model
        self.health_timeout = min(settings.http_timeout_seconds, 10.0)
        self.chat_timeout = settings.local_llm_chat_timeout_seconds
        self._resolved_completion_endpoint: str | None = None

    async def is_available(self) -> bool:
        if self.manager_endpoint:
            return await self._manager_reports_available()

        root_endpoint = self.endpoint[:-3] if self.endpoint.endswith("/v1") else self.endpoint
        urls = [
            f"{self.endpoint}/models",
            f"{root_endpoint}/api/tags",
        ]

        async with httpx.AsyncClient(timeout=self.health_timeout) as client:
            for url in urls:
                try:
                    response = await client.get(url)
                except Exception:
                    continue
                if response.status_code != 200:
                    continue

                body = response.text.lower()
                model = self.chat_model.lower().strip()
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

        extraction_result = await asyncio.to_thread(self._run_kreuzberg_paddle_ocr, pdf_path)
        page_text = self._collect_page_text(extraction_result)
        available_pages = sorted(page_text.keys())
        if not available_pages:
            raw_text = str(getattr(extraction_result, "content", "") or "").strip()
            if raw_text:
                page_text = {1: raw_text}
                available_pages = [1]

        if not available_pages:
            raise RuntimeError("Kreuzberg OCR produced no page content")

        if pages:
            requested_pages = pages
            missing_pages = [p for p in requested_pages if p not in page_text]
            if missing_pages:
                max_page = max(available_pages)
                raise ValueError(
                    f"Requested page(s) {missing_pages} outside extracted bounds 1-{max_page}"
                )
            selected_pages = requested_pages
        else:
            selected_pages = available_pages

        chunks = [f"<!-- Page {page_num} -->\n{page_text[page_num]}" for page_num in selected_pages]
        rendered_text = "\n\n---\n\n".join(chunks)
        if output_path:
            output_path.write_text(rendered_text, encoding="utf-8")

        elements = self._collect_ocr_elements(getattr(extraction_result, "ocr_elements", None))
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        metadata: dict[str, Any] = {
            "elements": elements,
            "elements_count": len(elements),
            "elements_provider": "kreuzberg_paddleocr",
            "ocr_backend": self.settings.kreuzberg_ocr_backend,
            "ocr_language": self.settings.kreuzberg_ocr_language,
            "page_count": len(available_pages),
        }

        return OCRResult(
            provider=self.name,
            text=rendered_text,
            pages=selected_pages,
            processing_time_ms=elapsed_ms,
            model=self._KREUZBERG_OCR_MODEL,
            metadata=metadata,
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

        raw = await self._chat_completion(prompt=extraction_prompt, model_override=self.chat_model)
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
            model=self.chat_model,
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
            model=self.chat_model,
            confidence=float(result.data.get("confidence", 0.65) or 0.65),
        )

    def _run_kreuzberg_paddle_ocr(self, file_path: Path) -> Any:
        self._prepare_onnxruntime_runtime()
        config = self._build_kreuzberg_ocr_config()
        try:
            return extract_file_sync(str(file_path), config=config)
        except BaseException as exc:
            raise RuntimeError(
                "Kreuzberg OCR failed. "
                "Verify onnxruntime dependencies and PaddleOCR configuration."
            ) from exc

    @staticmethod
    def _prepare_onnxruntime_runtime() -> None:
        try:
            import onnxruntime  # type: ignore[import-not-found]
        except Exception:
            return

        capi_dir = Path(onnxruntime.__file__).resolve().parent / "capi"
        if not capi_dir.exists():
            return

        shared_candidates = sorted(capi_dir.glob("libonnxruntime.so*"))
        if not shared_candidates:
            return

        symlink_path = capi_dir / "libonnxruntime.so"
        target_path = next(
            (path for path in shared_candidates if path.name != "libonnxruntime.so"),
            shared_candidates[0],
        )

        if not symlink_path.exists():
            try:
                symlink_path.symlink_to(target_path.name)
            except Exception:
                try:
                    shutil.copy2(target_path, symlink_path)
                except Exception:
                    pass

        ld_parts = [part for part in os.environ.get("LD_LIBRARY_PATH", "").split(":") if part]
        if str(capi_dir) not in ld_parts:
            ld_parts.insert(0, str(capi_dir))
            os.environ["LD_LIBRARY_PATH"] = ":".join(ld_parts)

        os.environ.setdefault(
            "ORT_DYLIB_PATH",
            str(symlink_path if symlink_path.exists() else target_path),
        )

    def _build_kreuzberg_ocr_config(self) -> ExtractionConfig:
        paddle_ocr_config: dict[str, Any] = {
            "language_code": self.settings.kreuzberg_ocr_language,
            "use_doc_orientation_classify": self.settings.kreuzberg_paddle_use_doc_orientation_classify,
            "use_textline_orientation": self.settings.kreuzberg_paddle_use_textline_orientation,
            "use_doc_unwarping": self.settings.kreuzberg_paddle_use_doc_unwarping,
            "det_limit_side_len": self.settings.kreuzberg_paddle_det_limit_side_len,
            "det_limit_type": self.settings.kreuzberg_paddle_det_limit_type,
            "rec_batch_num": self.settings.kreuzberg_paddle_rec_batch_num,
        }
        return ExtractionConfig(
            force_ocr=True,
            ocr=OcrConfig(
                backend=self.settings.kreuzberg_ocr_backend,
                language=self.settings.kreuzberg_ocr_language,
                paddle_ocr_config=paddle_ocr_config,
            ),
            pages=PageConfig(extract_pages=True, insert_page_markers=False),
            output_format="plain",
        )

    @staticmethod
    def _collect_page_text(extraction_result: Any) -> dict[int, str]:
        page_text: dict[int, str] = {}
        raw_pages = getattr(extraction_result, "pages", None)
        if not isinstance(raw_pages, list):
            return page_text

        for page in raw_pages:
            if not isinstance(page, dict):
                continue
            raw_page_number = page.get("page_number")
            try:
                page_number = int(raw_page_number)
            except (TypeError, ValueError):
                continue
            if page_number < 1:
                continue
            content = str(page.get("content", "") or "").strip()
            page_text[page_number] = content

        return page_text

    @classmethod
    def _collect_ocr_elements(cls, raw_elements: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_elements, list):
            return []

        elements: list[dict[str, Any]] = []
        for entry in raw_elements:
            if not isinstance(entry, dict):
                continue

            text = str(entry.get("text", "") or "").strip()
            if not text:
                continue

            raw_page = entry.get("page", entry.get("page_number"))
            try:
                page = int(raw_page)
            except (TypeError, ValueError):
                continue
            if page < 1:
                continue

            x0 = entry.get("x0")
            y0 = entry.get("y0")
            x1 = entry.get("x1")
            y1 = entry.get("y1")

            if None in (x0, y0, x1, y1):
                bbox = entry.get("bbox")
                points = entry.get("points")
                if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                    x0, y0, x1, y1 = bbox[:4]
                elif isinstance(points, list):
                    parsed = cls._points_to_bbox(points)
                    if parsed is None:
                        continue
                    x0, y0, x1, y1 = parsed
                else:
                    continue

            try:
                elements.append(
                    {
                        "page": page,
                        "text": text,
                        "x0": float(x0),
                        "y0": float(y0),
                        "x1": float(x1),
                        "y1": float(y1),
                    }
                )
            except (TypeError, ValueError):
                continue

        return elements

    @staticmethod
    def _points_to_bbox(points: list[Any]) -> tuple[float, float, float, float] | None:
        xs: list[float] = []
        ys: list[float] = []

        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            try:
                xs.append(float(point[0]))
                ys.append(float(point[1]))
            except (TypeError, ValueError):
                continue

        if not xs or not ys:
            return None

        return (min(xs), min(ys), max(xs), max(ys))

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

        model = model_override or self.chat_model
        timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            # Try Ollama native /api/chat first — avoids known 40-50x slowdown
            # on /v1/chat/completions over the network (ollama/ollama#13899).
            root = self.endpoint[:-3] if self.endpoint.endswith("/v1") else self.endpoint
            native_url = f"{root}/api/chat"
            try:
                native_payload: dict[str, Any] = {
                    "model": model,
                    "messages": [{"role": "user", "content": message_content}],
                    "stream": False,
                }
                attempt = await client.post(native_url, json=native_payload)
                if attempt.status_code not in {404, 405}:
                    attempt.raise_for_status()
                    result = attempt.json()
                    content = result.get("message", {}).get("content", "")
                    return content if isinstance(content, str) else str(content)
            except Exception:
                pass  # Fall through to OpenAI-compatible endpoint

            # Fallback: OpenAI-compatible /v1/chat/completions (llama.cpp, etc.)
            payload: dict[str, Any] = {
                "model": model,
                "messages": [{"role": "user", "content": message_content}],
            }
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
                    "No working local completion endpoint. "
                    f"Tried: {native_url}, {', '.join(endpoints)}. Errors: {joined}"
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
        for body in [{"model": self.chat_model}, {"model": self.model}, {}]:
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

        async with httpx.AsyncClient(timeout=self.health_timeout) as client:
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


class LocalPublicProvider(LocalProvider):
    name = ProviderName.LOCAL_PUBLIC

    def __init__(self, settings: Settings):
        super().__init__(settings)
        self.endpoint = settings.local_llm_public_endpoint.rstrip("/")
        manager = (settings.local_llm_public_manager_endpoint or "").strip()
        self.manager_endpoint = manager.rstrip("/") if manager else None
        self.model = settings.local_llm_public_model
        self.chat_model = settings.local_llm_public_chat_model
        self.chat_timeout = settings.local_llm_public_chat_timeout_seconds
        self._resolved_completion_endpoint = None
