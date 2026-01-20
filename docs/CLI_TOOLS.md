# CLI Tools

This document describes the CLI tools available for developers working on the Desert Services Hub.

## PDF Generation Test Tool

A strict, type-safe CLI tool for testing PDF generation logic without relying on the full application stack or external services. It uses `zod` to validate input data against the `EditorQuote` schema before generation.

### Usage

Run the tool using `bun`:

```bash
bun run pdf <output-path> [input-json-path]
```

- `<output-path>`: The file path where the generated PDF will be saved (e.g., `test-estimate.pdf`).
- `[input-json-path]` (Optional): Path to a JSON file containing the quote data. If omitted, a default valid test dataset is used.

### Examples

**1. Generate a PDF using default test data:**

```bash
bun run pdf output.pdf
```

**2. Generate a PDF using custom data:**

First, create a JSON file (e.g., `my-quote.json`) that matches the `EditorQuote` interface (see `lib/types.ts`).

```bash
bun run pdf output.pdf my-quote.json
```

### Script Location

The script is located at: `scripts/test-pdf-gen.ts`

### Validation

The tool enforces strict schema validation. If your input JSON is missing required fields or has incorrect types, the tool will fail with a descriptive error message listing the validation issues.
