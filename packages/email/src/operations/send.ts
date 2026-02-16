/**
 * Email send operations.
 *
 * Compose and send emails, reply, create drafts,
 * forward messages. All operations that produce outgoing mail.
 */

import {
  getLogoAttachment,
  wrapWithSignature,
} from "@email/email-templates/index";
import type {
  GraphClientContext,
  SendEmailAttachment,
  SendEmailOptions,
} from "@email/types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Require user auth for send operations.
 * App auth doesn't have Mail.Send permission.
 */
function requireUserAuthForSend(ctx: GraphClientContext): void {
  if (ctx.authMode !== "user") {
    throw new Error(
      "Sending emails requires user authentication (delegated). Call initUserAuth() first."
    );
  }
}

/**
 * Map a recipient list to the Graph API emailAddress format.
 */
function toGraphRecipients(
  recipients: { email: string; name?: string }[]
): { emailAddress: { address: string; name: string } }[] {
  return recipients.map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));
}

/**
 * Convert a `SendEmailAttachment` to the Graph API file-attachment shape.
 */
function toGraphAttachment(att: SendEmailAttachment): Record<string, unknown> {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    contentBytes: att.contentBytes,
    contentType: att.contentType,
    name: att.name,
    ...(att.contentId && { contentId: att.contentId }),
    ...(att.isInline && { isInline: true }),
  };
}

/**
 * Wrap body with the Desert Services email signature and return the resolved
 * body type plus any inline logo attachment that should be included.
 *
 * When `skipSignature` is true the body is returned unchanged, preserving the
 * caller-specified `bodyType` (defaulting to "text").
 */
async function prepareBody(
  body: string,
  options: { bodyType?: "html" | "text"; skipSignature?: boolean }
): Promise<{
  body: string;
  bodyType: "html" | "text";
  logoAttachment: SendEmailAttachment | null;
}> {
  if (options.skipSignature) {
    return {
      body,
      bodyType: options.bodyType ?? "text",
      logoAttachment: null,
    };
  }

  const wrappedBody = await wrapWithSignature(body);
  const logo = await getLogoAttachment();

  return { body: wrappedBody, bodyType: "html", logoAttachment: logo };
}

/**
 * Build the full attachment list for Graph API from send options,
 * merging legacy single attachment, multi-attachments array, and the
 * optional inline logo.
 */
function buildAttachmentList(
  options: SendEmailOptions,
  logoAttachment: SendEmailAttachment | null
): Record<string, unknown>[] {
  const attachments: Record<string, unknown>[] = [];

  // Legacy single attachment support
  if (options.attachment) {
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      contentBytes: options.attachment.contentBytes,
      contentType: options.attachment.contentType,
      name: options.attachment.name,
    });
  }

  for (const att of options.attachments ?? []) {
    attachments.push(toGraphAttachment(att));
  }

  if (logoAttachment) {
    const alreadyHasLogo = attachments.some((a) => a.contentId === "logo");
    if (!alreadyHasLogo) {
      attachments.push(toGraphAttachment(logoAttachment));
    }
  }

  return attachments;
}

/**
 * Collect logo + user-provided attachments into a flat list, then upload
 * each to a Graph draft message via the attachments endpoint.
 */
async function uploadAttachments(
  client: ReturnType<GraphClientContext["getClient"]>,
  messagesPath: string,
  draftId: string,
  logoAttachment: SendEmailAttachment | null,
  userAttachments?: SendEmailAttachment[]
): Promise<void> {
  const all: SendEmailAttachment[] = [];

  if (logoAttachment) {
    all.push(logoAttachment);
  }

  if (userAttachments?.length) {
    all.push(...userAttachments);
  }

  for (const att of all) {
    await client
      .api(`${messagesPath}/${draftId}/attachments`)
      .post(toGraphAttachment(att));
  }
}

// ---------------------------------------------------------------------------
// Exported operations
// ---------------------------------------------------------------------------

/**
 * Send an email with optional attachments.
 *
 * Automatically adds a signature and company logo unless skipSignature is true.
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param options - Email configuration
 * @param options.to - Array of recipients with email and optional name
 * @param options.cc - Optional array of CC recipients
 * @param options.subject - Email subject line
 * @param options.body - Email body content (plain text or HTML)
 * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
 * @param options.attachment - Single attachment (legacy, use attachments instead)
 * @param options.attachments - Array of attachments with name, contentType, and base64 contentBytes
 * @param options.skipSignature - Skip automatic signature and logo (default: false)
 * @returns Promise that resolves when email is sent
 *
 * @example
 * await sendEmail(ctx, {
 *   to: [{ email: 'recipient@example.com', name: 'John Doe' }],
 *   subject: 'Meeting Follow-up',
 *   body: 'Thanks for meeting today. Here are the action items...',
 * });
 *
 * @example
 * // With attachments and no signature
 * await sendEmail(ctx, {
 *   to: [{ email: 'recipient@example.com' }],
 *   cc: [{ email: 'manager@example.com' }],
 *   subject: 'Report Attached',
 *   body: '<h1>Monthly Report</h1><p>Please find attached.</p>',
 *   bodyType: 'html',
 *   skipSignature: true,
 *   attachments: [{
 *     name: 'report.pdf',
 *     contentType: 'application/pdf',
 *     contentBytes: base64EncodedContent,
 *   }],
 * });
 */
export async function sendEmail(
  ctx: GraphClientContext,
  options: SendEmailOptions
): Promise<void> {
  requireUserAuthForSend(ctx);
  const client = ctx.getClient();

  const prepared = await prepareBody(options.body, options);
  const attachments = buildAttachmentList(options, prepared.logoAttachment);

  const message: Record<string, unknown> = {
    body: { content: prepared.body, contentType: prepared.bodyType },
    subject: options.subject,
    toRecipients: toGraphRecipients(options.to),
  };

  if (options.cc?.length) {
    message.ccRecipients = toGraphRecipients(options.cc);
  }

  if (attachments.length > 0) {
    message.attachments = attachments;
  }

  const draftResponse = (await client.api("/me/messages").post(message)) as {
    id: string;
  };

  await client.api(`/me/messages/${draftResponse.id}/send`).post({});
}

/**
 * Reply to an email message.
 *
 * Uses the Graph API reply/replyAll endpoint which handles threading
 * automatically. Adds signature unless skipSignature is true.
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param options - Reply configuration
 * @param options.messageId - ID of the email to reply to
 * @param options.body - Reply body content
 * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
 * @param options.replyAll - Reply to all recipients (default: false)
 * @param options.skipSignature - Skip automatic signature (default: false)
 * @returns Promise that resolves when reply is sent
 *
 * @example
 * await replyToEmail(ctx, {
 *   messageId: 'AAMkAGI2...',
 *   body: 'Thanks for your message. I will follow up tomorrow.',
 * });
 *
 * @example
 * // Reply all
 * await replyToEmail(ctx, {
 *   messageId: 'AAMkAGI2...',
 *   body: 'Adding everyone to this thread.',
 *   replyAll: true,
 * });
 */
export async function replyToEmail(
  ctx: GraphClientContext,
  options: {
    messageId: string;
    body: string;
    bodyType?: "html" | "text";
    replyAll?: boolean;
    skipSignature?: boolean;
    userId?: string;
  }
): Promise<void> {
  requireUserAuthForSend(ctx);
  const client = ctx.getClient();
  const action = options.replyAll ? "replyAll" : "reply";

  const prepared = await prepareBody(options.body, options);

  const message: Record<string, unknown> = {
    body: { content: prepared.body, contentType: prepared.bodyType },
  };

  if (prepared.logoAttachment) {
    message.attachments = [toGraphAttachment(prepared.logoAttachment)];
  }

  await client
    .api(`/me/messages/${options.messageId}/${action}`)
    .post({ message });
}

/**
 * Create a draft email (not sent).
 *
 * Automatically adds a signature and company logo unless skipSignature is true.
 *
 * @param ctx - Graph client context
 * @param options - Draft configuration
 * @param options.subject - Email subject line
 * @param options.body - Email body content
 * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
 * @param options.to - Optional array of recipients
 * @param options.cc - Optional array of CC recipients
 * @param options.attachments - Optional array of attachments
 * @param options.skipSignature - Skip automatic signature and logo (default: false)
 * @param options.userId - Email address of the mailbox (required for app auth)
 * @returns Promise resolving to object with draft id and subject
 *
 * @example
 * const draft = await createDraft(ctx, {
 *   subject: 'Meeting Notes',
 *   body: 'Here are the notes from today...',
 *   to: [{ email: 'team@example.com' }],
 *   userId: 'user@example.com',
 * });
 * console.log(`Created draft: ${draft.id}`);
 */
export async function createDraft(
  ctx: GraphClientContext,
  options: {
    subject: string;
    body: string;
    bodyType?: "html" | "text";
    to?: { email: string; name?: string }[];
    cc?: { email: string; name?: string }[];
    attachments?: {
      name: string;
      contentType: string;
      contentBytes: string;
      contentId?: string;
      isInline?: boolean;
    }[];
    skipSignature?: boolean;
    userId?: string;
  }
): Promise<{ id: string; subject: string }> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(options.userId);

  const prepared = await prepareBody(options.body, options);

  const message: Record<string, unknown> = {
    body: { content: prepared.body, contentType: prepared.bodyType },
    subject: options.subject,
  };

  if (options.to?.length) {
    message.toRecipients = toGraphRecipients(options.to);
  }

  if (options.cc?.length) {
    message.ccRecipients = toGraphRecipients(options.cc);
  }

  const response = await client.api(`${basePath}/messages`).post(message);
  const draftId = response.id as string;

  await uploadAttachments(
    client,
    `${basePath}/messages`,
    draftId,
    prepared.logoAttachment,
    options.attachments
  );

  return { id: draftId, subject: response.subject as string };
}

/**
 * Send an existing draft.
 *
 * @param ctx - Graph client context
 * @param draftId - The ID of the draft message to send
 * @param userId - Email address of the mailbox (required for app auth)
 * @returns Promise that resolves when draft is sent
 *
 * @example
 * const draft = await createDraft(ctx, { subject: 'Test', body: 'Hello' });
 * await sendDraft(ctx, draft.id);
 */
export async function sendDraft(
  ctx: GraphClientContext,
  draftId: string,
  userId?: string
): Promise<void> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(userId);
  await client.api(`${basePath}/messages/${draftId}/send`).post({});
}

/**
 * Create a reply draft to an existing email.
 *
 * Creates a draft reply (not sent) that can be edited and sent later.
 * Uses the Graph API createReply endpoint which preserves the conversation thread.
 *
 * @param ctx - Graph client context
 * @param options - Reply draft options
 * @param options.messageId - ID of the message to reply to
 * @param options.body - Reply body content
 * @param options.bodyType - Body format: 'html' or 'text' (default: 'text')
 * @param options.replyAll - If true, creates reply-all draft (default: false)
 * @param options.attachments - Optional file attachments
 * @param options.userId - Email address of the mailbox (required for app auth)
 * @param options.skipSignature - If true, don't auto-add signature (default: false)
 * @returns Promise resolving to object with draft id and subject
 *
 * @example
 * const draft = await createReplyDraft(ctx, {
 *   messageId: 'AAMkAG...',
 *   body: 'Thanks for the update!',
 *   userId: 'chi@desertservices.net'
 * });
 * // Draft is now in Drafts folder, can be sent with sendDraft(ctx, draft.id)
 */
export async function createReplyDraft(
  ctx: GraphClientContext,
  options: {
    messageId: string;
    body: string;
    bodyType?: "html" | "text";
    replyAll?: boolean;
    to?: { email: string; name?: string }[];
    cc?: { email: string; name?: string }[];
    attachments?: {
      name: string;
      contentType: string;
      contentBytes: string;
      contentId?: string;
      isInline?: boolean;
    }[];
    userId: string;
    skipSignature?: boolean;
  }
): Promise<{ id: string; subject: string }> {
  const client = ctx.getClient();
  const basePath = ctx.getBasePath(options.userId);
  const action = options.replyAll ? "createReplyAll" : "createReply";

  // Step 1: Create the reply draft (empty body initially)
  const draftResponse = await client
    .api(`${basePath}/messages/${options.messageId}/${action}`)
    .post({});

  const draftId = draftResponse.id as string;
  const subject = draftResponse.subject as string;

  // Step 2: Update the draft with body content and optional recipients
  const prepared = await prepareBody(options.body, options);

  const patchPayload: Record<string, unknown> = {
    body: { content: prepared.body, contentType: prepared.bodyType },
  };

  if (options.to?.length) {
    patchPayload.toRecipients = toGraphRecipients(options.to);
  }

  if (options.cc?.length) {
    patchPayload.ccRecipients = toGraphRecipients(options.cc);
  }

  await client.api(`${basePath}/messages/${draftId}`).patch(patchPayload);

  // Step 3: Upload attachments
  await uploadAttachments(
    client,
    `${basePath}/messages`,
    draftId,
    prepared.logoAttachment,
    options.attachments
  );

  return { id: draftId, subject };
}

/**
 * Forward an email to one or more recipients.
 *
 * Requires user authentication (delegated).
 *
 * @param ctx - Graph client context
 * @param messageId - The ID of the email to forward
 * @param to - Array of recipients with email and optional name
 * @param comment - Optional comment to add above the forwarded content
 * @returns Promise that resolves when email is forwarded
 *
 * @example
 * await forwardEmail(
 *   ctx,
 *   'AAMkAGI2...',
 *   [{ email: 'colleague@example.com', name: 'John' }],
 *   'FYI - see the thread below.'
 * );
 */
export async function forwardEmail(
  ctx: GraphClientContext,
  messageId: string,
  to: { email: string; name?: string }[],
  comment?: string
): Promise<void> {
  requireUserAuthForSend(ctx);
  const client = ctx.getClient();

  const body: Record<string, unknown> = {
    toRecipients: toGraphRecipients(to),
  };

  if (comment) {
    body.comment = comment;
  }

  await client.api(`/me/messages/${messageId}/forward`).post(body);
}
