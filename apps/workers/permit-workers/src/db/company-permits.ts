/**
 * Company Permits Database (Desert Services)
 *
 * Central database for permit automation:
 * - companies: Contractors we do permits for
 * - permits: Permits we've created/manage
 * - jobs: Automation queue (create, renew, close)
 *
 * @module src/db/company-permits
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { Company, Job, Permit } from "./types";

export type { Company, Job, JobStatus, JobType, Permit } from "./types";

const DB_PATH =
  process.env.COMPANY_PERMITS_DB_PATH ||
  resolve(import.meta.dir, "./company-permits.sqlite");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode = WAL");

// ============================================================================
// SCHEMA
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,              -- CMP005052
    name TEXT UNIQUE NOT NULL,
    entity_type TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    email TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS permits (
    id TEXT PRIMARY KEY,              -- D0063581
    project_name TEXT,
    company_id TEXT REFERENCES companies(id),
    company_name TEXT,                -- denormalized for convenience
    status TEXT,                      -- Draft, Submitted, Active, Superseded, Closed, Rejected, Pending Payment
    submitted_date TEXT,
    effective_date TEXT,
    expiration_date TEXT,
    closed_date TEXT,
    previous_app_id TEXT,             -- for renewal chain
    project_start_date TEXT,
    project_end_date TEXT,
    address TEXT,
    city TEXT,
    parcel TEXT,
    is_block_permit INTEGER DEFAULT 0,
    is_accelerated INTEGER DEFAULT 0,
    invoice_number TEXT,
    invoice_charges REAL,
    invoice_balance REAL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,               -- 'create', 'renew', 'close'
    permit_id TEXT,                   -- NULL for new permits
    company_id TEXT,
    payload TEXT,                     -- JSON
    status TEXT DEFAULT 'pending',    -- pending, running, done, failed
    result TEXT,                      -- JSON result or error
    created_at INTEGER DEFAULT (unixepoch()),
    started_at INTEGER,
    completed_at INTEGER
  )
`);

// Indexes
db.run(
  "CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name COLLATE NOCASE)"
);
db.run("CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status)");
db.run("CREATE INDEX IF NOT EXISTS idx_permits_company ON permits(company_id)");
db.run(
  "CREATE INDEX IF NOT EXISTS idx_permits_expiration ON permits(expiration_date)"
);
db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)");

// ============================================================================
// COMPANIES
// ============================================================================

export function findCompany(name: string): Company | null {
  const row = db
    .query("SELECT * FROM companies WHERE name = ? COLLATE NOCASE")
    .get(name) as Record<string, unknown> | null;

  return row ? mapCompany(row) : null;
}

export function searchCompanies(query: string, limit = 10): Company[] {
  const rows = db
    .query(
      `SELECT * FROM companies
       WHERE name LIKE ? COLLATE NOCASE
       ORDER BY name LIMIT ?`
    )
    .all(`%${query}%`, limit) as Record<string, unknown>[];

  return rows.map(mapCompany);
}

export function companyExists(name: string): boolean {
  const row = db
    .query("SELECT 1 FROM companies WHERE name = ? COLLATE NOCASE")
    .get(name);
  return row !== null;
}

export function addCompany(company: Omit<Company, "id">): Company {
  const id = generateCompanyId();

  db.run(
    `INSERT INTO companies (id, name, entity_type, address, city, state, zip, phone, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      company.name,
      company.entityType,
      company.address,
      company.city,
      company.state,
      company.zip,
      company.phone,
      company.email,
    ]
  );

  return { id, ...company };
}

export function getCompanyCount(): number {
  const row = db.query("SELECT COUNT(*) as count FROM companies").get() as {
    count: number;
  };
  return row.count;
}

// ============================================================================
// PERMITS
// ============================================================================

export function getPermit(id: string): Permit | null {
  const row = db.query("SELECT * FROM permits WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | null;

  return row ? mapPermit(row) : null;
}

/**
 * Check if a permit exists in the database.
 * Uses prepare() instead of query() to avoid statement caching issues.
 */
export function permitExists(id: string): boolean {
  const stmt = db.prepare("SELECT 1 FROM permits WHERE id = ?");
  const row = stmt.get(id);
  stmt.finalize();
  return row !== null;
}

export function getPermitsByCompany(companyId: string): Permit[] {
  const rows = db
    .query(
      "SELECT * FROM permits WHERE company_id = ? ORDER BY created_at DESC"
    )
    .all(companyId) as Record<string, unknown>[];

  return rows.map(mapPermit);
}

export function getActivePermits(): Permit[] {
  const rows = db
    .query(
      "SELECT * FROM permits WHERE status = 'Active' ORDER BY expiration_date"
    )
    .all() as Record<string, unknown>[];

  return rows.map(mapPermit);
}

export function getExpiringPermits(withinDays = 30): Permit[] {
  const rows = db
    .query(
      `SELECT * FROM permits
       WHERE status = 'Active'
         AND expiration_date <= date('now', '+' || ? || ' days')
       ORDER BY expiration_date`
    )
    .all(withinDays) as Record<string, unknown>[];

  return rows.map(mapPermit);
}

export function upsertPermit(permit: Permit): void {
  db.run(
    `INSERT INTO permits (
      id, project_name, company_id, company_name, status,
      submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      project_name = excluded.project_name,
      company_id = excluded.company_id,
      company_name = excluded.company_name,
      status = excluded.status,
      submitted_date = excluded.submitted_date,
      effective_date = excluded.effective_date,
      expiration_date = excluded.expiration_date,
      closed_date = excluded.closed_date,
      previous_app_id = excluded.previous_app_id,
      project_start_date = excluded.project_start_date,
      project_end_date = excluded.project_end_date,
      address = excluded.address,
      city = excluded.city,
      parcel = excluded.parcel,
      is_block_permit = excluded.is_block_permit,
      is_accelerated = excluded.is_accelerated,
      updated_at = unixepoch()`,
    [
      permit.id,
      permit.projectName,
      permit.companyId,
      permit.companyName,
      permit.status,
      permit.submittedDate,
      permit.effectiveDate,
      permit.expirationDate,
      permit.closedDate,
      permit.previousAppId,
      permit.projectStartDate,
      permit.projectEndDate,
      permit.address,
      permit.city,
      permit.parcel,
      permit.isBlockPermit ? 1 : 0,
      permit.isAccelerated ? 1 : 0,
    ]
  );
}

export function getPermitCount(): number {
  const row = db.query("SELECT COUNT(*) as count FROM permits").get() as {
    count: number;
  };
  return row.count;
}

/**
 * Delete the most recently added permits.
 * Useful for testing to ensure there are permits to scrape.
 */
export function deleteRecentPermits(count: number): string[] {
  const rows = db
    .query("SELECT id FROM permits ORDER BY created_at DESC LIMIT ?")
    .all(count) as { id: string }[];

  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    db.run("DELETE FROM permits WHERE id = ?", [id]);
  }
  // Force WAL checkpoint to ensure reads see the deletes
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  return ids;
}

// ============================================================================
// JOBS
// ============================================================================

export function createJob(
  type: Job["type"],
  payload: Record<string, unknown>,
  permitId?: string,
  companyId?: string
): number {
  const result = db.run(
    `INSERT INTO jobs (type, permit_id, company_id, payload)
     VALUES (?, ?, ?, ?)`,
    [type, permitId ?? null, companyId ?? null, JSON.stringify(payload)]
  );

  return Number(result.lastInsertRowid);
}

export function getNextJob(): Job | null {
  const row = db
    .query(
      `SELECT * FROM jobs
       WHERE status = 'pending'
       ORDER BY created_at
       LIMIT 1`
    )
    .get() as Record<string, unknown> | null;

  return row ? mapJob(row) : null;
}

export function claimJob(jobId: number): boolean {
  const result = db.run(
    `UPDATE jobs
     SET status = 'running', started_at = unixepoch()
     WHERE id = ? AND status = 'pending'`,
    [jobId]
  );

  return result.changes > 0;
}

export function completeJob(
  jobId: number,
  result: Record<string, unknown>
): void {
  db.run(
    `UPDATE jobs
     SET status = 'done', result = ?, completed_at = unixepoch()
     WHERE id = ?`,
    [JSON.stringify(result), jobId]
  );
}

export function failJob(jobId: number, error: string): void {
  db.run(
    `UPDATE jobs
     SET status = 'failed', result = ?, completed_at = unixepoch()
     WHERE id = ?`,
    [JSON.stringify({ error }), jobId]
  );
}

export function getPendingJobs(): Job[] {
  const rows = db
    .query("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at")
    .all() as Record<string, unknown>[];

  return rows.map(mapJob);
}

export function getRecentJobs(limit = 20): Job[] {
  const rows = db
    .query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];

  return rows.map(mapJob);
}

// ============================================================================
// HELPERS
// ============================================================================

function generateCompanyId(): string {
  const row = db
    .query("SELECT id FROM companies ORDER BY id DESC LIMIT 1")
    .get() as {
    id: string;
  } | null;

  let nextNum = 1;
  if (row) {
    const num = Number.parseInt(row.id.replace("CMP", ""), 10);
    nextNum = num + 1;
  }

  return `CMP${nextNum.toString().padStart(6, "0")}`;
}

function mapCompany(row: Record<string, unknown>): Company {
  return {
    id: row.id as string,
    name: row.name as string,
    entityType: row.entity_type as string | null,
    address: row.address as string | null,
    city: row.city as string | null,
    state: row.state as string | null,
    zip: row.zip as string | null,
    phone: row.phone as string | null,
    email: row.email as string | null,
  };
}

function mapPermit(row: Record<string, unknown>): Permit {
  return {
    id: row.id as string,
    projectName: row.project_name as string | null,
    companyId: row.company_id as string | null,
    companyName: row.company_name as string | null,
    status: row.status as string | null,
    submittedDate: row.submitted_date as string | null,
    effectiveDate: row.effective_date as string | null,
    expirationDate: row.expiration_date as string | null,
    closedDate: row.closed_date as string | null,
    previousAppId: row.previous_app_id as string | null,
    projectStartDate: row.project_start_date as string | null,
    projectEndDate: row.project_end_date as string | null,
    address: row.address as string | null,
    city: row.city as string | null,
    parcel: row.parcel as string | null,
    isBlockPermit: Boolean(row.is_block_permit),
    isAccelerated: Boolean(row.is_accelerated),
  };
}

function mapJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as number,
    type: row.type as Job["type"],
    permitId: row.permit_id as string | null,
    companyId: row.company_id as string | null,
    payload: JSON.parse((row.payload as string) || "{}"),
    status: row.status as Job["status"],
    result: row.result ? JSON.parse(row.result as string) : null,
    createdAt: row.created_at as number,
    startedAt: row.started_at as number | null,
    completedAt: row.completed_at as number | null,
  };
}

/**
 * Get permits that need detail scraping (seeded from CSV but not fully scraped)
 */
export function getPermitsNeedingScrape(limit = 100): Permit[] {
  const rows = db
    .query(
      `SELECT * FROM permits
       WHERE updated_at = created_at
       ORDER BY created_at
       LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map(mapPermit);
}

/**
 * Mark permit as fully scraped with details
 */
export function markPermitScraped(id: string, details?: Partial<Permit>): void {
  if (details) {
    // Update with scraped details
    db.run(
      `UPDATE permits SET
        project_name = COALESCE(?, project_name),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        parcel = COALESCE(?, parcel),
        updated_at = unixepoch()
       WHERE id = ?`,
      [
        details.projectName ?? null,
        details.address ?? null,
        details.city ?? null,
        details.parcel ?? null,
        id,
      ]
    );
  } else {
    db.run("UPDATE permits SET updated_at = unixepoch() WHERE id = ?", [id]);
  }
}

export { db };
