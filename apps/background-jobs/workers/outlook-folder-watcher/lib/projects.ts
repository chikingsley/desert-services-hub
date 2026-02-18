/**
 * Project lookup and creation for the folder watcher.
 * Matches Outlook folder names to Postgres projects, creating if needed.
 */
import { db } from "@lib/db/hub";
import {
  findProjectByText,
  findProjectCandidates,
  getProjectById,
  normalizeProjectAlias,
  normalizeProjectNameKey,
} from "@lib/db/repositories/project";
import {
  resolveProjectMatchReview,
  upsertProjectMatchReview,
} from "@lib/db/repositories/project-match-review";

/**
 * Parse folder name into project name and contractor.
 *
 * Observed patterns in existing outlook_folder values:
 *   "Allasso Ranch - Weis Builders"
 *   "67 Flats - Phase 1 - Weis Builders"
 *   "22-01-0084 - Pacific Tek - Ganem Construction"
 *
 * Convention: last segment after " - " is the contractor.
 */
export function parseFolderName(name: string): {
  projectName: string;
  contractor: string | null;
} {
  const parts = name.split(" - ").map((p) => p.trim());

  if (parts.length >= 2) {
    const contractor = parts.at(-1) ?? "";
    const projectName = parts.slice(0, -1).join(" - ");
    return { projectName, contractor };
  }

  return { projectName: name, contractor: null };
}

/**
 * Find a project matching a folder name, or create one.
 * Tries: outlook_folder exact → shared ranked matcher → create new.
 */
export async function findProjectByFolder(
  folderName: string
): Promise<number | null> {
  const reviewKey = normalizeProjectAlias(folderName);

  // 1. Exact outlook_folder match
  const byFolder = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE outlook_folder = ?"
    )
    .get(folderName);
  if (byFolder) {
    await resolveProjectMatchReview({
      source: "folder_watcher",
      sourceKey: reviewKey,
      projectId: byFolder.id,
      resolutionNote: "resolved via outlook_folder exact match",
    });
    return byFolder.id;
  }

  // 2. Shared matcher (normalized exact + aliases + token overlap scoring)
  const { projectName, contractor } = parseFolderName(folderName);
  for (const text of new Set([folderName, projectName])) {
    const exact = await findProjectByText(text);
    if (!exact) {
      continue;
    }
    await adoptProjectForFolder({
      projectId: exact.id,
      folderName,
      projectName,
      contractor,
    });
    await resolveProjectMatchReview({
      source: "folder_watcher",
      sourceKey: reviewKey,
      projectId: exact.id,
      resolutionNote: "resolved via deterministic text match",
    });
    return exact.id;
  }

  const result = await findProjectCandidates({
    primaryText: folderName,
    aliasHints: [projectName],
    contractorHint: contractor,
    limit: 8,
  });
  const best = result?.decision.best;
  if (best && result.decision.autoLink) {
    const project = await getProjectById(best.projectId);
    if (project) {
      await adoptProjectForFolder({
        projectId: project.id,
        folderName,
        projectName,
        contractor,
      });
      await resolveProjectMatchReview({
        source: "folder_watcher",
        sourceKey: reviewKey,
        projectId: project.id,
        resolutionNote: "resolved via scored auto-link",
      });
      return project.id;
    }
  }

  if (result && result.candidates.length > 0) {
    await upsertProjectMatchReview({
      source: "folder_watcher",
      sourceKey: reviewKey,
      result,
      note: `Ambiguous folder match for "${folderName}"`,
    });
    return null;
  }

  // 3. No candidates — create a new project and mark any prior review resolved.
  const createdId = await createProjectFromFolder(
    folderName,
    projectName,
    normalizeProjectNameKey(projectName),
    contractor
  );
  await resolveProjectMatchReview({
    source: "folder_watcher",
    sourceKey: reviewKey,
    projectId: createdId,
    resolutionNote: "resolved by creating new project (no candidate matches)",
  });
  return createdId;
}

/**
 * Create a new project from an Outlook folder name.
 */
async function createProjectFromFolder(
  folderName: string,
  projectName: string,
  normalizedName: string,
  contractor: string | null
): Promise<number> {
  const row = await db
    .query<{ id: number }, [string, string, string, string | null]>(
      `INSERT INTO projects (name, normalized_name, outlook_folder, contractor)
       VALUES (?, ?, ?, ?)
       RETURNING id`
    )
    .get(projectName, normalizedName, folderName, contractor);

  const id = row?.id;
  if (!id) {
    throw new Error(`Failed to create project for folder: ${folderName}`);
  }
  console.log(
    `  → Created project #${id}: "${projectName}"${contractor ? ` (${contractor})` : ""}`
  );
  return id;
}

async function adoptProjectForFolder(params: {
  projectId: number;
  folderName: string;
  projectName: string;
  contractor: string | null;
}): Promise<void> {
  await db.run(
    `UPDATE projects
     SET
       outlook_folder = COALESCE(outlook_folder, ?),
       contractor = COALESCE(contractor, ?),
       lifecycle_state = CASE
         WHEN lifecycle_state = 'archived' THEN lifecycle_state
         ELSE 'active'
       END,
       promoted_at = CASE
         WHEN lifecycle_state = 'archived' THEN promoted_at
         ELSE COALESCE(promoted_at, now())
       END,
       lost_at = CASE
         WHEN lifecycle_state = 'archived' THEN lost_at
         ELSE NULL
       END,
       updated_at = now()
     WHERE id = ?`,
    [params.folderName, params.contractor, params.projectId]
  );
}
