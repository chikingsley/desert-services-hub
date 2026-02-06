/**
 * Generic SharePoint folder walker
 *
 * Recursively walks a SharePoint folder tree and outputs results to SQLite
 * or stdout. Supports preset paths for common locations.
 *
 * Usage:
 *   bun walk.ts <path-or-preset> [options]
 *
 * Presets:
 *   inspections          SWPPP/INSPECTIONS/PROJECTS (A-M + N-Z)
 *   customer-projects    Customer Projects
 *   swppp-books          SWPPP/SWPPP Book
 *   plans                Plans
 *
 * Options:
 *   --depth=N            Max recursion depth (default: unlimited)
 *   --batch=N            Concurrent requests per level (default: 5)
 *   --db=PATH            Output to SQLite DB (default: walk-results.db)
 *   --json               Output JSON lines to stdout instead of DB
 *   --folders-only       Only list folders, skip files
 *
 * Examples:
 *   bun walk.ts inspections
 *   bun walk.ts "Customer Projects/Active" --depth=2
 *   bun walk.ts inspections --json
 *   bun walk.ts "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/ARCO" --depth=3
 */
import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import { SharePointClient } from "@sharepoint/client";
import type { SharePointItem } from "@sharepoint/types";

// --- Presets ---

const PRESETS: Record<string, string[]> = {
  inspections: [
    "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M",
    "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z",
  ],
  "customer-projects": ["Customer Projects"],
  "swppp-books": ["SWPPP/SWPPP Book"],
  plans: ["Plans"],
};

// --- DB setup ---

function initDb(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      depth INTEGER NOT NULL,
      parent_path TEXT,
      child_count INTEGER,
      web_url TEXT,
      sharepoint_id TEXT,
      created_at TEXT,
      modified_at TEXT,
      walked_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      size INTEGER,
      mime_type TEXT,
      web_url TEXT,
      sharepoint_id TEXT,
      created_at TEXT,
      modified_at TEXT,
      walked_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(
    "CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_path)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_path)");
  db.run("CREATE INDEX IF NOT EXISTS idx_folders_depth ON folders(depth)");

  return db;
}

// --- Walker ---

interface WalkOptions {
  maxDepth: number;
  batchSize: number;
  foldersOnly: boolean;
  jsonOutput: boolean;
  db: Database | null;
}

interface WalkStats {
  folders: number;
  files: number;
  errors: number;
}

async function walkPath(
  client: SharePointClient,
  rootPath: string,
  options: WalkOptions
): Promise<WalkStats> {
  const stats: WalkStats = { folders: 0, files: 0, errors: 0 };

  const insertFolder = options.db?.prepare(`
    INSERT OR REPLACE INTO folders
    (path, name, depth, parent_path, child_count, web_url, sharepoint_id, created_at, modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFile = options.db?.prepare(`
    INSERT OR REPLACE INTO files
    (path, name, folder_path, size, mime_type, web_url, sharepoint_id, created_at, modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (options.maxDepth > 0 && depth > options.maxDepth) {
      return;
    }

    let items: SharePointItem[];
    try {
      items = await client.listFiles(currentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Error listing ${currentPath}: ${msg}`);
      stats.errors++;
      return;
    }

    const folders = items.filter((item) => item.folder);
    const files = options.foldersOnly ? [] : items.filter((item) => item.file);

    for (const folder of folders) {
      const folderPath = `${currentPath}/${folder.name}`;
      stats.folders++;

      if (options.jsonOutput) {
        console.log(
          JSON.stringify({
            type: "folder",
            path: folderPath,
            name: folder.name,
            depth,
            childCount: folder.folder?.childCount ?? 0,
            webUrl: folder.webUrl,
          })
        );
      } else if (insertFolder) {
        insertFolder.run(
          folderPath,
          folder.name,
          depth,
          currentPath,
          folder.folder?.childCount ?? 0,
          folder.webUrl,
          folder.id,
          folder.createdDateTime,
          folder.lastModifiedDateTime
        );
      }
    }

    for (const file of files) {
      const filePath = `${currentPath}/${file.name}`;
      stats.files++;

      if (options.jsonOutput) {
        console.log(
          JSON.stringify({
            type: "file",
            path: filePath,
            name: file.name,
            folder: currentPath,
            size: file.size,
            mimeType: file.file?.mimeType,
            webUrl: file.webUrl,
          })
        );
      } else if (insertFile) {
        insertFile.run(
          filePath,
          file.name,
          currentPath,
          file.size ?? null,
          file.file?.mimeType ?? null,
          file.webUrl,
          file.id,
          file.createdDateTime,
          file.lastModifiedDateTime
        );
      }
    }

    // Recurse into subfolders in batches
    for (let i = 0; i < folders.length; i += options.batchSize) {
      const batch = folders.slice(i, i + options.batchSize);
      await Promise.all(
        batch.map((folder) => walk(`${currentPath}/${folder.name}`, depth + 1))
      );
    }
  }

  await walk(rootPath, 1);
  return stats;
}

// --- Main ---

const { values: args, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    depth: { type: "string", default: "0" },
    batch: { type: "string", default: "5" },
    db: { type: "string", default: "walk-results.db" },
    json: { type: "boolean", default: false },
    "folders-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

if (args.help || positionals.length === 0) {
  console.log(`
SharePoint Folder Walker

Usage: bun walk.ts <path-or-preset> [options]

Presets:
  inspections          SWPPP/INSPECTIONS/PROJECTS (A-M + N-Z)
  customer-projects    Customer Projects
  swppp-books          SWPPP/SWPPP Book
  plans                Plans

Options:
  --depth=N            Max recursion depth (default: unlimited)
  --batch=N            Concurrent requests per level (default: 5)
  --db=PATH            SQLite output path (default: walk-results.db)
  --json               JSON lines to stdout instead of DB
  --folders-only       Only list folders, skip files
  -h, --help           Show this help
`);
  process.exit(0);
}

const target = positionals[0] ?? "";
const rootPaths = PRESETS[target] ?? [target];

const maxDepth = Number(args.depth);
const batchSize = Number(args.batch);
const jsonOutput = args.json ?? false;
const foldersOnly = args["folders-only"] ?? false;
const dbPath = args.db ?? "walk-results.db";

const sp = new SharePointClient({
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
});

const db = jsonOutput ? null : initDb(dbPath);
const walkOptions: WalkOptions = {
  maxDepth,
  batchSize,
  foldersOnly,
  jsonOutput,
  db,
};

const totalStats: WalkStats = { folders: 0, files: 0, errors: 0 };
const start = Date.now();

if (!jsonOutput) {
  const depthLabel = maxDepth > 0 ? `depth ${maxDepth}` : "unlimited depth";
  console.log(
    `Walking ${rootPaths.length} root path(s) (${depthLabel}, batch ${batchSize})\n`
  );
}

for (const rootPath of rootPaths) {
  if (!jsonOutput) {
    console.log(`Walking: ${rootPath}`);
  }

  const stats = await walkPath(sp, rootPath, walkOptions);
  totalStats.folders += stats.folders;
  totalStats.files += stats.files;
  totalStats.errors += stats.errors;
}

db?.close();

if (!jsonOutput) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
  console.log(`  Folders: ${totalStats.folders}`);
  console.log(`  Files: ${totalStats.files}`);
  if (totalStats.errors > 0) {
    console.log(`  Errors: ${totalStats.errors}`);
  }
  console.log(`  Database: ${dbPath}`);
}
