# Permit MCP Server (`apps/dust-permits-mcp`)

MCP (Model Context Protocol) server exposing dust permit operations as discoverable tools for Claude Code and other MCP clients.

## Architecture

```text
Claude Code  ←—stdio—→  MCP Server (bun)  ←—HTTP—→  permit-worker:47822
                          apps/dust-permits-mcp/            apps/dust-permits/
```

Thin stdio process wrapping `PermitClient` from `@permits/client`. No business logic — just tool registrations that map 1:1 to client methods.

## Entry Points

- `index.ts`: Entry point (stdio transport)
- `src/server.ts`: McpServer setup + PermitClient instantiation
- `src/tools.ts`: All tool registrations

## Configuration

Configured in `.mcp.json` at repo root. Claude Code auto-discovers it on session start.

```json
{
  "desert-permits": {
    "command": "bun",
    "args": ["run", "apps/dust-permits-mcp/index.ts"],
    "env": { "PERMIT_WORKER_URL": "http://localhost:47822" }
  }
}
```

## Available Tools (17)

| Tool | Operation | Read-only |
|------|-----------|-----------|
| `permit_health` | Check worker health | yes |
| `permit_browser_status` | Browser session state | yes |
| `permit_list` | List all permits | yes |
| `permit_get` | Get permit by ID | yes |
| `permit_search` | FTS search permits | yes |
| `permit_expiring` | Get expiring permits | yes |
| `permit_scrape` | Scrape portal data | yes |
| `permit_scrape_pdf` | Scrape + download PDF | yes |
| `permit_form_schema` | Get FormData JSON Schema | yes |
| `permit_form_defaults` | Get default form values | yes |
| `permit_create` | Create new application | no |
| `permit_renew` | Start renewal (no payment) | no |
| `permit_renew_and_pay` | Full renew + submit + pay | no |
| `permit_close` | Close/terminate permit | no |
| `permit_revise` | Submit revision | no |
| `permit_delete` | Delete draft | no |
| `permit_sync` | Sync from portal | no |

## Change Rules

If you add or change a `PermitClient` method:
1. Add/update the corresponding tool in `src/tools.ts`.
2. Update the tool table above.

## Critical: stdio Purity

**Never use `console.log`** — it writes to stdout and corrupts JSON-RPC framing.
Use `console.error` for any logging.
