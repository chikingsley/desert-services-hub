/**
 * Email search commands: search, search-all, contracts, estimating shortcuts.
 */
import { parseArgs } from "node:util";
import {
  DEFAULT_USER,
  getAppClient,
  KNOWN_MAILBOXES,
} from "@email-cli/commands/config";
import type { CommandHandler } from "@email-cli/commands/types";

type MailFolder = "inbox" | "sentitems" | "drafts" | "deleteditems";

async function searchCommand(
  query: string,
  userId: string,
  limit: number,
  folder?: string
) {
  const client = getAppClient();
  const validFolder = folder as MailFolder | undefined;
  const emails = await client.searchEmails({
    folder: validFolder,
    limit,
    query,
    userId,
  });

  if (emails.length === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(`Found ${emails.length} emails:\n`);
  for (const email of emails) {
    const date = new Date(email.receivedDateTime).toLocaleDateString();
    console.log(`[${date}] ${email.subject}`);
    console.log(`  From: ${email.fromEmail}`);
    console.log(`  ID: ${email.id}\n`);
  }
}

async function searchAllCommand(query: string, limit: number) {
  const client = getAppClient();
  console.log("Searching all mailboxes (this may take a moment)...\n");
  const results = await client.searchAllMailboxes({ limit, query });

  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
  if (totalEmails === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(
    `Found ${totalEmails} emails across ${results.length} mailboxes:\n`
  );
  for (const result of results) {
    if (result.emails.length === 0) {
      continue;
    }
    console.log(`${result.mailbox} (${result.emails.length} emails)`);
    for (const email of result.emails) {
      console.log(`  - ${email.subject}`);
    }
    console.log();
  }
}

export const searchHandlers: Record<string, CommandHandler> = {
  contracts: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
        folder: { type: "string", short: "f" },
      },
      allowPositionals: true,
    });
    const query = positionals[0] ?? "*";
    await searchCommand(
      query,
      KNOWN_MAILBOXES.contracts,
      Number.parseInt(values.limit as string, 10),
      values.folder
    );
  },

  estimating: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
        folder: { type: "string", short: "f" },
      },
      allowPositionals: true,
    });
    const query = positionals[0] ?? "*";
    await searchCommand(
      query,
      KNOWN_MAILBOXES.estimating,
      Number.parseInt(values.limit as string, 10),
      values.folder
    );
  },

  search: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        limit: { type: "string", short: "l", default: "10" },
        folder: { type: "string", short: "f" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    if (!query) {
      console.error("Error: Query required. Usage: search <query>");
      process.exit(1);
    }
    await searchCommand(
      query,
      values.user as string,
      Number.parseInt(values.limit as string, 10),
      values.folder
    );
  },

  "search-all": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "5" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    if (!query) {
      console.error("Error: Query required. Usage: search-all <query>");
      process.exit(1);
    }
    await searchAllCommand(query, Number.parseInt(values.limit as string, 10));
  },
};
