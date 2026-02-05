# Sprouts 058 Rita Ranch — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

**Note:** This project has the best documentation of the batch — includes reconciliation attempt, Exhibit A redlines, and rate analysis. Main issues are citations and reconciliation math.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** LOI documents are in folder but no citations with page numbers.

**Examples of uncited data:**

- "Contract: $19,439.00" — no page reference
- "Project Number: 251056-008" — no source
- "Super: Steve Rankich — 602-541-4234" — no source
- Exhibit A items (11, 16, 17, etc.) — no page numbers

**Fix:** Add citations from LOI documents:

```text
Source: loi_SOW_R1_DesertServices.pdf, page 2
Quote: "Item 16. Dust Control..."
```css

### 2. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 3. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow with LOI documents.

---

## Reconciliation Issues

### 4. RECONCILIATION DOES NOT BALANCE (Critical)

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** Math doesn't work:

```text
Estimate: $22,995.00
Contract: $19,439.00
Difference: -$3,556.00

But notes show: "MISMATCH ($2,256 off even with ? items removed)"
```

**Questions:**

- Where did the $2,256/$3,556 go?
- What line items were removed?
- Need actual SOV from GC to reconcile

**Fix:** Request SOV from A.R. Mays and complete reconciliation.

### 5. RATE DISCREPANCIES NOT RESOLVED

**Problem:** Contract has different rates than estimate:

- Inspections: $450/ea (contract) vs $475/ea (estimate) — $25 less
- Mobilizations: $700/ea (contract) vs $475/ea (estimate) — $225 MORE

**Source unknown:** Notes say "these look like Tucson rates we didn't quote"

**Fix:**

1. Verify source of contract rates
2. Confirm if these are A.R. Mays standard rates or Tucson-specific
3. Clarify which rates apply to change orders

---

## Red Flag Issues

### 6. "ASSUME RESPONSIBILITY FOR FINES" LANGUAGE (Critical)

**Problem:** Item 16 contains:
> "Assume responsibility for fines"

Per PATTERNS.md:
> "Assume responsibility for fines" → NEVER AGREE

**Status:** Correctly identified for redline in notes. But need to verify it's actually struck before signing.

**Fix:** Ensure this language is struck in marked-up contract before signing.

### 7. TUCSON PROJECT - NO ROCK ENTRANCES

**Problem:** Item 30 asks for "GSA temporary entrance" but:
> "Can't do in Tucson anyway (no rock)"

Per PATTERNS.md Location Rules:
> Tucson project? → No rock entrances, different rates

**Status:** Correctly identified for strike. Verify it's removed.

### 8. INSPECTION QUANTITY NOT SPECIFIED

**Problem:** Item 40 says "inspections every 14 days for 9 months" but no count.

Per PATTERNS.md:
> Inspection quantity not specified → needs redline

**Fix:** Notes correctly identify adding "12 inspections included, extras at unit rate" — verify this is in marked-up contract.

---

## Scope Items to Strike/Clarify

Per Exhibit A redlines in notes:

| Item | Issue | Action |
|------|-------|--------|
| 11 | Coordination meetings | FLAG as scheduling requirement |
| 16 | "Assume fines" language | STRIKE |
| 16 | Operational dust control | Not in scope — remove or price |
| 17 | Traffic control | STRIKE — not in scope |
| 19 | Water meter | STRIKE — not in scope |
| 20 | Construction water | STRIKE — not in scope |
| 22 | Power wash parking lot | STRIKE — not in scope |
| 30 | GSA temporary entrance | STRIKE — can't do in Tucson |
| 34 | Silt fence/wattle | CLARIFY — compost filter sock included |
| 40 | Inspections | ADD "12 inspections included, extras at unit rate" |

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| SOV from GC | Missing | Critical |
| Rate source verification | Unknown | Important |
| Reconciliation | Does not balance | Critical |
| Tucson rate card | Missing internally | Important |
| Signed redlined contract | Pending | Critical |

---

## Actionable Next Steps

### Before Signing (CRITICAL)

1. [ ] Mark up Exhibit A with all redlines per notes
2. [ ] Strike "assume responsibility for fines" (Item 16)
3. [ ] Strike GSA temporary entrance (Item 30)
4. [ ] Strike all out-of-scope items (17, 19, 20, 22)
5. [ ] Add inspection count to Item 40
6. [ ] Clarify compost filter sock vs silt fence (Item 34)

### Reconciliation Follow-up

1. [ ] Request actual SOV from A.R. Mays to reconcile $2,256+ discrepancy
2. [ ] Clarify if Textura/Procore/GCPay fee applies
3. [ ] Clarify if CCIP/OCIP applies
4. [ ] Clarify mobilization count/pricing
5. [ ] Verify source of Tucson rates in contract

### Insurance (Within 5 Days of Signing)

1. [ ] Send COI with A.R. Mays as Additional Insured
   - GL
   - Auto
   - WC
   - Professional Liability

### After Contract Signed

1. [ ] Mark estimate as Won in Monday
2. [ ] Update awarded value to $19,439.00
3. [ ] Create SharePoint folder
4. [ ] Upload signed contract

### Internal Follow-up

1. [ ] Establish Tucson-specific pricing/rate card
2. [ ] Add "Tucson - no rock entrances" flag to quoting system
3. [ ] Add "assume fines liability" contract language detection

---

## Ready for Action?

**YES - But requires redlines before signing**

**Current status:** LOI received, needs markup before signing.

**Required before signing:**

1. Strike all flagged items in Exhibit A
2. Clarify compost filter sock scope
3. Add inspection quantity

**Timeline pressures:**

- Sign all pages within 2 days of receipt
- Insurance due within 5 days of signing

**Key risk:** TUCSON PROJECT — Standard Maricopa rates don't apply. Need internal clarity on Tucson pricing.

**Validation rules triggered:**

- ✅ `TUCSON_NO_ROCK` — Rock entrance flagged for strike
- ✅ `NO_FINES_LIABILITY` — Fines language flagged for strike  
- ✅ `INSPECTION_QUANTITY` — Inspection count flagged for addition
