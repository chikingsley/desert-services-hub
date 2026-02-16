#!/usr/bin/env bun

/**
 * Folder-size lint — flag source directories with too many files.
 *
 * Helps prevent flat folders from growing into unnavigable dumps.
 * Threshold: 10 .ts/.tsx source files per directory (configurable via MAX_FILES env).
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_FILES = Number.parseInt(process.env.MAX_FILES ?? "10", 10);
const repoRoot = process.cwd();

// Directories excluded from the check (relative to repo root).
const EXCLUDED_DIRS = new Set([
  // Vendored UI component library (shadcn)
  "apps/web/frontend/components/ui",
  // Self-contained monolith with its own structure
  "packages/dust-permits",
  // One-per-route / one-per-component (inherently flat by design)
  "apps/web/frontend/pages",
  "apps/web/frontend/components/estimates",
  "lib/takeoff/pdf-takeoff/components",
  // One-per-entity DB repositories
  "lib/db/repositories",
  // CLI command directories (one-per-command)
  "packages/email/src/commands",
  // Node modules (obviously)
  "node_modules",
]);

// Skip any directory whose name matches these patterns.
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  "dist",
  "out",
  "build",
  "_reference",
  "_archive",
]);

// Extensions that count as source files.
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

interface Violation {
  dir: string;
  count: number;
}

function tryStat(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function isExcluded(dirPath: string): boolean {
  const rel = relative(repoRoot, dirPath);
  // Check exact match
  if (EXCLUDED_DIRS.has(rel)) {
    return true;
  }
  // Check if any parent is excluded
  for (const excluded of EXCLUDED_DIRS) {
    if (rel.startsWith(`${excluded}/`)) {
      return true;
    }
  }
  return false;
}

function walk(dir: string, violations: Violation[]): void {
  if (isExcluded(dir)) {
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  let sourceCount = 0;

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip excluded directory names
    if (SKIP_DIR_NAMES.has(entry)) {
      continue;
    }

    const stat = tryStat(fullPath);
    if (!stat) {
      continue;
    }

    if (stat.isDirectory()) {
      walk(fullPath, violations);
    } else if (stat.isFile()) {
      const ext = entry.slice(entry.lastIndexOf("."));
      if (SOURCE_EXTENSIONS.has(ext)) {
        sourceCount++;
      }
    }
  }

  if (sourceCount > MAX_FILES) {
    violations.push({ dir: relative(repoRoot, dir), count: sourceCount });
  }
}

const violations: Violation[] = [];

// Walk the source trees
for (const root of ["apps", "lib", "packages", "scripts", "tests"]) {
  try {
    statSync(join(repoRoot, root));
    walk(join(repoRoot, root), violations);
  } catch {
    // Directory doesn't exist, skip
  }
}

if (violations.length > 0) {
  console.error(
    `folder size check failed (max ${MAX_FILES} source files per directory)`
  );
  for (const v of violations.sort((a, b) => b.count - a.count)) {
    console.error(`  ${v.dir}: ${v.count} files`);
  }
  process.exit(1);
}

console.log(
  `folder size check passed (all directories ≤ ${MAX_FILES} source files)`
);
