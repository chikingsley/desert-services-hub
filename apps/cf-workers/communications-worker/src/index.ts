import { ZodError } from "zod";
import { AppClientError, fetchSubmittedBillingContext } from "./lib/app-client";
import { fetchGraphMessageSummary } from "./lib/graph-mail";
import {
  dayOneMailboxEmails,
  isDayOneMailboxEmail,
  isKnownMailboxEmail,
  plannedMailboxEmails,
} from "./lib/mailboxes";
import {
  mailboxEventTriggerRequestSchema,
  mailboxQueueMessageSchema,
  submittedBillingTriggerRequestSchema,
} from "./lib/schemas";
import type { MailboxQueueMessage, SubmittedBillingTriggerRequest } from "./lib/schemas";
import { SubmittedBillingWorkflow } from "./workflows/submitted-billing";
import type { SubmittedBillingWorkflowEnv } from "./workflows/submitted-billing";

export { SubmittedBillingWorkflow } from "./workflows/submitted-billing";

interface Env extends SubmittedBillingWorkflowEnv {
  COMMUNICATIONS_APP_BASE_URL: string;
  COMMUNICATIONS_INGEST_TOKEN?: string;
  MAILBOX_EVENTS_QUEUE: Queue<MailboxQueueMessage>;
  SUBMITTED_BILLING_WORKFLOW: Workflow;
}

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

const summarizeTrigger = (payload: SubmittedBillingTriggerRequest): Record<string, unknown> => {
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
    throw new AppClientError(400, "Invalid JSON body");
  }
};

const handleHealth = (): Response =>
  jsonResponse({
    mailboxes: {
      dayOne: dayOneMailboxEmails,
      planned: plannedMailboxEmails,
    },
    ok: true,
    queues: ["communications-mailbox-events"],
    service: "communications-worker",
    workflows: ["communications-submitted-billing"],
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

  if (!isKnownMailboxEmail(parsedRequest.data.mailboxEmail)) {
    return jsonError("Mailbox is not configured", 400, {
      mailboxEmail: parsedRequest.data.mailboxEmail,
    });
  }

  if (!isDayOneMailboxEmail(parsedRequest.data.mailboxEmail)) {
    return jsonError("Mailbox is configured but not enabled yet", 409, {
      mailboxEmail: parsedRequest.data.mailboxEmail,
    });
  }

  const queueMessage: MailboxQueueMessage = {
    changeType: parsedRequest.data.changeType,
    kind: "message-event",
    mailboxEmail: parsedRequest.data.mailboxEmail,
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

const handleSubmittedBillingTrigger = async (request: Request, env: Env): Promise<Response> => {
  const requestBody = await parseJsonBody(request);
  const parsedRequest = submittedBillingTriggerRequestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return jsonError("Invalid request", 400, parsedRequest.error.flatten());
  }

  const context = await fetchSubmittedBillingContext(env, parsedRequest.data);
  const instance = await env.SUBMITTED_BILLING_WORKFLOW.create({
    id: crypto.randomUUID(),
    params: context,
  });

  return jsonResponse({
    instanceId: instance.id,
    status: "queued",
    statusUrl: statusUrl(request, instance.id),
    trigger: summarizeTrigger(parsedRequest.data),
  });
};

const handleWorkflowStatus = async (request: Request, env: Env): Promise<Response> => {
  const instanceId = parseWorkflowIdFromPath(new URL(request.url).pathname);
  if (!instanceId) {
    return jsonError("Workflow instance ID is required", 400);
  }

  const instance = await env.SUBMITTED_BILLING_WORKFLOW.get(instanceId);
  const status = await instance.status();

  return jsonResponse({
    instanceId,
    ...status,
  });
};

const errorResponse = (error: unknown): Response => {
  if (error instanceof AppClientError) {
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

    if (!isDayOneMailboxEmail(parsedMessage.data.mailboxEmail)) {
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
