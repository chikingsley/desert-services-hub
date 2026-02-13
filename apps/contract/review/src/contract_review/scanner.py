"""Contract scanner for fail-closed red-flag detection and extraction.

Policy for this scanner:
- Zero-miss bias: if uncertain, flag for review.
- False positives are acceptable; silent misses are not.
- Deterministic, no LLM calls.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

Severity = Literal["critical", "warning", "info"]


@dataclass(slots=True)
class Flag:
    """A single flagged occurrence in the document."""

    rule_id: str
    severity: Severity
    keyword: str
    context: str  # surrounding text window
    offset: int  # character offset in source text
    explanation: str
    details: str | None = None


@dataclass(slots=True)
class ScanResult:
    """Aggregated result of scanning a document."""

    flags: list[Flag] = field(default_factory=list)

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.flags if f.severity == "critical")

    @property
    def warning_count(self) -> int:
        return sum(1 for f in self.flags if f.severity == "warning")

    @property
    def active_flags(self) -> list[Flag]:
        return self.flags

    @property
    def blockers(self) -> list[Flag]:
        return [f for f in self.flags if f.severity == "critical"]

    @property
    def warnings(self) -> list[Flag]:
        return [f for f in self.flags if f.severity == "warning"]

    @property
    def infos(self) -> list[Flag]:
        return [f for f in self.flags if f.severity == "info"]


_CONTEXT_WINDOW = 300  # chars before and after the match


def _extract_context(text: str, start: int, end: int, window: int = _CONTEXT_WINDOW) -> str:
    """Extract text around a match, trimmed to word boundaries."""
    ctx_start = max(0, start - window)
    ctx_end = min(len(text), end + window)

    # Try to snap to word boundaries, but fall back to raw window
    if ctx_start > 0:
        space = text.rfind(" ", ctx_start, start)
        if space != -1:
            ctx_start = space + 1

    if ctx_end < len(text):
        space = text.find(" ", end, ctx_end)
        if space != -1:
            ctx_end = space

    # Ensure we always return at least the window range even without spaces
    if ctx_end - ctx_start < end - start + 20:
        ctx_start = max(0, start - window)
        ctx_end = min(len(text), end + window)

    return text[ctx_start:ctx_end]


@dataclass(slots=True, frozen=True)
class KeywordRule:
    rule_id: str
    severity: Severity
    pattern: re.Pattern[str]
    explanation: str
    details: str | None = None


_RULES: list[KeywordRule] = [
    # ---- Scope creep terms (blocker by policy) ----
    KeywordRule(
        "SCOPE_CREEP",
        "critical",
        re.compile(
            r"\b(?:maintain|maintenanc|repair|remov|amend|adjust|replac|upgrad|regrad|replenish)\w*\b",
            re.IGNORECASE,
        ),
        "Scope creep term detected",
    ),
    # ---- Former company name ----
    KeywordRule(
        "FORMER_COMPANY",
        "critical",
        re.compile(
            r"\bIDG\b|Innovative\s+Development\s+Group",
            re.IGNORECASE,
        ),
        "Former company name — should be Desert Services",
    ),
    # ---- Company name misspelling ----
    KeywordRule(
        "COMPANY_MISSPELLING",
        "critical",
        re.compile(
            r"\bDeseret\b"  # Known real-world misspelling (from Elanto contract)
            r"|\bDessert\s+Services?\b"  # Double-s typo
            r"|\bDesert\s+Service\b",  # Singular "Service" (missing s)
            re.IGNORECASE,
        ),
        "Company name misspelling — should be 'Desert Services'",
    ),
    # ---- Liability and fines (warning only, always surface) ----
    KeywordRule(
        "LIABILITY_OR_FINES_LANGUAGE",
        "warning",
        re.compile(
            r"\b(?:fine|fines|penalty|penalties|citation|citations|liable|liability|indemnif(?:y|ication)|hold harmless)\b",
            re.IGNORECASE,
        ),
        "Liability/fines language detected — review scope context",
    ),
]

_INSPECTION_MENTION_RE = re.compile(r"\binspection(?:s)?\b", re.IGNORECASE)
_INSPECTION_QUANTITY_RE = re.compile(
    r"\b(?:\d+|sixty|fifty|forty|thirty|twenty|ten)\s+(?:inspection|inspections)\b",
    re.IGNORECASE,
)
_INSPECTION_FREQUENCY_RE = re.compile(
    r"\b(?:bi[-\s]?weekly|every\s+14\s+days|every\s+two\s+weeks|weekly|monthly|once\s+per\s+(?:week|month)|every\s+week)\b",
    re.IGNORECASE,
)
_INSPECTION_RAIN_TRIGGER_RE = re.compile(
    r"\b(?:rain|rainfall|precipitation).{0,80}(?:24\s*hours?|0\.?5\s*(?:inches?|\"|in))|(?:24\s*hours?).{0,80}(?:rain|rainfall|precipitation)\b",
    re.IGNORECASE | re.DOTALL,
)

_PAYMENT_TERMS_RE = re.compile(
    r"\b(?:pay(?:-|\s)?when(?:-|\s)?paid|paid(?:-|\s)?if(?:-|\s)?paid|net\s+\d+\b|payment\s+within\s+\d+\s+days|progress\s+payment|retainage|billing\s+window|pay\s+application)\b",
    re.IGNORECASE,
)

_PAYMENT_TERMS_MISSING_RULE = KeywordRule(
    "PAYMENT_TERMS_MISSING",
    "warning",
    re.compile(r"^$"),
    "No explicit payment terms detected",
)

# Map likely estimate line-item categories to contract mention patterns.
_NON_INCLUDED_SCOPE_PATTERNS: dict[str, re.Pattern[str]] = {
    "FIRE_ACCESS_SIGN": re.compile(r"\bfire\s+(?:dept|department)?\s*access\s*sign", re.IGNORECASE),
    "SWPPP_SIGN": re.compile(r"\bswppp\s*sign|\bstormwater\s*sign", re.IGNORECASE),
    "DUST_CONTROL_SIGN": re.compile(r"\bdust\s*control\s*sign|\bdust\s*sign", re.IGNORECASE),
    "FENCE": re.compile(r"\b(?:temp(?:orary)?\s+)?fence\b", re.IGNORECASE),
    "INLET_PROTECTION": re.compile(r"\b(?:drop|curb)?\s*inlet\s*protection\b", re.IGNORECASE),
    "SPILL_KIT": re.compile(r"\bspill\s*kit\b", re.IGNORECASE),
    "ROLLOFF": re.compile(r"\broll[\s-]?off\b", re.IGNORECASE),
}

_DESCRIPTION_TO_SCOPE_KEYS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"fire.*sign", re.IGNORECASE), "FIRE_ACCESS_SIGN"),
    (re.compile(r"swppp.*sign|stormwater.*sign", re.IGNORECASE), "SWPPP_SIGN"),
    (re.compile(r"dust.*sign", re.IGNORECASE), "DUST_CONTROL_SIGN"),
    (re.compile(r"\bfence\b", re.IGNORECASE), "FENCE"),
    (re.compile(r"inlet", re.IGNORECASE), "INLET_PROTECTION"),
    (re.compile(r"spill\s*kit", re.IGNORECASE), "SPILL_KIT"),
    (re.compile(r"roll[\s-]?off", re.IGNORECASE), "ROLLOFF"),
]

def _add_flag(
    result: ScanResult,
    *,
    rule_id: str,
    severity: Severity,
    keyword: str,
    text: str,
    start: int,
    end: int,
    explanation: str,
    details: str | None = None,
) -> None:
    result.flags.append(
        Flag(
            rule_id=rule_id,
            severity=severity,
            keyword=keyword,
            context=_extract_context(text, start, end),
            offset=start,
            explanation=explanation,
            details=details,
        )
    )


def _scan_keyword_rules(text: str, result: ScanResult) -> None:
    for rule in _RULES:
        for match in rule.pattern.finditer(text):
            _add_flag(
                result,
                rule_id=rule.rule_id,
                severity=rule.severity,
                keyword=match.group(0),
                text=text,
                start=match.start(),
                end=match.end(),
                explanation=rule.explanation,
                details=rule.details,
            )


def _scan_inspections(text: str, result: ScanResult) -> None:
    inspection_mentions = list(_INSPECTION_MENTION_RE.finditer(text))
    if not inspection_mentions:
        _add_flag(
            result,
            rule_id="INSPECTION_SCOPE_NOT_FOUND",
            severity="critical",
            keyword="inspection",
            text=text,
            start=0,
            end=min(len(text), 1),
            explanation="No inspection scope found",
        )
        return

    first = inspection_mentions[0]
    has_quantity = _INSPECTION_QUANTITY_RE.search(text) is not None
    has_frequency = _INSPECTION_FREQUENCY_RE.search(text) is not None
    has_rain_trigger = _INSPECTION_RAIN_TRIGGER_RE.search(text) is not None

    if not has_quantity:
        _add_flag(
            result,
            rule_id="INSPECTION_QUANTITY_MISSING",
            severity="critical",
            keyword=first.group(0),
            text=text,
            start=first.start(),
            end=first.end(),
            explanation="Inspection quantity missing",
        )
    else:
        qty_match = _INSPECTION_QUANTITY_RE.search(text)
        if qty_match:
            _add_flag(
                result,
                rule_id="INSPECTION_QUANTITY_FOUND",
                severity="info",
                keyword=qty_match.group(0),
                text=text,
                start=qty_match.start(),
                end=qty_match.end(),
                explanation="Inspection quantity found",
            )

    if not has_frequency:
        _add_flag(
            result,
            rule_id="INSPECTION_FREQUENCY_MISSING",
            severity="warning",
            keyword=first.group(0),
            text=text,
            start=first.start(),
            end=first.end(),
            explanation="Inspection frequency missing",
        )
    else:
        freq_match = _INSPECTION_FREQUENCY_RE.search(text)
        if freq_match:
            _add_flag(
                result,
                rule_id="INSPECTION_FREQUENCY_FOUND",
                severity="info",
                keyword=freq_match.group(0),
                text=text,
                start=freq_match.start(),
                end=freq_match.end(),
                explanation="Inspection frequency found",
            )

    if not has_rain_trigger:
        _add_flag(
            result,
            rule_id="INSPECTION_RAIN_TRIGGER_MISSING",
            severity="warning",
            keyword=first.group(0),
            text=text,
            start=first.start(),
            end=first.end(),
            explanation="Inspection rain-event trigger missing",
        )
    else:
        rain_match = _INSPECTION_RAIN_TRIGGER_RE.search(text)
        if rain_match:
            _add_flag(
                result,
                rule_id="INSPECTION_RAIN_TRIGGER_FOUND",
                severity="info",
                keyword=rain_match.group(0)[:80],
                text=text,
                start=rain_match.start(),
                end=rain_match.end(),
                explanation="Inspection rain-event trigger found",
            )


def _scan_payment_terms(text: str, result: ScanResult) -> None:
    matches = list(_PAYMENT_TERMS_RE.finditer(text))
    if not matches:
        _add_flag(
            result,
            rule_id=_PAYMENT_TERMS_MISSING_RULE.rule_id,
            severity=_PAYMENT_TERMS_MISSING_RULE.severity,
            keyword="payment terms",
            text=text,
            start=0,
            end=min(len(text), 1),
            explanation=_PAYMENT_TERMS_MISSING_RULE.explanation,
        )
        return

    for m in matches:
        _add_flag(
            result,
            rule_id="PAYMENT_TERMS_FOUND",
            severity="info",
            keyword=m.group(0),
            text=text,
            start=m.start(),
            end=m.end(),
            explanation="Payment term found",
        )


def _scope_key_from_description(description: str) -> str | None:
    for rule, key in _DESCRIPTION_TO_SCOPE_KEYS:
        if rule.search(description):
            return key
    return None


def scan_non_included_scope_mentions(
    *,
    contract_text: str,
    estimate_items: list[dict[str, object]],
) -> ScanResult:
    """Compare contract language to estimate inclusion.

    Flags if contract text references scope that estimate marks not included.
    """
    result = ScanResult()
    for item in estimate_items:
        description = str(item.get("description") or "").strip()
        if not description:
            continue

        included = bool(item.get("included"))
        total_raw = item.get("total")
        total = float(total_raw) if isinstance(total_raw, (int, float)) else 0.0
        is_not_included = (not included) or total <= 0
        if not is_not_included:
            continue

        key = _scope_key_from_description(description)
        if not key:
            continue
        pattern = _NON_INCLUDED_SCOPE_PATTERNS.get(key)
        if pattern is None:
            continue

        match = pattern.search(contract_text)
        if match:
            _add_flag(
                result,
                rule_id="CONTRACT_REFERENCES_NON_INCLUDED_ITEM",
                severity="critical",
                keyword=match.group(0),
                text=contract_text,
                start=match.start(),
                end=match.end(),
                explanation="Contract references scope not included in estimate",
                details=f"Estimate item marked not included: {description}",
            )

    result.flags.sort(key=lambda f: f.offset)
    return result


def scan(text: str) -> ScanResult:
    """Scan contract text for red flags and keywords.

    Args:
        text: Full contract text (typically reconciled_markdown from parse pipeline).

    Returns:
        ScanResult with all flags.
    """
    result = ScanResult()
    _scan_keyword_rules(text, result)
    _scan_inspections(text, result)
    _scan_payment_terms(text, result)

    # Sort by offset (document order)
    result.flags.sort(key=lambda f: f.offset)

    return result
