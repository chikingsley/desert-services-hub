"""Validate deterministic source-packet -> canonical payload mapping."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import re
import sys
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(BASE_DIR))

from app.services.source_packet_runner import SourcePacketRunner  # noqa: E402


DEFAULT_PAIRS_JSON = (
    BASE_DIR / "data" / "intake" / "eva-to-jayson" / "source-packets" / "pairs.json"
)
DEFAULT_CANONICAL_DOCS = (
    BASE_DIR
    / "workflows"
    / "eva-jayson-variable-inventory"
    / "artifacts"
    / "CANONICAL_DOCS.tsv"
)
DEFAULT_OUTPUT_DIR = BASE_DIR / "data" / "intake" / "eva-to-jayson" / "source-packets"

KEY8_FIELD_KEYS = [
    "project.name",
    "project.address_line1",
    "permit.number_best_effort",
    "operator.company",
    "operator.contact_name",
    "operator.phone",
    "dates.project_start",
    "dates.project_completion",
]

ALL_FIELD_KEYS = [
    "project.name",
    "project.address_line1",
    "project.city_state_zip",
    "project.city",
    "project.state",
    "project.zip",
    "project.county",
    "permit.azpdes_number",
    "permit.azcon_number",
    "permit.number_best_effort",
    "dates.swppp_preparation_date",
    "dates.project_start",
    "dates.project_completion",
    "operator.company",
    "operator.contact_name",
    "operator.phone",
    "operator.email",
    "operator.address_line1",
    "operator.city_state_zip",
    "swppp_contact.name",
    "swppp_contact.phone",
    "emergency.contact_name",
    "emergency.phone",
    "site.total_project_area_acres",
    "site.total_project_area_acres_number",
    "site.disturbed_area_acres",
    "site.disturbed_area_acres_number",
    "site.soil_types",
    "site.slopes",
    "site.receiving_waters",
    "site.storm_sewer_systems",
    "bmp.ec7.responsible_staff",
    "bmp.ec7.installation_schedule",
    "bmp.ec7.maintenance",
]


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _digits(value: Any) -> str:
    return "".join(re.findall(r"\d+", _clean(value)))


def _to_float(value: Any) -> float | None:
    raw = _clean(value)
    if not raw:
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)", raw.replace(",", ""))
        return float(match.group(1)) if match else None


def _to_mdy(value: Any) -> str:
    raw = _clean(value)
    if not raw:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        year, month, day = raw.split("-")
        return f"{month}/{day}/{year}"
    mdy = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
    if mdy:
        month, day, year = (int(mdy.group(i)) for i in (1, 2, 3))
        return f"{month:02d}/{day:02d}/{year:04d}"
    return raw


def _fields_equal(field: str, expected: Any, actual: Any) -> bool:
    if field == "permit.number_best_effort":
        return _digits(expected) == _digits(actual)
    if field in ("operator.phone", "swppp_contact.phone", "emergency.phone"):
        return _digits(expected) == _digits(actual)
    if field.startswith("site.") and field.endswith("_number"):
        expected_number = _to_float(expected)
        actual_number = _to_float(actual)
        if expected_number is None and actual_number is None:
            return True
        if expected_number is None or actual_number is None:
            return False
        return abs(expected_number - actual_number) < 1e-6
    if field.startswith("dates."):
        return _to_mdy(expected) == _to_mdy(actual)
    return _clean(expected).lower() == _clean(actual).lower()


def _payload_values(payload: Any) -> dict[str, Any]:
    return {
        "project.name": payload.project.name,
        "project.address_line1": payload.project.address_line1,
        "project.city_state_zip": payload.project.city_state_zip,
        "project.city": payload.project.city,
        "project.state": payload.project.state,
        "project.zip": payload.project.zip,
        "project.county": payload.project.county,
        "permit.azpdes_number": payload.permit.azpdes_number,
        "permit.azcon_number": payload.permit.azcon_number,
        "permit.number_best_effort": payload.permit.number_best_effort,
        "dates.swppp_preparation_date": payload.dates.swppp_preparation_date,
        "operator.company": payload.operator.company,
        "operator.contact_name": payload.operator.contact_name,
        "operator.phone": payload.operator.phone,
        "operator.email": payload.operator.email,
        "operator.address_line1": payload.operator.address_line1,
        "operator.city_state_zip": payload.operator.city_state_zip,
        "swppp_contact.name": payload.swppp_contact.name,
        "swppp_contact.phone": payload.swppp_contact.phone,
        "emergency.contact_name": payload.emergency.contact_name,
        "emergency.phone": payload.emergency.phone,
        "site.total_project_area_acres": payload.site.total_project_area_acres,
        "site.total_project_area_acres_number": payload.site.total_project_area_acres_number,
        "site.disturbed_area_acres": payload.site.disturbed_area_acres,
        "site.disturbed_area_acres_number": payload.site.disturbed_area_acres_number,
        "site.soil_types": payload.site.soil_types,
        "site.slopes": payload.site.slopes,
        "site.receiving_waters": payload.site.receiving_waters,
        "site.storm_sewer_systems": payload.site.storm_sewer_systems,
        "bmp.ec7.responsible_staff": payload.bmp.ec7.responsible_staff,
        "bmp.ec7.installation_schedule": payload.bmp.ec7.installation_schedule,
        "bmp.ec7.maintenance": payload.bmp.ec7.maintenance,
        "dates.project_start": payload.dates.project_start,
        "dates.project_completion": payload.dates.project_completion,
    }


def _load_canonical_rows(tsv_path: Path) -> dict[str, dict[str, str]]:
    with tsv_path.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    return {row["doc_id"]: row for row in rows if row.get("doc_id")}


def _load_pairs(pairs_json: Path, limit: int) -> list[dict[str, Any]]:
    pairs = json.loads(pairs_json.read_text(encoding="utf-8"))
    if not isinstance(pairs, list):
        raise ValueError(f"Expected array in {pairs_json}")
    if limit > 0:
        return pairs[:limit]
    return pairs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate deterministic source packet mapping against canonical docs."
    )
    parser.add_argument("--pairs-json", default=str(DEFAULT_PAIRS_JSON))
    parser.add_argument("--canonical-docs", default=str(DEFAULT_CANONICAL_DOCS))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--limit", type=int, default=0, help="0 = all pairs in pairs.json")
    parser.add_argument(
        "--field-scope",
        choices=("key8", "all"),
        default="all",
        help="Which field set to evaluate. 'all' enforces the full canonical contract.",
    )
    parser.add_argument(
        "--hard-block",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Fail with non-zero exit if any evaluated field mismatches.",
    )
    parser.add_argument(
        "--generate-docx",
        action="store_true",
        help="Generate a document for each packet under output-dir/generated/",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = BASE_DIR.parents[1]
    runner = SourcePacketRunner(repo_root=repo_root)

    pairs = _load_pairs(Path(args.pairs_json), args.limit)
    canonical_rows = _load_canonical_rows(Path(args.canonical_docs))
    field_keys = ALL_FIELD_KEYS if args.field_scope == "all" else KEY8_FIELD_KEYS

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_dir = output_dir / "generated"
    if args.generate_docx:
        generated_dir.mkdir(parents=True, exist_ok=True)

    details: list[dict[str, Any]] = []
    csv_lines: list[list[str]] = [
        ["packet_id", "doc_id", "field", "match", "expected", "actual"]
    ]
    field_stats: dict[str, dict[str, int]] = {
        field: {"matches": 0, "total": 0} for field in field_keys
    }
    packet_errors: list[str] = []
    permit_mismatch_packets: list[str] = []
    total_field_mismatches = 0

    for pair in pairs:
        packet_id = str(pair.get("packet_id", "")).strip()
        doc_id = str(pair.get("doc_id", "")).strip()
        if not packet_id or not doc_id:
            packet_errors.append("<unknown>: missing packet_id/doc_id")
            continue

        canonical = canonical_rows.get(doc_id)
        if canonical is None:
            packet_errors.append(f"{packet_id}: missing canonical row for {doc_id}")
            continue

        try:
            inputs = runner.load_inputs(pair)
            result = runner.run(inputs)
            if args.generate_docx:
                out_path = generated_dir / f"{packet_id}.docx"
                runner.generate_document(result.swppp, out_path)
        except Exception as exc:  # pragma: no cover - integration guard
            packet_errors.append(f"{packet_id}: {exc}")
            continue

        observed = _payload_values(result.payload)
        packet_summary: dict[str, Any] = {
            "packet_id": packet_id,
            "doc_id": doc_id,
            "matches": {},
        }

        for field in field_keys:
            expected = canonical.get(field, "")
            actual = observed.get(field, "")
            ok = _fields_equal(field, expected, actual)
            field_stats[field]["total"] += 1
            if ok:
                field_stats[field]["matches"] += 1
            else:
                total_field_mismatches += 1
            if field == "permit.number_best_effort" and not ok:
                permit_mismatch_packets.append(packet_id)
            packet_summary["matches"][field] = ok
            csv_lines.append(
                [packet_id, doc_id, field, "1" if ok else "0", _clean(expected), _clean(actual)]
            )

        details.append(packet_summary)

    details_path = output_dir / "deterministic_validation.json"
    details_path.write_text(json.dumps(details, indent=2) + "\n", encoding="utf-8")

    csv_path = output_dir / "deterministic_alignment.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(csv_lines)

    md_lines = [
        "# Deterministic Source Packet Validation",
        "",
        f"- Packets requested: {len(pairs)}",
        f"- Packets completed: {len(details)}",
        f"- Field scope: {args.field_scope}",
        f"- Field mismatches: {total_field_mismatches}",
        f"- Hard block enabled: {bool(args.hard_block)}",
        f"- Packet errors: {len(packet_errors)}",
        f"- Permit mismatches: {len(permit_mismatch_packets)}",
        "",
        "## Field Match Rates",
        "",
        "| Field | Matches | Total | Rate |",
        "| --- | ---: | ---: | ---: |",
    ]
    for field in field_keys:
        stat = field_stats[field]
        total = stat["total"]
        matches = stat["matches"]
        rate = (100.0 * matches / total) if total else 0.0
        md_lines.append(f"| {field} | {matches} | {total} | {rate:.1f}% |")

    if packet_errors:
        md_lines.extend(["", "## Packet Errors", ""])
        for error in packet_errors:
            md_lines.append(f"- {error}")

    md_path = output_dir / "deterministic_alignment.md"
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(f"Wrote {details_path}")
    print(f"Wrote {csv_path}")
    print(f"Wrote {md_path}")

    if args.hard_block and total_field_mismatches > 0:
        return 1
    if packet_errors:
        return 1
    if permit_mismatch_packets:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
