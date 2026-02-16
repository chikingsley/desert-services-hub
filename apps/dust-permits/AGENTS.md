# Repository Guidelines

## Project Structure & Module Organization

- `src/`: main TypeScript codebase.
  - `src/index.ts`: Bun server entrypoint (API + UI routes).
  - `src/cli.ts` + `src/commands/`: CLI interface.
  - `src/handlers/`: request schemas + orchestration.
  - `src/portal/`: Playwright browser automation for the Maricopa portal.
  - `src/components/`, `src/index.html`, `src/frontend.tsx`, `src/index.css`: dashboard UI.
  - `src/db/`, `src/email/`, `src/lib/`, `src/form-data.ts`: data access + shared types.
- `tests/`: `bun:test` suites (E2E in `tests/e2e`, API/lib tests in `tests/api` and `tests/lib`).
- `docs/`: workflows, architecture, API docs, and page snapshots.
- `scripts/`, `data/`: operational scripts and seed inputs.

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run dev`: run the server with HMR.
- `bun run start`: production server.
- `bun run build`: build assets via `build.ts`.
- `bun run cli`: run CLI commands (e.g., `bun run permit:sync`, `bun run permit:renew`).
- `bun run check`: typecheck + lint.
- `bun test`: run all tests.
- `bun run create`: run the full E2E create-flow test.

## Coding Style & Naming Conventions

- Runtime: Bun-first (`Bun.serve`, `bun:sqlite`). Avoid Node-only patterns.
- Formatting/linting: `ultracite` + Biome (`bun run lint`, `bun run lint:fix`).
- Match existing naming: `*.test.ts` for tests; folders and files use existing kebab/camel patterns.

## Testing Guidelines

- Framework: `bun:test` with Playwright-based portal helpers.
- Test files live under `tests/**` and should be deterministic; avoid retry loops after failures (see `CLAUDE.md`).
- Use descriptive filenames (e.g., `create-existing-minimal.test.ts`).

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits (e.g., `feat:`, `refactor:`, `docs:`).
- PRs should include: summary, tests run (or reason not run), and screenshots/gifs for UI changes.

## Security & Configuration Tips

- Secrets live in `.env` (Bun auto-loads). Common keys: `DUST_PERMIT_USERNAME`, `DUST_PERMIT_PASSWORD`, `GEMINI_API_KEY`.
- Local services: Dashboard `http://localhost:47823`, API `http://localhost:47822`, VNC `http://localhost:47821`.

## Agent-Specific Notes

- Follow `CLAUDE.md` for Bun, testing, and portal automation rules.
