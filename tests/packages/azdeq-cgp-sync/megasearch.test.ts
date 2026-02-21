import { describe, expect, test } from "bun:test";
import { parseMegaSearchEnvelope } from "../../../packages/azdeq-cgp-sync/src/megasearch-schema";
import {
  buildMegaSearchRecordId,
  hashMegaSearchRow,
} from "../../../packages/azdeq-cgp-sync/src/megasearch-sync";

describe("parseMegaSearchEnvelope", () => {
  test("extracts endpoint rows from envelope", () => {
    const payload = {
      sEcho: 0,
      iTotalRecords: 0,
      sharepoint: [
        {
          indexVal: "sharepoint-100",
          rimsNo: "RIMS-100",
          city: "PHOENIX",
        },
      ],
    };

    const parsed = parseMegaSearchEnvelope(payload, "sharepoint");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.indexVal).toBe("sharepoint-100");
  });

  test("throws when endpoint array is missing", () => {
    const payload = {
      sEcho: 0,
      iTotalRecords: 0,
      drywell: [],
    };

    expect(() => parseMegaSearchEnvelope(payload, "sharepoint")).toThrowError();
  });
});

describe("buildMegaSearchRecordId", () => {
  test("uses endpoint-specific composite identity keys", () => {
    const row = {
      indexVal: "sharepoint-100",
      rimsNo: "RIMS-100",
      city: "PHOENIX",
    };

    expect(buildMegaSearchRecordId("sharepoint", row)).toContain(
      "rimsNo=RIMS-100"
    );
  });

  test("falls back to endpoint-prefixed hash", () => {
    const row = {
      random: "value",
      nested: {
        z: 1,
        a: 2,
      },
    };
    const id = buildMegaSearchRecordId("unknown", row);
    expect(id.startsWith("hash:unknown:")).toBe(true);
  });
});

describe("hashMegaSearchRow", () => {
  test("is stable for identical objects with different key order", () => {
    const one = hashMegaSearchRow({ b: 2, a: 1 });
    const two = hashMegaSearchRow({ a: 1, b: 2 });
    expect(one).toBe(two);
  });
});
