# Permit Operations Reference

## MCP Tools (Primary Interface)

All permit operations are exposed as MCP tools via `apps/dust-permits-mcp/`. Claude Code auto-discovers them from `.mcp.json`.

### Read-Only Tools

| Tool | Description |
|------|-------------|
| `permit_health` | Check permit worker health |
| `permit_browser_status` | Browser session state |
| `permit_list` | List all active permits |
| `permit_get` | Get permit by ID (e.g., D0063827) |
| `permit_search` | FTS search by company, project, address, or ID |
| `permit_expiring` | Permits expiring within N days (default 30) |
| `permit_scrape` | Scrape live data from portal |
| `permit_scrape_pdf` | Scrape + download PDF |
| `permit_form_schema` | FormData JSON Schema (200+ fields) |
| `permit_form_defaults` | Default form values |

### Write Tools

| Tool | Description |
|------|-------------|
| `permit_create` | Create new application (stops at review page) |
| `permit_renew` | Start renewal (no payment) |
| `permit_renew_and_pay` | Full renew + submit + pay |
| `permit_close` | Close/terminate permit |
| `permit_revise` | Submit revision (boundary/acreage/contact/schedule/bmp/other) |
| `permit_delete` | Delete draft application |
| `permit_sync` | Sync from portal |

## Create Permit (via MCP tool or curl)

For `permit_create`, if using `formDataPath` (in-container file path), docker cp first:

```bash
docker exec desert-permit-worker sh -lc 'mkdir -p /app/data/overrides'
docker cp /tmp/project-overrides.json desert-permit-worker:/app/data/overrides/project-overrides.json
```

Then use `permit_create` tool with `formDataPath: "/app/data/overrides/project-overrides.json"`.

## E2E Tests (in-container)

```bash
# Renew+pay E2E in permit-worker runtime (VNC-visible)
docker exec desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/renew-and-pay.test.ts'

# Close E2E (dry run)
docker exec desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/close.test.ts'
```
