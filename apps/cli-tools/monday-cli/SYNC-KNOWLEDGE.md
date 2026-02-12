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

### 1. ALWAYS Skip Template/Non-Sync Groups

The API returns items from groups that should NOT be synced to SharePoint:

1. **"Shell Estimates ( Do Not Move)"** - These are TEMPLATES, not real estimates. They have NO account data.
2. **"Sales Team Estimates"** - These are sales-specific items that should not sync.

```typescript
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];
items = items.filter((item) => !SKIP_GROUPS.includes(item.groupTitle));
```

**Symptom if not skipping Shell Estimates**: "98% of items have no account" - WRONG! Only Shell Estimates lack accounts.

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

### 3.1 Resolution Audit Command (Direct-First Semantics)

Use the CLI audit command to measure direct relation coverage before deleting legacy/mirror columns:

```bash
bun apps/cli-tools/monday-cli/bin/cli.ts audit-rel all --active-only
bun apps/cli-tools/monday-cli/bin/cli.ts audit-rel estimating-account --active-only
```

Bucket meanings:

- `direct`: target direct relation column on that board is populated
- `relation_fallback`: direct is blank, but a defined legacy relation chain resolves
- `display_fallback`: direct and relation fallback are blank, but mirror/display value exists
- `unresolved`: none of the above (no direct, no relation fallback, no display fallback)

Important: `relation_fallback` is chain-specific and board-specific. It does **not** mean “generic fallback.” For example, Estimating account fallback is `deal_contact -> contact_account`.

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

### 6. Efficient Monday Queries with `query_params`

For searching items by name or column value, use `query_params` with `rules` instead of fetching all items and filtering client-side. This is **much faster** for large boards.

**Search items containing text in name:**

```typescript
const result = await query(`
  query {
    boards(ids: ${BOARD_ID}) {
      items_page(limit: 500, query_params: {
        rules: [{column_id: "name", compare_value: ["TF"], operator: contains_text}]
      }) {
        cursor
        items { id name group { title } }
      }
    }
  }
`);
```

**Cursor pagination with filtering:**

```typescript
let items = result.boards?.[0]?.items_page?.items || [];
let cursor = result.boards?.[0]?.items_page?.cursor;

while (cursor) {
  const next = await query(`
    query {
      boards(ids: ${BOARD_ID}) {
        items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items { id name group { title } }
        }
      }
    }
  `);
  items = items.concat(next.boards?.[0]?.items_page?.items || []);
  cursor = next.boards?.[0]?.items_page?.cursor;
}
```

**Update item name (batch-friendly):**

```typescript
const escapedName = newName.replace(/"/g, '\\"');
await query(`
  mutation {
    change_simple_column_value(
      board_id: ${BOARD_ID}
      item_id: ${itemId}
      column_id: "name"
      value: "${escapedName}"
    ) { id }
  }
`);
```

**Quick one-off queries with `bun -e`:**

For ad-hoc searches/updates, inline scripts are acceptable:

```bash
bun -e '
import { query } from "./monday/client";
const result = await query(`query { boards(ids: 7943937851) { items_page(limit: 100, query_params: { rules: [{column_id: "name", compare_value: ["TF"], operator: contains_text}] }) { items { id name } } } }`);
console.log(result.boards[0].items_page.items);
'
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
  "GC Not Awarded": "Lost",
};
```

### Standard Item Name Prefixes

Items use standardized prefixes to indicate service type. Always use the format `PREFIX: PROJECT_NAME`.

#### Variant Prefixes (consolidated into base project folder)

These are variants of a main project - they get consolidated into the same SharePoint folder.

| Prefix | Meaning | Example |
| -------- | --------- | --------- |
| **TF** | Temp Fence | `TF: ECHO CANYON` |
| **PJ** | Porta John (portable toilets) | `PJ: SIGNATURE` |
| **RO** | Roll Off (garbage containers) | `RO: CRASH CHAMPIONS` |
| **REBID** | Re-bid of existing project | `REBID: QTS PHX3` |

**How consolidation works:**

1. Strip variant prefix from folder name: `TF: ECHO CANYON` → folder `ECHO CANYON/`
2. Add suffix to uploaded files: `estimate.pdf` → `estimate-TF.pdf` (or `-PJ`, `-REBID`, `-RO`)
3. Delete old variant folder after consolidation

```typescript
// Matches TF, PJ, RO, or REBID prefix with space, dash, underscore, or colon
const variantMatch = name.match(/^(TF|PJ|RO|REBID)[\s\-_:]+(.+)$/i);
```

#### Service Type Prefixes (standalone items)

These indicate the type of service but are NOT consolidated - each is its own estimate.

| Prefix | Meaning | Example |
| -------- | --------- | --------- |
| **CFS** | Compost Filter Sock | `CFS: MIRABEL GOLF CLUB` |
| **INSPECTIONS** | Inspection services | `INSPECTIONS: HENRI APARTMENTS` |
| **LW** | Lot Wash / Cleaning | `LW: STELLAR AIRPARK` |
| **MISC** | Miscellaneous | `MISC: INDIAN SCHOOL & GOLDWATER` |
| **SF** | Silt Fence | `SF: WHATABURGER` |
| **SS** | Street Sweeping | `SS: LIFETIME FITNESS` |

**Do NOT use these (strip them if found):**

- `MISC ESTIMATE FOR:` → use `MISC:`
- `CLEANING:` → use `LW:`
- `SILT FENCE FOR:` → use `SF:`
- `STREET SWEEPING FOR:` → use `SS:`
- `PRE-SWPPP BUDGETING ESTIMATE FOR:` → just use project name
- `WASTEWATER STUFF FOR:` → just use project name
- `DUST PERMIT ESTIMATE FOR:` → just use project name

### Same Project Name, Different Contractors

Multiple Monday items can have the **same project name** but different contractors (e.g., sending bids to multiple GCs). These are handled correctly:

```text
PINAL COUNTY FLEET SERVICES (sent to ABC Construction)
  → Customer Projects/Submitted/A/ABC Construction/PINAL COUNTY FLEET SERVICES/

PINAL COUNTY FLEET SERVICES (sent to XYZ Builders)
  → Customer Projects/Submitted/X/XYZ Builders/PINAL COUNTY FLEET SERVICES/
```

**Each contractor gets their own folder** with their own files. The folder path includes the contractor name, so there's no conflict - the same project naturally separates by contractor.

This means:

- Files uploaded to different contractors stay completely separate
- No file naming conflicts between contractors
- Each contractor sees only their version of the estimate/plans/contracts

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
| `bin/sync-estimates.ts` | Main sync (use `--dry-run` first!) |
| `validate-sharepoint.ts` | Check folder structure |

## Running the Sync

```bash
# Always dry-run first
bun bin/sync-estimates.ts --dry-run --limit=100

# Check results, then real run
bun bin/sync-estimates.ts --limit=500

# Full sync (takes time)
bun bin/sync-estimates.ts
```

## Key Files

1. `bin/sync-estimates.ts` - Main sync logic with account resolution, TF consolidation, status folder moves
2. `src/client.ts` - Monday API with retry logic, `getItemsRich()`, `getItemNames()` batch lookup
3. `../sharepoint-cli/src/client.ts` - SharePoint Graph API client
4. `src/sync/sharepoint-ops.ts` - Folder hierarchy, move, upload, and URL writeback operations

## Key Learnings

1. **Don't trust first N items** - Shell Estimates appear first but aren't real data. Also exclude Sales Team Estimates.
2. **Board relations have `linkedItemIds`** - Use them, not just display text
3. **Mirror columns are display-only** - They show text from linked items but no IDs
4. **`#` breaks SharePoint paths** - Use `_Numeric` instead
5. **Monday API is flaky** - Always implement retry logic
6. **75% of items have accounts** - If you see 2%, you're looking at Shell Estimates or Sales Team Estimates

## Environment Variables Required

```text
MONDAY_API_KEY=<your-key>
AZURE_TENANT_ID=<tenant>
AZURE_CLIENT_ID=<client>
AZURE_CLIENT_SECRET=<secret>
```

## Fast SharePoint File Retrieval

Use the Microsoft Graph `/shares` endpoint for instant file access from stored URLs.

**Official docs:** <https://learn.microsoft.com/en-us/graph/api/shares-get>

### Why This Is Fast

Traditional approach requires: parsing URL → resolving site → finding drive → navigating folder path.

The `/shares` endpoint: URL → encoded token → single API call → done.

### How to Encode a SharePoint URL

```typescript
function encodeSharePointUrl(url: string): string {
  const base64 = btoa(url);
  // Convert to unpadded base64url format
  return "u!" + base64.replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
}

// Example
const fileUrl = "https://desertservices.sharepoint.com/sites/DataDrive/Shared Documents/Customer Projects/Active/W/Willmeng/Project/Estimates/estimate.pdf";
const sharingToken = encodeSharePointUrl(fileUrl);
// Result: u!aHR0cHM6Ly9kZXNlcnRzZXJ2aWNlcy5...
```

### API Calls

```typescript
// Get file metadata
GET https://graph.microsoft.com/v1.0/shares/{sharingToken}/driveItem

// Download file content directly
GET https://graph.microsoft.com/v1.0/shares/{sharingToken}/driveItem/content

// Get SharePoint list item (with custom fields)
GET https://graph.microsoft.com/v1.0/shares/{sharingToken}/listItem

// Expand to get everything at once
GET https://graph.microsoft.com/v1.0/shares/{sharingToken}/driveItem?$expand=listItem($expand=fields)
```

### Usage in Code

```typescript
async function getFileFromSharePointUrl(url: string): Promise<DriveItem> {
  const token = encodeSharePointUrl(url);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${token}/driveItem`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}

// Download file
async function downloadFromSharePointUrl(url: string): Promise<ArrayBuffer> {
  const token = encodeSharePointUrl(url);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${token}/driveItem/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.arrayBuffer();
}
```

### What We Store

The `sharepoint_url` column in Supabase Postgres estimates contains the full SharePoint URL. From this, we can:

1. Derive the sharing token instantly (no API call)
2. Fetch file metadata in one call
3. Download content in one call

No path parsing, no folder navigation, no site/drive resolution needed.

### Required Permissions

- `Sites.Read.All` or `Sites.Selected` - for reading files
- `Files.Read.All` - alternative permission

## Contact Sync & Enrichment

### Overview

Contacts board syncs to Supabase Postgres `contacts` table. The sync includes email matching, contractor linking, and phone enrichment from email signatures.

### Contact Board Groups in Monday

```typescript
const CONTACT_GROUPS = {
  ACTIVE: "topics",                    // Main active contacts
  OPEN_BIDS: "group_mksd6szc",        // Contacts with open bids
  BIDS_SENT: "group_mksdfj2a",        // Contacts who received bids
  SWPPP: "group_mkp9pntg",            // SWPPP-related contacts
  PERSONAL_EMAIL: "group_mm087tqw",   // Personal email addresses (gmail, yahoo, etc)
  INSUFFICIENT_INFO: "group_mm08qaqy", // Junk/test/incomplete contacts
} as const;
```

### Moving Contacts Between Groups

```typescript
import { query } from "./monday/client";

await query(`
  mutation {
    move_item_to_group(item_id: ${mondayItemId}, group_id: "${groupId}") {
      id
    }
  }
`);
```

**CLI command:**

```bash
bun cli/hub.ts move contact <hub_id> --group=PERSONAL_EMAIL
bun cli/hub.ts move contact <hub_id> --group=INSUFFICIENT_INFO
```

### Email Matching Strategies

**1. HIGH confidence (domain + name match):**

```sql
-- Contact has contractor with known domain
-- Email sender domain matches contractor domain
-- Sender name matches contact name (2+ name parts match)
```

**2. MEDIUM confidence (name match only):**

```sql
-- Sender name closely matches contact name
-- But domain doesn't match contractor domain
-- Often indicates job change or personal email
```

**3. Phone number matching:**

```typescript
// Extract last 10 digits from phone
const normalize = (p: string) => p.replace(/\D/g, "").slice(-10);

// Load contacts with phone, load email senders
// In-memory match is MUCH faster than SQL LIKE patterns
```

### Personal Email Detection

Move contacts with personal emails to a dedicated group:

```sql
SELECT id, monday_item_id FROM contacts
WHERE email LIKE '%@gmail.com'
   OR email LIKE '%@yahoo.com'
   OR email LIKE '%@hotmail.com'
   OR email LIKE '%@outlook.com'
   OR email LIKE '%@icloud.com'
   OR email LIKE '%@aol.com';
```

### Junk Contact Identification

Contacts to move to Insufficient Information group:

```sql
-- Single-word names without email (likely incomplete)
SELECT id FROM contacts
WHERE LENGTH(name) - LENGTH(REPLACE(name, ' ', '')) < 1
  AND (email IS NULL OR email = '');

-- Test/placeholder contacts
SELECT id FROM contacts
WHERE name LIKE 'TBD%'
   OR name LIKE '%test%'
   OR name LIKE '_TEST%'
   OR name LIKE 'BIDS@%'
   OR name LIKE '%Hotel%';
```

### Contact Enrichment from Email Signatures

Use AI to extract phone numbers and titles from email signatures:

```typescript
// 1. Find HIGH confidence email match
// 2. Get recent email body from that sender
// 3. Use Gemini to parse signature
// 4. Update Supabase Postgres and optionally Monday

// Phone fields in Monday CONTACTS board:
CONTACTS_COLUMNS.PHONE        // Default phone
CONTACTS_COLUMNS.MOBILE_PHONE // Mobile-specific
CONTACTS_COLUMNS.OFFICE_PHONE // Office-specific
CONTACTS_COLUMNS.COMPANY_PHONE // Company main line
CONTACTS_COLUMNS.TITLE        // Dropdown (has ~40 pre-defined titles)
```

### Update Contact in Both Systems

```bash
# Update Supabase Postgres only
bun cli/hub.ts update contact 3083 --email=bids@example.com

# Update Supabase Postgres AND Monday
bun cli/hub.ts update contact 3083 --email=bids@example.com --push

# Available fields: --email, --mobile, --office, --company, --title
```

### Contractor Linking

Contacts should link to contractors via `account_id` in Supabase Postgres. Match by email domain:

```sql
UPDATE contacts
SET account_id = (
  SELECT a.id FROM accounts a
  WHERE LOWER(c.email) LIKE '%@' || LOWER(a.domain)
)
WHERE account_id IS NULL
  AND email IS NOT NULL;
```

### Current Metrics (Feb 2026)

Clean contact metrics (excluding junk/test):

- Total real contacts: 4,161
- With email: 3,856 (92.7%)
- Without email: 305 (7.3%)
- With contractor link: 4,161 (100%)
- With phone: 3,460 (83.2%)
- Personal emails (separate group): 165
- Junk/test (separate group): 139
