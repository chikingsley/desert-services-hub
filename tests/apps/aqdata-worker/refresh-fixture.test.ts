/**
 * Refreshes the dust-applications.xls fixture from the live AQData portal.
 *
 * Gate: RUN_AQ_REFRESH=true (hits the live portal and overwrites fixture)
 */
import { describe, expect, test } from "bun:test";
import { AQDataClient } from "../../../apps/aqdata-worker/src/aqdata/client";
import { FORMS } from "../../../apps/aqdata-worker/src/aqdata/constants";
import { parseDustApplicationExport } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-applications";

const RUN_REFRESH = process.env.RUN_AQ_REFRESH === "true";
const describeSuite = RUN_REFRESH ? describe : describe.skip;
const FIXTURES_DIR = "tests/apps/aqdata-worker/fixtures";

describeSuite("refresh fixture from live portal", () => {
  test("downloads fresh export and saves as fixture", async () => {
    const client = new AQDataClient();
    await client.connect();
    await client.navigateToDustApplicationSearch();
    await client.searchDustApplications();

    const buffer = await client.exportCurrentResults(
      FORMS.dustApplications.exportBtn
    );

    expect(buffer.length).toBeGreaterThan(100_000);
    console.log(
      `  Export buffer: ${(buffer.length / 1_000_000).toFixed(1)} MB`
    );

    await Bun.write(`${FIXTURES_DIR}/dust-applications.xls`, buffer);
    console.log(`  Saved to ${FIXTURES_DIR}/dust-applications.xls`);

    const results = parseDustApplicationExport(buffer);
    expect(results.length).toBeGreaterThan(10_000);
    console.log(`  Parsed ${results.length} permits`);
  }, 120_000);
});
