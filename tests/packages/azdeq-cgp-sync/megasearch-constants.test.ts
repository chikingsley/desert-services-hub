import { describe, expect, test } from "bun:test";
import {
  MEGASEARCH_ALPHANUMERIC_SPLIT,
  MEGASEARCH_SPLIT_PLAN,
} from "../../../packages/azdeq-cgp-sync/src/megasearch-constants";

describe("MEGASEARCH_SPLIT_PLAN", () => {
  test("covers all configured fanout dimensions in deterministic order", () => {
    expect(MEGASEARCH_SPLIT_PLAN.map((entry) => entry.field)).toEqual([
      "city",
      "zip",
      "facilityName",
      "uniqueId",
      "address",
    ]);
  });

  test("uses alphanumeric token fanout for deeper dimensions", () => {
    const uniqueIdSplit = MEGASEARCH_SPLIT_PLAN.find(
      (entry) => entry.field === "uniqueId"
    );
    const addressSplit = MEGASEARCH_SPLIT_PLAN.find(
      (entry) => entry.field === "address"
    );

    expect(uniqueIdSplit?.tokens).toEqual(MEGASEARCH_ALPHANUMERIC_SPLIT);
    expect(addressSplit?.tokens).toEqual(MEGASEARCH_ALPHANUMERIC_SPLIT);
  });
});
