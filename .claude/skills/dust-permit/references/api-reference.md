# Permit Worker API Reference

## MCP Tools (Primary Interface for AI Agents)

Permit operations are exposed as MCP tools from `apps/dust-permits-mcp/`. Configured in `.mcp.json` at repo root.

## Base URLs

| Context | URL | When |
|---------|-----|------|
| MCP server / host shell | `http://localhost:47822` | Claude Code, local dev |
| Docker container | `http://permit-worker:47822` | App code via `PermitClient` default |
| Override | `PERMIT_WORKER_URL` env var | Either context |

## Endpoint Contract

| Method | Endpoint | Request Body |
|---|---|---|
| `GET` | `/health` | none |
| `GET` | `/api/permits` | none |
| `GET` | `/api/permits/search?q=...&limit=20` | none |
| `GET` | `/api/permits/expiring?days=30` | none |
| `GET` | `/api/permits/:id` | none |
| `POST` | `/api/permits/create` | `{ flow, companyName?, copyFromApp?, formDataPath?, formData? }` |
| `POST` | `/api/permits/:id/renew` | `{ companyName? }` |
| `POST` | `/api/permits/:id/renew-and-pay` | `{ companyName, expedited? }` |
| `POST` | `/api/permits/:id/revise` | `{ revisionType, notes? }` |
| `POST` | `/api/permits/:id/close` | `{ reason? }` |
| `DELETE` | `/api/permits/:id` | none |
| `DELETE` | `/api/permits/drafts` | none |
| `POST` | `/api/scrape/pdf` | `{ permitId, outputDir? }` |
| `GET` | `/api/scrape/:id` | none |
| `POST` | `/api/sync` | none |
| `POST` | `/api/sync/company` | none |
| `POST` | `/api/invoices/pdf` | `{ invoiceNumber, outputDir? }` |
| `GET` | `/api/form/schema` | none |
| `GET` | `/api/form/defaults` | none |
| `GET` | `/api/browser/status` | none |
| `POST` | `/api/browser/start` | none |
| `POST` | `/api/browser/ready` | none |
| `POST` | `/api/browser/keepalive` | none |
| `POST` | `/api/browser/stop` | none |
| `POST` | `/api/browser/clipboard/paste` | `{ text }` |
| `POST` | `/api/browser/clipboard/copy` | none |
