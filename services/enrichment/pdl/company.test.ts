/**
 * Test PDL Company Cleaner API - verifies the fix works
 *
 * Run with: bun services/enrichment/pdl/company.test.ts
 *
 * This test uses 2 API calls to verify:
 * 1. cleanCompanyByName works (was broken before)
 * 2. cleanCompany with name + website works
 */
import { cleanCompany, cleanCompanyByName } from "./company";

async function main() {
  console.log("=== PDL Company Cleaner Test ===\n");

  // Test 1: By name only (this was broken before the fix)
  console.log("Test 1: cleanCompanyByName('Willmeng Construction')");
  const result1 = await cleanCompanyByName("Willmeng Construction");

  if (result1.success) {
    console.log("  ✓ SUCCESS");
    console.log("  Name:", result1.company?.name);
    console.log("  Website:", result1.company?.website);
    console.log("  Industry:", result1.company?.industry);
    console.log("  Size:", result1.company?.size);
    console.log("  Location:", result1.company?.location);
    console.log("  Fuzzy match:", result1.fuzzyMatch);
  } else {
    console.log("  ✗ FAILED:", result1.error);
  }

  // Rate limit delay
  console.log("\n  (waiting 6s for rate limit...)\n");
  await new Promise((r) => setTimeout(r, 6000));

  // Test 2: By name + website
  console.log("Test 2: cleanCompany({ name, website })");
  const result2 = await cleanCompany({
    name: "A.R. Mays Construction",
    website: "armays.com",
  });

  if (result2.success) {
    console.log("  ✓ SUCCESS");
    console.log("  Name:", result2.company?.name);
    console.log("  Website:", result2.company?.website);
    console.log("  Industry:", result2.company?.industry);
    console.log("  Founded:", result2.company?.founded);
    console.log("  LinkedIn:", result2.company?.linkedIn);
  } else {
    console.log("  ✗ FAILED:", result2.error);
  }

  console.log("\n=== Test Complete ===");
  console.log("API calls used: 2");
}

main().catch(console.error);
