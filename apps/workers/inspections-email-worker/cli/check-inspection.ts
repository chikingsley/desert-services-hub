/**
 * Check if an inspection file exists in SharePoint
 *
 * Usage:
 *   bun cli/check-inspection.ts "<contractor>" "<project>" [date]
 *
 * Examples:
 *   bun cli/check-inspection.ts "ARCO" "KTEC PHX"
 *   bun cli/check-inspection.ts "BPR COMPANIES" "PV LOT C3" "01.26.26"
 */
import { getProjectsFolder } from "@sharepoint/paths";
import { SharePointClient } from "@sharepoint/client";

// --- Inspection path utilities ---

const INSPECTIONS_BASE = "SWPPP/INSPECTIONS/PROJECTS";
const DATE_FORMAT_REGEX = /^\d{2}\.\d{2}\.\d{2}$/;

function formatDate(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

function parseDateStr(dateStr: string): Date | null {
  if (!DATE_FORMAT_REGEX.test(dateStr)) {
    return null;
  }
  const [mm, dd, yy] = dateStr.split(".").map(Number);
  return new Date(2000 + yy, mm - 1, dd);
}

function buildInspectionPath(
  contractor: string,
  project: string,
  dateStr?: string
): { folderPath: string; fileName: string; fullPath: string } {
  let year: number;
  let formattedDate: string;

  if (dateStr) {
    const parsed = parseDateStr(dateStr);
    if (!parsed) {
      throw new Error(`Invalid date format: ${dateStr}. Expected MM.DD.YY`);
    }
    year = parsed.getFullYear();
    formattedDate = dateStr;
  } else {
    const now = new Date();
    year = now.getFullYear();
    formattedDate = formatDate(now);
  }

  const folder = getProjectsFolder(contractor);
  const folderPath = `${INSPECTIONS_BASE}/${folder}/${contractor}/${project}/${year}`;
  const fileName = `${formattedDate}.pdf`;
  return { folderPath, fileName, fullPath: `${folderPath}/${fileName}` };
}

// --- SharePoint helpers ---

function createClient(): SharePointClient {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET)) {
    throw new Error("Missing Azure credentials in .env");
  }
  return new SharePointClient({
    azureTenantId: AZURE_TENANT_ID,
    azureClientId: AZURE_CLIENT_ID,
    azureClientSecret: AZURE_CLIENT_SECRET,
  });
}

async function fileExists(
  folderPath: string,
  fileName: string
): Promise<boolean> {
  const client = createClient();
  try {
    const files = await client.listFiles(folderPath);
    return files.some((f) => f.name === fileName);
  } catch {
    return false;
  }
}

// --- Main ---

function printUsage(): never {
  console.log(`
Usage: bun cli/check-inspection.ts "<contractor>" "<project>" [date]

Arguments:
  contractor  Contractor name (e.g., "ARCO", "BPR COMPANIES")
  project     Project name (e.g., "KTEC PHX", "PV LOT C3")
  date        Optional. Date in MM.DD.YY format (defaults to today)
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const contractor = process.argv[2];
  const project = process.argv[3];
  const dateArg = process.argv[4];

  if (!(contractor && project)) {
    printUsage();
  }

  const path = buildInspectionPath(contractor, project, dateArg);

  console.log(`\nChecking: ${contractor} - ${project}`);
  console.log(`Path: ${path.fullPath}`);

  const exists = await fileExists(path.folderPath, path.fileName);

  if (exists) {
    console.log("\nFile exists in SharePoint");
    process.exit(0);
  } else {
    console.log("\nNOT FOUND - needs manual upload");
    console.log("\nTo upload, run:");
    console.log(
      `bun cli/manual-upload.ts "<report-url>" "${contractor}" "${project}"${dateArg ? ` "${dateArg}"` : ""}`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
