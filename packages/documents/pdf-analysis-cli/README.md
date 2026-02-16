# PDF Analysis (Python)

Unified Python tooling for OCR and PDF analysis with three providers:

1. `gemini` (best quality; paid)
2. `local` (Ollama/OpenAI-compatible local OCR)
3. `mistral` (free API fallback)

This package replaces the old split between `services/mistral` and `plan-analysis`.

## Quick Start

```bash
cd packages/documents/pdf-analysis-cli
uv sync
```

## CLI

```bash
# Provider status
uv run pdf-analysis status

# OCR
uv run pdf-analysis ocr /path/to/file.pdf
uv run pdf-analysis ocr /path/to/file.pdf --provider gemini --output /tmp/file.md

# Structured extraction
uv run pdf-analysis extract /path/to/file.pdf "Extract project name, GC, and total value"

# Identify document
uv run pdf-analysis identify /path/to/file.pdf --rename

# Plan analysis
uv run pdf-analysis analyze /path/to/file.pdf --analysis-type swppp

# Backward-compatible Gemini OCR command
uv run plan-ocr gemini-ocr /path/to/file.pdf --max-pages 5
```

## Testing (uv)

```bash
# Run all tests
uv run pytest

# Run one file
uv run pytest tests/test_utils.py

# Run one test node
uv run pytest tests/test_utils.py::test_parse_page_spec_mixed_ranges

# Keyword filter
uv run pytest -k provider
```

## Environment Variables

- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
- `OLLAMA_ENDPOINT` (default: `https://ollama.peacockery.studio/v1`)
- `OLLAMA_MODEL` (default: `glm-ocr:latest`)
- `OLLAMA_MANAGER_ENDPOINT` (optional control-plane endpoint, e.g. `https://mm.peacockery.studio`)
- `PDF_ANALYSIS_PROVIDER_ORDER` (default: `local,mistral,gemini`)

## Notes

- `--provider auto` uses `PDF_ANALYSIS_PROVIDER_ORDER`.
- OCR outputs can be emitted as `text`, `markdown`, or `json`.
- Use `just clean` to remove local caches/virtualenv artifacts.
