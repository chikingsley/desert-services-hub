---
name: no-anthropic-sdk
enabled: true
event: file
action: block
conditions:
  - field: new_text
    operator: regex_match
    pattern: (@anthropic-ai/sdk|from\s+["']anthropic["']|import\s+anthropic|new\s+Anthropic\(|anthropic\.messages\.create)
---

**BLOCKED: Anthropic SDK usage detected**

You're running inside Claude Code. We don't use the Anthropic SDK directly.

**What to do instead:**
- Use a Claude Code **subagent** (Task tool with appropriate subagent_type)
- Use **`claude -p`** to run Claude Code as a subprocess
- Use a **skill** for domain-specific LLM tasks

The SDK is for external applications. Claude Code already IS Claude - use its native capabilities.
