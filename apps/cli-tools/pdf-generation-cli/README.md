# Desert PDF Generation CLI

Consolidated CLI entrypoint for Desert Services PDF workflows.

Current namespaces:
- `safety sssp` - Site Specific Safety Plan (SSSP)
- `safety sds` - Safety Data Sheets (SDS) inventory/binder
- `quoting estimate` - estimate PDF generation from canonical estimate records

## Usage

```bash
# SSSP: create template JSON
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp init data/sssp/sssp.input.json

# SSSP: generate PDF (uses sections from JSON)
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp generate --in data/sssp/sssp.input.json --out data/sssp/SSSP.pdf

# SSSP: override sections from CLI
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp generate \
  --in data/sssp/sssp.input.json \
  --out data/sssp/SSSP.pdf \
  --sections water-truck,street-sweeping

# SSSP: include all service sections
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sssp generate \
  --in data/sssp/sssp.input.json \
  --out data/sssp/SSSP.pdf \
  --sections all

# SDS: create template JSON
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds init data/sds/sds-input.json

# SDS: inventory only
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds generate --in data/sds/sds-input.json --out data/sds/SDS_Chemical_Inventory.pdf

# SDS: full binder (inventory + appended sheets)
bun apps/cli-tools/pdf-generation-cli/bin/cli.ts safety sds generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder.pdf \
  --include-sheets
```

## Options

SSSP:
- `--sections <value>`: section override (`all` or comma list of `water-truck`, `street-sweeping`, `portable-sanitation`)

SDS:
- `--include-sheets`: append source SDS PDFs after the inventory.
- `--download-sheets-from-url`: fetch `entry.url` when local `entry.pdfPath` is missing.
- `--fail-on-missing-sheets`: exit non-zero when one or more sheets cannot be appended.

Quoting estimate:
- `--id`: estimate id (required).
- `--output`: optional output PDF path. Defaults to current directory with canonical filename.
- `--include-back-page`: append estimate back page.
- `--backpage`: alias of `--include-back-page`.

## SSSP JSON Enforcement

`sssp generate` validates input JSON and fails fast on bad payloads.

Required:
- `projectName`
- `projectAddress`
- `contacts[]` with at least 5 contacts
- each contact must include: `role`, `name`, `phone`
- at least one service section must be selected (via `sections[]`, legacy include flags, or CLI `--sections` override)

Section selection:
- preferred: `sections[]` with one or more of `water-truck`, `street-sweeping`, `portable-sanitation`
- backward-compatible fallback: legacy `include*Section: true` fields if `sections[]` is not provided

## SSSP Field Rendering Notes

Currently rendered on the cover page:
- `projectName`, `gcName`, `date`, `projectAddress`, `jobNumber`

Structured metadata currently accepted but not rendered on the cover:
- `title`, `revision`, `preparedBy`, `approvedBy`, `projectCode`, `ownerName`, `startDate`, `duration`, `workHours`
