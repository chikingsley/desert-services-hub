# Documents Package (`packages/documents`)

PDF analysis and generation pipelines.

---

## Intake / PDF Analysis (`packages/documents/intake`)

Python FastAPI service for all document processing. Runs as `desert-pdf-analysis` on port 4848.

**Rule: TypeScript never does document extraction. It calls this service.**

### API Quick Reference

```ts
import { nativeExtract, ocrExtract, fullExtract, extractEstimate, extractNoi, extractContract } from "@lib/pdf-analysis";
```

| Function | Endpoint | Use when |
|----------|----------|----------|
| `nativeExtract(path)` | `/native-text-extraction` | Default — kreuzberg + classify |
| `ocrExtract(path)` | `/ocr-extraction` | Scanned/image docs, vision pass |
| `fullExtract(path)` | `/full-extraction` | High quality, expensive |
| `extractEstimate(path)` | `/estimate` | Desert Services estimate PDFs |
| `extractNoi(path)` | `/noi` | ADEQ NOI certificates |
| `extractContract(path)` | `/contract` | Subcontracts, POs, work orders |

Both `/estimate` and `/noi` return a `flags: string[]` field — LLM QC pass highlighting anomalies (math errors, missing fields, out-of-range values). Empty = clean.

### Rebuild

```bash
docker compose build pdf-analysis && docker compose up -d pdf-analysis
```

### Local dev

```bash
cd packages/documents/intake
uv sync
uv run uvicorn pdf_analysis.server:app --port 4848 --reload
uv run pytest
uv run ruff check src/
```

---

## SSSP Workflow Rules

Source of truth:
- `packages/documents/pdf-generation/`
- `packages/documents/pdf-generation/src/pdf/sssp/`

Current packet working directory:
- `data/triage/1400-w-3rd/`
- input: `data/triage/1400-w-3rd/sssp-input.json`

Section controls:
- Prefer explicit `sections[]` in input JSON.
- Legacy include flags still work as fallback.
- CLI override: `--sections water-truck,street-sweeping,portable-sanitation`
- CLI override all: `--sections all`

Input rules:
- `sections` values: `water-truck`, `street-sweeping`, `portable-sanitation`.
- `contacts[]` must include at least 5 entries with `role`, `name`, `phone`.
- Cover fields currently rendered: `projectName`, `gcName`, `date`, `projectAddress`, `jobNumber`.

Contact formatting:
- Use two-line phone format for lead/field/dispatcher rows:
  - `C: (###) ###-####`
  - `O: (###) ###-####`

---

## SDS Workflow Rules

When requested, clarify output type:
- `SDS Chemical Inventory` (inventory only)
- `SDS Binder` (inventory + SDS sheets)

Commands:

```bash
# inventory only
bun packages/documents/pdf-generation/cli/cli.ts safety sds generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Chemical_Inventory.pdf

# binder (append sheets)
bun packages/documents/pdf-generation/cli/cli.ts safety sds generate \
  --in data/sds/sds-input.json \
  --out data/sds/SDS_Binder.pdf \
  --include-sheets
```

Reliability rules:
- Prefer `entry.pdfPath` in `data/sds/sds-input.json`.
- Use `--download-sheets-from-url` only when needed.
- Use `--fail-on-missing-sheets` for strict client-facing builds.

---

## Delivery (Work Mac)

```bash
scp <file> work-mac:~/Downloads/1400w3rd/<final-name>.pdf
ssh work-mac 'osascript -e "tell application \"Preview\" to open POSIX file \"/Users/chiejimofor/Downloads/1400w3rd/<final-name>.pdf\""'
```

- Keep final files in `~/Downloads/1400w3rd/`.
- Move intermediate revisions to `~/Downloads/1400w3rd/archive/`.
