#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
"""
Plan Extraction Validator

Validates that plan extraction contains required categories and measures
based on the dust-control-application-schema.yaml.

Used as a Stop hook for the extract-plan skill.

Exit codes:
  0 - Valid extraction
  2 - Invalid extraction (stderr fed back to Claude)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

import yaml

# Log file for debugging
LOG_FILE = Path(__file__).parent / "plan-extraction-validator.log"

# Schema file location (relative to this validator)
SCHEMA_FILE = Path(__file__).parent.parent.parent / "skills/extract-plan/references/dust-control-application-schema.yaml"

# Required top-level fields
REQUIRED_FIELDS = [
    "projectName",
    "dustControlMeasures",
]

# Categories that must have at least one measure if present
MEASURE_CATEGORIES = [
    "categoryA",  # Wind-blown dust - always required
    "categoryC",  # Surface stabilization - always required
    "categoryE",  # Trackout - always required
    "categoryK",  # Water supply - always required
]


def log(message: str) -> None:
    """Append message to log file with timestamp."""
    timestamp = datetime.now().isoformat()
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {message}\n")


def load_schema() -> dict | None:
    """Load the dust control application schema."""
    if not SCHEMA_FILE.exists():
        log(f"Schema file not found: {SCHEMA_FILE}")
        return None

    try:
        with open(SCHEMA_FILE) as f:
            return yaml.safe_load(f)
    except Exception as e:
        log(f"Error loading schema: {e}")
        return None


def get_category_ids_from_schema(schema: dict) -> set[str]:
    """Extract all category IDs from the schema."""
    category_ids = set()

    for section in schema.get("sections", []):
        if section.get("id") == "C":  # Dust Control Plan Data
            for category in section.get("categories", []):
                cat_id = category.get("id", "")
                # Normalize: cat_b1 -> categoryB1, cat_c -> categoryC, etc.
                if cat_id.startswith("cat_"):
                    normalized = "category" + cat_id[4:].upper().replace("_", "")
                    category_ids.add(normalized)

    return category_ids


def validate_plan_extraction(data: dict, schema: dict | None) -> tuple[list[str], list[str]]:
    """
    Validate plan extraction data.

    Returns:
        (errors, warnings) - Lists of error and warning messages
    """
    errors = []
    warnings = []

    # Check required fields
    for field in REQUIRED_FIELDS:
        value = data.get(field)
        if value is None:
            errors.append(f"Required field '{field}' is missing")
        elif field == "projectName" and isinstance(value, str) and not value.strip():
            errors.append(f"Required field '{field}' is empty")

    # Check dustControlMeasures structure
    measures = data.get("dustControlMeasures", {})
    if not isinstance(measures, dict):
        errors.append("dustControlMeasures must be an object/dict")
        return errors, warnings

    if not measures:
        errors.append("dustControlMeasures is empty - no categories extracted")
        return errors, warnings

    # Check required categories
    for cat in MEASURE_CATEGORIES:
        # Check variations: categoryA, categoryC, etc.
        found = False
        for key in measures.keys():
            if key.lower().replace("_", "") == cat.lower():
                found = True
                break

        if not found:
            warnings.append(f"Expected category '{cat}' not found in extraction")

    # Validate acreage if present
    acreage = data.get("acreage")
    if acreage is not None:
        if not isinstance(acreage, (int, float)):
            errors.append(f"Acreage must be a number, got: {type(acreage).__name__}")
        elif acreage <= 0:
            errors.append(f"Acreage must be positive, got: {acreage}")

    # Check that each category has at least some content
    empty_categories = []
    for cat_name, cat_content in measures.items():
        if isinstance(cat_content, dict):
            # Check if category has any measures
            has_content = False
            for key, value in cat_content.items():
                if value and key != "description":
                    has_content = True
                    break
            if not has_content and cat_name.lower() in [c.lower() for c in MEASURE_CATEGORIES]:
                empty_categories.append(cat_name)

    if empty_categories:
        warnings.append(f"Categories with no measures: {', '.join(empty_categories)}")

    # If schema is available, do additional validation
    if schema:
        schema_categories = get_category_ids_from_schema(schema)
        log(f"Schema defines categories: {schema_categories}")

        # Check for unknown categories
        for cat_name in measures.keys():
            # Normalize the category name for comparison
            normalized = cat_name.lower().replace("_", "")
            if not any(normalized == s.lower() for s in schema_categories):
                # Not a strict error, just log it
                log(f"Category '{cat_name}' not found in schema")

    return errors, warnings


def main():
    """Main entry point for hook."""
    log("=== Plan Extraction Validator Started ===")

    # Load schema
    schema = load_schema()
    if schema:
        log(f"Loaded schema version: {schema.get('meta', {}).get('version', 'unknown')}")
    else:
        log("Warning: Schema not loaded, running with basic validation only")

    # Read hook input from stdin
    stdin_data = sys.stdin.read()
    log(f"Received stdin: {len(stdin_data)} bytes")

    # Try to parse as JSON
    try:
        if stdin_data.strip():
            hook_input = json.loads(stdin_data)
        else:
            hook_input = {}
    except json.JSONDecodeError as e:
        log(f"JSON parse error: {e}")
        # Try to find JSON file path from arguments
        if len(sys.argv) > 1:
            json_path = sys.argv[1]
            log(f"Trying file path from args: {json_path}")
            try:
                with open(json_path) as f:
                    hook_input = {"extraction": json.load(f)}
            except Exception as e2:
                log(f"File read error: {e2}")
                print(json.dumps({}))
                return
        else:
            print(json.dumps({}))
            return

    # Extract the data to validate
    extraction = None
    if "tool_result" in hook_input:
        result = hook_input.get("tool_result", {})
        if isinstance(result, str):
            try:
                extraction = json.loads(result)
            except:
                pass
        elif isinstance(result, dict):
            extraction = result
    elif "extraction" in hook_input:
        extraction = hook_input["extraction"]
    elif "projectName" in hook_input or "dustControlMeasures" in hook_input:
        extraction = hook_input

    if extraction is None:
        log("No extraction data found to validate")
        print(json.dumps({}))  # Allow - nothing to validate
        return

    log(f"Validating extraction with {len(extraction)} fields")

    # Validate
    errors, warnings = validate_plan_extraction(extraction, schema)

    # Log results
    log(f"Validation complete: {len(errors)} errors, {len(warnings)} warnings")
    for e in errors:
        log(f"  ERROR: {e}")
    for w in warnings:
        log(f"  WARNING: {w}")

    # Output decision
    if errors:
        error_msg = "Plan Extraction Validation Failed:\n" + "\n".join(f"- {e}" for e in errors)
        if warnings:
            error_msg += "\n\nWarnings:\n" + "\n".join(f"- {w}" for w in warnings)
        print(json.dumps({
            "decision": "block",
            "reason": error_msg
        }))
        log("Decision: BLOCK")
    else:
        if warnings:
            log(f"Decision: ALLOW (with {len(warnings)} warnings)")
        else:
            log("Decision: ALLOW")
        print(json.dumps({}))


if __name__ == "__main__":
    main()
