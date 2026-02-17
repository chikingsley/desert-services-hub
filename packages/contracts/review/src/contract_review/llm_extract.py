"""LLM-based contract extraction with source grounding via LangExtract.

Uses Gemini 3 Flash Preview through LangExtract to read the contract and
extract findings with exact character offsets back to the source text.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import langextract as lx


PROMPT = """\
Extract every clause, sentence, or phrase that falls into these categories. \
Be EXHAUSTIVE. Flag everything. False positives acceptable. Missing something is not.

Categories:
- scope_creep: Language adding maintenance, repair, removal, or replacement obligations beyond install-and-inspect.
- mobilization_trap: "all mobilizations included" or single mobilization for multi-month project.
- inapplicable_section: Sections not applicable to SWPPP (hoisting, scaffolding, fire stopping, caulking, sealants, sleeves, penetrations, roof flashings).
- overbroad_language: "all permits", "all fees", "all licenses" beyond what's in the estimate.
- noi_not_filing: Requirement to file NOI, NOT, MSGP, or stormwater documentation.
- record_retention: Requirement to retain records or maintain documents for a period.
- inspection_terms: Inspection frequency, quantity, schedule, rain event triggers. Include exact numbers.
- payment_terms: Payment timing, retainage, pay-when-paid, net terms, billing windows.
- liability_language: Indemnification, hold harmless, fines, penalties, citations.
- company_name_issue: Misspelling of "Desert Services" or former name "IDG" / "Innovative Development Group".
- missing_quantity: Where quantities should be specified but aren't.

For each extraction, use attributes to specify severity (critical/warning/info) and recommended_action.\
"""

EXAMPLE = lx.data.ExampleData(
    text=(
        "Subcontractor shall furnish, install, maintain, and remove the stabilized "
        "construction entrance per Detail EC-5. Subcontractor shall include all costs "
        "of all permits, fees, and licenses. Payment terms are net 45 from receipt of "
        "approved pay application."
    ),
    extractions=[
        lx.data.Extraction(
            extraction_class="scope_creep",
            extraction_text="maintain, and remove",
            description="Adds maintenance and removal beyond install scope.",
            attributes={
                "severity": "critical",
                "recommended_action": "Strike 'maintain, and remove'. Install only.",
            },
        ),
        lx.data.Extraction(
            extraction_class="overbroad_language",
            extraction_text="all costs of all permits, fees, and licenses",
            description="Too broad — limit to permits in estimate only.",
            attributes={
                "severity": "critical",
                "recommended_action": "Replace with 'only permits included in estimate'.",
            },
        ),
        lx.data.Extraction(
            extraction_class="payment_terms",
            extraction_text="net 45 from receipt of approved pay application",
            description="Payment terms identified.",
            attributes={
                "severity": "info",
                "recommended_action": "Verify net 45 is acceptable.",
            },
        ),
    ],
)


@dataclass
class GroundedFinding:
    category: str
    text: str
    start: int | None
    end: int | None
    description: str | None
    severity: str | None
    recommended_action: str | None
    alignment: str | None


@dataclass
class ExtractionResult:
    source_name: str
    total_findings: int
    grounded_count: int
    findings: list[GroundedFinding] = field(default_factory=list)


def extract_contract(
    text: str,
    *,
    source_name: str = "contract",
    model_id: str = "gemini-3-flash-preview",
    api_key: str | None = None,
    extraction_passes: int = 2,
    max_char_buffer: int = 2000,
    max_workers: int = 10,
) -> ExtractionResult:
    key = api_key or os.environ.get("LANGEXTRACT_API_KEY", "")
    if not key:
        raise ValueError("LANGEXTRACT_API_KEY not set")

    doc = lx.extract(
        text,
        prompt_description=PROMPT,
        examples=[EXAMPLE],
        model_id=model_id,
        api_key=key,
        extraction_passes=extraction_passes,
        max_char_buffer=max_char_buffer,
        max_workers=max_workers,
        temperature=0.0,
        show_progress=True,
    )

    findings: list[GroundedFinding] = []
    grounded = 0
    if doc.extractions:
        for ext in doc.extractions:
            attrs = ext.attributes or {}
            start = ext.char_interval.start_pos if ext.char_interval else None
            end = ext.char_interval.end_pos if ext.char_interval else None
            if start is not None:
                grounded += 1
            findings.append(
                GroundedFinding(
                    category=ext.extraction_class,
                    text=ext.extraction_text,
                    start=start,
                    end=end,
                    description=ext.description,
                    severity=attrs.get("severity") if isinstance(attrs.get("severity"), str) else None,
                    recommended_action=attrs.get("recommended_action") if isinstance(attrs.get("recommended_action"), str) else None,
                    alignment=ext.alignment_status.value if ext.alignment_status else None,
                )
            )

    findings.sort(key=lambda f: f.start if f.start is not None else 999999)

    return ExtractionResult(
        source_name=source_name,
        total_findings=len(findings),
        grounded_count=grounded,
        findings=findings,
    )
