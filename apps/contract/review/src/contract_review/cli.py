"""CLI for contract review scanning and ground-truth reporting."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from contract_review.document_map import build_document_map
from contract_review.policies import default_policy_catalog
from contract_review.scanner import ScanResult, scan, scan_non_included_scope_mentions
from contract_review.workflow import ContractReviewWorkflow


def _merge_results(*results: ScanResult) -> ScanResult:
    merged = ScanResult()
    for result in results:
        merged.flags.extend(result.flags)
    merged.flags.sort(key=lambda f: f.offset)
    return merged


def _render_report_payload(result: ScanResult) -> dict[str, Any]:
    def row(flag: Any) -> dict[str, Any]:
        item = asdict(flag)
        return {
            "rule_id": item["rule_id"],
            "keyword": item["keyword"],
            "explanation": item["explanation"],
            "evidence": item["context"],
            "offset": item["offset"],
            "details": item["details"],
        }

    return {
        "counts": {
            "blockers": len(result.blockers),
            "warnings": len(result.warnings),
            "info": len(result.infos),
            "total": len(result.flags),
        },
        "blockers": [row(f) for f in result.blockers],
        "warnings": [row(f) for f in result.warnings],
        "info_extracted": [row(f) for f in result.infos],
    }


def _load_estimate_items(expected_json_path: Path) -> list[dict[str, object]]:
    if not expected_json_path.exists():
        return []
    payload = json.loads(expected_json_path.read_text())
    estimate = payload.get("estimate")
    if not isinstance(estimate, dict):
        return []
    items = estimate.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _scan_file(file_path: Path, estimate_items: list[dict[str, object]]) -> dict[str, Any]:
    text = file_path.read_text()
    base = scan(text)
    scope = scan_non_included_scope_mentions(
        contract_text=text,
        estimate_items=estimate_items,
    )
    merged = _merge_results(base, scope)
    return _render_report_payload(merged)


def _cmd_scan(args: argparse.Namespace) -> int:
    file_path = Path(args.file)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    estimate_items: list[dict[str, object]] = []
    if args.estimate_json:
        estimate_items = _load_estimate_items(Path(args.estimate_json))

    payload = _scan_file(file_path, estimate_items)
    print(json.dumps(payload, indent=2))
    return 0


def _emit_json(payload: dict[str, Any], output_path: str | None) -> None:
    rendered = json.dumps(payload, indent=2)
    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rendered + "\n")
        print(f"Wrote {out}")
        return
    print(rendered)


def _cmd_map(args: argparse.Namespace) -> int:
    file_path = Path(args.file)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    text = file_path.read_text()
    doc_map = build_document_map(
        text,
        source_name=args.source_name or file_path.name,
        max_chunk_chars=args.max_chunk_chars,
        overlap_paragraphs=args.overlap_paragraphs,
    )
    _emit_json(doc_map.model_dump(), args.out)
    return 0


def _cmd_review(args: argparse.Namespace) -> int:
    file_path = Path(args.file)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    policy_catalog = default_policy_catalog()
    if args.policy:
        requested = set(args.policy)
        selected = [policy for policy in policy_catalog if policy.rule_id in requested]
        found = {policy.rule_id for policy in selected}
        missing = sorted(requested - found)
        if missing:
            raise ValueError(f"Unknown policy id(s): {', '.join(missing)}")
    else:
        selected = policy_catalog

    text = file_path.read_text()
    workflow = ContractReviewWorkflow()
    result = workflow.run(
        source_text=text,
        source_name=args.source_name or file_path.name,
        policies=selected,
        max_chunk_chars=args.max_chunk_chars,
        overlap_paragraphs=args.overlap_paragraphs,
        top_k_per_query=args.top_k_per_query,
    )
    _emit_json(result.model_dump(), args.out)
    return 0


def _cmd_policies(_args: argparse.Namespace) -> int:
    payload = {"policies": [policy.model_dump() for policy in default_policy_catalog()]}
    _emit_json(payload, None)
    return 0


def _fixture_dirs(fixtures_dir: Path) -> list[Path]:
    return sorted(
        p
        for p in fixtures_dir.iterdir()
        if p.is_dir() and (p / "reconciled.md").exists()
    )


def _format_fixture_markdown(name: str, payload: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    counts = payload["counts"]
    lines.append(f"## {name}")
    lines.append("")
    lines.append(
        f"- Blockers: **{counts['blockers']}** | Warnings: **{counts['warnings']}** | Info: **{counts['info']}**"
    )
    lines.append("")

    blockers = payload["blockers"][:8]
    warnings = payload["warnings"][:8]

    if blockers:
        lines.append("### Blockers")
        lines.append("")
        for flag in blockers:
            lines.append(
                f"- `{flag['rule_id']}` `{flag['keyword']}`: {flag['explanation']}"
            )
    else:
        lines.append("### Blockers")
        lines.append("")
        lines.append("- None")
    lines.append("")

    if warnings:
        lines.append("### Warnings")
        lines.append("")
        for flag in warnings:
            lines.append(
                f"- `{flag['rule_id']}` `{flag['keyword']}`: {flag['explanation']}"
            )
    else:
        lines.append("### Warnings")
        lines.append("")
        lines.append("- None")
    lines.append("")

    return lines


def _cmd_fixtures(args: argparse.Namespace) -> int:
    fixtures_dir = Path(args.fixtures_dir)
    if not fixtures_dir.exists():
        raise FileNotFoundError(f"Fixtures directory not found: {fixtures_dir}")

    rows: list[str] = [
        "# Contract Validation Report",
        "",
        f"Fixtures root: `{fixtures_dir}`",
        "",
        "Policy: fail-closed (uncertain => flag).",
        "",
    ]

    for fixture in _fixture_dirs(fixtures_dir):
        reconciled = fixture / "reconciled.md"
        expected = fixture / "expected.json"
        estimate_items = _load_estimate_items(expected)
        payload = _scan_file(reconciled, estimate_items)
        rows.extend(_format_fixture_markdown(fixture.name, payload))

    output = "\n".join(rows).strip() + "\n"

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output)
        print(f"Wrote {out_path}")
    else:
        print(output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="contract-review")
    sub = parser.add_subparsers(dest="command", required=True)

    map_parser = sub.add_parser(
        "map",
        help="Build deterministic section/chunk map from reconciled markdown",
    )
    map_parser.add_argument("--file", required=True, help="Path to reconciled markdown")
    map_parser.add_argument("--source-name", required=False, help="Override source name")
    map_parser.add_argument(
        "--max-chars",
        dest="max_chunk_chars",
        type=int,
        default=1800,
        help="Max chunk size in characters (default: 1800)",
    )
    map_parser.add_argument(
        "--overlap-paragraphs",
        type=int,
        default=1,
        help="Paragraph overlap between adjacent chunks (default: 1)",
    )
    map_parser.add_argument("--out", required=False, help="Optional output JSON file")
    map_parser.set_defaults(func=_cmd_map)

    review_parser = sub.add_parser(
        "review",
        help="Run LangGraph retrieval coverage workflow (document map + policy candidates)",
    )
    review_parser.add_argument("--file", required=True, help="Path to reconciled markdown")
    review_parser.add_argument("--source-name", required=False, help="Override source name")
    review_parser.add_argument(
        "--max-chars",
        dest="max_chunk_chars",
        type=int,
        default=1800,
        help="Max chunk size in characters (default: 1800)",
    )
    review_parser.add_argument(
        "--overlap-paragraphs",
        type=int,
        default=1,
        help="Paragraph overlap between adjacent chunks (default: 1)",
    )
    review_parser.add_argument(
        "--top-k-per-query",
        type=int,
        default=6,
        help="Max candidates retained per policy query (default: 6)",
    )
    review_parser.add_argument(
        "--policy",
        action="append",
        help="Policy rule_id to run (repeatable). If omitted, all default policies run.",
    )
    review_parser.add_argument("--out", required=False, help="Optional output JSON file")
    review_parser.set_defaults(func=_cmd_review)

    policy_parser = sub.add_parser("policies", help="List default policy catalog")
    policy_parser.set_defaults(func=_cmd_policies)

    scan_parser = sub.add_parser("scan", help="Scan one reconciled contract markdown file")
    scan_parser.add_argument("--file", required=True, help="Path to reconciled markdown")
    scan_parser.add_argument(
        "--estimate-json",
        required=False,
        help="Optional expected.json containing estimate.items for scope checks",
    )
    scan_parser.set_defaults(func=_cmd_scan)

    fixtures_parser = sub.add_parser(
        "fixtures",
        help="Scan all fixture folders containing reconciled.md",
    )
    fixtures_parser.add_argument(
        "--fixtures-dir",
        required=True,
        help="Path to fixtures root directory",
    )
    fixtures_parser.add_argument(
        "--out",
        required=False,
        help="Optional output markdown path",
    )
    fixtures_parser.set_defaults(func=_cmd_fixtures)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
