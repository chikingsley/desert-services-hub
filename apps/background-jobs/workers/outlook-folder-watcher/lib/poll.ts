/**
 * Folder Watcher — Exportable Poll Function
 *
 * Polls Microsoft Graph delta APIs to detect:
 * 1. New folders under Projects/Active/ → matches/creates projects
 * 2. New messages in tracked folders → links emails to projects
 *
 * Used by:
 *   - cli/watch.ts (standalone CLI)
 *   - apps/background-jobs/jobs/dispatch.ts (`folder_watcher_poll` job handler)
 */

import {
  DeltaExpiredError,
  type FolderChange,
  type FolderDeltaResult,
  foldersDelta,
  type MessageChange,
  messagesDelta,
} from "@background-jobs/workers/outlook-folder-watcher/lib/graph";
import {
  checkDustPermitIssued,
  linkMessages,
} from "@background-jobs/workers/outlook-folder-watcher/lib/linker";
import {
  findProjectByFolder,
  parseFolderName,
} from "@background-jobs/workers/outlook-folder-watcher/lib/projects";
import {
  addTrackedFolder,
  getConfig,
  getTrackedFolders,
  logEvent,
  removeTrackedFolder,
  setConfig,
  updateTrackedFolder,
} from "@background-jobs/workers/outlook-folder-watcher/lib/state";
import { db as hubDb } from "@lib/db/client";
import { normalizeProjectNameKey } from "@lib/db/repositories/project-matching-utils";
import { linkEmail } from "@lib/linking/link-email";

// -- Handlers --

async function handleNewFolder(folder: FolderChange): Promise<void> {
  console.log(`[NewFolder] "${folder.displayName}"`);

  const projectId = await findProjectByFolder(folder.displayName);

  await addTrackedFolder(
    folder.id,
    folder.displayName,
    folder.parentFolderId,
    projectId
  );

  if (projectId) {
    console.log(`  → Linked to project #${projectId}`);
  }

  await logEvent("folder_created", folder.id, folder.displayName, {
    projectId,
    matched: projectId !== null,
  });
}

async function handleRenamedFolder(
  folder: FolderChange,
  oldName: string
): Promise<void> {
  console.log(`[Renamed] "${oldName}" → "${folder.displayName}"`);

  const tracked = await hubDb
    .query<{ project_id: number | null }, [string]>(
      "SELECT project_id FROM tracked_folders WHERE folder_id = $1"
    )
    .get(folder.id);

  await updateTrackedFolder(folder.id, { display_name: folder.displayName });

  // If already linked, update the project to reflect the rename
  if (tracked?.project_id) {
    const { projectName, contractor } = parseFolderName(folder.displayName);
    await hubDb.run(
      "UPDATE projects SET name = $1, normalized_name = $2, outlook_folder = $3, contractor = COALESCE($4, contractor), updated_at = now() WHERE id = $5",
      [
        projectName,
        normalizeProjectNameKey(projectName),
        folder.displayName,
        contractor,
        tracked.project_id,
      ]
    );
    console.log(`  → Updated project #${tracked.project_id}: "${projectName}"`);
  } else {
    // No linked project yet — find or create
    const projectId = await findProjectByFolder(folder.displayName);
    if (projectId) {
      await updateTrackedFolder(folder.id, { project_id: projectId });
    }
  }

  await logEvent("folder_renamed", folder.id, folder.displayName, {
    oldName,
    projectId: tracked?.project_id,
  });
}

async function handleDeletedFolder(folder: FolderChange): Promise<void> {
  const tracked = await hubDb
    .query<{ display_name: string; project_id: number | null }, [string]>(
      "SELECT display_name, project_id FROM tracked_folders WHERE folder_id = $1"
    )
    .get(folder.id);

  if (tracked) {
    console.log(`[Deleted] "${tracked.display_name}"`);
    await removeTrackedFolder(folder.id);
    await logEvent("folder_deleted", folder.id, tracked.display_name, {
      projectId: tracked.project_id,
    });
  }
}

async function handleNewMessages(
  folderName: string,
  folderId: string,
  hubProjectId: number,
  messages: MessageChange[]
): Promise<void> {
  const toLink = messages.map((m) => ({
    id: m.id,
    internetMessageId: m.internetMessageId,
    conversationId: m.conversationId,
    subject: m.subject,
  }));

  const stats = await linkMessages(hubProjectId, toLink);

  if (
    stats.directLinks > 0 ||
    stats.threadExpanded > 0 ||
    stats.skippedSubjectMismatch > 0
  ) {
    console.log(
      `[Link] "${folderName}": ${stats.directLinks} direct, ${stats.threadExpanded} via threads, ${stats.notFound} not found, ${stats.skippedSubjectMismatch} skipped by subject guard`
    );
    await logEvent("emails_linked", folderId, folderName, {
      ...stats,
      hubProjectId,
    });
  }

  // Run unified deterministic linker on all emails that were just project-linked
  let estimateLinked = 0;
  for (const emailId of stats.linkedEmailIds) {
    const result = await linkEmail(emailId);
    if (result.estimateLinked) {
      estimateLinked++;
    }
  }
  if (estimateLinked > 0) {
    console.log(
      `[EstimateLink] "${folderName}": ${estimateLinked} emails linked to estimates via linkEmail`
    );
    await logEvent("estimate_emails_linked", folderId, folderName, {
      estimateLinked,
      hubProjectId,
    });
  }

  // Check for dust permit issued emails
  const dustUpdated = await checkDustPermitIssued(hubProjectId);
  if (dustUpdated > 0) {
    await logEvent("dust_permit_issued", folderId, folderName, {
      permitsMarked: dustUpdated,
    });
  }
}

// -- Message Polling --

async function pollTrackedFolderMessages(
  mailbox: string,
  folder: {
    folder_id: string;
    display_name: string;
    project_id: number;
    messages_delta_link: string | null;
  }
): Promise<void> {
  try {
    const msgResult = await messagesDelta(
      mailbox,
      folder.folder_id,
      folder.messages_delta_link
    );
    const added = msgResult.changes.filter((m) => !m["@removed"]);
    if (added.length > 0) {
      await handleNewMessages(
        folder.display_name,
        folder.folder_id,
        folder.project_id,
        added
      );
    }
    await updateTrackedFolder(folder.folder_id, {
      messages_delta_link: msgResult.deltaLink,
      last_synced_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof DeltaExpiredError) {
      console.warn(
        `[FolderWatcher] Message delta expired for "${folder.display_name}", will resync`
      );
      await updateTrackedFolder(folder.folder_id, {
        messages_delta_link: null,
      });
      await logEvent("delta_expired", folder.folder_id, folder.display_name, {
        type: "messages",
      });
    } else {
      console.error(
        `[FolderWatcher] Error polling "${folder.display_name}":`,
        err
      );
      await logEvent("error", folder.folder_id, folder.display_name, {
        error: String(err),
      });
    }
  }
}

// -- Main Poll --

/**
 * Run a single folder-watcher poll cycle.
 * Loads config from DB, polls Graph deltas, links emails.
 * Returns false if not initialized (missing mailbox/watchFolderId config).
 */
export async function pollFolderWatcher(): Promise<boolean> {
  const mailbox = await getConfig("mailbox");
  const watchFolderId = await getConfig("watch_folder_id");

  if (!(mailbox && watchFolderId)) {
    console.warn(
      "[FolderWatcher] Not initialized (missing mailbox/watch_folder_id config). Skipping."
    );
    return false;
  }

  const startTime = Date.now();

  // Step 1: Folder changes
  const currentFolderDelta = await getConfig("folders_delta_link");
  let folderResult: FolderDeltaResult;

  try {
    folderResult = await foldersDelta(mailbox, currentFolderDelta);
  } catch (err) {
    if (err instanceof DeltaExpiredError) {
      console.warn(
        "[FolderWatcher] Folder delta token expired, doing full resync"
      );
      await setConfig("folders_delta_link", "");
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
      await handleDeletedFolder(folder);
      continue;
    }

    const tracked = await hubDb
      .query<{ display_name: string }, [string]>(
        "SELECT display_name FROM tracked_folders WHERE folder_id = $1"
      )
      .get(folder.id);

    if (!tracked) {
      await handleNewFolder(folder);
    } else if (tracked.display_name !== folder.displayName) {
      await handleRenamedFolder(folder, tracked.display_name);
    }
  }

  await setConfig("folders_delta_link", folderResult.deltaLink);

  // Step 2: Message changes per tracked folder
  const tracked = await getTrackedFolders();

  for (const folder of tracked) {
    if (folder.project_id === null) {
      continue;
    }

    await pollTrackedFolderMessages(mailbox, {
      ...folder,
      project_id: folder.project_id,
    });
  }

  await setConfig("last_poll_at", new Date().toISOString());

  const elapsed = Date.now() - startTime;
  console.log(
    `[FolderWatcher] Poll complete: ${relevantFolderChanges.length} folder changes, ${tracked.length} folders checked (${elapsed}ms)`
  );

  return true;
}
