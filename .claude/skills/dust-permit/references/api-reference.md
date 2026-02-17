# Permit Worker API Reference

Canonical permit operations are the permit-worker HTTP API plus the typed `PermitClient`.

## Base URLs

- Host shell: `http://localhost:47822`
- Container-to-container: `http://permit-worker:47822`

## Canonical Client (Repository Code)

```ts
import { PermitClient } from "@permits/client";

const client = new PermitClient();
const permit = await client.getPermit("D0061391");
```

`PermitClient` lives in `packages/permits/src/client.ts` and matches the API contract in `packages/permits/src/types.ts`.

## Health + Basic Checks

```bash
curl http://localhost:47822/health
curl http://localhost:47822/api/permits
curl http://localhost:47822/api/permits/D0061391
```

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

## Common `curl` Operations

```bash
# Renew
curl -X POST http://localhost:47822/api/permits/D0058823/renew \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"Weis Builders Inc"}'

# Revise (note: key is revisionType, not type)
curl -X POST http://localhost:47822/api/permits/D0064070/revise \
  -H 'Content-Type: application/json' \
  -d '{"revisionType":"contact","notes":"Update contact phone"}'

# Close
curl -X POST http://localhost:47822/api/permits/D0056240/close \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Project complete"}'

# Scrape PDF
curl -X POST http://localhost:47822/api/scrape/pdf \
  -H 'Content-Type: application/json' \
  -d '{"permitId":"D0061391"}'
```

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

If you do not need overrides, omit `formDataPath` and use defaults.
