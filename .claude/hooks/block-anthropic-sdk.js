#!/usr/bin/env node
/**
 * PreToolUse hook: Block Anthropic SDK usage
 *
 * We're running inside Claude Code - use subagents, skills, or `claude -p`,
 * not the SDK directly.
 */

const fs = require("fs");

// Read stdin
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};

    // Check content being written/edited
    const content = toolInput.content || toolInput.new_string || "";

    const sdkPatterns = [
      /@anthropic-ai\/sdk/,
      /from\s+["']anthropic["']/,
      /import\s+anthropic/,
      /new\s+Anthropic\s*\(/,
      /anthropic\.messages\.create/,
    ];

    for (const pattern of sdkPatterns) {
      if (pattern.test(content)) {
        process.stderr.write(`
BLOCKED: Anthropic SDK usage detected

You're running inside Claude Code. Don't use the SDK directly.

Instead use:
- Subagent (Task tool with subagent_type)
- Skill (Skill tool)
- claude -p (Bash subprocess)

The SDK is for external apps. Claude Code IS Claude.
`);
        process.exit(2); // Exit 2 = block
      }
    }

    process.exit(0); // Allow
  } catch (err) {
    // Don't block on parse errors
    process.exit(0);
  }
});
