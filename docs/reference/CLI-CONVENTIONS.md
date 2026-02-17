# CLI Conventions

This repo currently has three CLI shapes. Use these as the canonical patterns when splitting large files.

## 1) Subcommand Loader (preferred for large CLIs)

Use this when the CLI has many domains/actions and you want clean per-command modules.

Reference:
- `apps/dust-permits/src/cli.ts`
- `apps/dust-permits/src/commands/**`

Pattern:
- `src/cli.ts` owns command registry only.
- Each subcommand lives in `src/commands/<domain>/<action>.ts`.
- Lazy-load subcommands (`() => import(...).then(...)`) to keep startup fast.
- Shared command helpers go in `src/commands/_shared/*`.

## 2) Handler Registry Map

Use this when commands are already grouped by feature and exported as handler maps.

Reference:
- `packages/email/cli/cli.ts`
- `packages/email/src/commands/*.ts`

Pattern:
- `cli/cli.ts` merges handler maps and dispatches by command name.
- Each command module exports typed handlers.
- Keep `showHelp()` in entrypoint; business logic stays in command modules.

## 3) Parse + Validate + Delegate (single-purpose CLI)

Use this for focused tools with a small command surface.

Reference:
- `packages/documents/pdf-generation/cli/cli.ts`

Pattern:
- Parse flags with `parseArgs`.
- Validate flags with `zod`.
- Delegate to functions in `src/*`.
- Keep IO/path/error helpers in a shared `common` module.

## Standard Layout for New CLIs

```text
apps/<tool>/cli/cli.ts
apps/<tool>/src/commands/<domain>/<action>.ts
apps/<tool>/src/commands/_shared/*.ts
apps/<tool>/src/lib/*.ts
```

Rules:
- Entry point should orchestrate only (parse, route, exit code).
- Command modules should contain command behavior, not low-level reusable logic.
- Reusable logic belongs in `src/lib/*`.
- Prefer explicit types for command inputs/outputs.
