import { afterEach, describe, expect, it, vi } from "vitest";
import { handleQueue, handleRequest } from "../src/index";

type MockFunction = ReturnType<typeof vi.fn>;

interface TestEnv {
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_TENANT_ID: string;
  COMMUNICATIONS_APP_BASE_URL: string;
  COMMUNICATIONS_INGEST_TOKEN?: string;
  MAILBOX_EVENTS_QUEUE: {
    send: MockFunction;
  };
  SUBMITTED_BILLING_WORKFLOW: {
    create: MockFunction;
    get: MockFunction;
  };
  __queueSend: MockFunction;
  __workflowCreate: MockFunction;
  __workflowGet: MockFunction;
  __workflowStatus: MockFunction;
}

const createEnv = (overrides: Partial<TestEnv> = {}): TestEnv => {
  const workflowStatus = vi.fn().mockResolvedValue({
    output: {
      classification: "new",
      draftId: "draft-123",
      invoiceNumber: "IV123",
      mode: "draft",
      permitId: "D1234567",
      subject: "Dust Permit Billing - Project",
    },
    status: "complete",
  });

  const workflowCreate = vi.fn().mockResolvedValue({
    id: "instance-123",
  });

  const workflowGet = vi.fn().mockResolvedValue({
    status: workflowStatus,
  });
  const queueSend = vi.fn().mockResolvedValue(null);

  return {
    AZURE_CLIENT_ID: "client",
    AZURE_CLIENT_SECRET: "secret",
    AZURE_TENANT_ID: "tenant",
    COMMUNICATIONS_APP_BASE_URL: "https://app.example.com",
    COMMUNICATIONS_INGEST_TOKEN: "ingest-token",
    MAILBOX_EVENTS_QUEUE: {
      send: queueSend,
    },
    SUBMITTED_BILLING_WORKFLOW: {
      create: workflowCreate,
      get: workflowGet,
    },
    __queueSend: queueSend,
    __workflowCreate: workflowCreate,
    __workflowGet: workflowGet,
    __workflowStatus: workflowStatus,
    ...overrides,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("communications-worker", () => {
  it("triggers the submitted billing workflow", async () => {
    const env = createEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            bodyHtml: "<html>hello</html>",
            cc: [{ email: "don@desertservices.net" }],
            classification: "new",
            invoiceNumber: "IV123",
            kind: "dust-permit-submitted-billing",
            mailbox: "chi@desertservices.net",
            paymentDate: "2026-03-27",
            permitId: "D1234567",
            scheduleCharge: "$1,070",
            send: false,
            subject: "Dust Permit Billing - Project",
            to: [{ email: "eva@desertservices.net" }],
          },
          { status: 200 },
        ),
      ),
    );

    const response = await handleRequest(
      new Request("https://worker.example.com/api/drafts/dust-permit/submitted-billing", {
        body: JSON.stringify({
          draft: true,
          invoiceNumber: "IV123",
          mode: "invoice",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      env as never,
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      instanceId: "instance-123",
      status: "queued",
      statusUrl: "https://worker.example.com/api/workflows/instance-123",
      trigger: {
        draft: true,
        invoiceNumber: "IV123",
        mode: "invoice",
      },
    });

    expect(env.__workflowCreate.mock.calls[0]?.[0]).toMatchObject({
      id: expect.any(String),
      params: {
        invoiceNumber: "IV123",
        permitId: "D1234567",
        subject: "Dust Permit Billing - Project",
      },
    });
  });

  it("returns workflow status", async () => {
    const env = createEnv();

    const response = await handleRequest(
      new Request("https://worker.example.com/api/workflows/instance-123"),
      env as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      instanceId: "instance-123",
      output: {
        classification: "new",
        draftId: "draft-123",
        invoiceNumber: "IV123",
        mode: "draft",
        permitId: "D1234567",
        subject: "Dust Permit Billing - Project",
      },
      status: "complete",
    });
  });

  it("accepts manual mode requests without auth headers", async () => {
    const env = createEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            bodyHtml: "<html>hello</html>",
            cc: [{ email: "don@desertservices.net" }],
            classification: "new",
            invoiceNumber: "IV123",
            kind: "dust-permit-submitted-billing",
            mailbox: "chi@desertservices.net",
            paymentDate: "2026-03-27",
            permitId: "D1234567",
            scheduleCharge: "$1,070",
            send: false,
            subject: "Dust Permit Billing - Project",
            to: [{ email: "eva@desertservices.net" }],
          },
          { status: 200 },
        ),
      ),
    );

    const response = await handleRequest(
      new Request("https://worker.example.com/api/drafts/dust-permit/submitted-billing", {
        body: JSON.stringify({
          draft: true,
          mode: "manual",
          permitId: "D1234567",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      env as never,
    );

    expect(response.status).toBe(200);
  });

  it("queues a day-one mailbox event", async () => {
    const env = createEnv();

    const response = await handleRequest(
      new Request("https://worker.example.com/api/mailbox/events", {
        body: JSON.stringify({
          changeType: "created",
          mailboxEmail: "CHI@desertservices.net",
          messageId: "msg-123",
        }),
        headers: {
          authorization: "Bearer ingest-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
      env as never,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      changeType: "created",
      mailboxEmail: "chi@desertservices.net",
      messageId: "msg-123",
      queue: "communications-mailbox-events",
      status: "queued",
    });
    expect(env.__queueSend).toHaveBeenCalledTimes(1);
    expect(env.__queueSend.mock.calls[0]?.[0]).toMatchObject({
      changeType: "created",
      kind: "message-event",
      mailboxEmail: "chi@desertservices.net",
      messageId: "msg-123",
      source: "supabase-outlook-webhook",
    });
  });

  it("rejects planned but not enabled mailbox events", async () => {
    const env = createEnv();

    const response = await handleRequest(
      new Request("https://worker.example.com/api/mailbox/events", {
        body: JSON.stringify({
          changeType: "created",
          mailboxEmail: "denise@desertservices.net",
          messageId: "msg-456",
        }),
        headers: {
          authorization: "Bearer ingest-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
      env as never,
    );

    expect(response.status).toBe(409);
    expect(env.__queueSend).not.toHaveBeenCalled();
  });

  it("processes a queued day-one mailbox event", async () => {
    const env = createEnv();
    const ack = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            access_token: "graph-token",
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            hasAttachments: true,
            id: "msg-789",
            subject: "Queued message",
          }),
        ),
    );

    await handleQueue(
      {
        ackAll: vi.fn(),
        messages: [
          {
            ack,
            attempts: 1,
            body: {
              changeType: "created",
              kind: "message-event",
              mailboxEmail: "contracts@desertservices.net",
              messageId: "msg-789",
              queuedAt: "2026-03-27T00:00:00.000Z",
              source: "manual",
            },
            id: "queue-msg-1",
            retry: vi.fn(),
            timestamp: new Date("2026-03-27T00:00:00.000Z"),
          },
        ],
        queue: "communications-mailbox-events",
        retryAll: vi.fn(),
      },
      env as never,
    );

    expect(ack).toHaveBeenCalledTimes(1);
  });
});
