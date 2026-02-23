import { afterAll, describe, expect, test } from "bun:test";
import { findItem } from "@/packages/estimates/catalog/catalog";
import { applyLineItemChanges } from "@/packages/estimates/estimating/estimate-line-item-change-service";
import { getEstimateWithDetails } from "@/packages/estimates/estimating/estimate-read-service";
import { createEstimate } from "@/packages/estimates/estimating/estimate-write-service";
import { db } from "@lib/db/client";

const TEST_PREFIX = "_TEST_ESTIMATE_GUARDS_";
const testEstimateIds: string[] = [];
const JOB_ADDRESS_ERROR_RE = /job_address/i;
const CATALOG_ERROR_RE = /catalog/i;

const PRIMARY_ITEM = findItem("SWPPP-002");
const SECONDARY_ITEM = findItem("CM-012");

if (!(PRIMARY_ITEM && SECONDARY_ITEM)) {
  throw new Error(
    "Required catalog fixtures missing for estimate guardrail tests."
  );
}

afterAll(async () => {
  for (const id of testEstimateIds) {
    try {
      await db.query("DELETE FROM estimates WHERE id = $1").run(id);
    } catch {
      // Ignore cleanup failures
    }
  }
});

describe("createEstimate guardrails", () => {
  test("rejects line items when required addresses are missing", async () => {
    await expect(
      createEstimate({
        job_name: `${TEST_PREFIX}MissingAddresses`,
        client_name: "Guardrails Client",
        line_items: [
          {
            item_name: PRIMARY_ITEM.name,
            description: "ignored",
            quantity: 1,
            unit_price: 100,
          },
        ],
      })
    ).rejects.toThrow(JOB_ADDRESS_ERROR_RE);
  });

  test("canonicalizes catalog description and normalizes addresses", async () => {
    const estimate = await createEstimate({
      job_name: `${TEST_PREFIX}CanonicalCreate`,
      client_name: "Guardrails Client",
      job_address: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
      client_address: "230 S Siesta Lane, Tempe, Arizona 85288",
      line_items: [
        {
          item_name: PRIMARY_ITEM.name,
          description: "custom text should not persist",
          quantity: 2,
          unit_price: 111,
        },
      ],
    });
    testEstimateIds.push(estimate.id);

    const row = (await db
      .query("SELECT job_address, client_address FROM estimates WHERE id = $1")
      .get(estimate.id)) as { job_address: string; client_address: string };
    expect(row.job_address).toBe(
      "3633 E Thunderbird Road\nPhoenix, Arizona 85032"
    );
    expect(row.client_address).toBe("230 S Siesta Lane\nTempe, Arizona 85288");

    const details = await getEstimateWithDetails(estimate.id);
    expect(details).toBeTruthy();
    const currentVersion = details?.current_version;
    expect(currentVersion?.line_items.length).toBe(1);
    expect(currentVersion?.line_items[0].item_name).toBe(PRIMARY_ITEM.name);
    expect(currentVersion?.line_items[0].description).toBe(
      PRIMARY_ITEM.description
    );
  });
});

describe("applyLineItemChanges guardrails", () => {
  test("rejects non-catalog add changes", async () => {
    const estimate = await createEstimate({
      job_name: `${TEST_PREFIX}ChangeReject`,
      client_name: "Guardrails Client",
      job_address: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
      client_address: "230 S Siesta Lane, Tempe, Arizona 85288",
      line_items: [
        {
          item_name: PRIMARY_ITEM.name,
          description: PRIMARY_ITEM.description,
          quantity: 1,
          unit_price: 100,
        },
      ],
    });
    testEstimateIds.push(estimate.id);

    await expect(
      applyLineItemChanges(estimate.id, [
        {
          action: "add",
          item_name: "Not In Catalog",
          description: "bad",
          quantity: 1,
          unit_price: 10,
        },
      ])
    ).rejects.toThrow(CATALOG_ERROR_RE);
  });

  test("forces canonical description during update changes", async () => {
    const estimate = await createEstimate({
      job_name: `${TEST_PREFIX}ChangeCanonical`,
      client_name: "Guardrails Client",
      job_address: "3633 E Thunderbird Road, Phoenix, Arizona 85032",
      client_address: "230 S Siesta Lane, Tempe, Arizona 85288",
      line_items: [
        {
          item_name: PRIMARY_ITEM.name,
          description: PRIMARY_ITEM.description,
          quantity: 1,
          unit_price: 100,
        },
      ],
    });
    testEstimateIds.push(estimate.id);

    const before = await getEstimateWithDetails(estimate.id);
    const lineItemId = before?.current_version.line_items[0]?.id;
    expect(lineItemId).toBeTruthy();

    await applyLineItemChanges(estimate.id, [
      {
        action: "update",
        id: lineItemId,
        item_name: SECONDARY_ITEM.name,
        description: "this should be replaced",
        quantity: 3,
        unit_price: 95,
      },
    ]);

    const after = await getEstimateWithDetails(estimate.id);
    const updatedItem = after?.current_version.line_items[0];
    expect(updatedItem?.item_name).toBe(SECONDARY_ITEM.name);
    expect(updatedItem?.description).toBe(SECONDARY_ITEM.description);
    expect(updatedItem?.quantity).toBe(3);
    expect(updatedItem?.unit_price).toBe(95);
  });
});
