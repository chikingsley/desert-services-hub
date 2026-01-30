# Census Data Linking Issues

## Current State (2026-01-29)

```text
Total emails:    223,646
Total accounts:   3,068
Total projects:   3,624
Total estimates:  4,781

Emails with account_id:  86,073 (38%)
Emails with project_id:  13,426 (6%)
Projects with account_id:    48 (1.3%)
```

## Problem 1: Projects Not Linked to Accounts

**Issue:** Only 48 out of 3,624 projects have `account_id` set.

**Example:**

```sql
-- Project exists
SELECT * FROM projects WHERE name LIKE '%Diamond View%';
-- id: 44, name: "Diamond View at Ballpark", account_id: NULL

-- Estimate has contractor info
SELECT * FROM estimates WHERE name LIKE '%DIAMOND VIEW%';
-- contractor: "Catamount Constructors, Inc.", account_domain: NULL

-- Account exists
SELECT * FROM accounts WHERE name LIKE '%Catamount%';
-- id: 12, domain: "catamountinc.com", name: "catamountinc.com"
```

**Fix Needed:** When syncing estimates → projects:

1. Match `estimate.contractor` to `account.name` (fuzzy match)
2. Set `project.account_id` from the matched account
3. Set `estimate.account_domain` from the matched account

## Problem 2: Estimate → Account Link Missing

**Issue:** `estimate.account_domain` is NULL even when `estimate.contractor` has a value.

**Current:**

```text
estimate.contractor = "Catamount Constructors, Inc."
estimate.account_domain = NULL
```

**Should be:**

```text
estimate.contractor = "Catamount Constructors, Inc."
estimate.account_domain = "catamountinc.com"
```

**Fix Needed:** In `sync-estimates.ts`:

1. When upserting estimate, lookup account by contractor name
2. Set `account_domain` from matched account

## Problem 3: Duplicate Projects

**Issue:** Same project exists multiple times with slight name variations.

**Example:**

```sql
SELECT id, name FROM projects WHERE name LIKE '%Diamond View%';
-- 44:   "Diamond View at Ballpark"
-- 1035: "Diamond View At Ballpark"  (duplicate, different capitalization)
-- 1740: "Lac The Flats & Diamond View"
-- 3394: "The Diamond At Ballpark Village"
```

**Fix Needed:**

1. Normalize project names before insert
2. Dedupe existing projects (merge email counts, keep lowest ID)
3. Use `normalized_name` column for matching

## Problem 4: Recent Emails Not Getting account_id

**Issue:** Recent chi@ emails have `account_id: NULL` even when sender domain has an account.

**Example:** Email from `lacie@desertservices.net` about "Diamond View" has:

- `account_id: NULL` (internal email, no external account)
- `project_id: NULL` (should be linked based on subject)

**Fix Needed:** For internal emails:

1. Don't try to link by sender domain (it's internal)
2. Link by subject/body content to project
3. Inherit `account_id` from the linked project

## Problem 5: Email → Project Linking Not Running

**Issue:** Only 6% of emails have `project_id`. The linking logic exists but needs to run.

**Current linking signals (in `db/repositories/linking.ts`):**

1. Conversation thread - if sibling email is linked
2. Sender history - if sender usually emails about a project
3. Subject matching - if subject contains project name
4. Body matching - if body contains project name

**Fix Needed:** Run the linking batch job:

```bash
# In census folder
bun run link-emails.ts  # (needs to be created or run existing)
```

## Proposed Fix Order

1. **Fix estimate → account linking** (`sync-estimates.ts`)
   - Match contractor name to account
   - Set `account_domain` on estimate

2. **Fix project → account linking** (new script or in sync)
   - When creating project from estimate, set `account_id`
   - Backfill existing projects from estimate data

3. **Dedupe projects** (new script)
   - Normalize names
   - Merge duplicates

4. **Run email linking** (existing `linking.ts` functions)
   - Link by conversation
   - Link by subject
   - Link by body content

## Data Model (for reference)

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Account    │     │   Project    │     │   Estimate   │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id           │◄────┤ account_id   │     │ contractor   │
│ domain       │     │ name         │◄────┤ name         │
│ name         │     │ normalized   │     │ account_dom  │──► should match account.domain
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                    ▲
       │                    │
       │              ┌─────┴──────┐
       │              │   Email    │
       │              ├────────────┤
       └──────────────┤ account_id │
                      │ project_id │
                      │ subject    │
                      └────────────┘
```
