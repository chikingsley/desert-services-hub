# Monday Board Audit

Last Updated: 2025-12-22

- --

## Board IDs

- Estimating: 7943937851 (4487 items)
- Projects: 8692330900 (1262 items)
- Inspection Reports: 8791849123 (1418 items)
- Contractors: 7943937856 (1316 items)
- Contacts: 7943937855 (4197 items)
- Dust Permits: 9850624269 (158 items)
- SWPPP Plans: 9778304069 (19 items)

- --

## Broken Mirrors - Fix Immediately

Inspection Reports - Account mirror (lookup_mkqy8nyj)

- Points to deleted column board_relation_mkp8qh5n on Projects board
- Fix: Reconfigure to pull from lookup_mktgnedy

Contractors - Deals mirror (account_deal)

- Points to deleted column contact_deal on Contacts board
- Fix: Reconfigure or remove

- --

## Data Chain - Root Cause

```text
Estimating (source of truth)
    ↓ link to Projects (94% EMPTY)
Projects
    ↓ mirrors are empty because upstream link not set
Inspection Reports, Dust Permits, SWPPP
    ↓ mirrors from Projects are empty

```text

If Estimating → Projects link was populated, most downstream mirrors would work.

Chain breaks verified:

- Estimating → Projects: 94% empty (2,000 items)
- Contacts → Accounts: 100% empty (2,000 items)
- Contractors → Contacts: 96% empty (1,316 items)
- Dust Permits → Estimate: 84% empty (158 items)

- --

## Empty Columns (100% - Delete or Hide)

Estimating:

- NOI, SWPP Plan, Onsite Contact, Close Probability, Sales Contact
- Forecast Value, Awarded, Field Sales Referrer, Contracts

Projects:

- Subitems, monday Doc v2, Completion % (old), Missing Estimate, Formula

Contractors:

- Account Type, Project Types, Pref Fence/Porto/Storm Vendor
- Last Contacted, monday Doc v2, Account Owner

Contacts:

- Priority, link to Incoming Calls

Dust Permits:

- Subitems

SWPPP Plans:

- Subitems

- --

## Underutilized Columns (80-99% empty - Backfill or Delete)

Estimating:

- link to Projects (84%) - critical, needs backfill
- Service Lines (85%)
- Estimate file (89%)
- SharePoint URL (98%)

Projects:

- Most mirrors 80-95% empty due to broken upstream links

Dust Permits:

- Most columns 80-95% empty

- --

## Junk Items to Delete

Contractors (77 items) - empty, no links:

- CONSOLIDATED CONTRACTING SVCS, CONTRACTOR Z, THOMAS WHITMER
- BC TEAM, VOID, Brian Dumpster, etc
- Full list: tempfiles/junk_report.csv

Contacts (74 items) - empty, no links:

- "New contact" entries (many)
- TBD entries
- Full list: tempfiles/junk_report.csv

Projects (1 item):

- "Test" in Project Opportunities

Inspection Reports (1 item):

- "test" in Job Complete

- --

## Duplicates to Merge

- Weitz Co (3): 18092990546, 18092993508, 18092993659
- Elder Contracting (2): 18092979523, 18092979679
- Permanent Location (3): 18143919337, 18143926587, 18143927940

- --

## Questions

1. Is Contacts board actively used? Link to Accounts?
2. Dust Permits link to Estimating or Projects?
3. Field Opportunity and Sales Contact columns still needed?
4. Incoming Calls phone system integration?
5. Delete or archive 77 junk contractors and 74 junk contacts?
