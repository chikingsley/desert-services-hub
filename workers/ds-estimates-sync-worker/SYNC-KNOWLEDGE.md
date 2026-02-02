# Estimates Sync Worker - Critical Knowledge

> **IMPORTANT**: Read this before making changes. Past agents have repeatedly made the same mistakes.

## Overview

This worker syncs Monday.com Estimating board items to SharePoint folder structure:

```text
Customer Projects/{Status}/{Letter}/{Account}/{Project}/{Subfolder}/
```

## Board Information

- **Board ID**: `7943937851` (Estimating)
- **Total items**: ~4,780
- **Items with accounts**: ~75%

## Critical Monday.com API Knowledge

### 1. ALWAYS Skip "Shell Estimates" Group

The first ~100 items returned by Monday's API are from the **"Shell Estimates (Do Not Move)"** group. These are TEMPLATES, not real estimates. They have NO account data.

```typescript
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)"];
items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
```

**Symptom if not skipping**: "98% of items have no account" - WRONG! Only Shell Estimates lack accounts.

### 2. Board Relations vs Mirror Columns

The Estimating board has THREE ways to get account info:

| Column | ID | Type | What it provides |
| -------- | ----- | ------ | ------------------ |
| ACCOUNTS | `board_relation_mkzdd0r4` | `board_relation` | **Direct link** - use `linkedItemIds` |
| CONTACTS | `deal_contact` | `board_relation` | Fallback - contacts link to accounts |
| CONTRACTOR | `deal_account` | `mirror` | **Display only** - no IDs, just text |

**Resolution strategy** (in order):

1. Try `ACCOUNTS` board relation → get `linkedItemIds` → lookup account name
2. If empty, try `CONTACTS` → get contact IDs → lookup contact's `CONTRACTOR` relation → get account name
3. Fall back to `CONTRACTOR` mirror `displayValue`

### 3. Use `getItemsRich()` Not `getItems()`

Regular `getItems()` only returns `text` values. For board relations and mirrors, you need:

```typescript
const items = await getItemsRich(BOARD_IDS.ESTIMATING, { maxItems: limit });
```

This returns `columnValues` array with:

- `linkedItemIds` for board_relation columns
- `displayValue` for mirror columns

### 4. Pagination Settings

Monday's API is slow and can timeout. Use conservative settings:

```typescript
const PAGE_SIZE = 100; // NOT 500 - causes timeouts
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;
```

### 5. API Version

Use the latest stable API version:

```typescript
headers: { "API-Version": "2026-01" }
```

## SharePoint Path Rules

### Letter Folders

- A-Z for accounts starting with letters
- `_Numeric` for accounts starting with numbers (NOT `#` - causes path issues)

### Folder Name Sanitization

SharePoint has strict rules:

- No special chars: `"*:<>?/\\|#%~{}`
- **No trailing periods** - "Inc." becomes "Inc" (SharePoint rejects folders ending with `.`)
- **No newlines** - Replace `\r\n` with spaces
- Names can't be empty after sanitization

### Mirror Columns vs Board Relations

**CRITICAL**: Mirror columns have their value in `display_value`, NOT `text`:

```typescript
// WRONG - text is often null for mirrors
const value = item.columns[CONTRACTOR_ID]; // returns null

// CORRECT - use columnValues with displayValue
const mirrorCol = item.columnValues.find(c => c.id === CONTRACTOR_ID);
const value = mirrorCol?.displayValue; // returns "Account Name"
```

```typescript
function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  if (first >= "A" && first <= "Z") return first;
  return "_Numeric"; // NOT "#"
}
```

### Subfolders

Valid subfolders: `Estimates`, `Plans`, `Contracts`, `NOI`

### Status Mapping

```typescript
const STATUS_MAP = {
  "New": "Submitted",
  "Yet to Bid": "Submitted",
  "Bid Sent": "Submitted",
  "Won": "Active",
  "Pending Won": "Active",
  "Add to Projects": "Active",
  "Lost": "Lost",
  "Duplicates": "Lost",
  "GC Not Awarded": "Finished",
};
```

### Variant Prefix Consolidation

Some items have prefixes indicating they're variants of a main project. These should be consolidated into the same SharePoint folder as the base project.

| Prefix | Meaning | Example |
| -------- | --------- | --------- |
| **TF** | Temp Fence | `TF: ECHO CANYON` |
| **PJ** | Porta John (portable toilets) | `PJ: SIGNATURE` |
| **RO** | Roll Off (garbage containers) | `RO: CRASH CHAMPIONS` |
| **REBID** | Re-bid of existing project | `REBID: QTS PHX3` |

**NOT consolidated (standalone items):**

- **MISC** - Miscellaneous estimates with no matching base project

**How consolidation works:**

1. Strip variant prefix from folder name: `TF: ECHO CANYON` → folder `ECHO CANYON/`
2. Add suffix to uploaded files: `estimate.pdf` → `estimate-TF.pdf` (or `-PJ`, `-REBID`)
3. Delete old variant folder after consolidation

```typescript
// Matches TF, PJ, RO, or REBID prefix with space, dash, underscore, or colon
const variantMatch = name.match(/^(TF|PJ|RO|REBID)[\s\-_:]+(.+)$/i);
```

**Important:** The colon variant (`TF: PROJECT`, `REBID: PROJECT`) is common in the data.

## Common Errors and Fixes

### "Name already exists"

- **Cause**: Folder conflict during creation
- **Fix**: `ensureFolder()` catches 409 and returns existing folder

### "eTag mismatch"

- **Cause**: Concurrent modification
- **Fix**: Retry with delay

### "Invalid JSON" from Monday

- **Cause**: API timeout or rate limit
- **Fix**: Smaller page size, retry logic

## Scripts

| Script | Purpose |
| -------- | --------- |
| `sync-estimates.ts` | Main sync (use `--dry-run` first!) |
| `validate-sharepoint.ts` | Check folder structure |

## Running the Sync

```bash
# Always dry-run first
bun sync-estimates.ts --dry-run --limit=100

# Check results, then real run
bun sync-estimates.ts --limit=500

# Full sync (takes time)
bun sync-estimates.ts
```

## Key Files

1. `sync-estimates.ts` - Main sync logic with account resolution, TF consolidation, status folder moves
2. `monday/client.ts` - Monday API with retry logic, `getItemsRich()`, `getItemNames()` batch lookup
3. `client.ts` - SharePoint Graph API client
4. `validate-sharepoint.ts` - Folder structure validation utility

## Key Learnings

1. **Don't trust first N items** - Shell Estimates appear first but aren't real data
2. **Board relations have `linkedItemIds`** - Use them, not just display text
3. **Mirror columns are display-only** - They show text from linked items but no IDs
4. **`#` breaks SharePoint paths** - Use `_Numeric` instead
5. **Monday API is flaky** - Always implement retry logic
6. **75% of items have accounts** - If you see 2%, you're looking at Shell Estimates

## Environment Variables Required

```text
MONDAY_API_KEY=<your-key>
AZURE_TENANT_ID=<tenant>
AZURE_CLIENT_ID=<client>
AZURE_CLIENT_SECRET=<secret>
```
