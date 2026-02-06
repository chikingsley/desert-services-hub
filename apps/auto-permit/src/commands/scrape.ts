/**
 * Scrape Permit Command
 *
 * Scrape permit data from the Maricopa County portal.
 *
 * Usage:
 *   bun src/cli.ts scrape D0056297
 *   bun src/cli.ts scrape D0056297 --pdf
 *   bun src/cli.ts scrape D0056297 --pdf --output ./pdfs
 *   bun src/cli.ts scrape D0056297 --headed
 */

import { defineCommand } from "citty";
import { headlessArgs, resolveHeadless } from "@/commands/_shared/headless";
import { outputArgs } from "@/commands/_shared/output";
import { type ScrapeResult, scrapePermit } from "@/handlers/scrape";

export { scrapeSchema } from "@/handlers/scrape";

export default defineCommand({
  meta: {
    name: "scrape",
    description: "Scrape permit data from the portal (optionally generate PDF)",
  },
  args: {
    permitId: {
      type: "positional",
      required: true,
      description: "Permit ID to scrape (e.g., D0056297)",
    },
    pdf: {
      type: "boolean",
      alias: "p",
      description: "Generate PDF of the permit page",
      default: false,
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output directory for PDF (default: tests/output/pdfs)",
    },
    ...headlessArgs,
    ...outputArgs,
  },
  async run({ args }) {
    const headless = resolveHeadless(args);

    // Progress callback for non-JSON output
    const onProgress = args.json
      ? undefined
      : (step: number, total: number, message: string) => {
          console.log(`[${step}/${total}] ${message}`);
        };

    if (!args.json) {
      console.log(`\n=== SCRAPING PERMIT: ${args.permitId} ===\n`);
      if (args.pdf) {
        console.log(`PDF output: ${args.output || "tests/output/pdfs"}\n`);
      }
    }

    const result: ScrapeResult = await scrapePermit(
      {
        permitId: args.permitId,
        pdf: args.pdf,
        outputDir: args.output,
        headless,
      },
      onProgress
    );

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log(`\n=== ✓ PERMIT ${result.permitId} SCRAPED ===`);
      if (result.data) {
        console.log(`   Project: ${result.data.projectName}`);
        console.log(`   Company: ${result.data.companyName}`);
        console.log(`   Status: ${result.data.status}`);
      }
      if (result.pdfPath) {
        console.log(`   PDF: ${result.pdfPath}`);
      }
      console.log();
    } else {
      console.error(`\n❌ SCRAPE FAILED: ${result.error}\n`);
      process.exit(1);
    }
  },
});
