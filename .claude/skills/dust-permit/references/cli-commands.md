# Permit Operations Command Reference

For agent and ops workflows, use the permit-worker HTTP API (or `PermitClient`) as the canonical interface.

- API reference: `references/api-reference.md`
- Typed client: `packages/permits/src/client.ts`

## Recommended Host Commands (`curl`)

```bash
# Health
curl http://localhost:47822/health

# List permits
curl http://localhost:47822/api/permits

# Get one permit
curl http://localhost:47822/api/permits/D0061391

# Renew permit
curl -X POST http://localhost:47822/api/permits/D0058823/renew \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"Weis Builders Inc"}'

# Revise permit
curl -X POST http://localhost:47822/api/permits/D0064070/revise \
  -H 'Content-Type: application/json' \
  -d '{"revisionType":"contact","notes":"Update contact details"}'

# Close permit
curl -X POST http://localhost:47822/api/permits/D0056240/close \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Project complete"}'

# Delete all drafts
curl -X DELETE http://localhost:47822/api/permits/drafts
```

## Create Permit with Overrides

`/api/permits/create` expects `formDataPath` (in-container file path).

```bash
# Copy overrides into running permit-worker container
docker exec desert-permit-worker sh -lc 'mkdir -p /app/data/overrides'
docker cp /tmp/project-overrides.json desert-permit-worker:/app/data/overrides/project-overrides.json

# Call create endpoint
curl -X POST http://localhost:47822/api/permits/create \
  -H 'Content-Type: application/json' \
  -d '{"flow":"existing-company","companyName":"Company Name","formDataPath":"/app/data/overrides/project-overrides.json"}'
```

## Legacy CLI Note (App-Local Debug Only)

`apps/dust-permits/src/cli.ts` still exists for package-level debugging from inside `apps/dust-permits`, but it is not the canonical ops path for multi-service runtime.

```bash
cd apps/dust-permits
bun src/cli.ts list
```

Do not use legacy path references such as `apps/workers/permit-workers/` or SQLite-based permit lookup instructions.
