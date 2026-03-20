import { afterEach, describe, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;
const originalPdfAnalysisTimeout = process.env.PDF_ANALYSIS_TIMEOUT_MS;
const originalPdfAnalysisUrl = process.env.PDF_ANALYSIS_URL;

function extractionResponse() {
  return new Response(
    JSON.stringify({
      document_type: "contract",
      extracted: { ok: true },
      extraction_method: "multipart",
      filename: "sample.pdf",
      metadata: {},
      model: "test-model",
      page_count: 1,
      processing_time_ms: 1,
      summary: "ok",
      text: "pdf text",
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }
  );
}

async function importClient() {
  return import(
    `../../../../packages/documents/intake/src/pdf-analysis.ts?test=${Date.now()}-${Math.random()}`
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalPdfAnalysisTimeout === undefined) {
    delete process.env.PDF_ANALYSIS_TIMEOUT_MS;
  } else {
    process.env.PDF_ANALYSIS_TIMEOUT_MS = originalPdfAnalysisTimeout;
  }

  if (originalPdfAnalysisUrl === undefined) {
    delete process.env.PDF_ANALYSIS_URL;
  } else {
    process.env.PDF_ANALYSIS_URL = originalPdfAnalysisUrl;
  }
});

describe("pdf-analysis client", () => {
  test("nativeExtractMultipart defaults to auto provider", async () => {
    let body: FormData | null = null;
    globalThis.fetch = (async (_url, init) => {
      body = init?.body as FormData;
      return extractionResponse();
    }) as typeof fetch;

    const { nativeExtractMultipart } = await importClient();
    await nativeExtractMultipart(Buffer.from([0x25, 0x50, 0x44, 0x46]), "sample.pdf");

    expect(body).toBeInstanceOf(FormData);
    expect(body?.get("provider")).toBe("auto");
  });

  test("nativeExtractMultipart honors PDF_ANALYSIS_TIMEOUT_MS", async () => {
    process.env.PDF_ANALYSIS_TIMEOUT_MS = "20";
    globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      })) as typeof fetch;

    const { nativeExtractMultipart } = await importClient();

    await expect(
      nativeExtractMultipart(Buffer.from([0x25, 0x50, 0x44, 0x46]), "slow.pdf")
    ).rejects.toThrow("pdf-analysis request timed out after 20ms");
  });
});
