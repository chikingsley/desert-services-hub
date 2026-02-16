/**
 * Email read commands: get, thread, download-attachments.
 */
import { parseArgs } from "node:util";
import { DEFAULT_USER, getAppClient } from "@email/commands/config";
import type { CommandHandler } from "@email/commands/types";

async function getCommand(messageId: string, userId: string) {
  const client = getAppClient();
  const email = await client.getEmail(messageId, userId);

  if (email === null) {
    console.log("Email not found.");
    return;
  }

  console.log(`Subject: ${email.subject}`);
  console.log(`From: ${email.fromName} <${email.fromEmail}>`);
  console.log(`To: ${email.toRecipients.map((r) => r.email).join(", ")}`);
  if (email.ccRecipients.length > 0) {
    console.log(`Cc: ${email.ccRecipients.map((r) => r.email).join(", ")}`);
  }
  console.log(`Date: ${new Date(email.receivedDateTime).toLocaleString()}`);
  console.log("\n--- Body ---\n");
  console.log(email.bodyContent);
}

async function threadCommand(messageId: string, userId: string) {
  const client = getAppClient();
  const thread = await client.getThreadByMessageId(messageId, userId);

  if (thread.length === 0) {
    console.log("Thread not found.");
    return;
  }

  console.log(`Thread with ${thread.length} messages:\n`);
  for (const email of thread) {
    const date = new Date(email.receivedDateTime).toLocaleString();
    console.log(`[${date}] ${email.fromEmail}`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  ID: ${email.id}\n`);
  }
}

async function downloadAttachmentsCommand(
  messageId: string,
  userId: string,
  outDir: string,
  filter?: string
) {
  const { mkdirSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const client = getAppClient();
  const attachments = await client.getAttachments(messageId, userId);

  if (attachments.length === 0) {
    console.log("No attachments found on this email.");
    return;
  }

  const filtered = filter
    ? attachments.filter(
        (a) =>
          !a.isInline && a.name.toLowerCase().includes(filter.toLowerCase())
      )
    : attachments.filter((a) => !a.isInline);

  if (filtered.length === 0) {
    console.log(
      `No attachments matching "${filter}". Available: ${attachments.map((a) => a.name).join(", ")}`
    );
    return;
  }

  console.log(`Downloading ${filtered.length} attachment(s) to ${outDir}/\n`);

  for (const att of filtered) {
    const content = await client.downloadAttachment(messageId, att.id, userId);
    const outPath = join(outDir, att.name);
    await Bun.write(outPath, content);
    console.log(
      `  ${att.name} (${(att.size / 1024).toFixed(1)} KB) -> ${outPath}`
    );
  }

  console.log("\nDone.");
}

export const readHandlers: Record<string, CommandHandler> = {
  "download-attachments": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        out: { type: "string", short: "o", default: "." },
        filter: { type: "string", short: "f" },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!messageId) {
      console.error(
        "Error: messageId required. Usage: download-attachments <messageId> --user <mailbox> --out <dir> [--filter <name>]"
      );
      process.exit(1);
    }
    await downloadAttachmentsCommand(
      messageId,
      values.user as string,
      values.out as string,
      values.filter
    );
  },

  get: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!messageId) {
      console.error("Error: messageId required. Usage: get <messageId>");
      process.exit(1);
    }
    await getCommand(messageId, values.user as string);
  },

  thread: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!messageId) {
      console.error("Error: messageId required. Usage: thread <messageId>");
      process.exit(1);
    }
    await threadCommand(messageId, values.user as string);
  },
};
