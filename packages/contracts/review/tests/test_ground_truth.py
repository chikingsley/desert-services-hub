"""Test scanner against real ground truth contracts.

Each fixture must have a reconciled.md (GLM OCR + kimi reconciliation output).
"""

from __future__ import annotations

from pathlib import Path

from contract_review.scanner import scan

_FIXTURES = Path(__file__).resolve().parents[2] / "ground-truth" / "test-fixtures"


def _load_text(fixture_name: str) -> str | None:
    """Load reconciled contract text."""
    md = _FIXTURES / fixture_name / "reconciled.md"
    if not md.exists():
        return None
    return md.read_text()


def _print_flags(label: str, text: str | None) -> None:
    if text is None:
        return
    result = scan(text)
    by_rule: dict[str, int] = {}
    for f in result.active_flags:
        by_rule[f.rule_id] = by_rule.get(f.rule_id, 0) + 1
    summary = ", ".join(f"{k}={v}" for k, v in sorted(by_rule.items()))
    print(f"\n  {label}: {len(result.active_flags)} flags ({summary})")


class TestGreenwayEmbrey:
    """Embrey Builders - Greenway Pkwy PHX SWPPP & Garage Cleaning ($46,021)."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("greenway-embrey")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 1000

    def test_scope_creep_present(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        scope = [f for f in result.active_flags if f.rule_id == "SCOPE_CREEP"]
        assert len(scope) >= 15

    def test_no_company_issues(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        company = [f for f in result.active_flags if f.rule_id in ("FORMER_COMPANY", "COMPANY_MISSPELLING")]
        assert len(company) == 0

    def test_print_flags(self) -> None:
        _print_flags("Greenway Embrey", self.text)


class TestKiwanisCaliente:
    """Caliente Construction - Kiwanis SWPPP/Dust ($10,547.50)."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("kiwanis-caliente")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("Kiwanis Caliente", self.text)


class TestModeraPV:
    """MCRT Southwest - Modera Paradise Valley SWPPP ($75,555)."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("modera-paradise-valley")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 1000

    def test_scope_creep_flags(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        scope = [f for f in result.active_flags if f.rule_id == "SCOPE_CREEP"]
        assert len(scope) >= 10

    def test_detects_former_company(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        idg = [f for f in result.active_flags if f.rule_id == "FORMER_COMPANY"]
        assert len(idg) >= 1

    def test_print_flags(self) -> None:
        _print_flags("Modera PV", self.text)


class TestElantoPrasada:
    """Elanto at Prasada - known 'Deseret' misspelling."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("elanto-at-prasada")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_detects_company_misspelling(self) -> None:
        if self.text is None:
            return
        result = scan(self.text)
        misspell = [f for f in result.active_flags if f.rule_id == "COMPANY_MISSPELLING"]
        assert len(misspell) >= 1

    def test_print_flags(self) -> None:
        _print_flags("Elanto Prasada", self.text)


class TestDiamondViewBallpark:
    """Diamond View Ballpark."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("diamond-view-ballpark")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 1000

    def test_print_flags(self) -> None:
        _print_flags("Diamond View", self.text)


class TestDesertSky:
    """Desert Sky."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("desert-sky")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("Desert Sky", self.text)


class TestGoodDayCarwash:
    """Good Day Carwash Gilbert."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("good-day-carwash-gilbert")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("Good Day Carwash", self.text)


class TestGSQBldg01:
    """GSQ Bldg 01."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("gsq-bldg-01")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("GSQ Bldg 01", self.text)


class TestMorelandMultifamily:
    """Moreland Multifamily."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("moreland-multifamily")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("Moreland Multifamily", self.text)


class TestMuscularMovingMen:
    """Muscular Moving Men."""

    @classmethod
    def setup_class(cls) -> None:
        cls.text = _load_text("muscular-moving-men")

    def test_has_text(self) -> None:
        assert self.text is not None, "Contract PDF not found"
        assert len(self.text) > 500

    def test_print_flags(self) -> None:
        _print_flags("Muscular Moving Men", self.text)
