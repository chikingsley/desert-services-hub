import { assertWritableMailbox } from "@email-cli/commands/config";
import { db } from "@lib/db/client";
import { hydrateProjectFolderCommand } from "./hydrate-project";
import { getMailboxByUser } from "./repository";
import type { HydrateTrackedOptions } from "./types";

export async function hydrateTrackedProjectsCommand(
  options: HydrateTrackedOptions
): Promise<void> {
  assertWritableMailbox(options.userId, "project-hydrate-tracked");

  const mailbox = await getMailboxByUser(options.userId);
  if (!mailbox) {
    throw new Error(
      `Mailbox "${options.userId}" not found in Supabase Postgres. Run email sync first so mailboxes.id exists.`
    );
  }

  const limitSql = options.maxProjects > 0 ? "LIMIT $1" : "";
  const rows = await db
    .query<{ project_id: number; project_name: string }>(
      `SELECT p.id AS project_id, p.name AS project_name
       FROM projects p
       WHERE EXISTS (
         SELECT 1
         FROM tracked_folders tf
         WHERE tf.project_id = p.id
       )
       ORDER BY p.last_seen DESC NULLS LAST, p.id DESC
       ${limitSql}`
    )
    .all(...(options.maxProjects > 0 ? [options.maxProjects] : []));

  if (rows.length === 0) {
    console.log(
      "No tracked project folders linked to projects (tracked_folders.project_id is empty)."
    );
    return;
  }

  let projectsWithMoves = 0;
  let totalToMove = 0;
  let totalMoved = 0;
  let totalMoveErrors = 0;
  let totalDbUpdated = 0;
  let totalDbSkipped = 0;
  let totalDbErrors = 0;

  console.log(
    `Hydrating ${rows.length} tracked project(s) in mailbox ${options.userId}...${options.apply ? "" : " (dry-run)"}`
  );

  for (const row of rows) {
    const stats = await hydrateProjectFolderCommand({
      apply: options.apply,
      concurrency: options.concurrency,
      includeMixed: options.includeMixed,
      limit: options.limit,
      maxDepth: 0,
      maxThreads: options.maxThreads,
      projectArg: String(row.project_id),
      quiet: true,
      showPaths: false,
      skipDbUpdate: options.skipDbUpdate,
      userId: options.userId,
    });

    totalToMove += stats.messagesToMove;
    totalMoved += stats.moved;
    totalMoveErrors += stats.moveErrors;
    totalDbUpdated += stats.dbUpdated;
    totalDbSkipped += stats.dbSkipped;
    totalDbErrors += stats.dbErrors;
    if (stats.messagesToMove > 0) {
      projectsWithMoves++;
    }
  }

  console.log("\nSummary:");
  console.log(`- Projects scanned: ${rows.length}`);
  console.log(`- Projects needing moves: ${projectsWithMoves}`);
  console.log(`- Messages to move: ${totalToMove}`);
  if (options.apply) {
    console.log(`- Messages moved: ${totalMoved}`);
    if (totalMoveErrors > 0) {
      console.log(`- Move errors: ${totalMoveErrors}`);
    }
    if (!options.skipDbUpdate) {
      console.log(`- DB message_id updates: ${totalDbUpdated}`);
      console.log(`- DB updates skipped: ${totalDbSkipped}`);
      if (totalDbErrors > 0) {
        console.log(`- DB update errors: ${totalDbErrors}`);
      }
    }
  }
}
