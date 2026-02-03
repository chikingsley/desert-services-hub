# Contract Processing - Current State

**Updated:** 2026-01-27
**Next:** Test new workflow on next incoming contract

---

## What's Working

### New Workflow (January 2026)

Redesigned workflow with anti-hallucination measures:

- **Queue-based entry:** `workflow/queue.ts` - view contracts@ queue from census.db
- **Document collection:** `workflow/collect.ts` - gather PDFs into project folders
- **Citation-based extraction:** `workflow/extract.ts` - every value requires source quote
- **Business rule validation:** `workflow/validate.ts` - Tucson, fines, mobilization rules
- **Math-verified reconciliation:** `workflow/reconcile.ts` - KEPT/REMOVED/ADDED tracking
- **Template-based emails:** `templates/*.hbs` - section filling, not free-form generation

### Infrastructure

- **Mistral OCR:** `services/mistral/` - PDF text extraction with auto-splitting
- **Email census:** `services/email/census/` - 41+ contracts indexed by normalized_subject
- **Zod schemas:** `schemas/` - structured output with citation requirements

---

## Recent Issues Fixed

From Sun Health La Loma RGS run (see `ground-truth/sun-health-la-loma-rgs/issues.md`):

1. ✅ Fabricated scope items → Citation requirement enforces source quotes
2. ✅ Assumed owner → Explicit null if not in documents
3. ✅ Invented retention/billing → Source validation
4. ✅ Math errors → Reconciliation must balance
5. ✅ Free-form emails → Template-based generation

---

## Workflow Commands

```bash
# View contract queue
bun services/contract/workflow/queue.ts list

# Collect documents for a contract
bun services/contract/workflow/collect.ts collect "Project Name"

# Run OCR on a PDF
bun services/contract/workflow/extract.ts ocr ./path/to/file.pdf

# Validate reconciliation
bun services/contract/workflow/reconcile.ts validate ./path/to/folder
```

---

## Next Steps

1. **Test on next contract** - Run full workflow on incoming contract
2. **Wire up LLM extraction** - Connect Claude/Gemini to extraction prompts
3. **Add email sending** - Auto-send from templates
4. **Build UI** - Contract queue management interface

---

## Backlog

1. Monday/Notion integration after processing
2. Auto-mark competing bids as lost
3. SharePoint folder automation

---

## Related Docs

- `WORKFLOW.md` - Full workflow documentation
- `contracts-master.md` - 15-step process checklist
- `ground-truth/PATTERNS.md` - Validation rule patterns
- `ground-truth/sun-health-la-loma-rgs/issues.md` - Problem log from last run
