/**
 * PDF Generation Utilities
 *
 * Provides functions to generate PDFs from permit detail pages.
 * For active permits, all content is displayed on a single page (similar to the scrape flow).
 *
 * Handles lazy loading and ensures all content is loaded before PDF generation.
 *
 * @module src/portal/pdf
 *
 * @example
 * // Generate full-page PDF for a permit
 * const result = await generatePermitPdf(page, "D0056297", "./output/permit.pdf");
 * if (result.success) {
 *   console.log(`PDF saved to ${result.path}`);
 * }
 */

import type { Page } from "playwright";
import {
  SETTLE_MS,
  sleep,
  triggerLazyLoad,
  waitForDustApplicationDetailPage,
} from "./utils/helpers";

export interface PdfGenerationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Ensure all lazy-loaded content is loaded before PDF generation.
 * Scrolls through the page to trigger lazy loading, then waits for content to settle.
 */
async function ensureContentLoaded(page: Page): Promise<void> {
  console.log("[PDF] Ensuring all content is loaded...");

  // Trigger lazy loading by scrolling
  await triggerLazyLoad(page);

  // Wait a bit more for any remaining async content
  await sleep(SETTLE_MS * 2);

  // Wait for network to be idle (no pending requests)
  try {
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {
        // If networkidle times out, that's okay - we've already scrolled
        console.log("  Network idle timeout (continuing anyway)");
      });
  } catch {
    // Continue even if networkidle times out
  }
}

/**
 * Search for a permit by ID, open it, and generate a full-page PDF.
 *
 * For active permits, all content (pages 1-5) is displayed on a single detail page.
 * This function:
 * 1. Searches for the permit
 * 2. Clicks to open detail page
 * 3. Waits for detail page to load
 * 4. Triggers lazy loading to ensure all content is visible
 * 5. Generates PDF
 *
 * @param page - Playwright Page instance (on the search page)
 * @param permitId - Permit ID to search for (e.g., "D0056297")
 * @param outputPath - Path where the PDF should be saved
 * @returns PdfGenerationResult with success status and file path
 */
export async function generatePermitPdf(
  page: Page,
  permitId: string,
  outputPath: string
): Promise<PdfGenerationResult> {
  console.log(`\n[GENERATE PERMIT PDF: ${permitId}]`);

  try {
    // Step 1: Search for the permit
    const { searchPermits } = await import("./utils/search");
    let searchResult: Awaited<ReturnType<typeof searchPermits>> | undefined;
    try {
      searchResult = await searchPermits(page, { permitId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Search failed: ${errorMessage}`);
      return {
        success: false,
        error: `Search failed: ${errorMessage}`,
      };
    }

    if (!(searchResult.success && searchResult.permitIds.includes(permitId))) {
      console.log(`  ✗ Permit ${permitId} not found in search`);
      return {
        success: false,
        error: `Permit ${permitId} not found in search results`,
      };
    }

    // Step 2: Click on the permit to open detail page
    const { clickDustApplicationLinkById } = await import("./utils/helpers");
    const clicked = await clickDustApplicationLinkById(page, permitId);

    if (!clicked) {
      console.log("  ✗ Could not click permit link");
      return {
        success: false,
        error: "Could not click permit link",
      };
    }

    // Step 3: Wait for detail page to load (same as searchAndOpenPermit)
    const detailPageLoaded = await waitForDustApplicationDetailPage(page, {
      timeout: 30_000,
      midwayFallbackAppNum: permitId,
    });

    if (!detailPageLoaded) {
      console.log("  ✗ Detail page did not load");
      return {
        success: false,
        error: "Detail page did not load",
      };
    }

    console.log("  ✓ Detail page loaded");

    // Step 4: Ensure all content is loaded (handle lazy loading)
    // This is the same approach used in extractPermitData
    await ensureContentLoaded(page);

    // Step 5: Generate PDF
    console.log(`  Generating PDF to ${outputPath}...`);
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    console.log(`  ✓ PDF generated: ${outputPath}`);
    return {
      success: true,
      path: outputPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to generate PDF: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate a PDF of just the "Permit Application Form, Part B: Project Information" section.
 *
 * Assumes the page is already on a permit detail page.
 * Uses @media print CSS to isolate the Part B section - only affects PDF generation,
 * not the live page. Uses visibility:hidden to preserve layout.
 *
 * @param page - Playwright Page instance (on permit detail page)
 * @param outputPath - Path where the PDF should be saved
 * @returns PdfGenerationResult with success status and file path
 */
export async function generatePartBPdf(
  page: Page,
  outputPath: string
): Promise<PdfGenerationResult> {
  console.log("\n[GENERATE PART B PDF]");

  try {
    // Step 1: Ensure content is loaded
    await ensureContentLoaded(page);

    // Step 2: Find the Part B section container and mark it
    // We'll find the container that includes both the heading and siTable:11, then mark it
    const containerFound = await page.evaluate(() => {
      // Find the h1 heading with "Part B: Project Information"
      const headings = Array.from(document.querySelectorAll("h1.x1y"));
      const partBHeading = headings.find((h) =>
        h.textContent?.includes("Part B: Project Information")
      );

      if (!partBHeading) {
        return false;
      }

      // Find siTable:11 element
      const siTable11 = document.querySelector('[id*="siTable:11"]');
      if (!siTable11) {
        return false;
      }

      // Find common ancestor - walk up from heading until we find one that contains siTable:11
      let current: Element | null = partBHeading.parentElement;
      let container: Element | null = null;

      while (current && current !== document.body) {
        if (current.contains(siTable11)) {
          container = current;
          break;
        }
        current = current.parentElement;
      }

      if (container) {
        // Mark this container with a data attribute so we can target it with CSS
        container.setAttribute("data-pdf-part-b", "true");
        return true;
      }

      return false;
    });

    if (!containerFound) {
      return {
        success: false,
        error: "Could not find 'Part B: Project Information' section container",
      };
    }

    console.log("  ✓ Found Part B section container");

    // Step 3: Inject @media print CSS to hide everything except Part B section
    // Using @media print means this ONLY affects PDF generation, not the live page
    // Using visibility:hidden preserves layout (doesn't break tables)
    console.log(`  Generating Part B PDF to ${outputPath}...`);

    await page.addStyleTag({
      content: `
        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden !important;
          }
          
          /* Show the Part B container and all its descendants */
          [data-pdf-part-b],
          [data-pdf-part-b] * {
            visibility: visible !important;
          }
          
          /* Position Part B at the top of the page */
          [data-pdf-part-b] {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
        }
      `,
    });

    await sleep(SETTLE_MS);

    // Step 4: Generate PDF
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    // Step 5: Clean up data attribute (print styles don't need removal - they only affect print)
    await page.evaluate(() => {
      const container = document.querySelector("[data-pdf-part-b]");
      if (container) {
        container.removeAttribute("data-pdf-part-b");
      }
    });

    console.log(`  ✓ Part B PDF generated: ${outputPath}`);
    return {
      success: true,
      path: outputPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to generate Part B PDF: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
