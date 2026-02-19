import { describe, expect, test } from "bun:test";
import {
  itemHasEstimateFiles,
  parseFileColumnValue,
} from "@monday/sync/estimate-sync/file-assets";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";

describe("parseFileColumnValue", () => {
  test("parses valid file payload and drops invalid assets", () => {
    const parsed = parseFileColumnValue(
      JSON.stringify({
        files: [
          { assetId: 1, name: "a.pdf" },
          { assetId: 2 },
          { name: "missing-id.pdf" },
        ],
      })
    );

    expect(parsed).toEqual([
      { assetId: 1, name: "a.pdf" },
      { assetId: 2, name: "2" },
    ]);
  });

  test("returns empty for invalid JSON", () => {
    expect(parseFileColumnValue("{oops")).toEqual([]);
  });
});

describe("itemHasEstimateFiles", () => {
  test("only considers the estimate file column", () => {
    const hasEstimate = itemHasEstimateFiles([
      {
        id: ESTIMATING_COLUMNS.ESTIMATE.id,
        value: JSON.stringify({ files: [{ assetId: 99, name: "est.pdf" }] }),
      },
    ]);
    expect(hasEstimate).toBeTrue();

    const hasOtherOnly = itemHasEstimateFiles([
      {
        id: ESTIMATING_COLUMNS.PLANS.id,
        value: JSON.stringify({ files: [{ assetId: 42, name: "plan.pdf" }] }),
      },
    ]);
    expect(hasOtherOnly).toBeFalse();
  });
});
