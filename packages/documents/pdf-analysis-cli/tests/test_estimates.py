"""TDD tests for Desert Services estimate extraction.

Ground truth derived from visual inspection of 5 real estimate PDFs.
Tests written BEFORE implementation to prove correctness and generalization.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pdf_analysis.estimates import (
    Estimate,
    EstimateLineItem,
    SectionType,
    _decode_cid_glyphs,
    _is_taxable,
    _parse_money,
    _parse_qty,
    extract_estimate,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
GROUND_TRUTH = REPO_ROOT / "apps" / "contract" / "projects" / "ground-truth"

pytestmark = pytest.mark.skipif(
    not GROUND_TRUTH.exists(),
    reason="Ground truth fixtures not available",
)


# ---------------------------------------------------------------------------
# Helper unit tests
# ---------------------------------------------------------------------------


class TestParseMoney:
    def test_basic(self):
        assert _parse_money("1,350.00") == 1350.00

    def test_no_comma(self):
        assert _parse_money("2.75") == 2.75

    def test_large(self):
        assert _parse_money("26,400.00") == 26400.00

    def test_taxable_suffix(self):
        assert _parse_money("1,350.00T") == 1350.00

    def test_none(self):
        assert _parse_money(None) is None

    def test_empty(self):
        assert _parse_money("") is None

    def test_whitespace(self):
        assert _parse_money("  ") is None


class TestIsTaxable:
    def test_taxable(self):
        assert _is_taxable("1,350.00T") is True

    def test_not_taxable(self):
        assert _is_taxable("1,350.00") is False

    def test_none(self):
        assert _is_taxable(None) is False


# ---------------------------------------------------------------------------
# Helper to find a line item by matching item name (case-insensitive contains)
# ---------------------------------------------------------------------------


def find_item(est: Estimate, name: str) -> EstimateLineItem | None:
    """Find first line item whose item field contains `name` (case-insensitive)."""
    lower = name.lower()
    for li in est.line_items:
        if lower in li.item.lower():
            return li
    return None


def find_items(est: Estimate, name: str) -> list[EstimateLineItem]:
    """Find all line items matching name."""
    lower = name.lower()
    return [li for li in est.line_items if lower in li.item.lower()]




class TestCidDecoding:
    def test_decode_digit_glyphs(self):
        assert _decode_cid_glyphs("(cid:55)(cid:55)0.00") == "770.00"

    def test_parse_money_with_cid_digits(self):
        assert _parse_money("(cid:55)(cid:55)0.00") == 770.00

    def test_parse_qty_with_cid_digits(self):
        assert _parse_qty("(cid:55)3") == 73.0

# ---------------------------------------------------------------------------
# 1. VEG BUILDING (3 pages, sections, Permit Filing embedded, Rental Tax 0)
# ---------------------------------------------------------------------------


class TestVeg:
    PDF = GROUND_TRUTH / "project-1034-gsq-veg" / "estimate-12172501.pdf"

    @pytest.fixture(scope="class")
    def est(self) -> Estimate:
        return extract_estimate(self.PDF)

    # -- Header --
    def test_estimate_number(self, est: Estimate):
        assert est.header.estimate_number == "12172501"

    def test_no_revision(self, est: Estimate):
        assert est.header.revision is None

    def test_date(self, est: Estimate):
        assert est.header.date == "12/17/2025"

    def test_estimator(self, est: Estimate):
        assert est.header.estimator == "Jeff Gardner"

    def test_gc_name(self, est: Estimate):
        assert "Estimating Department" in est.header.gc_name

    def test_job_name(self, est: Estimate):
        assert "VEG BUILDING" in est.header.job_name

    def test_job_address(self, est: Estimate):
        assert "GOODYEAR" in est.header.job_address

    # -- Grand total --
    def test_grand_total(self, est: Estimate):
        assert est.grand_total == 17440.00

    # -- Section subtotals (VEG is the only one with these) --
    def test_section_subtotals_exist(self, est: Estimate):
        assert len(est.section_subtotals) >= 2

    def test_required_subtotal(self, est: Estimate):
        subtotals = {s.section: s.amount for s in est.section_subtotals}
        assert subtotals.get(SectionType.REQUIRED) == 7600.00

    def test_phase1_subtotal(self, est: Estimate):
        subtotals = {s.section: s.amount for s in est.section_subtotals}
        assert subtotals.get(SectionType.PHASE1) == 8615.00

    def test_phase2_subtotal(self, est: Estimate):
        subtotals = {s.section: s.amount for s in est.section_subtotals}
        assert subtotals.get(SectionType.PHASE2) == 1225.00

    # -- Specific line items --
    def test_swppp_narrative(self, est: Estimate):
        item = find_item(est, "narrative")
        assert item is not None
        assert item.qty == 1
        assert item.unit_price == 1350.00
        assert item.total == 1350.00

    def test_swppp_sign(self, est: Estimate):
        item = find_item(est, "swppp sign")
        assert item is not None
        assert item.total == 275.00

    def test_spill_kit(self, est: Estimate):
        item = find_item(est, "spill kit")
        assert item is not None
        assert item.total == 345.00

    def test_inspections(self, est: Estimate):
        item = find_item(est, "inspection")
        assert item is not None
        assert item.qty == 21
        assert item.unit_price == 195.00
        assert item.total == 4095.00

    def test_mobilization(self, est: Estimate):
        item = find_item(est, "mobilization")
        assert item is not None
        assert item.qty == 2
        assert item.total == 510.00

    def test_compost_filter(self, est: Estimate):
        item = find_item(est, "compost filter")
        assert item is not None
        assert item.qty == 1560
        assert item.unit_price == 2.75
        assert item.total == 4290.00

    def test_rock_entrance(self, est: Estimate):
        item = find_item(est, "rock entrance")
        assert item is not None
        assert item.total == 2475.00

    def test_curb_inlet(self, est: Estimate):
        items = find_items(est, "inlet")
        curb = [i for i in items if i.total == 1125.00]
        assert len(curb) == 1
        assert curb[0].qty == 3

    def test_drop_inlet(self, est: Estimate):
        items = find_items(est, "inlet")
        drop = [i for i in items if i.total == 1225.00]
        assert len(drop) == 1
        assert drop[0].qty == 7

    def test_concrete_rolloff(self, est: Estimate):
        item = find_item(est, "concrete rolloff")
        assert item is not None
        assert item.total == 725.00

    # -- Additional services --
    def test_additional_services_count(self, est: Estimate):
        assert len(est.additional_services) >= 5

    # -- Page count --
    def test_page_count(self, est: Estimate):
        assert est.page_count == 3


# ---------------------------------------------------------------------------
# 2. LEGACY SPORTS ARENA (4 pages, revision R1, no subtotals, zero-qty items)
# ---------------------------------------------------------------------------


class TestLegacy:
    PDF = (
        GROUND_TRUTH
        / "project-1048-legacy-sports-arena-hotel-fire-ice-legacy-arena"
        / "estimate-09242508-R1.pdf"
    )

    @pytest.fixture(scope="class")
    def est(self) -> Estimate:
        return extract_estimate(self.PDF)

    # -- Header --
    def test_estimate_number(self, est: Estimate):
        assert est.header.estimate_number == "09242508"

    def test_revision(self, est: Estimate):
        assert est.header.revision == "R1"

    def test_date(self, est: Estimate):
        assert est.header.date == "9/24/2025"

    def test_estimator(self, est: Estimate):
        assert est.header.estimator == "Jared Aiken"

    def test_gc_name(self, est: Estimate):
        assert "Canyon Building" in est.header.gc_name

    def test_gc_address(self, est: Estimate):
        assert "Chandler" in est.header.gc_address

    def test_job_address(self, est: Estimate):
        assert "28TH AVE" in est.header.job_address

    # -- Grand total --
    def test_grand_total(self, est: Estimate):
        assert est.grand_total == 15744.65

    # -- Zero-qty items still present --
    def test_has_zero_qty_items(self, est: Estimate):
        zero_items = [li for li in est.line_items if li.qty == 0]
        assert len(zero_items) >= 4

    # -- Specific items --
    def test_compost_filter(self, est: Estimate):
        item = find_item(est, "compost filter")
        assert item is not None
        assert item.qty == 2857
        assert item.unit_price == 2.45
        assert item.total == 6999.65

    def test_inlet_protection(self, est: Estimate):
        item = find_item(est, "inlet")
        assert item is not None
        assert item.qty == 11
        assert item.total == 1595.00

    def test_dust_control_sign(self, est: Estimate):
        item = find_item(est, "dust control sign")
        assert item is not None
        assert item.total == 575.00

    def test_inspections(self, est: Estimate):
        item = find_item(est, "inspection")
        assert item is not None
        assert item.qty == 21
        assert item.total == 4095.00

    def test_mobilization(self, est: Estimate):
        item = find_item(est, "mobilization")
        assert item is not None
        assert item.qty == 2
        assert item.total == 510.00

    # -- No section subtotals --
    def test_no_section_subtotals(self, est: Estimate):
        assert len(est.section_subtotals) == 0

    # -- Additional services --
    def test_additional_services(self, est: Estimate):
        assert len(est.additional_services) >= 5

    def test_page_count(self, est: Estimate):
        assert est.page_count == 4


# ---------------------------------------------------------------------------
# 3. GREENWAY (4 pages, priced items AFTER additional services)
# ---------------------------------------------------------------------------


class TestGreenway:
    PDF = GROUND_TRUTH / "test-fixtures" / "greenway-embrey" / "estimate.pdf"

    @pytest.fixture(scope="class")
    def est(self) -> Estimate:
        return extract_estimate(self.PDF)

    # -- Header --
    def test_estimate_number(self, est: Estimate):
        assert est.header.estimate_number == "02062501"

    def test_revision(self, est: Estimate):
        assert est.header.revision == "R1"

    def test_gc_name(self, est: Estimate):
        assert "Embrey" in est.header.gc_name

    # -- Grand total --
    def test_grand_total(self, est: Estimate):
        assert est.grand_total == 46021.00

    # -- KEY EDGE CASE: priced items after Additional Services section --
    def test_sweep_item_after_additional(self, est: Estimate):
        """Sweep/blow item ($12,656) appears on page 4 after Additional Services."""
        matches = [li for li in est.line_items if li.total == 12656.00]
        assert len(matches) == 1

    def test_allowance_item_after_additional(self, est: Estimate):
        """Allowance ($10,000) appears on page 4 after Additional Services."""
        matches = [li for li in est.line_items if li.total == 10000.00]
        assert len(matches) == 1

    # -- Specific items --
    def test_compost_filter(self, est: Estimate):
        item = find_item(est, "compost filter")
        assert item is not None
        assert item.qty == 3000
        assert item.total == 7350.00

    def test_curb_inlet(self, est: Estimate):
        items = find_items(est, "inlet")
        curb = [i for i in items if i.total == 1125.00]
        assert len(curb) == 1

    def test_inspections(self, est: Estimate):
        item = find_item(est, "inspection")
        assert item is not None
        assert item.qty == 52
        assert item.total == 10140.00

    def test_mobilization(self, est: Estimate):
        item = find_item(est, "mobilization")
        assert item is not None
        assert item.qty == 10
        assert item.total == 2550.00

    # -- Computed subtotal should match sum of all line item totals --
    def test_computed_subtotal_matches_items(self, est: Estimate):
        item_sum = sum(li.total for li in est.line_items)
        assert abs(est.computed_subtotal - item_sum) < 0.01


# ---------------------------------------------------------------------------
# 4. KIWANIS (3 pages, Permit Filing WITH numeric cells, no job address)
# ---------------------------------------------------------------------------


class TestKiwanis:
    PDF = GROUND_TRUTH / "test-fixtures" / "kiwanis-caliente" / "estimate.pdf"

    @pytest.fixture(scope="class")
    def est(self) -> Estimate:
        return extract_estimate(self.PDF)

    # -- Header --
    def test_estimate_number(self, est: Estimate):
        assert est.header.estimate_number == "05162505"

    def test_no_revision(self, est: Estimate):
        assert est.header.revision is None

    def test_date(self, est: Estimate):
        assert est.header.date == "5/16/2025"

    def test_gc_name(self, est: Estimate):
        assert "Caliente" in est.header.gc_name

    def test_gc_address(self, est: Estimate):
        assert "Tempe" in est.header.gc_address

    # -- Grand total --
    def test_grand_total(self, est: Estimate):
        assert est.grand_total == 10547.50

    # -- KEY EDGE CASE: Permit Filing has numeric cells --
    def test_permit_filing_has_values(self, est: Estimate):
        item = find_item(est, "permit")
        assert item is not None
        assert item.qty == 1
        assert item.unit_price == 1630.00
        assert item.total == 1630.00

    # -- Rock entrance --
    def test_rock_entrance(self, est: Estimate):
        item = find_item(est, "rock entrance")
        assert item is not None
        assert item.qty == 1
        assert item.total == 2475.00

    # -- Inspections --
    def test_inspections(self, est: Estimate):
        item = find_item(est, "inspection")
        assert item is not None
        assert item.qty == 21
        assert item.total == 4095.00

    # -- Additional services --
    def test_additional_services(self, est: Estimate):
        assert len(est.additional_services) >= 5


# ---------------------------------------------------------------------------
# 5. MODERA (4 pages, no U/M column, backflow items, multiple permit filings)
# ---------------------------------------------------------------------------


class TestModera:
    PDF = (
        GROUND_TRUTH
        / "project-1054-modera-paradise-valley-pv"
        / "estimate-12102503.pdf"
    )

    @pytest.fixture(scope="class")
    def est(self) -> Estimate:
        return extract_estimate(self.PDF)

    # -- Header --
    def test_estimate_number(self, est: Estimate):
        assert est.header.estimate_number == "12102503"

    def test_no_revision(self, est: Estimate):
        assert est.header.revision is None

    def test_gc_name(self, est: Estimate):
        assert "Mill Creek" in est.header.gc_name

    def test_gc_address(self, est: Estimate):
        assert "Scottsdale" in est.header.gc_address

    def test_job_address(self, est: Estimate):
        assert "CACTUS" in est.header.job_address

    # -- Grand total --
    def test_grand_total(self, est: Estimate):
        assert est.grand_total == 86260.00

    # -- KEY EDGE CASE: no U/M column (5 cols) --
    # If parsing works, items will have correct values

    # -- Specific items --
    def test_compost_filter(self, est: Estimate):
        item = find_item(est, "compost filter")
        assert item is not None
        assert item.qty == 3000
        assert item.unit_price == 2.75
        assert item.total == 8250.00

    def test_rock_entrance(self, est: Estimate):
        item = find_item(est, "rock entrance")
        assert item is not None
        assert item.qty == 4
        assert item.total == 9900.00

    def test_rumble_grates(self, est: Estimate):
        """Rumble grates as Misc: 24 x $1,100 = $26,400."""
        matches = [li for li in est.line_items if li.total == 26400.00]
        assert len(matches) == 1

    def test_drop_inlet(self, est: Estimate):
        items = find_items(est, "inlet")
        drop = [i for i in items if i.total == 4200.00]
        assert len(drop) == 1
        assert drop[0].qty == 24

    def test_inspections(self, est: Estimate):
        item = find_item(est, "inspection")
        assert item is not None
        assert item.qty == 60
        assert item.total == 11700.00

    # -- KEY EDGE CASE: multiple Permit Filings --
    def test_multiple_permit_filings(self, est: Estimate):
        permits = find_items(est, "permit")
        assert len(permits) >= 2
        totals = sorted(p.total for p in permits)
        assert 2760.00 in totals
        assert 3260.00 in totals

    # -- KEY EDGE CASE: backflow items --
    def test_backflow_certification(self, est: Estimate):
        item = find_item(est, "backflow cert")
        assert item is not None
        assert item.total == 590.00

    def test_backflow_rental(self, est: Estimate):
        item = find_item(est, "backflow rental")
        assert item is not None
        assert item.qty == 27
        assert item.total == 13230.00

    def test_mobilization(self, est: Estimate):
        item = find_item(est, "mobilization")
        assert item is not None
        assert item.qty == 5
        assert item.total == 1275.00

    # -- Additional services --
    def test_additional_services(self, est: Estimate):
        assert len(est.additional_services) >= 4

    def test_page_count(self, est: Estimate):
        assert est.page_count == 4


# ---------------------------------------------------------------------------
# Cross-estimate validation: grand total == sum of line items (+ tax if any)
# ---------------------------------------------------------------------------


ESTIMATE_PDFS = [
    GROUND_TRUTH / "project-1034-gsq-veg" / "estimate-12172501.pdf",
    GROUND_TRUTH
    / "project-1048-legacy-sports-arena-hotel-fire-ice-legacy-arena"
    / "estimate-09242508-R1.pdf",
    GROUND_TRUTH / "test-fixtures" / "greenway-embrey" / "estimate.pdf",
    GROUND_TRUTH / "test-fixtures" / "kiwanis-caliente" / "estimate.pdf",
    GROUND_TRUTH
    / "project-1054-modera-paradise-valley-pv"
    / "estimate-12102503.pdf",
]


@pytest.mark.parametrize("pdf_path", ESTIMATE_PDFS, ids=lambda p: p.stem)
def test_grand_total_matches_item_sum(pdf_path: Path):
    """For every estimate, grand total should equal sum of all priced line items + tax."""
    est = extract_estimate(pdf_path)
    tax_amount = est.tax.tax_amount if est.tax else 0.0
    expected = est.computed_subtotal + tax_amount
    assert abs(est.grand_total - expected) < 0.02, (
        f"Grand total {est.grand_total} != computed {expected} "
        f"(items={est.computed_subtotal}, tax={tax_amount})"
    )
