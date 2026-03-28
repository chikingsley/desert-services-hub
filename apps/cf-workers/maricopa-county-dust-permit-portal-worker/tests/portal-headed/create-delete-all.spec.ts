import { expect, test } from "@playwright/test";

import {
  ensureLoggedIn,
  openMyDustApps,
  runMinimalCreate,
} from "../../src/create";
import { deleteAllDrafts } from "../../src/delete";

test.use({ headless: true });
test.setTimeout(600_000);

test("headless create three drafts, then delete all", async ({ page }) => {
  const username = process.env.DUST_PERMIT_USERNAME?.trim();
  const password = process.env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing portal credentials in process.env");
  }

  const createdPermitIds: string[] = [];

  expect(await ensureLoggedIn(page, username, password)).toBe(true);

  for (let index = 0; index < 3; index += 1) {
    expect(await openMyDustApps(page)).toBe(true);
    await expect(page.locator('img[alt="New Application"]')).toBeVisible();

    const result = await runMinimalCreate(page, { flow: "new-company" });
    if (!result.permitId) {
      throw new Error(
        result.error ?? `runMinimalCreate returned no permit id on iteration ${index + 1}`
      );
    }

    createdPermitIds.push(result.permitId);
    expect(result.permitId).toMatch(/^D\d{7}$/i);
    await expect(page.locator('[id="ThePage:applicationId"]')).toHaveText(
      result.permitId
    );
  }

  expect(await openMyDustApps(page)).toBe(true);

  const firstDeleteRun = await deleteAllDrafts(page, page.context());
  expect(firstDeleteRun.success, firstDeleteRun.error).toBe(true);
  expect(firstDeleteRun.failedIds).toEqual([]);
  for (const permitId of createdPermitIds) {
    expect(firstDeleteRun.deletedIds).toContain(permitId);
  }

  const secondDeleteRun = await deleteAllDrafts(page, page.context());
  expect(secondDeleteRun.success, secondDeleteRun.error).toBe(true);
  expect(secondDeleteRun.deletedCount).toBe(0);
  expect(secondDeleteRun.failedIds).toEqual([]);
});
