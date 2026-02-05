# AGENTS.md vs Skills: Vercel's Findings

## The Evaluation

Vercel ran evaluations comparing approaches for providing documentation to AI coding agents.

| Approach | Build | Lint | Test | Overall |
|----------|-------|------|------|---------|
| Baseline (no docs) | 63% | 100% | 63% | **53%** |
| Skills (default) | 58% | 100% | 58% | **53%** |
| Skills (explicit instructions) | 95% | 100% | 84% | **79%** |
| AGENTS.md docs index | 100% | 100% | 100% | **100%** |

## Why Skills Underperformed

**In 56% of cases, skills were never invoked.**

The agent has to make a decision: "Do I need to look up docs?" This decision often doesn't happen because:

1. The agent doesn't recognize it needs help
2. It proceeds with pre-training knowledge instead
3. By the time it realizes, it's committed to a path

## Why AGENTS.md Works

Three advantages:

1. **No decision burden** - Content loads automatically every turn
2. **Consistent presence** - Always in system prompt, no fetch operation
3. **No ordering problems** - No "should I read docs first or explore first?"

## The Compressed Index Format

Vercel compresses docs from 40KB to 8KB (80% reduction):

```text
<!-- NEXT-AGENTS-MD-START -->
[Next.js Docs Index]
|root: ./.next-docs
|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning
|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,...}
<!-- NEXT-AGENTS-MD-END -->
```

Key elements:

- **HTML comment markers** for idempotent updates
- **Pipe separators** for compact delimiting
- **Root path** pointing to docs directory
- **Directory notation** grouping files
- **Instruction prefix** guiding behavior

This provides **location references** rather than full content. Agent retrieves specific files as needed.

## When to Use Each

### AGENTS.md / CLAUDE.md

- Project-specific context always needed
- Documentation indexes guiding retrieval
- Coding standards and patterns
- Info needed on nearly every interaction

### Skills

- Explicit workflows users trigger
- Version upgrades and migrations
- Complex multi-step processes with domain logic
- Reusable expertise shared across teams
- Large codebases where docs don't fit in context

## The Combination Approach

Use both together:

1. **AGENTS.md**: Persistent, always-needed context
   - Project structure
   - Coding standards
   - Compressed doc indexes

2. **Skills**: Explicit triggered workflows
   - Migrations
   - Upgrades
   - Complex operations

3. **Explicit instructions**: If using skills, add:
   > "If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke it"

## Best Practices

1. **Compress aggressively** - Indexes outperform full documentation
2. **Design for retrieval** - Provide paths, not content dumps
3. **First-person phrasing** - "I will check for AGENTS.md" (3/3 success) vs "Check for files" (2/3)
4. **Build evals** - Test against newer APIs absent from training data

## Limitations

1. **Scalability** - Large projects may exceed what fits even with compression
2. **Updates** - AGENTS.md needs manual updates when docs change
3. **Context limits** - Skills still relevant for huge diverse projects

## Setup for Next.js

```bash
npx @next/codemod agents-md --version 15.1.0
```

Downloads docs to `.next-docs/` and injects compressed index into your CLAUDE.md.

## Source

[Vercel Blog: AGENTS.md outperforms skills in our agent evals](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
