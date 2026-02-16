# Permit Workers

Maricopa County dust permit browser automation. Playwright-based portal scraping, PDF generation, permit lifecycle management (create, renew, revise, close).

## API Quick Actions (Preferred)

| User Says | API Call |
|-----------|----------|
| "Download PDF D0061391" | `curl -X POST http://localhost:47822/api/scrape/pdf -H 'Content-Type: application/json' -d '{"permitId":"D0061391"}'` |
| "Close permit D0056240" | `curl -X POST http://localhost:47822/api/permits/D0056240/close -H 'Content-Type: application/json' -d '{}'` |
| "Renew permit D0058823" | `curl -X POST http://localhost:47822/api/permits/D0058823/renew -H 'Content-Type: application/json' -d '{"companyName":"Company Name"}'` |
| "Revise contact on D0064070" | `curl -X POST http://localhost:47822/api/permits/D0064070/revise -H 'Content-Type: application/json' -d '{"revisionType":"contact","notes":"..."}'` |

## Legacy CLI (Debug Only)

The package-local CLI still exists for debugging from `apps/dust-permits`, but cross-service/runtime callers should use the API (or `PermitClient`).

## API Endpoints (port 47822)

The permit-worker runs a Bun.serve() HTTP API. Other containers call it via `http://permit-worker:47822`.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/scrape/pdf` | Scrape permit data + generate PDF |
| `GET` | `/api/scrape/:id` | Scrape permit data only (no PDF) |
| `POST` | `/api/permits/create` | Create new application |
| `POST` | `/api/permits/:id/renew` | Renew existing permit |
| `POST` | `/api/permits/:id/close` | Close permit |
| `POST` | `/api/permits/:id/revise` | Create revision |
| `DELETE` | `/api/permits/:id` | Delete draft |
| `DELETE` | `/api/permits/drafts` | Delete all drafts |
| `GET` | `/api/permits` | List all permits |
| `GET` | `/api/permits/:id` | Get single permit |
| `POST` | `/api/sync` | Sync from portal export |
| `POST` | `/api/sync/company` | Sync only company permits from portal export |
| `POST` | `/api/invoices/pdf` | Download invoice PDF by invoice number |
| `GET` | `/api/browser/status` | Browser session status |
| `POST` | `/api/browser/start` | Start browser session |
| `POST` | `/api/browser/stop` | Stop browser session |
| `GET` | `/health` | Health check |

### Scrape Response

`POST /api/scrape/pdf` with `{ permitId: "D0061391" }` returns:

```json
{
  "success": true,
  "permitId": "D0061391",
  "pdfPath": "/app/tests/output/pdfs/D0061391.pdf",
  "pdfBase64": "<base64-encoded PDF bytes>",
  "data": { /* PermitData — see below */ }
}
```

## PermitData (Scraped from Portal)

The scrape extracts a complete `PermitData` object. Key fields:

| Field | Type | Example |
|-------|------|---------|
| `applicationId` | string | "D0061391" |
| `projectName` | string | "Lexington 420" |
| `companyName` | string | "Stevens Leinweber" |
| `status` | string | "Active", "Submitted", "Closed" |
| `disturbedArea` | string | "64.3 Acres" |
| `issueDate` | string | "01/15/2026" |
| `expirationDate` | string | "01/15/2027" |
| `createdDate` | string | "12/01/2025" |
| `locations[]` | array | address, city, parcel (APN), lat/lng |
| `accessPoints[]` | array | lat/lng coordinates |
| `contact` | object | email, name, phone |
| `applicantCompany` | object | name, address, phone, email, entityType |
| `applicantOwner` | object | firstName, lastName, address, phone |
| `primaryContact` | object | firstName, lastName, title, email, phone |
| `project` | object | name, description, startDate, endDate |
| `isOwnerDeveloper` | boolean | true/false |
| `propertyOwnerDeveloper` | object\|null | only if applicant != owner |
| `trackoutDevices` | object | gravelPad, wheelWash, etc. |
| `waterMethods` | object | hose, waterTruck, etc. |

**CRITICAL: `disturbedArea` is NEVER null or zero for valid permits.** If you see "0.0 Acres", the polygon drawing is wrong.

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | API server entry point (all routes) |
| `src/portal/pdf.ts` | `generatePermitPdf()`, `generatePartBPdf()` |
| `src/portal/scrape.ts` | `extractPermitData()` — portal data extraction |
| `src/portal/types.ts` | `PermitData`, `PermitLocation`, type definitions |
| `src/handlers/scrape.ts` | CLI scrape handler |
| `src/api/scrape.ts` | HTTP scrape handlers |
| `src/api/permits.ts` | HTTP permit CRUD handlers |
| `src/lib/dust-features.ts` | FeatureServer API client (public, geometry only) |
| `src/portal/utils/helpers.ts` | Form helpers — **use these, don't reinvent** |
| `src/portal/utils/selectors/` | All portal selectors |

## Key Gotchas

- **ADF popups**: Use `clickInFrames()` from helpers.ts, never click directly on a frame
- **Confirmation popups**: Click action button, then click Cancel to dismiss (ADF quirk)
- **Map popup exception**: Don't close confirmation popup while map popup is open (ADF links them)
- **ESRI map**: Use REST API for geometry, not browser FeatureLayer (extent-dependent). See `docs/ESRI-MAP-DRAWING-GUIDE.md`
- **Selectors**: Define in `src/portal/utils/selectors/portal.ts`, never hardcode in tests
- **Headless**: Override with `HEADLESS=true|false` env var or `--headless`/`--headed` CLI flag

## Reference Docs

Detailed guides live in `docs/` — don't duplicate in CLAUDE.md:

- `docs/ESRI-MAP-DRAWING-GUIDE.md` — Map automation patterns
- `docs/architecture.md` — System architecture
- `docs/workflows.md` — Portal workflow details
- `docs/api.md` — API documentation
- `apps/dust-permits/docs/reference/playwright-patterns.md` — Playwright patterns
- `.planning/research/ESRI-MAP-GUIDE.md` — ESRI spike results
