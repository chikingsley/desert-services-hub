---
name: claude-code-patterns
description: Reference guide for Claude Code patterns including skills, subagents, hooks, tasks, and AGENTS.md. Use when building new skills, agents, or automation, or when asked about Claude Code best practices.
user-invocable: true
allowed-tools: Read, Glob, Grep
---

# Claude Code Patterns Reference

Quick reference for building effective Claude Code automation. For deep dives, see the references folder.

## The Big Insight (Vercel's Finding)

**Skills were never invoked 56% of the time** because the agent has to decide to use them.

| Approach | Pass Rate |
|----------|-----------|
| No docs | 53% |
| Skills | 53% |
| AGENTS.md | **100%** |

**Best practice**: Put always-needed context in CLAUDE.md/AGENTS.md. Use skills only for explicit workflows users trigger.

See [agents-md-vs-skills.md](references/agents-md-vs-skills.md) for full analysis.

---

## Quick Reference

### When to Use What

| Need | Solution |
|------|----------|
| Always-available context | CLAUDE.md / AGENTS.md |
| User-triggered workflow | Skill with `user-invocable: true` |
| Background knowledge | Skill with `user-invocable: false` |
| Parallel independent work | Multiple subagents via Task tool |
| Complex investigation | Custom agent in `.claude/agents/` |
| Validate/block actions | Hooks (PreToolUse) |
| Track multi-step work | Tasks (TaskCreate/TaskUpdate) |

### Subagent Quick Facts

- **Max concurrent**: 7 subagents
- **Overhead**: ~20k tokens per spawn (don't use for small tasks)
- **No nesting**: Subagents cannot spawn other subagents
- **Context**: Isolated - must pass everything in prompt
- **Built-in types**: `Explore` (Haiku), `Plan`, `general-purpose`, `Bash`

### Skill Frontmatter Cheatsheet

```yaml
---
name: my-skill
description: What it does and WHEN to use it (triggers)
argument-hint: "[file or query]"
user-invocable: true           # Show in /menu (default: true)
disable-model-invocation: false # Let Claude auto-invoke (default: false)
allowed-tools: Read, Grep, Glob # Restrict tool access
model: sonnet                   # sonnet | opus | haiku | inherit
context: fork                   # Run as subagent
agent: Explore                  # Agent type when forked
---
```

### Hook Events

| Event | Can Block? | Common Use |
|-------|------------|------------|
| `PreToolUse` | Yes | Validate commands, block dangerous ops |
| `PostToolUse` | No | Auto-format, run tests |
| `UserPromptSubmit` | Yes | Validate user input |
| `SessionStart` | No | Inject context, set env vars |
| `Stop` | Yes | Logging, cleanup |

---

## File Locations

```text
.claude/
├── CLAUDE.md              # Project instructions (always loaded)
├── settings.json          # Hooks, permissions
├── skills/
│   └── my-skill/
│       ├── SKILL.md       # Main skill file
│       └── references/    # On-demand docs
└── agents/
    └── my-agent.md        # Custom subagent definitions
```

**Personal (all projects)**: `~/.claude/skills/`, `~/.claude/CLAUDE.md`
**Project-specific**: `.claude/skills/`, `CLAUDE.md`

---

## References

- [Skills Deep Dive](references/skills.md) - Full skill authoring guide
- [Subagents Guide](references/subagents.md) - Task tool and orchestration
- [AGENTS.md vs Skills](references/agents-md-vs-skills.md) - Vercel's findings
- [Hooks Reference](references/hooks.md) - All 12 hook events
- [Tasks System](references/tasks.md) - Built-in task tracking

---

## Anti-Patterns

1. **Using skills for always-needed context** - Put it in CLAUDE.md instead
2. **Spawning subagents for small tasks** - 20k token overhead is wasteful
3. **Expecting subagents to inherit context** - They start fresh
4. **Vague skill descriptions** - Include specific trigger phrases
5. **Deep file nesting in skills** - Keep references one level deep
