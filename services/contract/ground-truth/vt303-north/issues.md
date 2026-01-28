# VT303 North — Issues Log

Compliance audit against WORKFLOW.md and extraction standards.

---

## Workflow Compliance

### 1. NO SOURCE CITATIONS (Critical)

Per WORKFLOW.md Key Principle #1:
> Every extracted value MUST have a source citation: Document type, Page number, Exact quote from the document

**Problem:** No citations provided for any extracted data.

**Examples of uncited data:**

- Project location "SWC Reems Rd and Northern Ave, Glendale, AZ" — no source
- Contact "Darrin Grove - Senior Superintendent, 801.910.1073" — no source
- "1.1M SF Industrial Building" — no source

**Fix:** Add citations from emails or documents. Example format:

```
Source: email, "Darrin Grove" thread 1/26/26
Quote: "PO# VT303 North - go ahead on signs"
```

### 2. NO FORMAL CONTRACT EXISTS

**Status:** Verbal authorization only (PO number given, no signed document)

**This is acknowledged** in the notes and is acceptable for Layton relationship, BUT:

- Cannot complete full extraction workflow without source documents
- Cannot run validation rules without contract language
- Cannot reconcile estimate vs contract

**Fix:** Get formal PO from Layton when full scope is confirmed. Until then, cite email authorizations.

### 3. NO RECONCILIATION

Per WORKFLOW.md Step 5:
> Estimate - Removed + Added = Contract

**Problem:** Estimate 12162506 mentioned but no reconciliation against authorized scope.

**Fix:** Once formal PO received, create reconciliation showing:

- What was in estimate
- What was authorized
- What changed

### 4. SEPARATE TASKS FILE

**Problem:** `tasks.md` is a separate file. Per existing patterns (sun-health-la-loma-rgs), follow-up actions should be in `notes.md` under "## Follow-up Actions".

**Fix:** Merge tasks.md content into notes.md.

### 5. NO EXTRACTION.JSON

Per ground-truth/README.md file naming convention:
> extraction-raw.json — Raw Claude extraction output

**Problem:** No structured extraction output generated.

**Fix:** Run extraction workflow once contract documents are available.

---

## Data Quality Issues

### 6. ESTIMATE NOT LINKED

**Problem:** Notes say "Rick sends SWPPP estimate (12162506)" but:

- Estimate PDF not in folder
- No Monday estimate ID provided
- Cannot verify scope alignment

**Fix:** Add Monday estimate link and upload estimate PDF.

### 7. DOCUMENTS LISTED BUT NOT PROCESSED

Notes list these documents:

- 12162506.pdf - SWPPP estimate
- 114279_CGP25_NEWPERMIT_NOI_CERTIFICATE.pdf - NOI
- 911822.pdf - Dust permit
- VT 303 - SWPPP Dwgs.pdf - SWPPP drawings

**Problem:** Documents referenced but not uploaded to folder or OCR'd.

**Fix:** Upload documents to folder, run OCR, add citations.

---

## Missing Information

| Field | Status | Importance |
|-------|--------|------------|
| Formal PO | Missing | Critical |
| Contract value | Unknown | Critical |
| Insurance requirements | Unknown | Important |
| Retention | Unknown | Important |
| Billing platform | Unknown | Nice to have |
| Site address | Partial | Important |

---

## Actionable Next Steps

### Before Contract Signing (Current State)

1. [ ] Upload documents (estimate, NOI, dust permit, SWPPP drawings) to folder
2. [ ] Add email citations for verbal authorization
3. [ ] Get site address for Fire Dept. Access sign
4. [ ] Merge tasks.md into notes.md

### After Layton Sends Formal PO

1. [ ] Upload signed PO
2. [ ] Run extraction workflow with citations
3. [ ] Complete reconciliation (estimate vs PO)
4. [ ] Run validation rules
5. [ ] Generate internal handoff email

---

## Ready for Action?

**NO** — Cannot send to signing or generate contractor response without formal PO.

**Current status:** Work authorized verbally, signs being produced, waiting for full scope confirmation.

**Blocker:** Need formal PO from Layton Construction to complete workflow.
