import { describe, expect, test } from "bun:test";
import {
  extractEstimateNumbers,
  extractMondayPulseIds,
} from "@lib/linking/link-email";

describe("link-email signal extractors", () => {
  test("extractMondayPulseIds finds and deduplicates pulse/item ids", () => {
    const text = `
      https://app.monday.com/boards/123/pulses/987654321
      https://app.monday.com/boards/123/items/987654321
      https://app.monday.com/boards/123/items/123456789
    `;

    expect(extractMondayPulseIds(text)).toEqual(["987654321", "123456789"]);
  });

  test("extractEstimateNumbers captures standard estimate reference formats", () => {
    const text = `
      Est_1234567
      Estimate # 7654321
      est-1234567-r2
    `;

    expect(extractEstimateNumbers(text)).toEqual(["1234567", "7654321"]);
  });

  test("extractEstimateNumbers ignores non-matching short references", () => {
    const text = "Estimate # 12345 and Est_12 are not valid estimate ids";
    expect(extractEstimateNumbers(text)).toEqual([]);
  });
});
