# Narrative Inventory Scripts

This directory holds the organized tooling for the Eva->Jayson narrative corpus workflow.

## Scripts

- `download-eva-to-jayson-attachments.ts`
  - Queries Supabase Postgres + Graph and downloads Word attachments into local intake.
- `inventory-swppp-variables.ts`
  - Extracts raw key/value inventory from Word docs.
- `report-variable-inventory.ts`
  - Collapses raw extraction into canonical report + TSV outputs.
- `diff-narratives.ts`
  - Compares two narratives (canonical mode or full key mode).
- `export-snapshot.ts`
  - Copies local inventory outputs into committed workflow artifacts.
- `build-source-packets.ts`
  - Builds candidate NOI/plan/estimate source packets from hub email metadata.
  - Optional `--download` writes selected attachments into packet folders.
- `report-packet-alignment.ts`
  - Deterministic field-level comparison of packet-derived fields vs `CANONICAL_DOCS.tsv`.
- `validate_source_packets.py`
  - Runs deterministic NOI+estimate -> canonical builder -> mapper flow on source packets.
  - Writes alignment artifacts and can optionally generate output SWPPP docs.
- `run.ts`
  - Orchestrator for running selected workflow steps.

## Typical Run

```bash
bun packages/narratives/scripts/narrative_inventory/run.ts --inventory --report --diff --export
```

## Source Packet + Alignment Flow

```bash
# Build candidate source packets (and download selected files)
bun packages/narratives/scripts/narrative_inventory/build-source-packets.ts --limit 20 --download

# Score deterministic packet alignment against canonical ground truth
bun packages/narratives/scripts/narrative_inventory/report-packet-alignment.ts

# Run deterministic payload builder + mapper against packets (strict all-field hard block)
uv run --directory packages/narratives python scripts/narrative_inventory/validate_source_packets.py --limit 20 --field-scope all --hard-block
```
