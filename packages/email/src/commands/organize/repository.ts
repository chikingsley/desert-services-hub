import { db } from "@lib/db/client";
import { getMailbox } from "@lib/db/repositories/mailbox";
import {
  findProjectByText,
  getProjectById,
} from "@lib/db/repositories/project";
import type { Project } from "@lib/db/types";

export interface TrackedFolderCandidate {
  folderId: string;
  displayName: string;
  parentFolderId: string;
}

type EmailMessageIdUpdateResult =
  | {
      ok: true;
      updatedRows: number;
      method: "message_id" | "internet_message_id" | "skipped";
    }
  | { ok: false; error: string };

export async function resolveProject(projectArg: string): Promise<Project> {
  const trimmed = projectArg.trim();
  if (!trimmed) {
    throw new Error("Project is required.");
  }

  const maybeId = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(maybeId) && String(maybeId) === trimmed) {
    const byId = await getProjectById(maybeId);
    if (!byId) {
      throw new Error(`No project found with id=${maybeId}.`);
    }
    return byId;
  }

  const byFolder = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE outlook_folder = $1 LIMIT 1"
    )
    .get(trimmed);
  if (byFolder) {
    const project = await getProjectById(byFolder.id);
    if (project) {
      return project;
    }
  }

  const byText = await findProjectByText(trimmed);
  if (byText) {
    return byText;
  }

  const suggestions = await db
    .query<
      { id: number; name: string; outlook_folder: string | null },
      [string]
    >(
      `SELECT id, name, outlook_folder
       FROM projects
       WHERE name ILIKE '%' || $1 || '%'
          OR outlook_folder ILIKE '%' || $2 || '%'
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

export async function getTrackedFolderForProject(
  project: Project
): Promise<TrackedFolderCandidate | null> {
  const rows = await db
    .query<
      { folder_id: string; display_name: string; parent_folder_id: string },
      [number]
    >(
      "SELECT folder_id, display_name, parent_folder_id FROM tracked_folders WHERE project_id = $1"
    )
    .all(project.id);

  if (rows.length === 1) {
    return {
      displayName: rows[0].display_name,
      folderId: rows[0].folder_id,
      parentFolderId: rows[0].parent_folder_id,
    };
  }

  if (rows.length > 1) {
    const preferred = project.outlookFolder
      ? rows.find((r) => r.display_name === project.outlookFolder)
      : undefined;
    const pick = preferred ?? rows[0];
    return {
      displayName: pick.display_name,
      folderId: pick.folder_id,
      parentFolderId: pick.parent_folder_id,
    };
  }

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
        "SELECT folder_id, display_name, parent_folder_id, project_id FROM tracked_folders WHERE display_name = $1 LIMIT 1"
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
        displayName: byName.display_name,
        folderId: byName.folder_id,
        parentFolderId: byName.parent_folder_id,
      };
    }
  }

  return null;
}

export async function getFolderWatcherConfigValue(
  key: string
): Promise<string | null> {
  const row = await db
    .query<{ value: string }, [string]>(
      "SELECT value FROM folder_watcher_config WHERE key = $1"
    )
    .get(key);
  return row?.value ?? null;
}

export async function upsertTrackedFolder(row: {
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

export function getMailboxByUser(userId: string) {
  return getMailbox(userId);
}

export async function updateEmailMessageIdInDb(options: {
  mailboxId: number;
  oldMessageId: string;
  newMessageId: string;
  internetMessageId?: string;
}): Promise<EmailMessageIdUpdateResult> {
  const { mailboxId, oldMessageId, newMessageId, internetMessageId } = options;

  try {
    const direct = await db.run(
      "UPDATE emails SET message_id = $1 WHERE mailbox_id = $2 AND message_id = $3",
      [newMessageId, mailboxId, oldMessageId]
    );
    if (direct.count > 0) {
      return { method: "message_id", ok: true, updatedRows: direct.count };
    }

    if (internetMessageId) {
      const countRow = await db
        .query<{ count: number }, [number, string]>(
          "SELECT COUNT(*)::int AS count FROM emails WHERE mailbox_id = $1 AND internet_message_id = $2"
        )
        .get(mailboxId, internetMessageId);

      const count = countRow?.count ?? 0;
      if (count === 1) {
        const byIid = await db.run(
          "UPDATE emails SET message_id = $1 WHERE mailbox_id = $2 AND internet_message_id = $3",
          [newMessageId, mailboxId, internetMessageId]
        );
        return {
          method: "internet_message_id",
          ok: true,
          updatedRows: byIid.count,
        };
      }
    }

    return { method: "skipped", ok: true, updatedRows: 0 };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
