# Elanto at Prasada — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** No citations provided for any extracted data.

**Examples of uncited data:**

- "Contact: Jared Tieman - Senior Construction Manager" — no source
- "Contract Admin: Sarahi Dehesa" — no source
- Insurance requirements (Section 13) — no page numbers or quotes
- "$4,940.00 (01222609 - PRASADA CLUBHOUSE)" — no source

**Fix:** Add citations from contract and emails. Example format:

```
Source: contract, page X
Quote: "Section 13. Insurance Requirements..."
```

### 2. DATA ACCURACY ERROR - WRONG NAME (Fixed)

**Original Problem:** tasks.md line 5 said "Jared Aiken" but should be "Jared Tieman".

**Status:** FIXED in this audit.

### 3. CONTRACT NOT UPLOADED TO FOLDER

**Problem:** Notes reference "Small Project Contract from Property Reserve" sent 1/27/26 but no PDF in folder.

**Current folder contents:** Only notes.md, tasks.md, and now issues.md

**Fix:** Upload contract document to folder as `contract.pdf`.

### 4. NO RECONCILIATION

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** Two different values mentioned with no reconciliation:

- Quick quote: $3,290.00 (1/23/26)
- Monday estimate: $4,940.00 (01222609)

**Questions unanswered:**

- Why did price increase from $3,290 to $4,940?
- What scope was added?
- Does contract match either amount?

**Fix:** Create reconciliation section showing:

```
Original quick quote: $3,290.00
- 1,100 LF wattles/silt fence @ $2.75 = $3,025.00
- Mobilization = $265.00

Final estimate: $4,940.00
- Additional scope: [what was added?]

Contract value: TBD (awaiting final contract)
```

### 5. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 6. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow once contract is signed.

### 7. NO VALIDATION RUN

Per WORKFLOW.md Step 4 (Validate):

**Rules not checked:**

- `INSPECTION_QUANTITY` — N/A (erosion control, not SWPPP inspections)
- `BMP_MOBILIZATION` — Mobilization is included ($265) ✓
- `NO_FINES_LIABILITY` — Not checked against contract language
- Insurance requirements — Listed but not verified against our coverage

**Fix:** Run validation once contract document is available.

---

## Data Quality Issues

### 8. INSURANCE STATUS NOT VERIFIED

**Problem:** Insurance requirements listed from Section 13:

- WC: $500K
- Employers Liability: $500K
- CGL: $1M/$2M
- Auto: $500K
- Property Reserve as Additional Insured

**But:** No status on whether our current coverage meets these requirements.

**Fix:** Add "Insurance Status: [Verified/Pending Review]" after COI is requested.

### 9. MONDAY ESTIMATE NAME MISMATCH

**Problem:** Monday estimate name is "PRASADA CLUBHOUSE" but this is erosion control work, not clubhouse construction.

**Fix:** Notes correctly flag this, but should be updated in Monday to "ELANTO AT PRASADA - EROSION CONTROL".

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| Contract PDF | Missing | Critical |
| Contract value | TBD | Critical |
| Completion dates | Missing (Section 7) | Critical |
| Reconciliation | Missing | Important |
| Insurance verification | Not confirmed | Important |
| W9 2026 | Needed | Important |
| EFT form | Needed if opting in | Nice to have |

---

## Actionable Next Steps

### Before Contract Signing (Current State)

1. [ ] Provide completion dates for Section 7 of contract (Jared Tieman to determine schedule)
2. [ ] Prepare 2026 W9 for Property Reserve
3. [ ] Complete EFT Authorization form (if opting for electronic payments)
4. [ ] Request COI from Dawn with Property Reserve as Additional Insured
5. [ ] Merge tasks.md into notes.md

### Contract Signing

1. [ ] Sign and return contract to Sarahi Dehesa
2. [ ] Upload signed contract to folder

### After Contract Signed

1. [ ] Mark estimate Won in Monday (01222609)
2. [ ] Update Monday item name to "ELANTO AT PRASADA - EROSION CONTROL"
3. [ ] Create SharePoint folder
4. [ ] Run extraction workflow with citations
5. [ ] Complete reconciliation
6. [ ] Confirm start date with Jared Tieman

---

## Open Questions

- [ ] Is the $4,940 estimate accurate? Quick quote was $3,290, but extended scope to north may have increased it
- [ ] Did Property Reserve ever get the mud scraped/swept separately, or is that still needed?
- [ ] Confirm this is erosion control only (no SWPPP inspection work)

---

## Ready for Action?

**PARTIALLY** — Waiting on completion dates to finalize contract.

**Current status:** Property Reserve sent contract template 1/27/26. Waiting for Desert Services to provide Section 7 completion dates.

**Blockers:**

1. Jared Tieman needs to determine schedule/completion dates
2. W9, EFT form, and COI need to be prepared

**Once dates provided:** Contract can be signed and returned to Sarahi Dehesa.

**Key context:** Small direct contract with Property Reserve (Mormon Church real estate arm). No GC involvement. Time-sensitive — they wanted work done quickly.
