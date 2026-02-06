# Auto-Permit: Page 2 Map Automation

## What This Is

Complete the last manual step in the dust permit automation system: Page 2 map location entry. The system currently automates permit creation, renewal, and closing for Maricopa County — but Page 2 (where you draw the project boundary on an ESRI map) requires manual intervention. This project adds AI-powered location finding and polygon drawing to achieve full hands-off automation.

## Core Value

**Automatically navigate to and draw the project boundary on the portal map — eliminating the last manual step in dust permit creation.**

If full automation fails, provide a graceful handoff with a dashboard showing reference drawing + VNC + AI hints side-by-side.

## Requirements

### Validated

Existing capabilities that work today:

- ✓ Portal login and session management — existing
- ✓ Permit creation (pages 1, 3, 4, 5) with copied locations — existing
- ✓ Permit renewal flow — existing
- ✓ Permit closing flow — existing
- ✓ Permit deletion (drafts) — existing
- ✓ Dashboard for permit management — existing
- ✓ Email integration (Microsoft Graph) — existing
- ✓ Database sync from portal exports — existing
- ✓ Page 2 simple mode (select existing location) — existing
- ✓ Map popup opening and search — existing
- ✓ Basemap switching to aerial — existing
- ✓ Drawing mode activation — existing

### Active

New capabilities for this milestone:

- [ ] **LOC-01**: Multi-source location consensus pipeline (clustering, outlier removal, confidence scoring)
- [ ] **LOC-02**: Parcel-based location search on ESRI map
- [ ] **LOC-03**: Address-based location search with fallback chain
- [ ] **PDF-01**: AI extraction of location signals from PDF (addresses, intersections, project name)
- [ ] **DRAW-01**: Polygon coordinate calculation from reference drawing
- [ ] **DRAW-02**: ESRI map polygon drawing via Playwright
- [ ] **CONF-01**: Confidence threshold for auto-commit vs human handoff
- [ ] **HAND-01**: Fallback dashboard with VNC + reference overlay + AI hints
- [ ] **INT-01**: Integration with existing `fillPage2Full()` flow

### Out of Scope

- Other counties (Pinal, Pima, etc.) — Maricopa only for now
- Mobile app — web dashboard sufficient
- Perfect first-try accuracy — iterative improvement expected; R&D project
- Full SAM3/segmentation model integration — explore lighter approaches first
- Google Maps overlay approach — focus on direct ESRI map interaction

### Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOC-01 | Phase 1 | Pending |
| LOC-02 | Phase 2 | Pending |
| LOC-03 | Phase 1 | Pending |
| PDF-01 | Phase 1 | Pending |
| DRAW-01 | Phase 2 | Pending |
| DRAW-02 | Phase 2 | Pending |
| CONF-01 | Phase 3 | Pending |
| HAND-01 | Phase 4 | Pending |
| INT-01 | Phase 2/3 | Pending |

## Context

**Previous Work:**
- `docs/auto-custom-map-for-dust-permit/`: Standalone prototype with working pieces (PDF scanning, Gemini extraction, geocoding, parcel lookup, road geometry) but missing orchestration layer
- TODO doc from Dec 2024 outlined multi-source consensus architecture that was designed but not built
- `src/portal/create/fill/page2/map.ts`: 800+ lines of ESRI iframe handling, stops at "ready to draw"

**Technical Environment:**
- ESRI map runs in cross-origin iframe from gis.maricopa.gov
- Maricopa Assessor API available for parcel data (documented in `docs/reference/maricopa-assessor.md`)
- Gemini API for PDF analysis and drawing interpretation
- Playwright for browser automation

**Input Materials Vary:**
- Sometimes: detailed grading plan PDF with dimensions and boundaries
- Sometimes: simple site sketch with basic outline
- Sometimes: just an address — no drawing at all
- Solution must handle all scenarios

**Key Insight:**
PDFs contain MANY addresses (contractor, developer, engineer, actual site). Can't just pull a random address — need multi-source consensus from intersections, project name, roads to find the real site.

## Constraints

- **Tech stack**: Bun + TypeScript + Playwright (matches existing codebase)
- **Portal dependency**: ESRI map iframe is cross-origin; limited to Playwright frame interactions
- **API limits**: Maricopa Assessor API has rate limits; Google geocoding costs money
- **R&D nature**: This is exploratory — "see how far we get" then decide what's practical

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ESRI direct vs Google Maps overlay | Simpler to draw directly on portal map than overlay + translate | — Pending |
| Confidence threshold for auto-commit | Need to determine when AI is confident enough to commit vs hand off | — Pending |
| Coordinate-based clicking vs element selection | ESRI map may require pixel coordinates rather than DOM selectors | — Pending |
| Integrate prototype vs rebuild | Decide whether to port `docs/auto-custom-map-for-dust-permit` code or start fresh | — Pending |

---
*Last updated: 2026-01-24 after roadmap creation*
