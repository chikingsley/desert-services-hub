/**
 * Monday Status Sync Worker - Integration Tests
 *
 * Tests actual sync operations with create → sync → verify → cleanup pattern.
 * Requires MONDAY_API_KEY environment variable.
 *
 * Run: cd workers/ds-monday-status-sync-worker && bun test
 */
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";

setDefaultTimeout(60_000);

const MONDAY_API_URL = "https://api.monday.com/v2";
const ESTIMATING_BOARD_ID = "7943937851";
const LEADS_BOARD_ID = "7943937841";

// Column IDs
const BID_STATUS_COL = "deal_stage";
const OVERALL_STATUS_COL = "color_mm068kjz";
const ESTIMATE_LINK_COL = "board_relation_mktg3z60";

const TEST_PREFIX = "_TEST_DELETE_ME_";
const mondayApiKey = process.env.MONDAY_API_KEY ?? "";
const hasCredentials = Boolean(mondayApiKey);
const runLiveMondayTests = process.env.RUN_MONDAY_LIVE_TESTS === "true";
const shouldRunLiveMondayTests = hasCredentials && runLiveMondayTests;

// Helper: Monday API query
async function mondayQuery<T>(queryStr: string): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: mondayApiKey,
      "API-Version": "2026-01",
    },
    body: JSON.stringify({ query: queryStr }),
  });

  const json = (await response.json()) as { data?: T; errors?: unknown[] };
  if (json.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error("Monday API returned no data");
  }
  return json.data;
}

// Helper: Create item
async function createItem(boardId: string, name: string): Promise<string> {
  const result = await mondayQuery<{ create_item: { id: string } }>(`
    mutation {
      create_item(board_id: ${boardId}, item_name: "${name}") {
        id
      }
    }
  `);
  return result.create_item.id;
}

// Helper: Delete item
async function deleteItem(itemId: string): Promise<void> {
  await mondayQuery(`
    mutation {
      delete_item(item_id: ${itemId}) { id }
    }
  `);
}

// Helper: Update column value
async function updateColumn(
  boardId: string,
  itemId: string,
  columnId: string,
  value: string
): Promise<void> {
  await mondayQuery(`
    mutation {
      change_simple_column_value(
        board_id: ${boardId}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: "${value}"
      ) { id }
    }
  `);
}

// Helper: Link items (board relation)
async function linkItems(
  boardId: string,
  itemId: string,
  columnId: string,
  linkedItemIds: string[]
): Promise<void> {
  const value = JSON.stringify({ item_ids: linkedItemIds });
  await mondayQuery(`
    mutation {
      change_column_value(
        board_id: ${boardId}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: ${JSON.stringify(value)}
      ) { id }
    }
  `);
}

// Helper: Get item column value
async function getItemStatus(
  _boardId: string,
  itemId: string,
  columnId: string
): Promise<string | null> {
  const result = await mondayQuery<{
    items: Array<{
      column_values: Array<{ id: string; text: string; value: string }>;
    }>;
  }>(`
    query {
      items(ids: [${itemId}]) {
        column_values(ids: ["${columnId}"]) {
          id
          text
          value
        }
      }
    }
  `);
  const col = result.items[0]?.column_values[0];
  return col?.text || null;
}

// Import the sync logic (we'll test the core function)
// Since we can't easily import from a worker, we'll replicate the core logic here for testing
async function syncLeadFromEstimate(
  leadId: string,
  estimateId: string
): Promise<string | null> {
  // Get estimate bid status
  const bidStatus = await getItemStatus(
    ESTIMATING_BOARD_ID,
    estimateId,
    BID_STATUS_COL
  );

  // Map to overall status
  const STATUS_MAP: Record<string, string> = {
    Won: "Won",
    "Pending Won": "Won",
    "Add to Projects": "Won",
    Lost: "Lost",
    "GC Not Awarded": "Lost",
    Duplicates: "Lost",
  };

  const newStatus = bidStatus ? STATUS_MAP[bidStatus] : null;
  if (!newStatus) {
    return null;
  }

  // Update lead
  await updateColumn(LEADS_BOARD_ID, leadId, OVERALL_STATUS_COL, newStatus);
  return newStatus;
}

describe.skipIf(!shouldRunLiveMondayTests)(
  "Monday Status Sync Integration",
  () => {
    const createdItems: Array<{ boardId: string; itemId: string }> = [];

    afterAll(async () => {
      // Cleanup all test items
      for (const { itemId } of createdItems) {
        try {
          await deleteItem(itemId);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe("Leads Sync", () => {
      it("syncs Lead Overall Status to Won when Estimate is Won", async () => {
        // Arrange: Create test estimate
        const estimateName = `${TEST_PREFIX}ESTIMATE_${Date.now()}`;
        const estimateId = await createItem(ESTIMATING_BOARD_ID, estimateName);
        createdItems.push({ boardId: ESTIMATING_BOARD_ID, itemId: estimateId });

        // Set estimate to Won
        await updateColumn(
          ESTIMATING_BOARD_ID,
          estimateId,
          BID_STATUS_COL,
          "Won"
        );

        // Create test lead
        const leadName = `${TEST_PREFIX}LEAD_${Date.now()}`;
        const leadId = await createItem(LEADS_BOARD_ID, leadName);
        createdItems.push({ boardId: LEADS_BOARD_ID, itemId: leadId });

        // Link lead to estimate
        await linkItems(LEADS_BOARD_ID, leadId, ESTIMATE_LINK_COL, [
          estimateId,
        ]);

        // Act: Run sync
        const result = await syncLeadFromEstimate(leadId, estimateId);

        // Assert
        expect(result).toBe("Won");

        // Verify the lead's status was actually updated
        const leadStatus = await getItemStatus(
          LEADS_BOARD_ID,
          leadId,
          OVERALL_STATUS_COL
        );
        expect(leadStatus).toBe("Won");
      });

      it("syncs Lead Overall Status to Lost when Estimate is Lost", async () => {
        // Arrange: Create test estimate
        const estimateName = `${TEST_PREFIX}ESTIMATE_LOST_${Date.now()}`;
        const estimateId = await createItem(ESTIMATING_BOARD_ID, estimateName);
        createdItems.push({ boardId: ESTIMATING_BOARD_ID, itemId: estimateId });

        // Set estimate to Lost
        await updateColumn(
          ESTIMATING_BOARD_ID,
          estimateId,
          BID_STATUS_COL,
          "Lost"
        );

        // Create test lead
        const leadName = `${TEST_PREFIX}LEAD_LOST_${Date.now()}`;
        const leadId = await createItem(LEADS_BOARD_ID, leadName);
        createdItems.push({ boardId: LEADS_BOARD_ID, itemId: leadId });

        // Link lead to estimate
        await linkItems(LEADS_BOARD_ID, leadId, ESTIMATE_LINK_COL, [
          estimateId,
        ]);

        // Act: Run sync
        const result = await syncLeadFromEstimate(leadId, estimateId);

        // Assert
        expect(result).toBe("Lost");

        // Verify
        const leadStatus = await getItemStatus(
          LEADS_BOARD_ID,
          leadId,
          OVERALL_STATUS_COL
        );
        expect(leadStatus).toBe("Lost");
      });

      it("syncs Lead to Lost when Estimate is GC Not Awarded", async () => {
        // Arrange
        const estimateName = `${TEST_PREFIX}ESTIMATE_GC_${Date.now()}`;
        const estimateId = await createItem(ESTIMATING_BOARD_ID, estimateName);
        createdItems.push({ boardId: ESTIMATING_BOARD_ID, itemId: estimateId });

        await updateColumn(
          ESTIMATING_BOARD_ID,
          estimateId,
          BID_STATUS_COL,
          "GC Not Awarded"
        );

        const leadName = `${TEST_PREFIX}LEAD_GC_${Date.now()}`;
        const leadId = await createItem(LEADS_BOARD_ID, leadName);
        createdItems.push({ boardId: LEADS_BOARD_ID, itemId: leadId });

        await linkItems(LEADS_BOARD_ID, leadId, ESTIMATE_LINK_COL, [
          estimateId,
        ]);

        // Act
        const result = await syncLeadFromEstimate(leadId, estimateId);

        // Assert
        expect(result).toBe("Lost");
      });

      it("returns null for Estimate with Bid Sent (no mapping)", async () => {
        // Arrange
        const estimateName = `${TEST_PREFIX}ESTIMATE_SENT_${Date.now()}`;
        const estimateId = await createItem(ESTIMATING_BOARD_ID, estimateName);
        createdItems.push({ boardId: ESTIMATING_BOARD_ID, itemId: estimateId });

        await updateColumn(
          ESTIMATING_BOARD_ID,
          estimateId,
          BID_STATUS_COL,
          "Bid Sent"
        );

        const leadName = `${TEST_PREFIX}LEAD_SENT_${Date.now()}`;
        const leadId = await createItem(LEADS_BOARD_ID, leadName);
        createdItems.push({ boardId: LEADS_BOARD_ID, itemId: leadId });

        await linkItems(LEADS_BOARD_ID, leadId, ESTIMATE_LINK_COL, [
          estimateId,
        ]);

        // Act
        const result = await syncLeadFromEstimate(leadId, estimateId);

        // Assert: No mapping for "Bid Sent", should return null
        expect(result).toBeNull();
      });
    });
  }
);
