# Monday Status Sync Worker

Cloudflare Worker that keeps Monday.com board statuses in sync across Estimating and Leads boards.

## Jobs

### 1. GC Cleanup

Finds estimates in Open/Sent groups that match a Won project name and marks them as "GC Not Awarded".

**Logic:**

- Get all Won estimates
- Get all Open + Sent estimates  
- If an Open/Sent estimate name matches a Won estimate name → mark as "GC Not Awarded"

### 2. Leads Sync

Syncs the Leads board "Overall Status" from the linked Estimate's "Bid Status".

**Mapping:**

| Estimate Bid Status | → | Lead Overall Status |
|---------------------|---|---------------------|
| Won, Pending Won, Add to Projects | → | Won |
| Lost, GC Not Awarded, Duplicates | → | Lost |
| Everything else | → | (no change) |

## Schedule

Runs **hourly** at :15 past the hour.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Info page |
| `/run` | Run all sync jobs |
| `/dry-run` | Preview all sync jobs |
| `/gc/run` | Run GC cleanup only |
| `/gc/dry-run` | Preview GC cleanup only |
| `/leads/run` | Run Leads sync only |
| `/leads/dry-run` | Preview Leads sync only |

## Deployment

```bash
cd workers/ds-monday-status-sync-worker
wrangler deploy
```

## Secrets Required

Set via Cloudflare dashboard or CLI:

```bash
wrangler secret put MONDAY_API_KEY
```

## Local Testing

```bash
wrangler dev
# Then visit http://localhost:8787/dry-run
```
