/**
 * projects.db operations for the folder watcher.
 * Creates projects when new Outlook folders are detected.
 */

import { Database } from "bun:sqlite";

const PROJECTS_DB_PATH =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract/projects/projects.db";

let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (_db) {
    return _db;
  }
  _db = new Database(PROJECTS_DB_PATH);
  _db.run("PRAGMA busy_timeout = 5000;");
  _db.run("PRAGMA journal_mode = WAL;");
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * Parse folder name into project name and contractor.
 *
 * Observed patterns in existing outlook_folder values:
 *   "Allasso Ranch - Weis Builders"
 *   "67 Flats - Phase 1 - Weis Builders"
 *   "22-01-0084 - Pacific Tek - Ganem Construction"
 *   "Alta Goldwater - Wood Partners"
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

function getNextProjectNumber(): string {
  const db = getDb();
  const result = db
    .query<{ max_num: string | null }, []>(
      "SELECT MAX(CAST(project_number AS INTEGER)) as max_num FROM projects"
    )
    .get();

  const maxNum = result?.max_num ? Number.parseInt(result.max_num, 10) : 1000;
  return String(maxNum + 1);
}

/**
 * Find existing project or create a new one from an Outlook folder name.
 * Returns the projects.db project id.
 */
export function findOrCreateProject(folderName: string): {
  projectId: number;
  projectNumber: string;
  created: boolean;
} {
  const db = getDb();
  const { projectName, contractor } = parseFolderName(folderName);

  // 1. Check by exact outlook_folder match
  const byFolder = db
    .query<{ id: number; project_number: string }, [string]>(
      "SELECT id, project_number FROM projects WHERE outlook_folder = ?"
    )
    .get(folderName);

  if (byFolder) {
    return {
      projectId: byFolder.id,
      projectNumber: byFolder.project_number,
      created: false,
    };
  }

  // 2. Check by project_name match
  const byName = db
    .query<{ id: number; project_number: string }, [string]>(
      "SELECT id, project_number FROM projects WHERE project_name = ?"
    )
    .get(projectName);

  if (byName) {
    // Link the existing project to this folder
    db.run(
      "UPDATE projects SET outlook_folder = ?, updated_at = datetime('now') WHERE id = ?",
      [folderName, byName.id]
    );
    return {
      projectId: byName.id,
      projectNumber: byName.project_number,
      created: false,
    };
  }

  // 3. Create new project
  const projectNumber = getNextProjectNumber();
  const result = db.run(
    `INSERT INTO projects (project_number, project_name, contractor, outlook_folder)
     VALUES (?, ?, ?, ?)`,
    [projectNumber, projectName, contractor, folderName]
  );

  return {
    projectId: Number(result.lastInsertRowid),
    projectNumber,
    created: true,
  };
}

/**
 * Find a project by folder name without creating.
 * Used during init to match existing folders to existing projects.
 */
export function findProjectByName(
  folderName: string
): { projectId: number; projectNumber: string } | null {
  const db = getDb();
  const { projectName } = parseFolderName(folderName);

  // Try by outlook_folder first
  const byFolder = db
    .query<{ id: number; project_number: string }, [string]>(
      "SELECT id, project_number FROM projects WHERE outlook_folder = ?"
    )
    .get(folderName);

  if (byFolder) {
    return { projectId: byFolder.id, projectNumber: byFolder.project_number };
  }

  // Try by project_name
  const byName = db
    .query<{ id: number; project_number: string }, [string]>(
      "SELECT id, project_number FROM projects WHERE project_name = ?"
    )
    .get(projectName);

  if (byName) {
    return { projectId: byName.id, projectNumber: byName.project_number };
  }

  return null;
}
