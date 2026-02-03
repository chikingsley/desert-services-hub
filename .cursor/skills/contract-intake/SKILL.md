---
name: contract-intake
description: Process contracts from contracts@ email through extraction, reconciliation, and draft responses. Use when user mentions "process contract", "contract intake", "handle contract", or provides contract/PO documents to analyze.
---

# Contract Intake

Semi-automated contract processing with anti-hallucination safeguards.

## Critical Constraints

```text
⚠️  NEVER read PDF files directly - PDFs are binary, Read tool fails
⚠️  ALWAYS use Gemini OCR in plan-analysis/ for all documents
⚠️  Construction plans benefit from agentic vision for verification
```

### OCR Commands (plan-analysis/)

```bash
# Basic OCR - all documents
cd plan-analysis/
just ocr "/path/to/file.pdf"
# Creates: /path/to/file.gemini.md

# OCR with page limit (for testing)
just ocr-limit "/path/to/file.pdf" 5

# Read the markdown output
Read "/path/to/file.gemini.md"
```

### Detailed Inspection (Agentic Vision)

For construction plans that need verification, counting, or measurement:

```python
from plan_analysis import PlanAnalyzer

analyzer = PlanAnalyzer()
result = analyzer.detailed_inspection(
    image_path="./plan.pdf",
    inspection_prompt="Count all sediment basins and verify dimensions"
)
# Returns structured data with findings, measurements, coordinates
```
```bash
bun run services/contract/workflow/queue.ts search "project name"
```
```bash
bun run services/contract/workflow/collect.ts collect "normalized subject"
```
csv
```bash
bun run services/contract/workflow/extract.ts ocr "/full/path/to/file.pdf"
```
```bash
Read("/full/path/to/file.md")
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
