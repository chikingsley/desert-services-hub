# AZ Stormwater NOI/NDC Toolkit

Reference material for Arizona NOI/NDC source documents and strategy.

## Folder Structure

- `sources/markdown/` — normalized source notes and extracted docs
- `sources/original-documents/` — original PDF source documents (kept intact)
- `strategy/` — roadmap and growth/marketing planning docs

## Generate Packets

Generators live in `packages/documents/pdf-generation/src/stormwater/`.

```bash
# NOI Simple Guide (one-page for supers/PMs)
bun packages/documents/pdf-generation/cli/cli.ts stormwater noi-guide generate --out output.pdf

# NOI/NDC Quickstart Guide (multi-page decision + filing guide)
bun packages/documents/pdf-generation/cli/cli.ts stormwater quickstart generate --out output.pdf
```

## Checker Logic

- Decision tree and checker rules: `strategy/permit-path-checker-logic.md`
