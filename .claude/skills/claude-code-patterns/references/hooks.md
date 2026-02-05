# Hooks Reference

## What Are Hooks?

User-defined shell commands, LLM prompts, or subagents that execute automatically at specific lifecycle points. They provide **deterministic control** over Claude Code's behavior.

## Hook Types

| Type | Description |
|------|-------------|
| `command` | Shell command. Receives JSON on stdin, uses exit codes |
| `prompt` | Single-turn LLM evaluation (Haiku by default) |
| `agent` | Multi-turn subagent with tool access |

## All 12 Hook Events

| Event | Can Block? | Use Case |
|-------|------------|----------|
| `SessionStart` | No | Inject context, set env vars |
| `UserPromptSubmit` | Yes | Validate user input |
| `PreToolUse` | Yes | Block dangerous commands |
| `PermissionRequest` | Yes | Auto-approve/deny permissions |
| `PostToolUse` | No | Auto-format, run tests |
| `PostToolUseFailure` | No | Handle failures |
| `Notification` | No | Desktop alerts |
| `SubagentStart` | No | Track subagent spawning |
| `SubagentStop` | Yes | Validate subagent output |
| `Stop` | Yes | Logging, cleanup |
| `PreCompact` | No | Save state before compaction |
| `SessionEnd` | No | Final cleanup |

## Configuration

Hooks go in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bun x ultracite fix"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/validate-command.sh"
          }
        ]
      }
    ]
  }
}
```

## Matchers

Filter when hooks fire using regex:

| Event | Matches Against | Examples |
|-------|-----------------|----------|
| `PreToolUse`, `PostToolUse` | Tool name | `Bash`, `Edit\|Write`, `mcp__.*` |
| `SessionStart` | Start type | `startup`, `resume`, `compact` |
| `SessionEnd` | End reason | `clear`, `logout` |
| `SubagentStart/Stop` | Agent type | `Explore`, `Plan`, custom names |

**MCP tools**: `mcp__<server>__<tool>` (e.g., `mcp__github__search_repositories`)

## Input/Output

### Input (JSON on stdin)

All hooks receive:
- `session_id`
- `transcript_path`
- `cwd`
- `permission_mode`
- `hook_event_name`

Plus event-specific fields like `tool_name`, `tool_input`, `prompt`, etc.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success - action proceeds |
| `2` | Block - action prevented, stderr fed to Claude |
| Other | Non-blocking error - action proceeds |

### JSON Output (Fine-grained Control)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: destructive command"
  }
}
```

Permission decisions: `"allow"`, `"deny"`, `"ask"`

## Common Patterns

### Auto-format After Edits

```json
{
  "PostToolUse": [{
    "matcher": "Edit|Write",
    "hooks": [{
      "type": "command",
      "command": "prettier --write \"$TOOL_INPUT_FILE\""
    }]
  }]
}
```

### Block Dangerous Commands

```json
{
  "PreToolUse": [{
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": "./scripts/block-dangerous.sh"
    }]
  }]
}
```

### Session Logging

```json
{
  "Stop": [{
    "hooks": [{
      "type": "command",
      "command": "./scripts/log-session.sh"
    }]
  }]
}
```

### Async Hooks (Non-blocking)

```json
{
  "type": "command",
  "command": "./run-tests.sh",
  "async": true,
  "timeout": 120
}
```

## Hooks in Skills

Define hooks scoped to a skill in YAML frontmatter:

```yaml
---
name: secure-ops
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

These hooks only run while the skill is active.

## Environment Variables

`SessionStart` hooks can persist env vars:

```bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
fi
```

## Best Practices

1. **Keep hooks fast** - especially `SessionStart`
2. **Use matchers** to narrow scope
3. **Quote variables** - use `"$VAR"` not `$VAR`
4. **Use absolute paths** - `"$CLAUDE_PROJECT_DIR"/scripts/...`
5. **Make scripts executable** - `chmod +x`
6. **Test manually** - pipe sample JSON to your script

## Debugging

- Run `claude --debug` for execution details
- Toggle verbose mode with `Ctrl+O`
- Use `/hooks` menu to view/add/delete hooks
