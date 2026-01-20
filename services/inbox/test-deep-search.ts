/**
 * Test script for deep search
 *
 * Run with:
 *   bun services/inbox/test-deep-search.ts "your search query" "your goal"
 *
 * Example:
 *   bun services/inbox/test-deep-search.ts "Villas on McQueen" "Find all contract info for this project"
 *   bun services/inbox/test-deep-search.ts "SWPPP" "Find SWPPP-related emails and documents"
 */

import { GraphEmailClient } from "../email/client";
import { deepSearch, printResults } from "./deep-search";

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
    azureTenantId: AZURE_TENANT_ID,
    azureClientId: AZURE_CLIENT_ID,
    azureClientSecret: AZURE_CLIENT_SECRET,
  });
  client.initAppAuth();

  // Run deep search
  console.log("Starting deep search...\n");
  const startTime = Date.now();

  const state = await deepSearch(client, initialQuery, goal, {
    userId,
    maxIterations: 3,
    maxEmailsPerQuery: 10,
    verbose: true,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  // Print results
  printResults(state);

  // Also dump to JSON for inspection
  const outputPath = "services/inbox/last-search.json";
  const output = {
    query: initialQuery,
    goal,
    userId,
    timestamp: new Date().toISOString(),
    elapsed: `${elapsed}s`,
    iterations: state.iteration,
    emails: state.relevantEmails,
    entities: state.extractedEntities,
    queries: state.queriesExecuted,
    log: state.log,
  };

  await Bun.write(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
