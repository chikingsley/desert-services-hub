#!/usr/bin/env bun
/**
 * Link emails to a project by contractor domain.
 * Finds emails from/to a domain and links to the project.
 *
 * Usage: bun link-by-domain.ts --project-id=123 --domain=bprcompanies.com
 *        bun link-by-domain.ts --project-id=123 --auto (auto-detect domain from estimate)
 */

import Database from "bun:sqlite";

const projectIdArg = process.argv.find((a) => a.startsWith("--project-id="));
const domainArg = process.argv.find((a) => a.startsWith("--domain="));
const autoDetect = process.argv.includes("--auto");

if (!(projectIdArg && (domainArg || autoDetect))) {
  console.error(
    "Usage: bun link-by-domain.ts --project-id=123 --domain=example.com"
  );
  console.error("       bun link-by-domain.ts --project-id=123 --auto");
  process.exit(1);
}

const projectId = Number(projectIdArg.split("=")[1]);
let domain = domainArg ? domainArg.split("=")[1] : null;

const db = new Database("./lib/db/hub.db");

const project = db
  .query<{ name: string }, [number]>("SELECT name FROM projects WHERE id = ?")
  .get(projectId);

console.log(`Project: ${project?.name} (ID: ${projectId})\n`);

// Auto-detect domain from estimate contractor
if (autoDetect) {
  const estimates = db
    .query<{ contractor: string }, [number]>(
      "SELECT DISTINCT contractor FROM estimates WHERE project_id = ? AND contractor IS NOT NULL"
    )
    .all(projectId);

  console.log(`Contractors: ${estimates.map((e) => e.contractor).join(", ")}`);

  for (const est of estimates) {
    const normalizedContractor = est.contractor
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10);

    const account = db
      .query<{ domain: string }, [string]>(
        `SELECT domain FROM accounts 
         WHERE LOWER(REPLACE(name, ' ', '')) LIKE '%' || ? || '%' 
         AND domain IS NOT NULL 
         LIMIT 1`
      )
      .get(normalizedContractor);

    if (account?.domain) {
      domain = account.domain;
      console.log(`Found domain for ${est.contractor}: ${domain}`);
      break;
    }
  }

  if (!domain) {
    console.error("Could not auto-detect domain. Specify with --domain=");
    process.exit(1);
  }
}

console.log(`\nLinking emails from/to domain: ${domain}`);

// Get current count
const beforeCount = db
  .query<{ c: number }, [number]>(
    "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
  )
  .get(projectId);

// Link emails FROM this domain
const fromResult = db.run(
  "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND from_domain = ?",
  [projectId, domain]
);

console.log(`Linked ${fromResult.changes} emails FROM ${domain}`);

// Link emails TO this domain
const toResult = db.run(
  "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND to_emails LIKE ?",
  [projectId, `%${domain}%`]
);

console.log(`Linked ${toResult.changes} emails TO ${domain}`);

// Expand via threads after domain linking
const linkedConvos = db
  .query<{ conversation_id: string }, [number]>(
    "SELECT DISTINCT conversation_id FROM emails WHERE project_id = ? AND conversation_id IS NOT NULL"
  )
  .all(projectId);

let threadLinked = 0;
for (const convo of linkedConvos) {
  const result = db.run(
    "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND conversation_id = ?",
    [projectId, convo.conversation_id]
  );
  threadLinked += result.changes;
}

console.log(`Linked ${threadLinked} emails via conversation threads`);

const afterCount = db
  .query<{ c: number }, [number]>(
    "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
  )
  .get(projectId);

console.log(`\nBefore: ${beforeCount?.c}`);
console.log(`After: ${afterCount?.c}`);
console.log(`Total added: ${(afterCount?.c || 0) - (beforeCount?.c || 0)}`);

db.close();
