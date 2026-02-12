# CLI Tools Organization

This folder contains operational CLIs for Monday, SharePoint, quoting, email, and PDF workflows.

## Structure Standard

Use this structure for each CLI package:

- `bin/` executable entrypoints (`bun .../bin/<command>.ts`)
- `docs/` runbooks and integration notes
- `src/` reusable modules/libraries (or equivalent domain folders)
- `tests/` test files
- `data/` local runtime outputs (SQLite dumps, temp exports; commit only placeholders)

## Conventions

- Keep top-level files minimal (`README.md`, config files, and high-signal docs only).
- Put all runnable scripts in `bin/` so command surface is obvious.
- Keep business logic out of `bin/`; import from modules instead.
- Never commit virtualenvs/caches (`.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`).
- Use explicit full paths in usage docs from repo root.

## Current Entrypoints

- Monday:
  - `bun apps/cli-tools/monday-cli/bin/sync-estimates.ts`
  - `bun apps/cli-tools/monday-cli/bin/extract-procurement.ts`
- SharePoint:
  - `bun apps/cli-tools/sharepoint-cli/bin/walk.ts`
  - `bun apps/cli-tools/sharepoint-cli/bin/sync-project-files.ts`
  - `bun apps/cli-tools/sharepoint-cli/bin/batch-sync.ts`
- Quoting:
  - `bun apps/cli-tools/quoting-cli/bin/cli.ts`
- PDF:
  - `bun apps/cli-tools/pdf-cli/bin/cli.ts`
- Email:
  - `bun apps/cli-tools/email-cli/bin/cli.ts`
  - `bun apps/cli-tools/email-cli/bin/docusign-link-watcher.ts`
  - `bun apps/cli-tools/email-cli/bin/test-deep-search.ts`
  - `bun apps/cli-tools/email-cli/bin/bc-bids-sync.ts`
  - `bun apps/cli-tools/email-cli/bin/enrich-accounts.ts`
