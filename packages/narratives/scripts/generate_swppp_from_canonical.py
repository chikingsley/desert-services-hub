"""Generate SWPPP document from deterministic canonical JSON payload."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path for local script execution.
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.models.canonical_swppp import CanonicalSWPPPPayload  # noqa: E402
from app.services.canonical_mapper import CanonicalSWPPPMapper  # noqa: E402
from app.services.document_generator import DocumentGenerator  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate SWPPP document from canonical JSON payload."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to canonical payload JSON file.",
    )
    parser.add_argument(
        "--output",
        help="Optional output .docx path. Default: templates/output/SWPPP_<project>_<timestamp>.docx",
    )
    parser.add_argument(
        "--template",
        default=str(BASE_DIR / "templates" / "cgp_p3_template.docx"),
        help="Template .docx path.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input JSON not found: {input_path}")

    template_path = Path(args.template)
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    with input_path.open("r", encoding="utf-8") as f:
        payload_raw = json.load(f)

    payload = CanonicalSWPPPPayload.model_validate(payload_raw)
    mapper = CanonicalSWPPPMapper()
    swppp_data = mapper.to_swppp(payload)

    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_project = swppp_data.project.project_name.replace(" ", "_")
        output_path = BASE_DIR / "templates" / "output" / f"SWPPP_{safe_project}_{timestamp}.docx"

    generator = DocumentGenerator(template_path)
    generated_path = generator.generate_swppp(swppp_data, output_path)
    print(str(generated_path))


if __name__ == "__main__":
    main()
