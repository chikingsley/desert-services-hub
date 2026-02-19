import {
  AQDATA_DETAIL_SCRAPE_ENABLED,
  AQDATA_SYNC_ENABLED,
} from "@background-jobs/jobs/config";
import { runAQDataDetailScrape, runAQDataSync } from "./aqdata-sync";

export async function runAQDataSyncJob(): Promise<void> {
  if (!AQDATA_SYNC_ENABLED) {
    return;
  }
  const result = await runAQDataSync();
  const stats = result.stats;
  if (stats) {
    console.log(
      `[worker] AQData sync: ${stats.totalRecords} records (${stats.upsertedToDb ?? 0} upserted), coordinates=${stats.withCoordinates}`
    );
  }
}

export async function runAQDataDetailScrapeJob(limit: number): Promise<void> {
  if (!AQDATA_DETAIL_SCRAPE_ENABLED) {
    return;
  }
  const result = await runAQDataDetailScrape({ limit });
  const stats = result.stats;
  if (stats) {
    console.log(
      `[worker] AQData detail scrape: queued=${stats.queued}, scraped=${stats.scraped}, failed=${stats.failed}, skipped=${stats.skipped}`
    );
  }
}
