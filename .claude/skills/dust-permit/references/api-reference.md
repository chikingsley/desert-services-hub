# Permit Worker API Reference

## CLI (Primary Interface)

All permit operations use the CLI at `packages/permits/cli.ts`, which wraps `PermitClient`:

```bash
bun run permit <command> [args] [flags]
```

The CLI auto-defaults to `http://localhost:47822` (host port binding). See `bun run permit` for full usage.

## Base URLs

| Context | URL | When |
|---------|-----|------|
| Host shell / CLI | `http://localhost:47822` | CLI default, Claude Code, local dev |
| Docker container | `http://permit-worker:47822` | App code via `PermitClient` default |
| Override | `PERMIT_WORKER_URL` env var | Either context |

## Endpoint Contract

| Method | Endpoint | Request Body |
|---|---|---|
| `GET` | `/health` | none |
| `GET` | `/api/permits` | none |
| `GET` | `/api/permits/:id` | none |
| `POST` | `/api/permits/create` | `{ flow, companyName?, copyFromApp?, formDataPath? }` |
| `POST` | `/api/permits/:id/renew` | `{ companyName? }` |
| `POST` | `/api/permits/:id/revise` | `{ revisionType, notes? }` |
| `POST` | `/api/permits/:id/close` | `{ reason? }` |
| `DELETE` | `/api/permits/:id` | none |
| `DELETE` | `/api/permits/drafts` | none |
| `POST` | `/api/scrape/pdf` | `{ permitId, outputDir? }` |
| `GET` | `/api/scrape/:id` | none |
| `POST` | `/api/sync` | none |
| `POST` | `/api/sync/company` | none |
| `POST` | `/api/invoices/pdf` | `{ invoiceNumber, outputDir? }` |
| `GET` | `/api/browser/status` | none |
| `POST` | `/api/browser/start` | none |
| `POST` | `/api/browser/ready` | none |
| `POST` | `/api/browser/keepalive` | none |
| `POST` | `/api/browser/stop` | none |
| `POST` | `/api/browser/clipboard/paste` | `{ text }` |
| `POST` | `/api/browser/clipboard/copy` | none |

## Create Permit Notes

`POST /api/permits/create` accepts `formDataPath` (path inside the permit-worker container), not inline `formData`.

```bash
# 1) put overrides file into container
docker exec desert-permit-worker sh -lc 'mkdir -p /app/data/overrides'
docker cp /tmp/project-overrides.json desert-permit-worker:/app/data/overrides/project-overrides.json

# 2) call create endpoint
curl -X POST http://localhost:47822/api/permits/create \
  -H 'Content-Type: application/json' \
  -d '{"flow":"existing-company","companyName":"Company Name","formDataPath":"/app/data/overrides/project-overrides.json"}'
```
