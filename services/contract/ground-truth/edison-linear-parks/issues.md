# Edison Park & Linear Park — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** Contract_Package.pdf is in folder but no citations from it.

**Examples of uncited data:**

- "$40,000 total for both parks" — no page reference
- "NTP started 1/19/26" — no source
- Contacts have no source citations

**Fix:** Extract from Contract_Package.pdf with proper citations:

```
Source: Contract_Package.pdf, page X
Quote: "Notice to Proceed: January 19, 2026"
```

### 2. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns, follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 3. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow with Contract_Package.pdf.

### 4. NO RECONCILIATION

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** Two estimates mentioned but no reconciliation:

- 11042501 - EDISON PARK - Low Mountain - $19,140
- 09172501 - LINEAR PARK - Rafael - $23,360 (different GC)

Total: ~$42,500 from estimates vs "~$40,000 total" stated in notes.

**Fix:** Create proper reconciliation once contract structure is clarified.

---

## Data Quality Issues

### 5. CONTRACT STRUCTURE UNCLEAR (Critical)

**Problem:** Fundamental confusion about project structure:

- Two separate sites (~100 ft apart)
- Two NOIs filed
- Two dust permits needed
- BUT originally quoted/contracted as ONE project

**Questions unresolved:**

- Is it one contract covering both parks?
- Or separate contracts/POs for each?
- How to handle inspections (one set or two)?
- Rick says "one project" but legal/contractual structure unclear

**Fix:** Get explicit clarification from Rick/Jared and document in notes.

### 6. MONDAY ESTIMATES CONFUSED

**Problem:** Estimate confusion:

- 11042501 - EDISON PARK - Low Mountain - $19,140 (Bid Sent) — should be Won
- 09172501 - LINEAR PARK - Rafael - $23,360 — WRONG GC (Rafael didn't win)
- Need new estimate for Linear Park with Low Mountain

**Fix:**

1. Mark 11042501 as Won
2. Create new estimate for Linear Park with Low Mountain
3. Or clarify if combined estimate exists

### 7. SCOPE SPLIT ISSUE

**Problem:** Notes say:
> "Per Rick/Jared (1/27/26): They are issuing either a change order or another contract for the second park."

**Status:** Unknown — is change order issued yet?

**Fix:** Follow up and document resolution.

### 8. MISSING DOCUMENTS

**Received:**

- [x] Two NOIs (1/12/26)

**Still needed:**

- [ ] Two dust permits
- [ ] SWPPP construction drawings for both parks

**Fix:** Follow up with Julie Conover for missing documents.

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| Contract structure | Unclear | Critical |
| Linear Park estimate | Missing | Critical |
| Dust permits | Pending | Important |
| SWPPP drawings | Missing | Important |
| Reconciliation | Cannot complete | Important |
| Sign mounting method | TBD (posts vs fence) | Nice to have |

---

## Actionable Next Steps

### Clarification Needed (URGENT)

1. [ ] Confirm contract structure: one contract for both or separate contracts?
2. [ ] Confirm if change order or second contract for Linear Park
3. [ ] Clarify inspection approach: one set covering both or separate?

### Documents to Receive

1. [x] NOIs for both parks (received 1/12/26)
2. [ ] Dust permits for both parks
3. [ ] SWPPP construction drawings for both parks

### SWPPP Work

1. [ ] Create SWPPP narrative for Edison Park
2. [ ] Create SWPPP narrative for Linear Park
3. [ ] Create signs for both parks (confirm posts vs temp fence)

### Monday Cleanup

1. [ ] Update estimate 11042501 (EDISON PARK - Low Mountain) to Won
2. [ ] Create new estimate for LINEAR PARK with Low Mountain as GC
3. [ ] Or link both to same contract if single contract structure

### Admin Tasks

1. [ ] Create SharePoint folder structure
2. [ ] Upload NOIs to folders
3. [ ] Upload dust permits when received
4. [ ] Merge tasks.md into notes.md

---

## Contacts for Clarification

- **Chris Zollinger** (site contact): 602-615-3140
- **Angela Kamis** (PM): 602-810-4787, <akamis@lowmountain.com>
- **Julie Conover** (Project Engineer): 602-457-5916, <jconover@lowmountain.com>

---

## Ready for Action?

**PARTIALLY** — Active project (NTP 1/19/26) but contract structure needs clarification.

**Current status:** NTP started, NOIs received, but fundamental question about one contract vs two remains unresolved.

**Blockers:**

1. Contract structure unclear — affects estimates, billing, SharePoint setup
2. Missing dust permits and SWPPP drawings

**Key context:** Two City of Phoenix parks for Low Mountain Construction. Parks are ~100 ft apart. Budget was $40k total, came in just under.
