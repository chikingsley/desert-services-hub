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

### 3. Project Link Sync

Enforces linkage between Lead, Estimate, and Project records, and propagates a single project number across boards.

**Logic:**

- Reads leads with linked estimates
- Reads estimate ↔ project relation
- Ensures:
  - Estimate links to Project
  - Project links back to Estimate
  - Lead links to Project (if lead project relation column is configured)
- Propagates canonical project number across Project/Estimate/Lead (if project number columns are configured)

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
| `/project-links/dry-run` | Preview Project Link sync only |
| `/project-links/run` | Run Project Link sync only |
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

## Optional Vars (Project Link Sync)

Project Link Sync is disabled by default. Enable with:

```toml
[vars]
ENABLE_PROJECT_LINK_SYNC = "true"
```

Supported vars:

- `ENABLE_PROJECT_LINK_SYNC` - `true`/`false` (default `false`)
- `PROJECTS_BOARD_ID` - defaults to `8692330900`
- `ESTIMATE_PROJECT_LINK_COL` - defaults to `board_relation_mktgebxf`
- `PROJECT_ESTIMATE_LINK_COL` - defaults to `board_relation_mktgn7cb`
- `LEAD_PROJECT_LINK_COL` - optional lead → project relation column ID
- `ESTIMATE_PROJECT_NUMBER_COL` - optional estimate project number column ID
- `LEAD_PROJECT_NUMBER_COL` - optional lead project number column ID
- `PROJECT_PROJECT_NUMBER_COL` - optional project board project number column ID

## Local Testing

```bash
wrangler dev
# Then visit http://localhost:8787/dry-run
```
