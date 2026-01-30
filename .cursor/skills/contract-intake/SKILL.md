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
```text
```bash
# ❌ BAD - MCP has no fallback when rate limited
desert-mistral - ocr (MCP)

# ❌ BAD - Read tool can't parse PDFs
Read("/path/to/file.pdf")

# ✅ GOOD - Script has retry + Gemini fallback
bun run services/contract/workflow/extract.ts ocr "/path/to/file.pdf"
```text
```bash
# ❌ BAD - Still trying to read PDF
Read("/path/to/file.pdf")

# ✅ GOOD - Read the markdown output
Read("/path/to/file.md")
```text
```bash
bun run services/contract/workflow/queue.ts search "project name"
```text
```bash
bun run services/contract/workflow/collect.ts collect "normalized subject"
```csv
```bash
bun run services/contract/workflow/extract.ts ocr "/full/path/to/file.pdf"
```bash
```bash
Read("/full/path/to/file.md")
```csv
```text
Estimate - Removed + Added = Contract?
If NO → flag MISMATCH
```csv
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
```text
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
```text
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
