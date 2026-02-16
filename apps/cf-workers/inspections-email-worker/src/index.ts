/// <reference types="@cloudflare/workers-types" />

/**
 * Desert Services Inspection Report Email Worker
 *
 * Receives ComplianceGo inspection emails, generates PDFs using Browser Rendering,
 * and uploads to SharePoint - all within the worker.
 *
 * Email: inspections@desertservices.app
 * Worker: inspection-router.cheez2012.workers.dev
 */

import type { NotificationData } from "./notification";
import { buildNotificationHtml, sendNotification } from "./notification";
import type { InspectionData } from "./parser";
import {
  formatFilename,
  parseComplianceGoEmail,
  parseRawEmail,
  parseSiteName,
  shouldProcessEmail,
  siteNameToSharePointPath,
} from "./parser";
import { generatePdf } from "./pdf";
import { uploadToSharePoint } from "./sharepoint";

// =============================================================================
// Types
// =============================================================================

export interface Env {
  BROWSER: Fetcher;
  SEND_EMAIL: SendEmail;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/test-email") {
      return handleTestEmail(env, url);
    }

    if (url.pathname === "/preview") {
      return handlePreview(url);
    }

    return new Response("Inspection Router Worker", {
      headers: { "Content-Type": "text/plain" },
    });
  },

  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext
  ) {
    const from = message.from;
    const subject = message.headers.get("subject") ?? "";
    const forwardTo = "chi@desertservices.net";

    console.log(`[Worker] Email from: ${from}`);
    console.log(`[Worker] Subject: ${subject}`);

    try {
      if (!shouldProcessEmail(from)) {
        console.log("[Worker] Not from allowed sender, forwarding");
        await message.forward(forwardTo);
        return;
      }

      const rawEmailBuffer = await streamToArrayBuffer(message.raw);
      const decoded = await parseRawEmail(rawEmailBuffer);

      console.log(
        `[Worker] Decoded email - HTML: ${decoded.html.length} chars, Text: ${decoded.text.length} chars`
      );

      const inspection = parseComplianceGoEmail(decoded.html, decoded.text);

      if (!inspection) {
        console.log("[Worker] No ComplianceGo report URL found, forwarding");
        await message.forward(forwardTo);
        return;
      }

      console.log("[Worker] ComplianceGo inspection detected!");
      console.log(`[Worker] Site: ${inspection.siteName}`);
      console.log(`[Worker] Date: ${inspection.inspectionDate.toISOString()}`);
      console.log(`[Worker] Report URL: ${inspection.reportUrl}`);

      ctx.waitUntil(
        processInspection(env, inspection).catch((err) =>
          console.error(`[Worker] Processing failed: ${err}`)
        )
      );

      await message.forward(forwardTo);
      console.log(`[Worker] Email forwarded to: ${forwardTo}`);
    } catch (error) {
      console.error(`[Worker] Error: ${error}`);
      try {
        await message.forward(forwardTo);
      } catch (forwardError) {
        console.error(`[Worker] Forward also failed: ${forwardError}`);
      }
    }
  },
};

// =============================================================================
// Main Processing
// =============================================================================

async function processInspection(
  env: Env,
  inspection: InspectionData
): Promise<void> {
  const year = inspection.inspectionDate.getFullYear();
  const folderPath = siteNameToSharePointPath(inspection.siteName, year);
  const fileName = formatFilename(inspection.inspectionDate);
  const parsed = parseSiteName(inspection.siteName);
  const contractor = parsed?.contractor ?? "UNKNOWN";
  const project = parsed?.project ?? "UNKNOWN";

  const baseData = {
    siteName: inspection.siteName,
    contractor,
    project,
    fileName,
    folderPath: folderPath ?? "N/A",
  };

  if (!folderPath) {
    console.error(
      `[Worker] Could not determine folder for: ${inspection.siteName}`
    );
    await sendNotification(env.SEND_EMAIL, {
      ...baseData,
      success: false,
      error: "Could not determine SharePoint folder path",
    });
    return;
  }

  try {
    console.log("[Worker] Generating PDF...");
    const pdfBuffer = await generatePdf(env.BROWSER, inspection.reportUrl);
    console.log(`[Worker] PDF generated: ${pdfBuffer.byteLength} bytes`);

    console.log("[Worker] Uploading to SharePoint...");
    const result = await uploadToSharePoint(
      {
        tenantId: env.AZURE_TENANT_ID,
        clientId: env.AZURE_CLIENT_ID,
        clientSecret: env.AZURE_CLIENT_SECRET,
      },
      folderPath,
      fileName,
      pdfBuffer
    );

    if (result.success) {
      console.log(`[Worker] Uploaded: ${result.webUrl}`);
      await sendNotification(env.SEND_EMAIL, {
        ...baseData,
        success: true,
        sharePointUrl: result.webUrl,
      });
    } else {
      console.error(`[Worker] Upload failed: ${result.error}`);
      await sendNotification(env.SEND_EMAIL, {
        ...baseData,
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error(`[Worker] Processing error: ${error}`);
    await sendNotification(env.SEND_EMAIL, {
      ...baseData,
      success: false,
      error: String(error),
    });
  }
}

// =============================================================================
// HTTP Test Handlers
// =============================================================================

const TEST_DATA: NotificationData = {
  success: true,
  siteName: "ARCO - KTEC PHX",
  contractor: "ARCO",
  project: "KTEC PHX",
  fileName: "01.22.26.pdf",
  folderPath: "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M/ARCO/KTEC PHX/2026",
  sharePointUrl:
    "https://desertservices.sharepoint.com/sites/DataDrive/Shared%20Documents/SWPPP/INSPECTIONS/PROJECTS/PROJECTS%20A-M/ARCO/KTEC%20PHX/2026",
};

function buildTestData(type: string): NotificationData {
  if (type === "failure") {
    return {
      ...TEST_DATA,
      success: false,
      error: "Test error: Could not connect to SharePoint",
    };
  }
  return TEST_DATA;
}

async function handleTestEmail(env: Env, url: URL): Promise<Response> {
  const type = url.searchParams.get("type") ?? "success";
  await sendNotification(env.SEND_EMAIL, buildTestData(type));
  return new Response(`Test ${type} email sent to chi@desertservices.net`, {
    headers: { "Content-Type": "text/plain" },
  });
}

function handlePreview(url: URL): Response {
  const type = url.searchParams.get("type") ?? "success";
  return new Response(buildNotificationHtml(buildTestData(type)), {
    headers: { "Content-Type": "text/html" },
  });
}

// =============================================================================
// Utilities
// =============================================================================

async function streamToArrayBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  let result = await reader.read();
  while (!result.done) {
    chunks.push(result.value);
    result = await reader.read();
  }

  let length = 0;
  for (const c of chunks) {
    length += c.length;
  }

  const combined = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  return combined.buffer;
}
