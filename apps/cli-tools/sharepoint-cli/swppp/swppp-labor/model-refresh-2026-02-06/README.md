# SWPPP Model Refresh 2026-02-06

This folder contains all artifacts generated for the 2026-02-06 SWPPP labor/scheduling model refresh.

Files:

- `report.md` - Summary of method, results, and interpretation.
- `swppp-model-refresh-latest.json` - Raw metrics from `recompute-model.ts` (baseline refresh).
- `recompute-model-v2.ts` - Expanded extractor + segmented model experiment.
- `swppp-model-refresh-v2.json` - Raw metrics and coefficients from `recompute-model-v2.ts`.
- `recompute-model-v3.ts` - Multi-family routed model experiment (fence/screen, sock/silt, inlet, rock/trackout, mixed install, admin trip).
- `swppp-model-refresh-v3.json` - Raw metrics and coefficients from `recompute-model-v3.ts`.
- `build-capacity-plan-v1.ts` - Builds day-level capacity and backlog estimates using V3 coefficients.
- `capacity-plan-v1.json` - Machine-readable backlog/capacity output.
- `capacity-plan-v1.md` - Human-readable backlog/capacity summary.
- `completion-format-minimum.md` - Lightweight field completion format to improve future parser quality.

Run:

```bash
bun apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/build-capacity-plan-v1.ts
```

Optional capacity overrides (env vars):

- `SWPPP_CREW_COUNT` (default `3`)
- `SWPPP_CREW_SIZE` (default `4`)
- `SWPPP_SHIFT_HOURS` (default `8`)
- `SWPPP_PLANNING_UTILIZATION` (default `0.8`)
- `SWPPP_UNMODELED_RISK_MULTIPLIER` (default `1.15`)
