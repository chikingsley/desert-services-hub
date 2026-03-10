# PDF Analysis Service (`packages/documents/intake`)

FastAPI document extraction service. Runs as `desert-pdf-analysis` container on port 4848.

## Architecture

All document processing logic lives here — TypeScript is a thin HTTP client only.

**Extraction tiers** (all include LLM classification):

| Endpoint | Method | LLM |
|----------|--------|-----|
| `POST /native-text-extraction` | Kreuzberg text layer → classify | local/gemini |
| `POST /ocr-extraction` | GLM-OCR vision → classify | local/gemini |
| `POST /full-extraction` | Kreuzberg + OCR + LLM reconcile → classify | local/gemini |

**Specialist extractors** (take a file path, return structured JSON):

| Endpoint | Method | LLM |
|----------|--------|-----|
| `POST /estimate` | Kreuzberg table extraction + LLM verify | verify step only |
| `POST /noi` | Kreuzberg text + regex parsing + LLM verify | verify step only |
| `POST /contract` | Kreuzberg text + LLM extraction | yes |

**Utility:** `GET /health`

## LLM Provider Order

Default: `local` (Ollama/granite4) → `gemini` fallback.
Controlled by `PDF_ANALYSIS_PROVIDER_ORDER` env var. Auto-fallback on unavailability.

- Chat/classify: `OLLAMA_CHAT_MODEL` (default `granite4:latest`)
- OCR vision: `OLLAMA_MODEL` (default `glm-ocr:latest`)
- Gemini: `GEMINI_API_KEY` + `GEMINI_MODEL`

## Package Layout

```text
src/pdf_analysis/
  server.py            # FastAPI endpoints
  ingest.py            # kreuzberg extraction + classify (native tier)
  parse.py             # kreuzberg + OCR + LLM reconcile (full tier)
  provider_manager.py  # provider routing + fallback
  config.py            # settings from env
  types.py             # shared types
  cli.py               # dev CLI
  analysis/
    estimates.py       # estimate table parser (no LLM)
    noi.py             # ADEQ NOI regex parser (no LLM)
    classify.py        # document classifier
    plan_analyzer.py   # construction plan analysis
  providers/
    local.py           # Ollama provider
    gemini.py          # Gemini provider
```

## TypeScript Client

```ts
import {
  nativeExtract,   // fast default
  ocrExtract,      // GLM-OCR vision pass
  fullExtract,     // expensive: kreuzberg + OCR + reconcile
  extractEstimate, // estimate line items + flags
  extractNoi,      // ADEQ NOI fields + flags
  extractContract, // contract parties, value, scope
} from "@documents-intake/pdf-analysis";
```

## Running Locally

```bash
cd packages/documents/intake
uv sync
uv run uvicorn pdf_analysis.server:app --port 4848 --reload
```

## Testing

```bash
uv run pytest
uv run ruff check src/
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_ENDPOINT` | `http://host.docker.internal:11434/v1` | Ollama base URL |
| `OLLAMA_CHAT_MODEL` | `granite4:latest` | Chat/classify model |
| `OLLAMA_MODEL` | `glm-ocr:latest` | OCR vision model |
| `GEMINI_API_KEY` | — | Gemini fallback (optional) |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini model |
| `PDF_ANALYSIS_PROVIDER_ORDER` | `local,gemini` | Provider priority |
| `HTTP_TIMEOUT_SECONDS` | `180` | Request timeout |
