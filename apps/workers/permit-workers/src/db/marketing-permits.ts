/**
 * Market Permits Database (Maricopa County)
 *
 * Database for market dust permits (leads for sales team):
 * - scraped_permits: All permits scraped from the portal
 * - contacts: Enriched contact info for outreach
 * - exports: Track what's been sent to CRM
 *
 * @module src/db/marketing-permits
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { Contact, Export, ScrapedPermit } from "./types";

export type { Contact, ContactSource, Export, ScrapedPermit } from "./types";

const DB_PATH =
  process.env.MARKETING_PERMITS_DB_PATH ||
  resolve(import.meta.dir, "./marketing-permits.sqlite");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode = WAL");

// ============================================================================
// SCHEMA
// ============================================================================

db.run(`
  CREATE TABLE IF NOT EXISTS scraped_permits (
    id TEXT PRIMARY KEY,              -- D0063581
    project_name TEXT,
    company_id TEXT,                  -- CMP005052
    company_name TEXT,
    status TEXT,                      -- Draft, Submitted, Active, Superseded, Closed, Rejected, Pending Payment
    submitted_date TEXT,
    effective_date TEXT,
    expiration_date TEXT,
    closed_date TEXT,
    previous_app_id TEXT,
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
    raw_data TEXT,                    -- Full JSON from scraper
    scraped_at INTEGER,
    detail_scraped_at INTEGER,        -- When we got full details
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    company_id TEXT,                  -- CMP005052
    company_name TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    title TEXT,
    source TEXT,                      -- 'scraped', 'enriched', 'manual'
    enriched_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS exports (
    id INTEGER PRIMARY KEY,
    type TEXT,                        -- 'csv', 'crm', 'hubspot', etc.
    filter TEXT,                      -- JSON of filter criteria used
    record_count INTEGER,
    file_path TEXT,                   -- For CSV exports
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

// Indexes
db.run(
  "CREATE INDEX IF NOT EXISTS idx_scraped_status ON scraped_permits(status)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_scraped_company ON scraped_permits(company_name)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_scraped_date ON scraped_permits(submitted_date)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id)"
);

// ============================================================================
// SCRAPED PERMITS
// ============================================================================

export function upsertScrapedPermit(
  permit: Partial<ScrapedPermit> & { id: string }
): void {
  db.run(
    `INSERT INTO scraped_permits (
      id, project_name, company_id, company_name, status,
      submitted_date, effective_date, expiration_date, closed_date,
      previous_app_id, project_start_date, project_end_date,
      address, city, parcel, is_block_permit, is_accelerated,
      invoice_number, invoice_charges, invoice_balance,
      raw_data, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      project_name = COALESCE(excluded.project_name, project_name),
      company_id = COALESCE(excluded.company_id, company_id),
      company_name = COALESCE(excluded.company_name, company_name),
      status = COALESCE(excluded.status, status),
      submitted_date = COALESCE(excluded.submitted_date, submitted_date),
      effective_date = COALESCE(excluded.effective_date, effective_date),
      expiration_date = COALESCE(excluded.expiration_date, expiration_date),
      closed_date = COALESCE(excluded.closed_date, closed_date),
      previous_app_id = COALESCE(excluded.previous_app_id, previous_app_id),
      project_start_date = COALESCE(excluded.project_start_date, project_start_date),
      project_end_date = COALESCE(excluded.project_end_date, project_end_date),
      address = COALESCE(excluded.address, address),
      city = COALESCE(excluded.city, city),
      parcel = COALESCE(excluded.parcel, parcel),
      is_block_permit = COALESCE(excluded.is_block_permit, is_block_permit),
      is_accelerated = COALESCE(excluded.is_accelerated, is_accelerated),
      invoice_number = COALESCE(excluded.invoice_number, invoice_number),
      invoice_charges = COALESCE(excluded.invoice_charges, invoice_charges),
      invoice_balance = COALESCE(excluded.invoice_balance, invoice_balance),
      raw_data = COALESCE(excluded.raw_data, raw_data),
      scraped_at = unixepoch()`,
    [
      permit.id,
      permit.projectName ?? null,
      permit.companyId ?? null,
      permit.companyName ?? null,
      permit.status ?? null,
      permit.submittedDate ?? null,
      permit.effectiveDate ?? null,
      permit.expirationDate ?? null,
      permit.closedDate ?? null,
      permit.previousAppId ?? null,
      permit.projectStartDate ?? null,
      permit.projectEndDate ?? null,
      permit.address ?? null,
      permit.city ?? null,
      permit.parcel ?? null,
      permit.isBlockPermit ? 1 : 0,
      permit.isAccelerated ? 1 : 0,
      permit.invoiceNumber ?? null,
      permit.invoiceCharges ?? null,
      permit.invoiceBalance ?? null,
      permit.rawData ? JSON.stringify(permit.rawData) : null,
    ]
  );
}

export function markDetailScraped(id: string): void {
  db.run(
    "UPDATE scraped_permits SET detail_scraped_at = unixepoch() WHERE id = ?",
    [id]
  );
}

export function getScrapedPermit(id: string): ScrapedPermit | null {
  const row = db
    .query("SELECT * FROM scraped_permits WHERE id = ?")
    .get(id) as Record<string, unknown> | null;

  return row ? mapScrapedPermit(row) : null;
}

export function getScrapedPermits(options?: {
  status?: string;
  companyName?: string;
  limit?: number;
  offset?: number;
}): ScrapedPermit[] {
  let sql = "SELECT * FROM scraped_permits WHERE 1=1";
  const params: unknown[] = [];

  if (options?.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }

  if (options?.companyName) {
    sql += " AND company_name LIKE ?";
    params.push(`%${options.companyName}%`);
  }

  sql += " ORDER BY submitted_date DESC";

  if (options?.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  if (options?.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const rows = db.query(sql).all(...(params as (string | number)[])) as Record<
    string,
    unknown
  >[];
  return rows.map(mapScrapedPermit);
}

export function getActivePermitsByCompany(): {
  companyName: string;
  count: number;
}[] {
  const rows = db
    .query(
      `SELECT company_name, COUNT(*) as count
       FROM scraped_permits
       WHERE status = 'Active'
       GROUP BY company_name
       ORDER BY count DESC`
    )
    .all() as { company_name: string; count: number }[];

  return rows.map((r) => ({
    companyName: r.company_name,
    count: r.count,
  }));
}

export function getScrapedPermitCount(): number {
  const row = db
    .query("SELECT COUNT(*) as count FROM scraped_permits")
    .get() as {
    count: number;
  };
  return row.count;
}

/**
 * Get permits that need detail scraping (seeded from CSV but not fully scraped)
 */
export function getPermitsNeedingDetailScrape(limit = 100): ScrapedPermit[] {
  const rows = db
    .query(
      `SELECT * FROM scraped_permits
       WHERE detail_scraped_at IS NULL
       ORDER BY scraped_at DESC NULLS LAST
       LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map(mapScrapedPermit);
}

/**
 * Get count of permits needing detail scrape
 */
export function getPermitsNeedingDetailScrapeCount(): number {
  const row = db
    .query(
      "SELECT COUNT(*) as count FROM scraped_permits WHERE detail_scraped_at IS NULL"
    )
    .get() as { count: number };
  return row.count;
}

// ============================================================================
// CONTACTS
// ============================================================================

export function addContact(contact: Omit<Contact, "id">): number {
  const result = db.run(
    `INSERT INTO contacts (company_id, company_name, contact_name, email, phone, title, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      contact.companyId,
      contact.companyName,
      contact.contactName,
      contact.email,
      contact.phone,
      contact.title,
      contact.source,
    ]
  );

  return Number(result.lastInsertRowid);
}

export function getContactsByCompany(companyId: string): Contact[] {
  const rows = db
    .query("SELECT * FROM contacts WHERE company_id = ?")
    .all(companyId) as Record<string, unknown>[];

  return rows.map(mapContact);
}

export function markContactEnriched(contactId: number): void {
  db.run("UPDATE contacts SET enriched_at = unixepoch() WHERE id = ?", [
    contactId,
  ]);
}

// ============================================================================
// EXPORTS
// ============================================================================

export function recordExport(
  type: string,
  filter: Record<string, unknown>,
  recordCount: number,
  filePath?: string
): number {
  const result = db.run(
    `INSERT INTO exports (type, filter, record_count, file_path)
     VALUES (?, ?, ?, ?)`,
    [type, JSON.stringify(filter), recordCount, filePath ?? null]
  );

  return Number(result.lastInsertRowid);
}

export function getRecentExports(limit = 10): Export[] {
  const rows = db
    .query("SELECT * FROM exports ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];

  return rows.map(mapExport);
}

// ============================================================================
// CSV EXPORT
// ============================================================================

const CSV_HEADERS = [
  "Dust Application ID",
  "Project Name",
  "Company ID",
  "Company Name",
  "Status",
  "Submitted Date",
  "Effective Date",
  "Expiration Date",
  "Closed Date",
  "Previous App ID",
  "Project Start Date",
  "Project End Date",
  "Address",
  "City",
  "Parcel",
  "Block Permit",
  "Accelerated",
  "Invoice Number",
  "Invoice Charges",
  "Invoice Balance",
] as const;

function permitToCsvRow(p: ScrapedPermit): string[] {
  return [
    p.id,
    p.projectName ?? "",
    p.companyId ?? "",
    p.companyName ?? "",
    p.status ?? "",
    p.submittedDate ?? "",
    p.effectiveDate ?? "",
    p.expirationDate ?? "",
    p.closedDate ?? "",
    p.previousAppId ?? "",
    p.projectStartDate ?? "",
    p.projectEndDate ?? "",
    p.address ?? "",
    p.city ?? "",
    p.parcel ?? "",
    p.isBlockPermit ? "Yes" : "No",
    p.isAccelerated ? "Yes" : "No",
    p.invoiceNumber ?? "",
    p.invoiceCharges?.toString() ?? "",
    p.invoiceBalance?.toString() ?? "",
  ];
}

export function exportToCsv(options?: {
  status?: string;
  companyName?: string;
}): string {
  const permits = getScrapedPermits(options);
  const rows = permits.map(permitToCsvRow);

  const csvContent = [
    CSV_HEADERS.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  // Record the export
  recordExport("csv", options ?? {}, permits.length);

  return csvContent;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapScrapedPermit(row: Record<string, unknown>): ScrapedPermit {
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
    invoiceNumber: row.invoice_number as string | null,
    invoiceCharges: row.invoice_charges as number | null,
    invoiceBalance: row.invoice_balance as number | null,
    rawData: row.raw_data ? JSON.parse(row.raw_data as string) : null,
    scrapedAt: row.scraped_at as number | null,
    detailScrapedAt: row.detail_scraped_at as number | null,
  };
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as number,
    companyId: row.company_id as string | null,
    companyName: row.company_name as string | null,
    contactName: row.contact_name as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    title: row.title as string | null,
    source: row.source as Contact["source"],
  };
}

function mapExport(row: Record<string, unknown>): Export {
  return {
    id: row.id as number,
    type: row.type as string,
    filter: JSON.parse((row.filter as string) || "{}"),
    recordCount: row.record_count as number,
    filePath: row.file_path as string | null,
    createdAt: row.created_at as number,
  };
}

export { db };
