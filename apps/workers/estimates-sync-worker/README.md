# ds-estimates-sync-worker

Cloudflare Worker that syncs Monday.com Estimating board items to SharePoint folder structure. Runs on an hourly cron schedule.

## Commands

```bash
# Local dev (connects to remote services)
bun run dev

# Deploy to Cloudflare
bun run deploy

# View logs
bun run tail
```

## Architecture

The worker (`src/index.ts`) runs on Cloudflare's edge and uses raw `fetch()` for both the Monday API and Microsoft Graph API. No SDK dependencies — everything is self-contained.

## Environment Variables

Set via `wrangler secret put`:

```bash
MONDAY_API_KEY=<your-monday-api-key>
AZURE_TENANT_ID=<azure-tenant-id>
AZURE_CLIENT_ID=<azure-client-id>
AZURE_CLIENT_SECRET=<azure-client-secret>
```

## SharePoint Folder Structure

```text
Customer Projects/
  Submitted/
  Active/
  Lost/
  Finished/
    {Letter}/           # A-Z or _Numeric
      {Account}/        # Company name
        {Project}/      # Estimate name
          Estimates/
          Plans/
          Contracts/
          NOI/
```

## Documentation

Read [SYNC-KNOWLEDGE.md](./SYNC-KNOWLEDGE.md) before making changes — contains critical knowledge about Monday.com API gotchas, board relations, and common mistakes.
