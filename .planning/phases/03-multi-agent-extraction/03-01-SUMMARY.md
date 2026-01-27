---
phase: 03-multi-agent-extraction
plan: 01
subsystem: extraction
tags: [zod, mistral, sqlite, llm, multi-agent]

# Dependency graph
requires:
  - phase: 02-text-extraction
    provides: contract_pages table with per-page text storage
provides:
  - 7 Zod schemas for extraction domains (contract-info, billing, contacts, sov, insurance, site-info, red-flags)
  - AgentName and AgentResult type definitions
  - contract_extractions table for storing agent results
  - storeAgentResult/getAgentResults storage functions
  - Mistral client factory with extraction settings
affects: [03-02, notion-sync, contract-review-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod schemas with .describe() for LLM guidance"
    - "pageReferences field for citation tracking"
    - "INSERT OR REPLACE for idempotent extraction storage"

key-files:
  created:
    - services/contract/agents/types.ts
    - services/contract/agents/schemas/contract-info.ts
    - services/contract/agents/schemas/billing.ts
    - services/contract/agents/schemas/contacts.ts
    - services/contract/agents/schemas/sov.ts
    - services/contract/agents/schemas/insurance.ts
    - services/contract/agents/schemas/site-info.ts
    - services/contract/agents/schemas/red-flags.ts
    - services/contract/agents/storage.ts
    - services/contract/agents/mistral-client.ts
  modified:
    - lib/db/index.ts

key-decisions:
  - "All Zod schema fields use .describe() to guide LLM extraction"
  - "Use .nullable() not .optional() so LLM always returns field"
  - "EXTRACTION_MODEL set to mistral-large-latest for accuracy"
  - "Temperature 0 for deterministic extraction"

patterns-established:
  - "Schema-per-domain: each extraction domain gets its own schema file"
  - "pageReferences: all schemas include page citation array"
  - "Mistral settings: temp 0, maxTokens 2048 for extraction"

# Metrics
duration: 8min
completed: 2026-01-23
---

# Phase 3 Plan 1: Extraction Foundation Summary

**7 Zod schemas with LLM-guided field descriptions, SQLite storage for agent results, Mistral client factory**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-23T14:40:16Z
- **Completed:** 2026-01-23T14:48:XX
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 1

## Accomplishments

- Created 7 type-safe Zod schemas covering all extraction domains (contract-info, billing, contacts, sov, insurance, site-info, red-flags)
- Each schema includes pageReferences field for citation tracking
- Added contract_extractions table to SQLite with foreign key to processed_contracts
- Implemented storeAgentResult/getAgentResults/getAllExtractedData storage functions
- Created Mistral client factory with EXTRACTION_MODEL and EXTRACTION_SETTINGS constants

## Task Commits

Each task was committed atomically:

1. **Task 1: Create types and all 7 Zod schemas** - `6f86423` (feat)
2. **Task 2: Create storage layer for agent results** - `b85f286` (feat)
3. **Task 3: Create Mistral client helper for extraction** - `d5baa79` (feat)

## Files Created/Modified

**Created:**

- `services/contract/agents/types.ts` - AgentName union type, AgentResult generic, ExtractionResults
- `services/contract/agents/schemas/contract-info.ts` - Contract type, dates, value, project details
- `services/contract/agents/schemas/billing.ts` - Retention, platform, contacts, certified payroll
- `services/contract/agents/schemas/contacts.ts` - PM and superintendent contact info
- `services/contract/agents/schemas/sov.ts` - Schedule of values line items and scope
- `services/contract/agents/schemas/insurance.ts` - Limits, COI, endorsements, bonding
- `services/contract/agents/schemas/site-info.ts` - Address, hours, access, safety
- `services/contract/agents/schemas/red-flags.ts` - Unusual terms, vague language, risk level
- `services/contract/agents/storage.ts` - storeAgentResult, getAgentResults, getAllExtractedData
- `services/contract/agents/mistral-client.ts` - createMistralClient factory, settings constants

**Modified:**

- `lib/db/index.ts` - Added contract_extractions table with index

## Decisions Made

- Used `.describe()` annotations on all schema fields to guide LLM extraction behavior
- Used `.nullable()` instead of `.optional()` so LLM always returns field (even if null)
- Set EXTRACTION_MODEL to "mistral-large-latest" for best accuracy (can benchmark ministral later)
- Set temperature to 0 for deterministic, reproducible extractions
- Set maxTokens to 2048 to handle complex schemas (SOV line items can be large)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. MISTRAL_API_KEY environment variable is already documented in previous phase.

## Next Phase Readiness

- All schemas ready for agent implementations in Plan 02
- Storage layer ready to persist extraction results
- Mistral client factory ready for chat.parse() calls
- No blockers for proceeding to Plan 02 (agent implementations)

---
*Phase: 03-multi-agent-extraction*
*Completed: 2026-01-23*
