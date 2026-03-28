import { expect, test } from "@playwright/test";

import {
  ensureLoggedIn,
  openMyDustApps,
  runMinimalCreate,
} from "../../src/create";
import { deleteDraftByApplicationId } from "../../src/delete";

/**
 * Headed Chromium: full minimal create (new company) so you can watch the popup wizard.
 * Creates a real draft application in the county portal — use a test account.
 */
test("create — visible browser completes new-company minimal create", async ({
  page,
}) => {
  let permitId: string | null = null;

  const username = process.env.DUST_PERMIT_USERNAME?.trim();
  const password = process.env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing portal credentials in process.env");
  }

  try {
    expect(await ensureLoggedIn(page, username, password)).toBe(true);
    expect(await openMyDustApps(page)).toBe(true);
    await expect(page.locator('img[alt="New Application"]')).toBeVisible();

    const result = await runMinimalCreate(page, { flow: "new-company" });

    if (!result.permitId) {
      throw new Error(result.error ?? "runMinimalCreate returned no permit id");
    }

    const createdPermitId = result.permitId;
    permitId = createdPermitId;
    expect(createdPermitId).toMatch(/^D\d{7}$/i);
    await expect(page.locator('[id="ThePage:applicationId"]')).toHaveText(
      createdPermitId
    );
    await expect(
      page.getByRole("heading", { name: /permit application form, part a/i })
    ).toBeVisible();
  } finally {
    if (permitId) {
      const cleanup = await deleteDraftByApplicationId(
        page,
        page.context(),
        permitId
      );
      expect
        .soft(
          cleanup.success,
          cleanup.error ?? `Failed to clean up draft ${permitId}`
        )
        .toBe(true);
      expect.soft(cleanup.deletedIds).toContain(permitId);
    }
  }
});
