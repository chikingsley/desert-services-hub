# DM 47th Fighter Squadron (22-014) — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** No citations from the USACE letters despite having documents in folder.

**Examples of uncited data:**

- "Suspended since November 27, 2024" — no page reference
- "Cost escalation deadline Feb 13, 2026" — no source
- Contact "Todd Cruz - 847-840-9357" — no source

**Fix:** Add citations from USACE letters. Example:

```
Source: 22-014 C-0001 SERIAL LETTER - RESUMPTION OF WORK REQUEST.pdf, page 1
Quote: "The work order shall resume on..."
```

### 2. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 3. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow with USACE letters.

### 4. DOCUMENT NAMING ISSUE

**Problem:** Notes indicate potential mislabeling:
> "22-014 USACE LETTER C-0006 - SUSPENSION OF WORK EXTENSION #2.pdf (mislabeled, should be C-0007?)"

**Fix:** Verify document numbering and correct if needed.

---

## Data Quality Issues

### 5. ESTIMATE VALUE UNKNOWN

**Problem:** Notes say:
> "Estimate: 'DAVIS MONTHAN BLDG ADD FOR 47TH FIGHTER' - Won (value TBD)"

**Fix:** Find original estimate value in Monday and document.

### 6. ORIGINAL CONTRACT NOT IN FOLDER

**Problem:** Folder contains USACE letters but no original subcontract with Richard Group.

**Fix:** Upload original contract if available.

### 7. $10K CHANGE ORDER STATUS UNCLEAR

**Problem:** Notes mention "$10,000 change order approved to continue services indefinitely during suspension" but status unclear.

**Questions:**

- Was change order invoiced?
- Has it been paid?
- Is it documented in folder?

**Fix:** Document change order status and upload if available.

---

## Government Contract Compliance Notes

This is a USACE government contract with strict documentation requirements:

1. **All cost escalation requests must include:**
   - Original quotes vs updated quotes
   - Detailed documentation
   - Unsupported values will be denied

2. **Documentation deadline:** February 13, 2026

3. **Items to document:**
   - Extended warranties
   - Bond premium extensions
   - Insurance extensions
   - Extended general conditions
   - Cost escalation
   - Warehouse/CONEX storage rental
   - Re-inspections
   - Rework costs

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| Original contract | Missing from folder | Important |
| Estimate value | TBD | Important |
| Change order documentation | Missing | Important |
| Cost escalation supporting docs | Pending | Critical |
| Insurance extension costs | TBD | Important |
| Bond premium extension costs | TBD | Important |

---

## Actionable Next Steps

### URGENT - DUE FEB 13, 2026

1. [ ] Calculate cost escalation since suspension (Nov 27, 2024)
2. [ ] Document extended insurance costs
3. [ ] Document any bond premium extensions
4. [ ] Document extended general conditions
5. [ ] Document any storage costs (warehouse/CONEX)
6. [ ] Document re-inspection costs needed
7. [ ] Compare original quotes vs current pricing
8. [ ] Prepare detailed supporting documentation
9. [ ] Submit cost information to Todd Cruz by Feb 13, 2026

### Admin Tasks

1. [ ] Find original estimate value in Monday
2. [ ] Update Monday with suspension/resumption status
3. [ ] Review $10,000 change order status from Nov 2024
4. [ ] Create/update SharePoint folder
5. [ ] Merge tasks.md into notes.md

### Upon Resumption (End of Feb 2026)

1. [ ] Prepare for SWPPP inspection restart
2. [ ] Review revised scope when ASI package issued
3. [ ] Submit change order through GC Pay for new scope
4. [ ] Confirm new completion timeline (July 2027+)

---

## Ready for Action?

**YES - But time-critical**

**Current status:** Project suspended since Nov 2024, resumption planned Feb 2026.

**URGENT DEADLINE:** Cost escalation documentation due February 13, 2026 (16 days from now).

**Key actions:**

1. Gather all cost escalation documentation ASAP
2. Contact Todd Cruz (847-840-9357) with any questions

**Blocker:** Unsupported costs will be denied by Government — need proper documentation before deadline.
