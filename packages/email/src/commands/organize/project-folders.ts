import { assertWritableMailbox, getAppClient } from "@email/commands/config";
import { db } from "@lib/db/hub";
import {
  getFolderWatcherConfigValue,
  getTrackedFolderForProject,
  resolveProject,
  upsertTrackedFolder,
} from "./repository";

export async function listProjectFoldersCommand(): Promise<void> {
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

  for (const row of rows) {
    let projectLabel = "(unmatched)";
    if (row.project_id) {
      projectLabel = row.project_name
        ? `#${row.project_id} ${row.project_name}`
        : `#${row.project_id}`;
    }
    console.log(`- ${row.display_name}`);
    console.log(`  folderId: ${row.folder_id}`);
    console.log(`  project: ${projectLabel}\n`);
  }
}

export async function createProjectFolderCommand(options: {
  projectArg: string;
  userId: string;
  apply: boolean;
}): Promise<void> {
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
      "Folder watcher is not initialized (missing folder_watcher_config.watch_folder_id). Run: bun apps/background-jobs/workers/outlook-folder-watcher/cli/init.ts"
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
    displayName: created.displayName,
    folderId: created.id,
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

export async function mkdirProjectFolderCommand(options: {
  folderName: string;
  userId: string;
  apply: boolean;
}): Promise<void> {
  assertWritableMailbox(options.userId, "project-folder-mkdir");

  const watchFolderId = await getFolderWatcherConfigValue("watch_folder_id");
  if (!watchFolderId) {
    throw new Error(
      "Folder watcher is not initialized (missing folder_watcher_config.watch_folder_id). Run: bun apps/background-jobs/workers/outlook-folder-watcher/cli/init.ts"
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
