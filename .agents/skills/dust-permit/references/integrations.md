# Integration Reference

Current integration points for dust permit operations in `desert-services-hub`.

## Runtime + Service Boundaries

- Permit automation runtime: `apps/dust-permits` (container `desert-permit-worker`)
- API endpoint:
  - Host shell: `http://localhost:47822`
  - Container network: `http://permit-worker:47822`
- Canonical client in repository code: `@permits/client` (`packages/permits/src/client.ts`)

## Source of Truth

- Permit records: Postgres table `dust_permits_filed_by_desert_services`
- Canonical repository access: `lib/db/repositories/dust-permit.ts`
- Do not use SQLite cache queries for operational decisions.

Quick Postgres checks:

```sql
-- Permit by ID
SELECT * FROM dust_permits_filed_by_desert_services WHERE id = 'D0056297';

-- Company history
SELECT id, project_name, company_name, status, expiration_date
FROM dust_permits_filed_by_desert_services
WHERE company_name ILIKE '%SEARCH%';

-- Expiring soon
SELECT id, project_name, company_name, expiration_date
FROM dust_permits_filed_by_desert_services
WHERE status = 'Active'
  AND expiration_date <= (CURRENT_DATE + INTERVAL '30 days')::text
ORDER BY expiration_date;
```

## Email + Attachments

Use the email CLI to find request messages and download NOI/SWPPP files:

```bash
# Search across org mailboxes
bun packages/email/cli/cli.ts search-all "project name permit" --limit 20

# Download attachments for a specific message
bun packages/email/cli/cli.ts download-attachments <messageId> \
  --user <mailbox@desertservices.net> \
  --out /tmp/permit-docs \
  --filter .pdf
```

## PDF Data Extraction

Primary extraction path is `pdf-analysis`:

```bash
cd packages/documents/pdf-analysis-cli
uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback
uv run pdf-analysis ocr /path/to/plans.pdf --output /tmp/plans.md
```

## Permit Operations

Use API/PermitClient, not legacy CLI-first workflows.

- Full endpoint contract: `references/api-reference.md`
- Common operations:
  - `POST /api/permits/create`
  - `POST /api/permits/:id/renew`
  - `POST /api/permits/:id/revise` (body key is `revisionType`)
  - `POST /api/permits/:id/close`
  - `POST /api/scrape/pdf`
  - `DELETE /api/permits/drafts`

## Repository Callers

Current code paths already using `PermitClient`:

- `apps/web/api/automation.ts`
- `apps/background-jobs/jobs/permit-sync.ts`
- `apps/background-jobs/lib/notifications/email-trigger-handlers.ts`

## Guardrails

- Do not use deleted legacy path `apps/workers/permit-workers/`.
- Do not use SQLite as source of truth for permit state.
- Do not introduce new raw `fetch()` permit calls in app code; use `PermitClient`.
- For ad-hoc terminal work, prefer `curl` against port `47822`.
