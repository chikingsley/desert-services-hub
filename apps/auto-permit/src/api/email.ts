/**
 * Email API Handlers
 *
 * Plain handler functions for email operations.
 */

import { GraphEmailClient } from "@email/client";
import {
  getLogoAttachment,
  getTemplate,
  listTemplates,
  type TemplateVars,
} from "@email/templates/index";
import type { SendEmailOptions } from "@email/types";

// ============================================
// Email Client (Lazy Loaded)
// ============================================

let emailClient: GraphEmailClient | null = null;

async function getClient(): Promise<GraphEmailClient> {
  if (!emailClient) {
    const config = {
      azureTenantId: process.env.AZURE_TENANT_ID || "",
      azureClientId: process.env.AZURE_CLIENT_ID || "",
      azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
    };
    emailClient = new GraphEmailClient(config);
    await emailClient.initUserAuth().catch(() => {
      emailClient?.initAppAuth();
    });
  }
  return emailClient;
}

// ============================================
// Types
// ============================================

interface Recipient {
  email: string;
  name?: string;
}

interface SendEmailBody {
  to: string | Recipient[];
  cc?: string | Recipient[];
  subject?: string;
  templateName?: string;
  templateVars?: Record<string, string>;
  body?: string;
  bodyType?: "html" | "text";
  includeLogo?: boolean;
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
  }>;
}

interface SwpppEmailBody {
  recipientEmail: string;
  ccEmail?: string;
  recipientName?: string;
  templateName?: string;
  subject?: string;
  accountName?: string;
  projectName?: string;
  siteAddress?: string;
  applicationNumber?: string;
  permitNumber?: string;
  acreage?: string | number;
  issueDate?: string;
  expirationDate?: string;
  actionStatus?: string;
  permitStatus?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  permitCost?: string;
  scheduleValue?: string;
  swpppNoi?: string;
  inspectionFrequency?: string;
  stabilizationMeasures?: string;
  messageBody?: string;
  bodyContent?: string;
}

// ============================================
// Helpers
// ============================================

function normalizeRecipients(input: string | Recipient[]): Recipient[] {
  return Array.isArray(input) ? input : [{ email: input }];
}

// ============================================
// Handlers
// ============================================

/**
 * GET /api/email/templates - List available templates
 */
export async function handleListTemplates(): Promise<Response> {
  const templates = await listTemplates();
  return Response.json({ templates });
}

/**
 * POST /api/email/send - Send an email
 */
export async function handleSendEmail(body: SendEmailBody): Promise<Response> {
  const {
    to,
    cc,
    subject,
    templateName,
    templateVars,
    body: plainBody,
    bodyType = "html",
    includeLogo = true,
    attachments: inputAttachments,
  } = body;

  if (!(templateName || plainBody)) {
    return Response.json(
      { success: false, error: "Either templateName or body must be provided" },
      { status: 400 }
    );
  }

  try {
    const client = await getClient();
    let finalBody = plainBody || "";
    const attachments = inputAttachments || [];

    if (templateName) {
      finalBody = await getTemplate(
        templateName,
        (templateVars || {}) as TemplateVars
      );
      if (includeLogo) {
        try {
          const logo = await getLogoAttachment();
          attachments.push(logo);
        } catch {
          // Logo attachment failed, continue without it
        }
      }
    }

    const toRecipients = normalizeRecipients(to);
    const ccRecipients = cc ? normalizeRecipients(cc) : undefined;
    const finalSubject =
      subject || (templateName ? `Update: ${templateName}` : "New Message");

    const options: SendEmailOptions = {
      to: toRecipients,
      cc: ccRecipients,
      subject: finalSubject,
      body: finalBody,
      bodyType: templateName ? "html" : (bodyType as "html" | "text"),
      attachments,
    };

    await client.sendEmail(options);

    return Response.json({
      success: true,
      status: "sent",
      recipient: toRecipients[0]?.email || "unknown",
      subject: options.subject,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * POST /swppp-plan-notifications - Send SWPPP notification email
 */
export async function handleSwpppEmail(
  body: SwpppEmailBody
): Promise<Response> {
  try {
    console.log("📨 Received SWPPP email request:", body);

    const subject =
      body.subject ||
      `SWPPP Notification: ${body.projectName || "New Project"}`;
    const templateName = body.templateName;

    const client = await getClient();
    let finalBody = body.bodyContent || body.messageBody || "";
    const attachments: Array<{
      name: string;
      contentType: string;
      contentBytes: string;
    }> = [];

    if (templateName) {
      const templateVars: TemplateVars = {
        recipientName: body.recipientName || "Valued Customer",
        accountName: body.accountName || "",
        projectName: body.projectName || "",
        applicationNumber: body.applicationNumber || "",
        permitNumber: body.permitNumber || "",
        siteAddress: body.siteAddress || "",
        acreage: body.acreage ? String(body.acreage) : "",
        issueDate: body.issueDate || "",
        expirationDate: body.expirationDate || "",
        actionStatus: body.actionStatus || "",
        permitStatus: body.permitStatus || "",
        invoiceNumber: body.invoiceNumber || "",
        invoiceDate: body.invoiceDate || "",
        permitCost: body.permitCost || "",
        scheduleValue: body.scheduleValue || "",
        swpppNoi: body.swpppNoi || "",
        inspectionFrequency: body.inspectionFrequency || "",
        stabilizationMeasures: body.stabilizationMeasures || "",
        body: body.messageBody || "",
      };
      finalBody = await getTemplate(templateName, templateVars);
      try {
        const logo = await getLogoAttachment();
        attachments.push(logo);
      } catch {
        // Logo attachment failed, continue without it
      }
    }

    const toRecipients = [{ email: body.recipientEmail }];
    const ccRecipients = body.ccEmail ? [{ email: body.ccEmail }] : undefined;

    const options: SendEmailOptions = {
      to: toRecipients,
      cc: ccRecipients,
      subject,
      body: finalBody,
      bodyType: templateName ? "html" : "text",
      attachments,
    };

    await client.sendEmail(options);

    return Response.json({
      success: true,
      message: "Email queued successfully",
      details: {
        success: true,
        status: "sent",
        recipient: body.recipientEmail,
        subject,
      },
    });
  } catch (error) {
    console.error("❌ Error sending SWPPP email:", error);
    const errorMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return Response.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * Internal function for sending emails (used by other modules)
 */
export async function sendEmailInternal(params: {
  to: string | Recipient[];
  cc?: Recipient[];
  subject?: string;
  templateName?: string;
  templateVars?: TemplateVars;
  body?: string;
}): Promise<{
  success: boolean;
  status: string;
  recipient: string;
  subject: string;
}> {
  const {
    to,
    cc,
    subject,
    templateName,
    templateVars,
    body: plainBody,
  } = params;

  const client = await getClient();
  let finalBody = plainBody || "";
  const attachments: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
  }> = [];

  if (templateName) {
    finalBody = await getTemplate(templateName, templateVars || {});
    try {
      const logo = await getLogoAttachment();
      attachments.push(logo);
    } catch {
      // Logo attachment failed, continue without it
    }
  }

  const toRecipients = normalizeRecipients(to);
  const finalSubject =
    subject || (templateName ? `Update: ${templateName}` : "New Message");

  const options: SendEmailOptions = {
    to: toRecipients,
    cc,
    subject: finalSubject,
    body: finalBody,
    bodyType: templateName ? "html" : "text",
    attachments,
  };

  await client.sendEmail(options);

  return {
    success: true,
    status: "sent",
    recipient: toRecipients[0]?.email || "unknown",
    subject: options.subject,
  };
}
