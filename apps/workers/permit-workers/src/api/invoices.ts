/**
 * Invoice API Handlers
 *
 * HTTP handlers for searching invoices and downloading invoice PDFs.
 * Uses shared browser session for performance.
 */

import { z } from "zod";
import { downloadInvoicePdf } from "@/portal/invoice";
import {
  getOrCreateBrowserSession,
  getSessionPageAndContext,
} from "@/portal/utils/browser";
import { login } from "@/portal/utils/login";

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
    { success: false, error, timestamp: new Date().toISOString() },
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
      session: Awaited<ReturnType<typeof getOrCreateBrowserSession>>;
    }
  | { success: false; error: string }
> {
  const session = await getOrCreateBrowserSession();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { success: false, error: "No browser session available" };
  }

  if (!session.isLoggedIn) {
    log("   ✗ Not logged in - attempting re-login...");
    const loggedIn = await login(ctx.page);
    if (!loggedIn) {
      return { success: false, error: "Failed to login to portal" };
    }
    session.isLoggedIn = true;
  }

  return { success: true, page: ctx, session };
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
    const { session } = sessionResult;

    // Attempt download once; if session expired unexpectedly, re-login and retry.
    let result = await downloadInvoicePdf(page, invoiceNumber, { outputDir });
    if (
      !result.success &&
      result.error?.toLowerCase().includes("not logged in")
    ) {
      log("   ✗ Session appears expired; attempting re-login and retry...");
      const loggedIn = await login(page);
      session.isLoggedIn = loggedIn;
      if (loggedIn) {
        result = await downloadInvoicePdf(page, invoiceNumber, { outputDir });
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
      pdfPath: result.pdfPath,
      pdfUrl: result.pdfUrl,
      pdfBase64,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}
