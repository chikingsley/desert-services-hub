# OneAZ Surprise — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** No citations provided for any extracted data.

**Examples of uncited data:**

- "PO 4 - SWPPP and Porta Potty Agreement" — no page reference
- "Kristie Breeden - Project Manager, 602.513.3137" — no source
- "Invoice # SW25-397-01, $2,552.07" — no source
- Location "Surprise, AZ" — no specific address

**Fix:** Upload PO documents and add citations. Example format:

```
Source: po, page 1
Quote: "PO Number: 4 - SWPPP and Porta Potty"
```

### 2. POs NOT UPLOADED TO FOLDER

**Problem:** Notes reference two POs but no PDFs in folder:

- PO 4 - SWPPP and Porta Potty Agreement
- PO 5 - Temp Fence

**Current folder contents:** Only notes.md and tasks.md

**Fix:** Upload both POs to folder.

### 3. MULTIPLE ESTIMATES - UNCLEAR WHICH IS ACTIVE

**Problem:** Three different estimates mentioned:

- 03252501 - ONEAZ CREDIT UNION - SURPRISE - $11,092 (older, Bid Sent)
- 11102505 - TF: ONEAZ - $17,008.52 (temp facilities, Bid Sent)
- 01072612 - ONEAZ - SURPRISE - 41 North - $15,975.50 (Bid Sent)

**Questions:**

- Which estimate corresponds to which PO?
- Are these three separate scopes or revisions?
- Which should be marked Won?

**Fix:** Clarify in notes which estimate maps to which PO:

```
PO 4 (SWPPP + Porta) → Estimate 01072612 ($15,975.50)
PO 5 (Temp Fence) → Part of 11102505 or separate?
```

### 4. NO RECONCILIATION

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** No reconciliation between any estimate and the POs.

**Fix:** Create reconciliation for each PO showing estimate vs contracted line items.

### 5. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 6. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow with PO documents.

---

## Data Quality Issues

### 7. GRATES PRICING ISSUE UNRESOLVED

**Problem:** Notes document a pricing issue:
> "PO showed track out grates but dollar amount not extended in estimate"
> "Michael Ricks notified Kristie about $350/month grate charge"
> "Resolution: Unknown from emails"

**This is a red flag** — pricing discrepancy not resolved before work started.

**Fix:**

1. Confirm if grates pricing was resolved
2. Document resolution in notes
3. Verify grate rental is being billed correctly

### 8. MISSING LOCATION DETAILS

**Problem:** Location listed as "Surprise, AZ" with no specific address.

**Fix:** Get full site address from PO or 41 North contact.

### 9. MONDAY ESTIMATES NOT UPDATED

**Problem:** Notes say estimate 01072612 should be marked Won, but shows "Bid Sent" status.

**Fix:** Update Monday immediately.

### 10. INVOICE PAYMENT STATUS UNKNOWN

**Problem:** Invoice SW25-397-01 sent for $2,552.07, due 1/20/26, but:

- Is it paid?
- Was due date 8 days ago (as of 1/28/26)

**Fix:** Follow up on payment status and document in notes.

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| PO documents | Missing from folder | Critical |
| Site address | Partial (city only) | Important |
| Estimate-to-PO mapping | Unclear | Critical |
| Grates pricing resolution | Unresolved | Critical |
| Invoice payment status | Unknown | Important |
| Insurance requirements | Unknown | Nice to have |

---

## Actionable Next Steps

### Immediate Actions

1. [ ] Upload PO 4 and PO 5 to folder
2. [ ] Mark estimate 01072612 as Won in Monday
3. [ ] Update awarded value in Monday
4. [ ] Clarify which estimate maps to which PO
5. [ ] RESOLVE grates pricing issue ($350/month)
6. [ ] Merge tasks.md into notes.md

### Documentation Tasks

1. [ ] Create SharePoint folder: Customer Projects/Active/F/41 North Contractors/OneAZ Surprise/
2. [ ] Upload POs to 02-Contracts folder
3. [ ] Add citations from POs to notes

### Billing Tasks

1. [ ] Follow up on invoice SW25-397-01 payment status (due 1/20/26)
2. [ ] Confirm if grate rental is being billed separately
3. [ ] Verify porta john service invoicing

### Operations Verification

1. [ ] Confirm SWPPP installation scheduled
2. [ ] Confirm porta john delivery complete

---

## Open Issues Requiring Resolution

### GRATES PRICING (HIGH PRIORITY)

**Background:** PO showed track-out grates, but estimate didn't extend the dollar amount. Michael notified 41 North about $350/month charge.

**Questions:**

1. Did 41 North agree to the $350/month?
2. Is it being billed?
3. If not agreed, are grates even installed?

**Action:** Contact Kristie Breeden to confirm resolution.

---

## Ready for Action?

**PARTIALLY** — Active project with work in progress, but documentation gaps.

**Current status:** POs signed (1/19/26 and 1/26/26), invoice sent, temp fence installed.

**Blockers:**

1. **Grates pricing unresolved** — potential billing issue
2. **Monday not updated** — admin cleanup needed
3. **No PO documents in folder** — cannot complete extraction

**Key relationship note:** Same GC as Zaxby's (41 North). Good customer relationship — be responsive.
