# Storage Layer & Performance Optimizations

This document outlines planned improvements for PDF storage, caching, and performance.

---

## Current State

### PDF Storage (Now)

```text
User uploads PDF → stored as base64 in memory (takeoff-store.ts)
                 → lost on page refresh for unsaved takeoffs
                 → pdf_url column exists in SQLite but unused
```css

### Takeoff ↔ Quote Relationship (Now)

```text
Takeoffs table ←──FK──→ Quotes table (takeoff_id)
                        (implemented, quotes link back to takeoffs)
```css

### What's Missing

- Persistent PDF storage (MinIO AIStor)
- PDF compression on upload
- Thumbnail caching for annotation previews
- Mouse event throttling for drawing tools

---

## 1. MinIO AIStor Storage Layer

> **Important**: We use MinIO AIStor (commercial/enterprise), NOT the open-source MinIO.
> Open-source MinIO is now maintenance-only with limited features.
> AIStor requires a license key from <https://subnet.min.io>

### Why AIStor (Not Open-Source)

| Feature | Open-Source | AIStor |
|---------|-------------|--------|
| Web Admin UI | Removed (CLI only) | Full UI |
| Active Development | Maintenance only | Active |
| Docker Images | Build yourself | Official images |
| Catalog (metadata search) | No | Yes (GraphQL) |
| Cache (DRAM) | No | Yes |
| Key Management | No | Yes |
| AIHub (model storage) | No | Yes |
| promptObject API | No | Yes |

### Architecture

```text
┌─────────────────┐     ┌──────────────────────┐
│   Next.js App   │     │   MinIO AIStor       │
│                 │     │   (Docker/Licensed)  │
│  SQLite DB      │     │                      │
│  - takeoffs     │────▶│  /takeoffs/          │
│  - quotes       │     │    {id}/original.pdf │
│  - pdf_url ─────┼────▶│    {id}/optimized.pdf│
│                 │     │    {id}/thumb.png    │
└─────────────────┘     └──────────────────────┘
```css

### Object Metadata (Tags)

Each PDF in MinIO can have tags:

- `takeoff_id`: UUID linking to SQLite
- `original_size`: bytes before compression
- `optimized_size`: bytes after compression
- `page_count`: number of pages
- `has_text`: whether OCR/text extraction done

### Flow: Upload PDF

```text
1. User selects PDF file
2. Upload to MinIO: PUT /takeoffs/{id}/original.pdf
3. Background job:
   a. Compress with pdf-lib → /takeoffs/{id}/optimized.pdf
   b. Generate thumbnail → /takeoffs/{id}/thumb.png
   c. Extract text (optional) → store in SQLite
4. Update SQLite: pdf_url = "minio://takeoffs/{id}/optimized.pdf"
5. Show PDF in viewer (stream from MinIO or use optimized)
```css

### Flow: View Takeoff

```text
1. Fetch takeoff from SQLite (includes pdf_url)
2. Stream PDF from MinIO via signed URL or proxy
3. Render with pdfjs-dist
```css

### Implementation Tasks

- [ ] Set up MinIO AIStor Docker container
- [ ] Create MinIO client utility (`lib/minio.ts`)
- [ ] Create upload API route (`/api/upload/pdf`)
- [ ] Update takeoff creation to upload to MinIO
- [ ] Update takeoff viewer to fetch from MinIO
- [ ] Add background compression job

---

## 2. PDF Compression (pdf-lib)

We already have `pdf-lib` installed. It can:

- Remove unused objects
- Flatten form fields
- Remove metadata (creator, timestamps)
- Compress object streams

### Limitations

- Cannot recompress images (that's Ghostscript territory)
- For vector-heavy construction drawings, cleanup helps

### Implementation

```typescript
// lib/pdf-compression.ts
import { PDFDocument } from 'pdf-lib';

export async function compressPdf(inputBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(inputBuffer);

  // Remove metadata
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setCreator('');
  pdfDoc.setProducer('');

  // Save with object streams (reduces size)
  const compressed = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  return Buffer.from(compressed);
}
```css

### Tasks

- [ ] Create compression utility
- [ ] Integrate into upload flow
- [ ] Store both original and compressed versions
- [ ] Track compression ratio in metadata

---

## 3. Screenshot/Thumbnail Caching

### What `screenshot.ts` Does

Captures a PNG image of a small area of the PDF canvas. Used for:

- Annotation thumbnails in sidebar
- Export reports showing what was measured
- Preview cards

### Current Behavior

- Creates new canvas element every call (line 10: `// @TODO: cache this?`)
- Regenerates image each time component renders

### Caching Strategy

#### Option A: Memory Cache (LRU)

```typescript
const cache = new Map<string, string>(); // key → base64 PNG

function getCachedScreenshot(key: string, position: LTWH, ...): string {
  if (cache.has(key)) return cache.get(key)!;
  const image = screenshot(position, pageNumber, viewer);
  cache.set(key, image);
  return image;
}
```css

- Fast, session-only
- Auto-clears on page refresh
- Good for: during editing session

#### Option B: IndexedDB

```typescript
// Store thumbnails in browser's IndexedDB
// Persists across sessions until explicitly cleared
```css

- Survives refresh
- Need cleanup strategy (delete when takeoff deleted)

#### Option C: Server-Side (MinIO)

```text
Store thumbnails in MinIO alongside PDF:
  /takeoffs/{id}/annotations/{annotation_id}.png
```css

- Permanent storage
- Useful for reports, sharing

### Recommended Approach

1. Use **Memory LRU cache** for editing session (immediate)
2. Save to **MinIO** when takeoff is saved (permanent)

### Tasks

- [ ] Add LRU cache to screenshot function
- [ ] Cache key = `${takeoffId}-${annotationId}-${position hash}`
- [ ] Clear cache when annotation deleted
- [ ] Optional: persist to MinIO on save

---

## 4. Mouse Event Throttling

### Current Issue

Drawing polylines/polygons fires `onMouseMove` ~60 times/second, each triggering React state update.

### Files Affected

- `lib/pdf-takeoff/components/mouse-monitor.tsx` (line 70: `// TODO: Maybe optimise or throttle?`)
- `lib/pdf-takeoff/components/polyline-canvas.tsx`
- `lib/pdf-takeoff/components/polygon-canvas.tsx`
- `lib/pdf-takeoff/components/drawing-canvas.tsx`

### Solution

```typescript
import throttle from 'lodash.throttle';

// Throttle to 60fps (16ms) - still looks smooth, reduces wasted renders
const handleMouseMove = throttle((e: MouseEvent) => {
  setCursorPosition({ x: e.clientX, y: e.clientY });
}, 16);
```css

### Other Optimizations

- `requestAnimationFrame` for canvas drawing
- `useMemo` for expensive calculations
- `React.memo` for components that don't need re-render

### Tasks

- [ ] Add throttle to mouse-monitor.tsx
- [ ] Add throttle to canvas components
- [ ] Profile before/after with React DevTools
- [ ] Consider requestAnimationFrame for SVG updates

---

## 5. Takeoff ↔ Quote Navigation

### Current Flow

```text
Takeoff Editor → "Create Quote" button
  → Stores data in sessionStorage
  → Navigates to /quotes/new?from=takeoff
  → Creates quote with takeoff_id FK
```css

### Improved Flow (Bidirectional)

#### From Takeoff → Quote

```text
Takeoff Editor
  ├── "Create Quote" → /quotes/new?from=takeoff (existing)
  └── "View Linked Quote" → /quotes/{quoteId} (if exists)
```css

#### From Quote → Takeoff

```text
Quote Editor
  ├── Shows "Source: [Takeoff Name]" if takeoff_id exists
  ├── "View Takeoff" → /takeoffs/{takeoffId}
  └── "Update from Takeoff" → re-sync measurements
```css

### UI Changes Needed

- Quote editor: show takeoff badge/link if `takeoff_id` present
- Takeoff editor: show "Linked to Quote X" if quote exists with this takeoff_id
- Add query: "SELECT id FROM quotes WHERE takeoff_id = ?"

### Tasks

- [ ] Add API: GET /api/takeoffs/{id}/quote (find linked quote)
- [ ] Add API: GET /api/quotes/{id}/takeoff (get takeoff details)
- [ ] Update Quote Editor to show takeoff link
- [ ] Update Takeoff Editor to show quote link
- [ ] Add "Update Quote from Takeoff" action

---

## Priority Order

1. **MinIO Storage Layer** - PDFs currently lost on refresh
2. **Takeoff ↔ Quote Navigation** - Complete the bidirectional flow
3. **PDF Compression** - Quick win with pdf-lib
4. **Mouse Throttling** - Only if performance issues observed
5. **Screenshot Caching** - Only if sidebar previews are slow

---

## Docker Setup (MinIO AIStor)

```yaml
# docker-compose.yml (see project root for full version)
services:
  aistor:
    image: quay.io/minio/aistor/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"  # S3 API
      - "9001:9001"  # Web Console
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_LICENSE_KEY: ${MINIO_LICENSE_KEY}  # Required!
    volumes:
      - aistor_data:/data

volumes:
  aistor_data:
```text

```bash
# 1. Get license key from https://subnet.min.io/health?download-license
# 2. Add to .env: MINIO_LICENSE_KEY=your-key

# Start AIStor
docker compose up -d aistor

# Create buckets
docker compose up aistor-setup

# Access console at http://localhost:9001
# S3 API at http://localhost:9000
```css

---

## Environment Variables

```env
# .env.local
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=desert-services
MINIO_USE_SSL=false
```
