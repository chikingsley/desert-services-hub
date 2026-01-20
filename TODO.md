# Desert Services - Master TODO

* *Last Updated:** 2025-12-23

This is the master task list across all Desert Services automation projects.

- --

## Critical - Fix Immediately

### 1. Duplicate Prevention (Case Sensitivity)

- [ ] **$1** - `monday-notion-sharepoint-sync/src/lib/notion.ts`

  - `findAccountByName()` - Add `.toLowerCase().trim().replace(/\s+/g, ' ')`
  - `findContactByName()` - Same normalization
  - `findProjectByName()` - Same normalization

- [ ] **Add normalization to n8n-stuff Notion service** - `services/notion/client.ts`

  - Update `findOrCreateByTitle()` to normalize before lookup
  - Update `findOrCreateByEmail()` to normalize email (lowercase, trim)

### 2. Estimate Name Formatting (All-Caps Issue)

- [ ] **Add title-case transformation** - `sync.ts:parseItemName()`

  ```typescript
  function toTitleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  ```text

- [ ] Apply to project names before sync to Notion

### 3. Broken Monday Board Mirrors

- [ ] **$1** - Points to deleted column `board_relation_mkp8qh5n`

  - Fix: Reconfigure to pull from `lookup_mktgnedy`

- [ ] **Contractors → Deals mirror** - Points to deleted column `contact_deal`

  - Fix: Reconfigure or remove if not needed

- --

## High Priority - This Week

### 4. Monday Data Cleanup (Meeting Tomorrow)

- [ ] Delete 77 junk Contractors (empty, no links)
- [ ] Delete 74 junk Contacts (empty, no links, "New contact" names)
- [ ] Merge duplicate Contractors

  - Weitz Co (3 duplicates)
  - Elder Contracting (2 duplicates)
  - Permanent Location (3 duplicates)

- [ ] Backfill Estimating → Projects links (currently 94% empty)
- [ ] Backfill Dust Permits → Estimate links (currently 84% empty)

### 5. SLA Implementation

- [ ] Create validation function for estimates before sync
- [ ] Create "Needs Attention" queue in Notion for invalid items
- [ ] Add required field checks (see `docs/estimating-sla.md`)

- --

## Medium Priority - This Month

### 6. Backend Architecture

- [ ] Evaluate D1/Supabase for normalization layer

  - Purpose: Background dedup checking, normalized lookups
  - Could run hourly to find/flag duplicates

- [ ] Consider SQLite cache for faster lookups before hitting Notion API

### 7. Revision Tracking System

- [ ] Define naming convention: `{PREFIX}: {Project Name}` → `{PREFIX}: {Project Name} R1`
- [ ] Estimate ID format: `YYMMDD##` → `YYMMDD##-R1`
- [ ] Create automation: If estimate ID contains `-R1`, update title automatically
- [ ] Document revision workflow in SLA

### 8. SharePoint Integration

- [ ] Add "Bid Docs Folder" link field to estimates
- [ ] Auto-create SharePoint folder on estimate creation
- [ ] Sync plan files to SharePoint folder

### 9. Document Consolidation

- [ ] Merge `monday-board-audit.md` and `monday-board-issues.md` into one
- [ ] Update `current-work-status.md` or archive
- [ ] Create single source-of-truth for board schema

- --

## Low Priority - Q1 2025

### 10. N8N Migration

- [ ] Move sync worker logic to n8n for GUI-based editing
- [ ] Set up n8n workflows for

  - Monday → Notion sync
  - Email automations
  - File sync to SharePoint

### 11. Quoting App Integration

- [ ] Bidirectional sync: Quotes → Notion Projects
- [ ] Link quotes to Monday estimates
- [ ] Auto-generate estimate numbers from Monday

### 12. Data Quality Dashboard

- [ ] Create Notion dashboard showing

  - Incomplete estimates (missing required fields)
  - Duplicate accounts/contacts
  - Orphaned projects (no estimates linked)
  - Sync errors

- --

## Completed

- [x] Audit Monday boards - `docs/monday-board-audit.md`
- [x] Document broken mirrors and empty columns
- [x] Identify junk items for cleanup
- [x] Research industry best practices for estimating SLA
- [x] Create architecture analysis

- --

## Reference

### Key Files

| Purpose | Location |
|---------|----------|
| Notion Service | `services/notion/client.ts` |
| Monday Service | `services/monday/client.ts` |
| Sync Worker | `../desert-services-app/workers/monday-notion-sharepoint-sync/` |
| Quoting App | `../desert-services-app/services/quoting/` |
| Board Audit | `docs/monday-board-audit.md` |
| Board Issues | `docs/monday-board-issues.md` |
| Estimating SLA | `docs/estimating-sla.md` |

### Monday Board IDs

| Board | ID |
|-------|-----|
| Estimating | 7943937851 |
| Projects | 8692330900 |
| Contractors | 7943937856 |
| Contacts | 7943937855 |
| Inspection Reports | 8791849123 |
| Dust Permits | 9850624269 |
| SWPPP Plans | 9778304069 |

### Notion Database IDs

| Database | ID |
|----------|-----|
| Accounts | 2a7c1835-5bb2-804a-98ad-fcb53dbe8a7d |
| Contacts | 2a7c1835-5bb2-8034-a07c-d34bc174072d |
| Dust Permits | 49cd5e58-2c32-4fcb-ba35-e7b978b71e5a |
| Contracts | 2cec1835-5bb2-80d5-a1b0-fc9e8514e47f |
| Invoices | ddcc3072-ea35-4790-92be-75f6f4158731 |
