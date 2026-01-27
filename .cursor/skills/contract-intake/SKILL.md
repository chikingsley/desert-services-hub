---
name: contract-intake
description: Process contracts from contracts@ email through extraction, reconciliation, and draft responses. Use when user mentions "process contract", "contract intake", "handle contract", or provides contract/PO documents to analyze.
---

# Contract Intake

Semi-automated contract processing with anti-hallucination safeguards.

## Critical Constraints

```text
⚠️  NEVER read PDF files directly - PDFs are binary, Read tool fails
⚠️  NEVER call desert-mistral MCP directly - no retry/fallback
⚠️  ALWAYS use the OCR script with built-in Gemini fallback
```

### Bad vs Good

**OCR a PDF:**

```bash
# ❌ BAD - MCP has no fallback when rate limited
desert-mistral - ocr (MCP)

# ❌ BAD - Read tool can't parse PDFs
Read("/path/to/file.pdf")

# ✅ GOOD - Script has retry + Gemini fallback
bun run services/contract/workflow/extract.ts ocr "/path/to/file.pdf"
```

**After OCR:**

```bash
# ❌ BAD - Still trying to read PDF
Read("/path/to/file.pdf")

# ✅ GOOD - Read the markdown output
Read("/path/to/file.md")
```

## Algorithm: IDENTIFY → COLLECT → OCR → EXTRACT → RECONCILE → VALIDATE

### Phase 1: IDENTIFY

Find the contract in census.db:

```bash
bun run services/contract/workflow/queue.ts search "project name"
```

Confirm with user which contract thread to process.

### Phase 2: COLLECT

Gather PDFs from email attachments:

```bash
bun run services/contract/workflow/collect.ts collect "normalized subject"
```

Check what's collected:

- Contract/PO PDF? (required)
- Estimate PDF? (required for reconciliation)

If estimate missing → search Monday ESTIMATING board, download from QuickBooks.

### Phase 3: OCR

For each PDF, run the OCR script:

```bash
bun run services/contract/workflow/extract.ts ocr "/full/path/to/file.pdf"
```

**What happens:**

1. Tries Mistral OCR (via MCP internally)
2. If 429/500/502 → retries 3x with exponential backoff
3. If still failing → falls back to Gemini 3.0 Flash
4. Creates `/path/to/file.md` with OCR text

**Then read the markdown:**

```bash
Read("/full/path/to/file.md")
```

### Phase 4: EXTRACT

Read OCR markdown files and extract into `notes.md` format.

**Required sections:**

- Key Contacts table
- Project Info
- Parties (Owner, GC, Sub)
- Contract Terms
- Insurance Requirements
- Reconciliation

**Citation rules:**

- Every value needs source: `(Page X)` or exact quote
- If not in document → "Not specified"
- If unclear → mark with `?`

### Phase 5: RECONCILE

Compare estimate line items to contract scope:

| Status | Meaning |
|--------|---------|
| KEPT | Item in both estimate and contract |
| REMOVED | In estimate, not in contract (note reason) |
| ADDED | In contract, not in estimate |

**Math check:**

```text
Estimate - Removed + Added = Contract?
If NO → flag MISMATCH
```

### Phase 6: VALIDATE

Check business rules:

| Rule | Severity | Action |
|------|----------|--------|
| Tucson + rock entrance | 🔴 ERROR | Strike, OUT OF SCOPE |
| "assume responsibility for fines" | 🔴 ERROR | NEVER AGREE, strike |
| Inspection qty missing | 🟡 WARNING | Redline with count |
| BMP install, no mobilization | 🟡 WARNING | Flag with GC |

## Workflow Checklist

Copy and track progress:

```text
Contract Processing: [PROJECT NAME]
- [ ] Phase 1: Identified contract thread
- [ ] Phase 2: Collected all PDFs (contract + estimate)
- [ ] Phase 3: OCR'd all PDFs to markdown
- [ ] Phase 4: Extracted data to notes.md
- [ ] Phase 5: Reconciled estimate vs contract
- [ ] Phase 6: Validated business rules
- [ ] Draft: Follow-up actions listed
- [ ] Draft: Emails ready (if applicable)
```

## Output Format

Structure `notes.md` like this:

```markdown
# [Project Name]

## Key Contacts
| Role | Name | Email | Phone |
|------|------|-------|-------|

## Project Info
- **Project Name**: [from contract]
- **Contract Value**: $X,XXX.XX
- **Estimate #**: XXXXXXXX

## Reconciliation
Estimate: $X,XXX.XX
Contract: $X,XXX.XX
Difference: $XXX.XX

(KEPT) Item description — $X,XXX.XX
(REMOVED -$XXX.XX) Item — "reason" per PO
...

Math: $Estimate - $Removed = $Contract ✓ RECONCILES

## Issues/Flags
- 🔴 [Critical issues]
- 🟡 [Warnings]

## Next Steps
- [ ] Execute contract
- [ ] Send COI to [contact]
- [ ] Mark Won in Monday
```

## CLI Commands

All commands run from repo root:

```bash
# Search queue
bun run services/contract/workflow/queue.ts search "query"

# Collect documents
bun run services/contract/workflow/collect.ts collect "subject"

# Add file to folder
bun run services/contract/workflow/collect.ts add "/folder" "/file.pdf"

# OCR a PDF (with retry + Gemini fallback)
bun run services/contract/workflow/extract.ts ocr "/file.pdf"
```

## Reference Files

- **Ground truth examples**: `services/contract/ground-truth/*/notes.md`
- **Full workflow docs**: `services/contract/WORKFLOW.md`
- **Schemas**: `services/contract/schemas/`
- **Templates**: `services/contract/templates/`

## Anti-Hallucination Rules

**ALWAYS:**

- Cite source for every value: `(Page X)` or quote
- Write "Not specified" if not in document
- Mark unclear items with `?`

**NEVER:**

- Invent retention, billing terms, or scope items
- Assume owner from project name
- Add items not in source documents
- Embellish quantities (if estimate says 40, don't write 24)
