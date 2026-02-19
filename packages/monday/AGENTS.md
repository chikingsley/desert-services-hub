# Monday Package (`packages/monday`)

Monday.com API client, board schema, CLI utilities, and status/link sync jobs.

## Scope

- `src/client/*`: low-level GraphQL query/update helpers.
- `src/types/schema.ts`: canonical board/column/group ids.
- `src/sync/*`: sync pipelines and status/link reconciliation logic.
- `cli/*`: operational CLI commands for boards/items/columns/groups/audits.

## Rules

- Use `BOARD_IDS` + `*_COLUMNS` constants from `src/types/schema.ts`; do not hardcode ids in business logic.
- Prefer `updateItem()` from `src/client/search.ts` for column writes.
- Keep status mappings deterministic and centralized in `src/sync/status-sync/utils.ts`.
- Never assume optional env flags are enabled in production; log clearly when features are disabled.
- For project/estimate/leads linkage, use relation columns and idempotent append behavior.

## Operational Notes

- Status sync entrypoint (background worker) calls:
  - `runCleanup()` (GC Not Awarded cleanup)
  - `runLeadsSync()` (lead overall status mirror)
  - `runProjectLinkSync()` (Estimate/Lead/Project relation enforcement)
- Project seed sync now lives in:
  - `src/sync/project-seed/sync.ts` (seed lifecycle + canonical linking)
  - `cli/project-seed-sync.ts` (manual seed/stale runs)
  - `cli/backfill-files.ts` (manual Monday asset re-download/backfill)
- CLI examples:
  - `bun packages/monday/cli/cli.ts boards`
  - `bun packages/monday/cli/cli.ts columns estimating`
  - `bun packages/monday/cli/cli.ts update estimating <itemId> '{"deal_stage":{"label":"Won"}}'`

## Testing / Validation

- Validate column IDs with CLI before writing automation changes.
- Prefer dry-run style checks where available before bulk updates.
- Keep tests under top-level `tests/packages/monday/...` (not inside package source).
