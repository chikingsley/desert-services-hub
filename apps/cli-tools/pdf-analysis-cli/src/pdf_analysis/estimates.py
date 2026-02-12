"""Extract structured data from Desert Services estimate PDFs using pdfplumber.

Handles all known template variations:
- With/without U/M column (6 vs 5 data columns)
- With/without section subtotals
- With/without revision numbers
- Permit Filing with embedded or explicit prices
- Priced items appearing after Additional Services section
- Multiple permit filings, backflow items, dust control signs
"""

# mypy: disable-error-code=prop-decorator

from __future__ import annotations

import re
from enum import Enum
from pathlib import Path

import pdfplumber
import pdfplumber.page
from pydantic import BaseModel, Field, computed_field

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SectionType(str, Enum):
    REQUIRED = "required"
    PHASE1 = "phase1"
    PHASE2 = "phase2"
    ADDITIONAL_SERVICES = "additional_services"
    MISC = "misc"


class EstimateHeader(BaseModel):
    estimate_number: str
    revision: str | None = None
    date: str
    gc_name: str
    gc_address: str = ""
    job_name: str
    job_address: str = ""
    estimator: str


class EstimateLineItem(BaseModel):
    item: str
    description: str
    qty: float
    unit: str | None = None
    unit_cost: float
    total: float
    taxable: bool = False
    section: SectionType = SectionType.REQUIRED


class EstimateTax(BaseModel):
    taxable_subtotal: float
    tax_amount: float
    tax_rate: float


class SectionSubtotal(BaseModel):
    section: SectionType
    amount: float


class AdditionalService(BaseModel):
    item: str
    description: str


class Estimate(BaseModel):
    header: EstimateHeader
    line_items: list[EstimateLineItem]
    additional_services: list[AdditionalService] = Field(default_factory=list)
    section_subtotals: list[SectionSubtotal] = Field(default_factory=list)
    tax: EstimateTax | None = None
    grand_total: float
    page_count: int
    source_file: str
    parse_warnings: list[str] = Field(default_factory=list)

    @computed_field
    @property
    def computed_subtotal(self) -> float:
        return sum(item.total for item in self.line_items)

    @computed_field
    @property
    def total_delta(self) -> float:
        return round(self.grand_total - self.computed_subtotal, 2)

    @computed_field
    @property
    def totals_match(self) -> bool:
        return abs(self.total_delta) <= 0.01


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_MONEY_RE = re.compile(r"^[\s$]*([\d,]+\.\d{2})T?\s*$")
_EMBEDDED_MONEY_RE = re.compile(r"([\d,]+\.\d{2})")
_CID_RE = re.compile(r"\(cid:(\d+)\)")


def _decode_cid_glyphs(value: str) -> str:
    """Decode common pdfplumber cid glyphs (e.g. (cid:55) -> '7')."""

    def repl(match: re.Match[str]) -> str:
        code = int(match.group(1))
        if 32 <= code <= 126:
            return chr(code)
        return ""

    return _CID_RE.sub(repl, value)


def _parse_money(value: str | None) -> float | None:
    """Parse money strings like '1,350.00', '1,350.00T', or cid-encoded values."""
    if not value or not value.strip():
        return None
    normalized = _decode_cid_glyphs(value).strip()
    m = _MONEY_RE.match(normalized)
    if m:
        return float(m.group(1).replace(",", ""))
    return None


def _is_taxable(value: str | None) -> bool:
    """Check if value ends with 'T' (taxable marker)."""
    if not value:
        return False
    normalized = _decode_cid_glyphs(value).strip()
    return normalized.endswith("T") and _parse_money(normalized) is not None


def _cell(value: str | None) -> str:
    """Normalize a table cell: decode cid glyphs, strip whitespace, treat None as ''."""
    if value is None:
        return ""
    return _decode_cid_glyphs(value).strip()


def _parse_qty(value: str | None) -> float | None:
    """Parse quantity string like '1,560', '21', or cid-encoded values."""
    if not value or not value.strip():
        return None
    cleaned = _decode_cid_glyphs(value).strip().replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_money_relaxed(value: str | None) -> float | None:
    """Parse first currency-like token found in a noisy string."""
    if not value:
        return None
    normalized = _decode_cid_glyphs(value)
    m = _EMBEDDED_MONEY_RE.search(normalized)
    if not m:
        return None
    return float(m.group(1).replace(",", ""))


def _derive_qty_from_total(total: float | None, unit_cost: float | None) -> float | None:
    if total is None or unit_cost is None or unit_cost == 0:
        return None
    raw = total / unit_cost
    rounded_whole = round(raw)
    if abs(raw - rounded_whole) < 1e-6:
        return float(rounded_whole)
    return round(raw, 4)


def _looks_like_candidate_item(item_cell: str, row_text: str) -> bool:
    if not item_cell:
        return False
    upper_item = item_cell.upper().strip()
    if upper_item in {"ITEM", "DESCRIPTION", "QTY", "U/M", "COST", "TOTAL"}:
        return False
    upper_row = row_text.upper()
    blocked = (
        "PRICING BASED ON SPECIFIED QUANTITIES",
        "ALL ADDENDA HAVE BEEN RECEIVED",
        "PRINT NAME",
        "SIGNATURE",
    )
    return not any(token in upper_row for token in blocked)


# ---------------------------------------------------------------------------
# Section detection
# ---------------------------------------------------------------------------

_SUBTOTAL_PATTERNS: dict[str, SectionType] = {
    "SUBTOTAL REQUIRED ITEMS": SectionType.REQUIRED,
    "SUBTOTAL PHASE 1": SectionType.PHASE1,
    "SUBTOTAL PHASE 2": SectionType.PHASE2,
}


def _detect_section_marker(row_text: str) -> tuple[str, SectionType | None, float | None] | None:
    """Check if row text contains a section marker.

    Returns (marker_type, section, subtotal_amount) or None.
    marker_type: 'subtotal', 'phase_start', 'additional_services'
    """
    upper = row_text.upper()

    for pattern, section in _SUBTOTAL_PATTERNS.items():
        if pattern in upper:
            return ("subtotal", section, None)

    if "ADDITIONAL SERVICES" in upper:
        return ("additional_services", None, None)

    if upper.strip() == "PHASE 1":
        return ("phase_start", SectionType.PHASE1, None)
    if upper.strip() == "PHASE 2":
        return ("phase_start", SectionType.PHASE2, None)

    return None


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------


def _find_main_table(tables: list[list[list[str | None]]]) -> list[list[str | None]] | None:
    """Find the main line items table by looking for Item/Description header row."""
    for table in tables:
        for row in table:
            cells = [_cell(c) for c in row]
            if "Item" in cells and "Description" in cells and "Total" in cells:
                return table
    return None


def _detect_columns(header_row: list[str | None]) -> dict[str, int]:
    """Map column names to indices. Handles presence/absence of U/M column."""
    col_map: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        name = _cell(cell)
        if name in ("Item", "Description", "Qty", "U/M", "Cost", "Total"):
            col_map[name] = i
    return col_map


def _extract_header(pages: list[pdfplumber.page.Page]) -> EstimateHeader:
    """Extract header from page 1 tables."""
    page = pages[0]
    tables = page.extract_tables()

    estimate_number = ""
    revision = None
    date = ""
    estimator = ""
    gc_name = ""
    gc_address = ""
    job_name = ""
    job_address = ""

    for table in tables:
        if not table or len(table) < 2:
            continue

        header_cells = [_cell(c) for c in table[0]]

        # Header table: Estimator | Date | Estimate #
        if "Estimator" in header_cells and "Date" in header_cells:
            data_row = table[1]
            estimator = _cell(data_row[0])
            date = _cell(data_row[1])
            est_raw = _cell(data_row[2])
            # Split revision: "09242508-R1" -> ("09242508", "R1")
            if "-R" in est_raw:
                parts = est_raw.split("-R", 1)
                estimate_number = parts[0]
                revision = f"R{parts[1]}"
            else:
                estimate_number = est_raw

        # To: table
        if _cell(table[0][0]) == "To:" and len(table) >= 2:
            to_text = _cell(table[1][0])
            lines = [ln.strip() for ln in to_text.split("\n") if ln.strip()]
            if lines:
                gc_name = lines[0]
                gc_address = ", ".join(lines[1:])

        # Main table — job name is in the row after "Job Name" at the same column
        # Table structure: Row 0 = [None, None, 'Job Name', None, ...]
        #                  Row 1 = [None, None, 'ACTUAL NAME', None, ...]
        if "Job Name" in header_cells:
            job_name_col = header_cells.index("Job Name")
            if len(table) > 1:
                job_name = _cell(table[1][job_name_col])

            # SWPPP ESTIMATE FOR: block contains the address
            # Format: "SWPPP ESTIMATE FOR:\nPROJECT NAME\nSTREET\nCITY, STATE ZIP"
            for row in table:
                desc = _cell(row[1]) if len(row) > 1 else ""
                if "ESTIMATE FOR:" in desc.upper():
                    lines = [ln.strip() for ln in desc.split("\n") if ln.strip()]
                    # Line 0: "(REVISED) SWPPP ESTIMATE FOR:"
                    # Line 1: project name
                    # Lines 2+: address parts
                    if len(lines) >= 3:
                        job_address = ", ".join(lines[2:])
                    break

    return EstimateHeader(
        estimate_number=estimate_number,
        revision=revision,
        date=date,
        gc_name=gc_name,
        gc_address=gc_address,
        job_name=job_name,
        job_address=job_address,
        estimator=estimator,
    )


def _extract_grand_total(pages: list[pdfplumber.page.Page]) -> float:
    """Extract grand total from Total box, including cid-encoded currency strings."""
    for page in reversed(pages):
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                for cell in row:
                    if not cell:
                        continue
                    normalized = _decode_cid_glyphs(cell).strip()
                    if normalized.startswith("Total"):
                        m = _EMBEDDED_MONEY_RE.search(normalized)
                        if m:
                            return float(m.group(1).replace(",", ""))
    return 0.0


def extract_estimate(pdf_path: str | Path) -> Estimate:
    """Extract structured estimate data from a Desert Services estimate PDF."""
    pdf_path = Path(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages
        header = _extract_header(pages)

        # Collect all main table rows across pages
        all_rows: list[list[str | None]] = []
        col_map: dict[str, int] = {}

        for page in pages:
            tables = page.extract_tables()
            main_table = _find_main_table(tables)
            if not main_table:
                continue

            for row in main_table:
                cells = [_cell(c) for c in row]

                # Detect column layout from header row (first occurrence)
                if "Item" in cells and "Description" in cells and "Total" in cells:
                    if not col_map:
                        col_map = _detect_columns(row)
                    continue

                # Skip Job Name rows
                if "Job Name" in cells:
                    continue
                # Skip the job name value row (appears before the header on each page)
                if not col_map:
                    continue

                # Skip footer disclaimer rows
                joined = " ".join(cells)
                if "Pricing based on specified quantities" in joined:
                    continue

                all_rows.append(row)

        # Parse rows into items
        line_items: list[EstimateLineItem] = []
        additional_services: list[AdditionalService] = []
        section_subtotals: list[SectionSubtotal] = []
        tax: EstimateTax | None = None
        parse_warnings: list[str] = []
        current_section = SectionType.REQUIRED
        in_additional_services = False

        item_idx = col_map.get("Item", 0)
        desc_idx = col_map.get("Description", 1)
        qty_idx = col_map.get("Qty", 3)
        cost_idx = col_map.get("Cost", -2)
        total_idx = col_map.get("Total", -1)
        parsed_row_indices: set[int] = set()

        for row_idx, row in enumerate(all_rows):
            item_cell = _cell(row[item_idx]) if item_idx < len(row) else ""
            desc_cell = _cell(row[desc_idx]) if desc_idx < len(row) else ""
            qty_cell = _cell(row[qty_idx]) if qty_idx < len(row) else ""
            cost_cell = _cell(row[cost_idx]) if cost_idx < len(row) else ""
            total_cell = _cell(row[total_idx]) if total_idx < len(row) else ""

            # Combine item and description for marker detection
            row_text = f"{item_cell} {desc_cell}".strip()

            # Skip completely empty rows
            if not row_text and not qty_cell and not total_cell:
                continue

            # Check for section markers
            marker = _detect_section_marker(row_text)
            if marker:
                marker_type, section, _ = marker
                if marker_type == "subtotal":
                    # Record the subtotal amount
                    subtotal_amount = _parse_money(total_cell)
                    if subtotal_amount is not None and section is not None:
                        section_subtotals.append(
                            SectionSubtotal(section=section, amount=subtotal_amount)
                        )
                    continue
                if marker_type == "phase_start" and section is not None:
                    current_section = section
                    continue
                if marker_type == "additional_services":
                    in_additional_services = True
                    continue

            # Check for Rental Tax
            if "Rental Tax" in row_text:
                tax_amount = _parse_money(total_cell)
                if tax_amount is not None:
                    taxable_sub = sum(li.total for li in line_items if li.taxable)
                    rate = tax_amount / taxable_sub if taxable_sub > 0 else 0.0
                    tax = EstimateTax(
                        taxable_subtotal=taxable_sub,
                        tax_amount=tax_amount,
                        tax_rate=round(rate, 4),
                    )
                continue

            # Check for SWPPP ESTIMATE FOR: block (project info, not a line item)
            if "ESTIMATE FOR:" in row_text.upper():
                continue

            # Check for AS ALTERNATE block (informational, not a line item)
            if "AS ALTERNATE" in row_text.upper():
                continue

            # Try to parse as a priced line item
            qty = _parse_qty(qty_cell)
            unit_cost = _parse_money(cost_cell)
            total = _parse_money(total_cell)
            taxable = _is_taxable(total_cell)

            if qty is None:
                qty = _derive_qty_from_total(total, unit_cost)
            if unit_cost is None and qty is not None and qty != 0 and total is not None:
                unit_cost = round(total / qty, 2)

            # Row has numeric data -> line item
            if total is not None and qty is not None:
                section = SectionType.MISC if in_additional_services else current_section

                line_items.append(
                    EstimateLineItem(
                        item=item_cell or "Misc",
                        description=desc_cell.split("\n")[0] if desc_cell else "",
                        qty=qty,
                        unit=None,
                        unit_cost=unit_cost or 0.0,
                        total=total,
                        taxable=taxable,
                        section=section,
                    )
                )
                parsed_row_indices.add(row_idx)
                continue

            # Row has no numeric data but has item name -> could be additional service or description-only item
            if in_additional_services and item_cell and desc_cell and not qty_cell:
                additional_services.append(
                    AdditionalService(
                        item=item_cell,
                        description=desc_cell.split("\n")[0],
                    )
                )
                continue

            # Skip Permit Filing rows with embedded prices (informational only)
            if item_cell.lower().startswith("permit") and not qty_cell and not total_cell:
                continue

            # Skip empty/informational rows
            # (description-only rows like silt fence alternate, rumble grate notes, etc.)

        grand_total = _extract_grand_total(pages)

        # Invariant + fallback: if totals do not reconcile, rescan remaining rows using relaxed parsing.
        initial_subtotal = sum(li.total for li in line_items)
        if grand_total > 0 and abs(grand_total - initial_subtotal) > 0.01:
            parse_warnings.append(
                f"Grand total mismatch before fallback: grand_total={grand_total:.2f}, subtotal={initial_subtotal:.2f}."
            )

            fallback_added = 0
            for row_idx, row in enumerate(all_rows):
                if row_idx in parsed_row_indices:
                    continue

                item_cell = _cell(row[item_idx]) if item_idx < len(row) else ""
                desc_cell = _cell(row[desc_idx]) if desc_idx < len(row) else ""
                qty_cell = _cell(row[qty_idx]) if qty_idx < len(row) else ""
                cost_cell = _cell(row[cost_idx]) if cost_idx < len(row) else ""
                total_cell = _cell(row[total_idx]) if total_idx < len(row) else ""
                row_text = f"{item_cell} {desc_cell}".strip()

                if not _looks_like_candidate_item(item_cell, row_text):
                    continue

                qty = _parse_qty(qty_cell)
                unit_cost = _parse_money(cost_cell)
                total = _parse_money(total_cell)

                if total is None:
                    total = _parse_money_relaxed(total_cell)
                if unit_cost is None:
                    unit_cost = _parse_money_relaxed(cost_cell)
                if qty is None:
                    qty = _derive_qty_from_total(total, unit_cost)
                if unit_cost is None and qty is not None and qty != 0 and total is not None:
                    unit_cost = round(total / qty, 2)
                if total is None and qty is not None and unit_cost is not None:
                    total = round(qty * unit_cost, 2)

                if total is None or qty is None or unit_cost is None:
                    continue

                line_items.append(
                    EstimateLineItem(
                        item=item_cell or "Misc",
                        description=desc_cell.split("\n")[0] if desc_cell else "",
                        qty=qty,
                        unit=None,
                        unit_cost=unit_cost,
                        total=total,
                        taxable=_is_taxable(total_cell),
                        section=SectionType.REQUIRED,
                    )
                )
                parsed_row_indices.add(row_idx)
                fallback_added += 1

            if fallback_added > 0:
                parse_warnings.append(f"Fallback parser recovered {fallback_added} line item(s).")

        final_subtotal = sum(li.total for li in line_items)
        if grand_total == 0 and final_subtotal > 0:
            parse_warnings.append(
                f"Grand total not found; using subtotal only ({final_subtotal:.2f}) for reconciliation checks."
            )
        elif grand_total > 0 and abs(grand_total - final_subtotal) > 0.01:
            parse_warnings.append(
                f"Unresolved total mismatch: grand_total={grand_total:.2f}, subtotal={final_subtotal:.2f}."
            )

        return Estimate(
            header=header,
            line_items=line_items,
            additional_services=additional_services,
            section_subtotals=section_subtotals,
            tax=tax,
            grand_total=grand_total,
            page_count=len(pages),
            source_file=str(pdf_path),
            parse_warnings=parse_warnings,
        )
