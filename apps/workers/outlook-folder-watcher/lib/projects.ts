/**
 * Project lookup for the folder watcher.
 * Matches Outlook folder names to existing hub.db projects.
 * NEVER creates projects — lookup only.
 */
import { db } from "@lib/db/hub";

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
 * Find an existing hub.db project matching a folder name.
 * Tries: outlook_folder exact match → normalized_name → project_aliases.
 * Returns project ID or null. Never creates.
 */
export async function findProjectByFolder(
  folderName: string
): Promise<number | null> {
  // 1. Exact outlook_folder match
  const byFolder = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE outlook_folder = ?"
    )
    .get(folderName);
  if (byFolder) {
    return byFolder.id;
  }

  // 2. Full folder name against normalized_name
  //    Handles cases like "Fox Residence - 6505 N 43rd Place" where the full
  //    string IS the project name (not "PROJECT - CONTRACTOR" format)
  const fullNormalized = folderName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byFullName = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE normalized_name = ?"
    )
    .get(fullNormalized);
  if (byFullName) {
    return byFullName.id;
  }

  // 3. Parsed project name (strips contractor suffix) against normalized_name
  const { projectName } = parseFolderName(folderName);
  const normalized = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized !== fullNormalized) {
    const byParsedName = await db
      .query<{ id: number }, [string]>(
        "SELECT id FROM projects WHERE normalized_name = ?"
      )
      .get(normalized);
    if (byParsedName) {
      return byParsedName.id;
    }
  }

  // 4. Project alias match (try both full and parsed)
  for (const text of [folderName, projectName]) {
    const aliasNorm = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();
    const byAlias = await db
      .query<{ project_id: number }, [string]>(
        "SELECT project_id FROM project_aliases WHERE normalized_alias = ?"
      )
      .get(aliasNorm);
    if (byAlias) {
      return byAlias.project_id;
    }
  }

  return null;
}
