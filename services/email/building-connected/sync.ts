/**
 * Sync BuildingConnected bid invites from Jared's email to SQLite
 *
 * Usage:
 *   bun services/email/building-connected/sync.ts              # Incremental sync
 *   bun services/email/building-connected/sync.ts --full       # Full re-sync
 *   bun services/email/building-connected/sync.ts --limit=100  # Limit emails
 */
import { Database } from "bun:sqlite";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const DB_PATH = `${import.meta.dir}/bc-bids.db`;
const USER_ID = "jared@desertservices.net";
const FOLDER_NAME = "Bid Invites";
const BATCH_SIZE = 100;

const PROJECT_NAME_REGEX_1 = /^(Reminder:\s*)?(Bid Invite:)\s*/i;
const PROJECT_NAME_REGEX_2 = /\s+Project$/i;
const LOCATION_REGEX = /<b>Location:\s*<\/b><span>([^<]+)<\/span>/;
const LEAD_NAME_REGEX = /<b>Lead:\s*([^<]+)<\/b>/;
const CONTACT_DETAILS_REGEX =
  /(?:Estimating Lead|Project Manager|Estimator|Senior Estimator|Pre-Construction|Preconstruction)[^•]*•\s*([^•]+)•\s*([^<]+)</;
const COMPANY_REGEX = /<b>([^<]+)<\/b>\s*has invited you to bid/;
const DESCRIPTION_REGEX = /<div>([^<]{20,500})<\/div>/;
const LINK_REGEX =
  /<a[^>]*href="(https:\/\/app\.buildingconnected\.com\/goto\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;

type GraphEmail = {
  id: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  hasAttachments?: boolean;
  body?: { content?: string; contentType?: string };
  conversationId?: string;
};

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

type ExtractedData = {
  projectName: string;
  location: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  gcCompany: string | null;
  description: string | null;
  rfpUrl: string | null;
  allLinks: Array<{ url: string; label: string }>;
};

function cleanHtmlEntity(text: string): string {
  return text.trim().replace(/&amp;/g, "&");
}

function extractMatchGroup(
  html: string,
  regex: RegExp,
  groupIndex = 1
): string | null {
  const match = html.match(regex);
  return match?.[groupIndex]?.trim() ?? null;
}

function extractRfpLinks(html: string): Array<{ url: string; label: string }> {
  const allLinks: Array<{ url: string; label: string }> = [];
  const seen = new Set<string>();

  let match = LINK_REGEX.exec(html);
  while (match !== null) {
    const url = match[1];
    if (url && seen.has(url) === false) {
      seen.add(url);
      const label =
        match[2]?.trim().replace(/\s+/g, " ").replace(/»/g, "").trim() ?? "";
      const lowerLabel = label.toLowerCase();
      const isViewOrRfp =
        lowerLabel.includes("view") || lowerLabel.includes("rfp");
      const isNotResponse = url.includes("state=") === false;
      if (label && isViewOrRfp && isNotResponse) {
        allLinks.push({ url, label });
      }
    }
    match = LINK_REGEX.exec(html);
  }
  return allLinks;
}

function extractBcData(html: string, subject: string): ExtractedData {
  const projectName = subject
    .replace(PROJECT_NAME_REGEX_1, "")
    .replace(PROJECT_NAME_REGEX_2, "")
    .trim();

  const locationRaw = extractMatchGroup(html, LOCATION_REGEX);
  const location = locationRaw ? cleanHtmlEntity(locationRaw) : null;

  const leadName = extractMatchGroup(html, LEAD_NAME_REGEX);

  const contactMatch = html.match(CONTACT_DETAILS_REGEX);
  const leadPhone = contactMatch?.[1]?.trim() ?? null;
  const leadEmail = contactMatch?.[2]?.trim() ?? null;

  const gcCompanyRaw = extractMatchGroup(html, COMPANY_REGEX);
  const gcCompany = gcCompanyRaw ? cleanHtmlEntity(gcCompanyRaw) : null;

  const descRaw = extractMatchGroup(html, DESCRIPTION_REGEX);
  const description = descRaw
    ? cleanHtmlEntity(descRaw).substring(0, 500)
    : null;

  const allLinks = extractRfpLinks(html);
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
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error(
      "Missing Azure credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET"
    );
  }

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
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

function getLastSyncTime(db: Database, isFullSync: boolean): string | null {
  if (isFullSync) {
    return null;
  }
  const row = db
    .query<{ value: string }, []>(
      "SELECT value FROM sync_meta WHERE key = 'last_sync'"
    )
    .get();
  return row?.value ?? null;
}

function prepareDbForSync(db: Database, isFullSync: boolean): void {
  if (isFullSync) {
    console.log("Full sync - clearing existing data...");
    db.run("DELETE FROM bc_bids");
    db.run("DELETE FROM sync_meta WHERE key = 'last_sync'");
  }
}

function processEmail(
  email: GraphEmail,
  insertBid: ReturnType<Database["prepare"]>,
  lastSync: string | null
): boolean {
  if (lastSync && email.receivedDateTime < lastSync) {
    return false;
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
    return true;
  }
  return false;
}

function logSyncStart(lastSync: string | null, isFullSync: boolean): void {
  if (lastSync) {
    console.log(`Incremental sync since: ${lastSync}`);
  } else if (isFullSync === false) {
    console.log("No previous sync - doing full sync");
  }
}

function logSyncComplete(db: Database, totalBids: number): void {
  const bidCount = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM bc_bids")
    .get();

  console.log("\n=== Sync Complete ===");
  console.log(`BC bids synced this run: ${totalBids}`);
  console.log(`Total BC bids in DB: ${bidCount?.count ?? 0}`);
  console.log(`Database: ${DB_PATH}`);
}

type BatchResult = { totalBids: number; limitReached: boolean };

type BatchContext = {
  insertBid: ReturnType<Database["prepare"]>;
  lastSync: string | null;
  syncLimit?: number;
};

function processBatch(
  emails: GraphEmail[],
  ctx: BatchContext,
  currentTotal: number
): BatchResult {
  let totalBids = currentTotal;
  let limitReached = false;

  console.log(`Processing batch of ${emails.length} BC emails...`);

  for (const email of emails) {
    const wasInserted = processEmail(email, ctx.insertBid, ctx.lastSync);
    if (wasInserted) {
      totalBids += 1;
    }

    if (ctx.syncLimit && totalBids >= ctx.syncLimit) {
      console.log(`Reached limit of ${ctx.syncLimit}`);
      limitReached = true;
      break;
    }
  }

  return { totalBids, limitReached };
}

async function syncBcBids(
  isFullSync = false,
  syncLimit?: number
): Promise<void> {
  const db = initDb();
  const client = getGraphClient();

  console.log(`Syncing BuildingConnected bids from "${FOLDER_NAME}"...`);
  if (syncLimit) {
    console.log(`Limiting to ${syncLimit} bids`);
  }

  const folderId = await getFolderId(client);
  const lastSync = getLastSyncTime(db, isFullSync);

  prepareDbForSync(db, isFullSync);
  logSyncStart(lastSync, isFullSync);

  const insertBid = db.prepare(`
    INSERT OR REPLACE INTO bc_bids
    (id, project_name, received_at, gc_company, lead_name, lead_phone, lead_email, location, description, rfp_url, all_links, subject, conversation_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let totalBids = 0;
  const request = client
    .api(`/users/${USER_ID}/mailFolders/${folderId}/messages`)
    .filter("from/emailAddress/address eq 'team@buildingconnected.com'")
    .top(BATCH_SIZE)
    .select(
      "id,subject,receivedDateTime,from,hasAttachments,body,conversationId"
    );

  let response = await request.get();

  const batchCtx: BatchContext = { insertBid, lastSync, syncLimit };

  while (response?.value) {
    const result = processBatch(
      response.value as GraphEmail[],
      batchCtx,
      totalBids
    );
    totalBids = result.totalBids;

    if (result.limitReached) {
      break;
    }

    const nextLink = response["@odata.nextLink"];
    response = nextLink ? await client.api(nextLink).get() : null;
  }

  db.run(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', datetime('now'))"
  );
  logSyncComplete(db, totalBids);
  db.close();
}

// Main
const fullSyncArg = process.argv.includes("--full");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limitParam = limitArg?.includes("=")
  ? Number.parseInt(limitArg.split("=")[1] ?? "0", 10)
  : undefined;
await syncBcBids(fullSyncArg, limitParam);
