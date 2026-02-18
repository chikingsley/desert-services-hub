import { describe, expect, test } from "bun:test";

import { extractNoi } from "@pdf-analysis/services/noi";

const SAMPLE_NOI = `
LTF#: 114131
ID#: AZC123456

Coverage Issued to:
Name: STEVENS LEINWEBER CONSTRUCTION, INC.
Address Line 1: 5045 N 12TH ST
Address Line 2: STE 200
City: PHOENIX
State: AZ
Zip: 85014

Construction Site Information:
Site Name: Lexington 420 - Northern Pkwy Logistics Bldg. D
Lat: 33.561333 / Long: -112.101702
Acres Disturbed: 13.32

SWPPP Contact Information:
First Name: Jeff
Last Name: Gardner
Phone: 6022919255
Work Email: jeff@example.com
`;

describe("extractNoi", () => {
  test("extracts core fields", () => {
    const result = extractNoi(SAMPLE_NOI);

    expect(result.applicantName).toBe("STEVENS LEINWEBER CONSTRUCTION, INC.");
    expect(result.siteName).toContain("Lexington 420");
    expect(result.latitude).toBe(33.561_333);
    expect(result.longitude).toBe(-112.101_702);
    expect(result.swpppContactPhone).toBe("(602) 291-9255");
    expect(result._extraction.confidence).toBe("high");
  });

  test("falls back to UNKNOWN for missing critical fields", () => {
    const result = extractNoi(
      "Coverage Issued to:\nName: X\nConstruction Site Information:\n"
    );

    expect(result.applicantName).toBe("X");
    expect(result.siteName).toBe("UNKNOWN");
    expect(result._extraction.confidence).toBe("medium");
  });
});
