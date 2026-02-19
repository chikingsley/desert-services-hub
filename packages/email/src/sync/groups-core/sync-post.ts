import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { GraphGroupsClient } from "@email/groups";
import { htmlToText } from "@email/html-to-text";
import type { GroupPost, GroupThread } from "@email/types";
import { db } from "@lib/db/client";
import { insertAttachment } from "@lib/db/repositories/attachment";
import { insertEmail } from "@lib/db/repositories/email";
import {
  getOrCreateMailbox,
  updateMailboxSyncState,
} from "@lib/db/repositories/mailbox";
import type { InsertAttachmentData, InsertEmailData } from "@lib/db/types";
import { linkEmail } from "@lib/linking/link-email";

const ATTACHMENTS_DIR = join(
  import.meta.dir,
  "../../../../..",
  "data",
  "attachments"
);

const enqueueIntake = db.query<{ id: number | null }>(
  "SELECT public.enqueue_background_job('intake', ($1::text)::jsonb, NULL, 3, FALSE)::bigint AS id"
);
const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";

export interface SyncConversationPostResult {
  insertedEmails: number;
  insertedAttachments: number;
  downloadedFiles: number;
}

interface SyncConversationPostInput {
  client: GraphGroupsClient;
  thread: GroupThread;
  post: GroupPost;
  conversationId: string;
  conversationTopic: string;
  groupId: string;
  groupEmail: string;
  groupDirName: string;
  mailboxId: number;
  downloadAttachments: boolean;
}

function sanitizeAttachmentName(name: string): string {
  return name.replaceAll(/[/\\:*?"<>|]/g, "_").slice(0, 200);
}

function getAttachmentPath(
  emailId: number,
  groupDirName: string,
  name: string
): string {
  return join(
    ATTACHMENTS_DIR,
    groupDirName,
    String(emailId),
    sanitizeAttachmentName(name)
  );
}

export function createGroupMailbox(
  mailboxEmail: string
): Promise<Awaited<ReturnType<typeof getOrCreateMailbox>>> {
  return getOrCreateMailbox(mailboxEmail);
}

export async function setMailboxSyncState(
  mailboxId: number,
  syncedPosts: number
): Promise<void> {
  await updateMailboxSyncState(mailboxId, syncedPosts);
}

export async function syncConversationPost(
  input: SyncConversationPostInput
): Promise<SyncConversationPostResult> {
  const {
    client,
    thread,
    post,
    conversationId,
    conversationTopic,
    groupId,
    groupEmail,
    groupDirName,
    mailboxId,
    downloadAttachments,
  } = input;

  let fullText = post.bodyContent;
  if (post.bodyType === "html") {
    fullText = await htmlToText(post.bodyContent);
  }

  const emailId = await createEmail({
    attachments: post.attachments,
    body: fullText,
    bodyHtml: post.bodyType === "html" ? post.bodyContent : undefined,
    bodyPreview: fullText.substring(0, 500),
    conversationId,
    conversationTopic,
    fromAddress: post.from.address,
    fromName: post.from.name,
    hasAttachments: post.hasAttachments,
    mailboxId,
    messageId: post.id,
    receivedAt: post.receivedDateTime,
  });

  await linkEmail(emailId);

  const pdfPaths: string[] = [];
  let downloadedFiles = 0;
  let insertedAttachments = 0;
  const attachments = post.attachments ?? [];

  for (const attachment of attachments) {
    let storagePath: string | null = null;
    if (downloadAttachments) {
      const path = await storeAttachment({
        client,
        groupId,
        thread,
        post,
        attachment,
        groupDirName,
        emailId,
      });
      if (path) {
        storagePath = path;
        downloadedFiles += 1;
        if (attachment.name.toLowerCase().endsWith(".pdf")) {
          pdfPaths.push(path);
        }
      }
    }

    await insertAttachment(
      createAttachmentData(attachment, emailId, storagePath)
    );
    insertedAttachments += 1;
  }

  if (groupEmail === IC_GROUP_EMAIL && pdfPaths.length > 0) {
    await enqueueIntake.get(
      JSON.stringify({
        attachmentPaths: pdfPaths,
        bodyText: fullText,
        forwarderEmail: groupEmail,
        originalFrom: post.from.address ?? "",
        originalSubject: conversationTopic || "(no subject)",
      })
    );
  }

  return { downloadedFiles, insertedAttachments, insertedEmails: 1 };
}

// Conversation→project linking is now handled by linkEmail() from @lib/linking/link-email

function createAttachmentData(
  attachment: {
    id: string;
    contentType: string;
    name: string;
    size: number;
  },
  emailId: number,
  storagePath: string | null
): InsertAttachmentData {
  return {
    attachmentId: attachment.id,
    contentType: attachment.contentType,
    emailId,
    name: attachment.name,
    size: attachment.size,
    storageBucket: null,
    storagePath,
  };
}

async function storeAttachment({
  client,
  groupId,
  thread,
  post,
  attachment,
  groupDirName,
  emailId,
}: {
  client: GraphGroupsClient;
  groupId: string;
  thread: GroupThread;
  post: GroupPost;
  attachment: { id: string; name: string };
  groupDirName: string;
  emailId: number;
}): Promise<string | null> {
  let storagePath: string | null = null;
  try {
    const downloaded = await client.downloadAttachment(
      groupId,
      thread.id,
      post.id,
      attachment.id
    );
    if (!downloaded.contentBytes) {
      return null;
    }

    const storageDir = join(ATTACHMENTS_DIR, groupDirName, String(emailId));
    await mkdir(storageDir, { recursive: true });
    const filePath = getAttachmentPath(emailId, groupDirName, attachment.name);
    await Bun.write(filePath, Buffer.from(downloaded.contentBytes, "base64"));
    storagePath = filePath;
  } catch {
    // Ignore download failures; attachment metadata is still stored.
  }

  return storagePath;
}

function createEmail(input: {
  attachments?: Array<{ id: string; name: string } | undefined>;
  body: string;
  bodyHtml?: string;
  bodyPreview: string;
  conversationId: string;
  conversationTopic: string;
  fromAddress?: string | null;
  fromName?: string;
  hasAttachments?: boolean;
  mailboxId: number;
  messageId: string;
  receivedAt: string;
}): Promise<number> {
  const attachmentNames = input.attachments
    ? input.attachments.map((attachment) => attachment?.name ?? "(unnamed)")
    : [];
  const email: InsertEmailData = {
    attachmentNames,
    bodyFull: input.body,
    bodyHtml: input.bodyHtml,
    bodyPreview: input.bodyPreview,
    categories: [],
    conversationId: input.conversationId,
    fromEmail: input.fromAddress,
    fromName: input.fromName,
    hasAttachments: input.hasAttachments,
    mailboxId: input.mailboxId,
    messageId: input.messageId,
    receivedAt: input.receivedAt,
    subject: input.conversationTopic,
  };
  return insertEmail(email);
}
