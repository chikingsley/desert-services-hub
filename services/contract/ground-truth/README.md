# Ground Truth - Staging Area

This folder is a **free-flowing staging area** for contract extraction ground truth data.

## Purpose

Collect and validate extraction outputs from real contracts before formalizing them into structured test fixtures.

## Workflow

1. **Stage here** - Drop contracts, extraction outputs, and notes in this folder
2. **Validate** - Review extractions against source documents, annotate corrections
3. **Formalize** - Once validated, migrate to `../test-fixtures/{project-name}/` with proper `expected.json`

## Current Test Fixtures (Formalized)

These have been fully validated and structured:

- `../test-fixtures/greenway-embrey/` - Embrey Builders, 12th & Greenway SWPPP + Garage Cleaning ($46,021)
- `../test-fixtures/kiwanis-caliente/` - Caliente Construction, Kiwanis Park SWPPP/Dust ($10,547.50)

## Candidates for Formalization

From `.planning/EXTRACTION_AUDIT.md`:

- **Trailhead Multifamily** - Layton Construction PO, SWPPP materials ($20,170)
- **Sprouts Rita Ranch** - A.R. Mays LOI, SWPPP design/install (value TBD)

## File Naming Convention

When staging, use descriptive names:

```
{project-shortname}/
  source-contract.pdf
  source-estimate.pdf
  extraction-raw.json      # Raw Claude extraction output
  extraction-corrected.json # Human-corrected version
  notes.md                  # Observations, issues, edge cases
```

## Notes

- This is informal - structure doesn't need to match test-fixtures yet
- Focus on capturing edge cases and extraction failures
- Add comments inline where extraction got things wrong
