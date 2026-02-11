# Eva -> Jayson Narrative Inventory

This folder is the organized handoff package for the narrative corpus analysis.

Purpose:
- Keep one stable, committed place for "what we learned" from 202 real narratives.
- Define the canonical field contract that future extraction/mapping should target.
- Keep reproducible commands and artifact roles in one place.

## Folder Layout

```text
apps/narrative/workflows/eva-jayson-variable-inventory/
├── README.md
├── manifest.json
├── canonical-fields.ts
└── artifacts/
    ├── REPORT.md
    ├── CANONICAL_MVP.tsv
    ├── CANONICAL_DOCS.tsv
    └── DIFF_*.md
```

## File Roles

- `canonical-fields.ts`
  - Type-safe canonical field contract (the deterministic field surface to map from inputs).
  - This is the target schema for generation logic.
- `artifacts/REPORT.md`
  - Human-readable summary of inventory counts + canonical grouping.
- `artifacts/CANONICAL_MVP.tsv`
  - Canonical field-level stats (coverage + unique values + source key mapping).
- `artifacts/CANONICAL_DOCS.tsv`
  - Per-document canonical values (one row per narrative doc).
  - Best file for eyeballing what changes project-to-project.
- `artifacts/DIFF_*.md`
  - Example diffs (canonical and full section-by-section).
- `manifest.json`
  - Machine-readable inventory of the files and their purpose.

## Rebuild + Refresh Workflow

Run from repo root:

```bash
# 1) Build raw inventory from local intake docs
bun apps/narrative/scripts/narrative_inventory/inventory-swppp-variables.ts

# 2) Build canonical report/tsv from the raw inventory
bun apps/narrative/scripts/narrative_inventory/report-variable-inventory.ts

# 3) Export committed artifact snapshots into this folder
bun apps/narrative/scripts/narrative_inventory/export-snapshot.ts

# Optional: generate a fresh example diff
bun apps/narrative/scripts/narrative_inventory/diff-narratives.ts --auto
```

Or run the orchestrator:

```bash
bun apps/narrative/scripts/narrative_inventory/run.ts --inventory --report --diff --export
```

## What To Build Next

- Source packet capture is now scripted:
  - `bun apps/narrative/scripts/narrative_inventory/build-source-packets.ts --limit 20 --download`
  - Output location: `apps/narrative/data/intake/eva-to-jayson/source-packets/`
- Deterministic packet alignment report:
  - `bun apps/narrative/scripts/narrative_inventory/report-packet-alignment.ts`
  - Outputs: `alignment.md`, `alignment.csv` in the same source-packets folder.
- Next iteration:
  - Add plan/NOI deep extraction into canonical builder input.
  - Increase deterministic match rates in `alignment.md`.
