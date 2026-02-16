import { assertWritableMailbox, getAppClient } from "@email/commands/config";
import { getMailboxByUser, updateEmailMessageIdInDb } from "./repository";
import {
  createFolderLabeler,
  formatDate,
  WELL_KNOWN_MOVE_DESTS,
} from "./shared";

interface MoveMessageOptions {
  messageId: string;
  destinationId: string;
  userId: string;
  apply: boolean;
  skipDbUpdate: boolean;
}

interface MoveThreadOptions {
  messageId: string;
  destinationId: string;
  userId: string;
  apply: boolean;
  maxDepth: number;
  showPaths: boolean;
  limit: number;
  skipDbUpdate: boolean;
}

interface MoveMessagePayload {
  id: string;
  fromEmail: string;
  internetMessageId?: string;
  subject: string;
  receivedDateTime: Date;
  parentFolderId?: string;
}

function isWellKnownDestination(destinationId: string): boolean {
  return WELL_KNOWN_MOVE_DESTS.has(destinationId.toLowerCase());
}

async function resolveMovePlan(
  threadId: string,
  destinationId: string,
  userId: string,
  limit: number
): Promise<{
  thread: MoveMessagePayload[];
  toMove: MoveMessagePayload[];
}> {
  const client = getAppClient();
  const thread = await client.getThreadByMessageId(threadId, userId);
  const toMove = thread
    .filter((message) => message.parentFolderId !== destinationId)
    .slice(0, limit > 0 ? limit : undefined);

  return { thread, toMove };
}

async function printThreadMovePlan(
  options: MoveThreadOptions,
  thread: MoveMessagePayload[],
  toMove: MoveMessagePayload[]
): Promise<void> {
  const folderLabeler = createFolderLabeler({
    maxDepth: options.maxDepth,
    paths: options.showPaths,
    userId: options.userId,
  });
  const sourceFolderIds = toMove
    .map((message) => message.parentFolderId)
    .filter((id): id is string => Boolean(id));
  for (const messageId of [...new Set(sourceFolderIds)]) {
    if (messageId) {
      await folderLabeler.label(messageId);
    }
  }
  const destinationLabel = await folderLabeler.label(options.destinationId);

  console.log(
    `Thread: ${thread.length} message(s), moving ${toMove.length} message(s) to folder ${destinationLabel} (${options.destinationId})`
  );
  for (const message of toMove) {
    const fromPath = message.parentFolderId
      ? await folderLabeler.label(message.parentFolderId)
      : "(unknown)";
    console.log(
      `- [${formatDate(message.receivedDateTime)}] ${message.subject} (from: ${message.fromEmail})`
    );
    console.log(`  from: ${fromPath}`);
    console.log(`  id: ${message.id}\n`);
  }
}

async function runThreadMove(
  options: MoveThreadOptions,
  messages: MoveMessagePayload[],
  destinationId: string,
  mailboxId: number | null
): Promise<{
  moved: number;
  dbUpdated: number;
  dbSkipped: number;
  dbErrors: number;
}> {
  let moved = 0;
  let dbUpdated = 0;
  let dbSkipped = 0;
  let dbErrors = 0;

  const client = getAppClient();
  for (const message of messages) {
    try {
      const movedMsg = await client.moveEmail(
        message.id,
        destinationId,
        options.userId
      );
      moved++;

      if (!mailboxId) {
        continue;
      }

      const upd = await updateEmailMessageIdInDb({
        internetMessageId: message.internetMessageId,
        mailboxId,
        newMessageId: movedMsg.id,
        oldMessageId: message.id,
      });
      if (!upd.ok) {
        dbErrors++;
      } else if (upd.updatedRows > 0) {
        dbUpdated += upd.updatedRows;
      } else {
        dbSkipped++;
      }
    } catch (error) {
      console.error(
        `[ERROR] Failed to move message ${message.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { moved, dbUpdated, dbSkipped, dbErrors };
}

export async function moveMessageCommand(
  options: MoveMessageOptions
): Promise<void> {
  assertWritableMailbox(options.userId, "move");

  if (!options.apply) {
    console.log(
      `[DRY RUN] Would move message ${options.messageId} -> ${options.destinationId} (mailbox: ${options.userId})`
    );
    return;
  }

  const client = getAppClient();
  const moved = await client.moveEmail(
    options.messageId,
    options.destinationId,
    options.userId
  );
  console.log(`Moved. New message ID: ${moved.id}`);

  if (options.skipDbUpdate) {
    return;
  }

  const mailbox = await getMailboxByUser(options.userId);
  if (!mailbox) {
    console.warn(
      `[WARN] Mailbox "${options.userId}" not found in Supabase Postgres; skipping DB message_id update.`
    );
    return;
  }

  const upd = await updateEmailMessageIdInDb({
    internetMessageId: moved.internetMessageId,
    mailboxId: mailbox.id,
    newMessageId: moved.id,
    oldMessageId: options.messageId,
  });

  if (!upd.ok) {
    console.warn(`[WARN] DB update failed: ${upd.error}`);
    return;
  }
  if (upd.updatedRows > 0) {
    console.log(`DB updated: ${upd.updatedRows} row(s) (${upd.method})`);
  }
}

export async function moveThreadCommand(
  options: MoveThreadOptions
): Promise<void> {
  assertWritableMailbox(options.userId, "move-thread");

  if (isWellKnownDestination(options.destinationId)) {
    throw new Error(
      "move-thread requires a folder ID destination. " +
        "For well-known folders, move individual messages (move ...) or resolve the folder ID first via folders --recursive."
    );
  }

  const { thread, toMove } = await resolveMovePlan(
    options.messageId,
    options.destinationId,
    options.userId,
    options.limit
  );
  if (thread.length === 0) {
    console.log("Thread not found.");
    return;
  }

  await printThreadMovePlan(options, thread, toMove);

  if (!options.apply) {
    console.log("[DRY RUN] No messages moved. Re-run with --apply to execute.");
    return;
  }

  if (toMove.length === 0) {
    console.log("Done.");
    return;
  }

  const mailbox = options.skipDbUpdate
    ? null
    : await getMailboxByUser(options.userId);
  const mailboxId = mailbox?.id ?? null;
  if (!(options.skipDbUpdate || mailbox)) {
    console.warn(
      `[WARN] Mailbox "${options.userId}" not found in Supabase Postgres; skipping DB message_id updates.`
    );
  }

  const moveResult = await runThreadMove(
    options,
    toMove,
    options.destinationId,
    mailboxId
  );

  console.log(`Done. Moved ${moveResult.moved} message(s).`);
  if (mailboxId) {
    console.log(`DB message_id updates: ${moveResult.dbUpdated}`);
    console.log(`DB updates skipped: ${moveResult.dbSkipped}`);
    if (moveResult.dbErrors > 0) {
      console.log(`DB update errors: ${moveResult.dbErrors}`);
    }
  }
}
