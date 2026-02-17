# APN Extraction from Engineering Drawings

## Problem

Engineering/civil drawings (grading plans, site plans) contain APN labels that standard OCR models struggle to extract. The text is small, rotated, and embedded in complex line drawings.

## Test Document

- File: `001 C5.0 GRADING PLAN.pdf` (Crash Champions, Surprise AZ)
- Known APNs (from visual inspection + other docs):
  - 501-44-993 - Main project parcel (Crash Champions site)
  - 501-44-904 - Suburban Land Reserve Inc (adjacent)
  - 501-44-903A - Suburban Land Reserve Inc (adjacent)
  - 501-44-957A - Laytons Land Co of Phoenix LLC (adjacent)
  - 501-44-992 - SDSM Property Holdings LLC (adjacent)

## Test Results

### Mistral OCR (2026-01-28)

**Attempt 1** - Basic prompt:
```
"Extract all APN numbers visible on this grading plan"
```
Result: Found 3 APNs (501-44-959, 501-44-904, 501-44-957A)
- Missing main parcel 501-44-993
- One incorrect: 501-44-959 (may be misread)

**Attempt 2** - Detailed prompt with owner context:
```
"List ALL APN numbers shown anywhere on this drawing... Include associated owner/company name"
```
Result: Found 4 APNs with owners:
- 501-44-904 (Suburban Land Reserve Inc)
- 501-44-903A (Suburban Land Reserve Inc)
- 501-44-957A (Laytons Land Co of Phoenix LLC)
- 501-44-992 (SDSM Property Holdings LLC)

**Key Finding**: Still missing main parcel 501-44-993 which is prominently labeled on the drawing.

### Gemini 2.5 Flash (2026-01-28)

**Prompt**: Same detailed prompt asking for APNs with owners and locations

Result: Found 4 APNs:
- 501-44-991A (Urban Land Reserve Inc) - Northwest boundary
- 501-44-956 (Suburban Land Reserve Inc) - North boundary
- 501-44-992 (SCISM Property Holdings LLC) - Southwest boundary
- 501-44-957A (Lazydays Land of Phoenix LLC) - Southeast boundary

**Key Finding**: Also missing main parcel 501-44-993. Some owner names differ slightly from Mistral (OCR variations).

### Comparison

| APN | Mistral | Gemini | Actual (from survey) |
|-----|---------|--------|---------------------|
| 501-44-993 | ❌ | ❌ | ✓ Main project site |
| 501-44-904 | ✓ | ❌ | ? |
| 501-44-903A | ✓ | ❌ | ? |
| 501-44-991A | ❌ | ✓ | ? |
| 501-44-956 | ❌ | ✓ | ? |
| 501-44-957A | ✓ | ✓ | ✓ Adjacent parcel |
| 501-44-992 | ✓ | ✓ | ✓ Adjacent parcel |

**Both models miss the main project APN (501-44-993)** even though it's clearly labeled on the drawing.

### Potential Strategies

1. **Higher resolution input** - Convert PDF to high-DPI image before OCR
2. **Region-based extraction** - Crop to property boundary areas, OCR each region
3. **SAM-based segmentation** - Use SAM to identify text regions, OCR individually
4. **Fine-tuned model** - Train on engineering drawing text specifically
5. **Multi-pass with coordinates** - Ask model to describe where APNs appear, then zoom to those areas
6. **Preprocessing** - Enhance contrast, isolate text layers if PDF has them
