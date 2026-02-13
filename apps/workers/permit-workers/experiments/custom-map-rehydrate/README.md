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

# 3) Document-clue-assisted benchmark
bun experiments/custom-map-rehydrate/benchmark.ts \
  --input experiments/custom-map-rehydrate/out/dataset-run.json \
  --parallel 3 \
  --with-doc-clues \
  --doc-limit 10 \
  --doc-min-confidence 0.55 \
  --doc-max-coord-delta 1200 \
  --doc-clip-min-area-share 0.60 \
  --label doc-clues \
  --out experiments/custom-map-rehydrate/out/benchmark-doc-clues.json
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

Doc-clue clipping guardrails:
- clipping is only attempted when bounds come from high-confidence rehydration (`rehydrate-bounds`)
- clipping is skipped when clipped-area/original-area is below `--doc-clip-min-area-share`

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
- `--record-history true|false`
- `--history-path <path>`
- `--label <text>`
