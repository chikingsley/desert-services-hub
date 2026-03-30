import { ZodError } from "zod";
import type { ZodType } from "zod";
import { fetchGraphMessageSummary } from "./lib/graph-mail";
import {
  issuedClientContextSchema,
  mailboxEventTriggerRequestSchema,
  mailboxQueueMessageSchema,
  submittedBillingContextSchema,
  submittedBillingTriggerRequestSchema,
  submittedClientContextSchema,
} from "./lib/schemas";
import type {
  IssuedClientContext,
  MailboxQueueMessage,
  SubmittedBillingContext,
  SubmittedBillingTriggerRequest,
  SubmittedClientContext,
} from "./lib/schemas";
import { IssuedClientWorkflow } from "./workflows/issued-client";
import { SubmittedBillingWorkflow } from "./workflows/submitted-billing";
import { SubmittedClientWorkflow } from "./workflows/submitted-client";
import type { IssuedClientWorkflowEnv } from "./workflows/issued-client";
import type { SubmittedBillingWorkflowEnv } from "./workflows/submitted-billing";
import type { SubmittedClientWorkflowEnv } from "./workflows/submitted-client";

export { IssuedClientWorkflow } from "./workflows/issued-client";
export { SubmittedBillingWorkflow } from "./workflows/submitted-billing";
export { SubmittedClientWorkflow } from "./workflows/submitted-client";

const ENABLED_MAILBOXES = ["chi@desertservices.net", "contracts@desertservices.net"] as const;

type NotificationTriggerRequest = SubmittedBillingTriggerRequest;

class RequestError extends Error {
  readonly details: unknown;
  readonly status: number;

  constructor(status: number, message: string, details: unknown = null) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.details = details;
  }
}

interface Env
  extends SubmittedBillingWorkflowEnv, SubmittedClientWorkflowEnv, IssuedClientWorkflowEnv {
  COMMUNICATIONS_APP_BASE_URL: string;
  COMMUNICATIONS_INGEST_TOKEN?: string;
  MAILBOX_EVENTS_QUEUE: Queue<MailboxQueueMessage>;
  ISSUED_CLIENT_WORKFLOW: Workflow;
  SUBMITTED_BILLING_WORKFLOW: Workflow;
  SUBMITTED_CLIENT_WORKFLOW: Workflow;
}

const enabledMailboxSet = new Set<string>(ENABLED_MAILBOXES);

const normalizeMailboxEmail = (mailboxEmail: string): string => mailboxEmail.trim().toLowerCase();

const isEnabledMailboxEmail = (mailboxEmail: string): boolean =>
  enabledMailboxSet.has(normalizeMailboxEmail(mailboxEmail));

const jsonResponse = (body: unknown, init?: ResponseInit): Response => Response.json(body, init);

const jsonError = (error: string, status = 400, details: unknown = null): Response => {
  const responseBody = details === null ? { error } : { details, error };
  return jsonResponse(responseBody, { status });
};

const statusUrl = (request: Request, instanceId: string): string =>
  new URL(`/api/workflows/${instanceId}`, request.url).toString();

const parseWorkflowIdFromPath = (pathname: string): string | null => {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "workflows") {
    return parts[2] ?? null;
  }

  return null;
};

const parseBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

const isAuthorized = (
  authorizationHeader: string | null,
  expectedToken: string | undefined,
): boolean => {
  const normalizedExpectedToken = expectedToken?.trim();
  if (!normalizedExpectedToken) {
    return true;
  }

  return parseBearerToken(authorizationHeader) === normalizedExpectedToken;
};

const summarizeTrigger = (payload: NotificationTriggerRequest): Record<string, unknown> => {
  if (payload.mode === "payment-email") {
    return {
      draft: payload.draft,
      emailId: payload.emailId,
      mode: payload.mode,
    };
  }

  if (payload.mode === "invoice") {
    return {
      draft: payload.draft,
      invoiceNumber: payload.invoiceNumber,
      mode: payload.mode,
    };
  }

  return {
    draft: payload.draft,
    mode: payload.mode,
    permitId: payload.permitId,
  };
};

const parseJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new RequestError(400, "Invalid JSON body");
  }
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
};

const resolveBaseUrl = (baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (normalizedBaseUrl.length === 0) {
    throw new RequestError(500, "COMMUNICATIONS_APP_BASE_URL is not configured");
  }

  return normalizedBaseUrl;
};

const fetchContext = async <T>(
  env: Env,
  path: string,
  payload: NotificationTriggerRequest,
  schema: ZodType<T>,
): Promise<T> => {
  const response = await fetch(`${resolveBaseUrl(env.COMMUNICATIONS_APP_BASE_URL)}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    const message =
      responseBody &&
      typeof responseBody === "object" &&
      "error" in responseBody &&
      typeof responseBody.error === "string"
        ? responseBody.error
        : `Context request failed with status ${response.status}`;
    throw new RequestError(response.status, message, responseBody);
  }

  const parsedResponse = schema.safeParse(responseBody);
  if (!parsedResponse.success) {
    throw new RequestError(502, "Invalid response payload", parsedResponse.error.flatten());
  }

  return parsedResponse.data;
};

const createWorkflowResponse = async <T>(
  request: Request,
  trigger: NotificationTriggerRequest,
  workflow: Workflow,
  context: T,
): Promise<Response> => {
  const instance = await workflow.create({
    id: crypto.randomUUID(),
    params: context,
  });

  return jsonResponse({
    instanceId: instance.id,
    status: "queued",
    statusUrl: statusUrl(request, instance.id),
    trigger: summarizeTrigger(trigger),
  });
};

const handleHealth = (): Response =>
  jsonResponse({
    mailboxes: [...ENABLED_MAILBOXES],
    ok: true,
    queues: ["communications-mailbox-events"],
    service: "communications-worker",
    workflows: [
      "communications-submitted-billing",
      "communications-submitted-client",
      "communications-issued-client",
    ],
  });

const handleMailboxEventEnqueue = async (request: Request, env: Env): Promise<Response> => {
  if (!isAuthorized(request.headers.get("authorization"), env.COMMUNICATIONS_INGEST_TOKEN)) {
    return jsonError("Unauthorized", 401);
  }

  const requestBody = await parseJsonBody(request);
  const parsedRequest = mailboxEventTriggerRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return jsonError("Invalid request", 400, parsedRequest.error.flatten());
  }

  if (!isEnabledMailboxEmail(parsedRequest.data.mailboxEmail)) {
    return jsonError("Mailbox is not enabled", 400, {
      mailboxEmail: parsedRequest.data.mailboxEmail,
      supportedMailboxes: [...ENABLED_MAILBOXES],
    });
  }

  const queueMessage: MailboxQueueMessage = {
    changeType: parsedRequest.data.changeType,
    kind: "message-event",
    mailboxEmail: normalizeMailboxEmail(parsedRequest.data.mailboxEmail),
    messageId: parsedRequest.data.messageId,
    queuedAt: new Date().toISOString(),
    source: parsedRequest.data.source,
  };

  await env.MAILBOX_EVENTS_QUEUE.send(queueMessage);

  return jsonResponse(
    {
      changeType: queueMessage.changeType,
      mailboxEmail: queueMessage.mailboxEmail,
      messageId: queueMessage.messageId,
      queue: "communications-mailbox-events",
      status: "queued",
    },
    { status: 202 },
  );
};

const parseNotificationTrigger = async (request: Request): Promise<NotificationTriggerRequest> => {
  const requestBody = await parseJsonBody(request);
  const parsedRequest = submittedBillingTriggerRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    throw new RequestError(400, "Invalid request", parsedRequest.error.flatten());
  }

  return parsedRequest.data;
};

const handleSubmittedBillingTrigger = async (request: Request, env: Env): Promise<Response> => {
  const trigger = await parseNotificationTrigger(request);
  const context = await fetchContext<SubmittedBillingContext>(
    env,
    "/api/internal/communications/dust-permit/submitted-billing-context",
    trigger,
    submittedBillingContextSchema,
  );

  return await createWorkflowResponse(request, trigger, env.SUBMITTED_BILLING_WORKFLOW, context);
};

const handleSubmittedClientTrigger = async (request: Request, env: Env): Promise<Response> => {
  const trigger = await parseNotificationTrigger(request);
  const context = await fetchContext<SubmittedClientContext>(
    env,
    "/api/internal/communications/dust-permit/submitted-client-context",
    trigger,
    submittedClientContextSchema,
  );

  return await createWorkflowResponse(request, trigger, env.SUBMITTED_CLIENT_WORKFLOW, context);
};

const handleIssuedClientTrigger = async (request: Request, env: Env): Promise<Response> => {
  const trigger = await parseNotificationTrigger(request);
  const context = await fetchContext<IssuedClientContext>(
    env,
    "/api/internal/communications/dust-permit/issued-client-context",
    trigger,
    issuedClientContextSchema,
  );

  return await createWorkflowResponse(request, trigger, env.ISSUED_CLIENT_WORKFLOW, context);
};

const handleWorkflowStatus = async (request: Request, env: Env): Promise<Response> => {
  const instanceId = parseWorkflowIdFromPath(new URL(request.url).pathname);
  if (!instanceId) {
    return jsonError("Workflow instance ID is required", 400);
  }

  const submittedBillingInstance = await env.SUBMITTED_BILLING_WORKFLOW.get(instanceId);
  const submittedBillingStatus = await submittedBillingInstance.status();
  if (submittedBillingStatus.status !== "unknown") {
    return jsonResponse({
      instanceId,
      ...submittedBillingStatus,
    });
  }

  const submittedClientInstance = await env.SUBMITTED_CLIENT_WORKFLOW.get(instanceId);
  const submittedClientStatus = await submittedClientInstance.status();
  if (submittedClientStatus.status !== "unknown") {
    return jsonResponse({
      instanceId,
      ...submittedClientStatus,
    });
  }

  const issuedClientInstance = await env.ISSUED_CLIENT_WORKFLOW.get(instanceId);
  const issuedClientStatus = await issuedClientInstance.status();
  return jsonResponse({
    instanceId,
    ...issuedClientStatus,
  });
};

const errorResponse = (error: unknown): Response => {
  if (error instanceof RequestError) {
    return jsonError(error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return jsonError("Invalid response payload", 502, error.flatten());
  }

  const message = error instanceof Error ? error.message : String(error);
  return jsonError(message, 500);
};

export const handleQueue = async (
  batch: MessageBatch<MailboxQueueMessage>,
  env: Env,
): Promise<void> => {
  for (const message of batch.messages) {
    const parsedMessage = mailboxQueueMessageSchema.safeParse(message.body);
    if (!parsedMessage.success) {
      message.ack();
      continue;
    }

    if (!isEnabledMailboxEmail(parsedMessage.data.mailboxEmail)) {
      message.ack();
      continue;
    }

    await fetchGraphMessageSummary(
      env,
      parsedMessage.data.mailboxEmail,
      parsedMessage.data.messageId,
    );
    message.ack();
  }
};

export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const { pathname } = new URL(request.url);

  try {
    if (request.method === "GET" && pathname === "/api/health") {
      return handleHealth();
    }

    if (request.method === "POST" && pathname === "/api/drafts/dust-permit/submitted-billing") {
      return await handleSubmittedBillingTrigger(request, env);
    }

    if (request.method === "POST" && pathname === "/api/drafts/dust-permit/submitted-client") {
      return await handleSubmittedClientTrigger(request, env);
    }

    if (request.method === "POST" && pathname === "/api/drafts/dust-permit/issued-client") {
      return await handleIssuedClientTrigger(request, env);
    }

    if (request.method === "POST" && pathname === "/api/mailbox/events") {
      return await handleMailboxEventEnqueue(request, env);
    }

    if (request.method === "GET" && pathname.startsWith("/api/workflows/")) {
      return await handleWorkflowStatus(request, env);
    }

    return new Response("Not Found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    return handleQueue(batch as MessageBatch<MailboxQueueMessage>, env);
  },
} satisfies ExportedHandler<Env>;
