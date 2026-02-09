from __future__ import annotations

import json
import re
from dataclasses import asdict, is_dataclass
from typing import Any


def parse_page_spec(spec: str | None) -> list[int] | None:
    if not spec:
        return None

    pages: set[int] = set()
    for token in spec.split(","):
        chunk = token.strip()
        if not chunk:
            continue

        if "-" in chunk:
            start_s, end_s = chunk.split("-", 1)
            start = int(start_s)
            end = int(end_s)
            if start <= 0 or end <= 0:
                raise ValueError("Page numbers must be positive")
            if start > end:
                raise ValueError(f"Invalid page range: {chunk}")
            pages.update(range(start, end + 1))
        else:
            page = int(chunk)
            if page <= 0:
                raise ValueError("Page numbers must be positive")
            pages.add(page)

    parsed = sorted(pages)
    return parsed if parsed else None


def sanitize_filename(value: str | None) -> str:
    if value is None:
        return "unknown"
    cleaned = re.sub(r"[\s_]+", "-", value.strip())
    cleaned = re.sub(r"[^\w\-.]", "", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned)
    cleaned = cleaned.strip("-.")
    return cleaned or "unknown"


def extract_json_from_text(text: str) -> dict[str, Any]:
    if not text.strip():
        return {}

    # Try fenced JSON first.
    fenced_matches = re.findall(r"```json\s*(.*?)\s*```", text, flags=re.DOTALL | re.IGNORECASE)
    for candidate in fenced_matches:
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed

    # Try any fenced block.
    generic_matches = re.findall(r"```\s*(.*?)\s*```", text, flags=re.DOTALL)
    for candidate in generic_matches:
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed

    # Try first balanced JSON object in plain text.
    balanced = _extract_first_balanced_json(text)
    if balanced is not None:
        parsed = _try_parse_json(balanced)
        if parsed is not None:
            return parsed

    parsed = _try_parse_json(text)
    return parsed or {}


def _try_parse_json(candidate: str) -> dict[str, Any] | None:
    normalized = candidate.strip()
    if not normalized:
        return None

    normalized = re.sub(
        r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:",
        r'\1"\2":',
        normalized,
    )

    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError:
        return None

    if isinstance(parsed, dict):
        return parsed
    return {"value": parsed}


def _extract_first_balanced_json(text: str) -> str | None:
    start = text.find("{")
    while start >= 0:
        depth = 0
        in_string = False
        escaped = False
        for idx in range(start, len(text)):
            ch = text[idx]
            if escaped:
                escaped = False
                continue
            if ch == "\\":
                escaped = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : idx + 1]
        start = text.find("{", start + 1)
    return None


def dataclass_to_dict(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    return value
