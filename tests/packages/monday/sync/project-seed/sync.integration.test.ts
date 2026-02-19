import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@monday/sync/project-seed/sync";

const TEST_PREFIX = "_TEST_DELETE_ME_SEEDSYNC_";
const TEST_MONDAY_PREFIX = `${TEST_PREFIX}MID_`;

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function cleanupTestRows(): Promise<void> {
  const estimateRows = (await db
    .query<{ id: number }>(
      "SELECT id FROM estimates WHERE monday_item_id LIKE $1"
    )
    .all(`${TEST_MONDAY_PREFIX}%`)) as Array<{ id: number }>;
  const estimateIds = estimateRows.map((row) => row.id);

  const projectRowsByEstimate =
    estimateIds.length > 0
      ? ((await db
          .query<{ project_id: number }>(
            `SELECT DISTINCT project_id
             FROM project_estimates
             WHERE estimate_id IN (${estimateIds.map(() => "$1").join(", ")})`
          )
          .all(...estimateIds)) as Array<{ project_id: number }>)
      : [];

  const projectRowsByName = (await db
    .query<{ id: number }>(
      "SELECT id FROM projects WHERE seed_source = 'estimate_sync' AND name LIKE $1"
    )
    .all(`${TEST_PREFIX}%`)) as Array<{ id: number }>;

  const projectIds = [
    ...new Set([
      ...projectRowsByEstimate.map((row) => row.project_id),
      ...projectRowsByName.map((row) => row.id),
    ]),
  ];

  if (estimateIds.length > 0) {
    await db.run(
      `DELETE FROM project_estimates
       WHERE estimate_id IN (${estimateIds.map(() => "$1").join(", ")})`,
      estimateIds
    );
  }

  if (estimateIds.length > 0) {
    await db.run(
      `DELETE FROM estimates
       WHERE id IN (${estimateIds.map(() => "$1").join(", ")})`,
      estimateIds
    );
  }

  if (projectIds.length > 0) {
    await db.run(
      `DELETE FROM projects
       WHERE id IN (${projectIds.map(() => "$1").join(", ")})
         AND NOT EXISTS (
           SELECT 1 FROM project_estimates pe WHERE pe.project_id = projects.id
         )`,
      projectIds
    );
  }
}

beforeEach(async () => {
  await cleanupTestRows();
});

afterAll(async () => {
  await cleanupTestRows();
});

describe("project seed sync integration", () => {
  test("deduplicates prefixed estimate variants into one seed and promotes to active", async () => {
    const suffix = uniqueSuffix();
    const baseName = `${TEST_PREFIX}Liberty Utility ${suffix}`;
    const mondayA = `${TEST_MONDAY_PREFIX}A_${suffix}`;
    const mondayB = `${TEST_MONDAY_PREFIX}B_${suffix}`;

    const inserted = (await db.run(
      `INSERT INTO estimates (
         monday_item_id,
         name,
         job_name,
         bid_status,
         awarded,
         location,
         updated_at
       )
       VALUES
         ($1, $2, $3, $4, $5, $6, now()),
         ($7, $8, $9, $10, $11, $12, now())
       RETURNING id, monday_item_id`,
      [
        mondayA,
        `TF: ${baseName}`,
        null,
        "Bid Sent",
        0,
        "Phoenix AZ",
        mondayB,
        `PJ: ${baseName}`,
        null,
        "Won",
        1,
        "Phoenix AZ",
      ]
    )) as Array<{ id: number; monday_item_id: string }>;

    expect(inserted).toHaveLength(2);

    const syncStats = await syncProjectSeedsFromEstimates({ limit: 200 });
    expect(syncStats.seedGroups).toBeGreaterThan(0);

    const linked = (await db
      .query<{ project_id: number; link_count: number }>(
        `SELECT pe.project_id, count(*)::int AS link_count
         FROM project_estimates pe
         JOIN estimates e ON e.id = pe.estimate_id
         WHERE e.monday_item_id IN ($1, $2)
         GROUP BY pe.project_id`
      )
      .all(mondayA, mondayB)) as Array<{
      project_id: number;
      link_count: number;
    }>;

    expect(linked).toHaveLength(1);
    expect(linked[0]?.link_count).toBe(2);

    const projectId = linked[0]?.project_id;
    expect(projectId).toBeTruthy();
    if (!projectId) {
      throw new Error("expected linked project id");
    }

    const project = (await db
      .query<{ lifecycle_state: string; seed_key: string | null }>(
        "SELECT lifecycle_state, seed_key FROM projects WHERE id = $1"
      )
      .get(projectId)) as {
      lifecycle_state: string;
      seed_key: string | null;
    } | null;
    expect(project).toBeTruthy();
    expect(project?.lifecycle_state).toBe("active");
    expect(project?.seed_key).toBeTruthy();

    const canonical = (await db
      .query<{ monday_item_id: string }>(
        `SELECT e.monday_item_id
         FROM project_estimates pe
         JOIN estimates e ON e.id = pe.estimate_id
         WHERE pe.project_id = $1
           AND pe.is_canonical = TRUE
         LIMIT 1`
      )
      .get(projectId)) as { monday_item_id: string } | null;

    expect(canonical?.monday_item_id).toBe(mondayB);
  });

  test("marks stale seed projects as lost", async () => {
    const suffix = uniqueSuffix();
    const baseName = `${TEST_PREFIX}Stale Seed ${suffix}`;
    const mondayId = `${TEST_MONDAY_PREFIX}STALE_${suffix}`;

    await db.run(
      `INSERT INTO estimates (
         monday_item_id,
         name,
         bid_status,
         awarded,
         location,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, now())`,
      [mondayId, `TF: ${baseName}`, "Bid Sent", 0, "Glendale AZ"]
    );

    const syncStats = await syncProjectSeedsFromEstimates({ limit: 200 });
    expect(syncStats.seedGroups).toBeGreaterThan(0);

    const row = (await db
      .query<{ project_id: number }>(
        `SELECT pe.project_id
         FROM project_estimates pe
         JOIN estimates e ON e.id = pe.estimate_id
         WHERE e.monday_item_id = $1
         LIMIT 1`
      )
      .get(mondayId)) as { project_id: number } | null;
    expect(row?.project_id).toBeTruthy();
    if (!row?.project_id) {
      throw new Error("expected seeded project id");
    }

    await db.run(
      "UPDATE projects SET lifecycle_state = 'seed', last_evidence_at = now() - interval '90 days' WHERE id = $1",
      [row.project_id]
    );

    const staleStats = await markStaleProjectSeeds({ staleDays: 30 });
    expect(staleStats.candidates).toBeGreaterThan(0);
    expect(staleStats.movedToLost).toBeGreaterThan(0);

    const state = (await db
      .query<{ lifecycle_state: string }>(
        "SELECT lifecycle_state FROM projects WHERE id = $1"
      )
      .get(row.project_id)) as { lifecycle_state: string } | null;

    expect(state?.lifecycle_state).toBe("lost");
  });
});
