import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { findItem } from "@estimates/catalog";
import { db } from "@lib/db/hub";
import {
  linkEstimateToProject,
  setCanonicalEstimateForProject,
} from "@lib/db/repositories/project-estimate";
import { createEstimate } from "@/apps/web/api/estimates/estimates";
import { getProjectFinalSov } from "@/apps/web/api/projects/projects-by-id";

const TEST_PREFIX = "_TEST_DELETE_ME_PROJECT_FINAL_SOV_";
const projectIds: number[] = [];
const estimateIds: string[] = [];
const catalogItem = findItem("SWPPP-002");

if (!catalogItem) {
  throw new Error("Required catalog fixture SWPPP-002 is missing.");
}

function makeEstimateRequest(body: unknown): Request {
  return new Request("http://localhost/api/estimates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeProjectRequest(id: number): Request & { params: { id: string } } {
  const req = new Request(`http://localhost/api/projects/${id}/final-sov`, {
    method: "GET",
  }) as Request & { params: { id: string } };
  req.params = { id: String(id) };
  return req;
}

async function createProject(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO projects (name, normalized_name)
     VALUES (?, ?)
     RETURNING id`,
    [name, name.toLowerCase()]
  )) as Array<{ id: number }>;

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create project");
  }

  projectIds.push(id);
  return id;
}

beforeAll(async () => {
  await db.run(
    `ALTER TABLE project_estimates
     ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await db.run(
    `ALTER TABLE project_estimates
     ADD COLUMN IF NOT EXISTS canonicalized_at TIMESTAMPTZ`
  );
  await db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_project_estimates_one_canonical_per_project
     ON project_estimates(project_id)
     WHERE is_canonical`
  );
});

afterAll(async () => {
  for (const id of estimateIds) {
    await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
  }

  for (const id of projectIds) {
    await db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  await db
    .prepare("DELETE FROM projects WHERE name LIKE ?")
    .run(`${TEST_PREFIX}%`);
  await db
    .prepare("DELETE FROM estimates WHERE name LIKE ?")
    .run(`${TEST_PREFIX}%`);
});

describe("getProjectFinalSov", () => {
  test("returns 404 when canonical estimate is not set", async () => {
    const projectId = await createProject(`${TEST_PREFIX}NoCanonical`);

    const response = await getProjectFinalSov(makeProjectRequest(projectId));
    expect(response.status).toBe(404);

    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("missing_final_sov");
  });

  test("returns canonical estimate SOV when project is finalized", async () => {
    const projectId = await createProject(`${TEST_PREFIX}CanonicalReady`);

    const estimateRes = await createEstimate(
      makeEstimateRequest({
        job_name: `${TEST_PREFIX}CanonicalEstimate`,
        client_name: "Canonical Client",
        client_address: "100 North Test Ave, Phoenix, Arizona 85001",
        job_address: "200 South Test Ave, Phoenix, Arizona 85002",
        line_items: [
          {
            item: catalogItem.name,
            qty: 2,
            cost: 175,
          },
        ],
      })
    );

    const { id } = (await estimateRes.json()) as { id: string };
    estimateIds.push(id);

    expect(await linkEstimateToProject(projectId, Number(id), "test")).toBe(
      true
    );
    expect(
      await setCanonicalEstimateForProject(projectId, Number(id), "test")
    ).toBe(true);

    const response = await getProjectFinalSov(makeProjectRequest(projectId));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      project_id: number;
      estimate_id: number;
      line_items: Array<{ itemName?: string; description: string }>;
      sections: Array<{ name: string }>;
    };

    expect(body.project_id).toBe(projectId);
    expect(body.estimate_id).toBe(Number(id));
    expect(body.line_items.length).toBeGreaterThan(0);
    expect(body.line_items[0]?.description).toBe(catalogItem.description);
  });
});
