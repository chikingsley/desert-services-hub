from pdf_analysis.utils import extract_json_from_text, parse_page_spec


def test_parse_page_spec_mixed_ranges() -> None:
    assert parse_page_spec("1,3,5-7") == [1, 3, 5, 6, 7]


def test_extract_json_from_text_from_fenced_block() -> None:
    text = """
Here is the result:
```json
{"a": 1, "b": "x"}
```
"""
    assert extract_json_from_text(text) == {"a": 1, "b": "x"}
