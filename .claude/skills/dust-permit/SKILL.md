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

## Step 2: Call via `@permits/client`

ALL permit operations use the typed `PermitClient` from `@permits/client`. Always use `timeoutMs: 300000` — browser automation takes 2-3 minutes for mutations.

| Operation | Method | Args |
|-----------|--------|------|
| Renew | `c.renewPermit(id, { companyName })` | `companyName` from DB |
| Close | `c.closePermit(id, { reason })` | `"completed"`, etc. |
| Revise | `c.revisePermit(id, { revisionType, notes })` | types: `boundary`, `acreage`, `contact`, `schedule`, `bmp`, `other` |
| Download PDF | `c.scrapePdf(id)` | returns `success`, `permitId`, `pdfPath` |
| Create | `c.createPermit({ flow, companyName })` | `"existing-company"` or `"new-company"` |

## Workflow: Renewal

1. DB lookup → get `company_name`, verify `status` is Active, check `expiration_date`
2. `c.renewPermit("D0XXXXXX", { companyName: "Company Name" })`
3. Response includes `applicationId` of the renewal draft

## Workflow: New Permit

1. Gather NOI document (required) — search emails in Postgres, download attachments
2. Extract data: `cd packages/documents/pdf-analysis-cli && uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback`
3. Check company history in DB — determines `flow: "existing-company"` vs `"new-company"`
4. Build overrides JSON if needed, copy into container: `docker cp file.json desert-permit-worker:/app/data/overrides/`
5. `c.createPermit({ flow: "existing-company", companyName: "Name" })`

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
