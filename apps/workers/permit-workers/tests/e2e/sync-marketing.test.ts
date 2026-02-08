/**
 * Marketing Permits Sync E2E Test
 *
 * Verifies the full flow: login -> download (incl. nav/filter) -> parse -> upsert.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { syncFromXls } from "@/handlers/sync";
import { downloadMarketingPermits } from "@/portal/sync-marketing";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

describe("Marketing Permits Sync Flow", () => {
  let downloadedPath: string | null = null;

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
    "2. download marketing permits",
    async () => {
      // Service handles navigation, filtering, and download internally
      downloadedPath = await downloadMarketingPermits(harness.page);
      expect(downloadedPath).toBeDefined();
      expect(downloadedPath.endsWith(".xls")).toBe(true);
    },
    TIMEOUTS.extended
  );

  test(
    "3. parse and sync to marketing database",
    async () => {
      if (!downloadedPath) {
        throw new Error("No download path");
      }

      const result = await syncFromXls(downloadedPath, "marketing");

      expect(result.newRecords).toBeGreaterThanOrEqual(0);
      expect(result.totalInDb).toBeGreaterThan(0);

      console.log(
        `📊 Marketing Sync Result: ${result.newRecords} new, ${result.totalInDb} total`
      );
    },
    TIMEOUTS.standard
  );
});
