/**
 * PDF Generation via Cloudflare Browser Rendering.
 *
 * Renders a ComplianceGo report URL to PDF with retry logic and
 * exponential backoff for rate limit / browser availability errors.
 */

import puppeteer from "@cloudflare/puppeteer";

const MAX_RETRIES = 5;

export async function generatePdf(
  browser: Fetcher,
  url: string
): Promise<Uint8Array> {
  let lastError: Error | null = null;
  let instance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Worker] PDF attempt ${attempt}/${MAX_RETRIES} - launching browser...`
      );
      instance = await puppeteer.launch(
        browser as unknown as Parameters<typeof puppeteer.launch>[0]
      );

      const page = await instance.newPage();
      page.setDefaultTimeout(60_000);
      page.setDefaultNavigationTimeout(60_000);

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60_000,
      });

      // Small delay to ensure page is fully rendered
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pdf = await page.pdf({
        format: "letter",
        printBackground: true,
        margin: {
          top: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
          right: "0.5in",
        },
      });

      console.log(`[Worker] PDF generated successfully on attempt ${attempt}`);
      return pdf;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRateLimit = isRateLimitError(lastError);

      console.error(
        `[Worker] PDF attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}` +
          (isRateLimit
            ? " (rate limit/availability error - will use longer backoff)"
            : "")
      );

      if (attempt < MAX_RETRIES) {
        const delay = getBackoffDelay(attempt, isRateLimit);
        console.log(
          `[Worker] Waiting ${Math.round(delay / 1000)}s before retry...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      if (instance) {
        await instance.close().catch(() => {
          /* intentionally ignore close errors */
        });
        instance = null;
      }
    }
  }

  throw lastError ?? new Error("PDF generation failed after retries");
}

function isRateLimitError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("rate limit") ||
    msg.includes("no browser available")
  );
}

/**
 * Exponential backoff: base * 2^(attempt-1), with ±20% jitter.
 * Rate limit errors use a longer base delay.
 */
function getBackoffDelay(attempt: number, isRateLimit: boolean): number {
  const baseDelay = isRateLimit ? 10_000 : 3000;
  const maxDelay = 60_000;
  const exponentialDelay = baseDelay * 2 ** (attempt - 1);
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, maxDelay);
}
