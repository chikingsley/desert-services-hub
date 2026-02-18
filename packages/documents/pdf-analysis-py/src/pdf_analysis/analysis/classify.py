"""LLM-first document classification helpers.

This replaces the old regex classifier so all classification behavior is
model-driven and aligned with the ingest pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pdf_analysis.config import Settings
from pdf_analysis.ingest import ingest_pdf
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderSelector


@dataclass(slots=True)
class ClassifyResult:
    document_type: str
    confidence: float
    indicators: list[str]
    page_count: int
    filename: str
    first_page_snippet: str = ""


_CLASSIFY_TEXT_PROMPT = """Classify this construction document.
Return JSON with keys: document_type (string), confidence (0.0-1.0), indicators (array of short strings).
Use snake_case for document_type.

Text:
"""


def _normalize_document_type(raw: str) -> str:
    value = raw.strip().lower().replace("-", "_").replace(" ", "_")
    alias_map = {
        "subcontract": "contract",
        "subcontract_agreement": "contract",
        "purchase_order": "po",
        "work_authorization": "work_order",
        "notice_of_intent": "noi",
        "noi_certificate": "noi",
        "insurance_cert": "insurance",
        "certificate_of_insurance": "insurance",
        "w9": "tax_form",
        "preliminary_notice": "prelien",
    }
    return alias_map.get(value, value or "unknown")


def _coerce_confidence(value: object) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    return 0.5


async def classify_pdf(
    pdf_path: Path,
    provider: ProviderSelector = ProviderSelector.AUTO,
    settings: Settings | None = None,
) -> ClassifyResult:
    result = await ingest_pdf(pdf_path, provider=provider, settings=settings)
    return ClassifyResult(
        document_type=_normalize_document_type(result.document_type),
        confidence=_coerce_confidence(result.extracted.get("confidence")),
        indicators=[f"model:{result.model}", f"method:{result.text_method}"],
        page_count=result.page_count,
        filename=result.filename,
        first_page_snippet=result.raw_text[:200].replace("\n", " ").strip(),
    )


async def classify_text(
    text: str,
    filename: str = "",
    provider: ProviderSelector = ProviderSelector.AUTO,
    settings: Settings | None = None,
) -> ClassifyResult:
    if not text.strip():
        return ClassifyResult(
            document_type="unknown",
            confidence=0.0,
            indicators=["empty text"],
            page_count=0,
            filename=filename,
        )

    manager = ProviderManager(settings or Settings())
    extract = await manager.chat(_CLASSIFY_TEXT_PROMPT + text[:30000], provider=provider)
    data = extract.data

    doc_type = _normalize_document_type(str(data.get("document_type", "unknown")))
    indicators = data.get("indicators")
    if not isinstance(indicators, list):
        indicators = [f"model:{extract.model}"]
    else:
        indicators = [str(item) for item in indicators[:5]]

    return ClassifyResult(
        document_type=doc_type,
        confidence=_coerce_confidence(data.get("confidence")),
        indicators=indicators,
        page_count=0,
        filename=filename,
        first_page_snippet=text[:200].replace("\n", " ").strip(),
    )


async def classify_dir(
    dir_path: Path,
    provider: ProviderSelector = ProviderSelector.AUTO,
    settings: Settings | None = None,
) -> list[ClassifyResult]:
    results: list[ClassifyResult] = []
    for pdf_file in sorted(dir_path.glob("*.pdf")):
        results.append(await classify_pdf(pdf_file, provider=provider, settings=settings))
    return results
