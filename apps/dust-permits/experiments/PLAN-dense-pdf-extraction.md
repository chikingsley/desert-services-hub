# Plan: Dense PDF Extraction for Construction Drawings

## Problem

Construction drawing PDFs (like Legacy Sports Arena, 197MB, 214 pages) contain densely packed information that's hard for AI models to extract reliably:

- Title sheets have 50+ data fields crammed into small areas
- Text at various angles (rotated 90°, upside down)
- Engineering symbols and notations mixed with text
- Scanned/compressed images with OCR artifacts
- Size exceeds Gemini's 50MB PDF limit

## Research Findings

### Best Practices (2025)

From [iTech OCR Guide](https://itechindia.co/us/blog/guide-to-ocr-technology-for-engineering-drawings/) and [Google Gemini Docs](https://ai.google.dev/gemini-api/docs/document-processing):

1. **Preprocessing is critical** - image cleanup, contrast enhancement before AI processing
2. **Page-by-page extraction** - for dense docs, request section-by-section to reduce truncation
3. **Targeted prompts** - ask for specific fields rather than "extract everything"
4. **Multi-pass approach** - extract different data types in separate passes
5. **Convert to images** - for very large PDFs, convert pages to images and process in batches

### Gemini Limits

| Constraint | Limit |
|------------|-------|
| PDF size (inline) | 20 MB |
| PDF size (File API) | 50 MB or 1000 pages |
| Max resolution | 3072 x 3072 per page |
| Context window | 1M tokens |

## Proposed Architecture

### Approach: Page-Targeted Extraction

Instead of passing the whole PDF and asking for everything, we:

1. **Split PDF** into individual pages or small batches
2. **Classify pages** by type (title sheet, civil, architectural, etc.)
3. **Apply targeted prompts** based on page type
4. **Aggregate results** from all extractions

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Large PDF (197MB)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PDF Splitter                                │
│  Split into individual pages or batches                         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ Page 1  │          │ Page 2  │          │ Page N  │
   │ (Title) │          │ (Civil) │          │ (Arch)  │
   └────┬────┘          └────┬────┘          └────┬────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Classifier  │      │ Classifier  │      │ Classifier  │
│ "What type  │      │ "What type  │      │ "What type  │
│  of sheet?" │      │  of sheet?" │      │  of sheet?" │
└─────────────┘      └─────────────┘      └─────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Title      │      │  Civil      │      │  Arch       │
│  Prompt     │      │  Prompt     │      │  Prompt     │
│ (owner,     │      │ (acreage,   │      │ (building   │
│  architect) │      │  coords)    │      │  area)      │
└─────────────┘      └─────────────┘      └─────────────┘
        │                    │                    │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Aggregator                                  │
│  Merge results, resolve conflicts, validate                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FormData JSON                               │
└─────────────────────────────────────────────────────────────────┘
```

### Page Type Classification

| Sheet Type | Prefix | What to Extract |
|------------|--------|-----------------|
| Title/Cover | G-001, T-001 | Project name, address, owner, architect, engineer |
| Civil/Site | C-xxx | Acreage, coordinates, APN, legal description |
| Grading | C-xxx | Disturbed area, earthwork quantities |
| Utility | C-xxx, U-xxx | Underground work scope |
| Landscape | L-xxx | Landscape area (for permit categories) |
| Architectural | A-xxx | Building area, construction type |
| Structural | S-xxx | Foundation type |

### Targeted Prompts

**Title Sheet Prompt:**
```markdown
Extract from this title/cover sheet:
- Project name
- Site address
- Property owner (name, address, entity type)
- Architect of record (firm, contact)
- Civil engineer (firm, contact)
- General contractor
Return JSON only.
```

**Civil/Grading Sheet Prompt:**
```markdown
Extract from this civil/grading sheet:
- Total site acreage
- Disturbed area acreage
- Cut/fill quantities
- GPS coordinates or benchmark
- APN (Assessor Parcel Number)
- Legal description (Section, Township, Range)
Return JSON only.
```

## Implementation Plan

### Phase 1: Core Utilities (Bun Native)

Update existing experiments to use Bun native APIs:

```typescript
// Before (node:fs)
import { readFileSync, existsSync } from "node:fs";
const buffer = readFileSync(path);

// After (Bun native)
const file = Bun.file(path);
const exists = await file.exists();
const buffer = await file.arrayBuffer();

// Before (setTimeout)
await new Promise(resolve => setTimeout(resolve, ms));

// After (Bun.sleep)
await Bun.sleep(ms);
```

### Phase 2: PDF Processing Pipeline

1. **split-pdf.ts** - Extract individual pages (done, needs Bun audit)
2. **classify-page.ts** - NEW: Determine page type using fast model
3. **extract-by-type.ts** - NEW: Apply targeted prompts based on type
4. **aggregate-results.ts** - NEW: Merge extractions into FormData

### Phase 3: Smart Extraction

1. **Preprocessing** (optional):
   - Convert PDF page to high-res image
   - Apply contrast enhancement
   - Deskew if needed

2. **Multi-pass extraction**:
   - Pass 1: Extract text blocks and their locations
   - Pass 2: Extract tabular data
   - Pass 3: Extract from images/diagrams

### Phase 4: Caching & Optimization

1. Cache page classifications
2. Skip pages that don't contain relevant data
3. Parallel extraction for independent pages
4. Progressive disclosure (show partial results as they come)

## Files to Create/Update

| File | Action | Purpose |
|------|--------|---------|
| `experiments/extract-permit-data.ts` | Update | Use `Bun.sleep()` |
| `experiments/apn-extraction/extract-apns.ts` | Update | Use `Bun.file()` |
| `experiments/classify-page.ts` | Create | Page type classification |
| `experiments/extract-by-type.ts` | Create | Targeted extraction |
| `experiments/pipeline.ts` | Create | Full pipeline orchestrator |
| `src/lib/pdf-extractor.ts` | Create | Production-ready module |

## Decision Points

1. **Page-by-page vs. batch processing?**
   - Page-by-page: More accurate for dense pages, more API calls
   - Batch (5-10 pages): Faster, may miss details on dense pages
   - **Recommendation**: Page-by-page for first 10 pages (title, civil), batch for rest

2. **Which model for classification?**
   - `gemini-2.5-flash-lite`: Fast, cheap, good for simple classification
   - `gemini-2.5-flash`: Better accuracy, moderate cost
   - **Recommendation**: flash-lite for classification, flash for extraction

3. **Image preprocessing worth it?**
   - Adds complexity and processing time
   - May improve accuracy on scanned docs
   - **Recommendation**: Skip initially, add if accuracy is poor

## Success Metrics

- Extract 90%+ of required permit fields from typical construction drawings
- Process time < 2 minutes for a 200-page PDF
- Cost < $0.50 per document (at Gemini pricing)

## References

- [Google Gemini Document Processing](https://ai.google.dev/gemini-api/docs/document-processing)
- [iTech OCR for Engineering Drawings](https://itechindia.co/us/blog/guide-to-ocr-technology-for-engineering-drawings/)
- [Gemini PDF Limits](https://www.datastudios.org/post/google-gemini-pdf-reading-formats-limits-structured-outputs-and-workspace-integration)
- [Gemini PDF to Data Tutorial](https://www.philschmid.de/gemini-pdf-to-data)
