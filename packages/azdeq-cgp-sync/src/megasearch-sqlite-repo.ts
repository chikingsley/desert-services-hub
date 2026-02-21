import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type ChangeType = "inserted" | "updated" | "unchanged";

interface ExistingHashRow {
  payload_hash: string;
}

interface QueryRow {
  endpoint: string;
  raw_json: string;
}

interface UpsertMegaSearchRecordInput {
  endpoint: string;
  payloadHash: string;
  rawJson: string;
  recordId: string;
  runId: string;
}

interface FinishStats {
  cappedQueries: number;
  failedQueries: number;
  fetchedRows: number;
  insertedRecords: number;
  queriedCount: number;
  unchangedRecords: number;
  updatedRecords: number;
}

export class MegaSearchSqliteRepository {
  private readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true, strict: true });
  }

  init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS megasearch_records (
        endpoint TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        first_seen_run_id TEXT NOT NULL,
        last_seen_run_id TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY (endpoint, record_id)
      );

      CREATE INDEX IF NOT EXISTS idx_megasearch_records_endpoint
        ON megasearch_records (endpoint);
      CREATE INDEX IF NOT EXISTS idx_megasearch_records_last_seen
        ON megasearch_records (last_seen_at);

      CREATE TABLE IF NOT EXISTS megasearch_sync_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        queried_count INTEGER,
        failed_queries INTEGER,
        capped_queries INTEGER,
        fetched_rows INTEGER,
        inserted_records INTEGER,
        updated_records INTEGER,
        unchanged_records INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS megasearch_query_log (
        run_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        query_json TEXT NOT NULL,
        response_status INTEGER NOT NULL,
        row_count INTEGER NOT NULL,
        was_capped INTEGER NOT NULL,
        error_message TEXT,
        requested_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_megasearch_query_log_run
        ON megasearch_query_log (run_id);
      CREATE INDEX IF NOT EXISTS idx_megasearch_query_log_endpoint
        ON megasearch_query_log (endpoint);
    `);
  }

  beginRun(runId: string, startedAt: string, optionsJson: string): void {
    const statement = this.db.prepare(`
      INSERT INTO megasearch_sync_runs (
        run_id,
        started_at,
        status,
        options_json
      ) VALUES (?, ?, ?, ?)
    `);

    statement.run(runId, startedAt, "running", optionsJson);
  }

  finishRun(runId: string, finishedAt: string, stats: FinishStats): void {
    const statement = this.db.prepare(`
      UPDATE megasearch_sync_runs
      SET
        finished_at = ?,
        status = ?,
        queried_count = ?,
        failed_queries = ?,
        capped_queries = ?,
        fetched_rows = ?,
        inserted_records = ?,
        updated_records = ?,
        unchanged_records = ?
      WHERE run_id = ?
    `);

    statement.run(
      finishedAt,
      "success",
      stats.queriedCount,
      stats.failedQueries,
      stats.cappedQueries,
      stats.fetchedRows,
      stats.insertedRecords,
      stats.updatedRecords,
      stats.unchangedRecords,
      runId
    );
  }

  failRun(runId: string, finishedAt: string, message: string): void {
    const statement = this.db.prepare(`
      UPDATE megasearch_sync_runs
      SET
        finished_at = ?,
        status = ?,
        error_message = ?
      WHERE run_id = ?
    `);

    statement.run(finishedAt, "failed", message.slice(0, 4000), runId);
  }

  logQuery(input: {
    endpoint: string;
    errorMessage?: string;
    queryJson: string;
    responseStatus: number;
    rowCount: number;
    runId: string;
    wasCapped: boolean;
  }): void {
    const statement = this.db.prepare(`
      INSERT INTO megasearch_query_log (
        run_id,
        endpoint,
        query_json,
        response_status,
        row_count,
        was_capped,
        error_message,
        requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      input.runId,
      input.endpoint,
      input.queryJson,
      input.responseStatus,
      input.rowCount,
      input.wasCapped ? 1 : 0,
      input.errorMessage ?? null,
      new Date().toISOString()
    );
  }

  upsertRecord(input: UpsertMegaSearchRecordInput): ChangeType {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `
        SELECT payload_hash
        FROM megasearch_records
        WHERE endpoint = ? AND record_id = ?
      `
      )
      .get(input.endpoint, input.recordId) as ExistingHashRow | null;

    let changeType: ChangeType = "inserted";
    if (existing) {
      changeType =
        existing.payload_hash === input.payloadHash ? "unchanged" : "updated";
    }

    const statement = this.db.prepare(`
      INSERT INTO megasearch_records (
        endpoint,
        record_id,
        payload_hash,
        raw_json,
        created_at,
        updated_at,
        first_seen_run_id,
        last_seen_run_id,
        first_seen_at,
        last_seen_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint, record_id) DO UPDATE SET
        payload_hash = excluded.payload_hash,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at,
        last_seen_run_id = excluded.last_seen_run_id,
        last_seen_at = excluded.last_seen_at,
        deleted_at = NULL
    `);

    statement.run(
      input.endpoint,
      input.recordId,
      input.payloadHash,
      input.rawJson,
      now,
      now,
      input.runId,
      input.runId,
      now,
      now,
      null
    );

    return changeType;
  }

  getEndpointSamples(
    endpoint: string,
    limit: number
  ): Record<string, unknown>[] {
    const statement = this.db.prepare(`
      SELECT endpoint, raw_json
      FROM megasearch_records
      WHERE endpoint = ?
      ORDER BY updated_at DESC, record_id DESC
      LIMIT ?
    `);

    const rows = statement.all(endpoint, limit) as QueryRow[];
    return rows.map(
      (row) => JSON.parse(row.raw_json) as Record<string, unknown>
    );
  }

  getStoredEndpoints(): string[] {
    const rows = this.db
      .query(`
        SELECT DISTINCT endpoint
        FROM megasearch_records
        ORDER BY endpoint ASC
      `)
      .all() as Array<{ endpoint: string }>;

    return rows.map((row) => row.endpoint);
  }

  getEndpointCounts(): Array<{ count: number; endpoint: string }> {
    const rows = this.db
      .query(`
        SELECT endpoint, COUNT(*) AS count
        FROM megasearch_records
        GROUP BY endpoint
        ORDER BY endpoint ASC
      `)
      .all() as Array<{ count: number; endpoint: string }>;
    return rows;
  }
}
