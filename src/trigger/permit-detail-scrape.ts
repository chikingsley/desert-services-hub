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
} from "@lib/db/repositories/dust-permit";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { PermitClient } from "@/apps/dust-permits-mcp/client";

const DEFAULT_BATCH_SIZE = 5;

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

    for (const permit of permits) {
      try {
        const resp = await client.scrape(permit.id);

        if (resp.success && resp.data) {
          const d = resp.data;
          const loc = d.locations?.[0];
          await markPermitScraped(permit.id, {
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
          scraped++;
        } else {
          await markPermitScraped(permit.id);
          skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Scrape failed for ${permit.id}: ${msg}`);
        failed++;
      }
    }

    logger.info("Permit detail scrape complete", { scraped, failed, skipped });
    return { scraped, failed, skipped };
  },
});
