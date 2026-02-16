---
name: dust-permit
description: |
  Handle all Maricopa County dust permit operations: create, renew, revise, close, delete drafts, download PDF, find permit, and extract data from NOI/SWPPP documents. Use when user mentions dust permits, permit IDs (D0XXXXXX), county portal, Maricopa Air Quality, or asks to file/renew/revise/close/delete/download a permit, find a permit, delete drafts, or extract permit data.
---

# Dust Permit Operations

All permit operations go through the **permit-worker HTTP API** via the typed `PermitClient` from `@permits/client`.

**NEVER use `bun src/cli.ts`, `bun -e`, or raw `fetch()` for permit operations.** Always use the PermitClient.

## API Quick Reference

The permit-worker container (`desert-permit-worker`) exposes an HTTP API on port 47822. Use `PermitClient` to call it:

```typescript
import { PermitClient } from "@permits/client";
const client = new PermitClient(); // defaults to http://permit-worker:47822
```

For one-off operations from Claude Code, use `curl` against the running container:

| Operation | curl Command |
|-----------|-------------|
| Renew permit | `curl -X POST http://localhost:47822/api/permits/D0058823/renew -H 'Content-Type: application/json' -d '{"companyName":"Company Name"}'` |
| Create (existing co) | `curl -X POST http://localhost:47822/api/permits/create -H 'Content-Type: application/json' -d '{"flow":"existing-company","companyName":"Name","formDataPath":"/app/data/overrides/project.json"}'` |
| Create (new co) | `curl -X POST http://localhost:47822/api/permits/create -H 'Content-Type: application/json' -d '{"flow":"new-company","formDataPath":"/app/data/overrides/project.json"}'` |
| Revise permit | `curl -X POST http://localhost:47822/api/permits/D0064070/revise -H 'Content-Type: application/json' -d '{"revisionType":"contact","notes":"..."}'` |
| Close permit | `curl -X POST http://localhost:47822/api/permits/D0056240/close` |
| Download PDF | `curl -X POST http://localhost:47822/api/scrape/pdf -H 'Content-Type: application/json' -d '{"permitId":"D0061391"}'` |
| Delete all drafts | `curl -X DELETE http://localhost:47822/api/permits/drafts` |
| List permits | `curl http://localhost:47822/api/permits` |
| Get single permit | `curl http://localhost:47822/api/permits/D0061391` |
| Sync from portal | `curl -X POST http://localhost:47822/api/sync` |
| Health check | `curl http://localhost:47822/health` |

**Revision types**: `boundary`, `acreage`, `contact`, `schedule`, `bmp`, `other`

**Permit ID format**: `D0XXXXXX` (e.g., D0061391, D0056297)

## Find Permit (Postgres)

Permit data lives in Postgres (NOT SQLite). Query via psql:

```sql
-- By permit ID
SELECT * FROM dust_permits_filed_by_desert_services WHERE id = 'D0056297';

-- By project name
SELECT id, project_name, company_name, status, expiration_date
FROM dust_permits_filed_by_desert_services WHERE project_name ILIKE '%SEARCH%';

-- By company
SELECT id, project_name, company_name, status, expiration_date
FROM dust_permits_filed_by_desert_services WHERE company_name ILIKE '%SEARCH%';

-- Expiring soon
SELECT id, project_name, company_name, expiration_date
FROM dust_permits_filed_by_desert_services WHERE status = 'Active'
AND expiration_date <= (CURRENT_DATE + INTERVAL '30 days')::text ORDER BY expiration_date;
```

## Intent Detection

| User Says | Intent | Action |
|-----------|--------|--------|
| "download PDF D0061391" | download | `POST /api/scrape/pdf` with `{"permitId":"D0061391"}` |
| "renew permit for ABC Corp" | renew | Find permit in Postgres, then `POST /api/permits/:id/renew` |
| "update contact on permit" | revise | `POST /api/permits/:id/revise` with `{"revisionType":"contact","notes":"..."}` |
| "close out the permit" | close | `POST /api/permits/:id/close` |
| "file dust permit for project X" | create | Gather docs, build request body, `POST /api/permits/create` |
| "delete all drafts" | delete | `DELETE /api/permits/drafts` |
| "clean up portal drafts" | delete | `DELETE /api/permits/drafts` |
| "find permit for ABC" | find | Postgres query |
| "has this been filed?" | status | Postgres query for status |

## Workflow: New Permit

```text
- [ ] Step 1: Gather documents (NOI required, SWPPP/Plans for category mapping)
- [ ] Step 2: Extract data (pdf-analysis noi, pdf-analysis ocr for plans)
- [ ] Step 3: Check permit history (Postgres query for company)
- [ ] Step 4: Build overrides JSON + create request payload
- [ ] Step 5: Call permit-worker API → POST /api/permits/create
- [ ] Step 6: Update project record in DB
```

### Step 1: Gather documents

Search emails for attachments (NOI required, SWPPP/Plans optional but useful):
```bash
# Find emails with attachments for a project
docker exec supabase_db_desert-services-hub psql -U postgres -c \
  "SELECT id, subject, attachment_names FROM emails WHERE subject ILIKE '%PROJECT%' AND has_attachments = 1;"
```

Download attachments via email-cli:
```bash
bun packages/email/cli/cli.ts download-attachments <messageId> --user <mailbox> --out /tmp/permit-docs --filter .pdf
```

### Step 2: Extract data

```bash
cd packages/documents/pdf-analysis-cli

# Structured NOI extraction (primary data source)
uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback

# OCR plans/bid sets for supplementary data
uv run pdf-analysis ocr /path/to/plans.pdf --output /tmp/plans.md
```

NOI extraction gives: applicant, site name, coordinates, acreage, SWPPP contact.
Plans/bid sets give: project description, owner info, earthwork scope, construction type.

### Step 3: Check permit history

```sql
SELECT id, project_name, company_name, status, portal_company_id
FROM dust_permits_filed_by_desert_services WHERE company_name ILIKE '%COMPANY%';
```

- Found → `flow: "existing-company"` in request body
- Not found → `flow: "new-company"` (need full company details)

### Primary Contact Priority Chain

1. **Specified in email** — if the requesting email explicitly names a contact, use that
2. **NOI SWPPP contact** — use unless it's a `@desertservices.net` address (internal, skip it)
3. **Superintendent** — fallback: use the project superintendent from the GC
4. **Ask** — if none of the above are available, ask the user

### Step 4: Build Overrides + Request Payload

`POST /api/permits/create` accepts a payload with `flow`, optional `companyName`, optional `copyFromApp`, and optional `formDataPath`.

```json
{
  "flow": "existing-company",
  "companyName": "Company Name",
  "formDataPath": "/app/data/overrides/project-name.json"
}
```

If overrides are needed, create a `DeepPartial<FormData>` JSON file and copy it into the running container:

```bash
docker exec desert-permit-worker sh -lc 'mkdir -p /app/data/overrides'
docker cp /tmp/project-name.json desert-permit-worker:/app/data/overrides/project-name.json
```

Then set `formDataPath` to that in-container path.

**Defaults**: if `formDataPath` is omitted, the server uses built-in defaults (including date defaults and category defaults).

### Step 5: Call the API

```bash
curl -X POST http://localhost:47822/api/permits/create \
  -H 'Content-Type: application/json' \
  -d '{"flow":"existing-company","companyName":"Company Name","formDataPath":"/app/data/overrides/project-name.json"}'
```

Automation fills all 5 pages, stops at Page 5 for manual review and submit.

### Step 6: Update tracking

Update project record in Postgres with permit application ID.

## Workflow: Renewal

1. **Find permit** — Postgres query by project/company
2. **Verify status** — Check expiration (Active or recently Closed/Expired permits can be renewed)
3. **Call API** — `curl -X POST http://localhost:47822/api/permits/D0XXXXXX/renew -H 'Content-Type: application/json' -d '{"companyName":"Company Name"}'`

## Workflow: Download PDF

1. **Get permit ID** — User provides D0XXXXXX or find via Postgres
2. **Call API** — `curl -X POST http://localhost:47822/api/scrape/pdf -H 'Content-Type: application/json' -d '{"permitId":"D0061391"}'`
3. **Output** — Response contains `pdfBase64` field with base64-encoded PDF

## Required Fields (New Permit)

| Field | Required | Source |
|-------|----------|--------|
| Company Name | Yes | NOI/Email |
| Project Name | Yes | NOI/Email |
| Site Coordinates | Yes | NOI |
| Contact (name, phone, email) | Yes | NOI SWPPP contact |
| Acreage | Yes | NOI |
| Project Description | Recommended | Plans/Bid Set |
| Property Owner | If different from applicant | Plans |

## References

- **API endpoint details**: [references/api-reference.md](references/api-reference.md)
- **Data extraction (NOI/SWPPP)**: [references/extraction.md](references/extraction.md)
- **Integrations (Email, Postgres, workers)**: [references/integrations.md](references/integrations.md)
- **Real request examples**: [references/examples/](references/examples/)
