import type {
  HydrateProjectOptions,
  HydrateProjectStats,
} from "../types";
import { createFolderLabeler, formatDate } from "../shared";
import type { HydrateProjectPlan } from "./types";

interface ProjectSummaryContext {
  projectId: number;
  projectName: string;
  destinationFolderId: string;
  destinationFolderName: string;
}

interface VerboseSummaryContext {
  threadRowsLength: number;
  maxThreads: number;
  orphanCount: number;
}

export function buildDryRunStats(
  destination: { folderId: string; displayName: string },
  projectId: number,
  projectName: string,
  threadRowsLength: number,
  threadsSkippedMixed: number,
  messagesAlreadyInFolder: number,
  toMoveCount: number,
  orphanCount: number
): HydrateProjectStats {
  return {
    dbErrors: 0,
    dbSkipped: 0,
    dbUpdated: 0,
    destinationFolderId: destination.folderId,
    destinationFolderName: destination.displayName,
    messagesAlreadyInFolder,
    messagesToMove: toMoveCount,
    moveErrors: 0,
    moved: 0,
    orphanCount,
    projectId,
    projectName,
    threadsConsidered: threadRowsLength,
    threadsSkippedMixed,
  };
}

export async function printHydrateProjectVerboseSummary(
  project: ProjectSummaryContext,
  options: HydrateProjectOptions,
  plan: HydrateProjectPlan,
  details: VerboseSummaryContext
): Promise<void> {
  const byFolderId = new Map<string, number>();
  for (const message of plan.toMove) {
    const key = message.parentFolderId ?? "(unknown)";
    byFolderId.set(key, (byFolderId.get(key) ?? 0) + 1);
  }

  const folderIds = [...byFolderId.keys()].filter((id) => id !== "(unknown)");
  const folderLabeler = createFolderLabeler({
    maxDepth: options.maxDepth,
    paths: options.showPaths,
    userId: options.userId,
  });
  const resolved = await Promise.all(
    folderIds.map(async (id) => [id, await folderLabeler.label(id)] as const)
  );
  const folderIdToLabel = new Map<string, string>(resolved);

  console.log(`Project #${project.projectId}: ${project.projectName}`);
  console.log(`Mailbox: ${options.userId}`);
  console.log(`Destination folder: ${project.destinationFolderName}`);
  console.log(`Destination folderId: ${project.destinationFolderId}`);
  console.log(
    `Threads considered: ${details.threadRowsLength} (maxThreads=${details.maxThreads})`
  );
  if (!options.includeMixed) {
    console.log(
      `Threads skipped (mixed projects): ${plan.threadsSkippedMixed}`
    );
  }
  console.log(
    `Messages already in destination: ${plan.messagesAlreadyInFolder}`
  );
  console.log(
    `Messages to move: ${plan.toMove.length}${options.limit > 0 ? ` (limit=${options.limit})` : ""}`
  );
  if (details.orphanCount > 0) {
    console.log(
      `Orphan emails in DB (no conversationId): ${details.orphanCount} (not moved)`
    );
  }

  if (plan.toMove.length === 0) {
    return;
  }

  console.log("\nBreakdown by current folder:");
  for (const [folderId, count] of [...byFolderId.entries()].toSorted(
    (a, b) => b[1] - a[1]
  )) {
    const label =
      folderId === "(unknown)"
        ? "(unknown)"
        : (folderIdToLabel.get(folderId) ?? folderId);
    console.log(`- ${count}  ${label}`);
  }

  console.log("\nSample (first 15 to move):");
  for (const message of plan.toMove.slice(0, 15)) {
    const fromPath = message.parentFolderId
      ? (folderIdToLabel.get(message.parentFolderId) ??
        (await folderLabeler.label(message.parentFolderId)))
      : "(unknown)";
    console.log(
      `- [${formatDate(message.receivedDateTime)}] ${message.subject} (from: ${message.fromEmail})`
    );
    console.log(`  from: ${fromPath}`);
    console.log(`  id: ${message.id}\n`);
  }

  if (plan.toMove.length > 15) {
    console.log(`... and ${plan.toMove.length - 15} more`);
  }
}

export function printHydrateProjectCompactSummary(
  project: ProjectSummaryContext,
  messagesToMove: number,
  messagesAlreadyInFolder: number,
  threadsSkippedMixed: number
): void {
  console.log(
    `#${project.projectId} ${project.projectName} -> ${project.destinationFolderName}: toMove=${messagesToMove} already=${messagesAlreadyInFolder}${threadsSkippedMixed > 0 ? ` mixedThreadsSkipped=${threadsSkippedMixed}` : ""}`
  );
}

export function printHydrateProjectCompletion(
  verbose: boolean,
  moved: number,
  moveErrors: number,
  dbUpdated: number,
  dbSkipped: number,
  dbErrors: number,
  skipDbUpdate: boolean
): void {
  console.log(
    verbose
      ? "\nDone."
      : `  moved=${moved}${moveErrors > 0 ? ` moveErrors=${moveErrors}` : ""}`
  );
  if (!verbose) {
    return;
  }

  if (skipDbUpdate) {
    return;
  }

  console.log(`DB message_id updates: ${dbUpdated}`);
  console.log(`DB updates skipped: ${dbSkipped}`);
  if (moveErrors > 0) {
    console.log(`Move errors: ${moveErrors}`);
  }
  if (dbErrors > 0) {
    console.log(`DB update errors: ${dbErrors}`);
  }
}
