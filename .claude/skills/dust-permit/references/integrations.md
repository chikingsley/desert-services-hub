# Integration Reference

Current integration points for dust permit operations in `desert-services-hub`.

## Runtime + Service Boundaries

- Permit automation runtime: `apps/dust-permits` (container `desert-permit-worker`)
- Typed client: `packages/permits/src/client.ts` (`PermitClient`)
- MCP server: `apps/dust-permits-mcp/` → auto-discovered via `.mcp.json`
- API:
  - Host shell / MCP: `http://localhost:47822`
  - Container network: `http://permit-worker:47822`

## Who Uses What

| Caller | Interface | URL |
|--------|-----------|-----|
| Claude Code / AI agents | MCP tools (`apps/dust-permits-mcp/`) | `http://localhost:47822` |
| `apps/web/api/automation.ts` | `PermitClient` (app code) | `http://permit-worker:47822` |
| `apps/background-jobs/jobs/permit-sync.ts` | `PermitClient` (app code) | `http://permit-worker:47822` |
| `lib/notifications/email-trigger-handlers.ts` | `PermitClient` (app code) | `http://permit-worker:47822` |

## Source of Truth

- Permit records: Postgres table `dust_permits_filed_by_desert_services`
- Canonical repository access: `lib/db/repositories/dust-permit.ts`
- FTS search: `ftsSearchPermits()` using `search_vector` tsvector column with GIN index

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
cd packages/documents/pdf-analysis-py
uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback
uv run pdf-analysis ocr /path/to/plans.pdf --output /tmp/plans.md
```

## Guardrails

- Do not use deleted legacy path `apps/workers/permit-workers/`.
- Do not use SQLite as source of truth for permit state.
- App code (web, background-jobs) should use `PermitClient` over raw `fetch()`.
- AI agents should use MCP tools, not inline scripts or raw curl.
