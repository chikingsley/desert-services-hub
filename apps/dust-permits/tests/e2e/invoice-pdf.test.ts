/**
 * Invoice PDF E2E Test
 *
 * Verifies invoice search + direct PDF download flow.
 *
 * Run with: bun test tests/e2e/invoice-pdf.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { downloadInvoicePdf } from "@/portal/invoice";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

const harness = new PortalHarness();

// Set via env if needed. Default is a known historical example.
const TEST_INVOICE_NUMBER =
  process.env.INVOICE_TEST_INVOICE_NUMBER || "IV087334";

const OUTPUT_DIR = join(process.cwd(), "tests", "output", "invoices");
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

describe("Invoice PDF Download", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. setup: login",
    async () => {
      await harness.setup();
      expect(harness.currentState).toBe("logged_in");
    },
    TIMEOUTS.standard
  );

  test(
    "2. search invoice and download PDF",
    async () => {
      const existingPath = join(OUTPUT_DIR, `${TEST_INVOICE_NUMBER}.pdf`);
      if (existsSync(existingPath)) {
        await unlink(existingPath);
      }

      const result = await downloadInvoicePdf(
        harness.page,
        TEST_INVOICE_NUMBER,
        {
          outputDir: OUTPUT_DIR,
        }
      );

      expect(result.success).toBe(true);
      expect(result.pdfPath).toBeDefined();
      expect(result.pdfUrl).toBeDefined();

      if (!result.pdfPath) {
        throw new Error("Missing pdfPath");
      }

      expect(existsSync(result.pdfPath)).toBe(true);

      const bytes = new Uint8Array(
        await Bun.file(result.pdfPath).arrayBuffer()
      );
      expect(bytes.length).toBeGreaterThan(100);
      expect(String.fromCodePoint(...bytes.slice(0, 4))).toBe("%PDF");
    },
    TIMEOUTS.extended
  );
});
