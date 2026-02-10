"""Test scanner against real ground truth contract PDFs.

These tests run the scanner against actual contracts from ground-truth/test-fixtures/.
Add assertions here as rules are added to the scanner.
"""

from __future__ import annotations

from pathlib import Path

import pdfplumber

from contract_review.scanner import scan

# Ground truth directory
_FIXTURES = Path(__file__).resolve().parents[2] / "ground-truth" / "test-fixtures"


def _extract_pdf_text(pdf_path: Path) -> str:
    """Extract all text from a PDF using pdfplumber."""
    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


class TestGreenwayEmbrey:
    """Embrey Builders — Greenway Pkwy PHX SWPPP & Garage Cleaning ($46,021)."""

    @classmethod
    def setup_class(cls) -> None:
        pdf = _FIXTURES / "greenway-embrey" / "contract.pdf"
        if not pdf.exists():
            cls.text = None
            return
        cls.text = _extract_pdf_text(pdf)

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 1000

    def test_print_flags(self) -> None:
        """Print whatever the scanner finds — for iterating on rules."""
        if self.text is None:
            return
        result = scan(self.text)
        print(f"\n  === Greenway: {len(result.active_flags)} flags ===")
        for f in result.active_flags:
            print(f"  [{f.severity:8s}] {f.rule_id}: {f.keyword[:60]}")


class TestKiwanisCaliente:
    """Caliente Construction — Kiwanis SWPPP/Dust ($10,547.50)."""

    @classmethod
    def setup_class(cls) -> None:
        pdf = _FIXTURES / "kiwanis-caliente" / "contract.pdf"
        if not pdf.exists():
            cls.text = None
            return
        cls.text = _extract_pdf_text(pdf)

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        print(f"\n  === Kiwanis: {len(result.active_flags)} flags ===")
        for f in result.active_flags:
            print(f"  [{f.severity:8s}] {f.rule_id}: {f.keyword[:60]}")


class TestModeraPV:
    """MCRT Southwest — Modera Paradise Valley SWPPP ($75,555).

    Known egregious contract: "maintain and remove" in every BMP section,
    broad permit language, maintenance scope creep throughout.
    """

    @classmethod
    def setup_class(cls) -> None:
        pdf = _FIXTURES / "modera-paradise-valley" / "contract.pdf"
        if not pdf.exists():
            cls.text = None
            return
        cls.text = _extract_pdf_text(pdf)

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 1000

    def test_scope_creep_flags(self) -> None:
        """Modera PV should have MANY scope creep flags — maintain/remove in every BMP section."""
        if self.text is None:
            return
        result = scan(self.text)
        scope = [f for f in result.active_flags if f.rule_id == "SCOPE_CREEP"]
        # Known from redlines: maintain, remove, repair, amend, adjust all present
        assert len(scope) >= 10, f"Expected many scope creep flags, got {len(scope)}"

    def test_detects_former_company(self) -> None:
        """Contract uses 'IDG/Innovative Development Group LLC DBA: Desert Services'."""
        if self.text is None:
            return
        result = scan(self.text)
        idg = [f for f in result.active_flags if f.rule_id == "FORMER_COMPANY"]
        assert len(idg) >= 1, "Should detect IDG / Innovative Development Group"

    def test_print_flags(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        print(f"\n  === Modera PV: {len(result.active_flags)} active flags ===")
        print(f"  Critical: {result.critical_count}, Warning: {result.warning_count}")
        for f in result.active_flags:
            print(f"  [{f.severity:8s}] {f.rule_id}: {f.keyword[:60]}")
