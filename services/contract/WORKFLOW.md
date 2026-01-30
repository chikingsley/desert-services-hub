# Contract Processing Workflow

End-to-end workflow for processing contracts from contracts@ email to internal handoff.

## Overview

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    QUEUE        │ ──▶ │    COLLECT      │ ──▶ │    EXTRACT      │
│  contracts@     │     │  PDFs + OCR     │     │  with citations │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    EMAILS       │ ◀── │   RECONCILE     │ ◀── │   VALIDATE      │
│  internal + GC  │     │  math check     │     │  business rules │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```css

## Key Principles

### 1. Citation-Based Extraction (Anti-Hallucination)

Every extracted value MUST have a source citation:

- Document type (contract, estimate, po)
- Page number
- Exact quote from the document

**If it's not in the documents, it doesn't go in the output.**

### 2. Math Verification

Reconciliation MUST balance:

```text
Estimate - Removed + Added = Contract
```css

If it doesn't balance, the workflow flags it for review.

### 3. Template-Based Emails

Emails are generated from templates with sections filled from extracted data.
No free-form generation that could invent information.

---

## Workflow Steps

### Step 1: Queue

View pending contracts from contracts@ mailbox.

```bash
# List all contracts
bun services/contract/workflow/queue.ts list

# List pending (unprocessed) contracts
bun services/contract/workflow/queue.ts pending

# Search for a specific contract
bun services/contract/workflow/queue.ts search "sun health"

# View details for a contract thread
bun services/contract/workflow/queue.ts details "Sun Health La Loma RGS"
```css

**Output:** List of contracts with attachment info, dates, and status.

### Step 2: Collect

Gather all PDFs for a contract into a project folder.

```bash
# Collect documents for a contract
bun services/contract/workflow/collect.ts collect "Sun Health La Loma RGS"

# Add a local PDF (e.g., from DocuSign)
bun services/contract/workflow/collect.ts add ./ground-truth/sun-health-la-loma-rgs ./downloads/contract.pdf

# List documents in a folder
bun services/contract/workflow/collect.ts list ./ground-truth/sun-health-la-loma-rgs
```css

**Output:** Project folder with all PDFs, missing document warnings.

### Step 3: Extract

Run OCR and extract structured data with citations.

```bash
# Run OCR on a single PDF
bun services/contract/workflow/extract.ts ocr ./ground-truth/sun-health-la-loma-rgs/contract.pdf

# Extract from all PDFs in a folder (programmatic)
# See extract.ts for extractFromDocuments()
```css

**Output:**

- `*.md` files with OCR text
- `extraction.json` with structured data and citations

### Step 4: Validate

Check extraction against business rules.

**Rules enforced:**

- `TUCSON_NO_ROCK` - Tucson projects cannot have rock entrances
- `NO_FINES_LIABILITY` - Never agree to "assume responsibility for fines"
- `INSPECTION_QUANTITY` - Inspection count must be specified
- `BMP_MOBILIZATION` - BMP installs require mobilization
- `EXPLICIT_RETENTION` - Retention should be explicit
- And more...

**Output:** Validation result with errors, warnings, and info.

### Step 5: Reconcile

Compare estimate vs contract with math verification.

```bash
# Validate existing reconciliation
bun services/contract/workflow/reconcile.ts validate ./ground-truth/sun-health-la-loma-rgs

# Show example manual reconciliation
bun services/contract/workflow/reconcile.ts manual
```css

**Output:**

- `reconciliation.json` with line items and math check
- `reconciliation.md` with formatted summary

### Step 6: Generate Emails

Render template-based emails.

**Internal Handoff** (`internal-handoff.hbs`):

- To: internalcontracts@
- Contains: project info, contacts, reconciliation, issues, follow-up actions

**GC Response** (`gc-response.hbs`):

- To: GC contact
- CC: Kendra, Jared, (optionally sales)
- Contains: acknowledgment, clarifications needed, COI status

---

## File Structure

```text
services/contract/
├── schemas/
│   ├── extraction-output.ts   # Citation-based extraction schema
│   ├── reconciliation.ts      # Reconciliation with math check
│   └── index.ts              # Schema exports
├── workflow/
│   ├── queue.ts              # Query contracts@ queue
│   ├── collect.ts            # Gather PDFs
│   ├── extract.ts            # OCR and extraction
│   ├── validate.ts           # Business rule validation
│   ├── reconcile.ts          # Estimate vs contract
│   ├── render.ts             # Email template rendering
│   └── index.ts              # Workflow exports
├── templates/
│   ├── internal-handoff.hbs  # Internal email template
│   └── gc-response.hbs       # GC response template
├── ground-truth/             # Example contracts and notes
└── WORKFLOW.md               # This file
```css

---

## Common Issues and Fixes

### Issue: Model fabricates information

**Cause:** Extraction from memory instead of documents.

**Fix:** Citation-based extraction enforces source quotes. Validation checks that quotes exist in OCR text.

### Issue: Math doesn't balance

**Cause:** Line item misidentification or OCR errors.

**Fix:** Review reconciliation.json, correct line items manually, re-validate.

### Issue: Missing mobilization

**Cause:** GC removed mobilization but kept BMP items.

**Fix:** Flag with GC or add to scope clarification.

### Issue: Inspection quantity not specified

**Cause:** Contract says "inspections" without a count.

**Fix:** Add redline with specific count (e.g., "12 inspections included, extras at unit rate").

### Issue: Tucson rock entrance

**Cause:** Rock cannot be delivered to Tucson.

**Fix:** Strike rock entrance items, flag as OUT OF SCOPE.

---

## Validation Rules Reference

| Rule ID | Severity | Description |
|---------|----------|-------------|
| TUCSON_NO_ROCK | error | Tucson projects cannot have rock entrances |
| NO_FINES_LIABILITY | error | Never agree to fines liability language |
| INSPECTION_QUANTITY | warning | Inspection count must be specified |
| BMP_MOBILIZATION | warning | BMP installs require mobilization |
| EXPLICIT_RETENTION | info | Retention should be explicit |
| EXPLICIT_OWNER | info | Owner should be identified |
| NO_CONTACTS | warning | Contact info should be present |
| CERT_PAYROLL_TYPE | warning | Certified payroll type should be specified |
| RATE_DISCREPANCY | warning | Unit rate discrepancies should be flagged |
| BILLING_PLATFORM | info | Billing platform should match line items |

---

## Programmatic Usage

```typescript
import {
  getContractQueue,
  collectDocuments,
  extractFromDocuments,
  validateExtraction,
  reconcile,
  createInternalHandoffEmail,
  createGCResponseEmail,
} from "./services/contract/workflow";

// 1. Get pending contracts
const contracts = getContractQueue();
const pending = contracts.filter(c => c.status === "pending");

// 2. Collect documents
const collection = await collectDocuments(pending[0].normalizedSubject);

// 3. Extract with citations
const extraction = await extractFromDocuments({
  projectFolder: collection.projectFolder,
  documents: collection.pdfs,
});

// 4. Validate
const validation = validateExtraction(extraction.output);

// 5. Reconcile
const reconciliation = reconcile({
  estimateTotal: 20518.50,
  contractTotal: 20168.50,
  estimateItems: [...],
  contractItems: [...],
});

// 6. Generate emails
const internalEmail = createInternalHandoffEmail(
  createInternalHandoffData(extraction.output, reconciliation, validation),
  reconciliation.outcome === "RECONCILED" ? "Reconciled" : "Needs Clarification"
);

const gcEmail = createGCResponseEmail(
  createReadyGCResponseData("Laura", "Sun Health La Loma RGS", "Purchase Order", {
    name: "Chi Ejimofor",
    title: "Project Coordinator",
    email: "chi@desertservices.net",
  }),
  "laura.phillips@pwiconstruction.com",
  { ccKendra: true, ccJared: true }
);
```

---

## Next Steps

1. **Integrate LLM extraction** - Wire up Claude/Gemini to fill extraction output
2. **Add email sending** - Connect to email service for actual sending
3. **Build UI** - Create interface for queue management and review
4. **Add Monday/Notion integration** - Auto-update systems after processing
