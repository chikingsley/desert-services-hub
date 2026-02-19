---
name: dust-permit
description: |
  Handle Maricopa County dust permit operations: create, renew, revise, close, delete drafts, download PDF, find permit. Use when user mentions dust permits, permit IDs (D0XXXXXX), or asks to file/renew/revise/close/delete/download a permit.
---

# Dust Permit Operations

## Step 1: ALWAYS check Postgres first

Before any API call, look up the permit in Postgres to get company name, status, expiration:

```bash
docker exec supabase_db_desert-services-hub psql -U postgres -t -A -c \
  "SELECT id, company_name, status, expiration_date FROM dust_permits_filed_by_desert_services WHERE id = 'D0XXXXXX'"
```

## Step 2: Use the permit CLI (`bun run permit`)

All operations go through the typed `PermitClient` via the CLI at `packages/permits/cli.ts`. Browser automation takes 2-3 minutes for mutations — the CLI handles timeouts automatically.

```bash
# Close a permit
bun run permit close D0XXXXXX --reason completed

# Renew a permit (--company from DB lookup)
bun run permit renew D0XXXXXX --company "Company Name"

# Revise a permit (types: boundary | acreage | contact | schedule | bmp | other)
bun run permit revise D0XXXXXX --type contact --notes "Update contact info"

# Download PDF
bun run permit scrape-pdf D0XXXXXX

# Health check
bun run permit health

# List all permits
bun run permit list

# Get single permit
bun run permit get D0XXXXXX

# Delete a draft / all drafts
bun run permit delete D0XXXXXX
bun run permit delete-drafts

# Sync
bun run permit sync
bun run permit sync-company

# Browser session status
bun run permit browser-status
```

## Workflow: Renewal (no payment)

1. DB lookup → get `company_name`, verify `status` is Active, check `expiration_date`
2. `bun run permit renew D0XXXXXX --company "Company Name"`
3. Response includes `applicationId` of the renewal draft

## Workflow: Renew + Pay

1. DB lookup → get `company_name`, verify `status` is Active
2. First do a dry run: `bun run permit renew-and-pay D0XXXXXX --company "Company Name" --dry-run`
3. Review the amounts in the dry-run response
4. If approved: `bun run permit renew-and-pay D0XXXXXX --company "Company Name" --yes`
5. The CLI will show a confirmation prompt (unless `--yes` is passed)

**CRITICAL — Expedited Processing:**
- Expedited is OFF by default. Never pass `--expedited` unless the user explicitly requests accelerated processing.
- Expedited = "Accelerated Processing" checkbox on Maricopa portal. It costs significantly more.
- Only add `--expedited` when the user says words like "expedited", "accelerated", "rush".

## Workflow: Close

1. DB lookup → verify `status` is Active
2. `bun run permit close D0XXXXXX --reason completed`

## Workflow: New Permit

1. Gather NOI document (required) — search emails in Postgres, download attachments
2. Extract data: `cd packages/documents/pdf-analysis-py && uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback`
3. Check company history in DB — determines `flow: "existing-company"` vs `"new-company"`
4. Copy overrides into container if needed: `docker cp file.json desert-permit-worker:/app/data/overrides/`
5. Create permit (currently via curl — CLI create command coming soon):
   ```bash
   curl -X POST http://localhost:47822/api/permits/create \
     -H 'Content-Type: application/json' \
     -d '{"flow":"existing-company","companyName":"Name","formDataPath":"/app/data/overrides/file.json"}'
   ```

## Find Permit

```sql
-- By ID
SELECT id, project_name, company_name, status, expiration_date FROM dust_permits_filed_by_desert_services WHERE id = 'D0XXXXXX';
-- By company
SELECT id, project_name, company_name, status, expiration_date FROM dust_permits_filed_by_desert_services WHERE company_name ILIKE '%SEARCH%';
-- Expiring soon
SELECT id, project_name, company_name, expiration_date FROM dust_permits_filed_by_desert_services WHERE status = 'Active' AND expiration_date <= (CURRENT_DATE + INTERVAL '30 days')::text ORDER BY expiration_date;
```

## References

- [API details](references/api-reference.md)
- [Data extraction](references/extraction.md)
- [Integrations](references/integrations.md)
