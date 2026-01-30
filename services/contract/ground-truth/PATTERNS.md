# Contract Review Patterns

What we've learned from reviewing contracts. This informs extraction and validation.

---

## Pipeline

```text
INGEST → UNDERSTAND → CHUNK → EXTRACT → VALIDATE → REPORT
```

### 1. Ingest

Bring in the document. Source matters for context:

- Email attachment
- Procore (may need access request)
- DocuSign
- Direct upload

### 2. Understand

Look at the whole document first. What do we have?

- How many pages?
- Is there a clear structure (numbered sections, exhibits)?
- Is there an SOV with line items and prices?
- Is it OCR-able or scanned garbage?

This isn't classification into different pipelines - we check the same things regardless. It's about knowing what's available to extract.

### 3. Chunk

Break into sections for detailed analysis. Strategies:

- **Header-based**: Find section headers, exhibit labels
- **Numbered items**: Exhibit A line items (8, 9, 10, 11...)
- **Semantic**: LLM identifies logical sections if structure is unclear

Late chunking: understand first, then chunk. Don't chunk blindly.

### 4. Extract

Pull structured data from each chunk:

- Project info (number, name, location, GC, contacts)
- Contract value
- Scope items (what they're asking for)
- SOV line items (if available)
- Required actions (sign by X, COI, etc.)
- Exhibits (insurance, safety, preliminary notice)
- Schedule/milestones
- Unit rates

### 5. Validate

Check extracted data against rules. Each check = pass/fail/warning.

**Quick Checks (run first):**

- [ ] Is the company name spelled correctly? ("Desert Services" not "Deseret", etc.)
- [ ] Is company contact info correct? (address, phone, email)
- [ ] Are contract parties correctly identified?

### 6. Report

Aggregate results. Show what passed, what failed, what needs attention.

---

## Validation Rules

### Project Info

- [ ] Has project number
- [ ] Has project name
- [ ] Has project location
- [ ] Has GC name
- [ ] Has at least one contact (super, PM, or coordinator)

### Contractor Info (Quick Sanity Checks)

- [ ] Company name spelled correctly throughout ("Desert Services" not "Deseret", etc.)
- [ ] Company address correct
- [ ] Company phone/email correct
- [ ] Signatory name correct

### Scope vs Estimate

For each scope item in contract:

- [ ] Is this in our quoted scope?
- [ ] If not: can we do it (price separately) or can't/won't (strike)?

### Reconciliation

- [ ] Estimate total known
- [ ] Contract total known
- [ ] Each estimate line item: KEPT / REMOVED / ADDED / ?
- [ ] Sum of contract items = contract total? (MATCH / RECONCILED / MISMATCH)

### Red Flags

- [ ] "Assume responsibility for fines" → NEVER AGREE (but check scope - see below)
- [ ] Inspection quantity not specified → needs redline
- [ ] BMP install without mobilization → FLAG

### Scoped vs Unscoped Liability (Important!)

**NOT a red flag** - liability scoped to your own work:

- "Subcontractor responsible for fines **due to Subcontractor's operations**"
- "Subcontractor shall provide SWPPP for **Subcontractor's work area**"
- "If violation issued **due to operations performed by Subcontractor**..."

This is standard "be responsible for yourself" language. You break it, you buy it.

**ACTUAL red flag** - unscoped liability:

- "Subcontractor assumes responsibility for all fines"
- "Subcontractor shall be liable for any fines issued on project"
- No qualifier limiting to subcontractor's own actions

**Pattern:** Before flagging fines/liability language, check for scope qualifiers like "Subcontractor's work area" or "due to Subcontractor's operations."

**Example:** See `diamond-view-ballpark/notes.md` - Section 55 looks bad but is OK due to scope.

### At-Risk Bids (Exception to All Rules)

Some contracts have **terrible language everywhere** but are **intentionally accepted** because they're at-risk bids.

**Characteristics:**

- Large contract value ($100K+ vs typical $10-20K)
- Large contract size (100+ pages)
- Bad terms throughout - "responsible for this, responsible for that"
- But the bid price was set HIGH ENOUGH to absorb the risk

**Why normal red flags don't apply:**

- Risk was **priced in** to the bid
- Conscious business decision, not an oversight
- Money justifies accepting tougher terms

**Validation approach:**

- Still flag issues (for awareness)
- But note "may be acceptable if at-risk bid"
- Check contract value - large contracts may be intentional
- Prompt for confirmation: "Is this an at-risk bid?"

**Example:** See `sidney-village/notes.md` - $500K contract, 160+ pages, bad language but priced for risk.

### Location Rules

- [ ] Tucson project? → No rock entrances, different rates
- [ ] (add more as discovered)

---

## Patterns from Ground Truth

### PVUSD Indian Bend (Full Contract)

- Had detailed exhibits (Insurance, Safety, Preliminary Notice)
- Had explicit SOV we could reconcile
- Schedule was scanned attachment (no OCR)
- Procore source - needed project number on all comms

### Sprouts Rita Ranch (LOI)

- Scope in Exhibit A with numbered items
- No explicit SOV pricing - had to infer from scope
- Unit rates listed for "changes in scope" (extras)
- Tucson = no rock, different rates
- Rate discrepancy between our estimate and their rates

### Diamond View at Ballpark (Work Authorization)

- SWPPP/Dust Control scope from Catamount Constructors
- **Key learning:** Section 55 has fines/liability language that LOOKS bad but is OK
- Liability is scoped to "Subcontractor's work area" - standard self-responsibility
- Example of false positive on fines language - need scope qualifier check
- See `diamond-view-ballpark/notes.md` for full analysis

### Sidney Village (Subcontract - At-Risk Bid)

- ~$500K contract with Weis Builders
- 160+ pages - too large for standard OCR processing
- **Key learning:** Contract language is "horrible everywhere" but ACCEPTED
- This is an **at-risk bid** - price was set high enough to cover the risk
- Example of when all red flags are intentionally accepted for business reasons
- Scale matters: $500K vs $10-20K changes the calculus
- See `sidney-village/notes.md` for full analysis

### Elanto at Prasada (Owner Contractor Agreement)

- Property Reserve Arizona, LLC contract
- **Key learning:** Company name misspelled in contract body ("Deseret" vs "Desert")
- Signature block had it correct, but body text was wrong
- Example of why quick sanity checks on contractor info matter
- See `elanto-at-prasada/issues.md` for full analysis

### Common Issues

- Inspection quantity not specified in contract
- Items in scope that weren't quoted (need markup)
- "Assume responsibility for fines" language
- Scanned schedules can't be OCR'd
- Mobilization needed for BMP installs but removed from contract
- **Company name misspelled** - always verify contractor name is correct throughout

---

## TODO

- [x] Zod schema for extraction output → `schemas/extraction-output.ts`
- [x] Zod schema for reconciliation output → `schemas/reconciliation.ts`
- [x] Hook: Tucson projects flag rock entrance as OUT OF SCOPE → `workflow/validate.ts`
- [x] Hook: "Assume responsibility for fines" = NEVER AGREE → `workflow/validate.ts`
- [x] Hook: BMP install requires min 1 mobilization → `workflow/validate.ts`
- [ ] Tucson rate card (can't use Maricopa defaults)
- [ ] Refine fines check to distinguish scoped vs unscoped liability
- [ ] Add "at-risk bid" flag to contract metadata (bypasses red flags)
- [ ] Add contract value context to validation (large contracts may be intentional)
