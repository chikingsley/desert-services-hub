/**
 * Sync project files from MinIO to SharePoint
 *
 * Usage:
 *   bun services/sharepoint/sync-project-files.ts --notion-id=<id>
 *   bun services/sharepoint/sync-project-files.ts --project-name="Symbiont"
 *   bun services/sharepoint/sync-project-files.ts --dry-run --notion-id=<id>
 *
 * What it does:
 * 1. Looks up project in census DB (by notion_project_id or project name)
 * 2. Finds all PDF attachments in MinIO for linked emails
 * 3. Creates SharePoint folder structure if needed
 * 4. Downloads from MinIO → uploads to SharePoint
 * 5. Reports what was synced
 *
 * SharePoint structure:
 *   Customer Projects/Active/{Letter}/{Contractor}/{Project Name}/
 *     01-Estimates/
 *     02-Contracts/
 *     03-Permits/
 *     04-SWPPP/
 *     05-Inspections/
 *     06-Billing/
 *     07-Closeout/
 */

import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import { getFile } from "../../lib/minio";
import { SharePointClient } from "./client";

// Regex patterns for filename sanitization (module-level for performance)
const RE_INVALID_CHARS = /[:\\/*?"<>|#%&{}~]/g;
const RE_FWD_PREFIX = /^FWD-\s*/i;
const RE_RE_PREFIX = /^RE-\s*/i;
const RE_FW_PREFIX = /^FW-\s*/i;
const RE_MULTIPLE_DASHES = /-{2,}/g;
const RE_LEADING_TRAILING_DASHES = /^-+|-+$/g;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CENSUS_DB_PATH = new URL("../email/census/census.db", import.meta.url)
  .pathname;

const SHAREPOINT_ROOT = "Customer Projects/Active";

const SUBFOLDERS = [
  "01-Estimates",
  "02-Contracts",
  "03-Permits",
  "04-SWPPP",
  "05-Inspections",
  "06-Billing",
  "07-Closeout",
] as const;

/**
 * Map attachment filenames to subfolders based on content.
 * Falls back to 02-Contracts if unknown.
 */
function classifyAttachment(filename: string): string {
  const lower = filename.toLowerCase();

  if (
    lower.includes("estimate") ||
    lower.includes("est_") ||
    lower.includes("quote")
  ) {
    return "01-Estimates";
  }
  if (
    lower.includes("contract") ||
    lower.includes("po") ||
    lower.includes("agreement") ||
    lower.includes("rev")
  ) {
    return "02-Contracts";
  }
  if (
    lower.includes("permit") ||
    lower.includes("dust") ||
    lower.includes("noi") ||
    lower.includes("ndc")
  ) {
    return "03-Permits";
  }
  if (
    lower.includes("swppp") ||
    lower.includes("narrative") ||
    lower.includes("bmp")
  ) {
    return "04-SWPPP";
  }
  if (lower.includes("inspection") || lower.includes("photo")) {
    return "05-Inspections";
  }
  if (
    lower.includes("invoice") ||
    lower.includes("billing") ||
    lower.includes("lien") ||
    lower.includes("aia")
  ) {
    return "06-Billing";
  }
  if (lower.includes("closeout") || lower.includes("final")) {
    return "07-Closeout";
  }
  if (
    lower.includes("insurance") ||
    lower.includes("coi") ||
    lower.includes("certificate")
  ) {
    return "02-Contracts";
  }
  if (lower.includes("change") || lower.includes("co ")) {
    return "02-Contracts";
  }

  return "02-Contracts";
}

/**
 * Sanitize filename for SharePoint (no colons, slashes, etc.)
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(RE_INVALID_CHARS, "-")
    .replace(RE_FWD_PREFIX, "")
    .replace(RE_RE_PREFIX, "")
    .replace(RE_FW_PREFIX, "")
    .replace(RE_MULTIPLE_DASHES, "-")
    .replace(RE_LEADING_TRAILING_DASHES, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "notion-id": { type: "string" },
    "project-name": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    contractor: { type: "string" },
    project: { type: "string" },
  },
});

const notionId = args["notion-id"];
const projectNameQuery = args["project-name"];
const dryRun = args["dry-run"] ?? false;
const contractorName = args.contractor;
const projectName = args.project;

if (!(notionId || projectNameQuery)) {
  console.error(
    "Usage: bun services/sharepoint/sync-project-files.ts --notion-id=<id> --contractor='Weis Builders' --project='The Verge' [--dry-run]"
  );
  console.error(
    "   or: bun services/sharepoint/sync-project-files.ts --project-name='Symbiont' --contractor='Mead & Hunt' --project='Symbiont' [--dry-run]"
  );
  process.exit(1);
}

const db = new Database(CENSUS_DB_PATH, { readonly: true });

// Find the project's emails and attachments
let query: string;
let params: Record<string, string>;

if (notionId) {
  query = `
    SELECT a.id, a.name, a.content_type, a.storage_bucket, a.storage_path, a.size,
           e.subject, e.from_email, date(e.received_at) as email_date
    FROM attachments a
    JOIN emails e ON a.email_id = e.id
    WHERE e.notion_project_id = $notionId
      AND a.content_type LIKE '%pdf%'
      AND a.storage_bucket IS NOT NULL
      AND a.storage_path IS NOT NULL
    ORDER BY e.received_at ASC
  `;
  params = { $notionId: notionId };
} else {
  query = `
    SELECT a.id, a.name, a.content_type, a.storage_bucket, a.storage_path, a.size,
           e.subject, e.from_email, date(e.received_at) as email_date
    FROM attachments a
    JOIN emails e ON a.email_id = e.id
    WHERE e.subject LIKE $search
      AND a.content_type LIKE '%pdf%'
      AND a.storage_bucket IS NOT NULL
      AND a.storage_path IS NOT NULL
    ORDER BY e.received_at ASC
  `;
  params = { $search: `%${projectNameQuery}%` };
}

interface AttachmentRow {
  id: number;
  name: string;
  content_type: string;
  storage_bucket: string;
  storage_path: string;
  size: number;
  subject: string;
  from_email: string;
  email_date: string;
}

const attachments = db.query(query).all(params) as AttachmentRow[];

if (attachments.length === 0) {
  console.log("No PDF attachments found in MinIO for this project.");
  process.exit(0);
}

// Dedupe by filename (same file can appear in multiple emails)
const seen = new Set<string>();
const unique: AttachmentRow[] = [];
for (const att of attachments) {
  if (!seen.has(att.name)) {
    seen.add(att.name);
    unique.push(att);
  }
}

console.log(
  `Found ${unique.length} unique PDFs (${attachments.length} total across emails)`
);
console.log("");

// Classify each file
const plan: Array<{ attachment: AttachmentRow; subfolder: string }> = [];
for (const att of unique) {
  const subfolder = classifyAttachment(att.name);
  plan.push({ attachment: att, subfolder });
  console.log(
    `  ${subfolder}/${att.name} (${(att.size / 1024).toFixed(0)}KB) — from: ${att.subject}`
  );
}

console.log("");

if (dryRun) {
  console.log(
    "[DRY RUN] Would create folder and upload above files. Pass without --dry-run to execute."
  );
  process.exit(0);
}

// Build folder path: {Root}/{Letter}/{Contractor}/{Project}
if (!(contractorName && projectName)) {
  console.error("ERROR: --contractor and --project are required");
  console.error(
    "  e.g., --contractor='Weis Builders' --project='The Verge at Ballpark Village'"
  );
  process.exit(1);
}

const firstLetter = contractorName.charAt(0).toUpperCase();
const projectPath = `${SHAREPOINT_ROOT}/${firstLetter}/${contractorName}/${projectName}`;

console.log(`SharePoint path: ${projectPath}`);
console.log("");

// Initialize SharePoint client
const sp = new SharePointClient({
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
});

// Create folder structure (ensureFolder is idempotent)
console.log("Creating folder structure...");
await sp.ensureFolder(projectPath);
for (const sub of SUBFOLDERS) {
  await sp.mkdir(projectPath, sub);
}
console.log(`  Folders ready: ${projectPath}`);

console.log("");

// Upload files
console.log("Uploading files...");
let uploaded = 0;
let failed = 0;

for (const { attachment, subfolder } of plan) {
  const targetPath = `${projectPath}/${subfolder}`;
  try {
    const fileData = await getFile(
      attachment.storage_bucket,
      attachment.storage_path
    );
    const buffer = Buffer.from(fileData);
    const safeName = sanitizeFilename(attachment.name);
    await sp.upload(targetPath, safeName, buffer);
    console.log(`  ✓ ${subfolder}/${safeName}`);
    uploaded++;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const safeName = sanitizeFilename(attachment.name);
    console.error(`  ✗ ${subfolder}/${safeName} — ${msg}`);
    failed++;
  }
}

console.log("");
console.log(`Done. ${uploaded} uploaded, ${failed} failed.`);
console.log(`SharePoint folder: ${projectPath}`);

db.close();
