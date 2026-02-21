# Desert Services Hub

Monorepo for Desert Services operations: estimating, permits, contracts, notifications, and document generation.

## Repo-Wide Rules

- Runtime is self-hosted on `gmk-server` only.
- Operational state is in local Postgres (`host.docker.internal:54322`), not SQLite.
- External traffic is Cloudflare Tunnel to Docker services.
- Lint/format policy: never run `biome`; use `ultracite` only.
- Test placement policy: keep tests in top-level `tests/` only, mirrored by domain path (for example `tests/apps/web/...`, `tests/lib/...`, `tests/packages/...`). Do not place new tests inside `apps/*`, `lib/*`, or `packages/*`.
- For permit-worker API calls from app code, use `@permits/client` (`PermitClient`), not ad-hoc `fetch()`.
- Permit runtime and permit client are separate concerns:
  - `apps/dust-permits/` = Playwright runtime + API server.
  - `packages/permits/` = typed HTTP client contract.

## Monorepo Map

```text
apps/
  web/                   # Frontend SPA + API
  background-jobs/       # Webhook receiver + queue + polling workers
  dust-permits/          # Permit-worker runtime (Playwright + API)
  dust-permits-mcp/            # MCP server for AI agent permit operations
  aqdata-worker/         # AQData worker (export sync + detail scrape + PDF enrichment)
  cf-workers/            # Cloudflare Workers

packages/
  permits/               # @permits/client typed permit-worker client
  siteline/              # Siteline GraphQL client + MCP tools + schema refs
  monday/                # Monday.com API operations
  email/                 # Graph + email templates
  enrichment/            # PDL, Jina, Clearbit, avatar enrichment services
  documents/             # PDF analysis/generation pipelines
  contracts/             # Contract tooling
  narratives/            # Narrative generation

lib/
  db/                    # Postgres client/repositories/types
  catalog/               # Service catalog + pricing
  estimating/            # Estimate logic
  graph/, sharepoint/    # Microsoft Graph + SharePoint helpers
  pdf/, pdf-takeoff/     # Shared PDF utilities
```

## Scoped AGENTS (Use Nearest Scope)

- `apps/dust-permits/AGENTS.md`: permit runtime API, browser automation, E2E/VNC run context.
- `apps/dust-permits-mcp/AGENTS.md`: MCP server for AI agent permit operations (17 tools).
- `apps/aqdata-worker/AGENTS.md`: AQData sync/scrape runtime, parser/persistence boundaries.
- `packages/permits/AGENTS.md`: typed client contract and types.
- `packages/siteline/AGENTS.md`: Siteline GraphQL client + MCP read-only tooling + schema drift guards.
- `apps/background-jobs/AGENTS.md`: webhook jobs, notification triggers, sync/linking worker rules.
- `apps/web/AGENTS.md`: estimate API guardrails and permit API integration from web.
- `packages/enrichment/AGENTS.md`: PDL, Jina, Clearbit enrichment services (standalone, no email dependency).
- `packages/documents/AGENTS.md`: SSSP/SDS generation workflow rules.

## Docker Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| `web` | `desert-web` | 3000 | Frontend + API |
| `background-jobs` | `desert-webhooks` | 4747 | Webhooks + jobs + timers |
| `permit-worker` | `desert-permit-worker` | 47822 API, 6080 VNC | Permit browser automation |
| `aqdata-worker` | `desert-aqdata-worker` | 47823 | AQData export sync + detail scrape |
| `tunnel` | `desert-tunnel` | — | Cloudflare tunnel |

## Permit Worker Integration

- **AI agents (Claude Code)**: Use MCP tools from `apps/dust-permits-mcp/` — auto-discovered via `.mcp.json`.
- **App code** (web, background-jobs): Use `PermitClient` from `@permits/client` (defaults to `http://permit-worker:47822`).
- **Never** write inline bun scripts or raw curl for permit operations.

## Canonical Commands

```bash
# Build/deploy runtime

docker compose build web background-jobs permit-worker
docker compose up -d

# Logs

docker compose logs -f web
docker compose logs -f background-jobs
docker compose logs -f permit-worker

# Permit client integration tests (live permit-worker container; no mock server)

bun run permits:guard:no-mock
bun run permits:test:client

# Renew+pay E2E in permit-worker runtime context

bun run permits:test:renew-and-pay
```

## Database Access

```bash
# from gmk-server

docker exec supabase_db_desert-services-hub psql -U postgres

# from tailscale client

psql -h gmk-server -p 54322 -U postgres
```

## Intake Refactor Contract (Strict)

Build code as thin orchestration + isolated processors. No exceptions unless explicitly approved.

### Architecture Rules

- Keep runners/jobs thin. They only coordinate flow, retries, and persistence calls.
- Put document/file processing logic in `packages/documents/*`, not in job runners.
- One processor per file/domain concern (pdf, image, office, text, zip, classify).
- Shared logic goes in small reusable modules (no giant utility blobs).
- No compatibility aliases/shims. Use only `tsconfig` path aliases.
- No dead code, no parallel legacy paths, no temporary fallback branches.

### File and Type Rules

- Type-only files must be named `types.ts` and contain only types/interfaces.
- Do not define runtime logic in `types.ts`.
- Avoid re-export chains unless needed for public package API.
- Keep imports explicit and local to the boundary module.

### Pipeline Rules

- Default pipeline is `extract -> classify`.
- Keep OCR as a separate higher-level pipeline, not implicit fallback in the fast path.
- Prefer deterministic stage boundaries and composable functions.

### Quality Gates (Required Before Done)

- Run `ultracite` on every touched file.
- Never run `biome check`.
- Add/adjust tests for touched behavior (unit first; integration when boundary changed).
- Verify no stale imports/references remain after refactor.
- Verify old replaced module is deleted in the same PR/commit.

### Commit Rules

- Atomic commits only (single concern per commit).
- Commit message must state architectural intent (e.g. `refactor(intake): split processors by file type`).
- Do not mix unrelated cleanup into the same commit.

### PR/Review Output Format

- First: findings/risks/regressions.
- Then: changed files and why.
- Then: exact commands run (lint/tests/typecheck) and result.

### Reference Standards

- Hexagonal Architecture (Ports and Adapters): <https://alistair.cockburn.us/hexagonal-architecture>
- Layered Architecture (Presentation-Domain-Data): <https://martinfowler.com/bliki/PresentationDomainDataLayering.html>
- Pipes and Filters: <https://learn.microsoft.com/en-us/azure/architecture/patterns/pipes-and-filters>

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
