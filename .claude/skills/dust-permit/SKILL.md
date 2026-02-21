---
name: dust-permit
description: |
  Handle Maricopa County dust permit operations: create, renew, revise, close, delete drafts, download PDF, find permit. Use when user mentions dust permits, permit IDs (D0XXXXXX), or asks to file/renew/revise/close/delete/download a permit.
---

# Dust Permit Operations

All permit operations are available as MCP tools (auto-discovered from `.mcp.json`). Use the `permit_*` tools directly — no CLI or shell commands needed for standard operations.

## Step 1: Find the permit

Use MCP tools for lookup:

- `permit_search` — FTS search by company name, project, address, or permit ID
- `permit_get` — Get details for a known permit ID
- `permit_list` — List all active permits
- `permit_expiring` — Find permits expiring soon

Or query Postgres directly for complex lookups:

```bash
docker exec -i supabase_db_desert-services-hub psql -U postgres <<'EOF'
SELECT id, company_name, status, expiration_date
FROM dust_permits_filed_by_desert_services
WHERE id = 'D0XXXXXX';
EOF
```

## Step 2: Use MCP tools

| Tool | Operation |
|------|-----------|
| `permit_health` | Check permit worker is running |
| `permit_browser_status` | Browser session state |
| `permit_search` | FTS search permits |
| `permit_get` | Get permit details |
| `permit_expiring` | Permits expiring within N days |
| `permit_scrape` | Scrape live data from portal |
| `permit_scrape_pdf` | Scrape + download PDF |
| `permit_form_schema` | Get FormData JSON Schema (200+ fields) |
| `permit_form_defaults` | Get default form values |
| `permit_create` | Create new application |
| `permit_renew` | Start renewal (no payment) |
| `permit_renew_and_pay` | Full renew + submit + pay |
| `permit_close` | Close/terminate permit |
| `permit_revise` | Submit revision |
| `permit_delete` | Delete draft |
| `permit_sync` | Sync from portal |

## Workflow: Renewal (no payment)

1. `permit_search` or `permit_get` → get company name, verify Active status
2. `permit_renew` with permitId and companyName
3. Response includes applicationId of the renewal draft

## Workflow: Renew + Pay

1. `permit_search` or `permit_get` → get company name, verify Active status
2. `permit_renew_and_pay` with permitId, companyName
3. The tool includes operator confirmation checkpoints before submission and payment

**CRITICAL — Expedited Processing:**
- Expedited is OFF by default. Never set `expedited: true` unless the user explicitly requests accelerated processing.
- Expedited = "Accelerated Processing" checkbox on Maricopa portal. It costs significantly more.
- Only set expedited when the user says words like "expedited", "accelerated", "rush".

## Workflow: Close

1. `permit_get` → verify Active status
2. `permit_close` with permitId and reason

## Workflow: New Permit

1. Gather NOI document (required) — search emails in Postgres, download attachments
2. Extract data: `cd packages/documents/pdf-analysis-py && uv run pdf-analysis noi /path/to/noi.pdf --ocr-fallback`
3. `permit_form_defaults` → see default values
4. `permit_create` with flow, companyName, and formData overrides

## References

- [API details](references/api-reference.md)
- [Data extraction](references/extraction.md)
- [Integrations](references/integrations.md)
