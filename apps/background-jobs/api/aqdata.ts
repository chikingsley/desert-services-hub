import {
  runAQDataCompanySync,
  runAQDataDetailScrape,
  runAQDataSync,
} from "@background-jobs/jobs/aqdata-sync";
import { z } from "zod";

const detailScrapeSchema = z.object({
  limit: z.coerce.number().int().min(1).optional(),
});

export function handleAQDataSync(): Response {
  launchAsync("AQData sync", async () => {
    const result = await runAQDataSync();
    console.log(
      `[aqdata-api] sync finished: total=${result.stats?.totalRecords ?? 0}, upserted=${result.stats?.upsertedToDb ?? 0}`
    );
  });

  return acceptedResponse();
}

export function handleAQDataCompanySync(): Response {
  launchAsync("AQData company sync", async () => {
    const result = await runAQDataCompanySync();
    console.log(
      `[aqdata-api] company sync finished: total=${result.stats?.totalRecords ?? 0}, upserted=${result.stats?.upsertedToDb ?? 0}`
    );
  });

  return acceptedResponse();
}

export async function handleAQDataDetailScrape(
  req: Request
): Promise<Response> {
  const { limit } = detailScrapeSchema.parse(
    await req.json().catch(() => ({}))
  );

  launchAsync("AQData detail scrape", async () => {
    const result = await runAQDataDetailScrape({
      limit,
    });
    console.log(
      `[aqdata-api] detail scrape finished: queued=${result.stats?.queued ?? 0}, scraped=${result.stats?.scraped ?? 0}, failed=${result.stats?.failed ?? 0}`
    );
  });

  return acceptedResponse({
    limit,
  });
}

function launchAsync(label: string, run: () => Promise<void>): void {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[aqdata-api] ${label} failed: ${message}`);
  });
}

function acceptedResponse(extra?: Record<string, unknown>): Response {
  return Response.json(
    {
      ...extra,
      queued: true,
      success: true,
      timestamp: new Date().toISOString(),
    },
    { status: 202 }
  );
}
