#!/usr/bin/env bun
/**
 * Expand email links via conversation threading.
 * If any email in a conversation is linked to a project, link all emails in that conversation.
 *
 * Usage: bun expand-threads.ts --project-id=123
 *        bun expand-threads.ts --all
 */

import Database from "bun:sqlite";

const projectIdArg = process.argv.find((a) => a.startsWith("--project-id="));
const expandAll = process.argv.includes("--all");

if (!(projectIdArg || expandAll)) {
  console.error("Usage: bun expand-threads.ts --project-id=123");
  console.error("       bun expand-threads.ts --all");
  process.exit(1);
}

const db = new Database("./apps/contract-ui/contract/hub.db");

if (expandAll) {
  console.log("Expanding threads for ALL projects with linked emails...\n");

  // Find all conversations that have at least one linked email
  const linkedConvos = db
    .query<{ conversation_id: string; project_id: number }, []>(
      `SELECT DISTINCT conversation_id, project_id 
       FROM emails 
       WHERE project_id IS NOT NULL 
       AND conversation_id IS NOT NULL`
    )
    .all();

  console.log(`Found ${linkedConvos.length} conversations with linked emails`);

  let totalLinked = 0;
  for (const convo of linkedConvos) {
    const result = db.run(
      "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND conversation_id = ?",
      [convo.project_id, convo.conversation_id]
    );
    totalLinked += result.changes;
  }

  console.log(
    `Linked ${totalLinked} additional emails via conversation threads`
  );
} else {
  const projectId = Number(projectIdArg?.split("=")[1]);

  const project = db
    .query<{ name: string }, [number]>("SELECT name FROM projects WHERE id = ?")
    .get(projectId);

  console.log(
    `Expanding threads for project: ${project?.name} (ID: ${projectId})\n`
  );

  // Get current count
  const beforeCount = db
    .query<{ c: number }, [number]>(
      "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
    )
    .get(projectId);

  // Find conversations with linked emails for this project
  const linkedConvos = db
    .query<{ conversation_id: string }, [number]>(
      `SELECT DISTINCT conversation_id 
       FROM emails 
       WHERE project_id = ? 
       AND conversation_id IS NOT NULL`
    )
    .all(projectId);

  console.log(`Found ${linkedConvos.length} conversations`);

  let expanded = 0;
  for (const convo of linkedConvos) {
    const result = db.run(
      "UPDATE emails SET project_id = ? WHERE project_id IS NULL AND conversation_id = ?",
      [projectId, convo.conversation_id]
    );
    expanded += result.changes;
  }

  const afterCount = db
    .query<{ c: number }, [number]>(
      "SELECT COUNT(*) as c FROM emails WHERE project_id = ?"
    )
    .get(projectId);

  console.log(`Before: ${beforeCount?.c} emails`);
  console.log(`After: ${afterCount?.c} emails`);
  console.log(`Expanded: +${expanded} via threads`);
}

db.close();
