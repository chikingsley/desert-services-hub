/**
 * Batch sync all project files to SharePoint
 * One-time script to create folders and upload PDFs for all projects
 *
 * Usage: bun services/sharepoint/batch-sync.ts [--dry-run]
 */
import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import { getFile } from "../../lib/minio";
import { SharePointClient } from "./client";

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

// Project -> Contractor mapping for folder structure
const PROJECT_CONTRACTORS: Record<
  string,
  { contractor: string; project: string }
> = {
  "Good Day Car Wash": {
    contractor: "NFC Contracting Group",
    project: "Good Day Car Wash Gilbert",
  },
  "Helen Drake Village": {
    contractor: "EOS Builders",
    project: "Helen Drake Village",
  },
  "Sun Health Colonnade": {
    contractor: "GCON Inc",
    project: "Sun Health Colonnade",
  },
  "Modera Paradise Valley": {
    contractor: "Mill Creek Residential",
    project: "Modera Paradise Valley",
  },
  "Moreland Phase 1": {
    contractor: "EOS Builders",
    project: "Moreland Phase 1",
  },
  "PVUSD Indian Bend ES Rebuild": {
    contractor: "Chasse Building Team",
    project: "PVUSD Indian Bend ES Rebuild",
  },
  "Sprouts Rita Ranch": {
    contractor: "AR Mays Construction",
    project: "Sprouts Rita Ranch",
  },
  "Hippo Vet Clinic Avondale": {
    contractor: "CAM Builds USA",
    project: "Hippo Vet Clinic Avondale",
  },
  "Diamond View at Ballpark": {
    contractor: "Catamount Constructors",
    project: "Diamond View at Ballpark",
  },
  "GSQ VEG": { contractor: "BPR Companies", project: "GSQ VEG" },
  "OneAZ Surprise": {
    contractor: "41 North Contractors",
    project: "OneAZ Surprise",
  },
  "U-Haul Palm Valley": {
    contractor: "TLW Construction",
    project: "U-Haul Palm Valley",
  },
  "PCSD Music Building": {
    contractor: "Chasse Building Team",
    project: "PCSD Music Building",
  },
  "Spinatos Pizza": {
    contractor: "Johansen Interiors",
    project: "Spinatos Pizza",
  },
  "Way Construction LOI": {
    contractor: "Way Construction Development",
    project: "Way Construction LOI",
  },
  "Waddle Crossing": {
    contractor: "AR Mays Construction",
    project: "Waddle Crossing",
  },
  "DM Fighter Squadron": {
    contractor: "Richard Group",
    project: "DM Fighter Squadron",
  },
  "4121 W Innovative Dr TI": {
    contractor: "Unknown",
    project: "4121 W Innovative Dr TI",
  },
  "6505N 43rd Pl": { contractor: "Bob Fox", project: "6505N 43rd Pl" },
  "LG Project Queen Creek": {
    contractor: "Unknown",
    project: "LG Project Queen Creek",
  },
  "Water Buffalo New Site": {
    contractor: "Unknown",
    project: "Water Buffalo New Site",
  },
  "BAZ2502 Subcontract": {
    contractor: "Unknown",
    project: "BAZ2502 Subcontract",
  },
  "D-Square Briston SWPP Plan": {
    contractor: "D-Square",
    project: "D-Square Briston SWPP Plan",
  },
  "25014 Desert Services PO": {
    contractor: "Unknown",
    project: "25014 Desert Services PO",
  },
  "FCI Signed Quote": { contractor: "FCI", project: "FCI Signed Quote" },
};

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[:\\/*?"<>|#%&{}~]/g, "-")
    .replace(/^FWD-\s*/i, "")
    .replace(/^RE-\s*/i, "")
    .replace(/^FW-\s*/i, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function classifyAttachment(filename: string): string {
  const lower = filename.toLowerCase();
  if (
    lower.includes("estimate") ||
    lower.includes("est_") ||
    lower.includes("quote")
  )
    return "01-Estimates";
  if (
    lower.includes("contract") ||
    lower.includes("po") ||
    lower.includes("agreement") ||
    lower.includes("rev")
  )
    return "02-Contracts";
  if (
    lower.includes("permit") ||
    lower.includes("dust") ||
    lower.includes("noi") ||
    lower.includes("ndc")
  )
    return "03-Permits";
  if (
    lower.includes("swppp") ||
    lower.includes("narrative") ||
    lower.includes("bmp")
  )
    return "04-SWPPP";
  if (lower.includes("inspection") || lower.includes("photo"))
    return "05-Inspections";
  if (
    lower.includes("invoice") ||
    lower.includes("billing") ||
    lower.includes("lien") ||
    lower.includes("aia")
  )
    return "06-Billing";
  if (lower.includes("closeout") || lower.includes("final"))
    return "07-Closeout";
  if (
    lower.includes("insurance") ||
    lower.includes("coi") ||
    lower.includes("certificate")
  )
    return "02-Contracts";
  return "02-Contracts";
}

// Parse args
const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
  },
});
const dryRun = args["dry-run"] ?? false;

const sp = new SharePointClient({
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
});

const db = new Database(CENSUS_DB_PATH, { readonly: true });

// Exclude already-synced projects (Verge + Symbiont)
const EXCLUDE_IDS = [
  "2f5c1835-5bb2-81f5-9c3b-cb5d481b91f7", // The Verge
  "2f5c1835-5bb2-8167-91e4-e27e9e311143", // Symbiont
];

type ProjectRow = {
  notion_project_id: string;
  project_name: string;
  pdf_count: number;
};

const projects = db
  .query(
    `
  SELECT e.notion_project_id, e.project_name, COUNT(DISTINCT a.id) as pdf_count
  FROM emails e
  JOIN mailboxes m ON e.mailbox_id = m.id
  JOIN attachments a ON a.email_id = e.id
  WHERE m.email = 'contracts@desertservices.net'
    AND e.notion_project_id IS NOT NULL
    AND e.notion_project_id NOT IN (${EXCLUDE_IDS.map(() => "?").join(",")})
    AND a.content_type LIKE '%pdf%'
    AND a.storage_bucket IS NOT NULL
    AND a.storage_path IS NOT NULL
  GROUP BY e.notion_project_id, e.project_name
  ORDER BY pdf_count DESC
`
  )
  .all(...EXCLUDE_IDS) as ProjectRow[];

console.log(`Processing ${projects.length} projects with PDFs...\n`);

if (dryRun) {
  for (const proj of projects) {
    const mapping = PROJECT_CONTRACTORS[proj.project_name];
    if (!mapping) {
      console.log(
        `  SKIP: No contractor mapping for "${proj.project_name}" (${proj.pdf_count} PDFs)`
      );
      continue;
    }
    const letter = mapping.contractor.charAt(0).toUpperCase();
    console.log(
      `  ${letter}/${mapping.contractor}/${mapping.project} -- ${proj.pdf_count} PDFs`
    );
  }
  console.log("\n[DRY RUN] Pass without --dry-run to execute.");
  process.exit(0);
}

type AttachmentRow = {
  name: string;
  storage_bucket: string;
  storage_path: string;
  size: number;
};

let totalUploaded = 0;
let totalFailed = 0;
let totalSkipped = 0;

for (const proj of projects) {
  const mapping = PROJECT_CONTRACTORS[proj.project_name];
  if (!mapping) {
    console.log(`SKIP: No contractor mapping for "${proj.project_name}"`);
    totalSkipped++;
    continue;
  }

  const { contractor, project } = mapping;
  const letter = contractor.charAt(0).toUpperCase();
  const projectPath = `${SHAREPOINT_ROOT}/${letter}/${contractor}/${project}`;

  console.log(`=== ${proj.project_name} -> ${projectPath} ===`);

  // Create folder structure (ensureFolder is idempotent)
  await sp.ensureFolder(projectPath);
  for (const sub of SUBFOLDERS) {
    await sp.mkdir(projectPath, sub);
  }
  console.log("  Folders ready");

  // Get attachments
  const attachments = db
    .query(
      `
    SELECT DISTINCT a.name, a.storage_bucket, a.storage_path, a.size
    FROM attachments a
    JOIN emails e ON a.email_id = e.id
    WHERE e.notion_project_id = ?
      AND a.content_type LIKE '%pdf%'
      AND a.storage_bucket IS NOT NULL
      AND a.storage_path IS NOT NULL
  `
    )
    .all(proj.notion_project_id) as AttachmentRow[];

  // Dedupe by name
  const seen = new Set<string>();
  for (const att of attachments) {
    if (seen.has(att.name)) continue;
    seen.add(att.name);

    const subfolder = classifyAttachment(att.name);
    const safeName = sanitizeFilename(att.name);

    try {
      const data = await getFile(att.storage_bucket, att.storage_path);
      await sp.upload(
        `${projectPath}/${subfolder}`,
        safeName,
        Buffer.from(data)
      );
      console.log(`  OK ${subfolder}/${safeName}`);
      totalUploaded++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  FAIL ${subfolder}/${safeName} -- ${msg}`);
      totalFailed++;
    }
  }
  console.log("");
}

console.log(
  `\nDone. ${totalUploaded} uploaded, ${totalFailed} failed, ${totalSkipped} skipped across ${projects.length} projects.`
);
db.close();
