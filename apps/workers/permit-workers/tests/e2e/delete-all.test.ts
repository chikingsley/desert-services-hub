/**
 * Standalone Delete All Test
 * Run: bun test tests/e2e/delete-all.test.ts
 *
 * Creates drafts if none exist, then deletes all drafts.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { createNewCompanyApplication } from "@/portal/create";
import { countDraftApps, deleteAllDrafts } from "@/portal/delete";
import { PortalHarness } from "./utils/harness";

const harness = new PortalHarness();

const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER;
const RUN_DELETE_ALL = process.env.RUN_DELETE_ALL === "true";

const describeSuite = RUN_DELETE_ALL ? describe : describe.skip;

describeSuite("Delete All Drafts", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test("delete all drafts (creates 5 if none exist)", async () => {
    await harness.setup();
    expect(harness.currentState).toBe("logged_in");

    await harness.navigateToDustApps();

    const existingCount = await countDraftApps(harness.page);
    const createdIds: string[] = [];

    if (existingCount === 0) {
      if (!COPY_FROM_APP) {
        return;
      }

      const draftsToCreate = 5;
      for (let i = 1; i <= draftsToCreate; i++) {
        await harness.navigateToDustApps();
        const res = await createNewCompanyApplication(
          harness.page,
          harness.context,
          COPY_FROM_APP
        );
        if (!res.success) {
          break;
        }
        if (res.applicationId) {
          createdIds.push(res.applicationId);
        }
      }
    }

    await harness.navigateToDustApps();
    const countBefore = await countDraftApps(harness.page);
    if (countBefore === 0) {
      return;
    }

    const success = await deleteAllDrafts(harness.page, harness.context);
    expect(success).toBe(true);

    const navOk = await harness.navigateToDustApps();
    expect(navOk).toBe(true);

    for (const id of createdIds) {
      const stillExists = await harness.page.evaluate((appId) => {
        const links = Array.from(document.querySelectorAll("a"));
        return links.some((a) => (a.textContent || "").trim() === appId);
      }, id);
      expect(stillExists).toBe(false);
    }

    const countAfter = await countDraftApps(harness.page);
    if (createdIds.length > 0) {
      expect(countAfter).toBeLessThan(countBefore);
    }
  }, 600_000);
});
