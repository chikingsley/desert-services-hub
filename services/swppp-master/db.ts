/**
 * SWPPP Master SQLite Database
 *
 * Local SQLite storage for SWPPP Master data.
 * Enables fast queries without hitting SharePoint API.
 */

import { Database } from "bun:sqlite";
import type { SwpppProject } from "./client";
import type { WorksheetName } from "./config";

// ============================================================================
// Database Setup
// ============================================================================

const DB_PATH = "swppp-master.db";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_number INTEGER NOT NULL,
      worksheet TEXT NOT NULL,
      date TEXT,
      contractor TEXT,
      job_name TEXT,
      address TEXT,
      contact TEXT,
      phone TEXT,
      work_description TEXT,
      date_entered TEXT,
      comments TEXT,
      invoice TEXT,
      work_completed TEXT,
      synced_at TEXT NOT NULL,
      UNIQUE(worksheet, row_number)
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_job_name
    ON projects(job_name)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_contractor
    ON projects(contractor)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_worksheet
    ON projects(worksheet)
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worksheet TEXT NOT NULL,
      rows_synced INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    )
  `);
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Convert Excel serial date to ISO string
 */
function excelDateToISO(excelDate: number | string | null): string | null {
  if (excelDate === null || excelDate === "") return null;
  if (typeof excelDate === "string") return excelDate;

  // Excel serial date: days since 1899-12-30
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + excelDate * 86_400_000);
  return date.toISOString().split("T")[0] ?? null;
}

/**
 * Insert or update projects from SharePoint data
 */
export function upsertProjects(
  projects: SwpppProject[],
  worksheet: WorksheetName
): number {
  const database = getDb();
  const syncedAt = new Date().toISOString();
  const startedAt = syncedAt;

  const upsert = database.prepare(`
    INSERT INTO projects (
      row_number, worksheet, date, contractor, job_name, address,
      contact, phone, work_description, date_entered, comments,
      invoice, work_completed, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(worksheet, row_number) DO UPDATE SET
      date = excluded.date,
      contractor = excluded.contractor,
      job_name = excluded.job_name,
      address = excluded.address,
      contact = excluded.contact,
      phone = excluded.phone,
      work_description = excluded.work_description,
      date_entered = excluded.date_entered,
      comments = excluded.comments,
      invoice = excluded.invoice,
      work_completed = excluded.work_completed,
      synced_at = excluded.synced_at
  `);

  let count = 0;
  for (const p of projects) {
    upsert.run(
      p.rowNumber,
      p.worksheet,
      excelDateToISO(p.date),
      p.contractor,
      p.jobName,
      p.address,
      p.contact,
      p.phone,
      p.workDescription,
      excelDateToISO(p.dateEntered),
      p.comments,
      p.invoice,
      p.workCompleted,
      syncedAt
    );
    count++;
  }

  // Log sync
  const completedAt = new Date().toISOString();
  database
    .prepare(
      `
    INSERT INTO sync_log (worksheet, rows_synced, started_at, completed_at)
    VALUES (?, ?, ?, ?)
  `
    )
    .run(worksheet, count, startedAt, completedAt);

  return count;
}

/**
 * Clear all data for a worksheet (for full refresh)
 */
export function clearWorksheet(worksheet: WorksheetName): void {
  const database = getDb();
  database.prepare("DELETE FROM projects WHERE worksheet = ?").run(worksheet);
}

/**
 * Get last sync time for a worksheet
 */
export function getLastSyncTime(worksheet: WorksheetName): string | null {
  const database = getDb();
  const row = database
    .prepare(
      `
    SELECT completed_at FROM sync_log
    WHERE worksheet = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `
    )
    .get(worksheet) as { completed_at: string } | null;

  return row?.completed_at ?? null;
}

// ============================================================================
// Query Operations
// ============================================================================

export type ProjectRow = {
  id: number;
  row_number: number;
  worksheet: string;
  date: string | null;
  contractor: string | null;
  job_name: string | null;
  address: string | null;
  contact: string | null;
  phone: string | null;
  work_description: string | null;
  date_entered: string | null;
  comments: string | null;
  invoice: string | null;
  work_completed: string | null;
  synced_at: string;
};

/**
 * Query projects from SQLite
 */
export function queryProjects(options: {
  worksheet?: WorksheetName;
  jobName?: string;
  contractor?: string;
  query?: string;
  limit?: number;
}): ProjectRow[] {
  const database = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.worksheet) {
    conditions.push("worksheet = ?");
    params.push(options.worksheet);
  }

  if (options.jobName) {
    conditions.push("job_name LIKE ?");
    params.push(`%${options.jobName}%`);
  }

  if (options.contractor) {
    conditions.push("contractor LIKE ?");
    params.push(`%${options.contractor}%`);
  }

  if (options.query) {
    conditions.push(`(
      job_name LIKE ? OR
      contractor LIKE ? OR
      address LIKE ? OR
      contact LIKE ? OR
      work_description LIKE ? OR
      comments LIKE ?
    )`);
    const pattern = `%${options.query}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

  const sql = `SELECT * FROM projects ${whereClause} ORDER BY id ${limitClause}`;

  return database.prepare(sql).all(...params) as ProjectRow[];
}

/**
 * Get project counts by worksheet
 */
export function getProjectCounts(): Record<string, number> {
  const database = getDb();
  const rows = database
    .prepare(
      `
    SELECT worksheet, COUNT(*) as count
    FROM projects
    GROUP BY worksheet
  `
    )
    .all() as { worksheet: string; count: number }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.worksheet] = row.count;
  }
  return counts;
}

/**
 * Get all unique job names
 */
export function getJobNames(worksheet?: WorksheetName): string[] {
  const database = getDb();

  const sql = worksheet
    ? "SELECT DISTINCT job_name FROM projects WHERE worksheet = ? AND job_name IS NOT NULL ORDER BY job_name"
    : "SELECT DISTINCT job_name FROM projects WHERE job_name IS NOT NULL ORDER BY job_name";

  const rows = worksheet
    ? (database.prepare(sql).all(worksheet) as { job_name: string }[])
    : (database.prepare(sql).all() as { job_name: string }[]);

  return rows.map((r) => r.job_name);
}

/**
 * Get all unique contractors
 */
export function getContractors(worksheet?: WorksheetName): string[] {
  const database = getDb();

  const sql = worksheet
    ? "SELECT DISTINCT contractor FROM projects WHERE worksheet = ? AND contractor IS NOT NULL ORDER BY contractor"
    : "SELECT DISTINCT contractor FROM projects WHERE contractor IS NOT NULL ORDER BY contractor";

  const rows = worksheet
    ? (database.prepare(sql).all(worksheet) as { contractor: string }[])
    : (database.prepare(sql).all() as { contractor: string }[]);

  return rows.map((r) => r.contractor);
}
