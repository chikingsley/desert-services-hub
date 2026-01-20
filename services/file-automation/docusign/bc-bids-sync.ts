/**
 * Sync BuildingConnected bid invites from Jared's email to SQLite
 *
 * Usage:
 *   bun services/file-automation/scripts/bc-bids-sync.ts              # Incremental sync
 *   bun services/file-automation/scripts/bc-bids-sync.ts --full       # Full re-sync
 *   bun services/file-automation/scripts/bc-bids-sync.ts --limit=100  # Limit emails
 */
import { Database } from "bun:sqlite";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const DB_PATH = `${import.meta.dir}/../data/bc-bids.db`;
const USER_ID = "jared@desertservices.net";
const FOLDER_NAME = "Bid Invites";
const BATCH_SIZE = 100;

// Top-level regex patterns for performance
const _BID_INVITE_PREFIX_PATTERN = /^(Reminder:\s*)?(Bid Invite:)\s*/i;
const _PROJECT_SUFFIX_PATTERN = /\s+Project$/i;
const _LOCATION_PATTERN = /<b>Location:\s*<\/b><span>([^<]+)<\/span>/;
const _LEAD_PATTERN = /<b>Lead:\s*([^<]+)<\/b>/;
const _CONTACT_PATTERN =
  /(?:Estimating Lead|Project Manager|Estimator|Senior Estimator|Pre-Construction|Preconstruction)[^•]*•\s*([^•]+)•\s*([^<]+)</;
const _COMPANY_PATTERN = /<b>([^<]+)<\/b>\s*has invited you to bid/;
const _DESCRIPTION_PATTERN = /<div>([^<]{20,500})<\/div>/;
const _RFP_LINK_PATTERN =
  /<a[^>]*href="(https:\/\/app\.buildingconnected\.com\/goto\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;

interface GraphEmail {
  id: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  hasAttachments?: boolean;
  body?: { content?: string; contentType?: string };
  conversationId?: string;
}

function initDb(): Database {
  const db = new Database(DB_PATH);

  db.run(`
    CREATE TABLE IF NOT EXISTS bc_bids (
      id TEXT PRIMARY KEY,
      project_name TEXT,
      received_at TEXT,
      gc_company TEXT,
      lead_name TEXT,
      lead_phone TEXT,
      lead_email TEXT,
      location TEXT,
      description TEXT,
      rfp_url TEXT,
      all_links TEXT,
      subject TEXT,
      conversation_id TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(
    "CREATE INDEX IF NOT EXISTS idx_bc_bids_received ON bc_bids(received_at)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_bc_bids_gc ON bc_bids(gc_company)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_bc_bids_project ON bc_bids(project_name)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_bc_bids_lead_email ON bc_bids(lead_email)"
  );

  return db;
}

interface ExtractedData {
  projectName: string;
  location: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  gcCompany: string | null;
  description: string | null;
  rfpUrl: string | null;
  allLinks: Array<{ url: string; label: string }>;
}

function extractBcData(html: string, subject: string): ExtractedData {
  // Project name from subject
  const projectName = subject
    .replace(/^(Reminder:\s*)?(Bid Invite:)\s*/i, "")
    .replace(/\s+Project$/i, "")
    .trim();

  // Location
  const locMatch = html.match(/<b>Location:\s*<\/b><span>([^<]+)<\/span>/);
  const location = locMatch?.[1]
    ? locMatch[1].trim().replace(/&amp;/g, "&")
    : null;

  // Lead name
  const leadMatch = html.match(/<b>Lead:\s*([^<]+)<\/b>/);
  const leadName = leadMatch?.[1] ? leadMatch[1].trim() : null;

  // Contact details (phone and email)
  const contactMatch = html.match(
    /(?:Estimating Lead|Project Manager|Estimator|Senior Estimator|Pre-Construction|Preconstruction)[^•]*•\s*([^•]+)•\s*([^<]+)</
  );
  const leadPhone = contactMatch?.[1] ? contactMatch[1].trim() : null;
  const leadEmail = contactMatch?.[2] ? contactMatch[2].trim() : null;

  // GC Company
  let gcCompany: string | null = null;
  const companyMatch = html.match(/<b>([^<]+)<\/b>\s*has invited you to bid/);
  if (companyMatch?.[1]) {
    gcCompany = companyMatch[1].trim().replace(/&amp;/g, "&");
  }

  // Description
  let description: string | null = null;
  const descMatch = html.match(/<div>([^<]{20,500})<\/div>/);
  if (descMatch?.[1]) {
    description = descMatch[1].trim().replace(/&amp;/g, "&").substring(0, 500);
  }

  // Extract all RFP links
  const allLinks: Array<{ url: string; label: string }> = [];
  const linkRegex =
    /<a[^>]*href="(https:\/\/app\.buildingconnected\.com\/goto\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const rawLabel = match[2];
    if (!(url && rawLabel)) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);

    const label = rawLabel.trim().replace(/\s+/g, " ").replace(/»/g, "").trim();

    // Only RFP links, not response buttons
    if (
      label &&
      (label.toLowerCase().includes("view") ||
        label.toLowerCase().includes("rfp")) &&
      !url.includes("state=")
    ) {
      allLinks.push({ url, label });
    }
  }

  // Prefer SWPPP link, otherwise first link
  const swpppLink = allLinks.find((l) =>
    l.label.toLowerCase().includes("swppp")
  );
  const rfpUrl = swpppLink?.url ?? allLinks[0]?.url ?? null;

  return {
    projectName,
    location,
    leadName,
    leadPhone,
    leadEmail,
    gcCompany,
    description,
    rfpUrl,
    allLinks,
  };
}

function getGraphClient(): Client {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  return Client.initWithMiddleware({ authProvider });
}

async function getFolderId(client: Client): Promise<string> {
  const folders = await client
    .api(`/users/${USER_ID}/mailFolders`)
    .filter(`displayName eq '${FOLDER_NAME}'`)
    .get();

  if (folders.value.length === 0) {
    throw new Error(`Folder '${FOLDER_NAME}' not found`);
  }

  return folders.value[0].id;
}

async function syncBcBids(fullSync = false, limit?: number): Promise<void> {
  const db = initDb();
  const client = getGraphClient();

  console.log(`Syncing BuildingConnected bids from "${FOLDER_NAME}"...`);

  const folderId = await getFolderId(client);

  // Get last sync time
  let lastSync: string | null = null;
  if (fullSync === false) {
    const row = db
      .query<{ value: string }, []>(
        "SELECT value FROM sync_meta WHERE key = 'last_sync'"
      )
      .get();
    lastSync = row?.value ?? null;
  }

  if (fullSync) {
    console.log("Full sync - clearing existing data...");
    db.run("DELETE FROM bc_bids");
    db.run("DELETE FROM sync_meta WHERE key = 'last_sync'");
  } else if (lastSync) {
    console.log(`Incremental sync since: ${lastSync}`);
  } else {
    console.log("No previous sync - doing full sync");
  }

  if (limit) {
    console.log(`Limiting to ${limit} bids`);
  }

  const insertBid = db.prepare(`
    INSERT OR REPLACE INTO bc_bids
    (id, project_name, received_at, gc_company, lead_name, lead_phone, lead_email, location, description, rfp_url, all_links, subject, conversation_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let totalBids = 0;

  // Filter to only BuildingConnected emails (can't combine filter with orderby)
  const request = client
    .api(`/users/${USER_ID}/mailFolders/${folderId}/messages`)
    .filter("from/emailAddress/address eq 'team@buildingconnected.com'")
    .top(BATCH_SIZE)
    .select(
      "id,subject,receivedDateTime,from,hasAttachments,body,conversationId"
    );

  let response = await request.get();

  while (response?.value) {
    const emails = response.value as GraphEmail[];
    console.log(`Processing batch of ${emails.length} BC emails...`);

    for (const email of emails) {
      // Skip if before last sync (incremental)
      if (lastSync && email.receivedDateTime < lastSync) {
        continue;
      }

      if (email.body?.content) {
        const data = extractBcData(email.body.content, email.subject ?? "");

        insertBid.run(
          email.id,
          data.projectName,
          email.receivedDateTime,
          data.gcCompany,
          data.leadName,
          data.leadPhone,
          data.leadEmail,
          data.location,
          data.description,
          data.rfpUrl,
          JSON.stringify(data.allLinks),
          email.subject ?? "",
          email.conversationId ?? ""
        );

        totalBids++;
      }

      if (limit && totalBids >= limit) {
        console.log(`Reached limit of ${limit}`);
        break;
      }
    }

    if (limit && totalBids >= limit) {
      break;
    }

    // Next page
    if (response["@odata.nextLink"]) {
      response = await client.api(response["@odata.nextLink"]).get();
    } else {
      break;
    }
  }

  // Update last sync time
  db.run(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', datetime('now'))"
  );

  // Stats
  const bidCount = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM bc_bids")
    .get();

  console.log("\n=== Sync Complete ===");
  console.log(`BC bids synced this run: ${totalBids}`);
  console.log(`Total BC bids in DB: ${bidCount?.count ?? 0}`);
  console.log(`Database: ${DB_PATH}`);

  db.close();
}

// Main
const fullSync = process.argv.includes("--full");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limitValue = limitArg?.split("=")[1];
const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
await syncBcBids(fullSync, limit);
