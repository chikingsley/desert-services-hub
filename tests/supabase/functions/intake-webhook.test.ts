import { afterEach, describe, expect, test } from "bun:test";
import {
  buildTriggerFiles,
  createIntakeWebhookHandler,
  parseIncomingPayload,
} from "@/supabase/functions/intake-webhook/index";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("intake-webhook payload parsing", () => {
  test("returns null for non-object payloads", () => {
    expect(parseIncomingPayload(null)).toBeNull();
    expect(parseIncomingPayload("x")).toBeNull();
    expect(parseIncomingPayload([])).toBeNull();
  });

  test("normalizes attachments and link payloads", () => {
    const payload = parseIncomingPayload({
      attachments: [
        {
          filename: "scope",
          contentType: "application/pdf",
          size: 12,
          content: "ZmFrZQ==",
        },
        { filename: "ignored-no-content" },
      ],
      bodyHasContent: true,
      bodyText: "hello world",
      fileLinks: [{ source: "onedrive", url: "https://example.com/file" }],
      forwarderEmail: "fwd@example.com",
      originalFrom: "vendor@example.com",
      originalSubject: "Test",
      forwardedAt: "2026-02-26T00:00:00.000Z",
    });

    expect(payload).not.toBeNull();
    if (!payload) {
      return;
    }
    expect(payload.attachments).toHaveLength(1);
    expect(payload.fileLinks).toHaveLength(1);
    expect(payload.bodyHasContent).toBe(true);
  });
});

describe("intake-webhook trigger dispatch", () => {
  test("buildTriggerFiles adds inferred extension and body file", () => {
    const files = buildTriggerFiles({
      attachments: [
        {
          filename: "invoice",
          contentType: "application/pdf",
          size: 10,
          content: "ZmFrZQ==",
        },
      ],
      bodyHasContent: true,
      bodyText: "Body text",
      fileLinks: [],
      forwardedAt: "",
      forwarderEmail: "fwd@example.com",
      originalFrom: "vendor@example.com",
      originalSubject: "Subject",
    });

    expect(files).toHaveLength(2);
    expect(files[0]?.filename).toBe("invoice.pdf");
    expect(files[1]?.filename).toBe("email-body.txt");
    expect(files[1]?.contentBase64).toBe("Qm9keSB0ZXh0");
  });

  test("returns 200 for links-only payloads without triggering task", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response("should-not-be-called", { status: 500 });
    }) as unknown as typeof fetch;

    const handler = createIntakeWebhookHandler({
      triggerApiUrl: "https://trigger.example.com",
      triggerSecretKey: "tr_test_123",
    });

    const response = await handler(
      new Request("http://localhost/functions/v1/intake-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [],
          bodyHasContent: false,
          bodyText: "",
          fileLinks: [{ source: "dropbox", url: "https://dropbox.com/s/test" }],
          forwardedAt: new Date().toISOString(),
          forwarderEmail: "pipeline@desertservices.app",
          originalFrom: "sender@example.com",
          originalSubject: "links only",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(fetchCalls).toBe(0);
    const body = (await response.json()) as { ok: boolean; files: number };
    expect(body.ok).toBe(true);
    expect(body.files).toBe(0);
  });

  test("triggers document-intake task for attachments", async () => {
    let calledUrl = "";
    let calledAuth = "";
    let calledPayload = "";

    globalThis.fetch = (async (url, init) => {
      calledUrl = String(url);
      calledAuth = String(
        (init?.headers as Record<string, string>)?.Authorization
      );
      calledPayload = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "run_abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const handler = createIntakeWebhookHandler({
      triggerApiUrl: "https://trigger.example.com",
      triggerSecretKey: "tr_test_123",
    });

    const response = await handler(
      new Request("http://localhost/functions/v1/intake-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [
            {
              filename: "scope",
              contentType: "application/pdf",
              size: 10,
              content: "ZmFrZQ==",
            },
          ],
          bodyHasContent: false,
          bodyText: "",
          fileLinks: [],
          forwardedAt: new Date().toISOString(),
          forwarderEmail: "pipeline@desertservices.app",
          originalFrom: "sender@example.com",
          originalSubject: "test subject",
        }),
      })
    );

    expect(response.status).toBe(202);
    expect(calledUrl).toBe(
      "https://trigger.example.com/api/v1/tasks/document-intake/trigger"
    );
    expect(calledAuth).toBe("Bearer tr_test_123");

    const triggerBody = JSON.parse(calledPayload) as {
      payload: { files: Array<{ filename: string }> };
    };
    expect(triggerBody.payload.files[0]?.filename).toBe("scope.pdf");

    const body = (await response.json()) as {
      ok: boolean;
      runId: string;
      files: number;
    };
    expect(body.ok).toBe(true);
    expect(body.runId).toBe("run_abc123");
    expect(body.files).toBe(1);
  });

  test("returns 502 when Trigger API errors", async () => {
    globalThis.fetch = (async () =>
      new Response("boom", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })) as unknown as typeof fetch;

    const handler = createIntakeWebhookHandler({
      triggerApiUrl: "https://trigger.example.com",
      triggerSecretKey: "tr_test_123",
    });

    const response = await handler(
      new Request("http://localhost/functions/v1/intake-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [
            {
              filename: "scope",
              contentType: "application/pdf",
              size: 10,
              content: "ZmFrZQ==",
            },
          ],
          bodyHasContent: false,
          bodyText: "",
          fileLinks: [],
          forwardedAt: new Date().toISOString(),
          forwarderEmail: "pipeline@desertservices.app",
          originalFrom: "sender@example.com",
          originalSubject: "test subject",
        }),
      })
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Trigger.dev API 500");
  });
});
