/**
 * Notification Delivery
 *
 * Converts detected events into Outlook drafts using Microsoft Graph.
 */

import { GraphEmailClient } from "@email/client";
import { getLogoAttachment, getTemplate } from "@email/email-templates/index";
import type { PendingEvent } from "@/apps/workers/notifications/lib/events";
import type { StakeholderRecipient } from "@/apps/workers/notifications/lib/stakeholders";

export type NotificationDeliveryMode = "log" | "draft";

interface RoutedRecipients {
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
}

interface DraftContent {
  body: string;
  bodyType: "html" | "text";
  skipSignature: boolean;
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
    contentId?: string;
    isInline?: boolean;
  }>;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function requireEnvVar(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function stringValue(value: unknown, fallback = "N/A"): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

function formatDate(value: unknown, fallback = "TBD"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(DATE_ONLY_RE);
  if (dateOnlyMatch) {
    const year = Number.parseInt(dateOnlyMatch[1], 10);
    const month = Number.parseInt(dateOnlyMatch[2], 10);
    const day = Number.parseInt(dateOnlyMatch[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dedupeRecipients(
  recipients: Array<{ email: string; name?: string }>
): Array<{ email: string; name?: string }> {
  const byEmail = new Map<string, { email: string; name?: string }>();
  for (const recipient of recipients) {
    const normalizedEmail = recipient.email.trim().toLowerCase();
    if (!normalizedEmail) {
      continue;
    }
    if (!byEmail.has(normalizedEmail)) {
      byEmail.set(normalizedEmail, {
        email: recipient.email.trim(),
        ...(recipient.name ? { name: recipient.name } : {}),
      });
    }
  }
  return [...byEmail.values()];
}

function routeStakeholders(
  stakeholders: StakeholderRecipient[]
): RoutedRecipients {
  const toRecipients: Array<{ email: string; name?: string }> = [];
  const ccRecipients: Array<{ email: string; name?: string }> = [];

  for (const stakeholder of stakeholders) {
    const recipient = {
      email: stakeholder.email,
      ...(stakeholder.name ? { name: stakeholder.name } : {}),
    };
    const role = stakeholder.role?.toLowerCase() ?? "";
    if (role.includes("cc")) {
      ccRecipients.push(recipient);
    } else {
      toRecipients.push(recipient);
    }
  }

  const dedupedTo = dedupeRecipients(toRecipients);
  let dedupedCc = dedupeRecipients(ccRecipients).filter(
    (cc) =>
      !dedupedTo.some((to) => to.email.toLowerCase() === cc.email.toLowerCase())
  );

  // Graph drafts should always have at least one TO recipient.
  if (dedupedTo.length === 0 && dedupedCc.length > 0) {
    const firstCc = dedupedCc[0];
    if (firstCc) {
      dedupedTo.push(firstCc);
      dedupedCc = dedupedCc.slice(1);
    }
  }

  return { to: dedupedTo, cc: dedupedCc };
}

async function buildDustPermitDraft(
  event: PendingEvent
): Promise<DraftContent> {
  const metadata = event.metadata;
  const logo = await getLogoAttachment();

  if (event.eventType === "dust_permit_submitted") {
    const body = await getTemplate("dust-permit-submitted", {
      recipientName: "Team",
      accountName: stringValue(
        metadata.companyName,
        "Desert Services Customer"
      ),
      projectName: stringValue(metadata.projectName, "Unknown Project"),
      applicationNumber: stringValue(metadata.permitId, event.refId),
      siteAddress: stringValue(metadata.address, "TBD"),
      acreage: stringValue(metadata.acreage, "N/A"),
      facilityId: metadata.facilityId ? stringValue(metadata.facilityId) : "",
    });

    // Include the dust application PDF if available
    const fileAttachments = Array.isArray(metadata.attachments)
      ? (metadata.attachments as Array<{
          name: string;
          contentType: string;
          contentBytes: string;
        }>)
      : [];

    return {
      body,
      bodyType: "html",
      skipSignature: true,
      attachments: [logo, ...fileAttachments],
    };
  }

  if (event.eventType === "dust_permit_issued") {
    const body = await getTemplate("dust-permit-issued", {
      recipientName: "Team",
      accountName: stringValue(
        metadata.companyName,
        "Desert Services Customer"
      ),
      projectName: stringValue(metadata.projectName, "Unknown Project"),
      actionStatus: "processed and approved",
      permitStatus: stringValue(metadata.permitStatus, "Active"),
      applicationNumber: stringValue(metadata.permitId, event.refId),
      permitNumber: stringValue(metadata.permitNumber, event.refId),
      siteAddress: stringValue(metadata.address, "TBD"),
      acreage: stringValue(metadata.acreage, "N/A"),
      issueDate: formatDate(metadata.effectiveDate),
      expirationDate: formatDate(metadata.expirationDate),
      showPermitInfo: "true",
    });

    // Include PDF attachments from the original Maricopa email if available
    const fileAttachments = Array.isArray(metadata.attachments)
      ? (metadata.attachments as Array<{
          name: string;
          contentType: string;
          contentBytes: string;
        }>)
      : [];

    return {
      body,
      bodyType: "html",
      skipSignature: true,
      attachments: [logo, ...fileAttachments],
    };
  }

  if (event.eventType === "dust_permit_billing") {
    const body = await getTemplate("dust-permit-billing", {
      recipientName: "Team",
      accountName: stringValue(
        metadata.companyName,
        "Desert Services Customer"
      ),
      projectName: stringValue(metadata.projectName, "Unknown Project"),
      address: stringValue(metadata.address, "TBD"),
      applicationNumber: stringValue(metadata.permitId, event.refId),
      permitNumber: stringValue(metadata.permitNumber, "Pending"),
      acceleratedProcessing: stringValue(metadata.acceleratedProcessing, "No"),
      vendorName: "Maricopa County Air Quality Department",
      permitCost: stringValue(metadata.permitCost ?? metadata.amount, "N/A"),
      adminFee: stringValue(metadata.adminFee),
      scheduleValue: stringValue(metadata.scheduleValue, "N/A"),
      paymentMethod: metadata.cardLastFour
        ? `Card ending ${stringValue(metadata.cardLastFour)}`
        : "N/A",
      paymentDate: stringValue(metadata.paymentDate, "N/A"),
      confirmationId: stringValue(metadata.confirmationId),
      cardLastFour: stringValue(metadata.cardLastFour),
      cardholderName: stringValue(metadata.cardholderName, "Desert Services"),
      invoiceNumber: stringValue(metadata.invoiceNumber, event.refId),
      invoiceDate: stringValue(metadata.paymentDate, "N/A"),
    });

    return {
      body,
      bodyType: "html",
      skipSignature: true,
      attachments: [logo],
    };
  }

  if (event.eventType === "dust_permit_expiring") {
    const body = await getTemplate("dust-permit-reminder", {
      recipientName: "Team",
      accountName: stringValue(
        metadata.companyName,
        "Desert Services Customer"
      ),
      projectName: stringValue(metadata.projectName, "Unknown Project"),
      applicationNumber: stringValue(metadata.permitId, event.refId),
      permitNumber: stringValue(metadata.permitNumber, event.refId),
      siteAddress: stringValue(metadata.address, "TBD"),
      expirationDate: formatDate(metadata.expirationDate),
    });

    return {
      body,
      bodyType: "html",
      skipSignature: true,
      attachments: [logo],
    };
  }

  const body = [
    `Notification event: ${event.eventType}`,
    `Reference: ${event.refType}:${event.refId}`,
    "",
    "Metadata:",
    JSON.stringify(event.metadata, null, 2),
  ].join("\n");

  return {
    body,
    bodyType: "text",
    skipSignature: false,
  };
}

export function createDraftClientFromEnv(): GraphEmailClient {
  const client = new GraphEmailClient({
    azureTenantId: requireEnvVar("AZURE_TENANT_ID"),
    azureClientId: requireEnvVar("AZURE_CLIENT_ID"),
    azureClientSecret: requireEnvVar("AZURE_CLIENT_SECRET"),
  });
  client.initAppAuth();
  return client;
}

export async function createNotificationDraft(options: {
  client: GraphEmailClient;
  event: PendingEvent;
  stakeholders: StakeholderRecipient[];
  mailbox: string;
}): Promise<{ id: string; subject: string }> {
  const { client, event, stakeholders, mailbox } = options;
  const routed = routeStakeholders(stakeholders);

  if (routed.to.length === 0) {
    throw new Error("No recipients resolved for notification event");
  }

  const draft = await buildDustPermitDraft(event);

  return await client.createDraft({
    userId: mailbox,
    to: routed.to,
    cc: routed.cc.length > 0 ? routed.cc : undefined,
    subject: event.subject,
    body: draft.body,
    bodyType: draft.bodyType,
    attachments: draft.attachments,
    skipSignature: draft.skipSignature,
  });
}
