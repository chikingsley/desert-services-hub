/**
 * Scrape Handler
 *
 * Scrapes permit data from the Maricopa County portal.
 *
 * @module src/handlers/scrape
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { extractPermitData, selectFiltersAndSubmit } from "@/portal/scrape";
import type { PermitData } from "@/portal/types";
import { withBrowser } from "@/portal/utils/browser";
import {
  clickDustApplicationLinkById,
  navigateToDustSearch,
  navigateToMyDustApps,
  waitForDustApplicationDetailPage,
} from "@/portal/utils/helpers";
import { searchPermits as portalSearchPermits } from "@/portal/utils/search";

/**
 * Schema for scrape operation (AI-tool compatible)
 */
export const scrapeSchema = z.object({
  permitId: z.string().describe("Permit ID to scrape (e.g., D0056297)"),
  pdf: z.boolean().optional().describe("Generate PDF of the permit page"),
  outputDir: z
    .string()
    .optional()
    .describe("Directory to save PDF (default: tests/output/pdfs)"),
  headless: z.boolean().optional().describe("Run browser in headless mode"),
});

export type ScrapeInput = z.infer<typeof scrapeSchema>;

export interface ScrapeResult {
  success: boolean;
  permitId: string;
  pdfPath?: string;
  data?: PermitData;
  error?: string;
}

type ProgressCallback = (step: number, total: number, message: string) => void;

/**
 * Scrape permit data from the portal.
 */
export async function scrapePermit(
  input: ScrapeInput,
  onProgress?: ProgressCallback
): Promise<ScrapeResult> {
  const { permitId, pdf, outputDir, headless } = input;
  const totalSteps = pdf ? 5 : 4;
  const log = (step: number, message: string) =>
    onProgress?.(step, totalSteps, message);

  return await withBrowser<ScrapeResult>(
    { operation: "scrape", headless },
    async (instance) => {
      const { page } = instance;

      // 1. Navigate to search page
      log(1, "Navigating to search page...");
      await navigateToMyDustApps(page);
      await navigateToDustSearch(page);

      // 2. Apply filters and search
      log(2, "Searching for permit...");
      await selectFiltersAndSubmit(page, [
        "Active",
        "Closed",
        "Submitted",
        "Rejected",
      ]);

      const searchResult = await portalSearchPermits(page, { permitId });
      if (
        !(searchResult.success && searchResult.permitIds.includes(permitId))
      ) {
        return {
          success: false,
          permitId,
          error: `Permit ${permitId} not found`,
        };
      }

      // 3. Open permit detail page
      log(3, "Opening permit details...");
      const clicked = await clickDustApplicationLinkById(page, permitId);
      if (!clicked) {
        return {
          success: false,
          permitId,
          error: `Could not open permit ${permitId}`,
        };
      }

      const loaded = await waitForDustApplicationDetailPage(page, {
        timeout: 30_000,
        midwayFallbackAppNum: permitId,
      });
      if (!loaded) {
        return {
          success: false,
          permitId,
          error: "Detail page did not load",
        };
      }

      // 4. Extract permit data
      log(4, "Extracting permit data...");
      const data = await extractPermitData(page);

      // 5. Generate PDF if requested
      let pdfPath: string | undefined;
      if (pdf) {
        log(5, "Generating PDF...");
        const pdfDir =
          outputDir || join(process.cwd(), "tests", "output", "pdfs");
        if (!existsSync(pdfDir)) {
          mkdirSync(pdfDir, { recursive: true });
        }
        pdfPath = join(pdfDir, `${permitId}.pdf`);

        const parentDir = dirname(pdfPath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

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
      }

      return {
        success: true,
        permitId,
        data,
        pdfPath,
      };
    }
  );
}
