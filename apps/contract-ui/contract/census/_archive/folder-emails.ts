/**
 * Sync Project Folder Emails
 *
 * Pulls emails from chi@'s organized Outlook folder structure
 * and uses them to:
 * 1. Populate internet_message_id for cross-mailbox matching
 * 2. Create/update project associations based on folder organization
 *
 * Usage: bun services/contract/census/sync-folder-emails.ts
 */

import { GraphEmailClient } from "@services/email";
import { db } from "../db/connection";
import { createProgressBar } from "../lib/progress";

const config = {
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
};

interface FolderEmail {
  internetMessageId: string;
  subject: string;
  receivedDateTime: string;
  folderName: string;
  folderStatus: "Active" | "Inactive";
}

async function syncFolderEmails() {
  console.log("=== Sync Project Folder Emails ===\n");

  const client = new GraphEmailClient(config);
  await client.initAppAuth();
  const graphClient = client.getClient();

  const userId = "chi@desertservices.net";

  // Get Projects folder
  const resp = await graphClient
    .api(`/users/${userId}/mailFolders`)
    .filter("displayName eq 'Projects'")
    .get();

  const projectsFolder = resp.value?.[0];
  if (!projectsFolder) {
    console.log("Projects folder not found");
    return;
  }

  // Get Active/Inactive subfolders
  const statusFolders = await graphClient
    .api(`/users/${userId}/mailFolders/${projectsFolder.id}/childFolders`)
    .get();

  const folderEmails: FolderEmail[] = [];

  for (const statusFolder of statusFolders.value || []) {
    const status = statusFolder.displayName as "Active" | "Inactive";
    console.log(`\nScanning ${status} projects...`);

    // Get project folders
    const projectFolders = await graphClient
      .api(`/users/${userId}/mailFolders/${statusFolder.id}/childFolders`)
      .top(200)
      .get();

    const bar = createProgressBar(projectFolders.value?.length || 0, status);

    for (const projFolder of projectFolders.value || []) {
      // Get emails in this folder
      const emails = await graphClient
        .api(`/users/${userId}/mailFolders/${projFolder.id}/messages`)
        .top(500)
        .select("internetMessageId,subject,receivedDateTime")
        .get();

      for (const email of emails.value || []) {
        if (email.internetMessageId) {
          folderEmails.push({
            internetMessageId: email.internetMessageId,
            subject: email.subject,
            receivedDateTime: email.receivedDateTime,
            folderName: projFolder.displayName,
            folderStatus: status,
          });
        }
      }

      bar.increment();
    }

    bar.stop();
  }

  console.log(`\nTotal folder emails: ${folderEmails.length}`);

  // Now match to database and update
  console.log("\nMatching to database...\n");

  const updateInternetIdStmt = db.prepare(
    "UPDATE emails SET internet_message_id = ? WHERE id = ?"
  );

  // Get or create project
  const getProjectStmt = db.prepare<{ id: number } | null, [string]>(
    "SELECT id FROM projects WHERE name = ?"
  );

  const createProjectStmt = db.prepare(
    "INSERT INTO projects (name, normalized_name) VALUES (?, ?) RETURNING id"
  );

  const linkEmailStmt = db.prepare(
    "UPDATE emails SET project_id = ? WHERE id = ?"
  );

  let matched = 0;
  let linkedToProject = 0;
  let notFound = 0;
  const projectsCreated = new Set<string>();

  const bar = createProgressBar(folderEmails.length, "Processing");

  for (const fe of folderEmails) {
    // Try to find matching email by internet_message_id first
    let dbEmail = db
      .query<{ id: number; project_id: number | null }, [string]>(
        "SELECT id, project_id FROM emails WHERE internet_message_id = ?"
      )
      .get(fe.internetMessageId);

    // If not found, try by subject + close timestamp
    if (!dbEmail) {
      const receivedDate = new Date(fe.receivedDateTime);
      const minDate = new Date(receivedDate.getTime() - 60_000).toISOString(); // -1 min
      const maxDate = new Date(receivedDate.getTime() + 60_000).toISOString(); // +1 min

      dbEmail = db
        .query<
          { id: number; project_id: number | null },
          [string, string, string]
        >(
          `SELECT id, project_id FROM emails 
           WHERE subject = ? AND received_at BETWEEN ? AND ?
           LIMIT 1`
        )
        .get(fe.subject, minDate, maxDate);
    }

    if (dbEmail) {
      matched++;

      // Update internet_message_id if not set
      updateInternetIdStmt.run(fe.internetMessageId, dbEmail.id);

      // Link to project if not already linked
      if (!dbEmail.project_id) {
        let project = getProjectStmt.get(fe.folderName);

        if (!project) {
          // Create project from folder name
          const normalized = fe.folderName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
          const result = createProjectStmt.get(fe.folderName, normalized) as {
            id: number;
          };
          project = { id: result.id };
          projectsCreated.add(fe.folderName);
        }

        linkEmailStmt.run(project.id, dbEmail.id);
        linkedToProject++;
      }
    } else {
      notFound++;
    }

    bar.increment();
  }

  bar.stop();

  console.log("\n=== Summary ===");
  console.log(`Folder emails processed: ${folderEmails.length}`);
  console.log(`Matched to DB: ${matched}`);
  console.log(`Linked to projects: ${linkedToProject}`);
  console.log(`Not found in DB: ${notFound}`);
  console.log(`Projects created: ${projectsCreated.size}`);

  if (projectsCreated.size > 0) {
    console.log("\nNew projects created from folders:");
    for (const name of Array.from(projectsCreated).slice(0, 20)) {
      console.log(`  - ${name}`);
    }
    if (projectsCreated.size > 20) {
      console.log(`  ... and ${projectsCreated.size - 20} more`);
    }
  }
}

syncFolderEmails().catch(console.error);
