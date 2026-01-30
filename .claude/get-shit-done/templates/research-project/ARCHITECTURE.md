# Architecture Research Template

Template for `.planning/research/ARCHITECTURE.md` — system structure patterns for the project domain.

<template>

```markdown
# Architecture Research

**Domain:** [domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Standard Architecture

### System Overview

```text
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| [name] | [what it owns] | [how it's usually built] |
| [name] | [what it owns] | [how it's usually built] |
| [name] | [what it owns] | [how it's usually built] |

## Recommended Project Structure

```text
```

### Structure Rationale

- **[folder]/:** [why organized this way]
- **[folder]/:** [why organized this way]

## Architectural Patterns

### Pattern 1: [Pattern Name]

**What:** [description]
**When to use:** [conditions]
**Trade-offs:** [pros and cons]

**Example:**

```typescript
// [Brief code example showing the pattern]
```css
```typescript
// [Brief code example showing the pattern]
```css
```

[User Action]
    ↓
[Component] → [Handler] → [Service] → [Data Store]
    ↓              ↓           ↓            ↓
[Response] ← [Transform] ← [Query] ← [Database]

```css
```

[State Store]
    ↓ (subscribe)
[Components] ←→ [Actions] → [Reducers/Mutations] → [State Store]

```css
```

</template>

<guidelines>

**System Overview:**

- Use ASCII diagrams for clarity
- Show major components and their relationships
- Don't over-detail — this is conceptual, not implementation

**Project Structure:**

- Be specific about folder organization
- Explain the rationale for grouping
- Match conventions of the chosen stack

**Patterns:**

- Include code examples where helpful
- Explain trade-offs honestly
- Note when patterns are overkill for small projects

**Scaling Considerations:**

- Be realistic — most projects don't need to scale to millions
- Focus on "what breaks first" not theoretical limits
- Avoid premature optimization recommendations

**Anti-Patterns:**

- Specific to this domain
- Include what to do instead
- Helps prevent common mistakes during implementation

</guidelines>
