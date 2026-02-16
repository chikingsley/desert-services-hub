# Custom Map Rehydrate (Experiment)

This is an isolated rehydration of older `custom-map` methods into permit-workers **without touching production flow code**.

It focuses on the parts that were missing from current test workflows:
- multi-signal location consensus (coordinates, address, intersections, roads, project name)
- clustering + outlier handling
- corner-based and center-based bounds calculation
- optional road geometry tracing for visual map checks
- repeatable benchmark loops against real permit map ground truth

## What Is Intentionally Not Included

- Production portal drawing execution
- Production worker routing
- Direct production DB flow changes

You can combine experiment output with existing prod APIs later.

## Files

- `types.ts`: shared types for extracted hints/signals/results
- `geocoding.ts`: address + intersection geocoding helpers
- `roads.ts`: road polyline decoding and geometry retrieval
- `consensus.ts`: clustering and confidence scoring
- `bounds.ts`: center/corner bounds helpers
- `pipeline.ts`: orchestration entrypoint
- `run.ts`: CLI runner for hints JSON
- `smoke.ts`: deterministic smoke check
- `sample-input.json`: sample extracted hints payload
- `dataset-builder.ts`: builds benchmark permit samples from Docker Postgres
- `document-clues.ts`: extracts roads/intersections/coordinates/acreage clues from project documents
- `gemini-document-clues.ts`: extracts extra coordinate/APN candidates from live attachment PDFs via Gemini
- `gemini-clue-probe.ts`: targeted probe runner for low-IoU permits
- `benchmark.ts`: compares predicted polygons to real permit disturbed-area geometry and records iteration history

## Benchmark Workflow

From `apps/workers/permit-workers`:

```bash
# 1) Build sample permit dataset
bun experiments/custom-map-rehydrate/dataset-builder.ts \
  --limit 30 \
  --min-docs 2 \
  --out experiments/custom-map-rehydrate/out/dataset-run.json

# 2) Baseline benchmark (APN/address only)
bun experiments/custom-map-rehydrate/benchmark.ts \
  --input experiments/custom-map-rehydrate/out/dataset-run.json \
  --parallel 3 \
  --label baseline \
  --out experiments/custom-map-rehydrate/out/benchmark-baseline.json

# 3) Doc-clue benchmark with safe guardrails (no coordinate parcel override)
bun experiments/custom-map-rehydrate/benchmark.ts \
  --input experiments/custom-map-rehydrate/out/dataset-run.json \
  --parallel 3 \
  --with-doc-clues \
  --doc-limit 10 \
  --doc-min-confidence 0.55 \
  --doc-max-coord-delta 1200 \
  --doc-clip-min-area-share 0.60 \
  --label doc-clues-guardrails \
  --out experiments/custom-map-rehydrate/out/benchmark-doc-clues.json

# 4) Coordinate-parcel override mode (current non-Gemini best)
bun experiments/custom-map-rehydrate/benchmark.ts \
  --input experiments/custom-map-rehydrate/out/dataset-run.json \
  --parallel 3 \
  --with-doc-clues \
  --doc-limit 10 \
  --doc-min-confidence 0.55 \
  --doc-max-coord-delta 1200 \
  --doc-clip-min-area-share 0.60 \
  --doc-coordinate-parcel-override \
  --doc-coordinate-parcel-max-delta 350 \
  --doc-coordinate-parcel-min-delta 80 \
  --label doc-coord-best \
  --out experiments/custom-map-rehydrate/out/benchmark-doc-coord-best.json

# 5) Gemini-assisted clues (recommended gate: only when missing coords)
bun experiments/custom-map-rehydrate/benchmark.ts \
  --input experiments/custom-map-rehydrate/out/dataset-run.json \
  --parallel 3 \
  --with-doc-clues \
  --doc-limit 10 \
  --doc-min-confidence 0.55 \
  --doc-max-coord-delta 1200 \
  --doc-clip-min-area-share 0.60 \
  --doc-coordinate-parcel-override \
  --doc-coordinate-parcel-max-delta 350 \
  --doc-coordinate-parcel-min-delta 80 \
  --with-gemini-clues \
  --gemini-model gemini-3-flash-preview \
  --gemini-max-docs 2 \
  --gemini-only-when-missing-coords true \
  --label doc-coord-final-v5-gemini \
  --out experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v5-gemini.json
```

## Iteration Recording

Each benchmark run appends a summary entry to:

- `experiments/custom-map-rehydrate/ITERATION_LOG.md`

Log entry includes:
- run timestamp and optional label
- mode (`baseline` vs `doc-clue-assisted`)
- scored/skipped/error counts
- average IoU, centroid error, area ratio
- pass rates and IoU bins
- top permits by IoU
- output JSON path

Disable history writes per run with:

```bash
--record-history false
```

## Guardrails

Doc-clue clipping guardrails:
- clipping is only attempted when bounds come from high-confidence rehydration (`rehydrate-bounds`)
- clipping is skipped when clipped-area/original-area is below `--doc-clip-min-area-share`

Coordinate-parcel override guardrails:
- deduped coordinate candidates are evaluated (primary OCR/text coordinate plus APN-coordinate pairs)
- candidates outside `--doc-max-coord-delta` from the base prediction center are dropped
- coordinate override only applies when coordinate parcel APN differs from base APN
- coordinate point must lie outside the base parcel polygon
- centroid shift must be between `--doc-coordinate-parcel-min-delta` and `--doc-coordinate-parcel-max-delta`
- among valid candidates, the smallest centroid-shift parcel is chosen with a 30m tie tolerance to preserve document order

Gemini clue guardrails:
- Gemini extraction is opt-in via `--with-gemini-clues`
- recommended mode is `--gemini-only-when-missing-coords true` to reduce overfit/regressions
- live PDF bytes are fetched from the attachment download API; this avoids stale `/app/data/backfill/*` paths in `documents.file_path`

## Useful Flags

`dataset-builder.ts`:
- `--require-project true|false` (default `true`)
- `--require-address true|false` (default `false`)
- `--statuses "Active,Closed"`
- `--min-docs <n>`

`benchmark.ts`:
- `--limit <n>`
- `--max-apns <n>`
- `--iou-grid <n>`
- `--min-iou <n>`
- `--max-centroid-error <meters>`
- `--with-doc-clues`
- `--doc-limit <n>`
- `--doc-min-confidence <0-1>`
- `--doc-max-coord-delta <meters>`
- `--doc-clip-min-area-share <0-1>`
- `--doc-coordinate-parcel-override`
- `--doc-coordinate-parcel-max-delta <meters>`
- `--doc-coordinate-parcel-min-delta <meters>`
- `--doc-size-normalize`
- `--doc-size-overage-ratio <number>`
- `--doc-size-min-scale <0-1>`
- `--with-gemini-clues`
- `--gemini-model <name>`
- `--gemini-max-docs <n>`
- `--gemini-max-doc-bytes <bytes>`
- `--gemini-only-when-missing-coords true|false`
- `--record-history true|false`
- `--history-path <path>`
- `--label <text>`
