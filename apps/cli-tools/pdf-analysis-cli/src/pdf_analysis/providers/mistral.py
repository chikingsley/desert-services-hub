from __future__ import annotations

import tempfile
import time
from pathlib import Path

import pymupdf

from pdf_analysis.config import Settings
from pdf_analysis.mistral_client import MistralClient, get_api_key
from pdf_analysis.split_ocr import split_and_ocr
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

IDENTIFY_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "gc_company": {"type": "string"},
        "project_name": {"type": "string"},
        "document_type": {
            "type": "string",
            "enum": [
                "contract",
                "estimate",
                "LOI",
                "change_order",
                "permit",
                "insurance_cert",
                "invoice",
                "correspondence",
                "other",
            ],
        },
        "action_required": {"type": ["string", "null"]},
        "deadline": {"type": ["string", "null"]},
        "document_number": {"type": ["string", "null"]},
    },
    "required": ["gc_company", "project_name", "document_type"],
}

IDENTIFY_PROMPT = """Identify this construction document.

Extract:
- gc_company: The legal company name (from letterhead/signature block, not logos)
- project_name: The project name (use common/short name, not full legal)
- document_type: contract, estimate, LOI, change_order, permit,
  insurance_cert, invoice, correspondence, or other.
- action_required: If recipient must act, describe briefly. Else null.
- deadline: Deadline in YYYY-MM-DD format, or null if none.
- document_number: Any ID/number on the doc.

Be concise."""


class MistralProvider(BaseProvider):
    name = ProviderName.MISTRAL
    cost_per_1k_pages = 0.0

    def __init__(self, settings: Settings):
        self.settings = settings
        self.ocr_model = settings.mistral_ocr_model
        self.chat_model = settings.mistral_chat_model

    async def is_available(self) -> bool:
        try:
            _ = get_api_key()
            return True
        except Exception:
            return False

    async def ocr(self, pdf_path: Path, pages: list[int] | None = None) -> OCRResult:
        started = time.perf_counter()
        if not pdf_path.exists():
            raise FileNotFoundError(f"File not found: {pdf_path}")

        source_path = pdf_path
        temp_pdf: Path | None = None
        if pages:
            temp_pdf = self._build_subset_pdf(pdf_path, pages)
            source_path = temp_pdf

        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as out_file:
            output_path = Path(out_file.name)

        try:
            result = await split_and_ocr(
                source_path,
                output_path,
                max_concurrent=5,
            )
            text = output_path.read_text(encoding="utf-8")
        finally:
            output_path.unlink(missing_ok=True)
            if temp_pdf is not None:
                temp_pdf.unlink(missing_ok=True)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return OCRResult(
            provider=self.name,
            text=text,
            pages=pages or list(range(1, result.total_pages + 1)),
            processing_time_ms=elapsed_ms,
            model=self.ocr_model,
            confidence=0.88,
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        started = time.perf_counter()
        client = MistralClient(api_key=self.settings.mistral_api_key)

        if schema:
            raw = await client.extract_structured(
                prompt,
                schema,
                schema_name="pdf_analysis_extraction",
                document_path=str(pdf_path),
                model=self.chat_model,
            )
        else:
            raw = await client.extract_json(
                prompt,
                document_path=str(pdf_path),
                model=self.chat_model,
            )

        data = extract_json_from_text(raw)
        elapsed_ms = int((time.perf_counter() - started) * 1000)

        return ExtractResult(
            provider=self.name,
            data=data,
            processing_time_ms=elapsed_ms,
            model=self.chat_model,
            confidence=float(data.get("confidence", 0.85) or 0.85),
            raw_text=raw,
        )

    async def identify(self, pdf_path: Path) -> IdentifyResult:
        started = time.perf_counter()
        client = MistralClient(api_key=self.settings.mistral_api_key)

        raw = await client.extract_structured(
            IDENTIFY_PROMPT,
            IDENTIFY_SCHEMA,
            schema_name="document_identification",
            document_path=str(pdf_path),
            model=self.chat_model,
        )
        parsed = extract_json_from_text(raw)

        doc_type_raw = str(parsed.get("document_type", "other"))
        doc_type_normalized = doc_type_raw.lower()
        mapping = {
            "contract": "contract",
            "estimate": "estimate",
            "loi": "loi",
            "permit": "dust_permit",
            "other": "unknown",
            "change_order": "unknown",
            "insurance_cert": "unknown",
            "invoice": "unknown",
            "correspondence": "unknown",
        }
        doc_type = mapping.get(doc_type_normalized, "unknown")

        project_name = str(parsed.get("project_name", "Unknown Document"))
        gc_company = str(parsed.get("gc_company", ""))
        document_number = parsed.get("document_number")

        suggested_name = (
            f"{sanitize_filename(doc_type)}_{sanitize_filename(project_name)}_"
            f"{sanitize_filename(gc_company)}"
        )
        if document_number:
            suggested_name += f"_{sanitize_filename(str(document_number))}"
        suggested_name += pdf_path.suffix

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        indicators = [doc_type_raw]
        if gc_company:
            indicators.append(gc_company)

        return IdentifyResult(
            provider=self.name,
            document_type=doc_type,
            document_name=project_name,
            confidence=0.85,
            indicators=indicators,
            processing_time_ms=elapsed_ms,
            model=self.chat_model,
            suggested_filename=suggested_name,
            metadata={"raw": parsed},
        )

    async def analyze(self, pdf_path: Path, analysis_type: str) -> PlanAnalysisResult:
        started = time.perf_counter()
        prompt = (
            f"Analyze this engineering plan for {analysis_type}. Return JSON with keys: "
            "measurements, counts, compliance, findings, confidence."
        )
        result = await self.extract(pdf_path, prompt)

        findings: list[PlanFinding] = []
        raw_findings = result.data.get("findings", [])
        if isinstance(raw_findings, list):
            for finding in raw_findings:
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
            model=self.chat_model,
            confidence=float(result.data.get("confidence", 0.82) or 0.82),
            metadata={"raw": result.data},
        )

    def _build_subset_pdf(self, pdf_path: Path, pages: list[int]) -> Path:
        source_doc = pymupdf.open(pdf_path)
        subset_doc = pymupdf.open()
        try:
            total_pages = len(source_doc)
            for page_num in sorted(set(pages)):
                if page_num < 1 or page_num > total_pages:
                    raise ValueError(
                        f"Requested page {page_num} outside document bounds 1-{total_pages}"
                    )
                subset_doc.insert_pdf(source_doc, from_page=page_num - 1, to_page=page_num - 1)

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                subset_path = Path(tmp.name)
            subset_doc.save(str(subset_path), garbage=3, deflate=True)
            return subset_path
        finally:
            subset_doc.close()
            source_doc.close()

    @staticmethod
    def _to_float_map(value: object) -> dict[str, float]:
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
    def _to_int_map(value: object) -> dict[str, int]:
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
    def _normalize_compliance(value: object) -> dict[str, list[str]]:
        if not isinstance(value, dict):
            return {"passed": [], "failed": [], "warnings": []}

        def normalize_list(key: str) -> list[str]:
            raw = value.get(key, [])
            if not isinstance(raw, list):
                return []
            return [str(item) for item in raw]

        return {
            "passed": normalize_list("passed"),
            "failed": normalize_list("failed"),
            "warnings": normalize_list("warnings"),
        }
