# Desert Services Hub

The unified platform for Desert Services, combining the Next.js web application with core automation services, background task workers, and Model Context Protocol (MCP) integrations.

## Repository Architecture

This repository is organized into two primary pillars:

- **Application**: Next.js App Router project for user-facing dashboards and tools.
- **Services**: Bun-native automation logic and API clients located in `services/`.

```bash
data/        # SQLite databases and persistent caches
docs/        # Business logic, SOPs, and system design
lib/         # Shared application logic, types, and DB schemas
public/      # Static assets for the web application
services/    # Core automation services (Email, Monday, Notion, etc.)
src/         # Next.js application source
```css

## Core Services

The following services are integrated and available for both automation scripts and the web application:

- **Email (`services/email`)**: Microsoft Graph client for organizational email automation.
- **MondayCRM (`services/monday`)**: High-performance integration with Monday.com boards.
- **Quoting (`services/quoting`)**: Pricing logic and multi-page PDF estimate generation.
- **Notion (`services/notion`)**: Project tracking and CRM helpers with deduplication.
- **SharePoint (`services/sharepoint`)**: Document management and file automation.
- **PDF Triage (`services/pdf`)**: Smart classification of project documents (SWPPP, Permits, etc.).
- **Enrichment (`services/enrichment`)**: Data enrichment for leads and companies.

## MCP Integration

This repository exposes MCP servers for integration with AI coding assistants (like Claude Code), defined in `.mcp.json`. These servers provide tools for managing emails, CRM items, and quotes directly from the agentic environment.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3.5 or later)

### Installation

```bash
bun install
```css

### Development

```bash
# Run the Next.js web application
bun run dev

# Run tests
bun run test
```

## Documentation

- **Engineering Standards**: See [CLAUDE.md](CLAUDE.md) for detailed coding conventions, service usage patterns, and testing requirements.
- **System Design**: See `docs/` for specific SOPs and integration diagrams.
