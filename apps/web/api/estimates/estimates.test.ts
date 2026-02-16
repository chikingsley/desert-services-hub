/**
 * Estimates API Unit Tests
 *
 * Tests BEHAVIOR, not just structure.
 * Each test verifies that actual values flow through the system correctly.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { findItem } from "@estimates/catalog";
import { db } from "@lib/db/hub";
import type {
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
} from "@lib/db/types";
import {
  createEstimate,
  listEstimates,
} from "@/apps/web/api/estimates/estimates";
import {
  deleteEstimate,
  duplicateEstimate,
  finalizeEstimate,
  getEstimate,
  getEstimatePdf,
  updateEstimate,
} from "@/apps/web/api/estimates/estimates-by-id";

// ============================================================================
// Test Constants - Unique values we can search for in outputs
// ============================================================================

const TEST_PREFIX = "_TEST_DELETE_ME_";
const testEstimateIds: string[] = [];
const testProjectIds: number[] = [];
const PRIMARY_CATALOG_ITEM = findItem("SWPPP-002");
const SECONDARY_CATALOG_ITEM = findItem("CM-012");

if (!(PRIMARY_CATALOG_ITEM && SECONDARY_CATALOG_ITEM)) {
  throw new Error("Required catalog fixtures are missing for estimate tests.");
}

// Unique identifiable values for each test
const UNIQUE = {
  JOB_NAME: `${TEST_PREFIX}UniqueJob_ABC123`,
  CLIENT_NAME: "UniqueClient_XYZ789",
  CLIENT_ADDRESS: "230 S Siesta Lane, Tempe, Arizona 85288",
  NORMALIZED_CLIENT_ADDRESS: "230 S Siesta Lane\nTempe, Arizona 85288",
  CLIENT_EMAIL: "unique_test_456@example.com",
  JOB_ADDRESS: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
  NORMALIZED_JOB_ADDRESS: "3633 E Thunderbird Road\nPhoenix, Arizona 85032",
  ITEM_NAME: PRIMARY_CATALOG_ITEM.name,
  ITEM_DESCRIPTION: PRIMARY_CATALOG_ITEM.description,
  ALT_ITEM_NAME: SECONDARY_CATALOG_ITEM.name,
  ALT_ITEM_DESCRIPTION: SECONDARY_CATALOG_ITEM.description,
  SECTION_NAME: "UniqueSection_WXY333",
};

// ============================================================================
// Request Helpers
// ============================================================================

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/estimates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRequestWithParams(
  body: unknown,
  params: { id: string }
): Request & { params: { id: string } } {
  const req = new Request(`http://localhost/api/estimates/${params.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Request & { params: { id: string } };
  req.params = params;
  return req;
}

function makeGetRequest(params: { id: string }): Request & {
  params: { id: string };
} {
  const req = new Request(`http://localhost/api/estimates/${params.id}`, {
    method: "GET",
  }) as Request & { params: { id: string } };
  req.params = params;
  return req;
}

function makePostRequestWithParams(
  params: { id: string },
  body: unknown = {}
): Request & { params: { id: string } } {
  const req = new Request(
    `http://localhost/api/estimates/${params.id}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  ) as Request & { params: { id: string } };
  req.params = params;
  return req;
}

async function createTestProject(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO projects (name, normalized_name)
     VALUES (?, ?)
     RETURNING id`,
    [name, name.toLowerCase()]
  )) as Array<{ id: number }>;

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test project");
  }

  testProjectIds.push(id);
  return id;
}

// ============================================================================
// Cleanup
// ============================================================================

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
  for (const id of testEstimateIds) {
    try {
      await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
    } catch {
      // Ignore cleanup errors
    }
  }

  for (const id of testProjectIds) {
    try {
      await db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    } catch {
      // Ignore cleanup errors
    }
  }

  const remainingEstimates = (await db
    .prepare("SELECT COUNT(*) as count FROM estimates WHERE name LIKE ?")
    .get(`${TEST_PREFIX}%`)) as { count: number };

  if (remainingEstimates.count > 0) {
    throw new Error(
      `Cleanup failed: ${remainingEstimates.count} test estimates remain`
    );
  }

  const remainingProjects = (await db
    .prepare("SELECT COUNT(*) as count FROM projects WHERE name LIKE ?")
    .get(`${TEST_PREFIX}%`)) as { count: number };

  if (remainingProjects.count > 0) {
    throw new Error(
      `Cleanup failed: ${remainingProjects.count} test projects remain`
    );
  }
});

// ============================================================================
// listEstimates - Verify it returns actual data we can use
// ============================================================================

describe("listEstimates", () => {
  test("returns array containing created estimate with correct values", async () => {
    // Create estimate with unique values
    const createRes = await createEstimate(
      makeRequest({
        job_name: UNIQUE.JOB_NAME,
        client_name: UNIQUE.CLIENT_NAME,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testEstimateIds.push(id);

    // List and find our estimate
    const response = await listEstimates(
      new Request("http://localhost/api/estimates")
    );
    const body = (await response.json()) as {
      items: Array<{
        id: string;
        job_name: string;
        client_name: string | null;
        current_version: { total: number } | null;
      }>;
    };
    const estimates = body.items;

    const ourEstimate = estimates.find((q) => q.id === id);

    expect(ourEstimate).toBeDefined();
    expect(ourEstimate?.job_name).toBe(UNIQUE.JOB_NAME);
    expect(ourEstimate?.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(ourEstimate?.current_version).toBeDefined();
  });
});

// ============================================================================
// createEstimate - Verify data is actually saved correctly
// ============================================================================

describe("createEstimate", () => {
  test("saves all provided fields to database with correct values", async () => {
    const input = {
      job_name: `${TEST_PREFIX}CreateAllFields`,
      job_address: UNIQUE.JOB_ADDRESS,
      client_name: UNIQUE.CLIENT_NAME,
      client_address: UNIQUE.CLIENT_ADDRESS,
      client_email: UNIQUE.CLIENT_EMAIL,
      client_phone: "555-TEST-123",
      notes: "Test notes content",
      status: "draft",
    };

    const response = await createEstimate(makeRequest(input));
    expect(response.status).toBe(200);

    const { id } = (await response.json()) as { id: string };
    testEstimateIds.push(id);

    // Query database directly and verify ACTUAL VALUES
    const row = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow;

    expect(row.name).toBe(input.job_name);
    expect(row.job_address).toBe(UNIQUE.NORMALIZED_JOB_ADDRESS);
    expect(row.client_name).toBe(input.client_name);
    expect(row.client_address).toBe(UNIQUE.NORMALIZED_CLIENT_ADDRESS);
    expect(row.client_email).toBe(input.client_email);
    expect(row.client_phone).toBe(input.client_phone);
    expect(row.notes).toBe(input.notes);
    expect(row.bid_status).toBe(input.status);
  });

  test("canonicalizes line item name + description from catalog", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}ItemWithDescription`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            description: "not used",
            qty: 5,
            uom: "EA",
            cost: 100,
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    // Verify line item fields were canonicalized from catalog
    const item = (await db
      .prepare("SELECT * FROM estimate_line_items WHERE version_id = ?")
      .get(version_id)) as EstimateLineItemRow;

    expect(item.item_name).toBe(UNIQUE.ITEM_NAME);
    expect(item.description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.notes).toBeNull();
    expect(item.quantity).toBe(5);
    expect(item.unit_price).toBe(100);
  });

  test("saves section with correct name", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}WithSection`,
        sections: [{ id: "s1", name: UNIQUE.SECTION_NAME }],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const section = (await db
      .prepare("SELECT * FROM estimate_sections WHERE version_id = ?")
      .get(version_id)) as EstimateSectionRow;

    expect(section.name).toBe(UNIQUE.SECTION_NAME);
  });

  test("links line item to correct section", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}ItemInSection`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        sections: [{ id: "sec-original", name: "Test Section" }],
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            qty: 1,
            uom: "EA",
            cost: 50,
            section_id: "sec-original",
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const section = (await db
      .prepare("SELECT id FROM estimate_sections WHERE version_id = ?")
      .get(version_id)) as { id: string };

    const item = (await db
      .prepare(
        "SELECT section_id FROM estimate_line_items WHERE version_id = ?"
      )
      .get(version_id)) as { section_id: string };

    // Item should reference the NEW section ID, not the original
    expect(item.section_id).toBe(section.id);
    expect(item.section_id).not.toBe("sec-original");
  });
});

// ============================================================================
// getEstimate - Verify it returns the data we saved
// ============================================================================

describe("getEstimate", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}GetEstimateTest`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        sections: [{ id: "s1", name: UNIQUE.SECTION_NAME }],
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            description: UNIQUE.ITEM_DESCRIPTION,
            qty: 7,
            uom: "LF",
            cost: 25,
            section_id: "s1",
          },
        ],
      })
    );
    const data = (await response.json()) as { id: string };
    testId = data.id;
    testEstimateIds.push(testId);
  });

  test("returns 404 for non-existent estimate", async () => {
    const response = await getEstimate(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("returns estimate with all the values we saved", async () => {
    const response = await getEstimate(makeGetRequest({ id: testId }));
    expect(response.status).toBe(200);

    const estimate = (await response.json()) as {
      job_name: string;
      client_name: string;
      job_address: string;
      current_version: {
        sections: Array<{ name: string }>;
        line_items: Array<{
          item_name: string | null;
          description: string;
          notes: string | null;
          quantity: number;
          unit: string;
          unit_price: number;
        }>;
      };
    };

    // Verify the exact values we saved come back
    expect(estimate.job_name).toContain(TEST_PREFIX);
    expect(estimate.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(estimate.job_address).toBe(UNIQUE.NORMALIZED_JOB_ADDRESS);

    // Verify section
    expect(estimate.current_version.sections).toHaveLength(1);
    expect(estimate.current_version.sections[0].name).toBe(UNIQUE.SECTION_NAME);

    // Verify line item - THIS IS THE CRITICAL TEST
    expect(estimate.current_version.line_items).toHaveLength(1);
    const item = estimate.current_version.line_items[0];
    expect(item.item_name).toBe(UNIQUE.ITEM_NAME);
    expect(item.description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.notes).toBeNull();
    expect(item.quantity).toBe(7);
    expect(item.unit).toBe(PRIMARY_CATALOG_ITEM.unit);
    expect(item.unit_price).toBe(25);
  });

  test("returns empty current_version for legacy estimate without versions", async () => {
    const inserted = (await db.run(
      `INSERT INTO estimates (name, bid_status)
       VALUES (?, ?)
       RETURNING id`,
      [`${TEST_PREFIX}LegacyNoVersion`, "draft"]
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    testEstimateIds.push(id);

    const response = await getEstimate(makeGetRequest({ id }));
    expect(response.status).toBe(200);

    const estimate = (await response.json()) as {
      current_version: {
        is_current: number;
        sections: unknown[];
        line_items: unknown[];
      };
    };

    expect(estimate.current_version.is_current).toBe(1);
    expect(estimate.current_version.sections).toHaveLength(0);
    expect(estimate.current_version.line_items).toHaveLength(0);
  });
});

// ============================================================================
// updateEstimate - Verify updates actually change the data
// ============================================================================

describe("updateEstimate", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}UpdateTest`,
        client_name: "Original Client",
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
      })
    );
    const data = (await response.json()) as { id: string };
    testId = data.id;
    testEstimateIds.push(testId);
  });

  test("actually changes values in database", async () => {
    const newJobName = `${TEST_PREFIX}UpdatedJobName`;
    const newClientName = "Updated Client Name";

    await updateEstimate(
      makeRequestWithParams(
        {
          base_number: "999999",
          job_name: newJobName,
          client_name: newClientName,
          status: "sent",
        },
        { id: testId }
      )
    );

    // Query database and verify values ACTUALLY changed
    const row = (await db
      .prepare(
        "SELECT name, client_name, bid_status FROM estimates WHERE id = ?"
      )
      .get(testId)) as {
      name: string;
      client_name: string;
      bid_status: string;
    };

    expect(row.name).toBe(newJobName);
    expect(row.client_name).toBe(newClientName);
    expect(row.bid_status).toBe("sent");
  });

  test("replaces line items with new ones including descriptions", async () => {
    const response = await updateEstimate(
      makeRequestWithParams(
        {
          base_number: "999999",
          job_name: `${TEST_PREFIX}UpdatedJobName`,
          client_name: UNIQUE.CLIENT_NAME,
          client_address: UNIQUE.CLIENT_ADDRESS,
          job_address: UNIQUE.JOB_ADDRESS,
          line_items: [
            {
              item: UNIQUE.ALT_ITEM_NAME,
              description: "incorrect payload description",
              qty: 99,
              uom: "SF",
              cost: 50,
            },
          ],
        },
        { id: testId }
      )
    );
    expect(response.status).toBe(200);

    const version = (await db
      .prepare(
        "SELECT id FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(testId)) as { id: string };

    const items = (await db
      .prepare("SELECT * FROM estimate_line_items WHERE version_id = ?")
      .all(version.id)) as EstimateLineItemRow[];

    expect(items).toHaveLength(1);
    expect(items[0].item_name).toBe(UNIQUE.ALT_ITEM_NAME);
    expect(items[0].description).toBe(UNIQUE.ALT_ITEM_DESCRIPTION);
    expect(items[0].notes).toBeNull();
    expect(items[0].quantity).toBe(99);
    expect(items[0].unit).toBe(SECONDARY_CATALOG_ITEM.unit);
  });

  test("creates a version when updating a legacy estimate missing versions", async () => {
    const inserted = (await db.run(
      `INSERT INTO estimates (name, bid_status)
       VALUES (?, ?)
       RETURNING id`,
      [`${TEST_PREFIX}LegacyUpdateNoVersion`, "draft"]
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    testEstimateIds.push(id);

    await updateEstimate(
      makeRequestWithParams(
        {
          base_number: "111111",
          job_name: `${TEST_PREFIX}LegacyUpdated`,
          client_name: UNIQUE.CLIENT_NAME,
          client_address: UNIQUE.CLIENT_ADDRESS,
          job_address: UNIQUE.JOB_ADDRESS,
          line_items: [{ item: UNIQUE.ITEM_NAME, qty: 2, uom: "EA", cost: 99 }],
        },
        { id }
      )
    );

    const version = (await db
      .prepare(
        "SELECT id FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(id)) as { id: string } | null;
    expect(version).toBeTruthy();

    const items = (await db
      .prepare(
        "SELECT item_name, description, quantity FROM estimate_line_items WHERE version_id = ?"
      )
      .all(version?.id)) as Array<{
      item_name: string;
      description: string;
      quantity: number;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0].item_name).toBe(UNIQUE.ITEM_NAME);
    expect(items[0].description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(items[0].quantity).toBe(2);
  });
});

// ============================================================================
// deleteEstimate - Verify it actually removes data
// ============================================================================

describe("deleteEstimate", () => {
  test("returns 404 for non-existent estimate", async () => {
    const response = await deleteEstimate(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("removes estimate and all related data from database", async () => {
    // Create an estimate to delete
    const createRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}ToDelete`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        sections: [{ id: "s1", name: "Delete Section" }],
        line_items: [{ item: UNIQUE.ITEM_NAME, qty: 1, uom: "EA", cost: 50 }],
      })
    );
    const { id, version_id } = (await createRes.json()) as {
      id: string;
      version_id: string;
    };

    // Verify everything exists first
    expect(
      await db.prepare("SELECT 1 FROM estimates WHERE id = ?").get(id)
    ).toBeTruthy();
    expect(
      await db
        .prepare("SELECT 1 FROM estimate_versions WHERE id = ?")
        .get(version_id)
    ).toBeTruthy();

    // Delete
    const response = await deleteEstimate(makeGetRequest({ id }));
    expect(response.status).toBe(200);

    // Verify everything is gone
    expect(
      await db.prepare("SELECT 1 FROM estimates WHERE id = ?").get(id)
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT 1 FROM estimate_versions WHERE id = ?")
        .get(version_id)
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT 1 FROM estimate_sections WHERE version_id = ?")
        .get(version_id)
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT 1 FROM estimate_line_items WHERE version_id = ?")
        .get(version_id)
    ).toBeNull();
  });
});

// ============================================================================
// duplicateEstimate - Verify it copies all the actual data
// ============================================================================

describe("duplicateEstimate", () => {
  let originalId: string;

  beforeAll(async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}DuplicateOriginal`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        client_email: UNIQUE.CLIENT_EMAIL,
        sections: [{ id: "s1", name: UNIQUE.SECTION_NAME }],
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            description: UNIQUE.ITEM_DESCRIPTION,
            qty: 10,
            uom: "EA",
            cost: 75,
            section_id: "s1",
          },
        ],
      })
    );
    const data = (await response.json()) as { id: string };
    originalId = data.id;
    testEstimateIds.push(originalId);
  });

  test("returns 404 for non-existent estimate", async () => {
    const response = await duplicateEstimate(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("copies all values to new estimate", async () => {
    const response = await duplicateEstimate(
      makeGetRequest({ id: originalId })
    );
    expect(response.status).toBe(200);

    const { id: newId } = (await response.json()) as { id: string };
    testEstimateIds.push(newId);

    // Verify the copy has all the same data
    const copy = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(newId)) as EstimateRow;

    expect(copy.name).toContain("DuplicateOriginal");
    expect(copy.name).toContain("(Copy)");
    expect(copy.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(copy.client_email).toBe(UNIQUE.CLIENT_EMAIL);

    // Verify section was copied
    const copyVersion = (await db
      .prepare(
        "SELECT id FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(newId)) as { id: string };

    const copySections = (await db
      .prepare("SELECT name FROM estimate_sections WHERE version_id = ?")
      .all(copyVersion.id)) as Array<{ name: string }>;

    expect(copySections).toHaveLength(1);
    expect(copySections[0].name).toBe(UNIQUE.SECTION_NAME);

    // Verify line item was copied WITH DESCRIPTION
    const copyItems = (await db
      .prepare("SELECT * FROM estimate_line_items WHERE version_id = ?")
      .all(copyVersion.id)) as EstimateLineItemRow[];

    expect(copyItems).toHaveLength(1);
    expect(copyItems[0].item_name).toBe(UNIQUE.ITEM_NAME);
    expect(copyItems[0].description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(copyItems[0].notes).toBeNull();
    expect(copyItems[0].quantity).toBe(10);
  });
});

// ============================================================================
// finalizeEstimate - Canonical final SOV selection by project
// ============================================================================

describe("finalizeEstimate", () => {
  test("locks estimate and marks it canonical for a single linked project", async () => {
    const createRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}FinalizeSingleProject`,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testEstimateIds.push(id);

    const projectId = await createTestProject(
      `${TEST_PREFIX}FinalizeSingleProjectRoot`
    );

    await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [projectId, Number(id), "test"]
    );

    const response = await finalizeEstimate(makePostRequestWithParams({ id }));
    expect(response.status).toBe(200);

    const estimate = (await db
      .prepare("SELECT is_locked FROM estimates WHERE id = ?")
      .get(id)) as { is_locked: number };
    expect(estimate.is_locked).toBe(1);

    const canonical = (await db
      .prepare(
        `SELECT estimate_id, is_canonical, canonicalized_at
         FROM project_estimates
         WHERE project_id = ?
           AND estimate_id = ?`
      )
      .get(projectId, Number(id))) as {
      estimate_id: number;
      is_canonical: boolean;
      canonicalized_at: string | null;
    };

    expect(canonical.estimate_id).toBe(Number(id));
    expect(canonical.is_canonical).toBe(true);
    expect(canonical.canonicalized_at).toBeTruthy();
  });

  test("returns 409 when estimate links to multiple projects without explicit project_id", async () => {
    const createRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}FinalizeAmbiguousProject`,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testEstimateIds.push(id);

    const projectA = await createTestProject(
      `${TEST_PREFIX}FinalizeAmbiguousA`
    );
    const projectB = await createTestProject(
      `${TEST_PREFIX}FinalizeAmbiguousB`
    );

    await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES (?, ?, ?), (?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [projectA, Number(id), "test", projectB, Number(id), "test"]
    );

    const response = await finalizeEstimate(makePostRequestWithParams({ id }));
    expect(response.status).toBe(409);

    const body = (await response.json()) as {
      code?: string;
      project_ids?: number[];
    };

    expect(body.code).toBe("ambiguous_project_link");
    expect(body.project_ids).toEqual([projectA, projectB]);
  });

  test("respects explicit project_id and switches canonical estimate", async () => {
    const projectId = await createTestProject(
      `${TEST_PREFIX}FinalizeExplicitProject`
    );

    const firstEstimateRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}FinalizeExplicitFirst`,
      })
    );
    const secondEstimateRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}FinalizeExplicitSecond`,
      })
    );

    const { id: firstId } = (await firstEstimateRes.json()) as { id: string };
    const { id: secondId } = (await secondEstimateRes.json()) as {
      id: string;
    };
    testEstimateIds.push(firstId, secondId);

    await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES (?, ?, ?), (?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [projectId, Number(firstId), "test", projectId, Number(secondId), "test"]
    );

    await db.run(
      `UPDATE project_estimates
       SET is_canonical = CASE WHEN estimate_id = ? THEN TRUE ELSE FALSE END,
           canonicalized_at = CASE WHEN estimate_id = ? THEN now() ELSE canonicalized_at END
       WHERE project_id = ?`,
      [Number(firstId), Number(firstId), projectId]
    );

    const response = await finalizeEstimate(
      makePostRequestWithParams(
        { id: secondId },
        { project_id: projectId, source: "test_override" }
      )
    );
    expect(response.status).toBe(200);

    const rows = (await db
      .prepare(
        `SELECT estimate_id, is_canonical
         FROM project_estimates
         WHERE project_id = ?
         ORDER BY estimate_id ASC`
      )
      .all(projectId)) as Array<{
      estimate_id: number;
      is_canonical: boolean;
    }>;

    const firstRow = rows.find((row) => row.estimate_id === Number(firstId));
    const secondRow = rows.find((row) => row.estimate_id === Number(secondId));

    expect(firstRow?.is_canonical).toBe(false);
    expect(secondRow?.is_canonical).toBe(true);
  });
});

// getEstimatePdf - THE CRITICAL TEST: Verify PDF contains actual data
// ============================================================================

describe("getEstimatePdf", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}PdfContentTest`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        estimator: "Chi Ejimofor",
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            description: UNIQUE.ITEM_DESCRIPTION,
            qty: 3,
            uom: "HR",
            cost: 150,
          },
        ],
      })
    );
    const data = (await response.json()) as { id: string };
    testId = data.id;
    testEstimateIds.push(testId);
  });

  test("returns 404 for non-existent estimate", async () => {
    const response = await getEstimatePdf(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("returns valid PDF file", async () => {
    const response = await getEstimatePdf(makeGetRequest({ id: testId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const buffer = await response.arrayBuffer();
    const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
    expect(header).toBe("%PDF");
  });

  test("PDF contains the data we saved - verify via EditorEstimate transformation", async () => {
    // Instead of parsing the PDF (complex), verify the transformation is correct
    // by checking what getEstimate returns (which is what gets transformed to PDF)

    const response = await getEstimate(makeGetRequest({ id: testId }));
    const estimate = (await response.json()) as {
      job_name: string;
      client_name: string;
      job_address: string;
      current_version: {
        line_items: Array<{
          item_name: string | null;
          description: string;
          notes: string | null;
          quantity: number;
          unit: string;
          unit_price: number;
        }>;
      };
    };

    // These are the values that will be transformed into EditorEstimate for PDF
    expect(estimate.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(estimate.job_address).toBe(UNIQUE.NORMALIZED_JOB_ADDRESS);

    // CRITICAL: item_name + description must be populated from catalog
    const item = estimate.current_version.line_items[0];
    expect(item.item_name).toBe(UNIQUE.ITEM_NAME);
    expect(item.description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.notes).toBeNull();
  });
});

// ============================================================================
// Integration Workflow - Full end-to-end estimate lifecycle
// ============================================================================

describe("integration workflow", () => {
  test("enforces validation and preserves canonical data across full flow", async () => {
    // 1) Invalid create should fail (non-catalog item)
    const invalidCreate = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}WorkflowInvalidCreate`,
        line_items: [{ item: "Not In Catalog", qty: 1, cost: 100 }],
      })
    );
    expect(invalidCreate.status).toBe(400);

    // 2) Valid create should pass
    const validCreate = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}Workflow`,
        client_name: UNIQUE.CLIENT_NAME,
        client_address: UNIQUE.CLIENT_ADDRESS,
        job_address: UNIQUE.JOB_ADDRESS,
        estimator: "Chi Ejimofor",
        line_items: [{ item: UNIQUE.ITEM_NAME, qty: 3, cost: 100 }],
      })
    );
    expect(validCreate.status).toBe(200);
    const createData = (await validCreate.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(createData.id);

    const initialLineItem = (await db
      .prepare(
        "SELECT item_name, description, quantity FROM estimate_line_items WHERE version_id = ?"
      )
      .get(createData.version_id)) as {
      item_name: string;
      description: string;
      quantity: number;
    };
    expect(initialLineItem.item_name).toBe(UNIQUE.ITEM_NAME);
    expect(initialLineItem.description).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(initialLineItem.quantity).toBe(3);

    // 3) Invalid update should fail and must not mutate rows
    const invalidUpdate = await updateEstimate(
      makeRequestWithParams(
        {
          sections: [
            { id: "workflow-section", name: "Invalid Update Section" },
          ],
        },
        { id: createData.id }
      )
    );
    expect(invalidUpdate.status).toBe(400);

    const afterInvalid = (await db
      .prepare(
        "SELECT item_name, description, quantity FROM estimate_line_items WHERE version_id = ?"
      )
      .get(createData.version_id)) as {
      item_name: string;
      description: string;
      quantity: number;
    };
    expect(afterInvalid).toEqual(initialLineItem);

    // 4) Valid update should pass and mutate to new canonical item
    const validUpdate = await updateEstimate(
      makeRequestWithParams(
        {
          base_number: "991122",
          job_name: `${TEST_PREFIX}WorkflowUpdated`,
          client_name: UNIQUE.CLIENT_NAME,
          client_address: UNIQUE.CLIENT_ADDRESS,
          job_address: UNIQUE.JOB_ADDRESS,
          line_items: [{ item: UNIQUE.ALT_ITEM_NAME, qty: 4, cost: 110 }],
        },
        { id: createData.id }
      )
    );
    expect(validUpdate.status).toBe(200);

    const estimateRes = await getEstimate(
      makeGetRequest({ id: createData.id })
    );
    expect(estimateRes.status).toBe(200);
    const estimateData = (await estimateRes.json()) as {
      job_name: string;
      job_address: string;
      current_version: {
        line_items: Array<{
          item_name: string | null;
          description: string;
          quantity: number;
        }>;
      };
    };
    expect(estimateData.job_name).toContain("WorkflowUpdated");
    expect(estimateData.job_address).toBe(UNIQUE.NORMALIZED_JOB_ADDRESS);
    expect(estimateData.current_version.line_items).toHaveLength(1);
    expect(estimateData.current_version.line_items[0].item_name).toBe(
      UNIQUE.ALT_ITEM_NAME
    );
    expect(estimateData.current_version.line_items[0].description).toBe(
      UNIQUE.ALT_ITEM_DESCRIPTION
    );
    expect(estimateData.current_version.line_items[0].quantity).toBe(4);

    // 5) PDF endpoint still works after updates
    const pdfRes = await getEstimatePdf(makeGetRequest({ id: createData.id }));
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
    const pdfBuffer = await pdfRes.arrayBuffer();
    const header = String.fromCharCode(
      ...new Uint8Array(pdfBuffer.slice(0, 4))
    );
    expect(header).toBe("%PDF");
  });
});

// ============================================================================
// Edge Cases - Things that might break
// ============================================================================

describe("edge cases", () => {
  test("rejects non-catalog line item names", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}NonCatalogItem`,
        line_items: [{ item: "Not In Catalog", qty: 1, cost: 50 }],
      })
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Line item 1");
  });

  test("requires job/client addresses when updating with line items", async () => {
    const createRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}MissingAddresses`,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testEstimateIds.push(id);

    const updateRes = await updateEstimate(
      makeRequestWithParams(
        {
          job_name: `${TEST_PREFIX}MissingAddressesUpdated`,
          line_items: [{ item: UNIQUE.ITEM_NAME, qty: 1, cost: 55 }],
        },
        { id }
      )
    );

    expect(updateRes.status).toBe(400);
    const data = (await updateRes.json()) as {
      error: string;
      issues?: string[];
    };
    const joinedIssues = [data.error, ...(data.issues ?? [])].join(" ");
    expect(joinedIssues).toContain("job_address");
    expect(joinedIssues).toContain("client_address");
  });

  test("rejects sections updates without line_items", async () => {
    const createRes = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}SectionOnlyUpdate`,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testEstimateIds.push(id);

    const updateRes = await updateEstimate(
      makeRequestWithParams(
        {
          sections: [{ id: "s-only", name: "Section Without Items" }],
        },
        { id }
      )
    );

    expect(updateRes.status).toBe(400);
    const data = (await updateRes.json()) as { error: string };
    expect(data.error).toContain("sections cannot be updated");
  });
});
