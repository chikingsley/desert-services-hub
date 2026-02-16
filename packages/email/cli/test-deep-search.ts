/**
 * Test script for deep search
 *
 * Run with:
 *   bun packages/email/cli/test-deep-search.ts "your search query" "your goal"
 *
 * Example:
 *   bun packages/email/cli/test-deep-search.ts "Villas on McQueen" "Find all contract info for this project"
 *   bun packages/email/cli/test-deep-search.ts "SWPPP" "Find SWPPP-related emails and documents"
 */

import { GraphEmailClient } from "@email/client";
import { deepSearch, printResults } from "@email/inbox/deep-search";

const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID ?? "";
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID ?? "";
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET ?? "";

// Default user to search
const DEFAULT_USER = "chi@desertservices.net";

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const initialQuery = args[0] ?? "contract";
  const goal = args[1] ?? `Find all information related to: ${initialQuery}`;
  const userId = args[2] ?? DEFAULT_USER;

  console.log("Deep Search Test");
  console.log("================");
  console.log(`Query: "${initialQuery}"`);
  console.log(`Goal: "${goal}"`);
  console.log(`User: ${userId}`);
  console.log();

  // Validate env
  if (
    AZURE_TENANT_ID === "" ||
    AZURE_CLIENT_ID === "" ||
    AZURE_CLIENT_SECRET === ""
  ) {
    console.error("Missing Azure credentials in environment:");
    console.error("  AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET");
    process.exit(1);
  }

  // Create client
  const client = new GraphEmailClient({
    azureClientId: AZURE_CLIENT_ID,
    azureClientSecret: AZURE_CLIENT_SECRET,
    azureTenantId: AZURE_TENANT_ID,
  });
  client.initAppAuth();

  // Run deep search
  console.log("Starting deep search...\n");
  const startTime = Date.now();

  const state = await deepSearch(client, initialQuery, goal, {
    maxEmailsPerQuery: 10,
    maxIterations: 3,
    userId,
    verbose: true,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  // Print results
  printResults(state);

  // Also dump to JSON for inspection
  const outputPath = "packages/email/data/inbox/last-search.json";
  const output = {
    elapsed: `${elapsed}s`,
    emails: state.relevantEmails,
    entities: state.extractedEntities,
    goal,
    iterations: state.iteration,
    log: state.log,
    queries: state.queriesExecuted,
    query: initialQuery,
    timestamp: new Date().toISOString(),
    userId,
  };

  await Bun.write(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
