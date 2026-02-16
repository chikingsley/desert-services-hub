#!/usr/bin/env bun

/**
 * Show folder watcher status.
 *
 * Usage:
 *   bun cli/status.ts           # Overview
 *   bun cli/status.ts events    # Recent events
 *   bun cli/status.ts folders   # All tracked folders
 */

import {
  getConfig,
  getRecentEvents,
  getTrackedFolders,
} from "@background-jobs/workers/outlook-folder-watcher/lib/state";

const subcommand = process.argv[2];

if (subcommand === "events") {
  const events = await getRecentEvents(50);
  if (events.length === 0) {
    console.log("No events recorded.");
  } else {
    for (const evt of events) {
      const details = evt.details ? JSON.parse(evt.details) : {};
      const detailStr = Object.entries(details)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      console.log(
        `${evt.created_at}  ${evt.event_type.padEnd(16)}  ${evt.folder_name ?? "-"}  ${detailStr}`
      );
    }
  }
} else if (subcommand === "folders") {
  const folders = await getTrackedFolders();
  if (folders.length === 0) {
    console.log("No tracked folders. Run: bun cli/init.ts");
  } else {
    console.log(
      `${"Folder".padEnd(50)} ${"Project".padEnd(8)} ${"Messages".padEnd(10)} Last Synced`
    );
    console.log("-".repeat(100));
    for (const f of folders) {
      console.log(
        `${f.display_name.padEnd(50)} ${String(f.project_id ?? "-").padEnd(8)} ${String(f.message_count).padEnd(10)} ${f.last_synced_at ?? "never"}`
      );
    }
  }
} else {
  // Overview
  const mailbox = await getConfig("mailbox");
  const watchFolderName = await getConfig("watch_folder_name");
  const watchFolderId = await getConfig("watch_folder_id");
  const pollInterval = await getConfig("poll_interval_ms");
  const lastPoll = await getConfig("last_poll_at");
  const foldersDeltaLink = await getConfig("folders_delta_link");
  const tracked = await getTrackedFolders();
  const withProject = tracked.filter((f) => f.project_id !== null).length;
  const totalMessages = tracked.reduce((sum, f) => sum + f.message_count, 0);

  console.log("Folder Watcher Status");
  console.log("=====================");
  console.log(`Mailbox:          ${mailbox ?? "(not set)"}`);
  console.log(`Watch folder:     ${watchFolderName ?? "(not set)"}`);
  console.log(`Watch folder ID:  ${watchFolderId ?? "(not set)"}`);
  console.log(`Poll interval:    ${pollInterval ?? "60000"}ms`);
  console.log(`Last poll:        ${lastPoll ?? "never"}`);
  console.log(`Delta token:      ${foldersDeltaLink ? "set" : "not set"}`);
  console.log(`Tracked folders:  ${tracked.length}`);
  console.log(`  With project:   ${withProject}`);
  console.log(`  Without:        ${tracked.length - withProject}`);
  console.log(`Total messages:   ${totalMessages}`);

  const events = await getRecentEvents(5);
  if (events.length > 0) {
    console.log("\nRecent Events:");
    for (const evt of events) {
      console.log(
        `  ${evt.created_at}  ${evt.event_type}  ${evt.folder_name ?? ""}`
      );
    }
  }
}
