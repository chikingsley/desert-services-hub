/**
 * Manual upload script for failed inspections
 *
 * Generates a PDF from a ComplianceGo report URL and uploads to SharePoint.
 *
 * Usage:
 *   bun cli/manual-upload.ts "<report-url>" "<contractor>" "<project>" [date]
 *
 * Examples:
 *   bun cli/manual-upload.ts "https://cdn3.compliancego.com/..." "ARCO" "KTEC PHX"
 *   bun cli/manual-upload.ts "https://cdn3.compliancego.com/..." "ARCO" "KTEC PHX" "01.29.26"
 */

import { SharePointClient } from "@sharepoint/client";
import { getProjectsFolder } from "@sharepoint/paths";
import puppeteer from "puppeteer";

// --- Inspection path utilities ---

const INSPECTIONS_BASE = "SWPPP/INSPECTIONS/PROJECTS";
const DATE_FORMAT_REGEX = /^\d{2}\.\d{2}\.\d{2}$/;
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

// --- PDF generation ---

async function generatePdf(url: string): Promise<Buffer> {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

    console.log("Generating PDF...");
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// --- Main ---

function printUsage(): never {
  console.log(`
Usage: bun cli/manual-upload.ts "<report-url>" "<contractor>" "<project>" [date]

Arguments:
  report-url  ComplianceGo report URL (https://cdn3.compliancego.com/...)
  contractor  Contractor name (e.g., "ARCO", "BPR COMPANIES")
  project     Project name (e.g., "KTEC PHX", "PV LOT C3")
  date        Optional. Date in MM.DD.YY format (defaults to today)
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const reportUrl = process.argv[2];
  const contractor = process.argv[3];
  const project = process.argv[4];
  const dateArg = process.argv[5];

  if (!(reportUrl && contractor && project)) {
    printUsage();
  }

  const path = buildInspectionPath(contractor, project, dateArg);
  console.log(`\nUploading to: ${path.fullPath}`);

  const exists = await fileExists(path.folderPath, path.fileName);
  if (exists) {
    console.log("\nFile already exists in SharePoint!");
    process.exit(0);
  }

  console.log("\nGenerating PDF...");
  const pdfContent = await generatePdf(reportUrl);
  console.log(`PDF generated: ${pdfContent.length} bytes`);

  console.log("\nUploading to SharePoint...");
  const client = createClient();
  const result = await client.upload(
    path.folderPath,
    path.fileName,
    pdfContent
  );

  console.log("\nUploaded successfully!");
  console.log(`URL: ${result.webUrl}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
