import { db } from "@lib/db/client";
import { chromium } from "playwright";
import { parseDustApplicationDetail } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";

const targetIds = ["D0000001", "D0000002"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto("https://aqdata.maricopa.gov/disclaimer.jsf", {
    waitUntil: "domcontentloaded",
  });
  await page.locator('[id="_idJsp1:agreeBtn"]').click();
  await page.waitForURL(/home\/about\.jsf/, { timeout: 30_000 });

  for (const id of targetIds) {
    await page.goto(
      "https://aqdata.maricopa.gov/applications/dustApplicationSearch.jsf",
      {
        waitUntil: "domcontentloaded",
      }
    );

    await page.fill('[id="_idJsp6:dcpNumber"]', id);

    // Try statuses in order until link appears
    const statusValues = ["0", "1", "2", "3", "4"];
    let found = false;
    for (const status of statusValues) {
      await page.locator('[id="_idJsp6:dcpStateCds"]').selectOption(status);
      await page.locator('[id="_idJsp6:dustAppSearch_SubmitBtn"]').click();
      await page.waitForTimeout(1200);

      const link = page.getByRole("link", { name: id }).first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForURL(/dustApplicationDetail\.jsf/, {
          timeout: 30_000,
        });
        await page.waitForTimeout(900);

        const html = await page.content();
        const detail = parseDustApplicationDetail(html, id);
        const detailPayload = {
          attachments: detail.attachments,
          coordinates: detail.coordinates,
          detailFields: detail.detailFields,
          documentLinks: detail.documentLinks,
          permitDocument: detail.permitDocument,
          permitPdf: detail.permitPdf,
          structured: detail.structured,
        };

        await db.run(
          `UPDATE aqdata_permits
           SET detail_html = $1, detail_fields = $2::jsonb, detail_scraped_at = now()
           WHERE id = $3`,
          [html, detailPayload, id]
        );

        console.log(
          `stored detail ${id}: fields=${Object.keys(detail.detailFields).length}`
        );
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`detail not found for ${id}`);
    }
  }
} finally {
  await browser.close();
}
