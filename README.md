# Desert Services Hub

The unified platform for Desert Services, combining Bun full-stack web applications with core automation services, background task workers, and Model Context Protocol (MCP) integrations.

## Repository Architecture

This repository is organized into multiple pillars:

- **Applications** (`apps/`): Bun full-stack React applications
  - `apps/web/` — Main quoting/takeoff application (quotes, takeoffs, contracts, catalog)
  - `apps/quoting/` — Quoting MCP server (catalog, PDF generation)
  - `apps/contract-ui/` — Contract processing workflow UI (experimental)
- **Services** (`services/`): Bun-native automation logic and API clients
- **Workers** (`workers/`): Cloudflare Workers for background tasks
- **Shared Libraries** (`lib/`): Common utilities, types, and database schemas

```bash
apps/           # Bun full-stack applications
├── web/        # Main app: quotes, takeoffs, contracts, catalog
├── quoting/    # Quoting MCP server (moved from services/)
└── contract-ui/# Contract processing UI (experimental)

services/       # Core automation services
├── email/      # Microsoft Graph email client
├── monday/     # Monday.com CRM integration
├── notion/     # Project tracking and CRM helpers
├── sharepoint/ # Document management
├── enrichment/ # Data enrichment (PDL, Clearbit)
├── jina/       # Web scraping and PDF extraction
├── mistral/    # OCR and document processing (Python)
├── n8n/        # n8n workflow automation client
└── file-automation/ # DocuSign, Building Connected automation

workers/        # Cloudflare Workers
├── ds-contracts-dispatcher/
├── ds-estimates-sync-worker/
├── ds-inspections-email-worker/
└── ds-monday-status-sync-worker/

lib/            # Shared libraries
├── db/         # SQLite schemas and connection
├── minio.ts    # MinIO/S3 storage client
├── pdf/        # PDF utilities
└── schemas/    # Zod validation schemas

data/           # SQLite databases and token caches
docs/           # Business logic, SOPs, and system design
```

## Core Services

The following services are integrated and available for both automation scripts and the web application:

- **Email (`services/email`)**: Microsoft Graph client for organizational email automation.
- **MondayCRM (`services/monday`)**: High-performance integration with Monday.com boards.
- **Quoting (`apps/quoting/`)**: Pricing logic and multi-page PDF estimate generation (MCP server).
- **Notion (`services/notion`)**: Project tracking and CRM helpers with deduplication.
- **SharePoint (`services/sharepoint`)**: Document management and file automation.
- **Mistral OCR (`services/mistral/`)**: PDF OCR and document processing.
- **Enrichment (`services/enrichment`)**: Data enrichment for leads and companies.

## Primary Database

**Hub.db** (`apps/contract/hub.db`)

The consolidated SQLite database containing:

- 237K+ emails across all mailboxes
- 125K+ attachments with MinIO storage paths
- 4,800+ estimates synced from Monday
- 3,600+ accounts (contractors/companies)
- Contacts, projects, and pre-computed estimate-email links

## MCP Integration

This repository exposes MCP servers for integration with AI coding assistants (like Claude Code), defined in `.mcp.json`. These servers provide tools for managing emails, CRM items, and quotes directly from the agentic environment.

Available MCP servers:

- `desert-quoting` — Quote generation and catalog
- `desert-mistral` — OCR and document processing

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3.5 or later)

### Installation

```bash
bun install
```

### Development

```bash
# Run the main web application (apps/web/)
bun run dev

# Run contract-ui app (separate)
cd apps/contract-ui && bun run dev

# Run tests
bun run test
```

## Documentation

- **Engineering Standards**: See [CLAUDE.md](CLAUDE.md) for detailed coding conventions, service usage patterns, and testing requirements.
- **System Design**: See `docs/` for specific SOPs and integration diagrams.
- **Contract Workflow**: See `apps/contract/PROJECT.md` and `STATE.md`
