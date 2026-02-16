# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-22)

**Core value:** Automatically navigate to and draw the project boundary on the portal map — eliminating the last manual step in dust permit creation.

**Current focus:** Shape extraction experimentation + Phase 1 completion

## Current Position

Phase: Between 1 and 2 (spike work complete, exploring shape extraction)
Plan: Experimenting with SWPPP shape extraction
Status: Active development
Last activity: 2026-01-26 — Phase 2 spike COMPLETE, full drawing workflow validated

Progress: [████░░░░░░] 40%

## Key Accomplishments

### Phase 2 Spike - COMPLETE (2026-01-26)

Validated full end-to-end map drawing workflow:
- ✅ Programmatic map navigation via `centerAndZoom()`
- ✅ Template selection by label (handles dynamic IDs)
- ✅ Polygon drawing using parcel coordinates
- ✅ Access point placement
- ✅ Save and close workflow
- ✅ Coordinate conversion (WGS84 → Web Mercator → screen)

See: `.planning/phases/02-drawing-engine/SPIKE-RESULTS.md`
Test: `tests/e2e/map-full-workflow.test.ts`

### Infrastructure Available

- `src/lib/assessor.ts` - Parcel lookup by address/APN with polygon coordinates
- `queryParcelsByAddress()` - Returns polygon vertices and centroid
- NOI documents contain direct lat/lng coordinates

## Current Gap: Shape Extraction

**Problem:** Parcel polygon ≠ Disturbed area polygon

- Parcel boundary comes from assessor API
- Actual disturbed area boundary is in SWPPP site plan drawings
- Need to extract the real construction boundary shape

**Exploring:**
- AI vision extraction from SWPPP site plan images
- Georeferenced data if available in PDFs
- Parcel as approximation for MVP

**Test fixtures:** `tests/fixtures/pdfs/noi_swppp/`

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (spike work was exploratory)
- Phase 2 spike: ~4 hours
- Total execution time: ~4 hours

## Accumulated Context

### Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-26 | Template selection by label, not ID | IDs are dynamic per session |
| 2026-01-26 | Programmatic pan/zoom over search box | Search autocomplete unreliable |
| 2026-01-26 | Street address only for parcel lookup | PHYSICAL_ADDRESS field excludes city/state |
| 2026-01-26 | Save button is img[alt="Save and Close"] | Not a text button |

### Pending Todos

- [ ] Experiment with SWPPP shape extraction (AI vision)
- [ ] Complete Phase 1 plans if needed
- [ ] Integrate drawing workflow into production code

### Blockers/Concerns

**RESOLVED - Canvas Click Handling:**
~~Canvas click event handling against gis.maricopa.gov is unverified.~~
→ VALIDATED: Mouse clicks work, programmatic centerAndZoom works, template selection works.

**ACTIVE - Shape Extraction:**
How to extract actual disturbed area polygon from SWPPP engineering drawings. Options being explored.

## Session Continuity

Last session: 2026-01-26 (shape extraction discussion)
Stopped at: Ready to experiment with SWPPP shape extraction
Resume file: None

**Next step:** Try AI vision extraction on SWPPP site plan images.
