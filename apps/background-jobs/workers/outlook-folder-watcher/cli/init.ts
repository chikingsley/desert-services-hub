#!/usr/bin/env bun

/**
 * Initialize the folder watcher.
 *
 * Resolves the Projects/Active/ folder ID for Chi's mailbox
 * and seeds tracked_folders with existing subfolders.
 *
 * Usage:
 *   bun cli/init.ts
 *   bun cli/init.ts --mailbox chi@desertservices.net
 *   bun cli/init.ts --root Projects --watch Active
 */

import {
  listChildFolders,
  listTopLevelFolders,
} from "@/apps/background-jobs/workers/outlook-folder-watcher/lib/graph";
import { findProjectByFolder } from "@/apps/background-jobs/workers/outlook-folder-watcher/lib/projects";
import {
  addTrackedFolder,
  getTrackedFolders,
  setConfig,
} from "@/apps/background-jobs/workers/outlook-folder-watcher/lib/state";

const args = process.argv.slice(2);
function getArg(name: string, defaultValue: string): string {
  const idx = args.findIndex((a) => a.startsWith(`--${name}=`));
  if (idx >= 0) {
    const match = args[idx] ?? "";
    return match.split("=")[1] ?? defaultValue;
  }
  const idx2 = args.indexOf(`--${name}`);
  if (idx2 >= 0 && args[idx2 + 1]) {
    return args[idx2 + 1] ?? defaultValue;
  }
  return defaultValue;
}

const mailbox = getArg("mailbox", "chi@desertservices.net");
const rootFolderName = getArg("root", "Projects");
const watchFolderName = getArg("watch", "Active");

console.log(`[Init] Mailbox: ${mailbox}`);
console.log(`[Init] Looking for: ${rootFolderName}/${watchFolderName}/`);

// Step 1: Find the root folder (e.g., "Projects")
console.log("[Init] Fetching top-level folders...");
const topFolders = await listTopLevelFolders(mailbox);
const rootFolder = topFolders.find((f) => f.displayName === rootFolderName);

if (!rootFolder) {
  console.error(
    `[Init] Folder "${rootFolderName}" not found. Available folders:`
  );
  for (const f of topFolders) {
    console.log(`  - ${f.displayName} (${f.childFolderCount} children)`);
  }
  process.exit(1);
}

console.log(
  `[Init] Found "${rootFolderName}" (ID: ${rootFolder.id}, ${rootFolder.childFolderCount} children)`
);

// Step 2: Find the watch folder (e.g., "Active")
console.log(`[Init] Fetching children of "${rootFolderName}"...`);
const children = await listChildFolders(mailbox, rootFolder.id);
const watchFolder = children.find((f) => f.displayName === watchFolderName);

if (!watchFolder) {
  console.error(
    `[Init] Folder "${watchFolderName}" not found under "${rootFolderName}". Available:`
  );
  for (const f of children) {
    console.log(`  - ${f.displayName} (${f.childFolderCount} children)`);
  }
  process.exit(1);
}

console.log(
  `[Init] Found "${watchFolderName}" (ID: ${watchFolder.id}, ${watchFolder.childFolderCount} children)`
);

// Step 3: Store config
await setConfig("mailbox", mailbox);
await setConfig("root_folder_name", rootFolderName);
await setConfig("root_folder_id", rootFolder.id);
await setConfig("watch_folder_name", watchFolderName);
await setConfig("watch_folder_id", watchFolder.id);
await setConfig("poll_interval_ms", "60000");

// Step 4: List project folders under Active/
console.log(`[Init] Fetching project folders under "${watchFolderName}"...`);
const projectFolders = await listChildFolders(mailbox, watchFolder.id);

console.log(`[Init] Found ${projectFolders.length} project folders`);

let matched = 0;
let unmatched = 0;

for (const folder of projectFolders) {
  const projectId = await findProjectByFolder(folder.displayName);

  await addTrackedFolder(
    folder.id,
    folder.displayName,
    folder.parentFolderId,
    projectId
  );

  if (projectId) {
    console.log(`  + ${folder.displayName} → project #${projectId}`);
    matched++;
  } else {
    console.log(`  ? ${folder.displayName} → no matching project`);
    unmatched++;
  }
}

const tracked = await getTrackedFolders();

console.log("\n[Init] Complete.");
console.log(`  Tracked folders: ${tracked.length}`);
console.log(`  Matched to projects: ${matched}`);
console.log(`  Unmatched: ${unmatched}`);
console.log("\nRun 'bun cli/backfill.ts' to link existing emails.");
