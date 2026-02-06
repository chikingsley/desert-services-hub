# SWPPP Scheduling Model Refresh (2026-02-06)

## Scope

This refresh was done from the current local SWPPP mirror:

- Source DB: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-master.db`
- Worksheet used for training: `SWPPP B & V`
- Rows with completion text: `2805`
- Rows with parseable labor pattern (`X men Y hours/minutes`) in V2: `1678`
- Rows with parseable labor in V3 (includes person-duration phrases): `2014`

Reference docs reviewed:

- `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/README.md`
- `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/_archive/chi-onboarding/deliverables/people-summaries/Jayson-Roti-Summary.md`
- `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/_archive/chi-onboarding/deliverables/people-summaries/Kendra-Ash-Jayson-Roti-SWPPP-Operations-Summary.md`
- `/Users/chiejimofor/Documents/Github/desert-services-hub/docs/_archive/chi-onboarding/research/interview-transcripts/jayson-roti-transcript.md`

## What Was Implemented

### Baseline recompute (V1 parser/model)

- Script: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/recompute-model.ts`
- Output: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/swppp-model-refresh-latest.json`

### Expanded extractor + segmented model (V2)

- Script: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/recompute-model-v2.ts`
- Output: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/swppp-model-refresh-v2.json`

V2 adds categories aligned to SWPPP operations language:

- temp fence / panels
- privacy screening
- sock
- silt fence (separate from sock)
- inlets (drop/curb combined)
- rock entrance / rumble grate / track-out rock
- signs / stickers
- narrative / delivery / trip charge / mobilization

### Multi-family routed model (V3)

- Script: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/recompute-model-v3.ts`
- Output: `/Users/chiejimofor/Documents/Github/desert-services-hub/apps/cli-tools/sharepoint-cli/swppp/swppp-labor/model-refresh-2026-02-06/swppp-model-refresh-v3.json`

V3 routes each row to one family before estimation:

- `fence_screen`
- `sock_silt`
- `inlet`
- `rock_trackout`
- `mixed_install`
- `admin_trip`

V3 also expands labor parsing beyond strict `X men Y hours` to include phrases like
`"Efren was on the tractor for 2 hours"` and `"Carlos was doing labor for 2 hours"`.

Family counts from current V3 data (`n=1733` modeled rows):

- `admin_trip`: `314`
- `fence_screen`: `557`
- `sock_silt`: `383`
- `inlet`: `73`
- `rock_trackout`: `302`
- `mixed_install`: `104`

## Validation Results

All metrics below are 5-fold cross-validation means on historical data.

### V2 baseline (strict labor parser)

### Legacy model (baseline features)

- Samples: `1112`
- R²: `33.7%`
- Median APE: `46.9%`
- P90 APE: `202.3%`

### Expanded single model (all new features in one model)

- Samples: `1433`
- R²: `14.6%` (worse)
- Median APE: `47.5%`
- P90 APE: `237.1%` (worse)

### Segmented model (production vs admin trips)

- Samples: `1433`
- Production rows: `1136`
- Admin/non-production rows: `297`
- R²: `45.3%` (best so far)
- Median APE: `45.8%` (slight improvement)
- P90 APE: `199.6%` (slight improvement)

### Work-family routed model (V3)

- Samples: `1733`
- R²: `40.1%`
- Median APE: `43.0%`
- P90 APE: `201.1%`

### V3 parser-expanded comparison (same data slice)

- Legacy: `R² 34.6%`, `Median APE 46.2%`, `P90 APE 207.2%`
- Expanded single model: `R² 40.1%`, `Median APE 44.9%`, `P90 APE 207.2%`
- Segmented (`production` vs `admin`): `R² 40.6%`, `Median APE 46.2%`, `P90 APE 197.1%`
- Work-family routed: `R² 40.1%`, `Median APE 43.0%`, `P90 APE 201.1%`

## Interpretation

1. A single mixed model performs poorly because production installs and admin/delivery/sign tasks have different time behavior.
2. The strict labor parser left substantial signal on the table; expanding parse coverage increased usable labor rows by `+336` (`1678 -> 2014`).
3. With parser-expanded data, segmentation tradeoffs become objective-dependent:
   - best `R²`/tail control: segmented model (`production` vs `admin`)
   - best median typical-case accuracy: work-family routing
4. Error is still wide (P90 near 2x), so this remains planning guidance, not exact-hour commitments.

## Current Recommendation

For live scheduling now:

1. Keep current V4 rates as the default baseline.
2. Use segmented model for capacity protection (`p90` control), and optionally expose family-routed estimate as the "typical case" value.
3. Keep parser-expanded logic in place; this is currently the highest leverage data-quality improvement.
4. Schedule at ~`80%` of nominal daily capacity until trip-overhead inputs are captured.

## Next Work to Reach Production-Grade Rates

1. Curate 150-250 rows with manual labels focused on ambiguous rows and mixed installs.
2. Add explicit planner fields for readiness and install conditions: `temp_fence_ready`, `inlets_ready`, `rock_area_prepped`, `requires_tractor`, `privacy_screen_yes_no`.
3. Separate trip overhead from unit work by capturing/estimating route burden (`yard_to_site`, `site_to_site`, and day-level stop count) and modeling it as a distinct component.
4. Re-run with a recent 60-90 day holdout and only publish new coefficients when both median and p90 error improve.
