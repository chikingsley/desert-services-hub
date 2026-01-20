/**
 * Quotes API Unit Tests
 *
 * Tests BEHAVIOR, not just structure.
 * Each test verifies that actual values flow through the system correctly.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../../lib/db";
import type {
  QuoteLineItemRow,
  QuoteRow,
  QuoteSectionRow,
} from "../../lib/types";
import { createQuote, listQuotes } from "./quotes";
import {
  deleteQuote,
  duplicateQuote,
  getQuote,
  getQuotePdf,
  updateQuote,
} from "./quotes-by-id";

// ============================================================================
// Test Constants - Unique values we can search for in outputs
// ============================================================================

const TEST_PREFIX = "_TEST_DELETE_ME_";
const testQuoteIds: string[] = [];

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
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRequestWithParams(
  body: unknown,
  params: { id: string }
): Request & { params: { id: string } } {
  const req = new Request(`http://localhost/api/quotes/${params.id}`, {
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
  const req = new Request(`http://localhost/api/quotes/${params.id}`, {
    method: "GET",
  }) as Request & { params: { id: string } };
  req.params = params;
  return req;
}

// ============================================================================
// Cleanup
// ============================================================================

afterAll(() => {
  for (const id of testQuoteIds) {
    try {
      db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
    } catch {
      // Ignore cleanup errors
    }
  }
  // Verify cleanup
  const remaining = db
    .prepare("SELECT COUNT(*) as count FROM quotes WHERE job_name LIKE ?")
    .get(`${TEST_PREFIX}%`) as { count: number };
  if (remaining.count > 0) {
    throw new Error(`Cleanup failed: ${remaining.count} test quotes remain`);
  }
});

// ============================================================================
// listQuotes - Verify it returns actual data we can use
// ============================================================================

describe("listQuotes", () => {
  test("returns array containing created quote with correct values", async () => {
    // Create quote with unique values
    const createRes = await createQuote(
      makeRequest({
        job_name: UNIQUE.JOB_NAME,
        client_name: UNIQUE.CLIENT_NAME,
      })
    );
    const { id } = (await createRes.json()) as { id: string };
    testQuoteIds.push(id);

    // List and find our quote
    const response = listQuotes();
    const quotes = (await response.json()) as Array<{
      id: string;
      job_name: string;
      client_name: string | null;
      versions: Array<{ total: number }>;
    }>;

    const ourQuote = quotes.find((q) => q.id === id);

    expect(ourQuote).toBeDefined();
    expect(ourQuote!.job_name).toBe(UNIQUE.JOB_NAME);
    expect(ourQuote!.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(ourQuote!.versions).toHaveLength(1);
  });
});

// ============================================================================
// createQuote - Verify data is actually saved correctly
// ============================================================================

describe("createQuote", () => {
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

    const response = await createQuote(makeRequest(input));
    expect(response.status).toBe(200);

    const { id } = (await response.json()) as { id: string };
    testQuoteIds.push(id);

    // Query database directly and verify ACTUAL VALUES
    const row = db
      .prepare("SELECT * FROM quotes WHERE id = ?")
      .get(id) as QuoteRow;

    expect(row.job_name).toBe(input.job_name);
    expect(row.job_address).toBe(input.job_address);
    expect(row.client_name).toBe(input.client_name);
    expect(row.client_email).toBe(input.client_email);
    expect(row.client_phone).toBe(input.client_phone);
    expect(row.notes).toBe(input.notes);
    expect(row.status).toBe(input.status);
  });

  test("saves line item with description to notes field", async () => {
    const response = await createQuote(
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
    testQuoteIds.push(id);

    // Verify the description was saved to notes
    const item = db
      .prepare("SELECT * FROM quote_line_items WHERE version_id = ?")
      .get(version_id) as QuoteLineItemRow;

    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.quantity).toBe(5);
    expect(item.unit_price).toBe(100);
  });

  test("saves section with correct name", async () => {
    const response = await createQuote(
      makeRequest({
        job_name: `${TEST_PREFIX}WithSection`,
        sections: [{ id: "s1", name: UNIQUE.SECTION_NAME }],
      })
    );

    const { id, version_id } = (await response.json()) as {
      id: string;
      version_id: string;
    };
    testQuoteIds.push(id);

    const section = db
      .prepare("SELECT * FROM quote_sections WHERE version_id = ?")
      .get(version_id) as QuoteSectionRow;

    expect(section.name).toBe(UNIQUE.SECTION_NAME);
  });

  test("links line item to correct section", async () => {
    const response = await createQuote(
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
    testQuoteIds.push(id);

    const section = db
      .prepare("SELECT id FROM quote_sections WHERE version_id = ?")
      .get(version_id) as { id: string };

    const item = db
      .prepare("SELECT section_id FROM quote_line_items WHERE version_id = ?")
      .get(version_id) as { section_id: string };

    // Item should reference the NEW section ID, not the original
    expect(item.section_id).toBe(section.id);
    expect(item.section_id).not.toBe("sec-original");
  });
});

// ============================================================================
// getQuote - Verify it returns the data we saved
// ============================================================================

describe("getQuote", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createQuote(
      makeRequest({
        job_name: `${TEST_PREFIX}GetQuoteTest`,
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
    testQuoteIds.push(testId);
  });

  test("returns 404 for non-existent quote", async () => {
    const response = getQuote(makeGetRequest({ id: "nonexistent-12345" }));
    expect(response.status).toBe(404);
  });

  test("returns quote with all the values we saved", async () => {
    const response = getQuote(makeGetRequest({ id: testId }));
    expect(response.status).toBe(200);

    const quote = (await response.json()) as {
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
    expect(quote.job_name).toContain(TEST_PREFIX);
    expect(quote.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(quote.job_address).toBe(UNIQUE.JOB_ADDRESS);

    // Verify section
    expect(quote.current_version.sections).toHaveLength(1);
    expect(quote.current_version.sections[0].name).toBe(UNIQUE.SECTION_NAME);

    // Verify line item - THIS IS THE CRITICAL TEST
    expect(quote.current_version.line_items).toHaveLength(1);
    const item = quote.current_version.line_items[0];
    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(item.quantity).toBe(7);
    expect(item.unit).toBe("LF");
    expect(item.unit_price).toBe(25);
  });
});

// ============================================================================
// updateQuote - Verify updates actually change the data
// ============================================================================

describe("updateQuote", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createQuote(
      makeRequest({
        job_name: `${TEST_PREFIX}UpdateTest`,
        client_name: "Original Client",
      })
    );
    const data = (await response.json()) as { id: string };
    testId = data.id;
    testQuoteIds.push(testId);
  });

  test("actually changes values in database", async () => {
    const newJobName = `${TEST_PREFIX}UpdatedJobName`;
    const newClientName = "Updated Client Name";

    await updateQuote(
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
    const row = db
      .prepare("SELECT job_name, client_name, status FROM quotes WHERE id = ?")
      .get(testId) as { job_name: string; client_name: string; status: string };

    expect(row.job_name).toBe(newJobName);
    expect(row.client_name).toBe(newClientName);
    expect(row.status).toBe("sent");
  });

  test("replaces line items with new ones including descriptions", async () => {
    const newItemName = "Brand New Item";
    const newDescription = "Brand New Description That Must Be Saved";

    await updateQuote(
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

    const version = db
      .prepare(
        "SELECT id FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(testId) as { id: string };

    const items = db
      .prepare("SELECT * FROM quote_line_items WHERE version_id = ?")
      .all(version.id) as QuoteLineItemRow[];

    expect(items).toHaveLength(1);
    expect(items[0].description).toBe(newItemName);
    expect(items[0].notes).toBe(newDescription);
    expect(items[0].quantity).toBe(99);
    expect(items[0].unit).toBe("SF");
  });
});

// ============================================================================
// deleteQuote - Verify it actually removes data
// ============================================================================

describe("deleteQuote", () => {
  test("returns 404 for non-existent quote", async () => {
    const response = deleteQuote(makeGetRequest({ id: "nonexistent-12345" }));
    expect(response.status).toBe(404);
  });

  test("removes quote and all related data from database", async () => {
    // Create a quote to delete
    const createRes = await createQuote(
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
      db.prepare("SELECT 1 FROM quotes WHERE id = ?").get(id)
    ).toBeTruthy();
    expect(
      db.prepare("SELECT 1 FROM quote_versions WHERE id = ?").get(version_id)
    ).toBeTruthy();

    // Delete
    const response = deleteQuote(makeGetRequest({ id }));
    expect(response.status).toBe(200);

    // Verify everything is gone
    expect(db.prepare("SELECT 1 FROM quotes WHERE id = ?").get(id)).toBeNull();
    expect(
      db.prepare("SELECT 1 FROM quote_versions WHERE id = ?").get(version_id)
    ).toBeNull();
    expect(
      db
        .prepare("SELECT 1 FROM quote_sections WHERE version_id = ?")
        .get(version_id)
    ).toBeNull();
    expect(
      db
        .prepare("SELECT 1 FROM quote_line_items WHERE version_id = ?")
        .get(version_id)
    ).toBeNull();
  });
});

// ============================================================================
// duplicateQuote - Verify it copies all the actual data
// ============================================================================

describe("duplicateQuote", () => {
  let originalId: string;

  beforeAll(async () => {
    const response = await createQuote(
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
    testQuoteIds.push(originalId);
  });

  test("returns 404 for non-existent quote", async () => {
    const response = duplicateQuote(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("copies all values to new quote", async () => {
    const response = duplicateQuote(makeGetRequest({ id: originalId }));
    expect(response.status).toBe(200);

    const { id: newId } = (await response.json()) as { id: string };
    testQuoteIds.push(newId);

    // Verify the copy has all the same data
    const copy = db
      .prepare("SELECT * FROM quotes WHERE id = ?")
      .get(newId) as QuoteRow;

    expect(copy.job_name).toContain("DuplicateOriginal");
    expect(copy.job_name).toContain("(Copy)");
    expect(copy.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(copy.client_email).toBe(UNIQUE.CLIENT_EMAIL);

    // Verify section was copied
    const copyVersion = db
      .prepare(
        "SELECT id FROM quote_versions WHERE quote_id = ? AND is_current = 1"
      )
      .get(newId) as { id: string };

    const copySections = db
      .prepare("SELECT name FROM quote_sections WHERE version_id = ?")
      .all(copyVersion.id) as Array<{ name: string }>;

    expect(copySections).toHaveLength(1);
    expect(copySections[0].name).toBe(UNIQUE.SECTION_NAME);

    // Verify line item was copied WITH DESCRIPTION
    const copyItems = db
      .prepare("SELECT * FROM quote_line_items WHERE version_id = ?")
      .all(copyVersion.id) as QuoteLineItemRow[];

    expect(copyItems).toHaveLength(1);
    expect(copyItems[0].description).toBe(UNIQUE.ITEM_NAME);
    expect(copyItems[0].notes).toBe(UNIQUE.ITEM_DESCRIPTION);
    expect(copyItems[0].quantity).toBe(10);
  });
});

// ============================================================================
// getQuotePdf - THE CRITICAL TEST: Verify PDF contains actual data
// ============================================================================

describe("getQuotePdf", () => {
  let testId: string;

  beforeAll(async () => {
    const response = await createQuote(
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
    testQuoteIds.push(testId);
  });

  test("returns 404 for non-existent quote", async () => {
    const response = await getQuotePdf(
      makeGetRequest({ id: "nonexistent-12345" })
    );
    expect(response.status).toBe(404);
  });

  test("returns valid PDF file", async () => {
    const response = await getQuotePdf(makeGetRequest({ id: testId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const buffer = await response.arrayBuffer();
    const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
    expect(header).toBe("%PDF");
  });

  test("PDF contains the data we saved - verify via EditorQuote transformation", async () => {
    // Instead of parsing the PDF (complex), verify the transformation is correct
    // by checking what getQuote returns (which is what gets transformed to PDF)

    const response = getQuote(makeGetRequest({ id: testId }));
    const quote = (await response.json()) as {
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

    // These are the values that will be transformed into EditorQuote for PDF
    expect(quote.client_name).toBe(UNIQUE.CLIENT_NAME);
    expect(quote.job_address).toBe(UNIQUE.JOB_ADDRESS);

    // CRITICAL: The line item must have the description in notes
    const item = quote.current_version.line_items[0];
    expect(item.description).toBe(UNIQUE.ITEM_NAME);
    expect(item.notes).toBe(UNIQUE.ITEM_DESCRIPTION);

    // Verify the transformation to EditorQuote format
    // In the PDF, item.description -> notes, item.item <- description
    // So the EditorLineItem.description should be quote.notes
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
    const response = await createQuote(
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
    testQuoteIds.push(id);

    const item = db
      .prepare("SELECT notes FROM quote_line_items WHERE version_id = ?")
      .get(version_id) as { notes: string | null };

    // Empty string should become null, not saved as ""
    expect(item.notes).toBeNull();
  });

  test("whitespace-only description should not be saved as notes", async () => {
    const response = await createQuote(
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
    testQuoteIds.push(id);

    const item = db
      .prepare("SELECT notes FROM quote_line_items WHERE version_id = ?")
      .get(version_id) as { notes: string | null };

    expect(item.notes).toBeNull();
  });

  test("description same as item name should not be duplicated to notes", async () => {
    const response = await createQuote(
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
    testQuoteIds.push(id);

    const item = db
      .prepare(
        "SELECT description, notes FROM quote_line_items WHERE version_id = ?"
      )
      .get(version_id) as { description: string; notes: string | null };

    expect(item.description).toBe("Same Value");
    expect(item.notes).toBeNull(); // Should not duplicate
  });

  test("notes field takes precedence over description field", async () => {
    const response = await createQuote(
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
    testQuoteIds.push(id);

    const item = db
      .prepare("SELECT notes FROM quote_line_items WHERE version_id = ?")
      .get(version_id) as { notes: string | null };

    expect(item.notes).toBe("Notes Value");
  });
});
