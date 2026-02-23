/**
 * Email Sync — Trigger.dev event-driven task
 *
 * Replaces the pgmq `email_notification` job. Triggered by Outlook webhooks
 * when a new email arrives. Fetches the email from Graph API, stores it in
 * Postgres, then fetches thread siblings we haven't seen yet.
 *
 * Downstream effects are handled by Postgres cascade triggers:
 *   - trg_email_project_changed → propagates project_id to conversation siblings
 *   - trg_estimate_email_linked → cascades estimate↔email links
 *   - trg_project_estimate_linked → cascades project↔estimate links
 */

import { insertEmail } from "@lib/db/repositories/email";
import { getOrCreateMailbox } from "@lib/db/repositories/mailbox";
import type { InsertEmailData } from "@lib/db/types";
import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";

// ── Graph API constants ─────────────────────────────────────────

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";

const EMAIL_DETAIL_FIELDS = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "bodyPreview",
  "body",
  "hasAttachments",
  "internetMessageHeaders",
  "webLink",
].join(",");

const EMAIL_LIST_FIELDS = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "bodyPreview",
  "body",
  "hasAttachments",
  "internetMessageHeaders",
  "webLink",
].join(",");

// ── Graph API types ─────────────────────────────────────────────

interface GraphEmailAddress {
  address: string;
  name: string;
}

interface GraphRecipient {
  emailAddress: GraphEmailAddress;
}

interface GraphEmailBody {
  content: string;
  contentType: "html" | "text";
}

interface GraphInternetHeader {
  name: string;
  value: string;
}

interface GraphEmail {
  body?: GraphEmailBody;
  bodyPreview?: string;
  ccRecipients?: GraphRecipient[];
  conversationId?: string;
  from?: { emailAddress: GraphEmailAddress };
  hasAttachments?: boolean;
  id: string;
  internetMessageHeaders?: GraphInternetHeader[];
  receivedDateTime: string;
  subject: string;
  toRecipients?: GraphRecipient[];
  webLink?: string;
}

interface GraphListResponse {
  "@odata.nextLink"?: string;
  value: GraphEmail[];
}

// ── Graph API helpers ───────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error(
      "Missing Azure credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)"
    );
  }

  const url = TOKEN_URL_TEMPLATE.replace("{tenantId}", tenantId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };

  return cachedToken.accessToken;
}

async function graphGet<T>(path: string): Promise<T> {
  const token = await getGraphToken();
  const url = path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

// ── Conversion helpers ──────────────────────────────────────────

const HTML_TAG_RE = /<[^>]*>/g;

function htmlToText(html: string): string {
  return html.replace(HTML_TAG_RE, "").trim();
}

function extractRecipients(recipients: GraphRecipient[] | undefined): string[] {
  if (!recipients) {
    return [];
  }
  return recipients.map((r) => r.emailAddress.address);
}

function extractInternetMessageId(
  headers: GraphInternetHeader[] | undefined
): string | null {
  if (!headers) {
    return null;
  }
  const header = headers.find((h) => h.name.toLowerCase() === "message-id");
  return header?.value ?? null;
}

function graphEmailToInsertData(
  email: GraphEmail,
  mailboxId: number
): InsertEmailData {
  const bodyHtml =
    email.body?.contentType === "html" ? email.body.content : null;
  let bodyText: string | null = null;
  if (email.body?.contentType === "text") {
    bodyText = email.body.content;
  } else if (bodyHtml) {
    bodyText = htmlToText(bodyHtml);
  }

  return {
    messageId: email.id,
    internetMessageId: extractInternetMessageId(email.internetMessageHeaders),
    mailboxId,
    conversationId: email.conversationId ?? null,
    subject: email.subject,
    fromEmail: email.from?.emailAddress.address ?? null,
    fromName: email.from?.emailAddress.name ?? null,
    toEmails: extractRecipients(email.toRecipients),
    ccEmails: extractRecipients(email.ccRecipients),
    receivedAt: email.receivedDateTime,
    hasAttachments: email.hasAttachments ?? false,
    bodyPreview: email.bodyPreview ?? null,
    bodyFull: bodyText,
    bodyHtml,
    webUrl: email.webLink ?? null,
  };
}

// ── Task ────────────────────────────────────────────────────────

export const emailSync = schemaTask({
  id: "email-sync",
  schema: z.object({
    messageId: z.string().min(1),
    mailboxEmail: z.string().min(1),
    changeType: z.string().default("created"),
  }),
  maxDuration: 120,
  retry: { maxAttempts: 3 },
  run: async ({ messageId, mailboxEmail }) => {
    // 1. Resolve mailbox
    const mailbox = await getOrCreateMailbox(mailboxEmail);

    // 2. Fetch email from Graph API
    const email = await graphGet<GraphEmail>(
      `users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?$select=${EMAIL_DETAIL_FIELDS}`
    );

    // 3. Store in Postgres (triggers cascade automatically)
    const data = graphEmailToInsertData(email, mailbox.id);
    const emailId = await insertEmail(data);

    logger.info("Email synced", {
      emailId,
      subject: email.subject,
      from: email.from?.emailAddress.address,
      conversationId: email.conversationId,
    });

    // 4. Fetch thread siblings we haven't seen
    let siblingsSynced = 0;
    if (email.conversationId) {
      siblingsSynced = await syncThreadSiblings(
        mailboxEmail,
        mailbox.id,
        email.conversationId,
        messageId
      );
    }

    return {
      emailId,
      subject: email.subject,
      conversationId: email.conversationId ?? null,
      siblingsSynced,
    };
  },
});

// ── Thread sibling sync ─────────────────────────────────────────

async function syncThreadSiblings(
  mailboxEmail: string,
  mailboxId: number,
  conversationId: string,
  excludeMessageId: string
): Promise<number> {
  const { db } = await import("@lib/db/client");

  // Get all message_ids we already have for this conversation
  const existingRows = await db
    .query<{ message_id: string }, [string]>(
      "SELECT message_id FROM emails WHERE conversation_id = $1"
    )
    .all(conversationId);

  const existingIds = new Set(existingRows.map((r) => r.message_id));

  // Fetch thread from Graph API
  const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const response = await graphGet<GraphListResponse>(
    `users/${encodeURIComponent(mailboxEmail)}/messages?$filter=${filter}&$select=${EMAIL_LIST_FIELDS}&$orderby=receivedDateTime asc&$top=50`
  );

  const siblings = response.value.filter(
    (msg) => msg.id !== excludeMessageId && !existingIds.has(msg.id)
  );

  if (siblings.length === 0) {
    return 0;
  }

  logger.info("Syncing thread siblings", {
    conversationId,
    total: response.value.length,
    newSiblings: siblings.length,
  });

  let synced = 0;
  for (const sibling of siblings) {
    try {
      const siblingData = graphEmailToInsertData(sibling, mailboxId);
      await insertEmail(siblingData);
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to sync sibling", {
        siblingId: sibling.id,
        error: msg,
      });
    }
  }

  logger.info("Thread siblings synced", {
    conversationId,
    synced,
    skipped: siblings.length - synced,
  });

  return synced;
}
