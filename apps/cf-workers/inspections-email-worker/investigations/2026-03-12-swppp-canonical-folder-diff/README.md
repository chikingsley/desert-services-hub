# SWPPP Canonical Folder Diff

Started: `2026-03-12`

## Why This Exists

This investigation treats the SWPPP master workbook as the canonical source of
truth for inspection project naming.

The goal is to compare:

- authoritative project names from the workbook
- actual project folders under `SWPPP/INSPECTIONS/PROJECTS` in SharePoint

This is intended to answer a strict question:

> Which SharePoint inspection folders do not match the source naming, and which
> canonical folders are missing?

## What This Folder Contains

- `generate-canonical-diff.ts`: reads the workbook and current SharePoint
  inspection tree, then writes the artifacts below.
- `output/source-projects.json`: canonical projects derived from the workbook.
- `output/sharepoint-projects.json`: current project folders discovered in the
  inspections tree.
- `output/canonical-diff.json`: exact matches, missing canonical folders, and
  extra SharePoint folders.
- `output/proposed-renames.json`: high-confidence rename targets, based on the
  strict diff plus deterministic similarity scoring.
- `output/summary.md`: human-readable summary for review.

## Run It

From the repo root:

```bash
bun --env-file .env "apps/cf-workers/inspections-email-worker/investigations/2026-03-12-swppp-canonical-folder-diff/generate-canonical-diff.ts"
```

## Notes

- This is read-only.
- It is meant to support a cleanup plan where SharePoint folder names are
  brought into alignment with the workbook, rather than teaching the worker to
  accept drift.
