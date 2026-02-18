from pdf_analysis.analysis.estimates import _decode_cid_glyphs, _parse_money, _parse_qty


def test_decode_cid_glyphs_digits() -> None:
    assert _decode_cid_glyphs("(cid:55)(cid:55)0.00") == "770.00"


def test_parse_money_with_cid_digits() -> None:
    assert _parse_money("(cid:55)(cid:55)0.00") == 770.00


def test_parse_qty_with_cid_digits() -> None:
    assert _parse_qty("(cid:55)3") == 73.0


from pdf_analysis.analysis.estimates import _extract_header


class _FakeTable:
    """Mimics kreuzberg's ExtractedTable with a .cells attribute."""

    def __init__(self, cells: list[list[str | None]]) -> None:
        self.cells = cells
        self.page_number = 1


def test_extract_header_sales_rep_alias() -> None:
    tables = [
        _FakeTable([["Date", "Estimate #"], ["12/15/2023", "12152304"]]),
        _FakeTable([
            ["", "", "", "", "", "", "Sales Rep", ""],
            ["", "", "", "", "", "", "Jeff Gardner", ""],
        ]),
        _FakeTable([["To:"], ["Rohm Building & Development\nPhoenix, AZ"]]),
    ]

    header = _extract_header(tables)

    assert header.date == "12/15/2023"
    assert header.estimate_number == "12152304"
    assert header.estimator == "Jeff Gardner"
    assert header.gc_name == "Rohm Building & Development"
