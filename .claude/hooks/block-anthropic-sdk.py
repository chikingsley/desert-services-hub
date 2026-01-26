#!/usr/bin/env python3
"""
PostToolUse hook: Block Anthropic SDK usage

We're running inside Claude Code - use subagents, skills, or `claude -p`,
not the SDK directly.
"""

import json
import re
import sys

SDK_PATTERNS = [
    r"@anthropic-ai/sdk",
    r'from\s+["\']anthropic["\']',
    r"import\s+anthropic",
    r"new\s+Anthropic\s*\(",
    r"anthropic\.messages\.create",
]

def main():
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input", {})

    # Check content that was written/edited
    content = tool_input.get("content") or tool_input.get("new_string") or ""

    for pattern in SDK_PATTERNS:
        if re.search(pattern, content):
            print("""
BLOCKED: Anthropic SDK usage detected

You're running inside Claude Code. Don't use the SDK directly.

Instead use:
- Subagent (Task tool with subagent_type)
- Skill (Skill tool)
- claude -p (Bash subprocess)

The SDK is for external apps. Claude Code IS Claude.
""", file=sys.stderr)
            sys.exit(2)

    sys.exit(0)

if __name__ == "__main__":
    main()
