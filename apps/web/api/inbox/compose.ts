/**
 * Compose / Reply / Send API
 *
 * POST /api/inbox/compose  — create a new draft email
 * POST /api/inbox/reply    — create a reply draft on an existing message
 * POST /api/inbox/send     — send an existing draft
 *
 * All operations use the draft-based workflow with app auth.
 * Only writable mailboxes (chi@, contracts@, dustpermits@) are permitted.
 */

import { GraphEmailClient, WRITABLE_MAILBOXES } from "@email/client";
import { db } from "@lib/db/client";
import { z } from "zod";

// Singleton Graph client (app auth, reused across requests)
let graphClient: GraphEmailClient | null = null;

function getGraphClient(): GraphEmailClient {
  if (!graphClient) {
    graphClient = new GraphEmailClient({
      azureClientId: process.env.AZURE_CLIENT_ID ?? "",
      azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
      azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    });
    graphClient.initAppAuth();
  }
  return graphClient;
}

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const composeSchema = z.object({
  body: z.string().min(1),
  bodyType: z.enum(["html", "text"]).default("text"),
  cc: z.array(recipientSchema).default([]),
  mailbox: z.enum(WRITABLE_MAILBOXES),
  skipSignature: z.boolean().default(false),
  subject: z.string().min(1),
  to: z.array(recipientSchema).min(1),
});

const replySchema = z.object({
  body: z.string().min(1),
  bodyType: z.enum(["html", "text"]).default("text"),
  emailId: z.coerce.number().int().positive(),
  mailbox: z.enum(WRITABLE_MAILBOXES),
  replyAll: z.boolean().default(false),
  skipSignature: z.boolean().default(false),
});

const sendSchema = z.object({
  draftId: z.string().min(1),
  mailbox: z.enum(WRITABLE_MAILBOXES),
});

function zodErrorResponse(error: z.ZodError): Response {
  return Response.json(
    { error: "Invalid request", details: error.flatten() },
    { status: 400 }
  );
}

/**
 * POST /api/inbox/compose — create a new draft email
 *
 * Creates a draft in the specified writable mailbox via Graph API.
 * The draft appears in Outlook's Drafts folder and can be sent later.
 */
export async function composeEmail(req: Request): Promise<Response> {
  try {
    const json = await req.json();
    const params = composeSchema.parse(json);
    const client = getGraphClient();

    const draft = await client.createDraft({
      body: params.body,
      bodyType: params.bodyType,
      cc: params.cc,
      skipSignature: params.skipSignature,
      subject: params.subject,
      to: params.to,
      userId: params.mailbox,
    });

    return Response.json({
      draftId: draft.id,
      mailbox: params.mailbox,
      subject: draft.subject,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }
    console.error("Failed to compose email:", error);
    return Response.json({ error: "Failed to create draft" }, { status: 500 });
  }
}

/**
 * POST /api/inbox/reply — create a reply draft on an existing message
 *
 * Looks up the Graph message_id from our emails table, then creates
 * a threaded reply draft via the Graph API createReply endpoint.
 */
export async function replyToThread(req: Request): Promise<Response> {
  try {
    const json = await req.json();
    const params = replySchema.parse(json);
    const client = getGraphClient();

    // Look up the Graph message_id from our database
    const emailRow = (await db
      .query("SELECT message_id, mailbox_id FROM emails WHERE id = $1")
      .get(params.emailId)) as {
      mailbox_id: number;
      message_id: string;
    } | null;

    if (!emailRow?.message_id) {
      return Response.json(
        { error: "Email not found or missing Graph message ID" },
        { status: 404 }
      );
    }

    const draft = await client.createReplyDraft({
      body: params.body,
      bodyType: params.bodyType,
      messageId: emailRow.message_id,
      replyAll: params.replyAll,
      skipSignature: params.skipSignature,
      userId: params.mailbox,
    });

    return Response.json({
      draftId: draft.id,
      mailbox: params.mailbox,
      subject: draft.subject,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }
    console.error("Failed to create reply draft:", error);
    return Response.json(
      { error: "Failed to create reply draft" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/send — send an existing draft
 *
 * Sends a previously created draft via the Graph API.
 * The draft must exist in the specified mailbox's Drafts folder.
 */
export async function sendDraftEmail(req: Request): Promise<Response> {
  try {
    const json = await req.json();
    const params = sendSchema.parse(json);
    const client = getGraphClient();

    await client.sendDraft(params.draftId, params.mailbox);

    return Response.json({ sent: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }
    console.error("Failed to send draft:", error);
    return Response.json({ error: "Failed to send draft" }, { status: 500 });
  }
}

/**
 * GET /api/inbox/mailboxes — list writable mailboxes
 *
 * Returns the list of mailboxes that can be used for composing/replying.
 */
export function listWritableMailboxes(_req: Request): Response {
  const mailboxes = WRITABLE_MAILBOXES.map((email) => ({
    email,
    label: email.split("@")[0] ?? email,
  }));
  return Response.json({ mailboxes });
}
