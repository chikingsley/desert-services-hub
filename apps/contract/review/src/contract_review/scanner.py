"""Keyword scanner for contract red-flag detection.

Scans contract text (markdown from parse pipeline) for problematic keywords
and phrases. Returns flagged sections with surrounding context for human review.

No LLM calls — pure text pattern matching with context-aware false-positive reduction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

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
    false_positive: bool = False
    fp_reason: str | None = None


@dataclass(slots=True)
class ScanResult:
    """Aggregated result of scanning a document."""

    flags: list[Flag] = field(default_factory=list)

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.flags if f.severity == "critical" and not f.false_positive)

    @property
    def warning_count(self) -> int:
        return sum(1 for f in self.flags if f.severity == "warning" and not f.false_positive)

    @property
    def active_flags(self) -> list[Flag]:
        return [f for f in self.flags if not f.false_positive]


# ---------------------------------------------------------------------------
# Context extraction
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Keyword rules
# ---------------------------------------------------------------------------


@dataclass(slots=True, frozen=True)
class KeywordRule:
    rule_id: str
    severity: Severity
    pattern: re.Pattern[str]
    explanation: str
    check_scope: bool = False  # if True, check for scope qualifiers before flagging


_RULES: list[KeywordRule] = [
    # ---- Scope creep words ----
    KeywordRule(
        "SCOPE_CREEP",
        "warning",
        re.compile(
            r"\b(?:maintain|maintenanc|repair|remov|amend|adjust|replac|upgrad|regrad|replenish)\w*\b",
            re.IGNORECASE,
        ),
        "Scope creep word — review surrounding context",
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
]


# ---------------------------------------------------------------------------
# Scope qualifier detection (false-positive reducer)
# ---------------------------------------------------------------------------

# Phrases that scope liability to subcontractor's own work — NOT a red flag
_SCOPE_QUALIFIERS = [
    r"due to (?:sub)?contractor'?s?\s+operations",
    r"(?:sub)?contractor'?s?\s+work\s+area",
    r"operations\s+performed\s+by\s+(?:sub)?contractor",
    r"caused\s+by\s+(?:sub)?contractor",
    r"resulting\s+from\s+(?:sub)?contractor'?s?\s+(?:work|operations|negligence)",
    r"attributable\s+to\s+(?:sub)?contractor",
]

_SCOPE_QUALIFIER_RES = [re.compile(p, re.IGNORECASE) for p in _SCOPE_QUALIFIERS]


def _has_scope_qualifier(text: str, match_start: int, search_window: int = 500) -> str | None:
    """Check if liability language near match_start is scoped to subcontractor's own work.

    Returns the qualifier text if found, None otherwise.
    """
    window_start = max(0, match_start - search_window)
    window_end = min(len(text), match_start + search_window)
    window = text[window_start:window_end]

    for pattern in _SCOPE_QUALIFIER_RES:
        m = pattern.search(window)
        if m:
            return m.group(0)
    return None


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------


def scan(text: str) -> ScanResult:
    """Scan contract text for red flags and keywords.

    Args:
        text: Full contract text (typically reconciled_markdown from parse pipeline).

    Returns:
        ScanResult with all flags.
    """
    result = ScanResult()

    for rule in _RULES:
        for match in rule.pattern.finditer(text):
            context = _extract_context(text, match.start(), match.end())

            fp = False
            fp_reason = None

            if rule.check_scope:
                qualifier = _has_scope_qualifier(text, match.start())
                if qualifier:
                    fp = True
                    fp_reason = f"Scoped by: '{qualifier}'"

            result.flags.append(
                Flag(
                    rule_id=rule.rule_id,
                    severity=rule.severity,
                    keyword=match.group(0),
                    context=context,
                    offset=match.start(),
                    explanation=rule.explanation,
                    false_positive=fp,
                    fp_reason=fp_reason,
                )
            )

    # Sort by offset (document order)
    result.flags.sort(key=lambda f: f.offset)

    return result
