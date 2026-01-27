/**
 * Tag emails in contracts@ mailbox with "Signed Contract" category.
 *
 * Finds emails that are either:
 * 1. Related to projects known to have signed contracts (from triage report)
 * 2. Have subjects indicating completion (DocuSign, "signed", "completed", "Notice of Award")
 *
 * Usage:
 *   bun scripts/tag-signed-contracts.ts              # dry-run
 *   bun scripts/tag-signed-contracts.ts --apply      # apply categories
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { GraphEmailClient } from "../services/email/client";

const CATEGORY = "Signed Contract";
const CONTRACTS_MAILBOX = "contracts@desertservices.net";

const applyMode = process.argv.includes("--apply");

// Open census DB
const dbPath = join(import.meta.dir, "../services/email/census/census.db");
const db = new Database(dbPath, { readonly: true });

// Projects confirmed signed from triage report (.planning/CONTRACT-TRIAGE.md)
const SIGNED_PROJECTS = [
  "Bethany Bay",
  "Aligned PHX06-2",
  "Sidney Village",
  "Helen Drake Village",
  "Centre Pointe",
  "Hippo Vet Peoria",
  "Hippo Vet Clinic Avondale",
  "Valencia Airport Center",
  "AMS Mesa",
  "Ganem SWPPP Contract",
];

// Subject patterns indicating signed/completed documents
const SIGNED_SUBJECT_PATTERNS = [
  "%signed%",
  "%Completed%DocuSign%",
  "%Complete with Docusign%",
  "%Completed:%",
  "%Notice of Award%",
  "%PO signed%",
  "%fully executed%",
];

// Build query for subject pattern matches
const subjectClauses = SIGNED_SUBJECT_PATTERNS.map(
  () => "e.subject LIKE ?"
).join(" OR ");

// Build query for project name matches
const projectPlaceholders = SIGNED_PROJECTS.map(() => "?").join(", ");

type EmailRow = {
  id: number;
  message_id: string;
  subject: string | null;
  received_at: string;
  project_name: string | null;
  categories: string | null;
};

// Find all contracts@ emails that match either criterion
const rows = db
  .query<EmailRow, string[]>(
    `SELECT e.id, e.message_id, e.subject, e.received_at, e.project_name, e.categories
     FROM emails e
     JOIN mailboxes m ON e.mailbox_id = m.id
     WHERE m.email = ?
     AND (
       (${subjectClauses})
       OR e.project_name IN (${projectPlaceholders})
     )
     ORDER BY e.received_at DESC`
  )
  .all(CONTRACTS_MAILBOX, ...SIGNED_SUBJECT_PATTERNS, ...SIGNED_PROJECTS);

// Dedupe by message_id (some may match both criteria)
const seen = new Set<string>();
const emailsToTag: EmailRow[] = [];
for (const row of rows) {
  if (!seen.has(row.message_id)) {
    seen.add(row.message_id);
    emailsToTag.push(row);
  }
}

console.log(
  `Found ${emailsToTag.length} emails in contracts@ to tag with "${CATEGORY}"\n`
);

for (const email of emailsToTag) {
  const existing = JSON.parse(email.categories || "[]") as string[];
  const alreadyTagged = existing.includes(CATEGORY);
  const status = alreadyTagged ? "[ALREADY]" : "[TAG]";
  const reason = SIGNED_PROJECTS.includes(email.project_name ?? "")
    ? `project: ${email.project_name}`
    : "subject match";

  console.log(`${status} ${email.subject?.substring(0, 70) ?? "(no subject)"}`);
  console.log(`       ${reason} | ${email.received_at.split("T")[0]}`);
}

// Apply if --apply flag
if (applyMode) {
  const client = new GraphEmailClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });
  client.initAppAuth();

  let tagged = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of emailsToTag) {
    const existing = JSON.parse(email.categories || "[]") as string[];
    if (existing.includes(CATEGORY)) {
      skipped++;
      continue;
    }

    const newCategories = [...existing, CATEGORY];

    try {
      await client.setCategoryOnEmail(
        email.message_id,
        newCategories,
        CONTRACTS_MAILBOX
      );

      // Update local census DB
      const writeDb = new Database(dbPath);
      writeDb.run("UPDATE emails SET categories = ? WHERE id = ?", [
        JSON.stringify(newCategories),
        email.id,
      ]);
      writeDb.close();

      tagged++;
      console.log(`  -> Tagged: ${email.subject?.substring(0, 60)}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  -> FAILED: ${email.subject?.substring(0, 60)} - ${msg}`);
    }
  }

  console.log(
    `\nDone: ${tagged} tagged, ${skipped} already tagged, ${failed} failed`
  );
} else {
  console.log("\nDry run. Use --apply to tag these emails.");
}

db.close();
