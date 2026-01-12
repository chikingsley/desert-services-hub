# Desert Services Hub - Design Document

> Last updated: 2025-12-21
> Status: Architecture Decided - Ready for Implementation

---

## Overview

This document captures design decisions, open questions, and planned features for the Desert Services platform. The vision extends beyond quoting to encompass the full estimation workflow.

---

## Vision: The Full Workflow

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        DESERT SERVICES HUB                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. TAKEOFF (PDF Markup)                                             │
│     ├── Import plan PDF                                              │
│     ├── Set/verify scale (AI-assisted in future)                     │
│     ├── Click buttons: Inlets, Fencing, Silt Fence, etc.            │
│     ├── Draw/measure on PDF                                          │
│     └── Auto-populate quote ─────────────────┐                       │
│                                              ▼                       │
│  2. QUOTING ◄─────────────────────────────────                       │
│     ├── Create/edit estimates                                        │
│     ├── Version control                                              │
│     ├── Send to contractors                                          │
│     └── Track status ───────────────────────┐                        │
│                                              ▼                       │
│  3. CONTRACT RECONCILIATION                                          │
│     ├── Match estimate to contract                                   │
│     ├── Verify totals                                                │
│     ├── Check schedule of values                                     │
│     ├── Flag scope ambiguities                                       │
│     └── Reconciled ─────────────────────────┐                        │
│                                              ▼                       │
│  4. PROJECT INITIATION                                               │
│     ├── Collect contractor info                                      │
│     ├── Pre-project checklist                                        │
│     └── Handoff to ops                                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Current State

- Estimator uses Monday.com for task tracking
- Uses BlueBeam for material takeoffs (counting, measuring PDFs)
- Manual entry into quoting tool
- Contract reconciliation done manually/with AI assistance

### Goal

- Replace Monday.com dependency
- Build focused takeoff tool (not full BlueBeam clone)
- Streamline quote → contract → project flow

---

## 1. Data Model

### Core Entities

```text
Quote
├── id
├── base_number (e.g., "251217")
├── job_name
├── job_address
├── created_at
│
├── Versions[]
│   ├── version_number (1, 2, 3...)
│   ├── line_items[] (snapshot)
│   ├── sections[]
│   ├── total
│   ├── created_at
│   └── change_summary (optional, for v2+)
│
└── Sends[]
    ├── estimate_number (e.g., "25121701" or "25121701-R2")
    ├── version_id (which version was sent)
    ├── recipient_company
    ├── recipient_email
    ├── sent_at
    └── status (draft | sent | viewed | accepted | declined | superseded)
```

### Key Concepts

| Concept | Description | Estimate # |
|---------|-------------|------------|
| **Quote** | The base document for a job | Base number (251217) |
| **Version** | Iteration of line items/scope | Same base, revision suffix (-R2) |
| **Send** | Delivery to a recipient | Full number with recipient sequence |
| **Duplicate** | Copy for different project | New base number |

### Behaviors

- **Draft Mode**: Auto-saves, overwrites current version
- **After First Send**: Quote is "locked" - must create revision to edit
- **Create Revision**: Locks current version, creates v(n+1), unlocks for editing
- **Send to New Recipient**: Same version → different person → new send record

### Takeoff Data Model

```text
Takeoff
├── id
├── name (e.g., "Site Grading Plan - Sheet C3.1")
├── pdf_url (SharePoint or R2 URL)
├── created_at
├── updated_at
│
├── Pages[]
│   ├── page_number (1, 2, 3...)
│   ├── scale (pixels_per_foot, set via calibration)
│   └── annotations_json (Konva stage serialized)
│
├── Measurements[]
│   ├── id
│   ├── page_id
│   ├── type (count | linear | area)
│   ├── item_type (e.g., "inlet", "silt_fence", "grading")
│   ├── color (for legend)
│   ├── points[] (raw coordinates from Konva)
│   ├── quantity (calculated: count, linear feet, sq ft)
│   └── notes
│
└── quote_id (FK, optional - linked quote)
```

### Linking Takeoff → Quote

```text
Takeoff.Measurements[]
    │
    ▼ "Export to Quote"
Quote.LineItems[]
    ├── catalog_item_id (matched by item_type)
    ├── quantity (from measurement)
    ├── unit_price (from catalog)
    └── total
```

**Flow**: Takeoff measurements have an `item_type` (e.g., "inlet"). When exporting, match to catalog items, create line items with calculated quantities.

---

## 2. User Flows

### Creating a Quote

```text
[+ New Quote]
    └─ Blank
    └─ From Template:
        ├─ Traffic Control Standard
        ├─ Full Service
        ├─ Dust Permit Only
        └─ [Custom templates TBD]
```

**Decision**: "New" creates a blank quote. Templates are a power-user feature.

### Editing a Quote

1. Open from list (draft or locked)
2. If locked → read-only view with "Create Revision" option
3. If draft → edit directly, auto-saves
4. Add/remove line items, sections
5. Save → ready to send

### Sending a Quote

1. Click "Send" or "Send to Recipient"
2. Select/add recipient(s)
3. Choose: Email directly or Download PDF
4. Send → records send, locks version
5. Recipient status tracked (sent → viewed → accepted/declined)

### Revising a Quote

1. Open existing quote (any version)
2. Click "Create Revision"
3. v(n+1) created, unlocks for editing
4. Make changes
5. Send to same or new recipients

### Sending to Additional Recipients

1. Open existing quote
2. Click "Send to New Recipient"
3. Add recipient details
4. Sends current version to new person
5. New send record created with own status

---

## 3. UI Architecture

### Current: Tabs Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ [Quotes] [New] [Settings]              [Theme Toggle]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     Content Area                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Proposed: Toolbar + Collapsible Preview

```text
┌─────────────────────────────────────────────────────────────┐
│ Logo  [Quotes] [+ New ▾]  │  Save Status  │  [Preview] [DL] │ ← Toolbar
├─────────────────────────────────────────────────────────────┤
│                           │                                 │
│      Editor Panel         │      PDF Preview (collapsible)  │
│                           │                                 │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar Navigation (Decided)

**Sidebar contents:**

- - New Quote / + New Takeoff
- Quotes list
- Takeoffs list
- Contracts (future)
- Projects (future)
- Search
- Settings

**Decision**: With the full Hub vision (Takeoff, Quoting, Contracts, Projects), sidebar is justified. See Appendix E for layout.

---

## 4. Feature Requests & TODOs

### High Priority

- [ ] **Subtotal per section** - Show subtotal before each section in editor and PDF
- [ ] **Collapsible PDF preview** - Toggle button to show/hide preview panel
- [ ] **Version history view** - Dropdown to view previous versions (read-only)
- [ ] **Recipients panel in editor** - Show who quote has been sent to, with status

### Medium Priority

- [ ] **Quote templates** - 3-4 pre-configured templates (Traffic Control, Full Service, etc.)
- [ ] **Send to multiple recipients** - Checkbox selection when sending
- [ ] **Email follow-up automation** - Settings for automated follow-up emails
- [ ] **Duplicate quote** - Copy content to new quote number

### Lower Priority / Future

- [ ] **Ask AI** - Natural language quote creation
- [ ] **Reporting** - Win rate, outstanding quotes, revenue pipeline
- [ ] **Revision diff view** - Compare versions side by side

---

## 5. UI Components

### EditorToolbar Pattern

Reference: `/services/quoting/EditorToolbar.tsx`

Features:

- Undo/Redo buttons
- Save status with relative time ("Saved just now", "Saved 5m ago")
- Action buttons (Export, Preview)

### Sidebar Pattern (if adopted)

Reference: `/services/quoting/src/components/ui/sidebar.tsx`

Features:

- Collapsible (icon mode on desktop, sheet on mobile)
- Keyboard shortcut (Cmd+B)
- Groups with labels
- Menu items with badges

---

## 6. PDF Output

### Current Layout

- Header: Logo, estimator info, Bill To, Job Info
- Body: Line items table with sections
- Footer: Pricing disclaimer, signature line, company info

### Requested Changes

- [ ] Add subtotal row before each section header
- [ ] Strikethrough styling for excluded items (DONE)

---

## 7. Open Questions

### Resolved

1. ~~**Sidebar vs Tabs**~~: With full Hub vision (Takeoff, Quoting, Contracts, Projects), sidebar is justified
2. ~~**Recipients panel placement**~~: In editor panel, not sidebar
3. ~~**Takeoff technology**~~: react-konva overlay + JSON in DB, PDF stays in SharePoint untouched

### Also Resolved

1. ~~**Template management**~~: Users can create/edit their own templates. Templates tab in settings. "New" button has dropdown: "New" or "New from Template" (with template picker)
2. ~~**Email integration**~~: Use `mailto:` pattern - opens user's email client with everything pre-filled (recipient, subject, body, attachment). User reviews and sends. Similar to QuickBooks.
3. ~~**Multi-company support**~~: No - internal tool for single company (Desert Services). One user = one company.

---

## 8. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-21 | Quote → Version → Send data model | Separates content from delivery, enables multi-recipient |
| 2025-12-21 | "New" creates blank quote | Templates are power-user feature, not default |
| 2025-12-21 | Recipients panel in editor | Not sidebar - needs to be visible during quote creation |
| 2025-12-21 | PDF preview should be collapsible | Power users don't need to see it every time |
| 2025-12-21 | Add subtotals per section | Estimator request |
| 2025-12-21 | Sidebar justified for Hub | Multiple modules (Takeoff, Quotes, Contracts, Projects) warrant sidebar nav |
| 2025-12-21 | react-konva for Takeoff | De facto React canvas library, JSON serialization, no fake geo coordinates |
| 2025-12-21 | Overlay approach (non-destructive) | Annotations in DB, PDF untouched in SharePoint, fully editable |
| 2025-12-21 | User-managed templates | Templates tab in settings, "New from Template" dropdown option |
| 2025-12-21 | mailto: for email | Opens user's email client pre-filled, user reviews and sends (like QuickBooks) |
| 2025-12-21 | Single company only | Internal tool for Desert Services, no multi-company support needed |

---

## 9. Implementation Phases

### Phase 1: Core Workflow (Current)

- Quote creation and editing
- PDF generation
- Basic save/load

### Phase 2: Versioning & Sends

- Version history
- Send tracking
- Recipient management
- Status updates

### Phase 3: Templates & Automation

- Quote templates
- Email integration
- Follow-up automation

### Phase 4: Reporting & Analytics

- Quote metrics
- Win/loss tracking
- Revenue pipeline

---

## Appendix A: Estimator Templates

The current estimator uses 3-4 standard templates. Need to document:

1. **Template Name**: ___
   - Sections included: ___
   - Default items: ___

2. **Template Name**: ___
   - Sections included: ___
   - Default items: ___

3. **Template Name**: ___
   - Sections included: ___
   - Default items: ___

To be filled in after discussion with estimator.

---

## Appendix B: Takeoff Module (Future)

### What It Does

A focused PDF markup tool for material takeoffs, NOT a full BlueBeam clone. Handles the specific items Desert Services needs to measure.

### Core Features

1. **PDF Import & Scale**
   - Upload plan PDF
   - Set scale (1" = X feet)
   - AI-assisted scale detection (future)

2. **Item Buttons**
   - Inlets (count)
   - Fencing (linear measure)
   - Silt Fence (linear measure)
   - Rumble Grates (count)
   - Grading areas (area measure)
   - Custom items

3. **Measurement Tools**
   - Point (count)
   - Line (length)
   - Polygon (area + perimeter)
   - Polyline (total length)

4. **Quote Integration**
   - Measurements auto-populate line items
   - Connected to catalog with unit pricing
   - One-click "Add to Quote"

### Technical Research

#### Open Source PDF Libraries

- **pdfAnnotate** (GitHub) - Basic annotations, no measurement
- **pdfannotate.js** - Drawing/shapes, scale support, no measurement UI
- **PDF.js** - Core rendering, would need custom measurement layer

#### Commercial Options (with measurement)

- **PDF.js Express** - Measurement tools, ~$1k/yr
- **Nutrient (PSPDFKit)** - Full measurement suite, enterprise pricing
- **Apryse WebViewer** - Construction-focused, enterprise pricing

#### Existing Takeoff Software

- **EasyPDFTakeoff** - Windows app, affordable, not web-based
- **Methvin** - Free tier, web-based, could study their UX
- **PlanSwift** - Industry standard, expensive

### Build vs Buy Decision

| Approach | Pros | Cons |
|----------|------|------|
| **Build custom** | Exactly what we need, integrated | Development time, edge cases |
| **Embed commercial** | Fast, proven | Cost, less control |
| **Hybrid** | Use PDF.js + custom measurement | Medium complexity |

### Recommended Approach

Start with **hybrid**:

1. Use PDF.js for rendering
2. Build custom measurement layer for our specific items
3. Focus on the 5-6 things we actually measure, not general purpose

### MVP Feature Set

- [ ] PDF upload + display
- [ ] Scale calibration (draw known distance)
- [ ] Count tool (click = +1)
- [ ] Line tool (click-click = length)
- [ ] Polygon tool (area + perimeter)
- [ ] Save markups
- [ ] Export measurements to quote

### Custom Measurement Layer - Deep Dive

#### The Two Main Options for React

| Library | React Support | Serialization | Best For |
|---------|---------------|---------------|----------|
| **react-konva** | Native (first-class) | `stage.toJSON()` / `Stage.create()` | React projects, performance, animations |
| **Fabric.js** | Wrapper needed | `canvas.toJSON()` / `loadFromJSON()` | Rich object model, SVG export |

**Recommendation: react-konva** - It's the de facto standard for canvas graphics in React. Declarative, reactive bindings that feel native to React development.

#### Architecture Pattern

```text
┌─────────────────────────────────────────────────────────┐
│                    Container (absolute positioning)     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐│
│  │  PDF Canvas (react-pdf-viewer or react-pdf)        ││
│  │  - Renders PDF pages                                ││
│  │  - Handles zoom/pan                                 ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │  Konva Stage (overlay, pointer-events: auto)       ││
│  │  - Shapes, lines, polygons                          ││
│  │  - Click handlers for measurements                  ││
│  │  - Draggable/editable objects                       ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

#### How It Works

1. **PDF Rendering**: Use `react-pdf-viewer` or `react-pdf` to render PDF to canvas
2. **Overlay Layer**: Position a `<Stage>` from react-konva absolutely on top
3. **Scale Tracking**: Store scale factor (pixels per real unit) after calibration
4. **Drawing**: Konva shapes (Line, Rect, Circle) drawn with mouse events
5. **Measurement**: Convert pixel dimensions using scale factor
6. **Save**: `stage.toJSON()` serializes all shapes to JSON string
7. **Load**: `Stage.create()` or iterate shapes to restore from JSON

#### Code Example: Basic Setup

```tsx
import { Stage, Layer, Line, Circle, Text } from 'react-konva';
import { Viewer } from '@react-pdf-viewer/core';

function TakeoffViewer({ pdfUrl }: { pdfUrl: string }) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [scale, setScale] = useState<number | null>(null); // px per foot

  return (
    <div className="relative w-full h-full">
      {/* PDF Layer */}
      <Viewer fileUrl={pdfUrl} />

      {/* Measurement Overlay */}
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        className="absolute inset-0 pointer-events-auto"
      >
        <Layer>
          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              scale={scale}
              draggable
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
```

#### Saving Annotations

Annotations save **separately** from the PDF (not embedded):

```tsx
// Save to database
const saveMarkups = async (quoteId: string, stage: Konva.Stage) => {
  const json = stage.toJSON(); // All shapes serialized
  await db.markups.upsert({ quoteId, data: json });
};

// Load from database
const loadMarkups = async (quoteId: string, stage: Konva.Stage) => {
  const { data } = await db.markups.get(quoteId);
  if (data) {
    // Recreate shapes from JSON
    const parsed = JSON.parse(data);
    // Apply to stage...
  }
};
```

#### Key Questions Answered

**Q: How does UI render on top of PDF?**
A: CSS absolute positioning. PDF canvas is the base layer, Konva stage overlays with `position: absolute; inset: 0;`

**Q: How does save work?**
A: Konva shapes serialize to JSON via `toJSON()`. Save JSON to database keyed by quote/page. PDF itself is not modified.

**Q: Is it adjustable later?**
A: Yes - Konva shapes are objects with `draggable`, selectable, editable properties. User can move, resize, delete shapes after placing.

**Q: How to connect to scale tool?**
A: User draws a known distance (e.g., 100 ft line on plan). Calculate `pixelsPerFoot = lineLength / 100`. Store in state. All subsequent measurements use this factor.

**Q: How to connect to quoting?**
A: Each measurement shape has metadata (type, quantity). Export button iterates shapes, matches to catalog items by type, creates line items with calculated quantities.

#### Libraries Summary

| Need | Library | Install |
|------|---------|---------|
| PDF Viewing | `react-pdf-viewer` | `npm i @react-pdf-viewer/core` |
| Canvas Overlay | `react-konva` | `npm i react-konva konva` |
| PDF Upload/Store | Your backend | - |
| Annotations Store | SQLite/Postgres JSON column | - |

#### Existing Reference: PDFJsAnnotations

There's an existing library [PDFJsAnnotations](https://github.com/RavishaHesh/PDFJsAnnotations) that does PDF.js + Fabric.js integration. It doesn't have measurement, but the architecture is useful reference:

- Fabric canvas overlaid on each PDF page
- `serializePdf()` returns JSON of all annotations
- `loadFromJSON()` restores for editing

We'd follow similar pattern but with react-konva and custom measurement tools.

### Drawing Patterns (Click-Click-Click)

#### The Standard Pattern

This is the same pattern used by ESRI, Leaflet, BlueBeam, etc:

| Action | Result |
|--------|--------|
| Click | Add point to current shape |
| Mouse move | Preview line from last point to cursor |
| Double-click | Finish shape (close polygon or end polyline) |
| Click first point | Alternative way to close polygon |
| ESC | Cancel current drawing |

#### Polygon Drawing Code Pattern

```tsx
const [points, setPoints] = useState<number[][]>([]);  // [[x,y], [x,y], ...]
const [isComplete, setIsComplete] = useState(false);
const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

// Click to add point
const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
  if (isComplete) return;
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;

  // Check if clicking first point to close
  if (points.length >= 3 && isNearFirstPoint(pos, points[0])) {
    setIsComplete(true);
    return;
  }

  setPoints([...points, [pos.x, pos.y]]);
};

// Double-click to finish
const handleDblClick = () => {
  if (points.length >= 3) {
    setIsComplete(true);
  }
};

// Mouse move for preview line
const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
  const pos = e.target.getStage()?.getPointerPosition();
  if (pos) setMousePos(pos);
};

// Render
<Stage onClick={handleStageClick} onDblClick={handleDblClick} onMouseMove={handleMouseMove}>
  <Layer>
    {/* The polygon */}
    <Line
      points={flattenPoints(points)}
      stroke="#00ff00"
      strokeWidth={2}
      closed={isComplete}
      fill={isComplete ? "rgba(0,255,0,0.2)" : undefined}
    />

    {/* Preview line to cursor */}
    {!isComplete && points.length > 0 && (
      <Line
        points={[...points[points.length-1], mousePos.x, mousePos.y]}
        stroke="#00ff00"
        strokeWidth={1}
        dash={[5, 5]}
      />
    )}

    {/* Vertex circles (draggable for editing) */}
    {points.map((point, i) => (
      <Circle
        key={i}
        x={point[0]}
        y={point[1]}
        radius={i === 0 && points.length >= 3 ? 8 : 5}  // First point bigger
        fill={i === 0 ? "#ff0000" : "#00ff00"}
        draggable={isComplete}
        onDragMove={(e) => handleVertexDrag(i, e)}
      />
    ))}
  </Layer>
</Stage>
```

#### Count Tool (Drop Markers)

Simpler than polygon - just click to add:

```tsx
const [markers, setMarkers] = useState<Marker[]>([]);

const handleClick = (e: KonvaEventObject<MouseEvent>) => {
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;

  setMarkers([...markers, {
    id: crypto.randomUUID(),
    x: pos.x,
    y: pos.y,
    count: markers.length + 1,  // Auto-increment
    type: activeItemType,        // "inlet", "manhole", etc.
  }]);
};

// Render markers with count labels
{markers.map((m) => (
  <Group key={m.id} x={m.x} y={m.y} draggable>
    <Circle radius={12} fill={getColorForType(m.type)} />
    <Text text={String(m.count)} fill="#fff" align="center" />
  </Group>
))}
```

#### Linear Measurement (Two-Point Line)

```tsx
// Click once: set start point
// Click twice: set end point, calculate length

const handleClick = (pos) => {
  if (!startPoint) {
    setStartPoint(pos);
  } else {
    const pixelLength = distance(startPoint, pos);
    const realLength = pixelLength / scale;  // Convert using calibrated scale

    addMeasurement({
      type: 'linear',
      points: [startPoint, pos],
      quantity: realLength,  // in feet
    });

    setStartPoint(null);  // Reset for next
  }
};
```

#### Legend Auto-Population

The legend is just a summary of measurements grouped by type:

```tsx
const legend = useMemo(() => {
  const grouped = groupBy(measurements, 'item_type');
  return Object.entries(grouped).map(([type, items]) => ({
    type,
    color: items[0].color,
    count: items.filter(i => i.type === 'count').length,
    linearFt: sum(items.filter(i => i.type === 'linear').map(i => i.quantity)),
    sqFt: sum(items.filter(i => i.type === 'area').map(i => i.quantity)),
  }));
}, [measurements]);

// Render legend panel
<div className="legend">
  {legend.map(item => (
    <div key={item.type} className="flex items-center gap-2">
      <div className="w-4 h-4 rounded" style={{ background: item.color }} />
      <span>{item.type}</span>
      <span>{item.count > 0 ? `${item.count} ea` : ''}</span>
      <span>{item.linearFt > 0 ? `${item.linearFt.toFixed(0)} LF` : ''}</span>
      <span>{item.sqFt > 0 ? `${item.sqFt.toFixed(0)} SF` : ''}</span>
    </div>
  ))}
</div>
```

### Map Libraries vs Canvas Libraries

| Aspect | Map Libraries (Leaflet, ESRI) | Canvas Libraries (Konva) |
|--------|-------------------------------|---------------------------|
| Coordinates | Lat/lng, geographic | Pixels, screen-based |
| Scale | Built-in (zoom = scale) | Must track manually |
| Drawing pattern | Same click-click-dblclick | Same click-click-dblclick |
| Undo/Redo | Usually included | Build yourself |
| Save format | GeoJSON | Custom JSON |

**Key insight**: The interaction pattern is identical. The difference is map libs assume geographic coordinates and have built-in scale. For PDF takeoff, we use pixel coordinates and calibrate scale ourselves.

---

## Appendix C: Contract Reconciliation (Future)

### The Problem

After a quote is accepted, the contract comes back. Need to verify:

- Totals match
- Schedule of values aligns
- Scope is properly defined (not ambiguous)
- Nothing added/removed without notice

### Reconciliation Checklist

1. **Total Verification**
   - [ ] Contract total matches estimate total
   - [ ] If different, variance explained

2. **Schedule of Values**
   - [ ] Line items match estimate
   - [ ] Quantities match
   - [ ] Unit prices match
   - [ ] If lump sum, scope language is clear

3. **Scope Language Check**
   - [ ] Not open-ended ("per plan" is OK, "as needed" is not)
   - [ ] Specific items called out
   - [ ] Exclusions documented

4. **Change Detection**
   - [ ] Nothing in contract that wasn't in estimate
   - [ ] Nothing removed without acknowledgment
   - [ ] Any changes clarified in writing

5. **Red Flags**
   - [ ] Ambiguous scope language
   - [ ] Missing items
   - [ ] Unusual terms
   - [ ] Payment terms different from standard

### Workflow

```text
Estimate Accepted
      │
      ▼
Contract Received (PDF upload)
      │
      ▼
AI-Assisted Comparison
├── Extract contract line items
├── Match to estimate
├── Flag discrepancies
└── Generate report
      │
      ▼
Manual Review
├── Verify AI findings
├── Check scope language
└── Note clarifications needed
      │
      ▼
Reconciliation Complete
├── Status: Reconciled / Issues Found
├── Notes attached
└── Ready for project initiation
```

### Technical Approach

- PDF text extraction (pdf.js or cloud API)
- AI comparison (Claude API)
- Structured output for checklist
- Human-in-the-loop verification

### Data Model Addition

```text
ContractReconciliation
├── id
├── quote_id (FK)
├── contract_pdf_url
├── status (pending | in_review | reconciled | issues_found)
├── ai_analysis (JSON)
├── manual_notes
├── checklist_items[]
│   ├── item
│   ├── status (pass | fail | na)
│   └── notes
└── reconciled_at
```

---

## Appendix D: Project Initiation (Future)

### Purpose

After contract is reconciled, collect information needed to start the project.

### Information to Collect

**From Contractor:**

- [ ] Site contact name/phone
- [ ] Access requirements
- [ ] Start date
- [ ] Project duration
- [ ] Special requirements
- [ ] Safety requirements

**Internal Prep:**

- [ ] Equipment reserved
- [ ] Materials ordered
- [ ] Crew assigned
- [ ] Permits pulled

### Integration with Ops

- Handoff document generated
- Notification to operations team
- Calendar/scheduling integration (future)

---

## Appendix E: Sidebar Navigation (If Adopted)

With the full Hub vision, sidebar becomes justified:

```text
┌─────────────────────┐
│ 🏜️ Desert Services │
├─────────────────────┤
│ + New Quote         │
│ + New Takeoff       │
├─────────────────────┤
│ 📋 Quotes           │
│ 📐 Takeoffs         │
│ 📄 Contracts        │
│ 🚧 Projects         │
├─────────────────────┤
│ 🔍 Search           │
│ 🤖 Ask AI           │
├─────────────────────┤
│ ⚙️ Settings         │
│ 👤 Profile          │
└─────────────────────┘
```

This makes sense when there are multiple distinct modules to navigate between.
