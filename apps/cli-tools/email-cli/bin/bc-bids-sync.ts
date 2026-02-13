/**
 * Sync BuildingConnected bid invites from Jared's email to SQLite
 *
 * Usage:
 *   bun apps/cli-tools/email-cli/bin/bc-bids-sync.ts              # Incremental sync
 *   bun apps/cli-tools/email-cli/bin/bc-bids-sync.ts --full       # Full re-sync
 *   bun apps/cli-tools/email-cli/bin/bc-bids-sync.ts --limit=100  # Limit emails
 */
import { Database } from "bun:sqlite";
import { ClientSecretCredential } from "@azure/identity";
import { extractBcData } from "@email/sync/bc-bids-extract";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const DB_PATH = `${import.meta.dir}/../data/bc-bids/bc-bids.db`;
const USER_ID = "jared@desertservices.net";
const FOLDER_NAME = "Bid Invites";
const BATCH_SIZE = 100;

interface GraphEmail {
  id: string;
  subject?: string;
  receivedDateTime: string;
  body?: { content?: string };
  conversationId?: string;
}

interface GraphMessagesResponse {
  value?: GraphEmail[];
  "@odata.nextLink"?: string;
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

function getGraphClient(): Client {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET)) {
    throw new Error("Missing required Azure environment variables");
  }

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID,
    AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET
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

function getLastSync(db: Database, fullSync: boolean): string | null {
  if (fullSync) {
    return null;
  }

  const row = db
    .query<{ value: string }, []>(
      "SELECT value FROM sync_meta WHERE key = 'last_sync'"
    )
    .get();

  return row?.value ?? null;
}

function prepareSyncRun(
  db: Database,
  fullSync: boolean,
  lastSync: string | null,
  limit?: number
): void {
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
}

function createInsertBidStatement(db: Database) {
  return db.prepare(`
    INSERT OR REPLACE INTO bc_bids
    (id, project_name, received_at, gc_company, lead_name, lead_phone, lead_email, location, description, rfp_url, all_links, subject, conversation_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
}

function shouldSkipEmail(email: GraphEmail, lastSync: string | null): boolean {
  return Boolean(lastSync && email.receivedDateTime < lastSync);
}

function insertBidFromEmail(
  insertBid: ReturnType<Database["prepare"]>,
  email: GraphEmail
): boolean {
  if (!email.body?.content) {
    return false;
  }

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

async function syncMessagePages(
  client: Client,
  folderId: string,
  insertBid: ReturnType<Database["prepare"]>,
  lastSync: string | null,
  limit?: number
): Promise<number> {
  const request = client
    .api(`/users/${USER_ID}/mailFolders/${folderId}/messages`)
    .filter("from/emailAddress/address eq 'team@buildingconnected.com'")
    .top(BATCH_SIZE)
    .select(
      "id,subject,receivedDateTime,from,hasAttachments,body,conversationId"
    );

  let totalBids = 0;
  let response = (await request.get()) as GraphMessagesResponse;

  while (response.value) {
    console.log(`Processing batch of ${response.value.length} BC emails...`);

    for (const email of response.value) {
      if (shouldSkipEmail(email, lastSync)) {
        continue;
      }

      if (insertBidFromEmail(insertBid, email)) {
        totalBids++;
      }

      if (limit && totalBids >= limit) {
        console.log(`Reached limit of ${limit}`);
        return totalBids;
      }
    }

    const nextLink = response["@odata.nextLink"];
    if (!nextLink) {
      break;
    }

    response = (await client.api(nextLink).get()) as GraphMessagesResponse;
  }

  return totalBids;
}

function updateLastSync(db: Database): void {
  db.run(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', datetime('now'))"
  );
}

function getTotalBidCount(db: Database): number {
  const row = db
    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM bc_bids")
    .get();
  return row?.count ?? 0;
}

async function syncBcBids(fullSync = false, limit?: number): Promise<void> {
  const db = initDb();

  try {
    const client = getGraphClient();
    console.log(`Syncing BuildingConnected bids from "${FOLDER_NAME}"...`);

    const folderId = await getFolderId(client);
    const lastSync = getLastSync(db, fullSync);
    prepareSyncRun(db, fullSync, lastSync, limit);

    const insertBid = createInsertBidStatement(db);
    const totalBids = await syncMessagePages(
      client,
      folderId,
      insertBid,
      lastSync,
      limit
    );

    updateLastSync(db);

    console.log("\n=== Sync Complete ===");
    console.log(`BC bids synced this run: ${totalBids}`);
    console.log(`Total BC bids in DB: ${getTotalBidCount(db)}`);
    console.log(`Database: ${DB_PATH}`);
  } finally {
    db.close();
  }
}

function parseCliArgs(): { fullSync: boolean; limit: number | undefined } {
  const fullSync = process.argv.includes("--full");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limitValue = limitArg?.split("=")[1];
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

  return { fullSync, limit };
}

const { fullSync, limit } = parseCliArgs();
await syncBcBids(fullSync, limit);
