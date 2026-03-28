import { expect, test } from "@playwright/test";

import { ensureLoggedIn } from "../../src/create";
import { deleteAllDrafts } from "../../src/delete";

test.use({ headless: true });
test.setTimeout(600_000);

test("delete-all — clears all drafts", async ({ page }) => {
  const username = process.env.DUST_PERMIT_USERNAME?.trim();
  const password = process.env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing portal credentials in process.env");
  }

  expect(await ensureLoggedIn(page, username, password)).toBe(true);

  const firstRun = await deleteAllDrafts(page, page.context());
  console.log("[TEST] first run:", JSON.stringify(firstRun));
  expect(firstRun.success, firstRun.error).toBe(true);
  expect(firstRun.failedIds).toEqual([]);

  const secondRun = await deleteAllDrafts(page, page.context());
  console.log("[TEST] second run:", JSON.stringify(secondRun));
  expect(secondRun.success, secondRun.error).toBe(true);
  expect(secondRun.deletedCount).toBe(0);
  expect(secondRun.failedIds).toEqual([]);
});
