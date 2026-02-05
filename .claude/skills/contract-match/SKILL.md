---
description: Read a contract PDF and find the matching estimate in Monday. Use when user has a contract file and needs to find the related estimate.
user_invocable: true
---

# Contract Match Skill

Read a contract PDF and find the matching estimate in Monday CRM.

## When to Use

- User says "find the estimate for this contract"
- User has a contract PDF and wants to match it to Monday
- User says "match this contract" or "contract match"
- User drops a contract file and asks about the estimate

## Workflow

### 1. Read the Contract PDF

Use the Read tool to read the contract PDF. Extract these key fields:

- **Project Name** - The project/job name (e.g., "AMS Mesa", "Paradise Valley Site")
- **Contractor/Client** - Who the contract is with (e.g., "BC Construction Group")
- **Contract Amount** - Total value
- **Job Number** - Any reference numbers (e.g., "24-057")
- **Address** - Project site address
- **Scope** - What services are included (SWPPP, Dust, Temp Fence, etc.)

### 2. Search hub.db Estimates

Search the local hub.db which has all estimates synced from Monday:

```bash
sqlite3 /Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract/hub.db ".mode column" ".headers on" "
SELECT id, monday_item_id, name, contractor, bid_value, bid_status 
FROM estimates 
WHERE name LIKE '%PROJECT_NAME%' 
   OR contractor LIKE '%CONTRACTOR_NAME%'
   OR name LIKE '%ADDRESS_PART%'
LIMIT 20;
"
```

Multiple search strategies:

**Strategy 1: Project name search**

```bash
sqlite3 hub.db "SELECT id, monday_item_id, name, contractor, bid_value FROM estimates WHERE name LIKE '%PROJECT_NAME%' LIMIT 10;"
```

**Strategy 2: Contractor/account search**

```bash
sqlite3 hub.db "SELECT id, monday_item_id, name, contractor, bid_value FROM estimates WHERE contractor LIKE '%CONTRACTOR_NAME%' LIMIT 10;"
```

**Strategy 3: Address search (if available)**

```bash
sqlite3 hub.db "SELECT id, monday_item_id, name, contractor, bid_value FROM estimates WHERE name LIKE '%STREET%' OR name LIKE '%CITY%' LIMIT 10;"
```

**Strategy 4: Job number search**

```bash
sqlite3 hub.db "SELECT id, monday_item_id, name, contractor, bid_value FROM estimates WHERE name LIKE '%JOB_NUMBER%' LIMIT 10;"
```

### 3. Monday CLI (if hub.db insufficient)

If needed, search Monday directly:

```bash
cd /Users/chiejimofor/Documents/Github/desert-services-hub
bun -e "import { searchItems } from './services/monday/client'; console.log(await searchItems('7943937851', 'SEARCH_TERM'));"
```

## Example

**Input:** Contract PDF for "AMS Mesa" with BC Construction Group, $17,845

**Searches run:**

1. `hub.db LIKE '%AMS Mesa%'`
2. `hub.db LIKE '%BC Construction%'`
3. `hub.db LIKE '%Mesa%'`

**Output:** Found estimate "AMS - MESA" (ID: 12345) - High confidence match, amount $17,845 matches exactly.
