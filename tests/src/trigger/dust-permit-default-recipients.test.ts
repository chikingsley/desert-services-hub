import { describe, expect, test } from "bun:test";

import {
  DUST_PERMIT_BILLING_CC,
  DUST_PERMIT_BILLING_TO,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-default-recipients";

describe("dust permit default recipients", () => {
  test("uses Daniel and Dawn instead of Kendra for billing CC defaults", () => {
    expect(DUST_PERMIT_BILLING_TO).toEqual([
      "eva@desertservices.net",
      "jayson@desertservices.net",
    ]);
    expect(DUST_PERMIT_BILLING_CC).toEqual([
      "don@desertservices.net",
      "francine@desertservices.net",
      "danielr@desertservices.net",
      "dawn@desertservices.net",
    ]);
    expect(DUST_PERMIT_BILLING_CC).not.toContain("kendra@desertservices.net");
  });
});
