# Phase 1: Pipeline Foundation - Research

**Researched:** 2026-01-23
**Domain:** File watching, event-driven pipelines, deduplication
**Confidence:** HIGH

## Summary

Phase 1 requires a file watcher that detects new PDFs in a folder and triggers a processing pipeline, with deduplication to prevent reprocessing. The standard approach for Bun is to use the native `fs.watch` API for simple cases, or chokidar for production reliability. Given known issues with Bun's recursive fs.watch (dynamic expansion bugs, filename truncation on Linux), chokidar is the safer choice for a production pipeline even though it adds a dependency.

For deduplication, the project already uses SQLite (`lib/db/index.ts`) with the `bun:sqlite` driver. Tracking processed files by filename in a new table is the simplest reliable approach. Content hashing via `Bun.CryptoHasher` with SHA-256 is available if needed later but is overkill for the stated requirement of "same filename not reprocessed."

**Primary recommendation:** Use chokidar v5 for file watching (ESM-only, Node 20+), track processed filenames in SQLite, and use async/await event handlers that call the downstream pipeline.

## Standard Stack

The established libraries/tools for this domain:

### Core

- **chokidar** (v5.x): Cross-platform file watcher with reliability features (atomic write handling, ready event, recursive watching). ESM-only in v5, requires Node 20+. Used by ~30 million repositories.
- **bun:sqlite**: Already in use (`lib/db/index.ts`). Use for processed file tracking.

### Supporting

- **Bun.CryptoHasher**: Built-in SHA-256 for content hashing if needed. Use only if content-based deduplication required (v2).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chokidar | `fs.watch` (native) | Simpler, no dependency, but has known bugs in Bun with recursive mode and doesn't dynamically expand to new subdirectories |
| SQLite filename tracking | In-memory Set | Faster but lost on restart; SQLite survives process restarts |
| SHA-256 content hash | Filename only | More robust dedup but overkill for v1 requirement |

**Installation:**

```bash
bun add chokidar
```css
```

services/
  contract/
    pipeline/
      watcher.ts       # File watcher setup and event handling
      dedup.ts         # Processed file tracking (SQLite)
      types.ts         # Pipeline event types
      index.ts         # Main entrypoint (start/stop watcher)

```csv
```typescript
// Source: https://bun.com/docs/guides/read-file/watch + chokidar README
import chokidar from "chokidar";
import { db } from "@/lib/db";

const WATCH_DIR = process.env.CONTRACT_WATCH_DIR ?? "./contracts";
let watcher: chokidar.FSWatcher | null = null;

export async function startWatcher(
  onNewPdf: (filePath: string) => Promise<void>
): Promise<void> {
  watcher = chokidar.watch(WATCH_DIR, {
    ignored: /(^|[\/\\])\../,  // Ignore dotfiles
    persistent: true,
    ignoreInitial: true,       // Don't trigger for existing files
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on("add", async (filePath) => {
    if (!filePath.toLowerCase().endsWith(".pdf")) return;

    if (await isAlreadyProcessed(filePath)) {
      return; // Duplicate, skip
    }

    await markAsProcessed(filePath);
    await onNewPdf(filePath);
  });

  watcher.on("ready", () => {
    console.log(`Watching for PDFs in: ${WATCH_DIR}`);
  });
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down watcher...");
  await stopWatcher();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await stopWatcher();
  process.exit(0);
});
```css
```typescript
// Source: Existing lib/db/index.ts pattern
import { db } from "@/lib/db";

// Schema addition
db.run(`
  CREATE TABLE IF NOT EXISTS processed_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending'
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_processed_contracts_filename ON processed_contracts(filename)`);

export async function isAlreadyProcessed(filePath: string): Promise<boolean> {
  const filename = path.basename(filePath);
  const row = db.query("SELECT 1 FROM processed_contracts WHERE filename = ?").get(filename);
  return row !== null;
}

export async function markAsProcessed(filePath: string): Promise<void> {
  const filename = path.basename(filePath);
  db.run(
    "INSERT OR IGNORE INTO processed_contracts (filename, file_path) VALUES (?, ?)",
    [filename, filePath]
  );
}
```css
```typescript
// Source: https://github.com/paulmillr/chokidar/blob/main/README.md
import chokidar from "chokidar";

const watcher = chokidar.watch("./contracts", {
  persistent: true,
  ignoreInitial: true,
  ignored: (path, stats) => stats?.isFile() && !path.endsWith(".pdf"),
  depth: 1,  // Don't go deeper than direct children
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
  usePolling: false, // true only for network drives
});

watcher
  .on("add", (path) => console.log(`File ${path} added`))
  .on("error", (error) => console.error(`Watcher error: ${error}`))
  .on("ready", () => console.log("Initial scan complete. Ready for changes"));
```css
```typescript
// Source: https://bun.com/docs/api/hashing
import { basename } from "node:path";

export async function hashFileContent(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const content = await file.arrayBuffer();
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}
```css
```typescript
// services/contract/pipeline/index.ts
import { startWatcher, stopWatcher } from "./watcher";
import { processPdf } from "./processor";

async function main(): Promise<void> {
  console.log("Starting contract pipeline...");

  await startWatcher(async (filePath) => {
    console.log(`Processing: ${filePath}`);
    try {
      await processPdf(filePath);
      console.log(`Completed: ${filePath}`);
    } catch (error) {
      console.error(`Failed: ${filePath}`, error);
      // Mark as failed in DB, alert, etc.
    }
  });

  console.log("Pipeline running. Press Ctrl+C to stop.");
}

main().catch(console.error);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chokidar v4 (CommonJS) | chokidar v5 (ESM-only) | November 2025 | Import syntax: `import chokidar from 'chokidar'`; Node 20+ required |
| Built-in glob patterns | External glob via `node:fs/promises` | chokidar v5 | Use `Array.fromAsync(glob('**/*.pdf'))` for initial file list |
| fs.watch polyfills | Native fs.watch in Bun | 2023 | Bun now has fs.watch, but reliability issues remain for recursive mode |

**Deprecated/outdated:**

- chokidar v4 and below: Still works but v5 is recommended for new projects
- `gaze`, `watch`: Older file watchers, chokidar is the standard now
- `fs.watchFile`: Polling-based, use fs.watch or chokidar for efficiency

## Open Questions

Things that couldn't be fully resolved:

1. **Bun-specific fs.watch issues in 2026**
   - What we know: GitHub issues from late 2024 show recursive mode bugs (filename truncation, no dynamic expansion)
   - What's unclear: Whether these are fixed in current Bun releases (couldn't verify with official 2026 Bun changelog)
   - Recommendation: Use chokidar; it's proven and adds minimal overhead. Revisit native fs.watch in v2 if chokidar feels heavy.

2. **SharePoint folder watching (v2)**
   - What we know: Phase 1 explicitly defers SharePoint integration
   - What's unclear: Whether SharePoint can emit file change events or requires polling
   - Recommendation: Design watcher interface to allow swapping implementations later

## Sources

### Primary (HIGH confidence)

- [Bun File Watching Documentation](https://bun.com/docs/guides/read-file/watch) - fs.watch API and usage
- [Bun Hashing API](https://bun.com/docs/api/hashing) - CryptoHasher for SHA-256
- [chokidar README](https://github.com/paulmillr/chokidar/blob/main/README.md) - Full v5 API documentation
- Existing codebase: `lib/db/index.ts` - SQLite patterns, `services/email/client.ts` - Service class patterns

### Secondary (MEDIUM confidence)

- [chokidar npm](https://www.npmjs.com/package/chokidar) - Version info, usage stats
- [Bun fs.watch GitHub issues](https://github.com/oven-sh/bun/issues/15939) - Recursive mode limitations
- [Transloadit Deduplication Guide](https://transloadit.com/devtips/efficient-file-deduplication-with-sha-256-and-node-js/) - SHA-256 dedup patterns

### Tertiary (LOW confidence)

- WebSearch results on Bun reliability - Multiple sources mention issues, but couldn't verify current state

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - chokidar is well-documented, Bun hashing is official docs
- Architecture: HIGH - Patterns match existing codebase conventions
- Pitfalls: MEDIUM - Based on GitHub issues and general file watching experience, not all verified in current Bun

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable domain, chokidar v5 is new but documented)
