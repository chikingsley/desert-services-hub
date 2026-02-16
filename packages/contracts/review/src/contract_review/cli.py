"""CLI for contract review scanning and ground-truth reporting."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from contract_review.document_map import build_document_map
from contract_review.evals import LabelsFile, build_labels_template
from contract_review.policies import default_policy_catalog
from contract_review.scanner import ScanResult, scan, scan_non_included_scope_mentions
from contract_review.workflow import ContractReviewWorkflow


def _find_pdf_analysis_cwd(start: Path | None = None) -> Path:
    cursor = (start or Path(__file__).resolve()).resolve()
    for base in [cursor, *cursor.parents]:
        candidate = base / "packages" / "documents" / "pdf-analysis-cli"
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Could not locate packages/documents/pdf-analysis-cli")


def _extract_pdf_text(pdf_path: Path) -> str:
    resolved_pdf = pdf_path.resolve()
    if not resolved_pdf.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pdf_analysis_cwd = _find_pdf_analysis_cwd()
    with tempfile.NamedTemporaryFile(prefix="contract-review-", suffix=".txt", delete=False) as tmp:
        out_path = Path(tmp.name)

    cmd = [
        "uv",
        "run",
        "pdf-analysis",
        "text",
        str(resolved_pdf),
        "--format",
        "text",
        "--output",
        str(out_path),
    ]
    proc = subprocess.run(
        cmd,
        cwd=pdf_analysis_cwd,
        check=False,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        msg = (
            f"Failed to extract PDF text from {pdf_path} via pdf-analysis. "
            f"exit={proc.returncode} stderr={proc.stderr.strip()[:500]}"
        )
        raise RuntimeError(msg)
    return out_path.read_text()


def _score_pdf_candidate(path: Path) -> int:
    name = path.name.lower()
    score = 0
    if "contract" in name:
        score += 10
    if "subcontract" in name:
        score += 7
    if "signed" in name:
        score += 3
    if "docusign" in name:
        score -= 1
    if "estimate" in name or "sov" in name:
        score -= 10
    if "insurance" in name or "permit" in name or "noi" in name:
        score -= 8
    return score


def _find_fixture_pdf(fixture_dir: Path) -> Path | None:
    def ranked(paths: list[Path]) -> list[Path]:
        return sorted(paths, key=lambda p: (-_score_pdf_candidate(p), p.name))

    local_pdfs = [p for p in fixture_dir.glob("*.pdf") if p.is_file()]
    local_ranked = [p for p in ranked(local_pdfs) if _score_pdf_candidate(p) > 0]
    if local_ranked:
        return local_ranked[0]

    # test-fixtures/<name> -> ground-truth/<name>
    mirror_dir = fixture_dir.parents[1] / fixture_dir.name
    if mirror_dir.exists():
        mirror_pdfs = [p for p in mirror_dir.glob("*.pdf") if p.is_file()]
        mirror_ranked = [p for p in ranked(mirror_pdfs) if _score_pdf_candidate(p) > 0]
        if mirror_ranked:
            return mirror_ranked[0]
    return None


def _load_fixture_source_text(
    fixture_dir: Path,
    *,
    page_aware: bool,
) -> tuple[str, str]:
    if page_aware:
        pdf_source = _find_fixture_pdf(fixture_dir)
        if pdf_source:
            return _extract_pdf_text(pdf_source), str(pdf_source)

    reconciled = fixture_dir / "reconciled.md"
    return reconciled.read_text(), str(reconciled)


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

    source_mode = "markdown"
    source_path = file_path

    if args.source_pdf:
        source_mode = "pdf"
        source_path = Path(args.source_pdf)
        text = _extract_pdf_text(source_path)
    elif file_path.suffix.lower() == ".pdf":
        source_mode = "pdf"
        text = _extract_pdf_text(file_path)
    else:
        text = file_path.read_text()

    workflow = ContractReviewWorkflow()
    result = workflow.run(
        source_text=text,
        source_name=args.source_name or source_path.name,
        policies=selected,
        max_chunk_chars=args.max_chunk_chars,
        overlap_paragraphs=args.overlap_paragraphs,
        top_k_per_query=args.top_k_per_query,
    )
    payload = result.model_dump()
    payload["source"] = {
        "mode": source_mode,
        "path": str(source_path),
    }
    if args.include_scan:
        payload["deterministic_scan"] = _render_report_payload(scan(text))
    _emit_json(payload, args.out)
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
    source = payload.get("source")
    lines.append(f"## {name}")
    lines.append("")
    if source:
        lines.append(f"- Source: `{source}`")
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
        expected = fixture / "expected.json"
        estimate_items = _load_estimate_items(expected)
        text, source_note = _load_fixture_source_text(fixture, page_aware=args.page_aware)
        base = scan(text)
        scope = scan_non_included_scope_mentions(
            contract_text=text,
            estimate_items=estimate_items,
        )
        merged = _merge_results(base, scope)
        payload = _render_report_payload(merged)
        payload["source"] = source_note
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


def _cmd_labels_template(args: argparse.Namespace) -> int:
    fixtures_dir = Path(args.fixtures_dir)
    if not fixtures_dir.exists():
        raise FileNotFoundError(f"Fixtures directory not found: {fixtures_dir}")

    fixture_names = [fixture.name for fixture in _fixture_dirs(fixtures_dir)]
    labels = build_labels_template(fixture_names, default_policy_catalog())
    _emit_json(labels.model_dump(), args.out)
    return 0


def _cmd_eval(args: argparse.Namespace) -> int:
    fixtures_dir = Path(args.fixtures_dir)
    labels_path = Path(args.labels)
    if not fixtures_dir.exists():
        raise FileNotFoundError(f"Fixtures directory not found: {fixtures_dir}")
    if not labels_path.exists():
        raise FileNotFoundError(f"Labels file not found: {labels_path}")

    labels = LabelsFile.model_validate(json.loads(labels_path.read_text()))
    labels_by_fixture = {item.fixture: item for item in labels.fixtures}
    policy_catalog = default_policy_catalog()
    workflow = ContractReviewWorkflow()

    fixture_rows: list[dict[str, Any]] = []
    totals = {
        "expected_present": 0,
        "found_present": 0,
        "expected_missing": 0,
        "correctly_missing": 0,
        "unknown": 0,
    }

    for fixture in _fixture_dirs(fixtures_dir):
        label_set = labels_by_fixture.get(fixture.name)
        if label_set is None:
            continue

        text, source_note = _load_fixture_source_text(fixture, page_aware=args.page_aware)
        result = workflow.run(
            source_text=text,
            source_name=fixture.name,
            policies=policy_catalog,
            top_k_per_query=args.top_k_per_query,
        )
        finding_by_rule = {finding.rule_id: finding for finding in result.findings}

        expected_present = 0
        found_present = 0
        expected_missing = 0
        correctly_missing = 0
        unknown = 0
        misses: list[str] = []
        false_positives: list[str] = []

        for rule in policy_catalog:
            expected = label_set.rules.get(rule.rule_id, "unknown")
            finding = finding_by_rule.get(rule.rule_id)
            observed_present = bool(
                finding
                and finding.status == "needs_judgement"
                and len(finding.evidence) > 0
            )

            if expected == "present":
                expected_present += 1
                if observed_present:
                    found_present += 1
                else:
                    misses.append(rule.rule_id)
            elif expected == "missing":
                expected_missing += 1
                if not observed_present:
                    correctly_missing += 1
                else:
                    false_positives.append(rule.rule_id)
            else:
                unknown += 1

        totals["expected_present"] += expected_present
        totals["found_present"] += found_present
        totals["expected_missing"] += expected_missing
        totals["correctly_missing"] += correctly_missing
        totals["unknown"] += unknown

        present_recall = 1.0 if expected_present == 0 else (found_present / expected_present)
        missing_recall = (
            1.0 if expected_missing == 0 else (correctly_missing / expected_missing)
        )
        fixture_rows.append(
            {
                "fixture": fixture.name,
                "source": source_note,
                "expected_present": expected_present,
                "found_present": found_present,
                "present_recall": round(present_recall, 4),
                "expected_missing": expected_missing,
                "correctly_missing": correctly_missing,
                "missing_recall": round(missing_recall, 4),
                "unknown": unknown,
                "misses": misses,
                "false_positives": false_positives,
            }
        )

    global_present_recall = (
        1.0
        if totals["expected_present"] == 0
        else totals["found_present"] / totals["expected_present"]
    )
    global_missing_recall = (
        1.0
        if totals["expected_missing"] == 0
        else totals["correctly_missing"] / totals["expected_missing"]
    )

    payload = {
        "labels_version": labels.version,
        "fixtures_evaluated": len(fixture_rows),
        "totals": {
            **totals,
            "present_recall": round(global_present_recall, 4),
            "missing_recall": round(global_missing_recall, 4),
        },
        "fixtures": fixture_rows,
    }
    _emit_json(payload, args.out)
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
    review_parser.add_argument(
        "--source-pdf",
        required=False,
        help="Optional source contract PDF path. If set, review runs on page-aware PDF text.",
    )
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
    review_parser.add_argument(
        "--no-scan",
        dest="include_scan",
        action="store_false",
        help="Disable deterministic scanner payload in review output.",
    )
    review_parser.set_defaults(include_scan=True)
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
        "--no-page-aware",
        dest="page_aware",
        action="store_false",
        help="Disable PDF-backed page-aware fixture scanning.",
    )
    fixtures_parser.set_defaults(page_aware=True)
    fixtures_parser.add_argument(
        "--out",
        required=False,
        help="Optional output markdown path",
    )
    fixtures_parser.set_defaults(func=_cmd_fixtures)

    labels_template_parser = sub.add_parser(
        "labels-template",
        help="Generate policy labels template for eval calibration",
    )
    labels_template_parser.add_argument(
        "--fixtures-dir",
        required=True,
        help="Path to fixtures root directory",
    )
    labels_template_parser.add_argument(
        "--out",
        required=False,
        help="Optional output JSON path",
    )
    labels_template_parser.set_defaults(func=_cmd_labels_template)

    eval_parser = sub.add_parser(
        "eval",
        help="Evaluate policy recall against labels file",
    )
    eval_parser.add_argument(
        "--fixtures-dir",
        required=True,
        help="Path to fixtures root directory",
    )
    eval_parser.add_argument(
        "--labels",
        required=True,
        help="Path to labels JSON (from labels-template, manually filled)",
    )
    eval_parser.add_argument(
        "--top-k-per-query",
        type=int,
        default=30,
        help="Top-k candidates per query during evaluation (default: 30)",
    )
    eval_parser.add_argument(
        "--no-page-aware",
        dest="page_aware",
        action="store_false",
        help="Disable PDF-backed page-aware fixture evaluation.",
    )
    eval_parser.set_defaults(page_aware=True)
    eval_parser.add_argument(
        "--out",
        required=False,
        help="Optional output JSON path",
    )
    eval_parser.set_defaults(func=_cmd_eval)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
