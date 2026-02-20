#!/usr/bin/env bun
/**
 * Test the Dust Permit Intent Extraction
 */

import { parseArgs } from "node:util";
import { db } from "@lib/db/client";
import { analyzePermitEmailById } from "@permits/intent";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    limit: { type: "string", default: "5" },
  },
});

const limit = parseInt(values.limit || "5", 10);

async function run() {
  console.log(`Fetching ${limit} recent dust permit emails...`);
  
  // Get recent emails sent to dustpermits@, excluding maricopa.gov automated emails
  const emails = await db.query<{ id: number; subject: string | null; from_email: string | null }>(`
    SELECT e.id, e.subject, e.from_email
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE m.email = 'dustpermits@desertservices.net' 
      AND e.from_email NOT ILIKE '%maricopa.gov'
    ORDER BY e.received_at DESC
    LIMIT $1
  `).all(limit);

  if (emails.length === 0) {
    console.log("No permit emails found.");
    return;
  }

  console.log(`Found ${emails.length}. Running analysis...\n`);

  for (const email of emails) {
    console.log("==================================================");
    console.log(`Email ID: ${email.id}`);
    console.log(`From    : ${email.from_email}`);
    console.log(`Subject : ${email.subject}`);
    console.log("--------------------------------------------------");
    
    try {
      const result = await analyzePermitEmailById(email.id);
      
      console.log(`Intent     : ${result.intent} (Confidence: ${result.confidence})`);
      console.log(`Project    : ${result.projectContext}`);
      console.log(`Has LOI    : ${result.documents.hasLoi ? "✅ YES" : "❌ NO"}`);
      console.log(`Has Map    : ${result.documents.hasSiteMap ? "✅ YES" : "❌ NO"}`);
      console.log(`Notes      : ${result.documents.notes}`);
    } catch (err) {
      console.error("Analysis Failed:", err instanceof Error ? err.message : String(err));
    }
    
    console.log("==================================================\n");
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
