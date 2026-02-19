import { afterEach, describe, expect, test } from "bun:test";
import {
  runAQDataDetailScrape,
  runAQDataSync,
} from "@background-jobs/jobs/aqdata-sync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AQData background-jobs bridge", () => {
  test("calls aqdata-worker sync endpoint", async () => {
    let calledUrl = "";
    let calledMethod = "";

    globalThis.fetch = ((input, init) => {
      calledUrl = String(input);
      calledMethod = String(init?.method ?? "");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            stats: {
              outputPath: "/tmp/out.json",
              permitsFilePath: "/tmp/permits.jsonl",
              totalRecords: 1,
              withCoordinates: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }) as typeof fetch;

    const result = await runAQDataSync();

    expect(result.success).toBeTrue();
    expect(calledMethod).toBe("POST");
    expect(calledUrl.endsWith("/api/sync")).toBeTrue();
  });

  test("calls aqdata-worker scrape endpoint with limit payload", async () => {
    let calledUrl = "";
    let calledBody = "";

    globalThis.fetch = ((input, init) => {
      calledUrl = String(input);
      calledBody = String(init?.body ?? "");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            stats: {
              failed: 0,
              queued: 1,
              scraped: 1,
              skipped: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }) as typeof fetch;

    const result = await runAQDataDetailScrape({ limit: 7 });

    expect(result.success).toBeTrue();
    expect(calledUrl.endsWith("/api/scrape")).toBeTrue();
    expect(calledBody).toContain('"limit":7');
  });
});
