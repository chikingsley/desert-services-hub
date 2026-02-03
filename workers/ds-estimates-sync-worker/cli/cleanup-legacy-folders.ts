/**
 * Clean up legacy variant-prefixed folders from SharePoint
 * These folders use old naming convention (TF, PJ, MISC, etc. as folder prefixes)
 * that should now be consolidated into base project folders with file suffixes.
 */
import { SharePointClient } from "../client";

const sp = new SharePointClient({
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
});

const VARIANT_PREFIXES = [
  "TF",
  "PJ",
  "MISC",
  "RO",
  "REBID",
  "CFS",
  "LW",
  "SF",
  "SS",
  "INSPECTIONS",
];

async function findVariantFolders(): Promise<string[]> {
  const folders: string[] = [];

  for (const prefix of VARIANT_PREFIXES) {
    console.log(`Searching for ${prefix} folders...`);
    const results = await sp.search(prefix);

    for (const r of results) {
      // Skip files
      if (!r.folder) continue;

      const upper = r.name.toUpperCase();
      const isVariant =
        upper.startsWith(`${prefix} `) ||
        upper.startsWith(`${prefix}-`) ||
        upper.startsWith(`${prefix}_`) ||
        upper.startsWith(`${prefix}:`);

      if (isVariant && r.webUrl) {
        // Extract path from webUrl
        const match = r.webUrl.match(/Customer%20Projects\/(.+)/);
        if (match) {
          const path = `Customer Projects/${decodeURIComponent(match[1])}`;
          folders.push(path);
        }
      }
    }
  }

  return folders;
}

async function cleanup(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("LEGACY FOLDER CLEANUP");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE DELETE"}`);
  console.log("");

  const folders = await findVariantFolders();

  console.log(`\nFound ${folders.length} variant-prefixed folders:\n`);

  let deleted = 0;
  let failed = 0;

  for (const folderPath of folders) {
    console.log(`  ${dryRun ? "[DRY]" : "🗑️ "} ${folderPath}`);

    if (!dryRun) {
      try {
        await sp.delete(folderPath);
        deleted++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${msg}`);
        failed++;
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  if (dryRun) {
    console.log(`Would delete: ${folders.length} folders`);
    console.log("\nRun without --dry-run to actually delete.");
  } else {
    console.log(`Deleted: ${deleted}`);
    console.log(`Failed: ${failed}`);
  }
}

cleanup().catch(console.error);
