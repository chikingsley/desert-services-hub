import { assertWritableMailbox, getAppClient } from "@email-cli/commands/config";
import type { Project } from "@lib/db/types";
import { executeHydrateProjectMoves } from "./hydrate-project/executor";
import {
  buildHydrateMovePlan,
  getMixedConversationIds,
  getOrphanEmailCountForProject,
  getThreadSummariesForProject,
} from "./hydrate-project/query";
import {
  buildDryRunStats,
  printHydrateProjectCompactSummary,
  printHydrateProjectCompletion,
  printHydrateProjectVerboseSummary,
} from "./hydrate-project/report";
import {
  getMailboxByUser,
  getTrackedFolderForProject,
  resolveProject,
} from "./repository";
import type { HydrateProjectOptions, HydrateProjectStats } from "./types";

interface ProjectFolderContext {
  folderId: string;
  displayName: string;
}

function missingTrackedFolderError(project: Project): Error {
  return new Error(
    `No tracked folder found for project #${project.id} (${project.name}). ` +
      `Create the folder under Projects/Active/ first (or run: project-folder-create "${project.name}" --apply).`
  );
}

function missingMailboxError(userId: string): Error {
  return new Error(
    `Mailbox "${userId}" not found in Supabase Postgres. Run email sync first so mailboxes.id exists.`
  );
}

function makeDryRunStats(
  folder: ProjectFolderContext,
  project: Project,
  threadRowsLength: number,
  threadsSkippedMixed: number,
  messagesAlreadyInFolder: number,
  messagesToMove: number,
  orphanCount: number
): HydrateProjectStats {
  return buildDryRunStats(
    folder,
    project.id,
    project.name,
    threadRowsLength,
    threadsSkippedMixed,
    messagesAlreadyInFolder,
    messagesToMove,
    orphanCount
  );
}

export async function hydrateProjectFolderCommand(
  options: HydrateProjectOptions
): Promise<HydrateProjectStats> {
  assertWritableMailbox(options.userId, "project-hydrate");

  const project = await resolveProject(options.projectArg);
  const destination = await getTrackedFolderForProject(project);
  if (!destination) {
    throw missingTrackedFolderError(project);
  }
  const mailbox = await getMailboxByUser(options.userId);
  if (!mailbox) {
    throw missingMailboxError(options.userId);
  }

  const threadRows = await getThreadSummariesForProject(
    mailbox.id,
    project.id,
    options.maxThreads
  );
  const mixedConversationIds = options.includeMixed
    ? new Set<string>()
    : await getMixedConversationIds(mailbox.id, threadRows);
  const orphanCount = await getOrphanEmailCountForProject(
    mailbox.id,
    project.id
  );

  const client = getAppClient();
  const movePlan = await buildHydrateMovePlan(
    options.userId,
    destination.folderId,
    options.limit,
    threadRows,
    mixedConversationIds,
    client.getEmailThread.bind(client)
  );

  const projectContext = {
    projectId: project.id,
    projectName: project.name,
    destinationFolderId: destination.folderId,
    destinationFolderName: destination.displayName,
  };

  if (options.quiet) {
    printHydrateProjectCompactSummary(
      projectContext,
      movePlan.toMove.length,
      movePlan.messagesAlreadyInFolder,
      movePlan.threadsSkippedMixed
    );
    if (!options.apply) {
      return makeDryRunStats(
        destination,
        project,
        threadRows.length,
        movePlan.threadsSkippedMixed,
        movePlan.messagesAlreadyInFolder,
        movePlan.toMove.length,
        orphanCount
      );
    }
  } else {
    await printHydrateProjectVerboseSummary(projectContext, options, movePlan, {
      maxThreads: options.maxThreads,
      orphanCount,
      threadRowsLength: threadRows.length,
    });
    if (!options.apply) {
      console.log(
        "\n[DRY RUN] No messages moved. Re-run with --apply to execute."
      );
      return makeDryRunStats(
        destination,
        project,
        threadRows.length,
        movePlan.threadsSkippedMixed,
        movePlan.messagesAlreadyInFolder,
        movePlan.toMove.length,
        orphanCount
      );
    }
  }

  if (movePlan.toMove.length === 0) {
    return makeDryRunStats(
      destination,
      project,
      threadRows.length,
      movePlan.threadsSkippedMixed,
      movePlan.messagesAlreadyInFolder,
      movePlan.toMove.length,
      orphanCount
    );
  }

  const moveResult = await executeHydrateProjectMoves({
    concurrency: options.concurrency,
    destinationFolderId: destination.folderId,
    mailboxId: mailbox.id,
    moveEmail: (messageId, destinationFolderId, userId) =>
      client.moveEmail(messageId, destinationFolderId, userId),
    skipDbUpdate: options.skipDbUpdate,
    toMove: movePlan.toMove,
    userId: options.userId,
  });

  printHydrateProjectCompletion(
    !options.quiet,
    moveResult.moved,
    moveResult.moveErrors,
    moveResult.dbUpdated,
    moveResult.dbSkipped,
    moveResult.dbErrors,
    options.skipDbUpdate
  );

  return {
    ...makeDryRunStats(
      destination,
      project,
      threadRows.length,
      movePlan.threadsSkippedMixed,
      movePlan.messagesAlreadyInFolder,
      movePlan.toMove.length,
      orphanCount
    ),
    moved: moveResult.moved,
    moveErrors: moveResult.moveErrors,
    dbUpdated: moveResult.dbUpdated,
    dbSkipped: moveResult.dbSkipped,
    dbErrors: moveResult.dbErrors,
  };
}
