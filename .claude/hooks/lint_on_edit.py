#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""PostToolUse hook: runs `ultracite check` on the edited file.

Surfaces lint issues without auto-fixing. Exit 2 = blocking.
"""

import json
import os
import subprocess
import sys

TS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")
SKIP_PATTERNS = ("/.claude/", "/node_modules/", "/memory/")


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

    if not os.path.isfile(file_path):
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

    result = subprocess.run(
        ["bunx", "ultracite", "check", file_path],
        capture_output=True,
        text=True,
        cwd=project_dir,
        timeout=30,
    )

    if result.returncode != 0:
        output = (result.stdout + result.stderr).strip()
        if output:
            print(f"LINT ERRORS in {file_path}:", file=sys.stderr)
            print(output, file=sys.stderr)
            sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except subprocess.TimeoutExpired:
        print("lint hook timed out (30s)", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"lint_on_edit hook error: {e}", file=sys.stderr)
        sys.exit(1)
