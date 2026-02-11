# Narrative Inventory Scripts

This directory holds the organized tooling for the Eva->Jayson narrative corpus workflow.

## Scripts

- `download_eva_to_jayson_attachments.ts`
  - Queries hub DB + Graph and downloads Word attachments into local intake.
- `inventory_swppp_variables.ts`
  - Extracts raw key/value inventory from Word docs.
- `report_variable_inventory.ts`
  - Collapses raw extraction into canonical report + TSV outputs.
- `diff_narratives.ts`
  - Compares two narratives (canonical mode or full key mode).
- `export_snapshot.ts`
  - Copies local inventory outputs into committed workflow artifacts.
- `run.ts`
  - Orchestrator for running selected workflow steps.

## Typical Run

```bash
bun apps/narrative/scripts/narrative_inventory/run.ts --inventory --report --diff --export
```

