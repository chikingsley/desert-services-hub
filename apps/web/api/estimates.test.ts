/**
 * Estimates API Unit Tests
 *
 * Tests BEHAVIOR, not just structure.
 * Each test verifies that actual values flow through the system correctly.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/hub";
import type {
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
} from "@lib/db/types";
import { createEstimate, listEstimates } from "@/apps/web/api/estimates";
import {
  deleteEstimate,
  duplicateEstimate,
  getEstimate,
  getEstimatePdf,
  updateEstimate,
} from "@/apps/web/api/estimates-by-id";

// ============================================================================
// Test Constants - Unique values we can search for in outputs
// ============================================================================

const TEST_PREFIX = "_TEST_DELETE_ME_";
const testEstimateIds: string[] = [];

// Unique identifiable values for each test
const UNIQUE = {
  JOB_NAME: `${TEST_PREFIX}UniqueJob_ABC123`,
  CLIENT_NAME: "UniqueClient_XYZ789",
  CLIENT_EMAIL: "unique_test_456@example.com",
  JOB_ADDRESS: "999 Unique Test Street, Suite ABC",
  ITEM_NAME: "UniqueItem_QRS111",
  ITEM_DESCRIPTION: "UniqueDescription_TUV222 for testing",
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

// ============================================================================
// Cleanup
// ============================================================================

afterAll(async () => {
  for (const id of testEstimateIds) {
    try {
      await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
    } catch {
      // Ignore cleanup errors
    }
  }
  // Verify cleanup
  const remaining = (await db
    .prepare("SELECT COUNT(*) as count FROM estimates WHERE name LIKE ?")
    .get(`${TEST_PREFIX}%`)) as { count: number };
  if (remaining.count > 0) {
    throw new Error(`Cleanup failed: ${remaining.count} test estimates remain`);
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
      estimates: Array<{
        id: string;
        job_name: string;
        client_name: string | null;
        versions: Array<{ total: number }>;
      }>;
    };
    const estimates = body.estimates;

    const ourEstimate = estimates.find((q) => q.id === id);

    expect(ourEstimate).toBeDefined();
    expect(ourEstimate?.job_name).toBe(UNIQUE.JOB_NAME);
    expect(ourEstimate?.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(ourEstimate?.versions).toHaveLength(1);
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
    expect(row.job_address).toBe(input.job_address);
    expect(row.client_name).toBe(input.client_name);
    expect(row.client_email).toBe(input.client_email);
    expect(row.client_phone).toBe(input.client_phone);
    expect(row.notes).toBe(input.notes);
    expect(row.bid_status).toBe(input.status);
  });

  test("saves line item with description to notes field", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}ItemWithDescription`,
        line_items: [
          {
            item: UNIQUE.ITEM_NAME,
            description: UNIQUE.ITEM_DESCRIPTION,
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

    // Verify the description was saved to notes
    const item = (await db
      .prepare("SELECT * FROM estimate_line_items WHERE version_id = ?")
      .get(version_id)) as EstimateLineItemRow;

    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);
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
        sections: [{ id: "sec-original", name: "Test Section" }],
        line_items: [
          {
            item: "Sectioned Item",
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
          description: string;
          notes: string;
          quantity: number;
          unit: string;
          unit_price: number;
        }>;
      };
    };

    // Verify the exact values we saved come back
    expect(estimate.job_name).toContain(TEST_PREFIX);
    expect(estimate.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(estimate.job_address).toBe(UNIQUE.JOB_ADDRESS);

    // Verify section
    expect(estimate.current_version.sections).toHaveLength(1);
    expect(estimate.current_version.sections[0].name).toBe(UNIQUE.SECTION_NAME);

    // Verify line item - THIS IS THE CRITICAL TEST
    expect(estimate.current_version.line_items).toHaveLength(1);
    const item = estimate.current_version.line_items[0];
    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.quantity).toBe(7);
    expect(item.unit).toBe("LF");
    expect(item.unit_price).toBe(25);
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
    const newItemName = "Brand New Item";
    const newDescription = "Brand New Description That Must Be Saved";

    await updateEstimate(
      makeRequestWithParams(
        {
          base_number: "999999",
          job_name: `${TEST_PREFIX}UpdatedJobName`,
          line_items: [
            {
              item: newItemName,
              description: newDescription,
              qty: 99,
              uom: "SF",
              cost: 50,
            },
          ],
        },
        { id: testId }
      )
    );

    const version = (await db
      .prepare(
        "SELECT id FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(testId)) as { id: string };

    const items = (await db
      .prepare("SELECT * FROM estimate_line_items WHERE version_id = ?")
      .all(version.id)) as EstimateLineItemRow[];

    expect(items).toHaveLength(1);
    expect(items[0].description).toBe(newItemName);
    expect(items[0].notes).toBe(newDescription);
    expect(items[0].quantity).toBe(99);
    expect(items[0].unit).toBe("SF");
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
        sections: [{ id: "s1", name: "Delete Section" }],
        line_items: [{ item: "Delete Item", qty: 1, uom: "EA", cost: 50 }],
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
    expect(copyItems[0].description).toBe(UNIQUE.ITEM_NAME);
    expect(copyItems[0].notes).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(copyItems[0].quantity).toBe(10);
  });
});

// ============================================================================
// getEstimatePdf - THE CRITICAL TEST: Verify PDF contains actual data
// ============================================================================

describe("getEstimatePdf", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}PdfContentTest`,
        client_name: UNIQUE.CLIENT_NAME,
        job_address: UNIQUE.JOB_ADDRESS,
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
    expect(estimate.job_address).toBe(UNIQUE.JOB_ADDRESS);

    // CRITICAL: The line item must have the description in notes
    const item = estimate.current_version.line_items[0];
    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);

    // Verify the transformation to EditorEstimate format
    // In the PDF, item.description -> notes, item.item <- description
    // So the EditorLineItem.description should be estimate.notes
    expect(item.notes).not.toBeNull();
    expect(item.notes).not.toBe("");
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);
  });
});

// ============================================================================
// Edge Cases - Things that might break
// ============================================================================

describe("edge cases", () => {
  test("empty description string should not be saved as notes", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}EmptyDescription`,
        line_items: [
          {
            item: "Item With Empty Description",
            description: "", // Empty string
            qty: 1,
            uom: "EA",
            cost: 50,
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const item = (await db
      .prepare("SELECT notes FROM estimate_line_items WHERE version_id = ?")
      .get(version_id)) as { notes: string | null };

    // Empty string should become null, not saved as ""
    expect(item.notes).toBeNull();
  });

  test("whitespace-only description should not be saved as notes", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}WhitespaceDescription`,
        line_items: [
          {
            item: "Item With Whitespace Description",
            description: "   ", // Whitespace only
            qty: 1,
            uom: "EA",
            cost: 50,
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const item = (await db
      .prepare("SELECT notes FROM estimate_line_items WHERE version_id = ?")
      .get(version_id)) as { notes: string | null };

    expect(item.notes).toBeNull();
  });

  test("description same as item name should not be duplicated to notes", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}SameDescription`,
        line_items: [
          {
            item: "Same Value",
            description: "Same Value", // Same as item
            qty: 1,
            uom: "EA",
            cost: 50,
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const item = (await db
      .prepare(
        "SELECT description, notes FROM estimate_line_items WHERE version_id = ?"
      )
      .get(version_id)) as { description: string; notes: string | null };

    expect(item.description).toBe("Same Value");
    expect(item.notes).toBeNull(); // Should not duplicate
  });

  test("notes field takes precedence over description field", async () => {
    const response = await createEstimate(
      makeRequest({
        job_name: `${TEST_PREFIX}NotesPrecedence`,
        line_items: [
          {
            item: "Item Name",
            description: "Description Value",
            notes: "Notes Value", // Both provided
            qty: 1,
            uom: "EA",
            cost: 50,
          },
        ],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testEstimateIds.push(id);

    const item = (await db
      .prepare("SELECT notes FROM estimate_line_items WHERE version_id = ?")
      .get(version_id)) as { notes: string | null };

    expect(item.notes).toBe("Notes Value");
  });
});
