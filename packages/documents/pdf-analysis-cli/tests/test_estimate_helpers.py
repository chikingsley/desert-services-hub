from pdf_analysis.estimates import _decode_cid_glyphs, _parse_money, _parse_qty


def test_decode_cid_glyphs_digits() -> None:
    assert _decode_cid_glyphs("(cid:55)(cid:55)0.00") == "770.00"


def test_parse_money_with_cid_digits() -> None:
    assert _parse_money("(cid:55)(cid:55)0.00") == 770.00


def test_parse_qty_with_cid_digits() -> None:
    assert _parse_qty("(cid:55)3") == 73.0


from pdf_analysis.estimates import _extract_header


class _FakePage:
    def __init__(self, tables: list[list[list[str | None]]]) -> None:
        self._tables = tables

    def extract_tables(self) -> list[list[list[str | None]]]:
        return self._tables


def test_extract_header_sales_rep_alias() -> None:
    tables = [
        [["Date", "Estimate #"], ["12/15/2023", "12152304"]],
        [
            ["", "", "", "", "", "", "Sales Rep", ""],
            ["", "", "", "", "", "", "Jeff Gardner", ""],
        ],
        [["To:"], ["Rohm Building & Development\nPhoenix, AZ"]],
    ]

    header = _extract_header([_FakePage(tables)])

    assert header.date == "12/15/2023"
    assert header.estimate_number == "12152304"
    assert header.estimator == "Jeff Gardner"
    assert header.gc_name == "Rohm Building & Development"
