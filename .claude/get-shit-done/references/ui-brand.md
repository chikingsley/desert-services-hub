<ui_patterns>

Visual patterns for user-facing GSD output. Orchestrators @-reference this file.

## Stage Banners

Use for major workflow transitions.

```text
```

**Stage names (uppercase):**

- `QUESTIONING`
- `RESEARCHING`
- `DEFINING REQUIREMENTS`
- `CREATING ROADMAP`
- `PLANNING PHASE {N}`
- `EXECUTING WAVE {N}`
- `VERIFYING`
- `PHASE {N} COMPLETE ✓`
- `MILESTONE COMPLETE 🎉`

---

## Checkpoint Boxes

User action required. 62-character width.

```text
```

**Types:**

- `CHECKPOINT: Verification Required` → `→ Type "approved" or describe issues`
- `CHECKPOINT: Decision Required` → `→ Select: option-a / option-b`
- `CHECKPOINT: Action Required` → `→ Type "done" when complete`

---

## Status Symbols

```text
```

---

## Progress Display

**Phase/milestone level:**

```yaml
```

**Task level:**

```yaml
```

**Plan level:**

```yaml
```

---

## Spawning Indicators

```text
```

---

## Next Up Block

Always at end of major completions.

```html
```

---

## Error Box

```text
```

---

## Tables

```text
```

---

## Anti-Patterns

- Varying box/banner widths
- Mixing banner styles (`===`, `---`, `***`)
- Skipping `GSD ►` prefix in banners
- Random emoji (`🚀`, `✨`, `💫`)
- Missing Next Up block after completions

</ui_patterns>
