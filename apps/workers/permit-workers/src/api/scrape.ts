/**
 * Scrape API Handlers
 *
 * HTTP handlers for scraping permits and generating PDFs.
 * Uses shared browser session for performance.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { extractPermitData, selectFiltersAndSubmit } from "@/portal/scrape";
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

/**
 * Scrape and PDF request schema
 */
export const scrapePdfSchema = z.object({
  permitId: z.string().describe("Permit ID to scrape (e.g., D0056297)"),
  outputDir: z
    .string()
    .optional()
    .describe("Directory to save PDF (default: tests/output/pdfs)"),
});

export type ScrapePdfInput = z.infer<typeof scrapePdfSchema>;

export interface ScrapePdfResult {
  success: boolean;
  permitId: string;
  pdfPath?: string;
  data?: PermitData;
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

  return { success: true, page: ctx };
}

// ============================================
// Handlers
// ============================================

/**
 * POST /api/scrape/pdf - Scrape permit data and generate PDF
 *
 * Opens a permit by ID, extracts structured data, and generates a full-page PDF.
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

    // Navigate to search page
    await navigateToMyDustApps(page);
    await navigateToDustSearch(page);

    // Apply filters to show all statuses
    await selectFiltersAndSubmit(page, [
      "Active",
      "Closed",
      "Submitted",
      "Rejected",
    ]);

    // Search for the permit
    const searchResult = await searchPermits(page, { permitId });
    if (!(searchResult.success && searchResult.permitIds.includes(permitId))) {
      return jsonError(`Permit ${permitId} not found`, 404);
    }

    // Click to open detail page
    const clicked = await clickDustApplicationLinkById(page, permitId);
    if (!clicked) {
      return jsonError(`Could not open permit ${permitId}`, 500);
    }

    // Wait for detail page
    const loaded = await waitForDustApplicationDetailPage(page, {
      timeout: 30_000,
      midwayFallbackAppNum: permitId,
    });
    if (!loaded) {
      return jsonError("Detail page did not load", 500);
    }

    // Extract permit data
    log("   Extracting permit data...");
    const data = await extractPermitData(page);
    log(`   ✓ Extracted: ${data.applicationId} - ${data.projectName}`);

    // Generate PDF
    const pdfDir = outputDir || join(process.cwd(), "tests", "output", "pdfs");
    if (!existsSync(pdfDir)) {
      mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = join(pdfDir, `${permitId}.pdf`);

    // Ensure parent directory exists
    const parentDir = dirname(pdfPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    log(`   Generating PDF to ${pdfPath}...`);
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
    });
    log(`   ✓ PDF generated: ${pdfPath}`);

    return jsonSuccess({
      permitId,
      pdfPath,
      data,
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

    // Navigate to search page
    await navigateToMyDustApps(page);
    await navigateToDustSearch(page);

    // Apply filters
    await selectFiltersAndSubmit(page, [
      "Active",
      "Closed",
      "Submitted",
      "Rejected",
    ]);

    // Search for the permit
    const searchResult = await searchPermits(page, { permitId: id });
    if (!(searchResult.success && searchResult.permitIds.includes(id))) {
      return jsonError(`Permit ${id} not found`, 404);
    }

    // Click to open detail page
    const clicked = await clickDustApplicationLinkById(page, id);
    if (!clicked) {
      return jsonError(`Could not open permit ${id}`, 500);
    }

    // Wait for detail page
    const loaded = await waitForDustApplicationDetailPage(page, {
      timeout: 30_000,
      midwayFallbackAppNum: id,
    });
    if (!loaded) {
      return jsonError("Detail page did not load", 500);
    }

    // Extract permit data
    log("   Extracting permit data...");
    const data = await extractPermitData(page);
    log(`   ✓ Extracted: ${data.applicationId} - ${data.projectName}`);

    return jsonSuccess({
      permitId: id,
      data,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`   ✗ Error: ${errorMsg}`);
    return jsonError(errorMsg, 500);
  }
}
