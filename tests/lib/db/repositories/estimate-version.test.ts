import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/hub";
import { ensureEstimateHasCurrentVersion } from "@lib/db/repositories/estimate-version";

const TEST_PREFIX = "_TEST_DELETE_ME_ESTIMATE_VERSION_INTEGRITY_";
const createdEstimateIds: number[] = [];

async function createEstimate(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO estimates (name, bid_status)
     VALUES (?, ?)
     RETURNING id`,
    [name, "draft"]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test estimate");
  }
  createdEstimateIds.push(id);
  return id;
}

afterAll(async () => {
  for (const id of createdEstimateIds) {
    await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
  }

  const remaining = (await db
    .prepare("SELECT count(*)::int AS count FROM estimates WHERE name LIKE ?")
    .get(`${TEST_PREFIX}%`)) as { count: number } | null;

  if ((remaining?.count ?? 0) > 0) {
    throw new Error(
      `Cleanup failed for estimate-version tests: ${remaining?.count} rows remain`
    );
  }
});

describe("ensureEstimateHasCurrentVersion", () => {
  test("creates baseline v1 current when estimate has no versions", async () => {
    const estimateId = await createEstimate(`${TEST_PREFIX}CreateBaseline`);

    const result = await ensureEstimateHasCurrentVersion(estimateId, {
      source: "sync",
      total: 123,
    });

    expect(result.created).toBe(true);

    const versions = (await db
      .prepare(
        `SELECT version_number, source, total, is_current
         FROM estimate_versions
         WHERE estimate_id = ?`
      )
      .all(estimateId)) as Array<{
      version_number: number;
      source: string;
      total: number;
      is_current: number;
    }>;

    expect(versions).toHaveLength(1);
    expect(versions[0]?.version_number).toBe(1);
    expect(versions[0]?.source).toBe("sync");
    expect(versions[0]?.total).toBe(123);
    expect(versions[0]?.is_current).toBe(1);
  });

  test("normalizes to latest version when none are current", async () => {
    const estimateId = await createEstimate(`${TEST_PREFIX}NoCurrent`);

    const v1 = crypto.randomUUID();
    const v2 = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(v1, estimateId, 1, "manual", 10, 0);
    await db
      .prepare(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(v2, estimateId, 2, "manual", 20, 0);

    const result = await ensureEstimateHasCurrentVersion(estimateId);
    expect(result.created).toBe(false);
    expect(result.versionId).toBe(v2);

    const currentRows = (await db
      .prepare(
        `SELECT id
         FROM estimate_versions
         WHERE estimate_id = ? AND is_current = 1`
      )
      .all(estimateId)) as Array<{ id: string }>;

    expect(currentRows).toHaveLength(1);
    expect(currentRows[0]?.id).toBe(v2);
  });

  test("keeps existing current version when integrity is already valid", async () => {
    const estimateId = await createEstimate(`${TEST_PREFIX}AlreadyValid`);

    const v1 = crypto.randomUUID();
    const v2 = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(v1, estimateId, 1, "manual", 10, 1);
    await db
      .prepare(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(v2, estimateId, 2, "manual", 20, 0);

    const result = await ensureEstimateHasCurrentVersion(estimateId);
    expect(result.created).toBe(false);
    expect(result.versionId).toBe(v1);

    const rows = (await db
      .prepare(
        `SELECT id, is_current
         FROM estimate_versions
         WHERE estimate_id = ?
         ORDER BY version_number ASC`
      )
      .all(estimateId)) as Array<{ id: string; is_current: number }>;

    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.is_current === 1)).toHaveLength(1);
    expect(rows.find((r) => r.id === v1)?.is_current).toBe(1);
    expect(rows.find((r) => r.id === v2)?.is_current).toBe(0);
  });
});
