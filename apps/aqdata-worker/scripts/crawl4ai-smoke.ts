import { fetchDustApplicationDetailViaCrawl4Ai } from "../src/aqdata/crawl4ai";
import { parseDustApplicationDetail } from "../src/aqdata/parsers/dust-application-detail";
import { evaluateDustApplicationDetailQA } from "../src/aqdata/parsers/dust-application-detail-qa";
import type { DustAppStatus } from "../src/aqdata/types";

const DEFAULT_STATUS_SEARCH_ORDER: readonly DustAppStatus[] = [
  "Active",
  "Submitted",
  "Closed",
  "Superseded",
  "Rejected",
];

const permitId = (Bun.argv[2] ?? "D0000246").trim();
if (!permitId) {
  console.error("Usage: bun scripts/crawl4ai-smoke.ts <permitId>");
  process.exit(1);
}

console.log(`[aqdata] crawl4ai smoke start permit=${permitId}`);
const startedAt = Date.now();

const html = await fetchDustApplicationDetailViaCrawl4Ai(
  permitId,
  DEFAULT_STATUS_SEARCH_ORDER
);

if (!html) {
  console.error("[aqdata] crawl4ai smoke failed: detail HTML not returned");
  process.exit(1);
}

const detail = parseDustApplicationDetail(html, permitId);
const qa = evaluateDustApplicationDetailQA(detail, {
  expectedApplicationId: permitId,
  expectedStatus: null,
});

const elapsedMs = Date.now() - startedAt;
console.log(`[aqdata] crawl4ai smoke succeeded in ${elapsedMs}ms`);
console.log(
  JSON.stringify(
    {
      applicationId: detail.applicationId,
      attachmentCount: detail.attachments.length,
      hasCoordinates: !!detail.coordinates,
      hasPermitDocument: !!detail.permitDocument?.url,
      htmlLength: html.length,
      qa: {
        missingRequired: qa.missingRequired.length,
        passed: qa.passed,
        ruleFailures: qa.ruleFailures.length,
      },
    },
    null,
    2
  )
);
