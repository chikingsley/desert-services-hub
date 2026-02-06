#!/usr/bin/env bun

/**
 * Folder Watcher — Main Poll Loop
 *
 * Polls Microsoft Graph delta APIs to detect:
 * 1. New folders under Projects/Active/ → matches to existing projects
 * 2. New messages in tracked folders → links emails in hub.db
 *
 * Usage:
 *   bun cli/watch.ts                    # Continuous polling (60s default)
 *   bun cli/watch.ts --once             # Single poll cycle then exit
 *   bun cli/watch.ts --interval=30000   # Custom interval (ms)
 */

import {
  DeltaExpiredError,
  type FolderChange,
  type FolderDeltaResult,
  foldersDelta,
  type MessageChange,
  messagesDelta,
} from "@/apps/workers/outlook-folder-watcher/lib/graph";
import { linkMessages } from "@/apps/workers/outlook-folder-watcher/lib/linker";
import { findProjectByFolder } from "@/apps/workers/outlook-folder-watcher/lib/projects";
import {
  addTrackedFolder,
  getConfig,
  getTrackedFolders,
  logEvent,
  openStateDb,
  removeTrackedFolder,
  setConfig,
  updateTrackedFolder,
} from "@/apps/workers/outlook-folder-watcher/lib/state";

const db = openStateDb();

// Parse CLI args
const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const interval = intervalArg
  ? Number.parseInt(intervalArg.split("=")[1] ?? "60000", 10)
  : Number.parseInt(getConfig(db, "poll_interval_ms") ?? "60000", 10);

const _mailbox = getConfig(db, "mailbox");
const watchFolderId = getConfig(db, "watch_folder_id");

if (!(_mailbox && watchFolderId)) {
  console.error("[Watch] Not initialized. Run: bun cli/init.ts");
  process.exit(1);
}

const mailbox: string = _mailbox;

// -- Handlers --

function handleNewFolder(folder: FolderChange): void {
  console.log(`[NewFolder] "${folder.displayName}"`);

  const projectId = findProjectByFolder(folder.displayName);

  addTrackedFolder(
    db,
    folder.id,
    folder.displayName,
    folder.parentFolderId,
    projectId
  );

  if (projectId) {
    console.log(`  → Linked to project #${projectId}`);
  } else {
    console.log("  → No matching project found");
  }

  logEvent(db, "folder_created", folder.id, folder.displayName, {
    projectId,
    matched: projectId !== null,
  });
}

function handleRenamedFolder(folder: FolderChange, oldName: string): void {
  console.log(`[Renamed] "${oldName}" → "${folder.displayName}"`);
  updateTrackedFolder(db, folder.id, { display_name: folder.displayName });

  // Re-match project on rename
  const projectId = findProjectByFolder(folder.displayName);
  if (projectId) {
    updateTrackedFolder(db, folder.id, { project_id: projectId });
  }

  logEvent(db, "folder_renamed", folder.id, folder.displayName, {
    oldName,
    projectId,
  });
}

function handleDeletedFolder(folder: FolderChange): void {
  const tracked = db
    .query<{ display_name: string; project_id: number | null }, [string]>(
      "SELECT display_name, project_id FROM tracked_folders WHERE folder_id = ?"
    )
    .get(folder.id);

  if (tracked) {
    console.log(`[Deleted] "${tracked.display_name}"`);
    removeTrackedFolder(db, folder.id);
    logEvent(db, "folder_deleted", folder.id, tracked.display_name, {
      projectId: tracked.project_id,
    });
  }
}

function handleNewMessages(
  folderName: string,
  folderId: string,
  hubProjectId: number,
  messages: MessageChange[]
): void {
  const toLink = messages.map((m) => ({
    id: m.id,
    internetMessageId: m.internetMessageId,
    conversationId: m.conversationId,
    subject: m.subject,
  }));

  const stats = linkMessages(hubProjectId, toLink);

  if (stats.directLinks > 0 || stats.threadExpanded > 0) {
    console.log(
      `[Link] "${folderName}": ${stats.directLinks} direct, ${stats.threadExpanded} via threads, ${stats.notFound} not in hub.db`
    );
    logEvent(db, "emails_linked", folderId, folderName, {
      ...stats,
      hubProjectId,
    });
  }
}

// -- Main Poll --

async function poll(): Promise<void> {
  const startTime = Date.now();

  // Step 1: Folder changes
  const currentFolderDelta = getConfig(db, "folders_delta_link");
  let folderResult: FolderDeltaResult;

  try {
    folderResult = await foldersDelta(mailbox, currentFolderDelta);
  } catch (err) {
    if (err instanceof DeltaExpiredError) {
      console.warn("[Watch] Folder delta token expired, doing full resync");
      setConfig(db, "folders_delta_link", "");
      folderResult = await foldersDelta(mailbox, null);
    } else {
      throw err;
    }
  }

  // Filter to only children of the watched folder
  const relevantFolderChanges = folderResult.changes.filter(
    (f) => f.parentFolderId === watchFolderId
  );

  for (const folder of relevantFolderChanges) {
    if (folder["@removed"]) {
      handleDeletedFolder(folder);
      continue;
    }

    const tracked = db
      .query<{ display_name: string }, [string]>(
        "SELECT display_name FROM tracked_folders WHERE folder_id = ?"
      )
      .get(folder.id);

    if (!tracked) {
      handleNewFolder(folder);
    } else if (tracked.display_name !== folder.displayName) {
      handleRenamedFolder(folder, tracked.display_name);
    }
  }

  setConfig(db, "folders_delta_link", folderResult.deltaLink);

  // Step 2: Message changes per tracked folder
  const tracked = getTrackedFolders(db);

  for (const folder of tracked) {
    // Skip folders without a matched project
    if (folder.project_id === null) {
      continue;
    }

    try {
      const msgResult = await messagesDelta(
        mailbox,
        folder.folder_id,
        folder.messages_delta_link
      );

      const added = msgResult.changes.filter((m) => !m["@removed"]);

      if (added.length > 0) {
        handleNewMessages(
          folder.display_name,
          folder.folder_id,
          folder.project_id,
          added
        );
      }

      updateTrackedFolder(db, folder.folder_id, {
        messages_delta_link: msgResult.deltaLink,
        last_synced_at: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof DeltaExpiredError) {
        console.warn(
          `[Watch] Message delta expired for "${folder.display_name}", will resync`
        );
        updateTrackedFolder(db, folder.folder_id, {
          messages_delta_link: null,
        });
        logEvent(db, "delta_expired", folder.folder_id, folder.display_name, {
          type: "messages",
        });
      } else {
        console.error(`[Watch] Error polling "${folder.display_name}":`, err);
        logEvent(db, "error", folder.folder_id, folder.display_name, {
          error: String(err),
        });
      }
    }
  }

  setConfig(db, "last_poll_at", new Date().toISOString());

  const elapsed = Date.now() - startTime;
  console.log(
    `[Watch] Poll complete: ${relevantFolderChanges.length} folder changes, ${tracked.length} folders checked (${elapsed}ms)`
  );
}

// -- Entry Point --

console.log(
  `[Watch] Starting. Mailbox: ${mailbox}, Interval: ${interval}ms, Once: ${once}`
);

if (once) {
  await poll();
} else {
  while (true) {
    try {
      await poll();
    } catch (err) {
      console.error("[Watch] Poll error:", err);
      logEvent(db, "error", null, null, { error: String(err) });
    }
    await Bun.sleep(interval);
  }
}
