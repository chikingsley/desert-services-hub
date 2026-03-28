import { getGraphToken } from "./graph-auth";
import type { GraphAuthEnv } from "./graph-auth";

const GRAPH_API_BASE_URL = "https://graph.microsoft.com/v1.0";
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

export interface Recipient {
  email: string;
  name?: string | undefined;
}

export interface CreateDraftParams {
  body: string;
  bodyType: "html" | "text";
  cc?: Recipient[];
  subject: string;
  to: Recipient[];
  userId: string;
}

export interface AddFileAttachmentParams {
  contentBytesBase64: string;
  contentId?: string;
  contentType: string;
  draftId: string;
  isInline?: boolean;
  name: string;
  userId: string;
}

interface GraphDraftMessage {
  id: string;
  subject: string;
}

interface GraphDraftAttachment {
  id: string;
}

export interface GraphComposeClient {
  createDraft(params: CreateDraftParams): Promise<GraphDraftMessage>;
  addFileAttachment(params: AddFileAttachmentParams): Promise<GraphDraftAttachment>;
  sendDraft(draftId: string, mailbox: string): Promise<void>;
}

export class GraphApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
  }
}

const resolveGraphUrl = (path: string): string =>
  path.startsWith("https://") ? path : `${GRAPH_API_BASE_URL}/${path}`;

const toGraphRecipients = (
  recipients: Recipient[],
): { emailAddress: { address: string; name: string } }[] =>
  recipients.map((recipient) => ({
    emailAddress: {
      address: recipient.email,
      name: recipient.name ?? recipient.email,
    },
  }));

const sleep = async (ms: number): Promise<void> => {
  if (ms <= 0) {
    return;
  }

  // eslint-disable-next-line promise/avoid-new
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

const getRetryDelayMs = (response: Response, attempt: number): number => {
  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader) {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(retryAfterSeconds)) {
      return Math.max(0, retryAfterSeconds * 1000);
    }

    const retryAfterDate = new Date(retryAfterHeader);
    if (!Number.isNaN(retryAfterDate.getTime())) {
      return Math.max(0, retryAfterDate.getTime() - Date.now());
    }
  }

  if (response.status === 429) {
    return 30_000;
  }

  return Math.min(5000 * 2 ** (attempt - 1), 80_000);
};

const graphRequest = async (
  env: GraphAuthEnv,
  path: string,
  init: RequestInit,
): Promise<Response> => {
  const token = await getGraphToken(env);
  const url = resolveGraphUrl(path);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.ok) {
      return response;
    }

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_ATTEMPTS) {
      await sleep(getRetryDelayMs(response, attempt));
      continue;
    }

    const body = await response.text();
    throw new GraphApiError(response.status, `Graph API ${response.status}: ${body}`);
  }

  throw new Error("Graph request retry loop exhausted unexpectedly");
};

const graphPost = async function graphPost<T>(
  env: GraphAuthEnv,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await graphRequest(env, path, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (
    response.status === 202 ||
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return {} as T;
  }

  return (await response.json()) as T;
};

export const createComposeClient = (env: GraphAuthEnv): GraphComposeClient => ({
  async addFileAttachment(params: AddFileAttachmentParams): Promise<GraphDraftAttachment> {
    const user = encodeURIComponent(params.userId);
    const draftId = encodeURIComponent(params.draftId);
    return await graphPost<GraphDraftAttachment>(
      env,
      `users/${user}/messages/${draftId}/attachments`,
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        contentBytes: params.contentBytesBase64,
        contentType: params.contentType,
        name: params.name,
        ...(params.contentId ? { contentId: params.contentId } : {}),
        ...(params.isInline === undefined ? {} : { isInline: params.isInline }),
      },
    );
  },

  async createDraft(params: CreateDraftParams): Promise<GraphDraftMessage> {
    const user = encodeURIComponent(params.userId);
    return await graphPost<GraphDraftMessage>(env, `users/${user}/messages`, {
      body: {
        content: params.body,
        contentType: params.bodyType === "html" ? "HTML" : "Text",
      },
      ccRecipients: params.cc ? toGraphRecipients(params.cc) : [],
      isDraft: true,
      subject: params.subject,
      toRecipients: toGraphRecipients(params.to),
    });
  },

  async sendDraft(draftId: string, mailbox: string): Promise<void> {
    const user = encodeURIComponent(mailbox);
    const encodedDraftId = encodeURIComponent(draftId);
    await graphPost(env, `users/${user}/messages/${encodedDraftId}/send`, {});
  },
});
