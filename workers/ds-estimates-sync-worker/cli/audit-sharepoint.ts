/**
 * Audit SharePoint for any weird folders or orphaned data
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

async function auditFolders(): Promise<void> {
  const issues: string[] = [];
  const emptyFolders: string[] = [];
  let totalFolders = 0;
  let totalFiles = 0;

  console.log("Auditing SharePoint folder structure...\n");

  for (const status of ["Submitted", "Active", "Lost", "Finished"]) {
    console.log(`Scanning ${status}...`);

    let letters: Awaited<ReturnType<typeof sp.listFiles>>;
    try {
      letters = await sp.listFiles(`Customer Projects/${status}`);
    } catch {
      console.log(`  (no ${status} folder)`);
      continue;
    }

    for (const letter of letters) {
      if (!letter.folder) continue;

      const accounts = await sp.listFiles(
        `Customer Projects/${status}/${letter.name}`
      );

      for (const account of accounts) {
        if (!account.folder) continue;

        const projects = await sp.listFiles(
          `Customer Projects/${status}/${letter.name}/${account.name}`
        );

        for (const proj of projects) {
          if (!proj.folder) continue;
          totalFolders++;

          // Check for variant prefix in folder name
          const upper = proj.name.toUpperCase();
          for (const prefix of VARIANT_PREFIXES) {
            if (
              upper.startsWith(`${prefix} `) ||
              upper.startsWith(`${prefix}-`) ||
              upper.startsWith(`${prefix}_`) ||
              upper.startsWith(`${prefix}:`)
            ) {
              issues.push(
                `VARIANT PREFIX: ${status}/${letter.name}/${account.name}/${proj.name}`
              );
              break;
            }
          }

          // Check for empty project folders
          const subfolders = await sp.listFiles(
            `Customer Projects/${status}/${letter.name}/${account.name}/${proj.name}`
          );
          let hasFiles = false;
          for (const sub of subfolders) {
            if (sub.file) {
              hasFiles = true;
              totalFiles++;
            } else if (sub.folder) {
              const subContents = await sp.listFiles(
                `Customer Projects/${status}/${letter.name}/${account.name}/${proj.name}/${sub.name}`
              );
              for (const item of subContents) {
                if (item.file) {
                  hasFiles = true;
                  totalFiles++;
                }
              }
            }
          }

          if (!hasFiles && subfolders.length === 0) {
            emptyFolders.push(
              `${status}/${letter.name}/${account.name}/${proj.name}`
            );
          }
        }
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("AUDIT RESULTS");
  console.log("=".repeat(50));
  console.log(`Total project folders: ${totalFolders}`);
  console.log(`Total files: ${totalFiles}`);

  if (issues.length === 0) {
    console.log(
      "\n✓ No variant-prefixed folders found (good - they should be consolidated)"
    );
  } else {
    console.log(`\n⚠ Found ${issues.length} folders with variant prefixes:`);
    for (const i of issues.slice(0, 20)) {
      console.log(`  - ${i}`);
    }
    if (issues.length > 20) {
      console.log(`  ... and ${issues.length - 20} more`);
    }
  }

  if (emptyFolders.length > 0) {
    console.log(`\n⚠ Found ${emptyFolders.length} empty folders:`);
    for (const f of emptyFolders.slice(0, 10)) {
      console.log(`  - ${f}`);
    }
    if (emptyFolders.length > 10) {
      console.log(`  ... and ${emptyFolders.length - 10} more`);
    }
  } else {
    console.log("\n✓ No empty folders found");
  }
}

auditFolders().catch(console.error);
