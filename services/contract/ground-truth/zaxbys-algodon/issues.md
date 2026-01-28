# Zaxby's Algodon — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** No citations provided for any extracted data.

**Examples of uncited data:**

- "GC PO: 0101-25" — no page reference or document source
- Contact "Jackie Atwell - Project Engineer, 480.236.5626" — no source
- "9304 W Thomas Rd, Phoenix, AZ 85037" — no source
- Estimate "$8,616.56" — no source

**Fix:** Upload PO document and add citations. Example format:

```
Source: po, page 1
Quote: "PO Number: 0101-25"
```

### 2. PO NOT UPLOADED TO FOLDER

**Problem:** Notes reference "PO from 41 North Contractors" but no PDF in folder.

**Current folder contents:** Only notes.md and tasks.md

**Fix:** Upload PO document to folder as `po-0101-25.pdf` or `contract.pdf`.

### 3. NO RECONCILIATION

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** Estimate value $8,616.56 stated but no reconciliation showing:

- What line items were in estimate
- What was actually delivered (fence, porta john, fence relocation)
- Does delivered scope match estimate?

**Fix:** Create reconciliation section:

```
Estimate: $8,616.56
Delivered:
- Site fence (stands with sandbags) - $X
- Porta john with weekly service - $X
- Fence relocation (~200 LF) - $X
Total: $X
Status: RECONCILED / NEEDS REVIEW
```

### 4. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 5. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow with PO document.

---

## Data Quality Issues

### 6. PROJECT MARKED AS "ACTIVE" BUT MONDAY SHOWS "PENDING WON"

**Problem:** Notes say "work has been delivered" but Monday estimate is still "Pending Won".

**Fix:** Update Monday immediately — mark as "Won" with confirmed award value.

### 7. MISSING INSURANCE VERIFICATION

**Problem:** No insurance requirements documented. 41 North may have standard requirements.

**Fix:** Check PO for insurance language and document requirements.

### 8. INVOICE/BILLING STATUS UNKNOWN

**Problem:** Notes mention invoices go to <accounting@41nc.com> but no invoice status.

**Questions:**

- Has invoice been sent?
- What's the invoice number?
- Is payment received?

**Fix:** Add billing status section to notes.

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| PO document | Missing from folder | Critical |
| Contract value | Estimate only | Critical |
| Line item breakdown | Missing | Important |
| Insurance requirements | Unknown | Important |
| Retention | Unknown | Nice to have |
| Invoice status | Unknown | Important |

---

## Actionable Next Steps

### Admin Tasks (Immediate)

1. [ ] Upload PO 0101-25 to folder
2. [ ] Update Monday estimate "TF: ZAXBY'S" from "Pending Won" to "Won"
3. [ ] Confirm awarded value matches PO amount
4. [ ] Merge tasks.md into notes.md
5. [ ] Verify SharePoint folder exists

### Extraction Tasks (After PO Upload)

1. [ ] Run extraction with citations from PO
2. [ ] Document insurance requirements
3. [ ] Complete reconciliation

### Relationship Tasks

1. [ ] Follow up on lunch and learn with Jackie Atwell (Michael Ricks)
2. [ ] Confirm invoices being sent correctly

---

## Ready for Action?

**PARTIALLY** — This is an active project with work already delivered.

**Current status:** Project is active, relationship recovered after initial slow response. Main action needed is admin cleanup (Monday status, SharePoint).

**No blocker for operations** — work is complete. Blocker is documentation compliance only.

**Key relationship note:** 41 North is a "very good customer" per Tim Haitaian. Michael Ricks recovered relationship with in-person visit and cookies after we were slow to respond.
