"""Build canonical payload JSON from extracted source JSON files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Optional

# Add project root to import app modules when running as script.
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.services.canonical_builder import CanonicalPayloadBuilder  # noqa: E402


def _load_json(path: Optional[str]) -> Optional[dict[str, Any]]:
    if not path:
        return None
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"JSON file not found: {file_path}")
    with file_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object in {file_path}")
    return data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build canonical payload from estimate/storm-plan/NOI extraction JSON.",
    )
    parser.add_argument("--estimate-json", help="Path to EstimateExtraction JSON")
    parser.add_argument("--storm-plan-json", help="Path to StormPlanExtraction JSON")
    parser.add_argument("--noi-json", help="Path to NOIExtraction JSON")
    parser.add_argument("--output", "-o", help="Output path for canonical payload JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    estimate = _load_json(args.estimate_json)
    storm_plan = _load_json(args.storm_plan_json)
    noi = _load_json(args.noi_json)

    if estimate is None and storm_plan is None and noi is None:
        raise ValueError(
            "Provide at least one source JSON: --estimate-json, --storm-plan-json, or --noi-json"
        )

    builder = CanonicalPayloadBuilder()
    payload = builder.build(estimate=estimate, storm_plan=storm_plan, noi=noi)
    out_text = payload.model_dump_json(indent=2)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out_text + "\n", encoding="utf-8")
        print(str(out_path))
        return

    print(out_text)


if __name__ == "__main__":
    main()

