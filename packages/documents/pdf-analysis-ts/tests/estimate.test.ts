import { describe, expect, test } from "bun:test";

import {
  decodeCidGlyphs,
  normalizeCell,
  parseMoney,
  parseQty,
} from "@pdf-analysis/common";

describe("estimate helpers", () => {
  test("decodes cid glyph digits", () => {
    expect(decodeCidGlyphs("(cid:55)(cid:55)0.00")).toBe("770.00");
  });

  test("parses money with taxable suffix", () => {
    expect(parseMoney("1,350.00T")).toBe(1350);
  });

  test("parses qty", () => {
    expect(parseQty("1,560")).toBe(1560);
  });

  test("normalizes cells", () => {
    expect(normalizeCell("  ABC\r\nDEF  ")).toBe("ABC\nDEF");
  });
});
