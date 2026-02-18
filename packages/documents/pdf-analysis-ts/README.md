# PDF Analysis (TypeScript)

Lean TypeScript PDF analysis package with:

1. `kreuzberg` text/table extraction first
2. Modular OCR fallback provider(s)
3. Deterministic extractors for `NOI` and `Estimate`
4. CLI entrypoint aligned with `pdf-generation` style

## Commands

```bash
bun packages/documents/pdf-analysis/cli/cli.ts status
bun packages/documents/pdf-analysis/cli/cli.ts text ./file.pdf --format json
bun packages/documents/pdf-analysis/cli/cli.ts parse ./file.pdf --output ./out.md
bun packages/documents/pdf-analysis/cli/cli.ts noi ./parsed.txt --format json
bun packages/documents/pdf-analysis/cli/cli.ts estimate ./estimate.pdf --format json
```

## Tests

```bash
bun test packages/documents/pdf-analysis/tests
```

## Env

- `PDF_ANALYSIS_MIN_TEXT_LENGTH` default `400`
- `KREUZBERG_OCR_BACKEND` default `rapidocronnx`
- `KREUZBERG_OCR_LANGUAGE` optional (for backends that support it)
