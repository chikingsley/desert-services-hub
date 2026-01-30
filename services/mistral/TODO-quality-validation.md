# OCR Quality Validation - TODO

**Priority**: High
**Discovered**: 2026-01-29
**Context**: Legacy Sports Arena drawings OCR produced garbage output

## Problem

The Mistral OCR MCP has no quality validation on output. When processing architectural drawings (CAD-based PDFs, compressed images), the OCR model hallucinates badly:

**Example garbage output:**
```text
"ALL REGIONS AND CONSTRUCTION IS ADMINISTERED BY THE EARNED THE ARCHITECT EMOLEVANT BE CONFISCED"
"EACH EACH EACH EACH AND LOCAL EACH EACH EACH"
"ANTI-EUROPEAN, CONTRACTOR ANTI-EXPRESSOR"
```

**Repetitive garbage:**
```text
W12
W12
W12
... (hundreds of times)
```

## Root Causes

1. Mistral's OCR model hallucinates when it can't read text clearly
2. Architectural drawings have small CAD text, symbols, complex layouts
3. Compressed PDFs have degraded image quality
4. Tables/schedules don't OCR well
5. No confidence scoring or quality metrics returned

## Proposed Solutions

### 1. Repetition Detection
Flag pages with high word/phrase repetition:
```python
def detect_repetition(text: str, threshold: float = 0.3) -> bool:
    words = text.split()
    unique_ratio = len(set(words)) / len(words)
    return unique_ratio < threshold  # Low unique ratio = garbage
```

### 2. Entropy Scoring
Low-entropy pages (W12 W12 W12) indicate garbage:
```python
import math
from collections import Counter

def text_entropy(text: str) -> float:
    freq = Counter(text.split())
    total = sum(freq.values())
    return -sum((c/total) * math.log2(c/total) for c in freq.values() if c > 0)
```

### 3. Hallucination Pattern Detection
Common patterns:
- Repeated words with slight variations
- Nonsense legal/technical text
- Words that don't exist in dictionaries
- Unusually long "words" (garbled text)

### 4. Page-Level Quality Scores
Return confidence per page, let caller decide threshold:
```python
@dataclass
class PageQuality:
    page_index: int
    entropy: float
    repetition_ratio: float
    word_count: int
    is_garbage: bool  # Combined heuristic
```

### 5. Document Type Awareness
Architectural drawings are known-bad for OCR. Could:
- Warn user upfront
- Use different processing (skip tables, extract only headers)
- Fall back to image-based extraction

## Implementation Location

`services/mistral/src/mistral_mcp/quality.py` - New module for validation
`services/mistral/src/mistral_mcp/server.py` - Add quality param to ocr tool

## Files Affected

- `server.py:82-132` - ocr tool
- `split_ocr.py` - page-level processing
- `types.py` - add OCRQuality types
