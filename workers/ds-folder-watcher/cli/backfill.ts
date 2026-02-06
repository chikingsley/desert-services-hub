#!/usr/bin/env bun

/**
 * Backfill: scan all tracked folders and link their existing messages.
 * Run once after init to do the initial email linking.
 *
 * For each tracked folder, calls messages delta with no stored link
 * (full initial sync), processes all messages, and saves the delta link.
 *
 * Usage:
 *   bun cli/backfill.ts                                     # Full backfill
 *   bun cli/backfill.ts --dry-run                            # Preview only
 *   bun cli/backfill.ts --folder="Allasso Ranch - Weis"      # Single folder (substring match)
 */

import { messagesDelta } from "@/workers/ds-folder-watcher/lib/graph.ts";
import {
  ensureHubProject,
  linkMessages,
} from "@/workers/ds-folder-watcher/lib/linker.ts";
import { findOrCreateProject } from "@/workers/ds-folder-watcher/lib/projects.ts";
import {
  getConfig,
  getTrackedFolders,
  logEvent,
  openStateDb,
  updateTrackedFolder,
} from "@/workers/ds-folder-watcher/lib/state.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folderFilter = args
  .find((a) => a.startsWith("--folder="))
  ?.split("=")
  .slice(1)
  .join("=");

const db = openStateDb();
const mailbox = getConfig(db, "mailbox");

if (!mailbox) {
  console.error("[Backfill] Not initialized. Run: bun cli/init.ts");
  process.exit(1);
}

let folders = getTrackedFolders(db);

if (folderFilter) {
  const filter = folderFilter.toLowerCase();
  folders = folders.filter((f) =>
    f.display_name.toLowerCase().includes(filter)
  );
  console.log(
    `[Backfill] Filtered to ${folders.length} folder(s) matching "${folderFilter}"`
  );
}

if (folders.length === 0) {
  console.log("[Backfill] No folders to process.");
  process.exit(0);
}

console.log(
  `[Backfill] Processing ${folders.length} folders${dryRun ? " (DRY RUN)" : ""}\n`
);

let totalDirectLinks = 0;
let totalThreadExpanded = 0;
let totalNotFound = 0;

for (const folder of folders) {
  console.log(`--- ${folder.display_name} ---`);

  // Ensure project exists
  if (!(dryRun || folder.project_id)) {
    const { projectId, projectNumber, created } = findOrCreateProject(
      folder.display_name
    );
    updateTrackedFolder(db, folder.folder_id, { project_id: projectId });

    if (created) {
      console.log(`  Created project #${projectNumber}`);
    } else {
      console.log(`  Linked to project #${projectNumber}`);
    }
  }

  // Fetch all messages (no delta link = full sync)
  try {
    const result = await messagesDelta(mailbox, folder.folder_id, null);
    const messages = result.changes.filter((m) => !m["@removed"]);

    console.log(`  Messages in folder: ${messages.length}`);

    if (dryRun) {
      for (const msg of messages.slice(0, 5)) {
        console.log(
          `    ${msg.subject ?? "(no subject)"} [${msg.internetMessageId ? "matchable" : "no messageId"}]`
        );
      }
      if (messages.length > 5) {
        console.log(`    ... and ${messages.length - 5} more`);
      }
      continue;
    }

    // Link messages
    const hubProjectId = ensureHubProject(folder.display_name);
    const toLink = messages.map((m) => ({
      internetMessageId: m.internetMessageId,
      conversationId: m.conversationId,
      subject: m.subject,
    }));

    const stats = linkMessages(hubProjectId, toLink);
    totalDirectLinks += stats.directLinks;
    totalThreadExpanded += stats.threadExpanded;
    totalNotFound += stats.notFound;

    console.log(
      `  Linked: ${stats.directLinks} direct, ${stats.threadExpanded} via threads, ${stats.notFound} not in hub.db`
    );

    // Save delta link for future incremental polls
    updateTrackedFolder(db, folder.folder_id, {
      messages_delta_link: result.deltaLink,
      message_count: stats.directLinks + stats.threadExpanded,
      last_synced_at: new Date().toISOString(),
    });

    logEvent(db, "backfill", folder.folder_id, folder.display_name, {
      messagesInFolder: messages.length,
      ...stats,
    });
  } catch (err) {
    console.error(`  Error: ${err}`);
    logEvent(db, "error", folder.folder_id, folder.display_name, {
      error: String(err),
      phase: "backfill",
    });
  }
}

console.log("\n[Backfill] Summary:");
console.log(`  Folders processed: ${folders.length}`);
if (!dryRun) {
  console.log(`  Direct links: ${totalDirectLinks}`);
  console.log(`  Thread expanded: ${totalThreadExpanded}`);
  console.log(`  Not found in hub.db: ${totalNotFound}`);
}
