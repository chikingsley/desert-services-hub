# Desert SDS CLI

Generate a Desert Services-branded Safety Data Sheets (SDS) Chemical Inventory PDF using shared `lib/pdf/*` infrastructure.

This CLI supports two output types:
- `SDS Chemical Inventory` (list only)
- `SDS Binder` (inventory + appended SDS sheets)

## Usage

```bash
# Create a fill-out template JSON
bun apps/cli-tools/sds-cli/bin/cli.ts init data/sds/sds-input.json

# Generate inventory only (list)
bun apps/cli-tools/sds-cli/bin/cli.ts generate --in data/sds/sds-input.json --out data/sds/SDS_Chemical_Inventory.pdf

# Generate full SDS binder (inventory + appended sheets)
bun apps/cli-tools/sds-cli/bin/cli.ts generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder.pdf \
  --include-sheets

# If you want to pull sheets directly from entry.url values
bun apps/cli-tools/sds-cli/bin/cli.ts generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder_From_URLs.pdf \
  --include-sheets \
  --download-sheets-from-url
```

## Input Schema

Each entry may include:
- `url`: source URL (can be used with `--download-sheets-from-url`)
- `pdfPath`: local path to the SDS PDF (preferred for reliable binder builds)

`pdfPath` can be absolute or relative to the input JSON file directory.
