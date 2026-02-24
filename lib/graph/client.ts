/**
 * Minimal Microsoft Graph API client.
 *
 * Provides typed methods for email attachment downloads and group
 * conversation access. Uses Azure client credentials (application-level)
 * auth — same as src/trigger/graph.ts.
 *
 * Replaces the massive GraphEmailClient class from the deleted
 * packages/email package with only the subset that attachment-backfill
 * and body-link pipelines actually use.
 */

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
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
  const token = await getToken();
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

async function graphGetBinary(path: string): Promise<Buffer> {
  const token = await getToken();
  const url = path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function graphPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await getToken();
  const url = path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API POST ${res.status}: ${text}`);
  }
  // Some endpoints (like send) return 202 with no body
  if (res.status === 202 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}

// ── Email client ────────────────────────────────────────────────

export interface GraphEmailClient {
  downloadAttachment(
    messageId: string,
    attachmentId: string,
    mailboxEmail: string
  ): Promise<Buffer>;
}

export function createGraphClient(): GraphEmailClient {
  return {
    async downloadAttachment(
      messageId: string,
      attachmentId: string,
      mailboxEmail: string
    ): Promise<Buffer> {
      const user = encodeURIComponent(mailboxEmail);
      const msg = encodeURIComponent(messageId);
      const att = encodeURIComponent(attachmentId);
      return graphGetBinary(
        `users/${user}/messages/${msg}/attachments/${att}/$value`
      );
    },
  };
}

// ── Compose client (draft/send) ─────────────────────────────────

export const WRITABLE_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
] as const;

export type WritableMailbox = (typeof WRITABLE_MAILBOXES)[number];

interface Recipient {
  email: string;
  name?: string;
}

interface GraphDraftMessage {
  id: string;
  subject: string;
}

interface CreateDraftParams {
  body: string;
  bodyType: "html" | "text";
  cc?: Recipient[];
  skipSignature?: boolean;
  subject: string;
  to: Recipient[];
  userId: string;
}

interface CreateReplyDraftParams {
  body: string;
  bodyType: "html" | "text";
  messageId: string;
  replyAll?: boolean;
  skipSignature?: boolean;
  userId: string;
}

export interface GraphComposeClient {
  createDraft(params: CreateDraftParams): Promise<GraphDraftMessage>;
  createReplyDraft(params: CreateReplyDraftParams): Promise<GraphDraftMessage>;
  sendDraft(draftId: string, mailbox: string): Promise<void>;
}

function toGraphRecipients(
  recipients: Recipient[]
): Array<{ emailAddress: { address: string; name: string } }> {
  return recipients.map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));
}

export function createComposeClient(): GraphComposeClient {
  return {
    async createDraft(params: CreateDraftParams): Promise<GraphDraftMessage> {
      const user = encodeURIComponent(params.userId);
      return graphPost<GraphDraftMessage>(`users/${user}/messages`, {
        subject: params.subject,
        body: {
          contentType: params.bodyType === "html" ? "HTML" : "Text",
          content: params.body,
        },
        toRecipients: toGraphRecipients(params.to),
        ccRecipients: params.cc ? toGraphRecipients(params.cc) : [],
        isDraft: true,
      });
    },

    async createReplyDraft(
      params: CreateReplyDraftParams
    ): Promise<GraphDraftMessage> {
      const user = encodeURIComponent(params.userId);
      const msg = encodeURIComponent(params.messageId);
      const endpoint = params.replyAll ? "createReplyAll" : "createReply";
      return graphPost<GraphDraftMessage>(
        `users/${user}/messages/${msg}/${endpoint}`,
        {
          comment: params.body,
        }
      );
    },

    async sendDraft(draftId: string, mailbox: string): Promise<void> {
      const user = encodeURIComponent(mailbox);
      const msg = encodeURIComponent(draftId);
      await graphPost(`users/${user}/messages/${msg}/send`, {});
    },
  };
}

// ── Groups client ───────────────────────────────────────────────

interface GroupThread {
  id: string;
}

interface GroupPostAttachment {
  contentBytes?: string;
  contentType?: string;
  id: string;
  name?: string;
}

interface GroupPost {
  attachments?: GroupPostAttachment[];
  id: string;
}

export interface GraphGroupsClient {
  getConversationThreads(
    groupId: string,
    conversationId: string
  ): Promise<GroupThread[]>;
  getThreadPosts(
    groupId: string,
    threadId: string,
    includeAttachments?: boolean
  ): Promise<GroupPost[]>;
}

export function createGroupsClient(): GraphGroupsClient {
  return {
    async getConversationThreads(
      groupId: string,
      conversationId: string
    ): Promise<GroupThread[]> {
      const g = encodeURIComponent(groupId);
      const c = encodeURIComponent(conversationId);
      const data = await graphGet<{ value: GroupThread[] }>(
        `groups/${g}/conversations/${c}/threads`
      );
      return data.value;
    },

    async getThreadPosts(
      groupId: string,
      threadId: string,
      includeAttachments = false
    ): Promise<GroupPost[]> {
      const g = encodeURIComponent(groupId);
      const t = encodeURIComponent(threadId);
      const expand = includeAttachments ? "?$expand=attachments" : "";
      const data = await graphGet<{ value: GroupPost[] }>(
        `groups/${g}/threads/${t}/posts${expand}`
      );
      return data.value;
    },
  };
}
