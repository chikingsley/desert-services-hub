# Permit Operations Command Reference

Use `bun run permit` for all permit operations. The CLI wraps `PermitClient` and auto-defaults to `http://localhost:47822`.

## Commands

```bash
# Health + status
bun run permit health
bun run permit browser-status

# Read operations
bun run permit list
bun run permit get D0061391

# Mutations (auto 5-min timeout for browser automation)
bun run permit close D0063827 --reason completed
bun run permit renew D0058823 --company "Weis Builders Inc"
bun run permit renew-and-pay D0058823 --company "Weis Builders Inc" --dry-run
bun run permit renew-and-pay D0058823 --company "Weis Builders Inc" --yes
bun run permit revise D0064070 --type contact --notes "Update contact details"
bun run permit scrape-pdf D0061391
bun run permit scrape D0061391
bun run permit delete D0XXXXXX
bun run permit delete-drafts
bun run permit sync
bun run permit sync-company
```

## Create Permit (via curl — not yet in CLI)

`/api/permits/create` requires `formDataPath` (in-container file path), so it needs docker cp first:

```bash
docker exec desert-permit-worker sh -lc 'mkdir -p /app/data/overrides'
docker cp /tmp/project-overrides.json desert-permit-worker:/app/data/overrides/project-overrides.json

curl -X POST http://localhost:47822/api/permits/create \
  -H 'Content-Type: application/json' \
  -d '{"flow":"existing-company","companyName":"Company Name","formDataPath":"/app/data/overrides/project-overrides.json"}'
```

## E2E Tests (in-container)

```bash
# Renew+pay E2E in permit-worker runtime (VNC-visible)
docker exec desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/renew-and-pay.test.ts'

# Close E2E (dry run)
docker exec desert-permit-worker sh -lc 'cd /app/apps/dust-permits && bun test tests/e2e/close.test.ts'
```
