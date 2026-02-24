/**
 * Email notifications for inspection processing results.
 *
 * Sends success/failure notification emails via Cloudflare Email Routing.
 */

import { EmailMessage } from "cloudflare:email";

export interface NotificationData {
  contractor: string;
  error?: string;
  fileName: string;
  folderPath: string;
  project: string;
  sharePointUrl?: string;
  siteName: string;
  success: boolean;
}

export async function sendNotification(
  sendEmail: SendEmail,
  data: NotificationData
): Promise<void> {
  const status = data.success ? "SUCCESS" : "FAILED";
  const subject = `[Inspection ${status}] ${data.contractor} - ${data.project}`;
  const htmlBody = buildNotificationHtml(data);

  try {
    const messageId = `${Date.now()}.${crypto.randomUUID()}@desertservices.app`;
    const date = new Date().toUTCString();

    const rawEmail = [
      `From: "Inspection Router" <inspections@desertservices.app>`,
      "To: chi@desertservices.net",
      `Subject: ${subject}`,
      `Date: ${date}`,
      `Message-ID: <${messageId}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      htmlBody,
    ].join("\r\n");

    const message = new EmailMessage(
      "inspections@desertservices.app",
      "chi@desertservices.net",
      rawEmail
    );
    await sendEmail.send(message);
    console.log(`[Worker] Notification sent: ${subject}`);
  } catch (error) {
    console.error(`[Worker] Failed to send notification: ${error}`);
  }
}

// =============================================================================
// HTML Templates
// =============================================================================

const SHARED_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
  .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
  .field { margin-bottom: 12px; }
  .label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
  .value { font-size: 16px; margin-top: 2px; }`;

function field(label: string, value: string): string {
  return `<div class="field"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function buildSuccessHtml(data: NotificationData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${SHARED_STYLES}
    .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="header"><h2 style="margin:0;">Inspection Uploaded Successfully</h2></div>
  <div class="content">
    ${field("Contractor", data.contractor)}
    ${field("Project", data.project)}
    ${field("File", data.fileName)}
    ${field("Folder", data.folderPath)}
    <a href="${data.sharePointUrl}" class="btn">View Folder in SharePoint</a>
  </div>
</body>
</html>`;
}

function buildFailureHtml(data: NotificationData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${SHARED_STYLES}
    .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .error { background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; color: #991b1b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header"><h2 style="margin:0;">Inspection Upload Failed</h2></div>
  <div class="content">
    ${field("Contractor", data.contractor)}
    ${field("Project", data.project)}
    ${field("Site Name", data.siteName)}
    ${field("File", data.fileName)}
    ${field("Folder", data.folderPath)}
    <div class="error"><strong>Error:</strong> ${data.error}</div>
  </div>
</body>
</html>`;
}

export function buildNotificationHtml(data: NotificationData): string {
  return data.success ? buildSuccessHtml(data) : buildFailureHtml(data);
}
