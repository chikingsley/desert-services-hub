#!/usr/bin/env bun
/**
 * Quick Sync - Uses simplified queries (like the Worker) for faster execution
 * Handles folder creates and moves based on status changes
 */

const BOARD_ID = "7943937851";
const CUSTOMER_PROJECTS_PATH = "Customer Projects";

// Column IDs
const ACCOUNTS_COLUMN = "mirror_mkqz3ngj";
const BID_STATUS_COLUMN = "deal_stage";
const SHAREPOINT_URL_COLUMN = "link_mky1n6pa";

// Groups to skip
const SKIP_GROUPS = ["Shell Estimates ( Do Not Move)", "Sales Team Estimates"];

// Status → SharePoint folder mapping
const STATUS_MAP: Record<string, string> = {
  New: "Submitted",
  "Yet to Bid": "Submitted",
  "Bid Sent": "Submitted",
  Won: "Active",
  "Pending Won": "Active",
  "Add to Projects": "Active",
  Lost: "Lost",
  Duplicates: "Lost",
  "GC Not Awarded": "Lost",
};

const DEFAULT_STATUS_FOLDER = "Submitted";
const VALID_STATUS_FOLDERS = new Set([
  "Submitted",
  "Active",
  "Lost",
  "Finished",
]);
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;

interface MondayItem {
  id: string;
  name: string;
  accountName: string;
  bidStatus: string;
  sharepointUrl: string | null;
}

// Environment
const MONDAY_API_KEY = process.env.MONDAY_API_KEY!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

// =============================================================================
// Monday API
// =============================================================================

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

async function getEstimateItems(): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  console.log("Fetching items from Monday...");

  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";

    const query = `
      query {
        boards(ids: ${BOARD_ID}) {
          items_page(limit: 500${cursorPart}) {
            cursor
            items {
              id
              name
              group { title }
              column_values(ids: ["${ACCOUNTS_COLUMN}", "${BID_STATUS_COLUMN}", "${SHAREPOINT_URL_COLUMN}"]) {
                id
                text
                ... on MirrorValue { display_value }
              }
            }
          }
        }
      }
    `;

    const data = (await mondayQuery(query)) as {
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: Array<{
            id: string;
            name: string;
            group: { title: string };
            column_values: Array<{
              id: string;
              text?: string;
              display_value?: string;
            }>;
          }>;
        };
      }>;
    };

    const page = data.boards?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        if (SKIP_GROUPS.includes(item.group.title)) continue;

        const accountCol = item.column_values.find(
          (c) => c.id === ACCOUNTS_COLUMN
        );
        const statusCol = item.column_values.find(
          (c) => c.id === BID_STATUS_COLUMN
        );
        const urlCol = item.column_values.find(
          (c) => c.id === SHAREPOINT_URL_COLUMN
        );

        items.push({
          id: item.id,
          name: item.name,
          accountName:
            accountCol?.display_value || accountCol?.text || "Unknown",
          bidStatus: statusCol?.text || "",
          sharepointUrl: extractUrl(urlCol?.text),
        });
      }
    }
    cursor = page?.cursor ?? null;
    process.stdout.write(`\r  Fetched ${items.length} items...`);
  } while (cursor);

  console.log(`\n  Total: ${items.length} items`);
  return items;
}

async function updateMondayUrl(
  itemId: string,
  url: string,
  name: string
): Promise<void> {
  const value = JSON.stringify({ url, text: name });

  const query = `
    mutation {
      change_column_value(
        board_id: ${BOARD_ID}
        item_id: ${itemId}
        column_id: "${SHAREPOINT_URL_COLUMN}"
        value: ${JSON.stringify(value)}
      ) { id }
    }
  `;

  await mondayQuery(query);
}

// =============================================================================
// SharePoint Graph API
// =============================================================================

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

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

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

  if (!res.ok) throw new Error(`Failed to get drives: ${res.status}`);

  const data = (await res.json()) as {
    value: Array<{ id: string; name: string }>;
  };
  const docDrive = data.value.find(
    (d) => d.name === "Documents" || d.name === "Shared Documents"
  );

  if (!docDrive) throw new Error("Could not find Documents drive");
  cachedDriveId = docDrive.id;
  return cachedDriveId;
}

async function folderExists(path: string): Promise<boolean> {
  const token = await getGraphToken();
  const driveId = await getDriveId();
  const endpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(path)}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.ok;
}

async function createFolder(path: string): Promise<boolean> {
  const token = await getGraphToken();
  const driveId = await getDriveId();

  const pathParts = path.split("/");
  let currentPath = "";

  for (const part of pathParts) {
    const parentPath = currentPath;
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    const checkEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(currentPath)}`;
    const checkRes = await fetch(checkEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (checkRes.status === 404) {
      const createEndpoint = parentPath
        ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(parentPath)}:/children`
        : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

      const createRes = await fetch(createEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: part,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });

      if (!createRes.ok && createRes.status !== 409) {
        return false;
      }
    }
  }

  return true;
}

async function moveFolder(fromPath: string, toPath: string): Promise<boolean> {
  const token = await getGraphToken();
  const driveId = await getDriveId();

  // Get source item ID
  const srcEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(fromPath)}`;
  const srcRes = await fetch(srcEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!srcRes.ok) return false;

  const srcData = (await srcRes.json()) as { id: string };

  // Ensure destination parent exists
  const destParentPath = toPath.substring(0, toPath.lastIndexOf("/"));
  await createFolder(destParentPath);

  // Get destination parent ID
  const destEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(destParentPath)}`;
  const destRes = await fetch(destEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!destRes.ok) return false;

  const destData = (await destRes.json()) as { id: string };

  // Move
  const moveEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${srcData.id}`;
  const moveRes = await fetch(moveEndpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parentReference: { id: destData.id } }),
  });

  return moveRes.ok;
}

// =============================================================================
// Utilities
// =============================================================================

function parseStatusFromUrl(url: string | null): string | null {
  if (!url) return null;
  const decoded = decodeURIComponent(url);
  const marker = "Customer Projects/";
  const idx = decoded.indexOf(marker);
  if (idx === -1) return null;
  const afterMarker = decoded.slice(idx + marker.length);
  const status = afterMarker.split("/")[0];
  return VALID_STATUS_FOLDERS.has(status) ? status : null;
}

function extractUrl(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/);
  return match?.[0] ?? null;
}

function getBaseName(name: string): string {
  return name.replace(PREFIX_PATTERN, "").trim();
}

function sanitizeName(name: string): string {
  return name.replace(/["*:<>?/\\|#%~{}]/g, "_").trim();
}

function getLetterFolder(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "_Numeric";
}

function buildSharePointUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/${encodedPath}`;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("==================================================");
  console.log("QUICK SYNC - Folder Management");
  console.log("==================================================");
  console.log(`Dry run: ${dryRun}`);
  console.log("");

  const items = await getEstimateItems();

  let created = 0;
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  console.log("\nProcessing...\n");

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const targetFolder = STATUS_MAP[item.bidStatus] ?? DEFAULT_STATUS_FOLDER;
    const currentFolder = parseStatusFromUrl(item.sharepointUrl);

    try {
      if (!item.sharepointUrl) {
        // Need to create folder
        const projectName = sanitizeName(getBaseName(item.name));
        const accountName = sanitizeName(item.accountName);
        const letter = getLetterFolder(accountName);
        const folderPath = `${CUSTOMER_PROJECTS_PATH}/${targetFolder}/${letter}/${accountName}/${projectName}`;

        if (dryRun) {
          created++;
          console.log(`[${i + 1}/${items.length}] Would create: ${item.name}`);
        } else {
          const ok = await createFolder(folderPath);
          if (ok) {
            const url = buildSharePointUrl(folderPath);
            await updateMondayUrl(item.id, url, item.name);
            created++;
            console.log(`[${i + 1}/${items.length}] ✓ Created: ${item.name}`);
          } else {
            errors++;
            console.log(
              `[${i + 1}/${items.length}] ✗ Failed to create: ${item.name}`
            );
          }
        }
      } else if (currentFolder && currentFolder !== targetFolder) {
        // Need to move folder
        const match = item.sharepointUrl.match(/Shared%20Documents\/(.+)/);
        if (!match) {
          skipped++;
          continue;
        }

        const currentPath = decodeURIComponent(match[1]);
        const newPath = currentPath.replace(
          `/${currentFolder}/`,
          `/${targetFolder}/`
        );

        if (dryRun) {
          moved++;
          console.log(
            `[${i + 1}/${items.length}] Would move: ${item.name} (${currentFolder} → ${targetFolder})`
          );
        } else {
          const ok = await moveFolder(currentPath, newPath);
          if (ok) {
            const newUrl = item.sharepointUrl.replace(
              currentFolder,
              targetFolder
            );
            await updateMondayUrl(item.id, newUrl, item.name);
            moved++;
            console.log(
              `[${i + 1}/${items.length}] ✓ Moved: ${item.name} (${currentFolder} → ${targetFolder})`
            );
          } else {
            errors++;
            console.log(
              `[${i + 1}/${items.length}] ✗ Failed to move: ${item.name}`
            );
          }
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.log(`[${i + 1}/${items.length}] ✗ Error: ${item.name} - ${err}`);
    }
  }

  console.log("\n==================================================");
  console.log("COMPLETE");
  console.log("==================================================");
  console.log(`Created: ${created}`);
  console.log(`Moved:   ${moved}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
}

main().catch(console.error);
