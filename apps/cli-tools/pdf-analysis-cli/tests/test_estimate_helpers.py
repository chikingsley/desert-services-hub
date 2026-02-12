from pdf_analysis.estimates import _decode_cid_glyphs, _parse_money, _parse_qty


def test_decode_cid_glyphs_digits() -> None:
    assert _decode_cid_glyphs("(cid:55)(cid:55)0.00") == "770.00"


def test_parse_money_with_cid_digits() -> None:
    assert _parse_money("(cid:55)(cid:55)0.00") == 770.00


def test_parse_qty_with_cid_digits() -> None:
    assert _parse_qty("(cid:55)3") == 73.0
