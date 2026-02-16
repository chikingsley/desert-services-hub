"""Integration tests for deterministic source packet pipeline."""

from __future__ import annotations

import csv
from datetime import date
import json
from pathlib import Path
import re
import sys
from typing import Any

import pytest

BASE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BASE_DIR.parents[1]
sys.path.append(str(BASE_DIR))

from app.services.source_packet_runner import SourcePacketRunner  # noqa: E402


PAIRS_JSON = (
    BASE_DIR / "data" / "intake" / "eva-to-jayson" / "source-packets" / "pairs.json"
)
CANONICAL_DOCS_TSV = (
    BASE_DIR
    / "workflows"
    / "eva-jayson-variable-inventory"
    / "artifacts"
    / "CANONICAL_DOCS.tsv"
)
MAX_PACKET_CASES = 20

if not PAIRS_JSON.exists() or not CANONICAL_DOCS_TSV.exists():
    pytest.skip(
        "Source packet fixtures are not available in this workspace",
        allow_module_level=True,
    )

PAIR_CASES = json.loads(PAIRS_JSON.read_text(encoding="utf-8"))[:MAX_PACKET_CASES]
if len(PAIR_CASES) < MAX_PACKET_CASES:
    pytest.skip(
        f"Expected at least {MAX_PACKET_CASES} packet fixtures",
        allow_module_level=True,
    )

CANONICAL_ROWS = {
    row["doc_id"]: row
    for row in csv.DictReader(CANONICAL_DOCS_TSV.open("r", encoding="utf-8"), delimiter="\t")
    if row.get("doc_id")
}


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _digits(value: Any) -> str:
    return "".join(re.findall(r"\d+", _clean(value)))


def _to_mdy(value: Any) -> str:
    raw = _clean(value)
    if not raw:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        year, month, day = raw.split("-")
        return f"{month}/{day}/{year}"
    match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
    if match:
        month, day, year = (int(match.group(i)) for i in (1, 2, 3))
        return f"{month:02d}/{day:02d}/{year:04d}"
    return raw


def _eq(field: str, expected: Any, actual: Any) -> bool:
    if field in {"permit.number_best_effort", "operator.phone"}:
        return _digits(expected) == _digits(actual)
    if field.startswith("dates."):
        return _to_mdy(expected) == _to_mdy(actual)
    return _clean(expected).lower() == _clean(actual).lower()


@pytest.fixture(scope="session")
def runner() -> SourcePacketRunner:
    return SourcePacketRunner(repo_root=REPO_ROOT)


@pytest.mark.parametrize("pair", PAIR_CASES, ids=[p.get("packet_id", "unknown") for p in PAIR_CASES])
def test_source_packet_roundtrip_generates_docx(pair: dict[str, Any], runner: SourcePacketRunner, tmp_path: Path):
    expected = CANONICAL_ROWS.get(pair["doc_id"])
    assert expected is not None, f"Missing canonical row for {pair['doc_id']}"

    inputs = runner.load_inputs(pair)
    result = runner.run(inputs)

    assert _clean(result.payload.project.name)
    assert _clean(result.payload.project.address_line1)
    assert _clean(result.payload.operator.company)
    assert _clean(result.payload.operator.contact_name)
    assert _clean(result.payload.operator.phone)
    assert _digits(result.payload.permit.number_best_effort)

    assert _eq(
        "permit.number_best_effort",
        expected.get("permit.number_best_effort", ""),
        result.payload.permit.number_best_effort,
    )

    narrative = pair.get("narrative", {})
    if isinstance(narrative, dict):
        received_at = str(narrative.get("received_at", "")).strip()
        if len(received_at) >= 10:
            expected_prep_date = date.fromisoformat(received_at[:10])
            assert result.payload.dates.swppp_preparation_date == expected_prep_date

    output_path = tmp_path / f"{pair['packet_id']}.docx"
    generated = runner.generate_document(result.swppp, output_path)
    assert generated.exists()
    assert generated.stat().st_size > 0


def test_source_packet_quality_thresholds(runner: SourcePacketRunner):
    field_keys = [
        "project.name",
        "project.address_line1",
        "operator.company",
        "operator.contact_name",
        "operator.phone",
        "dates.project_start",
        "dates.project_completion",
    ]
    match_counts = {field: 0 for field in field_keys}

    for pair in PAIR_CASES:
        expected = CANONICAL_ROWS[pair["doc_id"]]
        result = runner.run(runner.load_inputs(pair))
        actual_by_field = {
            "project.name": result.payload.project.name,
            "project.address_line1": result.payload.project.address_line1,
            "operator.company": result.payload.operator.company,
            "operator.contact_name": result.payload.operator.contact_name,
            "operator.phone": result.payload.operator.phone,
            "dates.project_start": result.payload.dates.project_start,
            "dates.project_completion": result.payload.dates.project_completion,
        }
        for field in field_keys:
            if _eq(field, expected.get(field, ""), actual_by_field[field]):
                match_counts[field] += 1

    total = len(PAIR_CASES)
    assert match_counts["project.name"] / total >= 0.70
    assert match_counts["project.address_line1"] / total >= 0.35
    assert match_counts["operator.company"] / total >= 0.85
    assert match_counts["operator.contact_name"] / total >= 0.80
    assert match_counts["operator.phone"] / total >= 0.75
    assert match_counts["dates.project_start"] / total >= 0.85
    assert match_counts["dates.project_completion"] / total >= 0.85
