import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@lib/db/client";
import { chromium } from "playwright";
import { parseDustApplicationDetail } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";
import { parseDustApplicationExport } from "../../apps/aqdata-worker/src/aqdata/parsers/dust-applications";
import type { DustApplication } from "../../apps/aqdata-worker/src/aqdata/types";

const HOME_URL_REGEX = /home\/about\.jsf/;
const EXPORT_LINK_NAME_REGEX = /Export to Excel/i;
const DETAIL_URL_REGEX = /dustApplicationDetail\.jsf/;

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("https://aqdata.maricopa.gov/disclaimer.jsf", {
      waitUntil: "domcontentloaded",
    });
    await page.locator('[id="_idJsp1:agreeBtn"]').click();
    await page.waitForURL(HOME_URL_REGEX, { timeout: 30_000 });

    await page.goto(
      "https://aqdata.maricopa.gov/applications/dustApplicationSearch.jsf",
      { waitUntil: "domcontentloaded" }
    );

    await selectAllStatuses(page);
    await page.locator('[id="_idJsp6:dustAppSearch_SubmitBtn"]').click();
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page
      .getByRole("link", { name: EXPORT_LINK_NAME_REGEX })
      .first()
      .click();
    const download = await downloadPromise;

    const exportPath = join(tmpdir(), `aqdata-export-${Date.now()}.xls`);
    await download.saveAs(exportPath);

    const buffer = Buffer.from(await Bun.file(exportPath).arrayBuffer());
    const parsed = parseDustApplicationExport(buffer);

    console.log(
      JSON.stringify(
        {
          exportBytes: buffer.length,
          exportPath,
          parsedCount: parsed.length,
          firstIds: parsed.slice(0, 10).map((row) => row.applicationId),
        },
        null,
        2
      )
    );

    await upsertExportRows(parsed);

    const firstTwo = parsed.slice(0, 2);
    for (const permit of firstTwo) {
      await scrapeAndStoreDetail(page, permit.applicationId);
    }

    const countRow = await db
      .query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM aqdata_permits"
      )
      .get();
    console.log(`aqdata_permits rows: ${countRow?.count ?? 0}`);
  } finally {
    await browser.close();
  }
}

async function selectAllStatuses(
  page: import("playwright").Page
): Promise<void> {
  await page.evaluate(() => {
    const select = document.querySelector(
      '[id="_idJsp6:dcpStateCds"]'
    ) as HTMLSelectElement | null;
    if (!select) {
      throw new Error("Status select not found");
    }

    for (const option of [...select.options]) {
      option.selected = ["0", "1", "2", "3", "4"].includes(option.value);
    }

    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function upsertExportRows(rows: DustApplication[]): Promise<void> {
  for (const row of rows) {
    await db.run(
      `INSERT INTO aqdata_permits (
        id, facility_id, facility_name, project_name, company_id, company_name,
        status, submitted_date, effective_date, expiration_date, closed_date,
        previous_app_id, project_start_date, project_completion_date,
        address, city, parcel, is_block_permit, is_accelerated,
        invoice_number, invoice_charges, invoice_balance, raw_export, exported_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23::jsonb, now()
      )
      ON CONFLICT(id) DO UPDATE SET
        facility_id = excluded.facility_id,
        facility_name = excluded.facility_name,
        project_name = excluded.project_name,
        company_id = excluded.company_id,
        company_name = excluded.company_name,
        status = excluded.status,
        submitted_date = excluded.submitted_date,
        effective_date = excluded.effective_date,
        expiration_date = excluded.expiration_date,
        closed_date = excluded.closed_date,
        previous_app_id = excluded.previous_app_id,
        project_start_date = excluded.project_start_date,
        project_completion_date = excluded.project_completion_date,
        address = excluded.address,
        city = excluded.city,
        parcel = excluded.parcel,
        is_block_permit = excluded.is_block_permit,
        is_accelerated = excluded.is_accelerated,
        invoice_number = excluded.invoice_number,
        invoice_charges = excluded.invoice_charges,
        invoice_balance = excluded.invoice_balance,
        raw_export = excluded.raw_export,
        exported_at = now()`,
      [
        row.applicationId,
        row.facilityId,
        row.facilityName,
        row.projectName,
        row.companyId,
        row.companyName,
        row.status,
        row.submittedDate,
        row.effectiveDate,
        row.expirationDate,
        row.closedDate,
        row.previousAppId,
        row.projectStartDate,
        row.projectCompletionDate,
        row.address,
        row.city,
        row.parcel,
        row.isBlockPermit,
        row.isAccelerated,
        row.invoiceNumber,
        row.invoiceCharges,
        row.invoiceBalance,
        row,
      ]
    );
  }
}

async function scrapeAndStoreDetail(
  page: import("playwright").Page,
  applicationId: string
): Promise<void> {
  await page.goto(
    "https://aqdata.maricopa.gov/applications/dustApplicationSearch.jsf",
    { waitUntil: "domcontentloaded" }
  );

  await page.fill('[id="_idJsp6:dcpNumber"]', applicationId);
  await page.locator('[id="_idJsp6:dcpStateCds"]').selectOption("0");
  await page.locator('[id="_idJsp6:dustAppSearch_SubmitBtn"]').click();
  await page.waitForTimeout(1500);

  const link = page.getByRole("link", { name: applicationId }).first();
  const linkCount = await link.count();
  if (linkCount === 0) {
    console.warn(`detail skip: ${applicationId} not found in Active search`);
    return;
  }

  await link.click();
  await page.waitForURL(DETAIL_URL_REGEX, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const html = await page.content();
  const detail = parseDustApplicationDetail(html, applicationId);
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
    [html, detailPayload, applicationId]
  );

  console.log(
    `detail stored: ${applicationId} (fields=${Object.keys(detail.detailFields).length}, docs=${detail.documentLinks.length})`
  );
}

await main();
