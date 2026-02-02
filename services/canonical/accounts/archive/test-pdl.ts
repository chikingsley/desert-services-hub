/**
 * Test PDL Company Cleaner API
 *
 * Tests the API with a few known companies before doing any batch processing.
 * Run with: bun projects/accounts/scripts/test-pdl.ts
 */
import PDLJS from "peopledatalabs";

const RATE_LIMIT_DELAY = 6500; // 10 req/min = 6.5s between calls

async function main() {
  // Check API key
  const apiKey = process.env.PEOPLE_DATA_LABS_API_KEY;
  if (!apiKey) {
    console.error("ERROR: PEOPLE_DATA_LABS_API_KEY not found in environment");
    process.exit(1);
  }
  console.log("API Key found (length:", apiKey.length, ")");
  console.log("");

  const client = new PDLJS({ apiKey });

  const testCases = [
    { name: "Willmeng Construction", website: "willmeng.com" },
    { name: "A.R. Mays Construction", website: "armays.com" },
    { name: "Layton Construction Company", website: "laytonconstruction.com" },
  ];

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`=== Testing: ${test.name} ===`);

    try {
      const result = await client.company.cleaner(test);
      console.log("  Cleaned name:", result.name);
      console.log("  Website:", result.website);
      console.log("  Industry:", result.industry);
      console.log("  Size:", result.size);
      console.log("  Location:", result.location?.name);
      console.log("  Founded:", result.founded ?? "N/A");
      console.log("  Fuzzy match:", result.fuzzy_match);
      console.log("  LinkedIn:", result.linkedin_url ?? "N/A");
      successCount++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log("  ERROR:", message);
      errorCount++;
    }

    console.log("");

    // Rate limit delay (skip after last item)
    if (i < testCases.length - 1) {
      console.log(`  (waiting ${RATE_LIMIT_DELAY}ms for rate limit...)`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
    }
  }

  console.log("=== SUMMARY ===");
  console.log("Total API calls:", testCases.length);
  console.log("Successful:", successCount);
  console.log("Errors:", errorCount);
}

main().catch(console.error);
