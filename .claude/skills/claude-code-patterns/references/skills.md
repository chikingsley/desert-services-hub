# Skills Deep Dive

## Folder Structure

```text
my-skill/
├── SKILL.md              # Required - main instructions
├── references/           # Optional - loaded on-demand
│   └── detailed-api.md
├── examples/             # Optional
├── scripts/              # Optional - executable helpers
└── assets/               # Optional - templates, images
```

## Frontmatter Reference

All fields optional except `description` (recommended).

| Field | Default | Description |
|-------|---------|-------------|
| `name` | Directory name | Display name (lowercase, hyphens, max 64 chars) |
| `description` | - | What it does + when to use (max 1024 chars) |
| `argument-hint` | - | Autocomplete hint, e.g. `[file-path]` |
| `user-invocable` | true | Show in `/` menu |
| `disable-model-invocation` | false | Prevent Claude from auto-loading |
| `allowed-tools` | All | Tools available when skill active |
| `model` | inherit | `sonnet`, `opus`, `haiku`, or `inherit` |
| `context` | - | Set to `fork` to run as subagent |
| `agent` | - | Agent type when `context: fork` |
| `hooks` | - | Skill-scoped lifecycle hooks |

## String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All args passed to skill |
| `$ARGUMENTS[0]` | First argument |
| `$0`, `$1`, etc. | Shorthand for `$ARGUMENTS[N]` |

## Dynamic Context Injection

Run shell commands before Claude sees the skill:

```markdown
## Current Branch
!`git branch --show-current`

## Recent Commits
!`git log --oneline -5`
```

## Invocation Control

| Setting | You Invoke | Claude Invokes | When Loaded |
|---------|------------|----------------|-------------|
| Default | Yes | Yes | Description always in context |
| `disable-model-invocation: true` | Yes | No | Hidden until you invoke |
| `user-invocable: false` | No | Yes | Claude-only background knowledge |

## Writing Good Descriptions

```yaml
# GOOD - specific, includes triggers
description: Extract text and tables from PDF files. Use when working with PDFs or when user mentions document extraction, forms, or PDF parsing.

# BAD - vague
description: Helps with documents
```

## Running as Subagent

```yaml
---
name: deep-research
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---

Research $ARGUMENTS thoroughly...
```

Built-in agent types: `Explore` (Haiku, fast), `Plan`, `general-purpose`

## Progressive Disclosure

Keep SKILL.md under 500 lines. Reference detailed docs:

```markdown
For API details, see [api-reference.md](references/api-reference.md)
```

**Rules:**
- Keep references one level deep
- Add table of contents to files over 100 lines
- Name files descriptively

## Best Practices

1. **Match freedom to task** - High freedom for flexible tasks, low for fragile ops
2. **Provide workflows** - Break complex tasks into clear steps
3. **Test with all models** - Haiku, Sonnet, Opus behave differently
4. **Avoid time-sensitive info** - Move deprecated patterns to "old patterns" section
5. **Use consistent terminology** - Pick one term and stick with it

## Character Budget

Skills consume context. Default budget: 15,000 chars. Check `/context` for warnings. Increase with `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var.
