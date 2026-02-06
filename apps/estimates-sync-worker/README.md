# ds-estimates-sync-worker

Syncs Monday.com Estimating board items to SharePoint folder structure.

## Architecture

This package has **two** components:

1. **Cloudflare Worker** (`src/index.ts`) - Runs on Cloudflare's edge, uses raw `fetch()` for Graph API
2. **CLI Scripts** (`cli/`) - Run locally with Bun, uses `@azure/identity` SDK for richer SharePoint operations

Both sync the same data, but the Worker is for automated hourly syncs while CLI is for manual operations and debugging.

## Quick Start

```bash
# Install dependencies
bun install

# Dry run first (always!)
bun run sync:dry --limit=100

# Real sync (limited)
bun run sync --limit=500

# Full sync
bun run sync
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `sync` | `bun run sync` | Full sync to SharePoint |
| `sync:dry` | `bun run sync:dry` | Preview sync (no changes) |
| `sync:limit` | `bun run sync:limit 100` | Sync with item limit |
| `quick` | `bun run quick` | Quick sync for specific items |
| `validate` | `bun run validate` | Validate SharePoint folder structure |
| `backfill` | `bun run backfill` | Backfill direct account relations |
| `leads` | `bun run leads` | Sync leads status |

## Worker Commands

```bash
# Local dev (connects to remote services)
bun run dev

# Deploy to Cloudflare
bun run deploy

# View logs
bun run tail
```

## Environment Variables

Create a `.env` file or set these via `wrangler secret put`:

```bash
MONDAY_API_KEY=<your-monday-api-key>
AZURE_TENANT_ID=<azure-tenant-id>
AZURE_CLIENT_ID=<azure-client-id>
AZURE_CLIENT_SECRET=<azure-client-secret>
```

## Folder Structure

```text
Customer Projects/
├── Submitted/
├── Active/
├── Lost/
└── Finished/
    └── {Letter}/           # A-Z or _Numeric
        └── {Account}/      # Company name
            └── {Project}/  # Estimate name
                ├── Estimates/
                ├── Plans/
                ├── Contracts/
                └── NOI/
```

## Worker vs CLI

| Feature | Worker (`src/`) | CLI (`cli/`) |
|---------|-----------------|--------------|
| Runtime | Cloudflare Workers | Bun |
| Graph API | Raw `fetch()` | `@microsoft/microsoft-graph-client` SDK |
| Auth | OAuth2 client credentials | `@azure/identity` SDK |
| Triggers | Cron (hourly), HTTP | Manual |
| Use Case | Automated background sync | Manual operations, debugging |

## Important Documentation

**Read [SYNC-KNOWLEDGE.md](./SYNC-KNOWLEDGE.md)** before making changes - contains critical knowledge about Monday.com API gotchas, board relations, and common mistakes.

## TypeScript

Two separate tsconfigs to handle the runtime differences:

- `tsconfig.json` - Worker (Cloudflare Workers types)
- `tsconfig.cli.json` - CLI scripts (Bun types)

```bash
# Check worker types
bun run typecheck

# Check CLI types
bun run typecheck:cli
```
