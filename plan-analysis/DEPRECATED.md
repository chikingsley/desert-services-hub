# Deprecated: Mistral OCR

**Date:** 2026-02-02

**Status:** Removed from active use

**Reason:** Testing showed Gemini 3 Flash provides significantly better accuracy for construction documents (plans, drawings, contracts). Mistral OCR produced garbled output on technical drawings (e.g., "DIMENSIONS ARE INCREASED" repeated 17 times, "MILKING CODE" instead of "BUILDING CODE").

**Decision:** Use Gemini 3 Flash as the sole OCR engine for all documents. The `plan-analysis` package is now the single source for OCR functionality.

**Migration:** All OCR commands now use `plan-analysis/` with Gemini:
```bash
cd plan-analysis/
just ocr "/path/to/file.pdf"
```

**Mistral service location:** `services/mistral/` - Kept for reference but not used in production workflows.
