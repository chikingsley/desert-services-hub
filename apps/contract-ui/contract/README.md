# Contract Service

Contract intake, reconciliation, and project creation.

## Quick Start

Use the `/contract-intake` skill to process contracts end-to-end.

## Docs by Phase

### V0: Triage / Minimum Intake

- `../intake/schema.md` - V0/V1/V2 intake schema (start here)

### V1: Contract Processing

- `contract-reconciliation-template.md` - How to reconcile contract vs estimate
- `contract-intake-checklist.md` - Human + Agent task checklist
- `contract-intake-process.md` - End-to-end workflow

### V2: Full Project Setup

- `notion-project-record-schema.md` - Complete Notion page schema
- `data-needed.md` - All data fields needed for full setup

## Reference

- `internalcontracts-email-sample.md` - Example internal contracts email

## Test Fixtures

- `test-fixtures/greenway-embrey/` - Sample contract/estimate pair
- `test-fixtures/kiwanis-caliente/` - Sample contract/estimate pair

## Code

- `client.ts` - Contract parsing utilities
- `reconcile.ts` - Reconciliation logic
- `types.ts` - TypeScript types
