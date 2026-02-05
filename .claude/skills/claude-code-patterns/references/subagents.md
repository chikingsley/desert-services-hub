# Subagents Guide

## How Subagents Work

The **Task tool** spawns subagents - isolated Claude instances with their own context window, tools, and permissions.

```xml
<invoke name="Task">
  <parameter name="subagent_type">general-purpose</parameter>
  <parameter name="description">Brief 3-5 word summary</parameter>
  <parameter name="prompt">Detailed instructions...</parameter>
  <parameter name="model">haiku</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>
```

## Built-in Agent Types

| Agent | Model | Tools | Use Case |
|-------|-------|-------|----------|
| `Explore` | Haiku | Read-only | File discovery, code search |
| `Plan` | Inherit | Read-only | Planning mode research |
| `general-purpose` | Inherit | All | Complex multi-step work |
| `Bash` | Inherit | Bash | Terminal commands |

## Custom Agents

Create `.claude/agents/my-agent.md`:

```yaml
---
name: my-agent
description: What it does. Use when...
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Agent Instructions

Your detailed instructions here...
```

## Key Constraints

### Token Overhead
Each subagent spawn costs **~20,000 tokens** before any work begins. Don't use for small tasks.

### No Nesting
**Subagents cannot spawn other subagents.** This is intentional.

### Context Isolation
Subagents receive ONLY:
- Their system prompt (from the markdown file)
- Basic environment (working directory)

They do NOT inherit:
- Parent conversation history
- Skills from parent
- Full Claude Code system prompt

### Concurrency Limits
- Max **7 concurrent** subagents
- Cap of 10 per batch
- Claude waits for batch to finish before next

## Passing Context

### Method 1: In the Prompt
```yaml
prompt: "Review auth module at src/auth/. Uses JWT tokens. Main file is AuthController.ts"
```

### Method 2: Via Skills
```yaml
skills:
  - api-conventions
  - error-handling
```

### Method 3: File References
```yaml
prompt: "Read PROJECT.md first, then implement the feature described there"
```

## Orchestration Patterns

### Parallel Specialists
Launch multiple agents for independent analysis:
```text
Research auth, database, and API modules in parallel using separate subagents
```

### Pipeline (Sequential)
Use Task system dependencies:
```javascript
TaskCreate({ subject: "Research" })      // #1
TaskCreate({ subject: "Implement" })     // #2
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })
```

### Chaining
```text
Use code-reviewer subagent to find issues, then optimizer subagent to fix them
```

## When to Use Subagents

### YES - Use Subagents
- High-volume output (keeps verbose content out of main context)
- Parallel independent work
- Need specific tool restrictions
- Want cheaper model (Haiku) for simple tasks
- Self-contained work that returns a summary

### NO - Stay in Main Conversation
- Iterative refinement needed
- Shared context across phases
- Quick targeted changes
- Small tasks (20k overhead is wasteful)
- Latency matters

## Background vs Foreground

**Foreground**: Blocks main conversation, permission prompts pass through

**Background** (`run_in_background: true`):
- Runs concurrently
- Must pre-approve permissions (auto-denies unapproved)
- MCP tools not available
- If fails due to permissions, resume in foreground

## Cost Warning

Real-world examples:
- One company spent **$47,000 in three days** on subagent-heavy project
- Single session consumed **887,000 tokens per minute**

**Mitigation:**
- Use Haiku for simple tasks
- Stay in main conversation for small work
- Group related tasks instead of many agents

## Resuming Subagents

Each spawn creates new instance. To continue:
```text
Continue that code review and analyze authorization logic
```

Transcripts stored at: `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
