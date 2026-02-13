# Custom Map Rehydrate (Experiment)

This is an isolated rehydration of older `custom-map` methods into permit-workers **without touching production flow code**.

It focuses on the parts that were missing from current test workflows:
- multi-signal location consensus (coordinates, address, intersections, roads, project name)
- clustering + outlier handling
- corner-based and center-based bounds calculation
- optional road geometry tracing for visual map checks

## What Is Intentionally Not Included

- Production portal drawing execution
- Production worker routing
- Parcel/assessor integration in this experiment pipeline

You can still combine experiment output with existing prod APIs later.

## Files

- `types.ts`: shared types for extracted hints/signals/results
- `geocoding.ts`: address + intersection geocoding helpers
- `roads.ts`: road polyline decoding and geometry retrieval
- `consensus.ts`: clustering and confidence scoring
- `bounds.ts`: center/corner bounds helpers
- `pipeline.ts`: orchestration entrypoint
- `run.ts`: CLI runner for real input JSON
- `smoke.ts`: deterministic local smoke check
- `sample-input.json`: sample extracted hints payload

## Run

From `apps/workers/permit-workers`:

```bash
bun experiments/custom-map-rehydrate/smoke.ts
bun experiments/custom-map-rehydrate/run.ts --input experiments/custom-map-rehydrate/sample-input.json
bun experiments/custom-map-rehydrate/run.ts --input experiments/custom-map-rehydrate/sample-input.json --with-roads --out /tmp/custom-map-rehydrate-result.json
```

If geocoding/roads are enabled, set `GOOGLE_MAPS_API_KEY`.
