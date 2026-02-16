# DS Inspections Email Worker

Cloudflare Worker that receives ComplianceGo inspection emails, generates PDFs, and uploads to SharePoint.

## Project Overview

- **Email**: `inspections@desertservices.app`
- **Worker URL**: `inspection-router.cheez2012.workers.dev`
- **SharePoint**: DataDrive site, Shared Documents, SWPPP/INSPECTIONS/PROJECTS/

## Quick Commands

```bash
# Check if inspection exists in SharePoint
bun cli/check-inspection.ts "<contractor>" "<project>" [date]

# Manual upload (generates PDF from ComplianceGo URL)
bun cli/manual-upload.ts "<report-url>" "<contractor>" "<project>" [date]

# Deploy worker
bun run deploy

# View worker logs
bun run tail
```

## Architecture

```text
src/
  index.ts              # Worker entry point (email handler, HTTP endpoints)
  parser.ts             # Email parsing, site name mapping

cli/
  check-inspection.ts   # Verify upload exists in SharePoint
  manual-upload.ts      # Generate PDF + upload to SharePoint

tests/
  parser.test.ts
  sharepoint-validation.test.ts
```

## Environment

Azure credentials in `.env` at worker root (Bun auto-loads):

```text
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

Worker secrets configured via `wrangler secret put`.

## Common Issues

### Upload fails with "JSON Content-Type" error

Path contains spaces that aren't URL-encoded. Already fixed in worker and client.

### "Could not determine SharePoint folder path"

Site name in ComplianceGo missing separator. Should be: `CONTRACTOR - PROJECT`

### Wrong date on manual upload

Use 4th parameter: `bun cli/manual-upload.ts "..." "CONTRACTOR" "PROJECT" "01.29.26"`
