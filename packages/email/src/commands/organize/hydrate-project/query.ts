import { db } from "@lib/db/client";
import type {
  HydrateProjectMoveMessage,
  HydrateProjectPlan,
  ThreadSummaryRow,
} from "./types";

type FetchThreadFn = (
  conversationId: string,
  userId: string
) => Promise<
  {
    id: string;
    internetMessageId?: string;
    subject: string;
    fromEmail: string;
    receivedDateTime: Date;
    parentFolderId?: string;
  }[]
>;

export function getThreadSummariesForProject(
  mailboxId: number,
  projectId: number,
  maxThreads: number
): Promise<ThreadSummaryRow[]> {
  return db
    .query<ThreadSummaryRow, [number, number, number]>(
      `SELECT conversation_id,
              MAX(received_at) AS last_received_at,
              COUNT(*)::int AS email_count
       FROM emails
       WHERE mailbox_id = $1
         AND project_id = $2
         AND conversation_id IS NOT NULL
       GROUP BY conversation_id
       ORDER BY last_received_at DESC NULLS LAST
       LIMIT $3`
    )
    .all(mailboxId, projectId, maxThreads);
}

export async function getMixedConversationIds(
  mailboxId: number,
  threadRows: ThreadSummaryRow[]
): Promise<Set<string>> {
  const mixedConversationIds = new Set<string>();
  const conversationIds = threadRows
    .map((thread) => thread.conversation_id)
    .filter((id): id is string => Boolean(id));

  if (conversationIds.length === 0) {
    return mixedConversationIds;
  }

  const placeholders = conversationIds.map(() => "?").join(", ");
  const mixedRows = await db
    .query<{ conversation_id: string }>(
      `SELECT conversation_id
       FROM emails
       WHERE mailbox_id = $1
         AND conversation_id IN (${placeholders})
       GROUP BY conversation_id
       HAVING COUNT(DISTINCT project_id) > 1`
    )
    .all(mailboxId, ...conversationIds);

  for (const row of mixedRows) {
    mixedConversationIds.add(row.conversation_id);
  }

  return mixedConversationIds;
}

export async function getOrphanEmailCountForProject(
  mailboxId: number,
  projectId: number
): Promise<number> {
  const orphanRow = await db
    .query<{ count: number }, [number, number]>(
      "SELECT COUNT(*)::int AS count FROM emails WHERE mailbox_id = $1 AND project_id = $2 AND conversation_id IS NULL"
    )
    .get(mailboxId, projectId);

  return orphanRow?.count ?? 0;
}

export async function buildHydrateMovePlan(
  userId: string,
  destinationFolderId: string,
  limit: number,
  threadRows: ThreadSummaryRow[],
  mixedConversationIds: Set<string>,
  getThread: FetchThreadFn
): Promise<HydrateProjectPlan> {
  const toMove: HydrateProjectMoveMessage[] = [];
  let messagesAlreadyInFolder = 0;
  let threadsSkippedMixed = 0;

  for (const thread of threadRows) {
    if (!thread.conversation_id) {
      continue;
    }

    if (mixedConversationIds.has(thread.conversation_id)) {
      threadsSkippedMixed++;
      continue;
    }

    const threadMessages = await getThread(thread.conversation_id, userId);
    for (const message of threadMessages) {
      if (message.parentFolderId === destinationFolderId) {
        messagesAlreadyInFolder++;
        continue;
      }

      toMove.push({
        fromEmail: message.fromEmail,
        id: message.id,
        internetMessageId: message.internetMessageId,
        parentFolderId: message.parentFolderId,
        receivedDateTime: message.receivedDateTime,
        subject: message.subject,
      });

      if (limit > 0 && toMove.length >= limit) {
        break;
      }
    }

    if (limit > 0 && toMove.length >= limit) {
      break;
    }
  }

  return {
    messagesAlreadyInFolder,
    threadsSkippedMixed,
    toMove,
  };
}
