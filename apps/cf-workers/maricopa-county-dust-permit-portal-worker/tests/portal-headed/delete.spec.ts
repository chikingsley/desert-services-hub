import { expect, test } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { ensureLoggedIn } from "../../src/create";
import { deleteAllDrafts } from "../../src/delete";

/**
 * Headless Chromium: sign in and clear every visible draft in the county portal.
 * The second pass proves the list is empty after the first delete-all run.
 */
test.use({ headless: true });
test.setTimeout(1_800_000);

test("delete-all — visible browser clears all drafts", async ({ page }) => {
  const username = process.env.DUST_PERMIT_USERNAME?.trim();
  const password = process.env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("Missing portal credentials in process.env");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDir = join(process.cwd(), "output", "playwright", "delete-spike", runId);
  await mkdir(artifactDir, { recursive: true });
  let popupIndex = 0;

  const dumpState = async (label: string): Promise<void> => {
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pngPath = join(artifactDir, `${safeLabel}.png`);
    const htmlPath = join(artifactDir, `${safeLabel}.html`);
    await page
      .screenshot({ path: pngPath, fullPage: true })
      .catch((error) => {
        console.log("[SCREENSHOT][WARN]", label, error);
      });
    if (page.isClosed()) {
      console.log(`[DUMP][WARN] ${label} skipped html dump; page is closed`);
      return;
    }
    const html = await page.content();
    await writeFile(htmlPath, html);
    console.log(`[DUMP][${label}] ${pngPath} / ${htmlPath}`);
  };

  const handlePopup = (popupPage: Page): void => {
    popupIndex += 1;
    const popupId = `popup_${String(popupIndex).padStart(2, "0")}`;
    void (async () => {
      const base = `${popupId}_${Date.now()}`;
      const pngPath = join(artifactDir, `${base}.png`);
      const htmlPath = join(artifactDir, `${base}.html`);
      const frameSrcs =
        (await popupPage
          .evaluate(() =>
            [...document.querySelectorAll("frame,iframe")].map(
              (frame) =>
                (frame as HTMLFrameElement).getAttribute("src") ?? "missing-src"
            )
          )
          .catch(() => [] as string[])) || [];
      console.log(`[POPUP][${popupId}] frame urls`, frameSrcs.join(" | "));

      await popupPage
        .waitForLoadState("domcontentloaded", { timeout: 10_000 })
        .catch(() => {});
      const html = await popupPage.content().catch(() => "<!-- popup content unavailable -->");
      await popupPage
        .screenshot({ path: pngPath, fullPage: true })
        .catch(() => {});
      await writeFile(htmlPath, html);
      console.log(`[POPUP][${popupId}] ${pngPath} / ${htmlPath}`);

      const frames = popupPage.frames();
      await Promise.all(
        frames.map(async (frame, frameIndex) => {
          try {
            await frame
              .waitForLoadState("domcontentloaded", {
                timeout: 8_000,
              })
              .catch(() => {});
            const frameHtml = await frame.content();
            const framePath = join(
              artifactDir,
              `${base}_frame_${frameIndex}.html`
            );
            await writeFile(framePath, frameHtml);
            console.log(`[POPUP][${popupId}][frame=${frameIndex}] ${frame.url()}`);
          } catch {
            // Ignore detached frame failures.
          }
        })
      );
    })().catch((error) => {
      console.log("[POPUP][WARN]", popupId, error);
    });
  };

  const testContext = page.context();
  testContext.on("page", handlePopup);

  try {
    expect(await ensureLoggedIn(page, username, password)).toBe(true);
    await dumpState("01-logged-in");

    const firstRun = await deleteAllDrafts(page, page.context());
    await dumpState("02-after-first-run");
    console.log("[TEST][DELETE_ALL][FIRST]", JSON.stringify(firstRun));
    expect(firstRun.success, firstRun.error).toBe(true);
    expect(firstRun.failedIds).toEqual([]);

    const secondRun = await deleteAllDrafts(page, page.context());
    await dumpState("03-after-second-run");
    console.log("[TEST][DELETE_ALL][SECOND]", JSON.stringify(secondRun));
    expect(secondRun.success, secondRun.error).toBe(true);
    expect(secondRun.deletedCount).toBe(0);
    expect(secondRun.failedIds).toEqual([]);
  } finally {
    testContext.off("page", handlePopup);
  }
});
