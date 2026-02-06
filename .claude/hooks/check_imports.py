#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""PostToolUse hook: blocks relative imports in TypeScript files.

All imports MUST use path aliases from tsconfig.json. Relative imports
(./  ../) are never allowed. Exit 2 = blocking.
"""

import json
import re
import sys

RELATIVE_IMPORT = re.compile(r"""(?:from|import)\s+['"]\.\.?/""")

TS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")
SKIP_PATTERNS = ("/.claude/", "/node_modules/")


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)

    data = json.loads(raw)
    file_path = data.get("tool_input", {}).get("file_path", "")

    if not file_path.endswith(TS_EXTENSIONS):
        sys.exit(0)

    if any(p in file_path for p in SKIP_PATTERNS):
        sys.exit(0)

    try:
        with open(file_path, encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        sys.exit(0)

    violations = []
    for i, line in enumerate(lines, 1):
        if RELATIVE_IMPORT.search(line):
            violations.append(f"  L{i}: {line.rstrip()}")

    if violations:
        msg = [
            f"BLOCKED: Relative imports in {file_path}",
            "",
            *violations,
            "",
            "All imports MUST use path aliases from tsconfig.json. Fix before continuing.",
        ]
        print("\n".join(msg), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"check_imports hook error: {e}", file=sys.stderr)
        sys.exit(1)
