# Repository Organization & Architectural Standards

This is the definitive reference for how the desert-services-hub monorepo is organized.
Every agent, contributor, and future session should read this before making structural changes.

## System Overview

Desert Services Hub is an operations platform for a dust control and site services company.
It manages estimates, dust permits, contracts, email processing, document generation,
and integrations with SharePoint, Monday.com, Outlook, and BuildingConnected.

The system is **self-hosted** on a single server (gmk-server) running Docker containers.
External access is via Cloudflare Tunnel. The database is self-hosted Postgres (Supabase local stack).

### Design Philosophy

1. **Automation-first**: Webhooks trigger processing pipelines that run without human intervention.
2. **CLI escape hatches**: Every automated pipeline has manual CLI commands for recovery and debugging.
3. **Domain-oriented organization**: Code is grouped by what it does (permits, email, documents), not by code type (lib, worker, cli).
4. **Single source of truth**: All persistent state lives in Postgres. No local SQLite for operational data.

---

## Monorepo Structure

```text
desert-services-hub/
  packages/                 # Domain packages (the core of the system)
    aqdata/                 # Air quality data scraping and marketing intelligence
    contracts/              # Contract parsing, review pipeline, document analysis
    documents/              # Document factory: PDF analysis, generation, SSSP, SDS, takeoffs
    dust-permits/           # Dust permit browser automation (Playwright, VNC, Maricopa portal)
    email/                  # Outlook sync, classification, automation, templates, notifications
    monday/                 # Monday.com API, sync, webhooks, CLI
    narratives/             # Environmental narrative generation (Python/UV)
    sharepoint/             # SharePoint file operations, sync, SWPPP integration

  apps/
    web/                    # Frontend SPA + API routes (Bun + React)
      api/                  # Domain-grouped API routes (thin data layer)
      frontend/             # React components and pages
      server.ts             # Web server entrypoint
      webhooks.ts           # Webhook receiver entrypoint
    workers/                # Background workers and Cloudflare Workers
      buildingconnected-file-sync/   # BC attachment sync + SharePoint archival
      estimate-email-linker/         # Estimate-to-email linking logic
      estimate-poller/               # Monday.com estimate polling
      estimates-sync-worker/         # SharePoint folder sync for estimates
      inspections-email-worker/      # ComplianceGo inspections (Cloudflare Worker)
      intake-worker/                 # Email intake processing (Cloudflare Worker)
      job-runner/                    # Background job orchestrator (runs in webhooks container)
      monday-status-sync-worker/     # Monday status sync (Cloudflare Worker)
      notifications/                 # Event detection + Outlook draft creation
      outlook-folder-watcher/        # Outlook folder polling + project linking
      swppp-sync/                    # (moved to packages/sharepoint/workers/swppp-master-poller/)

  db/                       # Database schema, repositories, types, migrations
    (currently at lib/db/)   # Will move to db/ as migration completes

  lib/                      # Shared libraries (legacy location, migrating into packages/)
    catalog/                # Service catalog + dust permit fee tiers
    db/                     # Postgres client, repositories, types
    estimating/             # Estimate payload validation
    graph/                  # Microsoft Graph API client
    pdf/                    # PDF generation utilities
    pdf-takeoff/            # PDF quantity takeoff
    takeoff/                # Takeoff calculations

  supabase/
    migrations/             # Postgres migration files (applied in order)

  docker-compose.yml        # All Docker service definitions
  tsconfig.json             # TypeScript config with path aliases
  biome.jsonc               # Linter and formatter configuration
```

---

## Design Patterns

### 1. Resource Module Pattern (Primary)

**Reference**: [Google AIP-121: Resource-Oriented Design](https://google.aip.dev/121)

APIs and client libraries are organized by **resource type** (noun), not by operation type (verb).
Each resource gets its own file containing the standard operations for that resource
(get, list, create, update, delete).

**Used by**: Stripe SDK, GitHub Octokit, Kubernetes client-go.

**Example** -- SharePoint client:

```sql
packages/sharepoint/
  src/
    client.ts               # Facade: auth, default drive caching, convenience methods
    resources/
      sites.ts              # getRootSite, searchSites, getSiteByPath, getSiteById
      drives.ts             # listDrives, listDriveItems, listFolderItems
      files.ts              # upload, uploadLargeFile, download, search
      folders.ts            # createFolder, ensureFolder, mkdir, exists, delete
      items.ts              # getByPath, moveItem, deleteItem
      lists.ts              # listLists, getListItems, addListItem, updateListItem
      workbooks.ts          # getWorksheetData
    helpers/
      pagination.ts         # collectPages (PageIterator wrapper)
      parsers.ts            # parseSite, parseItem, responseToBuffer
    types.ts
    paths.ts
```

**When to use**: Any client that wraps an external API with more than ~10 methods.
Split by resource type. Each file should stay under 300 lines.

**When NOT to use**: For very large APIs (100+ operations), consider the Command Pattern
(one file per operation) as used by AWS SDK v3. For our scale, Resource Module is the right fit.

### 2. Facade + Gateway Pattern

**References**: Gang of Four (1994), [Martin Fowler: Gateway Pattern](https://martinfowler.com/articles/gateway-pattern.html)

Each package that wraps an external API exposes a **facade** -- a simplified interface
that delegates to resource modules internally. The facade handles:
- Authentication and connection setup
- Default configuration (e.g., default SharePoint drive)
- Convenience methods that combine multiple resource operations

The facade IS the public API of the package. Resource modules are internal.

**Example**:
```typescript
// Consumer code uses the facade:
const sp = new SharePointClient(config);
await sp.upload("Customer Projects/Active", "file.pdf", buffer);

// Internally, the facade delegates to resources/files.ts
```

### 3. CLI Command Module Pattern

**References**: [Commander.js](https://github.com/tj/commander.js/issues/983), [Cobra](https://github.com/spf13/cobra/issues/641), [Typer](https://typer.tiangolo.com/)

CLI tools follow one file per command group, separated from core logic.

```text
packages/<domain>/
  cli/
    sync.ts               # Sync commands
    query.ts              # Query/search commands
    admin.ts              # Admin/maintenance commands
  src/
    ...                   # Core logic (importable, no CLI dependencies)
```

**Key rule**: CLI files import from `src/`. Core logic in `src/` never imports from `cli/`.
This ensures the logic can be used both by CLI commands and by automated pipelines.

### 4. Repository Pattern (Database Access)

**Reference**: Martin Fowler, *Patterns of Enterprise Application Architecture*

Database queries are centralized in repository files under `lib/db/repositories/`.
Each repository file maps to one or two database tables and exposes named functions.

```typescript
// Consumer code:
import { getProjectById, createProject } from "@lib/db/repositories";

// NOT this:
db.query("SELECT * FROM projects WHERE id = $1", [id]);
```

**Repositories stay centralized** in `lib/db/repositories/` (future: `db/repositories/`).
The database is its own domain. Every package imports from it; no package duplicates it.

---

## Package Internal Structure

Every package follows this consistent internal layout:

```text
packages/<domain>/
  src/                    # Core logic -- what other packages import
    client.ts             # External API client (if applicable)
    resources/            # Resource modules (if client is large)
    helpers/              # Internal utilities
    types.ts              # Domain types
  cli/                    # CLI commands -- human-operated escape hatches
  workers/                # Long-running processes (if any)
  tests/                  # Tests
  docs/                   # Documentation
```

| Folder | Purpose | Can import from | Imported by |
|--------|---------|-----------------|-------------|
| `src/` | Core domain logic | `lib/db`, other packages' `src/` | Everything |
| `cli/` | Manual operations | Own `src/`, `lib/db` | Nothing (entrypoints only) |
| `workers/` | Docker container entrypoints | Own `src/`, `lib/db` | docker-compose.yml |
| `tests/` | Test files | Own `src/`, own `cli/` | Test runner only |

**The rule**: `src/` is the importable library. `cli/` and `workers/` are entrypoints
that consume `src/`. Logic flows inward, never outward.

---

## Code Quality Standards

### Enforced by Biome (biome.jsonc)

| Rule | Limit | Rationale |
|------|-------|-----------|
| Cognitive complexity | **20** per function (target: 15) | [SonarSource whitepaper](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) |
| Lines per file | **300** | Forces modular decomposition |

### Refactoring Techniques (for reducing complexity)

1. **Extract Method** -- Pull complex logic into named functions. Method calls are "free" in complexity scoring.
2. **Early Return / Guard Clauses** -- Handle edge cases first, return immediately. Reduces nesting.
3. **Flatten Conditionals** -- Replace nested `if/else` with early exits.
4. **Lookup Tables** -- Replace long `if/else if` chains with `Record<string, handler>` maps.
5. **Single Responsibility** -- If a function does "fetch + parse + validate + transform", split it into four.

### Naming Conventions

- Package folders: kebab-case (`dust-permits`, `pdf-analysis-cli`)
- TypeScript files: kebab-case (`sharepoint-sync.ts`, `intake-upload.ts`)
- Python files: snake_case (`document_map.py`, `scanner.py`)
- Classes: PascalCase (`SharePointClient`, `SwpppMasterClient`)
- Functions: camelCase (`getProjectById`, `syncWorksheet`)
- Database tables: snake_case (`dust_permits_filed_by_desert_services`)

---

## Docker Services

Each Docker service maps to an entrypoint in the codebase.

| Service | Container | Port | Entrypoint | Package |
|---------|-----------|------|-----------|---------|
| `web` | `desert-web` | 3000 | `apps/web/server.ts` | `apps/web/` |
| `webhooks` | `desert-webhooks` | 4747 | `apps/web/webhooks.ts` | `apps/web/` + `apps/workers/job-runner/` |
| `permit-worker` | `desert-permit-worker` | 47822 | `packages/dust-permits/src/index.ts` | `packages/dust-permits/` |
| `buildingconnected-sync` | `desert-buildingconnected-sync` | -- | `apps/workers/buildingconnected-file-sync/cli/watch.ts` | `apps/workers/buildingconnected-file-sync/` |
| `notifications` | `desert-notifications` | -- | `apps/workers/notifications/cli/watch.ts` | `apps/workers/notifications/` |
| `swppp-sync` | `desert-swppp-sync` | -- | `packages/sharepoint/workers/swppp-master-poller/cli/sync.ts` | `packages/sharepoint/` |
| `tunnel` | `desert-tunnel` | -- | Cloudflare tunnel config | -- |

**Cloudflare Workers** (deployed to Cloudflare edge, not Docker):

| Worker | Folder | Purpose |
|--------|--------|---------|
| `intake-worker` | `apps/workers/intake-worker/` | Email intake from Cloudflare email routing |
| `inspections-email-worker` | `apps/workers/inspections-email-worker/` | ComplianceGo → SharePoint |
| `monday-status-sync-worker` | `apps/workers/monday-status-sync-worker/` | Monday.com status sync |

**Sub-workers** (run inside the `webhooks` container via job-runner):

| Worker | Folder | Trigger |
|--------|--------|---------|
| `estimate-poller` | `apps/workers/estimate-poller/` | Timer (every 60s) |
| `estimate-email-linker` | `apps/workers/estimate-email-linker/` | Timer (every 60s) |
| `outlook-folder-watcher` | `apps/workers/outlook-folder-watcher/` | Timer (every 30s) |
| `estimates-sync-worker` | `apps/workers/estimates-sync-worker/` | Job dispatch |

---

## Database Principles

1. **All persistent state goes to Postgres** (self-hosted Supabase on port 54322).
2. **No SQLite for operational data.** Only acceptable: throwaway CLI caches.
3. **Access via repositories only.** Never write raw SQL in domain logic.
   Import from `@lib/db/repositories`.
4. **Migrations in `supabase/migrations/`** with timestamp prefix: `20260214230000_description.sql`.
5. **Connection**: `import { db } from "@lib/db/hub"` -- Postgres via Bun.sql.

### Core Tables

| Table | Domain | Purpose |
|-------|--------|---------|
| `projects` | Projects | All projects (name, contractor, folder, status) |
| `accounts` | Projects | Contractor/company accounts |
| `contacts` | Projects | People (email, phone, title) |
| `emails` | Email | Synced Outlook emails (647K rows, ~5GB) |
| `attachments` | Email | Email attachment metadata |
| `estimates` | Estimates | Bid estimates from Monday.com |
| `estimate_versions` | Estimates | Versioned estimate snapshots |
| `estimate_line_items` | Estimates | Individual line items per version |
| `dust_permits_filed_by_desert_services` | Permits | Maricopa dust permits |
| `documents` | Documents | Parsed documents + extraction JSON |
| `notifications` | Email | Notification event log |
| `webhook_jobs` | Infrastructure | Background job queue |
| `swppp_work_orders` | SharePoint | SWPPP Master data (synced from SharePoint) |
| `tracked_folders` | Email | Outlook folder watcher state |

---

## TypeScript Path Aliases

Defined in `tsconfig.json`. These must be updated as packages migrate.

| Alias | Current Path | Target Path |
|-------|-------------|-------------|
| `@lib/*` | `lib/*` | `lib/*` (stays) |
| `@sharepoint/*` | `packages/sharepoint/src/*` | `packages/sharepoint/src/*` |
| `@email/*` | `packages/email/src/*` | `packages/email/src/*` |
| `@monday/*` | `packages/monday/src/*` | `packages/monday/src/*` |
| `@aqdata/*` | `packages/aqdata/src/*` | `packages/aqdata/src/*` |
| `@contract/*` | `packages/contracts/*` | `packages/contracts/*` |
| `@/components/*` | `apps/web/frontend/components/*` | `apps/web/frontend/components/*` |
| `@/pages/*` | `apps/web/frontend/pages/*` | `apps/web/frontend/pages/*` |
| `@/api/*` | `apps/web/api/*` | `apps/web/api/*` |

---

## Email Templates

**All email templates live in one place**: `packages/email/src/email-templates/`

Templates are Handlebars (`.hbs`) files. Do not create email templates in other packages.
If a domain needs to send an email, it uses the template system from the email package.

---

## Polyglot Strategy

The monorepo is polyglot: TypeScript (Bun) for the web layer and integrations,
Python (UV) for document processing and AI/ML workloads.

| Language | Runtime | Used For |
|----------|---------|----------|
| TypeScript | Bun | Frontend, API, integrations (SharePoint, Monday, Outlook), permit automation |
| Python | UV | PDF analysis (Gemini), contract review, environmental narratives |

### Python Packages (UV Workspace Members)

Python packages use UV with `pyproject.toml` per package. They can be run with `uv run`.

| Package | Path | Purpose |
|---------|------|---------|
| `narratives` | `packages/narratives/` | Environmental narrative generation |
| `contracts` | `packages/contracts/review/` | Contract document analysis |
| `pdf-analysis` | `packages/documents/pdf-analysis-cli/` | PDF extraction with Gemini |

---

## Migration Status

Packages that have been moved to their domain folders:

| Package | Status | Moved From |
|---------|--------|------------|
| `packages/dust-permits/` | Complete | `apps/workers/permit-workers/` (deleted) |
| `packages/email/` | Complete | `apps/cli-tools/email-cli/` (deleted) |
| `packages/monday/` | Complete | `apps/cli-tools/monday-cli/` (deleted) |
| `packages/sharepoint/` | Complete | `apps/cli-tools/sharepoint-cli/` (deleted) |
| `packages/aqdata/` | Complete | `apps/cli-tools/aqdata-cli/` (deleted) |
| `packages/contracts/` | Complete | `apps/contract/` (deleted) |
| `packages/narratives/` | Complete | `apps/narrative/` (deleted) |
| `packages/documents/` | Complete | PDF analysis CLI + PDF generation CLI (old paths deleted) |

Workers still in `apps/workers/` (to be evaluated for migration into packages):

| Worker | Target Package | Notes |
|--------|---------------|-------|
| `notifications/` | `packages/email/` | Rename: "email automation", not just notifications |
| `outlook-folder-watcher/` | `packages/email/` | Email domain owns folder watching |
| `estimate-email-linker/` | `packages/email/` or `packages/estimates/` | TBD |
| `estimate-poller/` | `packages/estimates/` (future) | Monday.com estimate sync |
| `estimates-sync-worker/` | `packages/sharepoint/` or `packages/estimates/` | SharePoint folder sync |
| `swppp-sync/` | `packages/sharepoint/` | Moved → `packages/sharepoint/workers/swppp-master-poller/` |
| `buildingconnected-file-sync/` | `packages/buildingconnected/` (future) | Needs own package |
| `job-runner/` | `apps/workers/job-runner/` | Stays -- orchestrator, not domain logic |

Shared libraries still in `lib/` (to be evaluated):

| Library | Target | Notes |
|---------|--------|-------|
| `lib/db/` | `db/` (root level) | Central DB layer, shared by all packages |
| `lib/catalog/` | `lib/catalog/` or `packages/estimates/` | Fee schedule + pricing |
| `lib/estimating/` | `packages/estimates/` (future) | Estimate validation |
| `lib/graph/` | `lib/graph/` | Microsoft Graph auth -- used by email, sharepoint |
| `lib/pdf/` | `packages/documents/` | PDF generation utilities |
| `lib/pdf-takeoff/` | `packages/documents/` | PDF quantity takeoff |
| `lib/takeoff/` | `packages/documents/` | Takeoff calculations |
| `lib/project-matching.ts` | `lib/` or `packages/projects/` (future) | Shared matching logic |

---

## References

- [Google AIP-121: Resource-Oriented Design](https://google.aip.dev/121)
- [Stripe Node SDK: Resource Module Pattern](https://github.com/stripe/stripe-node/tree/master/src/resources)
- [Martin Fowler: Gateway Pattern](https://martinfowler.com/articles/gateway-pattern.html)
- [Gang of Four: Facade Pattern](https://refactoring.guru/design-patterns/facade)
- [Azure SDK TypeScript Design Guidelines](https://azure.github.io/azure-sdk/typescript_design.html)
- [SonarSource: Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf)
- [UV Docker Integration Guide](https://docs.astral.sh/uv/guides/integration/docker/)
- [Python Monorepo with UV](https://gafni.dev/blog/cracking-the-python-monorepo/)
