#!/usr/bin/env bun

/**
 * Backfill: scan all tracked folders and link their existing messages.
 * Run after init to do the initial email linking.
 *
 * For each tracked folder with a matched project, calls messages delta
 * with no stored link (full initial sync), processes all messages,
 * and saves the delta link for future incremental polling.
 *
 * Usage:
 *   bun cli/backfill.ts                                     # Full backfill
 *   bun cli/backfill.ts --dry-run                            # Preview only
 *   bun cli/backfill.ts --folder="Allasso Ranch - Weis"      # Single folder (substring match)
 */

import { messagesDelta } from "@background-jobs/workers/outlook-folder-watcher/lib/graph";
import {
  checkDustPermitIssued,
  linkMessages,
} from "@background-jobs/workers/outlook-folder-watcher/lib/linker";
import { findProjectByFolder } from "@background-jobs/workers/outlook-folder-watcher/lib/projects";
import {
  getConfig,
  getTrackedFolders,
  logEvent,
  updateTrackedFolder,
} from "@background-jobs/workers/outlook-folder-watcher/lib/state";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folderFilter = args
  .find((a) => a.startsWith("--folder="))
  ?.split("=")
  .slice(1)
  .join("=");

const mailbox = await getConfig("mailbox");

if (!mailbox) {
  console.error("[Backfill] Not initialized. Run: bun cli/init.ts");
  process.exit(1);
}

let folders = await getTrackedFolders();

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
let skippedNoProject = 0;

for (const folder of folders) {
  console.log(`--- ${folder.display_name} ---`);

  // Resolve project ID (refresh each time)
  let projectId = folder.project_id;
  if (!projectId) {
    projectId = await findProjectByFolder(folder.display_name);
    if (projectId) {
      await updateTrackedFolder(folder.folder_id, { project_id: projectId });
      console.log(`  Matched to project #${projectId}`);
    }
  }

  if (!projectId) {
    console.log("  No matching project — skipping");
    skippedNoProject++;
    continue;
  }

  // Fetch all messages (null delta link = full sync)
  try {
    const result = await messagesDelta(mailbox, folder.folder_id, null);
    const messages = result.changes.filter((m) => !m["@removed"]);

    console.log(`  Messages in folder: ${messages.length}`);

    if (dryRun) {
      for (const msg of messages.slice(0, 5)) {
        console.log(
          `    ${msg.subject ?? "(no subject)"} [${msg.internetMessageId ? "iid" : ""}${msg.id ? " gid" : ""}]`
        );
      }
      if (messages.length > 5) {
        console.log(`    ... and ${messages.length - 5} more`);
      }
      continue;
    }

    // Link messages — pass both Graph ID and internet_message_id
    const toLink = messages.map((m) => ({
      id: m.id,
      internetMessageId: m.internetMessageId,
      conversationId: m.conversationId,
      subject: m.subject,
    }));

    const stats = await linkMessages(projectId, toLink);
    totalDirectLinks += stats.directLinks;
    totalThreadExpanded += stats.threadExpanded;
    totalNotFound += stats.notFound;

    console.log(
      `  Linked: ${stats.directLinks} direct, ${stats.threadExpanded} via threads, ${stats.notFound} not found, ${stats.skippedSubjectMismatch} skipped by subject guard`
    );

    // Check for dust permit issued emails
    await checkDustPermitIssued(projectId);

    // Save delta link for future incremental polls
    await updateTrackedFolder(folder.folder_id, {
      messages_delta_link: result.deltaLink,
      message_count: stats.directLinks + stats.threadExpanded,
      last_synced_at: new Date().toISOString(),
    });

    await logEvent("backfill", folder.folder_id, folder.display_name, {
      messagesInFolder: messages.length,
      ...stats,
    });
  } catch (err) {
    console.error(`  Error: ${err}`);
    await logEvent("error", folder.folder_id, folder.display_name, {
      error: String(err),
      phase: "backfill",
    });
  }
}

console.log("\n[Backfill] Summary:");
console.log(`  Folders processed: ${folders.length}`);
console.log(`  Skipped (no project): ${skippedNoProject}`);
if (!dryRun) {
  console.log(`  Direct links: ${totalDirectLinks}`);
  console.log(`  Thread expanded: ${totalThreadExpanded}`);
  console.log(`  Not found: ${totalNotFound}`);
}
