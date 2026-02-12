# Desert PDF CLI

Consolidated CLI entrypoint for Desert Services PDF workflows.

Current namespaces:
- `safety sssp` - Site Specific Safety Plan (SSSP)
- `safety sds` - Safety Data Sheets (SDS) inventory/binder

## Usage

```bash
# SSSP: create template JSON
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp init data/sssp/sssp.input.json

# SSSP: generate PDF
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp generate --in data/sssp/sssp.input.json --out data/sssp/SSSP.pdf

# SDS: create template JSON
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds init data/sds/sds-input.json

# SDS: inventory only
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds generate --in data/sds/sds-input.json --out data/sds/SDS_Chemical_Inventory.pdf

# SDS: full binder (inventory + appended sheets)
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder.pdf \
  --include-sheets

# SDS: pull sheets from entry.url when needed
bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder_From_URLs.pdf \
  --include-sheets \
  --download-sheets-from-url
```

## SDS options

- `--include-sheets`: append source SDS PDFs after the inventory.
- `--download-sheets-from-url`: fetch `entry.url` when local `entry.pdfPath` is missing.
- `--fail-on-missing-sheets`: exit non-zero when one or more sheets cannot be appended.
