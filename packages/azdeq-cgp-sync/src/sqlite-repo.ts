import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NormalizedPermitRecord } from "./types";

type ChangeType = "inserted" | "updated" | "unchanged";

interface UpsertPermitInput {
  normalized: NormalizedPermitRecord;
  payloadHash: string;
  rawJson: string;
  runId: string;
}

interface PermitHashRow {
  payload_hash: string;
}

interface CountRow {
  count: number;
}

interface PermitRow {
  ltf_idno: string;
  raw_json: string;
}

interface LtfIdBoundsRow {
  max_id: number | null;
  min_id: number | null;
}

interface SyncStats {
  fetchedRecords: number;
  insertedRecords: number;
  softDeletedRecords: number;
  unchangedRecords: number;
  updatedRecords: number;
}

export class CgpSqliteRepository {
  private readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true, strict: true });
  }

  init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS cgp_permits (
        ltf_idno TEXT PRIMARY KEY,
        permit_auth_code TEXT,
        permit_type TEXT,
        permit_category_name TEXT,
        status TEXT,
        county_code TEXT,
        facility_name TEXT,
        company_name TEXT,
        project_type TEXT,
        rco_name TEXT,
        swppp_first_name TEXT,
        swppp_last_name TEXT,
        swppp_email TEXT,
        swppp_phone TEXT,
        submitted_date_raw TEXT,
        submitted_date_iso TEXT,
        applied_date_raw TEXT,
        applied_date_iso TEXT,
        issued_date_raw TEXT,
        issued_date_iso TEXT,
        construction_start_date_raw TEXT,
        construction_start_date_iso TEXT,
        construction_end_date_raw TEXT,
        construction_end_date_iso TEXT,
        permit_project_area REAL,
        total_project_area REAL,
        facility_latitude REAL,
        facility_longitude REAL,
        payload_hash TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        first_seen_run_id TEXT NOT NULL,
        last_seen_run_id TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cgp_county_code
        ON cgp_permits (county_code);
      CREATE INDEX IF NOT EXISTS idx_cgp_submitted_date_iso
        ON cgp_permits (submitted_date_iso);
      CREATE INDEX IF NOT EXISTS idx_cgp_status
        ON cgp_permits (status);
      CREATE INDEX IF NOT EXISTS idx_cgp_category
        ON cgp_permits (permit_category_name);

      CREATE TABLE IF NOT EXISTS cgp_sync_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        counties_json TEXT NOT NULL,
        fetched_records INTEGER,
        inserted_records INTEGER,
        updated_records INTEGER,
        unchanged_records INTEGER,
        soft_deleted_records INTEGER,
        status TEXT NOT NULL,
        error_message TEXT
      );
    `);
  }

  beginRun(runId: string, startedAt: string, counties: string[]): void {
    const statement = this.db.prepare(`
      INSERT INTO cgp_sync_runs (
        run_id,
        started_at,
        counties_json,
        status
      ) VALUES (?, ?, ?, ?)
    `);

    statement.run(runId, startedAt, JSON.stringify(counties), "running");
  }

  upsertPermit(input: UpsertPermitInput): ChangeType {
    const now = new Date().toISOString();
    const existingRow = this.db
      .prepare("SELECT payload_hash FROM cgp_permits WHERE ltf_idno = ?")
      .get(input.normalized.ltfIdno) as PermitHashRow | null;

    let changeType: ChangeType = "inserted";
    if (existingRow) {
      changeType =
        existingRow.payload_hash === input.payloadHash
          ? "unchanged"
          : "updated";
    }

    const statement = this.db.prepare(`
      INSERT INTO cgp_permits (
        ltf_idno,
        permit_auth_code,
        permit_type,
        permit_category_name,
        status,
        county_code,
        facility_name,
        company_name,
        project_type,
        rco_name,
        swppp_first_name,
        swppp_last_name,
        swppp_email,
        swppp_phone,
        submitted_date_raw,
        submitted_date_iso,
        applied_date_raw,
        applied_date_iso,
        issued_date_raw,
        issued_date_iso,
        construction_start_date_raw,
        construction_start_date_iso,
        construction_end_date_raw,
        construction_end_date_iso,
        permit_project_area,
        total_project_area,
        facility_latitude,
        facility_longitude,
        payload_hash,
        raw_json,
        created_at,
        updated_at,
        first_seen_run_id,
        last_seen_run_id,
        last_seen_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ltf_idno) DO UPDATE SET
        permit_auth_code = excluded.permit_auth_code,
        permit_type = excluded.permit_type,
        permit_category_name = excluded.permit_category_name,
        status = excluded.status,
        county_code = excluded.county_code,
        facility_name = excluded.facility_name,
        company_name = excluded.company_name,
        project_type = excluded.project_type,
        rco_name = excluded.rco_name,
        swppp_first_name = excluded.swppp_first_name,
        swppp_last_name = excluded.swppp_last_name,
        swppp_email = excluded.swppp_email,
        swppp_phone = excluded.swppp_phone,
        submitted_date_raw = excluded.submitted_date_raw,
        submitted_date_iso = excluded.submitted_date_iso,
        applied_date_raw = excluded.applied_date_raw,
        applied_date_iso = excluded.applied_date_iso,
        issued_date_raw = excluded.issued_date_raw,
        issued_date_iso = excluded.issued_date_iso,
        construction_start_date_raw = excluded.construction_start_date_raw,
        construction_start_date_iso = excluded.construction_start_date_iso,
        construction_end_date_raw = excluded.construction_end_date_raw,
        construction_end_date_iso = excluded.construction_end_date_iso,
        permit_project_area = excluded.permit_project_area,
        total_project_area = excluded.total_project_area,
        facility_latitude = excluded.facility_latitude,
        facility_longitude = excluded.facility_longitude,
        payload_hash = excluded.payload_hash,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at,
        last_seen_run_id = excluded.last_seen_run_id,
        last_seen_at = excluded.last_seen_at,
        deleted_at = NULL
    `);

    const normalized = input.normalized;
    statement.run(
      normalized.ltfIdno,
      normalized.permitAuthCode,
      normalized.permitType,
      normalized.permitCategoryName,
      normalized.status,
      normalized.countyCode,
      normalized.facilityName,
      normalized.companyName,
      normalized.projectType,
      normalized.rcoName,
      normalized.swpppFirstName,
      normalized.swpppLastName,
      normalized.swpppEmail,
      normalized.swpppPhone,
      normalized.submittedDateRaw,
      normalized.submittedDateIso,
      normalized.appliedDateRaw,
      normalized.appliedDateIso,
      normalized.issuedDateRaw,
      normalized.issuedDateIso,
      normalized.constructionStartDateRaw,
      normalized.constructionStartDateIso,
      normalized.constructionEndDateRaw,
      normalized.constructionEndDateIso,
      normalized.permitProjectArea,
      normalized.totalProjectArea,
      normalized.facilityLatitude,
      normalized.facilityLongitude,
      input.payloadHash,
      input.rawJson,
      now,
      now,
      input.runId,
      input.runId,
      now,
      null
    );

    return changeType;
  }

  markSoftDeletedMissingInRun(runId: string, atIso: string): number {
    const statement = this.db.prepare(`
      UPDATE cgp_permits
      SET deleted_at = ?, updated_at = ?
      WHERE last_seen_run_id <> ?
      AND deleted_at IS NULL
    `);

    const result = statement.run(atIso, atIso, runId) as { changes: number };
    return result.changes;
  }

  finishRun(runId: string, finishedAt: string, stats: SyncStats): void {
    const statement = this.db.prepare(`
      UPDATE cgp_sync_runs
      SET
        finished_at = ?,
        fetched_records = ?,
        inserted_records = ?,
        updated_records = ?,
        unchanged_records = ?,
        soft_deleted_records = ?,
        status = ?
      WHERE run_id = ?
    `);

    statement.run(
      finishedAt,
      stats.fetchedRecords,
      stats.insertedRecords,
      stats.updatedRecords,
      stats.unchangedRecords,
      stats.softDeletedRecords,
      "success",
      runId
    );
  }

  failRun(runId: string, finishedAt: string, message: string): void {
    const statement = this.db.prepare(`
      UPDATE cgp_sync_runs
      SET
        finished_at = ?,
        status = ?,
        error_message = ?
      WHERE run_id = ?
    `);

    statement.run(finishedAt, "failed", message.slice(0, 4000), runId);
  }

  countPermits(): number {
    const row = this.db
      .query("SELECT COUNT(*) AS count FROM cgp_permits")
      .get() as CountRow;
    return row.count;
  }

  getLatest(limit: number): Record<string, unknown>[] {
    const statement = this.db.prepare(`
      SELECT raw_json
      FROM cgp_permits
      ORDER BY submitted_date_iso DESC, submitted_date_raw DESC, ltf_idno DESC
      LIMIT ?
    `);

    const rows = statement.all(limit) as PermitRow[];
    return rows.map(
      (row) => JSON.parse(row.raw_json) as Record<string, unknown>
    );
  }

  getByLtfId(ltfId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT raw_json FROM cgp_permits WHERE ltf_idno = ?")
      .get(ltfId) as PermitRow | null;

    if (!row) {
      return null;
    }

    return JSON.parse(row.raw_json) as Record<string, unknown>;
  }

  getAllRawRecords(): Record<string, unknown>[] {
    const rows = this.db
      .query("SELECT raw_json FROM cgp_permits")
      .all() as PermitRow[];

    return rows.map(
      (row) => JSON.parse(row.raw_json) as Record<string, unknown>
    );
  }

  getNumericLtfIdBounds(): { maxId: number | null; minId: number | null } {
    const row = this.db
      .query(`
        SELECT
          MIN(CAST(ltf_idno AS INTEGER)) AS min_id,
          MAX(CAST(ltf_idno AS INTEGER)) AS max_id
        FROM cgp_permits
        WHERE ltf_idno GLOB '[0-9]*'
      `)
      .get() as LtfIdBoundsRow;

    return {
      minId: row.min_id ?? null,
      maxId: row.max_id ?? null,
    };
  }
}
