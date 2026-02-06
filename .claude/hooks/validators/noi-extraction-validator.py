#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
NOI Extraction Validator

Validates that NOI extraction contains required fields with valid values.
Used as a Stop hook for the extract-noi skill.

Exit codes:
  0 - Valid extraction
  2 - Invalid extraction (stderr fed back to Claude)
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# Log file for debugging
LOG_FILE = Path(__file__).parent / "noi-extraction-validator.log"

# Required fields that MUST be present and non-null
REQUIRED_FIELDS = [
    "applicantName",
    "siteName",
    "swpppContactEmail",
]

# Fields that should be present (warnings if missing, not errors)
EXPECTED_FIELDS = [
    "applicantAddress1",
    "applicantCity",
    "applicantState",
    "applicantZip",
    "latitude",
    "longitude",
    "acresDisturbed",
    "swpppContactFirstName",
    "swpppContactLastName",
    "swpppContactPhone",
    "ltfNumber",
]

# Validation ranges
LATITUDE_RANGE = (30.0, 38.0)  # Arizona range
LONGITUDE_RANGE = (-115.0, -108.0)  # Arizona range


def log(message: str) -> None:
    """Append message to log file with timestamp."""
    timestamp = datetime.now().isoformat()
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {message}\n")


def validate_phone(phone: str | None) -> bool:
    """Validate phone number has 10 digits."""
    if phone is None:
        return False
    digits = "".join(c for c in phone if c.isdigit())
    return len(digits) == 10


def validate_email(email: str | None) -> bool:
    """Validate email contains @ symbol."""
    if email is None:
        return False
    return "@" in email and "." in email


def validate_coordinates(lat: float | None, lng: float | None) -> list[str]:
    """Validate coordinates are in Arizona range."""
    errors = []
    if lat is not None:
        if not (LATITUDE_RANGE[0] <= lat <= LATITUDE_RANGE[1]):
            errors.append(f"Latitude {lat} out of Arizona range {LATITUDE_RANGE}")
    if lng is not None:
        if not (LONGITUDE_RANGE[0] <= lng <= LONGITUDE_RANGE[1]):
            errors.append(f"Longitude {lng} out of Arizona range {LONGITUDE_RANGE}")
    return errors


def validate_noi_extraction(data: dict) -> tuple[list[str], list[str]]:
    """
    Validate NOI extraction data.

    Returns:
        (errors, warnings) - Lists of error and warning messages
    """
    errors = []
    warnings = []

    # Check required fields
    for field in REQUIRED_FIELDS:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(f"Required field '{field}' is missing or empty")

    # Check expected fields (warnings only)
    for field in EXPECTED_FIELDS:
        value = data.get(field)
        if value is None:
            warnings.append(f"Expected field '{field}' is missing")

    # Validate email format
    email = data.get("swpppContactEmail")
    if email and not validate_email(email):
        errors.append(f"Invalid email format: {email}")

    # Validate phone format (warning, not error)
    phone = data.get("swpppContactPhone")
    if phone and not validate_phone(phone):
        warnings.append(f"Phone number may be invalid: {phone}")

    # Validate coordinates
    lat = data.get("latitude")
    lng = data.get("longitude")
    coord_errors = validate_coordinates(lat, lng)
    errors.extend(coord_errors)

    # Validate acreage is positive
    acreage = data.get("acresDisturbed")
    if acreage is not None and acreage <= 0:
        errors.append(f"Acreage must be positive, got: {acreage}")

    return errors, warnings


def main():
    """Main entry point for hook."""
    log("=== NOI Extraction Validator Started ===")

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
    # Could be in tool_result, extraction field, or directly
    extraction = None
    if "tool_result" in hook_input:
        # PostToolUse hook - extract from tool result
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
    elif "applicantName" in hook_input:
        # Direct extraction data
        extraction = hook_input

    if extraction is None:
        log("No extraction data found to validate")
        print(json.dumps({}))  # Allow - nothing to validate
        return

    log(f"Validating extraction with {len(extraction)} fields")

    # Validate
    errors, warnings = validate_noi_extraction(extraction)

    # Log results
    log(f"Validation complete: {len(errors)} errors, {len(warnings)} warnings")
    for e in errors:
        log(f"  ERROR: {e}")
    for w in warnings:
        log(f"  WARNING: {w}")

    # Output decision
    if errors:
        error_msg = "NOI Extraction Validation Failed:\n" + "\n".join(f"- {e}" for e in errors)
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
        print(json.dumps({}))  # Empty = allow


if __name__ == "__main__":
    main()
