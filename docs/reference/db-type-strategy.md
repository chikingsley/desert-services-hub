# Database Type Strategy (Official)

Status: Active  
Owner: Platform / Data Layer  
Last updated: 2026-02-26

## Why this exists

The current DB layer has grown organically and now mixes:

- schema-shaped types
- app/domain types
- API payload types
- convenience re-exports and aliases
- duplicated parsing and matching utilities

This document defines the canonical strategy so we can refactor incrementally without breaking the system.

## Goals

1. One canonical source of truth for DB row shape.
2. Clear boundary between DB rows and app/domain models.
3. Runtime validation at trust boundaries, not everywhere.
4. Eliminate duplicate type aliases and parser logic.
5. Make repository behavior easy to test and safe to evolve.

## Non-goals

1. Big-bang rewrite of all repositories.
2. Immediate ORM migration.
3. Converting every internal function to Zod.

## Canonical layers

### 1) Schema types (source of truth)

- Source: generated from Postgres schema.
- Shape: exact DB columns (`snake_case`, nullable exactly as schema defines).
- Location target: `lib/db/generated/database.types.ts`.
- Generation command:

```bash
supabase gen types typescript --local > lib/db/generated/database.types.ts
```

### 2) Repository row types

- Derived from schema types; never hand-maintained if avoidable.
- Used only inside repositories.
- Must remain schema-shaped (`snake_case`).

### 3) Domain types

- Used by app/package code outside repositories.
- CamelCase, domain-oriented naming.
- Produced by explicit repository mappers (row -> domain).

### 4) Transport/input-output types

- HTTP request/response contracts, external integration payloads.
- Validated with Zod at boundaries.
- Must not be treated as DB row types.

## Zod policy

Use Zod at trust boundaries:

1. HTTP request params/body/query.
2. External API payloads (Graph, Monday, webhooks, etc.).
3. Untrusted DB payload fields (`jsonb`, legacy JSON text columns).

Do not require Zod for every internal function signature. Internal transforms can use TypeScript types after boundary validation.

## Zod 4 strategy (canonical)

This repo standardizes on Zod 4 APIs for all active packages.

### Where Zod schemas must exist

1. HTTP/API handlers:
   1. request body/query/path parsing
   2. webhook payload parsing
2. External service boundaries:
   1. Graph/Monday/Supabase/webhook payloads
   2. LLM structured outputs
3. Untrusted persisted payload fields:
   1. `jsonb` and legacy JSON text blobs before conversion to domain types

### Where Zod schemas should not be added

1. Pure internal function parameters after boundary parse.
2. Repository row/domain mapping internals where compile-time types already constrain shape.

### Canonical Zod 4 APIs

1. Type derivation:
   1. `z.infer<typeof Schema>` for basic derived type
   2. `z.input<typeof Schema>` when working with pre-transform shape
   3. `z.output<typeof Schema>` when working with post-transform shape
2. Object strictness:
   1. `z.strictObject({...})` (reject unknown keys)
   2. `z.looseObject({...})` (allow unknown keys)
3. String formats:
   1. `z.email()`, `z.url()`, `z.uuid()`, `z.iso.datetime()`, etc.
4. Enum objects:
   1. `z.enum(MyEnumObject)` (replace `z.nativeEnum`)
5. Error formatting:
   1. `z.treeifyError(error)` / `z.flattenError(error)` / `z.prettifyError(error)`

### Deprecated API replacements (required for new/edited code)

1. `z.string().email()` -> `z.email()`
2. `z.string().url()` -> `z.url()`
3. `z.string().uuid()` -> `z.uuid()`
4. `z.string().datetime()` -> `z.iso.datetime()`
5. `z.nativeEnum(...)` -> `z.enum(...)`
6. `.strict()` -> `z.strictObject({...})`
7. `.passthrough()` -> `z.looseObject({...})`
8. `error.flatten()` -> `z.flattenError(error)`
9. `required_error` / `invalid_type_error` -> `error` parameter

### SuperRefine policy

1. Existing `.superRefine(...)` can remain during migration for behavior stability.
2. New code should prefer `.check(...)` only when readability and tests are clear.
3. Do not run blind codemods from `.superRefine` to `.check` because signatures are not drop-in.

### Monorepo version rule

1. Active workspaces must not pin Zod 3 while other active packages use Zod 4.
2. If a workspace is intentionally legacy:
   1. isolate it with clear owner
   2. add explicit migration issue/milestone
   3. avoid leaking legacy schemas into shared packages

## Repository rules

1. Repositories own SQL.
2. Repository inputs and outputs are typed and stable.
3. Repository internals may use row types, but callers should receive domain types.
4. No raw `JSON.parse()` in row mappers; use shared safe parsers.
5. No `as Record<string, unknown>` in new repository code.
6. No new `*Internal` alias/re-export patterns.

## Naming rules

1. DB/schema/row: `snake_case`.
2. Domain/app: `camelCase`.
3. Conversion happens in one place: mapper function per repository entity.
4. Avoid mixed-shape objects leaving repositories.

## Legacy compatibility rule

Temporary compatibility barrels are allowed only if all are true:

1. They include `@deprecated` comments.
2. They point to the canonical type/module.
3. They have a tracked removal issue/milestone.

## Rollout plan (strangler, not rewrite)

### Phase 0: Freeze and guardrails

1. Adopt this doc.
2. Add lint/CI checks to block new anti-patterns in `lib/db/repositories/`.
3. Add baseline metrics script.

### Phase 1: Schema source-of-truth

1. Generate and commit `lib/db/generated/database.types.ts`.
2. Create `lib/db/parsers.ts` for shared safe parsing:
   1. `parseJsonArray`
   2. `parseJsonRecord`
   3. `parseBoolInt`
   4. `parseNumberOrNull`
3. Document generation/update command in contributor docs.

### Phase 2: High-risk repository migration

Start with `email`, `estimate`, `attachment` repositories.

1. Introduce explicit row types from generated schema.
2. Replace direct casts and raw JSON parsing.
3. Add mapper tests for malformed/legacy data.

### Phase 3: Estimate stack consolidation

1. Fix estimate ID/type mismatches (`string` vs `integer` drift).
2. Consolidate duplicate invariants:
   1. current-version guarantee
   2. base-number generation
3. Remove duplicate logic copies in API/package layers.

### Phase 4: Alias and duplication cleanup

1. Break up `lib/db/types.ts` into focused modules (or keep as thin exports-only barrel).
2. Remove `*Internal` alias wrappers.
3. Remove duplicate utility functions (`tokenOverlap`, `uniqueStrings`, etc.) by moving to one canonical utility module per domain.

### Phase 5: Enforcement

1. Escalate lint checks from warning -> error.
2. Require mapper tests for new repositories.
3. Block PRs that add new compatibility aliases without deprecation metadata.

### Phase 6: Zod 4 normalization sweep

1. Align workspace dependencies to Zod 4 (including adapter libraries that peer-depend on Zod).
2. Run codemods for mechanical replacements:
   1. string format helpers
   2. native enum
   3. strict/passthrough object APIs
   4. error flattening
3. Run targeted manual fixes for non-mechanical cases:
   1. `superRefine` migrations
   2. custom error map semantics
4. Validate with typecheck + test suites per workspace.
5. Add CI guard to block new deprecated Zod 3-style APIs in active packages.

## Current baseline (2026-02-26)

From quick audit:

1. `as Record<string, unknown>` in `lib/db/repositories/*`: 17
2. `JSON.parse(` in `lib/db/repositories/*`: 12
3. `getNextBaseNumber(` duplicates across repo: 7
4. `*Internal` alias/re-export patterns in audited DB type files: 38

These numbers should go down each phase.

## Decision notes

1. We stay SQL-first right now.
2. We adopt schema-generated types (Supabase CLI) as row truth.
3. We keep Zod for boundary validation and untrusted payload parsing.
4. We defer ORM migration until this cleanup stabilizes boundaries.

## External references

1. Supabase TypeScript support: https://supabase.com/docs/reference/javascript/typescript-support
2. Supabase CLI type generation: https://supabase.com/docs/reference/cli/supabase-gen-types
3. Trigger.dev task typing and trigger behavior: https://trigger.dev/docs/tasks-overview
4. Trigger.dev metadata typing with Zod pattern: https://trigger.dev/docs/runs/metadata
