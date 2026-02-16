# Roadmap: Page 2 Map Automation

## Overview

This milestone completes the dust permit automation pipeline by adding AI-powered map location finding and polygon drawing. The system will extract location signals from grading plan PDFs, establish consensus location through multi-source geocoding and clustering, transform coordinates through three coordinate systems (WGS84 → Web Mercator → screen pixels), and execute polygon drawing on the cross-origin ESRI iframe. When confidence is high, it auto-commits; when low, it hands off to a human dashboard with reference materials.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Location Pipeline & Coordinate Foundation** - Extract, cluster, score location signals; establish coordinate transformation system
- [ ] **Phase 2: Drawing Engine** - Polygon execution via frame injection and mouse automation
- [ ] **Phase 3: Confidence Gate & Auto-Commit** - Decision logic to commit or hand off based on confidence
- [ ] **Phase 4: Human Handoff Dashboard** - VNC + reference overlay + AI hints for low-confidence cases

## Phase Details

### Phase 1: Location Pipeline & Coordinate Foundation

**Goal**: Establish WHERE to draw and HOW to transform coordinates — the foundation for all subsequent automation.

**Depends on**: Nothing (first phase)

**Requirements**:
- Multi-source location consensus pipeline (clustering, outlier removal, confidence scoring)
- Address-based location search with fallback chain
- AI extraction of location signals from PDF (addresses, intersections, project name)

**Success Criteria** (what must be TRUE):
1. PDF containing multiple addresses (contractor, site, engineer) correctly identifies the actual construction site location
2. System assigns confidence scores to location signals and aggregates them into a consensus location
3. Coordinates can be transformed between WGS84 lat/lng, Web Mercator meters, and screen pixels without positioning errors
4. Parcel lookup API returns boundary polygons when given an address or parcel number
5. Cross-origin ESRI iframe is accessible via Playwright frame handle for all subsequent operations

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Typed coordinate system and proj4 transformation foundation
- [ ] 01-02-PLAN.md — PDF location extraction with Gemini and geocoding with fallback chain
- [ ] 01-03-PLAN.md — Clustering algorithm and full pipeline orchestration

---

### Phase 2: Drawing Engine

**Goal**: Execute polygon drawing on the ESRI map using coordinate data from Phase 1.

**Depends on**: Phase 1 (requires consensus location and coordinate transformer)

**Requirements**:
- Polygon coordinate calculation from reference drawing
- ESRI map polygon drawing via Playwright
- Parcel-based location search on ESRI map
- Integration with existing fillPage2Full() flow

**Success Criteria** (what must be TRUE):
1. ✅ System can programmatically enter drawing mode on the ESRI map iframe
2. ✅ Given a set of polygon vertices in screen coordinates, the system draws the complete polygon on the map
3. ✅ Polygon vertices register correctly on the ESRI canvas despite cross-origin iframe constraints
4. ✅ Parcel boundary polygons (from Phase 1) can be drawn automatically on the map
5. ⚠️ Drawing completion is verified (polygon appears in graphics layer) before proceeding — *acreage displayed confirms success*

**Research Flag**: ~~Needs spike research~~ **SPIKE COMPLETE (2026-01-26)**

Spike validated:
- Programmatic `centerAndZoom()` navigation works
- Template selection by label (IDs are dynamic)
- Mouse click polygon drawing works
- Coordinate conversion WGS84 → Web Mercator → screen works
- Save and close via `img[alt="Save and Close"]` works

See: `.planning/phases/02-drawing-engine/SPIKE-RESULTS.md`
Test: `tests/e2e/map-full-workflow.test.ts`

**Remaining Gap**: Shape extraction from SWPPP drawings (parcel ≠ disturbed area)

**Plans**: TBD — spike complete, need to plan production integration

Plans:
- [x] 02-SPIKE: Drawing engine validation (COMPLETE)
- [ ] 02-01: Production integration (to be created)

---

### Phase 3: Confidence Gate & Auto-Commit

**Goal**: Tie location confidence to drawing success and decide whether to auto-commit or trigger human handoff.

**Depends on**: Phase 2 (requires drawing engine and location confidence from Phase 1)

**Requirements**:
- Confidence threshold for auto-commit vs human handoff
- Integration with existing fillPage2Full() flow

**Success Criteria** (what must be TRUE):
1. When location confidence ≥ 0.80 and drawing succeeds, system automatically saves and closes the map popup
2. When location confidence < 0.80 or drawing fails, system triggers handoff workflow with captured context
3. Handoff context includes location signals, confidence breakdown, drawing result, and reference PDF path
4. Existing permit creation flow continues seamlessly after successful auto-commit

**Plans**: TBD

Plans:
- [ ] 03-01: TBD (to be created via /gsd:plan-phase 3)

---

### Phase 4: Human Handoff Dashboard

**Goal**: Provide graceful degradation with a dashboard showing reference materials and AI hints for manual drawing completion.

**Depends on**: Phase 3 (triggered by confidence gate)

**Requirements**:
- Fallback dashboard with VNC + reference overlay + AI hints

**Success Criteria** (what must be TRUE):
1. When handoff is triggered, dashboard displays the live browser session (VNC or screenshot-based viewer)
2. Reference grading plan PDF is shown side-by-side with the map for visual comparison
3. AI hints display the suggested location, confidence score breakdown, and identified signals
4. Human can complete the drawing manually using the ESRI tools with full context available
5. After manual drawing, workflow continues to permit submission

**Plans**: TBD

Plans:
- [ ] 04-01: TBD (to be created via /gsd:plan-phase 4)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Location Pipeline & Coordinate Foundation | 0/3 | In progress | - |
| 2. Drawing Engine | 1/2 | **Spike COMPLETE** | 2026-01-26 |
| 3. Confidence Gate & Auto-Commit | 0/? | Not started | - |
| 4. Human Handoff Dashboard | 0/? | Not started | - |

**Active Exploration:** SWPPP shape extraction (AI vision from site plan images)
