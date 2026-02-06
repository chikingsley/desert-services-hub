#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""PostToolUse hook (async): runs tsc --noEmit, filtered to the edited file.

Runs in background (~20s). Results delivered on next conversation turn.
Only reports type errors from the specific file that was edited.
"""

import json
import os
import subprocess
import sys

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

    if not os.path.isfile(file_path):
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    rel_path = os.path.relpath(file_path, project_dir)

    result = subprocess.run(
        ["bun", "run", "typecheck"],
        capture_output=True,
        text=True,
        cwd=project_dir,
        timeout=60,
    )

    if result.returncode != 0:
        output = result.stdout + result.stderr
        relevant = [line for line in output.splitlines() if rel_path in line]

        if relevant:
            print(f"TYPE ERRORS in {rel_path}:", file=sys.stderr)
            for line in relevant:
                print(f"  {line}", file=sys.stderr)
            sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except subprocess.TimeoutExpired:
        print("typecheck hook timed out (60s)", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"typecheck hook error: {e}", file=sys.stderr)
        sys.exit(1)
