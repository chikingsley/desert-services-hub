/**
 * Invoice API Handlers
 *
 * HTTP handlers for searching invoices and downloading invoice PDFs.
 * Uses shared browser session for performance.
 */

import { z } from "zod";
import { downloadInvoicePdf } from "@/portal/invoice";
import {
  ensureBrowserSessionReady,
  getSessionPageAndContext,
  withBrowserSessionOperation,
} from "@/portal/utils/browser";

const log = (msg: string) => process.stderr.write(`${msg}\n`);

// ============================================
// Schemas
// ============================================

export const invoicePdfSchema = z.object({
  invoiceNumber: z
    .string()
    .trim()
    .min(1)
    .describe("Invoice number to download (e.g., IV087334)"),
  outputDir: z
    .string()
    .optional()
    .describe("Directory to save PDF (default: tests/output/invoices)"),
});

export type InvoicePdfInput = z.infer<typeof invoicePdfSchema>;

export interface InvoicePdfResult {
  success: boolean;
  invoiceNumber: string;
  pdfPath?: string;
  pdfUrl?: string;
  pdfBase64?: string;
  error?: string;
}

// ============================================
// Helpers
// ============================================

function jsonError(error: string, status = 400): Response {
  return Response.json(
    { error, success: false, timestamp: new Date().toISOString() },
    { status }
  );
}

function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

async function ensureBrowserSession(): Promise<
  | {
      success: true;
      page: NonNullable<ReturnType<typeof getSessionPageAndContext>>;
    }
  | { success: false; error: string }
> {
  const session = await ensureBrowserSessionReady();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { error: "No browser session available", success: false };
  }

  if (!(session.isLoggedIn && session.portalReady)) {
    return { error: "Failed to login to portal", success: false };
  }

  return { page: ctx, success: true };
}

async function readFileBase64(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer();
  return Buffer.from(bytes).toString("base64");
}

// ============================================
// Handlers
// ============================================

/**
 * POST /api/invoices/pdf - Download an invoice PDF by invoice number
 */
export async function handleInvoicePdf(body: unknown): Promise<Response> {
  log("\n🧾 INVOICE PDF request");

  const parsed = invoicePdfSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { invoiceNumber, outputDir } = parsed.data;
  log(`   Invoice: ${invoiceNumber}`);

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page } = sessionResult.page;

    // Attempt download once; if session expired unexpectedly, re-login and retry.
    let result = await withBrowserSessionOperation(
      `invoice:${invoiceNumber}`,
      async () => await downloadInvoicePdf(page, invoiceNumber, { outputDir })
    );
    if (
      !result.success &&
      result.error?.toLowerCase().includes("not logged in")
    ) {
      log("   ✗ Session appears expired; attempting re-login and retry...");
      const refreshed = await ensureBrowserSessionReady({ forceRelogin: true });
      if (refreshed.isLoggedIn && refreshed.portalReady) {
        result = await withBrowserSessionOperation(
          `invoice:${invoiceNumber}:retry`,
          async () =>
            await downloadInvoicePdf(page, invoiceNumber, { outputDir })
        );
      }
    }

    if (!(result.success && result.pdfPath)) {
      const err =
        typeof result.error === "string" && result.error.trim().length > 0
          ? result.error.trim()
          : "Invoice PDF download failed";
      return jsonError(err, 500);
    }

    const pdfBase64 = await readFileBase64(result.pdfPath);

    return jsonSuccess({
      invoiceNumber,
      pdfBase64,
      pdfPath: result.pdfPath,
      pdfUrl: result.pdfUrl,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}
