#!/usr/bin/env bun
/**
 * Link emails from an Outlook folder to a project in the database.
 * Uses internet_message_id (RFC 2822) for exact matching.
 *
 * Usage: bun link-folder-emails.ts "Folder Name" [--project-id=123]
 *
 * If --project-id not provided, looks up via project_aliases table.
 */

import Database from "bun:sqlite";
import { GraphEmailClient } from "@/services/email/client";

const folderName = process.argv[2];
const projectIdArg = process.argv.find((a) => a.startsWith("--project-id="));
let projectId = projectIdArg ? Number(projectIdArg.split("=")[1]) : null;

if (!folderName) {
  console.error(
    "Usage: bun link-folder-emails.ts <folder-name> [--project-id=123]"
  );
  process.exit(1);
}

const db = new Database("./services/contract/census/hub.db");

// Find project ID from alias if not provided
if (!projectId) {
  const alias = db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE alias = ?"
    )
    .get(folderName);

  if (alias) {
    projectId = alias.project_id;
    console.log(`Found project via alias: ${projectId}`);
  } else {
    console.error(
      `No alias found for folder "${folderName}". Add one first or use --project-id.`
    );
    process.exit(1);
  }
}

const project = db
  .query<{ name: string }, [number]>("SELECT name FROM projects WHERE id = ?")
  .get(projectId);
console.log(
  `\nLinking folder "${folderName}" → Project "${project?.name}" (ID: ${projectId})\n`
);

// Validate env vars
const azureTenantId = process.env.AZURE_TENANT_ID;
const azureClientId = process.env.AZURE_CLIENT_ID;
const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

if (!(azureTenantId && azureClientId && azureClientSecret)) {
  console.error("Missing required Azure env vars");
  process.exit(1);
}

// Initialize Graph client
const client = new GraphEmailClient({
  azureTenantId,
  azureClientId,
  azureClientSecret,
});

// Find the folder
const allFolders = await client.listFoldersRecursive("chi@desertservices.net");
const projectsFolder = allFolders.find((f) => f.displayName === "Projects");
const activeFolder = projectsFolder?.children?.find(
  (f) => f.displayName === "Active"
);
const folder = activeFolder?.children?.find(
  (f) =>
    f.displayName === folderName || f.displayName.trim() === folderName.trim()
);

if (!folder) {
  console.error(`Folder "${folderName}" not found in Projects/Active/`);
  process.exit(1);
}

console.log(`Found folder: ${folder.displayName} (ID: ${folder.id})`);

// Get messages from folder via Graph API
const graphClient = client as {
  client: {
    api: (path: string) => {
      top: (n: number) => {
        select: (fields: string) => {
          get: () => Promise<{
            value: Array<{
              internetMessageId: string;
              conversationId: string;
              subject: string;
            }>;
          }>;
        };
      };
    };
  };
};
const messagesResponse = await graphClient.client
  .api(`/users/chi@desertservices.net/mailFolders/${folder.id}/messages`)
  .top(500)
  .select("id,internetMessageId,subject,conversationId")
  .get();

const messages = messagesResponse.value || [];
console.log(`Folder contains ${messages.length} emails\n`);

// Link by internet_message_id
let linked = 0;
let notFound = 0;
const conversationIds = new Set<string>();

for (const msg of messages) {
  if (!msg.internetMessageId) {
    notFound++;
    continue;
  }

  const result = db.run(
    "UPDATE emails SET project_id = ? WHERE internet_message_id = ? AND project_id IS NULL",
    [projectId, msg.internetMessageId]
  );

  if (result.changes > 0) {
    linked++;
  } else {
    // Check if it exists but is already linked
    const existing = db
      .query<{ project_id: number | null }, [string]>(
        "SELECT project_id FROM emails WHERE internet_message_id = ?"
      )
      .get(msg.internetMessageId);

    if (!existing) {
      notFound++;
    }
  }

  if (msg.conversationId) {
    conversationIds.add(msg.conversationId);
  }
}

console.log("Direct linking results:");
console.log(`  Linked: ${linked}`);
console.log(`  Not in DB: ${notFound}`);
console.log(`  Conversations found: ${conversationIds.size}`);

// Expand via conversation threads
let threadLinked = 0;
for (const convId of conversationIds) {
  const result = db.run(
    "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND conversation_id = ?",
    [projectId, convId]
  );
  threadLinked += result.changes;
}

console.log(`\nThread expansion: +${threadLinked} emails`);

// Final count
const finalCount = db
  .query<{ c: number }, [number]>(
    "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
  )
  .get(projectId);

console.log(`\nTotal emails now linked to project: ${finalCount?.c}`);

db.close();
