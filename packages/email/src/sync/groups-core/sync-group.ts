import { GraphGroupsClient } from "@email/groups";
import { ALL_GROUPS, MS_PER_DAY as MS_PER_DAY_MS } from "@email/sync/config";

export { MS_PER_DAY } from "@email/sync/config";

import { db } from "@lib/db/hub";
import {
  createGroupMailbox,
  setMailboxSyncState,
  syncConversationPost,
} from "./sync-post";

const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";

export interface GroupSyncProgress {
  group: string;
  phase: "starting" | "fetching" | "storing" | "complete" | "error";
  conversationsFetched?: number;
  postsStored?: number;
  attachmentsStored?: number;
  error?: string;
}

export interface GroupSyncResult {
  group: string;
  conversationsProcessed: number;
  postsStored: number;
  attachmentsStored: number;
  filesDownloaded: number;
  error?: string;
}

interface GroupTarget {
  email: string;
  id?: string;
}

interface SyncGroupOptions {
  groupId: string;
  groupEmail: string;
  since?: Date;
  downloadAttachments?: boolean;
  onProgress?: (progress: GroupSyncProgress) => void;
}

const GROUP_IDS: Record<string, string> = {
  ic: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "internal-contracts": "962f9440-9bde-4178-b538-edc7f8d3ecce",
  internalcontracts: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  ...ALL_GROUPS,
};

export function getGroupTargets(groups?: string[]): GroupTarget[] {
  return groups
    ? groups.map((groupName) => ({
        email: groupName.includes("@")
          ? groupName
          : `${groupName}@desertservices.net`,
        id: GROUP_IDS[groupName.toLowerCase()] ?? GROUP_IDS[groupName],
      }))
    : Object.entries(ALL_GROUPS).map(([email, id]) => ({ email, id }));
}

export function createGroupsClient(): GraphGroupsClient {
  const tenantId = process.env.AZURE_TENANT_ID ?? "";
  const clientId = process.env.AZURE_CLIENT_ID ?? "";
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error("Missing Azure credentials in environment variables");
  }

  return new GraphGroupsClient(tenantId, clientId, clientSecret);
}

export async function syncGroup(
  client: GraphGroupsClient,
  options: SyncGroupOptions
): Promise<GroupSyncResult> {
  const {
    groupId,
    groupEmail,
    since,
    downloadAttachments = true,
    onProgress,
  } = options;
  const reportProgress = (progress: GroupSyncProgress) => {
    onProgress?.(progress);
  };

  const keepAlive = setInterval(async () => {
    try {
      await db.run("SELECT 1");
    } catch {
      // ignore keepalive failures
    }
  }, 30_000);

  try {
    reportProgress({ group: groupEmail, phase: "starting" });
    const mailbox = await createGroupMailbox(groupEmail);
    reportProgress({ group: groupEmail, phase: "fetching" });

    const conversations = await client.getGroupConversations(groupId, {
      since,
    });
    reportProgress({
      group: groupEmail,
      phase: "storing",
      conversationsFetched: conversations.length,
    });

    let postsStored = 0;
    let attachmentsStored = 0;
    let filesDownloaded = 0;
    const groupDirName = groupEmail.split("@")[0];

    for (const conv of conversations) {
      const fullConv = await client.getFullConversation(groupId, conv.id, true);

      for (const thread of fullConv.threads) {
        for (const post of thread.posts) {
          const result = await syncConversationPost({
            client,
            conversationId: conv.id,
            conversationTopic: conv.topic,
            downloadAttachments,
            groupDirName,
            groupEmail,
            groupId,
            mailboxId: mailbox.id,
            post,
            thread,
          });

          postsStored += result.insertedEmails;
          attachmentsStored += result.insertedAttachments;
          filesDownloaded += result.downloadedFiles;

          if (postsStored % 50 === 0) {
            reportProgress({
              group: groupEmail,
              phase: "storing",
              attachmentsStored,
              conversationsFetched: conversations.length,
              postsStored,
            });
          }
        }
      }
    }

    clearInterval(keepAlive);
    await setMailboxSyncState(mailbox.id, postsStored);
    reportProgress({
      group: groupEmail,
      phase: "complete",
      conversationsFetched: conversations.length,
      postsStored,
      attachmentsStored,
    });

    return {
      attachmentsStored,
      conversationsProcessed: conversations.length,
      filesDownloaded,
      group: groupEmail,
      postsStored,
    };
  } catch (error) {
    clearInterval(keepAlive);
    const errorMessage = error instanceof Error ? error.message : String(error);
    reportProgress({
      error: errorMessage,
      group: groupEmail,
      phase: "error",
    });

    return {
      attachmentsStored: 0,
      conversationsProcessed: 0,
      error: errorMessage,
      filesDownloaded: 0,
      group: groupEmail,
      postsStored: 0,
    };
  }
}

export async function syncAllGroups(options: {
  since?: Date;
  groups?: string[];
  downloadAttachments?: boolean;
  onProgress?: (progress: GroupSyncProgress) => void;
}): Promise<GroupSyncResult[]> {
  const {
    since = new Date(Date.now() - 365 * MS_PER_DAY_MS),
    groups,
    downloadAttachments = true,
    onProgress,
  } = options;

  const client = createGroupsClient();
  const results: GroupSyncResult[] = [];

  const groupTargets = getGroupTargets(groups);
  for (const { email, id } of groupTargets) {
    if (!id) {
      console.error(`Unknown group: ${email}`);
      continue;
    }

    const result = await syncGroup(client, {
      downloadAttachments,
      groupEmail: email,
      groupId: id,
      onProgress,
      since,
    });
    results.push(result);
  }

  return results;
}

export { IC_GROUP_EMAIL };
