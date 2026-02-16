---
name: monday-graphql-column-semantics
description: Correctly interpret Monday.com GraphQL column values for board relations and mirrors in Desert Services boards. Use when auditing Monday data, checking column usage, diagnosing “empty” values, building sync workers, or planning mirror-to-direct relation migrations so fallback paths are handled correctly.
---

# Monday Graphql Column Semantics

Apply this skill whenever a task depends on understanding how Monday columns are actually populated, especially `board_relation` and `mirror` columns.

## Core Rules

1. Query rich column payloads for relation/mirror logic.
Use `id`, `type`, `text`, `value`, plus GraphQL fragments:
- `... on BoardRelationValue { linked_item_ids display_value }`
- `... on MirrorValue { display_value }`

2. Never treat `text` as canonical for relations/mirrors.
- For mirrors, `text` is often null.
- For relations, `linked_item_ids` is the canonical linkage.
- `display_value` is human-readable and useful for fallback, not canonical linking.

3. Do not call a column “empty” until fallback paths are checked.
Classify per item as:
- `direct`: target direct relation populated
- `fallback`: direct empty, data still resolvable via another relation chain
- `mirror_only`: only display value exists
- `unresolved`: no direct/fallback/mirror resolution

4. Use repository helpers before writing one-off logic.
- `getItemsRich`: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/monday-cli/src/client.ts`
- `resolveAccountNames`: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/monday-cli/src/sync/monday-fetch.ts`

5. Separate schema parity from business completeness.
- “Direct column not populated” is a schema parity fact.
- It is not the same as “business data missing” if fallback resolves it.

## Canonical Resolution Patterns

Use these precedence chains for audits and migrations.

1. Estimating contractor/account identity:
- Direct: `board_relation_mkzdd0r4` (Contractors - Direct)
- Fallback: `deal_contact` (contacts relation) -> Contacts board `contact_account`
- Fallback display only: `deal_account` (mirror)

2. Estimating contacts:
- Prefer: `board_relation_mm065k5n` (Contacts - Direct)
- Legacy fallback: `deal_contact`

3. Leads estimate-linked values:
- Structural source: `board_relation_mktg3z60` -> linked Estimate item
- Mirrors (non-canonical): `lookup_mktg8b1z`, `lookup_mktgymd0`, etc.

4. Projects service lines:
- Prefer: `board_relation_mkp8pr9e` (direct Service Lines relation)
- Mirror context: `lookup_mktg3b6w` via linked estimate

5. Dust Permits account/contact:
- Direct: `board_relation_mkxfk8ky` (Contractors), `board_relation_mkxmh6zg` (Contacts)
- Fallback context: mirrors driven from linked Estimate relation `board_relation_mkxmhqdf`

## Audit Workflow

1. Pull schema and type metadata.
2. Pull item-level rich values with pagination.
3. Compute direct/fallback/mirror-only/unresolved buckets for each concept.
4. Break out results by group (template groups vs production groups).
5. Report two numbers separately:
- parity gaps (direct column not populated)
- unresolved business data (no fallback resolution)

## Migration Guardrails

1. Add new direct/queryable columns first.
2. Backfill with deterministic mapping logic.
3. Dual-write from automation.
4. Cut readers over to direct columns.
5. Mark legacy mirror columns deprecated.
6. Delete only after parity and automation checks pass.

## Why Monday Looks “Nested”

Monday stores each column type with different internal value shapes and exposes typed GraphQL interfaces. Relation and mirror values are often resolved at read time, so the UI can show a value while `text` remains null. This design supports flexible column types and cross-board references, but it requires typed field handling in API consumers.

## References

- Read `/Users/chiejimofor/Documents/Github/desert-services-hub/.agents/skills/monday-graphql-column-semantics/references/board-column-map.md` for live board/column semantics.
- Read `/Users/chiejimofor/Documents/Github/desert-services-hub/.agents/skills/monday-graphql-column-semantics/references/audit-checklist.md` before producing migration recommendations.
