/**
 * Validate SharePoint folder structure
 *
 * Quickly checks Customer Projects for:
 *   - "Unknown" account folders (should be deleted)
 *   - Accounts in wrong letter folders
 *   - Empty project folders
 *
 * Usage:
 *   bun validate-sharepoint.ts [options]
 *
 * Options:
 *   --fix     Delete bad folders (default: report only)
 *   --deep    Check all subfolders (slower)
 */
import { SharePointClient } from "../client";
import type { SharePointItem } from "../types";

const CUSTOMER_PROJECTS_PATH = "Customer Projects";
const VALID_STATUSES = ["Submitted", "Active", "Lost", "Finished"];

interface Issue {
  path: string;
  type: string;
  message: string;
}

interface Stats {
  totalFolders: number;
  totalFiles: number;
  unknownFolders: number;
  wrongLetterFolders: number;
  emptyFolders: number;
  issues: Issue[];
}

function getExpectedLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "_Numeric";
}

async function listSafe(
  sp: SharePointClient,
  path: string
): Promise<SharePointItem[]> {
  try {
    return await sp.listFiles(path);
  } catch {
    return [];
  }
}

async function validateStatus(
  sp: SharePointClient,
  status: string,
  stats: Stats,
  options: { fix?: boolean; deep?: boolean }
): Promise<void> {
  const statusPath = `${CUSTOMER_PROJECTS_PATH}/${status}`;
  console.log(`Checking ${statusPath}...`);

  const letterFolders = await listSafe(sp, statusPath);

  for (const letterFolder of letterFolders) {
    if (!letterFolder.folder) {
      continue;
    }

    const letterPath = `${statusPath}/${letterFolder.name}`;
    const accountFolders = await listSafe(sp, letterPath);

    for (const account of accountFolders) {
      if (!account.folder) {
        continue;
      }

      const accountPath = `${letterPath}/${account.name}`;

      // Check for Unknown accounts
      if (account.name.toLowerCase() === "unknown") {
        stats.unknownFolders++;
        stats.issues.push({
          path: accountPath,
          type: "unknown_account",
          message: 'Found "Unknown" folder - should be deleted',
        });

        if (options.fix) {
          console.log(`  Deleting ${accountPath}...`);
          try {
            await sp.delete(accountPath);
            console.log("  ✓ Deleted");
          } catch (e) {
            console.log(
              `  ✗ Failed: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
        continue;
      }

      // Check if account is in correct letter folder
      const expectedLetter = getExpectedLetter(account.name);
      if (letterFolder.name !== expectedLetter) {
        stats.wrongLetterFolders++;
        stats.issues.push({
          path: accountPath,
          type: "wrong_letter",
          message: `"${account.name}" in "${letterFolder.name}" should be in "${expectedLetter}"`,
        });

        if (options.fix) {
          const newParentPath = `${CUSTOMER_PROJECTS_PATH}/${status}/${expectedLetter}`;
          console.log(`  Moving ${account.name} to ${expectedLetter}/...`);
          try {
            // Ensure destination folder exists
            await sp.ensureFolder(
              `${CUSTOMER_PROJECTS_PATH}/${status}`,
              expectedLetter
            );
            // Move the account folder
            await sp.moveItem(accountPath, newParentPath);
            console.log(`  ✓ Moved to ${newParentPath}/${account.name}`);
          } catch (e) {
            console.log(
              `  ✗ Failed: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }

      // Count project folders
      const projects = await listSafe(sp, accountPath);
      for (const project of projects) {
        if (project.folder) {
          stats.totalFolders++;

          if (options.deep) {
            // Check for files in subfolders
            const subfolders = await listSafe(
              sp,
              `${accountPath}/${project.name}`
            );
            const hasContent = subfolders.some(
              (s) => s.file || (s.folder && s.folder.childCount > 0)
            );

            if (!hasContent) {
              stats.emptyFolders++;
              stats.issues.push({
                path: `${accountPath}/${project.name}`,
                type: "empty_folder",
                message: "Empty project folder",
              });

              if (options.fix) {
                console.log(
                  `  Deleting empty folder ${accountPath}/${project.name}...`
                );
                try {
                  await sp.delete(`${accountPath}/${project.name}`);
                  console.log("  ✓ Deleted");
                } catch (e) {
                  console.log(
                    `  ✗ Failed: ${e instanceof Error ? e.message : String(e)}`
                  );
                }
              }
            }
          }
        } else if (project.file) {
          stats.totalFiles++;
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const deep = args.includes("--deep");

  const azureTenantId = process.env.AZURE_TENANT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID;
  const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(azureTenantId && azureClientId && azureClientSecret)) {
    console.error("Missing Azure credentials");
    process.exit(1);
  }

  const sp = new SharePointClient({
    azureTenantId,
    azureClientId,
    azureClientSecret,
  });

  console.log("=".repeat(50));
  console.log("SHAREPOINT VALIDATION");
  console.log("=".repeat(50));
  console.log(`Mode: ${fix ? "FIX" : "REPORT ONLY"}`);
  console.log(`Deep scan: ${deep}`);
  console.log(`${"=".repeat(50)}\n`);

  const stats: Stats = {
    totalFolders: 0,
    totalFiles: 0,
    unknownFolders: 0,
    wrongLetterFolders: 0,
    emptyFolders: 0,
    issues: [],
  };

  for (const status of VALID_STATUSES) {
    await validateStatus(sp, status, stats, { fix, deep });
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("VALIDATION COMPLETE");
  console.log("=".repeat(50));
  console.log(`Project folders: ${stats.totalFolders}`);
  console.log(`Files found: ${stats.totalFiles}`);
  console.log("\nIssues:");
  console.log(`  Unknown folders: ${stats.unknownFolders}`);
  console.log(`  Wrong letter: ${stats.wrongLetterFolders}`);
  console.log(`  Empty folders: ${stats.emptyFolders}`);

  if (stats.issues.length > 0) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`DETAILS (${stats.issues.length} issues)`);
    console.log("=".repeat(50));

    for (const issue of stats.issues.slice(0, 50)) {
      console.log(`\n[${issue.type}] ${issue.path}`);
      console.log(`  ${issue.message}`);
    }

    if (stats.issues.length > 50) {
      console.log(`\n... and ${stats.issues.length - 50} more issues`);
    }
  }
}

main().catch((e) => {
  console.error("Validation failed:", e);
  process.exit(1);
});
