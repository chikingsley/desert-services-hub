/**
 * Company Permits Sync E2E Test
 *
 * Verifies the full flow: login -> download (incl. nav) -> parse -> upsert.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { syncFromXls } from "@/handlers/sync";
import { downloadCompanyPermits } from "@/portal/sync-company";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

describe("Company Permits Sync Flow", () => {
  let downloadedPath: string | null = null;

  beforeAll(async () => {
    // Optional: clear some data if needed for deterministic testing
  });

  afterAll(async () => {
    await harness.teardown();
    if (downloadedPath) {
      try {
        await unlink(downloadedPath);
      } catch {
        // ignore
      }
    }
  });

  test(
    "1. login",
    async () => {
      await harness.setup();
      expect(harness.currentState).toBe("logged_in");
    },
    TIMEOUTS.standard
  );

  test(
    "2. download export to excel",
    async () => {
      // Service handles navigation internally
      downloadedPath = await downloadCompanyPermits(harness.page);
      expect(downloadedPath).toBeDefined();
      expect(downloadedPath.endsWith(".xls")).toBe(true);
    },
    TIMEOUTS.extended
  );

  test(
    "3. parse and sync to database",
    async () => {
      if (!downloadedPath) {
        throw new Error("No download path");
      }

      const result = await syncFromXls(downloadedPath, "company");

      expect(result.newRecords).toBeGreaterThanOrEqual(0);
      expect(result.totalInDb).toBeGreaterThan(0);

      console.log(
        `📊 Sync Result: ${result.newRecords} new, ${result.totalInDb} total`
      );
    },
    TIMEOUTS.standard
  );
});
