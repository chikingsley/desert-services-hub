import { updateEmailMessageIdInDb } from "../repository";
import { mapWithConcurrency } from "../shared";

interface MoveResult {
  moved: number;
  moveErrors: number;
  dbUpdated: number;
  dbSkipped: number;
  dbErrors: number;
}

interface ExecutorOptions {
  concurrency: number;
  userId: string;
  destinationFolderId: string;
  toMove: Array<{
    id: string;
    internetMessageId?: string;
    fromEmail?: string;
    subject?: string;
    receivedDateTime?: Date;
  }>;
  mailboxId?: number;
  skipDbUpdate: boolean;
  moveEmail: (
    messageId: string,
    destinationFolderId: string,
    userId: string
  ) => Promise<{ id: string; internetMessageId?: string }>;
}

export async function executeHydrateProjectMoves(
  options: ExecutorOptions
): Promise<MoveResult> {
  let moved = 0;
  let moveErrors = 0;
  let dbUpdated = 0;
  let dbSkipped = 0;
  let dbErrors = 0;

  const mailboxId = options.skipDbUpdate ? undefined : options.mailboxId;
  const canUpdateDb = Boolean(mailboxId);
  if (!(options.skipDbUpdate || canUpdateDb)) {
    console.warn(
      `[WARN] Mailbox "${options.userId}" not found in Supabase Postgres; skipping DB message_id updates.`
    );
  }

  await mapWithConcurrency(
    options.toMove,
    options.concurrency,
    async (message) => {
      try {
        const movedMsg = await options.moveEmail(
          message.id,
          options.destinationFolderId,
          options.userId
        );
        moved++;

        if (!(canUpdateDb && mailboxId)) {
          return;
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
        moveErrors++;
        console.error(
          `[ERROR] Failed to move message ${message.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  return { moved, moveErrors, dbUpdated, dbSkipped, dbErrors };
}
