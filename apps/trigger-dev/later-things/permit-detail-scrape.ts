/**
 * Permit Detail Scrape — Trigger.dev scheduled task
 *
 * Replaces the pgmq `permit_detail_scrape` job. Runs every 10 minutes
 * to enrich recently-synced permits with scraped portal data (project name,
 * dates, address, etc).
 */

import {
  getPermitsNeedingScrape,
  markPermitScraped,
} from "@dust-permits/db/dust-permit";
import { logger, schedules } from "@trigger.dev/sdk";
import { PermitClient } from "@/apps/dust-permits-mcp/client";

const DEFAULT_BATCH_SIZE = 5;

type ScrapePermitOutcome =
  | { outcome: "scraped" }
  | { outcome: "failed"; reason: string };

async function scrapeAndApplyPermit(
  client: PermitClient,
  permitId: string
): Promise<ScrapePermitOutcome> {
  const resp = await client.scrape(permitId);

  if (resp.success && resp.data) {
    const d = resp.data;
    const loc = d.locations?.[0];
    await markPermitScraped(permitId, {
      projectName: d.projectName || undefined,
      status: d.status || undefined,
      effectiveDate: d.issueDate || undefined,
      expirationDate: d.expirationDate || undefined,
      projectStartDate: d.project?.startDate || undefined,
      projectEndDate: d.project?.endDate || undefined,
      address: loc?.address || undefined,
      city: loc?.city || undefined,
      parcel: loc?.parcel || undefined,
    });
    return { outcome: "scraped" };
  }

  return {
    outcome: "failed",
    reason: resp.error || "No data returned",
  };
}

export const permitDetailScrape = schedules.task({
  id: "permit-detail-scrape",
  cron: "*/10 * * * *",
  maxDuration: 300,
  run: async () => {
    const client = new PermitClient();
    const permits = await getPermitsNeedingScrape(DEFAULT_BATCH_SIZE);

    let scraped = 0;
    let failed = 0;
    let skipped = 0;

    const errors: string[] = [];

    for (const permit of permits) {
      if (permit.status === "Draft") {
        skipped++;
        logger.info(`Skipping draft permit ${permit.id} in detail scrape`);
        continue;
      }

      try {
        const result = await scrapeAndApplyPermit(client, permit.id);
        if (result.outcome === "scraped") {
          scraped++;
          continue;
        }

        logger.warn(
          `Scrape returned no data for ${permit.id}: ${result.reason}`
        );
        failed++;
        errors.push(`${permit.id}: ${result.reason}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Scrape failed for ${permit.id}: ${msg}`);
        failed++;
        errors.push(`${permit.id}: ${msg}`);
      }
    }

    logger.info("Permit detail scrape complete", { scraped, failed, skipped });

    // If every permit in the batch failed, throw so Trigger.dev marks the run as failed
    if (failed > 0 && scraped === 0) {
      throw new Error(`All ${failed} scrapes failed: ${errors.join("; ")}`);
    }

    return { scraped, failed, skipped };
  },
});
