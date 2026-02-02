# Hub Data Linking Documentation

**Last Updated:** 2026-01-30  
**Status:** Active reference document

This document consolidates the data linking issues and audit findings from the census database system.

---

## Current State

```text
Total emails:    223,646
Total accounts:   3,068
Total projects:   3,624
Total estimates:  4,781

Emails with account_id:  86,073 (38%)
Emails with project_id:  13,426 (6%)
Projects with account_id:    48 (1.3%)
```

---

## Data Model

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

---

## Known Issues

### Problem 1: Projects Not Linked to Accounts

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

### Problem 2: Estimate → Account Link Missing

**Issue:** `estimate.account_domain` is NULL even when `estimate.contractor` has a value.

**Fix Needed:** In `sync-estimates.ts`:

1. When upserting estimate, lookup account by contractor name
2. Set `account_domain` from matched account

### Problem 3: Duplicate Projects

**Issue:** Same project exists multiple times with slight name variations.

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

### Problem 4: Recent Emails Not Getting account_id

**Issue:** Recent chi@ emails have `account_id: NULL` even when sender domain has an account.

**Fix Needed:** For internal emails:

1. Don't try to link by sender domain (it's internal)
2. Link by subject/body content to project
3. Inherit `account_id` from the linked project

### Problem 5: Email → Project Linking Coverage is Low

**Issue:** Only 6% of emails have `project_id`. The linking logic exists but needs improvement.

---

## Email-to-Project Linking Audit

### Current Implementation

**Script:** `link-emails-to-projects.ts`

**Method:** SQL-based bulk updates using `LIKE` pattern matching

- Uses simple SQL: `LOWER(subject) LIKE '%project_name%'`
- Processes projects one-by-one (longer names first)
- Single transaction for all updates

### Match Quality Analysis

**Match Types Found:**

- Subject matches: 5,170 emails (36%)
- Body preview matches: 420 emails (3%)
- Body full matches: 579 emails (4%)
- "Other" matches: 8,167 emails (57%)

The "other" matches come from:

1. Conversation thread propagation
2. Project aliases/normalized names
3. Manual linking

### Potential Issues

1. **Catch-all Projects:**
   - `_Bids & RFPs` - 3,627 emails (likely too broad)
   - `_Admin & Operations` - 2,160 emails (likely too broad)

2. **False Positives:**
   - Simple `LIKE '%name%'` can match partial words
   - No word boundary checking

3. **Missing Matches:**
   - Script doesn't use conversation thread linking
   - Script doesn't use sender history matching

---

## Recommendations

### High Priority

1. **Implement conversation thread auto-linking**
   - When a new email syncs, check if `conversation_id` matches any already-linked email
   - If yes, inherit `project_id` from that email
   - This is the biggest win for increasing coverage

2. **Fix estimate → account linking** (`sync-estimates.ts`)
   - Match contractor name to account
   - Set `account_domain` on estimate

### Medium Priority

1. **Fix project → account linking**
   - When creating project from estimate, set `account_id`
   - Backfill existing projects from estimate data

2. **Dedupe projects**
   - Normalize names
   - Merge duplicates

### Future Improvements

1. **Better matching** - Use word-boundary regex instead of simple LIKE
2. **Confidence scoring** - Track which signal linked an email
3. **Sender history matching** - If sender usually emails about a project, link their emails

---

## Related Files

- `services/contract/census/link/emails-to-projects.ts` - Main email linking script
- `services/contract/census/link/estimates-to-projects.ts` - Estimate to project linking
- `services/contract/census/lib/link-accounts.ts` - Account linking logic
- `services/contract/census/sync/estimates.ts` - Estimate sync from Monday
- `services/contract/census/EDGE_CASES.md` - Edge cases that can't be auto-linked
