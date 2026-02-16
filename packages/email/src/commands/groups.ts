/**
 * M365 group commands: groups, group-conversations, group-conversation,
 * search-group, ic, ic-download, internal-contracts.
 */
import { parseArgs } from "node:util";
import {
  getGroupsClient,
  KNOWN_GROUPS,
  resolveGroupId,
} from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";

async function groupsCommand() {
  const client = getGroupsClient();
  const groups = await client.listGroups();

  if (groups.length === 0) {
    console.log("No groups found.");
    return;
  }

  console.log(`${groups.length} M365 groups:\n`);
  for (const group of groups) {
    console.log(`- ${group.displayName}`);
    console.log(`  ID: ${group.id}\n`);
  }
}

async function groupConversationsCommand(
  groupId: string,
  limit: number,
  since?: Date
) {
  const client = getGroupsClient();
  const conversations = await client.getGroupConversations(groupId, {
    since,
    top: limit,
  });

  if (conversations.length === 0) {
    console.log("No conversations found.");
    return;
  }

  console.log(`${conversations.length} conversations:\n`);
  for (const conv of conversations) {
    console.log(`- ${conv.topic}`);
    console.log(`  Last: ${conv.lastDeliveredDateTime}`);
    console.log(`  ID: ${conv.id}\n`);
  }
}

async function groupConversationCommand(
  groupId: string,
  conversationId: string,
  includeAttachments: boolean
) {
  const client = getGroupsClient();
  const conversation = await client.getFullConversation(
    groupId,
    conversationId,
    includeAttachments
  );

  console.log(`Topic: ${conversation.topic}`);
  console.log(`Last Updated: ${conversation.lastDeliveredDateTime}`);
  console.log(`Has Attachments: ${conversation.hasAttachments}`);
  console.log(`\n${"=".repeat(60)}\n`);

  for (const thread of conversation.threads) {
    console.log(`Thread: ${thread.topic || "(no topic)"}`);
    console.log("-".repeat(40));
    for (const post of thread.posts) {
      console.log(
        `From: ${post.from.name || post.from.address} (${post.receivedDateTime})`
      );
      console.log(post.bodyContent);
      if (post.attachments && post.attachments.length > 0) {
        console.log("\nAttachments:");
        for (const att of post.attachments) {
          console.log(
            `  - ${att.name} (${att.contentType}, ${att.size} bytes)`
          );
        }
      }
      console.log();
    }
  }
}

async function searchGroupCommand(
  groupId: string,
  query: string,
  limit: number
) {
  const client = getGroupsClient();
  const conversations = await client.getGroupConversations(groupId, {
    top: limit,
  });

  const queryLower = query.toLowerCase();
  const matches = conversations.filter((c) =>
    c.topic.toLowerCase().includes(queryLower)
  );

  if (matches.length === 0) {
    console.log(`No conversations found matching "${query}".`);
    return;
  }

  console.log(`${matches.length} conversations matching "${query}":\n`);
  for (const conv of matches) {
    console.log(`- ${conv.topic}`);
    console.log(`  Last: ${conv.lastDeliveredDateTime}`);
    console.log(`  ID: ${conv.id}\n`);
  }
}

async function downloadGroupPdfs(
  groupId: string,
  outDir: string,
  options: { since?: Date; limit?: number }
) {
  const { existsSync, mkdirSync } = await import("node:fs");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const client = getGroupsClient();
  await client.downloadAllConversations(groupId, outDir, {
    includeAttachments: true,
    maxConversations: options.limit ?? 100,
    since: options.since,
  });
}

export const groupHandlers: Record<string, CommandHandler> = {
  "group-conversation": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        attachments: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    const conversationId = positionals[1];
    if (!(groupIdOrName && conversationId)) {
      console.error(
        "Error: Group ID/name and Conversation ID required. Usage: group-conversation <groupId|name> <conversationId>"
      );
      process.exit(1);
    }
    await groupConversationCommand(
      resolveGroupId(groupIdOrName),
      conversationId,
      values.attachments ?? false
    );
  },

  "group-conversations": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "50" },
        since: { type: "string" },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    if (!groupIdOrName) {
      console.error(
        "Error: Group ID or name required. Usage: group-conversations <groupId|name>"
      );
      console.error(`Known groups: ${Object.keys(KNOWN_GROUPS).join(", ")}`);
      process.exit(1);
    }
    await groupConversationsCommand(
      resolveGroupId(groupIdOrName),
      Number.parseInt(values.limit as string, 10),
      values.since ? new Date(values.since) : undefined
    );
  },

  "group-download": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        out: { type: "string", short: "o", default: "." },
        since: { type: "string" },
        limit: { type: "string", short: "l", default: "100" },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    if (!groupIdOrName) {
      console.error(
        "Error: Group ID or name required. Usage: group-download <groupId|name> --out <dir>"
      );
      console.error(`Known groups: ${Object.keys(KNOWN_GROUPS).join(", ")}`);
      process.exit(1);
    }
    const since = values.since ? new Date(values.since) : undefined;
    await downloadGroupPdfs(
      resolveGroupId(groupIdOrName),
      values.out as string,
      { since, limit: Number.parseInt(values.limit as string, 10) }
    );
  },

  groups: async (_args) => {
    await groupsCommand();
  },

  ic: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    const limit = Number.parseInt(values.limit as string, 10);
    if (query) {
      await searchGroupCommand(
        KNOWN_GROUPS["internal-contracts"],
        query,
        limit
      );
    } else {
      await groupConversationsCommand(
        KNOWN_GROUPS["internal-contracts"],
        limit
      );
    }
  },

  "ic-download": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        out: {
          type: "string",
          short: "o",
          default: "packages/contracts/ground-truth/_contract-samples",
        },
        since: { type: "string" },
        limit: { type: "string", short: "l", default: "100" },
      },
      allowPositionals: false,
    });
    const since = values.since ? new Date(values.since) : undefined;
    console.log(`Downloading IC PDFs to ${values.out}/pdfs/`);
    await downloadGroupPdfs(
      KNOWN_GROUPS["internal-contracts"],
      values.out as string,
      { since, limit: Number.parseInt(values.limit as string, 10) }
    );
  },

  "internal-contracts": async (args) => {
    await groupHandlers.ic(args);
  },

  "search-group": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "50" },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    const query = positionals[1];
    if (!(groupIdOrName && query)) {
      console.error(
        "Error: Group ID/name and query required. Usage: search-group <groupId|name> <query>"
      );
      console.error(`Known groups: ${Object.keys(KNOWN_GROUPS).join(", ")}`);
      process.exit(1);
    }
    await searchGroupCommand(
      resolveGroupId(groupIdOrName),
      query,
      Number.parseInt(values.limit as string, 10)
    );
  },
};
