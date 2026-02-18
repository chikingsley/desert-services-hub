"""Fast heuristic PDF classifier using kreuzberg text extraction.

No LLM calls — just extracts first 2 pages of text and applies keyword rules.
Handles all document types flowing through Internal Contracts:
contracts, estimates, LOIs, POs, work orders, plans, support docs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from kreuzberg import ExtractionConfig, PageConfig, extract_file_sync

from pdf_analysis.types import DocumentType

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class ClassifyResult:
    document_type: DocumentType
    confidence: float
    indicators: list[str]
    page_count: int
    filename: str
    first_page_snippet: str = ""


# ---------------------------------------------------------------------------
# Rules — ordered by specificity (most specific first)
# ---------------------------------------------------------------------------

# Each rule: (doc_type, confidence, required_patterns, indicator_label)
# required_patterns: ALL must match for the rule to fire (case-insensitive)

_RULES: list[tuple[DocumentType, float, list[str], str]] = [
    # ---- Support documents (before contracts to avoid false positives) ----
    # Insurance requirements / certificates
    (
        "insurance",
        0.90,
        [r"Certificate\s+of\s+(?:Liability\s+)?Insurance", r"ACORD"],
        "ACORD insurance cert",
    ),
    (
        "insurance",
        0.85,
        [r"Insurance\s+Requirements", r"(?:Workers|General\s+Liability|Umbrella)"],
        "Insurance requirements",
    ),
    # Tax forms
    ("tax_form", 0.95, [r"Form\s+W-9|Request\s+for\s+Taxpayer"], "W-9 tax form"),
    ("tax_form", 0.90, [r"AZ\s+Form\s+5005|Transaction\s+Privilege\s+Tax"], "AZ tax form"),
    # Lien waivers (before contract rules — waivers mention "subcontract")
    (
        "lien_waiver",
        0.90,
        [r"(?:Conditional|Unconditional)\s+(?:Progress|Final)\s+(?:Lien\s+)?Waiver"],
        "Lien waiver",
    ),
    ("lien_waiver", 0.85, [r"Waiver\s+(?:and\s+)?Release\s+of\s+Lien"], "Waiver and release"),
    # Prelien
    ("prelien", 0.90, [r"Preliminary\s+(?:20-Day\s+)?Notice|Prelien"], "Preliminary notice"),
    # Checklist (before contract rules — checklists mention "subcontract")
    (
        "checklist",
        0.90,
        [r"Check\s*[Ll]ist", r"(?:Required|Received|Approved|Pending)"],
        "Contract checklist",
    ),
    # ---- Desert Services estimate (our own template) ----
    ("estimate", 0.95, [r"Services\s+Estimate", r"Estimator"], "DS estimate header"),
    ("estimate", 0.90, [r"Est_\d+", r"DESERT\s+SERVICES"], "DS estimate filename pattern"),
    # ---- NOI certificate ----
    ("noi", 0.95, [r"NOI\s+CERTIFICATE", r"ADEQ"], "ADEQ NOI certificate"),
    ("noi", 0.90, [r"CGP\d+", r"Construction\s+General\s+Permit"], "CGP permit NOI"),
    # ---- Letter of Intent / SOW ----
    ("loi", 0.90, [r"Letter\s+of\s+Intent"], "Letter of Intent header"),
    ("loi", 0.85, [r"LOI\b.*SOW|SOW\b.*LOI"], "LOI & SOW reference"),
    # ---- Purchase Order ----
    ("po", 0.90, [r"Purchase\s+Order"], "Purchase Order header"),
    ("po", 0.85, [r"\bPO\b.*Terms\s+and\s+Conditions"], "PO terms and conditions"),
    # ---- Work Order / Work Authorization ----
    ("work_order", 0.90, [r"Work\s+Order"], "Work Order header"),
    ("work_order", 0.85, [r"Work\s+Authorization"], "Work Authorization header"),
    # ---- Subcontract / Contract ----
    ("contract", 0.95, [r"SUBCONTRACT\s+AGREEMENT"], "Subcontract Agreement header"),
    ("contract", 0.90, [r"SUBCONTRACT\b", r"Schedule\s+of\s+Values"], "Subcontract with SOV"),
    (
        "contract",
        0.85,
        [r"SUBCONTRACT\b", r"Subcontractor\s+(?:agrees|warrants|shall|covenants)"],
        "Subcontract terms",
    ),
    (
        "contract",
        0.80,
        [r"(?:^|\n)\s*CONTRACT\b", r"(?:Contractor|Subcontractor)\s+(?:agrees|shall|warrants)"],
        "Contract with party terms",
    ),
    # ---- SWPPP plans ----
    ("swppp_plan", 0.90, [r"SWPPP", r"(?:Erosion|Sediment|BMP)"], "SWPPP plan content"),
    ("swppp_plan", 0.85, [r"Storm\s*water\s+Pollution\s+Prevention"], "SWPPP full name"),
    # ---- Dust permit ----
    (
        "dust_permit",
        0.90,
        [r"Dust\s+(?:Control\s+)?Permit", r"(?:Maricopa|MCAQD)"],
        "Maricopa dust permit",
    ),
    ("dust_permit", 0.85, [r"D0\d{6}"], "Dust permit ID pattern"),
    # ---- Grading / drainage / civil plans ----
    ("grading_plan", 0.80, [r"Grading\s+Plan|Grading\s+&\s+Drainage"], "Grading plan"),
    ("drainage_plan", 0.80, [r"Drainage\s+Plan|Storm\s+Drain"], "Drainage plan"),
    ("civil_plan", 0.80, [r"Civil\s+Plan|Site\s+Plan"], "Civil plan"),
]


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------


# Primary document types — these take precedence in composite documents
_PRIMARY_TYPES: set[DocumentType] = {"contract", "po", "work_order", "loi"}

# How many pages to scan for primary types in large documents
_DEEP_SCAN_THRESHOLD = 5


def _extract_text(pdf_path: Path, max_pages: int = 2) -> tuple[str, int]:
    """Extract text from first N pages. Returns (text, page_count)."""
    config = ExtractionConfig(
        pages=PageConfig(extract_pages=True),
        force_ocr=False,
    )
    result = extract_file_sync(str(pdf_path), config=config)
    page_count = result.metadata.get("page_count", 0)

    if result.pages:
        parts = []
        for page in result.pages[:max_pages]:
            if page.get("content", "").strip():
                parts.append(page["content"])
        return "\n".join(parts), page_count

    # Fallback: no per-page data, use full content
    return result.content, page_count


def _find_all_matches(
    combined: str,
) -> list[tuple[DocumentType, float, str]]:
    """Return all matching rules as (doc_type, confidence, label)."""
    matches: list[tuple[DocumentType, float, str]] = []
    seen_types: set[DocumentType] = set()
    for doc_type, confidence, patterns, label in _RULES:
        if doc_type in seen_types:
            continue
        if all(re.search(p, combined, re.IGNORECASE) for p in patterns):
            matches.append((doc_type, confidence, label))
            seen_types.add(doc_type)
    return matches


def classify_text(text: str, filename: str = "") -> ClassifyResult:
    """Classify a document from pre-extracted text (no file I/O)."""
    combined = text + "\n" + filename
    snippet = text[:200].replace("\n", " ").strip()

    if not text.strip():
        return ClassifyResult("unknown", 0.0, ["no text provided"], 0, filename)

    matches = _find_all_matches(combined)

    if not matches:
        # Fallback: generic contract keyword scoring
        contract_signals = sum(
            1
            for keyword in [
                "shall", "agrees to", "herein", "hereby",
                "indemnify", "scope of work", "payment terms", "retainage",
            ]
            if keyword.lower() in text.lower()
        )
        if contract_signals >= 3:
            return ClassifyResult(
                "contract", 0.60, [f"{contract_signals} contract keywords"],
                0, filename, snippet,
            )
        return ClassifyResult("unknown", 0.30, ["no rules matched"], 0, filename, snippet)

    best_type, best_conf, best_label = matches[0]
    indicators = [best_label]
    for _t, _c, lbl in matches[1:3]:
        indicators.append(f"also: {_t} ({lbl})")

    return ClassifyResult(best_type, best_conf, indicators, 0, filename, snippet)


def classify_pdf(pdf_path: Path) -> ClassifyResult:
    """Classify a PDF using multi-pass heuristic scoring.

    For large documents (>5 pages), if the first match is a support type
    (tax_form, prelien, checklist, etc.), we deep-scan up to 5 pages to
    check for primary types (contract, PO, etc.) that should take precedence.
    """
    path = Path(pdf_path)
    text, page_count = _extract_text(path, max_pages=2)

    combined = text + "\n" + path.stem

    # No text at all → scanned doc, use filename hints
    if not text.strip():
        name_lower = path.stem.lower()
        if any(k in name_lower for k in ("swppp", "erosion", "sediment")):
            return ClassifyResult(
                "swppp_plan", 0.60, ["no text; filename hint"], page_count, path.name
            )
        if any(k in name_lower for k in ("grading", "drainage", "civil")):
            return ClassifyResult(
                "civil_plan", 0.60, ["no text; filename hint"], page_count, path.name
            )
        if any(k in name_lower for k in ("wo ", "work order", "work_order")):
            return ClassifyResult(
                "work_order", 0.60, ["no text; filename hint"], page_count, path.name
            )
        if any(k in name_lower for k in ("loi", "letter of intent")):
            return ClassifyResult("loi", 0.60, ["no text; filename hint"], page_count, path.name)
        if "w-9" in name_lower or "w9" in name_lower:
            return ClassifyResult(
                "tax_form", 0.60, ["no text; filename hint"], page_count, path.name
            )
        return ClassifyResult("unknown", 0.0, ["no extractable text"], page_count, path.name)

    matches = _find_all_matches(combined)
    snippet = text[:200].replace("\n", " ").strip()

    if not matches:
        # Deep scan for large docs before giving up
        if page_count > _DEEP_SCAN_THRESHOLD:
            deep_text, _ = _extract_text(path, max_pages=_DEEP_SCAN_THRESHOLD)
            deep_combined = deep_text + "\n" + path.stem
            matches = _find_all_matches(deep_combined)

        if not matches:
            # Fallback: generic contract keyword scoring
            contract_signals = sum(
                1
                for keyword in [
                    "shall",
                    "agrees to",
                    "herein",
                    "hereby",
                    "indemnify",
                    "scope of work",
                    "payment terms",
                    "retainage",
                ]
                if keyword.lower() in text.lower()
            )
            if contract_signals >= 3:
                return ClassifyResult(
                    "contract",
                    0.60,
                    [f"{contract_signals} contract keywords"],
                    page_count,
                    path.name,
                    snippet,
                )
            return ClassifyResult(
                "unknown", 0.30, ["no rules matched"], page_count, path.name, snippet
            )

    best_match: tuple[DocumentType, float, str] = matches[0]
    best_type, best_conf, best_label = best_match

    # For large composite docs: if first match is a support type,
    # check if a primary type also matches (deeper scan if needed)
    if best_type not in _PRIMARY_TYPES and page_count > _DEEP_SCAN_THRESHOLD:
        # Check existing matches for primary types first
        primary_matches: list[tuple[DocumentType, float, str]] = [
            (t, c, lbl) for t, c, lbl in matches if t in _PRIMARY_TYPES
        ]

        if not primary_matches:
            # Deep scan more pages
            deep_text, _ = _extract_text(path, max_pages=_DEEP_SCAN_THRESHOLD)
            deep_combined = deep_text + "\n" + path.stem
            deep_matches = _find_all_matches(deep_combined)
            primary_matches = [(t, c, lbl) for t, c, lbl in deep_matches if t in _PRIMARY_TYPES]

        if primary_matches:
            best_type, best_conf, best_label = primary_matches[0]

    indicators = [best_label]
    # Add secondary matches as context
    for t, _c, lbl in matches[1:3]:
        indicators.append(f"also: {t} ({lbl})")

    return ClassifyResult(best_type, best_conf, indicators, page_count, path.name, snippet)


def classify_dir(dir_path: Path) -> list[ClassifyResult]:
    """Classify all PDFs in a directory."""
    results = []
    for pdf_file in sorted(dir_path.glob("*.pdf")):
        results.append(classify_pdf(pdf_file))
    return results
