# Desert Services Hub

The unified platform for Desert Services, combining Bun full-stack web applications with core automation services, background task workers, and Model Context Protocol (MCP) integrations.

## Deployment Model

- Primary runtime is **self-hosted** on `gmk-server`.
- Core services and operational Postgres run in local Docker containers.
- Public access is exposed through **Cloudflare Tunnel**.
- Treat runtime database changes as local self-hosted DB operations (not a separate hosted Supabase environment).

## Repository Architecture

This repository is organized into multiple pillars:

- **Applications** (`apps/`): Bun full-stack React applications
  - `apps/web/` — Main estimation/takeoff application (estimates, takeoffs, contracts, catalog)
  - `apps/quoting/` — Quoting MCP server (catalog, PDF generation)
  - `apps/pdf-analysis/` — Unified Python OCR and PDF analysis CLI (Gemini, local, Mistral)
- **Services** (`services/`): Bun-native automation logic and API clients
- **Workers** (`workers/`): Cloudflare Workers for background tasks
- **Shared Libraries** (`lib/`): Common utilities, types, and database schemas

```bash
apps/           # Bun full-stack applications
├── web/        # Main app: estimates, takeoffs, contracts, catalog
├── quoting/    # Quoting MCP server (moved from services/)
└── pdf-analysis/ # Python OCR/analysis CLI (Gemini, local, Mistral)

services/       # Core automation services
├── email/      # Microsoft Graph email client
├── monday/     # Monday.com CRM integration
├── notion/     # Project tracking and CRM helpers
├── sharepoint/ # Document management
├── enrichment/ # Data enrichment (PDL, Clearbit)
├── jina/       # Web scraping and PDF extraction
├── mistral/    # Deprecated stub (moved to apps/pdf-analysis/)
├── n8n/        # n8n workflow automation client
└── file-automation/ # DocuSign, Building Connected automation

workers/        # Cloudflare Workers
├── ds-contracts-dispatcher/
├── ds-estimates-sync-worker/
├── ds-inspections-email-worker/
└── ds-monday-status-sync-worker/

lib/            # Shared libraries
├── db/         # Database adapter, repositories, and shared DB types
├── pdf/        # PDF utilities
└── schemas/    # Zod validation schemas

data/           # Runtime outputs and token caches
docs/           # Business logic, SOPs, and system design
```

## Core Services

The following services are integrated and available for both automation scripts and the web application:

- **Email (`services/email`)**: Microsoft Graph client for organizational email automation.
- **MondayCRM (`services/monday`)**: High-performance integration with Monday.com boards.
- **Quoting (`apps/quoting/`)**: Pricing logic and multi-page PDF estimate generation (MCP server).
- **Notion (`services/notion`)**: Project tracking and CRM helpers with deduplication.
- **SharePoint (`services/sharepoint`)**: Document management and file automation.
- **PDF Analysis (`apps/pdf-analysis/`)**: Unified Python OCR and document analysis (Gemini, local, Mistral).
- **Enrichment (`services/enrichment`)**: Data enrichment for leads and companies.

## Primary Database

**Self-hosted Postgres (Supabase local stack)** (`postgresql://postgres:postgres@host.docker.internal:54322/postgres`)

The consolidated operational database containing:

- 237K+ emails across all mailboxes
- 125K+ attachments cataloged
- 4,800+ estimates synced from Monday
- 3,600+ accounts (contractors/companies)
- Contacts, projects, and pre-computed estimate-email links

## MCP Integration

This repository exposes MCP servers for integration with AI coding assistants (like Claude Code), defined in `.mcp.json`. These servers provide tools for managing estimates directly from the agentic environment.

Available MCP servers:

- `desert-quoting` — Estimate generation and catalog

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3.5 or later)
- [just](https://github.com/casey/just) (for task recipes)
- [Python](https://www.python.org/) (3.11+)
- [uv](https://docs.astral.sh/uv/) for Python package management

### Installation

```bash
bun install
```

### Development

```bash
# Run the main web application (apps/web/)
bun run dev

# Run tests
bun run test
```

### Operations Quick Commands

```bash
# Full startup on server: compose runtime + strict health check
just up

# Human-readable runtime status (docker + HTTP + pollers)
just status

# Strict local-runtime gate (non-zero on failures)
just check

# Cloudflare worker deployment check (best effort)
just cf-check

# Poller container status
just services-status

# Code quality (repo-level)
just code-check
just fix

# Equivalent npm/bun scripts:
bun run ops:up
bun run ops:health
bun run ops:check
```

## Local Database Runtime

```bash
# Start local Supabase services (includes Postgres on 54322)
bun run db:supabase:start

# Check status and connection details
bun run db:supabase:status

# Stop local Supabase services
bun run db:supabase:stop
```

Runtime notes: `docs/POSTGRES_MIGRATION.md`

## Documentation

- **Engineering Standards**: See [CLAUDE.md](CLAUDE.md) for detailed coding conventions, service usage patterns, and testing requirements.
- **System Design**: See `docs/` for specific SOPs and integration diagrams.
- **Contract Workflow**: See `packages/contracts/PROJECT.md` and `STATE.md`
