import { expect, test } from "@playwright/test";

import { ensureLoggedIn } from "../../src/create";

/**
 * Headed Chromium: watch disclaimer → login → landing with “My Dust Control Applications”.
 * Requires `DUST_PERMIT_USERNAME` / `DUST_PERMIT_PASSWORD` (see `.dev.vars.example`).
 */
test("login — visible browser reaches portal after sign-in", async ({
  page,
}) => {
  const username = process.env.DUST_PERMIT_USERNAME?.trim();
  const password = process.env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing portal credentials in process.env");
  }

  const ok = await ensureLoggedIn(page, username, password);
  expect(ok).toBe(true);

  await expect(page.getByText(/my dust control applications/i)).toBeVisible({
    timeout: 15_000,
  });
});
