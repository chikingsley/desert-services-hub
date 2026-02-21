import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type ChangeType = "inserted" | "updated" | "unchanged";

interface ExistingHashRow {
  payload_hash: string;
}

interface UpsertArcGisRecordInput {
  layerId: number;
  objectId: string;
  payloadHash: string;
  rawJson: string;
  runId: string;
  serviceName: string;
}

interface FinishStats {
  failedLayers: number;
  fetchedRows: number;
  insertedRecords: number;
  queriedLayers: number;
  unchangedRecords: number;
  updatedRecords: number;
}

interface LayerLogInput {
  expectedCount: number;
  fetchedRows: number;
  key: string;
  layerId: number;
  layerName: string;
  pagesFetched: number;
  runId: string;
  serviceName: string;
}

interface RecordRow {
  raw_json: string;
}

export class ArcGisSqliteRepository {
  private readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true, strict: true });
  }

  init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS arcgis_records (
        service_name TEXT NOT NULL,
        layer_id INTEGER NOT NULL,
        object_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        first_seen_run_id TEXT NOT NULL,
        last_seen_run_id TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY (service_name, layer_id, object_id)
      );

      CREATE INDEX IF NOT EXISTS idx_arcgis_records_layer
        ON arcgis_records (service_name, layer_id);
      CREATE INDEX IF NOT EXISTS idx_arcgis_records_last_seen
        ON arcgis_records (last_seen_at);

      CREATE TABLE IF NOT EXISTS arcgis_sync_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        queried_layers INTEGER,
        failed_layers INTEGER,
        fetched_rows INTEGER,
        inserted_records INTEGER,
        updated_records INTEGER,
        unchanged_records INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS arcgis_layer_log (
        run_id TEXT NOT NULL,
        key TEXT NOT NULL,
        service_name TEXT NOT NULL,
        layer_id INTEGER NOT NULL,
        layer_name TEXT NOT NULL,
        expected_count INTEGER NOT NULL,
        fetched_rows INTEGER NOT NULL,
        pages_fetched INTEGER NOT NULL,
        requested_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_arcgis_layer_log_run
        ON arcgis_layer_log (run_id);
    `);
  }

  beginRun(runId: string, startedAt: string, optionsJson: string): void {
    this.db
      .prepare(
        `
      INSERT INTO arcgis_sync_runs (
        run_id,
        started_at,
        status,
        options_json
      ) VALUES (?, ?, ?, ?)
    `
      )
      .run(runId, startedAt, "running", optionsJson);
  }

  finishRun(runId: string, finishedAt: string, stats: FinishStats): void {
    this.db
      .prepare(
        `
      UPDATE arcgis_sync_runs
      SET
        finished_at = ?,
        status = ?,
        queried_layers = ?,
        failed_layers = ?,
        fetched_rows = ?,
        inserted_records = ?,
        updated_records = ?,
        unchanged_records = ?
      WHERE run_id = ?
    `
      )
      .run(
        finishedAt,
        "success",
        stats.queriedLayers,
        stats.failedLayers,
        stats.fetchedRows,
        stats.insertedRecords,
        stats.updatedRecords,
        stats.unchangedRecords,
        runId
      );
  }

  failRun(runId: string, finishedAt: string, message: string): void {
    this.db
      .prepare(
        `
      UPDATE arcgis_sync_runs
      SET
        finished_at = ?,
        status = ?,
        error_message = ?
      WHERE run_id = ?
    `
      )
      .run(finishedAt, "failed", message.slice(0, 4000), runId);
  }

  logLayer(input: LayerLogInput): void {
    this.db
      .prepare(
        `
      INSERT INTO arcgis_layer_log (
        run_id,
        key,
        service_name,
        layer_id,
        layer_name,
        expected_count,
        fetched_rows,
        pages_fetched,
        requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        input.runId,
        input.key,
        input.serviceName,
        input.layerId,
        input.layerName,
        input.expectedCount,
        input.fetchedRows,
        input.pagesFetched,
        new Date().toISOString()
      );
  }

  upsertRecord(input: UpsertArcGisRecordInput): ChangeType {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `
      SELECT payload_hash
      FROM arcgis_records
      WHERE service_name = ? AND layer_id = ? AND object_id = ?
    `
      )
      .get(
        input.serviceName,
        input.layerId,
        input.objectId
      ) as ExistingHashRow | null;

    let changeType: ChangeType = "inserted";
    if (existing) {
      changeType =
        existing.payload_hash === input.payloadHash ? "unchanged" : "updated";
    }

    this.db
      .prepare(
        `
      INSERT INTO arcgis_records (
        service_name,
        layer_id,
        object_id,
        payload_hash,
        raw_json,
        created_at,
        updated_at,
        first_seen_run_id,
        last_seen_run_id,
        first_seen_at,
        last_seen_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_name, layer_id, object_id) DO UPDATE SET
        payload_hash = excluded.payload_hash,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at,
        last_seen_run_id = excluded.last_seen_run_id,
        last_seen_at = excluded.last_seen_at,
        deleted_at = NULL
    `
      )
      .run(
        input.serviceName,
        input.layerId,
        input.objectId,
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

  markLayerSoftDeletedMissingInRun(
    runId: string,
    finishedAt: string,
    serviceName: string,
    layerId: number
  ): number {
    const statement = this.db.prepare(`
      UPDATE arcgis_records
      SET deleted_at = ?
      WHERE service_name = ?
        AND layer_id = ?
        AND last_seen_run_id != ?
        AND deleted_at IS NULL
    `);

    const result = statement.run(finishedAt, serviceName, layerId, runId);
    return Number(result.changes ?? 0);
  }

  getLayerSamples(
    serviceName: string,
    layerId: number,
    limit: number
  ): Record<string, unknown>[] {
    const rows = this.db
      .prepare(
        `
      SELECT raw_json
      FROM arcgis_records
      WHERE service_name = ? AND layer_id = ?
      ORDER BY updated_at DESC, object_id DESC
      LIMIT ?
    `
      )
      .all(serviceName, layerId, limit) as RecordRow[];

    return rows.map(
      (row) => JSON.parse(row.raw_json) as Record<string, unknown>
    );
  }

  getLayerCounts(): Array<{
    count: number;
    layerId: number;
    serviceName: string;
  }> {
    return this.db
      .query(`
      SELECT service_name AS serviceName, layer_id AS layerId, COUNT(*) AS count
      FROM arcgis_records
      GROUP BY service_name, layer_id
      ORDER BY service_name ASC, layer_id ASC
    `)
      .all() as Array<{
      count: number;
      layerId: number;
      serviceName: string;
    }>;
  }
}
