#!/usr/bin/env bun
/**
 * Cleanup script - deletes folders and clears URLs for items that were incorrectly created
 */

import * as fs from "fs";

const BOARD_ID = "7943937851";
const SHAREPOINT_URL_COLUMN = "link_mky1n6pa";

const MONDAY_API_KEY = process.env.MONDAY_API_KEY!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

// Read the log file to get created items
const logContent = fs.readFileSync("quick-sync-output.log", "utf-8");
const createdLines = logContent
  .split("\n")
  .filter((line) => line.includes("✓ Created:"));

console.log(`Found ${createdLines.length} items to clean up\n`);

// Extract item names
const itemNames = createdLines
  .map((line) => {
    const match = line.match(/✓ Created: (.+)$/);
    return match?.[1]?.trim() || "";
  })
  .filter(Boolean);

console.log("Sample items to clean:", itemNames.slice(0, 5));
console.log("");

// Monday API
async function mondayQuery(query: string): Promise<unknown> {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_KEY,
      "API-Version": "2026-01",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) throw new Error(`Monday API error: ${response.status}`);
  const json = (await response.json()) as {
    data?: unknown;
    errors?: unknown[];
  };
  if (json.errors)
    throw new Error(`Monday errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Graph API
let cachedToken: string | null = null;
let cachedDriveId: string | null = null;

async function getGraphToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  cachedToken = data.access_token;
  return cachedToken;
}

async function getDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const token = await getGraphToken();
  const endpoint =
    "https://graph.microsoft.com/v1.0/sites/desertservices.sharepoint.com:/sites/DataDrive:/drives";
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drives failed: ${res.status}`);
  const data = (await res.json()) as {
    value: Array<{ id: string; name: string }>;
  };
  const docDrive = data.value.find(
    (d) => d.name === "Documents" || d.name === "Shared Documents"
  );
  if (!docDrive) throw new Error("No Documents drive");
  cachedDriveId = docDrive.id;
  return cachedDriveId;
}

async function deleteFolder(path: string): Promise<boolean> {
  const token = await getGraphToken();
  const driveId = await getDriveId();
  const endpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(path)}`;

  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.ok || res.status === 404; // 404 = already gone, that's fine
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`Dry run: ${dryRun}\n`);

  // Find items with URLs that were just created
  // We'll search by name and check if they have a SharePoint URL

  let cleared = 0;
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < itemNames.length; i++) {
    const name = itemNames[i];

    try {
      // Search for item by exact name
      const searchQuery = `
        query {
          boards(ids: ${BOARD_ID}) {
            items_page(limit: 10, query_params: {
              rules: [{column_id: "name", compare_value: ["${name.replace(/"/g, '\\"')}"], operator: any_of}]
            }) {
              items {
                id
                name
                column_values(ids: ["${SHAREPOINT_URL_COLUMN}"]) {
                  id
                  text
                }
              }
            }
          }
        }
      `;

      const data = (await mondayQuery(searchQuery)) as {
        boards: Array<{
          items_page: {
            items: Array<{
              id: string;
              name: string;
              column_values: Array<{ id: string; text: string }>;
            }>;
          };
        }>;
      };

      const items = data.boards?.[0]?.items_page?.items || [];

      for (const item of items) {
        if (item.name !== name) continue; // Exact match only

        const urlCol = item.column_values?.find(
          (c) => c.id === SHAREPOINT_URL_COLUMN
        );
        const urlText = urlCol?.text || "";

        if (!urlText) continue; // No URL to clear

        // Extract the folder path from URL
        const urlMatch = urlText.match(/https:\/\/[^\s]+/);
        if (!urlMatch) continue;

        const url = urlMatch[0];
        const pathMatch = url.match(/Shared%20Documents\/(.+)/);

        if (pathMatch) {
          const folderPath = decodeURIComponent(pathMatch[1]);

          if (dryRun) {
            console.log(`[${i + 1}/${itemNames.length}] Would clean: ${name}`);
            cleared++;
            deleted++;
          } else {
            // Delete the folder
            const delOk = await deleteFolder(folderPath);
            if (delOk) {
              deleted++;
            }

            // Clear the URL
            const clearQuery = `
              mutation {
                change_column_value(
                  board_id: ${BOARD_ID}
                  item_id: ${item.id}
                  column_id: "${SHAREPOINT_URL_COLUMN}"
                  value: "{}"
                ) { id }
              }
            `;
            await mondayQuery(clearQuery);
            cleared++;

            console.log(`[${i + 1}/${itemNames.length}] ✓ Cleaned: ${name}`);
          }
        }
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      errors++;
      console.log(`[${i + 1}/${itemNames.length}] ✗ Error: ${name} - ${err}`);
    }
  }

  console.log("\n==================================================");
  console.log("CLEANUP COMPLETE");
  console.log("==================================================");
  console.log(`URLs cleared: ${cleared}`);
  console.log(`Folders deleted: ${deleted}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
