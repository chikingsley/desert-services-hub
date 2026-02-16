"""CLI output formatting."""

from __future__ import annotations

import json


def print_table(headers: list[str], rows: list[list[str]]) -> None:
    """Print an aligned table with headers."""
    if not rows:
        print("(no results)")
        return

    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(str(cell)))

    fmt = "  ".join(f"{{:<{w}}}" for w in col_widths)

    print(fmt.format(*headers))
    print(fmt.format(*("-" * w for w in col_widths)))
    for row in rows:
        padded = [str(row[i]) if i < len(row) else "" for i in range(len(headers))]
        print(fmt.format(*padded))


def print_json(data: dict | list) -> None:
    """Print data as formatted JSON."""
    print(json.dumps(data, indent=2, default=str))
