/**
 * Scrape API Handlers
 *
 * HTTP handlers for scraping permits and generating PDFs.
 * Uses shared browser session for performance.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  ALL_STATUSES,
  extractPermitData,
  setStatusFilters,
} from "@/portal/scrape";
import type { PermitData } from "@/portal/types";
import {
  getOrCreateBrowserSession,
  getSessionPageAndContext,
} from "@/portal/utils/browser";
import {
  clickDustApplicationLinkById,
  navigateToDustSearch,
  navigateToMyDustApps,
  waitForDustApplicationDetailPage,
} from "@/portal/utils/helpers";
import { login } from "@/portal/utils/login";
import { searchPermits } from "@/portal/utils/search";

const log = (msg: string) => process.stderr.write(`${msg}\n`);

// ============================================
// Schemas
// ============================================

export const scrapePdfSchema = z.object({
  outputDir: z
    .string()
    .optional()
    .describe("Directory to save PDF (default: tests/output/pdfs)"),
  permitId: z.string().describe("Permit ID to scrape (e.g., D0056297)"),
});

export type ScrapePdfInput = z.infer<typeof scrapePdfSchema>;

export interface ScrapePdfResult {
  data?: PermitData;
  error?: string;
  pdfPath?: string;
  permitId: string;
  success: boolean;
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
  const session = await getOrCreateBrowserSession();
  const ctx = getSessionPageAndContext();

  if (!ctx) {
    return { error: "No browser session available", success: false };
  }

  if (!session.isLoggedIn) {
    log("   ✗ Not logged in - attempting re-login...");
    const loggedIn = await login(ctx.page);
    if (!loggedIn) {
      return { error: "Failed to login to portal", success: false };
    }
    session.isLoggedIn = true;
  }

  return { page: ctx, success: true };
}

/**
 * Navigate to the search page, set all status filters, type the permit ID,
 * submit ONCE, open the detail page, and extract structured data.
 */
async function navigateAndExtract(
  page: import("playwright").Page,
  permitId: string
): Promise<
  | { success: true; data: PermitData }
  | { success: false; error: string; status: number }
> {
  // Navigate to search page
  await navigateToMyDustApps(page);
  await navigateToDustSearch(page);

  // Set all status filters (no submit yet)
  await setStatusFilters(page, ALL_STATUSES);

  // Type permit ID and submit — single form submission
  const searchResult = await searchPermits(page, { permitId });
  if (!(searchResult.success && searchResult.permitIds.includes(permitId))) {
    return {
      success: false,
      error: `Permit ${permitId} not found`,
      status: 404,
    };
  }

  // Click to open detail page
  const clicked = await clickDustApplicationLinkById(page, permitId);
  if (!clicked) {
    return {
      success: false,
      error: `Could not open permit ${permitId}`,
      status: 500,
    };
  }

  // Wait for detail page
  const loaded = await waitForDustApplicationDetailPage(page, {
    midwayFallbackAppNum: permitId,
    timeout: 30_000,
  });
  if (!loaded) {
    return { success: false, error: "Detail page did not load", status: 500 };
  }

  // Extract permit data
  log("   Extracting permit data...");
  const data = await extractPermitData(page);
  log(`   ✓ Extracted: ${data.applicationId} - ${data.projectName}`);

  return { success: true, data };
}

// ============================================
// Handlers
// ============================================

/**
 * POST /api/scrape/pdf - Scrape permit data and generate PDF
 */
export async function handleScrapePdf(body: unknown): Promise<Response> {
  log("\n📄 SCRAPE + PDF request");

  const parsed = scrapePdfSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { permitId, outputDir } = parsed.data;
  log(`   Permit: ${permitId}`);

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page } = sessionResult.page;

    const result = await navigateAndExtract(page, permitId);
    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    // Generate PDF
    const pdfDir = outputDir || join(process.cwd(), "tests", "output", "pdfs");
    if (!existsSync(pdfDir)) {
      mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = join(pdfDir, `${permitId}.pdf`);

    const parentDir = dirname(pdfPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    log(`   Generating PDF to ${pdfPath}...`);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
      printBackground: true,
    });

    await Bun.write(pdfPath, pdfBuffer);
    log(`   ✓ PDF generated: ${pdfPath}`);

    return jsonSuccess({
      data: result.data,
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
      pdfPath,
      permitId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}

/**
 * GET /api/scrape/:id - Scrape permit data only (no PDF)
 */
export async function handleScrapePermit(id: string): Promise<Response> {
  log(`\n🔍 SCRAPE permit request: ${id}`);

  try {
    const sessionResult = await ensureBrowserSession();
    if (!sessionResult.success) {
      return jsonError(sessionResult.error, 500);
    }

    const { page } = sessionResult.page;

    const result = await navigateAndExtract(page, id);
    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    return jsonSuccess({
      data: result.data,
      permitId: id,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}
