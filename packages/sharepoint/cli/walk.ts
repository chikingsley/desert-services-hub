import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import { SharePointClient } from "@sharepoint/client";
import type { SharePointItem } from "@sharepoint/types";

// --- Presets ---

const PRESETS: Record<string, string[]> = {
  "customer-projects": ["Customer Projects"],
  inspections: [
    "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M",
    "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z",
  ],
  plans: ["Plans"],
  "swppp-books": ["SWPPP/SWPPP Book"],
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
  batchSize: number;
  db: Database | null;
  foldersOnly: boolean;
  jsonOutput: boolean;
  maxDepth: number;
}

interface WalkStats {
  errors: number;
  files: number;
  folders: number;
}

function recordFolder(
  folder: SharePointItem,
  folderPath: string,
  currentPath: string,
  depth: number,
  options: WalkOptions,
  stmt: ReturnType<Database["prepare"]> | undefined
): void {
  if (options.jsonOutput) {
    console.log(
      JSON.stringify({
        childCount: folder.folder?.childCount ?? 0,
        depth,
        name: folder.name,
        path: folderPath,
        type: "folder",
        webUrl: folder.webUrl,
      })
    );
  } else if (stmt) {
    stmt.run(
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

function recordFile(
  file: SharePointItem,
  filePath: string,
  currentPath: string,
  options: WalkOptions,
  stmt: ReturnType<Database["prepare"]> | undefined
): void {
  if (options.jsonOutput) {
    console.log(
      JSON.stringify({
        folder: currentPath,
        mimeType: file.file?.mimeType,
        name: file.name,
        path: filePath,
        size: file.size,
        type: "file",
        webUrl: file.webUrl,
      })
    );
  } else if (stmt) {
    stmt.run(
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

async function walkPath(
  client: SharePointClient,
  rootPath: string,
  options: WalkOptions
): Promise<WalkStats> {
  const stats: WalkStats = { errors: 0, files: 0, folders: 0 };

  const insertFolder = options.db?.query(`
    INSERT OR REPLACE INTO folders
    (path, name, depth, parent_path, child_count, web_url, sharepoint_id, created_at, modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFile = options.db?.query(`
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Error listing ${currentPath}: ${msg}`);
      stats.errors++;
      return;
    }

    const folders = items.filter((item) => item.folder);
    const files = options.foldersOnly ? [] : items.filter((item) => item.file);

    for (const folder of folders) {
      const folderPath = `${currentPath}/${folder.name}`;
      stats.folders++;
      recordFolder(
        folder,
        folderPath,
        currentPath,
        depth,
        options,
        insertFolder
      );
    }

    for (const file of files) {
      const filePath = `${currentPath}/${file.name}`;
      stats.files++;
      recordFile(file, filePath, currentPath, options, insertFile);
    }

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
  allowPositionals: true,
  args: process.argv.slice(2),
  options: {
    depth: { type: "string", default: "0" },
    batch: { type: "string", default: "5" },
    db: { type: "string", default: "walk-results.db" },
    json: { type: "boolean", default: false },
    "folders-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help || positionals.length === 0) {
  console.log(`
SharePoint Folder Walker

Usage: bun packages/sharepoint/cli/walk.ts <path-or-preset> [options]

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
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
});

const db = jsonOutput ? null : initDb(dbPath);
const walkOptions: WalkOptions = {
  batchSize,
  db,
  foldersOnly,
  jsonOutput,
  maxDepth,
};

const totalStats: WalkStats = { errors: 0, files: 0, folders: 0 };
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
