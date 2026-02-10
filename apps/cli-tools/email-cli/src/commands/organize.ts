/**
 * Email organization commands.
 *
 * Primary use case: hydrate Outlook project folders by moving all messages
 * already linked to a hub.db project into that project's tracked folder.
 */
import { parseArgs } from "node:util";
import {
  assertWritableMailbox,
  DEFAULT_USER,
  getAppClient,
} from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";
import { db } from "@lib/db/hub";
import { getMailbox } from "@lib/db/repositories/mailbox";
import {
  findProjectByText,
  getProjectById,
} from "@lib/db/repositories/project";
import type { Project } from "@lib/db/types";

const WELL_KNOWN_MOVE_DESTS = new Set([
  "inbox",
  "drafts",
  "sentitems",
  "deleteditems",
  "archive",
  "junkemail",
]);

interface FolderMeta {
  id: string;
  displayName: string;
  parentFolderId: string | null;
}

function createFolderLabeler(options: {
  userId: string;
  paths: boolean;
  maxDepth: number;
}): {
  label: (folderId: string) => Promise<string>;
} {
  const client = getAppClient();
  const metaCache = new Map<string, FolderMeta | null>();
  const inFlight = new Map<string, Promise<FolderMeta | null>>();
  const labelCache = new Map<string, string>();

  const getMeta = async (folderId: string): Promise<FolderMeta | null> => {
    if (metaCache.has(folderId)) {
      return metaCache.get(folderId) ?? null;
    }
    const existing = inFlight.get(folderId);
    if (existing) {
      return await existing;
    }

    const p = client
      .getFolderById(folderId, options.userId)
      .then((meta) => {
        metaCache.set(folderId, meta);
        return meta;
      })
      .finally(() => {
        inFlight.delete(folderId);
      });

    inFlight.set(folderId, p);
    return await p;
  };

  const label = async (folderId: string): Promise<string> => {
    const cached = labelCache.get(folderId);
    if (cached) {
      return cached;
    }

    const meta = await getMeta(folderId);
    if (!meta) {
      labelCache.set(folderId, folderId);
      return folderId;
    }

    if (!options.paths) {
      labelCache.set(folderId, meta.displayName);
      return meta.displayName;
    }

    const parts: string[] = [];
    const seen = new Set<string>();
    let current: FolderMeta | null = meta;
    let depth = 0;

    while (current && depth < options.maxDepth) {
      parts.unshift(current.displayName);
      if (!current.parentFolderId) {
        break;
      }

      if (seen.has(current.parentFolderId)) {
        break;
      }
      seen.add(current.parentFolderId);

      current = await getMeta(current.parentFolderId);
      depth++;
    }

    const out = parts.join("/");
    labelCache.set(folderId, out);
    return out;
  };

  return { label };
}

function formatDate(d: Date): string {
  // ISO date only is easiest to scan in terminals
  return d.toISOString().slice(0, 10);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) {
          return;
        }
        results[index] = await fn(items[index], index);
      }
    })()
  );

  await Promise.all(workers);
  return results;
}

async function resolveProject(projectArg: string): Promise<Project> {
  const trimmed = projectArg.trim();
  if (!trimmed) {
    throw new Error("Project is required.");
  }

  // Numeric ID
  const maybeId = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(maybeId) && String(maybeId) === trimmed) {
    const byId = await getProjectById(maybeId);
    if (!byId) {
      throw new Error(`No project found with id=${maybeId}.`);
    }
    return byId;
  }

  // Exact outlook_folder match (common when user pastes folder name)
  const byFolder = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE outlook_folder = ? LIMIT 1"
    )
    .get(trimmed);
  if (byFolder) {
    const p = await getProjectById(byFolder.id);
    if (p) {
      return p;
    }
  }

  // Alias / normalized name
  const byText = await findProjectByText(trimmed);
  if (byText) {
    return byText;
  }

  // Give suggestions (best-effort)
  const suggestions = await db
    .query<
      { id: number; name: string; outlook_folder: string | null },
      [string]
    >(
      `SELECT id, name, outlook_folder
       FROM projects
       WHERE name ILIKE '%' || ? || '%'
          OR outlook_folder ILIKE '%' || ? || '%'
       ORDER BY last_seen DESC NULLS LAST
       LIMIT 10`
    )
    .all(trimmed, trimmed);

  const suggestionText =
    suggestions.length > 0
      ? `\n\nClosest matches:\n${suggestions
          .map(
            (s) =>
              `- #${s.id}: ${s.name}${s.outlook_folder ? ` (folder: ${s.outlook_folder})` : ""}`
          )
          .join("\n")}`
      : "";

  throw new Error(`No project found matching "${trimmed}".${suggestionText}`);
}

async function getTrackedFolderForProject(project: Project): Promise<{
  folderId: string;
  displayName: string;
  parentFolderId: string;
} | null> {
  const rows = await db
    .query<
      { folder_id: string; display_name: string; parent_folder_id: string },
      [number]
    >(
      "SELECT folder_id, display_name, parent_folder_id FROM tracked_folders WHERE project_id = ?"
    )
    .all(project.id);

  if (rows.length === 1) {
    return {
      folderId: rows[0].folder_id,
      displayName: rows[0].display_name,
      parentFolderId: rows[0].parent_folder_id,
    };
  }

  if (rows.length > 1) {
    const preferred = project.outlookFolder
      ? rows.find((r) => r.display_name === project.outlookFolder)
      : undefined;
    const pick = preferred ?? rows[0];
    return {
      folderId: pick.folder_id,
      displayName: pick.display_name,
      parentFolderId: pick.parent_folder_id,
    };
  }

  // Not linked in tracked_folders yet; try matching by display name if we know it.
  if (project.outlookFolder) {
    const byName = await db
      .query<
        {
          folder_id: string;
          display_name: string;
          parent_folder_id: string;
          project_id: number | null;
        },
        [string]
      >(
        "SELECT folder_id, display_name, parent_folder_id, project_id FROM tracked_folders WHERE display_name = ? LIMIT 1"
      )
      .get(project.outlookFolder);

    if (byName) {
      if (byName.project_id === null) {
        await db.run(
          "UPDATE tracked_folders SET project_id = $1 WHERE folder_id = $2",
          [project.id, byName.folder_id]
        );
      }
      return {
        folderId: byName.folder_id,
        displayName: byName.display_name,
        parentFolderId: byName.parent_folder_id,
      };
    }
  }

  return null;
}

async function getFolderWatcherConfigValue(
  key: string
): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM folder_watcher_config WHERE key = ?"
    )
    .get(key);
  return row?.value ?? null;
}

async function upsertTrackedFolder(row: {
  folderId: string;
  displayName: string;
  parentFolderId: string;
  projectId: number;
}): Promise<void> {
  await db.run(
    `INSERT INTO tracked_folders (folder_id, display_name, parent_folder_id, project_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (folder_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       parent_folder_id = EXCLUDED.parent_folder_id,
       project_id = EXCLUDED.project_id`,
    [row.folderId, row.displayName, row.parentFolderId, row.projectId]
  );
}

async function updateEmailMessageIdInDb(options: {
  mailboxId: number;
  oldMessageId: string;
  newMessageId: string;
  internetMessageId?: string;
}): Promise<
  | {
      ok: true;
      updatedRows: number;
      method: "message_id" | "internet_message_id" | "skipped";
    }
  | { ok: false; error: string }
> {
  const { mailboxId, oldMessageId, newMessageId, internetMessageId } = options;

  try {
    // Best case: we have the exact row.
    const direct = await db.run(
      "UPDATE emails SET message_id = $1 WHERE mailbox_id = $2 AND message_id = $3",
      [newMessageId, mailboxId, oldMessageId]
    );
    if (direct.count > 0) {
      return { ok: true, updatedRows: direct.count, method: "message_id" };
    }

    // Fallback: update by internet_message_id, but only if it uniquely identifies a row in this mailbox.
    if (internetMessageId) {
      const countRow = await db
        .query<{ count: number }, [number, string]>(
          "SELECT COUNT(*)::int AS count FROM emails WHERE mailbox_id = ? AND internet_message_id = ?"
        )
        .get(mailboxId, internetMessageId);

      const count = countRow?.count ?? 0;
      if (count === 1) {
        const byIid = await db.run(
          "UPDATE emails SET message_id = $1 WHERE mailbox_id = $2 AND internet_message_id = $3",
          [newMessageId, mailboxId, internetMessageId]
        );
        return {
          ok: true,
          updatedRows: byIid.count,
          method: "internet_message_id",
        };
      }
    }

    return { ok: true, updatedRows: 0, method: "skipped" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function moveMessageCommand(options: {
  messageId: string;
  destinationId: string;
  userId: string;
  apply: boolean;
  skipDbUpdate: boolean;
}) {
  assertWritableMailbox(options.userId, "move");

  if (!options.apply) {
    console.log(
      `[DRY RUN] Would move message ${options.messageId} -> ${options.destinationId} (mailbox: ${options.userId})`
    );
    return;
  }

  const client = getAppClient();
  const moved = await client.moveEmail(
    options.messageId,
    options.destinationId,
    options.userId
  );
  console.log(`Moved. New message ID: ${moved.id}`);

  if (options.skipDbUpdate) {
    return;
  }

  const mailbox = await getMailbox(options.userId);
  if (!mailbox) {
    console.warn(
      `[WARN] Mailbox "${options.userId}" not found in hub.db; skipping DB message_id update.`
    );
    return;
  }

  const upd = await updateEmailMessageIdInDb({
    mailboxId: mailbox.id,
    oldMessageId: options.messageId,
    newMessageId: moved.id,
    internetMessageId: moved.internetMessageId,
  });

  if (!upd.ok) {
    console.warn(`[WARN] DB update failed: ${upd.error}`);
    return;
  }
  if (upd.updatedRows > 0) {
    console.log(`DB updated: ${upd.updatedRows} row(s) (${upd.method})`);
  }
}

async function moveThreadCommand(options: {
  messageId: string;
  destinationId: string;
  userId: string;
  apply: boolean;
  maxDepth: number;
  showPaths: boolean;
  limit: number;
  skipDbUpdate: boolean;
}) {
  assertWritableMailbox(options.userId, "move-thread");

  if (WELL_KNOWN_MOVE_DESTS.has(options.destinationId.toLowerCase())) {
    throw new Error(
      "move-thread requires a folder ID destination. " +
        "For well-known folders, move individual messages (move ...) or resolve the folder ID first via folders --recursive."
    );
  }

  const client = getAppClient();

  const thread = await client.getThreadByMessageId(
    options.messageId,
    options.userId
  );

  if (thread.length === 0) {
    console.log("Thread not found.");
    return;
  }

  const toMove = thread.filter(
    (m) => m.parentFolderId && m.parentFolderId !== options.destinationId
  );
  const limited = options.limit > 0 ? toMove.slice(0, options.limit) : toMove;

  const folderLabeler = createFolderLabeler({
    userId: options.userId,
    paths: options.showPaths,
    maxDepth: options.maxDepth,
  });

  const uniqueFolderIds = [
    ...new Set(
      limited
        .map((m) => m.parentFolderId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  await Promise.all(uniqueFolderIds.map((id) => folderLabeler.label(id)));
  const destLabel = await folderLabeler.label(options.destinationId);

  console.log(
    `Thread: ${thread.length} message(s), moving ${limited.length} message(s) to folder ${destLabel} (${options.destinationId})\n`
  );
  for (const m of limited) {
    const fromPath = m.parentFolderId
      ? await folderLabeler.label(m.parentFolderId)
      : "(unknown)";
    console.log(
      `- [${formatDate(m.receivedDateTime)}] ${m.subject} (from: ${m.fromEmail})`
    );
    console.log(`  from: ${fromPath}`);
    console.log(`  id: ${m.id}\n`);
  }

  if (!options.apply) {
    console.log("[DRY RUN] No messages moved. Re-run with --apply to execute.");
    return;
  }

  let movedCount = 0;
  let dbUpdated = 0;
  let dbSkipped = 0;
  let dbErrors = 0;

  const mailbox = options.skipDbUpdate
    ? null
    : await getMailbox(options.userId);
  const canUpdateDb = Boolean(mailbox);
  if (!(options.skipDbUpdate || mailbox)) {
    console.warn(
      `[WARN] Mailbox "${options.userId}" not found in hub.db; skipping DB message_id updates.`
    );
  }

  for (const m of limited) {
    const movedMsg = await client.moveEmail(
      m.id,
      options.destinationId,
      options.userId
    );
    movedCount++;

    if (canUpdateDb && mailbox) {
      const upd = await updateEmailMessageIdInDb({
        mailboxId: mailbox.id,
        oldMessageId: m.id,
        newMessageId: movedMsg.id,
        internetMessageId: m.internetMessageId,
      });

      if (!upd.ok) {
        dbErrors++;
      } else if (upd.updatedRows > 0) {
        dbUpdated += upd.updatedRows;
      } else {
        dbSkipped++;
      }
    }
  }

  console.log(`Done. Moved ${movedCount} message(s).`);
  if (canUpdateDb) {
    console.log(`DB message_id updates: ${dbUpdated}`);
    console.log(`DB updates skipped: ${dbSkipped}`);
    if (dbErrors > 0) {
      console.log(`DB update errors: ${dbErrors}`);
    }
  }
}

async function listProjectFoldersCommand() {
  const rows = await db
    .query<
      {
        display_name: string;
        folder_id: string;
        project_id: number | null;
        project_name: string | null;
      },
      []
    >(
      `SELECT tf.display_name, tf.folder_id, tf.project_id, p.name AS project_name
       FROM tracked_folders tf
       LEFT JOIN projects p ON p.id = tf.project_id
       ORDER BY tf.display_name`
    )
    .all();

  if (rows.length === 0) {
    console.log("No tracked project folders found (tracked_folders is empty).");
    return;
  }

  for (const r of rows) {
    let projectLabel = "(unmatched)";
    if (r.project_id) {
      projectLabel = r.project_name
        ? `#${r.project_id} ${r.project_name}`
        : `#${r.project_id}`;
    }
    console.log(`- ${r.display_name}`);
    console.log(`  folderId: ${r.folder_id}`);
    console.log(`  project: ${projectLabel}\n`);
  }
}

async function createProjectFolderCommand(options: {
  projectArg: string;
  userId: string;
  apply: boolean;
}) {
  assertWritableMailbox(options.userId, "project-folder-create");

  const project = await resolveProject(options.projectArg);

  const existing = await getTrackedFolderForProject(project);
  if (existing) {
    console.log(
      `Project already has a tracked folder:\n- ${existing.displayName}\n  folderId: ${existing.folderId}`
    );
    return;
  }

  const watchFolderId = await getFolderWatcherConfigValue("watch_folder_id");
  const configMailbox = await getFolderWatcherConfigValue("mailbox");

  if (!watchFolderId) {
    throw new Error(
      "Folder watcher is not initialized (missing folder_watcher_config.watch_folder_id). Run: bun apps/workers/outlook-folder-watcher/cli/init.ts"
    );
  }
  if (
    configMailbox &&
    configMailbox.toLowerCase() !== options.userId.toLowerCase()
  ) {
    console.warn(
      `[WARN] folder_watcher_config.mailbox=${configMailbox} but you requested --user ${options.userId}. Proceeding anyway.`
    );
  }

  const desiredName =
    project.outlookFolder ??
    (project.contractor
      ? `${project.name} - ${project.contractor}`
      : project.name);

  if (!options.apply) {
    console.log(
      `[DRY RUN] Would create Outlook folder "${desiredName}" under watch folder ${watchFolderId}`
    );
    console.log(
      `[DRY RUN] Would upsert tracked_folders + update projects.outlook_folder for project #${project.id}`
    );
    return;
  }

  const client = getAppClient();
  const created = await client.createFolder(
    desiredName,
    options.userId,
    watchFolderId
  );

  await upsertTrackedFolder({
    folderId: created.id,
    displayName: created.displayName,
    parentFolderId: watchFolderId,
    projectId: project.id,
  });

  await db.run(
    "UPDATE projects SET outlook_folder = $1, updated_at = now() WHERE id = $2",
    [created.displayName, project.id]
  );

  console.log(
    `Created folder:\n- ${created.displayName}\n  folderId: ${created.id}`
  );
}

async function mkdirProjectFolderCommand(options: {
  folderName: string;
  userId: string;
  apply: boolean;
}) {
  assertWritableMailbox(options.userId, "project-folder-mkdir");

  const watchFolderId = await getFolderWatcherConfigValue("watch_folder_id");
  if (!watchFolderId) {
    throw new Error(
      "Folder watcher is not initialized (missing folder_watcher_config.watch_folder_id). Run: bun apps/workers/outlook-folder-watcher/cli/init.ts"
    );
  }

  if (!options.apply) {
    console.log(
      `[DRY RUN] Would create Outlook folder "${options.folderName}" under watch folder ${watchFolderId}`
    );
    console.log(
      "[DRY RUN] Folder watcher should pick this up and create/link a hub project on the next poll."
    );
    return;
  }

  const client = getAppClient();
  const created = await client.createFolder(
    options.folderName,
    options.userId,
    watchFolderId
  );

  console.log(
    `Created folder:\n- ${created.displayName}\n  folderId: ${created.id}`
  );
}

async function hydrateProjectFolderCommand(options: {
  projectArg: string;
  userId: string;
  apply: boolean;
  limit: number;
  maxThreads: number;
  includeMixed: boolean;
  showPaths: boolean;
  maxDepth: number;
  quiet: boolean;
  concurrency: number;
  skipDbUpdate: boolean;
}): Promise<{
  projectId: number;
  projectName: string;
  destinationFolderName: string;
  destinationFolderId: string;
  threadsConsidered: number;
  threadsSkippedMixed: number;
  messagesAlreadyInFolder: number;
  messagesToMove: number;
  orphanCount: number;
  moved: number;
  moveErrors: number;
  dbUpdated: number;
  dbSkipped: number;
  dbErrors: number;
}> {
  assertWritableMailbox(options.userId, "project-hydrate");

  const project = await resolveProject(options.projectArg);
  const dest = await getTrackedFolderForProject(project);
  if (!dest) {
    throw new Error(
      `No tracked folder found for project #${project.id} (${project.name}). ` +
        `Create the folder under Projects/Active/ first (or run: project-folder-create "${project.name}" --apply).`
    );
  }

  const mailbox = await getMailbox(options.userId);
  if (!mailbox) {
    throw new Error(
      `Mailbox "${options.userId}" not found in hub.db. Run email sync first so mailboxes.id exists.`
    );
  }

  const verbose = !options.quiet;
  const client = getAppClient();

  const threadRows = await db
    .query<
      {
        conversation_id: string;
        last_received_at: string;
        email_count: number;
      },
      [number, number, number]
    >(
      `SELECT conversation_id,
              MAX(received_at) AS last_received_at,
              COUNT(*)::int AS email_count
       FROM emails
       WHERE mailbox_id = ?
         AND project_id = ?
         AND conversation_id IS NOT NULL
       GROUP BY conversation_id
       ORDER BY last_received_at DESC NULLS LAST
       LIMIT ?`
    )
    .all(mailbox.id, project.id, options.maxThreads);

  const mixedConversationIds = new Set<string>();
  if (!options.includeMixed && threadRows.length > 0) {
    const conversationIds = threadRows
      .map((t) => t.conversation_id)
      .filter((id): id is string => Boolean(id));

    if (conversationIds.length > 0) {
      // Optimization: only compute "mixed" threads within this project's candidate thread list.
      const placeholders = conversationIds.map(() => "?").join(", ");
      const mixed = await db
        .query<{ conversation_id: string }>(
          `SELECT conversation_id
           FROM emails
           WHERE mailbox_id = ?
             AND conversation_id IN (${placeholders})
           GROUP BY conversation_id
           HAVING COUNT(DISTINCT project_id) > 1`
        )
        .all(mailbox.id, ...conversationIds);

      for (const r of mixed) {
        mixedConversationIds.add(r.conversation_id);
      }
    }
  }

  const orphanRow = await db
    .query<{ count: number }, [number, number]>(
      "SELECT COUNT(*)::int AS count FROM emails WHERE mailbox_id = ? AND project_id = ? AND conversation_id IS NULL"
    )
    .get(mailbox.id, project.id);
  const orphanCount = orphanRow?.count ?? 0;

  const toMove: Array<{
    id: string;
    internetMessageId?: string;
    subject: string;
    fromEmail: string;
    receivedDateTime: Date;
    parentFolderId?: string;
  }> = [];

  let threadsSkippedMixed = 0;
  let messagesAlreadyInFolder = 0;

  for (const t of threadRows) {
    if (!t.conversation_id) {
      continue;
    }
    if (mixedConversationIds.has(t.conversation_id)) {
      threadsSkippedMixed++;
      continue;
    }

    const thread = await client.getEmailThread(
      t.conversation_id,
      options.userId
    );
    for (const m of thread) {
      if (m.parentFolderId === dest.folderId) {
        messagesAlreadyInFolder++;
        continue;
      }
      toMove.push({
        id: m.id,
        internetMessageId: m.internetMessageId,
        subject: m.subject,
        fromEmail: m.fromEmail,
        receivedDateTime: m.receivedDateTime,
        parentFolderId: m.parentFolderId,
      });
      if (options.limit > 0 && toMove.length >= options.limit) {
        break;
      }
    }

    if (options.limit > 0 && toMove.length >= options.limit) {
      break;
    }
  }

  let moved = 0;
  let dbUpdated = 0;
  let dbSkipped = 0;
  let dbErrors = 0;
  let moveErrors = 0;

  if (verbose) {
    const folderLabeler = createFolderLabeler({
      userId: options.userId,
      paths: options.showPaths,
      maxDepth: options.maxDepth,
    });

    // Folder breakdown
    const byFolderId = new Map<string, number>();
    for (const m of toMove) {
      const key = m.parentFolderId ?? "(unknown)";
      byFolderId.set(key, (byFolderId.get(key) ?? 0) + 1);
    }

    const folderIds = [...byFolderId.keys()].filter((id) => id !== "(unknown)");
    const resolved = await Promise.all(
      folderIds.map(async (id) => [id, await folderLabeler.label(id)] as const)
    );
    const folderIdToLabel = new Map<string, string>(resolved);

    console.log(
      `Project #${project.id}: ${project.name}${project.contractor ? ` (${project.contractor})` : ""}`
    );
    console.log(`Mailbox: ${options.userId}`);
    console.log(`Destination folder: ${dest.displayName}`);
    console.log(`Destination folderId: ${dest.folderId}`);
    console.log(
      `Threads considered: ${threadRows.length} (maxThreads=${options.maxThreads})`
    );
    if (!options.includeMixed) {
      console.log(`Threads skipped (mixed projects): ${threadsSkippedMixed}`);
    }
    console.log(`Messages already in destination: ${messagesAlreadyInFolder}`);
    console.log(
      `Messages to move: ${toMove.length}${options.limit > 0 ? ` (limit=${options.limit})` : ""}`
    );
    if (orphanCount > 0) {
      console.log(
        `Orphan emails in DB (no conversationId): ${orphanCount} (not moved)`
      );
    }

    if (toMove.length === 0) {
      return {
        projectId: project.id,
        projectName: project.name,
        destinationFolderName: dest.displayName,
        destinationFolderId: dest.folderId,
        threadsConsidered: threadRows.length,
        threadsSkippedMixed,
        messagesAlreadyInFolder,
        messagesToMove: 0,
        orphanCount,
        moved: 0,
        moveErrors: 0,
        dbUpdated: 0,
        dbSkipped: 0,
        dbErrors: 0,
      };
    }

    console.log("\nBreakdown by current folder:");
    for (const [folderId, count] of [...byFolderId.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      const label =
        folderId === "(unknown)"
          ? "(unknown)"
          : (folderIdToLabel.get(folderId) ?? folderId);
      console.log(`- ${count}  ${label}`);
    }

    console.log("\nSample (first 15 to move):");
    for (const m of toMove.slice(0, 15)) {
      const fromPath = m.parentFolderId
        ? (folderIdToLabel.get(m.parentFolderId) ??
          (await folderLabeler.label(m.parentFolderId)))
        : "(unknown)";
      console.log(
        `- [${formatDate(m.receivedDateTime)}] ${m.subject} (from: ${m.fromEmail})`
      );
      console.log(`  from: ${fromPath}`);
      console.log(`  id: ${m.id}\n`);
    }
    if (toMove.length > 15) {
      console.log(`... and ${toMove.length - 15} more`);
    }

    if (!options.apply) {
      console.log(
        "\n[DRY RUN] No messages moved. Re-run with --apply to execute."
      );
      return {
        projectId: project.id,
        projectName: project.name,
        destinationFolderName: dest.displayName,
        destinationFolderId: dest.folderId,
        threadsConsidered: threadRows.length,
        threadsSkippedMixed,
        messagesAlreadyInFolder,
        messagesToMove: toMove.length,
        orphanCount,
        moved: 0,
        moveErrors: 0,
        dbUpdated: 0,
        dbSkipped: 0,
        dbErrors: 0,
      };
    }
  } else {
    // Quiet summary mode for batch operations
    console.log(
      `#${project.id} ${project.name} -> ${dest.displayName}: toMove=${toMove.length} already=${messagesAlreadyInFolder}${threadsSkippedMixed > 0 ? ` mixedThreadsSkipped=${threadsSkippedMixed}` : ""}`
    );

    if (toMove.length === 0) {
      return {
        projectId: project.id,
        projectName: project.name,
        destinationFolderName: dest.displayName,
        destinationFolderId: dest.folderId,
        threadsConsidered: threadRows.length,
        threadsSkippedMixed,
        messagesAlreadyInFolder,
        messagesToMove: 0,
        orphanCount,
        moved: 0,
        moveErrors: 0,
        dbUpdated: 0,
        dbSkipped: 0,
        dbErrors: 0,
      };
    }

    if (!options.apply) {
      return {
        projectId: project.id,
        projectName: project.name,
        destinationFolderName: dest.displayName,
        destinationFolderId: dest.folderId,
        threadsConsidered: threadRows.length,
        threadsSkippedMixed,
        messagesAlreadyInFolder,
        messagesToMove: toMove.length,
        orphanCount,
        moved: 0,
        moveErrors: 0,
        dbUpdated: 0,
        dbSkipped: 0,
        dbErrors: 0,
      };
    }
  }

  if (!options.apply) {
    // Non-verbose dry-run
    return {
      projectId: project.id,
      projectName: project.name,
      destinationFolderName: dest.displayName,
      destinationFolderId: dest.folderId,
      threadsConsidered: threadRows.length,
      threadsSkippedMixed,
      messagesAlreadyInFolder,
      messagesToMove: toMove.length,
      orphanCount,
      moved: 0,
      moveErrors: 0,
      dbUpdated: 0,
      dbSkipped: 0,
      dbErrors: 0,
    };
  }

  await mapWithConcurrency(toMove, options.concurrency, async (m) => {
    try {
      const movedMsg = await client.moveEmail(
        m.id,
        dest.folderId,
        options.userId
      );
      moved++;

      if (!options.skipDbUpdate) {
        const upd = await updateEmailMessageIdInDb({
          mailboxId: mailbox.id,
          oldMessageId: m.id,
          newMessageId: movedMsg.id,
          internetMessageId: m.internetMessageId,
        });
        if (!upd.ok) {
          dbErrors++;
        } else if (upd.updatedRows > 0) {
          dbUpdated += upd.updatedRows;
        } else {
          dbSkipped++;
        }
      }
    } catch (err) {
      moveErrors++;
      console.error(
        `[ERROR] Failed to move message ${m.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  console.log(
    verbose
      ? "\nDone."
      : `  moved=${moved}${moveErrors > 0 ? ` moveErrors=${moveErrors}` : ""}`
  );
  if (verbose) {
    console.log(`Moved: ${moved}`);
    if (moveErrors > 0) {
      console.log(`Move errors: ${moveErrors}`);
    }
    if (!options.skipDbUpdate) {
      console.log(`DB message_id updates: ${dbUpdated}`);
      console.log(`DB updates skipped: ${dbSkipped}`);
      if (dbErrors > 0) {
        console.log(`DB update errors: ${dbErrors}`);
      }
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    destinationFolderName: dest.displayName,
    destinationFolderId: dest.folderId,
    threadsConsidered: threadRows.length,
    threadsSkippedMixed,
    messagesAlreadyInFolder,
    messagesToMove: toMove.length,
    orphanCount,
    moved,
    moveErrors,
    dbUpdated,
    dbSkipped,
    dbErrors,
  };
}

async function hydrateTrackedProjectsCommand(options: {
  userId: string;
  apply: boolean;
  limit: number;
  maxThreads: number;
  includeMixed: boolean;
  maxProjects: number;
  concurrency: number;
  skipDbUpdate: boolean;
}) {
  assertWritableMailbox(options.userId, "project-hydrate-tracked");

  // Ensure mailbox exists before doing any work.
  const mailbox = await getMailbox(options.userId);
  if (!mailbox) {
    throw new Error(
      `Mailbox "${options.userId}" not found in hub.db. Run email sync first so mailboxes.id exists.`
    );
  }

  const limitSql = options.maxProjects > 0 ? "LIMIT ?" : "";
  const rows = await db
    .query<{ project_id: number; project_name: string }>(
      `SELECT p.id AS project_id, p.name AS project_name
       FROM projects p
       WHERE EXISTS (
         SELECT 1
         FROM tracked_folders tf
         WHERE tf.project_id = p.id
       )
       ORDER BY p.last_seen DESC NULLS LAST, p.id DESC
       ${limitSql}`
    )
    .all(...(options.maxProjects > 0 ? [options.maxProjects] : []));

  if (rows.length === 0) {
    console.log(
      "No tracked project folders linked to projects (tracked_folders.project_id is empty)."
    );
    return;
  }

  let projectsWithMoves = 0;
  let totalToMove = 0;
  let totalMoved = 0;
  let totalMoveErrors = 0;
  let totalDbUpdated = 0;
  let totalDbSkipped = 0;
  let totalDbErrors = 0;

  console.log(
    `Hydrating ${rows.length} tracked project(s) in mailbox ${options.userId}...${options.apply ? "" : " (dry-run)"}`
  );

  for (const r of rows) {
    const stats = await hydrateProjectFolderCommand({
      projectArg: String(r.project_id),
      userId: options.userId,
      apply: options.apply,
      limit: options.limit,
      maxThreads: options.maxThreads,
      includeMixed: options.includeMixed,
      showPaths: false,
      maxDepth: 0,
      quiet: true,
      concurrency: options.concurrency,
      skipDbUpdate: options.skipDbUpdate,
    });

    totalToMove += stats.messagesToMove;
    totalMoved += stats.moved;
    totalMoveErrors += stats.moveErrors;
    totalDbUpdated += stats.dbUpdated;
    totalDbSkipped += stats.dbSkipped;
    totalDbErrors += stats.dbErrors;
    if (stats.messagesToMove > 0) {
      projectsWithMoves++;
    }
  }

  console.log("\nSummary:");
  console.log(`- Projects scanned: ${rows.length}`);
  console.log(`- Projects needing moves: ${projectsWithMoves}`);
  console.log(`- Messages to move: ${totalToMove}`);
  if (options.apply) {
    console.log(`- Messages moved: ${totalMoved}`);
    if (totalMoveErrors > 0) {
      console.log(`- Move errors: ${totalMoveErrors}`);
    }
    if (!options.skipDbUpdate) {
      console.log(`- DB message_id updates: ${totalDbUpdated}`);
      console.log(`- DB updates skipped: ${totalDbSkipped}`);
      if (totalDbErrors > 0) {
        console.log(`- DB update errors: ${totalDbErrors}`);
      }
    }
  }
}

export const organizeHandlers: Record<string, CommandHandler> = {
  move: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        dest: { type: "string", short: "d" },
        apply: { type: "boolean", default: false },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const messageId = positionals[0];
    const destinationId = values.dest as string | undefined;
    if (!(messageId && destinationId)) {
      console.error(
        "Usage: move <messageId> --dest <folderId|wellKnown> [--user <mailbox>] [--apply]"
      );
      process.exit(1);
    }

    await moveMessageCommand({
      messageId,
      destinationId,
      userId: values.user as string,
      apply: values.apply ?? false,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "move-thread": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        dest: { type: "string", short: "d" },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        "max-depth": { type: "string", default: "10" },
        paths: { type: "boolean", default: true },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const messageId = positionals[0];
    const destinationId = values.dest as string | undefined;
    if (!(messageId && destinationId)) {
      console.error(
        "Usage: move-thread <messageId> --dest <folderId> [--user <mailbox>] [--apply] [--limit N]"
      );
      process.exit(1);
    }

    await moveThreadCommand({
      messageId,
      destinationId,
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxDepth: Number.parseInt(values["max-depth"] as string, 10) || 10,
      showPaths: values.paths ?? true,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "project-folders": async (_args) => {
    await listProjectFoldersCommand();
  },

  "project-folder-create": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        apply: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const projectArg = positionals[0];
    if (!projectArg) {
      console.error(
        "Usage: project-folder-create <projectId|name|outlookFolderName> [--user <mailbox>] [--apply]"
      );
      process.exit(1);
    }

    await createProjectFolderCommand({
      projectArg,
      userId: values.user as string,
      apply: values.apply ?? false,
    });
  },

  "project-folder-mkdir": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        apply: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const folderName = positionals[0];
    if (!folderName) {
      console.error(
        "Usage: project-folder-mkdir <folderDisplayName> [--user <mailbox>] [--apply]"
      );
      process.exit(1);
    }

    await mkdirProjectFolderCommand({
      folderName,
      userId: values.user as string,
      apply: values.apply ?? false,
    });
  },

  "project-hydrate": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        threads: { type: "string", short: "t", default: "200" },
        "include-mixed": { type: "boolean", default: false },
        paths: { type: "boolean", default: true },
        "max-depth": { type: "string", default: "10" },
        quiet: { type: "boolean", default: false },
        concurrency: { type: "string", default: "1" },
        "skip-db-update": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });

    const projectArg = positionals[0];
    if (!projectArg) {
      console.error(
        "Usage: project-hydrate <projectId|name|outlookFolderName> [--user <mailbox>] [--apply] [--limit N] [--threads N]"
      );
      process.exit(1);
    }

    await hydrateProjectFolderCommand({
      projectArg,
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxThreads: Number.parseInt(values.threads as string, 10) || 200,
      includeMixed: values["include-mixed"] ?? false,
      showPaths: values.paths ?? true,
      maxDepth: Number.parseInt(values["max-depth"] as string, 10) || 10,
      quiet: values.quiet ?? false,
      concurrency: Number.parseInt(values.concurrency as string, 10) || 1,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },

  "project-hydrate-tracked": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        apply: { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "0" },
        threads: { type: "string", short: "t", default: "50" },
        "include-mixed": { type: "boolean", default: false },
        "max-projects": { type: "string", default: "0" },
        concurrency: { type: "string", default: "4" },
        "skip-db-update": { type: "boolean", default: false },
      },
    });

    await hydrateTrackedProjectsCommand({
      userId: values.user as string,
      apply: values.apply ?? false,
      limit: Number.parseInt(values.limit as string, 10) || 0,
      maxThreads: Number.parseInt(values.threads as string, 10) || 50,
      includeMixed: values["include-mixed"] ?? false,
      maxProjects: Number.parseInt(values["max-projects"] as string, 10) || 0,
      concurrency: Number.parseInt(values.concurrency as string, 10) || 4,
      skipDbUpdate: values["skip-db-update"] ?? false,
    });
  },
};
