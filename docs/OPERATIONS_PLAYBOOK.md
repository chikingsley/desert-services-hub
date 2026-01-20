# Operations Playbook: Intake & Contracts

One source of truth for when work hits your inbox. Follow this step-by-step.

---

## 1. Intake: Identify What Landed
**Goal:** Triage emails within minutes.

| Signal | Source | Action |
| :--- | :--- | :--- |
| **Contract/LOI** | DocuSign / Email PDF | Proceed to [Section 2: Contract Processing](#2-contract-processing) |
| **Dust Permit Req** | Email | Create minimal Notion, check grading plan & acreage |
| **SWPPP Plan Req** | Email | Create minimal Notion, send drawings to engineer |
| **BMP Install Req** | Email | Verify project exists, confirm site access & mobilization |

---

## 2. Contract Processing
**Goal:** Full reconciliation and setup.

1.  **[ ] Research Project**: Search email/Monday for history.
2.  **[ ] Find Estimate in Monday**: Locate item by project name/GC/address.
3.  **[ ] Create/Update Notion**: Ensure project record exists.
4.  **[ ] Mark "Won" in Monday**: Set `BID_STATUS` = "Won".
5.  **[ ] Mark Competing Lost**: Set `BID_STATUS` = "GC Not Awarded" for other bids.
6.  **[ ] Get Estimate PDF**: Download from Monday or QB.
7.  **[ ] Get Contract PDF**: Save to SharePoint, link in Notion/Monday.
8.  **[ ] Extract Data**: Use extraction template. Capture:
    - Contract type, date, value
    - Retention %, billing platform, billing window
    - Certified payroll requirements
    - Schedule of values (attach separately)
    - All contacts (PM, Super, Billing)
    - Scope summary (line items)
    - Insurance requirements (GL, umbrella, auto, WC limits)
    - Site info (address, hours, access, safety)
    - Red flags or unusual terms
9.  **[ ] Verify Insurance**: Compare contract requirements against Desert Services limits (see Quick Reference below). If limits exceed coverage, STOP - contact WTW (Katie Beck) to revise contract or request exception BEFORE signing.
10. **[ ] Reconcile**: Compare totals and scope. Identify Added/Removed items.
11. **[ ] Award Value in Monday**: Set `AWARDED_VALUE` to actual contract amount.
12. **[ ] QuickBooks Update (Manual)**: Update job, address, and estimate version.
13. **[ ] SharePoint Setup**: Create folder structure (`01-Estimates`, `02-Contracts`, etc.).
14. **[ ] Finalize Notion**: Populate all fields and set status to "Validated".
15. **[ ] Internal Email**: Notify team using the standard template.
16. **[ ] Track Open Items**: Create Notion tasks for any missing docs/info.

---

## Quick Reference: System Map

| System | Role | Primary Field |
| :--- | :--- | :--- |
| **Monday** | Estimates & Sales | Estimate ID, Bid Status, Awarded Value |
| **Notion** | Projects & Project-Specific Tasks | Full Contract Data, Site Info, Handoff Docs |
| **SharePoint** | Document Storage | `/Projects/Active/[GC]/[Project]/` |
| **QuickBooks** | Financials | Job Name, Invoices, Final Estimate |

---

## Templates
- Extraction: `services/contract/templates/01-contract-extraction.md`
- Reconciliation: `services/contract/templates/02-reconciliation.md`
- Internal Email: `services/contract/templates/03-internal-contracts-email.md`
- Clarification Email: `services/contract/templates/04-client-clarification-email.md`

---

## Quick Reference: Desert Services Insurance Limits

**Current Policy Period:** [Verify with WTW annually at renewal]

- General Liability (per occurrence): $1,000,000
- General Liability (aggregate): $2,000,000
- Umbrella / Excess: $3,000,000
- Auto Liability: $1,000,000
- Workers Comp: Statutory
- Employer's Liability: $1,000,000

**Common Contract Requirements & What to Do:**

- GL $1M / $2M aggregate: OK, standard
- Excess/Umbrella $5M+: STOP - revise to $4M combined ($1M GL + $3M excess) before signing
- Excess/Umbrella $4M: OK (with $1M GL)
- Excess/Umbrella $3M: OK
- Performance/Payment Bond: Contact Dawn/Eva for bonding capacity check

**WTW Contact:**
- Katie Beck, Senior Client Advocate
- (952) 842-6329 / katie.beck@wtwco.com
- COI requests: certificates@wtwco.com

**Key Lesson:** Contracts signed with insurance requirements exceeding our limits create delays and exception requests. Always verify BEFORE signing - it's easier to revise the contract than request an exception after.
