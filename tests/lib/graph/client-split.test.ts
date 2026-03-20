import { afterEach, describe, expect, test } from "bun:test";

const ORIGINAL_ENV = {
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
};
const ORIGINAL_FETCH = globalThis.fetch;

type FetchCall = {
  init?: RequestInit;
  url: string;
};

function withCacheBuster(path: string): string {
  return `${path}?test=${Date.now()}-${Math.random()}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env.AZURE_CLIENT_ID = ORIGINAL_ENV.AZURE_CLIENT_ID;
  process.env.AZURE_CLIENT_SECRET = ORIGINAL_ENV.AZURE_CLIENT_SECRET;
  process.env.AZURE_TENANT_ID = ORIGINAL_ENV.AZURE_TENANT_ID;
});

describe("graph module split", () => {
  test("auth module caches the Graph token", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return jsonResponse({
        access_token: "token-abc",
        expires_in: 3600,
      });
    }) as typeof fetch;

    const { getGraphToken } = await import(
      withCacheBuster("../../../lib/graph/auth.ts")
    );

    expect(await getGraphToken()).toBe("token-abc");
    expect(await getGraphToken()).toBe("token-abc");

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe(
      "https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token"
    );
    expect(fetchCalls[0]?.init?.method).toBe("POST");
  });

  test("http module attaches a bearer token for JSON and binary requests", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-http",
          expires_in: 3600,
        });
      }
      if (requestUrl.endsWith("/users/user-1/messages")) {
        return jsonResponse({ ok: true });
      }
      return new Response(Uint8Array.from([1, 2, 3]).buffer, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }) as typeof fetch;

    const { graphGet, graphGetBinary } = await import(
      withCacheBuster("../../../lib/graph/http.ts")
    );

    expect(await graphGet<{ ok: boolean }>("users/user-1/messages")).toEqual({
      ok: true,
    });
    expect(
      Array.from(
        await graphGetBinary(
          "https://graph.microsoft.com/v1.0/users/user-1/messages/msg-1/$value"
        )
      )
    ).toEqual([1, 2, 3]);

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/user-1/messages"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/user-1/messages/msg-1/$value"
    );
    expect(graphCalls[0]?.init?.headers).toEqual({
      Authorization: "Bearer token-http",
    });
    expect(graphCalls[1]?.init?.headers).toEqual({
      Authorization: "Bearer token-http",
    });
  });

  test("http module retries 429 responses using Retry-After", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    let graphAttempts = 0;
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-retry",
          expires_in: 3600,
        });
      }

      graphAttempts += 1;
      if (graphAttempts === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: "ApplicationThrottled",
              message: "Application is over its MailboxConcurrency limit.",
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "0",
            },
          }
        );
      }

      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const { graphGet } = await import(
      withCacheBuster("../../../lib/graph/http.ts")
    );

    expect(await graphGet<{ ok: boolean }>("users/user-1/messages")).toEqual({
      ok: true,
    });

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls).toHaveLength(2);
    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/user-1/messages"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/user-1/messages"
    );
  });

  test("mail attachment client preserves existing attachment endpoints", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-mail",
          expires_in: 3600,
        });
      }
      if (requestUrl.includes("/attachments?$select=")) {
        return jsonResponse({
          value: [{ id: "att-1", name: "proposal.pdf" }],
        });
      }
      return new Response(Uint8Array.from([4, 5, 6]).buffer, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }) as typeof fetch;

    const { createGraphClient } = await import(
      withCacheBuster("../../../lib/graph/mail.ts")
    );
    const client = createGraphClient();

    expect(
      await client.getAttachments("message/1", "mailbox+ops@example.com")
    ).toEqual([{ id: "att-1", name: "proposal.pdf" }]);
    expect(
      Array.from(
        await client.downloadAttachment(
          "message/1",
          "attachment/1",
          "mailbox+ops@example.com"
        )
      )
    ).toEqual([4, 5, 6]);

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages/message%2F1/attachments?$select=id,name,contentType,size,isInline"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages/message%2F1/attachments/attachment%2F1/$value"
    );
  });

  test("mail client can resolve the latest live message by internet message id", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-mail-live",
          expires_in: 3600,
        });
      }

      return jsonResponse({
        value: [
          {
            id: "msg-older",
            receivedDateTime: "2026-03-06T23:40:22Z",
            hasAttachments: true,
          },
          {
            id: "msg-newer",
            receivedDateTime: "2026-03-06T23:40:26Z",
            hasAttachments: true,
          },
        ],
      });
    }) as typeof fetch;

    const { createGraphClient } = await import(
      withCacheBuster("../../../lib/graph/mail.ts")
    );
    const client = createGraphClient();

    expect(
      typeof (client as unknown as { findLatestMessageIdByInternetMessageId?: unknown })
        .findLatestMessageIdByInternetMessageId
    ).toBe("function");

    const liveMessageId = await (
      client as unknown as {
        findLatestMessageIdByInternetMessageId: (
          internetMessageId: string,
          mailboxEmail: string
        ) => Promise<string | null>;
      }
    ).findLatestMessageIdByInternetMessageId(
      "<message-id@example.com>",
      "mailbox+ops@example.com"
    );

    expect(liveMessageId).toBe("msg-newer");

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages?$filter=internetMessageId%20eq%20'%3Cmessage-id%40example.com%3E'&$select=id,receivedDateTime,hasAttachments&$top=10"
    );
  });

  test("mail client can read and restore message read state", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-mail-state",
          expires_in: 3600,
        });
      }
      if (
        requestUrl.endsWith(
          "/users/mailbox%2Bops%40example.com/messages/message-123?$select=isRead"
        )
      ) {
        return jsonResponse({ isRead: false });
      }
      return jsonResponse({ id: "message-123", isRead: false });
    }) as typeof fetch;

    const { createGraphClient } = await import(
      withCacheBuster("../../../lib/graph/mail.ts")
    );
    const client = createGraphClient();

    expect(
      typeof (client as unknown as { getMessageReadState?: unknown })
        .getMessageReadState
    ).toBe("function");
    expect(
      typeof (client as unknown as { setMessageReadState?: unknown })
        .setMessageReadState
    ).toBe("function");

    const wasRead = await (
      client as unknown as {
        getMessageReadState: (
          messageId: string,
          mailboxEmail: string
        ) => Promise<boolean>;
      }
    ).getMessageReadState("message-123", "mailbox+ops@example.com");

    await (
      client as unknown as {
        setMessageReadState: (
          messageId: string,
          mailboxEmail: string,
          isRead: boolean
        ) => Promise<void>;
      }
    ).setMessageReadState("message-123", "mailbox+ops@example.com", false);

    expect(wasRead).toBe(false);

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages/message-123?$select=isRead"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages/message-123"
    );
    expect(graphCalls[1]?.init?.method).toBe("PATCH");
  });

  test("mail client can read message metadata for reply-all drafting", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-mail-message",
          expires_in: 3600,
        });
      }
      return jsonResponse({
        id: "message-123",
        isRead: false,
        subject: "RE: LPC 75th Ave -NOI /Dust Control Permit",
        body: {
          contentType: "html",
          content: "<html><body><div>Original draft body</div></body></html>",
        },
        toRecipients: [
          {
            emailAddress: {
              address: "amber@example.com",
              name: "Amber",
            },
          },
        ],
        ccRecipients: [
          {
            emailAddress: {
              address: "jt@example.com",
              name: "JT",
            },
          },
        ],
      });
    }) as typeof fetch;

    const { createGraphClient } = await import(
      withCacheBuster("../../../lib/graph/mail.ts")
    );
    const client = createGraphClient();

    expect(
      typeof (client as unknown as { getMessage?: unknown }).getMessage
    ).toBe("function");

    const message = await (
      client as unknown as {
        getMessage: (
          messageId: string,
          mailboxEmail: string
        ) => Promise<{
          body?: { content?: string; contentType?: string };
          ccRecipients: Array<{
            emailAddress: { address: string; name?: string };
          }>;
          id: string;
          isRead?: boolean;
          subject?: string;
          toRecipients: Array<{
            emailAddress: { address: string; name?: string };
          }>;
        }>;
      }
    ).getMessage("message-123", "mailbox+ops@example.com");

    expect(message.subject).toBe("RE: LPC 75th Ave -NOI /Dust Control Permit");
    expect(message.body?.content).toContain("Original draft body");
    expect(message.toRecipients[0]?.emailAddress.address).toBe(
      "amber@example.com"
    );
    expect(message.ccRecipients[0]?.emailAddress.address).toBe(
      "jt@example.com"
    );

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%2Bops%40example.com/messages/message-123?$select=id,subject,isRead,toRecipients,ccRecipients,body"
    );
  });

  test("compose and mailbox config modules preserve compose behavior", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-compose",
          expires_in: 3600,
        });
      }
      if (requestUrl.endsWith("/users/mailbox%40example.com/messages")) {
        return jsonResponse({ id: "draft-1", subject: "Subject" });
      }
      if (requestUrl.endsWith("/messages/message-123/createReplyAll")) {
        return jsonResponse({ id: "reply-1", subject: "RE: Subject" });
      }
      if (requestUrl.endsWith("/messages/reply-1")) {
        return jsonResponse({ id: "reply-1", subject: "Dust Permit Submitted - Project" });
      }
      if (requestUrl.endsWith("/messages/draft-1/attachments")) {
        return jsonResponse({ id: "file-1", name: "test.pdf" });
      }
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    const { createComposeClient } = await import(
      withCacheBuster("../../../lib/graph/compose.ts")
    );
    const { WRITABLE_MAILBOXES } = await import(
      withCacheBuster("../../../lib/graph/mailbox-permissions.ts")
    );
    const client = createComposeClient();

    expect(WRITABLE_MAILBOXES).toEqual([
      "chi@desertservices.net",
      "contracts@desertservices.net",
      "dustpermits@desertservices.net",
    ]);

    await client.createDraft({
      body: "<p>Hello</p>",
      bodyType: "html",
      cc: [{ email: "cc@example.com", name: "CC Person" }],
      subject: "Subject",
      to: [{ email: "to@example.com", name: "To Person" }],
      userId: "mailbox@example.com",
    });
    await client.createReplyDraft({
      body: "Reply body",
      bodyType: "text",
      messageId: "message-123",
      replyAll: true,
      userId: "mailbox@example.com",
    });
    expect(
      typeof (client as unknown as { createReplyAllDraft?: unknown }).createReplyAllDraft
    ).toBe("function");
    await (
      client as unknown as {
        createReplyAllDraft: (params: {
          messageId: string;
          userId: string;
        }) => Promise<{ id: string; subject: string }>;
      }
    ).createReplyAllDraft({
      messageId: "message-123",
      userId: "mailbox@example.com",
    });
    expect(
      typeof (client as unknown as { updateDraft?: unknown }).updateDraft
    ).toBe("function");
    await (
      client as unknown as {
        updateDraft: (params: {
          body: string;
          bodyType: "html" | "text";
          cc: Array<{ email: string; name?: string }>;
          draftId: string;
          subject: string;
          to: Array<{ email: string; name?: string }>;
          userId: string;
        }) => Promise<{ id: string; subject: string }>;
      }
    ).updateDraft({
      draftId: "reply-1",
      userId: "mailbox@example.com",
      subject: "Dust Permit Submitted - Project",
      body: "<p>Updated</p>",
      bodyType: "html",
      to: [{ email: "to@example.com", name: "To Person" }],
      cc: [{ email: "cc@example.com", name: "CC Person" }],
    });
    await client.addFileAttachment({
      contentBytesBase64: "dGVzdA==",
      contentType: "application/pdf",
      draftId: "draft-1",
      name: "test.pdf",
      userId: "mailbox@example.com",
    });
    await client.sendDraft("draft-1", "mailbox@example.com");

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages/message-123/createReplyAll"
    );
    expect(graphCalls[2]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages/message-123/createReplyAll"
    );
    expect(graphCalls[3]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages/reply-1"
    );
    expect(graphCalls[3]?.init?.method).toBe("PATCH");
    expect(graphCalls[4]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages/draft-1/attachments"
    );
    expect(graphCalls[5]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/mailbox%40example.com/messages/draft-1/send"
    );
  });

  test("groups client preserves thread and post endpoints", async () => {
    process.env.AZURE_TENANT_ID = "tenant-123";
    process.env.AZURE_CLIENT_ID = "client-123";
    process.env.AZURE_CLIENT_SECRET = "secret-123";

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url, init) => {
      const requestUrl = String(url);
      fetchCalls.push({ url: requestUrl, init });
      if (requestUrl.includes("login.microsoftonline.com")) {
        return jsonResponse({
          access_token: "token-groups",
          expires_in: 3600,
        });
      }
      return jsonResponse({ value: [] });
    }) as typeof fetch;

    const { createGroupsClient } = await import(
      withCacheBuster("../../../lib/graph/groups.ts")
    );
    const client = createGroupsClient();

    expect(await client.getConversationThreads("group/1", "conversation/1")).toEqual(
      []
    );
    expect(await client.getThreadPosts("group/1", "thread/1", true)).toEqual([]);

    const graphCalls = fetchCalls.filter((call) =>
      call.url.includes("graph.microsoft.com")
    );

    expect(graphCalls[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/groups/group%2F1/conversations/conversation%2F1/threads"
    );
    expect(graphCalls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/groups/group%2F1/threads/thread%2F1/posts?$expand=attachments"
    );
  });
});
