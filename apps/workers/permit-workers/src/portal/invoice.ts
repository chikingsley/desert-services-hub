/**
 * Invoice PDF Download Service
 *
 * Automates invoice search and downloads invoice PDFs from the Maricopa portal.
 *
 * Flow:
 * 1) Go to invoice search page
 * 2) Enter invoice number (e.g. "IV087334") and submit
 * 3) Open the first matching invoice detail result
 * 4) Grab the direct PDF link from "Download / Print" and download bytes
 *
 * @module src/portal/invoice
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { SETTLE_MS, sleep } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";

const INVOICE_SEARCH_URL = "https://dm.maricopa.gov/inv/invSearch.jsf";
const INVOICE_ID_LINK_RE = /^IV\d+$/i;

export interface DownloadInvoicePdfResult {
  success: boolean;
  invoiceNumber: string;
  pdfPath?: string;
  pdfUrl?: string;
  error?: string;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function isLikelyPdf(bytes: Uint8Array): boolean {
  // "%PDF" magic header
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

async function fillInvoiceNumber(
  page: Page,
  invoiceNumber: string
): Promise<void> {
  const label = page.locator(portal.invoice.search.invoiceNumberLabel).first();
  await label.waitFor({ state: "visible", timeout: 15_000 });

  const forId = await label.getAttribute("for");
  if (forId) {
    await page.locator(`[id="${forId}"]`).first().fill(invoiceNumber);
  } else {
    // Fallback if label-for association changes.
    await page
      .getByLabel("Invoice Number", { exact: false })
      .first()
      .fill(invoiceNumber);
  }

  await sleep(SETTLE_MS);
}

/**
 * Download an invoice PDF by invoice number (e.g. "IV087334").
 *
 * @param page Logged-in Playwright page
 * @param invoiceNumber Invoice identifier string
 * @param options.outputDir Where to save PDF (default: tests/output/invoices)
 */
export async function downloadInvoicePdf(
  page: Page,
  invoiceNumber: string,
  options?: { outputDir?: string }
): Promise<DownloadInvoicePdfResult> {
  console.log("\n[INVOICE PDF]");

  const normalizedInvoiceNumber = invoiceNumber.trim();
  if (!normalizedInvoiceNumber) {
    return {
      success: false,
      invoiceNumber,
      error: "Missing invoiceNumber",
    };
  }

  try {
    console.log("  Navigating to invoice search...");
    await page.goto(INVOICE_SEARCH_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    // If we got bounced to login, fail fast so caller can re-auth.
    const loginVisible = await page
      .locator(portal.login.passwordInput)
      .first()
      .isVisible()
      .catch(() => false);
    if (loginVisible) {
      return {
        success: false,
        invoiceNumber: normalizedInvoiceNumber,
        error: "Not logged in (redirected to login page)",
      };
    }

    console.log(`  Searching invoice: ${normalizedInvoiceNumber}`);
    await fillInvoiceNumber(page, normalizedInvoiceNumber);

    const submitBtn = page.locator(portal.invoice.search.submitButton).first();
    await submitBtn.click();
    await sleep(SETTLE_MS);

    console.log("  Opening invoice detail...");
    const invoiceIdLink = page
      // The results list "Invoice ID" links like IV087334; these are JSF anchors with href="#".
      .getByRole("link", { name: INVOICE_ID_LINK_RE })
      .first();
    await invoiceIdLink.waitFor({ state: "visible", timeout: 25_000 });
    await invoiceIdLink.click();

    await page.waitForURL(
      (url) => url.href.includes("/inv/invoiceDetail.jsf"),
      {
        timeout: 30_000,
      }
    );

    const downloadBtn = page
      .locator(portal.invoice.detail.downloadPrintButton)
      .first();
    await downloadBtn.waitFor({ state: "visible", timeout: 15_000 });

    const pdfUrl = await downloadBtn.getAttribute("href");
    if (!pdfUrl) {
      return {
        success: false,
        invoiceNumber: normalizedInvoiceNumber,
        error: "Invoice detail page missing Download/Print link",
      };
    }

    console.log("  Downloading invoice PDF bytes...");
    const resp = await page.request.get(pdfUrl, { timeout: 60_000 });
    if (!resp.ok()) {
      return {
        success: false,
        invoiceNumber: normalizedInvoiceNumber,
        pdfUrl,
        error: `Invoice PDF download failed (HTTP ${resp.status()})`,
      };
    }

    const bytes = await resp.body();
    if (!isLikelyPdf(bytes)) {
      return {
        success: false,
        invoiceNumber: normalizedInvoiceNumber,
        pdfUrl,
        error: "Downloaded content did not look like a PDF",
      };
    }

    const outputDir =
      options?.outputDir ?? join(process.cwd(), "tests", "output", "invoices");
    ensureDir(outputDir);
    const pdfPath = join(outputDir, `${normalizedInvoiceNumber}.pdf`);

    await Bun.write(pdfPath, bytes);
    console.log(`  ✓ Saved: ${pdfPath}`);

    return {
      success: true,
      invoiceNumber: normalizedInvoiceNumber,
      pdfPath,
      pdfUrl,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      invoiceNumber: normalizedInvoiceNumber,
      error: msg,
    };
  }
}
