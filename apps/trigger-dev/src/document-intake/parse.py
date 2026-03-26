"""Document parsing: kreuzberg text extraction with PaddleOCR fallback.

Extracts text from documents using kreuzberg's native text layer extraction.
Falls back to PaddleOCR for scanned/image-only documents.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from kreuzberg import ExtractionConfig, OcrConfig, PageConfig, extract_file_sync

OCR_BACKEND = os.environ.get("KREUZBERG_OCR_BACKEND", "paddleocr")
OCR_LANGUAGE = os.environ.get("KREUZBERG_OCR_LANGUAGE", "en")


def _extract_text(file_path: Path) -> tuple[str, int, bool]:
    """Native text-layer extraction. Returns (text, page_count, has_text)."""
    config = ExtractionConfig(
        pages=PageConfig(insert_page_markers=True),
        force_ocr=False,
    )
    try:
        result = extract_file_sync(str(file_path), config=config)
        page_count = result.metadata.get("page_count", 0)
        has_text = bool(result.content.strip())
        return result.content, page_count, has_text
    except Exception:
        return "", 0, False


def _extract_ocr(file_path: Path) -> tuple[str, int]:
    """PaddleOCR extraction. Returns (text, page_count)."""
    config = ExtractionConfig(
        force_ocr=True,
        ocr=OcrConfig(backend=OCR_BACKEND, language=OCR_LANGUAGE),
        pages=PageConfig(extract_pages=True, insert_page_markers=True),
    )
    result = extract_file_sync(str(file_path), config=config)
    page_count = result.metadata.get("page_count", 0)
    content = result.content.strip()
    if not content:
        raise RuntimeError("OCR produced no content")
    return content, page_count


@dataclass(slots=True)
class ParseResult:
    filename: str
    content: str
    page_count: int
    processing_time_ms: int
    extraction_method: str
    metadata: dict[str, Any] = field(default_factory=dict)


def parse_document(file_path: Path) -> ParseResult:
    """Extract text from a document, falling back to OCR if needed."""
    started = time.perf_counter()
    path = Path(file_path)

    text_content, page_count, has_text = _extract_text(path)

    if has_text:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ParseResult(
            filename=path.name,
            content=text_content,
            page_count=page_count,
            processing_time_ms=elapsed_ms,
            extraction_method="native",
        )

    print(f"[parse] {path.name}: no text layer, falling back to OCR", file=sys.stderr)
    ocr_content, ocr_page_count = _extract_ocr(path)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return ParseResult(
        filename=path.name,
        content=ocr_content,
        page_count=ocr_page_count or page_count,
        processing_time_ms=elapsed_ms,
        extraction_method=f"ocr:{OCR_BACKEND}",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract text from a document and emit JSON.",
    )
    parser.add_argument("file_path", help="Path to the document")
    args = parser.parse_args(argv)

    result = parse_document(Path(args.file_path))
    json.dump(asdict(result), sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
