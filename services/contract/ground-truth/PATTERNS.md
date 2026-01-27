# Contract Review Patterns

What we've learned from reviewing contracts. This informs extraction and validation.

---

## Pipeline

```
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

- [ ] "Assume responsibility for fines" → NEVER AGREE
- [ ] Inspection quantity not specified → needs redline
- [ ] BMP install without mobilization → FLAG

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

### Common Issues

- Inspection quantity not specified in contract
- Items in scope that weren't quoted (need markup)
- "Assume responsibility for fines" language
- Scanned schedules can't be OCR'd
- Mobilization needed for BMP installs but removed from contract

---

## TODO

- Zod schema for extraction output
- Zod schema for reconciliation output
- Hook: Tucson projects flag rock entrance as OUT OF SCOPE
- Hook: "Assume responsibility for fines" = NEVER AGREE
- Hook: BMP install requires min 1 mobilization
- Tucson rate card (can't use Maricopa defaults)
