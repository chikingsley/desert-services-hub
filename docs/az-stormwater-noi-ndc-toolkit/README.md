# AZ Stormwater NOI/NDC Toolkit

Working folder for Arizona NOI/NDC source material, packet generation, and intake strategy.

## Folder Structure

- `sources/markdown/` — normalized source notes and extracted docs
- `sources/original-documents/` — original PDF source documents (kept intact)
- `scripts/` — PDF generator and related tooling
- `outputs/` — generated deliverables (client-facing packet PDFs)
- `strategy/` — roadmap and growth/marketing planning docs

## Generate Packet

```bash
bun /Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/scripts/generate-noi-ndc-quickstart-guide.ts
```

Default output:

- `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/outputs/noi-ndc-quickstart-guide-v2.pdf`

Optional custom output:

```bash
bun /Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/scripts/generate-noi-ndc-quickstart-guide.ts /absolute/path/output.pdf
```

## Generate Simple Guide

```bash
bun /Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/scripts/generate-noi-simple-guide.ts
```

Default output:

- `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/outputs/noi-simple-guide-v1.pdf`

## Checker Logic

- Decision tree and checker rules live in:
  `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/az-stormwater-noi-ndc-toolkit/strategy/permit-path-checker-logic.md`
