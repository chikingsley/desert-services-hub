# ds-estimates-sync-worker

Syncs Monday.com Estimating board items to SharePoint folder structure.

## Quick Start

```bash
# Install dependencies
bun install

# Dry run first (always!)
bun sync-estimates.ts --dry-run --limit=100

# Real sync (limited)
bun sync-estimates.ts --limit=500

# Full sync
bun sync-estimates.ts
```

## Important Documentation

**Before making changes, read [SYNC-KNOWLEDGE.md](./SYNC-KNOWLEDGE.md)** - contains critical knowledge about Monday.com API gotchas, board relations, and common mistakes.

## Environment Variables

```bash
MONDAY_API_KEY=<your-monday-api-key>
AZURE_TENANT_ID=<azure-tenant-id>
AZURE_CLIENT_ID=<azure-client-id>
AZURE_CLIENT_SECRET=<azure-client-secret>
```

## Scripts

| Script | Description |
|--------|-------------|
| `sync-estimates.ts` | Main sync script |
| `validate-sharepoint.ts` | Validate SharePoint folder structure |
| `cleanup-sharepoint.ts` | Fix bad folders |

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

## Tech Stack

- **Runtime**: Bun
- **Monday API**: GraphQL with board relations
- **SharePoint**: Microsoft Graph API
